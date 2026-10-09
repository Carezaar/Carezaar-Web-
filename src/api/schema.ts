import { ApiError } from "./errors";
import type {
  BaseItem, CaregiverBrief, CaregiverFull, ClientBrief, ClientFull, Language, Match, Session, User,
} from "./types";

/** Runtime checks for the API responses the app depends on most (session, current user,
 *  profiles, matching, lookup tables). TypeScript types describe what the server should
 *  send; these verify what it did send, so a malformed payload becomes a clear error
 *  state ("Unexpected response from the server") instead of a crash or wrong screen.
 *  Only fields the app reads are checked, and fields the backend legitimately leaves
 *  empty are declared nullable. Extra fields are always allowed. */

type Check = (value: unknown, path: string) => string | null;

const describe = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

const primitive = (type: "string" | "number" | "boolean"): Check => (v, path) =>
  typeof v === type && !(type === "number" && !Number.isFinite(v)) ? null : `${path}: expected ${type}, got ${describe(v)}`;

export const str = primitive("string");
export const num = primitive("number");
export const bool = primitive("boolean");

export const nullable = (check: Check): Check => (v, path) => (v === null || v === undefined ? null : check(v, path));

export const arrayOf = (check: Check): Check => (v, path) => {
  if (!Array.isArray(v)) return `${path}: expected array, got ${describe(v)}`;
  for (let i = 0; i < v.length; i++) {
    const problem = check(v[i], `${path}[${i}]`);
    if (problem) return problem;
  }
  return null;
};

export const shape = (fields: Record<string, Check>): Check => (v, path) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return `${path}: expected object, got ${describe(v)}`;
  for (const [key, check] of Object.entries(fields)) {
    const problem = check((v as Record<string, unknown>)[key], `${path}.${key}`);
    if (problem) return problem;
  }
  return null;
};

const oneOf = (...values: string[]): Check => (v, path) =>
  typeof v === "string" && values.includes(v) ? null : `${path}: expected one of ${values.join(", ")}`;

/** Returns the value typed as T, or throws a "decoding" ApiError naming the first bad
 *  field (the path only, never the value, so nothing personal reaches the console). */
export function validated<T>(check: Check, value: unknown, endpoint: string): T {
  const problem = check(value, "response");
  if (problem) {
    console.warn(`Unexpected response from ${endpoint}: ${problem}`);
    throw new ApiError("decoding", "");
  }
  return value as T;
}

/* ------------------------------------------------------------------ schemas */

const ids = arrayOf(num);
const translations = arrayOf(shape({ id: num, language_id: num, name: str }));

export const sessionSchema = shape({ access_token: str, refresh_token: str });

const userFields = {
  id: str, role: oneOf("client", "caregiver"),
  first_name: nullable(str), last_name: nullable(str), photo: nullable(str),
  gender_id: nullable(num), date_of_birth: nullable(str), bio: nullable(str),
};
export const userSchema = shape({ ...userFields, email: str });
/** Another user: since 2026-10-03 the server no longer sends their email (or date of birth). */
const partnerUserSchema = shape({ ...userFields, email: nullable(str) });

const partnerBrief = { id: str, user: partnerUserSchema, distance: nullable(num), is_match: nullable(bool) };
export const caregiverBriefSchema = shape({ ...partnerBrief, salary_min: nullable(num), salary_max: nullable(num) });
export const clientBriefSchema = shape({ ...partnerBrief, clienttype_id: nullable(num), salary_min: nullable(num), salary_max: nullable(num) });

export const caregiverFullSchema = shape({
  ...partnerBrief, match_id: nullable(num), match_status: nullable(oneOf("none", "sent", "received", "active")), match_introduction: nullable(str), commute_id: nullable(num), experience_id: nullable(num), role_id: nullable(num), worktype_id: nullable(num),
  carecondition_ids: ids, careday_ids: ids, carespecial_ids: ids, certification_ids: ids, clienttype_ids: ids,
  languageskill_ids: ids, shift_ids: ids,
});
export const clientFullSchema = shape({
  ...partnerBrief, match_id: nullable(num), match_status: nullable(oneOf("none", "sent", "received", "active")), match_introduction: nullable(str), clienttype_id: nullable(num),
  carecondition_ids: ids, careday_ids: ids, carespecial_ids: ids, certification_ids: ids, commute_ids: ids,
  experience_ids: ids, gender_ids: ids, languageskill_ids: ids, role_ids: ids, shift_ids: ids, worktype_ids: ids,
});

export const matchSchema = shape({
  id: num, client: nullable(clientBriefSchema), caregiver: nullable(caregiverBriefSchema),
  is_client_accepted: bool, is_caregiver_accepted: bool, finished_at: nullable(str), created_at: nullable(str),
  introduction: nullable(str),
});

export const baseItemsSchema = arrayOf(shape({ id: num, code: nullable(str), icon: nullable(str), translations }));
export const languagesSchema = arrayOf(shape({ id: num, code: str, name: str, is_rtl: bool }));

/* Typed helpers for the service layer. */
export const asSession = (v: unknown) => validated<Session>(sessionSchema, v, "auth/login");
export const asUser = (v: unknown) => validated<User>(userSchema, v, "auth/info");
export const asMatch = (v: unknown, endpoint: string) => validated<Match>(matchSchema, v, endpoint);
export const asMatches = (v: unknown, endpoint: string) => validated<Match[]>(arrayOf(matchSchema), v, endpoint);
export const asCaregiverBriefs = (v: unknown) => validated<CaregiverBrief[]>(arrayOf(caregiverBriefSchema), v, "clients/matches");
export const asClientBriefs = (v: unknown) => validated<ClientBrief[]>(arrayOf(clientBriefSchema), v, "caregivers/matches");
export const asCaregiverFull = (v: unknown, endpoint: string) => validated<CaregiverFull>(caregiverFullSchema, v, endpoint);
export const asClientFull = (v: unknown, endpoint: string) => validated<ClientFull>(clientFullSchema, v, endpoint);
export const asBaseItems = (v: unknown, endpoint: string) => validated<BaseItem[]>(baseItemsSchema, v, endpoint);
export const asLanguages = (v: unknown) => validated<Language[]>(languagesSchema, v, "base/languages");
