# Primitive Contracts

The structural contracts that any LLM-generated intervention must satisfy. These are the vocabulary the LLM composes from, the shapes the validator checks, and the runtime types the interpreter dispatches on.

Revised after the shield audit (`shield-audit-vs-contracts.md`) and smoke test (`spec-smoke-test.md`). The original 5-primitive sketch was derived from the chess shield alone and undercounted. The full shield surface requires **7 foundational primitives**, a Rule wrapper, and a small set of shared concepts (templates, conditions, reactive bindings, data references).

## Layers

| Layer | Count | Purpose |
|---|---|---|
| Rule wrapper | 1 | Authoring unit — groups primitives, templates, and metadata |
| Foundational primitives | 7 | What the validator and runtime understand |
| Intent aliases | ~5 and growing | What the user/LLM talks *about*; desugared before validation |

The foundational layer is contract. The intent layer is presentation.

## The 7 foundational primitives

```
1. transform   — modify a DOM region (replace, hide, restyle)
2. gate        — interrupt a navigation/action with a user-actionable surface
3. cooldown    — temporal lockout after a triggering event
4. observe     — silent recording of a behavioral signal
5. schedule    — temporal binding wrapping another primitive
6. intercept   — event behavior modification (suppress, redirect, rate-limit)
7. actuate     — side effect on an interactive/media element
```

Coverage: every module in the existing browser extension (9 shields + 2 cooldown modes + 2 signals) decomposes into these seven, with composition inside a single Rule.

---

## Rule wrapper

A **Rule** is the authoring unit. It groups one or more primitives, optional templates, and Rule-level metadata. Validators and the runtime both operate on Rules, not on bare primitives.

```ts
interface RuleSpec {
  // Identity and metadata
  readonly id: RuleId;
  readonly name: string;
  readonly description: string;
  readonly domain: string;                      // e.g. "linkedin.com"
  readonly matches: readonly string[];          // URL match patterns

  // Behavioral classification (metadata for patterns layer)
  readonly mechanism: BehavioralMechanism;      // e.g. "cue-removal", "access-block"

  // Lifecycle
  readonly defaultEnabled: boolean;
  readonly fadeEligibility: "auto" | "manual" | "never";
  readonly persistAcrossSpaNavigation: boolean; // default true — re-apply on DOM mutation

  // Conditional scope — if present, ALL primitives only act when condition holds
  readonly when?: ConditionExpr;

  // Body
  readonly primitives: readonly PrimitiveSpec[];
  readonly templates?: readonly Template[];

  // Cross-Rule dependencies (promoted from v2; needed for youtube-stain)
  readonly dependsOn?: readonly RuleId[];       // explicit declaration, user-acknowledged at commit
}
```

**Equanimous constraints checked at the Rule level:**

- `fadeEligibility` must be declared (no implicit "forever" scaffolding).
- `matches` must be non-empty and not `*://*/*` (no global scope without review).
- `dependsOn` Rules must exist and be committed; the validator warns the user at commit time when a new dependency is introduced.
- `when` is evaluated before any primitive activates; if the condition doesn't hold, primitives remain inert (not the same as unregistered — re-evaluated on navigation/mutation when `persistAcrossSpaNavigation` is true).

---

## Templates

Templates are a separate authorable concept. Primitives reference them by `templateId`. This keeps presentation separable from behavior and lets the LLM author both independently.

```ts
interface Template {
  readonly id: string;
  readonly content: string;                     // text or HTML fragment
  readonly style?: Readonly<Record<string, string>>; // CSS-in-JS style map
  readonly bindings?: TemplateBindings;         // reactive data slots
}

// Reactive binding language — powers youtube-stain and youtube-watch-time
type TemplateBindings = Readonly<Record<string, ReactiveBinding>>;

type ReactiveBinding =
  | { readonly type: "literal"; readonly value: string | number }
  | { readonly type: "ref"; readonly source: DataReference }
  | { readonly type: "curve";
      readonly source: DataReference;
      readonly shape: "asymptote" | "linear" | "step";
      readonly params: CurveParams }
  | { readonly type: "lerp";
      readonly source: DataReference;
      readonly min: number;
      readonly max: number;
      readonly progress: ReactiveBinding }
  | { readonly type: "conditional";
      readonly when: ConditionExpr;
      readonly then: ReactiveBinding;
      readonly else: ReactiveBinding };

type DataReference =
  | { readonly source: "self_storage";   readonly key: string }
  | { readonly source: "rule_storage";   readonly ruleId: RuleId; readonly key: string }
  | { readonly source: "snapshot_at_activation"; readonly property: string };
```

`snapshot_at_activation` is the runtime-captured value at the moment the primitive activates. Used by the shorts scroll-lock to remember where the scrollTop was when the lock turned on.

---

## Contract 1: `transform`

Modify a region of the DOM. Replacement may be empty (hide), text (substitute), a templated overlay, or a set of scoped CSS rules.

```ts
interface TransformSpec {
  readonly kind: "transform";
  readonly target: SelectorChain;
  readonly replacement:
    | { readonly type: "hide" }
    | { readonly type: "text"; readonly content: string }
    | { readonly type: "template"; readonly templateId: string; readonly bindings?: TemplateBindings }
    | { readonly type: "restyle";
        readonly rules: readonly CssRule[];
        readonly scope: "rule_class" | "global" };
  readonly preserveOriginal: boolean;
  readonly cleanupOnUnregister: true;
}

interface CssRule {
  readonly selector: string;
  readonly properties: Readonly<Record<string, string | number>>;
}
```

The `restyle` replacement emerged from the youtube-shorts smoke test: killing scroll-snap, overflow, and nav buttons is a CSS concern, not a DOM-mutation concern. With `scope: "rule_class"`, the runtime scopes all rules under an auto-generated class on `<html>` (e.g. `equanimi-shorts-scroll-lock-active`) that it toggles based on activation.

**Equanimous constraints:**
- `preserveOriginal` must be `true` unless explicitly overridden (Modification Rights).
- `cleanupOnUnregister: true` is a hard contract (no orphan mutations or stale classes).
- `target.fallbacks` must include at least one entry when the primary selector isn't an attribute or data-test hook (resilience to site changes).
- `restyle` with `scope: "global"` triggers a warning (rare legitimate use; usually a sign of escape-hatch thinking).

**Refused BCTs/PDPs:**
- BCT 10.4 (social reward) — template bindings may not reference other-user data.
- PDP "social facilitation" — no cross-user comparison in replacement content.

**Aliases:**
- `conceal` — `transform` with `replacement: { type: "hide" }`
- `substitute` — `transform` with `replacement: { type: "text" | "template" }`

---

## Contract 2: `gate`

Interrupt a navigation or action with a surface the user must engage with to proceed.

```ts
interface GateSpec {
  readonly kind: "gate";
  readonly trigger: GateTrigger;
  readonly frictionType:
    | { readonly type: "confirmation" }
    | { readonly type: "intention"; readonly prompt: string }
    | { readonly type: "delay"; readonly seconds: number }
    | { readonly type: "breath"; readonly cycles: number }
    | { readonly type: "value_recall"; readonly valueRef: DataReference };
  readonly proceedAffordance: {
    readonly label: string;
    readonly action:
      | { readonly type: "continue" }
      | { readonly type: "redirect"; readonly to: string }
      | { readonly type: "abort" };
  };
  readonly abortAffordance?: { readonly label: string };
}
```

**Equanimous constraints:**
- `proceedAffordance` is required (no hard walls — Modification Rights).
- `frictionType: delay` with `seconds > 30` warns (willpower overuse).
- `frictionType: confirmation` flagged as low-value (dumb friction — Strategic Friction principle).
- Same-surface repeated firing within a session is capped (Peripheral Presence).

**Refused BCTs/PDPs:**
- BCT 10.1 (material reward) — no reward for proceeding/aborting.
- PDP "praise" — no celebratory feedback on abort.

**Aliases:**
- `invite_intention` — `gate` with `frictionType.type: "intention"`
- `redirect` — `gate` with `proceedAffordance.action.type: "redirect"`
- `value_remind` — `gate` with `frictionType.type: "value_recall"`
- `reflect` — `gate` triggered on `session_end`

---

## Contract 3: `cooldown`

Temporal lockout: after a triggering event, restrict access for a duration.

```ts
interface CooldownSpec {
  readonly kind: "cooldown";
  readonly trigger: CooldownTrigger;
  readonly duration: {
    readonly baseSeconds: number;
    readonly modifiers?: readonly {
      readonly condition: ConditionExpr;
      readonly multiplier: number;
    }[];
  };
  readonly scope: {
    readonly disabledTargets: SelectorChain;
    readonly persistedKey: string;
  };
  readonly unlockPath:
    | { readonly type: "wait" }
    | { readonly type: "unlock_with_intention"; readonly prompt: string }
    | { readonly type: "unlock_with_delay"; readonly seconds: number };
  readonly surface: {
    readonly templateId: string;
    readonly anchors: SelectorChain;
  };
}

type CooldownTrigger =
  | { readonly type: "event"; readonly when: ConditionExpr }
  | { readonly type: "manual";
      readonly affordances: readonly {
        readonly location: "popup" | "in_page_fab";
        readonly options: readonly { readonly label: string; readonly seconds: number }[];
      }[] };
```

**Equanimous constraints:**
- `unlockPath` required (Modification Rights).
- `duration.modifiers` with `multiplier > 1` is **flagged-for-review** (escalation is punishment-shaped; legitimate occasionally but needs a Rule-level override flag).
- `baseSeconds > 3600` warns (boundary, not punishment).
- `scope.persistedKey` must be local-only (Local-First).

**Refused BCTs/PDPs:**
- BCT 14.3 (reduce reward as punishment) — cooldowns are boundaries, not consequences.
- PDP "punishment" — surface templates flagged for punitive language.

**Note on chess:** the existing chess shield's `escalateOnLoss: 2x` pattern now carries a required override flag on the Rule. The shield can keep it; the override surfaces in the patterns layer.

---

## Contract 4: `observe`

Silent recording of a behavioral signal for the patterns layer.

```ts
interface ObserveSpec {
  readonly kind: "observe";
  readonly signal: SignalDefinition;
  readonly storage: {
    readonly local: true;
    readonly retention: { readonly days: number };
  };
  readonly userVisibility: {
    readonly surfaceIn: readonly ("patterns_dashboard" | "rule_detail" | "weekly_review")[];
    readonly format: "raw" | "aggregated" | "narrative";
  };
}
```

**Equanimous constraints:**
- `storage.local` must be `true` (hard Local-First requirement).
- `userVisibility.surfaceIn` must be non-empty (no silent observation — Attentional Granularity).
- `storage.retention.days > 365` warns.

**Refused BCTs/PDPs:**
- PDP "self-monitoring" framed as shame.
- BCT 2.7 (feedback on outcomes) deployed without consent to be observed.

---

## Contract 5: `schedule`

Temporal binding wrapping another primitive.

```ts
interface ScheduleSpec {
  readonly kind: "schedule";
  readonly window: ScheduleWindow;
  readonly wraps: PrimitiveSpec;
  readonly outsideWindow: "inactive" | "passthrough";
}
```

**Equanimous constraints:**
- `wraps.kind !== "schedule"` (no nested schedules at v1).
- `window.span > 16h/day` warns (rigid scaffolding).
- Inherits `fadeEligibility` from wrapped primitive's Rule.

---

## Contract 6: `intercept`

Event behavior modification. Doesn't touch DOM; rewrites how a page responds to user or environmental events.

```ts
interface InterceptSpec {
  readonly kind: "intercept";
  readonly target: SelectorChain;
  readonly events: readonly ("wheel" | "touchmove" | "touchstart" | "keydown" | "keyup" | "click" | "scroll")[];
  readonly whenKey?: readonly string[];          // for keydown/keyup — only intercept these keys
  readonly behavior:
    | { readonly type: "suppress" }                              // preventDefault + stopPropagation
    | { readonly type: "redirect"; readonly toAction: ActuateAction }
    | { readonly type: "rate_limit"; readonly minIntervalMs: number };
}
```

`whenKey` emerged from the shorts shield: interception is often keyboard-specific (ArrowUp, ArrowDown, PageUp, PageDown, Space, j, k), not global.

**Equanimous constraints:**
- `suppress` requires a visible affordance elsewhere on the page explaining why the behavior is blocked (Attentional Granularity — user must know why scroll doesn't work).
- `rate_limit` with `minIntervalMs > 1000` warns (heavy-handed).
- Interception on `click` with `suppress` is flagged-for-review (close to a hard wall — typically want `gate` instead).

**Refused BCTs/PDPs:**
- None directly; risks come from composition (e.g., suppression without affordance).

---

## Contract 7: `actuate`

Side effect on an interactive or media element. Used for "do something to the page" cases that aren't DOM mutation or event interception: pause a video, reset scroll, blur a field.

```ts
interface ActuateSpec {
  readonly kind: "actuate";
  readonly target: SelectorChain;
  readonly trigger: ActuateTrigger;
  readonly action: ActuateAction;
  readonly repeat: "once" | "while_condition_holds";
}

type ActuateTrigger =
  | { readonly type: "rule_activation" }                        // fires when primitive activates
  | { readonly type: "dom_event"; readonly event: string }      // fires on DOM event on target
  | { readonly type: "condition"; readonly when: ConditionExpr };

type ActuateAction =
  | { readonly type: "pause_media" }
  | { readonly type: "mute_media" }
  | { readonly type: "blur" }
  | { readonly type: "focus" }
  | { readonly type: "scroll_to";
      readonly position: {
        readonly source: "literal" | "snapshot_at_activation";
        readonly property?: "scrollTop" | "scrollLeft";
        readonly value?: number;
      } };
```

`snapshot_at_activation` lets `scroll_to` express "scroll back to where it was when the lock turned on" — the runtime captures the scrollTop at activation, and each `scroll` event triggers a reset to that captured value.

`repeat: "while_condition_holds"` means the action re-fires whenever the trigger fires *and* activation conditions are still met. The shorts scroll-lock uses this implicitly — every scroll event triggers a reset.

**Equanimous constraints:**
- `pause_media` on elements the user just started playing intentionally warns (interrupting active engagement).
- `repeat: while_condition_holds` on triggers that fire >10Hz requires rate-limit review.
- `focus` is rare and flagged (hijacking caret is usually coercive).

**Refused BCTs/PDPs:**
- BCT 10.1 (reward) — no reward animations as actuation.
- PDP "rewards and punishment" — no punitive side effects.

---

## Composition

1. **A Rule has a list of primitives, not one.** Multiple primitives on the same or different targets inside one Rule is the norm. youtube-shorts uses four: one `transform/restyle`, two `intercept`, one `actuate`.
2. **Primitives in a Rule share the Rule's `when` clause.** If `when` is present at the Rule level, every primitive is scoped by it. This avoids repeating URL path conditions on each primitive.
3. **Templates are referenced by id, not inlined.** This gives a single place to inspect and review the presentation layer, and lets the validator check template content against refused-pattern lists (punitive language, social comparison renders, etc.).
4. **Aliases desugar at parse time.** `invite_intention` becomes `gate` with `frictionType.type: "intention"` before any validator runs. The validator layer only ever sees foundational primitives.
5. **Cross-Rule references are explicit.** A Rule that reads another Rule's storage must list the producer in `dependsOn`. The user acknowledges the dependency at commit. Prevents hidden coupling.

---

## Shared types

```ts
type SelectorChain = {
  readonly primary: string;
  readonly fallbacks: readonly string[];
};

type ConditionExpr =
  | { readonly op: "url_path_starts_with"; readonly path: string }
  | { readonly op: "url_matches"; readonly pattern: string }
  | { readonly op: "selector_text_matches"; readonly selector: string; readonly regex: string }
  | { readonly op: "selector_exists"; readonly selector: string }
  | { readonly op: "storage_value";
      readonly source: DataReference;
      readonly cmp: "eq" | "neq" | "gt" | "lt";
      readonly value: number | string }
  | { readonly op: "and"; readonly all: readonly ConditionExpr[] }
  | { readonly op: "or";  readonly any: readonly ConditionExpr[] }
  | { readonly op: "not"; readonly expr: ConditionExpr };
```

---

## Summary of changes from v1 sketch

| # | Change | Source |
|---|---|---|
| 1 | 5 → 7 foundational primitives (added `intercept`, `actuate`) | Shield audit (shorts, youtube-cooldown) |
| 2 | Rule is a wrapper over `primitives: PrimitiveSpec[]` | Smoke test (LinkedIn simplest case already uses list shape) |
| 3 | `templates` as separate authorable concept | Smoke test |
| 4 | `transform.replacement` gains `restyle` type | Smoke test (shorts CSS-side cue removal) |
| 5 | `intercept.whenKey` filter | Smoke test (shorts keyboard) |
| 6 | `actuate.repeat` and `snapshot_at_activation` value source | Smoke test (shorts scroll lock) |
| 7 | Rule-level `when: ConditionExpr` scopes all primitives | Smoke test (shorts activates only on `/shorts`) |
| 8 | `persistAcrossSpaNavigation` at Rule level | Smoke test (LinkedIn, YouTube are SPAs) |
| 9 | Cross-Rule references via `dependsOn` + `DataReference.rule_storage` | Audit (youtube-stain reads watch-time) |
| 10 | Reactive binding language on templates | Audit (stain intensity curve, watch-time counter) |
| 11 | Manual cooldown triggers with declared affordances | Audit (linkedin-cooldown, chess FAB) |
| 12 | Chess escalation×2 requires Rule-level override flag | Original contracts (now explicit in refused BCTs) |

---

## What remains open

- **Composition beyond single Rule.** Multi-Rule choreography (Rule A's abort triggers Rule B's cooldown) is not expressible. Probably unneeded at v1 — flag on encounter.
- **Intent vocabulary.** 5 aliases is a starting set. More will emerge from authoring. Architecture permits additions without changing foundational contracts.
- **Value store.** `value_recall` references a `DataReference`, but where do user-authored values live? Probably a dedicated `values` Rule type (a Rule whose only primitive is `observe` with a literal seed). Leave for v1.1.
- **`schedule` with `outsideWindow: "passthrough"`** is ill-defined for most primitives — only meaningful for `gate` and `cooldown`. Validator should enforce this pairing or deprecate the option.

---

## What this answers

- **How many primitives:** 7 foundational, ~5 intent aliases that desugar to them.
- **Where the validator works:** on the desugared Rule spec, at the foundational primitive layer.
- **How existing shields fit:** audited in `shield-audit-vs-contracts.md`; two hand-written specs (LinkedIn, YouTube shorts) confirmed the contracts in `spec-smoke-test.md`.
- **What "primitives as contracts" means:** typed spec interfaces + a per-primitive constraint set + a refused BCT/PDP list + a runtime dispatcher that knows how to execute each kind.

Next: migrate `linkedin-feed-hide` from its current hand-coded implementation to the Rule+spec format as a working proof.
