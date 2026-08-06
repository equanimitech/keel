# keel generalization — design exploration

**Date:** 2026-06-07 · **Status:** exploration only, no code changed · **Scope:** `packages/keel-gate/` (`core.mjs`, `store.mjs`, `keel.mjs`)

## The one-liner

keel-gate is **already 80% generalizable** — the pure domain in `core.mjs` is a friction-curve → tool-deny gate with sovereign overrides, and `Driver.kind` (core.mjs:8) is the seam that lets the *philosophy* vary. The overfit is concentrated in two thin places: a single hardcoded `TARGET_ID = "claude-code"` + single `~/.keel` home (store.mjs:9-10), and the fact that **only one driver kind is actually implemented** (`frictionAt` *is* the wind-down ramp; core.mjs:69-78). Everything else (times, copy, skip credits) is already config, not code.

**Smallest-first next step:** add a second `driver.kind` (`focus-window`) behind a `frictionForDriver(kind, …)` dispatch, *after* writing characterization tests that pin today's wind-down friction curve. That one move proves the seam goes all the way down without touching the working single-user gate.

---

## 1. Inventory of the overfit

Coarse → subtle. Where keel quietly assumes *the operator*.

### Structural (cheap to fix, mechanical)
- **Single hardcoded target id.** `TARGET_ID = "claude-code"` (store.mjs:10); `loadTarget(id = TARGET_ID)` (store.mjs:15); `cmdStatus` prints `keel[${TARGET_ID}]` (keel.mjs:77). The config schema *already* supports `targets: { <id>: … }` (store.mjs:18) — the map is multi-target, the reader is single-target.
- **Single `~/.keel` home.** `KEEL_DIR = join(homedir(), ".keel")` (store.mjs:9). One config, one state, one machine, one OS user.
- **Single-machine local state.** `state.json` is a local file (store.mjs:11, 28). Skip credits, observed nights, intention/appetite all live on one disk. Two machines = two unsynced gates (you can dodge the gate by switching laptops).

### Philosophical (the deep overfit — the framing itself)
- **The wind-down/sleep model is the *only* driver.** `frictionAt` (core.mjs:71) literally encodes "0 by day · linear ramp windDown→hardStop · 1 in lockdown" — a night-owl-who-wants-to-stop-coding-late curve. `Driver.kind` exists (core.mjs:8) but is **never read** — `frictionNow` (core.mjs:136) calls `frictionAt` unconditionally. Other people want the *inverse* shape:
  - **focus-window / work-hours:** friction *low* inside declared hours, *high* outside (anti-after-hours-creep, or anti-procrastination-during-work).
  - **pomodoro:** sawtooth — friction 0 for 25 min, 1 for 5, repeat.
  - **quota / budget:** friction rises with *cumulative usage today*, not wall-clock time (anti-doomscroll, "2h of coding then stop").
  - **anti-binge:** friction rises with *unbroken session length* (the data for this already exists — `unbrokenMin`, core.mjs:164 — but only feeds the cosmetic "bell", not the curve).
- **Lockdown vocabulary bakes in "night".** `Phase` is `"day"|"wind_down"|"lockdown"` (core.mjs:4); `nightKey`/`recordNight`/`lastNNights`/`nextResetTs` (core.mjs:91-201) all assume a once-per-*night* cycle keyed to a `reset` hour. A pomodoro or quota driver has no "night" — the period is the wrong unit. `reflectionLine` ("wound down on your own N of the last M late night(s)", core.mjs:313) is sleep-shaming copy hardcoded into the *domain*, not the voice config.
- **Skip-credit moral framing.** `perMonth: 2, cap: 3` (core.mjs:24) and "spend a skip if it's truly worth it" (core.mjs:27) encode *one person's* chosen scarcity and *one person's* relationship to override-guilt. Defensible as the operator's contract with themselves; coercive if shipped as a default to someone whose self-relationship differs.

### Copy / locale (tuned to one voice)
- **Voice defaults are the operator's words.** `DEFAULT_TARGET.voice` (core.mjs:25-35) — "Winding down — favor landing open work", "Instead: jot tomorrow's first task, then sleep." Config-overridable (the README calls this "the point", README.md:48), but the *defaults a new user inherits* are sleep-specific.
- **Ritual nudges are the operator's command surface.** `ritualNudge` (core.mjs:242-251) hardcodes `/weekly-review` and `/morning` — slash commands that only exist in *the operator's* Claude setup. A new user gets a nudge to run a command they don't have.
- **English-only, hardcoded strings.** Every emitted line is an English literal in `core.mjs`. No i18n seam.
- **Timezone/locale assumptions.** `nowMinOf`/`dayKey` use local `getHours()`/`getDate()` (core.mjs:87, 232-235) — correct for one machine in one tz, but `monthKey` uses **UTC** `toISOString().slice(0,7)` (core.mjs:88) for credit refill while everything else is local. Latent bug at month boundaries near midnight; harmless for one user in one tz, a real cross-user inconsistency.
- **Morning window 04:00–14:00 hardcoded** (core.mjs:246) — a night-owl's "morning", not config.

---

## 2. Essence vs. accident

| | **Essence (generalizable core)** | **Accident (operator-specific)** |
|---|---|---|
| **Curve** | A `Friction ∈ [0,1]` derived from context | The *specific* wind-down ramp shape; times 23:00/01:00/05:00 |
| **Gate** | "at friction ≥ threshold, deny these tools" — `denyingRule` (core.mjs:171) | The exact tool list `[Edit,Write,Bash,…]` (coding-specific) |
| **Arming** | breakpoint vs immediate, turn-boundary respect (core.mjs:176-179) | — (genuinely generic, no overfit) |
| **Override** | sovereign escape hatch with scarcity | skip = 2/month; "park"/"signoff" lifecycle keyed to a *night* |
| **Period** | a repeating reset boundary the gate + outcomes key to | that the period is a **night** (`nightKey`, `reset` hour) |
| **Voice** | templated, user-authored copy w/ `{reset}`/`{credits}` fill | the sleep-themed default strings + `/morning` `/weekly-review` |
| **Outcomes** | record observations per period, reflect | "late night", "wound down", sleep framing in the domain |

**The honest seam assessment — how far does `driver.kind` go?**
Not far enough *yet*. `kind` is declared (core.mjs:8), defaulted to `"wind-down"` (core.mjs:20), persisted in config, and **read by nothing**. `frictionNow` → `frictionAt` is hardwired (core.mjs:136-138). So today `kind` is documentation, not dispatch. The *good* news: making it real is a single dispatch point — `frictionAt` is the only place the curve shape lives, and it's already pure and isolated. The *period* coupling (`nightKey`/`reset`) is the deeper accident — a pomodoro/quota driver needs a `Period` abstraction, not just a curve swap.

**A comment already anticipates the lift:** core.mjs:2 — *"The piece that later lifts into @keel/domain."* And `packages/domain` already exists with the right rules (CLAUDE.md: pure, readonly, factory functions, no fp-ts). The essence has a home waiting.

---

## 3. Generalization path (smallest-first)

Each rung is independently shippable and leaves the single-user gate working.

### (a) Driver-kind plurality — **S effort, highest leverage**
Make `kind` real: a `frictionForDriver(driver, state, now)` dispatch in `core.mjs` that branches on `driver.kind`, with the current ramp becoming the `"wind-down"` case (a pure rename of `frictionAt`'s body). Add `"focus-window"` first (cheapest — same wall-clock math, inverted window). Then `"quota"` and `"pomodoro"` (these need a `Period` notion; see below).
- **Unlocks:** the *whole other half of the market* — focus-during-day, work-hours-enforcement, anti-doomscroll — without a rewrite. Proves the philosophy is config.
- **Watch:** the `Period`/`night` coupling. Quota and pomodoro break `nightKey`. Introduce `periodKey(driver, now)` / `nextResetTs(driver, now)` as driver-aware (wind-down → night; pomodoro → cycle; quota → calendar day). This is the real refactor inside this rung.

### (b) Config-profile presets — **XS effort, high adoption value**
Ship `config.samples/` with `wind-down.json`, `focus-hours.json`, `pomodoro.json`, `doomscroll-quota.json` — each a complete `target` with its own voice. A new user copies a preset instead of authoring one. Pairs naturally with (a); presets are how non-operator users *discover* the driver kinds exist.
- **Unlocks:** onboarding for someone who isn't a config author. Turns "make it yours" (README.md:42) from a chore into a pick-a-template.

### (c) Multi-principal / multi-target reader — **S effort**
Let `loadTarget` resolve a target id from env/arg (`KEEL_TARGET` or hook arg) instead of the constant (store.mjs:10,15). The hook command already passes a verb (`hook pre-tool`); add an optional target. The config map is *already* multi-target.
- **Unlocks:** one machine gating multiple surfaces (Claude Code *and* the browser extension *and* a terminal) with different drivers — the keel umbrella's actual ambition (root README: two surfaces, one domain). Also a per-user `KEEL_DIR` override (`KEEL_HOME` env) for shared machines.

### (d) Multi-machine state — **M–L effort, defer**
Today state is one local file (store.mjs:28). Generalizing to a person-across-devices needs a sync story (the override-dodge problem: switch laptops, escape the gate). Options: a `StateStore` port (mirror the existing Store/I-O split) with a remote adapter, or a CRDT-ish merge of append-only `nights`. **Defer** — it's the only rung that needs new infra, and it's only worth it once (a) proves people want it.

### (e) Extract `@keel/domain` — **M effort, do *with* (a), not before**
core.mjs:2 already names this. Lift the pure functions into `packages/domain` (which exists and has the right constraints). But: **don't extract first.** Extract *as part of* (a), so the new `frictionForDriver` dispatch + `Period` abstraction land in the package with characterization tests guarding them. Extracting a frozen-but-overfit core just relocates the overfit.

**Recommended order:** characterization tests (§4) → (a) wind-down rename + `focus-window` → (b) presets → (c) multi-target reader → (e) extract → (d) sync.

---

## 4. What must be tested first

The user explicitly wants validation before generalizing. Here's the gap.

### Current coverage (good news)
- **There IS a runner:** `node --test`, `package.json:8`; **14 tests, all passing** (`core.test.mjs`, verified 2026-06-07). Pure-core is well covered: `frictionAt` across the wrapping night, `phaseOf`, credits refill/spend, session windows, `denyingRule` (both arming modes, skip, below-threshold, non-coding tool), `nextResetTs`, reflection, park parse/active, `frictionNow` park-override, `renderOrient` by phase.
- **`typecheck`** via JSDoc `// @ts-check` (package.json:9) — a real type net, no build.

### Coverage gaps that block safe generalization
The tests pin *behavior* but not the *boundaries that a refactor will move*. Before touching anything, add characterization tests for:

1. **The wind-down friction curve as a golden snapshot.** `frictionAt` has a few point-checks (core.test.mjs:17-25) but no dense sweep. Pin the full curve (every 10 min across a night) so a `frictionForDriver` rename can't silently shift the ramp. *This is the #1 guard for rung (a).*
2. **Period/night-key behavior across the wrap and across drivers.** `nightKey`/`nextResetTs` are tested for wind-down only. Before introducing `periodKey`, pin current night-bucketing at: just-before-reset, just-after-reset, midday, and the month boundary (catches the local-vs-UTC `monthKey` inconsistency, core.mjs:88).
3. **The hook orchestration layer — currently 0% covered.** `keel.mjs`'s `handlePreTool`/`handleUserSubmit`/`handleSessionStart` (the turn-boundary breakpoint wiring, the `turnLockedTs` set/read handshake between user-submit and pre-tool) have **no tests** — only the pure `denyingRule` underneath does. The most fragile single-user behavior (breakpoint arming actually engaging at a real turn boundary) is unverified end-to-end. Add a thin harness that feeds fake stdin + clock and asserts the emitted JSON. *Without this, a refactor can regress the actual gate while all 14 unit tests stay green.*
4. **Override lifecycle as a sequence.** park → bites → survives to reset → expires; signoff = park-now; skip clears the deny. Tested in pieces; not as the *user-visible state machine* a multi-driver refactor must preserve.
5. **Config merge / unknown-kind fallback.** `mergeTarget` (core.mjs:46) is lightly tested. Before adding kinds, pin: unknown `driver.kind` → falls back to wind-down (fail-safe), partial voice merge keeps defaults.

**Principle:** the gate is a safety device with a fail-open contract (keel.mjs:163). Characterization tests should lock the *fail-open* and *breakpoint-at-boundary* invariants first — those are the two things a user relies on and a refactor most easily breaks.

---

## 5. Risks / cautions of generalizing prematurely

This is an **equanimitech** product (root README: "Sovereignty → Awareness → Equanimity"). The risks are mostly *value* risks, not technical ones.

- **Coercion creep.** A wind-down gate the operator imposed *on themselves* is sovereign. The same gate shipped with a default a *manager* or a *habit-app* sets *for someone else* is the opposite — engagement-shaped control. **Guard:** sovereignty must survive multi-user. The skip credit, `park`, `unpark`, and "remove the gate: delete the hooks block" (README.md:55) are the sovereignty primitives — any generalization must keep the override *at least as easy as the gate*. Never add a driver kind whose override is harder than its block.
- **Multi-machine sync becomes surveillance.** Rung (d) (state-across-devices) is one schema change away from "your friction history lives on someone's server." For an equanimitech tool this is a bright line: sync must be local-first / user-owned, never a telemetry channel. Defer (d) precisely because getting it wrong is worse than not having it.
- **Presets encode a stranger's morality.** A `pomodoro.json` preset's skip-budget and voice are *someone's* opinion about how strict to be. Shipping presets is good for adoption (rung b) but each one is a values statement. **Guard:** presets should default to *generous* overrides (easy to skip, no shaming voice) and let the user *tighten*, never start coercive.
- **Domain extraction freezes the overfit.** Extracting `@keel/domain` (rung e) *before* the curve/period abstractions are right would canonize the night-only model in the shared package both surfaces depend on. Sequence matters: generalize the model, *then* extract.
- **Reflection copy is sleep-shaming in the domain layer.** `reflectionLine` (core.mjs:313) hardcodes "late night" / "wound down" framing into pure logic. For a generalized tool this both breaks (wrong for pomodoro) *and* risks the engagement-shaped guilt-loop equanimitech explicitly rejects. Move all evaluative copy into `voice` before generalizing.
- **YAGNI / single-user-of-one.** The honest base-rate caution: keel has exactly one user and the wind-down driver works. Generalizing is speculative until a *second real user with a different driver* exists. The cheapest validation isn't a refactor — it's running rung (b) (a `focus-hours.json` preset *the operator themselves* could use during the day) to test whether the multi-driver model even holds up in their own hands before building for strangers.

---

## Appendix — file:line index

- Hardcoded target / home: `store.mjs:9-10, 15`; `keel.mjs:77`
- Curve = the only driver: `core.mjs:69-78` (`frictionAt`), `core.mjs:136-138` (`frictionNow` hardwired)
- `driver.kind` seam (declared, unread): `core.mjs:8, 20`
- Night/period coupling: `core.mjs:91-99` (`nextResetTs`/`nightKey`), `184-201` (record/last-N nights)
- Sleep copy in domain: `core.mjs:313` (`reflectionLine`)
- Voice defaults (the operator's words): `core.mjs:25-35`
- Ritual nudge → the operator's commands: `core.mjs:242-251`
- Locale: local tz `core.mjs:87, 232-235` vs UTC `core.mjs:88`; morning window `core.mjs:246`
- Override sovereignty primitives: `keel.mjs:56-105` (skip/park/unpark/signoff)
- Fail-open contract: `keel.mjs:15-16, 163`
- "lifts into @keel/domain" comment: `core.mjs:2`
- Test runner + coverage: `package.json:8`; `core.test.mjs` (14 tests, pure-core only; `keel.mjs` orchestration untested)
