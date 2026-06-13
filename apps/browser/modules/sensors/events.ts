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

/** The arm handshake: a freshly-injected sensor content script asks the
 * background whether its domain is on the observe tier before wiring
 * any DOM observation at all. */
export function isArmQuery(msg: unknown): boolean {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "keel-sensor-arm"
  );
}

/**
 * Reduce a media time (seconds — possibly NaN before metadata loads, or
 * negative/Infinity on a detached element) to a finite, non-negative
 * integer. The hostile-page boundary drops non-finite numbers, so a raw
 * `video.duration`/`currentTime` read could silently vanish from the
 * payload; this guarantees a present, sane value.
 */
export function finiteSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Completion heuristic for the video grammar: playback has reached a
 * threshold fraction of its duration. The native `ended` event is
 * unreliable on platform players (YouTube swaps the <video> for
 * autoplay-next; Shorts loop by resetting currentTime), so ≥90% watched
 * is the industry-standard proxy for "the user finished this video".
 * A non-positive / non-finite duration is never complete.
 */
export function videoCompleted(
  currentTime: number,
  duration: number,
  threshold = 0.9
): boolean {
  if (!Number.isFinite(duration) || duration <= 0) {
    return false;
  }
  return currentTime / duration >= threshold;
}

/**
 * Generic feed heuristic: the industry-standard disclosure labels that
 * mark a sponsored item, as the FULL text of a small element. Type-level
 * knowledge (how feeds disclose ads), not company-level.
 */
export function isSponsoredLabel(text: string): boolean {
  const t = text.trim();
  return t === "Promoted" || t === "Sponsored";
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
