# Pitch: Equanimi Platform Unification

## Problem

We have two apps — a macOS desktop app (monotask) and a Chrome extension (equanimi) — solving the same problem at different system layers. Both are grounded in BCT science, both use "compass not cage" philosophy, both target compulsive digital behavior. But they share zero code, use different intervention taxonomies, and present as separate products.

The desktop app's Tauri ID is already `tech.equinami.monotask` — the unification was implied from day one. But the domain models have diverged:

- **Desktop** classifies interventions by UI presentation: `notification | compass | stain | dialog`
- **Browser** classifies by behavioral mechanism: `cue-removal | access-block | friction | environment`
- **Desktop** has rich BCT metadata (codes, PDPs, mechanisms of action); browser has none
- **Desktop** models explicit sessions with lifecycle hooks; browser is always-on
- **Desktop** uses fp-ts monads; browser uses vanilla TypeScript
- Both define budgets/constraints differently — or not at all

This divergence will compound. Every new intervention type, every budget rule, every BCT classification will be invented twice with slightly different semantics. Worse: building the cross-surface features that make equanimi a *platform* (e.g., desktop session intent modulating browser shield intensity) requires a shared vocabulary that doesn't exist yet.

## Appetite

**Big Batch: 1 week**

This shapes what's possible:
- Monorepo scaffolding + shared types package
- Refactor both apps to import shared types
- Validate both apps still build and run
- Document the shared domain model

This appetite explicitly excludes runtime integration between the two surfaces.

## Hypotheses

### H1 — Feasibility

**We believe that** we can extract a shared `@equanimi/domain` package containing ≥8 types used by both surfaces (Desktop + Browser) without breaking either app's build or increasing the time to add a new intervention.

**Antagonist**: The two tech stacks (Tauri/React/fp-ts vs. WXT/vanilla TS) are too different — shared types create coupling overhead and import resolution headaches that slow both surfaces down.

**Risk type**: Feasibility

### H2 — Viability (investment timing)

**We believe that** investing 1 week in shared infrastructure now prevents ≥2 major refactors when we ship the first cross-surface feature (e.g., budget sync), measured by whether the shared types are sufficient to implement that feature without redefining intervention/budget types in either surface.

**Antagonist**: Neither product has users yet. Infrastructure investment before validation is premature optimization. We should ship both independently, learn, and extract later.

**Risk type**: Viability

### MECE breakdown of H1

1. We believe pnpm workspaces + turborepo can orchestrate Tauri, Vite, and WXT builds in one repo
2. We believe a unified `InterventionDefinition` type can express both desktop presentation types and browser behavioral mechanisms
3. We believe BCT metadata can be shared without coupling to either app's runtime
4. We believe fp-ts dependency can be isolated to the desktop surface (shared types remain vanilla TS)
5. We believe `Budget` and `TriggerCondition` types can express both desktop session-scoped and browser always-on constraints without runtime coupling

## Experiment Design

### Context

```
*To verify that* we will restructure the mindful-tech directory
into a pnpm workspace monorepo with a shared domain package,
then refactor both apps to import from it.

Cost: 1 week engineering
Reliability: High (deterministic — either it builds or it doesn't)
```

### Structure

```
mindful-tech/                          (workspace root)
├── package.json                       (pnpm workspace config)
├── pnpm-workspace.yaml
├── turbo.json                         (optional — build orchestration)
├── packages/
│   └── domain/                        (@equanimi/domain)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── intervention.ts        InterventionDefinition, InterventionClassification
│           ├── behavior.ts            BehavioralMechanism, BCTReference, PDPReference
│           ├── trigger.ts             TriggerCondition
│           ├── budget.ts              Budget, BudgetDimension, BudgetConsumption
│           ├── session.ts             SessionContext (focus | always-on)
│           ├── drift.ts              DriftSignal
│           └── value-objects.ts       Duration, Domain (branded types)
├── apps/
│   ├── desktop/                       (equanimi-desktop, née monotask)
│   │   ├── package.json               (depends on @equanimi/domain)
│   │   ├── src/domain/                (app-specific domain: FocusSession aggregate, fp-ts)
│   │   └── ...
│   └── browser/                       (equanimi-browser, née equanimi)
│       ├── package.json               (depends on @equanimi/domain)
│       ├── modules/                   (shields, signals, budgets)
│       └── ...
└── docs/
    └── domain-model.md                (shared vocabulary reference)
```

### Flow

```
Step 1: Scaffold monorepo
├── pnpm-workspace.yaml
├── Move monotask → apps/desktop
└── Move equanimi → apps/browser

Step 2: Extract @equanimi/domain
├── Identify type overlap (from domain analysis)
├── Create unified types (vanilla TS, no fp-ts)
├── Design InterventionClassification (mechanism + presentation)
└── Include BCT metadata registry

Step 3: Refactor desktop to import shared types
├── Replace local InterventionType with shared InterventionClassification
├── Keep fp-ts wrappers in app-specific domain layer
├── Adapter: shared types ↔ desktop domain
└── Validate: pnpm dev + tauri dev still work

Step 4: Refactor browser to import shared types
├── Replace local ShieldDefinition.interventionType with shared BehavioralMechanism
├── Add BCT metadata to shield/signal definitions
├── Adapter: shared types ↔ browser domain
└── Validate: pnpm dev (wxt) still works

Step 5: Document shared domain model
└── docs/domain-model.md with type reference + decision log
```

### Metrics

*And measure*:
- **Primary**: Both apps build and run from monorepo (binary pass/fail)
- **Secondary**:
  - Number of shared types actually used by both surfaces (target: ≥8)
  - Lines of duplicated type definitions eliminated
  - Time to add a mock new intervention to both surfaces (should not increase by >15% vs. current single-app workflow)
- **Timeline**: 1 week

### Success Criteria

*We are right if*:
- [ ] Both `apps/desktop` and `apps/browser` build cleanly from monorepo root
- [ ] `@equanimi/domain` contains ≥8 types imported by both surfaces
- [ ] Adding a new `BehavioralMechanism` variant to the shared package is reflected in both surfaces' type system at compile time
- [ ] fp-ts remains isolated to desktop — shared package is vanilla TS
- [ ] No regression in either app's runtime behavior
- [ ] A developer can understand the shared vocabulary from `docs/domain-model.md` alone

## Rabbit Holes

**WXT build isolation**: WXT generates its own `tsconfig.json` (equanimi extends `.wxt/tsconfig.json`). Workspace package resolution may conflict with WXT's module resolution.
*Mitigation*: Test early — scaffold monorepo and validate `wxt dev` before any refactoring. WXT 0.19+ supports monorepo setups.

**Tauri build path expectations**: Tauri expects specific directory structure (`src-tauri/` relative to frontend). Moving to `apps/desktop/` may break Tauri's build assumptions.
*Mitigation*: Tauri config allows custom `frontendDist` and `devUrl` paths. Adjust `tauri.conf.json` before anything else.

**fp-ts type leakage**: If shared types use `Option<T>` or `Either<E, A>`, the browser surface gets an unwanted fp-ts dependency.
*Mitigation*: Hard rule — shared package uses `T | undefined` and `{ ok: T } | { error: E }` only. Desktop adapters wrap into fp-ts.

**Over-abstraction**: Designing the "perfect" shared type system before either product has validated its domain model.
*Mitigation*: Extract, don't predict. Start with types that already exist in both codebases. Mark speculative types as `@experimental` in JSDoc.

**Turborepo overhead**: Adding build orchestration tooling for two apps is potentially overkill.
*Mitigation*: Start with plain pnpm workspaces. Add turborepo only if build times justify it.

## No-Gos

**Out of scope for this experiment:**
- Public SDK / npm publish (internal package only)
- Runtime integration between desktop and browser (native messaging, shared state)
- Rewriting either app's architecture or state management
- Consumption pressure / cross-surface budget system
- New features in either app
- CI/CD pipeline setup
- Renaming "monotask" to "equanimi-desktop" in user-facing strings (brand work is separate)
- Other projects in mindful-tech/ (attently, penceive, stillwatch) — monorepo includes them structurally but no refactoring

## Prompt Themes Needed

1. **Monorepo scaffolding**: pnpm workspaces, workspace protocol, turbo.json (optional), root scripts
2. **Shared domain types**: Extract unified `InterventionDefinition`, `BehavioralMechanism`, `BCTReference`, `TriggerCondition`, `DriftSignal`, `SessionContext`, branded value objects
3. **Shared budget & constraint model**: Unify desktop's session-scoped duration with browser's multi-dimensional budgets into a single `Budget` / `BudgetDimension` / `BudgetConsumption` type system
4. **Desktop refactor**: Adapter layer between `@equanimi/domain` and desktop's fp-ts domain, update imports, validate Tauri build
5. **Browser refactor**: Enrich `ShieldDefinition` / `SignalDefinition` with shared types, add BCT metadata, validate WXT build
6. **Domain documentation**: Shared vocabulary reference, type decision log, contribution guide for new interventions
7. **Verification**: Build both apps, smoke test runtime behavior, verify type safety across surfaces

## Expected Outcomes

**If successful (criteria met)**:
- Shared domain vocabulary enables future cross-surface features (budget sync, session-aware shields)
- Adding new intervention types is faster (define once, use in both surfaces)
- BCT metadata becomes first-class in the browser extension (currently absent)
- Foundation for extractable public SDK once both products have users
- Brand unification has a technical backbone — not just a marketing story

**If unsuccessful (criteria not met)**:
- Build system incompatibilities mean monorepo adds friction, not reduces it
- Revert to separate repos with shared documentation (conceptual alignment only)
- Revisit when one or both products have shipped and the domain model has stabilized through real usage
- The domain analysis still has value — it becomes the spec for eventual unification

**Either way**: We learn whether these two surfaces can share infrastructure or should remain loosely coupled. This is a reversible decision — the monorepo can be unwound, but the domain analysis cannot be un-learned.
