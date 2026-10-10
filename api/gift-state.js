/* Зеркало талонов для Коли: телефон Бусинки после каждого изменения присылает сюда своё
   состояние (использованные талоны, план, история, «на реализации»), а страница просмотра
   (talony-businki.vercel.app/?kolya) показывает самое свежее из них.
   Каждое устройство пишет только в свою строку, поэтому чужой телефон не может затереть её данные;
   устройство, открывшее просмотр, помечается как Колино и в показ не попадает.

   POST {device, data}          — сохранить состояние этого устройства
   POST {device, viewer:true}   — пометить устройство как Колино (просмотр)
   GET                          — последнее состояние с не-Колиных устройств */

import { GIFT_ORIGINS, giftCors } from "./_gift.js";
import { db } from "./_db.js";

export const config = { runtime: "edge" };

var MAX = 300000;

function validDevice(id) {
  return typeof id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

async function stateSql() {
  var sql = db();
  if (!sql) return null;
  await sql`CREATE TABLE IF NOT EXISTS gift_state (
    device TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    ua TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS gift_viewers (
    device TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  return sql;
}

export default async function handler(req) {
  var origin = req.headers.get("origin") || "";
  var headers = Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, giftCors(origin));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers });
  if (GIFT_ORIGINS.indexOf(origin) === -1) return new Response("{}", { status: 403, headers: headers });

  var sql = await stateSql();
  if (!sql) return new Response("{}", { status: 500, headers: headers });

  if (req.method === "GET") {
    var rows = await sql`SELECT data, updated_at FROM gift_state
      WHERE device NOT IN (SELECT device FROM gift_viewers)
      ORDER BY updated_at DESC LIMIT 1`;
    if (!rows.length) return new Response(JSON.stringify({ data: null }), { headers: headers });
    return new Response(JSON.stringify({ data: rows[0].data, updated: new Date(rows[0].updated_at).toISOString() }), { headers: headers });
  }

  if (req.method !== "POST") return new Response("{}", { status: 405, headers: headers });
  var text = await req.text();
  if (text.length > MAX) return new Response("{}", { status: 413, headers: headers });
  var body;
  try { body = JSON.parse(text); } catch (e) { return new Response("{}", { status: 400, headers: headers }); }
  if (!body || !validDevice(body.device)) return new Response("{}", { status: 400, headers: headers });

  if (body.viewer) {
    await sql`INSERT INTO gift_viewers (device) VALUES (${body.device}) ON CONFLICT (device) DO NOTHING`;
    return new Response(JSON.stringify({ ok: true }), { headers: headers });
  }

  var data = body.data;
  if (!data || typeof data !== "object" || !Array.isArray(data.coupons)) {
    return new Response("{}", { status: 400, headers: headers });
  }
  var ua = (req.headers.get("user-agent") || "").slice(0, 200);
  await sql`INSERT INTO gift_state (device, data, ua, updated_at)
    VALUES (${body.device}, ${JSON.stringify(data)}::jsonb, ${ua}, now())
    ON CONFLICT (device) DO UPDATE SET data = EXCLUDED.data, ua = EXCLUDED.ua, updated_at = now()`;
  return new Response(JSON.stringify({ ok: true }), { headers: headers });
}
