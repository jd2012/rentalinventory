# Deployment and migration

## Target and release order

Use the existing `kids-rentals-api` Worker and `kids-rentals-db` database used by the mobile apps. Do NOT deploy this migration against the older `kids-rental-tracker-db` schema in the ChatGPT mirror. Production deployment and both migrations completed on 2026-10-18. See RELEASE_STATUS.md for versions and verification. The steps below are the release procedure for reference.

1. Copy/review this implementation in the current `mobile-app` branch. Keep any other local edits. `rental-inventory-changes.patch` in the parent output directory contains changes relative to the Desktop snapshot; first use `git apply --check` before applying it.
2. Run `npm ci` in the implementation/project root. Replace `REPLACE_WITH_EXISTING_KIDS_RENTALS_DB_ID` in `wrangler.jsonc` with the ID of the existing production `kids-rentals-db`. The available source documented the database name but did not contain its ID. Preserve the existing account, routes, and custom-domain configuration. The Worker can serve the bundled website, or you can retain the existing Pages deployment and upload `site/` separately.
3. Back up and inspect the current database. Schedule a brief pause in checkouts during schema migration and Worker replacement so old code cannot insert conflicting assignments between them.

```bash
mkdir -p backups
npx wrangler d1 export kids-rentals-db --remote --output backups/before-shared-workflows.sql
npx wrangler d1 execute kids-rentals-db --remote --file worker/preflight.sql
```

All preflight result sets must be empty. If duplicate outstanding gear assignments exist, reconcile against actual guest/equipment records before proceeding. The migration intentionally fails at the unique index instead of inventing a return or deleting history.

4. Apply the incremental migration ONCE through Wrangler's migration tracker:

```bash
npx wrangler d1 migrations apply kids-rentals-db --remote
```

`worker/migrations/0002_shared_workflows.sql` adds rental due dates and notes, item notes, inventory notes, a unique outstanding assignment index, and integrity/return-completion triggers. It fills missing inventory entries from existing item history and repairs rental aggregate status. It does not recreate or erase tables. Existing due dates remain null. `worker/schema.sql` is the original schema and must NOT be substituted for the migration on production.

5. Configure separate `MOUNTAIN_VILLAGE_PIN` and `CANYONS_VILLAGE_PIN` secrets. Set a distinct administrator key and ensure timezone/origin settings match your deployment:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put MOUNTAIN_VILLAGE_PIN
npx wrangler secret put CANYONS_VILLAGE_PIN
npm run deploy:dry-run
npm run deploy
```

Set `SHOP_TIME_ZONE` to the shop's IANA timezone. `ALLOWED_ORIGINS` is a comma-separated list of actual website origins, defaulting to `https://rentals.jd2012.work`. Native mobile requests need no CORS origin. Secrets are not included in source or the patch. The compatibility date is pinned to 2026-08-06, supported by the installed test runtime; advance it only after runtime validation.

6. Publish the updated `site/` to the existing Pages site if it remains your frontend host. Keep `rentals.jd2012.work/api/*` routed to the same Worker/database. `site/config.js` retains the documented production API aliases; the frontend checks its own origin first and never sends the administrator key in a URL.
7. Update/rebuild the Expo app with `mobile/App.tsx`, `mobile/src/lib/api.ts`, and `mobile/src/types.ts` AFTER the Worker is updated. No mobile dependency change is required. `EXPO_PUBLIC_API_BASE_URL`, if set, must point to this same backend. Existing app versions continue using the preserved scan endpoints but do not persist their locally chosen review due date until updated.
8. Smoke test with designated test inventory/pass: create → confirm checkout on phone → review date on website → return one item → return remaining pass → verify CLOSED and no outstanding assignments. Test the reverse direction too. Print one physical label at 100% scale, scan it with the real equipment scanner/phone, and check sheet alignment before a large print run.

## Local setup

```bash
npm ci
cp .dev.vars.example .dev.vars
# Choose local test credentials in .dev.vars.
npx wrangler d1 execute kids-rentals-db --local --file worker/schema.sql
npx wrangler d1 migrations apply kids-rentals-db --local
npm run dev
```

The automated suite creates isolated temporary D1 databases and never touches production:

```bash
npm test
```

The browser test uses Chrome on macOS by default; set `CHROME_PATH` to your installed Chrome/Chromium executable on other systems. Tests need permission to open localhost listeners. Mobile typecheck: `cd mobile && npm install && npx tsc --noEmit` (the implementation was checked against the Desktop project's existing dependencies).

## Recovery

Keep the pre-migration SQL export and record the deployed Worker version. Restoring old application code alone is not a complete rollback: new integrity triggers intentionally reject the old silent-transfer behavior. Prefer fixing forward; if restoration is necessary, pause writes and restore the backup into a separately verified database, then switch the binding deliberately. Do not rerun the additive migration manually after it has been tracked as applied.

## Park City shops (2026-10-18)

Migration `0003_resorts_shops.sql` adds Park City, Mountain Village and Canyons Village, and required inventory/rental ownership. Existing test records default to Mountain Village. Triggers validate shops, block checkout across shops, prevent moving checked-out equipment, and preserve historical rental locations. No rows are deleted. SQLite requires validation triggers for these added columns because existing populated tables cannot accept a REFERENCES column with a non-null default.

Both clients start with resort then shop selection, fetched from the shared public `/api/locations` endpoint. Operational API calls require `x-shop-id`; older mobile versions must be reloaded/rebuilt before use. Inventory, labels, guest rentals, returns and dashboard counts are scoped to the selected shop. Return equipment at its assigned shop. Administrators retain global database/export access and can change an available inventory item's `shopId` using the shop dropdown. Location selection is an operational context, not a separate authorization role; the existing PIN works for either shop.

Deploy order: take D1 export, apply migrations, deploy Worker with `--keep-vars`, deploy `site` to the existing Pages project, then reload browsers and Expo devices. Existing secret keys and bindings do not change. Restart Expo from the Desktop repository; no app-store release is created by the website deployment.

Changed files: worker/worker.js; worker/migrations/0003_resorts_shops.sql; site/index.html, app.js, styles.css; mobile/App.tsx, mobile/src/lib/api.ts; tests/workflows.test.mjs, browser.test.mjs; scripts/verify-live.mjs; release documentation.

## Separate shop PINs

The Worker now uses independent secrets `MOUNTAIN_VILLAGE_PIN` and `CANYONS_VILLAGE_PIN`, selected by `x-shop-id` for both normal requests and authenticated health checks. The legacy `AUTH_TOKEN` is no longer accepted. `ADMIN_TOKEN` still protects global administration in addition to the selected shop PIN. Website administrator requests include the shop header; the mobile client already includes it. No database migration is needed. Set PIN values only through Worker secrets, never committed source files.

## Mixed barcode sheets and administrator deletion

Inventory printing now creates one label per distinct selected item. Use Add to sheet or selection checkboxes, then Print selected barcodes; Print all matching barcodes includes all filtered inventory across pages. Letter sheets hold 30 labels and continue onto additional pages. Single-label printing and skipped positions remain available. Repeated-label Fill sheet and copies controls were removed.

Database rows now offer confirmed administrator deletion for inventory, rental items and rentals. Outstanding equipment blocks deletion. Inventory deletion retains rental history; returned-item deletion removes that history entry; rental deletion also removes its returned item history through the existing foreign key cascade. System metadata is not deletable. No migration or secret change is required. The backend uses conditional SQL to guard against concurrent checkout/return changes.

Changed files: site/app.js, site/index.html, worker/worker.js, tests/browser.test.mjs, tests/workflows.test.mjs, scripts/verify-live.mjs and deployment notes. All 12 tests passed, including a 31-distinct-barcode print preview spanning two sheets and browser cancel/confirm deletion. Tests used local data; deployment itself deletes no production records.


## Fresh shop sign-in and search feedback (2026-10-19)

Selecting a shop always clears the saved PIN and prompts for fresh entry, including when both shops use the same PIN. Change shop also clears credentials before reloading. Inventory search now runs after typing, supports Clear search, distinguishes an empty shop from no matches, displays search errors inline, and ignores stale responses. No database migration, backend model change, or secret change is required. All 12 local tests passed, including shop switching with identical PINs and typed search/no-match/clear flows.


## Website and companion apps (2026-10-20)

Keep `site/`, `mobile/` and `worker/` in the same repository with independent client requirements. Website pass entry opens/resumes a rental directly, without a confirmation modal, and guards against overlapping pass submissions. Mobile retains pass and equipment confirmations. Website database/labels remain website-only screens. No mobile executable code, API contract, database migration, credential or status-logic changes. All 12 regression tests passed with a browser assertion that website pass entry proceeds without a modal.
