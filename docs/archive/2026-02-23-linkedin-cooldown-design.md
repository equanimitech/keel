# LinkedIn Cooldown Overlay — Design

## Summary

A content script that enforces cooldowns on LinkedIn with a full-page overlay.
The popup already writes to `domainCooldown("linkedin.com")` — this script
listens and enforces.

## Scope

- **In scope:** Content script with full-page overlay, countdown, "Leave LinkedIn" button
- **Out of scope:** Auto-trigger/budgeting, focus mode, manage page settings

## Implementation

### Content script: `linkedin-cooldown.content`

- Matches `*://*.linkedin.com/*`, runs at `document_idle`
- On load: check `domainCooldown("linkedin.com")` — if in future, show overlay
- Watch store for changes — popup can start a cooldown at any time
- Tick every second, update countdown, clear when expired

### Storage

No new keys. Uses existing `local:cooldown:linkedin.com:until` via `domainCooldown`.

### Overlay

- Fixed position, full viewport, high z-index, opaque dark background with blur
- "Take a break from LinkedIn" label
- Countdown timer (mm:ss) in purple monospace
- "Leave LinkedIn" button → navigates to google.com

### Pattern

Same as YouTube cooldown — mode, not a shield. No definition file, no registry entry.
