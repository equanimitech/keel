/**
 * The armed cache, on disk in `chrome.storage.local`.
 *
 * `armed.ts` decides what is well-formed; this file decides what persists. Two
 * items and one rule:
 *
 *   **A malformed push leaves the cache alone; an empty one lifts.**
 *
 * That asymmetry is the whole reliability claim. A dead or downgraded host must
 * not read as "nothing is armed" — the shields would drop exactly when the
 * machine is least healthy — but taking a fence down has to land, or the person
 * is trapped by a mirror nobody can edit. `parseArmed` returns `null` for the
 * first case and `{}` for the second, and `replaceArmed` honours both.
 *
 * `armedPushedAt` records freshness rather than validity: the cache is
 * authoritative whatever its age, and the timestamp exists so a surface can say
 * how long it has been since the app last spoke.
 */

import { storage } from "wxt/storage";
import { parseArmed, type Armed, type Refusal } from "./armed";

/** What is in force right now, keyed by rule id. */
export const armedCache = storage.defineItem<Armed>("local:armed:record", { fallback: {} });

/** When the app last pushed. 0 means never — not "stale", just never. */
export const armedPushedAt = storage.defineItem<number>("local:armed:pushedAt", { fallback: 0 });

/**
 * Entries the last push was refused for, kept so the failure is visible.
 *
 * An invariant-6 refusal is a bug in the rule that armed it, and a bug nobody
 * can see is one that ships. This is the surface that lets the manage page —
 * or a person reading storage — find out why a fence they declared is not
 * holding, instead of concluding the extension is broken.
 */
export const armedRefusals = storage.defineItem<Refusal[]>("local:armed:refused", {
  fallback: [],
});

export interface ArmedWriteResult {
  readonly accepted: number;
  readonly refused: readonly Refusal[];
  /** False when the push was malformed and the previous cache was kept. */
  readonly applied: boolean;
}

/** Apply a pushed armed record. Returns what landed, for logging. */
export async function replaceArmed(
  raw: unknown,
  now: number = Date.now()
): Promise<ArmedWriteResult> {
  const parsed = parseArmed(raw);
  if (parsed === null) {
    // Not a record collection. Keep what we have — see the rule above.
    return { accepted: 0, refused: [], applied: false };
  }
  await armedCache.setValue(parsed.armed);
  await armedRefusals.setValue([...parsed.refused]);
  await armedPushedAt.setValue(now);
  return {
    accepted: Object.keys(parsed.armed).length,
    refused: parsed.refused,
    applied: true,
  };
}
