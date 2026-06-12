/**
 * Content-script side of the sensor channel. Fire-and-forget: a sensor
 * must never break the page, and delivery is best-effort — the
 * background validates and gates everything (see events.ts).
 */

import type { SensorKind } from "./events";

export function sendSensorEvent(
  kind: SensorKind,
  payload?: Readonly<Record<string, unknown>>
): void {
  try {
    void browser.runtime
      .sendMessage({ type: "keel-sensor", kind, payload })
      .catch(() => {
        // Background asleep or extension reloading — drop, fail-open.
      });
  } catch {
    // Extension context invalidated — drop, fail-open.
  }
}
