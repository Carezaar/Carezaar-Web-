# Carezaar web: final delivery report (Android-parity round, 10 October 2026)

This is the final report the specification asks for in section 25. Per-requirement detail and evidence are in `WEB_CLIENT_SPEC_IMPLEMENTATION_REPORT.md`; the web/Android differences are in `docs/WEB-VS-ANDROID.md`.

## A. Summary

All requested changes are implemented in the web app:

| Area | What changed |
|---|---|
| Startup and data | Mandatory notification permission. Every reference list loaded and cached before the app opens. Matches load only after the sign-in check. |
| Forms and sign-in | Sign In without email-format checking. The exact password symbol set. One-screen password reset. A strict pay range. Only `certification_ids` sent. |
| Matches list | Pull-to-refresh, the matched icon, the favourite heart, and the rotating banner. |
| Profile | The client's three preference sections. Message only for an active match. The introduction inside the Accept and Reject confirmations. Reject before Accept, the managed Cancel label, and action-named buttons. A crossing request opens "It's a Match!". "This match has changed" and "Couldn't check this match". The two-second return when a profile won't load. |
| "It's a Match!" | Decided from the profile alone. Origin-aware View Profile. Two photo cards. |
| Matches & Requests | Pending Acceptance. A full-introduction window and a first-line preview. No reviews. |
| Chat | One message at a time, server times, accurate unread markers, and scrolling only when at the bottom. |
| Notifications | A details window with Show. Match-ended notifications open the profile. Polling on the 30-second timer only. No "no longer available" message. |
| Settings | Managed FAQ "All". Staying signed in after a password change. |
| Server communication | Renew and retry once on any refusal, sending only `version_app`. A 2-minute timeout and 3 connection retries for repeat-safe requests. Paging until an empty page. General error wording. No "unexpected response" screen. |

Two defects found by testing were fixed: GIF photos were accepted, and a password change could race and sign the user out. The four accepted differences are unchanged.

What remains is outside the web app (see I).

## B. Requirement checklist

Every requirement in sections 4–17 passed. So did the four accepted differences (section 18) and every earlier client requirement (section 19). Each has its own row, with files, changes and evidence, in `WEB_CLIENT_SPEC_IMPLEMENTATION_REPORT.md`.

## C. QA results

| Check | Passed | Failed | Blocked | N/A |
|---|---|---|---|---|
| Final browser run: one uninterrupted pass of every suite on the production build, with fresh accounts | 146 | 0 | 0 | 0 |
| Unit tests (`npm test`) | 14 | 0 | 0 | 0 |
| Lint, type check, production build | pass | | | |
| Legacy local suites, run from a copy with the new accounts | | | | |
| 07 session navigation | 17 | 0 | 0 | 1 (chat data of deleted accounts) |
| 09 double submit | 3 | 0 | 0 | 1 (needs a third card; covered by 9.3) |
| Live review site smoke test | 5 | 0 | 0 | 0 |

Test documents used:
- `PRODUCTION_TEST_PLAN.md` (phases mapped in the implementation report);
- its execution brief.

Limitations:
- headless browsers, with real touch events for pull-to-refresh;
- a simulated camera device;
- the backend's code limit sets how often a reset code can be re-sent.

## D. Manual browser evidence

| | |
|---|---|
| Browsers | Google Chrome, WebKit and Firefox |
| Viewports | 360×740, 390×844 touch, 412×915, 768×1024 and 1280×800 |
| Languages | English, French and Arabic (right to left) |
| Roles | client and caregiver in separate browser contexts, with real cross-role actions in both directions (requests, accept, crossing request, cancel, reject, unmatch, chat both ways) |
| Flows | first launch and permission; sign-in; password reset with a real emailed code; preferences; Matches list; profiles in every relationship state; "It's a Match!"; Matches & Requests; chat; notifications; FAQ; password change; session renewal; offline and slow network |

Screenshots: `test-evidence/web-20261010/`, kept outside the repository.

## E. API verification

All observed on the live API:
- **Certifications:** client preferences send `certification_ids` only (`certificationIds` removed). The server stores and returns the chosen ids.
- **Session renewal:** `PUT auth/refresh` with the body `version_app=1.0.0` returns 200. An empty body is refused with 422.
- **Refusals:** any 401/403 triggers one renewal and one retry; a second refusal is final.
- **Password change:** the server refuses every old token with 401 afterwards, so the web signs in again with the new password.
- **Match lifecycle:** requests, accept, reject, cancel and unmatch go straight to `users/matches…` with the profile's `match_id`. A crossing request returns both sides accepted (`is_active` true). A changed relationship returns 422, shown as "This match has changed".
- **Pagination:** pages are requested past `meta.last_page` until an empty page comes back; repeated items are dropped.
- **Reset codes:** a wrong code returns 400 "The OTP code is invalid!". The resend limit returns 400 "Please try again after N second(s)!".
- **Password symbols:** the server accepts all 25 allowed symbols and rejects `~`, `=`, `/` and `é` as the only special character.

## F. Code quality and security

Reviewed for:
- duplicate calls;
- races (one found and fixed);
- stale closures;
- unbounded retries (none);
- duplicate submissions (locked);
- timer and listener leaks (all cleaned up);
- effect dependencies;
- unsafe HTML (only the existing sanitised FAQ HTML);
- secrets (none in the repository);
- logging (development-only; no values or credentials);
- managed-text usage (server keys used; the web's own copy only for new keys);
- dead code (unused review code removed);
- match-state inference (explicit `match_status` only);
- routes;
- loading and error states.

No remaining concerns in the web code.

## G. GitHub

| | |
|---|---|
| Repository | https://github.com/Carezaar/Carezaar-Web- |
| Branch | `main` |
| Commits | `4cf82c5` (implementation), `16d8a45` (report), `516675a` (translations and final run), `34f5dee` (deployment record), then this report |
| Identity | Authored and pushed as `apexstackdev-del` (`333104692+apexstackdev-del@users.noreply.github.com`), confirmed through the GitHub API |
| Push | Fast-forwards only: no force push; no remote work overwritten |
| CI | The repository has no CI workflows |

## H. Deployment

The private review site https://carezaar-web.vercel.app was updated:
- built from a clean copy with no Git metadata, using the `nooneexist414` CLI profile (project `carezaar-web`);
- the served app and stylesheet are byte-identical to the build (`index-Cs_YEU48.js`, `index-BAl37tor.css`);
- signed-out requests get 401, and the noindex, CSP and Permissions-Policy headers are present;
- the authenticated smoke test passed.

No deployment requirement is outstanding.

## I. Outstanding issues

| Type | Item |
|---|---|
| Web defects | None known. |
| Backend limitation | The server allows a new reset code only after a wait that is longer than the app's 2-minute timer and grows with each request. The web shows the server's "try again after N seconds" message. Aligning the limit with the timer would avoid it. |
| Content table (server) | `settings_change_password_dialog_message` says the user is signed out of all devices "including this one". This is accurate: the server ends every session, and the web then signs the user back in. It could be reworded. The web's new keys (permission screen, general errors) carry their own eight-language text until the client adds them to the table. |
| Environment constraint | Browsers without notifications (Safari on iPhone outside a Home Screen app) can't grant permission, so they are let in rather than blocked. Automated browser tests must grant the `notifications` permission. |
| Client acceptance | Pending the client team's review of the deployed site. |
