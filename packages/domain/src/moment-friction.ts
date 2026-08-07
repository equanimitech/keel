/**
 * Moment friction — the two named lists that scope friction while a moment runs.
 *
 * A moment (zenborg's unit of declared attention) can carry a friction policy
 * for as long as it is the active one. That policy is two lists, and they are
 * called what they are:
 *
 *   allow — hostnames explicitly permitted during this moment
 *   deny  — hostnames explicitly blocked during this moment
 *
 * Both are first-class. `allow` is a convenience — it says "these are the
 * places this moment is about", so everything else meets the gate. `deny` is a
 * commitment device — it names places that stay shut whatever else is true.
 * When a hostname is in both, **deny wins**: a convenience must never quietly
 * lift a commitment.
 *
 * ── Direction of dependency ─────────────────────────────────────────────
 *
 * zenborg owns moments and knows nothing about friction. keel reads them and
 * decides. `allow` may be *seeded* from a moment's `refs` (the URLs it points
 * at) — that seeding is a keel-side derivation, named and separable, and it is
 * not a meaning of `refs`. Same one-way seam as the area list: zenborg edits,
 * keel mirrors, never the reverse.
 *
 * ── What this is not ────────────────────────────────────────────────────
 *
 * This is gate-shaped, not lock-shaped. It arms friction from an ambient
 * observation ("a moment is running"), and per `rules.ts` an ambient arming may
 * never reach a `cooldown`. Nothing here constructs one; the verdict feeds a
 * gate the user can always walk through.
 */

import { createDomain } from "./value-objects.js";

export interface MomentFriction {
  /** Hostnames explicitly permitted during this moment. */
  readonly allow: readonly string[];
  /** Hostnames explicitly blocked during this moment. */
  readonly deny: readonly string[];
}

/**
 * What the moment says about one hostname.
 *
 * `area_policy` is not "allow" — it is "this moment has no opinion, ask the
 * area". That third value is the whole reason this is not a boolean.
 */
export type MomentVerdict = "allow" | "deny" | "area_policy";

/** A moment with nothing declared either way. */
export const NO_MOMENT_FRICTION: MomentFriction = { allow: [], deny: [] };

/** The same normalization the activity writer applies, so both sides agree on
 * what "the hostname" is (lowercased, leading `www.` dropped). */
const normalize = (host: string): string => createDomain(host.trim()) as string;

/**
 * The moment's verdict on `hostname`. Pure and total.
 *
 * Precedence, in order:
 *   1. in `deny`            → deny   (a commitment outranks a convenience)
 *   2. in `allow`           → allow
 *   3. `allow` is non-empty → deny   (outside a declared list is outside it)
 *   4. otherwise            → area_policy
 *
 * ponytail: rule 4 is the ceiling, and it is deliberate. A moment with neither
 * list declared imposes NOTHING — friction falls back to whatever the area
 * already says, which for a meditation moment is high and for a build moment is
 * low. It never escalates to a hard block, because the highest friction keel is
 * willing to own is a gate you can walk through, and making it impossible to
 * look something up is not a ceiling worth having. Equally, absence never fails
 * *open* into "allow everything": rule 4 hands the question back to the area,
 * it does not answer it.
 */
export function momentVerdict(
  hostname: string,
  friction: MomentFriction | null | undefined
): MomentVerdict {
  if (!friction) {
    return "area_policy";
  }
  const host = normalize(hostname);
  if (host === "") {
    return "area_policy";
  }
  for (const denied of friction.deny) {
    if (normalize(denied) === host) {
      return "deny";
    }
  }
  for (const allowed of friction.allow) {
    if (normalize(allowed) === host) {
      return "allow";
    }
  }
  return friction.allow.length > 0 ? "deny" : "area_policy";
}
