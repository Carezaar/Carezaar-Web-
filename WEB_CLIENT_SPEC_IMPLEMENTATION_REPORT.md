# Carezaar web: Android-parity specification, October 2026

This covers the client's specification of 9 October 2026 (the Android developer's list of web changes), the follow-up message on session handling and networking, and the four accepted differences. The Android app is the reference for behaviour. The server's managed texts provide every label they already contain.

**Result:** every requirement is implemented and passed in a real browser against the live API. Notes for the client about content and the backend are at the end; none of them blocks a web requirement.

**Final evidence:** one uninterrupted run of every suite against the production build, with fresh accounts: 146 browser checks passed, 0 failed, 0 blocked. Plus 14 unit tests, lint, type check and build. Each suite creates the data it needs (matches, notifications, chats) before checking it.

## How it was tested

| | |
|---|---|
| App builds | Vite dev server (development) and `vite preview` of the production build. Request counts were checked on the production build, because development mode runs every effect twice. |
| Backend | Live API `https://new.carezaar.com/api/` |
| Browsers | Google Chrome (main runs), WebKit and Firefox (Playwright 1.63 engines) |
| Viewports | 360×740, 390×844 (touch), 412×915, 768×1024, 1280×800 |
| Languages | English, French, Arabic (right to left) |
| Accounts | Three disposable accounts made through the real sign-up API (client, caregiver, and a client for the password-reset test), deleted afterwards. No real personal data was used. |
| Network | Request bodies and statuses recorded for every check. Failures were simulated by intercepting single requests: a dropped connection, 403, 500, a malformed response, a delayed response, an empty page. |
| QA documents | `PRODUCTION_TEST_PLAN.md` and its execution brief. The plan's phases are mapped below; `TEST_EXECUTION_REPORT.md` has the run log. |
| Automated checks | `npm run lint`, `tsc -b`, `npm test` (14 unit tests, 5 of them new for this round), `npm run build` |

Evidence: screenshots in `../test-evidence/web-20261010/` (kept outside the repository).

## Requirement checklist

Each result comes from browser checks in the final run unless noted.

### Startup

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 4.1 | Notification permission is required; asked on the first click; a refusal blocks the app | `src/app/NotificationGate.tsx`, `App.tsx` | New gate around the whole app. It asks once on the first click (a browser only allows the prompt after a user action), and that click still works. A refusal or a dismissed prompt covers the app with an explanation and either Allow notifications or how to change it in the site settings. Allowing later lets the user continue without a reload. Browsers with no notifications at all are not blocked. | PASS: no prompt before a click; refusal blocks, and the app behind is inert; a returning visit while refused is blocked; allowing in settings then Continue opens the app; granted means no gate; unsupported browser is not blocked; a dismissed prompt is not shown again automatically |
| 4.2 | Every reference list loads before the user can continue, including US states, media and FAQs | `src/app/baseDataLoader.ts`, `baseData.tsx`, `services.ts` | States, media, FAQs and FAQ categories added. The app opens only when every list is current. `base/cities` needs a state and language (422 without them), so it isn't a start-up list. | PASS: 22 lists plus `base/info`, all finished before the app opened |
| 4.3 | Lists stored in the browser; downloaded again only when the server says they changed | same | Cache v3 keyed on the server's `ts_cache` from `base/info`. Concurrent loads share one request. Storage failures fall back to memory. | PASS: unchanged marker requests only `base/info`; changed marker downloads every list; offline with a stored copy opens; offline on first visit shows Try Again, which recovers; an empty list is accepted; no duplicate requests |
| 4.4 | Matches load only after the sign-in check | `SessionContext.tsx`; `matchesPrefetch.ts` removed | The early page-1 request that ran alongside `auth/info` is removed. | PASS on the production build: one page-1 request, started after `auth/info` answered; an invalid stored session goes to Intro without requesting matches |

### Signing in, sign-up and password reset

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 5 | Sign In: no email-format check; button enabled once both fields are filled | `screens/auth.tsx` | Format check removed from Sign In only (Create Account and Forgot Password keep theirs). | PASS: disabled when empty; enabled with a malformed email; the server's answer is shown (422 "The email field must be a valid email address.", 400 "Invalid Credentials!"); the password stays hidden; correct details sign in |
| 6 | Password special characters exactly `!@#$%^&*()_+[]{}\|-;:,.<>?` | `validation/validation.ts`, `tests/password.test.mjs` | Matched character by character against that list, with no regex class. | PASS: unit tests for all 25 symbols, 17 symbols outside the list, regex metacharacters, and the length and multi-rule cases. Server check: the server accepted a password change with each of the 25 symbols and rejected `~ = / é` |
| 7 | Forgot Password on one screen: code, new password, confirmation, re-send timer; a wrong code stays on the screen | `screens/auth.tsx` | The recovery code step merged into Set Up Password. The code-only step is used for sign-up only. | PASS: one screen after confirming the email, with no `otp/verify` call; weak or mismatched password blocked; a wrong code keeps the user there with "The OTP code is invalid!" and the passwords kept; a lost connection gives the general message with input kept; reload stays on the screen; a real emailed code resets the password (new one works, old one refused); the timer counts down; a failed re-send says so; a re-send blocked by the server's limit shows its message; after waiting out that limit, Re-send sends a new code and the timer restarts |

### Care preferences, Matches list and profiles

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 8.1 | Minimum pay strictly below maximum, with the app's wording | `screens/wizard.tsx` | `>=` is refused, with managed text `general_salary_min_max`, in both roles. | PASS: equal and higher refused with "The minimum pay rate must be lower than the maximum."; values kept; lower and 0 < 1 accepted; caregiver empty pay required |
| 8.2 | Client preferences send only `certification_ids` | `api/services.ts` | `certificationIds` removed. Verified first that the server stores `certification_ids` on update. | PASS: the PUT body has `certification_ids` and no `certificationIds` (200); the saved values were read back |
| 9.1 | Pull-to-refresh on the Matches list | `ui/usePullToRefresh.ts`, `main.tsx`, `usePaged.ts` | Touch pull at the top of the page with an indicator. The browser's own pull-to-reload is off on that screen. A failed refresh keeps the cards. | PASS with real touch events: page 1 requested; a second pull during a refresh starts nothing; a short drag does nothing; failure keeps cards and shows the message; not at the top does nothing |
| 9.2 | Matched icon only for an active match | `main.tsx` | Uses the card's `is_match`. | PASS: shown on the active match's card only, not for pending or ended |
| 9.3 | Favourite heart on match cards | `main.tsx` | Heart button on each card using the bookmarks API. One request at a time per person; the heart reverts if the request fails. | PASS: add and remove in both roles; one request for a double tap; persists after a reload; failure reverts with the general message; keyboard toggles it without opening the card |
| 9.4 | Banner rotates through all of a caregiver's client types | `main.tsx` | Rotates every 5 s through the saved `clienttype_ids`. | PASS: three types rotate (pregnancy, senior, adult); a single type stays |
| 10.1 | Client profile shows Gender Preferences, Minimum Experience, Preferred Caregiver Role | `screens/partner.tsx` | Three sections from `gender_ids`, `experience_ids`, `role_ids`, with managed titles. Empty lists are left out. | PASS: shows Male / Less than 1 year / CNA, matching the saved profile |
| 10.2 | Message button only for an active match | `partner.tsx` | Rendered only when `match_status` is `active`. The send path still checks `is_match`. | PASS for none, sent, received and active |
| 10.3 | Introduction inside the Accept/Reject confirmations, not at the top of the profile | `partner.tsx` | Top block removed for sent and received. The dialogs show the photo, the full name and the full introduction. | PASS |
| 10.4 | Reject first, then Accept; managed "Cancel" for an outgoing request | `partner.tsx` | Order swapped; `match_withdraw_title` used, and the web-only "Withdraw" translations removed (`i18n.tsx`). | PASS |
| 10.5 | Confirmation buttons named after the action | `partner.tsx` | Match, Cancel, Accept, Reject, Unmatch. The Cancel-request dialog closes with ✕, because both its buttons would otherwise read "Cancel". | PASS |
| 10.6 | A request that becomes a match at once opens It's a Match | `usePartnerMatch.ts` | Uses the server's answer (both sides accepted). | PASS: a crossing request opened It's a Match |
| 10.7 | "This match has changed"; "Couldn't check this match" with Try Again | `usePartnerMatch.ts`, `partner.tsx` | The action goes straight to the server, without the pre-check. A refusal reloads the profile and shows the server's text if the state moved. If no answer and no check are possible, the dialog's Try Again repeats only the check, never the action. | PASS: partner withdrew before Accept, giving "This match has changed"; with no connection, the dialog appeared after one POST and Try Again re-checked without a second POST |
| 10.8 | Profile can't load: short message, back after about 2 s | `partner.tsx`, `matched.tsx` | The error page with Try Again is replaced by a message and a timed return; the timer is cancelled when the user leaves earlier. | PASS: returned in 2.03 s; leaving earlier causes no late navigation |

### It's a Match

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 11.1 | Not active, so open the profile | `screens/matched.tsx` | Redirects (replacing the screen) instead of "This match is no longer active". | PASS |
| 11.2 | View Profile returns to the profile it came from | `matched.tsx`, `usePartnerMatch.ts`, `account.tsx` | Origin passed as navigation state (`profile` or `notification`). | PASS: from a profile, it goes back with no extra history entry; from a notification, it replaces the screen with the profile |
| 11.3 | Two photo cards ("You" and the full name, with roles) and a heart; full name in the message | `matched.tsx`, `styles/app.css` | New layout. Long names clamp to two lines; a missing photo shows the brand mark. | PASS |
| 11.4 | No separate server check | `matched.tsx` | `users/matches/{id}` no longer fetched; decided from the profile's `match_status`. The chat button no longer re-reads the profile. | PASS |

### Matches and Requests

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 12.1 | "Pending Acceptance" | `screens/matchesManage.tsx`, `partner.tsx` | `match_pending_acceptance` | PASS |
| 12.2 | The introduction preview opens a window with photo, name and full text | `matchesManage.tsx` | New dialog; the user stays on the list. | PASS |
| 12.3 | The preview is the introduction's first line | `ui/requestPreview.ts`, tests | First non-empty line, spacing kept; truncated visually by CSS. | PASS: unit tests cover multi-line, empty, CRLF, long, symbols, CJK, emoji and Arabic; browser check passed |
| 12.4 | No reviews on finished matches | `matchesManage.tsx`; `api/match.ts`, `services.ts` | Stars, comments, the Review button and the review dialog removed, along with the unused review helper and service call. Server data untouched. | PASS: 5 finished matches, 0 review controls |

### Messages and notifications

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 13.1 | One message at a time; no "Sending" queue | `screens/chat.tsx` | The send control locks and the text stays (read-only) until the server confirms. Failure keeps the text. No automatic resend. | PASS: rapid Enter and click sent one request; no Sending bubble; messages arrive in order; a failed send keeps the text, with 1 attempt |
| 13.2 | Message times as stored on the server | `chat.tsx`, `main.tsx` | No local-time conversion for messages or the conversation list. | PASS: e.g. "11:19 10/10" shown as sent by the server |
| 13.3 | Unread marker only for new messages | `main.tsx` | `new_message_count > 0` only, never `is_seen`. | PASS: new messages show the dot; it goes after opening; an unopened chat without new messages has none |
| 13.4 | Follow new messages only at the bottom | `chat.tsx` | Bottom detection on the page or pane scroll. | PASS: at the bottom it follows; reading older messages keeps the position exactly |
| 14.1 | Notification opens a details window; Show navigates | `screens/account.tsx` | New dialog: subject, person, date, Cancel and Show. Escape closes it. | PASS |
| 14.2 | "Match ended" opens the partner's profile | `account.tsx` | The `unmatch` subject goes to the partner's profile. | PASS (caregiver side) |
| 14.3 | Check on the 30-second timer only | `app/notifications.tsx` | Window-focus check removed. Signing out stops the timer. | PASS: 30 s apart, with focus and visibility events firing in between; no requests after logout |
| 14.4 | No "This notification is no longer available" | `account.tsx` | Without the related person or chat, the details show no Show button. | PASS |

### Help, account and server communication

| # | Requirement | Where | What changed | Result |
|---|---|---|---|---|
| 15 | FAQ "All" from managed text | `account.tsx` | `general_all`. FAQs now come from the start-up cache. | PASS: French shows "Tout", the server's text; the filters still work |
| 16 | Stay signed in after changing the password | `account.tsx`, `api/client.ts` | The server ends every session when the password changes (verified: old tokens get 401). The web signs in again with the new password straight away, inside `replaceSession`, so requests refused in that gap wait for the new session instead of signing the user out. If signing in again fails, the user is signed out cleanly. | PASS (production build): stays on the page with a working new token, also after a reload; a wrong current password is refused and the user stays signed in |
| 17.1 | Any refusal: renew the sign-in and retry once | `api/client.ts` | Every 401/403, with or without a reason, triggers a single-flight renewal and one retry. A second refusal is final. Retrying is safe because a refused request was not carried out. | PASS (production build): bad token gives `auth/info` 403, a renewal, then 200; a 403 with a reason is renewed and retried, then succeeds; refused twice ends with no loop, the user still signed in, and the general wording |
| 17.2 | Renewal sends only the app version | `api/client.ts` | Body is `version_app=1.0.0` (the server rejects an empty one with 422). | PASS: request body recorded |
| 17.3 | Up to 2 min per response; up to 3 retries on a dropped connection | `api/client.ts` | Timeout 120 s. A dropped connection is retried at 1 s, 2 s and 4 s, but only for repeat-safe requests (GET, PUT, PATCH, DELETE, and POSTs marked `idempotent`: sign-in, profile save, open chat, add favourite). Not retried: a timeout, any HTTP answer, sending a message or match request, reporting an issue. | PASS (production build): 2 drops then success in 3 attempts; always dropped gives 4 attempts, then "Cannot communicate with server." |
| 17.4 | Keep loading until an empty page | `app/usePaged.ts`, `tests/paged.test.mjs` | Ignores `last_page`; drops items already shown; a page with nothing new ends the list; a failed page keeps what's loaded. | PASS: 72 clients over pages 1–8, ending at empty page 9; with a scripted server, a page past the reported last page, a dropped page (retried), and a repeated page all behave correctly; unit tests pass |
| 17.5 | General wording for common errors | `app/feedback.tsx` | Connection, timeout, refusal, not-found, server and malformed-response errors use app wording. Only 400/422 rejections of what the user typed show the server's message (unless it is technical). | PASS: a 500 with an SQL message shows "Something went wrong. Please try again."; no internal details appear |
| 17.6 | Remove the "unexpected response" Try Again screen | `api/schema.ts` | Strict schema rejection replaced by normalisation. Kept as safety checks: both tokens on sign-in; the user's id and a known role (they decide routing and access); a profile must contain its user. | PASS: a profile with missing, null and unknown fields still renders |

### Accepted differences (unchanged)

| Difference | Result |
|---|---|
| Sign-up progress in this browser session only | PASS: kept through a reload; gone in a new visit; never in localStorage |
| JPEG, PNG, WebP up to 10 MB; not GIF | PASS after a fix. GIF had been allowed since the previous round (commit 927b220); it is now removed from the picker, the check and the message. GIF and a file over 10 MB are refused. |
| Location picked on the map before continuing | PASS: the sign-up wizard stops at its schedule step with "Tap to select location from map or your current location" |
| Current photo read through the site's own address | PASS: saving the profile fetched `/uploads/user/…webp` from the app's own origin; the save returned 200 |

### Earlier client requirements (regression)

| Requirement | Result |
|---|---|
| No US-only statement; no Country at Create Account | PASS |
| No Background Check or "Unverified" text (Profile, Matches, a profile, Help, Matches & Requests) | PASS |
| Request a Match: Android wording, optional Introduction, Cancel and Match | PASS |
| Green matched icon only for an active match | PASS |
| Delete Account under Help Center; Report an Issue only on Profile | PASS |
| Desktop camera: live preview, with the file picker kept separate | PASS (Chrome with a simulated camera device) |
| Lifecycle: actions follow `match_status`; accept opens It's a Match; `match_accept` opens It's a Match; `match` opens the profile; cards have no match-action buttons and open the profile | PASS |

### Layout, accessibility and browsers

| Check | Result |
|---|---|
| No horizontal overflow at 360, 768 and 1280 px on the changed screens | PASS |
| Arabic: right to left; no overflow on the profile or Matches | PASS |
| Dialogs: open from the keyboard, focus stays inside, labelled, Escape closes, focus returns | PASS |
| Every button on the profile and Matches has an accessible name | PASS |
| WebKit and Firefox: sign-in, Matches with hearts, profile actions, notification details; no page errors | PASS |

## Mapping to PRODUCTION_TEST_PLAN.md

| Plan phase | Covered here by |
|---|---|
| 0 Build | lint, type check, unit tests, production build |
| 1 First launch | 4.1–4.4 |
| 2 Authentication | 5, 7, 16, 17.1–17.2, plus the legacy session-navigation suite |
| 3 Onboarding | 6, 8.1, accepted differences |
| 4 Screens | 9–15 |
| 5 Navigation | 10.8, 11.1–11.2, 14.1–14.2, legacy suite (deep link, back/forward, unknown route) |
| 6 Forms | 5–8 |
| 7 API behaviour | 8.2, 17.1–17.6 |
| 8 Persistence | 4.3, 9.3, 16, sign-up session state |
| 9 Offline and slow network | 4.3-e/f, 7-d, 9.1-d, 10.7-b, 13.1-a/d, 17.3 |
| 10 Tab lifecycle | 14.3 (focus and visibility), legacy suite (logout in another tab) |
| 11 Permissions | 4.1, desktop camera |
| 12 Files and images | accepted differences (types, size, own address) |
| 13 Payments | not applicable: there is no payment feature |
| 14 Notifications | 14.1–14.4, 19 notification links |
| 15 Search, filter, sort | 15 (FAQ filters), 17.4 |
| 16 Roles | client and caregiver checks throughout |
| 17–18 UI and screen sizes | layout checks, RTL |
| 19 Cross-browser | Chrome, WebKit, Firefox |
| 20 Performance | not re-measured this round; the bundle size is unchanged (main chunk 424 kB, 127 kB gzipped) |
| 21 Security | code review below; the FAQ HTML is still sanitised; no secrets added |
| 22–23 Account states, destructive actions | 10.7 (no blind replay), 13.1 (no auto-resend), unmatch and cancel confirmations |
| 24 Error messages | 17.5 |
| 25 Regression | full final pass plus the legacy suites |
| 26 New vs returning visitor | 4.1-d, 4.3-c/d |
| 27 End-to-end journeys | request, accept, It's a Match, unmatch; password reset with a real email; password change |
| 28 Production build | the production-build run |

The local legacy browser scripts in `qa/` (not part of the repository) were run from a copy pointed at the new accounts, with notifications granted:
- **07 session navigation:** 17 of 18 pass. The remaining check looks for a message in an old chat whose accounts have since been deleted. Its offline-start check now allows for the new retry back-off.
- **09 double submit:** the sign-in and send checks pass. Its heart check needs a third card; 9.3-a covers that behaviour.

## Code quality and security review

The changed code was reviewed for:
- duplicate calls (the start-up page-1 prefetch was removed);
- race conditions, including a session-replacement race found and fixed: during a password change, a background refusal could clear the new session;
- stale closures (refs in the paging and pull hooks);
- unbounded retries (all are bounded: 3 connection retries, one renewal);
- duplicate submissions (locks on match actions, hearts and sending);
- timers and listeners (every timer and listener is cleaned up, and polling stops on sign-out);
- unsafe HTML (only the existing sanitised FAQ answers);
- logging: development-only logs carry the error kind and status, never values or credentials.

No secrets, tokens or personal data are in the changes. The test accounts and their credentials live only outside the repository.

## Notes for the client (outside the web app)

- **Backend, code limit:** the server's limit on new codes is longer than the app's 2-minute timer, and grows with each request ("Please try again after 475 second(s)!"). The app shows that message, but aligning the limit with the timer would avoid it.
- **Content.** The web now ships its own translations, in all eight languages, for the keys it added: `notification_permission_*`, `error_general`, `error_forbidden`, `error_not_found`, `error_session_expired` and `error_profile_unavailable` (`src/app/webContent.ts`). They're used only until the server's content table has those keys. One existing server text, `settings_change_password_dialog_message`, says the user is signed out of all devices "including this one". The server does end every session, and the web then signs the user in again, so the text is accurate but could be reworded.
- **Browser limit:** a browser without notifications (Safari on iPhone outside a Home Screen app) can't grant permission and is let in, because blocking it would lock those users out entirely.
- **Automated testing (client team):** browser automation must grant the `notifications` permission, or the gate covers the app.

## Deployment

The private review site https://carezaar-web.vercel.app was redeployed from this code, from a clean copy outside Git, using the isolated `nooneexist414` Vercel CLI profile and the `carezaar-web` project. Checks on the live site:
- the served app and stylesheet are byte-identical to the local build (`index-Cs_YEU48.js`, `index-BAl37tor.css`);
- signed-out requests get 401;
- the noindex, Permissions-Policy and CSP headers are present;
- with an account: sign-in, Matches with hearts, the profile's match actions, the FAQ "All" chip and notification details all work, with no page errors.
