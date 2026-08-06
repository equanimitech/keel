# Archive

Docs that describe a keel that no longer exists. Kept because the reasoning is
worth reading; moved here because reading them as current will mislead you.

Nothing in this directory is a contract. If a doc here disagrees with the code,
the code is right.

## What's in here

**Pre-rename `Equanimi` era (Feb 2026)** — the product was called Equanimi and
was framed as a "modular attention intervention platform". The rename to `keel`
landed 2026-06-01 (`docs/superpowers/plans/2026-06-01-rename-equanimi-to-keel.md`).

- `PITCH-equanimi-unification.md`, `ROADMAP-equanimi-unification.md`
- `browser-PITCH.md`, `browser-PROMPT.md`

**The shield layer (Feb–Apr 2026)** — eleven per-domain shields, cooldowns and
budgets, retired on 2026-06-12
(`docs/decisions/2026-06-12-retire-the-intervention-layer-….md`). The specs are
still marked "Status: Draft"; they were built, shipped, and then removed.

- `001-modular-architecture-refactor.md`, `002-youtube-shields.md`,
  `003-chess-com-and-budgets.md`, `004-linkedin-shields.md`
- `exploration-consumption-pressure.md`
- `2026-02-2*-linkedin-*.md`, `2026-02-2*-watch-time-*.md`, `2026-02-24-split-watch-time-stain*.md`

**Shield-era analysis (Apr 2026)** — the falsification exercises that produced
the primitive contracts. Their *conclusion* survives as
`docs/primitive-contracts.md` (live — it is what `packages/domain/src/rules.ts`
implements). The working-out is here.

- `shield-audit-vs-contracts.md`, `spec-smoke-test.md`, `spike-chess-as-spec.md`
- `v2-spec.md` — superseded by `docs/primitive-contracts.md`

**The LLM-authoring moat (Apr 2026)** — a four-stage generate → validate →
commit pipeline with an "equanimous behavior" validator as the moat. Never
built. The friction layer that did ship (`apps/browser/modules/friction/`) is
hand-written, not generated.

- `pipeline-flow.md`, `validator-budget.md`, `runtime-interpreter.md`

**Zenborg-era session notes (Apr 2026)** — from when keel's domain model was
being sketched inside zenborg. keel's domain is now `activity` / `bouts` /
`tide` / `areas` / `rules`; the trigger taxonomy never became any of them.

- `trigger-taxonomy.md`, `zenborg-consolidated-recap.md`,
  `session-2026-04-15-conclusions.md`, `monday-2026-04-20-fork-menu.md`
