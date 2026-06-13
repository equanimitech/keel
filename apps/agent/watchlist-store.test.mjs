import { test } from "node:test";
import assert from "node:assert/strict";
import { applyObserveVerdicts, mergeLedger } from "./core.mjs";

test("applyObserveVerdicts adds observe-tier hosts to the existing list, deduped", () => {
  const next = applyObserveVerdicts(["youtube.com"], {
    "youtube.com/shorts": "observe", "netflix.com": "observe", "renfe.com": "benign",
  });
  assert.deepEqual([...next].sort(), ["netflix.com", "youtube.com", "youtube.com/shorts"].sort());
});

test("mergeLedger records every verdict keyed by host+route", () => {
  const led = mergeLedger({ "old.com": "benign" }, { "netflix.com": "observe", "renfe.com": "benign" });
  assert.equal(led["old.com"], "benign");
  assert.equal(led["netflix.com"], "observe");
  assert.equal(led["renfe.com"], "benign");
});
