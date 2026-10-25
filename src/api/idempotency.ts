import { ApiError } from "./errors";
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
 *  - keys are per account (another account's identical key is its own request);
 *  - an expired key → 409, `meta.code = "idempotency_expired"`.
 *
 *  One key per logical submission: it is created when the submission begins and kept
 *  (in localStorage, scoped by account, operation, target and a hash of the data) until
 *  the outcome is known, so a retry after a timeout, a lost connection, a renewed sign-in,
 *  a reload or another visit to the screen sends the same key. A confirmed success, or an
 *  answer that proves the request was not carried out, retires it; the next submission,
 *  even with identical text, gets a new key. An uncertain outcome (no answer, timeout,
 *  server error) keeps it: the request is never repeated with a new key on a guess. */
export type IdempotentOperation = "chat_message" | "issue" | "match_request";

interface PendingRecord {
  key: string;
  created: number;
  account: string;
  operation: IdempotentOperation;
  target: string;
  /** What the person submitted, so the screen can offer it again after a reload. */
  draft?: string;
  /** Newest record id known when the submission began, for reconciliation. */
  after?: number;
  /** Anything else needed to offer the same submission again (e.g. the message replied to). */
  context?: Record<string, string | number | null>;
}

const STORE = "carezaar.pendingSubmissions.v1";
/** Kept for a day; the server forgets keys sooner, which it reports as expired. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let account: string | null = null;
/** The signed-in account submissions are scoped to (set by the session). */
export function setIdempotencyAccount(id: string | null) {
  account = id;
}

function readAll(): Record<string, PendingRecord> {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Record<string, PendingRecord>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, r]) => r && typeof r.key === "string" && now - r.created < MAX_AGE_MS));
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, PendingRecord>) {
  try { window.localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* storage unavailable: kept for this page only */ }
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

/** Retires every unresolved submission of the signed-in account for one operation and
 *  target, once the resource shows how it ended (e.g. the profile shows the request sent). */
export function retireSubmissions(operation: IdempotentOperation, target: string) {
  const all = readAll();
  for (const [scope, r] of Object.entries(all)) {
    if (r.account === (account ?? "signed-out") && r.operation === operation && r.target === target) delete all[scope];
  }
  writeAll(all);
}

export class IdempotencyConflictError extends Error {
  constructor() { super("idempotency_conflict"); this.name = "IdempotencyConflictError"; }
}
/** The server forgot the key and reconciliation showed the earlier attempt was not carried out. */
export class SubmissionNotCarriedOutError extends Error {
  constructor() { super("idempotency_expired_not_found"); this.name = "SubmissionNotCarriedOutError"; }
}

const codeOf = (error: unknown) => error instanceof ApiError ? (error.meta?.code as string | undefined) : undefined;

/** True when the answer proves the request was not carried out (or was refused for good),
 *  so its key can be retired. No answer, a timeout or a server error is uncertain. */
export function isDefinitive(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 409) return codeOf(error) === "idempotency_conflict";
  return error.kind === "validation" || error.kind === "forbidden" || error.kind === "notFound"
    || (error.kind === "unknown" && error.status >= 400 && error.status < 500);
}

export interface Submission<T> {
  operation: IdempotentOperation;
  /** The resource the write goes to, e.g. the chat id. */
  target: string;
  form: Record<string, FormValue>;
  send: (key: string) => Promise<T>;
  /** After `idempotency_expired`: looks for the earlier attempt on the server; returns its
   *  result when it was carried out, null when it certainly wasn't. Throws when unsure. */
  reconcile?: (record: PendingRecord) => Promise<T | null>;
  draft?: string;
  after?: number;
  context?: Record<string, string | number | null>;
}

/** Sends one logical submission with its key: a new one, or the same one again while its
 *  earlier attempt is unresolved. */
export async function submitIdempotent<T>(submission: Submission<T>): Promise<T> {
  const scope = scopeOf(submission.operation, submission.target, submission.form);
  const all = readAll();
  const record: PendingRecord = all[scope] ?? {
    key: uuid(), created: Date.now(), account: account ?? "signed-out",
    operation: submission.operation, target: submission.target, draft: submission.draft, after: submission.after,
    context: submission.context,
  };
  all[scope] = record;
  writeAll(all);
  const retire = () => { const now = readAll(); delete now[scope]; writeAll(now); };
  try {
    const result = await submission.send(record.key);
    retire();
    return result;
  } catch (error) {
    const code = codeOf(error);
    if (code === "idempotency_expired") {
      // The server no longer knows this key: find out whether the earlier attempt went
      // through before anything is sent again. A failed check leaves the key in place.
      const found = submission.reconcile ? await submission.reconcile(record) : null;
      retire();
      if (found !== null) return found;
      throw new SubmissionNotCarriedOutError();
    }
    if (code === "idempotency_conflict") {
      // Same key, different data: never resent with this key, never silently with a new one.
      if (import.meta.env?.DEV) console.warn("Idempotency conflict", { operation: submission.operation, target: submission.target });
      retire();
      throw new IdempotencyConflictError();
    }
    if (isDefinitive(error)) retire();
    throw error;
  }
}

/** Test hook. */
export function clearPendingSubmissions() {
  writeAll({});
}
