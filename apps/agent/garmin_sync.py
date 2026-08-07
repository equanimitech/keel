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

Kinds (both completions, per packages/domain/docs/event-taxonomy.md):
  workout_completed  ts = activity start, durationMs = elapsed
  sleep_recorded     ts = sleep end,     durationMs = time asleep

`durationMs` is set even though this writer did not watch the interval live:
Garmin observed both boundaries and reports the span authoritatively. The
taxonomy rule bans *fabricating* a duration across a writer restart, not
transcribing one from a source that measured it.

Privacy: payloads carry type and numbers only. Deliberately dropped —
activityName (Garmin bakes place names into it, e.g. "<suburb> Soccer/Football"),
locationName, startLatitude/startLongitude, deviceId, ownerId.

Usage:
    ./garmin_sync.py                 # incremental, since last cursor
    ./garmin_sync.py --dry-run       # print events, write nothing
    ./garmin_sync.py --backfill 30   # widen the sleep window on first run
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


def activity_event(a):
    """Raw Garmin activity dict -> ActivityEvent. Returns None if unusable."""
    aid = a.get("activityId")
    start = a.get("startTimeGMT")
    if aid is None or not start:
        return None
    payload = {
        "activityId": aid,
        "activityType": (a.get("activityType") or {}).get("typeKey", "unknown"),
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

    ev = {
        "id": event_id(f"activity:{aid}"),
        "surface": "garmin",
        "kind": "workout_completed",
        "ts": _ms_from_gmt(start),
        "sessionId": "",
        "payload": payload,
    }
    dur = a.get("duration")
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


# ── i/o shell ───────────────────────────────────────────────────────

def read_cursor():
    try:
        with open(CURSOR) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


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


def main():
    ap = argparse.ArgumentParser(description="keel garmin sync")
    ap.add_argument("--dry-run", action="store_true", help="print events, write nothing")
    ap.add_argument("--backfill", type=int, default=3,
                    help="how many days of sleep to consider each run (default 3)")
    ap.add_argument("--limit", type=int, default=25,
                    help="how many recent activities to scan (default 25)")
    args = ap.parse_args()

    from garminconnect import Garmin

    cursor = read_cursor()
    api = Garmin()
    api.login(TOKENSTORE)

    events = []

    fresh = new_activities(api.get_activities(0, args.limit), cursor.get("lastActivityId"))
    events += [e for e in (activity_event(a) for a in fresh) if e]

    seen = cursor.get("seenSleepDates", [])
    logged_dates = []
    for date in sleep_dates(datetime.now().date(), seen, args.backfill):
        try:
            dto = (api.get_sleep_data(date) or {}).get("dailySleepDTO")
        except Exception as exc:  # one bad night must not sink the run
            print(f"keel garmin: sleep {date} failed: {exc}", file=sys.stderr)
            continue
        ev = sleep_event(dto)
        if ev:
            events.append(ev)
            logged_dates.append(date)

    if args.dry_run:
        for e in events:
            print(json.dumps(e, indent=2))
        print(f"keel garmin: {len(events)} event(s), dry run — nothing written", file=sys.stderr)
        return 0

    append(events)
    if fresh:
        cursor["lastActivityId"] = max(a["activityId"] for a in fresh)
    if logged_dates:
        cursor["seenSleepDates"] = sorted(set(seen) | set(logged_dates))[-SEEN_SLEEP_KEEP:]
    cursor["lastRunAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    write_cursor(cursor)

    print(f"keel garmin: wrote {len(events)} event(s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
