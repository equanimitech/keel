# Modeling natural breakpoints, multitasking & focus from activity signals

**Literature synthesis → keel measurement spec.** 2026-06-12.

Method: deep-research harness (23 primary sources fetched, 115 claims extracted, 25 adversarially verified — 24 confirmed, 1 refuted) plus a focused JITAI/stress-sensing sweep and an inventory of keel's current signal capture. Every quantitative claim below survived verification against a primary source; unverifiable numbers are quarantined in §7.

**Framing (per 2026-06-12 directive): keel is observability-first.** Interventions are a separate later module. This doc therefore leads with *what to log and at what cadence* so the published models become buildable on accumulated raw data. The literature itself endorses this ordering — see §1.3.

---

## 1. What the literature licenses (TL;DR)

1. **Breakpoints are hierarchical and detectable from plain interaction-event logs — no extra hardware.** Coarse / Medium / Fine transitions between units of action (Adamczyk & Bailey 2004; Iqbal & Bailey 2007). Detection from window switches, app switches, saves, scrolls: 69–87% accuracy on trained populations, degrading to ~40–60% breakpoint-*location* recall on novel users — but a detector at that modest recall still cut frustration 20% and reaction time 25% (OASIS, CHI 2008).
2. **Interruptibility/engagement is predictable from cheap activity signals at ~75–82% vs a ~68% majority baseline** (Fogarty TOCHI 2005). For software developers specifically, computer-interaction data alone (74.8%) **beats biometrics** (68.3%); combining adds <1pt (Züger et al. CHI 2018). Behavioral data supports **at most ~3 distinguishable attention states** — don't over-engineer granularity.
3. **Every accuracy figure is population- and person-specific. There is no validated universal threshold** for "X switches/min = fragmented/stressed." The only defensible triggers are *relative to a personal baseline* (z-scores over rolling windows) — which requires weeks of raw logs first. A personalized receptivity model overtook the population-level static model after **~21 days** of per-user data (Mishra et al. 2021). **Measurement precedes modeling; the directive is what the data demands.**
4. **Nothing published covers AI-assisted coding sessions.** Tool-call completions, agent-turn boundaries, and AI-wait gaps as breakpoints are an extrapolation from OASIS's Visual Studio plug-in, not a tested result. keel's hook logs would be **novel data**.

---

## 2. The three constructs and how the literature operationalizes them

### 2.1 Breakpoints (the unit-of-action hierarchy)

| Level | Definition | Cost of interrupting | keel surface mapping |
|---|---|---|---|
| **Coarse** | Transition between largest units (programming task → media app) | Lowest | Frontmost-app/domain switch (desktop, browser) |
| **Medium** | Between related-but-separable units (switching source files in a project) | Middle | File/tab switch within same task; Claude turn boundary |
| **Fine** | Between smallest units (edit → compile/debug) | Highest of the three (but ≪ mid-unit) | Save, navigation commit, tool-call completion |

- Ground truth in the original work: human observers segmenting screen-capture video (60–80% inter-observer agreement).
- Timing effect sizes are large: best vs worst interruption moments → annoyance −56%, frustration −49%, time pressure −55% (Adamczyk & Bailey CHI 2004, N=16).
- **Triggers were event/behavior-based, never clock-based** — concrete action completions ("upon completing an edit", "after summary, before save").

### 2.2 Interruptibility / focus state

- Fogarty TOCHI 2005: ESM ground truth (~2 random probes/hour, one 5-point question), ~500 candidate features, decision trees/naive Bayes → 82.4% on binary "highly non-interruptible vs other" (chance 68.0%; humans watching clips 76.9%).
- **Caveat (verified):** headline figures used Wizard-of-Oz *simulated* sensors; the real speech detector dropped to ~76–77%. Speech/telephone carried most predictive power — all top-30 features by info gain were speech-related. A no-microphone detector (input activity + frontmost app + time-of-day) should expect to land **below ~78%** against a high baseline.
- The "Easy to Build" sensor set — speech/silence, keyboard activity, mouse activity, phone off-hook, time-of-day — hit 78.9–79.2% (the famous "~78%" figure). No cameras, no calendar.
- BusyBody (Horvitz et al. CSCW 2004, n=4): per-user Bayesian models over desktop event streams + calendar + in-context probes → 70–87% per participant. Closest published blueprint to keel's desktop app; treat the numbers as indicative only (n=4).
- Züger et al. CHI 2018 (n=13 professional developers, 2-week field study): interaction data 74.8% > biometrics 68.3%; both combined 75.7%. **Build the interaction pipeline before considering wearables.**

### 2.3 Cost of interruption = resumption lag

- Operational definition: time from the interrupting window closing → first observable action in the resumed task (Iqbal & Bailey CHI 2006).
- Predictable from task structure alone: boundary depth, carry-over, next-subtask difficulty (adj. R²=0.26; 3-class MLP 63.2% CV / 53% on novel tasks vs 33% chance).
- K-means on log resumption lags: **at most 3 meaningful cost classes** — parallel to Fogarty's 3-class interruptibility ceiling.
- **keel can compute resumption lag itself** (gap between context-restore and first input event) — a free implicit label for self-evaluating timing later, no ESM needed.

### 2.4 Vulnerability vs receptivity (JITAI framing)

Nahum-Shani et al. 2018 formalizes the layer above detection: **decision points** (when to consider acting), **tailoring variables** (what you know), **decision rules** (if/then), with "provide nothing" as a first-class option. Two distinct detectable states:

- **Vulnerability** = heightened susceptibility (switch-rate spike, late-night compulsion spiral).
- **Receptivity** = transient willingness/ability to receive support (breakpoints, context changes, AI-wait gaps).

Detection of these is observability work even though their consumer is the later interventions module. Verified receptivity numbers: well-timed prompts get ~28–38% just-in-time response (not 80%); sentiment decays monotonically with prompts in the preceding 2-hour window (InterruptMe, UbiComp 2014); identical repeated prompts show fMRI response collapse by the **second** exposure, mitigated by polymorphic variation (Anderson et al. CHI 2015 / MISQ 2018).

---

## 3. The measurement spec — what to log, per surface

The published detectors share one substrate: **a timestamped, append-only event log**. OASIS's architecture is the canonical cadence reference: events pooled in **3-second bins**, a **30-second rolling history**, evaluated every few seconds. Coarse detection was *application-independent* (global window/input events); Medium/Fine required *per-application plug-ins* (~370–500 event types for Visual Studio/Visio). keel's three surfaces map exactly: desktop = the application-independent layer; browser extension and Claude hooks = the per-application plug-ins.

### 3.1 Desktop (Tauri) — the Coarse layer

Already seen (just needs persistence): `window_changed` (app name, window title, timestamp, geometry, fullscreen) via `x-win` polling.

| Event | Status | Why the literature needs it |
|---|---|---|
| `app.focus` (frontmost app change) | **emitted, not persisted** | Coarse breakpoints; OASIS top feature class; Mark-style fragmentation metrics |
| `window.title_changed` | emitted, not persisted | Medium-grade context within an app |
| `input.activity` (keyboard/mouse event counts per bin — **counts and timing only, never content**) | ❌ new sensor | Fogarty "Easy to Build" set; engaged-vs-idle; resumption-lag endpoint |
| `input.idle` (gap ≥ threshold; ActivityWatch convention) | ❌ new sensor | Distinguishes "paused work" from "active in hidden window"; AFK bracketing |
| `input.timing_features` (inter-keystroke intervals, mouse velocity/jerk aggregates per bin) | ❌ new sensor | Within-subject stress proxies (Vizer ~75%, Epp 77–88%, MouStress) — **only usable against a personal baseline**, so logging must start before any model |
| `calendar.event_boundary` (busy/free transitions, no content) | ❌ later | BusyBody tailoring variable; cheap receptivity prior |
| `session.*` (focus session start/end, drift events) | ✅ persisted | Already keel domain |

### 3.2 Browser extension — per-application plug-in #1

Already seen (not logged): `tabs.onActivated`, `tabs.onUpdated`.

| Event | Status | Why |
|---|---|---|
| `tab.activated` (tabId, domain, ts) | seen, not persisted | Switch-rate metrics; Medium breakpoints; the "3 switches/min" hypothesis lives or dies on this log |
| `tab.navigation_committed` (domain-level; URL path only for opted-in domains) | seen, not persisted | Fine breakpoints (navigation commit = action completion) |
| `tab.focus` / `tab.blur` (incl. window blur = left the browser) | partial (visibilitychange in some content scripts) | Attentiveness features (Pielot: lock/unlock analogues were top predictors) |
| `media.play/pause/ended` | ✅ YouTube watch-time signal | Engagement state; natural Fine boundary at `ended` |
| `scroll.completed` (debounced scroll-stop) | partial (Shorts only) | An OASIS breakpoint feature ("completed scroll") |
| `budget.consumption_tick` | 🟡 types exist | Rolling fragmentation aggregates (`app-switch` SessionUnit already in domain) |

### 3.3 Claude Code hooks (keel-gate) — per-application plug-in #2, novel territory

Already recorded: `sessionStartTs`, `lastPromptTs`, `turnLockedTs`, per-tool-call rule evaluation. The existing breakpoint-arming (deny only turns that *opened* locked) is already a defer-to-coarse-breakpoint policy.

| Event | Status | Why |
|---|---|---|
| `turn.prompt_submitted` (ts, turn index) | partial (`lastPromptTs` overwritten — needs append-only log) | Prompt cadence; session rhythm |
| `tool.dispatched` / `tool.completed` (tool name, duration) | evaluated, not logged | Fine breakpoints (Visual Studio analogue: "build done"); **AI-wait gap start/end** |
| `wait.gap` (interval: long tool-call dispatch → next user activity) | ❌ derive from above | The candidate receptivity window unique to AI-assisted work — both highest-receptivity (idle, watching) and highest-vulnerability (compulsion escape hatch). Unpublished anywhere; keel's logs would be first data |
| `turn.ended` / `session.ended` (Stop hook) | ❌ new hook | Coarse boundary of agentic work; resumption-lag start point |
| `intention` / `appetite` set events | ✅ | Self-reported tailoring variables — already a light ESM channel |

### 3.4 Cross-surface log schema (one type in `@keel/domain`)

One append-only `ActivityEvent` stream per surface, same envelope: `{ id, surface: "desktop"|"browser"|"agent", kind, ts, durationMs?, payload }` — pure types, factory-constructed, immutable, no fp-ts (per domain rules). Aggregation into 3s bins / 30s windows is a *read-side* concern, not a logging concern; log raw, derive later. Privacy posture matching the literature: counts and timings, never keystroke content; domains, not full URLs, by default.

---

## 4. Ground truth — how the data gets labeled (later, but design the channel now)

- **The validated ESM recipe:** ~2 random probes/hour, single 5-point question ("how interruptible are you right now?"), self-anchored scale (Fogarty). "Highly non-interruptible" ran ~32% of samples.
- **keel already has a low-friction ESM channel:** the once-per-session intention/appetite nudge. Extending it to occasional one-tap state probes is a small step — and per-user calibration is *required*, given the generalization gap (§5).
- **Implicit labels are free:** resumption lag (§2.3), prompt-response latency, drift-event actions (`dismissed`/`ignored`/`returned` — already recorded). Open question in the literature whether implicit labels can fully substitute for explicit probes; keel can contribute evidence.

---

## 5. What models become buildable, and their honest ceilings

| Model | Substrate (must be in the log) | Published accuracy | Generalization caveat |
|---|---|---|---|
| Binary "any breakpoint" detector | App/window/input events, 3s bins, 30s window | 87% Coarse CV → **59%/52% recall, 64% precision on novel users; false-positive rate 2.3–2.8%** | Ship binary, not 3-class — type differentiation collapsed to 2–42% recall on novel users. Low FP rate means failure mode is *missed* breakpoints (fine for deferral). Validate with ±10s alignment window |
| Interruptibility (3-state max) | Input activity + frontmost app + time-of-day (+ speech if ever) | 75–82% vs 68% baseline; developers: 74.8% from interaction alone | Wizard-of-Oz inflation; expect <78% without microphone; per-user calibration assumed |
| Resumption-lag / cost predictor | Boundary depth, carry-over proxies, event sequences | R²=0.26; 3-class 53–63% vs 33% chance | Weak but useful as self-evaluation metric, not a gate |
| Personal fragmentation baseline | Tab/app switch events with timestamps | n/a (descriptive) | Population mean ~48s/window (Mark CHI 2014, college sample) with huge between-person SD → z-score vs own rolling mean, never absolute thresholds |
| Receptivity model | Prompt/notification outcomes, context features | 28–38% JIT response; static model first, personal model wins after ~21 days | Mobile-context numbers; desktop transfer plausible, untested |
| Stress-anomaly (keystroke/mouse) | Timing features per bin | 75–88% **within-subject, lab** | Collapses cross-person; confounded with task type (flow looks like arousal). Noisy vulnerability signal only; require ≥2 agreeing signals |

Deferral economics (for the later module, but they constrain what the log must show): OASIS mean deferral to next breakpoint was **88.6s (SD 139.3s — skewed, hard timeout mandatory)**; mobile inattentiveness windows run 2–5 min. Brief deferral suffices.

---

## 6. Operational numbers appendix (verified)

- 3-second event bins; 30-second rolling feature window; evaluate every few seconds (OASIS).
- ~2 ESM probes/hour, one 5-point item (Fogarty).
- ±10s tolerance when matching detected breakpoints to user-labeled ones.
- ~90s mean wait to next breakpoint during active desktop work; 2–5 min mobile inattentiveness phases.
- ≤3 attention/cost classes distinguishable from behavior.
- ~21 days of per-user data before personalization beats population models (receptivity).
- Prompt-sentiment decays with each prompt in the trailing 2-hour window; habituation onset by 2nd identical exposure.
- Population mean screen-focus ~48s (SD 16.5, college sample) — baseline reference only, not a threshold.

## 7. Refuted / unverified — do NOT hardcode

- **Horvitz "bounded deferral" thresholds** (busy→free in ~2 min; 3–4 min max deferral): **refuted 0–3** in verification. Use OASIS's 88.6s mean + timeout instead.
- **"3 tab switches/min = stress"** (from the 2026-06-12 partner call): appears in no source. Supported form: switch-rate *correlates* with stress (HRV-confirmed, ~2× switching with email present); thresholds must be personal-baseline z-scores.
- **Mark's "~23 min recovery" and absolute switches/hour figures**: directionally real, but the absolute numbers did not survive this sweep's primary-source verification; cite the ratios (2× switching) and the resumption-lag construct instead.
- **Lab stress-detection accuracies as field accuracies**: within-subject lab numbers (75–88%) do not transfer cross-person or in-the-wild.
- Leroy's attention residue and Mark's logging corpus were anchors that produced **no verified operational thresholds** — they motivate the work; they don't parameterize it.

## 8. Open questions keel's logs can answer (nobody has this data)

1. Do tool-call completions / agent-turn boundaries / AI-wait gaps behave like Fine/Medium/Coarse breakpoints? What inter-event gap in hook streams predicts a user-perceived boundary?
2. How much per-user labeling before a personal model beats the type-agnostic default (~52–59% recall)? Can implicit labels (resumption lag, response latency) substitute for ESM probes?
3. What detection ceiling is reachable from browser-extension signals alone (no frontmost-app or input-device access)?
4. What does *fragmentation worth intervening on* look like against a personal baseline — the threshold the literature never validated?

## 9. Sources (primaries, verified)

Breakpoints & deferral: Adamczyk & Bailey CHI 2004 · Iqbal & Bailey CHI 2006, CHI 2007, CHI 2008, TOCHI 2010 (OASIS). Interruptibility: Fogarty et al. TOCHI 2005 · Horvitz, Koch & Apacible CSCW 2004 (BusyBody) · Züger, Müller, Meyer & Fritz CHI 2018. Mobile transfer: Okoshi et al. PerCom 2015 (Attelia) · Dingler & Pielot MobileHCI 2015 · Pielot et al. CHI 2014 · Mehrotra & Musolesi survey (arXiv 1711.10171). Fragmentation & rhythm: Mark, Wang & Niiya CHI 2014 · Mark, Voida & Cardello CHI 2012 · Mark, Iqbal, Czerwinski & Johns CHI 2014 ("Bored Mondays"). JITAI & receptivity: Nahum-Shani et al. Ann Behav Med 2018 · Künzler et al. IMWUT 2019 · Mishra et al. IMWUT 2021 · Pejovic & Musolesi UbiComp 2014 (InterruptMe). Interaction stress sensing: Vizer et al. IJHCS 2009 · Epp et al. CHI 2011 · Sun et al. CHI 2014 (MouStress) · Hernandez et al. CHI 2014 (Under Pressure). Habituation: Anderson et al. CHI 2015, MISQ 2018. Micro-breathing (for the later interventions module): Ghandeharioun & Picard CHI 2017 (BrightBeat) · Paredes et al. IMWUT 2018 · Balters et al. IMWUT 2020 · Hunter et al. JMIR 2020 · Albulescu et al. PLOS ONE 2022 (micro-breaks d≈0.35). Practitioner: ActivityWatch watcher architecture (aw-watcher-afk/window conventions).
