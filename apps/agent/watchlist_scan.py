#!/usr/bin/env python3
"""keel watchlist scan — cold-start seeding of the observe tier from Brave history.

Stdlib only. Reads a COPY of the Brave history DB (read-only, never the live file),
filters to genuine navigations, classifies hosts, runs a lens battery per host+route,
and emits a ranked candidate slate as JSON on stdout. The Node command adjudicates.

See docs/2026-06-13-watchlist-seeding-from-history-design.md.
"""
import statistics
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
