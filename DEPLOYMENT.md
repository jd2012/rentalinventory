# Deployment guide — Cloudflare Pages + Worker + D1

## 0) Prereq
- Your DNS for `jd2012.work` is managed in Cloudflare (or you can create the needed CNAME records wherever DNS lives).

## 1) Create the D1 database
Cloudflare Dashboard → **D1** → Create database:
- Name: `kids-rentals-db`

Then run the schema:
- Open DB → Console → paste contents of `worker/schema.sql` → Execute

## 2) Create the Worker (API)
Cloudflare Dashboard → **Workers & Pages** → Create application → Worker
- Name: `kids-rentals-api`

### Bindings
In the worker settings:
- Add **D1 database binding**
  - Variable name: `DB`
  - Database: `kids-rentals-db`

### Environment variable (shared PIN)
- Add variable:
  - `AUTH_TOKEN` = set your shop PIN (example: `7431`)

### Code
Paste the contents of `worker/worker.js` into the Worker editor and deploy.

## 3) Route /api/* to the worker
In Worker settings → **Triggers** → Routes:
- Add route: `rentals.jd2012.work/api/*`

(If you want to use the same worker on staging too, add `*.jd2012.work/api/*`.)

## 4) Host the static site
Cloudflare Dashboard → **Workers & Pages** → Pages → Create project
- Upload the contents of `site/` as a static site

Set custom domain:
- `rentals.jd2012.work`

Now you have:
- Website: https://rentals.jd2012.work/
- API: https://rentals.jd2012.work/api/health

## 5) Test
Open https://rentals.jd2012.work
- Enter the PIN you set in `AUTH_TOKEN`
- Scan a pass → scan gear → check Return/Lookup

## Notes
- Because backend is shared, multiple devices will see the same OUT/RETURNED status.
- If you need per-staff accounts (instead of a shared PIN), we can add a staff table + logins.
- If you want exports, add endpoints like `/api/export.json` and `/api/export.csv`.


## If you cannot add a Worker Route
If `/api/*` isn’t mapped on `rentals.jd2012.work`, you can still use the Worker’s `workers.dev` URL.

1) Find your Worker URL (it looks like `https://<name>.<account>.workers.dev`)
2) Edit `site/config.js` and set:
   `window.KRT_API_BASE = "https://<name>.<account>.workers.dev";`
3) Re-upload the `site/` folder.
