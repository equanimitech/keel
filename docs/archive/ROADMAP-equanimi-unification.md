# Equanimi Platform Roadmap

> Format: Now / Next / Later
> Scope: Unification of Equanimi Desktop (née monotask) + Equanimi Browser (née equanimi)
> Constraint: Solo founder. Fixed time, variable scope.

---

## NOW — Shared Infrastructure (1 week appetite)

The pitch is approved. This is the execution plan.

### Critical path

```
Day 1: Spike + Scaffold
│
├─ [SPIKE] Verify WXT builds inside pnpm workspace (30 min)
│  └─ If fails → STOP. Revert to "conceptual alignment only" (pitch fallback)
│
├─ [SPIKE] Verify Tauri builds with relocated frontend (30 min)
│  └─ If fails → adjust tauri.conf.json paths, retry
│
└─ Scaffold monorepo
   ├─ pnpm-workspace.yaml
   ├─ Move monotask → apps/desktop
   ├─ Move equanimi → apps/browser
   └─ ✅ Gate: both `pnpm dev` commands work from root

Day 2-3: Shared Domain Package
│
├─ Create packages/domain/
│  ├─ InterventionDefinition + InterventionClassification
│  ├─ BehavioralMechanism (union of browser + desktop types)
│  ├─ BCTReference + PDPReference + InterventionMetadata
│  ├─ TriggerCondition (immediate | delayed | threshold | budget-based)
│  ├─ SessionContext (focus | always-on)
│  ├─ DriftSignal
│  └─ Branded value objects (Duration, Domain)
│
└─ Budget & constraint model
   ├─ Budget + BudgetDimension + BudgetConsumption
   └─ Must express both session-scoped (desktop) and rolling-window (browser)

Day 4: Refactor Both Surfaces
│
├─ [PARALLEL] Desktop adapter
│  ├─ Import @equanimi/domain types
│  ├─ Adapter: shared ↔ fp-ts domain layer
│  └─ ✅ Gate: tauri dev still works
│
└─ [PARALLEL] Browser adapter
   ├─ ShieldDefinition uses shared BehavioralMechanism
   ├─ Add BCTReference to shield/signal definitions
   └─ ✅ Gate: wxt dev still works

Day 5: Verify + Document
│
├─ Build both apps from monorepo root
├─ Smoke test runtime (start session on desktop, toggle shield on browser)
├─ Count shared types (target: ≥8)
├─ Write docs/domain-model.md
└─ ✅ Gate: all success criteria from pitch met
```

### MoSCoW for the week

**Must-have**:
- Monorepo scaffold with both apps building
- `@equanimi/domain` package with core intervention types
- At least ONE surface importing shared types and compiling

**Should-have**:
- BOTH surfaces importing shared types
- Budget model unified
- BCT metadata available to browser extension

**Could-have**:
- `docs/domain-model.md` reference
- Turborepo build orchestration

**Won't-have** (off-sides):
- Public npm publish
- Runtime integration between surfaces
- New features in either app
- CI/CD pipeline
- Brand rename in user-facing strings
- Touching attently / penceive / stillwatch

### Dependencies

| Dependency | Type | Risk | Mitigation |
|---|---|---|---|
| WXT monorepo support | Technical | Medium | Spike on Day 1. Kill switch if fails. |
| Tauri path relocation | Technical | Low | Config change. Well-documented in Tauri docs. |
| fp-ts isolation | Technical | Low | Hard rule: shared package = vanilla TS only. |
| Domain model decisions | Knowledge | Medium | Extract existing types first, design later. |

---

## NEXT — Ship Both Surfaces (weeks 2-4)

The unification work must NOT block shipping. These are parallel tracks.

### Equanimi Browser → Chrome Web Store (priority #1)

This is the wedge product. Lower friction, faster validation cycle.

- [ ] Final shield/signal polish (YouTube + Chess.com modules)
- [ ] Chrome Web Store listing (screenshots, description, privacy policy)
- [ ] Submit for review
- [ ] **Validate**: multi-module activation hypothesis (≥30% of users enable 2+ site modules)
- [ ] Collect uninstall rate + organic review signals

**Why first**: Browser extension installs are frictionless. Testing desirability of multi-site attention shields gives signal for the entire equanimi platform thesis.

### Equanimi Desktop → Alpha (friends & family)

Longer road due to macOS permissions + code signing.

- [ ] macOS accessibility permission flow (required for window tracking)
- [ ] Code signing (Apple Developer Program)
- [ ] Alpha distribution (TestFlight or direct .dmg)
- [ ] **Validate**: does drift awareness change behavior? (qualitative feedback)

### Brand foundation

- [ ] equinami.tech landing page (manifesto + product links)
- [ ] Visual identity (minimal — logo, color, typography)
- [ ] Rename monotask → "Equanimi Desktop" in user-facing strings

---

## LATER — Platform (months 2-3+)

Only pursue if NEXT validates core hypotheses.

### Cross-surface integration

- Chrome Native Messaging protocol (desktop ↔ browser)
- Desktop session intent modulates browser shield intensity
- Browser watch time / drift data flows to desktop session context
- Unified budget dashboard (web page, not in either app)

### Equanimi Browser v2

- LinkedIn module (feed scroll blocking, sidebar hiding)
- Consumption pressure model (cross-domain detection)
- Budget configuration UI in manage page
- Budget-driven signal intensity + shield escalation
- Firefox support

### Equanimi Desktop v2

- Session pattern history + weekly reflection
- Progressive friction escalation
- Capture review interface
- Preferences sync across sessions

### SDK extraction

- Publish `@equanimi/domain` as public npm package
- Write contribution guide for third-party intervention developers
- Position as the "BCT standard for attentive design"
- **Gate**: Only after shared types have been battle-tested by both surfaces with real users

---

## Capacity Allocation (solo founder reality)

```
70% → Shipping (NEXT items — browser + desktop + brand)
20% → Infrastructure (NOW items — monorepo + shared domain)
10% → Exploration (LATER items — specs, research, spikes)
```

The infrastructure week (NOW) front-loads the 20% so it doesn't drag across months. After that, the ratio inverts: almost all time goes to shipping.

---

## Decision Points

**After NOW (end of week 1)**:
- Did the monorepo work? If not, revert to separate repos + shared docs.
- Are shared types actually useful, or just overhead? Honest assessment.

**After NEXT (end of month 1)**:
- Does the browser extension have traction? (≥30% multi-module, ≤40% uninstall)
- Does desktop alpha get qualitative signal? ("that pause helped me catch myself")
- If both fail: revisit the entire equanimi thesis before investing more.

**After LATER begins (month 2+)**:
- Is cross-surface integration worth the complexity? Only build if users ask for it.
- Is the SDK extractable, or is the domain model still shifting? Don't publish prematurely.

---

*Last updated: 2026-02-22*
*Appetite for NOW: 1 week. Approved via PITCH-equanimi-unification.md.*
