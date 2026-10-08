# Final client feedback workflow


| ## | skill | what it changed | files touched |
| --- | --- | --- | --- |
| 1 | investigate | Traced incorrect dialog slugs, unconditional pending icon, three-line raw introduction and Profile delete entry. Existing partial removal reviewed; latest client feedback overrides old screening test expectations. | FINAL-CLIENT-CHECKLIST.md |
| 2 | diagnosing-bugs | Real UI baseline FF-MODAL and FF-DELETE failed on exact client symptoms. Fixed source controls and ran both to PASS. | screens/partner.tsx, screens/main.tsx, screens/account.tsx |
| 3 | tdd | User-specified browser/UI/API seams; failing exact-content and placement tests followed by fixes; preview edge cases red then green. | web-qa/f14-final-feedback.mjs, tests/requestPreview.test.mjs, ui/requestPreview.ts |
| 4 | new design direction/inspiration — N/A | Client explicitly requires existing app corrections without redesign; supplied native images are authoritative. | None |
| 5 | graphify | Extracted 380 symbols and 1343 edges; traced cache imports/callers with graph queries. Parser reported partial partner.tsx extraction; direct source review and TypeScript checks cover that file. Generated graph kept outside source control. | test-evidence/graphify-out |
| 6 | no-ai-design-slop | Preserved native hierarchy; reduced request text to one line, retained full detail access, centered the understated Help deletion footer; no new visual direction. | matchesManage.tsx, account.tsx, app.css |
| 7 | audit-ai-design-slop | Rendered dialog/Help/profile/signup and landing comparisons. Found contrast and footer alignment defects; corrected them using existing components. Removed stale screening share descriptions. | public/scenes/*.json, index.html, app.css, website/styles.css |
| 8 | humanizer | Kept exact client-required dialog copy; removed screening claims from share metadata, updated current README behavior, prepared concise factual client message. | index.html, README.md, CLIENT-READY-MESSAGE.md |
| 9 | iterate-until-verified | Independent review found stale cached states, metadata and inline scene colors; corrected and tested. Live browser/API, both roles, cross-browser, accessibility, responsive and regression checks recorded individually. | baseDataLoader.ts, public/scenes/*.json, web-qa/*, WEB_PRODUCTION_READINESS_REPORT.md |
| 10 | optimize-web-animations — N/A | No animations were added or changed. Existing reduced-motion behavior retained and covered by landing/browser checks. | None |
