import { describe, expect, it } from "vitest";
import { SENSOR_KINDS, sensorAllowed, validateSensorMessage } from "./events";

describe("validateSensorMessage (hostile-page boundary)", () => {
  it("accepts a known sensor kind with no payload", () => {
    expect(
      validateSensorMessage({ type: "keel-sensor", kind: "video_ended" })
    ).toEqual({ kind: "video_ended", payload: {} });
  });

  it("accepts scalar payload fields", () => {
    expect(
      validateSensorMessage({
        type: "keel-sensor",
        kind: "game_finished",
        payload: { result: "loss", rated: true, moves: 42 },
      })
    ).toEqual({
      kind: "game_finished",
      payload: { result: "loss", rated: true, moves: 42 },
    });
  });

  it("rejects unknown kinds — the allowlist is the contract", () => {
    expect(
      validateSensorMessage({ type: "keel-sensor", kind: "evil_kind" })
    ).toBeNull();
  });

  it("rejects messages without the keel-sensor type tag", () => {
    expect(validateSensorMessage({ kind: "video_ended" })).toBeNull();
    expect(
      validateSensorMessage({ type: "other", kind: "video_ended" })
    ).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(validateSensorMessage(null)).toBeNull();
    expect(validateSensorMessage("video_ended")).toBeNull();
    expect(validateSensorMessage(42)).toBeNull();
  });

  it("drops non-scalar payload values (no nested structures cross the boundary)", () => {
    expect(
      validateSensorMessage({
        type: "keel-sensor",
        kind: "post_seen",
        payload: { promoted: false, nested: { a: 1 }, list: [1, 2], nul: null },
      })
    ).toEqual({ kind: "post_seen", payload: { promoted: false } });
  });

  it("truncates string payload values to 64 chars", () => {
    const long = "x".repeat(200);
    const result = validateSensorMessage({
      type: "keel-sensor",
      kind: "video_ended",
      payload: { title: long },
    });
    expect(result?.payload.title).toBe("x".repeat(64));
  });

  it("keeps at most 8 payload keys", () => {
    const payload = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`k${i}`, i])
    );
    const result = validateSensorMessage({
      type: "keel-sensor",
      kind: "post_seen",
      payload,
    });
    expect(Object.keys(result?.payload ?? {})).toHaveLength(8);
  });

  it("rejects non-finite numbers", () => {
    expect(
      validateSensorMessage({
        type: "keel-sensor",
        kind: "video_ended",
        payload: { n: Infinity },
      })
    ).toEqual({ kind: "video_ended", payload: {} });
  });
});

describe("sensorAllowed (observe-tier gate)", () => {
  const observe = ["youtube.com", "chess.com"];

  it("allows an exact watchlist domain", () => {
    expect(sensorAllowed("youtube.com", observe)).toBe(true);
  });

  it("allows subdomains of a watchlist domain", () => {
    expect(sensorAllowed("music.youtube.com", observe)).toBe(true);
  });

  it("denies unlisted domains", () => {
    expect(sensorAllowed("linkedin.com", observe)).toBe(false);
  });

  it("denies suffix lookalikes", () => {
    expect(sensorAllowed("notyoutube.com", observe)).toBe(false);
  });

  it("denies a null domain (non-web sender)", () => {
    expect(sensorAllowed(null, observe)).toBe(false);
  });

  it("denies everything on an empty watchlist", () => {
    expect(sensorAllowed("youtube.com", [])).toBe(false);
  });
});

describe("SENSOR_KINDS", () => {
  it("conforms to the completion grammar (past-tense / seen)", () => {
    expect([...SENSOR_KINDS].sort()).toEqual([
      "game_finished",
      "post_seen",
      "video_ended",
      "video_started",
    ]);
  });
});
