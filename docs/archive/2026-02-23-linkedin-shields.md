# LinkedIn Shields Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 essential attention shields for LinkedIn — feed hide, notification badge, sidebar recommendations, ads, and promoted posts.

**Architecture:** Each shield is a `ShieldDefinition` value object + a WXT content script entrypoint with CSS. Spatial shields (feed, sidebar, ads) include a DOM placeholder message. All content scripts match `*://*.linkedin.com/*` and follow the existing toggle-via-CSS-class pattern.

**Tech Stack:** TypeScript, WXT, CSS, chrome.storage (via wxt/storage)

**Design spec:** `apps/browser/docs/specs/004-linkedin-shields.md`

---

### Task 1: Create all 5 shield definitions

**Files:**
- Create: `apps/browser/modules/shields/linkedin-feed-hide/definition.ts`
- Create: `apps/browser/modules/shields/linkedin-notification-badge/definition.ts`
- Create: `apps/browser/modules/shields/linkedin-sidebar-recs/definition.ts`
- Create: `apps/browser/modules/shields/linkedin-ads/definition.ts`
- Create: `apps/browser/modules/shields/linkedin-promoted-posts/definition.ts`

**Step 1: Create all 5 definition files**

`apps/browser/modules/shields/linkedin-feed-hide/definition.ts`:
```ts
import type { ShieldDefinition } from "../types";

export const linkedinFeedHide: ShieldDefinition = {
  id: "linkedin-feed-hide",
  name: "Feed Hide",
  description: "Hides the LinkedIn feed to reduce mindless scrolling",
  domain: "linkedin.com",
  icon: "\u{1F4F0}",
  mechanism: "cue-removal",
  defaultEnabled: true,
};
```

`apps/browser/modules/shields/linkedin-notification-badge/definition.ts`:
```ts
import type { ShieldDefinition } from "../types";

export const linkedinNotificationBadge: ShieldDefinition = {
  id: "linkedin-notification-badge",
  name: "Notification Badge",
  description: "Hides the notification count badge on the bell icon",
  domain: "linkedin.com",
  icon: "\u{1F514}",
  mechanism: "cue-removal",
  defaultEnabled: true,
};
```

`apps/browser/modules/shields/linkedin-sidebar-recs/definition.ts`:
```ts
import type { ShieldDefinition } from "../types";

export const linkedinSidebarRecs: ShieldDefinition = {
  id: "linkedin-sidebar-recs",
  name: "Sidebar Recs",
  description: "Hides sidebar recommendations and 'People you may know'",
  domain: "linkedin.com",
  icon: "\u{1F465}",
  mechanism: "cue-removal",
  defaultEnabled: true,
};
```

`apps/browser/modules/shields/linkedin-ads/definition.ts`:
```ts
import type { ShieldDefinition } from "../types";

export const linkedinAds: ShieldDefinition = {
  id: "linkedin-ads",
  name: "Ads Hide",
  description: "Hides sidebar and banner advertisements",
  domain: "linkedin.com",
  icon: "\u{1F6AB}",
  mechanism: "cue-removal",
  defaultEnabled: true,
};
```

`apps/browser/modules/shields/linkedin-promoted-posts/definition.ts`:
```ts
import type { ShieldDefinition } from "../types";

export const linkedinPromotedPosts: ShieldDefinition = {
  id: "linkedin-promoted-posts",
  name: "Promoted Posts",
  description: "Hides sponsored and promoted posts in the feed",
  domain: "linkedin.com",
  icon: "\u{1F4B0}",
  mechanism: "cue-removal",
  defaultEnabled: true,
};
```

**Step 2: Commit**

```bash
git add apps/browser/modules/shields/linkedin-*/definition.ts
git commit -m "feat(shields): add 5 LinkedIn shield definitions"
```

---

### Task 2: Register shields and add LinkedIn cooldown

**Files:**
- Modify: `apps/browser/modules/shields/registry.ts`
- Modify: `apps/browser/entrypoints/popup/main.ts` (line 52, `COOLDOWN_DOMAINS`)

**Step 1: Update registry.ts**

Add imports for all 5 LinkedIn shields and append them to the `shields` array:

```ts
import { linkedinFeedHide } from "./linkedin-feed-hide/definition";
import { linkedinNotificationBadge } from "./linkedin-notification-badge/definition";
import { linkedinSidebarRecs } from "./linkedin-sidebar-recs/definition";
import { linkedinAds } from "./linkedin-ads/definition";
import { linkedinPromotedPosts } from "./linkedin-promoted-posts/definition";
```

Add to the `shields` array (after `chessPostGameCooldown`):
```ts
linkedinFeedHide,
linkedinNotificationBadge,
linkedinSidebarRecs,
linkedinAds,
linkedinPromotedPosts,
```

**Step 2: Add linkedin.com to COOLDOWN_DOMAINS**

In `apps/browser/entrypoints/popup/main.ts`, change:
```ts
const COOLDOWN_DOMAINS = ["chess.com", "youtube.com"];
```
to:
```ts
const COOLDOWN_DOMAINS = ["chess.com", "youtube.com", "linkedin.com"];
```

**Step 3: Commit**

```bash
git add apps/browser/modules/shields/registry.ts apps/browser/entrypoints/popup/main.ts
git commit -m "feat(shields): register LinkedIn shields and add cooldown support"
```

---

### Task 3: LinkedIn Feed Hide content script (CSS + placeholder)

**Files:**
- Create: `apps/browser/entrypoints/linkedin-feed-hide.content/index.ts`
- Create: `apps/browser/entrypoints/linkedin-feed-hide.content/style.css`

**Step 1: Create the CSS file**

`apps/browser/entrypoints/linkedin-feed-hide.content/style.css`:

```css
/*
 * Equanimi — LinkedIn Feed Hide (CSS layer)
 *
 * Hides the main feed on the LinkedIn homepage.
 * Scoped under .equanimi-linkedin-feed-hide-active on <html>.
 */

/* ── Hide the main feed container ────────────────────────────── */
.equanimi-linkedin-feed-hide-active .scaffold-finite-scroll,
.equanimi-linkedin-feed-hide-active .feed-shared-update-v2,
.equanimi-linkedin-feed-hide-active div.scaffold-finite-scroll__content {
  display: none !important;
}

/* ── Also hide the sort/filter bar above the feed ────────────── */
.equanimi-linkedin-feed-hide-active .feed-sort-toggle {
  display: none !important;
}

/* ── Hide "Start a post" box to reduce compulsion ────────────── */
.equanimi-linkedin-feed-hide-active .share-box-feed-entry__closed-share-box {
  display: none !important;
}
```

**Step 2: Create the content script**

`apps/browser/entrypoints/linkedin-feed-hide.content/index.ts`:

```ts
import { shieldEnabled } from "@/utils/storage";
import { linkedinFeedHide } from "@/modules/shields/linkedin-feed-hide/definition";
import "./style.css";

/**
 * Content script: LinkedIn Feed Hide
 *
 * CSS-driven shield with a placeholder message so users know
 * the feed is intentionally hidden, not broken.
 */

const CSS_CLASS = `equanimi-${linkedinFeedHide.id}-active`;
const enabled = shieldEnabled(linkedinFeedHide.id, linkedinFeedHide.defaultEnabled);
const PLACEHOLDER_ID = "equanimi-linkedin-feed-placeholder";

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));

    // LinkedIn is an SPA — watch for navigation to re-inject placeholder.
    const observer = new MutationObserver(() => {
      if (active) {
        injectPlaceholder();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

let active = false;

function toggle(on: boolean): void {
  active = on;
  document.documentElement.classList.toggle(CSS_CLASS, on);

  if (on) {
    injectPlaceholder();
  } else {
    removePlaceholder();
  }
}

function injectPlaceholder(): void {
  if (document.getElementById(PLACEHOLDER_ID)) {
    return;
  }

  // Find the feed's parent container on the homepage
  const feedParent =
    document.querySelector(".scaffold-finite-scroll")?.parentElement ??
    document.querySelector("main");
  if (!feedParent) {
    return;
  }

  const placeholder = document.createElement("div");
  placeholder.id = PLACEHOLDER_ID;
  placeholder.textContent = "Feed hidden by Equanimi";
  placeholder.style.cssText = `
    padding: 48px 24px;
    text-align: center;
    color: #666;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    margin: 16px 0;
  `;

  feedParent.prepend(placeholder);
}

function removePlaceholder(): void {
  document.getElementById(PLACEHOLDER_ID)?.remove();
}
```

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-feed-hide.content/
git commit -m "feat(shields): add LinkedIn feed hide content script"
```

---

### Task 4: LinkedIn Notification Badge content script (CSS only)

**Files:**
- Create: `apps/browser/entrypoints/linkedin-notification-badge.content/index.ts`
- Create: `apps/browser/entrypoints/linkedin-notification-badge.content/style.css`

**Step 1: Create the CSS file**

`apps/browser/entrypoints/linkedin-notification-badge.content/style.css`:

```css
/*
 * Equanimi — LinkedIn Notification Badge Hide (CSS layer)
 *
 * Hides the red notification count badge on the bell icon.
 * Scoped under .equanimi-linkedin-notification-badge-active on <html>.
 */

/* ── Hide notification count badges in the nav ───────────────── */
.equanimi-linkedin-notification-badge-active .notification-badge__count,
.equanimi-linkedin-notification-badge-active .notification-badge,
.equanimi-linkedin-notification-badge-active .nav-item__badge-count,
.equanimi-linkedin-notification-badge-active span[class*="notification-badge"] {
  display: none !important;
}

/* ── Hide messaging badge count too ──────────────────────────── */
.equanimi-linkedin-notification-badge-active .msg-overlay-bubble-header__badge,
.equanimi-linkedin-notification-badge-active .messaging-count-badge {
  display: none !important;
}

/* ── Hide tab title count (e.g., "(3) LinkedIn") ─────────────── */
/* Note: This requires JS — handled in content script */
```

**Step 2: Create the content script**

`apps/browser/entrypoints/linkedin-notification-badge.content/index.ts`:

```ts
import { shieldEnabled } from "@/utils/storage";
import { linkedinNotificationBadge } from "@/modules/shields/linkedin-notification-badge/definition";
import "./style.css";

/**
 * Content script: LinkedIn Notification Badge Hide
 *
 * Pure CSS shield — hides notification count badges in the nav bar.
 */

const CSS_CLASS = `equanimi-${linkedinNotificationBadge.id}-active`;
const enabled = shieldEnabled(
  linkedinNotificationBadge.id,
  linkedinNotificationBadge.defaultEnabled,
);

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));
  },
});

function toggle(on: boolean): void {
  document.documentElement.classList.toggle(CSS_CLASS, on);
}
```

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-notification-badge.content/
git commit -m "feat(shields): add LinkedIn notification badge hide content script"
```

---

### Task 5: LinkedIn Sidebar Recs content script (CSS + placeholder)

**Files:**
- Create: `apps/browser/entrypoints/linkedin-sidebar-recs.content/index.ts`
- Create: `apps/browser/entrypoints/linkedin-sidebar-recs.content/style.css`

**Step 1: Create the CSS file**

`apps/browser/entrypoints/linkedin-sidebar-recs.content/style.css`:

```css
/*
 * Equanimi — LinkedIn Sidebar Recommendations Hide (CSS layer)
 *
 * Hides "People you may know", "Add to your feed", and similar
 * recommendation panels in the right sidebar.
 * Scoped under .equanimi-linkedin-sidebar-recs-active on <html>.
 */

/* ── Hide the right-rail sidebar modules ─────────────────────── */
.equanimi-linkedin-sidebar-recs-active aside.scaffold-layout__aside,
.equanimi-linkedin-sidebar-recs-active .feed-follows-module,
.equanimi-linkedin-sidebar-recs-active .ad-banner-container {
  display: none !important;
}

/* ── Let the main column expand ──────────────────────────────── */
.equanimi-linkedin-sidebar-recs-active .scaffold-layout__main {
  max-width: 100% !important;
}
```

**Step 2: Create the content script**

`apps/browser/entrypoints/linkedin-sidebar-recs.content/index.ts`:

```ts
import { shieldEnabled } from "@/utils/storage";
import { linkedinSidebarRecs } from "@/modules/shields/linkedin-sidebar-recs/definition";
import "./style.css";

/**
 * Content script: LinkedIn Sidebar Recommendations Hide
 *
 * CSS-driven shield with a placeholder in the sidebar area.
 */

const CSS_CLASS = `equanimi-${linkedinSidebarRecs.id}-active`;
const enabled = shieldEnabled(linkedinSidebarRecs.id, linkedinSidebarRecs.defaultEnabled);
const PLACEHOLDER_ID = "equanimi-linkedin-sidebar-placeholder";

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));

    const observer = new MutationObserver(() => {
      if (active) {
        injectPlaceholder();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

let active = false;

function toggle(on: boolean): void {
  active = on;
  document.documentElement.classList.toggle(CSS_CLASS, on);

  if (on) {
    injectPlaceholder();
  } else {
    removePlaceholder();
  }
}

function injectPlaceholder(): void {
  if (document.getElementById(PLACEHOLDER_ID)) {
    return;
  }

  const sidebar = document.querySelector("aside.scaffold-layout__aside");
  if (!sidebar?.parentElement) {
    return;
  }

  const placeholder = document.createElement("div");
  placeholder.id = PLACEHOLDER_ID;
  placeholder.textContent = "Sidebar hidden by Equanimi";
  placeholder.style.cssText = `
    padding: 24px;
    text-align: center;
    color: #666;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  sidebar.parentElement.insertBefore(placeholder, sidebar.nextSibling);
}

function removePlaceholder(): void {
  document.getElementById(PLACEHOLDER_ID)?.remove();
}
```

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-sidebar-recs.content/
git commit -m "feat(shields): add LinkedIn sidebar recs hide content script"
```

---

### Task 6: LinkedIn Ads Hide content script (CSS + placeholder)

**Files:**
- Create: `apps/browser/entrypoints/linkedin-ads.content/index.ts`
- Create: `apps/browser/entrypoints/linkedin-ads.content/style.css`

**Step 1: Create the CSS file**

`apps/browser/entrypoints/linkedin-ads.content/style.css`:

```css
/*
 * Equanimi — LinkedIn Ads Hide (CSS layer)
 *
 * Hides sidebar ads, banner ads, and ad containers.
 * Scoped under .equanimi-linkedin-ads-active on <html>.
 */

/* ── Sidebar ad units ────────────────────────────────────────── */
.equanimi-linkedin-ads-active .ad-banner-container,
.equanimi-linkedin-ads-active [data-ad-banner],
.equanimi-linkedin-ads-active .ads-container {
  display: none !important;
}

/* ── Right-rail ad placements ────────────────────────────────── */
.equanimi-linkedin-ads-active .scaffold-layout__aside .artdeco-card:has([data-ad-banner]),
.equanimi-linkedin-ads-active .right-rail-ad {
  display: none !important;
}

/* ── LinkedIn premium upsell cards ───────────────────────────── */
.equanimi-linkedin-ads-active .premium-upsell-card,
.equanimi-linkedin-ads-active .artdeco-card:has(.premium-upsell) {
  display: none !important;
}
```

**Step 2: Create the content script**

`apps/browser/entrypoints/linkedin-ads.content/index.ts`:

```ts
import { shieldEnabled } from "@/utils/storage";
import { linkedinAds } from "@/modules/shields/linkedin-ads/definition";
import "./style.css";

/**
 * Content script: LinkedIn Ads Hide
 *
 * CSS-driven shield with a MutationObserver to catch
 * dynamically injected ad containers.
 */

const CSS_CLASS = `equanimi-${linkedinAds.id}-active`;
const enabled = shieldEnabled(linkedinAds.id, linkedinAds.defaultEnabled);

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));
  },
});

function toggle(on: boolean): void {
  document.documentElement.classList.toggle(CSS_CLASS, on);
}
```

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-ads.content/
git commit -m "feat(shields): add LinkedIn ads hide content script"
```

---

### Task 7: LinkedIn Promoted Posts content script (CSS only)

**Files:**
- Create: `apps/browser/entrypoints/linkedin-promoted-posts.content/index.ts`
- Create: `apps/browser/entrypoints/linkedin-promoted-posts.content/style.css`

**Step 1: Create the CSS file**

`apps/browser/entrypoints/linkedin-promoted-posts.content/style.css`:

```css
/*
 * Equanimi — LinkedIn Promoted Posts Hide (CSS layer)
 *
 * Hides sponsored/promoted posts in the feed.
 * Scoped under .equanimi-linkedin-promoted-posts-active on <html>.
 */

/* ── Hide feed items containing "Promoted" label ─────────────── */
.equanimi-linkedin-promoted-posts-active .feed-shared-update-v2:has(.feed-shared-actor__sub-description a[href*="about/sponsored"]),
.equanimi-linkedin-promoted-posts-active .feed-shared-update-v2:has(span[aria-label="Promoted"]) {
  display: none !important;
}

/* ── Hide promoted items in update components ────────────────── */
.equanimi-linkedin-promoted-posts-active .update-components-actor:has(a[href*="about/sponsored"]) {
  display: none !important;
}

/* ── Collapse the parent wrapper if it's an occluded update ──── */
.equanimi-linkedin-promoted-posts-active div.feed-shared-update-v2--minimal-padding:has(span[aria-label="Promoted"]) {
  display: none !important;
}
```

**Step 2: Create the content script**

`apps/browser/entrypoints/linkedin-promoted-posts.content/index.ts`:

```ts
import { shieldEnabled } from "@/utils/storage";
import { linkedinPromotedPosts } from "@/modules/shields/linkedin-promoted-posts/definition";
import "./style.css";

/**
 * Content script: LinkedIn Promoted Posts Hide
 *
 * Pure CSS shield — hides sponsored/promoted posts in the feed.
 */

const CSS_CLASS = `equanimi-${linkedinPromotedPosts.id}-active`;
const enabled = shieldEnabled(
  linkedinPromotedPosts.id,
  linkedinPromotedPosts.defaultEnabled,
);

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));
  },
});

function toggle(on: boolean): void {
  document.documentElement.classList.toggle(CSS_CLASS, on);
}
```

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-promoted-posts.content/
git commit -m "feat(shields): add LinkedIn promoted posts hide content script"
```

---

### Task 8: Build verification and CSS selector tuning

**Step 1: Run the build**

```bash
pnpm build:browser
```

Expected: Build succeeds with no TypeScript errors. All LinkedIn content scripts appear in the output.

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

**Step 3: Load extension and verify on LinkedIn**

Load the built extension in Chrome (`chrome://extensions` → Load unpacked → `.output/chrome-mv3`).

Navigate to `linkedin.com` and verify:
1. Popup shows "linkedin.com" group with all 5 shields
2. Cooldown section appears on LinkedIn tabs
3. Feed is hidden with placeholder message
4. Notification badges are hidden
5. Sidebar recommendations are hidden
6. Ads are hidden
7. Promoted posts are hidden
8. Each toggle works (disable → content reappears, enable → hidden again)

**Step 4: Tune CSS selectors**

LinkedIn's DOM changes frequently. During manual testing, inspect the actual DOM and update CSS selectors in each `style.css` file as needed. Common adjustments:
- Feed container class names
- Notification badge selectors
- Promoted post label structure
- Sidebar module class names

**Step 5: Commit any selector fixes**

```bash
git add -u
git commit -m "fix(shields): tune LinkedIn CSS selectors from live DOM inspection"
```

---

### Task 9: Final commit — update design spec with verified selectors

**Step 1: Update the design spec**

Update `apps/browser/docs/specs/004-linkedin-shields.md` with the verified CSS selectors from Task 8.

**Step 2: Commit**

```bash
git add apps/browser/docs/specs/004-linkedin-shields.md
git commit -m "docs: update LinkedIn shield spec with verified CSS selectors"
```
