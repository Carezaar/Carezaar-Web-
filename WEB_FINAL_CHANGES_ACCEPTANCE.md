# Carezaar web: final ten client changes (11 October 2026)

**Source:** the client's message of 11 October 2026, "Carezaar web app: remaining changes to match the Android app", items 1–10. That written specification is the acceptance criteria.

**Supporting evidence:**
- `KOTLIN-REVERSE-ENGINEERING.md` and `ANDROID-RUNTIME-BEHAVIOUR.md`, both read in full.
- The APK `Carezaar v1_0_0 2026-09-21`. Its code contains none of these ten features: no "It's a Match" screen, no session-renewal window and no `general_error_*` texts. It predates them, so the client's specification decides.

**Managed texts used:**
- added by the client to the content table: `general_error_forbidden`, `general_error_not_found`, `general_error_general`, `general_session_renewal_title` ("Connection Problem"), `general_session_renewal_message`, `general_retry`;
- already present: `general_network_title`, `match_changed_message`, `match_check_failed_*`.

**How it was tested:**

| | |
|---|---|
| Build | The production build (`vite preview`) against the live API |
| Accounts | Disposable client and caregiver accounts in separate browser contexts, with real actions between them |
| Network evidence | Every request recorded, with its order, method and status. Failures were simulated per request: the connection dropped before sending; the request processed by the server but its answer lost; 403/404/500 answers; a slow answer. |
| Results file | Result IDs below match the test suites: `t10-*` for these ten requirements, `r1`–`r3` for the full regression |

## Acceptance checklist

### 1. Check the match before every action

`src/screens/usePartnerMatch.ts`, `src/screens/partner.tsx`.

**Implementation:**
- Before every request, cancel, accept, reject or unmatch, the profile (`clients/caregivers/{id}` or `caregivers/clients/{id}`) is read again. It is compared with the state the action needs and with the `match_id` the user confirmed on screen.
- If anything changed, nothing is sent and "This match has changed" is shown.
- If the read fails, "Couldn't check this match" opens. Its Try Again repeats the check and then continues the same action.
- The action is never repeated automatically. If its answer is lost, the profile is read to find out what happened.

**Results: PASS**

| Check | Result |
|---|---|
| 1-a, b, d, e, f | Request, Cancel, Reject, Accept and Unmatch each send the check before the action (request order recorded). |
| 1-c | The other person withdrew after the Accept confirmation opened. Only the check was sent, then "This match has changed", and the profile updated. |
| 1-e | A rapid double click sent one check and one accept. |
| 1-g, 1-h | With the check failing, "Couldn't check this match" appeared and no action was sent. Try Again while still offline sent nothing. |
| 1-i | Try Again after recovery sent the check, then exactly one request. |
| 1-j | The request reached the server but its answer was lost. It was not resent (one POST), and the profile shows Pending Acceptance. |
| r2 M-12 | The other person asked in between, so the check caught it. |
| r2 M-13 | A crossing request at the server opened It's a Match. |

### 2. Short Accept and Reject windows

`partner.tsx`. The photo and name are removed; the windows hold the question, the introduction (when there is one) and the two buttons.

**Results: PASS**
- **2-Accept, 2-Reject:** no photo or name. A long, multi-line introduction stays readable at 360 px, with no overflow.
- **Cancel:** closes the window without acting.
- **2-c:** with no introduction, the window shows only the question.

### 3. A visible Cancel button in the cancel-request window

`partner.tsx`.

**Implementation:**
- The ✕ is replaced by two visible buttons, as in every other confirmation.
- The outlined "Cancel" (`general_cancel`) closes the window. The red "Cancel" (the managed `match_withdraw_title`) cancels the request.
- Screen readers tell them apart: one is described as closing the window, the other carries the dialog's question.

**Results: PASS**
- **3-a:** two buttons and no ✕. Targets are 102×52 and 162×52 px.
- **3-b:** the outlined button keeps the request.
- **3-c:** Tab reaches both buttons, and Escape closes without cancelling.
- **3-d:** the red button cancels the request.

### 4. Only the short error when a page can't load

`partner.tsx`, `matched.tsx`. "This profile isn't available." is removed. The managed short message appears, and the screen returns after about two seconds; the timer is cancelled if the user leaves first.

**Results: PASS**
- **4-a:** a missing profile shows only "This item is no longer available." and returns to Matches.
- **4-b:** an It's a Match screen that can't load shows no extra text and returns.
- **4-c:** leaving before two seconds causes no late or repeated navigation.

### 5. Animated photo cards on It's a Match

`matched.tsx`, `styles/app.css`. The user's card slides in from the left and the partner's from the right; both settle at −8° and +8°, and the heart pops in between them. The animation runs once, when the cards appear. With reduced motion, the global rule stops the animation and the cards simply appear at their angles.

**Results: PASS**
- **5-a:** the two animations run, and the cards settle at −8° and +8° with no overflow.
- **5-b:** no animation is running after the 30-second notification poll re-renders the screen.
- **5-c:** with reduced motion, nothing moves and the angles are kept.
- **5-d:** at 320 and 1440 px, the cards fit the screen.
- **5-e:** re-entering the screen plays the animation once more.

### 6. Simpler notification window

`src/screens/account.tsx`. The date and Cancel are removed. The window shows the person's photo and name, the notification text and Show. Tapping outside or pressing Escape closes it, and only Show navigates.

**Results: PASS**
- **6-a:** tapping a notification opens the window without navigating. It has the photo, name, text and one button (Show), with no date and no Cancel.
- **6-b:** tapping outside closes it.
- **6-c:** Escape closes it.
- **6-d:** it opens with Enter, focus moves inside, and Show navigates.
- **6-e:** if the related person is missing, the text appears without Show, and nothing crashes.

### 7. Notification and issue dates as stored

`src/app/serverTime.ts` (`asStored`), `account.tsx`. Values are shown exactly as the server sends them, with no parsing and no time-zone conversion. The server sends pre-formatted text: "2026-10-11 04:26:28" for notifications and "Oct 11, 2026, 4:26 AM" for issues.

**Results: PASS**
- **7:** in Asia/Kolkata, America/Los_Angeles and Pacific/Kiritimati (a day-boundary spread), every notification date and every issue date equals the server's value.
- **Unit tests:** cover UTC, an explicit offset, offset-free values, a year boundary, and missing or invalid values.

### 8. The Connection Problem window

`src/api/client.ts` (`waitForRenewal`, `retryRenewal`), `src/app/ConnectionProblem.tsx`.

**Implementation:**
- When a refused request needs the sign-in renewed and the renewal can't reach the server, every waiting request shares one blocking window. It uses the managed title, message and "Retry", and can't be dismissed.
- Retry tries the renewal once. On success the window closes, and waiting reads continue. A waiting action is not resent: its caller gets the general error, so the user repeats it.
- If the server refuses the sign-in, the user is signed out (there is no window in that case).

**Results: PASS**
- **8-a:** one window and no other errors.
- **8-b:** the app is inert behind it, and it can't be dismissed.
- **8-c:** Retry while still unreachable makes one renewal attempt; the window stays and says so.
- **8-d:** Retry after recovery closes the window, `auth/info` 403 → 200, and the matches load.
- **8-e:** a favourite that was waiting is not resent (one POST), and the user sees "Something went wrong. Please try again."
- **8-f:** a revoked session goes to Intro, with no window.
- **8-g:** concurrent requests share one renewal attempt and one window.

### 9. Retry only reads after a dropped connection

`src/api/retryPolicy.ts`, `client.ts`.

**Implementation:**
- Only GET is retried: 3 times, at 1 s, 2 s and 4 s.
- Nothing else is ever resent automatically. That covers signing in, saving a profile or preferences, every match action, starting a chat, favourites, changing the password, deleting the account, messages and issues.
- The renewal itself isn't retried automatically (requirement 8).
- When an action's answer is lost, a read finds out what happened:
  - **match actions:** the profile;
  - **favourites:** the profile;
  - **messages:** the conversation;
  - **password change:** signing in with the new password;
  - **issue:** the issue list;
  - **account deletion:** whether the session still works.

**Results: PASS**
- **9-a:** a read that dropped twice succeeded on its 3rd attempt.
- **9-b:** a favourite dropped before sending made one attempt and stayed off.
- **9-c:** a favourite processed with its answer lost: one POST, and the heart shows on.
- **9-d:** a message processed with its answer lost: sent once, shown once, box cleared.
- **9-e:** a dropped message made one attempt, kept its text, and showed the managed message.
- **9-f:** a password change processed with its answer lost: one request, confirmed by signing in, and the user stays signed in.
- **1-j:** a match request processed with its answer lost (see requirement 1).
- **r3 A-4:** a read that always drops makes 4 attempts, then "Cannot communicate with server."
- **Unit test:** only GET is retryable.

### 10. Managed texts for every error

`src/app/feedback.tsx`, `src/api/errors.ts`, `src/app/webContent.ts`, and the call sites in `account.tsx`, `auth.tsx` and `profileForm.tsx`.

**Implementation:**

| Case | Message |
|---|---|
| Refused | `general_error_forbidden` |
| Missing | `general_error_not_found` |
| No connection or timeout | `general_network_title` |
| Anything else | `general_error_general` |

- The web-only copy is removed: "Your session has expired" and "…not available right now, please contact support".
- The renewal failure uses the Connection Problem window.
- Field messages defined by the product (400/422) are kept.

**Results: PASS**
- **10-en, 10-fr, 10-ar:** 403, 404 and 500 each show the managed text in English, French and Arabic. An SQL message from the server is never shown.
- **10-network:** connection failures show "Cannot communicate with server."

## Full regression (both QA documents)

Both QA documents were read and used:
- `You are acting as a Senior QA Engineer a` (the plan brief, which produced `PRODUCTION_TEST_PLAN.md`);
- `You are acting as a Senior QA Engineer, .md` (the execution brief).

`TEST_EXECUTION_REPORT.md` has the earlier run.

This round's regression suites:

| Suite | Covers |
|---|---|
| r1 | notification permission; reference data and caching; matches after the sign-in check; Sign In; password rules; one-screen password reset with a real emailed code; pay and certifications |
| r2 | the Matches list (icon, heart, banners, pull-to-refresh, pagination to the empty page); the profile lifecycle in both roles; It's a Match navigation; Matches & Requests; notification links |
| r3 | chat; 30-second polling; FAQ; password change; session renewal; read retries; the four accepted differences; earlier client requirements; layouts at 360, 768 and 1280 px; Arabic; keyboard and dialog accessibility; WebKit and Firefox |

The final counts are in `WEB_PRODUCTION_READINESS_REPORT.md`.

## Known issues

| Type | Item |
|---|---|
| Frontend defects | None open. Found and fixed this round: a pull-to-refresh made while the next page was still loading was ignored. It now takes over that load. |
| Backend | Unchanged from the previous round: the reset-code resend limit is longer than the app's 2-minute timer. The app shows the server's message. |
| Environment | Headless browsers were used, with real touch events and a simulated camera. Safari itself can't be automated; WebKit, its engine, was tested. |
| Test data | One test issue ("QA date display check", marked as an automated check to ignore) was filed by a disposable client account to test issue dates. The account was then deleted. |

## Post-push verification of the exact revision

After pushing, `main` was cloned fresh from GitHub into a clean folder and checked out at `2b7266d`. Its code is identical to `30fbbf3`; the only difference is one report file. It was installed from the lockfile (`npm ci`), built for production and served locally. The whole ten-change suite ran against it with two new disposable accounts:

**54 passed, 0 failed, 0 blocked.**

## Remaining limitation, per requirement

| # | Remaining limitation |
|---|---|
| 1 | None. A match change that happens in the moment between the check and the action reaching the server is handled by the server's own answer and a reconciling read (1-j, M-13). |
| 2 | None |
| 3 | None. Both buttons read "Cancel" because that is the managed action label; screen readers hear the difference. |
| 4 | None |
| 5 | None. With reduced motion the cards appear without moving, which the specification allows. |
| 6 | None |
| 7 | None. Dates are whatever text the server sends; if the server's format changes, the display changes with it. |
| 8 | None. A browser offline from the start (with no refusal from the server) shows the normal connection message, not this window, because no renewal is attempted. |
| 9 | None. Profile and preference saves aren't retried automatically; the user can save again safely. |
| 10 | None. The permission screen's texts aren't error messages and keep the web's own eight-language copy until the client adds them to the content table. |

## Full regression on the exact pushed revision

`main` was cloned fresh from GitHub at `7241aa7`. Its code is identical to `30fbbf3`; the commits after it change only reports. It was installed with `npm ci`, built for production and served locally. The full regression then ran against it with three new disposable accounts:

| Suite | Passed | Failed | Blocked |
|---|---|---|---|
| r1: start-up, permission, reference data, sign-in, password rules, password reset with a real emailed code, preferences | 21 | 0 | 0 |
| r2: Matches list, pagination, profile lifecycle in both roles, It's a Match, Matches & Requests, notification links | 30 | 0 | 0 |
| r3: chat, polling, FAQ, password change, session, read retries, accepted differences, earlier requirements, layouts, Arabic, accessibility, WebKit and Firefox | 29 | 0 | 0 |

With the ten-change suite on the same code (54 of 54), that makes **134 passed, 0 failed, 0 blocked**.

In r2's first run, the unmatch check read the screen too early, and the run then stopped. Unmatch itself worked: run three times, it gave check → `DELETE users/matches/{id}` 200 → re-read, ending at "Request a Match" with the server showing no match. The test now waits for the button, and r2 was rerun on the same build: 30 of 30.

## Test data left in the client's system

The ten-change suite files a Report an Issue entry to test how issue dates are shown. It ran six times, so up to six identical issues titled "QA date display check" ("Automated web check of how dates are shown. Please ignore.") may be in the admin panel. They come from disposable accounts that have since been deleted. The API has no endpoint to delete an issue (`users/issues` offers only GET and POST), so they can only be removed from the admin side.

## Final single uninterrupted pass on the pushed code

All four suites ran back to back, without any rerun, against a production build of the pushed `main` (`27b882a`; app code identical to `30fbbf3`), using three new disposable accounts:

| Suite | Passed | Failed | Blocked |
|---|---|---|---|
| t10: ten changes | 54 | 0 | 0 |
| r1: start-up, sign-in, reset, preferences | 21 | 0 | 0 |
| r2: matching | 30 | 0 | 0 |
| r3: chat, settings, sessions, layouts, accessibility, other browsers | 29 | 0 | 0 |
| **Total** | **134** | **0** | **0** |

Two changes to the test suite before this pass:
- **Issue dates:** checked against an issue list answered in the server's real format, so no further test issues are filed in the client's admin.
- **Connection Problem recovery:** the renewal step now waits up to 90 seconds; the server took 5–30+ seconds to renew a session at times.
