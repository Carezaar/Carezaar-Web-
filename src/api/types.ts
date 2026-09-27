/** Wire types, mirroring the Kotlin `retrofit/models` package exactly.
 *  JSON keys are snake_case; these interfaces keep the wire names so there is no
 *  mapping layer to drift out of sync. */

export type UserRole = "client" | "caregiver";
/** The wire sends these lowercase (`"unverified"`); the Kotlin enum constants are
 *  uppercase. Compare with `isVerified()` rather than a literal. */
export type UserStatus = string;

export interface User {
  id: string;
  country_id: number;
  gender_id: number | null;
  role: UserRole;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo: string | null;
  bio: string | null;
  date_of_birth: string | null;
  status: UserStatus;
  is_favorite: boolean;
}

/** The reviewer shape — `UserBrief` plus `rating`. */
export interface UserTiny extends User {
  rating: number;
}

export interface Session {
  access_token: string;
  refresh_token: string;
}

export interface CaregiverBrief {
  id: string;
  user: User;
  salary_min: number;
  salary_max: number;
  distance: number;
  is_match: boolean;
}

export interface CaregiverFull extends CaregiverBrief {
  commute_id: number;
  experience_id: number;
  role_id: number;
  worktype_id: number;
  lat: number;
  lng: number;
  carecondition_ids: number[];
  careday_ids: number[];
  carespecial_ids: number[];
  certification_ids: number[];
  clienttype_ids: number[];
  languageskill_ids: number[];
  shift_ids: number[];
}

export interface ClientBrief {
  id: string;
  user: User;
  clienttype_id: number;
  lat: number;
  lng: number;
  salary_min: number | null;
  salary_max: number | null;
  distance: number;
  is_match: boolean;
}

export interface ClientFull extends ClientBrief {
  carecondition_ids: number[];
  careday_ids: number[];
  carespecial_ids: number[];
  certification_ids: number[];
  commute_ids: number[];
  experience_ids: number[];
  gender_ids: number[];
  languageskill_ids: number[];
  role_ids: number[];
  shift_ids: number[];
  worktype_ids: number[];
}

export interface Review {
  id: number;
  reviewer: UserTiny | null;
  score: number;
  comment: string | null;
  created_at: string | null;
}

export interface Match {
  id: number;
  client: ClientBrief | null;
  caregiver: CaregiverBrief | null;
  review_client: Review | null;
  review_caregiver: Review | null;
  created_at: string | null;
  finished_at: string | null;
  is_client_accepted: boolean;
  is_caregiver_accepted: boolean;
  is_active: boolean;
}

export type MatchListType = "matches" | "requests" | "histories";
/** Required by `clients|caregivers/matches`; the backend accepts only these. */
export type MatchSort = "distance" | "pay";
export type MatchStage = "active" | "pending" | "history";

export interface ChatMessage {
  id: number;
  parent: ChatMessage | null;
  message: string;
  created_at: string | null;
  updated_at: string | null;
  seen_at: string | null;
  is_from_caregiver: boolean;
}

export interface ChatBrief {
  id: number;
  client: ClientBrief | null;
  caregiver: CaregiverBrief | null;
  updated_at: string | null;
  new_message_count: number;
  last_message: string | null;
  is_seen: boolean;
}

export interface ChatFull {
  id: number;
  client: ClientBrief | null;
  caregiver: CaregiverBrief | null;
  updated_at: string | null;
  messages: ChatMessage[];
}

export interface AppNotification {
  id: number;
  user: User | null;
  partner: User | null;
  chat: ChatBrief | null;
  subject_id: number;
  created_at: string | null;
  seen_at: string | null;
}

export interface Issue {
  id: number;
  issuetype_id: number | null;
  title: string | null;
  description: string | null;
  reply: string | null;
  created_at: string | null;
  replied_at: string | null;
  is_replied: boolean;
}

export interface Translation {
  id: number;
  language_id: number;
  name: string;
}

/** Shape shared by every translated lookup table. */
export interface BaseItem {
  id: number;
  code: string | null;
  /** Android drawable name, e.g. `ic_condition_bathing`; shipped in /app-assets. */
  icon: string | null;
  /** `base/contents` rows are keyed by slug instead of code. */
  slug?: string | null;
  translations: Translation[];
}

export interface Language {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  is_default: boolean;
  is_rtl: boolean;
}


export interface USState {
  id: number;
  country_id: number;
  slug: string | null;
  translations: Translation[];
}

export interface FaqTranslation {
  id: number;
  language_id: number;
  question: string | null;
  answer: string | null;
}

export interface Faq {
  id: number;
  faq_category_id: number | null;
  slug?: string;
  /** `answer` is HTML. */
  translations: FaqTranslation[];
}

/** `GET base/info` — per-table cache stamps that drive refetching. */
export interface BaseInfo {
  ts_cache: number;
  total: number;
  [table: string]: number;
}

export interface ApiMeta {
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

export interface ApiEnvelope<T> {
  result: T | null;
  meta: ApiMeta | null;
  message: string | null;
  errors: Record<string, string[]> | null;
}

export interface FaqCategory {
  id: number;
  slug: string;
  /** Category translations use `title`, unlike the other lookup tables' `name`. */
  translations: { id: number; language_id: number; title: string }[];
}
