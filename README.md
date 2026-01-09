# Kids Rental Tracker — Multi-device website (Static Frontend + Backend)

This package is designed for your setup:
- You cannot install software on the POS
- You want a *real website* at `rentals.jd2012.work`
- You want a **shared backend** so multiple devices see the same rentals

## What’s included
- `site/` — static frontend (just upload as a website)
- `worker/` — backend API (Cloudflare Worker) + `schema.sql` for a Cloudflare D1 database

## Recommended deployment (no installs on your desktops)
**Cloudflare Pages** hosts the static website  
**Cloudflare Worker + D1** hosts the backend database + API under `/api/*`

## Auth
Backend uses a shared PIN:
- Worker checks `Authorization: Bearer <PIN>`
- Frontend prompts for a PIN and stores it in browser storage

You can rotate the PIN any time in Cloudflare Worker environment variables.

See `DEPLOYMENT.md` for step-by-step setup.
