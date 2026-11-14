# Rental Inventory — website and companion apps

The website, iPhone/Android companion apps, and shared backend are maintained together in `/Users/jd/Desktop/rentalinventory`. Synced ChatGPT project sources remain read-only reference material.

Both clients use `https://rentals.jd2012.work` (fallback: `https://kids-rentals-api.codingjoe14.workers.dev`) and the existing `kids-rentals-db` D1 schema. No new production database should be created. Existing text IDs, endpoint names, and `OUT`/`CLOSED` rental statuses remain compatible.

## Independent clients in one repository

- `site/`: website for counter operations, inventory creation, database administration and barcode printing. Pass entry opens/resumes a rental directly.
- `mobile/`: iPhone and Android companion apps for scanning, checkout, returns and inventory lookup. Keep the mobile pass/equipment confirmation screens; do not copy website workflow changes into the apps automatically.
- `worker/`: shared API and database rules for both clients. Equipment ownership, assignment, due dates and rental status stay consistent.

UI requirements and releases are independent. Website deployments do not publish mobile builds. Database administration and label printing are website tools, not companion-app screens. Sharing a backend does not require identical screens or confirmation steps.

## Included

- Website: enter or scan pass directly → confirm gear → item confirmed → review all saved rental items → choose due date → finish.
- Individual equipment returns and pass returns; final item return closes its rental atomically. Separate return result view.
- Inventory creation with duplicate/type/status/date validation; searchable paginated inventory.
- Code 128 labels: single 3 × 1 inch label; distinct selected items across pages; all search matches; 30 labels per sheet; skip used positions. US Letter sheets use 3 columns × 10 rows of 2⅝ × 1 inch labels. Preview includes an explicit print button. Renderer is bundled, no CDN dependency.
- Administrator area: browse every inventory, rental, assignment-history, and metadata record. Edit inventory attributes, rental due dates/notes, item notes, and last-action metadata. Return individual assignments and close empty rentals. Identity and historical assignment fields are read-only to keep related records consistent; reassignment uses return then checkout. Administrator-confirmed deletion is available; outstanding equipment blocks deletion.
- JSON backup includes all four data groups; CSV export retains existing endpoint aliases and neutralizes spreadsheet formulas. Existing import/wipe buttons were placeholders, not working features, and are removed.
- Mobile: Finish rental persists the date, resumed rentals reload their saved date and complete equipment list, lookups show due dates, size, and overdue status. Unknown inventory displays UNKNOWN rather than AVAILABLE.

## Status and data rules

Inventory condition (`ACTIVE`, `REPAIR`, `RETIRED`, `LOST`) is distinct from item rental status (`OUT`, `RETURNED`). A rental is `OUT` until all its assigned items are returned, then `CLOSED`. Empty rentals opened by pass entry remain open until explicitly closed or returned by pass; this preserves the existing scan-first flow. Equipment must be registered and ACTIVE before checkout. Duplicate scans on the same rental are idempotent; assignment to a different rental is rejected, with no silent transfer.

Each confirmed item is saved immediately, as in the mobile app. Finish rental saves the selected due date; it is not a second checkout transaction. New rentals default to tomorrow in `SHOP_TIME_ZONE` (America/Denver). Existing historical rentals keep a null due date until an administrator supplies one. Dates are calendar dates, and a rental becomes overdue on the following shop-calendar day. Overdue is computed, not a competing stored rental status.

Shop staff authenticate with the selected shop’s `MOUNTAIN_VILLAGE_PIN` or `CANYONS_VILLAGE_PIN` secret. Full database browsing/export/editing additionally requires a separate `ADMIN_TOKEN`; the website keeps that key in memory only. This retains the existing shared-PIN model rather than introducing staff accounts.

See [DEPLOYMENT.md](DEPLOYMENT.md) for migration and release order, and [VALIDATION.md](VALIDATION.md) for tests and limits.
