// @ts-check
// keel native-messaging host. Command-less, append-only, schema-validating,
// unprivileged writer. Chrome frames messages as a uint32 little-endian length
// prefix followed by UTF-8 JSON. Max 1 MB/message (Chrome limit).

import { appendBrowserEvents, loadArmed, loadWatchlist, loadAreas, loadAreaMap, saveAreaMap, loadBlockDomains, loadBreakTarget, loadDwellGates, loadLedger, loadMomentFriction, loadTransforms, readBrowserEventsSince } from "./store.mjs";

const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Encode one object as a length-prefixed frame (Buffer). */
export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

const MAX_EVENTS_PER_MESSAGE = 5000;
// No horizon on reads. The store is the user's own log on their own disk and
// the channel is a local pipe, so refusing a question about their own past
// buys nothing. Responses are chunked, so a wide query costs time, not a
// blown frame.
/** Events per response frame. ~200 bytes each, so well inside Chrome's 1 MB. */
const QUERY_CHUNK = 2000;
const MAX_FIELD_BYTES = 2048;
const MAX_EVENT_BYTES = 8192;
const MIN_TS = 1262304000000; // 2010-01-01
const MAX_TS = 4102444800000; // 2100-01-01

function isScalar(v) {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

// Allowlist: browser writer + sensor kinds (event-taxonomy.md).
const ALLOWED_KINDS = new Set([
  "writer_started", "writer_paused", "writer_resumed",
  "tab_activated", "tab_closed", "navigation_committed", "route_changed",
  "focus_start", "focus_end", "idle_start", "idle_end",
  "log_pruned", "panic_pressed",
  "video_started", "video_ended", "video_paused", "video_resumed", "post_seen", "game_finished",
  "product_seen",
  // Intervention outcomes (P5, event-taxonomy.md). Reserved means the name was
  // claimed and the first writer creates it; the extension is that writer.
  // `intervention_effective` is deliberately absent — it is the read-side
  // verdict of settleProximalOutcome, not something a delivering surface may
  // assert about itself.
  "intervention_shown", "intervention_dismissed", "intervention_clicked_through",
]);

function isValidEvent(e) {
  if (typeof e !== "object" || e === null) return false;
  if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > 128) return false;
  if (e.surface !== "browser") return false;
  if (typeof e.kind !== "string" || !ALLOWED_KINDS.has(e.kind)) return false;
  if (typeof e.ts !== "number" || !Number.isFinite(e.ts) || e.ts < MIN_TS || e.ts > MAX_TS) return false;
  if (typeof e.sessionId !== "string" || e.sessionId.length === 0 || e.sessionId.length > 128) return false;
  if (typeof e.payload !== "object" || e.payload === null) return false;
  for (const v of Object.values(e.payload)) {
    if (!isScalar(v)) return false;
    if (typeof v === "string" && Buffer.byteLength(v, "utf8") > MAX_FIELD_BYTES) return false;
  }
  if (e.durationMs !== undefined && typeof e.durationMs !== "number") return false;
  if (Buffer.byteLength(JSON.stringify(e), "utf8") > MAX_EVENT_BYTES) return false;
  return true;
}

/** Validate an inbound message. Returns a sanitized message or null. All
 * extension input is untrusted; off-schema is dropped, never written. */
export function validateInbound(msg) {
  if (typeof msg !== "object" || msg === null) return null;
  if (msg.type === "request_observe") return { type: "request_observe" };
  if (msg.type === "request_policy") return { type: "request_policy" };
  // The armed record. Separate from `request_policy` because it is a different
  // contract: policy is a projection of keel's own rule files, `armed` is the
  // kernel record collection the app writes and every instrument reads.
  if (msg.type === "request_armed") return { type: "request_armed" };
  // Read query: what happened since `since`. The store answers; no surface
  // keeps its own history. `since` is clamped rather than trusted — an
  // unbounded value would stream the whole log through a 1 MB channel.
  if (msg.type === "request_events") {
    const since = typeof msg.since === "number" && Number.isFinite(msg.since) ? msg.since : 0;
    return { type: "request_events", since: Math.max(0, since) };
  }
  // Area assignment from the Areas page. Both fields must be plain, bounded
  // strings; the host writes them into area-map.json, so an unchecked value
  // would end up as a key in a file every surface reads.
  if (msg.type === "set_area") {
    const domain = typeof msg.domain === "string" ? msg.domain.trim().toLowerCase() : "";
    const areaId = typeof msg.areaId === "string" ? msg.areaId.trim() : "";
    if (!domain || domain.length > 253 || !/^[a-z0-9.\-/]+$/.test(domain)) return null;
    if (areaId.length > 64 || !/^[a-z0-9\-]*$/i.test(areaId)) return null;
    return { type: "set_area", domain, areaId };
  }
  if (msg.type === "events") {
    if (!Array.isArray(msg.events)) return null;
    const events = msg.events.filter(isValidEvent).slice(0, MAX_EVENTS_PER_MESSAGE);
    return { type: "events", events };
  }
  return null;
}

/** Decode as many whole frames as `buf` contains. Returns parsed messages and
 * the leftover bytes (a partial next frame). Oversized frames throw. */
export function decodeMessages(buf) {
  const messages = [];
  let offset = 0;
  while (buf.length - offset >= 4) {
    const len = buf.readUInt32LE(offset);
    if (len > MAX_MESSAGE_BYTES) throw new Error("native message too large");
    if (buf.length - offset - 4 < len) break;
    const json = buf.subarray(offset + 4, offset + 4 + len).toString("utf8");
    try {
      messages.push(JSON.parse(json));
    } catch {
      // malformed JSON in a well-framed message — drop this frame only
    }
    offset += 4 + len;
  }
  return { messages, rest: buf.subarray(offset) };
}

/** Run the native-messaging host: read frames from stdin, write replies to
 * stdout. Pure handlers do the work; this is just the pump. */
export function runHost(stdin = process.stdin, stdout = process.stdout) {
  let buffer = Buffer.alloc(0);
  const reply = (obj) => stdout.write(encodeMessage(obj));

  stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let decoded;
    try {
      decoded = decodeMessages(buffer);
    } catch {
      buffer = Buffer.alloc(0); // oversized/corrupt — reset, fail-open
      return;
    }
    buffer = decoded.rest;
    for (const raw of decoded.messages) {
      const msg = validateInbound(raw);
      if (msg === null) continue; // hostile/off-schema — drop silently
      if (msg.type === "events") {
        reply({ type: "ack", ids: appendBrowserEvents(msg.events) });
      } else if (msg.type === "request_observe") {
        reply({ type: "observe", domains: loadWatchlist().observe });
      } else if (msg.type === "request_policy") {
        // Policy pull: what the extension needs to enforce, derived from
        // ~/.kairos/keel/rules/*.json plus the ledger classification. Domains only —
        // the full RuleSpec stays host-side until the interpreter needs it.
        const { standing, armable } = loadBlockDomains();
        const ledger = loadLedger();
        const observe = Object.keys(ledger).filter((d) => ledger[d] === "observe");
        reply({
          type: "policy",
          standing,
          armable,
          observe,
          gates: loadDwellGates(),
          transforms: loadTransforms(),
          break: loadBreakTarget(),
          areas: loadAreas(),
          areaMap: loadAreaMap(),
          // The running moment's allow/deny pair, as hostnames. Null when no
          // moment is running — which the extension reads as "ask the area",
          // never as "allow everything".
          momentFriction: loadMomentFriction(),
        });
      } else if (msg.type === "request_armed") {
        // The push `kernel/substrate.md` says this surface takes instead of a
        // loader: the extension has no filesystem access, so a process that
        // can read the vault hands it the collection. No copy on disk, so the
        // one-writer rule still holds — pushing is a read with extra steps.
        reply({ type: "armed", armed: loadArmed() });
      } else if (msg.type === "request_events") {
        // The store answers questions about itself. Surfaces query rather than
        // remember, so there is exactly one history and no copy to drift.
        // Raw events, not a computed rollup: `bouts()` is TypeScript in
        // @keel/domain and this host is plain JS, so the caller computes and
        // the one dwell implementation stays in one place.
        const events = readBrowserEventsSince(msg.since);
        for (let i = 0; i < events.length; i += QUERY_CHUNK) {
          reply({
            type: "events_slice",
            events: events.slice(i, i + QUERY_CHUNK),
            done: i + QUERY_CHUNK >= events.length,
          });
        }
        if (events.length === 0) {
          reply({ type: "events_slice", events: [], done: true });
        }
      } else if (msg.type === "set_area") {
        // Empty areaId un-assigns, so a mistake is undoable in one gesture.
        const map = loadAreaMap();
        if (msg.areaId === "") {
          delete map[msg.domain];
        } else {
          map[msg.domain] = msg.areaId;
        }
        saveAreaMap(map);
        reply({ type: "area_set", domain: msg.domain, areaId: msg.areaId });
      }
    }
  });
}
