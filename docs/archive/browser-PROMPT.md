# Equanimi — System Prompt

You are building **Equanimi**, a modular browser extension that puts stopping cues back where platforms removed them. It targets compulsive consumption patterns on specific sites (YouTube, chess.com, LinkedIn, etc.) using interventions grounded in Buddhist psychology and behavior change science.

## Core Philosophy

Platforms have industrialized the removal of stopping cues. Books end, meals finish — but feeds are bottomless. Equanimi restores the gaps where awareness can enter.

**Compass, not cage.** Every intervention increases friction or awareness. Nothing ever fully blocks access. The user always retains agency.

## Intervention Axes

Equanimi operates on three axes, each mapped to a Buddhist psychological concept:

### 1. Shields (Subtractive — fight lobha/craving)

Remove stimuli the platform uses to hijack attention. BCT #12: restructuring the environment.

Each shield has an `InterventionType`:

- **`cue-removal`** — Hides compulsive UI elements (nav buttons, recommendation shelves, autoplay triggers). CSS-only when possible.
- **`access-block`** — Blocks scroll/interaction mechanics (scroll-snap override, event interception). JS required.
- **`friction`** — Adds delay or confirmation before a compulsive action (cooldown timers with "I'm sure" escape hatch). JS + overlay.
- **`environment`** — Restructures page layout to reduce triggers (hiding sidebars, collapsing sections). CSS-only when possible.

**Key constraint**: Friction-type shields always include an escape hatch ("I'm sure" link). The hatch adds one moment of conscious choice — it doesn't eliminate friction, it gates it behind awareness.

### 2. Signals (Additive — fight moha/delusion)

Introduce awareness the platform deliberately hides. BCT #2.3: self-monitoring + BCT #7.1: prompts/cues.

Each signal has a `SignalType`:

- **`self-monitoring`** — Makes behavior visible (elapsed time, game count, frequency). Counters and visual indicators.
- **`prompt`** — Surfaces a reminder at the right moment ("You've used 3 of your 3 days this week").
- **`reflection`** — Asks a question ("Is this what you intended?").

**Progressive escalation**: Signals start subtle and become more visible over time or as budget consumption increases. They never fully obstruct — maximum ~60-70% coverage at edges, always transparent at center.

### 3. Budgets (Aspirational — encode sīla/ethical commitment)

User-defined intentions for consumption limits. Budgets don't block anything — they modulate shield friction and signal intensity based on how close the user is to their stated aspiration.

Budget dimensions:

- **`days-per-week`** — "I play chess 3 days/week" (limit: 1–7, resets weekly)
- **`time-per-day`** — "30 min/day of YouTube" (in minutes, resets daily)
- **`sessions-per-day`** — "5 games/day" (count, resets daily)
- **`sessions-per-week`** — "20 videos/week" (count, resets weekly)

Each dimension is independently optional. `overallProgress` = max across all dimensions. This drives:

- **Signal intensity**: 0–50% → subtle, 50–80% → ramp, 80–100% → noticeable, >100% → prominent
- **Shield escalation**: <80% → 1× friction, 80–100% → 1.5×, >100% → 2×

## Future Direction: Consumption Pressure

A cross-domain aggregate score (modeled on vedanā — the feeling tone that precedes craving) detecting compulsive patterns that no individual domain budget catches: scatter (rapid domain-hopping), displacement (over-budget on A → migrate to B), and binge. This is exploratory — not yet in architecture.

## Architecture

Built with [WXT](https://wxt.dev) (Chrome extension framework). TypeScript throughout.

```
modules/
  shields/
    types.ts          → ShieldDefinition, InterventionType
    registry.ts       → All registered shields (single source of truth)
    <shield-id>/
      definition.ts   → ShieldDefinition value object
  signals/
    types.ts          → SignalDefinition, SignalType
    registry.ts       → All registered signals
    <signal-id>/
      definition.ts   → SignalDefinition value object
  budgets/
    types.ts          → BudgetDefinition, BudgetDimension, BudgetConsumption

entrypoints/
  background.ts       → Badge management, cross-tab coordination
  popup/              → Per-site toggle UI (popup.html + main.ts + style.css)
  manage/             → Full settings page (manage.html + main.ts + style.css)
  <module-id>.content/
    index.ts          → Content script (injected into target site)
    style.css         → Styles for the intervention

utils/
  storage.ts          → Storage factories (shields, signals, budgets, cooldowns)
```

### Adding a New Module

To add a new shield or signal:

1. Create `modules/shields/<id>/definition.ts` (or `modules/signals/<id>/definition.ts`) exporting a `ShieldDefinition` or `SignalDefinition` value object.
2. Add it to the corresponding `registry.ts`.
3. Create `entrypoints/<id>.content/index.ts` + `style.css` as the content script.
4. The popup and badge system pick it up automatically from the registry.

### Storage Conventions

```
local:shield:<id>:enabled          → boolean (toggle state)
local:shield:<id>:<setting-key>    → per-shield settings
local:signal:<id>:enabled          → boolean (toggle state)
local:signal:<id>:<setting-key>    → per-signal settings
local:budget:<domain>:definition   → BudgetDefinition
local:budget:<domain>:<state-key>  → consumption tracking
local:cooldown:<domain>:until      → Unix-ms timestamp (0 = inactive)
```

### DOM Resilience

Target sites use React SPAs with minified, unstable class names. Prefer:

- **Text content matching** over class selectors (`button.textContent` regex)
- **Semantic selectors** (ARIA roles, `data-*` attributes, element IDs)
- **MutationObserver** for detecting dynamic DOM changes (game-end modals, SPA navigation)
- Accept some fragility — the extension ships updates, sites change.

### CSS Conventions

Each content script adds a body class `equanimi-<module-id>-active` when the intervention is running. All CSS rules are scoped under this class to avoid conflicts and allow clean enable/disable.

## Design Anti-Patterns (Do NOT)

- **Gamification**: No streaks, points, leaderboards, achievements. We'd become what we fight.
- **Social features**: No accountability partners, sharing, or comparison.
- **Historical dashboards**: No graphs of past usage. The goal is present-moment awareness, not data hoarding.
- **Paternalism**: Never tell the user they're "addicted" or "wasting time." Surface facts. Let them decide.
- **Hard blocking**: Never make a site unreachable. Maximum friction, minimum zero-access.
- **AI coaching**: No LLM telling the user what to do. Equanimi is a mirror, not a coach.

## Tone

The intervention copy is calm, non-judgmental, and minimal. Examples:

- "Breathe. 30s." (cooldown overlay)
- "Comments hidden by Equanimi" (placeholder text)
- "You've been here 45 minutes." (dwell time counter — just the fact)
- "You've played 8 games today." (games counter — just the number)
- "You've used 3 of your 3 days this week. Still want to continue?" (budget prompt — question, not command)

## Tech Stack

- **WXT** for extension framework (manifest v3, content scripts, background service worker)
- **TypeScript** (strict)
- **Vanilla DOM** in content scripts (no React/framework overhead in injected code)
- **chrome.storage.local** via WXT's `storage` API for all persistence
- **CSS** for visual interventions; JS only when behavior interception is needed
- **pnpm** for package management
