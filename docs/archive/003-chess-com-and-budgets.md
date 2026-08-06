# Spec: Chess.com Interventions & Cross-Domain Budgeting

**Status**: Draft
**Author**: The operator + Claude
**Date**: 2026-02-10
**Depends on**: 001-modular-architecture-refactor, 002-youtube-shields

---

## Problem Statement

Chess.com exploits the same compulsive loops as YouTube but through a different mechanism: the **"one more game" loop**. After a game ends — especially a loss — the platform immediately surfaces "New Game" and "Rematch" buttons. No pause, no reflection, no awareness of how many games you've played or how long you've been at it. The emotional volatility of chess (tilt after losses, dopamine after wins) makes this loop particularly sticky.

Meanwhile, our YouTube interventions (watch time blob, shields) operate in isolation. There's no way for a user to express an *intention* like "I want to spend at most 30 minutes on YouTube today" and have the system respond to that constraint. The interventions fire at fixed thresholds regardless of the user's own goals.

This spec introduces two things:

1. **Chess.com shields and signals** — cooldown after games, games-played counter.
2. **A cross-domain budgeting framework** — a constraint layer that lets users set intentions (days/week, time/day, sessions/period) and drives signal intensity and shield escalation across any domain.

## Intervention Philosophy (Extended)

The existing two axes remain:

- **Shields** remove compulsive cues (lobha / craving)
- **Signals** surface hidden truths (moha / delusion)

We now add a third axis:

- **Budgets** encode user intention (sīla / ethical commitment). A budget is a self-imposed constraint: "I choose to limit myself to X." Unlike shields (which remove external cues) and signals (which reveal hidden state), budgets operationalize the user's own aspiration. They're the bridge between awareness and behavior.

Budgets don't block anything by themselves. They *inform* shields and signals, amplifying their urgency as the user approaches or exceeds their stated intention.

---

## Goals

1. **Ship two chess.com interventions** — one shield (post-game cooldown) + one signal (games-played counter).
2. **Introduce the budget module type** as a cross-domain constraint layer.
3. **Wire budgets into existing YouTube signals** — the watch time blob should respond to budget consumption, not just raw minutes.
4. **Preserve the core principle**: compass, not cage. Budgets are aspirational, never blocking.

## Non-Goals

- Chess.com board analysis, move coaching, or gameplay features.
- Blocking access to chess.com entirely (that's a different product).
- Rating-based interventions ("stop playing when you drop N points") — interesting but out of scope.
- Historical dashboards, weekly reports, streaks, gamification of budgets (anti-pattern — we'd become what we fight).

## Off-Sides

- No "hard locks" — even at 200% budget consumption, the user can always continue. Friction increases but access never drops to zero.
- No social features — no sharing budgets, no accountability partners.
- No sync across devices — budgets live in local extension storage (same as shields/signals).

---

## Chess.com Interventions

### Shield: Post-Game Cooldown

| Field | Value |
|---|---|
| **id** | `chess-post-game-cooldown` |
| **interventionType** | `friction` |
| **domain** | `chess.com` |
| **Priority** | P0 (must-have) |

**What it stops**: The instant re-queue after a game ends. Chess.com surfaces "New Game" and "Rematch" buttons immediately, exploiting emotional momentum (tilt after loss → revenge game, high after win → ride the streak). The gap between one game ending and the next beginning is often under 3 seconds.

**Behavior when active**: After a game ends, the extension intercepts the post-game action buttons and overlays a configurable cooldown timer. During cooldown:

- "New Game" and "Rematch" buttons are visually dimmed and non-clickable.
- A countdown timer appears over the button area (e.g., "Breathe. 30s").
- The user can dismiss the cooldown early by clicking a small "I'm sure" link (friction, not blocking).
- The cooldown does NOT prevent reviewing the game — "Review" and "Analysis" buttons remain fully active.

**Detection strategy**: Chess.com uses React and minified class names that change frequently. We need resilient selectors:

- **Primary**: MutationObserver watching for the post-game modal DOM insertion.
- **Button identification**: Match buttons by text content ("New Game", "Rematch", "Play Again") rather than class names. Use `textContent` or `innerText` matching.
- **Game-end signal**: Watch for the result badge appearing (checkmate, resignation, timeout, draw text). Also detect URL changes from active game to post-game state.
- **Fallback**: Monitor for common container patterns (`[class*="game-over"]`, `[class*="modal"]`) with `innerText` heuristics.

**Configurable settings**:

- `cooldown-seconds`: default 30 (range: 5–300)
- `escalate-on-loss`: boolean, default true — if the game was a loss, double the cooldown (tilt protection)
- `show-breathing-prompt`: boolean, default true — show "Take a breath" text during cooldown

**CSS class**: `equanimi-chess-post-game-cooldown-active`

**Implementation notes**:

- The overlay sits above the post-game buttons but below any chess.com modals/tooltips.
- Must handle both "New Game" flow (from match result) and the `/play/online/new` page (direct navigation to start a game). The shield should only apply cooldown after a completed game, not when the user first visits the page.
- Track game completion in content script state to distinguish "first visit" from "post-game".
- The "I'm sure" escape hatch prevents this from becoming a cage. It adds one more moment of consciousness.

---

### Signal: Games Played Counter

| Field | Value |
|---|---|
| **id** | `chess-games-played` |
| **signalType** | `self-monitoring` |
| **domain** | `chess.com` |
| **Priority** | P0 (must-have) |

**What it reveals**: How many games you've played today. Chess.com provides no obvious session counter. You can play 15 games in a row and never see the number "15" — unless you go looking for your game history. This signal makes frequency visible.

**Behavior**: A small counter appears in a configurable corner of the page showing today's game count. Similar progressive escalation to YouTube's watch time:

- **0–3 games**: Subtle, low-opacity badge. Just a number.
- **4–7 games**: Counter becomes more visible. Slightly larger, higher opacity.
- **8+ games**: Counter is prominent. Optional growing stain effect (reusing the blob pattern from YouTube).

**Detection strategy**:

- **Game-start detection**: Monitor for the board becoming active (pieces movable, clock running). Use MutationObserver on the board container. Also detect URL patterns matching `/game/live/*`.
- **Game-end detection**: Same as cooldown shield — result badge appearing, game-over modal.
- **Increment logic**: Only count completed games (started + ended). Don't count abandoned games or analysis sessions. Persist count to storage, reset daily.

**Visual treatment**: Same pattern as YouTube watch time — a `div` positioned fixed in a configurable corner. Can share the position picker UI pattern from the manage page.

**Configurable settings**:

- `position`: same DwellPosition type (bottom-right, bottom-left, top-right, top-left)
- `show-stain`: boolean, default false — whether to show a growing blob on the board (more aggressive, opt-in)

**CSS class**: `equanimi-chess-games-played-active`

---

### Signal: Chess Session Time

| Field | Value |
|---|---|
| **id** | `chess-session-time` |
| **signalType** | `self-monitoring` |
| **domain** | `chess.com` |
| **Priority** | P1 (should-have) |

**What it reveals**: Total time spent on chess.com today. Analogous to YouTube's watch time but simpler — no video playback detection needed, just page visibility time.

**Behavior**: Identical to YouTube watch time counter. Counts seconds while the chess.com tab is visible. Persists daily, resets on new calendar day.

**Why separate from games-played**: They measure different things. You can play 3 long classical games in 90 minutes, or 20 bullet games in 30 minutes. Both frequency and duration matter for self-monitoring.

**Priority P1**: Ship after the cooldown shield and games-played counter. Can reuse most of the YouTube dwell time code with domain-specific adaptations.

---

## Cross-Domain Budgeting Framework

### Concept

A **budget** is a user-defined intention for how much of a domain they want to consume. It has up to three dimensions:

| Dimension | Unit | Example | Resets |
|---|---|---|---|
| **Days per week** | integer (1–7) | "I play chess 3 days/week" | Weekly (Monday) |
| **Time per day** | minutes | "30 min/day of YouTube" | Daily (midnight) |
| **Sessions per period** | count per day or week | "5 games/day" or "20 videos/week" | Daily or weekly |

Not every dimension is required. A user might set only a time budget for YouTube, or only a sessions budget for chess. Each dimension is independently optional.

### Domain Model

#### Value Objects

```typescript
// modules/budgets/types.ts

/** How a session is counted for a domain. */
export type SessionUnit =
  | "game"     // chess.com — one completed game
  | "video";   // youtube.com — one video watched (>30s playback)

/** A single budget dimension. */
export type BudgetDimension =
  | { kind: "days-per-week"; limit: number }           // 1–7
  | { kind: "time-per-day"; limitMinutes: number }      // minutes
  | { kind: "sessions-per-day"; limit: number; unit: SessionUnit }
  | { kind: "sessions-per-week"; limit: number; unit: SessionUnit };

/** A user-defined budget for a specific domain. */
export interface BudgetDefinition {
  readonly domain: string;        // "youtube.com", "chess.com"
  readonly dimensions: readonly BudgetDimension[];
}
```

#### Aggregate: BudgetState

```typescript
/** Live budget consumption state (computed, not stored directly). */
export interface BudgetConsumption {
  readonly domain: string;
  readonly dimensions: readonly DimensionConsumption[];
  /** 0.0 = fresh, 1.0 = at limit, >1.0 = over budget.
   *  Computed as max across all dimensions. */
  readonly overallProgress: number;
}

export interface DimensionConsumption {
  readonly kind: BudgetDimension["kind"];
  readonly consumed: number;     // current value (minutes, count, days)
  readonly limit: number;        // user's stated limit
  readonly progress: number;     // consumed / limit (0.0 – ∞)
}
```

The `overallProgress` is the **maximum** across all dimension progress values. If your time budget is at 80% but your session budget is at 120%, overall = 1.2. This ensures the most-violated constraint drives the response.

### Storage

Budgets use a new storage namespace:

```
local:budget:<domain>:definition     → BudgetDefinition (user's settings)
local:budget:<domain>:days-used      → number[] (ISO date strings of days used this week)
local:budget:<domain>:daily-seconds  → number (seconds accumulated today)
local:budget:<domain>:daily-date     → string (YYYY-MM-DD, for daily reset)
local:budget:<domain>:weekly-sessions → number (sessions this week)
local:budget:<domain>:weekly-date    → string (YYYY-WW, for weekly reset)
local:budget:<domain>:daily-sessions → number (sessions today)
```

Storage factories:

```typescript
// utils/storage.ts (additions)

export function budgetDefinition(domain: string) {
  return storage.defineItem<BudgetDefinition | null>(
    `local:budget:${domain}:definition`,
    { fallback: null }
  );
}

export function budgetState<T>(domain: string, key: string, fallback: T) {
  return storage.defineItem<T>(
    `local:budget:${domain}:${key}`,
    { fallback }
  );
}
```

### How Budgets Drive Interventions

Budgets don't have their own visual output. They're a **constraint layer** that modulates existing shields and signals:

#### Signal Intensity Mapping

Currently, the YouTube watch time blob's intensity is driven purely by elapsed minutes and a fixed τ curve. With budgets:

```
Signal intensity = f(budget_progress)
```

Where `budget_progress` is the overall progress from the budget aggregate. The mapping:

| Budget Progress | Signal Behavior |
|---|---|
| 0.0 – 0.5 | Minimal. Signal is subtle/transparent. |
| 0.5 – 0.8 | Signal starts becoming visible. Linear ramp. |
| 0.8 – 1.0 | Signal is clearly noticeable. Stronger visual. |
| 1.0 – 1.5 | Over budget. Signal is prominent. |
| > 1.5 | Well over budget. Signal at maximum intensity. |

This replaces (or supplements) the fixed min/max time thresholds. If you budget 30 min/day for YouTube, the blob starts appearing at 15 min (50%) and is fully visible by 30 min (100%). If you budget 2 hours, the same blob doesn't start until 60 min.

**The key insight**: the user's own stated intention drives the feedback, not a one-size-fits-all threshold. Compass, not cage — and now the compass points where *you* told it to.

#### Shield Escalation

The cooldown shield can read budget state to escalate friction:

| Budget Progress | Cooldown Multiplier |
|---|---|
| < 0.8 | 1× (normal cooldown) |
| 0.8 – 1.0 | 1.5× |
| > 1.0 | 2× |

If you set a budget of 5 games/day and you're at game 6, the cooldown doubles from 30s to 60s. Again, the "I'm sure" escape hatch always remains.

#### Days-Per-Week Dimension

The days-per-week dimension is unique because it doesn't modulate *within* a session — it gates whether today counts as a "budget day."

When the user opens a budgeted domain:

1. Check how many days they've used this week.
2. If under the limit, add today and proceed normally.
3. If at or over the limit, show a gentle prompt: "You've used chess.com 3 of your 3 days this week. Still want to continue?" (friction, not blocking).

This prompt is a signal of type `prompt` — it surfaces at the right moment.

### Architecture

```
modules/
  shields/
    ...existing...
    chess-post-game-cooldown/
      definition.ts
  signals/
    ...existing...
    chess-games-played/
      definition.ts
    chess-session-time/
      definition.ts
  budgets/
    types.ts           → BudgetDefinition, BudgetDimension, BudgetConsumption
    tracker.ts         → Pure functions to compute consumption from storage
    registry.ts        → Budget-capable domains registry

entrypoints/
  ...existing...
  chess-post-game-cooldown.content/
    index.ts           → Content script: intercepts post-game buttons
    style.css          → Cooldown overlay styling
  chess-games-played.content/
    index.ts           → Content script: game counter + optional stain
    style.css          → Counter styling
  chess-session-time.content/
    index.ts           → Content script: time counter (reuses dwell time pattern)
    style.css          → Counter styling
```

### Content Script: Chess Post-Game Cooldown

The content script matches `*://*.chess.com/*` and:

1. Sets up a MutationObserver on `document.body`.
2. When a game-end state is detected (result text, game-over modal, board freeze):
   - Records the game completion in state.
   - Finds "New Game" / "Rematch" buttons by text content.
   - Overlays a countdown div on top of those buttons.
   - Starts the cooldown timer.
   - Optionally reads budget state to scale cooldown duration.
3. When cooldown expires, removes the overlay. Buttons become clickable again.
4. "I'm sure" link within the overlay skips remaining cooldown.

**Button detection heuristic** (resilient to minification):

```typescript
function findPostGameButtons(): HTMLElement[] {
  const buttons = document.querySelectorAll("button, a[role='button']");
  const targets: HTMLElement[] = [];
  const patterns = [/new\s*game/i, /rematch/i, /play\s*again/i];

  for (const btn of buttons) {
    const text = (btn as HTMLElement).textContent?.trim() ?? "";
    if (patterns.some((p) => p.test(text))) {
      targets.push(btn as HTMLElement);
    }
  }
  return targets;
}
```

### Content Script: Chess Games Played

Similar to YouTube dwell time but counting discrete events instead of continuous time:

1. On activation, load today's game count from storage.
2. Set up MutationObserver to detect game completions.
3. On each game completion, increment counter, persist to storage.
4. Update the counter display with progressive styling.
5. Optionally show growing stain on the board (opt-in, shares blob pattern).

### Manage Page Changes

The manage page gains:

1. A new **chess.com** domain group with the cooldown shield and games-played signal.
2. **Settings panels** for:
   - Cooldown: seconds slider, escalate-on-loss toggle, breathing prompt toggle.
   - Games played: position picker, show-stain toggle.
3. **Budget section** — a new section in the manage page (or a separate tab) where users configure budgets per domain.

Budget configuration UI (per domain):

```
┌──────────────────────────────────────────┐
│ Budget: youtube.com                       │
│                                           │
│ Days per week     [slider: 1–7]  ○ Off   │
│ Time per day      [___] min      ○ Off   │
│ Videos per day    [___]          ○ Off   │
│                                           │
├──────────────────────────────────────────┤
│ Budget: chess.com                         │
│                                           │
│ Days per week     [slider: 1–7]  ○ Off   │
│ Time per day      [___] min      ○ Off   │
│ Games per day     [___]          ○ Off   │
│                                           │
└──────────────────────────────────────────┘
```

### WXT Configuration Changes

```typescript
// wxt.config.ts — add chess.com to manifest
manifest: {
  permissions: ["storage", "tabs", "activeTab"],
  // content_scripts are auto-generated by WXT from entrypoint naming
}
```

No new permissions needed. Content scripts matching `*://*.chess.com/*` are handled by WXT's entrypoint naming convention.

---

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `modules/shields/chess-post-game-cooldown/definition.ts` | **Create** | Shield definition |
| `modules/shields/registry.ts` | **Modify** | Add chess cooldown to registry |
| `modules/signals/chess-games-played/definition.ts` | **Create** | Signal definition |
| `modules/signals/chess-session-time/definition.ts` | **Create** | Signal definition (P1) |
| `modules/signals/registry.ts` | **Modify** | Add chess signals to registry |
| `modules/budgets/types.ts` | **Create** | Budget domain types |
| `modules/budgets/tracker.ts` | **Create** | Pure consumption computation |
| `modules/budgets/registry.ts` | **Create** | Budget-capable domains |
| `entrypoints/chess-post-game-cooldown.content/index.ts` | **Create** | Cooldown content script |
| `entrypoints/chess-post-game-cooldown.content/style.css` | **Create** | Cooldown overlay CSS |
| `entrypoints/chess-games-played.content/index.ts` | **Create** | Games counter content script |
| `entrypoints/chess-games-played.content/style.css` | **Create** | Counter CSS |
| `entrypoints/chess-session-time.content/index.ts` | **Create** | Session time (P1) |
| `entrypoints/chess-session-time.content/style.css` | **Create** | Session time CSS (P1) |
| `entrypoints/manage/main.ts` | **Modify** | Add budget config UI |
| `utils/storage.ts` | **Modify** | Add budget storage factories |

---

## Priority & Scoping

### Must-Have (P0) — This Cycle

- Chess post-game cooldown shield (definition + content script + settings)
- Chess games-played counter signal (definition + content script + settings)
- Budget types and storage foundations (`modules/budgets/types.ts`, storage factories)
- Budget configuration in manage page (per-domain dimension inputs)

### Should-Have (P1) — This Cycle If Time

- Chess session time signal (port of YouTube dwell time pattern)
- Budget-driven signal intensity for YouTube watch time blob
- Budget-driven cooldown escalation for chess

### Nice-to-Have (P2) — Next Cycle

- Days-per-week prompt signal ("You've used 3 of your 3 days")
- Budget progress bar in popup (shows % consumed for current domain)
- Cross-domain budget dashboard in manage page
- Video count tracking for YouTube sessions budget dimension

---

## Open Questions

1. **Chess.com selector resilience** — How often do chess.com's minified class names change? We need to test the text-content heuristic approach. If it breaks frequently, we may need to maintain a selector map that gets updated with the extension.

2. **Game type discrimination** — Should we count all game types equally? A 1-minute bullet game and a 30-minute rapid game are very different engagements. For v1, count all equally. Consider weighting by time control later.

3. **Budget without signals** — If a user sets a budget but has all signals disabled, the budget has no effect. Should budgets *require* at least one signal to be on? For now: no enforcement, trust the user.

4. **Weekly reset day** — Is Monday the right weekly reset? Some users think in Sun–Sat weeks. Configurable? For v1, use Monday. Add configuration in P2.

5. **Budget interaction with existing min/max settings** — The YouTube watch time signal already has configurable min/max minutes. How does this interact with a time-per-day budget? Proposal: budget overrides min/max when set. If no budget, min/max applies as before (graceful degradation).

---

## Domain Event Flow (Future, P2)

When we eventually add domain events, the flow would be:

```
GameCompleted → [increment session count]
                [check budget consumption]
                [emit BudgetProgressChanged]

BudgetProgressChanged → [update signal intensity]
                        [update cooldown multiplier]
                        [update counter styling]
```

For P0, we skip events and have content scripts directly read budget storage. Events become relevant when we add cross-context communication (e.g., background script aggregation).
