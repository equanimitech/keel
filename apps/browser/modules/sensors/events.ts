/**
 * Per-domain sensors — pure validation for the observe tier.
 *
 * Sensors are content scripts that detect KEY-ACTION COMPLETIONS
 * (taxonomy: completion grammar — packages/domain/docs/event-taxonomy.md)
 * and message them to the background writer. The hostile-page boundary
 * holds because the background trusts nothing from the page:
 *   - kind must be on the allowlist below,
 *   - payload is reduced to capped scalars,
 *   - the domain comes from `sender.tab.url` (browser-attested), never
 *     from the message,
 *   - nothing is written unless the domain is on the watchlist's
 *     observe tier (`sensorAllowed`).
 */

/** The key-action completions sensors may report. Open set per the
 * taxonomy, but each addition lands here deliberately. */
export const SENSOR_KINDS = [
  "video_started",
  "video_ended",
  "post_seen",
  "game_finished",
] as const;

export type SensorKind = (typeof SENSOR_KINDS)[number];

/** Wire shape sent by sensor content scripts. */
export interface SensorMessage {
  readonly type: "keel-sensor";
  readonly kind: SensorKind;
  readonly payload?: Readonly<Record<string, unknown>>;
}

const MAX_PAYLOAD_KEYS = 8;
const MAX_STRING_LENGTH = 64;

/**
 * Validate an untrusted runtime message into a writable sensor event.
 * Returns null for anything that is not a well-formed sensor message;
 * payload values are reduced to capped scalars (strings ≤64 chars,
 * finite numbers, booleans) and at most 8 keys.
 */
export function validateSensorMessage(
  msg: unknown
): { kind: SensorKind; payload: Record<string, string | number | boolean> } | null {
  if (typeof msg !== "object" || msg === null) {
    return null;
  }
  const m = msg as Record<string, unknown>;
  if (m.type !== "keel-sensor") {
    return null;
  }
  if (!(SENSOR_KINDS as readonly unknown[]).includes(m.kind)) {
    return null;
  }
  const payload: Record<string, string | number | boolean> = {};
  if (typeof m.payload === "object" && m.payload !== null) {
    for (const [key, value] of Object.entries(m.payload)) {
      if (Object.keys(payload).length >= MAX_PAYLOAD_KEYS) {
        break;
      }
      if (typeof value === "string") {
        payload[key] = value.slice(0, MAX_STRING_LENGTH);
      } else if (typeof value === "number" && Number.isFinite(value)) {
        payload[key] = value;
      } else if (typeof value === "boolean") {
        payload[key] = value;
      }
    }
  }
  return { kind: m.kind as SensorKind, payload };
}

/**
 * The observe-tier gate: sensor events are written only for watchlist
 * domains (exact match or subdomain). `domain` is derived by the
 * background from the sender tab's URL — null means a non-web sender.
 */
export function sensorAllowed(
  domain: string | null,
  observe: readonly string[]
): boolean {
  if (domain === null) {
    return false;
  }
  return observe.some(
    (entry) => domain === entry || domain.endsWith("." + entry)
  );
}
