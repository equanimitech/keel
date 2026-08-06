/**
 * RuleSpec — the friction authoring unit.
 *
 * Ported from `docs/primitive-contracts.md`, which has been the contract since
 * 2026-06-01 and existed in no `.ts` file until now. The layering there holds:
 *
 *   Rule wrapper (1)  — authoring unit, groups primitives + templates
 *   Primitives   (7)  — what the validator and runtime understand
 *   Intent aliases    — what the user talks *about*; desugared before validation
 *
 * All 7 primitives are typed here. Only `gate` and `cooldown` carry full
 * runtime shape; the other five are structural stubs so the interpreter can
 * dispatch exhaustively and later fill them in additively.
 *
 * ── The invariant, encoded in types ─────────────────────────────────────
 *
 * A tide (ambient observation) may arm a gate. It may NEVER arm a cooldown.
 * Locks require the user to reach for them, because self-invoked restriction
 * is a different mechanism from imposed restriction — BCT 1.9 Commitment
 * (MoA `values`), not compliance. Mark 2018's finding that blocking *raised*
 * workload for high-work-control users is about the imposed case.
 *
 * That rule lives in the type system rather than in a validator: a validator
 * is one code path among many and can be bypassed, whereas an unrepresentable
 * state cannot be constructed at all. `AmbientRule` simply has no slot a
 * cooldown fits into.
 *
 * ── On walls ────────────────────────────────────────────────────────────
 *
 * There is deliberately no `wall` primitive. The spec's equanimous constraints
 * require `gate.proceedAffordance` and `cooldown.unlockPath` — every notch keel
 * owns is escapable (Modification Rights). Genuine walls are external actuators
 * (a Screen Time passcode you don't record); keel surfaces them, never builds
 * one. So the invariant reduces to: ambient × cooldown is empty.
 */

import type { Duration } from "./value-objects.js";

// ── Shared types (spec §Shared types) ────────────────────────────

export interface SelectorChain {
  readonly primary: string;
  readonly fallbacks: readonly string[];
}

export type DataReference =
  | { readonly source: "self_storage"; readonly key: string }
  | { readonly source: "rule_storage"; readonly ruleId: RuleId; readonly key: string }
  | { readonly source: "snapshot_at_activation"; readonly property: string };

export type ConditionExpr =
  | { readonly op: "url_path_starts_with"; readonly path: string }
  | { readonly op: "url_matches"; readonly pattern: string }
  | { readonly op: "selector_text_matches"; readonly selector: string; readonly regex: string }
  | { readonly op: "selector_exists"; readonly selector: string }
  | {
      readonly op: "storage_value";
      readonly source: DataReference;
      readonly cmp: "eq" | "neq" | "gt" | "lt";
      readonly value: number | string;
    }
  /**
   * Threshold over the read-side log — what `relax` needs, and the one
   * condition that cannot be answered from the DOM. Restorative and compulsive
   * leisure are not separable by domain (YouTube is both, chess is both at one
   * game or fifteen), so the only honest discriminator is accumulated time.
   */
  | { readonly op: "dwell_today_exceeds"; readonly domain: string; readonly minutes: number }
  | { readonly op: "and"; readonly all: readonly ConditionExpr[] }
  | { readonly op: "or"; readonly any: readonly ConditionExpr[] }
  | { readonly op: "not"; readonly expr: ConditionExpr };

export type RuleId = string & { readonly __brand: "RuleId" };
export const createRuleId = (id: string): RuleId => id as RuleId;

// ── Templates (spec §Templates) ──────────────────────────────────

export type ReactiveBinding =
  | { readonly type: "literal"; readonly value: string | number }
  | { readonly type: "ref"; readonly source: DataReference }
  | {
      readonly type: "curve";
      readonly source: DataReference;
      readonly shape: "asymptote" | "linear" | "step";
      readonly params: Readonly<Record<string, number>>;
    }
  | {
      readonly type: "lerp";
      readonly source: DataReference;
      readonly min: number;
      readonly max: number;
      readonly progress: ReactiveBinding;
    }
  | {
      readonly type: "conditional";
      readonly when: ConditionExpr;
      readonly then: ReactiveBinding;
      readonly else: ReactiveBinding;
    };

export interface Template {
  readonly id: string;
  readonly content: string;
  readonly style?: Readonly<Record<string, string>>;
  readonly bindings?: Readonly<Record<string, ReactiveBinding>>;
}

// ── Primitive 2: gate (spec §Contract 2) ─────────────────────────

export type GateTrigger =
  | { readonly type: "navigation"; readonly when?: ConditionExpr }
  | { readonly type: "element_click"; readonly targets: SelectorChain }
  | { readonly type: "session_end" }
  /**
   * Fires every `everyMinutes` of *accumulated attended dwell* on the rule's
   * domains — a recurring stopping cue, which is the thing engagement-optimised
   * media removes on purpose. Not a wall-clock timer: time with the tab
   * backgrounded or the user idle does not count, so it interrupts watching
   * rather than merely existing.
   *
   * The spec's other triggers are all event-shaped because it was written for
   * in-page shields. Overconsumption has no event to hang on; the whole problem
   * is that nothing happens.
   */
  | { readonly type: "dwell"; readonly everyMinutes: number };

export type GateFriction =
  | { readonly type: "confirmation" }
  | { readonly type: "intention"; readonly prompt: string }
  | { readonly type: "delay"; readonly seconds: number }
  | { readonly type: "breath"; readonly cycles: number }
  | { readonly type: "value_recall"; readonly valueRef: DataReference };

export interface GateSpec {
  readonly kind: "gate";
  readonly trigger: GateTrigger;
  readonly frictionType: GateFriction;
  /** Required — no hard walls (Modification Rights). Not optional, by design. */
  readonly proceedAffordance: {
    readonly label: string;
    readonly action:
      | { readonly type: "continue" }
      | { readonly type: "redirect"; readonly to: string }
      | { readonly type: "abort" };
  };
  readonly abortAffordance?: { readonly label: string };
}

// ── Primitive 3: cooldown (spec §Contract 3) ─────────────────────

export type CooldownTrigger =
  | { readonly type: "event"; readonly when: ConditionExpr }
  | {
      readonly type: "manual";
      readonly affordances: readonly {
        readonly location: "popup" | "in_page_fab" | "tray";
        readonly options: readonly { readonly label: string; readonly seconds: number }[];
      }[];
    };

/**
 * Where the block is actually enforced — and therefore how far away the lift is.
 *
 * keel runs with the user's own permissions, so a keel-owned block is only ever
 * as strong as their willingness not to circumvent it. That is not a flaw to
 * engineer around; it is the ceiling. Strength comes from *distance to the
 * lift*, not from stricter code, which is the essay's own claim that friction
 * is psychological distance.
 *
 *   browser   — DNR. Lift: disable the extension. Seconds.
 *   resolver  — AdGuard/Pi over Tailscale. Lift: SSH in and edit. Across the room.
 *   device    — Screen Time passcode you generated and did not record. No lift you hold.
 *
 * Only `browser` is implemented. The others are actuator ports (per
 * `docs/ideas/2026-07-06-keel-as-attention-control-plane.md`) — keel decides
 * *when*, something further away enforces. Typed now so the ladder is legible
 * and the interpreter dispatches exhaustively.
 */
export type Enforcement =
  | { readonly at: "browser" }
  | { readonly at: "resolver"; readonly profile: string }
  | { readonly at: "device" };

/**
 * How long the lockout holds.
 *
 * `standing` never lapses. It is what the drogue blocklist has always been —
 * the reason that list survived the 2026-06-12 retirement as a separate
 * concept is that a temporal lockout could not express it. Now it can.
 */
export type CooldownDuration =
  | {
      readonly baseSeconds: number;
      readonly modifiers?: readonly {
        readonly condition: ConditionExpr;
        readonly multiplier: number;
      }[];
    }
  | { readonly standing: true };

export interface CooldownSpec {
  readonly kind: "cooldown";
  readonly trigger: CooldownTrigger;
  /** Defaults to `browser` when absent. */
  readonly enforcement?: Enforcement;
  readonly duration: CooldownDuration;
  readonly scope: {
    readonly disabledTargets: SelectorChain;
    /** Local-only. Never a remote key (Local-First). */
    readonly persistedKey: string;
  };
  /**
   * Required — Modification Rights. Every block keel owns has a way out.
   *
   * `out_of_band` is the honest name for the drogue's "edit the file and
   * reload" lift: a real path, deliberately outside the running system, so it
   * cannot be taken in the moment of wanting. Naming it beats pretending a
   * standing block has no exit (it does — you have root) or that `wait` covers
   * it (waiting never lifts a standing block).
   */
  readonly unlockPath:
    | { readonly type: "wait" }
    | { readonly type: "unlock_with_intention"; readonly prompt: string }
    | { readonly type: "unlock_with_delay"; readonly seconds: number }
    | { readonly type: "out_of_band"; readonly note: string };
  readonly surface: {
    readonly templateId: string;
    readonly anchors: SelectorChain;
  };
}

// ── Primitives 1, 4-7: typed, not yet interpreted ────────────────

export interface TransformSpec {
  readonly kind: "transform";
  readonly targets: SelectorChain;
  readonly replacement:
    | { readonly type: "hide" }
    | { readonly type: "replace"; readonly templateId: string }
    | { readonly type: "restyle"; readonly style: Readonly<Record<string, string>> };
}

export interface ObserveSpec {
  readonly kind: "observe";
  readonly signal: string;
  readonly persistedKey: string;
}

export interface ScheduleSpec {
  readonly kind: "schedule";
  readonly window: { readonly fromHour: number; readonly toHour: number };
  readonly wraps: PrimitiveSpec;
}

export interface InterceptSpec {
  readonly kind: "intercept";
  readonly event: "keydown" | "wheel" | "scroll" | "click";
  readonly whenKey?: string;
  readonly behavior: "suppress" | "redirect" | "rate_limit";
}

export interface ActuateSpec {
  readonly kind: "actuate";
  readonly targets: SelectorChain;
  readonly action: "pause" | "mute" | "scroll_to";
  readonly repeat?: { readonly everyMs: number };
}

export type PrimitiveSpec =
  | TransformSpec
  | GateSpec
  | CooldownSpec
  | ObserveSpec
  | ScheduleSpec
  | InterceptSpec
  | ActuateSpec;

/**
 * Primitives a tide is permitted to arm. `CooldownSpec` is absent, and that
 * absence IS the invariant — not a check that runs, but a shape that does not
 * exist.
 */
export type AmbientPrimitive = Exclude<PrimitiveSpec, CooldownSpec>;

// ── Rule wrapper (spec §Rule wrapper) ────────────────────────────

export type BehavioralMechanism =
  | "cue-removal"
  | "access-block"
  | "friction"
  | "substitution"
  | "self-monitoring";

export type FadeEligibility = "auto" | "manual" | "never";

interface RuleBase {
  readonly id: RuleId;
  readonly name: string;
  readonly description: string;
  /**
   * Sites this rule is about.
   *
   * The spec had a single `domain`, because it was written for in-page shields
   * (one LinkedIn feed, one YouTube stain). A network-level block covers many
   * domains at once — which is precisely why the drogue blocklist could never
   * be expressed as a Rule and survived as a separate list.
   */
  readonly domains: readonly string[];
  /**
   * Areas this rule targets, resolved to domains at serve time.
   *
   * The human unit. Nobody thinks "block youtube.com and chess.com and
   * reddit.com" — they think "step out of Entertainment for a bit". A rule
   * that names areas keeps working as the domain map grows; a rule that names
   * domains goes stale the first time a new site appears.
   */
  readonly areas?: readonly string[];
  readonly matches: readonly string[];
  readonly mechanism: BehavioralMechanism;
  readonly defaultEnabled: boolean;
  /** Must be declared — no implicit "forever" scaffolding. */
  readonly fadeEligibility: FadeEligibility;
  readonly persistAcrossSpaNavigation: boolean;
  readonly when?: ConditionExpr;
  readonly templates?: readonly Template[];
  readonly dependsOn?: readonly RuleId[];
  /** Required to carry an escalating cooldown multiplier (spec change #12). */
  readonly allowEscalation?: boolean;
}

/** Armed by a tide. Structurally cannot contain a cooldown. */
export interface AmbientRule extends RuleBase {
  readonly arming: "ambient";
  readonly primitives: readonly AmbientPrimitive[];
}

/** Armed by the user — in the moment, or in foresight for a later self. */
export interface SelfArmedRule extends RuleBase {
  readonly arming: "self-now" | "self-foresight";
  readonly primitives: readonly PrimitiveSpec[];
}

export type Rule = AmbientRule | SelfArmedRule;

// ── Validation ───────────────────────────────────────────────────

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Advisory findings. A rule with warnings is still valid. */
export interface RuleWarning {
  readonly code: string;
  readonly message: string;
}

const GLOBAL_MATCH = /^\*:\/\/\*\/\*$/;

/**
 * Smart constructor. A `Rule` value should only exist if it satisfies the
 * spec's Rule-level equanimous constraints, so validation lives at the
 * boundary rather than being a step callers may forget.
 *
 * Errors are phrased to be actionable — they are surfaced through an MCP tool
 * whose reader is an agent that must know what to do differently.
 */
export function createRule(
  input: Rule,
  knownRuleIds: readonly RuleId[] = []
): Validated<Rule> {
  const errors: string[] = [];

  if (input.matches.length === 0) {
    errors.push(
      `Rule "${input.id}": matches is empty. Give at least one URL pattern, e.g. ["*://youtube.com/*"].`
    );
  }
  for (const pattern of input.matches) {
    if (GLOBAL_MATCH.test(pattern)) {
      errors.push(
        `Rule "${input.id}": matches contains "*://*/*". Global scope needs review — name the domains instead.`
      );
    }
  }
  for (const dep of input.dependsOn ?? []) {
    if (!knownRuleIds.includes(dep)) {
      errors.push(
        `Rule "${input.id}": dependsOn references "${dep}", which is not committed. Declare it first, or drop the dependency.`
      );
    }
  }

  for (const primitive of input.primitives) {
    if (primitive.kind === "cooldown") {
      const duration = primitive.duration;
      if ("standing" in duration) {
        // A standing block must not pretend `wait` is its exit — waiting never
        // lifts one, and a lock whose stated way out does not work is worse
        // than an honest one.
        if (primitive.unlockPath.type === "wait") {
          errors.push(
            `Rule "${input.id}": a standing cooldown cannot unlock by waiting. Use { type: "out_of_band", note: "<where the lift lives>" }.`
          );
        }
      } else {
        if (duration.baseSeconds <= 0) {
          errors.push(
            `Rule "${input.id}": cooldown baseSeconds must be positive (got ${duration.baseSeconds}).`
          );
        }
        const escalates = (duration.modifiers ?? []).some((m) => m.multiplier > 1);
        if (escalates && input.allowEscalation !== true) {
          errors.push(
            `Rule "${input.id}": cooldown escalates (multiplier > 1), which is punishment-shaped. Set allowEscalation: true to accept that deliberately.`
          );
        }
      }
    }
    if (primitive.kind === "gate" && primitive.frictionType.type === "delay") {
      if (primitive.frictionType.seconds <= 0) {
        errors.push(`Rule "${input.id}": gate delay seconds must be positive.`);
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: input };
}

/** Does this cooldown never lapse on its own? */
export function isStanding(spec: CooldownSpec): boolean {
  return "standing" in spec.duration;
}

/** Advisory checks from the spec. Never block a commit. */
export function warningsFor(rule: Rule): readonly RuleWarning[] {
  const out: RuleWarning[] = [];
  for (const primitive of rule.primitives) {
    if (primitive.kind === "gate") {
      if (primitive.frictionType.type === "delay" && primitive.frictionType.seconds > 30) {
        out.push({
          code: "gate.delay.long",
          message: `A ${primitive.frictionType.seconds}s delay leans on willpower. Under 30s keeps it a beat rather than a punishment.`,
        });
      }
      if (primitive.frictionType.type === "confirmation") {
        out.push({
          code: "gate.friction.low_value",
          message: "A bare confirmation is dumb friction — it trains dismissal. Prefer intention or breath.",
        });
      }
    }
    if (primitive.kind === "cooldown") {
      const duration = primitive.duration;
      if (!("standing" in duration) && duration.baseSeconds > 3600) {
        out.push({
          code: "cooldown.duration.long",
          message: `${Math.round(duration.baseSeconds / 60)}min is long for a boundary. Cooldowns mark a limit; they are not a sentence.`,
        });
      }
    }
  }
  return out;
}

/** Total lockout duration for a cooldown, applying any accepted modifiers. */
export function cooldownDuration(
  spec: CooldownSpec,
  activeConditions: readonly ConditionExpr[] = []
): Duration | null {
  const duration = spec.duration;
  if ("standing" in duration) {
    return null; // Standing blocks have no duration to compute.
  }
  let seconds = duration.baseSeconds;
  for (const modifier of duration.modifiers ?? []) {
    if (activeConditions.includes(modifier.condition)) {
      seconds *= modifier.multiplier;
    }
  }
  return (seconds * 1000) as Duration;
}
