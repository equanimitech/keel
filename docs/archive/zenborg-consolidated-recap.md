# Zenborg Consolidated Recap
**Sessions:** April 15–16, 2026
**Status:** Ready for Monday continuation

---

## The Big Picture

**equanimitech** is the intellectual framework — the thesis, the 9 principles, the primer (equanimi.tech).
**Zenborg** is the product — one garden, multiple surfaces.
**equanimi** repo is the donor — gets archived after domain merge.

### The Metaphor (settled April 16)

The user's life situation is the garden. The user is the gardener. Zenborg is the toolshed.

- The tool doesn't grow anything. The gardener does.
- Areas are plots. Moments are what you plant today. Habits are perennials. Cycles are seasons.
- Shields are fences and netting. Drift detection is noticing weeds.
- Fade-by-Design = needing the toolshed less because the garden is established.
- "Tides" is an ocean metaphor leaking into the garden. Needs a garden-native name (seasons? daylight? frost line?). Open question for Monday.

### Three Surfaces

1. **MCP server** (`apps/mcp`) — the gardener's voice. Primary interface. Declare intentions, set boundaries, manage cycles/areas/habits, parking lot for stray ideas. Conversational-first.
2. **Web app** (`apps/web`) — the garden view. Visualization, reflection, spatial layout. Becomes optional for daily use — you can run Zenborg entirely through Claude + MCP.
3. **Browser extension** (`apps/browser`) — the groundskeeper. Silent. Executes shields against compulsive patterns in the background.

### Two Modes, One Garden

**Cultivation** (offensive): plant moments, tend habits, cultivate areas, harvest reflections. Where you place your consciousness.
**Protection** (defensive): shields against compulsive patterns, time boundaries, drift detection. What you defend against.

---

## Architecture Decisions

### Shields (formerly "Rules")

Shields are the core composition unit. A Shield binds a Trigger to an Intervention within a scope.

- **Shields are JSON, not code.** LLM emits structured output conforming to a schema. Runtime is a deterministic interpreter. No LLM-generated JS — `custom_script` action type dropped.
- **Three layers of composition:** atomic primitives (deterministic TS, ~10 tools) → strategy templates (BCT/PDP-tagged, parameterized JSON) → equanimous constraints (9 principles as validation layer).
- **Lifecycle:** `active | retirement_candidate | retired`. Each Shield tracks a `reliance_score`.

### MCP as Primary Interface

The MCP serves the **whole** garden, not just protection:

- Declare cycles, areas, habits, moments (cultivation)
- Set shields, boundaries, drift rules (protection)
- Parking lot for stray ideas during sessions
- Surface current garden state to any AI assistant

This means the web app's role shifts from "where you do things" to "where you see things." Direct manipulation features (drag-and-drop, spatial layout) stay web-only. Everything else is MCP-first.

### Two MCP Tool Groups (complementary, not conflicting)

**Guardrails tools** (human-facing, conversational):
- Declare intent, set boundaries, manage garden state, parking lot

**Intervention primitives** (browser-facing, execution):
- `hide_elements`, `friction_wall`, `prompt_intention`, `cooldown_domain`, etc.
- ~10 well-named tools tagged with which equanimous principles they support/risk
- Double-duty as authoring vocabulary (LLM composes them) and runtime surface (interpreter calls them)

### LLM Strategy

Pragmatist: BYOK (bring your own API key), cloud at author-time, local at runtime.

- Author-time: LLM uses BCT/PDP/equanimous principles to compose Shields as JSON
- Runtime: deterministic interpreter, no LLM in the loop (default)
- Live agentic: opt-in power-user mode — "Claude, calm this page down"
- Fallback: templates / starter library / manual JSON for when no API key configured

### Compulsion Detection

Two time scales:

- **Slow (nightly):** Domain classifier using thesis metrics (Endurability, Focused Attention, User Context, Richness, Control) over local browser history. Labels domains as neutral / compulsion-risk / allowlist-critical.
- **Fast (runtime):** AttentionState inference (focused / drifting / compulsion) from signals: tab count, switch velocity, time-on-domain, topic drift, self-report.

Manual toggle remains as override. Validated that toggle alone "works a bit" but fails because compulsion erases the meta-cognition needed to flip it. The classifier is the real product.

### Fade-by-Design (the spine)

Reliance fades — not the tool, the user's need for it. The patterns layer does two jobs:

1. **Compulsion detection** — which domains, which sessions
2. **Capacity-growth detection** — per-Shield: trigger frequency over time, override rate, post-intervention behavior, self-report drift

Quarterly "graduation review" surfaces the data. The system reports; the user judges ("keep, modify, retire?"). Tone: reportorial, never congratulatory.

### Sync

Cross-device leaks confirmed as real failure mode. Encrypted JSON via iCloud Drive or similar — no servers. Part of v1, not deferred.

---

## Competitive Landscape (researched April 15)

**Closest competitors:** Browser Code (AI-grown userscripts), Dia Skills (natural-language browser customization).
**Gap nobody fills:** BCT-typed interventions + LLM authoring + compulsion-state triggers + equanimous constraints.
**Strongest positioning:** Equanimi as the reference implementation of the equanimity micro-pulse SDK (§5 of the primer) — the patterns layer + constraints + reliance-fade loop. That's what nobody else is building.

---

## Domain Consolidation (target state)

```
zenborg/
├── apps/
│   ├── web/                 ← Next.js app (garden view)
│   ├── browser/             ← WXT extension (groundskeeper)
│   └── mcp/                 ← MCP server (gardener's voice)
├── packages/
│   └── domain/
│       ├── cultivation/     ← area, habit, moment, cycle, phase
│       ├── protection/      ← shield, intervention, drift, budget, trigger, patterns
│       ├── rhythm/          ← time boundaries (rename from "tide")
│       ├── science/         ← bct, pdp
│       └── shared/          ← session, value-objects
```

### Mapping from trigger-taxonomy.md to Zenborg domain

| Trigger taxonomy (April 15) | Zenborg domain location |
|---|---|
| Signal, AttentionState, DomainClassification | `protection/drift.ts` |
| Trigger (predicates) | `protection/trigger.ts` |
| Intervention + BCT tags | `protection/intervention.ts` |
| Rule → **Shield** | `protection/shield.ts` |
| BCT / PDP | `science/bct.ts`, `science/pdp.ts` |
| EngagementMetrics → **patterns** | `protection/patterns.ts` |
| lifecycle / reliance_score | attaches to Shield |
| Ports (classifiers, runners) | `apps/` layer, not domain |

---

## Open Questions for Monday

### Architecture
1. **Which ~10 primitives** make the MCP intervention surface? Converge from candidates list.
2. **Garden-native name for time boundaries.** "Tides" is ocean. Seasons? Daylight? Frost line? Or just "boundaries"?
3. **Capacity-growth signals.** Don't over-engineer — but decide which 3-4 inputs feed `reliance_score`.
4. **Cross-surface communication.** How does the browser extension know about active moments / boundaries from the web app? Shared local storage? IPC?

### Primer (v0.2) — editorial pass
1. Defend or concede "you can't gamify non-reactivity"
2. "Mindful cyborg" audience — niche-as-discipline or path-to-broader?
3. Strategic Friction worked examples need to honor the willpower distinction
4. Pyramid symmetry — is Attentional Granularity as sturdy as the other 8?
5. Promote "equanimity micro-pulse SDK" from implication to thesis

### Product
6. **Zenborg naming** — does the name need to signal the protection mode? Or does "garden" imply defending it?
7. **Smallest MCP spike** — intent declaration + parking lot, nothing else?
8. **Web app role shift** — which current features are direct-manipulation-only vs. MCP-migratable?

---

## Suggested Monday Fork

Pick one:

- **(A) Spec the MCP tool surface** — both guardrails tools (cultivation + boundaries) and intervention primitives (protection). Principle-tagged. This defines the API.
- **(B) Update trigger-taxonomy.md** — rename Rule→Shield, drop EngagementMetrics→patterns, add lifecycle/reliance_score, align with Zenborg domain structure.
- **(C) Editorial pass on the primer** — mindful-tech-editor mode on the 5 open questions.
- **(D) Stub the MCP server** — minimal `apps/mcp` in Zenborg. Declare intent, parking lot, surface garden state. Two-week spike to see if you actually use it.
- **(E) Domain merge spike** — scaffold pnpm workspace, move types, see what breaks.

If sharpening: (A). If building: (D). If writing: (C).
