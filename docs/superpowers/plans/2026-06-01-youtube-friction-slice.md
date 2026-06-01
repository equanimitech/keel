# YouTube Friction Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Strategic Friction model in the domain (with the renderer port + band, and the definition schism resolved), classify every intervention onto the friction ladder declaratively, and implement YouTube as the first real driver+renderer: watch time drives a friction dial that dims the player (stain) and, at a configurable daily limit, triggers a cooldown until a configurable reset hour — overridable by spending a scarce monthly skip credit, with a scoreless reflection. Remove the popup on/off toggles.

**Architecture:** `Friction` (`f ∈ [0,1]`), `frictionCurve`, reset helpers, `FrictionRung`/`FrictionBand`, and the `FrictionRenderer` port are canonical in `@equanimi/domain`. `frictionBand?` is added to the canonical `InterventionDefinition`; the browser's `ShieldDefinition`/`SignalDefinition` become aliases of it (one model). The YouTube watch-time content script becomes the usage-vs-budget **driver** (writes `domainFriction("youtube.com")`, pins the cooldown at the limit). The watch-stain becomes the first **dim renderer** reading that friction. The 8 binary shields gain a *declared* band but keep their on/off runtime.

**Tech Stack:** TypeScript, WXT, `wxt/storage`, pnpm workspaces, Vitest (new, in `@equanimi/domain`).

**Verification model:** Pure domain logic is TDD'd with Vitest. Extension/DOM wiring has no test harness here, so it is verified with `pnpm typecheck` + explicit manual steps. **Do not run dev servers — ask the user to load/observe the extension.**

**Phasing:** Phase 0 (Tasks 1–7) is domain model + schism refactor — no behaviour change, verified by typecheck/tests. Phase 1 (Tasks 8–13) is the YouTube feature (driver, stain renderer, popup, manage, skip-credit override + reflection). Each task commits independently.

**Known limitation (accepted for this slice):** the friction driver lives in the watch-time content script, so friction only accrues while the Watch Time signal is enabled (default on). Moving the driver to the background worker is deferred.

---

## File Structure

**Create:**
- `packages/domain/src/friction.ts` — `frictionCurve`, `logicalDayString`, `nextResetTimestamp`, `FrictionRung`, `FRICTION_LADDER`, `FrictionBand`, `createFrictionBand`, `FrictionRenderer`.
- `packages/domain/src/value-objects.test.ts`, `packages/domain/src/friction.test.ts`.

**Modify:**
- `packages/domain/src/value-objects.ts` — `Friction` + `createFriction`.
- `packages/domain/src/intervention.ts` — add `frictionBand?` to `InterventionDefinition`.
- `packages/domain/src/index.ts` — export new types/functions.
- `packages/domain/package.json` — Vitest devDep + `test` script.
- `apps/browser/modules/shields/types.ts`, `apps/browser/modules/signals/types.ts` — become aliases of `InterventionDefinition`.
- All 9 shield definitions + 2 signal definitions — nested `classification` + `frictionBand`.
- `apps/browser/utils/storage.ts` — `domainFriction(domain)` + `domainCooldownOverride(domain)`.
- `apps/browser/entrypoints/youtube-watch-time.content/index.ts` — reset-hour day boundary + friction driver + limit→cooldown + counter styled by `f` + `limit-history` recording.
- `apps/browser/entrypoints/youtube-stain.content/index.ts` — dim renderer reading `domainFriction`.
- `apps/browser/entrypoints/youtube-cooldown.content/index.ts` + `style.css` — skip-credit override (suppress enforcement during override window) + scoreless reflection.
- `apps/browser/entrypoints/popup/main.ts` + `style.css` — read-only status, no toggles.
- `apps/browser/entrypoints/manage/main.ts` — add soft-start + reset-hour + skip config; remove dead stain range inputs.

---

# Phase 0 — Domain model + schism resolution

## Task 1: Add Vitest to the domain package

**Files:** Modify `packages/domain/package.json`

- [ ] **Step 1: Add the dev dependency**

Run: `pnpm --filter @equanimi/domain add -D vitest`
Expected: `vitest` under `devDependencies`.

- [ ] **Step 2: Add the `test` script**

Edit `packages/domain/package.json` `scripts` to:
```json
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Verify the toolchain**

Run: `pnpm --filter @equanimi/domain test`
Expected: Vitest starts; "No test files found" is acceptable.

- [ ] **Step 4: Commit**
```bash
git add packages/domain/package.json pnpm-lock.yaml
git commit -m "chore(domain): add vitest for pure-primitive tests"
```

---

## Task 2: `Friction` value object (clamp)

**Files:** Modify `packages/domain/src/value-objects.ts`; Test `packages/domain/src/value-objects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/value-objects.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFriction } from "./value-objects.js";

describe("createFriction", () => {
  it("passes through values within [0,1]", () => {
    expect(createFriction(0)).toBe(0);
    expect(createFriction(0.5)).toBe(0.5);
    expect(createFriction(1)).toBe(1);
  });
  it("clamps below 0 to 0", () => {
    expect(createFriction(-0.3)).toBe(0);
  });
  it("clamps above 1 to 1", () => {
    expect(createFriction(1.7)).toBe(1);
  });
  it("treats NaN as 0", () => {
    expect(createFriction(Number.NaN)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @equanimi/domain test`
Expected: FAIL — `createFriction` not exported.

- [ ] **Step 3: Implement**

Append to `packages/domain/src/value-objects.ts`:
```ts

// ── Friction ────────────────────────────────────────────────────

/** Friction intensity for a compulsion arm, clamped to [0, 1]. */
export type Friction = number & { readonly __brand: "Friction" };

/** Clamp any number into a valid Friction ∈ [0, 1]. NaN becomes 0. */
export const createFriction = (n: number): Friction => {
  if (Number.isNaN(n)) {
    return 0 as Friction;
  }
  return Math.min(1, Math.max(0, n)) as Friction;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @equanimi/domain test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add packages/domain/src/value-objects.ts packages/domain/src/value-objects.test.ts
git commit -m "feat(domain): add Friction value object with clamp"
```

---

## Task 3: `frictionCurve`

**Files:** Create `packages/domain/src/friction.ts`; Test `packages/domain/src/friction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/friction.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { frictionCurve } from "./friction.js";

describe("frictionCurve", () => {
  it("is 0 before the min threshold", () => {
    expect(frictionCurve(0, 5, 60)).toBe(0);
    expect(frictionCurve(5 * 60 - 1, 5, 60)).toBe(0);
  });
  it("is 0 exactly at the min threshold", () => {
    expect(frictionCurve(5 * 60, 5, 60)).toBe(0);
  });
  it("reaches ~0.95 at the max threshold", () => {
    const f = frictionCurve(60 * 60, 5, 60);
    expect(f).toBeGreaterThan(0.94);
    expect(f).toBeLessThan(0.96);
  });
  it("never exceeds 1", () => {
    expect(frictionCurve(10 * 60 * 60, 5, 60)).toBeLessThanOrEqual(1);
  });
  it("guards against max <= min (collapses to min+1 minute)", () => {
    const f = frictionCurve(120 * 60, 60, 30);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @equanimi/domain test`
Expected: FAIL — cannot resolve `./friction.js`.

- [ ] **Step 3: Implement**

Create `packages/domain/src/friction.ts`:
```ts
/**
 * Pure friction helpers + the friction-ladder vocabulary shared by all
 * compulsion arms. No DOM, no storage, no framework coupling.
 */
import type { Friction } from "./value-objects.js";
import { createFriction } from "./value-objects.js";

/** −ln(0.05) ≈ 2.996 — makes the curve reach ~95% at the max threshold. */
const NEAR_MAX = -Math.log(0.05);

/**
 * Asymptotic friction curve.
 *
 *   f(t) = 1 − exp(−(t − min) / τ),  τ = (max − min) / −ln(0.05)
 *
 * Returns 0 below `minMinutes`, rising toward ~0.95 at `maxMinutes`.
 * `maxMinutes` is guarded to at least `minMinutes + 1` so τ is finite.
 */
export const frictionCurve = (
  seconds: number,
  minMinutes: number,
  maxMinutes: number,
): Friction => {
  const minSeconds = minMinutes * 60;
  const maxSeconds = Math.max(minMinutes + 1, maxMinutes) * 60;
  if (seconds < minSeconds) {
    return createFriction(0);
  }
  const tau = (maxSeconds - minSeconds) / NEAR_MAX;
  return createFriction(1 - Math.exp(-(seconds - minSeconds) / tau));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @equanimi/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/domain/src/friction.ts packages/domain/src/friction.test.ts
git commit -m "feat(domain): add shared frictionCurve"
```

---

## Task 4: Reset-hour day boundary + next-reset timestamp

**Files:** Modify `packages/domain/src/friction.ts`; Test `packages/domain/src/friction.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/src/friction.test.ts`:
```ts
import { logicalDayString, nextResetTimestamp, monthKey } from "./friction.js";

describe("logicalDayString", () => {
  it("groups times after the reset hour into the same day", () => {
    const morning = new Date(2026, 5, 1, 6, 0, 0).getTime();
    const night = new Date(2026, 5, 1, 23, 0, 0).getTime();
    expect(logicalDayString(morning, 5)).toBe(logicalDayString(night, 5));
  });
  it("places times before the reset hour in the previous logical day", () => {
    const preDawn = new Date(2026, 5, 2, 3, 0, 0).getTime();
    const prevEvening = new Date(2026, 5, 1, 22, 0, 0).getTime();
    expect(logicalDayString(preDawn, 5)).toBe(logicalDayString(prevEvening, 5));
  });
  it("rolls to a new logical day at the reset hour", () => {
    const before = new Date(2026, 5, 2, 4, 59, 0).getTime();
    const after = new Date(2026, 5, 2, 5, 1, 0).getTime();
    expect(logicalDayString(before, 5)).not.toBe(logicalDayString(after, 5));
  });
});

describe("nextResetTimestamp", () => {
  it("returns a time strictly in the future", () => {
    const now = new Date(2026, 5, 1, 12, 0, 0).getTime();
    expect(nextResetTimestamp(now, 5)).toBeGreaterThan(now);
  });
  it("returns the same-day reset hour when now is before it", () => {
    const now = new Date(2026, 5, 1, 3, 0, 0).getTime();
    const expected = new Date(2026, 5, 1, 5, 0, 0).getTime();
    expect(nextResetTimestamp(now, 5)).toBe(expected);
  });
  it("returns tomorrow's reset hour when now is past it", () => {
    const now = new Date(2026, 5, 1, 9, 0, 0).getTime();
    const expected = new Date(2026, 5, 2, 5, 0, 0).getTime();
    expect(nextResetTimestamp(now, 5)).toBe(expected);
  });
  it("is at most 24h away", () => {
    const now = new Date(2026, 5, 1, 5, 0, 1).getTime();
    expect(nextResetTimestamp(now, 5) - now).toBeLessThanOrEqual(
      24 * 60 * 60 * 1000,
    );
  });
});

describe("monthKey", () => {
  it("returns YYYY-MM for the local month", () => {
    expect(monthKey(new Date(2026, 5, 15, 12, 0, 0).getTime())).toBe("2026-06");
  });
  it("changes at the month boundary", () => {
    const jun = monthKey(new Date(2026, 5, 30, 23, 0, 0).getTime());
    const jul = monthKey(new Date(2026, 6, 1, 1, 0, 0).getTime());
    expect(jun).not.toBe(jul);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @equanimi/domain test`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

Append to `packages/domain/src/friction.ts`:
```ts

/**
 * Logical-day key for a reset-hour-based day boundary. The "day" rolls
 * over at `resetHour` local time, not midnight: shift the clock back by
 * `resetHour` hours, then take the calendar date.
 */
export const logicalDayString = (
  nowMs: number,
  resetHour: number,
): string => {
  const shifted = new Date(nowMs - resetHour * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Timestamp (ms) of the next local `resetHour`:00 strictly after `nowMs`. */
export const nextResetTimestamp = (
  nowMs: number,
  resetHour: number,
): number => {
  const next = new Date(nowMs);
  next.setHours(resetHour, 0, 0, 0);
  if (next.getTime() <= nowMs) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
};

/** Calendar-month key "YYYY-MM" in local time — for monthly credit refills. */
export const monthKey = (nowMs: number): string => {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @equanimi/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/domain/src/friction.ts packages/domain/src/friction.test.ts
git commit -m "feat(domain): add logicalDayString + nextResetTimestamp"
```

---

## Task 5: Friction ladder, band, and renderer port

**Files:** Modify `packages/domain/src/friction.ts`; Test `packages/domain/src/friction.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/src/friction.test.ts`:
```ts
import { FRICTION_LADDER, createFrictionBand } from "./friction.js";

describe("FRICTION_LADDER", () => {
  it("is ordered from least to most friction", () => {
    expect(FRICTION_LADDER).toEqual(["hide", "dim", "delay", "blur", "block"]);
  });
});

describe("createFrictionBand", () => {
  it("keeps the rung and clamps engagesAt into [0,1]", () => {
    expect(createFrictionBand("hide", 1)).toEqual({ rung: "hide", engagesAt: 1 });
    expect(createFrictionBand("dim", -2)).toEqual({ rung: "dim", engagesAt: 0 });
    expect(createFrictionBand("block", 5)).toEqual({ rung: "block", engagesAt: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @equanimi/domain test`
Expected: FAIL — `FRICTION_LADDER` / `createFrictionBand` not exported.

- [ ] **Step 3: Implement**

Append to `packages/domain/src/friction.ts`:
```ts

// ── Friction ladder ─────────────────────────────────────────────

/** A rung on the friction ladder — escalating cost of access. */
export type FrictionRung = "hide" | "dim" | "delay" | "blur" | "block";

/** The ladder, ordered from least to most friction. */
export const FRICTION_LADDER: readonly FrictionRung[] = [
  "hide",
  "dim",
  "delay",
  "blur",
  "block",
];

/**
 * The friction band an intervention expresses: the ladder `rung` it
 * paints, and the `engagesAt` threshold at which it begins. A binary
 * shield is the degenerate band { rung, engagesAt: 1 }.
 */
export interface FrictionBand {
  readonly rung: FrictionRung;
  readonly engagesAt: Friction;
}

export const createFrictionBand = (
  rung: FrictionRung,
  engagesAt: number,
): FrictionBand => ({ rung, engagesAt: createFriction(engagesAt) });

/**
 * Renderer port. Implemented by DOM adapters in the browser surface —
 * never in the domain. Given the current friction, paint it.
 */
export interface FrictionRenderer {
  render(f: Friction): void;
  clear(): void;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @equanimi/domain test`
Expected: PASS (all friction + clamp tests green).

- [ ] **Step 5: Commit**
```bash
git add packages/domain/src/friction.ts packages/domain/src/friction.test.ts
git commit -m "feat(domain): add friction ladder, band, and renderer port"
```

---

## Task 6: Add `frictionBand` to the canonical definition + export everything

**Files:** Modify `packages/domain/src/intervention.ts`, `packages/domain/src/index.ts`

- [ ] **Step 1: Add the field to `InterventionDefinition`**

In `packages/domain/src/intervention.ts`, add a `FrictionBand` import and the optional field. Change the import block (currently lines 12–16) to:
```ts
import type {
  BehavioralMechanism,
  UIPresentation,
  InterventionMetadata,
} from "./behavior.js";
import type { FrictionBand } from "./friction.js";
```
Then add to `InterventionDefinition`, right after the `defaultEnabled` field (currently line 56):
```ts
  /** Where this intervention sits on the friction ladder. */
  readonly frictionBand?: FrictionBand;
```

- [ ] **Step 2: Export from the barrel**

In `packages/domain/src/index.ts`, change the Value Objects exports (currently lines 15–22) to include `Friction` + `createFriction`, and add the friction module exports after them:
```ts
export type { Duration, Domain, AppName, Friction } from "./value-objects.js";
export {
  createDuration,
  fromMinutes,
  toMinutes,
  createDomain,
  createAppName,
  createFriction,
} from "./value-objects.js";

// ── Friction ────────────────────────────────────────────────────
export type { FrictionRung, FrictionBand, FrictionRenderer } from "./friction.js";
export {
  frictionCurve,
  logicalDayString,
  nextResetTimestamp,
  monthKey,
  FRICTION_LADDER,
  createFrictionBand,
} from "./friction.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add packages/domain/src/intervention.ts packages/domain/src/index.ts
git commit -m "feat(domain): add frictionBand to InterventionDefinition + export friction module"
```

---

## Task 7: Resolve the definition schism + declare bands

Make the browser definition types aliases of the canonical `InterventionDefinition`, migrate all 11 definitions to nested `classification` + a `frictionBand`. No runtime/behaviour change (the popup/manage/background mappers read `id/name/description/domain/icon/defaultEnabled` only).

**Files:** Modify `apps/browser/modules/shields/types.ts`, `apps/browser/modules/signals/types.ts`, and all 11 definition files.

- [ ] **Step 1: Replace the shield type with the canonical alias**

Overwrite `apps/browser/modules/shields/types.ts` with:
```ts
/**
 * A shield is an intervention with a subtractive behavioral mechanism.
 * Structurally it is the canonical InterventionDefinition; the
 * shield/signal distinction lives in classification.mechanism and in
 * which registry it belongs to.
 */
export type { InterventionDefinition as ShieldDefinition } from "@equanimi/domain";
```

- [ ] **Step 2: Replace the signal type with the canonical alias**

Overwrite `apps/browser/modules/signals/types.ts` with:
```ts
/**
 * A signal is an intervention with an additive (awareness) mechanism.
 * Structurally it is the canonical InterventionDefinition.
 */
export type { InterventionDefinition as SignalDefinition } from "@equanimi/domain";
```

- [ ] **Step 3: Migrate one definition as the worked example**

Overwrite `apps/browser/modules/shields/youtube-shorts/definition.ts` with:
```ts
import type { ShieldDefinition } from "../types";
import { createFrictionBand } from "@equanimi/domain";

export const youtubeShorts: ShieldDefinition = {
  id: "youtube-shorts-scroll-lock",
  name: "Shorts Scroll Lock",
  description: "Blocks compulsive scrolling on YouTube Shorts",
  domain: "youtube.com",
  icon: "\u{1F4FA}",
  classification: { mechanism: "access-block" },
  frictionBand: createFrictionBand("block", 1),
  defaultEnabled: true,
};
```

The transform for every file: drop `mechanism: "<m>",` → add `classification: { mechanism: "<m>" },` and `frictionBand: createFrictionBand("<rung>", <engagesAt>),`, and add the `createFrictionBand` import. Keep all other fields verbatim.

- [ ] **Step 4: Migrate the remaining 8 shields**

Apply the Step-3 transform to each file below using these exact values:

| File (under `apps/browser/modules/shields/`) | const | mechanism | rung | engagesAt |
|---|---|---|---|---|
| `youtube-shorts-homepage/definition.ts` | `youtubeShortsHomepage` | `cue-removal` | `hide` | `1` |
| `youtube-sidebar-recs/definition.ts` | `youtubeSidebarRecs` | `cue-removal` | `hide` | `1` |
| `youtube-comments-hide/definition.ts` | `youtubeCommentsHide` | `access-block` | `hide` | `1` |
| `youtube-sponsored/definition.ts` | `youtubeSponsored` | `cue-removal` | `hide` | `1` |
| `chess-post-game-cooldown/definition.ts` | `chessPostGameCooldown` | `friction` | `delay` | `1` |
| `linkedin-feed-hide/definition.ts` | `linkedinFeedHide` | `cue-removal` | `hide` | `1` |
| `linkedin-notification-badge/definition.ts` | `linkedinNotificationBadge` | `cue-removal` | `hide` | `1` |
| `linkedin-promoted-posts/definition.ts` | `linkedinPromotedPosts` | `cue-removal` | `hide` | `1` |

Preserve each file's existing `id`, `name`, `description`, `domain`, `icon`, `defaultEnabled`, and (for chess) its doc comment. Example for chess:
```ts
import type { ShieldDefinition } from "../types";
import { createFrictionBand } from "@equanimi/domain";

/**
 * Post-game cooldown for chess.com.
 * ... (keep existing comment) ...
 */
export const chessPostGameCooldown: ShieldDefinition = {
  id: "chess-post-game-cooldown",
  name: "Post-Game Cooldown",
  description: "Pauses before you can start a new game after finishing one",
  domain: "chess.com",
  icon: "♟️",
  classification: { mechanism: "friction" },
  frictionBand: createFrictionBand("delay", 1),
  defaultEnabled: true,
};
```

- [ ] **Step 5: Migrate the 2 signals**

`apps/browser/modules/signals/youtube-watch-time/definition.ts` (pure indicator — no band):
```ts
import type { SignalDefinition } from "../types";

export const youtubeWatchTime: SignalDefinition = {
  id: "youtube-watch-time",
  name: "Watch Time",
  description: "Shows how long you’ve been watching YouTube today",
  domain: "youtube.com",
  icon: "⏱",
  classification: { mechanism: "self-monitoring" },
  defaultEnabled: true,
};
```

`apps/browser/modules/signals/youtube-stain/definition.ts` (dim renderer — engages early):
```ts
import type { SignalDefinition } from "../types";
import { createFrictionBand } from "@equanimi/domain";

export const youtubeStain: SignalDefinition = {
  id: "youtube-stain",
  name: "Watch Stain",
  description: "A growing dark stain over the player as you watch",
  domain: "youtube.com",
  icon: "\u{1FAB8}",
  classification: { mechanism: "self-monitoring" },
  frictionBand: createFrictionBand("dim", 0),
  defaultEnabled: true,
};
```
(If the existing file's `name`/`description`/`icon` differ, keep the existing values — only the `classification` + `frictionBand` shape is being added.)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If the typechecker flags any consumer reading `.mechanism` directly, change it to `.classification.mechanism`. (Expected: none — popup/manage/background do not read it.)

- [ ] **Step 7: Commit**
```bash
git add apps/browser/modules/shields apps/browser/modules/signals
git commit -m "refactor(browser): unify definitions on canonical InterventionDefinition + declare friction bands"
```

---

# Phase 1 — YouTube feature

## Task 8: `domainFriction` storage factory

**Files:** Modify `apps/browser/utils/storage.ts`

- [ ] **Step 1: Add the store factory**

Append to `apps/browser/utils/storage.ts`:
```ts

/**
 * Per-arm friction value, f ∈ [0, 1].
 *
 * Convention: `local:friction:<domain>:value`
 * Written by drivers; read by friction-aware renderers. Mirrors
 * `domainCooldown` — cooldown is friction pinned to 1.
 */
export function domainFriction(domain: string) {
  return storage.defineItem<number>(`local:friction:${domain}:value`, {
    fallback: 0,
  });
}

/**
 * Per-arm cooldown override window (ms timestamp). While `now` is before
 * this, an active cooldown is suppressed — the user spent a skip credit.
 *
 * Convention: `local:cooldown:<domain>:override-until`
 */
export function domainCooldownOverride(domain: string) {
  return storage.defineItem<number>(
    `local:cooldown:${domain}:override-until`,
    { fallback: 0 },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add apps/browser/utils/storage.ts
git commit -m "feat(browser): add per-arm domainFriction + cooldown-override stores"
```

---

## Task 9: YouTube friction driver

Make the watch-time content script the usage-vs-budget driver: reset-hour day boundary, write `domainFriction("youtube.com")`, style the counter by `f`, and pin the cooldown at the limit.

**Files:** Modify `apps/browser/entrypoints/youtube-watch-time.content/index.ts`

- [ ] **Step 1: Replace the top imports**

Change the imports (currently lines 1–3) to:
```ts
import {
  signalEnabled,
  signalSetting,
  domainCooldown,
  domainFriction,
  budgetDefinition,
} from "@/utils/storage";
import { youtubeWatchTime } from "@/modules/signals/youtube-watch-time/definition";
import {
  frictionCurve,
  logicalDayString,
  nextResetTimestamp,
} from "@equanimi/domain";
import type { BudgetDefinition } from "@/modules/budgets/types";
import "./style.css";
```

- [ ] **Step 2: Remove the local counter curve**

Delete the counter-curve block (currently lines 49–67: the comment, `COUNTER_MIN_SECONDS`, `COUNTER_MAX_SECONDS`, `NEAR_MAX`, `COUNTER_TAU`, `timeProgress`). Keep `lerp` (move it to the Math helpers area if needed). Add the driver stores after `dailyDateStore` (currently ends line 45):
```ts

// ── Friction driver stores ────────────────────────────────────────
const frictionStore = domainFriction("youtube.com");
const cooldownStore = domainCooldown("youtube.com");
const softStartStore = signalSetting<number>(
  youtubeWatchTime.id,
  "soft-start-minutes",
  5,
);
const resetHourStore = signalSetting<number>(
  youtubeWatchTime.id,
  "reset-hour",
  5,
);
const youtubeBudget = budgetDefinition<BudgetDefinition | null>(
  "youtube.com",
  null,
);
const limitHistoryStore = signalSetting<string[]>(
  youtubeWatchTime.id,
  "limit-history",
  [],
);
```

- [ ] **Step 3: Add driver state**

In the `// ── State ──` block, after `let dailySeconds = 0;` add:
```ts
let currentFriction = 0;
let softStartMin = 5;
let resetHour = 5;
let dailyLimitMin = 60;
```

- [ ] **Step 4: Add the config loader + friction updater**

Add above `function tick()`:
```ts
async function loadLimitConfig(): Promise<void> {
  softStartMin = await softStartStore.getValue();
  resetHour = await resetHourStore.getValue();
  const budget = await youtubeBudget.getValue();
  const dim = budget?.dimensions.find((d) => d.kind === "time-per-day");
  dailyLimitMin = dim && dim.kind === "time-per-day" ? dim.limitMinutes : 60;
}

async function updateFriction(): Promise<void> {
  const until = await cooldownStore.getValue();
  if (until && until > Date.now()) {
    currentFriction = 1;
    await frictionStore.setValue(1);
    updateDisplay();
    return;
  }

  currentFriction = frictionCurve(dailySeconds, softStartMin, dailyLimitMin);
  await frictionStore.setValue(currentFriction);

  if (dailySeconds >= dailyLimitMin * 60) {
    await cooldownStore.setValue(nextResetTimestamp(Date.now(), resetHour));
    await recordLimitHit();
    currentFriction = 1;
    await frictionStore.setValue(1);
  }
  updateDisplay();
}

// Append today's logical day to the 7-day reflection history (deduped,
// capped at 30 entries). Runs once per day — the cooldown early-return
// above prevents re-entry after the limit is first crossed.
async function recordLimitHit(): Promise<void> {
  const today = logicalDayString(Date.now(), resetHour);
  const history = await limitHistoryStore.getValue();
  if (history.includes(today)) return;
  await limitHistoryStore.setValue([...history, today].slice(-30));
}
```

- [ ] **Step 5: Reset at the reset hour + seed friction in `activate()`**

Replace the start of `activate()` through the day-rollover block (currently lines 111–124) with:
```ts
async function activate(): Promise<void> {
  if (active) return;
  active = true;

  await loadLimitConfig();

  const today = logicalDayString(Date.now(), resetHour);
  const storedDate = await dailyDateStore.getValue();

  if (storedDate === today) {
    dailySeconds = await dailySecondsStore.getValue();
  } else {
    dailySeconds = 0;
    await dailyDateStore.setValue(today);
    await dailySecondsStore.setValue(0);
  }

  await updateFriction();
```
(Leave the rest of `activate()` unchanged.)

- [ ] **Step 6: Drive friction from the tick**

Replace `tick()` (currently lines 222–234) with:
```ts
function tick(): void {
  if (!counterEl) return;

  if (!document.hidden && videoPlaying) {
    dailySeconds++;

    if (dailySeconds % SAVE_INTERVAL === 0) {
      dailySecondsStore.setValue(dailySeconds);
      void updateFriction();
    }
  }

  updateDisplay();
}
```

- [ ] **Step 7: Style the counter from friction**

In `updateDisplay()`, replace the line that computes the styling factor (currently `const t = timeProgress(dailySeconds);`, line 250) with:
```ts
  const t = currentFriction;
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (No remaining references to `timeProgress`, `COUNTER_TAU`, or the removed constants.)

- [ ] **Step 9: Manual verification (ask the user)**

Ask the user to:
1. `pnpm dev:browser`, load extension, open manage → Budgets → set youtube.com **Time per day = 1**.
2. Watch a YouTube video ~1 min (tab focused, playing).
3. Confirm the cooldown overlay ("Take a break.") appears + pauses video at ~60s, badge turns purple with a countdown targeting the next 05:00.
4. In the YouTube tab console: `await chrome.storage.local.get("local:friction:youtube.com:value")` → rose toward ~0.95, then `1` at cooldown.

Report back; proceed when confirmed.

- [ ] **Step 10: Commit**
```bash
git add apps/browser/entrypoints/youtube-watch-time.content/index.ts
git commit -m "feat(browser): YouTube friction driver + limit-triggered cooldown"
```

---

## Task 10: Watch-stain becomes the first `dim` renderer

The stain stops computing its own curve from daily seconds and instead reads `domainFriction("youtube.com")`, conforming to the `FrictionRenderer` port.

**Files:** Modify `apps/browser/entrypoints/youtube-stain.content/index.ts`

- [ ] **Step 1: Replace the top imports**

Change the imports (currently lines 1–4) to:
```ts
import { signalEnabled } from "@/utils/storage";
import { domainFriction } from "@/utils/storage";
import { youtubeStain } from "@/modules/signals/youtube-stain/definition";
import type { Friction, FrictionRenderer } from "@equanimi/domain";
import "./style.css";
```

- [ ] **Step 2: Replace the tunnel-math + watch-time-read blocks with a friction store**

Delete the tunnel stores + `dailySecondsStore` + tunnel math (currently lines 21–59: `tunnelMinStore`, `tunnelMaxStore`, `dailySecondsStore`, `NEAR_MAX`, `tunnelMinSeconds`, `tunnelMaxSeconds`, `tau`, `deriveTau`, and their comments). Replace with:
```ts
// ── Friction source ───────────────────────────────────────────────
// The stain is a `dim` renderer of the arm's friction. The YouTube
// driver (watch-time content script) computes and writes it.

const frictionStore = domainFriction("youtube.com");
```

- [ ] **Step 3: Replace the daily-seconds state with friction state**

In the `// ── State ──` block (currently lines 106–110), replace `let dailySeconds = 0;` with:
```ts
let friction = 0;
```

- [ ] **Step 4: Read + watch friction in `activate()`**

Replace the block in `activate()` that loaded tunnel settings and watched daily seconds (currently lines 120–139) with:
```ts
  friction = await frictionStore.getValue();

  frictionStore.watch((newFriction) => {
    friction = newFriction;
    updateStain();
  });
```

- [ ] **Step 5: Render from friction directly + conform to the port**

Replace `updateStain()` and `stainProgress()` (currently lines 189–227) with:
```ts
const stainRenderer: FrictionRenderer = {
  render(f: Friction): void {
    friction = f;
    updateStain();
  },
  clear(): void {
    removeStain();
  },
};
void stainRenderer; // documents conformance; the store watcher drives it

function updateStain(): void {
  if (!stainEl) {
    return;
  }

  const t = friction;

  if (t <= 0) {
    stainEl.style.width = "0";
    stainEl.style.paddingBottom = "0";
    stainEl.style.opacity = "0";
    return;
  }

  const size = lerp(BLOB_SIZE_MIN, BLOB_SIZE_MAX, t);
  const alpha = lerp(BLOB_ALPHA_MIN, BLOB_ALPHA_MAX, t);

  stainEl.style.width = `${size.toFixed(1)}%`;
  stainEl.style.paddingBottom = `${size.toFixed(1)}%`;
  stainEl.style.opacity = "1";
  stainEl.style.background = [
    `radial-gradient(circle,`,
    `  rgba(0, 0, 0, ${alpha.toFixed(3)}) 0%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.975).toFixed(3)}) 25%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.95).toFixed(3)}) 50%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.925).toFixed(3)}) 75%,`,
    `  transparent 100%)`,
  ].join(" ");
}
```
(Keep the `lerp` helper that follows.)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (No remaining references to `deriveTau`, `tunnelMinStore`, `dailySecondsStore`, `stainProgress`.)

- [ ] **Step 7: Manual verification (ask the user)**

Ask the user to reload the extension, ensure Watch Time + Watch Stain signals are on, and watch YouTube with a low daily limit set. Confirm the stain darkens as friction rises and is fully dark once the limit/cooldown hits. No errors in console.

Report back; proceed when confirmed.

- [ ] **Step 8: Commit**
```bash
git add apps/browser/entrypoints/youtube-stain.content/index.ts
git commit -m "feat(browser): watch-stain renders arm friction (first dim renderer)"
```

---

## Task 11: Remove popup toggles → cooldown + read-only status

**Files:** Modify `apps/browser/entrypoints/popup/main.ts`, `apps/browser/entrypoints/popup/style.css`

- [ ] **Step 1: Replace the renderer + drop the toggle helper**

Replace `renderDomainGroup` (currently lines 246–351) and the `createToggle` helper (currently lines 355–373) with this read-only renderer:
```ts
// ── Domain group component (read-only status) ─────────────────────

function renderDomainGroup(group: DomainGroup): HTMLElement {
  const section = document.createElement("section");
  section.className = "domain-group";

  const header = document.createElement("div");
  header.className = "domain-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "domain-header-left";

  const domainLabel = document.createElement("span");
  domainLabel.className = "domain-label";
  domainLabel.textContent = group.domain;

  const countBadge = document.createElement("span");
  countBadge.className = "active-count";
  countBadge.textContent = `0/${group.interventions.length}`;

  headerLeft.appendChild(domainLabel);
  headerLeft.appendChild(countBadge);
  header.appendChild(headerLeft);
  section.appendChild(header);

  let activeCount = 0;

  for (const intervention of group.interventions) {
    const row = document.createElement("div");
    row.className = "shield-row";

    const info = document.createElement("div");
    info.className = "shield-info";

    const nameRow = document.createElement("div");
    nameRow.className = "shield-name-row";

    const nameEl = document.createElement("span");
    nameEl.className = "shield-name";
    nameEl.textContent = `${intervention.icon} ${intervention.name}`;

    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    statusDot.textContent = "○"; // ○

    nameRow.appendChild(nameEl);
    nameRow.appendChild(statusDot);

    const descEl = document.createElement("span");
    descEl.className = "shield-desc";
    descEl.textContent = intervention.description;

    info.appendChild(nameRow);
    info.appendChild(descEl);
    row.appendChild(info);
    section.appendChild(row);

    const store = intervention.getStore();
    const reflect = (value: boolean): void => {
      statusDot.textContent = value ? "●" : "○"; // ● / ○
      statusDot.classList.toggle("active", value);
    };
    store.getValue().then((value) => {
      if (value) activeCount++;
      reflect(value);
      countBadge.textContent = `${activeCount}/${group.interventions.length}`;
      countBadge.classList.toggle(
        "all-active",
        activeCount === group.interventions.length,
      );
    });
    store.watch(reflect);
  }

  return section;
}
```

- [ ] **Step 2: Remove the now-unused `ToggleEntry` type**

If `type ToggleEntry = ...` (currently line 244) is now unreferenced, delete it. Typecheck in Step 4 will confirm.

- [ ] **Step 3: Add the status-dot style**

Append to `apps/browser/entrypoints/popup/style.css`:
```css
.status-dot {
  font-size: 11px;
  color: #94a3b8;
}
.status-dot.active {
  color: #4ade80;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. Remove anything the typechecker flags as now-unused (`ToggleEntry`, leftover `createToggle` references).

- [ ] **Step 5: Manual verification (ask the user)**

Ask the user to reload and open the popup on a YouTube tab. Confirm: no switches — only the cooldown card + read-only ●/○ status list; toggling an intervention in the manage page flips the popup's dot live.

Report back; proceed when confirmed.

- [ ] **Step 6: Commit**
```bash
git add apps/browser/entrypoints/popup/main.ts apps/browser/entrypoints/popup/style.css
git commit -m "feat(browser): popup becomes cooldown + read-only status (toggles move to manage)"
```

---

## Task 12: Manage — soft-start + reset-hour; drop dead stain range

The stain no longer has its own min/max (it reads arm friction), so remove those inputs and add the two per-person YouTube tactics.

**Files:** Modify `apps/browser/entrypoints/manage/main.ts`

- [ ] **Step 1: Remove the stain range stores**

Delete the `tunnelMinStore` / `tunnelMaxStore` definitions (currently lines 63–64).

- [ ] **Step 2: Remove the stain settings panel**

Delete the entire `if (intervention.id === "youtube-stain") { ... }` block (currently lines 320–370).

- [ ] **Step 3: Add the soft-start + reset-hour stores**

After the `watchTimePositionStore` definition (currently lines 56–61), add:
```ts
const softStartStore = signalSetting<number>(
  "youtube-watch-time",
  "soft-start-minutes",
  5,
);
const resetHourStore = signalSetting<number>(
  "youtube-watch-time",
  "reset-hour",
  5,
);
const skipPerMonthStore = signalSetting<number>(
  "youtube-watch-time",
  "skip-credits-per-month",
  1,
);
const skipBlockStore = signalSetting<number>(
  "youtube-watch-time",
  "skip-block-minutes",
  120,
);
```

- [ ] **Step 4: Render the inputs in the watch-time panel**

In the `if (intervention.id === "youtube-watch-time")` block, immediately before `body.appendChild(settingsPanel);` (currently line 316), insert:
```ts
      const limitRow = document.createElement("div");
      limitRow.className = "settings-row";
      const limitLabel = document.createElement("span");
      limitLabel.className = "settings-label";
      limitLabel.textContent = "Daily limit: set via Budgets → Time per day";
      limitRow.appendChild(limitLabel);
      settingsPanel.appendChild(limitRow);

      const softRow = document.createElement("div");
      softRow.className = "settings-row";
      const softLabel = document.createElement("span");
      softLabel.className = "settings-label";
      softLabel.textContent = "Friction starts at (min)";
      const softInput = createNumberInput(
        "yt-soft-start",
        "Minutes",
        await softStartStore.getValue(),
      );
      softInput.input.min = "0";
      softInput.input.addEventListener(
        "input",
        debounce(async () => {
          const val = Math.max(0, parseInt(softInput.input.value, 10) || 0);
          await softStartStore.setValue(val);
        }, 400),
      );
      softRow.appendChild(softLabel);
      softRow.appendChild(softInput.wrapper);
      settingsPanel.appendChild(softRow);

      const resetRow = document.createElement("div");
      resetRow.className = "settings-row";
      const resetLabel = document.createElement("span");
      resetLabel.className = "settings-label";
      resetLabel.textContent = "Reset hour (0–23)";
      const resetInput = createNumberInput(
        "yt-reset-hour",
        "Hour",
        await resetHourStore.getValue(),
      );
      resetInput.input.min = "0";
      resetInput.input.max = "23";
      resetInput.input.addEventListener(
        "input",
        debounce(async () => {
          const raw = parseInt(resetInput.input.value, 10);
          const val = Number.isNaN(raw) ? 5 : Math.max(0, Math.min(23, raw));
          await resetHourStore.setValue(val);
        }, 400),
      );
      resetRow.appendChild(resetLabel);
      resetRow.appendChild(resetInput.wrapper);
      settingsPanel.appendChild(resetRow);

      const skipRow = document.createElement("div");
      skipRow.className = "settings-row";
      const skipLabel = document.createElement("span");
      skipLabel.className = "settings-label";
      skipLabel.textContent = "Skip credits per month";
      const skipInput = createNumberInput(
        "yt-skip-per-month",
        "Credits",
        await skipPerMonthStore.getValue(),
      );
      skipInput.input.min = "0";
      skipInput.input.max = "31";
      skipInput.input.addEventListener(
        "input",
        debounce(async () => {
          const val = Math.max(0, Math.min(31, parseInt(skipInput.input.value, 10) || 0));
          await skipPerMonthStore.setValue(val);
        }, 400),
      );
      skipRow.appendChild(skipLabel);
      skipRow.appendChild(skipInput.wrapper);
      settingsPanel.appendChild(skipRow);

      const blockRow = document.createElement("div");
      blockRow.className = "settings-row";
      const blockLabel = document.createElement("span");
      blockLabel.className = "settings-label";
      blockLabel.textContent = "Skip duration (min)";
      const blockInput = createNumberInput(
        "yt-skip-block",
        "Minutes",
        await skipBlockStore.getValue(),
      );
      blockInput.input.min = "5";
      blockInput.input.addEventListener(
        "input",
        debounce(async () => {
          const val = Math.max(5, parseInt(blockInput.input.value, 10) || 120);
          await skipBlockStore.setValue(val);
        }, 400),
      );
      blockRow.appendChild(blockLabel);
      blockRow.appendChild(blockInput.wrapper);
      settingsPanel.appendChild(blockRow);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (No remaining references to `tunnelMinStore` / `tunnelMaxStore`.)

- [ ] **Step 6: Manual verification (ask the user)**

Ask the user to open the manage page, expand youtube.com. Confirm: the Watch Time panel shows "Friction starts at (min)" and "Reset hour (0–23)" (persist on reload); the old "Stain range (min)" inputs are gone; the stain still works (driven by friction).

Report back; proceed when confirmed.

- [ ] **Step 7: Commit**
```bash
git add apps/browser/entrypoints/manage/main.ts
git commit -m "feat(browser): manage exposes YouTube soft-start + reset-hour; drop dead stain range"
```

---

## Task 13: Skip-credit override + scoreless reflection in the cooldown overlay

The auto-cooldown becomes overridable by spending a scarce monthly skip credit (configurable, default 1/month) for a fixed block (default 2h). During the override the overlay is suppressed and video plays, but `f`/stain stay at max (handled by the Task 9 driver — no change needed there). The overlay also shows a scoreless "N of last 7 days" reflection.

**Files:** Modify `apps/browser/entrypoints/youtube-cooldown.content/index.ts`, `apps/browser/entrypoints/youtube-cooldown.content/style.css`

- [ ] **Step 1: Imports + stores**

Change the imports (currently lines 19–20) to:
```ts
import {
  domainCooldown,
  domainCooldownOverride,
  signalSetting,
} from "@/utils/storage";
import { monthKey, logicalDayString } from "@equanimi/domain";
import "./style.css";
```
After `const cooldownUntilStore = domainCooldown("youtube.com");` add:
```ts
const overrideStore = domainCooldownOverride("youtube.com");

// Skip credits (per-person tactics + state).
const skipPerMonthStore = signalSetting<number>(
  "youtube-watch-time",
  "skip-credits-per-month",
  1,
);
const skipRemainingStore = signalSetting<number>(
  "youtube-watch-time",
  "skip-credits-remaining",
  1,
);
const skipMonthStore = signalSetting<string>(
  "youtube-watch-time",
  "skip-credits-month",
  "",
);
const skipBlockStore = signalSetting<number>(
  "youtube-watch-time",
  "skip-block-minutes",
  120,
);
const resetHourStore = signalSetting<number>(
  "youtube-watch-time",
  "reset-hour",
  5,
);
const limitHistoryStore = signalSetting<string[]>(
  "youtube-watch-time",
  "limit-history",
  [],
);
```

- [ ] **Step 2: Credit + reflection helpers**

Add near the top of the helpers section:
```ts
async function refillCreditsIfNeeded(): Promise<void> {
  const thisMonth = monthKey(Date.now());
  const storedMonth = await skipMonthStore.getValue();
  if (storedMonth !== thisMonth) {
    await skipMonthStore.setValue(thisMonth);
    await skipRemainingStore.setValue(await skipPerMonthStore.getValue());
  }
}

async function spendCredit(): Promise<void> {
  const remaining = await skipRemainingStore.getValue();
  await skipRemainingStore.setValue(Math.max(0, remaining - 1));
}

async function renderSkipButton(btn: HTMLButtonElement): Promise<void> {
  await refillCreditsIfNeeded();
  const remaining = await skipRemainingStore.getValue();
  if (remaining <= 0) {
    btn.textContent = "No skips left this month";
    btn.disabled = true;
    return;
  }
  // Rendered as a depleting resource, never a growing score.
  btn.textContent = `Use a skip (${remaining} left this month)`;
  btn.disabled = false;
  btn.onclick = async (e) => {
    e.stopPropagation();
    await spendCredit();
    const blockMin = await skipBlockStore.getValue();
    await overrideStore.setValue(Date.now() + blockMin * 60 * 1000);
    // Suppression happens on the next cooldownTick.
  };
}

async function renderReflection(el: HTMLElement): Promise<void> {
  const resetHour = await resetHourStore.getValue();
  const history = await limitHistoryStore.getValue();
  const now = Date.now();
  const last7 = new Set<string>();
  for (let i = 0; i < 7; i++) {
    last7.add(logicalDayString(now - i * 86_400_000, resetHour));
  }
  const n = history.filter((d) => last7.has(d)).length;
  el.textContent = `Limit reached ${n} of the last 7 days.`;
}
```

- [ ] **Step 3: Make enforcement override-aware**

Replace `applyCooldownUI()` (currently lines 80–97) with a tick that honors the override window:
```ts
function applyCooldownUI(): void {
  void cooldownTick();
  cooldownTimer = setInterval(() => void cooldownTick(), 1000);
}

async function cooldownTick(): Promise<void> {
  const now = Date.now();
  const until = await cooldownUntilStore.getValue();
  if (!until || until <= now) {
    clearCooldown(true);
    return;
  }

  const overrideUntil = await overrideStore.getValue();
  if (overrideUntil && overrideUntil > now) {
    // Skip credit active — suppress enforcement, keep cooldown state.
    suppressCooldown();
    return;
  }

  enforceCooldown();
  cooldownRemaining = Math.ceil((until - now) / 1000);
  pauseAllVideos();
  updateOverlay();
  updateBadge();
}

// Show overlay + enforce pausing (idempotent — inner inserts early-return).
function enforceCooldown(): void {
  startVideoEnforcement();
  insertPlayerOverlay();
  showBadge();
  pauseAllVideos();
}

// Hide overlay + stop pausing WITHOUT clearing cooldown state (override window).
function suppressCooldown(): void {
  removePlayerOverlay();
  hideBadge();
  stopVideoEnforcement();
}
```

- [ ] **Step 4: Clear the override when the cooldown ends**

In `clearCooldown` (currently the `if (clearStorage)` block, line 106–108), also reset the override so it can't leak into a future cooldown:
```ts
  if (clearStorage) {
    await cooldownUntilStore.setValue(0);
    await overrideStore.setValue(0);
  }
```

- [ ] **Step 5: Add the skip button + reflection to the overlay**

In `insertPlayerOverlay()`, after the `leave` button is appended to `content` (currently line 218, `content.appendChild(leave);` is just before `overlay.appendChild(content)`), insert:
```ts
  const reflection = document.createElement("span");
  reflection.className = "equanimi-yt-cooldown-reflection";
  void renderReflection(reflection);
  content.appendChild(reflection);

  const skip = document.createElement("button");
  skip.className = "equanimi-yt-cooldown-skip";
  void renderSkipButton(skip);
  content.appendChild(skip);
```

- [ ] **Step 6: Style the new elements**

Append to `apps/browser/entrypoints/youtube-cooldown.content/style.css`:
```css
.equanimi-yt-cooldown-reflection {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 8px;
}
.equanimi-yt-cooldown-skip {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 12px;
  background: transparent;
  color: #cbd5e1;
  border: 1px solid #475569;
  border-radius: 8px;
  cursor: pointer;
}
.equanimi-yt-cooldown-skip:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Manual verification (ask the user)**

Ask the user (with a low daily limit + at least 1 skip credit configured) to:
1. Watch past the limit → cooldown overlay appears with a "Use a skip (1 left this month)" button and a "Limit reached N of the last 7 days." line.
2. Click the skip → overlay disappears, video plays again; the stain stays fully dark (friction still max).
3. Confirm in console: `await chrome.storage.local.get(["local:cooldown:youtube.com:override-until","signal:youtube-watch-time:skip-credits-remaining"])` → override-until is ~2h out, remaining decremented to 0.
4. With 0 credits, after the block lapses (or by manually setting override-until to a past value in DevTools), the cooldown overlay reasserts and the skip button reads "No skips left this month".

Report back; proceed when confirmed.

- [ ] **Step 9: Commit**
```bash
git add apps/browser/entrypoints/youtube-cooldown.content/index.ts apps/browser/entrypoints/youtube-cooldown.content/style.css
git commit -m "feat(browser): skip-credit override + scoreless reflection on YouTube cooldown"
```

---

## Self-review notes

**Spec coverage:**
- Friction primitive + curve + reset helpers → Tasks 2–4. ✓
- Friction ladder + band + renderer port (domain) → Task 5. ✓
- `frictionBand` on canonical definition + schism resolved (browser defs = aliases) → Tasks 6–7. ✓
- Declarative alignment: all 9 shields + 2 signals classified → Task 7 table. ✓
- `domainFriction` store → Task 8. ✓
- YouTube usage-vs-budget driver, gradual friction, reset-hour day boundary, limit→cooldown → Task 9. ✓
- First real renderer reading `f` (stain = dim; cooldown overlay = block, pre-existing) → Task 10. ✓
- Popup toggles removed; manage keeps control → Task 11. ✓
- Soft-start + reset-hour configurable per person; limit reuses `time-per-day` budget → Tasks 9, 12. ✓
- **Skip-credit override** (scarce, configurable, `f` stays max during override, depleting-not-score) → Tasks 8 (override store), 12 (config), 13 (overlay + spend/refill). ✓
- **Scoreless reflection** ("N of last 7 days") → Task 9 (record `limit-history`), Task 13 (`renderReflection`). ✓
- `monthKey` for monthly refill → Task 4. ✓
- No "produces equanimity" claims → all copy/comments say friction/cooldown/skip. ✓
- Out of scope (8 binary shields stay binary; other arms' drivers; detection) → not built; bands declared only. ✓

**Type consistency:** `createFriction`/`frictionCurve`/`createFrictionBand` use the branded `Friction`; `FrictionBand.engagesAt: Friction`; `domainFriction`/`domainCooldownOverride`/`signalSetting` store plain `number`/`string`/`string[]` (Friction is assignable to number). `FrictionRenderer.render(f: Friction)` matches the stain's `render`. Browser `ShieldDefinition`/`SignalDefinition` are `InterventionDefinition`, so every migrated definition uses nested `classification: { mechanism }` (Task 7) — consistent across all 11 files. Store keys consistent across writers/readers: `signal:youtube-watch-time:{soft-start-minutes,reset-hour,limit-history,skip-credits-per-month,skip-credits-remaining,skip-credits-month,skip-block-minutes}` are written/read by Tasks 9, 12, 13; `local:cooldown:youtube.com:override-until` by Tasks 8/13. `resetHour` default `5` is duplicated across the driver (Task 9), manage (Task 12), and the cooldown script (Task 13) — all use the same key + fallback, so they agree.

**Placeholder scan:** none — every step has concrete code, exact paths, or exact commands. The Task 7 table gives exact per-file values (not "similar to").

**Override correctness:** `enforceCooldown`/`suppressCooldown` rely on `insertPlayerOverlay`/`showBadge`/`startVideoEnforcement` being idempotent (they early-return when their element/observer exists) and on `removePlayerOverlay`/`hideBadge`/`stopVideoEnforcement` being null-safe — both hold in the current file. During an override the Task 9 driver still sets `f = 1` (cooldown `until` is in the future), so the stain stays dark — verified against `updateFriction`'s early-return branch.
```
