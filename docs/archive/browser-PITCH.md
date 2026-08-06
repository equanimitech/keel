# Pitch: Equanimi — Modular Attention Intervention Platform

## Problem

You open YouTube to find one video. Forty-five minutes later you're twelve Shorts deep. You open LinkedIn to check a message. Twenty minutes later you're rage-scrolling a comment thread. You open chess.com for one game. Three hours later your rating is 200 points lower and your dopamine is shot.

Each platform has industrialized the same pattern: remove stopping cues, remove friction, keep the feed bottomless. The design is intentional. Brian Albert at Netflix said it plainly — they compete with sleep.

A cottage industry of single-purpose blockers has emerged: Minimalist YouTube, News Feed Eradicator, Unhook, LeechBlock. Each one fights one platform. None of them talk to each other. None of them understand *behavior* — they're binary switches (on/off) with no model of how compulsion actually works.

Buddhist psychology has a better framework. Craving (lobha) is a cycle: sensation → pleasant feeling → craving → grasping. Breaking the cycle doesn't require eliminating the stimulus. It requires **interrupting momentum** — a gap where awareness can enter. That gap is the stopping cue.

This reveals a need for a **unified attention intervention platform** with site-specific shields and shared behavioral mechanics.

## Appetite

**Big Batch: 1 week**

This constraint shapes our experiment:
- Rename and restructure existing YouTube Shorts blocker into modular architecture
- Add 2 new site modules (chess.com, LinkedIn) to prove extensibility
- Simple popup UI with per-site toggles (no complex scheduling yet)
- Publish on Chrome Web Store + GitHub for real-world signal
- Behavioral mechanics (cheat days, cooldowns) are **out of scope** for this cycle

## Hypothesis

**We believe that** people who install one site-specific attention blocker will activate additional site modules when offered — specifically, that ≥30% of users who install for YouTube will also enable at least one other site shield within the first week.

**Antagonist**: We believe that attention-blocking needs are platform-specific and users prefer dedicated, single-purpose extensions because they want fine-grained control and don't trust an umbrella extension with broad host permissions.

**Risk type**: Desirability

**MECE breakdown**:
1. We believe users want YouTube Shorts scroll-blocking (already validated by existing extensions in the market)
2. We believe the same users experience compulsion on other platforms (chess.com, LinkedIn) and want intervention there too
3. We believe a unified extension with per-site toggles is preferred over installing 3 separate extensions
4. We believe users will grant broader host permissions in exchange for a single-install experience

## Experiment Design

### Context
```
*To verify that* we will publish Equanimi on the Chrome Web Store
with 3 site modules (YouTube Shorts, chess.com, LinkedIn)
and measure multi-module activation rates over 2 weeks.

Cost: 1 week engineering ≤ Big Batch appetite
Reliability: Medium (real users, real installs, but cold-start
            distribution and small initial sample)
```

### Flow
```
Chrome Web Store Listing
├─ Install → Popup opens
├─ Popup: 3 site shields (YouTube, Chess.com, LinkedIn)
│   ├─ YouTube Shorts: ON by default
│   ├─ Chess.com: OFF by default
│   └─ LinkedIn: OFF by default
├─ User visits YouTube Shorts → blocking active
├─ User visits chess.com → banner suggests enabling shield
└─ User visits LinkedIn → banner suggests enabling shield

Per-site Content Script
├─ Check if module enabled (storage)
├─ If YES → inject CSS + JS intervention
└─ If NO → do nothing
```

### Site-Specific Interventions

**YouTube Shorts** (already built):
- Kill scroll-snap + overflow on `#shorts-inner-container`
- Hide prev/next navigation buttons
- Block wheel, touch, keyboard scroll events

**Chess.com** (new):
- After a game ends, inject a stopping cue overlay: "You just played a game. Take a breath."
- Block auto-rematch / "New game" button for a configurable cooldown (30s default)
- Optional: hide the "Play" button on homepage after N games

**LinkedIn** (new):
- Disable infinite scroll on the main feed
- Hide "LinkedIn News" sidebar
- Collapse "Suggested posts" / "People also viewed"
- Optional: hide notification count badge

### Metrics
*And measure*:
- **Primary**: Multi-module activation rate (≥30% enable 2+ modules)
- **Secondary**:
  - Total installs (baseline)
  - Per-module activation rate
  - Uninstall rate within 7 days (target: ≤40%)
  - Chrome Web Store rating
- **Timeline**: 14 days post-publish

### Success Criteria
*We are right if*:
- ≥30% of users activate 2 or more site shields
- Uninstall rate stays below 40% within first week
- At least 3 organic reviews mentioning multi-site value
- ≥1 unsolicited request for a new site module

## Rabbit Holes

**Host permissions scope creep**: Requesting `*://*/*` permissions triggers Chrome warning and tanks install rate.
*Mitigation*: Use specific host permissions (`*://*.youtube.com/*`, `*://*.chess.com/*`, `*://*.linkedin.com/*`). Add new hosts per-module. WXT handles this cleanly through content script `matches`.

**Chess.com DOM instability**: Chess.com is a React SPA. DOM selectors may break between deploys.
*Mitigation*: Use resilient selectors (data attributes, ARIA roles) and MutationObserver patterns. Accept some fragility — this is a 1-week experiment, not a 5-year product.

**LinkedIn CSP restrictions**: LinkedIn has aggressive Content Security Policy headers that may block injected styles/scripts.
*Mitigation*: Test early in the week. If blocked, fall back to CSS-only intervention or reduce LinkedIn scope to "hide feed" only.

**Cold-start distribution**: Zero users on day one. Need initial signal to validate.
*Mitigation*: Post on r/productivity, r/nosurf, Hacker News "Show HN". Share on personal networks. Target 50-100 installs minimum.

## No-Gos

**Out of scope for this experiment:**
- Cheat days / blocked days / scheduling (future cycle)
- Compulsion cooldown timers (future cycle)
- Zenborg integration (future cycle)
- Firefox support (future cycle)
- Usage analytics dashboard for the user (future cycle)
- AI-powered intervention (e.g., "you seem to be doom-scrolling")
- Settings page beyond the popup toggles
- Onboarding flow

## Prompt Themes Needed

1. **Architecture theme**: Refactor mindful-shorts into modular Equanimi structure. Site modules as isolated entrypoints with shared storage and popup.

2. **Chess.com module theme**: DOM research, stopping cue overlay design, cooldown mechanic implementation.

3. **LinkedIn module theme**: DOM research, feed blocking CSS, sidebar hiding, notification suppression.

4. **Popup redesign theme**: Multi-module toggle UI. Per-site on/off with status indicators. Clean, minimal, dark theme.

5. **Chrome Web Store theme**: Listing copy, screenshots, privacy policy, category selection.

6. **Distribution theme**: Reddit posts (r/nosurf, r/productivity, r/digitalminimalism), Show HN, personal network seeding.

## Expected Outcomes

**If successful (criteria met)**:
- Validates the "unified attention platform" thesis
- Green light for behavioral mechanics (cheat days, cooldowns, blocked days)
- Evidence that "stopping cues" resonates as a product category
- Foundation for Equanimi as the mindful tech browser layer
- Architecture proven extensible — adding new site modules is cheap

**If unsuccessful (criteria not met)**:
- Investigate whether failure is distribution (nobody found it) or product (people found it but didn't activate multiple modules)
- Test whether standalone single-site extensions outperform the umbrella approach
- Consider if the intervention design is wrong (too aggressive? too subtle?)
- Evaluate if chess.com and LinkedIn were the right expansion targets

**Either way**: Strong evidence about whether attention intervention is a platform problem or a per-site problem. This determines the entire product strategy.
