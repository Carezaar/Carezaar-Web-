# Web vs Android: intentional differences

The Android app is the behavioural reference for this web app. The web matches it on the domain model, API contract, validation and flows, with the exceptions listed here. Each one is **deliberate**: a platform difference, a workaround for a backend problem, a client request, or a case where Android has a bug that the web doesn't copy. **Future reviewers shouldn't treat these as defects.** A difference that isn't on this list should be treated as a bug.

Android behaviour was taken from the shipped release build (`com.carezaar.app` 1.0.0, decompiled and inspected with `dexdump`) and from running it on an emulator. Backend references (BE-xx) point to `BACKEND-ISSUES-FOR-CLIENT.md` in the delivery documents.

## Background Check (removed from the web)

| | Behaviour |
|---|---|
| **Android** | Has a Background Check screen (name, date of birth, Social Security Number, street, ZIP, state → `POST users/verify`). On a partner's profile, **Message** and **Request a Match** send a viewer who isn't `VERIFIED` there first. Verified badges appear on profiles and match cards, the profile shows the user's verification status, and Intro lists "Verified Caregivers". |
| **Web** | **None of it.** The client asked on 2026-10-07 for Background Check to be removed completely, including every related field, option, button and reference. There's no `/verification` screen (old links fall back to My Matches), and no gate: anyone can request a match, and messaging still needs a match. There are no verified badges, no verification status on the profile and no "Verified Caregivers" on Intro. The app no longer calls `users/verify` or loads the US states list. |
| **Backend** | The server never enforced the check (BE-14), so nothing server-side depends on it. |
| **Status** | **Intentional (client decision, 2026-10-07).** The native implementation is outside this web-only task. |

Tests: `CR-V01` (Request a Match opens its confirmation; Message explains the match rule; nothing goes to `/verification`), `MT-*-09`, `XR-A1`/`XR-C1` (both started from the UI by never-checked accounts), `PS-*-01`/`PS-*-12` (no verification on Profile; `/verification` falls back) and `GL-BGC-*` (landing page).

## Differences

### Unmatch on the partner's profile
- **Android (1.0.0):** the red Unmatch button on a matched partner's profile opens the Matches screen, where the match is ended.
- **Web:** Unmatch asks for confirmation ("Are you sure you want to end your match with this user?"), then ends the match with `DELETE users/matches/{match_id}`, using the `match_id` from the profile. The profile switches to Request a Match, and the match moves to History for both people; earlier History records are kept.
- **Reason:** requested by the client in the code review. Android's withdraw-by-partner endpoint (`DELETE users/matches/{partner_id}/withdraw/partner`) isn't used at all. Since the backend fix of 2026-10-02 it only cancels a pending request the caller sent, and answers 400 on an active match (verified live).
- **Status:** intentional (client request).

### Profile match lifecycle and accepted-match screen
- **Web:** follows the Android behaviour described by the client on 2026-10-09 and 2026-10-10. Profile actions follow `match_status`: none → Request a Match; sent → "Pending Acceptance" with Cancel (managed text `match_withdraw_title`); received → Reject, then Accept, with the introduction inside both confirmations; active → Unmatch, and Message (shown only for an active match). Confirmation buttons are named after the action (Match, Cancel, Accept, Reject, Unmatch). "This match has changed" and "Couldn't check this match" (with Try Again) use the server's texts.
- **It's a Match:** decided from the partner's profile alone; a request that crosses the other person's request opens it too; a match that is no longer active opens the profile instead. View Profile returns to the profile it was opened from. Two photo cards ("You" and the partner's full name, with roles) and a heart.
- **Status:** matches Android.
### Introduction with a match request
- **Native (current build):** the match request has an optional Introduction ("You can introduce yourself here (Optional)").
- **Web:** the same, in the Request a Match confirmation (content keys `match_introduction_title` / `match_introduction_message`). It's sent as `introduction` with `POST users/matches`, up to 1000 characters (the server's limit, shown with a counter). The partner sees its first line on the request card in Profile → Matches → Requests (tapping it opens the whole introduction with the sender's photo and name), and the whole text inside the Accept and Reject confirmations on the sender's profile (`match_introduction`).
- **Status:** matches native.

### Client Certifications
- **Native:** choosing a Certification is optional.
- **Web:** optional too (it used to be required in the client preferences); the server accepts an empty list.
- **Status:** matches native.

### New chat messages
- **Android:** an open conversation and the conversation list each check every 10 seconds.
- **Web:** the same: an open conversation re-checks every 10 seconds while visible (and when the window regains focus), and the conversation list updates itself every 10 seconds while it is open, keeping the pages already loaded.
- **Status:** matches Android (parity review v4.0, K1).

### Conversations that can't take messages
- **Web and Android:** with someone who is no longer a match, the typing box is turned off, the send button turns grey and `chat_screen_match_check` ("You can only send messages to your current matches.") is shown above the box. With someone who deleted their account, they are shown as `general_deleted_account` ("Deleted Account") in the conversation list, the conversation and notifications, and the conversation is closed with `chat_screen_account_deleted`. The server marks such a person with `is_deleted: true` and empty names.
- **Empty message:** Send stays active; tapping it with an empty box shows `chat_screen_message_required` ("Please type a message first.").
- **Status:** matches Android (parity review v4.0, K2–K4).

### Sending several messages quickly
- **Web and Android:** one send at a time; the next can be sent once the server has answered. The text stays in the box until then, and stays there if the send fails.
- **Status:** matches Android (since 2026-10-10).
### Chat bubble side
- **Android:** chooses the side by `is_from_caregiver` only, so a client sees their own messages on the left.
- **Web:** your own messages are always on the right.
- **Reason:** Android bug; not copied.
- **Status:** intentional.

### Times
- **Web and Android:** message times are shown exactly as the server stores them (UTC), not converted.
- **Status:** matches Android (client requests, 2026-10-10 and 2026-10-11). Notification and issue dates are shown as stored too.
### Session refresh
- **Web and Android:** when the server refuses a request, for any reason, the session is renewed with `auth/refresh`, sending only `version_app`, and the request is sent once more. The second answer is final. If the server answers the renewal with an error (a server error included), the person is signed out. Only when the server can't be reached at all does the Connection Problem window open; it offers Retry until a renewal succeeds, then closes. Anything that failed while it was open has shown its own error and is not sent again.
- **Connection drops:** only reads are retried (up to 3 times); actions are never repeated automatically.
- **Status:** matches Android (parity review v4.0, Q1 and Q2).
### Reviews
- **Web:** finished matches show no reviews: no stars, comments or Review button (client request, 2026-10-10). Review data on the server is untouched.
- **Status:** client decision.
### Delete Account reason
- **Android:** the reason is required; the delete call takes a non-optional reason ID, although the screen text says "Optional".
- **Web:** the reason is required, and Delete stays disabled until one is chosen.
- **Reason:** parity with Android's actual behaviour.
- **Awareness checkbox:** the web (and iOS) also ask the user to tick "I am aware of the consequences of this decision." (content key `delete_account_confirm`). The Android build never uses that key, so native has no checkbox.
- **Status:** the reason matches Android. The checkbox is a **product decision pending** (client feedback, 2026-10-06). It's kept until confirmed, because it guards an irreversible action.

### Forgot Password
- **Web and Android:** after the email is confirmed, one Set Up Password screen asks for the emailed code, the new password and its confirmation, with the re-send timer. `users/password/reset` checks the code; a wrong or expired code keeps the user on that screen to correct it or ask for a new one.
- **Note:** the server limits new codes (about one every 3 minutes, growing with repeated requests); its "Please try again after N second(s)!" message is shown when the 2-minute timer allows a re-send sooner.
- **Status:** matches Android.
### After changing the password
- **Web and Android:** the person is signed out and taken back to the start, where they sign in with the new password. (If the answer to the change is lost, signing in with the new password checks whether it went through; the change is never sent twice.)
- **Status:** matches Android (parity review v4.0, O1; replaces the 2026-10-10 "stay signed in" behaviour).

### Create Account
- **Web and Android:** Continue is always active. Tapping it checks every field at once and shows each problem under its own field, in the managed texts: `general_required` for a missing entry, `signup_credentials_email_invalid`, the first password rule not met (its checklist label, e.g. "One uppercase"), `signup_credentials_password_match`, and `signup_credentials_accept_required` when the agreement isn't ticked.
- **Agreement:** `signup_credentials_consent` ("I agree to the Terms of Use and acknowledge that I have read the Privacy Policy."), with each document's name as an underlined link that opens it inside the app, scrollable and zoomable. The documents are the client's PDFs of 17 October 2026: their text (converted with `scripts/legal-pdf-to-json.py`, checked character for character against the PDF) is shown in the app, and the original PDF is linked from the viewer (`public/legal/`). No iframe is used, so the site's `X-Frame-Options: DENY` and Content-Security-Policy stay as they are.
- **Confirmation:** `signup_credentials_confirm_dialog_description`.
- **Code not sent:** if the account is created but the email code can't be sent, the code screen still opens, with Re-send available at once.
- **Unfinished sign-up:** signing in to an account whose sign-up was never finished (409 with the role in `meta`) shows the server's message and continues at the profile step.
- **Status:** matches Android (parity review v4.0, B1, C2–C5).

### Location and pay
- **Web and Android:** the map never locates the person by itself: with no location chosen it opens on the whole country, and the device location is used only after tapping My Location. A refused location permission shows `general_location_permission_denied`; continuing without a location shows `general_location_required`. Pay fields take digits only, at most 6.
- **Status:** matches Android (parity review v4.0, F1–F4).
### Editing the profile keeps the photo
- **Android (1.0.0):** sends the photo only when a new one is picked.
- **Web:** sends the current photo again with every save unless the user removed it (read through the app's own `/uploads/` path, proxied to the API host).
- **Reason:** the server removes the photo from a save that carries none. Without the resend, editing a name or bio would delete the photo.
- **Status:** intentional.

### Links, Back and roles
- **Android:** no web links.
- **Web:**
  - a signed-out user who opens a protected link returns to it after signing in;
  - the in-app Back button falls back to a sensible screen when a page was opened directly;
  - opening another role's screen by URL redirects to My Matches.
- **Reason:** the web has URLs, tabs and bookmarks.
- **Status:** intentional (platform).

### Country at sign-up
- **Android:** Create Account asks for a country.
- **Web:** it doesn't. Create Account takes the email, password, confirmation and the Terms of Use / Privacy Policy agreement only, and `auth/register` is sent `role, email, password`. Location is still collected later, on the map in the role's preferences.
- **Reason:** client decision (2026-10-07): the platform is global. The current API doesn't take a country at registration.
- **Status:** intentional (product). The native implementation is outside this web-only task.

### Screen sizes
- **Android:** phone only.
- **Web:**
  - **below 768 px:** the mobile design, with the Intro, Sign In and Create Account screens drawn from Figma;
  - **from 768 px:** a sidebar layout, with the sign-in and sign-up screens as web forms following the desktop designs;
  - **from 1024 px:** Messages shows the list and the conversation side by side.
- **Reason:** web platform.
- **Status:** intentional.

### First launch
- **Web and Android:** every reference list (copy, languages, lookup tables, US states, media, FAQs, FAQ categories) loads before the user can continue, and is downloaded again only when `base/info` reports a change. `base/cities` is asked per state and language, so it isn't a start-up list.
- **Status:** matches Android (client request, 2026-10-10).
### Notifications
- **Android:** a system notification from a 30-second poll.
- **Web:** the same poll, on the 30-second timer only, with a browser notification when the tab isn't visible. Tapping a notification opens its details; Show opens the related page.
- **Permission:** asked for as the app opens, and the app carries on whether it is allowed or not. The web asks on the first click, because browsers only allow the prompt after a user action; refusing it never blocks the site.
- **Status:** matches Android, within what browsers allow (parity review v4.0, A1).
### Map picker
- **Android:** the Android map screen (crosshair, my-location, Confirm).
- **Web:** Leaflet with OpenStreetMap tiles, with the same controls.
- **Reason:** web platform.
- **Status:** intentional.

### Response checks
- **Web and Android:** no separate "unexpected response" screen. The web keeps only the checks that protect the user (both tokens on sign-in, the user's id and role, a profile's user) and otherwise reads what the server sends, with missing lists treated as empty.
- **Status:** matches Android (client request, 2026-10-10).
### Security headers
- **Android:** not applicable.
- **Web:** Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy (see the README), plus sanitised FAQ HTML.
- **Reason:** web platform.
- **Status:** intentional.

### Pull-to-refresh
- **Web:** My Matches refreshes with a downward pull on touch screens; mouse and keyboard users reload the page or change the sort.
- **Status:** platform.

## Accepted differences (parity review v4.0, 2026-10-16)

These three stay as they are:
- **Sign-up progress** is kept for the current browser session only and cleared on a new visit (C1).
- **Profile photos** are JPEG, PNG or WebP up to 10 MB, with an explanation when a picture is refused (E1).
- **The current profile photo** is read through the website's own address (`/uploads/`, proxied to the API host) (Q3).

## Header pictures (parity review v4.0, M1)

The Messages tab uses the client's picture of a phone showing a conversation (`header_messages`, supplied 17 October 2026). The Profile tab uses the desk picture from the Android app (`bg_profile`), the same as iOS: the illustration supplied for it shows people, and we don't use pictures of people, so the client can add it themselves if they want it.
