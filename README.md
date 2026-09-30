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
npm run build      # type-check, then bundle into dist/
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
  api/          API client (timeouts, single-flight token refresh), typed services, session storage
  app/          app-wide providers: i18n, lookup-table cache, notifications, feedback, recovery
  auth/         session state and route gating
  screens/      feature screens (auth and its web cards, onboarding wizards, matches, chat, profile, settings)
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
- **Chat.** An open chat checks for new messages every 10 seconds while it's visible, and whenever the window regains focus. Messages are sent in order through a small outbox.
- **Server-side failures.** Some endpoints currently fail on the server for every client: password reset and change, issue reports, profile edit after signup, and account deletion. The app sends the documented requests and directs the user to support@carezaar.com.
