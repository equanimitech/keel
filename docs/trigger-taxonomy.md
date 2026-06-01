# Trigger Taxonomy — Signal → State → Intervention

Domain model sketch for `zenborg/packages/domain/protection/`. Maps the 2019 Imperial thesis onto Zenborg's protection mode.

> **Naming context (April 16):** equanimitech = framework, Zenborg = product, equanimi = archived donor repo. "Rule" is now "Shield". "DomainPatterns" is now domain patterns. The garden metaphor: user's life = garden, user = gardener, Zenborg = toolshed. Shields are fences and netting.

## The layers

```
Signals  →  Metrics  →  State   →  Trigger  →  Intervention
(raw)      (thesis)    (inferred)  (rule)     (action, BCT-tagged)
```

Each layer is pure and immutable. Downstream layers observe upstream layers through explicit ports.

---

## 1. Primitives (branded value objects)

```ts
export type Domain = string & { readonly __brand: "Domain" };
export type Millis = number & { readonly __brand: "Millis" };
export type Score01 = number & { readonly __brand: "Score01" }; // 0..1
export type HourOfDay = number & { readonly __brand: "HourOfDay" }; // 0..23
export type ShieldId = string & { readonly __brand: "ShieldId" };
```

---

## 2. Signals — raw observations

The browser surface emits these. Pure data, no inference.

```ts
export type Signal =
  | { kind: "tab_count"; domain: Domain; count: number }
  | { kind: "tab_switch_velocity"; switchesPerMinute: number }
  | { kind: "time_on_domain"; domain: Domain; duration: Millis }
  | { kind: "return_gap"; domain: Domain; sinceLast: Millis }
  | { kind: "active_day"; domain: Domain; date: string }
  | { kind: "hour_tick"; hour: HourOfDay; isWeekend: boolean }
  | { kind: "topic_drift"; fromTopic: string; toTopic: string; distance: Score01 }
  | { kind: "self_report"; label: SelfReportLabel; note?: string };

export type SelfReportLabel =
  | "intentional"
  | "drifting"
  | "compulsion"
  | "unsure";
```

---

## 3. Metrics — thesis-derived, computed over signal windows

Direct translation of the Imperial thesis. These run nightly over local browser history.

```ts
export type DomainPatterns = {
  readonly domain: Domain;
  readonly window: DateRange;
  readonly endurability: EndurabilityMetrics;        // §5.2.1
  readonly focusedAttention: FocusedAttentionMetrics; // §5.2.2
  readonly userContext: UserContextMetrics;          // §5.2.3
  readonly richness: RichnessMetrics;                // §5.2.4
  readonly control: ControlMetrics;                  // §5.2.5
};

export type EndurabilityMetrics = {
  readonly activeDays: number;
  readonly maxStreak: number;
  readonly streakCount: number;
  readonly meanReturnTime: Millis;
  readonly medianReturnTime: Millis;
};

export type FocusedAttentionMetrics = {
  readonly totalTime: Millis;
  readonly meanSessionLength: Millis;
  readonly sessionsPerActiveDay: number;
};

export type UserContextMetrics = {
  readonly weekendRatio: Score01;
  readonly offPeakRatio: Score01; // 10pm–7am
};

export type RichnessMetrics = {
  readonly pathVariety: Score01;   // distinct URL paths / total visits
  readonly actionVariety: Score01; // click/scroll/input variety
};

export type ControlMetrics = {
  readonly userInitiatedRatio: Score01; // typed URL vs. redirected-in
};
```

---

## 4. Derived state — inference layer

The compulsion classifier and runtime state machine live here. Two scales:

```ts
// Slow signal: domain-level classification (nightly)
export type DomainClassification = {
  readonly domain: Domain;
  readonly class: DomainClass;
  readonly computedAt: Millis;
  readonly reasoning: readonly string[]; // explanations for user review
};

export type DomainClass =
  | { kind: "neutral" }
  | { kind: "compulsion_risk"; score: Score01 }
  | { kind: "allowlist_critical" }; // user-pinned, never intervene

// Fast signal: session-level state (runtime)
export type AttentionState =
  | { kind: "focused"; confidence: Score01 }
  | { kind: "drifting"; confidence: Score01; reason: string }
  | { kind: "compulsion"; confidence: Score01; domain: Domain };
```

---

## 5. Triggers — predicates over signals & state

```ts
export type Trigger =
  | { kind: "state_entered"; state: AttentionState["kind"] }
  | { kind: "domain_classified_as"; class: DomainClass["kind"] }
  | { kind: "metric_threshold"; path: MetricPath; op: ">" | "<"; value: number }
  | { kind: "schedule"; cron: string }
  | { kind: "compulsion_toggle" }
  | { kind: "post_session" }
  | { kind: "and"; all: readonly Trigger[] }
  | { kind: "or"; any: readonly Trigger[] };

export type MetricPath = string; // e.g. "endurability.meanReturnTime"
```

---

## 6. Interventions — BCT-tagged actions

Every intervention declares which Behavior Change Techniques it implements. Enables analysis, composition, and evaluation.

```ts
// Subset of Michie et al. (2013) BCT Taxonomy v1 — extend as needed
export type BCT =
  | "1.1_goal_setting_behaviour"
  | "1.2_problem_solving"
  | "1.5_review_behaviour_goals"
  | "1.9_commitment"
  | "2.3_self_monitoring_of_behaviour"
  | "5.1_information_about_consequences"
  | "7.1_prompts_cues"
  | "8.2_behavioural_substitution"
  | "12.1_restructuring_physical_environment"
  | "12.5_adding_objects_to_environment"
  | "15.3_focus_on_past_success";

export type Intervention = {
  readonly id: string;
  readonly name: string;
  readonly bcts: readonly BCT[];
  readonly action: InterventionAction;
  readonly appetite: Millis; // Shape-Up-style budget for how long it runs
};

export type InterventionAction =
  | { kind: "cooldown"; duration: Millis }
  | { kind: "friction_wall"; prompt: string; delay: Millis; allowSkip: boolean }
  | { kind: "hide_elements"; selectors: readonly string[] }
  | { kind: "replace_elements"; selectors: readonly string[]; with: string }
  | { kind: "prompt_intention"; question: string }
  | { kind: "reflect_post_session"; questions: readonly string[] }
  | { kind: "value_reminder"; message: string }
  // custom_script dropped — Zenborg stays declarative. Power users go to Tampermonkey.
```

---

## 7. Shield — composition unit

A Shield binds a Trigger to an Intervention within a scope. Shields are the shareable, authoring-time artifact. In the garden metaphor: fences and netting.

```ts
export type Shield = {
  readonly id: ShieldId;
  readonly name: string;
  readonly scope: readonly Domain[];
  readonly trigger: Trigger;
  readonly intervention: Intervention;
  readonly authoring: Authoring;
  readonly lifecycle: ShieldLifecycle;
  readonly relianceScore?: Score01; // computed monthly, undefined until first review
  readonly enabled: boolean;
  readonly createdAt: Millis;
};

export type ShieldLifecycle =
  | "active"
  | "retirement_candidate"
  | "retired";

export type Authoring =
  | { kind: "user_coded" }
  | { kind: "llm_drafted"; prompt: string; model: string; reviewedAt: Millis }
  | { kind: "bundled"; pack: string }; // shared intervention pack
```

---

## Example rules

```ts
// Manual compulsion toggle — applies cooldown to classified sites
const shield_compulsion_cooldown: Shield = {
  id: "rule_compulsion_cooldown" as RuleId,
  name: "Cooldown on compulsion-risk sites when toggle is on",
  scope: [], // empty scope = all domains classified as compulsion_risk
  trigger: {
    kind: "and",
    all: [
      { kind: "compulsion_toggle" },
      { kind: "domain_classified_as", class: "compulsion_risk" },
    ],
  },
  intervention: {
    id: "int_cooldown_5m",
    name: "5-minute cooldown",
    bcts: ["12.1_restructuring_physical_environment", "1.2_problem_solving"],
    action: { kind: "cooldown", duration: 300_000 as Millis },
    appetite: 300_000 as Millis,
  },
  authoring: { kind: "bundled", pack: "starter" },
  enabled: true,
  createdAt: Date.now() as Millis,
};

// YouTube Shorts friction wall during detected compulsion
const shield_shorts_friction: Shield = {
  id: "rule_shorts_friction" as RuleId,
  name: "Progressive friction on Shorts during compulsion",
  scope: ["youtube.com" as Domain],
  trigger: {
    kind: "and",
    all: [
      { kind: "state_entered", state: "compulsion" },
    ],
  },
  intervention: {
    id: "int_shorts_wall",
    name: "Shorts friction wall",
    bcts: [
      "7.1_prompts_cues",
      "12.1_restructuring_physical_environment",
      "1.5_review_behaviour_goals",
    ],
    action: {
      kind: "friction_wall",
      prompt: "You're in compulsion mode. What were you looking for?",
      delay: 10_000 as Millis,
      allowSkip: true,
    },
    appetite: 60_000 as Millis,
  },
  authoring: {
    kind: "llm_drafted",
    prompt: "Pause Shorts with a friction wall when I'm compulsively scrolling",
    model: "local-qwen-2.5-coder",
    reviewedAt: Date.now() as Millis,
  },
  enabled: true,
  createdAt: Date.now() as Millis,
};
```

---

## Ports (application layer, not in domain package)

These are the hexagonal edges. Implementations live in `apps/browser` and `apps/desktop`.

```ts
// Evaluates signals → state (runtime)
export interface AttentionClassifier {
  classify(recent: readonly Signal[]): AttentionState;
}

// Evaluates history → domain class (nightly)
export interface CompulsionClassifier {
  classify(domain: Domain, metrics: DomainPatterns): DomainClassification;
}

// Translates user intent → Shield (authoring)
export interface ShieldAuthor {
  draft(prompt: string, context: AuthoringContext): Promise<Shield>;
}

// Executes interventions
export interface InterventionRunner {
  run(intervention: Intervention, ctx: RunContext): Promise<RunResult>;
}
```

---

## Alignment with Zenborg domain structure

Target location: `zenborg/packages/domain/protection/`

| This sketch | Zenborg domain file |
|---|---|
| Signal, AttentionState, DomainClassification | `protection/drift.ts` |
| Trigger | `protection/trigger.ts` |
| Intervention + BCT tags | `protection/intervention.ts` |
| Shield (was Rule) | `protection/shield.ts` |
| DomainPatterns (was EngagementMetrics) | `protection/patterns.ts` |
| BCT / PDP | `science/bct.ts`, `science/pdp.ts` |
| Ports (classifiers, runners) | `apps/` layer, not domain |

No fp-ts, all readonly, factory functions (not shown but trivial to add per-type).

---

## Open questions

1. How does `AttentionState` persist across tabs? Single source of truth in the extension background script, or per-tab with reconciliation?
2. Are Shields shareable as-is (JSON export), or do we need a portable IR that strips local ids? (Matters for the "Rafa's anti-Shorts pack" future.)
3. Cross-surface communication: how does the browser extension know about active moments / boundaries from the MCP/web app?
4. Garden-native name for time boundaries (the "Tide" concept). Seasons? Daylight? Or just "boundaries"?
