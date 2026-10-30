import type { FormValue } from "./client";

/** `Idempotency-Key` for the three writes the client named (25 Oct 2026):
 *  `POST users/chats/{id}` (send a message), `POST users/issues` (report an issue) and
 *  `POST users/matches` (request a match).
 *
 *  Live API contract (verified 25 Oct 2026, web-qa/idem-probe.mjs):
 *  - the key must be a UUID (otherwise 422, `meta.code = "idempotency_invalid"`);
 *  - the same key and the same request again → the first answer, replayed
 *    (`Idempotency-Replayed: true`), nothing created twice, also for two at once;
 *  - the same key with different data → 409, `meta.code = "idempotency_conflict"`;
 *  - keys are per account (another account's identical key is its own request).
 *  Not verified on the server: how long a key is kept (undocumented; still replayed after
 *  more than 5 hours on 26 Oct 2026) and the expired answer, taken from the client's
 *  description as 409 with `meta.code = "idempotency_expired"`.
 *
 *  One key per logical submission: it is created when the submission begins and kept
 *  (in localStorage, scoped by account, operation, target and a hash of the data) until
 *  the outcome is known, so a retry after a timeout, a lost connection, a renewed sign-in,
 *  a reload or another visit to the screen sends the same key. A confirmed success retires
 *  it; the next submission, even with identical text, gets a new key. Any other outcome
 *  keeps it. A new submission is only sent once its key is saved (see
 *  SubmissionStorageError). */
export type IdempotentOperation = "chat_message" | "issue" | "match_request";

interface PendingRecord {
  key: string;
  created: number;
  account: string;
  operation: IdempotentOperation;
  target: string;
}

const STORE = "carezaar.pendingSubmissions.v1";

/* Storage is the record of truth whenever it works, so another tab's records are never
 * overwritten, dropped or revived. This page keeps three fallbacks for when it fails:
 * - `unsaved`: records it couldn't save, so a retry here still sends the same key;
 * - `known`: records it saved, used only while storage can't be read;
 * - `unretired`: keys it retired but couldn't remove, so they stay retired here (only that
 *   key: a record another tab saves later under the same scope has a new key and shows). */
const unsaved = new Map<string, PendingRecord>();
const known = new Map<string, PendingRecord>();
const unretired = new Map<string, string>();

let account: string | null = null;
/** The signed-in account submissions are scoped to (set by the session). */
export function setIdempotencyAccount(id: string | null) {
  account = id;
}

/** The stored records, or null when storage can't be read. Stored text that isn't a record
 *  list holds no usable key, so it reads (and is then rewritten) as empty. */
function readStored(): Record<string, PendingRecord> | null {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STORE);
  } catch {
    return null;
  }
  try {
    const all = JSON.parse(text ?? "{}") as Record<string, PendingRecord> | null;
    if (!all || typeof all !== "object" || Array.isArray(all)) return {};
    return Object.fromEntries(Object.entries(all).filter(([, r]) => r && typeof r.key === "string"));
  } catch {
    return {};
  }
}

function readAll(): Record<string, PendingRecord> {
  const all = readStored() ?? Object.fromEntries(known);
  for (const [scope, record] of unsaved) all[scope] = record;
  for (const [scope, key] of unretired) if (all[scope]?.key === key) delete all[scope];
  return all;
}

/** Saves or removes one scope against a fresh read, leaving every other record as stored.
 *  True only when storage holds the change afterwards. */
function writeScope(scope: string, record: PendingRecord | null): boolean {
  const stored = readStored();
  if (!stored) return false;
  if (record) stored[scope] = record;
  else delete stored[scope];
  try {
    const text = JSON.stringify(stored);
    window.localStorage.setItem(STORE, text);
    return window.localStorage.getItem(STORE) === text;
  } catch {
    return false;
  }
}

function saveScope(scope: string, record: PendingRecord): boolean {
  if (writeScope(scope, record)) {
    unretired.delete(scope);
    unsaved.delete(scope);
    known.set(scope, record);
    return true;
  }
  unsaved.set(scope, record);
  return false;
}

function retireScope(scope: string, key: string) {
  unsaved.delete(scope);
  known.delete(scope);
  if (!writeScope(scope, null)) unretired.set(scope, key);
}

/** A stable short hash (cyrb53) of the request data. */
export function payloadHash(form: Record<string, FormValue>): string {
  const canonical = JSON.stringify(Object.keys(form).sort()
    .filter((k) => form[k] !== null && form[k] !== undefined)
    .map((k) => [k, Array.isArray(form[k]) ? (form[k] as number[]).join(",") : String(form[k])]));
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const scopeOf = (operation: IdempotentOperation, target: string, form: Record<string, FormValue>) =>
  `${account ?? "signed-out"}|${operation}|${target}|${payloadHash(form)}`;

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

/** The unresolved submissions of the signed-in account for one operation and target,
 *  newest first (e.g. a message that may not have been sent, to offer again). */
export type { PendingRecord };
export function pendingSubmissions(operation: IdempotentOperation, target: string): PendingRecord[] {
  return Object.values(readAll())
    .filter((r) => r.account === (account ?? "signed-out") && r.operation === operation && r.target === target)
    .sort((a, b) => b.created - a.created);
}

/** A new submission's key couldn't be saved in browser storage, so nothing was sent: after
 *  a lost answer and a reload, it could otherwise only be sent again with a new key. */
export class SubmissionStorageError extends Error {
  constructor() { super("pending_submission_not_saved"); this.name = "SubmissionStorageError"; }
}

export interface Submission<T> {
  operation: IdempotentOperation;
  /** The resource the write goes to, e.g. the chat id. */
  target: string;
  form: Record<string, FormValue>;
  send: (key: string) => Promise<T>;
}

/** Sends one logical submission with its key: a new one, or the same one again while its
 *  earlier attempt is unresolved. */
export async function submitIdempotent<T>(submission: Submission<T>): Promise<T> {
  const scope = scopeOf(submission.operation, submission.target, submission.form);
  const all = readAll();
  const existing = all[scope];
  const record: PendingRecord = existing ?? {
    key: uuid(), created: Date.now(), account: account ?? "signed-out",
    operation: submission.operation, target: submission.target,
  };
  if (!saveScope(scope, record) && !existing) {
    unsaved.delete(scope);
    throw new SubmissionStorageError();
  }
  const result = await submission.send(record.key);
  retireScope(scope, record.key);
  return result;
}

/** Test hook. */
export function clearPendingSubmissions() {
  unsaved.clear();
  known.clear();
  unretired.clear();
  try { window.localStorage.setItem(STORE, "{}"); } catch { /* nothing stored */ }
}
