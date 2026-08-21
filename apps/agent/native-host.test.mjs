import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, decodeMessages, validateInbound } from "./native-host.mjs";

test("encode then decode round-trips a message", () => {
  const buf = encodeMessage({ type: "ack", ids: ["a", "b"] });
  const { messages, rest } = decodeMessages(buf);
  assert.deepEqual(messages, [{ type: "ack", ids: ["a", "b"] }]);
  assert.equal(rest.length, 0);
});

test("decodeMessages keeps a partial trailing frame in rest", () => {
  const full = encodeMessage({ type: "request_observe" });
  const partial = full.subarray(0, full.length - 3);
  const { messages, rest } = decodeMessages(partial);
  assert.deepEqual(messages, []);
  assert.equal(rest.length, partial.length);
});

const validEvent = {
  id: "e1", surface: "browser", kind: "tab_activated", ts: 1781364354057,
  sessionId: "s1", payload: { domain: "youtube.com", tab: "u1" },
};

test("accepts a well-formed events message and drops bad events", () => {
  const out = validateInbound({
    type: "events",
    events: [validEvent, { id: "bad" }, { ...validEvent, id: "e2", kind: "../etc/passwd" }],
  });
  assert.equal(out.type, "events");
  assert.deepEqual(out.events.map((e) => e.id), ["e1"]); // bad shape + bad kind dropped
});

test("accepts the tab_closed + video pause/resume kinds", () => {
  const kinds = ["tab_closed", "video_paused", "video_resumed"];
  const out = validateInbound({
    type: "events",
    events: kinds.map((kind, i) => ({ ...validEvent, id: `k${i}`, kind })),
  });
  assert.deepEqual(out.events.map((e) => e.kind), kinds);
});

test("accepts request_observe", () => {
  assert.deepEqual(validateInbound({ type: "request_observe" }), { type: "request_observe" });
});

test("rejects unknown types and non-objects", () => {
  assert.equal(validateInbound({ type: "delete_everything" }), null);
  assert.equal(validateInbound("nope"), null);
  assert.equal(validateInbound({ type: "events", events: "no" }), null);
});

test("caps event count per message", () => {
  const many = Array.from({ length: 5001 }, (_, i) => ({ ...validEvent, id: `e${i}` }));
  const out = validateInbound({ type: "events", events: many });
  assert.ok(out.events.length <= 5000);
});

test("rejects non-scalar payload values (nested object / array)", () => {
  const out = validateInbound({ type: "events", events: [
    { ...validEvent, id: "n1", payload: { x: { y: "z" } } },
    { ...validEvent, id: "n2", payload: { x: [1, 2, 3] } },
    { ...validEvent, id: "ok", payload: { domain: "youtube.com", count: 3, flag: true } },
  ]});
  assert.deepEqual(out.events.map((e) => e.id), ["ok"]);
});

test("rejects out-of-range timestamps", () => {
  const out = validateInbound({ type: "events", events: [
    { ...validEvent, id: "old", ts: -1 },
    { ...validEvent, id: "future", ts: 4102444800001 },
    { ...validEvent, id: "ok", ts: 1781364354057 },
  ]});
  assert.deepEqual(out.events.map((e) => e.id), ["ok"]);
});

test("decodeMessages drops a malformed frame but keeps a following valid one", () => {
  const bad = Buffer.from("not json{{");
  const badHeader = Buffer.alloc(4); badHeader.writeUInt32LE(bad.length, 0);
  const good = encodeMessage({ type: "request_observe" });
  const { messages, rest } = decodeMessages(Buffer.concat([badHeader, bad, good]));
  assert.deepEqual(messages, [{ type: "request_observe" }]);
  assert.equal(rest.length, 0);
});

test("rejects empty sessionId", () => {
  const out = validateInbound({ type: "events", events: [
    { ...validEvent, id: "empty", sessionId: "" },
    { ...validEvent, id: "ok" },
  ]});
  assert.deepEqual(out.events.map((e) => e.id), ["ok"]);
});

import { browserLogFileName } from "./core.mjs";

test("browserLogFileName buckets by local date with .browser surface", () => {
  const name = browserLogFileName(1781364354057);
  assert.match(name, /^\d{4}-\d{2}-\d{2}\.browser\.jsonl$/);
});

test("accepts request_armed — the push the extension actuates from", () => {
  assert.deepEqual(validateInbound({ type: "request_armed" }), { type: "request_armed" });
});

test("accepts the three reserved intervention kinds", () => {
  // Reserved in docs/event-taxonomy.md under P5. A delivery is
  // a completion in `logs`, so the host has to let it through or the extension
  // writes an outcome that never reaches the store.
  const kinds = [
    "intervention_shown",
    "intervention_dismissed",
    "intervention_clicked_through",
  ];
  const out = validateInbound({
    type: "events",
    events: kinds.map((kind, i) => ({ ...validEvent, id: `i${i}`, kind })),
  });
  assert.deepEqual(out.events.map((e) => e.kind), kinds);
});

test("does not accept intervention_effective from the extension", () => {
  // It is settleProximalOutcome's verdict, derived read-side over the three
  // above. A surface that could assert it would be grading its own homework.
  const out = validateInbound({
    type: "events",
    events: [{ ...validEvent, id: "x", kind: "intervention_effective" }],
  });
  assert.deepEqual(out.events, []);
});
