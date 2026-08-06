---
tag: pitch
appetite: medium
status: SUPERSEDED 2026-06-19 — see re-direction note below
source: conversation 2026-06-04 — "keel's tides is relevant with zenborg no?"
slice_id: A
hard_dependency: none (Zenborg vault read-only; absent → clock fallback)
---

# Pitch — Tides reads Zenborg, not a clock

> **SUPERSEDED (2026-06-19).** keel will **not** couple to the Zenborg vault. The same
> need is met by keeping keel self-contained: give `keel intention` **time blocks**
> (an intention scoped to a `[from, to)` window). A time-windowed intention *is* the
> tide signal — the morning ritual (and week-planning) already name the day's blocks,
> so they just call `keel intention "<focus>" --block HH:MM-HH:MM`; keel never reads
> the vault. This keeps the published plugin de-the operator and dependency-free (the decision's
> goal) while making the tide intention-driven. Direction lives in
> [[keel-zenborg-intentions]] memory / the morning skill. The wall-cut context below
> (park/skip/credits/vice retired, backstop-only) still holds.

**Bet:** Feed the wind-down driver from Zenborg — the `NIGHT` phase band sets the bedtime window, tonight's allocated `NIGHT` moments **lower the night's friction** — and fall back to the hardcoded clock when Zenborg is absent.

**Why it matters:** Kills the second bedtime clock (today tides hand-syncs `22:30/00:00/05:00` against Zenborg's `NIGHT` 23→7). Turns the strategy's reserved "intention seam" into the first live **Moments → Keel** edge of the Voltron thesis. On-intention late work flows clean; undeclared drift just meets more friction (coarser nudges), and the backstop remains the floor.

---

## Boundaries

**JBTD:** As the keel daemon on the operator's behalf, when it's late and I'm still at the keyboard, I want wind-down to read my *declared* intention — Zenborg's night band + tonight's `NIGHT` moments — not a guessed clock, so a night I declared a work-night flows and only undeclared drift brakes. Baseline today: `frictionAt` runs off a static `{windDown:"22:30", hardStop:"00:00", reset:"05:00"}` (`config.sample.json`); same wall whether or not tonight was declared, and a bedtime clock that must be hand-synced with `phaseConfigs` `NIGHT`.

**Out:**
- Semantic match of frontmost app ↔ moment text. Presence of a `NIGHT` moment = grant. No NLP.
- Any write to the Zenborg vault. Tides reads `~/.zenborg/*.json`, never mutates.
- Browser propagation of the intention-aware `f`. That's the next slice.
- Any new streak/score/badge. The reprieve and the rollup stay scoreless.
- Touching the impulsive skip-credit path. The intention grant is a *separate*, credit-free reprieve.

## Elements

- **Zenborg vault reader** (new `packages/keel-gate/zenborg.mjs`). Local-first read of `~/.zenborg/phaseConfigs.json` + `moments.json`. Returns `null` on missing/unparseable/stale — never throws. This is the only I/O the seam adds; no MCP, no network.
- **Phase seam** (`core.mjs:8,20,69`). Resolve the driver's window from the `NIGHT` band: `hardStop = NIGHT.startHour`, `reset = NIGHT.endHour`. Tides keeps the ramp: `windDown = hardStop − lead` (config, default 30 min). Zenborg owns *when night is*; tides owns *how long the ramp is*. `frictionAt` is untouched and stays pure.
- **Intention seam** (`core.mjs` resolve layer). Filter `moments.json` to `phase === "NIGHT" && dayKey === today`. A declared `NIGHT` moment caps `f` below lockdown (coding works, stained/high-friction) instead of hard `block` — a pre-committed, credit-free, scoreless reprieve. No `NIGHT` moment → clock holds, lockdown asserts as today.
- **Standalone fallback** (resolve layer). Reader returns `null` → driver is the static `config.sample.json` clock, byte-identical to today. The resolver is the only new branch; failure mode is the current product. Satisfies the Power Rangers test.
- **Provenance in state.json** (daemon writer). Stamp which driver fed `f` — `clock | zenborg-phase | zenborg-intention` — and name the granting moment in `reason`/`context`. The hook and UI say *why* coding is or isn't parked.

## Risks

**🐇 Rabbit holes:**
- Semantic app↔moment matching. Hard, fuzzy, out of scope. Grant on moment *presence*.
- Building a Zenborg MCP client. The vault is local JSON; read the files.
- Per-moment time-boxing (reprieve expires with the moment's slot). v1 grant is night-scoped; bounding it is a later refinement.

**🧪 Domain knowledge:**
- Confirm allocated moments key on `dayKey` vs `date` (sample shows both; templates have null). The filter depends on which field a *placed* night moment populates.
- `NIGHT` phaseConfig is `isVisible:false` — confirm it's still authoritative for the band, not a hidden/disabled record.
- Confirm the daemon runtime can read `~/.zenborg` under its sandbox/permissions.

**🥩 Fat cut:** Reading cycle/season *attitude* (BEGINNING→BEING) to modulate ramp steepness. Tempting — a PUSHING season could ramp gentler. But moment presence is the MVP signal; attitude is a later dial.

**🏴 Off-sides:** Someone will want `EVENING`/`AFTERNOON` bands driving *daytime* friction. Out. This seam is the night band only.

## Acceptance

1. With `~/.zenborg` absent or unreadable, tides is byte-identical to today: ramp `22:30`, lockdown `00:00`, reset `05:00`.
2. Edit `phaseConfigs` `NIGHT.startHour` 23→22; on the next daemon tick, `hardStop` moves to `22:00` with no code change.
3. Allocate a `NIGHT` moment for tonight; coding past `hardStop` stays in `wind_down` (`f<1`, no `block`), no skip credit spent, no streak emitted.
4. No `NIGHT` moment tonight; `lockdown` (`f=1`, coding-block) asserts at `hardStop` at the next breakpoint, as today.
5. `state.json` names the active driver (`clock|zenborg-phase|zenborg-intention`) and, when granted, the moment name in `reason`.
6. The `lateNights` rollup (`core.mjs:151`) gains no score/streak field — intention-miss informs the ramp, never scolds.

---

_Drafted by Claude (scribe). Unstamped draft. Appetite: `medium` — two seams + reader + fallback + daemon provenance, across `keel-gate` + the daemon writer. Override with `--appetite=small` to ship the phase seam alone first._
