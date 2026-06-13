#!/usr/bin/env python3
"""keel watchlist scan — cold-start seeding of the observe tier from Brave history.

Stdlib only. Reads a COPY of the Brave history DB (read-only, never the live file),
filters to genuine navigations, classifies hosts, runs a lens battery per host+route,
and emits a ranked candidate slate as JSON on stdout. The Node command adjudicates.

See docs/2026-06-13-watchlist-seeding-from-history-design.md.
"""
import os
import shutil
import sqlite3
import statistics
from contextlib import closing
from urllib.parse import urlsplit

# MUST mirror packages/domain/src/route.ts ROUTE_REGISTRY (test pins the entries).
ROUTE_REGISTRY = {
    "youtube.com": ["/shorts", "/watch", "/feed", "/results"],
    "linkedin.com": ["/feed", "/messaging", "/jobs"],
}
_FAMILY = {
    "m.youtube.com": "youtube.com", "music.youtube.com": "youtube.com", "youtu.be": "youtube.com",
    "fr.linkedin.com": "linkedin.com", "old.reddit.com": "reddit.com", "np.reddit.com": "reddit.com",
}
_WORK = ("themia.pro", "github.com", "vercel.com", "railway.app", "railway.com", "elastic-cloud.com",
         "elastic.co", "posthog.com", "anthropic.com", "claude.com", "claude.ai", "notion.com",
         "notion.so", "neon.tech", "supabase.com", "linear.app", "sentry.io", "stripe.com",
         "svix.com", "betterstack.com", "knock.app", "resend.com", "resend-links.com", "prefect",
         "up.railway.app", "openai.com")
_INFRA = ("clerk.", "oauth.", "accounts.", "login.", "idp.", "auth.", "gstatic", "googleapis",
          "cdn.", "clerk.accounts.dev")

def genuine_nav(transition):
    core = transition & 0xFF
    if core in (3, 4, 8):          # subframe, reload
        return False
    if transition & 0xC0000000:    # client/server redirect qualifier
        return False
    return True

def normalize_host(url):
    try:
        h = urlsplit(url).netloc.lower()
    except Exception:
        return None
    if not h or not (url.startswith("http://") or url.startswith("https://")):
        return None
    if h.startswith("www."):
        h = h[4:]
    return _FAMILY.get(h, h)

def classify_host(host):
    base = host.split(":")[0]
    if "." not in base:                       # extension ids, bare hosts
        return "work" if base.startswith("localhost") else "infra"
    if base.startswith("localhost") or base == "127.0.0.1":
        return "work"
    if any(k in host for k in _INFRA):
        return "infra"
    if any(host.endswith(w) or w in host for w in _WORK):
        return "work"
    return "residual"

def normalize_route(host, pathname):
    prefixes = ROUTE_REGISTRY.get(host)
    if prefixes is None:
        return None
    clean = pathname.split("?", 1)[0].split("#", 1)[0]
    for prefix in prefixes:
        if clean == prefix or clean.startswith(prefix + "/"):
            return prefix
    seg = [s for s in clean.split("/") if s]
    if not seg or seg[0].startswith("@"):     # privacy: drop user-identifying handles
        return None
    return "/" + seg[0]


def quick_return_rate(timestamps):
    """Fraction of consecutive inter-visit gaps in [30s, 600s] — the compulsion shape."""
    ts = sorted(timestamps)
    gaps = [b - a for a, b in zip(ts, ts[1:])]
    if not gaps:
        return 0.0
    quick = sum(1 for g in gaps if 30 <= g <= 600)
    return quick / len(gaps)

def binge_runs(timestamps, gap=300):
    """Consecutive-visit runs within `gap` seconds. The route-level discriminator."""
    ts = sorted(timestamps)
    runs, cur = [], 1
    for a, b in zip(ts, ts[1:]):
        if b - a <= gap:
            cur += 1
        else:
            runs.append(cur)
            cur = 1
    runs.append(cur)
    multi = [r for r in runs if r > 1]
    in5 = sum(r for r in runs if r >= 5)
    total = sum(runs) or 1
    return {
        "runs": len(multi),
        "median_run": int(statistics.median(multi)) if multi else 0,
        "max_run": max(runs) if runs else 0,
        "pct_in_runs_5plus": round(100 * in5 / total),
    }

def drift_ratio(timestamps, now, window_days=14):
    ts = sorted(timestamps)
    cut = now - window_days * 86400
    recent = [t for t in ts if t >= cut]
    prior = [t for t in ts if t < cut]
    prior_days = max(1, (cut - ts[0]) / 86400) if ts else 1
    recent_per_day = len(recent) / window_days
    prior_per_day = len(prior) / prior_days if prior else 0.0
    ratio = (recent_per_day / prior_per_day) if prior_per_day > 0 else float("inf")
    return {"recent_per_day": recent_per_day, "prior_per_day": prior_per_day,
            "ratio": ratio, "is_new": len(prior) == 0, "recent": len(recent)}


CHROME_EPOCH = 11644473600
def _to_unix(us): return us / 1_000_000 - CHROME_EPOCH

def copy_history(src, dest_dir):
    """Copy the (possibly locked) live DB + WAL/SHM into dest_dir; return the copy path."""
    dest = os.path.join(dest_dir, "History.db")
    shutil.copy(src, dest)
    for ext in ("-wal", "-shm"):
        if os.path.exists(src + ext):
            shutil.copy(src + ext, dest + ext)
    return dest

def aggregate_keys(db_path, now, ledger):
    """Read genuine residual navigations, bucket per host+route. ledger keys (benign/work)
    are subtracted. Returns { key: {host, route, visits, dwell, timestamps, first_seen} }."""
    with closing(sqlite3.connect(f"file:{db_path}?mode=ro&immutable=1", uri=True)) as con:
        rows = con.execute("SELECT v.visit_time, v.visit_duration, v.transition, u.url "
                           "FROM visits v JOIN urls u ON u.id = v.url").fetchall()
    keys = {}
    suppressed = {k for k, v in ledger.items() if v in ("benign", "work")}
    for vt, dur, tr, url in rows:
        if not genuine_nav(tr):
            continue
        host = normalize_host(url)
        if host is None or classify_host(host) != "residual":
            continue
        path = urlsplit(url).path
        route = normalize_route(host, path)
        key = host + route if route else host
        if key in suppressed:
            continue
        rec = keys.setdefault(key, {"host": host, "route": route, "visits": 0,
                                    "dwell": 0.0, "timestamps": [], "first_seen": None})
        rec["visits"] += 1
        rec["dwell"] += (dur or 0) / 1_000_000
        rec["timestamps"].append(_to_unix(vt))
    for rec in keys.values():
        rec["first_seen"] = min(rec["timestamps"]) if rec["timestamps"] else None
    return keys


def _percentiles(values_by_key):
    """Map each key's value to its rank-percentile in [0,1] (top → 1.0, bottom → 0.0)."""
    order = sorted(values_by_key.items(), key=lambda kv: kv[1])
    n = len(order)
    if n <= 1:
        return {k: 1.0 for k, _ in order}  # a single candidate is trivially top-ranked
    return {k: i / (n - 1) for i, (k, _) in enumerate(order)}

def build_slate(keys, now, snapshot, min_visits=12):
    ranked = {k: r for k, r in keys.items() if r["visits"] >= min_visits}
    if not ranked:
        return {"candidates": [], "window_hint": None}
    p_time = _percentiles({k: r["dwell"] for k, r in ranked.items()})
    p_comp = _percentiles({k: quick_return_rate(r["timestamps"]) for k, r in ranked.items()})
    p_binge = _percentiles({k: binge_runs(r["timestamps"])["pct_in_runs_5plus"] for k, r in ranked.items()})
    p_drift = _percentiles({k: drift_ratio(r["timestamps"], now)["recent"] for k, r in ranked.items()})
    candidates = []
    for k, r in ranked.items():
        binge = binge_runs(r["timestamps"])
        drift = drift_ratio(r["timestamps"], now)
        scores = {"time": round(p_time[k], 2), "compulsion": round(p_comp[k], 2),
                  "binge": round(p_binge[k], 2), "drift": round(p_drift[k], 2)}
        composite = 0.40 * scores["time"] + 0.25 * scores["compulsion"] + 0.25 * scores["binge"] + 0.10 * scores["drift"]
        candidates.append({
            "key": k, "host": r["host"], "route": r["route"], "_composite": composite,
            "scores": scores,
            "evidence": {"dwell_hours": round(r["dwell"] / 3600, 1), "visits": r["visits"],
                         "return_pct": round(quick_return_rate(r["timestamps"]) * 100),
                         "binge": binge, "drift_ratio": (None if drift["ratio"] == float("inf") else round(drift["ratio"], 1)),
                         "first_seen": None, "is_new": k not in snapshot},
            "suggested_tier": "observe",
        })
    candidates.sort(key=lambda c: -c["_composite"])
    for c in candidates:
        del c["_composite"]
    return {"candidates": candidates, "window_hint": None}
