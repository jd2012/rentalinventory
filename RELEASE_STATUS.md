# Website and companion-app separation — 2026-10-20

Website pass entry now opens/resumes checkout directly without a confirmation modal. Mobile pass/equipment confirmations remain unchanged. Separate client requirements documented in README.md, site/README.md and mobile/README.md, with both clients sharing worker/ data and status rules. All 12 local tests passed. Live checks confirmed matching released assets, successful health/auth checks and no browser script errors. Worker `a98b5dcc-368e-4a17-9990-12b1ddb69136`; Pages `155b54a1.rentalinventory.pages.dev`. No migration, secret or mobile runtime changes. Source synchronized to Desktop; no Git commit/push.

Previous releases below are historical.

# PIN and search fixes deployed — 2026-10-19

Worker: `903e98a8-f463-47d6-a43a-cda5f42b6de0`. Pages: `826abed7.rentalinventory.pages.dev`.
Fresh PIN required on each shop selection. Search-as-you-type, Clear search, empty-shop/no-match/error feedback, and stale response handling are live. All 12 local tests passed. Live Chrome confirmed fresh PIN entry after switching from Mountain Village to Canyons Village, successful sign-in at both, and typed search/no-match/clear behavior. General asset verification timed out waiting for network idle; the separate functional live check passed. No migrations or credential changes. Source synchronized to Desktop; no Git commit or push.

Previous releases below are historical.

# Mixed barcode sheets and database deletion deployed

Worker: `f3ab1083-671b-48c3-b9a7-2508a6b53bbd`. Pages: `2768b5fa.rentalinventory.pages.dev`.
One label per distinct selected item, 30 per sheet, with additional sheets as needed. Administrator-only confirmed deletion for inventory, returned rental items, and rentals without outstanding equipment. Inventory deletion preserves rental history. No migration or secret change. No production records were deleted. All 12 tests passed, including 31 unique barcodes across two pages, cancel/confirm deletion and backend protections. Desktop source updated; no Git commit/push. Earlier releases below are historical.

# Separate shop PINs deployed

Worker: `5f5d2509-b35e-40e3-8eb9-648467e8d650`. Pages: `5cf7c399.rentalinventory.pages.dev`.
Both shops now have independent Worker secrets. Administrator key unchanged. No schema migration. All 11 automated tests passed, including distinct per-shop test credentials. Live Chrome sign-in passed at both shops and incorrect PINs were rejected. Source applied to Desktop repository. Earlier release details below are historical.

# Two-shop release completed — 2026-10-18

Live website: https://rentals.jd2012.work/

- Worker version: `d241cb10-caf3-4554-9640-cc2bbef8e200`
- Pages deployment: `39a6212a.rentalinventory.pages.dev`
- Applied migration: `0003_resorts_shops.sql`; backup: `backups/before-shops-20261018.sql`.
- Opening workflow: Park City → Mountain Village or Canyons Village → existing shop PIN.
- Existing test data: Mountain Village has 9 equipment records and 40 rentals; Canyons Village starts empty. No rows deleted. Zero cross-shop outstanding assignments.
- New equipment belongs to the selected shop. Available equipment can be reassigned using Database → inventory → Edit → shopId. Return equipment before moving it. Rentals retain their original shop.
- Operational views, labels, checkouts, guest-pass returns and counts are scoped to the selected shop; administrator database access and exports remain global. Existing keys preserved.
- Ten automated backend/browser tests passed; final backend protection tests rerun successfully. Mobile TypeScript passed. Live Chrome verified selection, PIN screen, health/auth checks, exact live JavaScript matches and zero script errors.
- Authenticated production transactions were not repeated because the existing shop PIN is not available; these flows were tested locally against the Cloudflare runtime. Physical devices/printers remain a hands-on test.
- Updated Desktop repository on mobile-app branch; no Git commit/push or app-store binary publication. Reload/restart Expo from that repository for mobile selection screens. Older app clients must update because operational API calls now require a selected shop.

---

Previous release history follows. Deployment IDs below are superseded.

# Production release completed — 2026-10-18

Website: https://rentals.jd2012.work/
API fallback: https://kids-rentals-api.codingjoe14.workers.dev

- Worker version: `02cd076d-4bba-42ca-8eaf-22dfe945abb3`
- Pages production deployment: `fbd53b44.rentalinventory.pages.dev` (project rentalinventory, main)
- Database: kids-rentals-db (`90debba9-f69c-4cf3-8d4f-1f069b57caba`)
- Applied migrations: `0001_existing_schema.sql`, `0002_shared_workflows.sql`
- User confirmed all database entries are test data. Nine duplicate outstanding scans were marked returned and the correction was recorded in metadata. No rental or history rows were deleted.
- Final counts: 40 rentals, 30 item-history records, 9 inventory records; 0 duplicate open assignments; 0 broken assignment references.
- Existing AUTH_TOKEN shop PIN preserved. Separate ADMIN_TOKEN added. The administrator key is in the private ignored `backups/administrator-key.txt` file. Use the existing shop PIN first, then this key in the Database tab.
- Production SQL and previous Worker source are saved in `backups/`. Do not commit this directory.

## Verification

All nine local tests passed, covering browser checkout/review/date save/return/admin/labels, assignment concurrency, and migration integrity. Mobile TypeScript validation and deployment dry run passed. The browser test passed again after correcting same-origin API detection.

Live Chrome verification returned HTTP 200 for the website and health endpoint, HTTP 401 for unauthenticated stats, no browser script errors, and exact deployed matches for app.js, labels.js, and the bundled barcode renderer. Both AUTH_TOKEN and ADMIN_TOKEN are present as secrets. Remote D1 queries confirmed the counts and migration records above.

Authenticated checkout/return operations were validated locally against the Cloudflare runtime, not repeated against production because the existing shop PIN was not supplied. Physical printer/scanner and phone-camera testing remains a hardware step.

## Mobile and source status

Changes are applied to `/Users/jd/Desktop/rentalinventory` on the existing mobile-app branch. No app-store binary was published and no Git commit/push was performed. Restart/reload Expo from that checkout to load the mobile due-date persistence changes; no mobile dependency change is required.

The original ChatGPT project mirror remains untouched. The working implementation copy and Desktop checkout have the final production binding and migration configuration.
