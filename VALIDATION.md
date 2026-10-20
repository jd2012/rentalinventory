# Validation and changed files

## Verified locally

Final result: **9 tests passed, 0 failed**, including the real-browser workflow.

- Cloudflare D1/runtime integration: shop/admin authorization; input and duplicate validation; checkout idempotency; shared persistent due dates; partial/final/pass returns; closure timestamps; competing concurrent assignment; service status guards; admin edits; historical notes; overdue calculation; pagination beyond 50 records; malformed input; legacy migration preserving item history and filling inventory.
- Real headless Chrome: sign in, create inventory, confirm pass/item, review order, save date, edit records, return equipment, observe CLOSED in the database. No browser script errors.
- Print preview: one individual label, a full sheet of 30, and 31 labels split across two sheets. Exact case-sensitive barcode value retained. Preview screenshots inspected. Label sheets use fixed physical units, explicit print action, white background, and no application controls in print CSS.
- Desktop and 390-pixel phone-width screenshots reviewed.
- Mobile TypeScript check passed against the existing Desktop mobile dependencies.
- Worker deployment dry run passed. Runtime/binding declarations generated.

Run `npm test` for the combined browser/database suite. Screenshots are generated in `test-results/`.

## Limits and release checks

- Production deployment completed after explicit authorization; see RELEASE_STATUS.md. No Git commit/push was made. The original project mirror remains reference material.
- Mobile source was inspected and type-checked, but no physical iOS/Android build or camera scan was run. Backend integration tests use the same request contract as the app.
- No physical printer was available. Verify 100% scale, margins, label stock, and actual scanner readability before bulk printing. Non-ASCII or excessively long identifiers are rejected by the label renderer rather than truncated or altered. Inventory itself retains its original identifiers.
- Production preflight and backup were completed. The user confirmed all entries were test data; nine duplicate assignments were reconciled before migration. Existing historical due dates remain unset.
- The installed Wrangler/Miniflare development dependency tree reported four high-severity audit entries through its image/HTTP dependencies. These packages run local tooling and are not imported by the deployed Worker or served to website clients. The deployed barcode renderer is bundled separately. Update development tooling to a compatible patched release before exposing development servers to untrusted networks; do not apply the audit's suggested major downgrade blindly.

## Changed files (relative to Desktop mobile-app snapshot)

| Files | Change |
|---|---|
| `worker/worker.js` | Shared API, validation/auth, persistent due dates, admin browsing/edits, safe equipment assignment, atomic returns, exports, CORS |
| `worker/migrations/0002_shared_workflows.sql` | Add due date/notes, backfill missing inventory, repair aggregate status, unique open assignment, integrity/return triggers |
| `worker/preflight.sql` | Read-only checks for conflicting legacy data |
| `site/index.html` | Checkout review and confirmation result views, return result, inventory creation, printing controls, database editor |
| `site/app.js` | Shared API workflows, persistent review date, pagination, management, authenticated exports, print selection |
| `site/styles.css` | Responsive forms/database layout and print-preview container |
| `site/labels.js` | Code 128 validation, individual/sheet layout, copies, offsets, preview/print |
| `site/vendor/*` | Bundled JsBarcode renderer and MIT license |
| `mobile/App.tsx` | Persist Finish rental, reload saved rental items/date, show due-date details, guard duplicate confirm taps |
| `mobile/src/lib/api.ts`, `mobile/src/types.ts` | Detail/finish API contract and date/size/overdue fields |
| `tests/*.test.mjs` | D1/runtime, legacy migration, and real-browser integration coverage |
| `package.json`, `package-lock.json`, `scripts/vendor.mjs` | Reproducible test/deploy tools and local barcode vendor script |
| `wrangler.jsonc`, `worker-configuration.d.ts` | Deployment bindings, timezone/CORS and generated types |
| `.gitignore`, `.dev.vars.example` | Exclude local credentials/build data and document secret names |
| `README.md`, `DEPLOYMENT.md`, `VALIDATION.md` | Architecture, migration/release/recovery and evidence |

`worker/schema.sql`, the existing mobile package/dependency definitions, and production API configuration in `site/config.js` remain unchanged. The older synced Django implementation remains untouched.

## Two-shop release

Ten local tests passed, including the full browser workflow and new shop selection/switching, isolated inventory and statistics, same pass at both shops, cross-shop checkout/return/detail/finish restrictions, administrator transfer restrictions, and migration on populated legacy tables. Mobile TypeScript check passed. Physical devices and printers still require hands-on verification.
