# Web review status — 19 October 2026

This file supersedes the status sections of older delivery reports. Nothing here has been deployed.

## Build and tests

- 73 unit tests pass; lint passes with no warnings.
- `npm run build` (TypeScript + Vite + reference snapshot) and `npm run build:site` pass; `npm run check:site` passes its artifact checks.
- The built site was exercised in Firefox 153, WebKit 26.5 and Chrome 155 against the production API.

## Changes in this round

**Start-up time.** The API answers the 23 reference reads mostly one after another (about a second each), so a first visit waited 6.9–8.1 s. The build now saves a snapshot of every list with the server's `ts_cache` marker (`scripts/base-seed.mjs`, written to `dist/base-seed.json`). On a first visit the app uses it only when `base/info` still reports that marker — the same check that keeps a stored copy — and otherwise downloads every list as before. A first visit now opens in 1.3–1.4 s (Firefox and WebKit, 390/768/1440 px). After the server's lists change, first visits download again until the next build. Every result in each language is identical, so one snapshot serves all languages.

**Returning users.** My Matches' first page now starts alongside the session check when the stored login matches the role it last opened (`src/app/matchesPrefetch.ts`). First card: about 1.3–1.8 s, previously 2.3 s.

**Duplicate notification polling.** Each navigation restarted the 30-second notification poll and sent an extra `notifications/count` request. The poll no longer depends on the router's navigate function.

**Scene files.** A screen mounted twice in quick succession now shares one request for its design file instead of cancelling and repeating it.

Earlier corrections in this review (form labels, narrow layouts, managed validation messages, session ownership during delayed responses, chat draft and send recovery, pagination recovery, notification read state, photo preservation, 44 px phone targets and the legal-document viewer) are unchanged.

## Verification

- Regression journey against the production API with a new disposable client and the QA caregiver: sign-up with emailed code, profile, wizard, log out and in, reload, sort, favourite, request, accept, chat both ways including a burst of 10 messages in order, unmatch, FAQ, settings, protected routes, Back/Forward, three widths, account deletion and the partner's "Deleted Account" view.
- Performance: Lighthouse landing page 88 mobile / 100 desktop; on a throttled phone a first visit is usable in 3.5 s and the first match card after sign-in appears in 3.3 s; no scrolling frame over 50 ms; no duplicate API requests across both roles' main screens.
- Real clipboard paste (Chrome): Sign In, Create Account and the email-code boxes.
- The repository's browser regressions for session ownership, paging, notifications and scene errors pass on the current build.

## Not yet accepted

- **Terms of Use / Privacy Policy links.** The parity review asks for the documents to load from the server. The client's official URLs have not been supplied; the app currently shows the supplied PDFs. Configuration: `VITE_CAREZAAR_TERMS_OF_USE_URL`, `VITE_CAREZAAR_PRIVACY_POLICY_URL`.
- **System notifications.** Polling and the count work; showing an operating-system notification while the tab is in the background could not be observed under browser automation and needs a person to check.
- **Old preview links** return 404/410 rather than a redirect; changing that needs a deployment decision.
- **Built-in artwork.** By the owner's instruction, built-in images contain no people or faces. The parity items asking to restore those images (A1, F1, F2, G1, M1, M2) are intentionally not implemented. User-uploaded photos are unaffected.
