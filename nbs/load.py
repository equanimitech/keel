"""Load keel activity logs (all surfaces, all days) into a tidy DataFrame.

Private EDA helper — reads ~/.keel/log/*.jsonl locally, never sends data out.
Mirrors keel's own time model: focus-day rolls at 04:00 (core.mjs DAY_START_HOUR),
watches morning/afternoon/evening/night (core.mjs DEFAULT_WATCHES).
"""
from __future__ import annotations
import json, glob, os
from datetime import timedelta
import pandas as pd

LOG_DIR = os.path.expanduser("~/.keel/log")
DAY_START_HOUR = 4  # focus-day boundary (keel core.mjs)
WATCHES = {"morning": 9 * 60, "afternoon": 13 * 60, "evening": 19 * 60, "night": 1 * 60 + 30}

# Configured high-alert domains (from ~/.keel/config.json watchlist, 2026-06-24).
# windowed = the drift set keel windows/intervenes on; observe = wider watch.
WINDOWED = {
    "youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
    "chess.com", "lichess.org", "linkedin.com",
    "pornhub.com", "xvideos.com", "xhamster.com", "xnxx.com",
    "redtube.com", "youporn.com", "spankbang.com", "onlyfans.com",
}
OBSERVE = {
    "youtube.com", "chess.com", "linkedin.com", "news.ycombinator.com",
    "nytimes.com", "netflix.com", "disneyplus.com", "web.whatsapp.com",
    "reddit.com", "instagram.com", "futemax.news", "soccerstreams.news",
    "multicanaishd.today", "sporticos.com", "app.envoituresimone.com",
}


def alert_class(domain) -> str:
    """windowed (high-alert drift) | observe (watched) | other."""
    if domain in WINDOWED:
        return "windowed"
    if domain in OBSERVE:
        return "observe"
    return "other"


def _watch(minutes_of_day: int) -> str:
    # latest watch start <= now, wrapping past midnight to the last watch
    cur = max(WATCHES, key=lambda k: WATCHES[k])  # wrapped default
    for name, start in sorted(WATCHES.items(), key=lambda kv: kv[1]):
        if minutes_of_day >= start:
            cur = name
    return cur


def load(log_dir: str = LOG_DIR) -> pd.DataFrame:
    """All events across surfaces+days as one frame, sorted by ts."""
    rows = []
    for path in glob.glob(os.path.join(log_dir, "*.jsonl")):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    continue
                p = e.get("payload") or {}
                rows.append({
                    "ts": e.get("ts"),
                    "surface": e.get("surface"),
                    "kind": e.get("kind"),
                    "sessionId": e.get("sessionId") or "",
                    "domain": p.get("domain"),
                    "app": p.get("app_name"),
                    "route": p.get("route"),
                    "tab": p.get("tab"),
                    "seconds": p.get("seconds"),
                    "durationMs": e.get("durationMs"),
                })
    df = pd.DataFrame(rows).dropna(subset=["ts"]).sort_values("ts").reset_index(drop=True)
    df["dt"] = pd.to_datetime(df["ts"], unit="ms")
    df["focus_day"] = (df["dt"] - timedelta(hours=DAY_START_HOUR)).dt.date
    mod = df["dt"].dt.hour * 60 + df["dt"].dt.minute
    df["watch"] = mod.map(_watch)
    return df


def domain_time(df: pd.DataFrame, gap_cap_ms: int = 5 * 60 * 1000) -> pd.DataFrame:
    """Browser focus-time attributed per (focus_day, domain).

    Walks events in ts order, tracking the active domain (tab_activated /
    navigation_committed) and gating on focus_*/idle_*. Wall-clock between
    markers is charged to the current domain only while focused & not idle;
    gaps > gap_cap_ms (tab left open, machine away) are dropped.
    """
    b = df[df["surface"] == "browser"].sort_values("ts")
    out: dict[tuple, int] = {}
    cur = None
    focused, idle, prev, prev_day = True, False, None, None
    for r in b.itertuples():
        if prev is not None and cur and focused and not idle:
            dt = r.ts - prev
            if 0 < dt < gap_cap_ms:
                out[(prev_day, cur)] = out.get((prev_day, cur), 0) + dt
        if r.kind in ("tab_activated", "navigation_committed") and r.domain:
            cur = r.domain
        elif r.kind == "focus_start":
            focused = True
        elif r.kind == "focus_end":
            focused = False
        elif r.kind == "idle_start":
            idle = True
        elif r.kind == "idle_end":
            idle = False
        prev, prev_day = r.ts, r.focus_day
    rows = [{"focus_day": d, "domain": dom, "minutes": ms / 60000} for (d, dom), ms in out.items()]
    return (pd.DataFrame(rows).sort_values(["focus_day", "minutes"], ascending=[True, False])
            .reset_index(drop=True))


def bouts(df: pd.DataFrame, gap_cap_ms: int = 5 * 60 * 1000,
          min_bout_ms: int = 15 * 1000) -> pd.DataFrame:
    """Continuous focused stretches on a single domain — the bout = the tide's grain.

    Same walk + focus/idle gating as domain_time, but instead of summing it
    emits one row per maximal contiguous run on a domain. A bout breaks on
    domain change, an unfocused/idle stretch, or a gap > gap_cap_ms.
    Columns: focus_day, watch, domain, alert, start, end, minutes.
    """
    b = df[df["surface"] == "browser"].sort_values("ts")
    rows = []
    cur = None
    focused, idle, prev = True, False, None
    bdom = bs = be = bday = bwatch = None  # open bout: domain, start, end, day, watch

    def close():
        if bs is not None:
            rows.append((bday, bwatch, bdom, alert_class(bdom), bs, be))

    for r in b.itertuples():
        charge = prev is not None and cur and focused and not idle and (0 < r.ts - prev < gap_cap_ms)
        if charge and bs is not None and cur == bdom:  # extend open bout on same domain
            be = r.ts
        elif charge:                                   # start a new bout (closing any prior)
            close()
            bdom, bs, be, bday, bwatch = cur, prev, r.ts, r.focus_day, r.watch
        else:                                          # cannot charge → close any open bout
            close()
            bdom = bs = None
        if r.kind in ("tab_activated", "navigation_committed") and r.domain:
            cur = r.domain
        elif r.kind == "focus_start":
            focused = True
        elif r.kind == "focus_end":
            focused = False
        elif r.kind == "idle_start":
            idle = True
        elif r.kind == "idle_end":
            idle = False
        prev = r.ts
    close()
    out = pd.DataFrame(rows, columns=["focus_day", "watch", "domain", "alert", "start", "end"])
    out["minutes"] = (out.end - out.start) / 60000
    out = out[out.end - out.start >= min_bout_ms].reset_index(drop=True)
    return out


if __name__ == "__main__":
    df = load()
    assert len(df) > 0, "no events loaded — is the writer wired?"
    assert df["surface"].nunique() >= 1
    dt = domain_time(df)
    assert (dt["minutes"] >= 0).all(), "negative attributed time"
    bt = bouts(df)
    assert (bt["minutes"] > 0).all(), "non-positive bout"
    assert set(bt["alert"]) <= {"windowed", "observe", "other"}
    print(f"loaded {len(df):,} events · surfaces={sorted(df.surface.dropna().unique())} "
          f"· {df.focus_day.nunique()} focus-days")
    print(f"domain_time rows: {len(dt)} · bouts: {len(bt)} "
          f"(windowed={sum(bt.alert=='windowed')}, median={bt.minutes.median():.1f}m, "
          f"max={bt.minutes.max():.0f}m)")
