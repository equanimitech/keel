// @ts-check
// keel native-messaging host. Command-less, append-only, schema-validating,
// unprivileged writer. Chrome frames messages as a uint32 little-endian length
// prefix followed by UTF-8 JSON. Max 1 MB/message (Chrome limit).

import { appendBrowserEvents, loadWatchlist } from "./store.mjs";

const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Encode one object as a length-prefixed frame (Buffer). */
export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

const MAX_EVENTS_PER_MESSAGE = 5000;
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
      }
    }
  });
}
