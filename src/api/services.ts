import { api, type FormValue } from "./client";
import { DEFAULT_PAGE_SIZE } from "./config";
import { loginDeviceFields, tokenStore } from "./session";
import { asBaseItems, asCaregiverBriefs, asCaregiverFull, asClientBriefs, asClientFull, asLanguages, asMatch, asMatches, asSession, asStates, asUser } from "./schema";
import type { AppNotification, BaseInfo, FaqCategory, CaregiverFull, ChatBrief, ChatFull, ClientFull, Faq, Issue, Match, MatchListType, MatchSort, Session, User, UserRole } from "./types";

/* ------------------------------------------------------------------ auth/ */

export const authService = {
  async login(email: string, password: string): Promise<Session> {
    const session = asSession(await api.send<unknown>({
      method: "POST",
      path: "auth/login",
      auth: false,
      form: { email, password, ...loginDeviceFields() },
    }));
    tokenStore.save(session);
    return session;
  },

  register(countryId: number, role: UserRole, email: string, password: string) {
    return api.send<User>({
      method: "POST",
      path: "auth/register",
      auth: false,
      form: { country_id: countryId, role, email, password },
    });
  },

  currentUser() {
    return api.send<unknown>({ method: "GET", path: "auth/info" }).then(asUser);
  },

  /** Clears the local session even if the call fails, so a dead token never traps
   *  the user in a signed-in shell. */
  async logout() {
    try {
      await api.sendIgnoringResult({ method: "DELETE", path: "auth/logout" });
    } finally {
      tokenStore.clear();
    }
  },
};

/* ------------------------------------------------------------------ base/ */

export const BASE_TABLES = [
  "careconditions", "caredays", "carespecials", "certifications", "clienttypes",
  "commutes", "contents", "countries", "experiences", "genders", "issuetypes",
  "languageskills", "reasons", "roles", "shifts", "subjects", "worktypes",
] as const;

export type BaseTable = (typeof BASE_TABLES)[number];

/** The OpenAPI spec marks most of this group as requiring a bearer token, but the
 *  deployed backend serves every `base/` table unauthenticated (verified against all
 *  23 endpoints). They are therefore requested without auth so the form pickers can
 *  be populated during onboarding, before a session exists. */
export const baseService = {
  info() {
    return api.send<BaseInfo>({ method: "GET", path: "base/info", auth: false, query: { ts_cache: 0 } });
  },
  items(table: BaseTable, tsCache = 0) {
    return api.send<unknown>({
      method: "GET", path: `base/${table}`, auth: false, query: { ts_cache: tsCache },
    }).then((items) => asBaseItems(items, `base/${table}`));
  },
  languages(tsCache = 0) {
    return api.send<unknown>({
      method: "GET", path: "base/languages", auth: false, query: { ts_cache: tsCache },
    }).then(asLanguages);
  },
  /** The only public base endpoint the Android client actually uses. */
  states(tsCache = 0) {
    return api.send<unknown>({
      method: "GET", path: "base/states", auth: false, query: { ts_cache: tsCache },
    }).then(asStates);
  },
  faqs(tsCache = 0) {
    return api.send<Faq[]>({ method: "GET", path: "base/faqs", auth: false, query: { ts_cache: tsCache } });
  },
  faqCategories(tsCache = 0) {
    return api.send<FaqCategory[]>({
      method: "GET", path: "base/faq_categories", auth: false, query: { ts_cache: tsCache },
    });
  },
};

/* ----------------------------------------------------------------- users/ */

/** Start-of-day in UTC, as epoch seconds — matches
 *  `LocalDate.atStartOfDay(ZoneOffset.UTC).toEpochSecond()` in the Android client. */
export function epochDay(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 1000,
  );
}

export const userService = {
  sendOTP(email: string) {
    return api.sendIgnoringResult({
      method: "POST", path: "users/otp/send", auth: false, form: { email },
    });
  },
  verifyOTP(email: string, otp: string) {
    return api.sendIgnoringResult({
      method: "POST", path: "users/otp/verify", auth: false, form: { email, otp },
    });
  },

  /** Final step of Forgot Password (served by the backend since 2026-10-01; before
   *  that it answered 404). Callers surface the real error rather than a fake success. */
  resetPassword(email: string, otp: string, password: string) {
    return api.sendIgnoringResult({
      method: "POST", path: "users/password/reset", auth: false,
      form: { email, otp, password },
    });
  },
  /** Served by the backend since 2026-10-01 (404 before). See `resetPassword`. */
  changePassword(oldPassword: string, newPassword: string) {
    return api.sendIgnoringResult({
      method: "PATCH", path: "users/password/change",
      form: { old_password: oldPassword, new_password: newPassword },
    });
  },

  /** The only multipart endpoint in the product.
   *
   *  `date_of_birth` goes over the wire as **unix epoch seconds at UTC midnight**,
   *  not as a formatted date. (`users/verify` takes a *string* date for the same
   *  concept — the inconsistency is the backend's, and both are reproduced as-is.) */
  setProfile(input: {
    email: string; genderId: number | null; firstName: string; lastName: string;
    bio?: string | null; dateOfBirth?: Date | null; photo?: File | null;
    /** During signup there is no session yet: the backend attaches the profile to
     *  the account identified by `email`. Verified against the live API. */
    anonymous?: boolean;
  }) {
    const body = new FormData();
    body.append("email", input.email);
    if (input.genderId !== null) body.append("gender_id", String(input.genderId));
    body.append("first_name", input.firstName);
    body.append("last_name", input.lastName);
    if (input.bio) body.append("bio", input.bio);
    if (input.dateOfBirth) body.append("date_of_birth", String(epochDay(input.dateOfBirth)));
    if (input.photo) body.append("photo", input.photo, input.photo.name);
    return api.send<User>({
      method: "POST", path: "users/profile", multipart: body, auth: !input.anonymous,
    });
  },

  verifyIdentity(input: {
    firstName: string; middleName?: string | null; lastName: string;
    dateOfBirth: string; socialSecurityNumber: string; streetAddress: string;
    zipCode: string; stateId: number;
  }) {
    return api.send<User>({
      method: "POST", path: "users/verify",
      form: {
        first_name: input.firstName,
        middle_name: input.middleName ?? null,
        last_name: input.lastName,
        date_of_birth: input.dateOfBirth,
        social_security_number: input.socialSecurityNumber,
        street_address: input.streetAddress,
        zip_code: input.zipCode,
        state_id: input.stateId,
      },
    });
  },

  /** Android's delete call takes a non-optional reason id, so a reason is required
   *  (although its screen copy still says "Optional"). */
  async deleteAccount(reasonId: number) {
    await api.sendIgnoringResult({
      method: "DELETE", path: "users", query: { reason_id: reasonId },
    });
    tokenStore.clear();
  },

  /* matches */
  matches(type: MatchListType, page = 1, perPage = DEFAULT_PAGE_SIZE) {
    return api.sendPaged<unknown>({
      method: "GET", path: "users/matches", query: { type, page, perPage },
    }).then(({ result, meta }) => ({ result: asMatches(result, "users/matches"), meta }));
  },
  /** The viewer's active match and open request with one partner, if any. Profiles
   *  only report `is_match`, so a pending request (in either direction) is found in the
   *  viewer's own lists. 50 is the largest page size the backend accepts. */
  async relationWith(partnerId: string): Promise<{ active: Match | null; pending: Match | null }> {
    const withPartner = (m: Match) => m.client?.id === partnerId || m.caregiver?.id === partnerId;
    const [active, requests] = await Promise.all([
      userService.matches("matches", 1, 50), userService.matches("requests", 1, 50),
    ]);
    return { active: active.result.find(withPartner) ?? null, pending: requests.result.find(withPartner) ?? null };
  },
  match(id: number) {
    return api.send<unknown>({ method: "GET", path: `users/matches/${id}` }).then((m) => asMatch(m, "users/matches/{id}"));
  },
  requestMatch(partnerId: string) {
    return api.send<unknown>({
      method: "POST", path: "users/matches", form: { partner_id: partnerId },
    }).then((m) => asMatch(m, "users/matches (request)"));
  },
  acceptMatch(id: number) {
    return api.send<Match>({ method: "PATCH", path: `users/matches/${id}/accept` });
  },
  rejectMatch(id: number) {
    return api.sendIgnoringResult({ method: "DELETE", path: `users/matches/${id}/reject` });
  },
  withdrawMatch(id: number) {
    return api.sendIgnoringResult({ method: "DELETE", path: `users/matches/${id}/withdraw` });
  },
  breakMatch(id: number) {
    return api.send<Match>({ method: "DELETE", path: `users/matches/${id}` });
  },
  submitReview(matchId: number, score: number, comment?: string | null) {
    return api.send<Match>({
      method: "POST", path: `users/matches/${matchId}`,
      form: { score, comment: comment ?? null },
    });
  },

  /* chats */
  chats(page = 1, perPage = DEFAULT_PAGE_SIZE) {
    return api.sendPaged<ChatBrief[]>({
      method: "GET", path: "users/chats", query: { page, perPage },
    });
  },
  chat(id: number) {
    return api.send<ChatFull>({ method: "GET", path: `users/chats/${id}` });
  },
  createChat(partnerId: string) {
    return api.send<ChatFull>({
      method: "POST", path: "users/chats", form: { partner_id: partnerId },
    });
  },
  sendMessage(chatId: number, message: string, parentId?: number | null) {
    return api.send<ChatFull>({
      method: "POST", path: `users/chats/${chatId}`,
      form: { message, parent_id: parentId ?? null },
    });
  },

  /* bookmarks */
  bookmarks(page = 1, perPage = DEFAULT_PAGE_SIZE) {
    return api.sendPaged<User[]>({
      method: "GET", path: "users/bookmarks", query: { page, perPage },
    });
  },
  addBookmark(partnerId: string) {
    return api.sendIgnoringResult({
      method: "POST", path: "users/bookmarks", form: { partner_id: partnerId },
    });
  },
  removeBookmark(partnerId: string) {
    return api.sendIgnoringResult({
      method: "DELETE", path: `users/bookmarks/${partnerId}`,
    });
  },

  /* notifications */
  notifications(page = 1, perPage = DEFAULT_PAGE_SIZE) {
    return api.sendPaged<AppNotification[]>({
      method: "GET", path: "users/notifications", query: { page, perPage },
    });
  },
  notificationCount(checkedAt: number) {
    return api.send<number>({
      method: "GET", path: "users/notifications/count", query: { checked_at: checkedAt },
    });
  },
  markNotificationSeen(id: number) {
    return api.send<AppNotification>({
      method: "PATCH", path: `users/notifications/${id}/see`,
    });
  },

  /* issues */
  issues() {
    return api.send<Issue[]>({ method: "GET", path: "users/issues" });
  },
  /** A predefined issue type and a free-text title are mutually exclusive: the
   *  backend rejects both together ("issuetype id … prohibits title"). The form's
   *  "Other" choice sends a title; any other choice sends the type. */
  createIssue(input: { issuetypeId: number | null; title: string | null; description: string }) {
    return api.send<Issue>({
      method: "POST", path: "users/issues",
      form: input.issuetypeId !== null
        ? { issuetype_id: input.issuetypeId, description: input.description }
        : { title: input.title, description: input.description },
    });
  },
};

/* --------------------------------------------------------------- clients/ */

export interface ClientPreferences {
  clienttypeId: number;
  lat: number;
  lng: number;
  salaryMin: number | null;
  salaryMax: number | null;
  careconditionIds: number[];
  caredayIds: number[];
  carespecialIds: number[];
  certificationIds: number[];
  commuteIds: number[];
  experienceIds: number[];
  genderIds: number[];
  languageskillIds: number[];
  roleIds: number[];
  shiftIds: number[];
  worktypeIds: number[];
}

function clientSharedFields(p: ClientPreferences): Record<string, FormValue> {
  return {
    clienttype_id: p.clienttypeId,
    lat: p.lat,
    lng: p.lng,
    salary_min: p.salaryMin,
    salary_max: p.salaryMax,
    carecondition_ids: p.careconditionIds,
    careday_ids: p.caredayIds,
    carespecial_ids: p.carespecialIds,
    commute_ids: p.commuteIds,
    experience_ids: p.experienceIds,
    gender_ids: p.genderIds,
    languageskill_ids: p.languageskillIds,
    role_ids: p.roleIds,
    shift_ids: p.shiftIds,
    worktype_ids: p.worktypeIds,
  };
}

export const clientService = {
  profile() {
    return api.send<unknown>({ method: "GET", path: "clients/profile" }).then((p) => asClientFull(p, "clients/profile"));
  },

  /** Final signup step, before any session exists: keyed by `user_id`. The account
   *  only becomes able to sign in once this entity exists (verified live). */
  create(userId: string, p: ClientPreferences) {
    return api.send<ClientFull>({
      method: "POST", path: "clients", auth: false,
      // Create uses snake_case here.
      form: { ...clientSharedFields(p), user_id: userId, certification_ids: p.certificationIds },
    });
  },

  /** The backend expects **`certificationIds`** in camelCase on this endpoint while
   *  `create` expects `certification_ids` — an asymmetry carried over from the
   *  Android client, where sending only snake_case silently drops the field.
   *
   *  Both spellings are sent. Today the camelCase one is read and the other ignored;
   *  if the backend ever corrects the typo this keeps working instead of breaking
   *  silently. Flagged to Carezaar either way. */
  updateProfile(p: ClientPreferences) {
    return api.send<ClientFull>({
      method: "PUT", path: "clients/profile",
      form: {
        ...clientSharedFields(p),
        certificationIds: p.certificationIds,
        certification_ids: p.certificationIds,
      },
    });
  },

  matches(sort: MatchSort = "distance", page = 1, perPage = DEFAULT_PAGE_SIZE) {
    return api.sendPaged<unknown>({
      method: "GET", path: "clients/matches", query: { sort, page, perPage },
    }).then(({ result, meta }) => ({ result: asCaregiverBriefs(result), meta }));
  },

  caregiver(id: string) {
    return api.send<unknown>({ method: "GET", path: `clients/caregivers/${id}` }).then((p) => asCaregiverFull(p, "clients/caregivers/{id}"));
  },
};

/* ------------------------------------------------------------ caregivers/ */

export interface CaregiverSkills {
  commuteId: number;
  experienceId: number;
  roleId: number;
  worktypeId: number;
  lat: number;
  lng: number;
  salaryMin: number;
  salaryMax: number;
  careconditionIds: number[];
  caredayIds: number[];
  carespecialIds: number[];
  certificationIds: number[];
  clienttypeIds: number[];
  languageskillIds: number[];
  shiftIds: number[];
}

function caregiverSharedFields(s: CaregiverSkills): Record<string, FormValue> {
  return {
    commute_id: s.commuteId,
    experience_id: s.experienceId,
    role_id: s.roleId,
    worktype_id: s.worktypeId,
    lat: s.lat,
    lng: s.lng,
    salary_min: s.salaryMin,
    salary_max: s.salaryMax,
    carecondition_ids: s.careconditionIds,
    careday_ids: s.caredayIds,
    carespecial_ids: s.carespecialIds,
    certification_ids: s.certificationIds,
    clienttype_ids: s.clienttypeIds,
    languageskill_ids: s.languageskillIds,
    shift_ids: s.shiftIds,
  };
}

export const caregiverService = {
  profile() {
    return api.send<unknown>({ method: "GET", path: "caregivers/profile" }).then((p) => asCaregiverFull(p, "caregivers/profile"));
  },
  /** Final signup step, before any session exists: keyed by `user_id`. */
  create(userId: string, s: CaregiverSkills) {
    return api.send<CaregiverFull>({
      method: "POST", path: "caregivers", auth: false,
      form: { ...caregiverSharedFields(s), user_id: userId },
    });
  },
  /** Unlike the client service, both create and update use `certification_ids`. */
  updateProfile(s: CaregiverSkills) {
    return api.send<CaregiverFull>({
      method: "PUT", path: "caregivers/profile", form: caregiverSharedFields(s),
    });
  },
  matches(sort: MatchSort = "distance", page = 1, perPage = DEFAULT_PAGE_SIZE) {
    return api.sendPaged<unknown>({
      method: "GET", path: "caregivers/matches", query: { sort, page, perPage },
    }).then(({ result, meta }) => ({ result: asClientBriefs(result), meta }));
  },
  client(id: string) {
    return api.send<unknown>({ method: "GET", path: `caregivers/clients/${id}` }).then((p) => asClientFull(p, "caregivers/clients/{id}"));
  },
};
