import { ApiError } from "./errors";
import type {
  BaseItem, CaregiverBrief, CaregiverFull, ClientBrief, ClientFull, Language, Match, Session, User,
} from "./types";

/** Response handling, as on Android: the app reads what the server sends and does not
 *  second-guess it with a separate "unexpected response" screen (removed at the client's
 *  request, October 2026).
 *
 *  Only checks that protect the user remain, and they fail as an ordinary error:
 *  - a sign-in must carry both tokens;
 *  - the signed-in user must have an id and a known role, which decide every screen
 *    and server path the app uses;
 *  - a profile must carry its user, or there is nothing to show.
 *  Everything else is normalised instead of rejected: a list field that is missing or
 *  not a list becomes empty, so a screen can always render. Nothing here logs values,
 *  so nothing personal reaches the console. */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objects = (v: unknown): Json[] => list(v).filter(isObject);
const numbers = (v: unknown): number[] => list(v).filter((x): x is number => typeof x === "number" && Number.isFinite(x));

function malformed(endpoint: string): never {
  if (import.meta.env?.DEV) console.warn(`Unusable response from ${endpoint}`);
  throw new ApiError("decoding", "");
}

/** Lists of ids on a full profile; absent or malformed ones read as "none selected". */
const ID_LISTS = [
  "carecondition_ids", "careday_ids", "carespecial_ids", "certification_ids", "clienttype_ids",
  "commute_ids", "experience_ids", "gender_ids", "languageskill_ids", "role_ids", "shift_ids", "worktype_ids",
] as const;

function profile<T>(v: unknown, endpoint: string): T {
  if (!isObject(v) || !isObject(v.user)) malformed(endpoint);
  const out: Json = { ...v };
  for (const key of ID_LISTS) out[key] = numbers(out[key]);
  return out as T;
}

export const asSession = (v: unknown): Session => {
  if (!isObject(v) || typeof v.access_token !== "string" || typeof v.refresh_token !== "string") malformed("auth/login");
  return v as unknown as Session;
};

export const asUser = (v: unknown): User => {
  if (!isObject(v) || typeof v.id !== "string" || (v.role !== "client" && v.role !== "caregiver")) malformed("auth/info");
  return v as unknown as User;
};

export const asMatch = (v: unknown, endpoint: string): Match => {
  if (!isObject(v)) malformed(endpoint);
  return v as unknown as Match;
};
export const asMatches = (v: unknown): Match[] => objects(v) as unknown as Match[];
export const asCaregiverBriefs = (v: unknown): CaregiverBrief[] => objects(v).filter((c) => isObject(c.user)) as unknown as CaregiverBrief[];
export const asClientBriefs = (v: unknown): ClientBrief[] => objects(v).filter((c) => isObject(c.user)) as unknown as ClientBrief[];
export const asCaregiverFull = (v: unknown, endpoint: string) => profile<CaregiverFull>(v, endpoint);
export const asClientFull = (v: unknown, endpoint: string) => profile<ClientFull>(v, endpoint);
export const asBaseItems = (v: unknown): BaseItem[] =>
  objects(v).filter((x) => typeof x.id === "number").map((x) => ({ ...x, translations: objects(x.translations) })) as unknown as BaseItem[];
export const asLanguages = (v: unknown): Language[] =>
  objects(v).filter((x) => typeof x.id === "number" && typeof x.code === "string") as unknown as Language[];
