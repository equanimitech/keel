# Monday 2026-04-20 — Fork Menu

**Context loaded:** `zenborg-consolidated-recap.md` + `trigger-taxonomy.md` (post-April 16 naming).

Metaphor stays: garden = your life, gardener = you, Zenborg = toolshed. Shields are fences. MCP is the gardener's voice. "Tides" still needs a garden-native name (open question).

---

## The five forks

**(A) Spec the MCP tool surface**
Guardrails tools (cultivation + boundaries) + intervention primitives (protection), both principle-tagged. Defines the API before anything ships.

**(B) Update `trigger-taxonomy.md`**
Add lifecycle details, the `reliance_score` inputs (3–4 signals max), retirement-loop mechanics. Doc hygiene — lowest risk, compounds later.

**(C) Editorial pass on the equanimitech primer (v0.2)**
`mindful-tech-editor` mode on the 5 open questions: gamify non-reactivity, mindful-cyborg audience, Strategic Friction examples, pyramid symmetry, promote the micro-pulse SDK to thesis.

**(D) Stub the MCP server (`apps/mcp`)**
Two-week spike. Declare intent, parking lot, garden state — nothing else. Ships the smallest thing you'll actually use.

**(E) Domain merge spike**
Scaffold `zenborg/` pnpm workspace, move shared types out of `equanimi/`, see what breaks.

---

## My read (pushback, not preference)

**I like** that (D) is the only fork that generates evidence about whether the MCP-first bet is real. Every other fork assumes it.

**I wonder** whether (A) before (D) is premature optimization. A two-week MCP spike will expose which primitives you actually reach for — that spec writes itself afterward. Specifying ten tools in the abstract, then discovering three of them are wrong, is the classic trap.

**I wish** you'd timebox (C). The primer has five open questions, and "editorial pass" on five questions can eat a week. If you pick (C), cap it at 90 minutes per question, ship v0.2, move on.

**Default recommendation if you don't pick:** (D). It's the cheapest falsification test of the MCP-primary thesis. Everything else sharpens assumptions; (D) tests them.

**Caveat:** if you've got a writing day and no dev energy, (C) is the right use of it. Don't force (D) on a bad cognitive day.

---

## Unresolved from Friday (still waiting)

- Garden-native name for "Tides" (seasons / daylight / frost line / just "boundaries"?)
- Which ~10 primitives make the cut
- 3–4 inputs for `reliance_score`
- Cross-surface comms: shared local storage or IPC?

Pick a fork and I'll go.
