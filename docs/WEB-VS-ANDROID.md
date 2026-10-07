# Web vs Android: intentional differences

The Android app is the behavioural reference for this web app. The web matches it on the domain model, API contract, validation and flows, with the exceptions listed here. Each one is **deliberate**: a platform difference, a workaround for a backend problem, a client request, or a case where Android has a bug that the web doesn't copy. **Future reviewers shouldn't treat these as defects.** A difference that isn't on this list should be treated as a bug.

Android behaviour was taken from the shipped release build (`com.carezaar.app` 1.0.0, decompiled and inspected with `dexdump`) and from running it on an emulator. Backend references (BE-xx) point to `BACKEND-ISSUES-FOR-CLIENT.md` in the delivery documents.

## Verification (Background Check) rule

| | Behaviour |
|---|---|
| **Android** | On a partner's profile, both **Message** and **Request a Match** first check the viewer's status. If the viewer isn't `VERIFIED`, they go to the Verification (Background Check) screen. A verified viewer can message only a current match; otherwise they see "You can only send messages to your current matches." |
| **Web** | The same. For an unverified viewer, **Message** and **Request a Match** open `/verification`, and nothing is sent. A verified viewer gets the request confirmation, and messaging still needs a match. **Unmatch** is not gated, so a user can always end a match. |
| **Backend** | **Not enforced.** Unverified accounts can call `POST users/matches` and `POST users/chats` directly, and the server accepts them (**BE-14**). The rule is only as strong as the apps until the server checks it too. |
| **Status** | **Product decision pending (client feedback, 2026-10-06).** The web matches Android 1.0.0, which gates both actions. The client reports that the *current* native build doesn't, and the backend developer said the server-side rule was "removed entirely" by decision. The web keeps the gate until the product team confirms which behaviour is official; removing it means dropping the two `verifiedViewer` checks in `src/screens/partner.tsx` (Message and Request a Match). |

Tests: `CR-V01` (unverified: both actions go to Background Check, no request sent) and `CR-V02` (verified: request confirmation; messaging needs a match).

## Differences

### Unmatch on the partner's profile
- **Android (1.0.0):** the red Unmatch button on a matched partner's profile opens the Matches screen, where the match is ended.
- **Web:** Unmatch asks for confirmation ("Are you sure you want to end your match with this user?"), then ends the match with `DELETE users/matches/{match_id}`, using the `match_id` from the profile. The profile switches to Request a Match, and the match moves to History for both people; earlier History records are kept.
- **Reason:** requested by the client in the code review. Android's withdraw-by-partner endpoint (`DELETE users/matches/{partner_id}/withdraw/partner`) isn't used at all. Since the backend fix of 2026-10-02 it only cancels a pending request the caller sent, and answers 400 on an active match (verified live).
- **Status:** intentional (client request).

### Request a Match → Pending
- **Android:** after a request, opens `Pending/{id}`, "Waiting for a Match", with Keep Exploring.
- **Web:** the same screen, at `/pending/:id`, with Android's text. There are some additions:
  - the profile reads `is_match` / `match_id`: reopening it shows **Pending Acceptance** (the user's own request) or **Pending Review** (the partner's request), never a second Request a Match;
  - the sender's Pending screen has **Cancel Request**, which withdraws the request with `DELETE users/matches/{match_id}/withdraw` and returns to the profile;
  - `POST users/matches` can answer with an active match (`is_active: true`), when the partner had already asked; the app then stays on the profile, which shows the match, instead of opening Pending;
  - if the request was accepted meanwhile, Pending opens the partner's profile; if it was withdrawn, it says the request is no longer pending.

  The web also corrects Android's text typo `{PARTER}` and "Tap the {name}'s picture card".
- **Reason:** web users can refresh and deep-link, so the state has to come from the server; the backend now reports it (`match_id`, `is_active`).
- **Status:** intentional.

### Introduction with a match request
- **Native (current build):** the match request has an optional Introduction ("You can introduce yourself here (Optional)").
- **Web:** the same, in the Request a Match confirmation (content keys `match_introduction_title` / `match_introduction_message`). It's sent as `introduction` with `POST users/matches`, up to 1000 characters (the server's limit, shown with a counter). The partner sees it on the request in Profile → Matches → Requests and on the Pending screen.
- **Status:** matches native.

### Client Certifications
- **Native:** choosing a Certification is optional.
- **Web:** optional too (it used to be required in the client preferences); the server accepts an empty list.
- **Status:** matches native.

### Background Check messages
- **Android:** the same rules (see `src/validation/backgroundCheck.ts`). Invalid fields are only highlighted.
- **Web:** the same rules and field highlighting. A blank field says "This field is required.", and a wrong format says what's expected (for example "Enter the 9-digit Social Security Number, for example 123-45-6789."). The SSN is masked, with Show/Hide.
- **Reason:** clearer error messages; the Figma frame draws the SSN masked.
- **Status:** intentional (the rules are identical).

### New chat messages
- **Android:** the conversation refreshes when a Firebase (FCM) push arrives.
- **Web:** an open conversation re-checks every 10 seconds while visible, and immediately when the window regains focus.
- **Reason:** the backend has no web push channel.
- **Status:** intentional (platform).

### Sending several messages quickly
- **Android:** one send at a time; the screen waits for each.
- **Web:** messages appear at once as "Sending", then go out in order. If sending fails, every unsent text is put back in the message box.
- **Reason:** each send takes about 1.3 s on the server (**BE-12**), and the web mustn't lose or reorder text.
- **Status:** intentional.

### Chat bubble side
- **Android:** chooses the side by `is_from_caregiver` only, so a client sees their own messages on the left.
- **Web:** your own messages are always on the right.
- **Reason:** Android bug; not copied.
- **Status:** intentional.

### Times
- **Android:** shows the server's UTC timestamps unchanged.
- **Web:** converts them to the user's local time.
- **Reason:** Android shows the wrong local time.
- **Status:** intentional.

### Session refresh
- **Android:** refreshes the token with no request body; the server answers 422 and the user is signed out.
- **Web:** sends the login device fields, and the session renews silently.
- **Reason:** the backend requires the fields (**BE-06**).
- **Status:** intentional.

### Review comment
- **Android:** the comment is optional.
- **Web:** the comment is required.
- **Reason:** the server fails without one (**BE-07**). Make it optional again when that's fixed.
- **Status:** intentional (temporary).

### Delete Account reason
- **Android:** the reason is required; the delete call takes a non-optional reason ID, although the screen text says "Optional".
- **Web:** the reason is required, and Delete stays disabled until one is chosen.
- **Reason:** parity with Android's actual behaviour.
- **Awareness checkbox:** the web (and iOS) also ask the user to tick "I am aware of the consequences of this decision." (content key `delete_account_confirm`). The Android build never uses that key, so native has no checkbox.
- **Status:** the reason matches Android. The checkbox is a **product decision pending** (client feedback, 2026-10-06). It's kept until confirmed, because it guards an irreversible action.

### Forgot Password
- **Android:** after the emailed code is entered, it calls `users/otp/verify` and then opens the signup profile screen. Nothing in the release build opens its Set Up Password screen, so the new password is never set.
- **Web:** Forgot Password → code → Set Up Password → `users/password/reset` with the code, then Sign In. The code screen doesn't call `otp/verify` in this flow, because the server uses a code up once verified and the reset would then refuse it. The reset checks the code, and a wrong or expired code returns the user to the code screen with the server's message.
- **Reason:** Android bug, not copied; server behaviour (BE-01 caveat).
- **Status:** intentional.

### After changing the password
- **Android:** restarts at the splash screen.
- **Web:** signs the user out and opens the start screen (Intro), where they sign in with the new password.
- **Reason:** the web equivalent of Android's restart. The web signs out explicitly, so the old session can't outlive the password change.
- **Status:** intentional.

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
- **Web:** it doesn't. Create Account takes the email, password, confirmation and licence agreement only, and `auth/register` is sent `role, email, password`. Location is still collected later, on the map in the role's preferences.
- **Reason:** client decision (2026-10-07): the platform is global. The current API doesn't take a country at registration.
- **Status:** intentional (product). iOS should do the same.

### Screen sizes
- **Android:** phone only.
- **Web:**
  - **below 768 px:** the mobile design, with the Intro, Sign In and Create Account screens drawn from Figma;
  - **from 768 px:** a sidebar layout, with the sign-in and sign-up screens as web forms following the desktop designs;
  - **from 1024 px:** Messages shows the list and the conversation side by side.
- **Reason:** web platform.
- **Status:** intentional.

### First launch
- **Android:** waits on a loading sheet until every lookup table has loaded.
- **Web:** opens as soon as the text and language tables arrive; the other tables load in the background.
- **Reason:** the backend is slow on these tables (**BE-12**).
- **Status:** intentional.

### Notifications
- **Android:** a system notification from a 30-second poll.
- **Web:** the same poll, with a browser notification when the tab isn't visible.
- **Reason:** web platform.
- **Status:** intentional.

### Map picker
- **Android:** the Android map screen (crosshair, my-location, Confirm).
- **Web:** Leaflet with OpenStreetMap tiles, with the same controls.
- **Reason:** web platform.
- **Status:** intentional.

### Runtime response checks
- **Android:** Kotlin serialization fails on malformed JSON.
- **Web:** `src/api/schema.ts` checks the session, the user, profiles, matches and lookup tables. A malformed response shows an error with Try Again, rather than a broken screen.
- **Reason:** TypeScript types don't exist at runtime.
- **Status:** intentional.

### Security headers
- **Android:** not applicable.
- **Web:** Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy (see the README), plus sanitised FAQ HTML.
- **Reason:** web platform.
- **Status:** intentional.
