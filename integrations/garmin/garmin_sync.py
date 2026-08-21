#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["garminconnect"]
# ///
"""keel garmin sync — a fourth activity-log writer: body state, polled.

Garmin has no local sync event and no push for unofficial clients, so this
polls. Reads Garmin Connect via garminconnect (garth tokens already cached in
~/.garminconnect — no credentials live here), and appends taxonomy-conformant
ActivityEvents to ~/.kairos/keel/log/YYYY-MM-DD.garmin.jsonl.

Kinds (all completions, per docs/event-taxonomy.md):
  workout_completed    ts = activity start,  durationMs = elapsed
  sleep_recorded       ts = sleep end,       durationMs = time asleep
  body_sampled         ts = end of the hour, durationMs = 1h  (rollup)
  body_battery_changed ts = period start,    durationMs = period
  readiness_recorded   ts = the reading
  day_summarized       ts = end of local day

`durationMs` is set even though this writer did not watch the interval live:
Garmin observed both boundaries and reports the span authoritatively. The
taxonomy rule bans *fabricating* a duration across a writer restart, not
transcribing one from a source that measured it.

The daily kinds were the whole writer until 2026-08-18. They gave keel one body
reading per night, while every read-side derivation (bouts, tides) is intraday —
so "body state is the covariate axis" had nothing to join against. `body_sampled`
is that join: 5-minute bins of stress and body battery, rolled up hourly.

Privacy: payloads carry type and numbers only. Deliberately dropped —
activityName (Garmin bakes place names into it, e.g. "<suburb> Soccer/Football"),
locationName, startLatitude/startLongitude, deviceId, ownerId, and every
free-text feedback phrase Garmin attaches to readiness and body-battery events.

Not synced, deliberately: badges, challenges and leaderboards (Garmin's
engagement surface, which is the thing keel exists to counter); the athletic
performance stack (VO2max, race predictions, FTP, power curves — keel is not a
training app); nutrition, hydration and weigh-ins (manual-entry, and
body-image adjacent); splits, FIT files and activity weather (volume, and
weather is a location leak by another name).

Usage:
    ./garmin_sync.py                 # incremental, since last cursor
    ./garmin_sync.py --dry-run       # print events, write nothing
    ./garmin_sync.py --backfill 30   # widen the window on first run
"""
import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

KEEL_HOME = os.path.expanduser(
    os.environ.get("KEEL_HOME")
    or os.path.join(os.environ.get("KAIROS_HOME", "~/.kairos"), "keel")
)
LOG_DIR = os.path.join(KEEL_HOME, "log")
CURSOR = os.path.join(KEEL_HOME, "garmin.cursor")
TOKENSTORE = os.path.expanduser("~/.garminconnect")

# Enough history that a missed night is recoverable, bounded so the cursor
# file cannot grow without limit.
SEEN_SLEEP_KEEP = 60

# Every stream keeps a bounded set of already-written keys rather than a
# high-water mark. Same reason `sleep_dates` uses a window: Garmin uploads from
# the watch late and out of order, so a watermark set at 13:00 would silently
# skip a 10:00 hour that only landed at 13:30. Sizes are "enough days that a
# gap is recoverable", not "forever".
STREAM_KEEP = {
    "body": 240,        # 10 days of hourly rollups
    "bbevent": 240,
    "readiness": 60,
    "summary": 60,
}
NS = uuid.UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")  # NAMESPACE_URL


# ── pure ────────────────────────────────────────────────────────────

def event_id(key):
    """Deterministic id, so a double-write is dedupable downstream rather
    than silently becoming two distinct events."""
    return str(uuid.uuid5(NS, "keel:garmin:" + key))


def log_file_name(ts_ms):
    """Per-day file, named by the event's LOCAL date — mirrors
    core.mjs logFileName so read-side date queries stay honest."""
    d = datetime.fromtimestamp(ts_ms / 1000)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}.garmin.jsonl"


def _ms_from_gmt(s):
    """Garmin's 'YYYY-MM-DD HH:MM:SS' GMT strings -> epoch ms."""
    return int(datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
               .replace(tzinfo=timezone.utc).timestamp() * 1000)


def activity_event(a, stress=(), battery=()):
    """Raw Garmin activity dict -> ActivityEvent. Returns None if unusable.

    `stress`/`battery` are the day's (ts, value) series, passed in so a stillness
    activity can be enriched with settling metrics. Optional: without them the
    event is exactly what it always was."""
    aid = a.get("activityId")
    start = a.get("startTimeGMT")
    if aid is None or not start:
        return None
    kind = (a.get("activityType") or {}).get("typeKey", "unknown")
    payload = {
        "activityId": aid,
        "activityType": kind,
        "manual": bool(a.get("manualActivity")),
    }
    event_type = (a.get("eventType") or {}).get("typeKey")
    if event_type:
        payload["eventType"] = event_type
    # Optional metrics — omitted rather than nulled when Garmin has none.
    for src, dst in (("distance", "distanceM"), ("calories", "calories"),
                     ("averageHR", "avgHrBpm"), ("maxHR", "maxHrBpm"),
                     ("steps", "steps"), ("movingDuration", "movingDurationS"),
                     ("aerobicTrainingEffect", "aerobicTrainingEffect")):
        v = a.get(src)
        if v is not None:
            payload[dst] = round(v, 2) if isinstance(v, float) else v

    ts = _ms_from_gmt(start)
    dur = a.get("duration")

    # A sit is not a workout. For stillness types the exertion metrics above are
    # noise and the settling is the signal, so fold in what the day's series says
    # happened around the interval.
    if is_stillness(kind) and (stress or battery):
        payload.update(stillness_metrics(
            stress, battery, ts, ts + int((dur or 0) * 1000)))

    ev = {
        "id": event_id(f"activity:{aid}"),
        "surface": "garmin",
        "kind": "workout_completed",
        "ts": ts,
        "sessionId": "",
        "payload": payload,
    }
    if dur:
        ev["durationMs"] = int(dur * 1000)
    return ev


def sleep_event(dto):
    """dailySleepDTO -> ActivityEvent. Returns None for a night with no
    measured sleep (watch off, travel) — an absent night is not a zero one."""
    if not dto:
        return None
    end = dto.get("sleepEndTimestampGMT")
    secs = dto.get("sleepTimeSeconds")
    date = dto.get("calendarDate")
    if not end or not secs or not date:
        return None
    payload = {"calendarDate": date}
    for src, dst in (("deepSleepSeconds", "deepS"), ("lightSleepSeconds", "lightS"),
                     ("remSleepSeconds", "remS"), ("awakeSleepSeconds", "awakeS"),
                     ("awakeCount", "awakeCount"), ("avgSleepStress", "avgSleepStress"),
                     ("avgHeartRate", "avgHrBpm"),
                     ("averageRespirationValue", "avgRespiration"),
                     ("napTimeSeconds", "napS")):
        v = dto.get(src)
        if v is not None:
            payload[dst] = v
    score = ((dto.get("sleepScores") or {}).get("overall") or {}).get("value")
    if score is not None:
        payload["sleepScore"] = score

    return {
        "id": event_id(f"sleep:{date}"),
        "surface": "garmin",
        "kind": "sleep_recorded",
        "ts": int(end),
        "sessionId": "",
        "payload": payload,
        "durationMs": int(secs * 1000),
    }


def new_activities(activities, last_id):
    """Activity ids increase monotonically on creation, so a high-water mark
    is exact — a backdated manual entry still gets a fresh (higher) id."""
    fresh = [a for a in activities if (a.get("activityId") or 0) > (last_id or 0)]
    return sorted(fresh, key=lambda a: a.get("activityId") or 0)


def sleep_dates(today, seen, backfill):
    """Dates to poll: a rolling window minus what we already logged.

    A window rather than a watermark on purpose — one night without the watch
    would stall a watermark forever, and that night is common, not exotic."""
    seen = set(seen or ())
    days = (today - timedelta(days=i) for i in range(max(backfill, 1)))
    return [d.isoformat() for d in days if d.isoformat() not in seen]


# ── new streams: intraday body state ────────────────────────────────

# Garmin's stress series uses negative sentinels rather than gaps: -1 is "no
# reading", -2 is "in an activity, stress not computed". Both mean *unknown*,
# which is not the same as calm — mapping them to 0 would invent serenity.
STRESS_UNKNOWN = (-1, -2)

# One rollup per local hour, carrying fixed-width bins. Mirrors the desktop
# surface's `input_activity` (a 30s rollup of per-3s-bin counts): a dense series
# enters the log as a small number of rollup events, never one event per sample.
# 5 minutes is deliberately coarser than Garmin's native ~3min cadence, so the
# bin grid stays stable even if that cadence changes.
BIN_MINUTES = 5
BINS_PER_HOUR = 60 // BIN_MINUTES

# Activity types where the interesting signal is settling, not exertion. For
# these the payload carries stress/body-battery deltas instead of pace and
# distance, which say nothing about a sit.
STILLNESS_TYPES = frozenset({
    "yoga", "meditation", "breathwork", "mindful_breathing",
    "pilates", "mind_body", "stretching",
})


def _local_hour_bounds(date_str, hour):
    """[start, end) epoch ms of one local hour on a calendar date.

    Local, not GMT: the log is filed by local date (see log_file_name), so an
    hour that straddles the boundary must land the same way the file does."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    start = d.replace(hour=hour)
    return (int(start.timestamp() * 1000),
            int((start + timedelta(hours=1)).timestamp() * 1000))


def _bb_level(row):
    """A bodyBatteryValuesArray row -> level, across both shapes Garmin ships:
    [ts, level] and [ts, "MEASURED", level, version]."""
    if len(row) >= 3 and isinstance(row[1], str):
        v = row[2]
    elif len(row) >= 2:
        v = row[1]
    else:
        return None
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _bin(pairs, start_ms, end_ms):
    """(ts, value) pairs -> BINS_PER_HOUR means over [start, end).

    A bin with no reading is None rather than absent: position carries the time
    offset, so dropping empties would silently shift every later bin."""
    width = BIN_MINUTES * 60 * 1000
    buckets = [[] for _ in range(BINS_PER_HOUR)]
    for ts, v in pairs:
        if v is None or not (start_ms <= ts < end_ms):
            continue
        i = int((ts - start_ms) // width)
        if 0 <= i < BINS_PER_HOUR:
            buckets[i].append(v)
    return [round(sum(b) / len(b)) if b else None for b in buckets]


def stress_pairs(dto):
    """stressValuesArray -> (ts, value) pairs, sentinels dropped."""
    out = []
    for row in (dto or {}).get("stressValuesArray") or ():
        if (len(row) >= 2 and isinstance(row[1], (int, float))
                and not isinstance(row[1], bool) and row[1] not in STRESS_UNKNOWN):
            out.append((int(row[0]), int(row[1])))
    return out


def body_battery_pairs(dto):
    """bodyBatteryValuesArray -> (ts, level) pairs."""
    out = []
    for row in (dto or {}).get("bodyBatteryValuesArray") or ():
        lvl = _bb_level(row)
        if lvl is not None:
            out.append((int(row[0]), lvl))
    return out


def body_sample_events(date_str, dto, now_ms, seen):
    """One `body_sampled` rollup per COMPLETE local hour of `date_str`.

    Complete only: a partial hour would be rewritten by the next hourly poll
    with different numbers under the same deterministic id, which is exactly the
    ambiguity the id exists to prevent. An hour with no reading at all is
    skipped — the watch was off, and that is an absence, not a flat line."""
    stress = stress_pairs(dto)
    battery = body_battery_pairs(dto)
    if not stress and not battery:
        return []

    events = []
    for hour in range(24):
        key = f"{date_str}T{hour:02d}"
        if key in seen:
            continue
        start, end = _local_hour_bounds(date_str, hour)
        if end > now_ms:
            continue
        s_bins = _bin(stress, start, end)
        b_bins = _bin(battery, start, end)
        if all(v is None for v in s_bins) and all(v is None for v in b_bins):
            continue
        payload = {"calendarDate": date_str, "hour": hour, "binMinutes": BIN_MINUTES}
        if any(v is not None for v in s_bins):
            payload["stress"] = s_bins
        if any(v is not None for v in b_bins):
            payload["bodyBattery"] = b_bins
        events.append({
            "id": event_id(f"body:{key}"),
            "surface": "garmin",
            "kind": "body_sampled",
            "ts": end,
            "sessionId": "",
            "payload": payload,
            "durationMs": end - start,
        })
    return events


def body_battery_change_events(day_dto, seen):
    """Garmin's own segmentation of the body-battery curve into discrete
    charge/drain periods — already in the taxonomy's completion grammar, so it
    is transcribed rather than re-derived from the series.

    `shortFeedback` is dropped: payloads carry counts and timings, not prose."""
    events = []
    for ev in (day_dto or {}).get("bodyBatteryActivityEvent") or ():
        start = ev.get("eventStartTimeGmt")
        if not start:
            continue
        try:
            ts = _ms_from_gmt(str(start).replace("T", " ").split(".")[0])
        except (ValueError, AttributeError):
            continue
        if f"bb:{ts}" in seen:
            continue
        payload = {"eventType": ev.get("eventType") or "unknown"}
        impact = ev.get("bodyBatteryImpact")
        if impact is not None:
            payload["bodyBatteryImpact"] = impact
        e = {
            "id": event_id(f"bbevent:{ts}"),
            "surface": "garmin",
            "kind": "body_battery_changed",
            "ts": ts,
            "sessionId": "",
            "payload": payload,
        }
        dur = ev.get("durationInMilliseconds")
        if dur:
            e["durationMs"] = int(dur)
        events.append(e)
    return events


def readiness_event(entry, hrv, seen):
    """A training-readiness reading, joined with that night's HRV summary.

    Both are kept even though readiness already folds HRV in: readiness is
    Garmin's opaque composite, HRV status is the measure with a literature
    behind it, and the 21-day baseline question needs the latter to stand on
    its own. Free-text feedback phrases are dropped — numbers and enums only."""
    if not entry:
        return None
    ts = entry.get("timestamp") or entry.get("timestampGmt")
    if isinstance(ts, str):
        try:
            ts = _ms_from_gmt(ts.replace("T", " ").split(".")[0])
        except ValueError:
            ts = None
    if not isinstance(ts, (int, float)) or isinstance(ts, bool):
        return None
    ts = int(ts)
    if f"readiness:{ts}" in seen:
        return None

    payload = {}
    date = entry.get("calendarDate")
    if date:
        payload["calendarDate"] = date
    for src, dst in (("score", "score"), ("level", "level"),
                     ("inputContext", "context"), ("sleepScore", "sleepScore"),
                     ("sleepScoreFactorPercent", "sleepFactorPct"),
                     ("sleepHistoryFactorPercent", "sleepHistoryFactorPct"),
                     ("recoveryTime", "recoveryTimeMin"),
                     ("recoveryTimeFactorPercent", "recoveryFactorPct"),
                     ("acwrFactorPercent", "loadFactorPct"),
                     ("acuteLoad", "acuteLoad"),
                     ("hrvFactorPercent", "hrvFactorPct"),
                     ("stressHistoryFactorPercent", "stressHistoryFactorPct")):
        v = entry.get(src)
        if v is not None:
            payload[dst] = v

    summary = (hrv or {}).get("hrvSummary") or {}
    baseline = summary.get("baseline") or {}
    for src, dst in (("lastNightAvg", "hrvLastNightMs"),
                     ("lastNight5MinHigh", "hrvLastNight5MinHighMs"),
                     ("weeklyAvg", "hrvWeeklyMs"), ("status", "hrvStatus")):
        v = summary.get(src)
        if v is not None:
            payload[dst] = v
    for src, dst in (("balancedLow", "hrvBalancedLowMs"),
                     ("balancedUpper", "hrvBalancedUpperMs")):
        v = baseline.get(src)
        if v is not None:
            payload[dst] = v

    return {
        "id": event_id(f"readiness:{ts}"),
        "surface": "garmin",
        "kind": "readiness_recorded",
        "ts": ts,
        "sessionId": "",
        "payload": payload,
    }


def day_summary_event(date_str, stats, now_ms, seen):
    """One `day_summarized` per COMPLETE local day.

    Complete only, for the same reason body rollups are: these are the day's
    final numbers, and a midday snapshot under the same id is a different fact.

    `sedentarySeconds` is the reason this stream is worth having — it is Garmin
    measuring, independently, the same sitting the desktop surface measures. A
    cross-check keel cannot produce from its own writers."""
    if not stats or date_str in seen:
        return None
    d = datetime.strptime(date_str, "%Y-%m-%d")
    end = int((d + timedelta(days=1)).timestamp() * 1000) - 1
    if end > now_ms:
        return None

    payload = {"calendarDate": date_str}
    for src, dst in (("totalSteps", "steps"), ("floorsAscended", "floorsUp"),
                     ("highlyActiveSeconds", "highlyActiveS"),
                     ("activeSeconds", "activeS"),
                     ("sedentarySeconds", "sedentaryS"),
                     ("moderateIntensityMinutes", "moderateIntensityMin"),
                     ("vigorousIntensityMinutes", "vigorousIntensityMin"),
                     ("minHeartRate", "minHrBpm"), ("maxHeartRate", "maxHrBpm"),
                     ("restingHeartRate", "restingHrBpm"),
                     ("lastSevenDaysAvgRestingHeartRate", "restingHr7dBpm"),
                     ("averageStressLevel", "avgStress"),
                     ("maxStressLevel", "maxStress"),
                     ("bodyBatteryChargedValue", "bbCharged"),
                     ("bodyBatteryDrainedValue", "bbDrained"),
                     ("bodyBatteryHighestValue", "bbHighest"),
                     ("bodyBatteryLowestValue", "bbLowest"),
                     ("avgWakingRespirationValue", "avgWakingRespiration")):
        v = stats.get(src)
        if v is not None:
            payload[dst] = round(v, 2) if isinstance(v, float) else v

    if len(payload) == 1:  # calendarDate only — the day has no data at all
        return None

    return {
        "id": event_id(f"day:{date_str}"),
        "surface": "garmin",
        "kind": "day_summarized",
        "ts": end,
        "sessionId": "",
        "payload": payload,
    }


def _window(pairs, start_ms, end_ms):
    return [v for ts, v in pairs if start_ms <= ts <= end_ms]


def stillness_metrics(stress, battery, start_ms, end_ms, pad_ms=15 * 60 * 1000):
    """Stress/body-battery around a sit, for the enriched `workout_completed`.

    Distance and calories say nothing about meditation; the settling does. Reads
    the series already fetched for `body_sampled`, so this costs no extra call."""
    out = {}
    before = _window(stress, start_ms - pad_ms, start_ms)
    after = _window(stress, end_ms, end_ms + pad_ms)
    during = _window(stress, start_ms, end_ms)
    if before:
        out["stressBefore"] = round(sum(before) / len(before))
    if after:
        out["stressAfter"] = round(sum(after) / len(after))
    if "stressBefore" in out and "stressAfter" in out:
        out["stressDelta"] = out["stressAfter"] - out["stressBefore"]
    if during:
        out["stressMinDuring"] = min(during)
        out["stressAvgDuring"] = round(sum(during) / len(during))

    bb_before = _window(battery, start_ms - pad_ms, start_ms)
    bb_after = _window(battery, end_ms, end_ms + pad_ms)
    if bb_before:
        out["bodyBatteryBefore"] = bb_before[-1]
    if bb_after:
        out["bodyBatteryAfter"] = bb_after[0]
    if "bodyBatteryBefore" in out and "bodyBatteryAfter" in out:
        out["bodyBatteryDelta"] = out["bodyBatteryAfter"] - out["bodyBatteryBefore"]
    return out


def is_stillness(activity_type):
    return (activity_type or "").lower() in STILLNESS_TYPES

# ── i/o shell ───────────────────────────────────────────────────────

def read_cursor():
    try:
        with open(CURSOR) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def seen_keys(cursor, stream):
    """Already-written keys for a stream. `sleep` keeps its original top-level
    field so an existing cursor file keeps working untouched."""
    if stream == "sleep":
        return set(cursor.get("seenSleepDates") or ())
    return set((cursor.get("seen") or {}).get(stream) or ())


def remember(cursor, stream, keys):
    """Record keys as written, trimmed to the stream's bound."""
    if not keys:
        return
    if stream == "sleep":
        merged = set(cursor.get("seenSleepDates") or ()) | set(keys)
        cursor["seenSleepDates"] = sorted(merged)[-SEEN_SLEEP_KEEP:]
        return
    seen = cursor.setdefault("seen", {})
    merged = set(seen.get(stream) or ()) | set(keys)
    seen[stream] = sorted(merged)[-STREAM_KEEP.get(stream, 240):]


def write_cursor(c):
    os.makedirs(KEEL_HOME, exist_ok=True)
    tmp = CURSOR + ".tmp"
    with open(tmp, "w") as f:
        json.dump(c, f, indent=2)
    os.replace(tmp, CURSOR)


def append(events):
    os.makedirs(LOG_DIR, exist_ok=True)
    for e in events:
        path = os.path.join(LOG_DIR, log_file_name(e["ts"]))
        with open(path, "a") as f:
            f.write(json.dumps(e, separators=(",", ":")) + "\n")


def _safe(label, fn, *a):
    """One failing endpoint must not sink the run. Garmin returns 404 for a
    stream a device never recorded, and that is normal, not an error."""
    try:
        return fn(*a)
    except Exception as exc:
        print(f"keel garmin: {label} failed: {exc}", file=sys.stderr)
        return None


def window_dates(today, days):
    """Ascending calendar dates to consider, oldest first so `seen` sets and
    the log both accumulate in time order."""
    return [(today - timedelta(days=i)).isoformat()
            for i in range(max(days, 1) - 1, -1, -1)]


def day_is_over(date_str, now_ms):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return int((d + timedelta(days=1)).timestamp() * 1000) - 1 <= now_ms


def main():
    ap = argparse.ArgumentParser(description="keel garmin sync")
    ap.add_argument("--dry-run", action="store_true", help="print events, write nothing")
    ap.add_argument("--backfill", type=int, default=3,
                    help="how many days to consider each run (default 3)")
    ap.add_argument("--limit", type=int, default=25,
                    help="how many recent activities to scan (default 25)")
    args = ap.parse_args()

    from garminconnect import Garmin

    cursor = read_cursor()
    api = Garmin()
    api.login(TOKENSTORE)

    now_ms = int(datetime.now().timestamp() * 1000)
    dates = window_dates(datetime.now().date(), args.backfill)
    events = []
    wrote = {}

    # ── intraday body series ────────────────────────────────────────
    # Fetched first because two other streams read it: `body_sampled` bins it,
    # and a stillness activity borrows it for settling metrics. One call per
    # date serves both — stress and body battery arrive in the same response.
    seen_body = seen_keys(cursor, "body")
    series = {}
    body_keys = []
    for date in dates:
        if f"{date}!done" in seen_body:
            continue
        dto = _safe(f"stress {date}", api.get_stress_data, date)
        if not dto:
            continue
        series[date] = (stress_pairs(dto), body_battery_pairs(dto))
        evs = body_sample_events(date, dto, now_ms, seen_body)
        events += evs
        body_keys += [f"{date}T{e['payload']['hour']:02d}" for e in evs]
        if day_is_over(date, now_ms):
            body_keys.append(f"{date}!done")
    wrote["body"] = body_keys

    # ── activities ──────────────────────────────────────────────────
    fresh = new_activities(api.get_activities(0, args.limit), cursor.get("lastActivityId"))
    for a in fresh:
        start = a.get("startTimeGMT")
        day = (datetime.fromtimestamp(_ms_from_gmt(start) / 1000).date().isoformat()
               if start else None)
        stress, battery = series.get(day, ((), ()))
        e = activity_event(a, stress, battery)
        if e:
            events.append(e)

    # ── sleep ───────────────────────────────────────────────────────
    seen_sleep = seen_keys(cursor, "sleep")
    sleep_keys = []
    for date in sleep_dates(datetime.now().date(), seen_sleep, args.backfill):
        dto = _safe(f"sleep {date}", api.get_sleep_data, date)
        ev = sleep_event((dto or {}).get("dailySleepDTO"))
        if ev:
            events.append(ev)
            sleep_keys.append(date)
    wrote["sleep"] = sleep_keys

    # ── body battery charge/drain periods ───────────────────────────
    seen_bb = seen_keys(cursor, "bbevent")
    bb_keys = []
    for date in dates:
        if f"{date}!done" in seen_bb:
            continue
        days = _safe(f"body battery {date}", api.get_body_battery, date, date)
        evs = body_battery_change_events((days or [{}])[0], seen_bb)
        events += evs
        bb_keys += [f"bb:{e['ts']}" for e in evs]
        if days is not None and day_is_over(date, now_ms):
            bb_keys.append(f"{date}!done")
    wrote["bbevent"] = bb_keys

    # ── morning readiness + HRV ─────────────────────────────────────
    seen_rd = seen_keys(cursor, "readiness")
    rd_keys = []
    for date in dates:
        if f"{date}!done" in seen_rd:
            continue
        entries = _safe(f"readiness {date}", api.get_training_readiness, date)
        if not entries:
            continue
        hrv = _safe(f"hrv {date}", api.get_hrv_data, date)
        for entry in entries:
            ev = readiness_event(entry, hrv, seen_rd)
            if ev:
                events.append(ev)
                rd_keys.append(f"readiness:{ev['ts']}")
        if day_is_over(date, now_ms):
            rd_keys.append(f"{date}!done")
    wrote["readiness"] = rd_keys

    # ── daily rollup ────────────────────────────────────────────────
    seen_sum = seen_keys(cursor, "summary")
    sum_keys = []
    for date in dates:
        if date in seen_sum or not day_is_over(date, now_ms):
            continue
        stats = _safe(f"stats {date}", api.get_stats, date)
        ev = day_summary_event(date, stats, now_ms, seen_sum)
        if ev:
            events.append(ev)
            sum_keys.append(date)
    wrote["summary"] = sum_keys

    events.sort(key=lambda e: e["ts"])

    if args.dry_run:
        for e in events:
            print(json.dumps(e, indent=2))
        print(f"keel garmin: {len(events)} event(s), dry run — nothing written",
              file=sys.stderr)
        return 0

    append(events)
    if fresh:
        cursor["lastActivityId"] = max(a["activityId"] for a in fresh)
    for stream, keys in wrote.items():
        remember(cursor, stream, keys)
    cursor["lastRunAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    write_cursor(cursor)

    by_kind = {}
    for e in events:
        by_kind[e["kind"]] = by_kind.get(e["kind"], 0) + 1
    detail = ", ".join(f"{k} {v}" for k, v in sorted(by_kind.items())) or "none"
    print(f"keel garmin: wrote {len(events)} event(s) ({detail})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
