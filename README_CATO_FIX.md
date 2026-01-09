# Cato Secure Browsing / RBI Fix

If your POS opens the site through a secure browsing wrapper URL (example: `securebrowsing.catonetworks.com/#https://rentals.jd2012.work`),
relative fetches like `/api/stats` can be sent to the *wrapper domain* instead of your site.

This package fixes that by defaulting:

- `window.KRT_API_BASE = "https://rentals.jd2012.work"`

So the site always calls:
- `https://rentals.jd2012.work/api/...`

## What to deploy

1) **Pages (frontend):** upload the contents of `site/` (root contains `index.html`, `app.js`, `styles.css`, `config.js`)

2) **Worker (backend):** optional but recommended — update worker code with `worker/worker.js` (CORS tweak for cross-origin secure browsing)

## Quick test

Visit your site through the secure browsing URL and confirm in DevTools → Network that requests go to:
- `https://rentals.jd2012.work/api/*`
