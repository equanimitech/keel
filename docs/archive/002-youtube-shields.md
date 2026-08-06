# Spec: YouTube Intervention Suite

**Status**: Draft
**Author**: The operator + Claude
**Date**: 2026-02-10
**Depends on**: 001-modular-architecture-refactor

---

## Problem Statement

YouTube deploys multiple compulsive UI patterns — infinite algorithmic feeds, sidebar recommendations, Shorts injection, engagement loops in comments. Our current Equanimi build addresses only one: Shorts scroll-lock.

Rather than cataloging every possible intervention, we're shipping a focused set of four that cover the highest-impact compulsion vectors with two complementary strategies: **shields** (remove compulsive cues) and **signals** (surface hidden truths).

## Intervention Philosophy

Equanimi operates on two axes:

- **Shields** are subtractive — they remove stimuli the platform uses to hijack attention. They fight **lobha** (craving) by eliminating objects of craving. BCT #12 (Antecedents / restructuring environment).

- **Signals** are additive — they introduce awareness the platform deliberately hides. They fight **moha** (delusion) by making the unconscious conscious. BCT #2.3 (Self-monitoring of behavior) + #7.1 (Prompts/cues).

Together: shields reduce the pull, signals increase the noticing.

## Goals

1. **Ship three new YouTube interventions** — two shields + one signal.
2. **Introduce the signal module type** to the Equanimi architecture.
3. **Preserve agency** — no intervention blocks the user. Shields remove cues. The signal adds friction progressively but never fully obstructs.
4. **Zero regression** on the existing Shorts scroll-lock shield.

## Non-Goals

- Autoplay kill (impactful but technically fragile — YouTube changes the autoplay mechanism frequently; defer to a future cycle).
- End screens, notification badges, engagement metrics (lower impact; defer).
- Time budgets, session limits, historical tracking (different module type; out of scope).
- Homepage feed replacement with search bar (too opinionated for v1; the Shorts removal shield is sufficient for homepage).

---

## Interventions

### Shield: Remove Shorts from Homepage

| Field | Value |
|---|---|
| **id** | `youtube-shorts-homepage` |
| **interventionType** | `cue-removal` |
| **Priority** | P0 |

**What it stops**: YouTube injects Shorts shelves into the homepage feed, subscription feed, search results, and channel pages. Each is a doorway to the Shorts scroll-loop.

**DOM targets**:
- Shorts shelf on homepage: `ytd-rich-shelf-renderer` where title text contains "Shorts"
- Shorts in search results: `ytd-reel-shelf-renderer`
- Shorts in subscription feed: `ytd-rich-shelf-renderer` Shorts variant
- Shorts sidebar nav entry: `ytd-guide-entry-renderer` or `ytd-mini-guide-entry-renderer` linking to `/shorts`
- Any inline Shorts tile: elements with `a[href^="/shorts/"]` within feed contexts

**Behavior when active**: All Shorts entry points are hidden across YouTube. The `/shorts` page itself still works (scroll-lock shield handles that). This shield prevents the *temptation* to navigate there. CSS-only — no JS needed.

**Relationship to scroll-lock**: Complementary. Scroll-lock blocks the behavior once you're on `/shorts`. Homepage removal blocks the cues that pull you there. Independent toggles.

**CSS class**: `equanimi-youtube-shorts-homepage-active`

---

### Shield: Hide Sidebar Recommendations

| Field | Value |
|---|---|
| **id** | `youtube-sidebar-recs` |
| **interventionType** | `cue-removal` |
| **Priority** | P0 |

**What it stops**: While watching a video, a sidebar of 20+ algorithmically-ranked recommendations creates constant temptation to switch. "Up Next" at the top is YouTube's highest-conversion placement.

**DOM targets**:
- Sidebar container: `#secondary` or `#secondary-inner` on `/watch` pages
- Recommendation items: `ytd-compact-video-renderer`
- Live chat panel: `#chat` (should NOT be hidden — different purpose)

**Behavior when active**: The entire `#secondary` column is hidden on watch pages. The video player area expands naturally. Live chat on streams is not affected (separate element tree).

**CSS class**: `equanimi-youtube-sidebar-recs-active`

---

### Shield: Hide Comments Section

| Field | Value |
|---|---|
| **id** | `youtube-comments-hide` |
| **interventionType** | `access-block` |
| **Priority** | P0 |

**What it stops**: Comments create a social engagement loop — argument bait (controversial comments sorted to top), social reward (likes, creator hearts), and infinite scrolling. This applies on both regular videos and Shorts.

**DOM targets**:
- Comments on watch pages: `#comments` or `ytd-comments#comments`
- Comments on Shorts: `ytd-engagement-panel-section-list-renderer` containing comments panel (opened via the comments button on Shorts)
- Comment button on Shorts player: the comments icon in the Shorts action bar

**Behavior when active**: The `#comments` section is hidden on watch pages. On Shorts, the comments panel doesn't open (button is hidden or inert). A subtle placeholder text "Comments hidden by Equanimi" appears in the comments area so users know it's intentional, not broken.

**CSS class**: `equanimi-youtube-comments-hide-active`

---

### Signal: Dwell Time Indicator

| Field | Value |
|---|---|
| **id** | `youtube-dwell-time` |
| **signalType** | `self-monitoring` |
| **Priority** | P0 |

**What it reveals**: How long you've been on YouTube this session. The platform is designed to make time invisible — no clock, no session counter, infinite content. This signal makes duration conscious.

**Behavior**: A small, non-intrusive clock appears in the bottom-right corner of the page. It starts counting from 0:00 when you arrive on youtube.com.

**Progressive escalation**:
- **0–10 min**: Subtle, low-opacity counter. Just a number. Barely noticeable.
- **10–30 min**: Counter becomes more visible (higher opacity). A faint tinted overlay begins to appear at the edges of the page.
- **30–60 min**: The tint deepens. The overlay ("stain") grows inward from the edges, covering maybe 20–30% of the viewport periphery.
- **60+ min**: The stain reaches ~60% coverage. The center of the page (video player) stays usable. The periphery is heavily tinted. The counter is now prominent.

**Design constraints**:
- The stain **never fully covers the page**. Maximum ~60–70% opacity at edges, always transparent at center. Uncomfortable but not unusable. Compass, not cage.
- The counter resets on navigation away from youtube.com (new session = clean slate).
- No historical tracking. No dashboards. No data persistence. Pure in-the-moment awareness.
- The stain should feel organic, not clinical — think ink bleeding into paper, not a progress bar.

**Implementation**: This is JS, not CSS-only. Needs:
- A session timer (starts on content script load, resets on `visibilitychange` to hidden for >5 min or domain change)
- A DOM overlay injected at the edges of the viewport
- CSS animations/transitions for the progressive stain growth
- The counter element positioned fixed, bottom-right

**CSS class**: `equanimi-youtube-dwell-time-active`

---

## Architecture Changes

### New module type: Signal

Signals live alongside shields in `modules/`:

```
modules/
  shields/
    types.ts              → ShieldDefinition + InterventionType
    registry.ts           → shield registry
    youtube-shorts/       → existing
    youtube-shorts-homepage/  → new
    youtube-sidebar-recs/     → new
    youtube-comments-hide/    → new
  signals/
    types.ts              → SignalDefinition + SignalType
    registry.ts           → signal registry
    youtube-dwell-time/   → new
```

### SignalDefinition type

```typescript
// modules/signals/types.ts

export type SignalType =
  | "self-monitoring"    // Makes behavior visible (time, frequency, patterns)
  | "prompt"             // Surfaces a reminder at the right moment
  | "reflection";        // Asks a question ("Is this what you intended?")

export interface SignalDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly icon: string;
  readonly signalType: SignalType;
  readonly defaultEnabled: boolean;
}
```

### Storage

Signals use the same `local:signal:<id>:enabled` convention:

```typescript
export function signalEnabled(signalId: string, fallback: boolean) {
  return storage.defineItem<boolean>(`local:signal:${signalId}:enabled`, {
    fallback,
  });
}
```

### Popup changes

The popup already groups by domain. Signals appear in the same domain group as shields — they're all interventions on that domain. The signal row could have a slightly different visual treatment (e.g., a different icon style or "signal" label) to distinguish it from shields, but it lives in the same list.

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
│ ┊ 🚫 Shorts Homepage       [ON] │
│ ┊ 👁 Sidebar Recs Hide     [ON] │
│ ┊ 💬 Comments Hide         [ON] │
│ ┊ ⏱ Dwell Time Signal     [ON] │
│                                  │
└──────────────────────────────────┘
```

### Badge

No badge changes needed. The tab-contextual badge already checks if *any* intervention is active on the domain. Signals count the same as shields.

---

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `modules/signals/types.ts` | **Create** | `SignalDefinition` + `SignalType` |
| `modules/signals/registry.ts` | **Create** | Signal registry |
| `modules/signals/youtube-dwell-time/definition.ts` | **Create** | Dwell time signal definition |
| `modules/shields/youtube-shorts-homepage/definition.ts` | **Create** | Shorts homepage removal definition |
| `modules/shields/youtube-sidebar-recs/definition.ts` | **Create** | Sidebar recs hide definition |
| `modules/shields/youtube-comments-hide/definition.ts` | **Create** | Comments hide definition |
| `modules/shields/registry.ts` | **Modify** | Add 3 new shield definitions |
| `entrypoints/youtube-shorts-homepage.content/` | **Create** | CSS-only content script |
| `entrypoints/youtube-sidebar-recs.content/` | **Create** | CSS-only content script |
| `entrypoints/youtube-comments-hide.content/` | **Create** | CSS + placeholder text |
| `entrypoints/youtube-dwell-time.content/` | **Create** | JS signal: timer + stain overlay |
| `entrypoints/background.ts` | **Modify** | Import signal registry for badge |
| `entrypoints/popup/main.ts` | **Modify** | Render signals alongside shields |
| `utils/storage.ts` | **Modify** | Add `signalEnabled()` factory |

## Open Questions

1. **Stain visual design** — Ink-bleed? Gradient fog? Vignette darkening? Needs prototyping. Could start with a simple CSS radial gradient vignette and iterate.

2. **Session reset threshold** — If you leave YouTube for 5 minutes and come back, does the timer reset? Proposed: yes, reset after 5 min of `document.hidden` state. Configurable later.

3. **Dwell time thresholds** — The 10/30/60 min escalation stages are proposals. Needs real-world testing. Could be per-user configurable as a future per-signal setting.
