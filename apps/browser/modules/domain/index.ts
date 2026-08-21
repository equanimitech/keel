/**
 * keel domain: the pure attention substrate the extension writes and reads.
 *
 * This was `@keel/domain`, a workspace package shared by three surfaces. Two of
 * them are gone: the tray was replaced by zenborg's observer and the agent never
 * imported TypeScript. The extension is the sole consumer, so the package was
 * inlined here on 2026-08-21 (slice B, step 6) and the modules nothing imported
 * (`rules.ts`, `tide.ts`, `areas.ts`) went with it. The event-taxonomy
 * contract and the read-side pitfalls moved to `docs/` at the repo root.
 *
 * Design rules, unchanged:
 * - Vanilla TypeScript only (no React, no Chrome APIs)
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
export type { Bout, Run } from "./bouts.js";
export { bouts, runs, BOUT_GAP_MS, SEGMENT_CAP_MS, RUN_GAP_MS, MIN_RUN_MS } from "./bouts.js";

// ── Moment friction (allow / deny, scoped to the active moment) ──
export type { MomentFriction, MomentVerdict } from "./moment-friction.js";
export { momentVerdict, NO_MOMENT_FRICTION } from "./moment-friction.js";

// ── Value Objects ───────────────────────────────────────────────
export type { Duration, Domain, AppName } from "./value-objects.js";
export {
  createDuration,
  fromMinutes,
  toMinutes,
  createDomain,
  createAppName,
} from "./value-objects.js";
