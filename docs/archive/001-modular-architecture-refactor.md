# Spec: Modular Architecture Refactor

**Status**: Draft
**Author**: The operator + Claude
**Date**: 2026-02-10

---

## Problem Statement

Equanimi currently has a single hardcoded YouTube Shorts shield. Every layer — storage, content script, popup UI, background badge, CSS class names, icon — assumes a single boolean toggle for a single site intervention.

To become a modular attention intervention platform, the architecture needs to support N independent, **atomic** shields — each targeting a specific compulsive pattern on a specific domain — without each new shield requiring changes to shared infrastructure.

"Atomic" means one shield = one intervention. YouTube alone could have three shields: Shorts scroll-lock, homepage feed removal, autoplay disable. Each is independently toggleable, but the popup groups them by domain for usability.

Additionally, the badge and icon were designed for "Mindful Shorts" (pause symbol, "ON" text) and don't communicate the Equanimi brand or the multi-shield concept. They need rethinking.

## Goals

1. **Adding a new shield requires only adding files under `modules/shields/`** — no changes to popup, background, or shared storage logic.
2. **Each shield is independently toggleable** — enabling YouTube Shorts scroll-lock does not affect YouTube homepage cleanup or any Chess.com shield.
3. **The popup groups shields by domain** — shields are visually grouped under their domain heading, with an "enable all" affordance per domain group.
4. **Badge is tab-contextual** — shows whether *any* shield is active on the current tab's domain.
5. **Icon reflects the Equanimi brand** — not the old "Mindful Shorts" pause symbol.
6. **BCT classification baked in** — every shield declares its `InterventionType` from day one. The type system enforces this.
7. **Zero regression** — YouTube Shorts shield works exactly as before after refactor.

## Non-Goals

- **Building new modules** (chess.com, LinkedIn). This spec is refactoring only. New modules are a separate cycle.
- **Per-shield settings UI**. Shields get an on/off toggle now. Custom settings (cooldown duration, blocked keys, etc.) are future work. But the architecture should make per-shield settings easy to add later.
- **Onboarding flow**. No first-run experience for this cycle.
- **React/framework migration for popup**. Keep vanilla TS. The popup is simple enough that a framework adds weight without value at this stage.
- **Firefox support**. Chrome MV3 only.
- **Grouping by InterventionType in popup**. Domain grouping first. BCT-based grouping is a future UX exploration.

## User Stories

**As a user**, I want to see all available shields grouped by website in the popup so that I can understand what Equanimi does on each site I visit.

**As a user**, I want to toggle individual shields independently so that I can keep Shorts blocking on while allowing other YouTube interventions to be off.

**As a user**, I want a quick "enable all" toggle per domain so that I don't have to toggle five YouTube shields one by one.

**As a user**, I want to see at a glance whether Equanimi is protecting me on the current tab (via badge/icon) so that I know a shield is active without opening the popup.

**As a developer**, I want to add a new shield by creating a single directory under `modules/shields/` with a definition, content script, and CSS so that I don't have to modify shared infrastructure.

**As a user**, I want my per-shield preferences to persist across sessions so that I don't have to re-enable shields after restarting Chrome.

## Domain Model (DDD)

### Leverage Point Analysis

This refactor operates at **leverage point #4 (Self-Organization Power)** — building a plugin architecture that lets the system evolve by adding new shields without changing core infrastructure. It also targets **#5 (Rules)** — the type system should make it hard to create a malformed shield or reference a non-existent one.

### Bounded Contexts

**Shield domain** (`modules/shields/`) — Pure definitions. No infrastructure dependencies. Answers: "What shields exist, what do they target, and what kind of intervention are they?"

**Intervention infrastructure** (`entrypoints/`) — WXT-specific content scripts, popup, background. Answers: "How do shields get injected into the browser?"

**Persistence** (`utils/storage.ts`) — Chrome storage abstraction. Answers: "How is shield state persisted?"

The key boundary: a `ShieldDefinition` is a **Value Object** (immutable metadata). The shield's runtime state (enabled/disabled) is separate and lives in storage. The content script brings implementation — the definition doesn't know about CSS selectors or DOM manipulation.

### Derived Concepts

**DomainGroup** — Not a persisted entity. A runtime projection derived by grouping shields from the registry by their `domain` field. The popup computes this; it's not stored anywhere. This keeps the domain model flat (shields are the only first-class concept) while giving the UI the structure it needs.

### BCT Classification

Each shield implements one or more Behavior Change Techniques. The `interventionType` field captures which BCT pattern the shield primarily uses — this informs future UI grouping, helps users understand *what kind* of protection each shield provides, and gives the architecture a behavioral science backbone.

| BCT Grouping | Technique | Shield Example |
|---|---|---|
| **Antecedents** (#12) | Avoidance/reducing exposure to cues | `youtube-shorts-scroll-lock`: hide nav buttons, kill scroll-snap |
| **Antecedents** (#12) | Restructuring physical environment | `linkedin-feed-removal`: remove feed, hide sidebar |
| **Associations** (#7) | Remove access to reward | `chess-auto-rematch-block`: block auto-rematch |
| **Regulation** (#11) | Conserving mental resources | All shields: reduce decision fatigue by removing compulsive choices |

Future shields will introduce `"friction"` (e.g., a cooldown timer before re-enabling) and `"environment"` (e.g., full page restructuring) intervention types.

## Architecture

### Current State

```
utils/storage.ts            → single `enabled` boolean
entrypoints/
  background.ts             → watches single `enabled`, sets "ON"/"" badge
  popup/main.ts             → single toggle checkbox
  youtube-shorts.content/   → reads single `enabled`, adds "mindful-shorts-active" class
```

**Problems:**
- `storage.ts` has one key (`local:enabled`) — doesn't scale to N shields
- `background.ts` hardcodes youtube.com URL check for badge updates
- `popup/main.ts` renders one toggle — can't represent multiple shields
- CSS class `mindful-shorts-active` is shield-specific but lives on `<html>` globally
- No domain model — everything is ad-hoc wiring

### Target State

```
modules/
  shields/
    types.ts                 → ShieldDefinition interface + InterventionType
    registry.ts              → typed array of all shield definitions
    youtube-shorts/
      definition.ts          → ShieldDefinition for YouTube Shorts scroll-lock
    youtube-homepage/         → (future — architecture supports it)
    youtube-autoplay/         → (future)
    chess-auto-rematch/       → (future)
    linkedin-feed/            → (future)

utils/
  storage.ts                 → generic per-shield storage: `local:shield:<id>:enabled`

entrypoints/
  background.ts              → reads registry, watches all shield states, tab-contextual badge
  popup/
    main.ts                  → reads registry, groups by domain, renders domain groups + toggles
    style.css                → domain-grouped multi-toggle layout
  youtube-shorts.content/    → imports own shield definition, reads own storage key
```

Shields live under `modules/shields/` to leave room for future non-shield module types (cooldown timers, intent prompts, analytics, etc.).

### Shield Definition Type

```typescript
// modules/shields/types.ts

export type InterventionType =
  | "cue-removal"       // Hides compulsive UI elements (nav buttons, autoplay)
  | "access-block"      // Blocks scroll/interaction mechanics
  | "friction"          // Adds delay/confirmation before compulsive action
  | "environment";      // Restructures page layout to reduce triggers

export interface ShieldDefinition {
  readonly id: string;                       // unique, kebab-case (e.g. "youtube-shorts-scroll-lock")
  readonly name: string;                     // human display name (e.g. "Shorts Scroll Lock")
  readonly description: string;              // one-liner for popup (e.g. "Blocks compulsive scrolling on Shorts")
  readonly domain: string;                   // grouping key + badge matching (e.g. "youtube.com")
  readonly icon: string;                     // emoji for popup row
  readonly interventionType: InterventionType;  // BCT classification
  readonly defaultEnabled: boolean;          // initial state on first install
}
```

Note: all fields are `readonly` — `ShieldDefinition` is a Value Object. Immutable by convention and by type.

### Registry

```typescript
// modules/shields/registry.ts

import { youtubeShorts } from "./youtube-shorts/definition";
// import { youtubeHomepage } from "./youtube-homepage/definition";  // future
// import { chessAutoRematch } from "./chess-auto-rematch/definition";  // future

export const shields: readonly ShieldDefinition[] = [
  youtubeShorts,
  // youtubeHomepage,   // uncomment when content script exists
  // chessAutoRematch,  // uncomment when content script exists
] as const;

// Derived: unique domains from the registry (for popup grouping + badge matching)
export const shieldedDomains: readonly string[] = [
  ...new Set(shields.map((s) => s.domain)),
];
```

The registry is the **single source of truth**. Popup, background, and storage all derive their behavior from it.

### Storage Convention

Each shield gets its own namespaced storage key:

```
local:shield:youtube-shorts-scroll-lock:enabled  → boolean
local:shield:youtube-homepage-cleanup:enabled     → boolean
local:shield:chess-auto-rematch-block:enabled     → boolean
```

The `storage.ts` utility exposes a factory:

```typescript
export function shieldEnabled(shieldId: string, fallback: boolean) {
  return storage.defineItem<boolean>(`local:shield:${shieldId}:enabled`, { fallback });
}
```

Leaves room for future per-shield settings:

```
local:shield:chess-auto-rematch-block:cooldown-seconds  → number
local:shield:youtube-shorts-scroll-lock:blocked-keys    → string[]
```

### Content Script Pattern

Each content script imports its own shield definition and uses the generic storage factory. The CSS class on `<html>` is namespaced per shield: `equanimi-<shieldId>-active`.

**One content script per shield** (not per domain). This keeps each shield self-contained and avoids coupling between shields that happen to target the same domain. WXT handles registering multiple content scripts for the same domain match pattern.

```typescript
// entrypoints/youtube-shorts.content/index.ts
import { shieldEnabled } from "@/utils/storage";
import { youtubeShorts } from "@/modules/shields/youtube-shorts/definition";

const enabled = shieldEnabled(youtubeShorts.id, youtubeShorts.defaultEnabled);

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",
  async main() {
    const isEnabled = await enabled.getValue();
    if (isEnabled) activate();

    enabled.watch((newValue) => {
      if (newValue) activate();
      else deactivate();
    });
  },
});

function activate(): void {
  document.documentElement.classList.add(`equanimi-${youtubeShorts.id}-active`);
  // shield-specific DOM manipulation...
}

function deactivate(): void {
  document.documentElement.classList.remove(`equanimi-${youtubeShorts.id}-active`);
  // shield-specific cleanup...
}
```

When YouTube eventually has multiple shields (scroll-lock, homepage cleanup, autoplay), each gets its own content script file under `entrypoints/`. All match `*://*.youtube.com/*` but each manages its own CSS class and DOM manipulation independently. No shared state between them.

### Popup Rendering

The popup reads the shield registry, groups shields by `domain`, and renders one collapsible domain group per unique domain. Each group has an "enable all" toggle and individual shield toggles.

```
┌──────────────────────────────────┐
│           Equanimi                │
│    Stopping cues for the         │
│           internet               │
├──────────────────────────────────┤
│                                  │
│ youtube.com             [ALL ON] │
│ ┊                                │
│ ┊ 📺 Shorts Scroll Lock    [ON] │
│ ┊    Blocks compulsive scrolling │
│                                  │
│ chess.com              [ALL OFF] │
│ ┊                                │
│ ┊ ♟️ Auto-Rematch Block   [OFF] │
│ ┊    Prevents auto-rematch loop  │
│                                  │
│ linkedin.com           [ALL OFF] │
│ ┊                                │
│ ┊ 💼 Feed Removal         [OFF] │
│ ┊    Removes infinite feed       │
│                                  │
└──────────────────────────────────┘
```

**Domain group "enable all" behavior:**
- Toggling "ALL ON" enables every shield in that domain group.
- Toggling "ALL OFF" disables every shield in that domain group.
- The domain toggle reflects a derived state: ON if *all* shields in the group are on, OFF if *any* are off. (Could also be a three-state: all on / mixed / all off — but that's P1 complexity.)

**Rendering logic** (pseudo-code):

```typescript
const groups = groupBy(shields, (s) => s.domain);

for (const [domain, domainShields] of Object.entries(groups)) {
  renderDomainHeader(domain, domainShields);
  for (const shield of domainShields) {
    renderShieldToggle(shield);
  }
}
```

No hardcoded HTML — the list is fully generated from `registry.ts`. Adding a shield definition to the registry is the only step needed for it to appear in the popup.

### Badge & Icon

**Current**: Pause symbol icon. "ON" text badge. Green when active. Not brand-appropriate.

**Proposed**: Tab-contextual badge. Tells you whether Equanimi is protecting you *on the current tab's domain*.

**Behavior:**
- **On a shielded domain + any shield enabled** (e.g., youtube.com with at least one YouTube shield on) → green badge dot or checkmark
- **On a shielded domain + all shields disabled** (e.g., youtube.com but all YouTube shields off) → no badge, muted icon
- **On an unshielded domain** (e.g., google.com) → no badge, neutral icon

The badge answers one question: "Is Equanimi doing anything on this page right now?"

**Implementation**: Background listens to `tabs.onActivated` and `tabs.onUpdated`. On tab change, extracts hostname from the active tab's URL, checks against `shieldedDomains`, then checks whether *any* shield matching that domain is enabled. Updates badge per tab using `tabId`-scoped API.

```typescript
async function updateBadgeForTab(tabId: number, url: string): Promise<void> {
  const hostname = new URL(url).hostname.replace("www.", "");
  const domainShields = shields.filter((s) => hostname.includes(s.domain));

  if (domainShields.length === 0) {
    // Not a shielded domain
    await browser.action.setBadgeText({ text: "", tabId });
    return;
  }

  const states = await Promise.all(
    domainShields.map((s) => shieldEnabled(s.id, s.defaultEnabled).getValue())
  );
  const anyActive = states.some(Boolean);

  await browser.action.setBadgeText({ text: anyActive ? "✓" : "", tabId });
  await browser.action.setBadgeBackgroundColor({
    color: anyActive ? "#4ade80" : "#94a3b8",
    tabId,
  });
}
```

**Icon**: Replace pause symbol with Equanimi brand mark — shield outline or balanced circle. Legible at 16px. Static icon, dynamic badge.

## Requirements

### Must-Have (P0)

- [ ] **Shield types + registry** — `modules/shields/types.ts` exports `ShieldDefinition` interface and `InterventionType`. `modules/shields/registry.ts` exports a typed array. All shared code (popup, background) reads from this registry.
  - *Acceptance*: Adding a new `ShieldDefinition` to the registry and its content script causes a new toggle to appear in the popup without any other code changes.

- [ ] **Namespaced storage** — `utils/storage.ts` exports `shieldEnabled(id, fallback)` factory. All shields use this instead of the current single `enabled` key.
  - *Acceptance*: Two shields can have independent enabled/disabled states persisted across sessions.

- [ ] **Dynamic popup with domain grouping** — Popup reads registry, groups shields by `domain`, renders domain headers with "enable all" toggle, and individual shield toggles underneath.
  - *Acceptance*: Shields sharing a domain appear under the same group header. Toggling "enable all" on a domain group sets all its shields to the same state. Toggling one shield does not affect shields in other domain groups.

- [ ] **Tab-contextual badge** — Background watches all shield states and active tab URL. Badge shows whether *any* shield is active on the current tab's domain.
  - *Acceptance*: Badge shows green indicator on youtube.com when any YouTube shield is on. No badge on google.com. No badge on youtube.com when all YouTube shields are off.

- [ ] **YouTube Shorts migration** — Existing content script migrated to new pattern: imports from `modules/shields/youtube-shorts/definition.ts`, uses `shieldEnabled()`, CSS class renamed to `equanimi-youtube-shorts-scroll-lock-active`. All blocking behaviour preserved.
  - *Acceptance*: YouTube Shorts scrolling is blocked exactly as before. Toggle on/off works without reload.

- [ ] **New icon** — Replace pause symbol with Equanimi brand mark. Works at 16, 32, 48, 128px.
  - *Acceptance*: Icon renders clearly at 16px in Chrome toolbar. Communicates "shield" or "balance" rather than "pause."

### Should-Have (P1)

- [ ] **Shield description in popup** — Each toggle row shows a one-line description as subtitle text.
  - *Acceptance*: User can read what each shield does without leaving the popup.

- [ ] **Smooth toggle animation** — Toggle switches animate on state change (current CSS transition preserved, applied consistently).

- [ ] **Domain group mixed-state indicator** — When some shields in a domain are on and some are off, the domain header toggle shows a visual "partial" state (e.g., dash instead of checkmark).
  - *Acceptance*: User can distinguish "all on", "all off", and "some on" at a glance.

### Nice-to-Have (P2)

- [ ] **Per-shield settings** — Each shield can declare a settings schema (e.g., `cooldownSeconds: number`). Popup renders a "settings" expandable per shield. Storage convention `local:shield:<id>:<setting>` already supports this.

- [ ] **Group shields by InterventionType** — Alternative popup layout grouping shields by their BCT type (cue-removal, friction, etc.) instead of by domain. Could be a user-togglable view.

- [ ] **Scheduling** — "Enable this shield only during work hours" or "disable on weekends" (cheat days).

- [ ] **Suggested shields** — When user visits a domain with an available but disabled shield, show a subtle suggestion.

## Success Metrics

- **Zero regression**: YouTube Shorts shield passes all existing manual test cases after refactor.
- **Module extensibility**: A new dummy shield can be added in < 15 minutes by someone unfamiliar with the codebase (measured by the operator doing it).
- **Code reduction**: Shared infrastructure (popup, background) does not grow linearly with shield count — adding a shield adds 0 lines to popup/main.ts and background.ts.

## Decisions (Resolved)

1. **Shield granularity: atomic** — One shield = one intervention. Multiple shields can target the same domain. Shields are grouped by domain in the popup for usability, but the domain group is a UI concern, not a domain model concept.

2. **Content script per feature (not per domain)** — Each shield gets its own content script file. When YouTube has three shields, there are three content scripts matching `youtube.com`. WXT handles this. Simpler to reason about, no shared state between shields on the same domain.

3. **Storage migration: reset** — Current users have `local:enabled`. User base is ~0, so we reset rather than migrate. The old key is simply ignored.

4. **InterventionType baked in from day one** — Every `ShieldDefinition` requires an `interventionType` field. This costs nothing now and enables BCT-based grouping, analytics, and UI patterns later.

## Open Questions

1. **Icon design** — What visual symbol represents Equanimi at 16px? Options: shield outline, balanced circle, lotus, simple "E" mark. → the operator to decide.

2. **Should future shields show in popup before implementation?** — If chess.com and LinkedIn shields don't have content scripts yet, should their definitions appear in the registry as "coming soon"? → Product decision. Recommendation: no — only register shields that have working content scripts.

3. **Domain group "enable all" tri-state** — Should the domain header toggle have two states (on/off) or three (all on / mixed / all off)? Two-state is simpler for P0. Three-state is better UX when a domain has many shields. → Could defer to P1.

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `modules/shields/types.ts` | **Create** | `ShieldDefinition` interface + `InterventionType` |
| `modules/shields/registry.ts` | **Create** | Typed array of all shield definitions + derived `shieldedDomains` |
| `modules/shields/youtube-shorts/definition.ts` | **Create** | YouTube Shorts scroll-lock shield definition |
| `utils/storage.ts` | **Modify** | Add `shieldEnabled()` factory, keep old `enabled` export temporarily |
| `entrypoints/youtube-shorts.content/index.ts` | **Modify** | Import from shield definition, use namespaced storage, new CSS class |
| `entrypoints/youtube-shorts.content/style.css` | **Modify** | Rename class to `equanimi-youtube-shorts-scroll-lock-active` |
| `entrypoints/background.ts` | **Modify** | Read registry, watch all shields, tab-contextual badge per `tabId` |
| `entrypoints/popup/index.html` | **Modify** | Remove hardcoded toggle, add dynamic container for domain groups |
| `entrypoints/popup/main.ts` | **Modify** | Read registry, group by domain, render domain groups + toggles |
| `entrypoints/popup/style.css` | **Modify** | Domain-grouped multi-toggle layout with indented shield rows |
| `public/icons/*` | **Replace** | New Equanimi brand icon |
