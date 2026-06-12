# AI-wait-gap wheel of fortune — off-screen micro-activities while the agent works

- The intervention point: AI-wait gaps (agent working ≥30s–2min). Day-1 log data: ~10 min of such gaps in a 41-min window — both peak compulsion-vulnerability and peak receptivity. The wheel turns the gap from a doomscroll on-ramp into an embodied micro-break.
- The mechanic: spin a wheel over a *personal* menu of off-screen micro-activities. Rafa's list (2026-06-12, verbatim):
  - keepie upies (embaixadinha)
  - origami
  - push eyes ↳ learning nota
  - singing practice
  - horse stance
  - pass the broom
  - text a friend
  - Rubix Cube · chess game (nota=nots)
- Literature alignment (see `docs/references/2026-06-12-attention-observability-literature.md`):
  - Random selection from a varied menu IS the anti-habituation mechanism — polymorphic prompts resist the by-2nd-exposure decay (Anderson CHI'15/MISQ'18); varied intervention content recovers engagement (2024 in-the-wild JITAI study).
  - Off-screen embodied options = the breathwork coach's "ventral vagal anchors"; micro-breaks ≤10min: vigor d≈0.36, fatigue d≈0.35 (Albulescu 2022).
  - JITAI: the wheel fires at a *receptivity* window, not a vulnerability alarm — and "skip" must stay a first-class wheel outcome (provide-nothing option; sovereignty).
  - Expect ~30% acceptance, rate-limit per 2h window, breath/2-min options fit the gap length distribution (most gaps 30s–3min).
- Detection is already shipped: `tool_dispatched` without a matching completion for >Ns, derivable live from `~/.keel/log/` — the tray app (slice B) fs-watching the log is the natural home for the wheel popup. Browser/desktop later add "did the gap drain into YouTube?" outcome measurement.
- Questions:
  - Where does the menu live — `~/.keel/config.json` voice-style (user-authored, per the presets principle)?
  - Gap threshold to fire (30s? 60s?) — derive from personal gap distribution once a week of data exists.
  - Does the wheel record outcomes (spun/skipped/done) as ActivityEvents? (JITAI says yes — receptivity model food. Privacy: it's the user's own log.)
  - Physical-world verification is a non-goal (trust the human) — confirm.

## 2026-06-12 addendum — predetection from tool types (evidence-based)

- Day-1 data: Edit/Write/Read p90≈0.1s (never gaps); Bash 10% ≥30s; all eight ≥30s calls were test runs, seven of them the *same command* (47–178s).
- Three-tier predictor, all derivable read-side from the log:
  1. deterministic at dispatch: Task/Agent, Workflow, `run_in_background`, high `timeout` → gap starts now;
  2. per-command-signature memory: normalized command → its own personal duration history (median + P(≥30s)); keyword priors (`test|e2e|build|install|typecheck`) for cold start;
  3. fallback: no completion 30s after dispatch (works today).
- Log predictions next to outcomes (predicted vs actual) — self-auditing, same provenance pattern as derived facts.
- Duration-aware menu: predicted 45s gap → eye exercises; predicted 3min → horse stance / keepie-uppies.
- Prereq: widen keel's PreToolUse matcher to all tools so Task/Workflow dispatches (the most predictable long calls) enter the log.

Don't shape yet.
