//! keel tray domain — pure logic, no I/O.
//!
//! Mirrors `@keel/domain` `ActivityEvent` and the agent surface's pure core
//! (`apps/agent/core.mjs`): event building, dedupe decisions, day-file naming,
//! title capping, idle start/end pairing. Id generation, clocks, and file
//! writes live with the callers (`lib.rs` / `writer.rs`).

use chrono::{Local, NaiveDate, TimeZone};
use serde::Serialize;
use serde_json::{json, Value};

/// The surface tag every event from this writer carries.
pub const SURFACE: &str = "desktop";

/// Window titles are capped at this many chars (privacy + bounded lines).
pub const TITLE_CAP: usize = 256;

/// Idle threshold: no input for this long → an `idle_start` event.
pub const IDLE_THRESHOLD_MS: u64 = 120_000;

/// One raw observation. Field names and order mirror `@keel/domain`
/// `ActivityEvent`: `{ id, surface, kind, ts, sessionId, payload, durationMs? }`.
#[derive(Debug, Clone, Serialize)]
pub struct ActivityEvent {
    pub id: String,
    pub surface: &'static str,
    pub kind: String,
    /// Epoch milliseconds at observation time.
    pub ts: u64,
    /// Always "" on this surface — no session concept yet.
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub payload: Value,
    #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

/// Build an event. The caller supplies the id (writers own id generation —
/// the domain stays free of randomness).
pub fn build_event(
    id: String,
    kind: &str,
    ts: u64,
    payload: Value,
    duration_ms: Option<u64>,
) -> ActivityEvent {
    ActivityEvent {
        id,
        surface: SURFACE,
        kind: kind.to_string(),
        ts,
        session_id: String::new(),
        payload,
        duration_ms,
    }
}

/// One JSON object per line.
pub fn event_line(e: &ActivityEvent) -> Option<String> {
    serde_json::to_string(e).ok().map(|s| s + "\n")
}

/// Daily bucket for the desktop surface — same convention as the agent
/// surface's `logFileName` (LOCAL date, `YYYY-MM-DD.<surface>.jsonl`).
pub fn log_file_name(date: NaiveDate) -> String {
    format!("{}.{}.jsonl", date.format("%Y-%m-%d"), SURFACE)
}

/// `log_file_name` for an epoch-ms timestamp in the machine's local zone.
pub fn local_log_file_name(ts_ms: u64) -> String {
    let date = Local
        .timestamp_millis_opt(ts_ms as i64)
        .single()
        .map(|dt| dt.date_naive())
        .unwrap_or_else(|| Local::now().date_naive());
    log_file_name(date)
}

/// `app_switched` payload: app names + capped window titles + a flag. Never more.
pub fn app_switch_payload(app_name: &str, window_title: &str, is_full_screen: bool) -> Value {
    json!({
        "app_name": app_name,
        "window_title": window_title,
        "is_full_screen": is_full_screen,
    })
}

/// Duration of the focus span an `app_switched` event closes — `None` for the
/// first observation after start or pause (no span was open).
pub fn switch_duration(prev_span_start: Option<u64>, now_ms: u64) -> Option<u64> {
    prev_span_start.map(|started| now_ms.saturating_sub(started))
}

/// Cap a window title at `max_chars` characters (char-boundary safe).
pub fn cap_title(title: &str, max_chars: usize) -> String {
    title.chars().take(max_chars).collect()
}

/// Dedupe decision: emit `app_focus` only when the app name OR the (capped)
/// window title actually changed. `None` previous state always emits.
pub fn focus_changed(prev: Option<&(String, String)>, app_name: &str, window_title: &str) -> bool {
    match prev {
        None => true,
        Some((prev_app, prev_title)) => prev_app != app_name || prev_title != window_title,
    }
}

// ── Input-activity sensor (counts only, default-off) ────────────
// Fogarty's "Easy to Build" set: keyboard/mouse/scroll event COUNTS per
// bin — never keycodes, never content (the counter API cannot expose
// them). Ships off; the user opts in via `desktop.inputActivity` in
// ~/.keel/config.json. See packages/domain/docs/event-taxonomy.md
// (`input_activity`).

/// Explicit opt-in gate. Anything but a literal `true` — missing key,
/// malformed JSON, empty file — means OFF (neutral default).
pub fn input_sensor_enabled(config_json: &str) -> bool {
    serde_json::from_str::<Value>(config_json)
        .ok()
        .and_then(|c| c.get("desktop")?.get("inputActivity")?.as_bool())
        .unwrap_or(false)
}

/// Events since the previous poll. The system counter is a u32 since
/// boot; wrapping subtraction survives the rollover.
pub fn counter_delta(prev: u32, now: u32) -> u64 {
    now.wrapping_sub(prev) as u64
}

/// Fold per-poll deltas `[keyDown, mouseDown, scroll, mouseMoved]` into
/// bins of `per_bin` polls (1.5s polls × 2 = 3s bins).
pub fn fold_into_bins(deltas: &[[u64; 4]], per_bin: usize) -> Vec<[u64; 4]> {
    let mut bins = Vec::new();
    for chunk in deltas.chunks(per_bin) {
        let mut bin = [0u64; 4];
        for d in chunk {
            for i in 0..4 {
                bin[i] += d[i];
            }
        }
        bins.push(bin);
    }
    bins
}

/// The `input_activity` payload for one rollup window, or `None` when
/// the window was fully idle (idle spans already bracket those).
/// Counts per bin only — exactly five keys, nothing content-capable.
pub fn input_rollup(bins: &[[u64; 4]], bin_ms: u64) -> Option<Value> {
    if bins.iter().all(|b| b.iter().all(|&c| c == 0)) {
        return None;
    }
    let series = |i: usize| bins.iter().map(|b| b[i]).collect::<Vec<_>>();
    Some(json!({
        "binMs": bin_ms,
        "keyDowns": series(0),
        "mouseDowns": series(1),
        "scrolls": series(2),
        "mouseMoves": series(3),
    }))
}

/// An idle-state transition the sensor loop should log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdleTransition {
    /// Input stopped ≥ threshold ago. `ts` is backdated to when input stopped.
    Start { ts: u64 },
    /// First activity after an idle span. `duration_ms` covers the whole span.
    End { ts: u64, duration_ms: u64 },
}

/// Pure idle state machine. State is `idle_since` (the backdated start of the
/// current idle span, or `None` when active). `idle_ms` is the system's
/// time-since-last-input at `now_ms`. Returns the next state and the event to
/// emit, if any.
pub fn idle_transition(
    idle_since: Option<u64>,
    now_ms: u64,
    idle_ms: u64,
    threshold_ms: u64,
) -> (Option<u64>, Option<IdleTransition>) {
    match idle_since {
        None if idle_ms >= threshold_ms => {
            let started = now_ms.saturating_sub(idle_ms);
            (Some(started), Some(IdleTransition::Start { ts: started }))
        }
        Some(started) if idle_ms < threshold_ms => {
            // Input resumed `idle_ms` ago — that instant ends the span.
            let ended = now_ms.saturating_sub(idle_ms);
            let duration_ms = ended.saturating_sub(started);
            (None, Some(IdleTransition::End { ts: ended, duration_ms }))
        }
        state => (state, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    // ── event JSON shape ────────────────────────────────────────

    #[test]
    fn event_json_matches_activity_event_schema() {
        let e = build_event(
            "0d1f1f6e-7d36-4b1a-9f5e-1a2b3c4d5e6f".into(),
            "app_switched",
            1_718_193_600_000,
            app_switch_payload("Safari", "keel — docs", false),
            None,
        );
        let line = event_line(&e).unwrap();
        assert!(line.ends_with('\n'));
        let v: Value = serde_json::from_str(line.trim()).unwrap();
        let obj = v.as_object().unwrap();

        let mut keys: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
        keys.sort_unstable();
        assert_eq!(keys, vec!["id", "kind", "payload", "sessionId", "surface", "ts"]);

        assert_eq!(v["id"], "0d1f1f6e-7d36-4b1a-9f5e-1a2b3c4d5e6f");
        assert_eq!(v["surface"], "desktop");
        assert_eq!(v["kind"], "app_switched");
        assert_eq!(v["ts"], 1_718_193_600_000_u64);
        assert_eq!(v["sessionId"], "");
        assert_eq!(v["payload"]["app_name"], "Safari");
        assert_eq!(v["payload"]["window_title"], "keel — docs");
        assert_eq!(v["payload"]["is_full_screen"], false);
        assert!(obj.get("durationMs").is_none());
    }

    #[test]
    fn event_json_carries_duration_ms_when_set() {
        let e = build_event("x".into(), "idle_end", 1_000, json!({}), Some(178_000));
        let v: Value = serde_json::from_str(event_line(&e).unwrap().trim()).unwrap();
        assert_eq!(v["durationMs"], 178_000_u64);
        assert_eq!(v["sessionId"], "");
    }

    // ── day-file naming ─────────────────────────────────────────

    #[test]
    fn day_file_name_for_fixed_timestamp() {
        // 1718193600000 = 2024-06-12T12:00:00Z. In UTC+02:00 → 2024-06-12 local.
        let tz = FixedOffset::east_opt(2 * 3600).unwrap();
        let date = tz
            .timestamp_millis_opt(1_718_193_600_000)
            .unwrap()
            .date_naive();
        assert_eq!(log_file_name(date), "2024-06-12.desktop.jsonl");
    }

    #[test]
    fn day_file_name_buckets_by_local_date_not_utc() {
        // 2024-06-12T23:30:00Z is already June 13 in UTC+02:00.
        let tz = FixedOffset::east_opt(2 * 3600).unwrap();
        let date = tz
            .timestamp_millis_opt(1_718_235_000_000)
            .unwrap()
            .date_naive();
        assert_eq!(log_file_name(date), "2024-06-13.desktop.jsonl");
    }

    // ── dedupe ──────────────────────────────────────────────────

    #[test]
    fn focus_changed_dedupes_identical_app_and_title() {
        let prev = ("Safari".to_string(), "keel — docs".to_string());
        assert!(!focus_changed(Some(&prev), "Safari", "keel — docs"));
    }

    #[test]
    fn focus_changed_fires_on_app_or_title_change_and_first_sample() {
        let prev = ("Safari".to_string(), "keel — docs".to_string());
        assert!(focus_changed(Some(&prev), "Terminal", "keel — docs"));
        assert!(focus_changed(Some(&prev), "Safari", "other tab"));
        assert!(focus_changed(None, "Safari", "keel — docs"));
    }

    // ── switch closes the previous focus span ───────────────────

    #[test]
    fn switch_duration_closes_the_previous_span() {
        assert_eq!(switch_duration(Some(1_000), 5_500), Some(4_500));
    }

    #[test]
    fn switch_duration_is_none_for_the_first_observation() {
        // First sample after start or pause — no span to close.
        assert_eq!(switch_duration(None, 5_500), None);
    }

    // ── title capping ───────────────────────────────────────────

    #[test]
    fn cap_title_caps_at_256_chars() {
        let long = "a".repeat(300);
        let capped = cap_title(&long, TITLE_CAP);
        assert_eq!(capped.chars().count(), 256);
        let short = "hello";
        assert_eq!(cap_title(short, TITLE_CAP), "hello");
    }

    #[test]
    fn cap_title_is_char_boundary_safe() {
        let multibyte = "é".repeat(300);
        let capped = cap_title(&multibyte, TITLE_CAP);
        assert_eq!(capped.chars().count(), 256);
        assert!(capped.chars().all(|c| c == 'é'));
    }

    // ── input-activity sensor (counts only, default-off) ────────

    #[test]
    fn input_sensor_disabled_by_default_and_on_malformed_config() {
        assert!(!input_sensor_enabled(""));
        assert!(!input_sensor_enabled("{}"));
        assert!(!input_sensor_enabled("not json"));
        assert!(!input_sensor_enabled(r#"{"desktop":{}}"#));
        assert!(!input_sensor_enabled(r#"{"desktop":{"inputActivity":false}}"#));
    }

    #[test]
    fn input_sensor_enabled_by_explicit_opt_in() {
        assert!(input_sensor_enabled(r#"{"desktop":{"inputActivity":true}}"#));
    }

    #[test]
    fn counter_delta_handles_monotonic_and_wraparound() {
        assert_eq!(counter_delta(100, 130), 30);
        assert_eq!(counter_delta(100, 100), 0);
        // u32 wraparound (counter is u32 since boot)
        assert_eq!(counter_delta(u32::MAX - 1, 3), 5);
    }

    #[test]
    fn fold_into_bins_pairs_poll_deltas() {
        let deltas = vec![[1, 0, 2, 5], [3, 1, 0, 5], [0, 0, 0, 0], [2, 0, 1, 1]];
        let bins = fold_into_bins(&deltas, 2);
        assert_eq!(bins, vec![[4, 1, 2, 10], [2, 0, 1, 1]]);
    }

    #[test]
    fn input_rollup_skips_fully_idle_windows() {
        let bins = vec![[0, 0, 0, 0], [0, 0, 0, 0]];
        assert!(input_rollup(&bins, 3_000).is_none());
    }

    #[test]
    fn input_rollup_payload_carries_per_bin_counts_never_content() {
        let bins = vec![[4, 1, 2, 10], [0, 0, 0, 3]];
        let v = input_rollup(&bins, 3_000).unwrap();
        assert_eq!(v["binMs"], 3_000);
        assert_eq!(v["keyDowns"], serde_json::json!([4, 0]));
        assert_eq!(v["mouseDowns"], serde_json::json!([1, 0]));
        assert_eq!(v["scrolls"], serde_json::json!([2, 0]));
        assert_eq!(v["mouseMoves"], serde_json::json!([10, 3]));
        // counts only — exactly these five keys
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(|k| k.as_str()).collect();
        keys.sort_unstable();
        assert_eq!(keys, vec!["binMs", "keyDowns", "mouseDowns", "mouseMoves", "scrolls"]);
    }

    // ── idle start/end pairing ──────────────────────────────────

    #[test]
    fn idle_start_fires_at_threshold_with_backdated_ts() {
        let (state, ev) = idle_transition(None, 1_000_000, 130_000, IDLE_THRESHOLD_MS);
        assert_eq!(state, Some(870_000));
        assert_eq!(ev, Some(IdleTransition::Start { ts: 870_000 }));
    }

    #[test]
    fn idle_below_threshold_stays_silent() {
        let (state, ev) = idle_transition(None, 1_000_000, 50_000, IDLE_THRESHOLD_MS);
        assert_eq!(state, None);
        assert_eq!(ev, None);
    }

    #[test]
    fn idle_continuing_does_not_double_start() {
        let (state, ev) = idle_transition(Some(870_000), 1_001_500, 131_500, IDLE_THRESHOLD_MS);
        assert_eq!(state, Some(870_000));
        assert_eq!(ev, None);
    }

    #[test]
    fn idle_end_pairs_with_start_and_carries_duration() {
        // Idle began (backdated) at 870_000; activity resumed 2s before now.
        let (state, ev) = idle_transition(Some(870_000), 1_050_000, 2_000, IDLE_THRESHOLD_MS);
        assert_eq!(state, None);
        assert_eq!(
            ev,
            Some(IdleTransition::End { ts: 1_048_000, duration_ms: 178_000 })
        );
    }
}
