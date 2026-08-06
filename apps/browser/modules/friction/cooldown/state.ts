/**
 * Cooldown state — pure. No chrome APIs, no clock.
 *
 * A cooldown is the `cooldown` primitive (primitive-contracts.md §Contract 3)
 * in flight: a rule id, an expiry stamp, and the domains it covers. The store
 * layer owns persistence; this owns the rules about what a cooldown may do.
 *
 * The one behavioural invariant: **arming is write-forward-only.** Re-arming
 * may push the stamp further out, never pull it in, so a moment of weakness
 * cannot undo a moment of clarity. There is deliberately no `disarm` — the
 * unlock path is `wait`, and adding a lift would restore the symmetry the
 * whole design exists to remove.
 */

/** One cooldown in flight. */
export interface ActiveCooldown {
  readonly ruleId: string;
  /** Epoch ms at which it lapses. */
  readonly until: number;
  readonly domains: readonly string[];
}

/** All cooldowns, keyed by rule id. Lapsed entries are pruned on write. */
export type CooldownState = Readonly<Record<string, ActiveCooldown>>;

export const EMPTY: CooldownState = {};

/**
 * Arm or extend a cooldown. Never shortens an existing stamp; never removes
 * a domain from one already in flight.
 */
export function arm(
  state: CooldownState,
  args: { ruleId: string; durationMs: number; domains: readonly string[]; now: number }
): CooldownState {
  const { ruleId, durationMs, domains, now } = args;
  const requested = now + Math.max(0, durationMs);
  const existing = state[ruleId];
  const until = existing === undefined ? requested : Math.max(existing.until, requested);
  const merged =
    existing === undefined ? domains : [...new Set([...existing.domains, ...domains])];
  return { ...prune(state, now), [ruleId]: { ruleId, until, domains: merged } };
}

/** Drop lapsed cooldowns. Called on every write so state cannot accumulate. */
export function prune(state: CooldownState, now: number): CooldownState {
  const out: Record<string, ActiveCooldown> = {};
  for (const [id, cooldown] of Object.entries(state)) {
    if (cooldown.until > now) {
      out[id] = cooldown;
    }
  }
  return out;
}

/** Cooldowns still holding at `now`. */
export function activeAt(state: CooldownState, now: number): readonly ActiveCooldown[] {
  const out: ActiveCooldown[] = [];
  for (const cooldown of Object.values(state)) {
    if (cooldown.until > now) {
      out.push(cooldown);
    }
  }
  return out;
}

/** Union of domains under any active cooldown — what the DNR rule projects. */
export function blockedDomains(state: CooldownState, now: number): readonly string[] {
  const out = new Set<string>();
  for (const cooldown of activeAt(state, now)) {
    for (const domain of cooldown.domains) {
      out.add(domain);
    }
  }
  return [...out];
}

/**
 * When the soonest cooldown lapses, or null if none hold. Drives the single
 * expiry alarm — one wake-up rather than a poll.
 */
export function nextLapse(state: CooldownState, now: number): number | null {
  let soonest: number | null = null;
  for (const cooldown of activeAt(state, now)) {
    if (soonest === null || cooldown.until < soonest) {
      soonest = cooldown.until;
    }
  }
  return soonest;
}
