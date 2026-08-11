// @ts-check
// Capture classifier I/O: the Things database (read-only), the offset file,
// and the local model. Pure logic lives in capture.mjs.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { KEEL_DIR } from "./store.mjs";
import { classifyPrompt, kindSchema } from "./capture.mjs";

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

// ── the local model ───────────────────────────────────────────

/** Measured: lfm2.5 (2.6B) is *unanimously wrong* on this task — it collapses
 * toward `reference` — so the gate gives no protection at that size. */
export const MODEL = "qwen3.6:35b";
export const SAMPLES = 5;
const ENDPOINT = "http://localhost:11434/api/generate";

/** Sample the local model `samples` times. Temperature must be non-zero or the
 * vote is theatre. `num_ctx` must be capped: uncapped, ollama sizes the context
 * at the model's full window — measured at 41 GB and 47s for one call.
 * @param {string} title
 * @param {{model?: string, samples?: number, endpoint?: string,
 *   keepAlive?: string | number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string[]>} */
export async function voteKind(title, opts = {}) {
  const {
    model = MODEL, samples = SAMPLES, endpoint = ENDPOINT,
    keepAlive = "5m", fetchImpl = fetch,
  } = opts;
  const votes = [];
  for (let i = 0; i < samples; i += 1) {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: classifyPrompt(title),
        stream: false,
        think: false,
        keep_alive: keepAlive,
        options: { num_ctx: 2048, temperature: 0.8 },
        format: kindSchema(),
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama ${res.status}`);
    }
    const body = await res.json();
    votes.push(JSON.parse(body.response).kind);
  }
  return votes;
}

/** Is the local model server reachable?
 *
 * Found during verification: `ollama serve` is started by hand on this machine
 * — no brew service, no launch agent — so it can simply be absent when launchd
 * fires. Without this check every capture burns SAMPLES failed requests and
 * fails individually. With it the run exits early, touches no offset, and
 * retries whole on the next fire.
 * @param {{endpoint?: string, fetchImpl?: typeof fetch}} [opts] */
export async function modelUp(opts = {}) {
  const { endpoint = "http://127.0.0.1:11434/api/tags", fetchImpl = fetch } = opts;
  try {
    const res = await fetchImpl(endpoint);
    return res.ok;
  } catch {
    return false;
  }
}

/** Drop the model from memory. Idle draw returns to zero between batches —
 * this is what keeps a 23 GB model compatible with an always-on watcher.
 * @param {{model?: string, endpoint?: string, fetchImpl?: typeof fetch}} [opts] */
export async function unloadModel(opts = {}) {
  const { model = MODEL, endpoint = ENDPOINT, fetchImpl = fetch } = opts;
  await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}
