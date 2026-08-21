/**
 * Moment gate — friction scoped to the moment you are actually in.
 *
 * The decision itself is `momentVerdict` in modules/domain (allow / deny /
 * area_policy, with deny winning over allow). This file is the effectful half:
 * it reads the mirrored policy, and it decides how often a gate is allowed to
 * ask the same question.
 *
 * Only `deny` produces a gate. `allow` deliberately does NOT suppress the
 * area's existing gates — a moment saying "these places are what I am about"
 * is not a licence to remove friction someone already asked for. And
 * `area_policy` adds nothing at all, which is the fallback the whole design
 * turns on.
 */

import { momentVerdict } from "../../domain";
import { storage } from "wxt/storage";
import { momentFriction } from "../policy/store";
import { reaskDue } from "./state";

/** When the moment gate last fired for each host. */
export const momentGateFiredAt = storage.defineItem<Record<string, number>>(
  "local:friction:momentGateFiredAt",
  { fallback: {} }
);

/**
 * The moment gate's rule id.
 *
 * It has no `RuleSpec` behind it — the moment's own allow/deny pair is what
 * arms it — but a delivery still has to be attributable, or its outcome cannot
 * be settled against anything. A stable literal is the honest name for "the
 * moment said so".
 */
export const MOMENT_GATE_RULE_ID = "moment-friction";

export interface MomentGateVerdict {
  readonly fire: boolean;
  readonly dwellMs: number;
  readonly ruleId: string;
  readonly prompt: string;
}

/**
 * The moment's say on `domain`, or null when it has none and the area's own
 * policy should answer instead.
 *
 * The prompt names no moment and no URL — the extension holds hostnames, and
 * that is all it needs to ask the question.
 */
export async function evaluateMomentGate(
  domain: string,
  now: number = Date.now()
): Promise<MomentGateVerdict | null> {
  const verdict = momentVerdict(domain, await momentFriction.getValue());
  if (verdict !== "deny") {
    return null; // allow, or no opinion — the area answers.
  }
  const fired = await momentGateFiredAt.getValue();
  if (!reaskDue(fired[domain] ?? 0, now)) {
    return null; // Already asked recently; fall through rather than nag.
  }
  // Keep only what still means something. An entry older than the re-ask
  // window can no longer change an answer, so carrying it would be a store
  // that grows for the life of the profile and decides nothing.
  const live: Record<string, number> = { [domain]: now };
  for (const [host, at] of Object.entries(fired)) {
    if (!reaskDue(at, now)) {
      live[host] = at;
    }
  }
  await momentGateFiredAt.setValue(live);
  return {
    fire: true,
    dwellMs: 0,
    ruleId: MOMENT_GATE_RULE_ID,
    prompt: "This is outside what the moment you're in is about. Still what you came for?",
  };
}
