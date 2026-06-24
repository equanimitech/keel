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
                    "cwd": p.get("cwd"),
                    "tool": p.get("tool_name"),
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


def agent_bouts(df, gap_cap_ms: int = 5 * 60 * 1000, min_events: int = 2) -> pd.DataFrame:
    """Agent-surface deep-work bouts — the flood's grain (mirror of browser bouts()).

    A bout = a contiguous run of agent activity within one session with no gap >
    gap_cap_ms. Activity = the events that mark the model actually working
    (dispatching tools, completing them, taking a prompt). turn_stop /
    session_end are NOT activity — they mark the breakpoints between bouts.
    Columns: focus_day, watch, sessionId, cwd, start, end, n_events, n_prompts,
    n_tools, minutes. The long right tail of `minutes` is the flood.
    """
    ACT = {"tool_dispatched", "tool_completed", "tool_failed", "prompt", "subagent_stop"}
    a = df[(df["surface"] == "agent") & (df["kind"].isin(ACT))].sort_values(["sessionId", "ts"])
    rows = []

    def flush(seg):
        if len(seg) < min_events:
            return
        cwd = next((s.cwd for s in seg if s.cwd), None)
        rows.append({
            "focus_day": seg[0].focus_day, "watch": seg[0].watch, "sessionId": seg[0].sessionId,
            "cwd": cwd, "start": seg[0].ts, "end": seg[-1].ts, "n_events": len(seg),
            "n_prompts": sum(s.kind == "prompt" for s in seg),
            "n_tools": sum(s.kind in ("tool_dispatched", "tool_completed", "tool_failed") for s in seg),
        })

    for _sid, g in a.groupby("sessionId", sort=False):
        seg, prev = [], None
        for r in g.itertuples():
            if prev is not None and r.ts - prev > gap_cap_ms:
                flush(seg)
                seg = []
            seg.append(r)
            prev = r.ts
        flush(seg)
    out = pd.DataFrame(rows)
    if len(out):
        out["minutes"] = (out.end - out.start) / 60000
    return out


def agent_flood(df, gap_cap_ms: int = 5 * 60 * 1000, require_prompt: bool = True) -> pd.DataFrame:
    """Wall-clock deep-work flood — agent_bouts unioned across concurrent sessions.

    agent_bouts() segments *within* a session, so when several Claude sessions run
    at once their bouts overlap and summing double-counts wall-clock time (≈95% over
    the real total here). This unions overlapping/adjacent bouts on the wall clock so
    occupancy is counted once. "based on user messages": require_prompt drops merged
    intervals with no user `prompt` (autonomous/background sessions). `depth` = peak
    concurrent sessions = the *multitasking* axis, NOT pure intensity: high depth is
    the fragmentation the research flags (attention residue, ~23min recovery), unless
    the departed session keeps grinding autonomously (then it's leverage). `minutes` =
    wall-clock occupancy. Use THIS (not summed agent_bouts) for by-watch / by-hour /
    circadian baselines; read `depth` alongside the user-message switch-rate to tell
    solo-flow from stacked-juggle.
    Columns: focus_day, watch, start, end, minutes, depth, n_bouts, n_prompts.
    """
    ab = agent_bouts(df)
    if require_prompt:
        ab = ab[ab.n_prompts > 0]
    rows = []
    for day, g in ab.groupby("focus_day"):
        ivs = sorted(zip(g.start, g.end, g.n_prompts))
        groups, cur, ce = [], [ivs[0]], ivs[0][1]
        for s, e, p in ivs[1:]:
            if s <= ce + gap_cap_ms:
                cur.append((s, e, p)); ce = max(ce, e)
            else:
                groups.append(cur); cur, ce = [(s, e, p)], e
        groups.append(cur)
        for grp in groups:
            cs = grp[0][0]
            ge = max(e for _, e, _ in grp)
            pts = sorted([(s, 1) for s, _, _ in grp] + [(e, -1) for _, e, _ in grp])
            depth = mx = 0
            for _, v in pts:
                depth += v; mx = max(mx, depth)
            rows.append({"focus_day": day, "start": cs, "end": ge, "minutes": (ge - cs) / 60000,
                         "depth": mx, "n_bouts": len(grp), "n_prompts": sum(p for _, _, p in grp)})
    out = pd.DataFrame(rows)
    if len(out):
        mod = pd.to_datetime(out.start, unit="ms").dt.hour * 60 + pd.to_datetime(out.start, unit="ms").dt.minute
        out["watch"] = mod.map(_watch)
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
    ab = agent_bouts(df)
    assert (ab.minutes >= 0).all(), "negative agent bout"
    print(f"agent bouts: {len(ab)} (median={ab.minutes.median():.1f}m, "
          f"p90={ab.minutes.quantile(.9):.0f}m, max={ab.minutes.max():.0f}m, "
          f"flood>25m={sum(ab.minutes>25)})")
