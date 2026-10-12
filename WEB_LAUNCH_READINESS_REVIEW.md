# Carezaar web app: launch readiness review

**Date:** 12 October 2026
**Build reviewed:** `main` at `3f79a49` plus three changes, described in sections A and C. They are committed and pushed to `main` together with this review; nothing has been deployed.

This review answers the client's question of 12 October: is the web app ready for public launch, or are there issues, bugs or steps left? It also covers the two pictures the client flagged. The client's request for more languages was a suggestion, so it was not implemented (section D).

## A. Launch assessment

**Verdict: the web app is ready to launch, with no known critical or high-priority defects.** Public launch still needs the deployment steps in section E, which are not code changes. Every core flow was exercised against the live server, in real browsers, for both roles:
- sign-up;
- sign-in and session renewal;
- matching and match requests;
- chat;
- notifications;
- favourites;
- settings and account deletion.

Two small defects were found during this review and fixed locally, and their checks pass:

| Defect | Severity | Fix | Re-test |
|---|---|---|---|
| When several requests were refused while the server was unreachable, each one made its own renewal attempt. The user still saw a single Connection Problem window, so nothing looked wrong, but Requirement 8 asks for one shared attempt. | Low (P3) | `src/api/client.ts`: a request that arrives while the Connection Problem window is already open waits behind it instead of making another renewal attempt. | Ten-change suite run in full: 51/51 pass, including 8-g ("one renewal attempt, one window"). |
| Create Account on phones: when the two passwords differed, Continue just greyed out with no explanation. The desktop layout already showed "Passwords do not match." | Low (P3) | `src/screens/auth.tsx`: the phone layout shows the same message as the user types, in the design's existing error slot. | 4/4 checks at 320 and 390 px. A real phone sign-up passes end to end. Suite A rerun on the final build (section B). |

**Remaining non-blocking items**

| Item | Classification | Notes |
|---|---|---|
| Two developer-only log lines in the source (`client.ts`, `feedback.tsx`) | Non-blocking (code hygiene) | Both are wrapped in `import.meta.env.DEV`. The production bundle contains no `console` calls, which was checked. The old source scan (SEC-05) still flags them. |
| Opening another user's chat shows "You can only send messages to your current matches." | Wording, for the client to decide | No data is shown. The message talks about matches rather than access. |
| A profile link with an invalid id shows the server's own message ("The selected id is invalid.") | Previously accepted behaviour | The server answers 422 rather than 404. Under the agreed rules, field messages from the server are shown as they are. The managed not-found text is used for real 404s. |

**Backend and infrastructure dependencies (not web defects)**

| Dependency | What it means for launch |
|---|---|
| Server response times vary between about 2 and 11 seconds per request | Loading, retry and timeout states all work. Pages simply feel slow when the server is slow. This is worth raising with the backend owner before a public launch. |
| OTP emails to Yahoo addresses are not confirmed | The client reported a missing Yahoo code. Codes to other providers arrived in every test this round. Confirming the cause needs the backend's mail-delivery logs for that address and time. |
| The server's wait before resending a reset code is longer than the app's 2-minute timer | Unchanged from earlier rounds. The app shows the server's message. |
| The server deletes QA test accounts from time to time | It did so again before this review. Every documented test account had stopped working, so fresh accounts were created through the real sign-up (section B). This is not a product issue. |

## B. Testing evidence

**QA documents.** Both mandatory documents were read in full:
- `You are acting as a Senior QA Engineer a`: the instructions for writing the plan, i.e. `PRODUCTION_TEST_PLAN.md`.
- `You are acting as a Senior QA Engineer, .md`: the instructions for running it, i.e. `TEST_EXECUTION_REPORT.md`.

The existing plan was reused, and its phases were run through the suites below. Both Android reference documents were reread as well. The Android reference is a compiled APK plus reverse-engineering notes; no Kotlin source was reviewed.

**Build and code checks (final code):**
- type check: 0 errors;
- lint: 0 problems;
- unit tests: 16/16;
- production build: succeeds;
- `npm audit`: 0 vulnerabilities;
- build and security checks on the combined site (p00 and p12): 19 pass, plus SEC-05 as described in section A.

**Browser suites.** These ran against the production build and the live server, using disposable accounts created through the real sign-up. All of them were deleted afterwards and their logins refused (`qa/created-accounts.txt`).

| Suite | What it covers | Result |
|---|---|---|
| Ten client changes (`web-qa/l02-ten.mjs`), one full run on the fixed build | Requirements 1–10 with network traces; that no languages were added | **51/51 pass** |
| A: start-up, sign-in and account (`web-qa/la-start-auth-account.mjs`), final build | first launch and offline start; Intro and language; sign-up for both roles (email code, profile, photo crop, wizard, map, pay rules, review); sign-in; session renewal; two tabs; switching roles; forgot password with a real emailed code; change password; edit profile, preferences and skills; Help Center; FAQ; Change Language (French, Arabic RTL); Report an Issue with the endpoint stubbed; delete account; log out; earlier client requirements (no US-only wording, no "Unverified", no Background Check) | **78/78 pass, 1 N/A** (the landing page isn't served by the app preview), one clean run, no reruns |
| B: matching, chat and layout (`web-qa/lb-matching-rest.mjs`) | matches list: sort, paging to the end, pull-to-refresh, keyboard, favourite on and off on the server, care-type banner; partner profiles; full request, accept, It's a Match, chat (10-message burst), unmatch, reject and cancel across two sessions; notifications with Show; Favorites; role access; 320–1920 px layouts; axe accessibility (0 violations); keyboard and focus; Firefox and WebKit smoke tests; tokens and privacy | **69/69 pass** (1 test-side fix, rerun) |
| Coverage gaps (`web-qa/l05-gaps.mjs`) | new-account empty states; 500 HTML page on a list; skills editor prefill; favourite double tap; chat Shift+Enter, long messages, emoji/accents/Arabic, reply, seen ticks, load-failure retry | **10/10 pass** (one clean run after 4 test-side fixes) |
| Header pictures (`web-qa/l01-headers.mjs`) | Messages and Profile headers for both roles at 1440, 768 and 390 px | **12/12 before, 12/12 after** |
| Fix checks (`l03-mismatch.mjs`, `l04-reload.mjs`) | phone password-mismatch message; reloading My Matches asks for page 1 once | **4/4, 3/3** |
| Earlier p- and f-suites (`p00–p12`, `f01–f06`) | the September plan suites | 346 pass, 71 fail, 11 N/A: triaged below |

**Triage of the 71 old-suite failures.** These suites were written on 25–27 September, before the client's 9–10 October specification changed several behaviours. Each failure was traced to one of three causes:
- **A behaviour the client later changed.** Examples: Sign In has no email-format check, the role is no longer cached, password reset is one screen, users stay signed in after a password change, reviews were removed, Report an Issue moved to Profile only, every lookup table loads before the app opens, and the timeout is now 2 minutes.
- **Accounts the server had deleted, or old account names.**
- **Selectors for dialogs that have since changed.**

The current behaviour behind each of these is covered by the A, B, ten-change and gap suites above. No app defect was found among them.
- **MT-G-05** (favourite not removed on a second tap) was investigated with a timed trace. The app sends one request and ignores a second tap while the first is still in flight. The heart and the server then agree.

**Browsers and widths:**
- **Browsers:** Chrome (all suites), Firefox and WebKit (Safari's engine) smoke tests.
- **Widths:** 320, 390, 768, 1024, 1440 and 1920 px.
- **Languages:** English, French and Arabic (right to left).
- **Time zones:** three, for the date checks.

**Limits of this evidence:**
- No physical iPhone or Android phone was used. Phone layouts were emulated in Chrome.
- Real Safari was not driven; WebKit was used instead.
- WebKit's headless mode always denies notifications, so its smoke test took the gate's documented "browser without notifications" path.
- The landing page is not served by the app preview. It was checked on the combined site by the old `f05-landing` suite: 12/12 pass at 320–1920 px, plus links and navigation.

## C. Image improvements

**Inspected:**
- The client's three screenshots. Their message thread shows the Messages page and the Profile page on desktop.
- Every image the web app uses: the 5 web-only illustrations, the 4 care-type banners, 4 care-type icons, and the intro, splash and page backgrounds.

The six hash-named images in `public/assets/` are not used anywhere.

**Replaced:**

| Page | Before | After | Why |
|---|---|---|---|
| Messages header | `bg_messages.webp`: an empty living room with armchairs | `header_senior.webp`: a caregiver with an older client at home | The old photo showed no people and no care. The new one is the app's own approved care photo, already used on My Matches: brand-blue scrubs and the heart-house motif. |
| Profile header | `bg_profile.webp`: a study desk with a globe and pen | `header_adult.webp`: a caregiver helping an adult client at home | The old photo had nothing to do with caregiving. The new one comes from the same approved set. |

The change is two image names in `src/screens/main.tsx`. No new assets were added, and the layout and header component are unchanged. The Android app uses the same two old photos, so this is a client-requested change, not a fix for a web-only defect. The Matches header was not flagged and was left alone.

**Checked after the change:**
- **Widths and roles:** both roles at 1440, 768 and 390 px, then again in suite B at 320–1920 px.
- **Images:** load, fill the header without stretching (`cover`), and cause no layout shift or overflow.
- **Header card:** the title card stays inside the header, with readable text.
- **Accessibility:** the images are decorative and have no alt text, as before. Axe found 0 violations.

On phones, the frosted title card covers much of the photo, as it already does on My Matches.

Evidence: `test-evidence/web/launch-before-*.png` and `test-evidence/web/launch-after-*.png`.

## D. Scope control

- **Language expansion was not implemented.** No language was added to the Preferred Language list or the app's language menu, no translation files were created, and language selection is unchanged. This was checked: the app menu still lists the same 8 languages and Preferred Language the same 11 options as the 9 October baseline. English, French and Arabic still switch correctly. Adding languages is a separate scope decision. Note that whole-app languages also depend on the server's managed texts, so that work needs the backend too.
- **Nothing else outside the agreed scope was added.** There was no redesign or new feature, the API contract is unchanged, and no new dependencies were added.
- **Pushed to GitHub on Aariz's go-ahead.** There is no deployment and there are no native iOS changes.

## E. Remaining actions

**Mandatory before a public launch:**
1. **Deploy this round's changes.** That means the two header pictures and the two small fixes. They are on GitHub `main`; the review site still runs the previous build.
2. **Production hosting and domain.** Today the site runs only as a password-protected, no-index review deployment. For launch:
   - choose the production domain and hosting account (ideally the client's own);
   - set `VITE_SITE_URL` to that domain so share previews use absolute image links;
   - deploy the final build;
   - remove the review password and the no-index header.
3. **Backend owner sign-off.** Response times, Yahoo OTP delivery (it needs their mail logs) and the reset-code resend limit.
4. **One pass on real phones.** Use a real iPhone with Safari and a real Android phone with Chrome on the production URL: sign-up with an emailed code, the notification permission prompt, the camera or gallery photo, and chat.

**Optional future work (needs separate approval):**
- more interface languages and Preferred Language options (section D);
- clearer wording for opening someone else's chat;
- removing the two developer-only log lines.
