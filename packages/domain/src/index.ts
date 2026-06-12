/**
 * @keel/domain — Shared domain types for the keel platform.
 *
 * Pure types. No runtime dependencies. No framework coupling.
 * Both surfaces (desktop + browser) import from this package.
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

// ── Value Objects ───────────────────────────────────────────────
export type { Duration, Domain, AppName } from "./value-objects.js";
export {
  createDuration,
  fromMinutes,
  toMinutes,
  createDomain,
  createAppName,
} from "./value-objects.js";

// ── Behavioral Science ──────────────────────────────────────────
export type {
  BehavioralMechanism,
  UIPresentation,
  BCTReference,
  PDPReference,
  InterventionMetadata,
} from "./behavior.js";

// ── Intervention ────────────────────────────────────────────────
export type {
  InterventionClassification,
  InterventionDefinition,
  InterventionRegistry,
} from "./intervention.js";

// ── Trigger ─────────────────────────────────────────────────────
export type { TriggerCondition } from "./trigger.js";
export {
  createImmediateTrigger,
  createDelayedTrigger,
  createThresholdTrigger,
  createBudgetTrigger,
} from "./trigger.js";

// ── Budget ──────────────────────────────────────────────────────
export type {
  SessionUnit,
  BudgetDimension,
  BudgetDefinition,
  DimensionConsumption,
  BudgetConsumption,
} from "./budget.js";
export {
  createBudgetDefinition,
  computeOverallProgress,
} from "./budget.js";

// ── Session ─────────────────────────────────────────────────────
export type {
  SessionType,
  SessionStatus,
  SessionContext,
} from "./session.js";

// ── Drift ───────────────────────────────────────────────────────
export type { DriftAction, DriftSignal } from "./drift.js";
