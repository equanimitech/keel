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
 * An empty payload is ignored rather than written: the host answering with
 * nothing (no rules dir yet, a read error, a partial deploy) must not silently
 * lift a standing block.
 */
export async function replacePolicy(policy: {
  readonly standing?: readonly string[];
  readonly armable?: readonly string[];
  readonly gates?: readonly DwellGate[];
  readonly break?: BreakTarget | null;
  readonly areas?: readonly AreaInfo[];
  readonly areaMap?: Readonly<Record<string, string>>;
}): Promise<void> {
  if (policy.standing !== undefined && policy.standing.length > 0) {
    await standingDomains.setValue([...policy.standing]);
  }
  if (policy.armable !== undefined && policy.armable.length > 0) {
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
}
