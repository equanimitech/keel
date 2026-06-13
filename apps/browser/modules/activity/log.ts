/**
 * Activity log persistence — IndexedDB, append-only.
 *
 * DB "keel-log", object store "events" (autoIncrement key, index on ts).
 * The writer only ever ADDS; the single deletion path is the startup
 * retention guard (`deleteOldestEvents`). Every operation is fail-open:
 * a storage error drops the event / returns a safe default and never
 * propagates — logging must never break the shields.
 *
 * Extension pages (popup/manage) share the extension origin with the
 * service worker, so the export path reads the same DB directly.
 */

import type { ActivityEvent } from "@keel/domain";

const DB_NAME = "keel-log";
const DB_VERSION = 1;
const STORE_NAME = "events";

let dbPromise: Promise<IDBDatabase> | null = null;

function openLogDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { autoIncrement: true });
        store.createIndex("ts", "ts", { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onclose = () => {
        dbPromise = null;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("keel-log open blocked"));
  });
}

function getDb(): Promise<IDBDatabase> {
  if (dbPromise === null) {
    dbPromise = openLogDb().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Append one event. Fail-open: returns false on any storage error. */
export async function appendEvent(event: ActivityEvent): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(event);
    await awaitTransaction(tx);
    return true;
  } catch {
    return false;
  }
}

/** Total events in the store. Fail-open: 0 on error. */
export async function countEvents(): Promise<number> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).count();
    await awaitTransaction(tx);
    return request.result;
  } catch {
    return 0;
  }
}

/**
 * Retention guard's deletion path: remove the `count` oldest events
 * (autoIncrement key order = insertion order). Returns how many were
 * actually deleted. Fail-open: 0 on error.
 */
export async function deleteOldestEvents(count: number): Promise<number> {
  if (count <= 0) {
    return 0;
  }
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    let deleted = 0;
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor !== null && deleted < count) {
        cursor.delete();
        deleted += 1;
        cursor.continue();
      }
    };
    await awaitTransaction(tx);
    return deleted;
  } catch {
    return 0;
  }
}

/** Delete events whose value.id is in `ids` (ack-prune). Fail-open: 0 on error. */
export async function deleteEventsByIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    let deleted = 0;
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor === null) return;
      const value = cursor.value as { id?: string };
      if (value.id !== undefined && idSet.has(value.id)) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    await awaitTransaction(tx);
    return deleted;
  } catch {
    return 0;
  }
}

/** Events at or after `sinceTs`, chronological — a bounded read on the ts
 * index so the popup's "today" mirror never loads the full log. Fail-open:
 * [] on error. */
export async function readEventsSince(sinceTs: number): Promise<ActivityEvent[]> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const range = IDBKeyRange.lowerBound(sinceTs);
    const request = tx.objectStore(STORE_NAME).index("ts").getAll(range);
    await awaitTransaction(tx);
    return request.result as ActivityEvent[];
  } catch {
    return [];
  }
}

/** All events in chronological (ts index) order — the export read path.
 * Fail-open: [] on error. */
export async function readAllEvents(): Promise<ActivityEvent[]> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).index("ts").getAll();
    await awaitTransaction(tx);
    return request.result as ActivityEvent[];
  } catch {
    return [];
  }
}
