# keel — cold-start seeding of the observe tier from browser history

**Date:** 2026-06-13
**Status:** Design (spike-validated). `equanimitech` is not under git here — written, not committed.
**Spike artifacts:** `/tmp/keel_spike/analyze.py`, `analyze2.py`, `yt.py` (throwaway, read-only over a copy of Brave history).

> **Reframed twice during design.** (1) From "build a blocklist" → a battery of local analytical lenses. (2) From "agent mines SQLite as the feature" → **the browser is the observer; history-read is a cold-start bootstrap; the relay is the missing keystone.** This doc reflects the corrected shape.

## Alignment with the observability-first roadmap

The 2026-06-12 stamped decision *"Retire the intervention layer"* removed all 9 browser shields + 2 signals; keel is now in a deliberate **observe-only baseline window** (interventions return at P5 as baseline-relative JITAI decision rules). So this feature does **not** produce *block* recommendations. Its job is to **seed the observe tier** — *what to deep-sense* — so the baseline accumulates from richer data sooner. Enforcement is an explicit **P5 non-goal** here (forward-pointer kept at the end).

The same decision **freezes `apps/desktop`** ("sole consumer of relocated `UIPresentation`, frozen"); **`apps/tray`** (Tauri menubar observability writer, roadmap slice B) is the go-forward desktop surface. This design targets `agent` + `browser` + `tray`, not the frozen `desktop`.

## Problem

`~/.keel/config.json` `watchlist.observe` (the domains the browser deep-senses) is hand-maintained and starts blank. Cold start: on day one the observer is blind to everything except what you manually typed, so the baseline begins impoverished. **Goal:** seed `observe` from revealed behavior (browser history) without betraying keel's sovereign, non-surveilling DNA — then let the live observer keep it fresh.

## DNA constraints (non-negotiable)

- **Sovereign, not clock-driven.** User triggers the scan. No background reader, no standing access.
- **Propose, never impose.** The scan surfaces ranked candidates with evidence; the human adjudicates; nothing is auto-applied.
- **Local-first, data-minimizing.** Analysis is local math. Raw browsing **never leaves the browser** (it already lives in extension IndexedDB, capped + pruned, no network). The bootstrap reads history once and emits only *derived candidates*; only aggregates + verdicts persist.

## Decisions (conclusions of the design journey)

1. **Posture: on-demand** `keel watchlist scan`. No daemon.
2. **Engine: a battery of local analytical lenses** over the history (not LLM hostname-classification). Spike on real Brave data (90 d, 40,867 visits) validated the signal and set the lens roster (below).
3. **Locus: the browser is the natural observer.** It already runs an activity writer (domain events + observe-tier DOM sensors) with a deliberate privacy gradient (domain-only coarse; deep-sense only consented observe-tier domains; route known *from the DOM*, never path-mined). The steady-state lens battery belongs there.
4. **History-read = cold-start bootstrap only.** The one justified full-path read, run once, to seed `observe` so day-one sensors aren't blind. **Relay-independent → ships now.** Not the backbone.
5. **The relay is the keystone — and unbuilt.** Today browser events are siloed in IndexedDB ("until the relay exists"; `writer.ts`, `manage/main.ts`), and `config.json watchlist.observe` is *manually mirrored* into the extension. The relay (browser ⇄ tray/agent) unblocks browser-native steady-state and the whole substrate. **Separate spec, designed next.**
6. **Synthesis: machine ranks + evidences; human adjudicates; ledger remembers.** No auto-bucketing. The work-allowlist *learns itself* from `benign`/`work` verdicts — the hardcoded list need not be perfect. First scan noisy; every scan after quiet.
7. **Unit = `host + route`.** `youtube.com/shorts` and `youtube.com/watch` are opposite behaviors (evidence below); the watchlist and the lenses operate at route granularity. This matches stamped doctrine (the retirement eulogy: the compulsion unit is the *in-page mechanic* — scroll loop, feed, rematch — not the host).

## Architecture (corrected)

```
COLD START (P1, relay-independent, ships now)
  keel watchlist scan            (Node — apps/agent)
    ├─ spawn → watchlist_scan.py  (Python — read history copy + lens battery → JSON candidate slate)
    ├─ render adjudication TUI
    └─ write:  ~/.keel/config.json   watchlist.observe   (accepted: host + route to deep-sense)
               ~/.keel/watchlist-ledger.json              (verdicts: observe/benign/work, keyed host+route)
               ~/.keel/watchlist-snapshot.json            (per-key counts, for drift on rescans)

STEADY STATE (P2, needs the relay)
  browser activity writer  →  [RELAY]  →  tray/agent  →  ~/.keel/log/*.jsonl  (shared substrate)
  tray/agent  →  [RELAY]  →  browser   (push confirmed observe list, retire the manual sync)
```

Node owns command/UX/config/sovereignty; Python owns DB read + math (sqlite3 stdlib; numpy optional). Boundary = the slate JSON. Rationale: `~/.keel` already runs Python; the spike proved stdlib-only suffices.

## Components

1. **Reader** (`watchlist_scan.py`, P1) — copy Brave `History` (+ `-wal`/`-shm`) to temp (avoid live lock); open `?mode=ro&immutable=1`. Join `visits → urls`. **`transition` genuine-nav filter** (drop reload core 8, subframes 3/4, redirects `& 0xC0000000` — this strips auth bounces + dev reload-loops). Normalize host (strip `www.`, collapse families). **Route classification** from a small seed registry (`youtube/shorts`, `youtube/watch`, `linkedin/feed`). Classify `work | infra | residual`; subtract ledger-known `benign`/`work`. (P2: Safari via Full Disk Access.)
2. **Lens battery** (residual, genuine navs, per `host+route`):
   - **time-cost** — Σ `visit_duration` (host-level; falls back to visit-count when dwell = 0).
   - **compulsion** — inter-visit quick-return rate (gaps 30 s–10 min).
   - **binge-run** — consecutive visits within ≤5 min → run-length distribution. *The route-level discriminator time-cost misses.*
   - **drift** — last-14d rate vs prior baseline; NEW-since-first-seen (powers rescans).
   - **circadian (aggregate only)** — hour histogram → informs the *surviving commitment-device* windows (drogue/keel-gate) + baseline. **Off the candidate score** (nocturnal confound, below).
3. **Slate builder** — rank residual keys by composite **{time, compulsion, binge, drift}** (not circadian). Attach evidence (dwell h, return %, binge stats, drift ratio, first-seen, visits, `is_new`) + a `p5_intervention_prior` tag where the route maps to a retired-winner mechanic (forward-pointer, not acted on).
4. **Adjudication UX** (Node) — present the ranked slate; per candidate keypress → `observe | benign(never-ask) | work(allowlist)`. Signal pre-fills a suggestion; nothing applied without the keypress.
5. **Ledger** — append-only, keyed by `host+route`; read at the start of each scan to suppress `benign`/`work` and grow the allowlist. Makes scan N+1 quiet.
6. **Snapshot** — per-key counts; diffed next scan for drift + `is_new`.

## Output contract — slate JSON

```json
{
  "generated_for_span_days": 90,
  "candidates": [
    { "key": "youtube.com/shorts", "host": "youtube.com", "route": "/shorts",
      "scores": { "time": 0.30, "compulsion": 0.92, "binge": 0.98, "drift": 0.15 },
      "evidence": { "dwell_hours": 26.3, "visits": 814, "return_pct": 48,
                    "binge": { "runs": 39, "median_run": 6, "max_run": 141, "pct_in_runs_5plus": 92 },
                    "first_seen": "2026-03-16", "is_new": false },
      "suggested_tier": "observe",
      "p5_intervention_prior": "shorts-scroll-lock (★ retired winner — friction/access at the mechanic)" }
  ],
  "window_hint": { "from": "22:30", "to": "02:30", "basis": "nocturnal residual lump — commitment-device tuning only" }
}
```

## Spike evidence

**Residual time-cost (work/infra subtracted, genuine navs):** youtube 619h · netflix 136h · linkedin 130h · whatsapp 74h · hackernews 42h · chess 28h · nytimes 15h. Visit-class split: 20,700 residual / 14,985 work / 5,199 infra.

**YouTube route breakdown (`yt.py`) — why the unit is `host+route`:**

| route | visits | total h | median dwell | quick-return | nocturnal |
|---|---|---|---|---|---|
| `/watch` | 1044 | 546.0 | 314 s | 19 % | 30 % |
| `/shorts` | 814 | 26.3 | 33 s | **48 %** | **53 %** |

Binge structure: **39 runs, median 6/run, max 141 in one streak, 92 % of shorts in runs of 5+.** Time-cost ranks this backwards (`/shorts` is the *smallest* bucket); the **binge lens** catches it. Seeding `youtube.com/shorts` (not bare `youtube.com`) into `observe` is the correct, mechanic-level unit.

## The nocturnal confound (why circadian is off the score)

You do *everything* late — taxes (`impots.gouv.fr`), train tickets (`renfe.com`), dev docs (`developer.apple.com`), coding. So late-night share doesn't isolate vice; it maps your whole nocturnal life. The composite floated your taxes to the top until circadian was demoted to **window-hinting only** (and even that now serves the surviving commitment devices, not retired shields). Note: the global peak is actually **17h**, with night a strong *secondary* peak — "evening-and-night-shifted, weak mornings," not "night owl." Browser timestamps are behavior, not chronotype.

## Error handling

Brave running → copy-around-lock, fall back to `.backup`. WAL present → copy `-wal`/`-shm`. Safari TCC-blocked → detect, print Full Disk Access steps, **skip without failing**. `visit_duration` = 0 → time-cost falls back to visit-count. Extension-ids / no-dot hosts → `infra`, dropped. Corrupt ledger → back up + warn, **never lose verdicts**.

## Testing

Synthetic fixture `History.db` with known navs → assert host classification, the `transition` genuine-nav filter (per code), **route classification** (`/shorts` vs `/watch`), deterministic lenses. **Binge lens** — planted run → assert detection + a Shorts-shaped route outranks a higher-time `/watch` route on binge. **Ledger round-trip** — `benign` suppresses host+route next scan; `work` grows allowlist. **Drift** — snapshot diff flags planted rising + NEW host. **Contract** — schema-validate the slate JSON.

## Phasing

- **P1 (ships now, relay-independent)** — Brave reader + `transition`/work/infra cleaning + route classification + time/compulsion/binge rankers + drift + adjudication (`observe`/`benign`/`work`) + ledger + snapshot + circadian window-*hint*. Writes `watchlist.observe`. Pure local, stdlib. **This is the cold-start bootstrap.**
- **P2 (needs the relay)** — design + build the **relay** (separate spec); move the steady-state lens battery into/over the browser substrate (route from DOM, not path-mining); Safari via Full Disk Access; the relay retires the manual `observe` sync.
- **P5 (out of scope here)** — interventions return as baseline-relative JITAI decision rules; *then* route/binge candidates acquire an enforcement path. See below.

## P5 enforcement priors (forward-pointer, not acted on)

When interventions re-enter at P5, the route/binge findings this scan accumulates are the **decision-rule priors**. Per the stamped retirement eulogy, every effectiveness *winner* was a mechanic-level cue-removal or friction (not a site cutoff):

| Route signal this scan flags | P5 re-entry candidate (retired winner) |
|---|---|
| `youtube.com/shorts` binge-runs | Shorts scroll-lock (friction) · Shorts homepage removal (cue-removal) |
| `linkedin.com/feed` dwell | Feed hide (cue-removal) |
| `chess.com` rematch quick-returns | Post-game cooldown 30 s (friction) |

The baseline this bootstrap kick-starts is what turns those priors into measured interrupted-time-series effects at P5.

## Open questions

- Ledger/snapshot in `~/.keel/` beside `config.json` (assumed yes).
- **Route discovery beyond the seed registry** — P1 hand-seeds known routes; auto-segmenting a high-binge host's paths to *discover* the offending route is P2.
- Where adjudication lives once the relay exists — agent TUI (P1) vs tray UI (P2).
- The relay's transport + schema — the next spec. Whether the steady-state battery runs *in* the extension or in the agent *over relayed events* is that spec's central question.
