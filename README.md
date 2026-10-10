# Carezaar Web

The web client for Carezaar, the caregiver-matching platform, built with React 19, TypeScript and Vite. It talks to the
Carezaar API (`https://new.carezaar.com/api/`) and matches the Android app's behaviour and the Carezaar Figma designs:
- **Phones (below 768 px):** the mobile designs. The Intro, Sign In and Create Account screens render the pixel-matched Figma frames.
- **Tablets and desktops (from 768 px):** a web layout. It has a sidebar with a top bar and native web sign-in and sign-up forms in a card. Desktops also show the brand photograph beside that card.
- **From 1024 px:** the Messages list and the conversation show side by side.

## Getting started

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev        # http://127.0.0.1:5173
npm run lint       # ESLint (TypeScript and React hooks rules)
npm run build      # type-check, then bundle the app into dist/
npm run build:site # app and landing together in site-dist/
npm run preview    # serve the production build locally
```

## Configuration

Set in `.env`:

| Variable | Purpose |
|---|---|
| `VITE_CAREZAAR_API_BASE_URL` | API base URL. Defaults to the production API. |
| `VITE_SITE_URL` | Public origin, used for absolute share-image URLs. Leave it empty for relative URLs. |

## Deployment

`dist/` is a static single-page app and can be served by any static host or CDN.
- **Deep links.** Every path that isn't a file must fall back to `index.html`, so that deep links work. `public/_redirects` does this on hosts that support that file; elsewhere, configure the equivalent rewrite.
- **Profile photos.** Proxy `/uploads/*` to `https://new.carezaar.com/uploads/*` (a rewrite, before the `index.html` fallback). The server removes the photo from any profile save that carries none, so Edit Profile sends the current photo again, and a browser can only read it from the app's own origin: the API host serves `/uploads/` without CORS headers. `public/_redirects` and the Vite dev/preview servers already do this. Without the proxy, Edit Profile asks the user to choose the photo again rather than remove it.
- **Security headers.** Serve these on every response:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' blob: https://new.carezaar.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(self), camera=(self), microphone=()`
- **Caching.** Files under `assets/` with a content hash in their name can be cached as immutable, and `index.html` should revalidate on every load.

## Project structure

```
src/
  api/          API client (timeouts, connection retries, single-flight session renewal), typed services, response normalisation, session storage
  app/          app-wide providers: i18n, lookup-table cache, notifications, feedback, recovery
  auth/         session state and route gating
  screens/      feature screens (auth and its web cards, onboarding wizards, matches, pending, chat, partner profile, settings)
  components/   Figma scene renderer (DesignElement and its text, image, vector parts)
  figma/        scene loading and binding of live data and behaviour to Figma nodes
  ui/           UI kit (buttons, dialogs, cards, icons), app frames, photo cropper, HTML sanitiser
  navigation/   return-to-route after sign-in
  design/       design tokens and scene types
  styles/       app styles
  validation/   form validation rules
public/
  scenes/       Figma scene data for the pixel-matched screens (splash, intro, sign-in, create account, preferences intro)
  app-assets/   icons and illustrations
```

## Notes

- **Copy.** All UI copy comes from the server (`base/contents`) in 8 languages. Arabic and Farsi render right to left.
- **Notification permission.** Required, as on Android: the browser's prompt opens on the first click, and a refusal covers the app with instructions until notifications are allowed (`src/app/NotificationGate.tsx`). Browsers with no notification support (Safari on an iPhone outside a Home Screen app) are not blocked. Automated browser tests must grant the `notifications` permission.
- **Reference lists.** Every list the app uses (copy, languages, the lookup tables, US states, media, FAQs and FAQ categories) loads before the app opens. They're cached in `localStorage` and downloaded again only when `base/info` reports a new `ts_cache`; with no connection, the stored copy is used.
- **Sessions.** Stored in `localStorage`. Nothing that needs the session (My Matches first) starts until `auth/info` has confirmed it. An in-progress signup lives in the tab's `sessionStorage`.
- **Server communication** (`src/api/client.ts`). Requests wait up to 2 minutes. A dropped connection is retried up to 3 times (1 s, 2 s, 4 s apart) for requests that are safe to repeat (GET, PUT, PATCH, DELETE and the POSTs marked `idempotent`); sending a message, a match request or an issue is never repeated. When the server refuses a request (401/403, for any reason), the session is renewed in the background (`auth/refresh` with only `version_app`) and the request sent once more; a second refusal is final. Common failures show the app's general wording; only a rejected entry (400/422) shows the server's message.
- **Lists.** Pages are requested while scrolling until the server returns an empty page, whatever `last_page` said; repeated items are dropped and a page with nothing new ends the list. My Matches has pull-to-refresh on touch screens.
- **Chat.** An open chat checks for new messages every 10 seconds while it's visible, and whenever the window regains focus. One message is sent at a time: the text stays in the box until the server confirms it. Times are shown as the server stores them. A conversation is marked unread only when it has new messages, and new messages scroll into view only if the reader is at the bottom.
- **Matching.** Partner actions use the API's explicit `match_status`: `none` → Request a Match, `sent` → "Pending Acceptance" with Cancel, `received` → Reject and Accept (the introduction is shown in their confirmations), `active` → Unmatch and Message (Message appears only for an active match). `match_id` identifies the current connection. Every action asks for confirmation on a button named after it, goes straight to the server and prevents duplicate submissions; if the match changed meanwhile the user sees "This match has changed", and if it can't be checked, "Couldn't check this match" with Try Again. A request that crosses the other person's request opens "It's a Match!".
- **Matched screen and notifications.** Accepting, a crossing request and `match_accept` notifications open `/matched/:kind/:partnerId`, decided from the partner's profile alone; a match that is no longer active opens the profile instead. Tapping a notification opens its details, and Show opens the related page (a "match ended" notification opens the partner's profile). Notifications are checked on a 30-second timer only.
- **Reporting.** Report an Issue is available from Profile only; Help Center and the desktop sidebar have no duplicate shortcut.
- **No Background Check.** Removed at the client's request (2026-10-07): there's no verification screen, gate, badge or status. Anyone can request a match; messaging needs a match.
- **Responses.** There is no separate "unexpected response" screen. `src/api/schema.ts` keeps only the checks that protect the user (both tokens on sign-in; the user's id and role; a profile's user) and otherwise normalises, e.g. a missing list becomes empty.
- **Server-side failures.** Report an Issue succeeds in the latest live checks; API failures still direct the user to support@carezaar.com. Password reset and change, profile edit and account deletion work from the web app since the server fixes of 2026-10-01/02. The same error handling stays in place should any of them fail again.
- **Password recovery.** One screen, as on Android: after the email is confirmed, Set Up Password asks for the emailed code, the new password and its confirmation, with the re-send timer. `users/password/reset` checks the code (the server uses up a code once `users/otp/verify` accepts it, so it isn't verified separately); a wrong or expired code keeps the user on the screen with what they typed. Signup still verifies its code on the code screen.
- **Changing the password.** The server ends every session of the account when the password changes, so the app signs in again with the new password straight away and the user stays signed in.
- **Profile photo.** The server removes the photo from any profile save that carries none. Edit Profile therefore reads the current photo through the app's own `/uploads/` path and sends it again with the save, so editing the name or bio keeps the photo; Remove Photo saves without one. See Deployment for the proxy this needs. Camera explicitly requests browser camera access with capture, retake, confirmation and cancellation. Gallery uses the file picker. JPEG, PNG and WebP photos up to 10 MB (not GIF) are decoded before cropping; captured/cropped uploads use the existing multipart profile endpoint.

## Further documentation

- [`docs/WEB-VS-ANDROID.md`](docs/WEB-VS-ANDROID.md): intentional differences from the Android app, including the removed Background Check.
- [`docs/FIGMA-SCENES.md`](docs/FIGMA-SCENES.md): how `public/scenes` is exported from Figma, and the Figma layer names the code relies on.

## Combined website

The corrected marketing page lives in `website/`. `npm run build:site` creates the landing at `/`, the app shell at `app.html`, and routing/security headers in `site-dist/vercel.json`. Deploy the contents of `site-dist/` to review the complete site. Private review credentials and deployment middleware stay outside this repository.
