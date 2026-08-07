/**
 * Policy mirror — the extension's cache of what `~/.keel/rules/*.json` declares.
 *
 * The host is the source of truth; extensions cannot read the filesystem, so
 * the relay pulls this on every flush. Two tiers, because they behave
 * differently:
 *
 *   standing — cooldowns that never lapse (the old drogue seed). Always on.
 *   armable  — cooldowns with a duration, blocked only while armed.
 *
 * Deliberately a *cache*, not a store: nothing here is authoritative, and a
 * stale or empty cache must fail toward the previous state rather than toward
 * unblocked. That is why `syncBlocklistRules` unions this with the built-in
 * seed instead of replacing it.
 */

import type { MomentFriction } from "@keel/domain";
import { storage } from "wxt/storage";
import type { DwellGate } from "../gate/decide";

/** Domains under a standing (never-lapsing) cooldown. */
export const standingDomains = storage.defineItem<string[]>("local:policy:standing", {
  fallback: [],
});

/** Domains a timed cooldown may cover once armed. */
export const armableDomains = storage.defineItem<string[]>("local:policy:armable", {
  fallback: [],
});

/** Dwell gates declared by rules. */
export const dwellGates = storage.defineItem<DwellGate[]>("local:policy:gates", {
  fallback: [],
});

/**
 * The allow/deny hostname pair scoped by the moment running right now, or null
 * when none is. `allow` is seeded host-side from the moment's refs; `deny` is
 * carried whether or not anything fills it yet.
 *
 * Hostnames only ever arrive here — the refs they came from are full URLs and
 * stay on the host side of the relay.
 */
export const momentFriction = storage.defineItem<MomentFriction | null>(
  "local:policy:momentFriction",
  { fallback: null }
);

/** What "take a break" means right now: the areas it pauses, and their domains. */
export interface BreakTarget {
  readonly areas: readonly {
    readonly name: string;
    readonly emoji: string;
    /** Hex, from the kernel. The one sanctioned accent (see areas.md). */
    readonly color?: string;
  }[];
  readonly domains: readonly string[];
  readonly durationMs: number;
}

export const breakTarget = storage.defineItem<BreakTarget | null>("local:policy:break", {
  fallback: null,
});

export interface AreaInfo {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  /** Hex, from the kernel. The one sanctioned accent (kairos/kernel/areas.md). */
  readonly color?: string;
  readonly tags: readonly string[];
}

/** Areas the user has defined (imported from zenborg, or set up in keel). */
export const areas = storage.defineItem<AreaInfo[]>("local:policy:areas", { fallback: [] });

/** Domain (or domain/path) → areaId. */
export const areaMap = storage.defineItem<Record<string, string>>("local:policy:areaMap", {
  fallback: {},
});

/**
 * Replace the mirror from a host policy pull.
 *
 * Absent fields are left alone; explicitly-empty ones are written. The dead-host
 * case is already covered upstream — `replacePolicy` is only ever called from a
 * well-formed `type: "policy"` message, so an unreachable or erroring host never
 * reaches this function at all and the previous mirror simply persists.
 *
 * This used to additionally ignore empty arrays. That was belt over braces, and
 * it made a *deliberate* lift impossible: disabling the only standing rule makes
 * the host send `standing: []`, which was then discarded, so the block held with
 * no rule behind it and no way to see why.
 */
export async function replacePolicy(policy: {
  readonly standing?: readonly string[];
  readonly armable?: readonly string[];
  readonly gates?: readonly DwellGate[];
  readonly break?: BreakTarget | null;
  readonly areas?: readonly AreaInfo[];
  readonly areaMap?: Readonly<Record<string, string>>;
  readonly momentFriction?: MomentFriction | null;
}): Promise<void> {
  if (policy.standing !== undefined) {
    await standingDomains.setValue([...policy.standing]);
  }
  if (policy.armable !== undefined) {
    await armableDomains.setValue([...policy.armable]);
  }
  // Gates are replaced wholesale including the empty case — unlike a standing
  // block, a gate that no longer exists must stop firing. Failing toward "more
  // friction" is right for blocks and wrong for interruptions.
  if (policy.gates !== undefined) {
    await dwellGates.setValue([...policy.gates]);
  }
  if (policy.break !== undefined) {
    await breakTarget.setValue(policy.break);
  }
  // Areas and their domain map. Replaced wholesale including the empty case:
  // an area archived in the editor must stop being offered, and a domain
  // un-assigned there must stop being blocked.
  if (policy.areas !== undefined) {
    await areas.setValue([...policy.areas]);
  }
  if (policy.areaMap !== undefined) {
    await areaMap.setValue({ ...policy.areaMap });
  }
  // Replaced wholesale including null: a moment that has ended must stop
  // scoping anything. Same reasoning as gates — a boundary that no longer
  // exists should not keep speaking. Failing toward the area's own policy is
  // the right direction here; it is neither "block" nor "allow everything".
  if (policy.momentFriction !== undefined) {
    await momentFriction.setValue(policy.momentFriction);
  }
}
