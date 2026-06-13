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
