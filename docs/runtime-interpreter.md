# Runtime Interpreter

Bridges a committed `RuleSpec` to live DOM behavior. The interpreter is the deterministic substrate; the LLM never runs at page time.

## Goals

- One generic engine that executes any Rule composed from the 7 primitives.
- No Rule-specific code paths. Adding a new shield = committing a new spec, not writing a new entrypoint.
- Clean unregister — every primitive knows how to reverse itself.
- Survives SPA navigation when the Rule declares it.

## Non-goals (v1)

- Multi-Rule choreography. Each Rule is independent.
- Running untrusted LLM JavaScript. The interpreter executes specs, not generated code. (Generated code path is a later layer — see `pipeline-flow.md` "experimental" stage.)
- Hot-reloading Rule specs in place. Register/unregister cycle is fine.

## Placement

```
packages/domain/
  src/rules/
    spec.ts              # RuleSpec + primitive interfaces + shared types (pure)
    templates.ts         # Template + ReactiveBinding (pure)
    conditions.ts        # ConditionExpr (pure; no evaluation here)

apps/browser/
  modules/rules/
    interpreter/
      engine.ts          # register(rule), unregister(ruleId), activate/deactivate
      scope.ts           # per-Rule lifecycle context (cleanup stack, class toggle, storage)
      conditions.ts      # evaluate(ConditionExpr, ctx) — browser-bound side
      bindings.ts        # resolve(ReactiveBinding, ctx) — curves, refs, snapshots
      primitives/
        transform.ts
        gate.ts
        cooldown.ts
        observe.ts
        schedule.ts
        intercept.ts
        actuate.ts
      spa.ts             # MutationObserver + history patching for persistAcrossSpaNavigation
      storage.ts         # self/rule storage adapter (chrome.storage.local)
```

Domain stays pure. All DOM / Chrome API contact is in `apps/browser/modules/rules/interpreter/`.

## Lifecycle

```
register(rule)
  → allocate RuleScope (id, class name, cleanup stack, storage handle)
  → install SPA hooks if persistAcrossSpaNavigation
  → attemptActivation()
      → evaluate rule.when (and ambient conditions)
      → if false: wait for SPA signal, retry
      → if true: for each primitive, primitiveKind.activate(spec, scope)
      → push cleanup thunks onto scope.cleanupStack
  → on SPA change / storage change / URL change:
      → re-evaluate; if previously active and now inactive: deactivate()
      → if previously inactive and now active: attemptActivation()

unregister(ruleId)
  → deactivate (drain cleanup stack in LIFO order)
  → remove SPA hooks
  → drop RuleScope
```

Key property: every `activate` returns a cleanup function. The scope is a stack. `deactivate` runs them LIFO. This is how `cleanupOnUnregister: true` is enforced structurally, not by convention.

## Primitive contracts (internal)

Each primitive module exports a uniform shape:

```ts
interface PrimitiveRunner<S extends PrimitiveSpec> {
  readonly kind: S["kind"];
  activate(spec: S, scope: RuleScope): Cleanup;
}

type Cleanup = () => void;
```

The engine dispatches on `spec.kind` — no switch statement, just a map.

## RuleScope

```ts
interface RuleScope {
  readonly rule: RuleSpec;
  readonly className: string;                 // e.g. equanimi-<ruleId>-active
  readonly cleanupStack: Cleanup[];
  readonly storage: RuleStorage;              // scoped to this Rule + reads allowed from dependsOn
  readonly snapshots: Map<string, unknown>;   // snapshot_at_activation captures land here
  addCleanup(fn: Cleanup): void;
  snapshot(key: string, value: unknown): void;
  resolve(binding: ReactiveBinding): unknown;
}
```

`className` is the handle used by `transform/restyle` with `scope: "rule_class"` — the engine toggles it on `<html>` during activation and removes it on deactivation. This is the generalization of the trick the existing `youtube-shorts.content/style.css` already uses.

## Conditions evaluation

`ConditionExpr` is a pure data structure in domain. Evaluation is in the browser module. Triggers for re-evaluation:

- URL change (navigation event, history patch)
- SPA mutation (debounced)
- Storage change (for `storage_value` conditions on `dependsOn` Rules)
- Ambient clock tick (for time-based conditions, rare)

Evaluation is cheap — tree walk of a small expression. No perf concern at the scale of tens of Rules.

## Reactive bindings

`ReactiveBinding` resolution reads from `DataReference` sources:

- `self_storage` / `rule_storage` → `RuleStorage` (chrome.storage.local, partitioned by rule id)
- `snapshot_at_activation` → `RuleScope.snapshots`

Curves and lerps are pure math on resolved sources. Templates re-render on source change — the engine subscribes the template to its sources at activation.

## SPA handling

One shared `SpaObserver` per browser tab:

- Patches `history.pushState` / `replaceState` to emit URL-change events.
- One top-level `MutationObserver` with subtree:true on `<body>`, debounced ~50ms.
- Fans out to registered Rule scopes whose `persistAcrossSpaNavigation` is true.

Each scope re-runs `attemptActivation()` / `deactivate()` on signal. Primitives don't own SPA logic — the engine does.

## Migration proof: `linkedin-feed-hide`

The smallest cut to prove the engine end-to-end.

Inputs:
- `RuleSpec` for linkedin-feed-hide (from `spec-smoke-test.md`, serialized as JSON).
- The engine above, implementing at minimum: dispatcher, `RuleScope`, `transform` primitive with `replacement: template`, `Template` renderer, SPA observer.

Outputs:
- `apps/browser/entrypoints/rules.content/index.ts` — a single content script that loads committed Rule specs for the current domain and registers them with the engine.
- `apps/browser/modules/rules/index.ts` — the engine entry.
- Remove `apps/browser/entrypoints/linkedin-feed-hide.content/` once the Rule-based version is verified.

Acceptance:
- Installing the extension with the new entrypoint and the committed linkedin-feed-hide Rule produces the same visible behavior as the current hand-coded shield.
- Unregistering the Rule at runtime (via the shields dashboard) fully restores the feed with no orphan DOM.

## Then: `youtube-shorts-scroll-lock`

Proves `intercept`, `actuate`, `transform/restyle`, and `when` composition. If this works, the 7-primitive set is runtime-validated.

Two primitives it forces into existence in code:

1. `intercept` with event listener management + `whenKey` filter on `keydown`.
2. `actuate` with `trigger: dom_event`, `action: scroll_to` using `snapshot_at_activation`, `repeat: while_condition_holds`.

## Build order

1. Domain types (`packages/domain/src/rules/`) — just move the interfaces from `primitive-contracts.md` into TS.
2. Engine skeleton + `transform` primitive + SPA observer.
3. LinkedIn migration + swap entrypoint.
4. `intercept` + `actuate` primitives.
5. YouTube shorts migration.
6. Remaining primitives (`gate`, `cooldown`, `observe`, `schedule`) as the corresponding shields get migrated.

Est. 1-2 days to step 3 (working LinkedIn proof). Another 1-2 days to step 5.

## Open

- **Storage partitioning.** `RuleStorage` needs a clean per-Rule prefix. Proposal: `chrome.storage.local` key = `rule:<ruleId>:<key>`. `dependsOn` grants read-only access to another Rule's prefix, enforced in the adapter.
- **Committed Rule source.** Where does the content script load Rule specs from? For the migration proof: bundled JSON in `apps/browser/src/rules/*.json`. Later: `chrome.storage.local` populated by the commit pipeline.
- **Template rendering.** Plain DOM string injection for v1. No JSX, no framework. `style` map applies inline. `bindings` subscribe to sources and swap textContent on change.
