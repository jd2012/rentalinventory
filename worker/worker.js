/**
 * Kids Rental Tracker API — Cloudflare Worker + D1
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

function csv(body, filename, extraHeaders = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
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
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const expected = (env.AUTH_TOKEN || "").trim();

  if (!expected) return { ok: false, status: 500, message: "AUTH_TOKEN not set" };
  if (!token || token !== expected) return { ok: false, status: 401, message: "Unauthorized" };

  return { ok: true };
}

function cuidLike(prefix = "r") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function parseJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function mustString(v, name) {
  const s = v == null ? "" : String(v).trim();
  if (!s) throw new Error("Missing " + name);
  if (s.length > 120) throw new Error("Too long: " + name);
  return s;
}

function cleanOptional(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

async function setLastAction(env, msg) {
  await env.DB.prepare(`
    INSERT INTO meta(key, value)
    VALUES('last_action', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `)
    .bind(String(msg))
    .run();
}

async function getLastAction(env) {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key='last_action'").first();
  return row ? row.value : "—";
}

async function ensureOpenRental(env, passId) {
  const existing = await env.DB
    .prepare(`
      SELECT rental_id AS id, pass_id AS passId, out_time AS outTime, status
      FROM rentals
      WHERE pass_id=? AND status='OUT'
      ORDER BY out_time DESC
      LIMIT 1
    `)
    .bind(passId)
    .first();

  if (existing) return existing;

  const id = cuidLike("r");
  const outTime = new Date().toISOString();

  await env.DB
    .prepare("INSERT INTO rentals(rental_id, pass_id, out_time, status) VALUES(?,?,?,'OUT')")
    .bind(id, passId, outTime)
    .run();

  return { id, passId, outTime, status: "OUT" };
}

async function createNewRental(env, passId) {
  const id = cuidLike("r");
  const outTime = new Date().toISOString();

  await env.DB
    .prepare("INSERT INTO rentals(rental_id, pass_id, out_time, status) VALUES(?,?,?,'OUT')")
    .bind(id, passId, outTime)
    .run();

  return { id, passId, outTime, status: "OUT" };
}

async function openRentalsForPass(env, passId) {
  const res = await env.DB
    .prepare(`
      SELECT rental_id AS id, pass_id AS passId, out_time AS outTime, status
      FROM rentals
      WHERE pass_id=? AND status='OUT'
      ORDER BY out_time DESC
      LIMIT 25
    `)
    .bind(passId)
    .all();

  return res.results || [];
}

async function outItemsByRental(env, rentalId) {
  const res = await env.DB
    .prepare(`
      SELECT
        item_id AS id,
        rental_id AS rentalId,
        pass_id AS passId,
        gear_id AS gearId,
        gear_type AS gearType,
        out_time AS outTime,
        status
      FROM rental_items
      WHERE rental_id=? AND status='OUT'
      ORDER BY out_time DESC
      LIMIT 200
    `)
    .bind(rentalId)
    .all();

  return res.results || [];
}

async function outItemsByPass(env, passId) {
  const res = await env.DB
    .prepare(`
      SELECT
        item_id AS id,
        rental_id AS rentalId,
        pass_id AS passId,
        gear_id AS gearId,
        gear_type AS gearType,
        out_time AS outTime,
        status
      FROM rental_items
      WHERE pass_id=? AND status='OUT'
      ORDER BY out_time DESC
      LIMIT 200
    `)
    .bind(passId)
    .all();

  return res.results || [];
}

async function findOutItemByGear(env, gearId) {
  return await env.DB
    .prepare(`
      SELECT
        item_id AS id,
        rental_id AS rentalId,
        pass_id AS passId,
        gear_id AS gearId,
        gear_type AS gearType,
        out_time AS outTime,
        status
      FROM rental_items
      WHERE gear_id=? AND status='OUT'
      ORDER BY out_time DESC
      LIMIT 1
    `)
    .bind(gearId)
    .first();
}

async function findInventoryByGear(env, gearId) {
  try {
    return await env.DB
      .prepare(`
        SELECT
          gear_id AS gearId,
          gear_type AS gearType,
          size,
          end_of_life_date AS endOfLifeDate,
          status
        FROM inventory
        WHERE gear_id=?
        LIMIT 1
      `)
      .bind(gearId)
      .first();
  } catch {
    return null;
  }
}

async function closeRentalIfEmpty(env, rentalId) {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM rental_items WHERE rental_id=? AND status='OUT'")
    .bind(rentalId)
    .first();

  const c = row ? Number(row.c || 0) : 0;
  if (c !== 0) return;

  await env.DB
    .prepare("UPDATE rentals SET status='CLOSED', closed_time=? WHERE rental_id=? AND status='OUT'")
    .bind(new Date().toISOString(), rentalId)
    .run();
}

async function returnGear(env, gearId) {
  const outItem = await findOutItemByGear(env, gearId);
  if (!outItem) return { ok: false, reason: "not_out" };

  await env.DB
    .prepare("UPDATE rental_items SET status='RETURNED', return_time=? WHERE item_id=?")
    .bind(new Date().toISOString(), outItem.id)
    .run();

  await closeRentalIfEmpty(env, outItem.rentalId);
  await setLastAction(env, "Returned gear " + gearId);

  return { ok: true };
}

async function addGear(env, rentalId, passId, gearId) {
  const dup = await env.DB
    .prepare("SELECT 1 FROM rental_items WHERE rental_id=? AND gear_id=? AND status='OUT' LIMIT 1")
    .bind(rentalId, gearId)
    .first();

  if (dup) {
    await setLastAction(env, "Ignored duplicate scan for " + gearId);
    return { ok: true, note: "duplicate_ignored" };
  }

  const outItem = await findOutItemByGear(env, gearId);
  if (outItem) {
    await env.DB
      .prepare("UPDATE rental_items SET status='RETURNED', return_time=? WHERE item_id=?")
      .bind(new Date().toISOString(), outItem.id)
      .run();

    await closeRentalIfEmpty(env, outItem.rentalId);
  }

  const inv = await findInventoryByGear(env, gearId);
  const itemId = cuidLike("i");
  const outTime = new Date().toISOString();

  await env.DB
    .prepare(`
      INSERT INTO rental_items(item_id, rental_id, pass_id, gear_id, gear_type, out_time, status)
      VALUES(?,?,?,?,?,?,'OUT')
    `)
    .bind(itemId, rentalId, passId, gearId, inv ? inv.gearType : null, outTime)
    .run();

  await setLastAction(env, "Checked OUT gear " + gearId + " to pass " + passId);

  return { ok: true, inventory: inv || null };
}

async function returnAllForPass(env, passId) {
  const items = await outItemsByPass(env, passId);

  await env.DB
    .prepare("UPDATE rental_items SET status='RETURNED', return_time=? WHERE pass_id=? AND status='OUT'")
    .bind(new Date().toISOString(), passId)
    .run();

  const rentals = await openRentalsForPass(env, passId);
  for (const r of rentals) await closeRentalIfEmpty(env, r.id);

  await setLastAction(env, "Returned ALL items for pass " + passId + " (" + items.length + ")");

  return { ok: true, returned: items.length };
}

async function stats(env) {
  const outItemsRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM rental_items WHERE status='OUT'").first();
  const openRentalsRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM rentals WHERE status='OUT'").first();

  return {
    totalOut: outItemsRow ? Number(outItemsRow.c || 0) : 0,
    openRentals: openRentalsRow ? Number(openRentalsRow.c || 0) : 0,
    lastAction: await getLastAction(env),
  };
}

async function exportData(env) {
  const rentals =
    (
      await env.DB
        .prepare(`
          SELECT
            rental_id AS rentalId,
            pass_id AS passId,
            out_time AS outTime,
            closed_time AS closedTime,
            status
          FROM rentals
          ORDER BY out_time DESC
        `)
        .all()
    ).results || [];

  const items =
    (
      await env.DB
        .prepare(`
          SELECT
            item_id AS itemId,
            rental_id AS rentalId,
            pass_id AS passId,
            gear_id AS gearId,
            gear_type AS gearType,
            out_time AS outTime,
            return_time AS returnTime,
            status
          FROM rental_items
          ORDER BY out_time DESC
        `)
        .all()
    ).results || [];

  let inventory = [];

  try {
    inventory =
      (
        await env.DB
          .prepare(`
            SELECT
              gear_id AS gearId,
              gear_type AS gearType,
              size,
              end_of_life_date AS endOfLifeDate,
              status,
              updated_at AS updatedAt
            FROM inventory
            ORDER BY gear_id
          `)
          .all()
      ).results || [];
  } catch {
    inventory = [];
  }

  return {
    exportedAt: new Date().toISOString(),
    rentals,
    items,
    inventory,
  };
}

async function upsertInventory(env, body) {
  const gearId = mustString(body && body.gearId, "gearId");
  const gearType = cleanOptional(body && body.gearType);
  const size = cleanOptional(body && body.size);
  const endOfLifeDate = cleanOptional(body && body.endOfLifeDate);
  const status = cleanOptional(body && body.status) || "ACTIVE";
  const updatedAt = new Date().toISOString();

  await env.DB
    .prepare(`
      INSERT INTO inventory(
        gear_id,
        gear_type,
        size,
        end_of_life_date,
        status,
        updated_at
      )
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(gear_id)
      DO UPDATE SET
        gear_type=excluded.gear_type,
        size=excluded.size,
        end_of_life_date=excluded.end_of_life_date,
        status=excluded.status,
        updated_at=excluded.updated_at
    `)
    .bind(gearId, gearType, size, endOfLifeDate, status, updatedAt)
    .run();

  await setLastAction(env, "Updated inventory " + gearId);

  return {
    ok: true,
    gearId,
    gearType,
    size,
    endOfLifeDate,
    status,
    updatedAt,
  };
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req);

    if (req.method === "OPTIONS") {
      return new Response("", { status: 204, headers: cors });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        const hasAuthHeader = Boolean(req.headers.get("authorization"));

        if (hasAuthHeader) {
          const auth = requireAuth(req, env);
          if (!auth.ok) return text(auth.message, auth.status, cors);
        }

        return json({ ok: true }, 200, cors);
      }

      const auth = requireAuth(req, env);
      if (!auth.ok) return text(auth.message, auth.status, cors);

      if (path === "/api/stats") {
        return json(await stats(env), 200, cors);
      }

      if (path === "/api/export.json") {
        return json(await exportData(env), 200, cors);
      }

      if (path === "/api/export.csv" || path === "/api/export") {
        const data = await exportData(env);

        const rows = data.items.map((item) => ({
          itemId: item.itemId,
          rentalId: item.rentalId,
          passId: item.passId,
          gearId: item.gearId,
          gearType: item.gearType,
          outTime: item.outTime,
          returnTime: item.returnTime,
          status: item.status,
        }));

        return csv(
          rowsToCsv(
            ["itemId", "rentalId", "passId", "gearId", "gearType", "outTime", "returnTime", "status"],
            rows
          ),
          "rental-items-export.csv",
          cors
        );
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
        return json({ rentals: await openRentalsForPass(env, passId) }, 200, cors);
      }

      if (path === "/api/items/outByRental") {
        const body = await parseJson(req);
        const rentalId = mustString(body && body.rentalId, "rentalId");
        return json({ items: await outItemsByRental(env, rentalId) }, 200, cors);
      }

      if (path === "/api/items/add") {
        const body = await parseJson(req);
        const rentalId = mustString(body && body.rentalId, "rentalId");
        const passId = mustString(body && body.passId, "passId");
        const gearId = mustString(body && body.gearId, "gearId");
        return json(await addGear(env, rentalId, passId, gearId), 200, cors);
      }

      if (path === "/api/return/scan") {
        const body = await parseJson(req);
        const code = mustString(body && body.code, "code");

        const outItem = await findOutItemByGear(env, code);

        if (outItem) {
          await returnGear(env, code);
          return json({ kind: "gear", message: "returned" }, 200, cors);
        }

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
        return json(await returnAllForPass(env, passId), 200, cors);
      }

      if (path === "/api/lookup/gear") {
        const body = await parseJson(req);
        const gearId = mustString(body && body.gearId, "gearId");
        const item = await findOutItemByGear(env, gearId);
        const inventory = item ? null : await findInventoryByGear(env, gearId);
        return json({ item, inventory }, 200, cors);
      }

      if (path === "/api/lookup/pass") {
        const body = await parseJson(req);
        const passId = mustString(body && body.passId, "passId");
        return json({ items: await outItemsByPass(env, passId) }, 200, cors);
      }

      if (path === "/api/inventory/upsert") {
        const body = await parseJson(req);
        return json(await upsertInventory(env, body), 200, cors);
      }

      if (path === "/api/inventory/gear") {
        const body = await parseJson(req);
        const gearId = mustString(body && body.gearId, "gearId");
        return json({ inventory: await findInventoryByGear(env, gearId) }, 200, cors);
      }

      return text("Not Found", 404, cors);
    } catch (e) {
      return text("Bad Request: " + (e && e.message ? e.message : String(e)), 400, cors);
    }
  },
};
