// @ts-check
// Capture classifier I/O: the Things database (read-only), the offset file,
// and the local model. Pure logic lives in capture.mjs.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { KEEL_DIR } from "./store.mjs";
import { classifyPrompt, kindSchema } from "./capture.mjs";
import { ollamaProvider } from "./inference.mjs";

const THINGS_GROUP = "Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac";

/** Locate the Things database. The ThingsData-XXXXX directory name varies per
 * install, so it is discovered rather than hardcoded.
 * @param {string} [home] @returns {string | null} */
export function findThingsDb(home = homedir()) {
  const base = join(home, THINGS_GROUP);
  let entries = [];
  try {
    entries = readdirSync(base);
  } catch {
    return null;
  }
  for (const d of entries) {
    if (!d.startsWith("ThingsData-")) {
      continue;
    }
    const p = join(base, d, "Things Database.thingsdatabase", "main.sqlite");
    try {
      statSync(p);
      return p;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Open inbox captures created after `sinceCreation`, oldest first.
 *
 * An open Inbox item is `status=0 AND start=0` (0 = Inbox, 1 = Anytime,
 * 2 = Someday); `type=0` excludes projects and headings. `creationDate` is a
 * float of Unix epoch seconds. Opened read-only, always — we never write here.
 * @param {string} dbPath @param {number} sinceCreation @param {number} [limit]
 * @returns {Array<{uuid: string, title: string, creationDate: number}>} */
export function readInboxSince(dbPath, sinceCreation, limit = 50) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(
      `SELECT uuid, title, creationDate FROM TMTask
       WHERE trashed = 0 AND type = 0 AND status = 0 AND start = 0
         AND title IS NOT NULL AND length(title) > 0
         AND creationDate > ?
       ORDER BY creationDate ASC LIMIT ?`,
    ).all(sinceCreation, limit);
    return /** @type {any} */ (rows);
  } finally {
    db.close();
  }
}

export const OFFSET_PATH = join(KEEL_DIR, "state", "capture-classifier.json");

/** Last-seen creationDate. Missing or corrupt reads as 0 — a fresh run then
 * classifies the whole current inbox, which is correct on first install.
 * @param {string} [path] @returns {number} */
export function loadOffset(path = OFFSET_PATH) {
  try {
    const v = JSON.parse(readFileSync(path, "utf8"))?.lastCreationDate;
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
}

/** @param {number} creationDate @param {string} [path] */
export function saveOffset(creationDate, path = OFFSET_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ lastCreationDate: creationDate }) + "\n");
}

// ── the model, behind the inference port ───────────────
//
// These three functions used to build ollama's request body inline. They now
// state what the classifier needs — a prompt, a schema, a temperature, a
// context cap — and let a provider answer. `inference.mjs` holds the port and
// the ollama adapter; every legacy option below still lands on that adapter, so
// the requests on the wire are unchanged.

/** Measured: lfm2.5 (2.6B) is *unanimously wrong* on this task — it collapses
 * toward `reference` — so the gate gives no protection at that size. */
export const MODEL = "qwen3.6:35b";
export const SAMPLES = 5;

/** Non-zero or the vote is theatre. */
export const TEMPERATURE = 0.8;

/** Capped, or a local runtime sizes the context at the model's full window —
 * measured at 41 GB and 47s for one call. */
export const MAX_CONTEXT_TOKENS = 2048;

/** Resolve the provider for one call. An injected provider wins outright; the
 * older `model` / `endpoint` / `keepAlive` / `fetchImpl` options keep working
 * by landing on the local adapter, which is what keeps the default path
 * byte-identical.
 * @param {{provider?: import("./inference.mjs").InferenceProvider, model?: string,
 *   endpoint?: string, tagsEndpoint?: string, keepAlive?: string | number,
 *   fetchImpl?: typeof fetch}} opts
 * @returns {import("./inference.mjs").InferenceProvider} */
function providerFor(opts) {
  const { provider, model = MODEL, endpoint, tagsEndpoint, keepAlive, fetchImpl } = opts;
  if (provider) {
    return provider;
  }
  return ollamaProvider({ model, endpoint, tagsEndpoint, keepAlive, fetchImpl });
}

/** Sample the model `samples` times and return every vote.
 * @param {string} title
 * @param {{provider?: import("./inference.mjs").InferenceProvider, model?: string,
 *   samples?: number, endpoint?: string, keepAlive?: string | number,
 *   fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string[]>} */
export async function voteKind(title, opts = {}) {
  const { samples = SAMPLES } = opts;
  const provider = providerFor(opts);
  const votes = [];
  for (let i = 0; i < samples; i += 1) {
    const answer = await provider.complete({
      prompt: classifyPrompt(title),
      schema: kindSchema(),
      temperature: TEMPERATURE,
      maxContextTokens: MAX_CONTEXT_TOKENS,
    });
    votes.push(answer.kind);
  }
  return votes;
}

/** Can the provider answer right now?
 *
 * Found during verification: `ollama serve` is started by hand on this machine
 * — no brew service, no launch agent — so it can simply be absent when launchd
 * fires. Without this check every capture burns SAMPLES failed requests and
 * fails individually. With it the run exits early, touches no offset, and
 * retries whole on the next fire. A hosted provider answers the same question
 * about its own credentials.
 * @param {{provider?: import("./inference.mjs").InferenceProvider, endpoint?: string,
 *   fetchImpl?: typeof fetch}} [opts] */
export async function modelUp(opts = {}) {
  const { provider, endpoint, fetchImpl } = opts;
  // `endpoint` has always meant the *reachability* endpoint here, not the
  // generation one — preserved rather than unified, so nothing shifts.
  return providerFor({ provider, tagsEndpoint: endpoint, fetchImpl }).available();
}

/** Give back whatever the run held. Locally that drops a 23 GB model from
 * memory, which is what keeps it compatible with an always-on watcher; idle
 * draw returns to zero between batches. A hosted provider holds nothing.
 * @param {{provider?: import("./inference.mjs").InferenceProvider, model?: string,
 *   endpoint?: string, fetchImpl?: typeof fetch}} [opts] */
export async function unloadModel(opts = {}) {
  await providerFor(opts).release();
}
