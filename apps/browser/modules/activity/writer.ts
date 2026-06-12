/**
 * Activity writer — chrome.* wiring for the browser surface.
 *
 * Runs in the background SERVICE WORKER only. No event data ever
 * originates from page-context content scripts (hostile-page boundary),
 * and nothing here makes a network call — events are persisted to
 * extension-local IndexedDB (see `log.ts`) until the desktop relay exists.
 *
 * sessionId rotates with the service-worker lifetime: each cold start of
 * the worker generates a fresh uuid and logs "writer_started". That id is
 * a writer epoch — mechanical provenance, not a behavioral session
 * (bouts are derived read-side; see packages/domain/docs/event-taxonomy.md).
 */

import {
  IDLE_DETECTION_SECONDS,
  buildBrowserEvent,
  domainFromUrl,
  excessEventCount,
  focusTransition,
  idleTransition,
  shouldLogNavigation,
} from "./events";
import { appendEvent, countEvents, deleteOldestEvents } from "./log";
import {
  isArmQuery,
  sensorAllowed,
  validateSensorMessage,
} from "../sensors/events";
import { observeDomains } from "../watchlist/store";
import type { Runtime } from "wxt/browser";

type WriteFn = (
  kind: string,
  payload?: Readonly<Record<string, unknown>>,
  durationMs?: number
) => void;

/**
 * Register all attention-event listeners. Must be called synchronously
 * from the background entrypoint so MV3 event-driven wakeups re-attach.
 */
export function startActivityWriter(): void {
  const sessionId = crypto.randomUUID();

  const write: WriteFn = (kind, payload, durationMs) => {
    // Fail-open: appendEvent swallows storage errors; a dropped event
    // must never break the browsing session.
    void appendEvent(
      buildBrowserEvent({
        id: crypto.randomUUID(),
        kind,
        ts: Date.now(),
        sessionId,
        payload,
        durationMs,
      })
    );
  };

  // New service-worker lifetime → new writer epoch (sessionId groups it).
  // Mechanical, not behavioral — bouts are derived read-side.
  write("writer_started");

  // Retention guard: cap the store at MAX_LOG_EVENTS on startup.
  void runRetentionGuard(write);

  // ── Tab activation ────────────────────────────────────────────
  const lastDomainByTab = new Map<number, string>();

  browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs
      .get(tabId)
      .then((tab) => {
        const domain = tab.url === undefined ? null : domainFromUrl(tab.url);
        if (domain !== null) {
          write("tab_activated", { domain });
          lastDomainByTab.set(tabId, domain);
        }
      })
      .catch(() => {
        // Tab vanished between event and lookup — drop, fail-open.
      });
  });

  // ── Navigation (domain changes only, never per-SPA-path) ──────
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url === undefined) {
      return;
    }
    const nextDomain = domainFromUrl(changeInfo.url);
    const previousDomain = lastDomainByTab.get(tabId) ?? null;
    if (shouldLogNavigation(previousDomain, nextDomain)) {
      write("navigation_committed", { domain: nextDomain });
    }
    if (nextDomain === null) {
      lastDomainByTab.delete(tabId);
    } else {
      lastDomainByTab.set(tabId, nextDomain);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    lastDomainByTab.delete(tabId);
  });

  // ── Focus span (browser holds OS focus) ───────────────────────
  // The worker wakes because of activity, so assume focused-since-now;
  // the first span is conservative, never inflated.
  let focusSince: number | null = Date.now();

  browser.windows.onFocusChanged.addListener((windowId) => {
    const isFocused = windowId !== browser.windows.WINDOW_ID_NONE;
    const t = focusTransition(focusSince, isFocused, Date.now());
    focusSince = t.spanStart;
    if (t.kind !== null) {
      write(t.kind, undefined, t.durationMs);
    }
  });

  // ── Sensor channel (key-action completions, observe tier) ─────
  // The hostile-page boundary: kind allowlisted, payload reduced to
  // capped scalars, domain taken from the browser-attested sender tab,
  // and nothing persists unless the domain is on the observe tier.
  browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
    const url = sender.tab?.url;
    const domain = url === undefined ? null : domainFromUrl(url);

    // Arm handshake: a content script asks whether to observe at all.
    if (isArmQuery(message)) {
      return observeDomains
        .getValue()
        .then((observe) => ({ observed: sensorAllowed(domain, observe) }))
        .catch(() => ({ observed: false }));
    }

    const validated = validateSensorMessage(message);
    if (validated === null) {
      return;
    }
    void observeDomains
      .getValue()
      .then((observe) => {
        if (sensorAllowed(domain, observe)) {
          write(validated.kind, { domain, ...validated.payload });
        }
      })
      .catch(() => {
        // Storage unavailable — drop, fail-open.
      });
  });

  // ── Idle span (AFK bracketing) ─────────────────────────────────
  let idleSince: number | null = null;

  browser.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  browser.idle.onStateChanged.addListener((state) => {
    const t = idleTransition(idleSince, state, Date.now());
    idleSince = t.spanStart;
    if (t.kind === "idle_start") {
      write(t.kind, { state, thresholdMs: IDLE_DETECTION_SECONDS * 1000 });
    } else if (t.kind !== null) {
      write(t.kind, undefined, t.durationMs);
    }
  });
}

async function runRetentionGuard(write: WriteFn): Promise<void> {
  const total = await countEvents();
  const excess = excessEventCount(total);
  if (excess > 0) {
    const deleted = await deleteOldestEvents(excess);
    if (deleted > 0) {
      write("log_pruned", { count: deleted });
    }
  }
}
