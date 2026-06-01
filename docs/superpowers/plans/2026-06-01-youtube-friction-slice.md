# YouTube Friction Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YouTube watch time drive a gradual friction dial that, at a configurable daily limit, triggers a cooldown lasting until a configurable reset hour (default 05:00) — and remove the on/off toggles from the extension popup.

**Architecture:** Introduce a shared `Friction` primitive (`f ∈ [0,1]`) and pure helpers in `@equanimi/domain`. A driver in the YouTube watch-time content script computes `f` from accumulated daily seconds vs the user's `time-per-day` budget, persists it per-arm (`domainFriction`), and pins the existing per-domain cooldown to the next reset hour when the limit is crossed. The popup drops its toggles (control stays in the manage page) and becomes cooldown + read-only status. The two existing YouTube signals are refactored to consume the shared curve (DRY).

**Tech Stack:** TypeScript, WXT (WebExtension Toolkit), `wxt/storage`, pnpm workspaces, Vitest (newly added to `@equanimi/domain` for the pure primitives).

**Verification model:** Pure domain logic is TDD'd with Vitest. Extension/DOM wiring has no test harness in this repo, so it is verified with `pnpm typecheck` + explicit manual steps. **Do not run dev servers — ask the user to load/observe the extension.**

**Decision flagged for review:** Task 1 adds Vitest to `packages/domain`. The repo currently has no test framework. If you would rather keep it test-free, skip Tasks 1–4's test steps and keep only the implementation steps (verified by `pnpm typecheck`).

---

## File Structure

**Create:**
- `packages/domain/src/friction.ts` — pure friction helpers: `frictionCurve`, `logicalDayString`, `nextResetTimestamp`.
- `packages/domain/src/value-objects.test.ts` — tests for `createFriction`.
- `packages/domain/src/friction.test.ts` — tests for the friction helpers.

**Modify:**
- `packages/domain/src/value-objects.ts` — add `Friction` branded type + `createFriction` clamp.
- `packages/domain/src/index.ts` — export the new type + functions.
- `packages/domain/package.json` — add Vitest devDep + `test` script.
- `apps/browser/utils/storage.ts` — add `domainFriction(domain)` store factory.
- `apps/browser/entrypoints/youtube-watch-time.content/index.ts` — reset-hour-based day boundary, friction driver, limit→cooldown trigger; later, consume shared curve.
- `apps/browser/entrypoints/youtube-stain.content/index.ts` — consume shared curve (DRY).
- `apps/browser/entrypoints/popup/main.ts` — remove toggles; render read-only status; keep cooldown.
- `apps/browser/entrypoints/manage/main.ts` — add soft-start + reset-hour inputs to the watch-time settings panel.

---

## Task 1: Add Vitest to the domain package

**Files:**
- Modify: `packages/domain/package.json`

- [ ] **Step 1: Add the dev dependency and test script**

Run:
```bash
pnpm --filter @equanimi/domain add -D vitest
```
Expected: `vitest` appears under `devDependencies` in `packages/domain/package.json`.

- [ ] **Step 2: Add the `test` script**

Edit `packages/domain/package.json` so the `scripts` block reads:
```json
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Verify Vitest runs (no tests yet)**

Run: `pnpm --filter @equanimi/domain test`
Expected: Vitest starts and reports "No test files found" (exit is acceptable). This confirms the toolchain resolves.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/package.json pnpm-lock.yaml
git commit -m "chore(domain): add vitest for pure-primitive tests"
```

---

## Task 2: `Friction` value object (clamp)

**Files:**
- Modify: `packages/domain/src/value-objects.ts`
- Test: `packages/domain/src/value-objects.test.ts`

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
Expected: FAIL — `createFriction` is not exported from `./value-objects.js`.

- [ ] **Step 3: Implement `Friction` + `createFriction`**

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

## Task 3: `frictionCurve` (shared asymptotic curve)

**Files:**
- Create: `packages/domain/src/friction.ts`
- Test: `packages/domain/src/friction.test.ts`

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

- [ ] **Step 3: Implement `frictionCurve`**

Create `packages/domain/src/friction.ts`:
```ts
/**
 * Pure friction helpers shared by all compulsion arms.
 *
 * The curve is the single source of truth previously copy-pasted into
 * the YouTube stain and watch-time signals. No DOM, no storage, no
 * framework coupling — vanilla math + Date arithmetic.
 */
import type { Friction } from "./value-objects.js";
import { createFriction } from "./value-objects.js";

/** −ln(0.05) ≈ 2.996 — makes the curve reach ~95% at the max threshold. */
const NEAR_MAX = -Math.log(0.05);

/**
 * Asymptotic friction curve.
 *
 * Returns 0 below `minMinutes` of accumulated time, then rises
 * asymptotically toward ~0.95 right at `maxMinutes`:
 *
 *   f(t) = 1 − exp(−(t − min) / τ),  τ = (max − min) / −ln(0.05)
 *
 * `maxMinutes` is guarded to be at least `minMinutes + 1` so τ is finite.
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
Expected: PASS (curve tests green; clamp tests still green).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/friction.ts packages/domain/src/friction.test.ts
git commit -m "feat(domain): add shared frictionCurve"
```

---

## Task 4: Reset-hour day boundary + next-reset timestamp

**Files:**
- Modify: `packages/domain/src/friction.ts`
- Test: `packages/domain/src/friction.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/src/friction.test.ts`:
```ts
import { logicalDayString, nextResetTimestamp } from "./friction.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @equanimi/domain test`
Expected: FAIL — `logicalDayString` / `nextResetTimestamp` not exported.

- [ ] **Step 3: Implement both helpers**

Append to `packages/domain/src/friction.ts`:
```ts

/**
 * Logical-day key for a reset-hour-based day boundary.
 *
 * The "day" rolls over at `resetHour` local time, not midnight. Shift
 * the clock back by `resetHour` hours, then take the calendar date, so
 * two instants in the same logical day share a key.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @equanimi/domain test`
Expected: PASS (all friction + clamp tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/friction.ts packages/domain/src/friction.test.ts
git commit -m "feat(domain): add logicalDayString + nextResetTimestamp"
```

---

## Task 5: Export friction primitives from the domain barrel

**Files:**
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Export the new type**

In `packages/domain/src/index.ts`, change the Value Objects type export (currently lines 15) to:
```ts
export type { Duration, Domain, AppName, Friction } from "./value-objects.js";
```

- [ ] **Step 2: Export the new functions**

In the same file, change the Value Objects value export (currently lines 16–22) to:
```ts
export {
  createDuration,
  fromMinutes,
  toMinutes,
  createDomain,
  createAppName,
  createFriction,
} from "./value-objects.js";

// ── Friction ────────────────────────────────────────────────────
export {
  frictionCurve,
  logicalDayString,
  nextResetTimestamp,
} from "./friction.js";
```

- [ ] **Step 3: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: PASS — domain + browser typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/index.ts
git commit -m "feat(domain): export friction primitives"
```

---

## Task 6: `domainFriction` storage factory

**Files:**
- Modify: `apps/browser/utils/storage.ts`

- [ ] **Step 1: Add the store factory**

Append to `apps/browser/utils/storage.ts` (after `domainCooldown`):
```ts

/**
 * Per-arm friction value, f ∈ [0, 1].
 *
 * Convention: `local:friction:<domain>:value`
 * Written by usage-vs-budget / manual drivers; read by friction-aware
 * renderers. Mirrors `domainCooldown` — cooldown is friction pinned to 1.
 */
export function domainFriction(domain: string) {
  return storage.defineItem<number>(`local:friction:${domain}:value`, {
    fallback: 0,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/browser/utils/storage.ts
git commit -m "feat(browser): add per-arm domainFriction store"
```

---

## Task 7: YouTube friction driver (the reference usage-vs-budget driver)

**Files:**
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/index.ts`

This task: load limit config, switch the day boundary to the reset hour, write `domainFriction` as watch time accrues, and trigger the cooldown when the daily limit is crossed.

- [ ] **Step 1: Add imports**

In `youtube-watch-time.content/index.ts`, change the top imports (currently lines 1–3) to:
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

- [ ] **Step 2: Add the new stores**

Immediately after the existing `dailyDateStore` definition (currently lines 41–45), add:
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
```

- [ ] **Step 3: Add limit-config state**

In the `// ── State ──` block (currently lines 99–107), add three module-level variables after `let dailySeconds = 0;`:
```ts
let softStartMin = 5;
let resetHour = 5;
let dailyLimitMin = 60;
```

- [ ] **Step 4: Add the config loader + friction updater**

Add these two functions just above `function tick()` (currently line 222):
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
    // Cooldown active → friction is pinned to max.
    await frictionStore.setValue(1);
    return;
  }

  const f = frictionCurve(dailySeconds, softStartMin, dailyLimitMin);
  await frictionStore.setValue(f);

  if (dailySeconds >= dailyLimitMin * 60) {
    // Limit crossed → start a cooldown until the next reset hour.
    await cooldownStore.setValue(nextResetTimestamp(Date.now(), resetHour));
    await frictionStore.setValue(1);
  }
}
```

- [ ] **Step 5: Switch the day boundary to the reset hour + seed friction**

Replace the body of `activate()` from its start through the day-rollover block (currently lines 111–124) with:
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
(Leave the rest of `activate()` — `createOverlay()`, `watchVideos()`, etc. — unchanged.)

- [ ] **Step 6: Drive friction from the tick**

Replace the `tick()` function (currently lines 222–234) with:
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

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `BudgetDefinition` import is reported unused, confirm it is used in `youtubeBudget`'s generic — it is.)

- [ ] **Step 8: Manual verification (ask the user — do not run dev yourself)**

Ask the user to:
1. `pnpm dev:browser`, load the extension, open the manage page.
2. Budgets tab → set youtube.com **Time per day = 1** (minute) for a fast test.
3. Watch any YouTube video for ~1 minute (keep the tab focused, video playing).
4. Confirm: at ~60s the **YouTube cooldown overlay** ("Take a break.") appears and pauses the video; the toolbar badge turns purple with a countdown.
5. In DevTools console on the YouTube tab, run `await chrome.storage.local.get("local:friction:youtube.com:value")` and confirm the value rose toward ~0.95 and is `1` once cooldown started.
6. Confirm the countdown targets the next 05:00 (or your configured reset hour).

Report the observations back. Only proceed when confirmed.

- [ ] **Step 9: Commit**

```bash
git add apps/browser/entrypoints/youtube-watch-time.content/index.ts
git commit -m "feat(browser): YouTube friction driver + limit-triggered cooldown"
```

---

## Task 8: Remove popup toggles → cooldown + read-only status

**Files:**
- Modify: `apps/browser/entrypoints/popup/main.ts`

The popup keeps `renderCooldown` and the manage link, but the intervention list becomes read-only status rows (no switches, no "enable all", no change listeners).

- [ ] **Step 1: Remove the toggle plumbing from the `Intervention` type and list**

In `popup/main.ts`, the `Intervention` type and `allInterventions` array (currently lines 7–39) only need display fields + the store getter for reading state. Replace the `getStore` usage to read-only. Replace the whole `renderDomainGroup` function (currently lines 246–351) and the `createToggle` helper (currently lines 355–373) with the read-only renderer below:
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
    statusDot.textContent = "○"; // ○ inactive

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

- [ ] **Step 2: Add a status-dot style**

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

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (No remaining references to `createToggle`, `ToggleEntry`, `allToggle`, or `syncDomainToggle` in `popup/main.ts` — remove any that the typechecker flags as undefined.)

- [ ] **Step 4: Manual verification (ask the user)**

Ask the user to reload the extension and open the popup on a YouTube tab. Confirm:
1. No on/off switches appear — only the cooldown card and a read-only list with ●/○ status dots.
2. The manage page still shows working toggles, and toggling there flips the popup's status dot live.

Report back; proceed when confirmed.

- [ ] **Step 5: Commit**

```bash
git add apps/browser/entrypoints/popup/main.ts apps/browser/entrypoints/popup/style.css
git commit -m "feat(browser): popup becomes cooldown + read-only status (toggles move to manage)"
```

---

## Task 9: Manage page — soft-start + reset-hour inputs

**Files:**
- Modify: `apps/browser/entrypoints/manage/main.ts`

Add the two per-person YouTube tactics (soft-start minutes, reset hour) to the existing watch-time settings panel. The daily limit itself is already configurable via the Budgets tab (`time-per-day` for youtube.com).

- [ ] **Step 1: Add the setting stores**

In `manage/main.ts`, after the `watchTimePositionStore` definition (currently lines 56–61), add:
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
```

- [ ] **Step 2: Render the two inputs inside the watch-time panel**

In the `if (intervention.id === "youtube-watch-time")` block, immediately before `body.appendChild(settingsPanel);` (currently line 316), insert:
```ts
      // ── Daily-limit tactics ───────────────────────────────────
      const limitRow = document.createElement("div");
      limitRow.className = "settings-row";

      const limitLabel = document.createElement("span");
      limitLabel.className = "settings-label";
      limitLabel.textContent = "Daily limit (set via Budgets → Time per day)";
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
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification (ask the user)**

Ask the user to open the manage page, expand the youtube.com group, and confirm the Watch Time settings now show "Friction starts at (min)" and "Reset hour (0–23)" inputs that persist on reload.

Report back; proceed when confirmed.

- [ ] **Step 5: Commit**

```bash
git add apps/browser/entrypoints/manage/main.ts
git commit -m "feat(browser): manage page exposes YouTube soft-start + reset-hour"
```

---

## Task 10: DRY — both YouTube signals consume the shared curve

**Files:**
- Modify: `apps/browser/entrypoints/youtube-stain.content/index.ts`
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/index.ts`

Remove the two copy-pasted curve implementations in favour of `frictionCurve`. Behaviour must be identical.

- [ ] **Step 1: Stain — import the shared curve**

In `youtube-stain.content/index.ts`, add to the top imports:
```ts
import { frictionCurve } from "@equanimi/domain";
```

- [ ] **Step 2: Stain — replace the local curve with tracked min/max**

Replace the tunnel-math block (currently lines 48–59: `NEAR_MAX`, `tunnelMinSeconds`, `tunnelMaxSeconds`, `tau`, `deriveTau`) with:
```ts
// ── Tunnel range (minutes), fed to the shared frictionCurve) ──────

let tunnelMinMinutes = 5;
let tunnelMaxMinutes = 60;
```
Then replace `stainProgress` (currently lines 221–227) with:
```ts
function stainProgress(seconds: number): number {
  return frictionCurve(seconds, tunnelMinMinutes, tunnelMaxMinutes);
}
```

- [ ] **Step 3: Stain — update the min/max wiring in `activate()`**

In `activate()`, replace the `deriveTau(...)` setup (currently lines 120–131) with:
```ts
  tunnelMinMinutes = await tunnelMinStore.getValue();
  tunnelMaxMinutes = await tunnelMaxStore.getValue();

  tunnelMinStore.watch((newMin) => {
    tunnelMinMinutes = newMin;
    updateStain();
  });
  tunnelMaxStore.watch((newMax) => {
    tunnelMaxMinutes = newMax;
    updateStain();
  });
```

- [ ] **Step 4: Watch-time — import the shared curve**

In `youtube-watch-time.content/index.ts`, add to the domain import added in Task 7 so it reads:
```ts
import {
  frictionCurve,
  logicalDayString,
  nextResetTimestamp,
} from "@equanimi/domain";
```
(`frictionCurve` is now also used by the counter display.)

- [ ] **Step 5: Watch-time — replace the local counter curve**

Remove the counter-curve constants and `timeProgress` (currently lines 49–67: `COUNTER_MIN_SECONDS`, `COUNTER_MAX_SECONDS`, `NEAR_MAX`, `COUNTER_TAU`, `timeProgress`, and the `lerp` helper stays). Then in `updateDisplay()`, replace the line `const t = timeProgress(dailySeconds);` (currently line 250) with:
```ts
  const t = frictionCurve(dailySeconds, 5, 60);
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no references remain to `deriveTau`, `timeProgress`, `COUNTER_TAU`, or the removed `NEAR_MAX` constants.

- [ ] **Step 7: Manual verification (ask the user)**

Ask the user to reload the extension and watch YouTube. Confirm the stain still appears after the soft-start minutes and grows, and the watch-time counter still grows in size/opacity exactly as before. No visual regression.

Report back; proceed when confirmed.

- [ ] **Step 8: Commit**

```bash
git add apps/browser/entrypoints/youtube-stain.content/index.ts apps/browser/entrypoints/youtube-watch-time.content/index.ts
git commit -m "refactor(browser): YouTube signals consume shared frictionCurve (DRY)"
```

---

## Self-review notes

**Spec coverage:**
- Gradual friction rising with usage → Task 7 (`updateFriction` + `frictionCurve`). ✓
- Limit → cooldown until configurable reset hour → Task 7 (`nextResetTimestamp`, `cooldownStore`). ✓
- Day resets at reset hour (counter + cooldown consistent) → Task 4 + Task 7 (`logicalDayString`). ✓
- Remove popup toggles; manage keeps them → Task 8 (popup) + Task 9 leaves manage toggles intact. ✓
- `Friction`, `domainFriction`, `frictionCurve` exist as shared primitives → Tasks 2, 3, 6. ✓
- Reuse `time-per-day` budget as the daily limit → Task 7 (`loadLimitConfig`). ✓
- Soft-start + reset-hour configurable per person → Task 9. ✓
- No "produces equanimity" claims in copy/comments → all comment text says "friction"/"cooldown", none claim equanimity. ✓
- Binary shields + DOM renderers untouched (out of scope) → not modified. ✓

**Type consistency:** `createFriction`/`frictionCurve` return `Friction` (assignable to the `number` that `domainFriction`/`signalSetting` store); `logicalDayString` returns `string` matching `dailyDateStore`; `nextResetTimestamp` returns `number` matching `domainCooldown`. Store keys: `local:friction:<domain>:value` (new), `signal:youtube-watch-time:{soft-start-minutes,reset-hour}` (consistent between Task 7 reader and Task 9 writer). Setting ids match (`youtube-watch-time`).

**Placeholder scan:** none — every step has concrete code or an exact command.
