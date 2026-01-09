\
/**
 * Kids Rental Tracker API — Cloudflare Worker + D1
 *
 * Bindings required:
 *  - DB (D1 database)
 *  - AUTH_TOKEN (environment variable) : shared PIN/token
 *
 * Route:
 *  - rentals.jd2012.work/api/*
 */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function text(msg, status = 200, extraHeaders = {}) {
  return new Response(msg, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(req) {
  const origin = req.headers.get("origin");
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}

function requireAuth(req, env) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const expected = (env.AUTH_TOKEN || "").trim();
  if (!expected) return { ok: false, status: 500, message: "AUTH_TOKEN not set" };
  if (!token || token.trim() !== expected) return { ok: false, status: 401, message: "Unauthorized" };
  return { ok: true };
}

function cuidLike() {
  // Not a real CUID; good enough unique id for rentals/items
  return (
    "r_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

async function setLastAction(env, msg) {
  await env.DB.prepare("UPDATE meta SET value=? WHERE key='last_action'").bind(String(msg)).run();
}

async function getLastAction(env) {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key='last_action'").first();
  return row ? row.value : "—";
}

async function parseJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function mustString(v, name) {
  const s = (v == null) ? "" : String(v).trim();
  if (!s) throw new Error("Missing " + name);
  if (s.length > 80) throw new Error("Too long: " + name);
  return s;
}

async function ensureOpenRental(env, passId) {
  // newest OUT rental for pass
  const existing = await env.DB
    .prepare("SELECT rental_id AS id, pass_id AS passId, out_time AS outTime, status FROM rentals WHERE pass_id=? AND status='OUT' ORDER BY out_time DESC LIMIT 1")
    .bind(passId)
    .first();

  if (existing) return existing;

  const id = cuidLike();
  const outTime = new Date().toISOString();
  await env.DB.prepare("INSERT INTO rentals(rental_id, pass_id, out_time, status) VALUES(?,?,?,'OUT')")
    .bind(id, passId, outTime)
    .run();

  return { id, passId, outTime, status: "OUT" };
}

async function createNewRental(env, passId) {
  const id = cuidLike();
  const outTime = new Date().toISOString();
  await env.DB.prepare("INSERT INTO rentals(rental_id, pass_id, out_time, status) VALUES(?,?,?,'OUT')")
    .bind(id, passId, outTime)
    .run();
  return { id, passId, outTime, status: "OUT" };
}

async function openRentalsForPass(env, passId) {
  const res = await env.DB
    .prepare("SELECT rental_id AS id, pass_id AS passId, out_time AS outTime, status FROM rentals WHERE pass_id=? AND status='OUT' ORDER BY out_time DESC LIMIT 25")
    .bind(passId)
    .all();
  return res.results || [];
}

async function outItemsByRental(env, rentalId) {
  const res = await env.DB
    .prepare("SELECT item_id AS id, rental_id AS rentalId, pass_id AS passId, gear_id AS gearId, out_time AS outTime, status FROM rental_items WHERE rental_id=? AND status='OUT' ORDER BY out_time DESC LIMIT 200")
    .bind(rentalId)
    .all();
  return res.results || [];
}

async function outItemsByPass(env, passId) {
  const res = await env.DB
    .prepare("SELECT item_id AS id, rental_id AS rentalId, pass_id AS passId, gear_id AS gearId, out_time AS outTime, status FROM rental_items WHERE pass_id=? AND status='OUT' ORDER BY out_time DESC LIMIT 200")
    .bind(passId)
    .all();
  return res.results || [];
}

async function findOutItemByGear(env, gearId) {
  return await env.DB
    .prepare("SELECT item_id AS id, rental_id AS rentalId, pass_id AS passId, gear_id AS gearId, out_time AS outTime, status FROM rental_items WHERE gear_id=? AND status='OUT' ORDER BY out_time DESC LIMIT 1")
    .bind(gearId)
    .first();
}

async function closeRentalIfEmpty(env, rentalId) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM rental_items WHERE rental_id=? AND status='OUT'")
    .bind(rentalId)
    .first();
  const c = row ? Number(row.c || 0) : 0;
  if (c !== 0) return;

  await env.DB.prepare("UPDATE rentals SET status='CLOSED', closed_time=? WHERE rental_id=? AND status='OUT'")
    .bind(new Date().toISOString(), rentalId)
    .run();
}

async function returnGear(env, gearId) {
  const outItem = await findOutItemByGear(env, gearId);
  if (!outItem) return { ok: false, reason: "not_out" };

  await env.DB.prepare("UPDATE rental_items SET status='RETURNED', return_time=? WHERE item_id=?")
    .bind(new Date().toISOString(), outItem.id)
    .run();

  await closeRentalIfEmpty(env, outItem.rentalId);
  await setLastAction(env, "Returned gear " + gearId);
  return { ok: true };
}

async function addGear(env, rentalId, passId, gearId) {
  // ignore duplicate OUT on same rental
  const dup = await env.DB.prepare("SELECT 1 FROM rental_items WHERE rental_id=? AND gear_id=? AND status='OUT' LIMIT 1")
    .bind(rentalId, gearId)
    .first();
  if (dup) {
    await setLastAction(env, "Ignored duplicate scan for " + gearId);
    return { ok: true, note: "duplicate_ignored" };
  }

  // if OUT elsewhere, auto-return it (transfer behavior)
  const outItem = await findOutItemByGear(env, gearId);
  if (outItem) {
    await env.DB.prepare("UPDATE rental_items SET status='RETURNED', return_time=? WHERE item_id=?")
      .bind(new Date().toISOString(), outItem.id)
      .run();
    await closeRentalIfEmpty(env, outItem.rentalId);
  }

  const itemId = cuidLike();
  const outTime = new Date().toISOString();
  await env.DB.prepare("INSERT INTO rental_items(item_id, rental_id, pass_id, gear_id, out_time, status) VALUES(?,?,?,?,?,'OUT')")
    .bind(itemId, rentalId, passId, gearId, outTime)
    .run();

  await setLastAction(env, "Checked OUT gear " + gearId + " to pass " + passId);
  return { ok: true };
}

async function returnAllForPass(env, passId) {
  // Return all OUT items for pass
  const items = await outItemsByPass(env, passId);

  await env.DB.prepare("UPDATE rental_items SET status='RETURNED', return_time=? WHERE pass_id=? AND status='OUT'")
    .bind(new Date().toISOString(), passId)
    .run();

  // Close any now-empty rentals for this pass
  const rentals = await openRentalsForPass(env, passId);
  for (const r of rentals) {
    await closeRentalIfEmpty(env, r.id);
  }

  await setLastAction(env, "Returned ALL items for pass " + passId + " (" + items.length + ")");
  return { ok: true, returned: items.length };
}

async function stats(env) {
  const outItemsRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM rental_items WHERE status='OUT'").first();
  const openRentalsRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM rentals WHERE status='OUT'").first();
  const lastAction = await getLastAction(env);
  return {
    totalOut: outItemsRow ? Number(outItemsRow.c || 0) : 0,
    openRentals: openRentalsRow ? Number(openRentalsRow.c || 0) : 0,
    lastAction
  };
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors });

    // auth all /api routes
    const auth = requireAuth(req, env);
    if (!auth.ok) return text(auth.message, auth.status, cors);

    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return json({ ok: true }, 200, cors);
      }

      if (path === "/api/stats") {
        const s = await stats(env);
        return json(s, 200, cors);
      }

      if (path === "/api/rentals/ensureOpen") {
        const body = await parseJson(req);
        const passId = mustString(body && body.passId, "passId");
        const rental = await ensureOpenRental(env, passId);
        await setLastAction(env, "Pass scanned: " + passId);
        return json({ rental }, 200, cors);
      }

      if (path === "/api/rentals/new") {
        const body = await parseJson(req);
        const passId = mustString(body && body.passId, "passId");
        const rental = await createNewRental(env, passId);
        await setLastAction(env, "New rental created for pass " + passId);
        return json({ rental }, 200, cors);
      }

      if (path === "/api/rentals/open") {
        const body = await parseJson(req);
        const passId = mustString(body && body.passId, "passId");
        const rentals = await openRentalsForPass(env, passId);
        return json({ rentals }, 200, cors);
      }

      if (path === "/api/items/outByRental") {
        const body = await parseJson(req);
        const rentalId = mustString(body && body.rentalId, "rentalId");
        const items = await outItemsByRental(env, rentalId);
        return json({ items }, 200, cors);
      }

      if (path === "/api/items/add") {
        const body = await parseJson(req);
        const rentalId = mustString(body && body.rentalId, "rentalId");
        const passId = mustString(body && body.passId, "passId");
        const gearId = mustString(body && body.gearId, "gearId");
        const res = await addGear(env, rentalId, passId, gearId);
        return json(res, 200, cors);
      }

      if (path === "/api/return/scan") {
        const body = await parseJson(req);
        const code = mustString(body && body.code, "code");

        // gear return first
        const outItem = await findOutItemByGear(env, code);
        if (outItem) {
          await returnGear(env, code);
          return json({ kind: "gear", message: "returned" }, 200, cors);
        }

        // treat as pass
        const items = await outItemsByPass(env, code);
        if (items.length > 0) {
          await setLastAction(env, "Pass scanned for return: " + code);
          return json({ kind: "pass", passId: code, items }, 200, cors);
        }

        await setLastAction(env, "Scan not found: " + code);
        return json({ kind: "none", message: "not_found" }, 200, cors);
      }

      if (path === "/api/return/pass") {
        const body = await parseJson(req);
        const passId = mustString(body && body.passId, "passId");
        const res = await returnAllForPass(env, passId);
        return json(res, 200, cors);
      }

      if (path === "/api/lookup/gear") {
        const body = await parseJson(req);
        const gearId = mustString(body && body.gearId, "gearId");
        const item = await findOutItemByGear(env, gearId);
        return json({ item }, 200, cors);
      }

      if (path === "/api/lookup/pass") {
        const body = await parseJson(req);
        const passId = mustString(body && body.passId, "passId");
        const items = await outItemsByPass(env, passId);
        return json({ items }, 200, cors);
      }

      return text("Not Found", 404, cors);
    } catch (e) {
      return text("Bad Request: " + (e && e.message ? e.message : String(e)), 400, cors);
    }
  },
};
