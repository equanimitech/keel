# keel Watchlist-Seeding Bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `keel watchlist scan` — a one-time, on-demand cold-start bootstrap that reads Brave history, runs a local analytical lens battery, and (after the human adjudicates) seeds `config.json watchlist.observe` with `host+route` keys, persisting a verdict ledger + drift snapshot.

**Architecture:** Node command (`apps/agent/keel.mjs`) spawns a stdlib-only Python module (`apps/agent/watchlist_scan.py`) that reads a copy of the Brave history DB, filters to genuine navigations, classifies hosts, runs the lenses per `host+route`, and emits a ranked candidate slate as JSON. Node renders an adjudication TUI and writes `watchlist.observe` + `~/.keel/watchlist-ledger.json` + `~/.keel/watchlist-snapshot.json`. Machine ranks + evidences; human adjudicates; ledger remembers.

**Tech Stack:** Python 3.11 stdlib (`sqlite3`, `unittest`); Node ESM agent (`node --test`).

**Spec:** `docs/2026-06-13-watchlist-seeding-from-history-design.md` (committed). **Reference (throwaway):** `/tmp/keel_spike/analyze2.py`, `yt.py` carry validated lens logic — productionize, don't copy verbatim.

**Conventions:** Work on `main` (solo repo, no users — see memory `feedback_keel_implement_on_main`). COMMIT ONLY each task's files with explicit `git add <path>`, NEVER `-A`; do NOT touch `apps/tray/src-tauri/src/lib.rs` (unrelated uncommitted work). Python tests run with `cd apps/agent && python3 -m unittest <module>`.

---

## File Structure

**Create:**
- `apps/agent/watchlist_scan.py` — reader + classification + lens battery + slate builder + CLI (stdlib only).
- `apps/agent/test_watchlist_scan.py` — `unittest` suite (pure helpers, lenses, fixture-DB reader, slate).
- `apps/agent/watchlist-store.test.mjs` — `node --test` for the Node store/merge helpers.

**Modify:**
- `apps/agent/store.mjs` — add ledger/snapshot load+save and `writeObserveList` (atomic config update).
- `apps/agent/core.mjs` — add pure `applyObserveVerdicts` / `mergeLedger` / `buildSnapshot` helpers.
- `apps/agent/keel.mjs` — dispatch `watchlist scan`; implement `cmdWatchlistScan` (spawn Python, adjudication TUI, write).

---

## Task 1: Python pure helpers — host/route classification

**Files:** Create `apps/agent/watchlist_scan.py`, `apps/agent/test_watchlist_scan.py`.

- [ ] **Step 1: Write the failing test `apps/agent/test_watchlist_scan.py`:**

```python
import unittest
from watchlist_scan import genuine_nav, normalize_host, classify_host, normalize_route, ROUTE_REGISTRY

class TestHelpers(unittest.TestCase):
    def test_genuine_nav_drops_reload_subframe_redirect(self):
        self.assertTrue(genuine_nav(0))      # LINK
        self.assertTrue(genuine_nav(1))      # TYPED
        self.assertFalse(genuine_nav(8))     # RELOAD
        self.assertFalse(genuine_nav(3))     # AUTO_SUBFRAME
        self.assertFalse(genuine_nav(0x40000000))  # CLIENT_REDIRECT qualifier
        self.assertFalse(genuine_nav(0x80000000))  # SERVER_REDIRECT qualifier

    def test_normalize_host_strips_www_and_collapses_families(self):
        self.assertEqual(normalize_host("https://www.youtube.com/watch?v=x"), "youtube.com")
        self.assertEqual(normalize_host("https://m.youtube.com/x"), "youtube.com")
        self.assertEqual(normalize_host("https://youtu.be/abc"), "youtube.com")
        self.assertEqual(normalize_host("https://fr.linkedin.com/feed"), "linkedin.com")
        self.assertIsNone(normalize_host("chrome://extensions"))

    def test_classify_host(self):
        self.assertEqual(classify_host("github.com"), "work")
        self.assertEqual(classify_host("localhost:3000"), "work")
        self.assertEqual(classify_host("clerk.themia.pro"), "infra")
        self.assertEqual(classify_host("nhgfgpkpdcfmlcodnebehcljdnlfpamo"), "infra")  # no dot → ext id
        self.assertEqual(classify_host("youtube.com"), "residual")

    def test_normalize_route(self):
        self.assertEqual(normalize_route("youtube.com", "/shorts/abc"), "/shorts")
        self.assertEqual(normalize_route("youtube.com", "/watch"), "/watch")
        self.assertIsNone(normalize_route("youtube.com", "/"))
        self.assertIsNone(normalize_route("youtube.com", "/@creator"))   # privacy: no handles
        self.assertIsNone(normalize_route("github.com", "/acme/keel"))   # off-registry

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run, confirm FAIL.** `cd apps/agent && python3 -m unittest test_watchlist_scan` → ImportError.

- [ ] **Step 3: Implement the helpers in `apps/agent/watchlist_scan.py`:**

```python
#!/usr/bin/env python3
"""keel watchlist scan — cold-start seeding of the observe tier from Brave history.

Stdlib only. Reads a COPY of the Brave history DB (read-only, never the live file),
filters to genuine navigations, classifies hosts, runs a lens battery per host+route,
and emits a ranked candidate slate as JSON on stdout. The Node command adjudicates.

See docs/2026-06-13-watchlist-seeding-from-history-design.md.
"""
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
```

- [ ] **Step 4: Run, confirm PASS** (5 tests). `cd apps/agent && python3 -m unittest test_watchlist_scan`

- [ ] **Step 5: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/watchlist_scan.py apps/agent/test_watchlist_scan.py
git commit -m "feat(agent): watchlist scan host/route classification helpers"
```

---

## Task 2: Python lens functions

**Files:** Modify `apps/agent/watchlist_scan.py`, `apps/agent/test_watchlist_scan.py`.

- [ ] **Step 1: Append tests:**

```python
from watchlist_scan import quick_return_rate, binge_runs, drift_ratio

class TestLenses(unittest.TestCase):
    def test_quick_return_rate(self):
        # gaps: 60s (quick), 5s (too fast, reload-ish), 1200s (too slow)
        ts = [0, 60, 65, 1265]
        self.assertAlmostEqual(quick_return_rate(ts), 1 / 3)
        self.assertEqual(quick_return_rate([0]), 0.0)  # <2 visits → 0

    def test_binge_runs(self):
        # two runs within 300s gap: [0,100,200] and [1000,1100]; singleton 5000
        ts = [0, 100, 200, 1000, 1100, 5000]
        stats = binge_runs(ts, gap=300)
        self.assertEqual(stats["runs"], 2)
        self.assertEqual(stats["max_run"], 3)
        self.assertEqual(stats["median_run"], 2)  # runs of length 3 and 2 → median 2 (floor of 2.5)
        self.assertEqual(stats["pct_in_runs_5plus"], 0)

    def test_drift_ratio(self):
        now = 100 * 86400
        cut = now - 14 * 86400
        recent = [cut + i * 86400 for i in range(5)]   # 5 in last 14d
        prior = [cut - i * 86400 for i in range(1, 29)] # 28 over prior ~28d
        r = drift_ratio(recent + prior, now)
        self.assertGreater(r["recent_per_day"], 0)
        self.assertFalse(r["is_new"])
        self.assertTrue(drift_ratio([cut + 1, cut + 2], now)["is_new"])  # no prior → NEW
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement (append to `watchlist_scan.py`):**

```python
import statistics

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
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/watchlist_scan.py apps/agent/test_watchlist_scan.py
git commit -m "feat(agent): watchlist scan lens functions (compulsion/binge/drift)"
```

---

## Task 3: Python reader + per-key aggregation (fixture DB)

**Files:** Modify `apps/agent/watchlist_scan.py`, `apps/agent/test_watchlist_scan.py`.

- [ ] **Step 1: Append a test that builds a synthetic Chromium-shaped history DB and aggregates it:**

```python
import sqlite3, tempfile, os
from watchlist_scan import aggregate_keys

EPOCH = 11644473600
def _chrome_us(unix): return int((unix + EPOCH) * 1_000_000)

def _make_db(path, rows):
    """rows: list of (url, unix_ts, duration_us, transition)."""
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT)")
    con.execute("CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, "
                "from_visit INTEGER, visit_duration INTEGER, transition INTEGER)")
    url_ids = {}
    for i, (url, ts, dur, tr) in enumerate(rows, 1):
        uid = url_ids.setdefault(url, len(url_ids) + 1)
        con.execute("INSERT OR IGNORE INTO urls VALUES (?,?)", (uid, url))
        con.execute("INSERT INTO visits VALUES (?,?,?,?,?,?)", (i, uid, _chrome_us(ts), 0, dur, tr))
    con.commit(); con.close()

class TestReader(unittest.TestCase):
    def test_aggregate_keys_filters_and_buckets(self):
        d = tempfile.mkdtemp()
        db = os.path.join(d, "History.db")
        _make_db(db, [
            ("https://youtube.com/shorts/a", 1000, 30_000_000, 0),   # genuine, residual, /shorts
            ("https://youtube.com/shorts/b", 1100, 30_000_000, 0),   # genuine
            ("https://youtube.com/shorts/c", 9000, 30_000_000, 8),   # RELOAD → dropped
            ("https://github.com/x", 1200, 60_000_000, 0),           # work → excluded from residual
            ("https://clerk.themia.pro/x", 1300, 1_000_000, 0),      # infra → excluded
        ])
        keys = aggregate_keys(db, now=20000, ledger={})
        self.assertIn("youtube.com/shorts", keys)
        rec = keys["youtube.com/shorts"]
        self.assertEqual(rec["visits"], 2)            # reload dropped
        self.assertEqual(rec["host"], "youtube.com")
        self.assertEqual(rec["route"], "/shorts")
        self.assertNotIn("github.com", keys)          # work excluded
        self.assertFalse(any(k.startswith("clerk") for k in keys))
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `aggregate_keys` (append to `watchlist_scan.py`):**

```python
import shutil

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
    con = sqlite3.connect(f"file:{db_path}?mode=ro&immutable=1", uri=True)
    rows = con.execute("SELECT v.visit_time, v.visit_duration, v.transition, u.url "
                       "FROM visits v JOIN urls u ON u.id = v.url").fetchall()
    con.close()
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
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/watchlist_scan.py apps/agent/test_watchlist_scan.py
git commit -m "feat(agent): watchlist scan reader + per-key aggregation"
```

---

## Task 4: Python slate builder + JSON contract

**Files:** Modify `apps/agent/watchlist_scan.py`, `apps/agent/test_watchlist_scan.py`.

- [ ] **Step 1: Append a test:**

```python
from watchlist_scan import build_slate

class TestSlate(unittest.TestCase):
    def test_build_slate_ranks_and_shapes(self):
        keys = {
            "youtube.com/shorts": {"host": "youtube.com", "route": "/shorts", "visits": 800,
                "dwell": 26.3 * 3600, "timestamps": [i * 60 for i in range(800)], "first_seen": 0},
            "youtube.com/watch": {"host": "youtube.com", "route": "/watch", "visits": 1000,
                "dwell": 546 * 3600, "timestamps": [i * 4000 for i in range(1000)], "first_seen": 0},
        }
        slate = build_slate(keys, now=800 * 60, snapshot={})
        self.assertIn("candidates", slate)
        c0 = slate["candidates"][0]
        for f in ("key", "host", "route", "scores", "evidence", "suggested_tier"):
            self.assertIn(f, c0)
        # /shorts must outrank /watch on binge despite far less dwell
        shorts = next(c for c in slate["candidates"] if c["key"] == "youtube.com/shorts")
        watch = next(c for c in slate["candidates"] if c["key"] == "youtube.com/watch")
        self.assertGreater(shorts["scores"]["binge"], watch["scores"]["binge"])
        self.assertEqual(c0["suggested_tier"], "observe")
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `build_slate` (append):**

```python
def _percentiles(values_by_key):
    """Map each key's value to its rank-percentile in [0,1]."""
    order = sorted(values_by_key.items(), key=lambda kv: kv[1])
    n = len(order) or 1
    return {k: i / n for i, (k, _) in enumerate(order)}

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
```
(Note: `first_seen` is emitted as None here to keep the contract field present; wiring the real value is a one-line follow-up — set it from `r["first_seen"]` converted to an ISO date. Keep it simple/typed for now and note it.)

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/watchlist_scan.py apps/agent/test_watchlist_scan.py
git commit -m "feat(agent): watchlist scan slate builder + composite ranking"
```

---

## Task 5: Python CLI entry (stdout JSON)

**Files:** Modify `apps/agent/watchlist_scan.py`.

Integration (no unit test; the pure pieces are covered). Verified by a manual run against the real Brave DB.

- [ ] **Step 1: Append a CLI entry to `watchlist_scan.py`:**

```python
import argparse, json, sys, tempfile, time

DEFAULT_BRAVE = os.path.join(os.path.expanduser("~"),
    "Library/Application Support/BraveSoftware/Brave-Browser/Default/History")

def main():
    ap = argparse.ArgumentParser(description="keel watchlist scan — emit candidate slate JSON")
    ap.add_argument("--history", default=DEFAULT_BRAVE, help="path to Brave History DB")
    ap.add_argument("--ledger", default="", help="path to watchlist-ledger.json (verdicts to subtract)")
    ap.add_argument("--snapshot", default="", help="path to watchlist-snapshot.json (for is_new)")
    args = ap.parse_args()

    ledger = {}
    if args.ledger and os.path.exists(args.ledger):
        try: ledger = json.load(open(args.ledger))
        except Exception: ledger = {}
    snapshot = {}
    if args.snapshot and os.path.exists(args.snapshot):
        try: snapshot = json.load(open(args.snapshot))
        except Exception: snapshot = {}

    if not os.path.exists(args.history):
        json.dump({"error": "history not found", "path": args.history}, sys.stdout)
        return
    with tempfile.TemporaryDirectory() as tmp:
        try:
            db = copy_history(args.history, tmp)
        except Exception as e:
            json.dump({"error": "copy failed", "detail": str(e)}, sys.stdout)
            return
        keys = aggregate_keys(db, now=int(time.time()), ledger=ledger)
    slate = build_slate(keys, now=int(time.time()), snapshot=snapshot)
    # snapshot for next run: per-key visit counts
    slate["_snapshot"] = {k: r["visits"] for k, r in keys.items()}
    json.dump(slate, sys.stdout)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Manual smoke against the real Brave DB:**
```bash
cd /Users/operator/Developer/equanimitech/keel/apps/agent
python3 watchlist_scan.py | python3 -m json.tool | head -40
```
Expected: a JSON slate with `candidates` (youtube.com/shorts, netflix.com, linkedin.com, etc.) ranked, each with `scores`/`evidence`/`suggested_tier`, plus `_snapshot`. Confirm work/infra hosts (github, clerk) are absent. Capture the top ~5 keys.

- [ ] **Step 3: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/watchlist_scan.py
git commit -m "feat(agent): watchlist scan CLI entry (emit slate JSON)"
```

---

## Task 6: Node store + merge helpers

**Files:** Modify `apps/agent/store.mjs`, `apps/agent/core.mjs`; Create `apps/agent/watchlist-store.test.mjs`.

- [ ] **Step 1: Write the failing test `apps/agent/watchlist-store.test.mjs`:**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyObserveVerdicts, mergeLedger } from "./core.mjs";

test("applyObserveVerdicts adds observe-tier hosts to the existing list, deduped", () => {
  const next = applyObserveVerdicts(["youtube.com"], {
    "youtube.com/shorts": "observe", "netflix.com": "observe", "renfe.com": "benign",
  });
  assert.deepEqual([...next].sort(), ["netflix.com", "youtube.com", "youtube.com/shorts"].sort());
});

test("mergeLedger records every verdict keyed by host+route", () => {
  const led = mergeLedger({ "old.com": "benign" }, { "netflix.com": "observe", "renfe.com": "benign" });
  assert.equal(led["old.com"], "benign");
  assert.equal(led["netflix.com"], "observe");
  assert.equal(led["renfe.com"], "benign");
});
```

- [ ] **Step 2: Run, confirm FAIL.** `node --test apps/agent/watchlist-store.test.mjs`

- [ ] **Step 3: Implement in `apps/agent/core.mjs`:**

```js
/** Apply adjudication verdicts → the new observe list. Only `observe` verdicts
 * enter the list; benign/work do not. Existing entries are preserved; deduped. */
export function applyObserveVerdicts(currentObserve, verdicts) {
  const set = new Set(currentObserve);
  for (const [key, verdict] of Object.entries(verdicts)) {
    if (verdict === "observe") set.add(key);
  }
  return [...set];
}

/** Merge new verdicts into the ledger (append/overwrite by key). */
export function mergeLedger(ledger, verdicts) {
  return { ...ledger, ...verdicts };
}
```

- [ ] **Step 4: Implement in `apps/agent/store.mjs`** (file I/O; add near the other loaders, reuse `writeJsonAtomic`, `KEEL_DIR`, `readFileSync`):

```js
const LEDGER_PATH = join(KEEL_DIR, "watchlist-ledger.json");
const SNAPSHOT_PATH = join(KEEL_DIR, "watchlist-snapshot.json");

export function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER_PATH, "utf8")); } catch { return {}; }
}
export function saveLedger(led) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(LEDGER_PATH, led);
}
export function loadSnapshot() {
  try { return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")); } catch { return {}; }
}
export function saveSnapshot(snap) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(SNAPSHOT_PATH, snap);
}
export { LEDGER_PATH, SNAPSHOT_PATH };

/** Atomically set watchlist.observe in config.json, preserving everything else. */
export function writeObserveList(observe) {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { cfg = {}; }
  cfg.watchlist = cfg.watchlist || {};
  cfg.watchlist.observe = observe;
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(CONFIG_PATH, cfg);
}
```
(Note: `CONFIG_PATH` is a module const in store.mjs — confirm it's accessible; it is, defined at top.)

- [ ] **Step 5: Run the test (PASS), full agent suite + typecheck:**
`node --test apps/agent/watchlist-store.test.mjs && pnpm --filter @keel/agent test && pnpm --filter @keel/agent run typecheck`

- [ ] **Step 6: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/core.mjs apps/agent/store.mjs apps/agent/watchlist-store.test.mjs
git commit -m "feat(agent): watchlist ledger/snapshot store + observe-list writer + verdict merge"
```

---

## Task 7: `keel watchlist scan` command + adjudication TUI

**Files:** Modify `apps/agent/keel.mjs`.

Integration: spawn Python, render a readline TUI, write outputs. Verified manually (interactive).

- [ ] **Step 1: Implement `cmdWatchlistScan` and dispatch in `apps/agent/keel.mjs`.**

Add imports (merge with existing): from `./store.mjs` add `loadLedger, saveLedger, loadSnapshot, saveSnapshot, writeObserveList, loadWatchlist, LEDGER_PATH, SNAPSHOT_PATH, KEEL_DIR`; from `./core.mjs` add `applyObserveVerdicts, mergeLedger`; add `import { spawnSync } from "node:child_process"; import { createInterface } from "node:readline"; import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";`.

Add the command (place the function near the other `cmd*` functions):

```js
async function cmdWatchlistScan() {
  const here = dirname(fileURLToPath(import.meta.url));
  const py = spawnSync("python3", [
    join(here, "watchlist_scan.py"),
    "--ledger", LEDGER_PATH,
    "--snapshot", SNAPSHOT_PATH,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (py.status !== 0 || !py.stdout) {
    console.error("scan failed:", py.stderr || "(no output)");
    process.exit(0); // fail-open
  }
  let slate;
  try { slate = JSON.parse(py.stdout); } catch { console.error("bad slate JSON"); process.exit(0); }
  if (slate.error) { console.error("scan:", slate.error, slate.path || slate.detail || ""); process.exit(0); }
  const candidates = slate.candidates || [];
  if (candidates.length === 0) { console.log("No new candidates. Observe tier is current."); process.exit(0); }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  const verdicts = {};
  console.log(`\nkeel watchlist scan — ${candidates.length} candidates. ` +
    `[o]bserve · [b]enign(never-ask) · [w]ork · [s]kip · [q]uit\n`);
  for (const c of candidates) {
    const e = c.evidence;
    const binge = e.binge ? `binge ${e.binge.max_run}max/${e.binge.pct_in_runs_5plus}%in5+` : "";
    const line = `${c.key}\n  ${e.dwell_hours}h · ${e.visits} visits · return ${e.return_pct}% · ${binge}` +
      `${e.is_new ? " · NEW" : ""}\n  suggested: ${c.suggested_tier}  → [o/b/w/s/q]? `;
    const a = (await ask(line)).trim().toLowerCase()[0];
    if (a === "q") break;
    if (a === "o") verdicts[c.key] = "observe";
    else if (a === "b") verdicts[c.key] = "benign";
    else if (a === "w") verdicts[c.key] = "work";
    // s/skip → no verdict recorded
  }
  rl.close();

  const observe = applyObserveVerdicts(loadWatchlist().observe, verdicts);
  writeObserveList(observe);
  saveLedger(mergeLedger(loadLedger(), verdicts));
  if (slate._snapshot) saveSnapshot(slate._snapshot);
  const added = Object.values(verdicts).filter((v) => v === "observe").length;
  console.log(`\nDone. ${added} key(s) added to watchlist.observe (${observe.length} total). Ledger + snapshot updated.`);
  process.exit(0);
}
```

In `main()`, add the dispatch alongside the other `if (cmd === ...)` lines:
```js
  if (cmd === "watchlist" && sub === "scan") return cmdWatchlistScan();
```

- [ ] **Step 2: Typecheck clean:** `pnpm --filter @keel/agent run typecheck` (keel.mjs is in the typecheck set). Fix any JSDoc/type issues; prefer correct annotations over `@ts-ignore`.

- [ ] **Step 3: Manual end-to-end run:**
```bash
cd /Users/operator/Developer/equanimitech/keel
node apps/agent/keel.mjs watchlist scan
```
Adjudicate a couple of candidates (`o`/`b`/`s`), then verify:
- `~/.keel/config.json` `watchlist.observe` gained the `o`-marked keys (and nothing else changed).
- `~/.keel/watchlist-ledger.json` records every verdict.
- `~/.keel/watchlist-snapshot.json` written.
Then re-run and confirm `benign`-marked keys do NOT reappear (ledger suppression works — the drift/quiet-rescan property).

- [ ] **Step 4: Commit:**
```bash
cd /Users/operator/Developer/equanimitech/keel
git add apps/agent/keel.mjs
git commit -m "feat(agent): keel watchlist scan command + adjudication TUI"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** reader+filter+classify+route (Tasks 1,3); lens battery time/compulsion/binge/drift (Tasks 2,4) — circadian `window_hint` is left null/deferred (the spec marks it "window-tuning only, off the score"; wire it in a follow-up if wanted); slate JSON contract (Task 4); ledger/snapshot/observe-write (Task 6); on-demand command + adjudication + quiet-rescan (Task 7). Drift `is_new` via snapshot (Tasks 4,5,7).
- **Deferred (noted, not blocking):** `evidence.first_seen` emitted as null (one-line follow-up); `window_hint` from circadian aggregate; `p5_intervention_prior` tag; route-discovery beyond the seed registry (spec P2 open question).
- **Route registry duplication:** `ROUTE_REGISTRY` is mirrored in Python from `packages/domain/src/route.ts`; Task 1's test pins the entries. DRY-via-shared-JSON is a deferred refactor (spec open question).
- **Privacy:** the bootstrap reads full paths but emits only normalized routes + aggregates; `/@handle` is dropped (Task 1); raw URLs never persist.
- **Fail-open:** the command exits 0 on any scan/parse failure (it must never trap the user); writes are atomic (`writeJsonAtomic`).
