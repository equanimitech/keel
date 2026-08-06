/**
 * Cooldown store — the chrome.storage half. All decisions live in `state.ts`.
 *
 * State survives service-worker death, browser restart, and (with
 * `incognito: "spanning"`) incognito, because a lock that a restart lifts is
 * not a lock.
 */

import { storage } from "wxt/storage";
import { EMPTY, arm as armPure, blockedDomains, nextLapse, type CooldownState } from "./state.js";

/** Default lock: outlasts an urge cycle, does not eat an evening. */
export const DEFAULT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export const cooldowns = storage.defineItem<CooldownState>("local:friction:cooldowns", {
  fallback: EMPTY,
});

/**
 * Arm or extend a cooldown. Returns the effective expiry.
 *
 * There is no `disarm` counterpart, by design.
 */
export async function armCooldown(args: {
  ruleId: string;
  domains: readonly string[];
  durationMs?: number;
  now?: number;
}): Promise<number> {
  const now = args.now ?? Date.now();
  const next = armPure(await cooldowns.getValue(), {
    ruleId: args.ruleId,
    durationMs: args.durationMs ?? DEFAULT_COOLDOWN_MS,
    domains: args.domains,
    now,
  });
  await cooldowns.setValue(next);
  return next[args.ruleId].until;
}

/** Domains currently under any cooldown. */
export async function cooldownDomains(now: number = Date.now()): Promise<readonly string[]> {
  return blockedDomains(await cooldowns.getValue(), now);
}

/** When the soonest cooldown lapses, or null. */
export async function cooldownNextLapse(now: number = Date.now()): Promise<number | null> {
  return nextLapse(await cooldowns.getValue(), now);
}
