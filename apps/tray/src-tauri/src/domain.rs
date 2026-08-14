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

/// Emit decision for `app_switched`: the app name OR the (capped) window
/// title actually changed, and the sample is resolvable. An empty
/// `app_name` means the OS couldn't name the owning app (overlays,
/// screenshot UI, permission dialogs) — never a switch; the previous
/// app's span simply continues. `None` previous state always emits.
pub fn focus_changed(prev: Option<&(String, String)>, app_name: &str, window_title: &str) -> bool {
    if app_name.is_empty() {
        return false;
    }
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

// ── Granularity ceiling (the response-depth dial) ───────────────
//
// The dial is the agent surface's (`apps/agent/core.mjs`); the tray is a second
// hand on the same face, not a second clock. Every rule below is a restatement
// of that file — level set, order, default, and the 04:00 waking-day stamp —
// because two writers disagreeing about what today's ceiling is would be worse
// than having no tray control at all. Change one, change both.

/// Levels in ascending depth. The order IS the comparison (`GRANULARITY_ORDER`).
pub const GRANULARITY_ORDER: [&str; 5] = ["sentence", "tldr", "page", "essay", "report"];

/// The ceiling in force when none is set for the day. `page`, not `tldr`:
/// a shallow default is a floor by another name, and a floor never moves.
pub const DEFAULT_GRANULARITY: &str = "page";

/// The logical day flips at 04:00, not midnight — a 02:00 session still belongs
/// to the prior day (`DAY_START_HOUR`).
pub const DAY_START_HOUR: i64 = 4;

/// Menu-row label for a level: the depth contract, short enough to read at a
/// glance. The prose lives in `GRANULARITY_LEVELS`; a menu is not the place for it.
pub fn granularity_label(level: &str) -> &'static str {
    match level {
        "sentence" => "L1 — one sentence",
        "tldr" => "L2 — one paragraph",
        "page" => "L3 — about a page",
        "essay" => "L4 — an argued essay",
        "report" => "L5 — multi-section",
        _ => "",
    }
}

/// The waking-day key a granularity stamp carries: the LOCAL date after rolling
/// back `DAY_START_HOUR`. Mirrors `focusDayKey`.
pub fn focus_day_key(ts_ms: u64) -> String {
    let shifted = (ts_ms as i64).saturating_sub(DAY_START_HOUR * 3_600_000);
    let date = Local
        .timestamp_millis_opt(shifted)
        .single()
        .map(|dt| dt.date_naive())
        .unwrap_or_else(|| Local::now().date_naive());
    date.format("%Y-%m-%d").to_string()
}

/// The ceiling actually in force: the level set this waking-day, or the default
/// when unset, unrecognized, or stamped with an earlier day. Never empty — a
/// contract is always in force. Mirrors `activeGranularity`.
pub fn active_granularity(state: &Value, now_ms: u64) -> String {
    let today = focus_day_key(now_ms);
    let fresh = state
        .get("granularityDay")
        .and_then(Value::as_str)
        .is_some_and(|d| d == today);
    let set = state.get("granularity").and_then(Value::as_str).unwrap_or("");
    if fresh && GRANULARITY_ORDER.contains(&set) {
        set.to_string()
    } else {
        DEFAULT_GRANULARITY.to_string()
    }
}

/// Stamp a new ceiling onto the state document, preserving every key the tray
/// knows nothing about (focus, session timestamps, watchlist bookkeeping) — the
/// tray owns two fields of a document the agent owns. An empty `level` is the
/// reset, exactly as `keel granularity reset` writes it: the stamp stays, the
/// level goes blank, and `active_granularity` falls back to the default.
/// Mirrors `setGranularity`.
pub fn set_granularity(state: &Value, level: &str, now_ms: u64) -> Value {
    let mut next = state.as_object().cloned().unwrap_or_default();
    next.insert("granularity".into(), json!(level));
    next.insert("granularityDay".into(), json!(focus_day_key(now_ms)));
    Value::Object(next)
}

// ── Step away (the self-invoked gap window) ─────────────────────
// A tray click dims the screens and names one thing worth doing, drawn from
// the zenborg habits tagged `gap`. Self-invoked ONLY: nothing here reads a
// tide, and no ambient path constructs it — the same invariant `@keel/domain`
// enforces with `AmbientRule.primitives = Exclude<PrimitiveSpec, CooldownSpec>`.
//
// Two mechanisms share the surface, and the payload keeps them separable:
//   off-screen (breathwork, origami, push-ups, hydration) → cue removal. The
//     window HOLDS, and the delay is the intervention.
//   on-screen  (`gap-screen`: chess, italian lessons, revision code) → behaviour
//     substitution. The window reveals, then closes, because you need the screen.
//
// habits.json is kernel-owned (zenborg writes it, keel only reads it).

/// The tag that puts a habit on the wheel.
pub const GAP_TAG: &str = "gap";

/// Marks a `gap` habit you do ON the screen — the window gets out of the way.
pub const GAP_SCREEN_TAG: &str = "gap-screen";

/// How long an off-screen pick holds the screen before "Return" enables.
/// A delay, never a block: Cmd-Q always works, and we say so rather than
/// pretending otherwise.
pub const HOLD_OFF_SCREEN_MS: u64 = 60_000;

/// An on-screen pick only needs long enough to read the name.
pub const HOLD_ON_SCREEN_MS: u64 = 5_000;

/// One option on the wheel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapHabit {
    pub name: String,
    pub emoji: Option<String>,
    /// `true` unless the habit carries `gap-screen`.
    pub off_screen: bool,
}

impl GapHabit {
    /// The hold this pick earns — the whole behavioural difference between
    /// the two mechanisms, in one number.
    pub fn hold_ms(&self) -> u64 {
        if self.off_screen {
            HOLD_OFF_SCREEN_MS
        } else {
            HOLD_ON_SCREEN_MS
        }
    }
}

/// Every non-archived habit tagged `gap`, sorted by name so the wheel is a
/// stable list and the roll is the only source of variation.
///
/// Fail-open: unreadable, garbled, or unexpected JSON yields an empty wheel,
/// and an empty wheel still opens the window (just unnamed).
///
/// zenborg keys `habits.json` by id, so the document is an object of habit
/// records — but we accept a bare array too. The vault is private-tier and not
/// directly inspectable from every context, so tolerating both shapes costs one
/// branch and removes a silent-empty-wheel failure mode.
pub fn gap_habits(habits_json: &str) -> Vec<GapHabit> {
    let Ok(doc) = serde_json::from_str::<Value>(habits_json) else {
        return Vec::new();
    };
    let records: Vec<&Value> = match &doc {
        Value::Object(map) => map.values().collect(),
        Value::Array(list) => list.iter().collect(),
        _ => return Vec::new(),
    };
    let mut wheel: Vec<GapHabit> = Vec::new();
    for habit in records {
        if habit.get("isArchived").and_then(Value::as_bool).unwrap_or(false) {
            continue;
        }
        let tags: Vec<&str> =
            match habit.get("tags").and_then(Value::as_array) {
                Some(list) => list.iter().filter_map(Value::as_str).collect(),
                None => continue,
            };
        if !tags.contains(&GAP_TAG) {
            continue;
        }
        let Some(name) = habit.get("name").and_then(Value::as_str) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        wheel.push(GapHabit {
            name: name.to_string(),
            emoji: habit.get("emoji").and_then(Value::as_str).map(str::to_string),
            off_screen: !tags.contains(&GAP_SCREEN_TAG),
        });
    }
    wheel.sort_by(|a, b| a.name.cmp(&b.name));
    wheel
}

/// Spin the wheel. The caller supplies the roll, so the domain stays free of
/// randomness — the same rule `build_event` follows for ids.
pub fn pick_gap_habit(wheel: &[GapHabit], roll: usize) -> Option<&GapHabit> {
    if wheel.is_empty() {
        return None;
    }
    wheel.get(roll % wheel.len())
}

/// `step_away_start` payload. `habit` is null on an empty wheel — the window
/// still opens, it just has nothing to name.
pub fn step_away_payload(habit: Option<&GapHabit>, hold_ms: u64) -> Value {
    json!({
        "habit": habit.map(|h| h.name.clone()),
        "offScreen": habit.map(|h| h.off_screen),
        "holdMs": hold_ms,
    })
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

    #[test]
    fn focus_changed_never_fires_for_an_unresolvable_app() {
        // Empty app_name = the OS couldn't resolve the owning app
        // (overlays, screenshot UI, permission dialogs) — not a switch.
        // Emitting it would fabricate phantom switches around the real
        // app and poison switch-rate baselines.
        let prev = ("Brave Browser".to_string(), "".to_string());
        assert!(!focus_changed(Some(&prev), "", ""));
        assert!(!focus_changed(None, "", "anything"));
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

    // ── granularity ceiling ─────────────────────────────────────
    //
    // The stamp is a LOCAL waking-day key, so these tests build their
    // timestamps from `Local` rather than hardcoding epochs — a fixed epoch
    // would pass in one timezone and fail in the next.

    /// Epoch-ms `hours_ago` before now, for building day-stamped states.
    fn ms_ago(hours: i64) -> u64 {
        (Local::now().timestamp_millis() - hours * 3_600_000).max(0) as u64
    }

    fn now_ms() -> u64 {
        Local::now().timestamp_millis().max(0) as u64
    }

    #[test]
    fn unset_state_sits_at_the_default_ceiling() {
        assert_eq!(active_granularity(&json!({}), now_ms()), DEFAULT_GRANULARITY);
    }

    #[test]
    fn a_level_set_today_is_the_active_ceiling() {
        let now = now_ms();
        let state = set_granularity(&json!({}), "tldr", now);
        assert_eq!(active_granularity(&state, now), "tldr");
    }

    #[test]
    fn yesterdays_stamp_expires_back_to_the_default() {
        // Stamped a full day ago, read now: the day rolled, the ceiling lapsed.
        let state = set_granularity(&json!({}), "sentence", ms_ago(25));
        assert_eq!(active_granularity(&state, now_ms()), DEFAULT_GRANULARITY);
    }

    #[test]
    fn an_unrecognized_level_falls_back_rather_than_sticking() {
        let now = now_ms();
        let state = set_granularity(&json!({}), "novel", now);
        assert_eq!(active_granularity(&state, now), DEFAULT_GRANULARITY);
    }

    #[test]
    fn reset_writes_a_blank_level_and_falls_back() {
        // Exactly what `keel granularity reset` persists: stamp kept, level blank.
        let now = now_ms();
        let set = set_granularity(&json!({}), "report", now);
        let cleared = set_granularity(&set, "", now);
        assert_eq!(cleared["granularity"], json!(""));
        assert_eq!(active_granularity(&cleared, now), DEFAULT_GRANULARITY);
    }

    #[test]
    fn setting_the_ceiling_preserves_keys_the_tray_does_not_own() {
        // The regression that matters: the tray must not clobber the agent's
        // half of state.json (focus locks, session timestamps).
        let prior = json!({ "focus": true, "focusSession": "abc", "lastPromptTs": 42 });
        let next = set_granularity(&prior, "page", now_ms());
        assert_eq!(next["focus"], json!(true));
        assert_eq!(next["focusSession"], json!("abc"));
        assert_eq!(next["lastPromptTs"], json!(42));
    }

    #[test]
    fn a_garbled_state_document_still_yields_a_ceiling() {
        // Fail-open: an unreadable state degrades to the default, never to none.
        assert_eq!(active_granularity(&json!("nonsense"), now_ms()), DEFAULT_GRANULARITY);
        let recovered = set_granularity(&json!("nonsense"), "tldr", now_ms());
        assert_eq!(active_granularity(&recovered, now_ms()), "tldr");
    }

    #[test]
    fn the_waking_day_rolls_at_four_not_midnight() {
        // 02:00 and the preceding 22:00 are the same waking day; 06:00 is not.
        let two_am = Local::now()
            .date_naive()
            .and_hms_opt(2, 0, 0)
            .and_then(|d| Local.from_local_datetime(&d).single())
            .expect("2am is representable");
        let ts = two_am.timestamp_millis().max(0) as u64;
        assert_eq!(focus_day_key(ts), focus_day_key(ts.saturating_sub(4 * 3_600_000)));
        assert_ne!(focus_day_key(ts), focus_day_key(ts + 4 * 3_600_000));
    }

    #[test]
    fn every_level_has_a_menu_label() {
        for level in GRANULARITY_ORDER {
            assert!(!granularity_label(level).is_empty(), "{level} has no label");
        }
        assert!(granularity_label("novel").is_empty());
    }

    // ── step away (the gap wheel) ───────────────────────────────

    /// A trimmed `habits.json` — zenborg keys the document by habit id.
    fn habits_fixture() -> String {
        json!({
            "id-breathwork": { "name": "breathwork", "emoji": "🌬️", "tags": ["gap"], "isArchived": false },
            "id-origami":    { "name": "origami", "emoji": "🦢", "tags": ["gap"], "isArchived": false },
            "id-chess":      { "name": "chess", "emoji": "♟️", "tags": ["gap", "gap-screen"], "isArchived": false },
            "id-gym":        { "name": "gym", "emoji": "💪", "tags": ["strength"], "isArchived": false },
            "id-retired":    { "name": "retired thing", "tags": ["gap"], "isArchived": true },
            "id-untagged":   { "name": "poetry", "emoji": "📜", "tags": [] }
        })
        .to_string()
    }

    #[test]
    fn the_wheel_holds_only_live_gap_tagged_habits() {
        let wheel = gap_habits(&habits_fixture());
        let names: Vec<&str> = wheel.iter().map(|h| h.name.as_str()).collect();
        // Sorted by name, so the roll is the only source of variation.
        assert_eq!(names, vec!["breathwork", "chess", "origami"]);
    }

    #[test]
    fn gap_screen_marks_a_habit_as_on_screen() {
        let wheel = gap_habits(&habits_fixture());
        let by_name = |n: &str| wheel.iter().find(|h| h.name == n).expect("on the wheel").clone();
        // Substitution: you need the screen, so the window gets out of the way.
        assert!(!by_name("chess").off_screen);
        assert_eq!(by_name("chess").hold_ms(), HOLD_ON_SCREEN_MS);
        // Cue removal: the window holds, and the delay is the intervention.
        assert!(by_name("breathwork").off_screen);
        assert_eq!(by_name("breathwork").hold_ms(), HOLD_OFF_SCREEN_MS);
    }

    #[test]
    fn a_missing_or_garbled_habits_file_yields_an_empty_wheel() {
        // Fail-open, like every other read on this surface.
        assert!(gap_habits("").is_empty());
        assert!(gap_habits("{ not json").is_empty());
        assert!(gap_habits("[]").is_empty());
        assert!(gap_habits("{}").is_empty());
        assert!(gap_habits("\"a string\"").is_empty());
        // A record missing the fields we need is skipped, not fatal.
        assert!(gap_habits(&json!({ "id-x": { "tags": ["gap"] } }).to_string()).is_empty());
    }

    #[test]
    fn the_wheel_reads_an_array_document_as_well_as_an_id_keyed_one() {
        // The vault is private-tier; tolerating both shapes removes a
        // silent-empty-wheel failure mode we cannot always inspect for.
        let as_array = json!([
            { "name": "breathwork", "emoji": "🌬️", "tags": ["gap"], "isArchived": false },
            { "name": "chess", "emoji": "♟️", "tags": ["gap", "gap-screen"], "isArchived": false },
            { "name": "gym", "tags": ["strength"], "isArchived": false }
        ])
        .to_string();
        let wheel = gap_habits(&as_array);
        assert_eq!(wheel.iter().map(|h| h.name.as_str()).collect::<Vec<_>>(), vec!["breathwork", "chess"]);
        assert!(!wheel[1].off_screen);
    }

    #[test]
    fn the_roll_wraps_and_reaches_every_option() {
        let wheel = gap_habits(&habits_fixture());
        let picked: Vec<&str> =
            (0..wheel.len()).filter_map(|r| pick_gap_habit(&wheel, r)).map(|h| h.name.as_str()).collect();
        assert_eq!(picked, vec!["breathwork", "chess", "origami"]);
        // Rolls past the end wrap rather than falling off.
        assert_eq!(pick_gap_habit(&wheel, wheel.len()).map(|h| h.name.as_str()), Some("breathwork"));
        assert_eq!(pick_gap_habit(&wheel, usize::MAX).is_some(), true);
    }

    #[test]
    fn an_empty_wheel_picks_nothing_without_panicking() {
        assert!(pick_gap_habit(&[], 0).is_none());
        assert!(pick_gap_habit(&[], 99).is_none());
    }

    #[test]
    fn the_start_payload_carries_the_habit_and_its_mechanism() {
        let wheel = gap_habits(&habits_fixture());
        let habit = pick_gap_habit(&wheel, 0).expect("a habit");
        assert_eq!(
            step_away_payload(Some(habit), habit.hold_ms()),
            json!({ "habit": "breathwork", "offScreen": true, "holdMs": HOLD_OFF_SCREEN_MS })
        );
    }

    #[test]
    fn an_unnamed_gap_still_produces_a_payload() {
        // Empty wheel: the window opens anyway, so the event must too.
        assert_eq!(
            step_away_payload(None, HOLD_OFF_SCREEN_MS),
            json!({ "habit": null, "offScreen": null, "holdMs": HOLD_OFF_SCREEN_MS })
        );
    }
}
