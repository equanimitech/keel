#!/usr/bin/env node
// @ts-check
// keel capture classifier — run by launchd when the Things database changes.
//
// Reads new inbox captures, classifies each by kind with a local model, writes
// one event per capture, and renders today's digest. Writes nothing to Things,
// Linear, or any repository: this proposes, it does not act.

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classifyCaptures, renderDigest } from "./capture.mjs";
import {
  findThingsDb, readInboxSince, loadOffset, saveOffset,
  voteKind, unloadModel, modelUp, MODEL,
} from "./capture-store.mjs";
import { appendEvent, readEvents, LOG_DIR, KEEL_DIR } from "./store.mjs";

/** @param {number} ts */
function dayStamp(ts) {
  const d = new Date(ts);
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const db = findThingsDb();
  if (!db) {
    console.error("keel-classify: no Things database found");
    process.exit(0);
  }

  const captures = readInboxSince(db, loadOffset());
  if (captures.length === 0) {
    process.exit(0);
  }

  // Preflight. `ollama serve` is hand-started here, so it can simply be absent.
  // Exiting before touching the offset means the whole batch retries next fire.
  if (!(await modelUp())) {
    console.error(`keel-classify: model server unreachable, ${captures.length} captures left for the next run`);
    process.exit(0);
  }

  const result = await classifyCaptures({
    captures,
    vote: (title) => voteKind(title),
    appendEvent: (e) => { appendEvent(LOG_DIR, e); },
    saveOffset: (o) => { saveOffset(o); },
    now: () => Date.now(),
    newId: () => randomUUID(),
    model: MODEL,
  });

  // Idle draw returns to zero between batches.
  try {
    await unloadModel();
  } catch {
    // ollama already gone; nothing to unload
  }

  const now = Date.now();
  const day = dayStamp(now);
  const dir = join(KEEL_DIR, "digest");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${day}.md`), renderDigest(readEvents(LOG_DIR, now), day));

  console.error(`keel-classify: ${result.classified} classified, ${result.failed} failed`);
}

main().catch((e) => {
  console.error("keel-classify:", e?.message ?? e);
  process.exit(1);
});
