/**
 * @keel/domain — Shared domain types for the keel platform.
 *
 * The log is the product: one append-only ActivityEvent stream per
 * surface, one event grammar (docs/event-taxonomy.md), read-side
 * derivations later (slice E). The intervention layer was retired on
 * 2026-06-12 (docs/decisions/2026-06-12-retire-the-intervention-layer-…)
 * — it returns as a separate module (P5) built on personal baselines.
 *
 * Design rules:
 * - Vanilla TypeScript only (no fp-ts, no React, no Tauri, no Chrome APIs)
 * - All types are readonly / immutable
 * - Factory functions for construction, never classes
 * - No side effects — types and pure functions only
 */

// ── Activity Log (observability substrate) ──────────────────────
export type { ActivitySurface, ActivityEventKind, ActivityEvent } from "./activity.js";
export { createActivityEvent, LEGACY_KIND_ALIASES, canonicalKind } from "./activity.js";

// ── Route Registry ─────────────────────────────────────────────
export { ROUTE_REGISTRY, normalizeRoute } from "./route.js";

// ── Bouts (read-side behavioral unit; the one dwell methodology) ─
export type { Bout } from "./bouts.js";
export { bouts, BOUT_GAP_MS, SEGMENT_CAP_MS } from "./bouts.js";

// ── Tides (observational reading over bouts — never a protocol) ──
export type {
  DomainClass,
  DomainClassifier,
  TideLabel,
  Absorption,
  TideThresholds,
  TideReading,
} from "./tide.js";
export { tide, classifierFromLedger, DEFAULT_THRESHOLDS } from "./tide.js";

// ── Rules (friction authoring unit; primitive-contracts.md) ──────
export type {
  RuleId,
  Rule,
  AmbientRule,
  SelfArmedRule,
  PrimitiveSpec,
  AmbientPrimitive,
  GateSpec,
  GateTrigger,
  GateFriction,
  CooldownSpec,
  CooldownTrigger,
  Enforcement,
  TransformSpec,
  ObserveSpec,
  ScheduleSpec,
  InterceptSpec,
  ActuateSpec,
  Template,
  ReactiveBinding,
  ConditionExpr,
  DataReference,
  SelectorChain,
  BehavioralMechanism,
  FadeEligibility,
  Validated,
  RuleWarning,
} from "./rules.js";
export { createRule, createRuleId, warningsFor, cooldownDuration } from "./rules.js";

// ── Value Objects ───────────────────────────────────────────────
export type { Duration, Domain, AppName } from "./value-objects.js";
export {
  createDuration,
  fromMinutes,
  toMinutes,
  createDomain,
  createAppName,
} from "./value-objects.js";
