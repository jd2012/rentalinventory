/**
 * Kids Rental Tracker config
 *
 * You can force the API base by setting KRT_API_BASE to one of:
 *   - "https://rentals.jd2012.work"  (same-domain route /api/*)
 *   - "https://kids-rentals-api.codingjoe14.workers.dev" (workers.dev)
 *
 * If left blank, the app will auto-detect the working one.
 */
window.KRT_API_BASE = "";
window.KRT_API_FALLBACKS = [
  "https://rentals.jd2012.work",
  "https://kids-rentals-api.codingjoe14.workers.dev"
];
