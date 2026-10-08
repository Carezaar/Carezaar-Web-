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
  - `Permissions-Policy: geolocation=(self), camera=(), microphone=()`
- **Caching.** Files under `assets/` with a content hash in their name can be cached as immutable, and `index.html` should revalidate on every load.

## Project structure

```
src/
  api/          API client (timeouts, single-flight token refresh), typed services, runtime response schemas, session storage
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
- **Lookup tables.** They're cached in `localStorage` and only refetched when `base/info` reports a change.
- **Sessions.** Stored in `localStorage`, together with the signed-in role (only the role). On a returning visit, the first page of matches loads alongside `auth/info` instead of after it (`src/app/matchesPrefetch.ts`). An in-progress signup lives in the tab's `sessionStorage`.
- **Chat.** An open chat checks for new messages every 10 seconds while it's visible, and whenever the window regains focus. Messages appear at once as "Sending" and go out in order; unsent text returns to the box on failure.
- **Matching.** A partner's profile reads its state from the profile's own `is_match` and `match_id` (`src/screens/usePartnerMatch.ts`):
  - `is_match` → **Unmatch**, which ends the match with `DELETE users/matches/{match_id}`;
  - `match_id` without `is_match` → the user's own request is pending: **Pending Acceptance**, which opens the Pending screen (`/pending/:id`), where **Cancel Request** withdraws it with `DELETE users/matches/{match_id}/withdraw`;
  - an unanswered request from the partner (found in the request list, because `match_id` doesn't report it) → **Pending Review**;
  - otherwise → **Request a Match**. The confirmation has an optional **Introduction** (up to 1000 characters, sent as `introduction`), which the partner sees on the request and on the Pending screen. `POST users/matches` returns the existing request or match when there is one and accepts the partner's request, so the app opens Pending only when the answer has `is_active: false`; with `is_active: true` it stays on the profile, which now shows the match.

  `DELETE users/matches/{partner_id}/withdraw/partner` isn't used.
- **No Background Check.** Removed at the client's request (2026-10-07): there's no verification screen, gate, badge or status. Anyone can request a match; messaging needs a match.
- **Runtime checks.** Responses for the session, user, profiles, matches and lookup tables are validated in `src/api/schema.ts`. A malformed response shows an error with Try Again, not a broken screen.
- **Server-side failures.** Report an Issue succeeds in the latest live checks; API failures still direct the user to support@carezaar.com. Password reset and change, profile edit and account deletion work from the web app since the server fixes of 2026-10-01/02. The same error handling stays in place should any of them fail again.
- **403 responses.** The server answers 403 both for a missing or expired token and for an action the user isn't allowed to take (for example withdrawing someone else's request). Only the first, which has no field errors, refreshes the session or signs the user out (`src/api/client.ts`); the second shows the server's message.
- **Password recovery.** The server uses up an emailed code once `users/otp/verify` accepts it, so in password recovery the code screen passes the code straight to Set Up Password, and `users/password/reset` checks it. A wrong code returns the user to the code screen. Signup still verifies the code on the code screen.
- **Profile photo.** The server removes the photo from any profile save that carries none. Edit Profile therefore reads the current photo through the app's own `/uploads/` path and sends it again with the save, so editing the name or bio keeps the photo; Remove Photo saves without one. See Deployment for the proxy this needs. JPEG, PNG and WebP are accepted.

## Further documentation

- [`docs/WEB-VS-ANDROID.md`](docs/WEB-VS-ANDROID.md): intentional differences from the Android app, including the removed Background Check.
- [`docs/FIGMA-SCENES.md`](docs/FIGMA-SCENES.md): how `public/scenes` is exported from Figma, and the Figma layer names the code relies on.

## Combined website

The corrected marketing page lives in `website/`. `npm run build:site` creates the landing at `/`, the app shell at `app.html`, and routing/security headers in `site-dist/vercel.json`. Deploy the contents of `site-dist/` to review the complete site. Private review credentials and deployment middleware stay outside this repository.
