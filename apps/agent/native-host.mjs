// @ts-check
// keel native-messaging host. Command-less, append-only, schema-validating,
// unprivileged writer. Chrome frames messages as a uint32 little-endian length
// prefix followed by UTF-8 JSON. Max 1 MB/message (Chrome limit).

const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Encode one object as a length-prefixed frame (Buffer). */
export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
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
    messages.push(JSON.parse(json));
    offset += 4 + len;
  }
  return { messages, rest: buf.subarray(offset) };
}
