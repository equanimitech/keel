/**
 * Areas — the plots of your life, and the unit keel reasons about.
 *
 * Replaces the ledger's work/benign/observe verdict, which answered "how does
 * this relate to my work" and could not answer what the product actually asks:
 * *which part of my life is this, and do I want to be in it right now?*
 *
 * Domains are the wrong unit for a person. Nobody thinks "I should block
 * youtube.com and chess.com and reddit.com" — they think "I need to step out of
 * Entertainment for a bit." A domain list is an implementation detail of that
 * sentence.
 *
 * ── On the zenborg seam ─────────────────────────────────────────────────
 *
 * Areas deliberately mirror zenborg's, because they are the same life. But
 * `Area` is a *keel* concept with zenborg as one possible source, not a
 * dependency on it. That keeps the published plugin generic and dependency-free
 * — the consequence the 2026-06-17 decision was protecting when it deferred the
 * seam. A user with no zenborg defines areas in keel directly; a user with one
 * syncs them.
 */

export type AreaId = string & { readonly __brand: "AreaId" };
export const createAreaId = (id: string): AreaId => id as AreaId;

export interface Area {
  readonly id: AreaId;
  readonly name: string;
  readonly emoji: string;
  /** Free tags, mirrored from the source. `weeds` marks an area that tends to overgrow. */
  readonly tags: readonly string[];
}

/** Areas the user has marked as prone to overgrowth — the natural break target. */
export function weedyAreas(areas: readonly Area[]): readonly Area[] {
  return areas.filter((a) => a.tags.includes("weeds"));
}

/**
 * Domain → area. The one classification list, replacing the ledger's verdicts.
 *
 * Path-keyed entries are allowed and more specific wins: `linkedin.com` can sit
 * in a work area while `linkedin.com/feed` sits in Entertainment, because they
 * are genuinely different rooms behind one door.
 */
export type AreaMap = Readonly<Record<string, AreaId>>;

/**
 * Resolve a URL's area, preferring the longest matching key so a path-keyed
 * entry beats its bare domain.
 *
 * `path` is optional: the coarse writer records domains only, so most lookups
 * are domain-only and simply never match a path key.
 */
export function areaFor(map: AreaMap, domain: string, path?: string): AreaId | null {
  const candidates = path === undefined ? [domain] : [`${domain}${path}`, domain];
  let best: AreaId | null = null;
  let bestLength = -1;
  for (const key of Object.keys(map)) {
    for (const candidate of candidates) {
      if (candidate === key || candidate.startsWith(`${key}/`)) {
        if (key.length > bestLength) {
          bestLength = key.length;
          best = map[key];
        }
      }
    }
  }
  return best;
}

/** Every domain assigned to any of `areaIds`. What a break resolves to. */
export function domainsInAreas(map: AreaMap, areaIds: readonly AreaId[]): readonly string[] {
  const wanted = new Set(areaIds);
  const out: string[] = [];
  for (const [domain, areaId] of Object.entries(map)) {
    if (wanted.has(areaId)) {
      out.push(domain);
    }
  }
  return out;
}

/** Domains with no area yet — what the config page asks you to sort, newest-seen first. */
export function unassigned(map: AreaMap, seen: readonly string[]): readonly string[] {
  return seen.filter((d) => areaFor(map, d) === null);
}
