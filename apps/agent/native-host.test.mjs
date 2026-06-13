import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, decodeMessages } from "./native-host.mjs";

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
