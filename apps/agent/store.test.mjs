import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeJsonAtomic } from "./store.mjs";

test("writeJsonAtomic writes valid JSON and leaves no temp file", () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-"));
  const path = join(dir, "state.json");
  writeJsonAtomic(path, { a: 1 });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { a: 1 });
  assert.equal(readdirSync(dir).filter((f) => f.includes(".tmp")).length, 0);
});
