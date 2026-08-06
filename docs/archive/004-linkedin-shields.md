# 004 — LinkedIn Shields

Essential attention shields for LinkedIn, targeting the highest-impact attention traps.

## Shields

Five shields, all targeting `linkedin.com`, all using `cue-removal` (BCT #12.3).

| ID | Name | Default | Target | Placeholder |
|---|---|---|---|---|
| `linkedin-feed-hide` | Feed Hide | on | Main feed container on homepage | Yes |
| `linkedin-notification-badge` | Notification Badge | on | Red dot/count on bell icon | No |
| `linkedin-sidebar-recs` | Sidebar Recs | on | "People you may know", "Add to your feed" | Yes |
| `linkedin-ads` | Ads Hide | on | Sidebar ad units, banner ads | Yes |
| `linkedin-promoted-posts` | Promoted Posts | on | Sponsored posts in feed | No |

Spatial shields (feed, sidebar recs, ads) inject a placeholder message when active. Small/inline shields (notification badge, promoted posts) hide silently via CSS.

## Architecture

Each shield follows the established pattern:

```
modules/shields/<id>/definition.ts          # ShieldDefinition
entrypoints/<id>.content/index.ts           # Content script
entrypoints/<id>.content/style.css          # CSS hide rules
```

Content scripts:
- Read enabled state from `shieldEnabled()` storage
- Toggle CSS class on `<html>` (e.g., `equanimi-linkedin-feed-hide-active`)
- Watch storage changes for popup toggle reactivity
- Placeholder shields: `MutationObserver` to inject/remove placeholder (SPA navigation)

All content scripts match `*://*.linkedin.com/*`.

## Registry changes

- Add all 5 definitions to `modules/shields/registry.ts`
- Add `"linkedin.com"` to `COOLDOWN_DOMAINS` in `entrypoints/popup/main.ts`

## CSS selectors

These selectors target LinkedIn's current DOM (as of Feb 2026). They will need monitoring as LinkedIn updates.

**Feed** (`.equanimi-linkedin-feed-hide-active`):
- `.scaffold-finite-scroll`, `.feed-shared-update-v2`, `div.scaffold-finite-scroll__content` — main feed
- `.feed-sort-toggle` — sort/filter bar above feed
- `.share-box-feed-entry__closed-share-box` — "Start a post" box

**Notification badge** (`.equanimi-linkedin-notification-badge-active`):
- `.notification-badge__count`, `.notification-badge`, `.nav-item__badge-count`, `span[class*="notification-badge"]` — nav badges
- `.msg-overlay-bubble-header__badge`, `.messaging-count-badge` — messaging badges

**Sidebar recs** (`.equanimi-linkedin-sidebar-recs-active`):
- `aside.scaffold-layout__aside`, `.feed-follows-module`, `.ad-banner-container` — sidebar modules
- `.scaffold-layout__main { max-width: 100% }` — expand main column when sidebar hidden

**Ads** (`.equanimi-linkedin-ads-active`):
- `.ad-banner-container`, `[data-ad-banner]`, `.ads-container` — ad units
- `.scaffold-layout__aside .artdeco-card:has([data-ad-banner])`, `.right-rail-ad` — right-rail ads
- `.premium-upsell-card`, `.artdeco-card:has(.premium-upsell)` — premium upsell cards

**Promoted posts** (`.equanimi-linkedin-promoted-posts-active`):
- `.feed-shared-update-v2:has(.feed-shared-actor__sub-description a[href*="about/sponsored"])` — sponsored link
- `.feed-shared-update-v2:has(span[aria-label="Promoted"])` — promoted label
- `.update-components-actor:has(a[href*="about/sponsored"])` — update component actors
- `div.feed-shared-update-v2--minimal-padding:has(span[aria-label="Promoted"])` — minimal-padding wrappers

## Approach

CSS-driven hiding with DOM placeholders for spatial shields. Minimal JS footprint. Same implementation pattern as the existing `youtube-comments-hide` shield.

## Reference

Inspired by LinkOff (MIT, by Noah Jelich) — Equanimi focuses on the essential attention traps rather than exhaustive toggle coverage, grounding each shield in behavioral science (BCT #12.3 — restructuring the physical environment / removing cues).
