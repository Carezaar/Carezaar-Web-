# Web parity test execution report — parity review v4.0

**Date:** 17 October 2026
**Application:** Carezaar web app (`CareerZar React App`, repository `Carezaar/Carezaar-Web-`)
**Review covered:** *Carezaar – Web and Android Parity Review*, version 4.0, 16 October 2026, 10 pages (19 items to change, 3 accepted differences)
**Test plans used:** `PRODUCTION_TEST_PLAN.md` (written under QA document 1, extended with Phase 29 for this review) and its execution under QA document 2 (the regression suites below)

## 1. Summary

| | Count |
|---|---|
| Items to change on the web | 19 |
| PASS (implemented and verified in the browser) | 17 |
| BLOCKED | 2 (C3 document content, M1 pictures) |
| FAIL | 0 |
| Accepted differences (no change) | 3 (C1, E1, Q3) |

Both blocked items are waiting for material from the client, not for code:

- **C3:** the sentence, the two links and an in-app viewer (scrollable and zoomable) are built and tested. No Terms of Use or Privacy Policy document exists anywhere we can reach: not on the server, the API, the website, or in the Android build. The viewer shows "This item is no longer available." until the two addresses are configured. The Android 21 Sep build contains only an excerpt of an older licence agreement (cut off after section 3).
- **M1:** Android's new header pictures (a phone showing a conversation, and everyday care scenes) are not in the Android build or the design files we have. We didn't substitute other pictures.

## 2. Reference and method

- **Android:** the review, the live managed texts (`GET base/contents`) and the live API. The only Android binary on hand is `Carezaar v1_0_0 2026-09-21 10-00.apk`. It was decompiled with jadx 1.5.6, but it predates the 13 and 15 October Android updates and has none of the new texts. **No Kotlin source was available.**
- **Live API facts used:**
  - An unfinished sign-up answers `POST auth/login` with **409** `"Your registration is not complete. Please complete your profile to continue."`, with `meta.role`.
  - A deleted account appears with `is_deleted: true`, null names and `is_match: false` in chats, chat details and notifications.
- **Build under test:** production build (`npm run build`) served by `vite preview` at `http://127.0.0.1:4400`, using the live API (`https://new.carezaar.com/api/`).
- **Browsers:**
  - Google Chrome 155.0.8059.80 (Playwright, `channel: chrome`) for every suite;
  - Firefox 155.0 (Playwright build 1543) and WebKit 26.6 (build 2359) for the changed screens and the existing smoke tests.
- **Accounts:** disposable accounts created through the real sign-up or the API (mail.tm inboxes), listed in `qa/created-accounts.txt`, and deleted at the end (section 7).

## 3. Results per finding

The matrix with file locations is `docs/WEB-ANDROID-FUNCTIONAL-PARITY.md`. All results below come from the **final run after the last code change** (`web-qa/pv-final-parity.jsonl`).

| ID | Result | What was observed | Evidence (`test-evidence/web/`) |
|---|---|---|---|
| A1 | PASS | The first click asked for permission exactly once. When it was allowed, and when it was refused, no blocking window appeared and Sign In stayed usable. | `pv-A1-refused-still-usable.png` |
| B1 | PASS | Real unfinished account: login 409 → the server's message → `/sign-up/profile` → profile saved → preferences wizard. | `pv-B1-profile-step.png` |
| C2 | PASS | Empty form: 3 × "This field is required." plus "Please accept the license agreement to continue." Invalid input: "Please enter a valid email address.", "One uppercase" (first unmet rule), "Passwords do not match." and the agreement message, all at once. Continue always active. Checked on phone and desktop, in Chrome, Firefox and WebKit. | `pv-C2-phone-*.png`, `pv-C2-desktop-*.png` |
| C3 | BLOCKED (UI PASS) | Managed consent sentence with two underlined links. Each opens an in-app window titled with its name, and opening it doesn't tick the box. With a configured address (stand-in page): the document loads in the app, zooms to 150 %, scrolls, and Escape closes it. Keyboard: links reachable with Tab, Enter opens, focus returns. Arabic: translated sentence, two links. | `pv-C3-*-terms.png`, `pv-C3-viewer-zoomed.png`, `pv-RTL-signup-*.png` |
| C4 | PASS | The confirmation reads "Please review the details below. The email address will be used to continue." (phone and desktop). | `pv-C4-*.png` |
| C5 | PASS | Registration succeeded and the code request failed: the code screen opened with Re-send available, and the connection message was shown. | `pv-C5-otp-after-send-failure.png` |
| F1 | PASS | Location step of a new sign-up: 0 geolocation calls when the map opens on the whole country; 1 after tapping My Location. | `pv-F1-whole-country.png` |
| F2 | PASS | Refused location → "Allow location access to use your current location." | `pv-F2-denied.png` |
| F3 | PASS | Continue with no location → "Please select a location to continue." | `pv-F3-location-required.png` |
| F4 | PASS | Typing "12.5abc9999999" gives 125999; "-1234567" gives 123456. | `pv-F4-pay-digits.png` |
| K1 | PASS | A message sent by the caregiver appeared in the client's open list without any action (about 9 s). 2–3 list reads per 25 s. | `pv-K1-list-updated.png` |
| K2 | PASS | Former match: note "You can only send messages to your current matches.", box disabled, send grey (Chrome, Firefox, WebKit; also suite B check B-3.7). | `pv-K2-former-match.png` |
| K3 | PASS | Real deleted account: "Deleted Account" in the list, the conversation header and 2 notification rows. The conversation is closed with "This account has been deleted. You can no longer send messages." Arabic shows "حساب محذوف" and the translated note. | `pv-K3-*.png`, `pv-RTL-chat-deleted.png` |
| K4 | PASS | Send with an empty box → "Please type a message first.", 0 requests (three browsers). | `pv-K4-empty-send.png` |
| M1 | BLOCKED | Unchanged; pictures not available. | `pv-M1-*-current.png` |
| M2 | PASS | "Change Password / Change your current password". | `pv-M2-profile-menu.png` |
| O1 | PASS | Password changed → signed out at `/intro`; the new password signs in. Suite A (A-10b) and the ten-change suite (9-f, answer lost) agree. | `pv-O1-back-to-start.png` |
| Q1 | PASS | Renewal answered 500 → signed out to `/intro`, tokens cleared, no Connection Problem window. Unit tests also cover 500 and 401. | `pv-Q1-signed-out.png` |
| Q2 | PASS | Renewal unreachable → one window. The list showed "Cannot communicate with server." with Try Again. Retry closed the window, and no list read was replayed. Unit test: 3 requests while open, 1 renewal attempt, nothing re-sent. | `pv-Q2-*.png` |

Quality checks on the changed screens (final run):
- Arabic RTL: PASS.
- Keyboard access: PASS.
- 320 / 768 / 1440 px with no horizontal overflow: PASS.
- axe-core wcag2a/aa on Create Account (with errors shown), Messages, both closed conversations and Profile, with 0 serious or critical issues: PASS.
- No console errors and no failed app requests: PASS.

## 4. Automated tests

| Command | Result |
|---|---|
| `npm run build` (tsc + vite) | pass, no errors |
| `npm run lint` | 0 problems |
| `npm test` | **26/26 pass**: the 16 existing tests, plus 5 in `tests/parity.test.mjs` (C2, F4, K3) and 5 in `tests/session.test.mjs` (Q1/Q2 on the real API client with a scripted server) |

Baseline before any change: build pass, lint 0, 16/16 tests.

## 5. Regression (QA documents 1 and 2)

These suites carry out `PRODUCTION_TEST_PLAN.md` against the final build and the live API. Checks that asserted a behaviour this review reverses were updated to the new behaviour and kept, never deleted. The edits are marked `[2026-10-17]` in the suites:

- A-03-b/d/e (sign-up rules);
- A-10b (password change);
- B-3.7 (closed conversation);
- B-10-webkit-gate (notifications);
- ten-change 8-a/8-d/8-e/8-g (Connection Problem);
- 9-f (password change).

| Suite | Covers | Final result |
|---|---|---|
| A `la-start-auth-account.mjs` | start-up and offline start, Intro and language, real sign-up for both roles (code from the mailbox, profile with photo, wizard, map, pay), sign-in, session renewal, two tabs, role switch, forgot password, change password, edit profile/preferences/skills, Help, FAQ, language (fr, ar), Report an Issue, delete account, log out | **78 pass, 1 N/A** (landing page not served by the preview) |
| B `lb-matching-rest.mjs` | matches (sort, paging, pull-to-refresh, favourites, banner), profiles, request/accept/It's a Match/chat (10-message burst)/unmatch/reject/cancel across two sessions, notifications, favourites, role access, 320–1920 px, axe, keyboard, Firefox and WebKit smoke | **69/69 pass** (fresh accounts) |
| Ten-change `l02-ten.mjs` | match checks before actions, cancel window, Accept/Reject windows, It's a Match animation, chat delivery when answers are lost, notification details, dates as stored, unavailable profile, read retries, managed error texts, Connection Problem, password change when the answer is lost, languages | **51/51 pass** |
| Gaps `l05-gaps.mjs` | new-account empty states, 500 HTML page, skills prefill, favourite double tap, chat reply / Shift+Enter / long, Arabic and emoji messages / seen ticks / load failure | **10/10 pass** (fresh accounts) |

### 5.1 Final numbers (all on the final build)

| Suite | Pass | Fail | N/A | Notes |
|---|---|---|---|---|
| Parity `pv-web` + `pv-extra` | 24 + 6 quality checks | 0 | — | 3 BLOCKED rows (C3 phone and desktop, M1); K1 and B1 were rerun after fixture fixes on the test side (B1's account had been completed by the iOS run; K1 needed an active match) |
| A | 78 | 0 | 1 | |
| B | 69 | 0 | 0 | fresh account pair |
| Ten-change | 51 | 0 | 0 | 6-a…6-e rerun after correcting 6-d. That check assumed the newest notification is a match one, but here it was a chat notification, and Show correctly opened that chat (`/chat/1017`) |
| Gaps | 10 | 0 | 0 | fresh account pair |
| Firefox / WebKit (changed screens) | 7 + 7 | 0 | — | C2, C3 (BLOCKED content), C4, K2, K3, K4, M2 |

What the first runs found, and how it was resolved:

- **Test-side issues**, now fixed in the suites:
  - a stale `.la-accounts.json` from an aborted run;
  - the gaps suite reusing a non-new account;
  - checks that assumed the 10–11 October behaviours, which this review reverses.
- **App defects:** no regression in the app was found.

## 6. Cross-role

Run with separate browser contexts per role, both signed in at once:
- request, accept and It's a Match;
- chat both ways;
- unmatch, then the closed conversation;
- reject and cancel;
- the K1 list update triggered by the other role;
- the K3 deleted account staged by deleting one side.

## 7. Backend observations

- `POST auth/login` answers 409 (unfinished sign-up) both before the profile step and after it until the client/caregiver record exists, so B1's resume covers both stages. Verified live on 17 October.
- A bare `users/profile` request without `bio` or `Accept-Language` answered 500 during probing. The app always sends `Accept-Language`, and its own requests succeeded.

## 8. Environment limitations

- No Kotlin source. The Android build available predates the reviewed Android version, so Android's new behaviour was taken from the review text and the server's managed texts.
- Safari on macOS and iOS was not tested. WebKit (Playwright) stands in for Safari's engine.
- Real browser notifications and real geolocation prompts can't be answered by automation. They were simulated at the browser API level (permission answers and position errors).
- Not deployed: no deployment was requested.
