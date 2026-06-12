# Brief — A personal-operating-system skill suite

**Bet:** A day's worth of agent skills now compose into one calm "personal OS": a deterministic focus-gate (keel) carries cheap per-turn signals, and a set of ritual / capture / recall skills sit on top — so an AI work session has a beginning, a spine, and an end without becoming a dashboard.

**Why it matters:** It's a reusable, productizable pattern for *equanimitech* agent tooling — calm tech that structures attention and then gets out of the way. Nothing here is domain-specific; the architecture transfers to any agent-driven workflow.

---

## The architecture — three layers, cleanly split

The whole suite obeys one separation:

- **Trigger = hook** (keel). Deterministic, pure-core CLI fired by session hooks. Carries state + nudges; never interprets.
- **Ritual = skill.** The intelligent layer — reads the nudge, walks the human through a paced flow.
- **Attestation = stamp** (Secretariat). The human commits; the agent never stamps.

Don't collapse these. The hook can't judge; the skill can't enforce; the stamp is the human's alone.

## keel — the deterministic substrate (extended today)

A friction curve over time → a tool-deny gate, with sovereign overrides. Added, all pure-core + tested:

- **session-start nudge** — one ambient line, once/day, in a morning window; routes daily vs weekly.
- **intention** — a day-scoped *focus* string, echoed every turn (`◎`); the chat self-guardrails, drift gets captured not chased.
- **appetite** — a day-scoped *depth* dial (tiny / small / normal / deep), echoed every turn (`▤`); maps to semantic-zoom levels; the night-time granularity ceiling overrides it.
- **signoff** — a sovereign command that drives friction to lockdown now (vs the clock).

intention (what) and appetite (how deep) are **orthogonal** — two dials, set at session open.

## The ritual skills — beginning, spine, end

- **Embodied wake protocol** — off-device pre-work routine; lives on phone, not the editor (the screen is the wrong device for it). The editor only *confirms* it (wellness-first).
- **Morning** — paced beats: reconcile state → schedule → name one priority.
- **Wind-down** — mirror of morning; lands the day, names tomorrow, optionally queues a *detached overnight agent* that lands a PR for review (sovereignty at both ends — human approves brief, human reviews PR).
- **Weekly review** — a higher-altitude, review-only episode (implementation gated off).
- **Sign-off** — a *disconnection ritual*; its stamped output is a commitment contract that triggers lockdown. Two paths to lockdown: the clock, or the human's signature.

## Capture / recall / focus-hygiene

- **Capture** (idea / pain / question / log) → a private trace.
- **Recall** — sweeps a window, condenses coarsest-first, distinguishes committed (stamped) from ambient (draft).
- **Sidenote** — a mid-work tangent either *captures* or *explores via a background subagent* (loading the relevant domain skills), so the main thread never derails.

## Principles worth keeping

- **Sovereignty.** Every gate is self-imposed and reversible by the human; nothing coerces. Shipped to others, defaults must stay generous.
- **Fade-by-design.** Nudges fire once and fall silent; the tool's success is getting out of the way.
- **Adaptive granularity.** semantic-zoom is the spine — coarse first, deepen on demand; appetite makes it a dial.
- **Capture-don't-chase.** Drift becomes a logged trace, not a derail — focus is protected structurally, not by willpower.
- **Local-first + private.** State is local; personal lists never enter version control.

## Go deeper

Source: keel pure-core (`packages/keel-gate/core.mjs`) + the skill set under the agent skills directory. A generalization exploration (de-overfitting keel to multiple drivers/users) is drafted alongside this brief.

---

_Drafted by Claude. Personal-routine specifics omitted by request — this is the reusable architecture._
