# FeedbackProvider regression fixture

This imports the actual application FeedbackProvider. Managed i18n and decorative Icon dependencies are explicitly stubbed; it has no credentials, backend client, inbox or app account connection. Development StrictMode is enabled. The probe exposes synthetic controls, and index.html instruments timers for exact expiry/stale-callback checks.

From the repository root:

```sh
node tests/component/feedback/build.mjs
python3 -m http.server 4451 --bind 127.0.0.1 --directory tests/component/feedback
```

After native/browser foreground ownership is released, run `tests/browser/toast-component.js` through the approved connected Chrome extension. It opens/closes its own fixture tab at http://127.0.0.1:4451 and returns predicates only. Stop the identified fixture server afterward. Never reuse or kill an unknown process occupying the port.

`fixture.js` is generated, ignored locally and must not be staged. Only entry.tsx/build.mjs/index.html are source deliverables. The October18 actual private fixture recorded14PASS: identical-message replacement, real4500ms reset/expiry, distinct messages, Dismiss, stale timer, late action rejection after unmount and ordinary post-mount StrictMode. This source copy changes import/node-module paths only and is not a new runtime execution. The initial child-effect synchronous-emission StrictMode edge was not claimed by that fixture. This does not establish full app/backend/accessibility acceptance.
