# keel Slice C — Browser Writer Enrichment + Observability Transport — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser writer (Writer #3) produce route-aware, tab-identified events, and ship a hardened native-messaging transport that lands them in `~/.keel/log/` and pushes the observe-list back — retiring the manual mirror.

**Architecture:** Two phases. **C1** enriches the event schema entirely inside the extension + a shared route registry in `@keel/domain` (ships on the export stopgap, no transport dependency). **C2** adds a native-messaging host (`keel.mjs native-host`) that the extension flushes events to and pulls the observe-list from; the host is a command-less, append-only, schema-validating, unprivileged writer.

**Tech Stack:** TypeScript + WXT (MV3 extension, `@keel/browser`); TypeScript pure domain (`@keel/domain`, vitest); Node ESM agent (`@keel/agent`, `node --test`); Chrome native messaging.

**Spec:** `docs/2026-06-13-slice-c-browser-writer-enrichment-and-transport-design.md` (stamped).

---

## File Structure

**Create:**
- `packages/domain/src/route.ts` — route registry + `normalizeRoute` (pure, shared by extension + bootstrap).
- `packages/domain/src/route.test.ts` — its tests.
- `apps/browser/modules/activity/tabs.ts` — pure tab-id map reducer + storage.session persistence.
- `apps/browser/modules/activity/tabs.test.ts`
- `apps/agent/native-host.mjs` — native-messaging host: framing + validation + browser-surface append + observe read.
- `apps/agent/native-host.test.mjs`
- `apps/agent/native-host-install.mjs` — writes + installs the native-messaging manifest.
- `apps/browser/modules/relay/client.ts` — native-messaging client: connect, flush, ack-prune, observe-pull (pure helpers + thin chrome wiring).
- `apps/browser/modules/relay/client.test.ts`

**Modify:**
- `apps/browser/modules/activity/events.ts` — add `routeFor`, `shouldLogRoute`, `routeChanged` (pure).
- `apps/browser/modules/activity/events.test.ts` — cover the new pure functions.
- `apps/browser/modules/activity/writer.ts` — emit tab uuid + observe-tier route + persist span state.
- `apps/browser/modules/activity/log.ts` — add `deleteEventsByIds` (ack-prune).
- `apps/browser/modules/watchlist/store.ts` — add `replaceObserveDomains` (relay push target).
- `apps/browser/entrypoints/background.ts` — wire the relay flush on startup + alarm.
- `packages/domain/src/index.ts` — export the route registry surface.
- `apps/agent/store.mjs` — harden `saveState` to atomic temp+rename; add browser-surface append helpers.
- `apps/agent/core.mjs` — add `browserLogFileName(ts)`.
- `apps/agent/keel.mjs` — dispatch `native-host` subcommand.

---

# PHASE C1 — Schema enrichment (ships on export stopgap)

## Task 1: Route registry + `normalizeRoute` in `@keel/domain`

**Files:**
- Create: `packages/domain/src/route.ts`
- Test: `packages/domain/src/route.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/route.test.ts
import { describe, it, expect } from "vitest";
import { normalizeRoute, ROUTE_REGISTRY } from "./route";

describe("normalizeRoute", () => {
  it("matches a registered route prefix", () => {
    expect(normalizeRoute("youtube.com", "/shorts/abc123")).toBe("/shorts");
    expect(normalizeRoute("youtube.com", "/watch")).toBe("/watch");
    expect(normalizeRoute("linkedin.com", "/feed/")).toBe("/feed");
  });

  it("falls back to the first path segment for an unregistered path on a registered host", () => {
    expect(normalizeRoute("youtube.com", "/results")).toBe("/results");
  });

  it("returns null for root / empty path", () => {
    expect(normalizeRoute("youtube.com", "/")).toBeNull();
    expect(normalizeRoute("youtube.com", "")).toBeNull();
  });

  it("never returns query or fragment", () => {
    expect(normalizeRoute("youtube.com", "/watch")).toBe("/watch");
    // caller passes pathname only; assert the function ignores anything after it defensively
    expect(normalizeRoute("youtube.com", "/shorts/x?t=1")).toBe("/shorts");
  });

  it("returns null for a host with no registry entry", () => {
    expect(normalizeRoute("github.com", "/rafa/keel")).toBeNull();
  });

  it("exposes the registry for reuse", () => {
    expect(ROUTE_REGISTRY["youtube.com"]).toContain("/shorts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/domain exec vitest run src/route.test.ts`
Expected: FAIL ("Cannot find module './route'").

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/route.ts
/**
 * Route registry — the shared, normalized route vocabulary.
 *
 * Used by the browser writer (observe-tier route logging) AND the cold-start
 * bootstrap (history route classification) so both surfaces normalize
 * identically. Routes are coarse mechanic-level handles ("/shorts", "/feed"),
 * never full paths/queries/fragments — the privacy gradient is load-bearing.
 */

/** host → recognized route prefixes, longest-first within each host. */
export const ROUTE_REGISTRY: Readonly<Record<string, readonly string[]>> = {
  "youtube.com": ["/shorts", "/watch", "/feed", "/results"],
  "linkedin.com": ["/feed", "/messaging", "/jobs"],
};

/**
 * Normalize a (host, pathname) to a coarse route handle, or null.
 * - Registered prefix match wins ("/shorts/abc" → "/shorts").
 * - Else, on a registered host, the first path segment ("/results").
 * - Root/empty path, or a host with no registry entry, → null.
 * Defensive: strips anything from the first "?" or "#" if a caller passes more
 * than a bare pathname, and never returns query/fragment text.
 */
export function normalizeRoute(host: string, pathname: string): string | null {
  const prefixes = ROUTE_REGISTRY[host];
  if (prefixes === undefined) {
    return null;
  }
  const clean = pathname.split(/[?#]/, 1)[0] ?? "";
  for (const prefix of prefixes) {
    if (clean === prefix || clean.startsWith(prefix + "/")) {
      return prefix;
    }
  }
  const segment = clean.split("/").filter(Boolean)[0];
  return segment === undefined ? null : "/" + segment;
}
```

- [ ] **Step 4: Add the export**

In `packages/domain/src/index.ts`, add alongside the existing exports:

```ts
export { ROUTE_REGISTRY, normalizeRoute } from "./route";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @keel/domain exec vitest run src/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/route.ts packages/domain/src/route.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): shared route registry + normalizeRoute"
```

---

## Task 2: Route decision helpers in `events.ts`

**Files:**
- Modify: `apps/browser/modules/activity/events.ts`
- Test: `apps/browser/modules/activity/events.test.ts`

- [ ] **Step 1: Write the failing test** (append to `events.test.ts`)

```ts
import { routeFor, shouldLogRoute, routeChanged } from "./events";

describe("route helpers", () => {
  it("routeFor extracts a normalized route from a url", () => {
    expect(routeFor("https://www.youtube.com/shorts/abc?x=1")).toEqual({
      domain: "youtube.com",
      route: "/shorts",
    });
  });

  it("routeFor returns null route for an unregistered host", () => {
    expect(routeFor("https://github.com/rafa/keel")).toEqual({
      domain: "github.com",
      route: null,
    });
  });

  it("routeFor returns null domain for a non-web url", () => {
    expect(routeFor("chrome://extensions")).toEqual({ domain: null, route: null });
  });

  it("shouldLogRoute is true only for observe-tier + logDetail", () => {
    expect(shouldLogRoute("youtube.com", ["youtube.com"], true)).toBe(true);
    expect(shouldLogRoute("youtube.com", ["youtube.com"], false)).toBe(false);
    expect(shouldLogRoute("youtube.com", [], true)).toBe(false);
    expect(shouldLogRoute(null, ["youtube.com"], true)).toBe(false);
  });

  it("routeChanged is true only when the route actually changes", () => {
    expect(routeChanged("/shorts", "/watch")).toBe(true);
    expect(routeChanged("/shorts", "/shorts")).toBe(false);
    expect(routeChanged(null, "/shorts")).toBe(true);
    expect(routeChanged("/shorts", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/browser exec vitest run modules/activity/events.test.ts`
Expected: FAIL ("routeFor is not exported").

- [ ] **Step 3: Write minimal implementation** (add to `events.ts`, after `domainFromUrl`)

```ts
import { normalizeRoute } from "@keel/domain";

/** Extract { domain, route } from a url. route is null off-registry or non-web. */
export function routeFor(url: string): { domain: string | null; route: string | null } {
  const domain = domainFromUrl(url);
  if (domain === null) {
    return { domain: null, route: null };
  }
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { domain, route: null };
  }
  return { domain, route: normalizeRoute(domain, pathname) };
}

/** Log a route only for observe-tier domains with logDetail on. */
export function shouldLogRoute(
  domain: string | null,
  observe: readonly string[],
  logDetail: boolean
): domain is string {
  return logDetail && domain !== null && observe.includes(domain);
}

/** A route_changed event fires only when the route value actually changes
 * to a non-null route. */
export function routeChanged(
  previousRoute: string | null,
  nextRoute: string | null
): nextRoute is string {
  return nextRoute !== null && nextRoute !== previousRoute;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @keel/browser exec vitest run modules/activity/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/browser/modules/activity/events.ts apps/browser/modules/activity/events.test.ts
git commit -m "feat(browser): pure route decision helpers (routeFor/shouldLogRoute/routeChanged)"
```

---

## Task 3: Tab-identity map reducer

**Files:**
- Create: `apps/browser/modules/activity/tabs.ts`
- Test: `apps/browser/modules/activity/tabs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/browser/modules/activity/tabs.test.ts
import { describe, it, expect } from "vitest";
import { tabUuid, type TabMap } from "./tabs";

describe("tabUuid", () => {
  it("mints a new uuid for an unseen tab and reuses it after", () => {
    const map: TabMap = {};
    const a = tabUuid(map, 7, () => "uuid-1");
    expect(a.uuid).toBe("uuid-1");
    expect(a.map).toEqual({ 7: "uuid-1" });

    const b = tabUuid(a.map, 7, () => "uuid-SHOULD-NOT-BE-USED");
    expect(b.uuid).toBe("uuid-1");
    expect(b.map).toEqual({ 7: "uuid-1" });
  });

  it("mints distinct uuids for concurrent same-domain tabs", () => {
    let n = 0;
    const factory = () => `uuid-${++n}`;
    const s1 = tabUuid({}, 1, factory);
    const s2 = tabUuid(s1.map, 2, factory);
    expect(s1.uuid).not.toBe(s2.uuid);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/browser exec vitest run modules/activity/tabs.test.ts`
Expected: FAIL ("Cannot find module './tabs'").

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/browser/modules/activity/tabs.ts
/**
 * Tab identity — an opaque per-tab uuid so read-side can reconstruct
 * per-tab journeys and disambiguate concurrent same-domain tabs.
 *
 * The map lives in chrome.storage.session (survives MV3 SW recycling within a
 * browser session). This module is the PURE reducer; the storage wiring is in
 * writer.ts. A uuid is not content — safe at every tier.
 */

export type TabMap = Readonly<Record<number, string>>;

/** Return the uuid for `tabId`, minting one via `mint()` if unseen. */
export function tabUuid(
  map: TabMap,
  tabId: number,
  mint: () => string
): { uuid: string; map: TabMap } {
  const existing = map[tabId];
  if (existing !== undefined) {
    return { uuid: existing, map };
  }
  const uuid = mint();
  return { uuid, map: { ...map, [tabId]: uuid } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @keel/browser exec vitest run modules/activity/tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/browser/modules/activity/tabs.ts apps/browser/modules/activity/tabs.test.ts
git commit -m "feat(browser): pure tab-identity uuid reducer"
```

---

## Task 4: Wire tab uuid + route + span persistence into `writer.ts`

**Files:**
- Modify: `apps/browser/modules/activity/writer.ts`

This task is chrome.* integration (not unit-testable without heavy mocks); the pure logic it calls is already covered by Tasks 1–3. Verification is a manual load + log inspection.

- [ ] **Step 1: Add storage-session state for the tab map and open spans**

At the top of `writer.ts`, add imports + a session-backed state helper:

```ts
import { storage } from "wxt/storage";
import { tabUuid, type TabMap } from "./tabs";
import { routeFor, shouldLogRoute, routeChanged } from "./events";
import { observeDomains } from "../watchlist/store";

const tabMapItem = storage.defineItem<TabMap>("session:activity:tabMap", { fallback: {} });
const focusSinceItem = storage.defineItem<number | null>("session:activity:focusSince", { fallback: null });
const routeByTab = storage.defineItem<Record<number, string | null>>("session:activity:routeByTab", { fallback: {} });
```

- [ ] **Step 2: Replace the tab-activation listener to attach a uuid**

Replace the existing `browser.tabs.onActivated` block (currently logs `{ domain }`) with:

```ts
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await browser.tabs.get(tabId);
    const domain = tab.url === undefined ? null : domainFromUrl(tab.url);
    if (domain === null) return;
    const map = await tabMapItem.getValue();
    const { uuid, map: next } = tabUuid(map, tabId, () => crypto.randomUUID());
    if (next !== map) await tabMapItem.setValue(next);
    write("tab_activated", { domain, tab: uuid });
    lastDomainByTab.set(tabId, domain);
  } catch {
    // tab vanished — fail-open
  }
});
```

- [ ] **Step 3: Replace the navigation listener to attach uuid + observe-tier route**

Replace the `browser.tabs.onUpdated` block with one that (a) still logs domain-change navigations, and (b) additionally logs `route_changed` for same-domain observe-tier hops:

```ts
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url === undefined) return;
  const { domain: nextDomain, route: nextRoute } = routeFor(changeInfo.url);
  const previousDomain = lastDomainByTab.get(tabId) ?? null;

  const map = await tabMapItem.getValue();
  const minted = tabUuid(map, tabId, () => crypto.randomUUID());
  if (minted.map !== map) await tabMapItem.setValue(minted.map);
  const tab = minted.uuid;

  const observe = await observeDomains.getValue();
  const logDetail = true; // C1: logDetail dial defaults on; gate in config later

  if (shouldLogNavigation(previousDomain, nextDomain)) {
    const payload: Record<string, unknown> = { domain: nextDomain, tab };
    if (shouldLogRoute(nextDomain, observe, logDetail) && nextRoute !== null) {
      payload.route = nextRoute;
    }
    write("navigation_committed", payload);
  } else if (shouldLogRoute(nextDomain, observe, logDetail)) {
    const routes = await routeByTab.getValue();
    if (routeChanged(routes[tabId] ?? null, nextRoute)) {
      write("route_changed", { domain: nextDomain, route: nextRoute, tab });
    }
  }

  if (nextDomain === null) {
    lastDomainByTab.delete(tabId);
  } else {
    lastDomainByTab.set(tabId, nextDomain);
    const routes = await routeByTab.getValue();
    await routeByTab.setValue({ ...routes, [tabId]: nextRoute });
  }
});
```

- [ ] **Step 4: Persist the focus span across SW restarts**

Replace the in-memory `let focusSince` initialization and the `onFocusChanged` listener body to read/write `focusSinceItem` instead of the local variable, so a span survives a worker restart:

```ts
browser.windows.onFocusChanged.addListener(async (windowId) => {
  const isFocused = windowId !== browser.windows.WINDOW_ID_NONE;
  const focusSince = await focusSinceItem.getValue();
  const t = focusTransition(focusSince, isFocused, Date.now());
  await focusSinceItem.setValue(t.spanStart);
  if (t.kind !== null) write(t.kind, undefined, t.durationMs);
});
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @keel/browser run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `pnpm --filter @keel/browser dev`, load the unpacked extension in Brave, add `youtube.com` to the observe tier on the manage page, browse a few Shorts, then export the log from the manage page. Confirm: `tab_activated`/`navigation_committed` carry `tab`; YouTube Shorts hops emit `route_changed` with `route:"/shorts"`; github events carry `tab` but no `route`.

- [ ] **Step 7: Commit**

```bash
git add apps/browser/modules/activity/writer.ts
git commit -m "feat(browser): tab uuid + observe-tier route + persisted focus span"
```

---

# PHASE C2 — Native-messaging transport

## Task 5: Harden `saveState` to atomic temp+rename

**Files:**
- Modify: `apps/agent/store.mjs`
- Test: `apps/agent/store.test.mjs` (create if absent)

- [ ] **Step 1: Write the failing test**

```js
// apps/agent/store.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeJsonAtomic } from "./store.mjs";

test("writeJsonAtomic writes valid JSON and leaves no temp file", () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-"));
  const path = join(dir, "state.json");
  writeJsonAtomic(path, { a: 1 });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { a: 1 });
  assert.equal(readdirSync(dir).filter((f) => f.includes(".tmp")).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/agent/store.test.mjs`
Expected: FAIL ("writeJsonAtomic is not a function").

- [ ] **Step 3: Implement + use it**

In `store.mjs`, add the helper and route `saveState` through it:

```js
import { renameSync } from "node:fs";

/** Atomic JSON write: temp file in the same dir, then rename. Avoids torn
 * reads when a second reader (native host / agent) reads concurrently. */
export function writeJsonAtomic(path, obj) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}
```

Change `saveState` body's last line from
`writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));`
to
`writeJsonAtomic(STATE_PATH, s);`

- [ ] **Step 4: Run test + existing suite**

Run: `node --test apps/agent/store.test.mjs && pnpm --filter @keel/agent test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/store.mjs apps/agent/store.test.mjs
git commit -m "fix(agent): atomic temp+rename for state writes"
```

---

## Task 6: Native-messaging framing (length-prefixed JSON)

**Files:**
- Create: `apps/agent/native-host.mjs`
- Test: `apps/agent/native-host.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// apps/agent/native-host.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, decodeMessages } from "./native-host.mjs";

test("encode then decode round-trips a message", () => {
  const buf = encodeMessage({ type: "ack", ids: ["a", "b"] });
  const { messages, rest } = decodeMessages(buf);
  assert.deepEqual(messages, [{ type: "ack", ids: ["a", "b"] }]);
  assert.equal(rest.length, 0);
});

test("decodeMessages keeps a partial trailing frame in rest", () => {
  const full = encodeMessage({ type: "request_observe" });
  const partial = full.subarray(0, full.length - 3);
  const { messages, rest } = decodeMessages(partial);
  assert.deepEqual(messages, []);
  assert.equal(rest.length, partial.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/agent/native-host.test.mjs`
Expected: FAIL ("Cannot find module './native-host.mjs'" / not a function).

- [ ] **Step 3: Implement framing**

```js
// apps/agent/native-host.mjs
// @ts-check
// keel native-messaging host. Command-less, append-only, schema-validating,
// unprivileged writer. Chrome frames messages as a uint32 little-endian length
// prefix followed by UTF-8 JSON. Max 1 MB/message (Chrome limit).

const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Encode one object as a length-prefixed frame (Buffer). */
export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

/** Decode as many whole frames as `buf` contains. Returns parsed messages and
 * the leftover bytes (a partial next frame). Oversized frames throw. */
export function decodeMessages(buf) {
  const messages = [];
  let offset = 0;
  while (buf.length - offset >= 4) {
    const len = buf.readUInt32LE(offset);
    if (len > MAX_MESSAGE_BYTES) throw new Error("native message too large");
    if (buf.length - offset - 4 < len) break;
    const json = buf.subarray(offset + 4, offset + 4 + len).toString("utf8");
    messages.push(JSON.parse(json));
    offset += 4 + len;
  }
  return { messages, rest: buf.subarray(offset) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/agent/native-host.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/native-host.mjs apps/agent/native-host.test.mjs
git commit -m "feat(agent): native-messaging length-prefixed framing"
```

---

## Task 7: Inbound validation (the security boundary)

**Files:**
- Modify: `apps/agent/native-host.mjs`
- Test: `apps/agent/native-host.test.mjs`

- [ ] **Step 1: Write the failing test** (append)

```js
import { validateInbound } from "./native-host.mjs";

const validEvent = {
  id: "e1", surface: "browser", kind: "tab_activated", ts: 1781364354057,
  sessionId: "s1", payload: { domain: "youtube.com", tab: "u1" },
};

test("accepts a well-formed events message and drops bad events", () => {
  const out = validateInbound({
    type: "events",
    events: [validEvent, { id: "bad" }, { ...validEvent, id: "e2", kind: "../etc/passwd" }],
  });
  assert.equal(out.type, "events");
  assert.deepEqual(out.events.map((e) => e.id), ["e1"]); // bad shape + bad kind dropped
});

test("accepts request_observe", () => {
  assert.deepEqual(validateInbound({ type: "request_observe" }), { type: "request_observe" });
});

test("rejects unknown types and non-objects", () => {
  assert.equal(validateInbound({ type: "delete_everything" }), null);
  assert.equal(validateInbound("nope"), null);
  assert.equal(validateInbound({ type: "events", events: "no" }), null);
});

test("caps event count per message", () => {
  const many = Array.from({ length: 5001 }, (_, i) => ({ ...validEvent, id: `e${i}` }));
  const out = validateInbound({ type: "events", events: many });
  assert.ok(out.events.length <= 5000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/agent/native-host.test.mjs`
Expected: FAIL ("validateInbound is not a function").

- [ ] **Step 3: Implement validation**

```js
const MAX_EVENTS_PER_MESSAGE = 5000;
const MAX_FIELD_BYTES = 2048;
// Allowlist: browser writer + sensor kinds (event-taxonomy.md).
const ALLOWED_KINDS = new Set([
  "writer_started", "writer_paused", "writer_resumed",
  "tab_activated", "navigation_committed", "route_changed",
  "focus_start", "focus_end", "idle_start", "idle_end",
  "log_pruned", "panic_pressed",
  "video_started", "video_ended", "post_seen", "game_finished",
]);

function isValidEvent(e) {
  if (typeof e !== "object" || e === null) return false;
  if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > 128) return false;
  if (e.surface !== "browser") return false;
  if (typeof e.kind !== "string" || !ALLOWED_KINDS.has(e.kind)) return false;
  if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) return false;
  if (typeof e.sessionId !== "string" || e.sessionId.length > 128) return false;
  if (typeof e.payload !== "object" || e.payload === null) return false;
  for (const v of Object.values(e.payload)) {
    if (typeof v === "string" && Buffer.byteLength(v, "utf8") > MAX_FIELD_BYTES) return false;
  }
  if (e.durationMs !== undefined && typeof e.durationMs !== "number") return false;
  return true;
}

/** Validate an inbound message. Returns a sanitized message or null. All
 * extension input is untrusted; off-schema is dropped, never written. */
export function validateInbound(msg) {
  if (typeof msg !== "object" || msg === null) return null;
  if (msg.type === "request_observe") return { type: "request_observe" };
  if (msg.type === "events") {
    if (!Array.isArray(msg.events)) return null;
    const events = msg.events.filter(isValidEvent).slice(0, MAX_EVENTS_PER_MESSAGE);
    return { type: "events", events };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/agent/native-host.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/native-host.mjs apps/agent/native-host.test.mjs
git commit -m "feat(agent): hardened inbound validation for native host"
```

---

## Task 8: Browser-surface append + observe read

**Files:**
- Modify: `apps/agent/core.mjs` (add `browserLogFileName`)
- Modify: `apps/agent/store.mjs` (add `appendBrowserEvents`, reuse `loadWatchlist`)
- Test: `apps/agent/native-host.test.mjs`

- [ ] **Step 1: Write the failing test** (append)

```js
import { browserLogFileName } from "./core.mjs";

test("browserLogFileName buckets by local date with .browser surface", () => {
  const name = browserLogFileName(1781364354057);
  assert.match(name, /^\d{4}-\d{2}-\d{2}\.browser\.jsonl$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/agent/native-host.test.mjs`
Expected: FAIL ("browserLogFileName is not a function").

- [ ] **Step 3: Implement**

In `core.mjs`, beside `logFileName`:

```js
/** Local-date daily bucket for the browser surface. @param {number} ts */
export function browserLogFileName(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.browser.jsonl`;
}
```

In `store.mjs`, add (events may span days → bucket each by its own ts):

```js
import { browserLogFileName } from "./core.mjs";

/** Append validated browser events to per-day .browser.jsonl files.
 * Atomic per-line appendFileSync. Returns the ids written. */
export function appendBrowserEvents(events) {
  mkdirSync(LOG_DIR, { recursive: true });
  const written = [];
  for (const e of events) {
    try {
      appendFileSync(join(LOG_DIR, browserLogFileName(e.ts)), JSON.stringify(e) + "\n");
      written.push(e.id);
    } catch { /* fail-open: skip this event */ }
  }
  return written;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/agent/native-host.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/core.mjs apps/agent/store.mjs apps/agent/native-host.test.mjs
git commit -m "feat(agent): browser-surface log append + filename"
```

---

## Task 9: Host main loop + `keel native-host` dispatch

**Files:**
- Modify: `apps/agent/native-host.mjs` (add `runHost`)
- Modify: `apps/agent/keel.mjs` (dispatch)

The stdio loop is integration; the pure handlers (`validateInbound`, framing, `appendBrowserEvents`) are already tested. Verification is manual end-to-end (Task 11).

- [ ] **Step 1: Implement the host loop**

Append to `native-host.mjs`:

```js
import { appendBrowserEvents } from "./store.mjs";
import { loadWatchlist } from "./store.mjs";

/** Run the native-messaging host: read frames from stdin, write replies to
 * stdout. Pure handlers do the work; this is just the pump. */
export function runHost(stdin = process.stdin, stdout = process.stdout) {
  let buffer = Buffer.alloc(0);
  const reply = (obj) => stdout.write(encodeMessage(obj));

  stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let decoded;
    try {
      decoded = decodeMessages(buffer);
    } catch {
      buffer = Buffer.alloc(0); // oversized/corrupt — reset, fail-open
      return;
    }
    buffer = decoded.rest;
    for (const raw of decoded.messages) {
      const msg = validateInbound(raw);
      if (msg === null) continue; // hostile/off-schema — drop silently
      if (msg.type === "events") {
        reply({ type: "ack", ids: appendBrowserEvents(msg.events) });
      } else if (msg.type === "request_observe") {
        reply({ type: "observe", domains: loadWatchlist().observe });
      }
    }
  });
}
```

- [ ] **Step 2: Wire the subcommand**

In `keel.mjs`, add the import near the other `store`/local imports:

```js
import { runHost } from "./native-host.mjs";
```

In `main()`, before the final fallthrough, add:

```js
  if (cmd === "native-host") { runHost(); return; } // long-lived: do not exit
```

Note: `native-host` must NOT call `emit`/`process.exit` — it stays alive for the stdio session.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @keel/agent run typecheck`
Expected: no errors.

- [ ] **Step 4: Smoke the framing end-to-end (manual)**

Run a one-shot pipe that sends a `request_observe` frame and prints the reply:

```bash
node -e '
const { encodeMessage } = require("./apps/agent/native-host.mjs");
process.stdout.write(encodeMessage({ type: "request_observe" }));
' | node apps/agent/keel.mjs native-host | xxd | head
```
Expected: a length-prefixed `{"type":"observe","domains":[...]}` frame.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/native-host.mjs apps/agent/keel.mjs
git commit -m "feat(agent): native-host stdio loop + keel native-host dispatch"
```

---

## Task 10: Native-messaging manifest + installer

**Files:**
- Create: `apps/agent/native-host-install.mjs`

- [ ] **Step 1: Implement the installer**

```js
// apps/agent/native-host-install.mjs
// @ts-check
// Install the native-messaging manifest so Brave can spawn `keel native-host`.
// Run: node apps/agent/native-host-install.mjs <extension-id>

import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const HOST_NAME = "tech.equanimi.keel";
// Brave (Chromium family) per-user native-messaging host dir on macOS:
const BRAVE_NM_DIR = join(
  homedir(),
  "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
);

const extId = process.argv[2];
if (!extId || !/^[a-p]{32}$/.test(extId)) {
  console.error("usage: node native-host-install.mjs <32-char-extension-id>");
  process.exit(1);
}

// A tiny launcher so the manifest's "path" is a single executable.
const launcher = join(homedir(), ".keel", "native-host.sh");
const keelMjs = resolve(import.meta.dirname, "keel.mjs");
mkdirSync(join(homedir(), ".keel"), { recursive: true });
writeFileSync(launcher, `#!/bin/sh\nexec node "${keelMjs}" native-host\n`);
chmodSync(launcher, 0o755);

const manifest = {
  name: HOST_NAME,
  description: "keel observability native host",
  path: launcher,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extId}/`],
};

mkdirSync(BRAVE_NM_DIR, { recursive: true });
const manifestPath = join(BRAVE_NM_DIR, `${HOST_NAME}.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
chmodSync(manifestPath, 0o644);

console.log(`Installed native-messaging host:\n  ${manifestPath}\n  launcher: ${launcher}\n  allowed extension: ${extId}`);
```

- [ ] **Step 2: Verify it writes a valid manifest (manual)**

Run: `node apps/agent/native-host-install.mjs abcdefghijklmnopabcdefghijklmnop`
Expected: prints the manifest + launcher paths; `cat "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/tech.equanimi.keel.json"` shows `allowed_origins` pinned to the id.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/native-host-install.mjs
git commit -m "feat(agent): native-messaging manifest installer (allowed_origins pinned)"
```

---

## Task 11: Browser relay client — flush, ack-prune, observe-pull

**Files:**
- Modify: `apps/browser/modules/activity/log.ts` (add `deleteEventsByIds`)
- Modify: `apps/browser/modules/watchlist/store.ts` (add `replaceObserveDomains`)
- Create: `apps/browser/modules/relay/client.ts`
- Test: `apps/browser/modules/relay/client.test.ts`

- [ ] **Step 1: Write the failing test** (pure batching/ack reducer)

```ts
// apps/browser/modules/relay/client.test.ts
import { describe, it, expect } from "vitest";
import { chunkEvents, unacked } from "./client";

const ev = (id: string) => ({ id, surface: "browser", kind: "tab_activated", ts: 1, sessionId: "", payload: {} }) as const;

describe("relay batching", () => {
  it("chunkEvents splits into <= size batches", () => {
    const batches = chunkEvents([ev("a"), ev("b"), ev("c")], 2);
    expect(batches.map((b) => b.length)).toEqual([2, 1]);
  });
  it("unacked removes acked ids", () => {
    const remaining = unacked([ev("a"), ev("b"), ev("c")], ["a", "c"]);
    expect(remaining.map((e) => e.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/browser exec vitest run modules/relay/client.test.ts`
Expected: FAIL ("Cannot find module './client'").

- [ ] **Step 3: Add `deleteEventsByIds` to `log.ts`**

```ts
/** Delete events whose value.id is in `ids` (ack-prune). Fail-open: 0 on error. */
export async function deleteEventsByIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    let deleted = 0;
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor === null) return;
      const value = cursor.value as { id?: string };
      if (value.id !== undefined && idSet.has(value.id)) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    await awaitTransaction(tx);
    return deleted;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Add `replaceObserveDomains` to `watchlist/store.ts`**

```ts
/** Replace the whole observe list from the relay (config.json is source of
 * truth). Normalizes + dedupes; ignores malformed entries. */
export async function replaceObserveDomains(domains: readonly string[]): Promise<void> {
  const clean = [...new Set(domains.map((d) => normalizeDomain(d)).filter((d): d is string => !!d))];
  await observeDomains.setValue(clean);
}
```

- [ ] **Step 5: Implement the client**

```ts
// apps/browser/modules/relay/client.ts
/**
 * Relay client — flush buffered events to the keel native host and pull the
 * observe list back. Pure helpers (chunkEvents/unacked) are unit-tested; the
 * chrome.runtime.connectNative wiring is integration. Fail-open throughout.
 */
import type { ActivityEvent } from "@keel/domain";
import { readAllEvents, deleteEventsByIds } from "../activity/log";
import { replaceObserveDomains } from "../watchlist/store";

const HOST_NAME = "tech.equanimi.keel";
const MAX_BATCH = 1000;

export function chunkEvents(events: readonly ActivityEvent[], size: number): ActivityEvent[][] {
  const out: ActivityEvent[][] = [];
  for (let i = 0; i < events.length; i += size) out.push(events.slice(i, i + size));
  return out;
}

export function unacked(events: readonly ActivityEvent[], ackedIds: readonly string[]): ActivityEvent[] {
  const acked = new Set(ackedIds);
  return events.filter((e) => !acked.has(e.id));
}

/** Connect once, flush all buffered events (ack-prune), pull observe list. */
export async function flushToHost(): Promise<void> {
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch {
    return; // host not installed — stay on the export stopgap
  }
  try {
    port.onMessage.addListener((msg: { type?: string; ids?: string[]; domains?: string[] }) => {
      if (msg.type === "ack" && msg.ids) void deleteEventsByIds(msg.ids);
      else if (msg.type === "observe" && msg.domains) void replaceObserveDomains(msg.domains);
    });
    const events = await readAllEvents();
    for (const batch of chunkEvents(events, MAX_BATCH)) {
      port.postMessage({ type: "events", events: batch });
    }
    port.postMessage({ type: "request_observe" });
  } finally {
    setTimeout(() => port.disconnect(), 2000); // allow acks to arrive
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @keel/browser exec vitest run modules/relay/client.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/browser/modules/activity/log.ts apps/browser/modules/watchlist/store.ts apps/browser/modules/relay/client.ts apps/browser/modules/relay/client.test.ts
git commit -m "feat(browser): native-host relay client (flush, ack-prune, observe-pull)"
```

---

## Task 12: Wire the relay flush into the background worker

**Files:**
- Modify: `apps/browser/entrypoints/background.ts`

- [ ] **Step 1: Add the flush trigger**

In `background.ts`'s `defineBackground` body, after `startActivityWriter()`:

```ts
import { flushToHost } from "@/modules/relay/client";

// Flush on cold start and on a periodic alarm (eventual-consistency; no daemon).
void flushToHost();
browser.alarms.create("keel-relay-flush", { periodInMinutes: 5 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keel-relay-flush") void flushToHost();
});
```

- [ ] **Step 2: Ensure `alarms` permission**

In `apps/browser/wxt.config.ts`, confirm `"alarms"` is in the manifest `permissions` array; add it if missing.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @keel/browser run typecheck`
Expected: no errors.

- [ ] **Step 4: End-to-end manual verification**

1. `pnpm --filter @keel/browser dev`; load unpacked in Brave; note the extension id.
2. `node apps/agent/native-host-install.mjs <that-extension-id>`.
3. Add `youtube.com` to the observe tier in `~/.keel/config.json` `watchlist.observe`.
4. Reload the extension; browse a few Shorts; wait for the flush (or toggle focus).
5. Confirm `~/.keel/log/<today>.browser.jsonl` now contains the browser events (with `tab` + `route`), and the manage page's observe list reflects `config.json` (manual mirror retired).

- [ ] **Step 5: Commit**

```bash
git add apps/browser/entrypoints/background.ts apps/browser/wxt.config.ts
git commit -m "feat(browser): flush to native host on startup + 5m alarm"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** schema = Tasks 1–4 (tab id, route, span persistence); transport = Tasks 5–12 (atomic write, framing, validation, append, host loop, manifest, client, wiring). Security boundary = Task 7 (validation) + Task 10 (allowed_origins) + Task 5 (atomic) + unprivileged launcher (Task 10, no root).
- **`logDetail` gate:** Task 4 hardcodes `logDetail = true` as a temporary default. A follow-up (out of this plan) reads it from a config/storage toggle; flagged in the spec's open questions.
- **Route-flood guard:** the spec notes a possible same-route debounce; `routeChanged` already suppresses same-route repeats per tab, which covers the common case. Add a time-debounce only if logs show flooding.
- **Tray-as-host migration** is deferred (spec open question); `keel.mjs` is the host for now.
