/* Страница талонов спрашивает, какие из её «на реализации» уже выполнены.
   GET /api/gift-status?ids=a,b,c  ->  { "a": "2026-10-08T…" | null, … }
   id — случайные UUID, которые знает только её телефон. */

import { GIFT_ORIGINS, giftCors, giftSql, validTaskId } from "./_gift.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  var origin = req.headers.get("origin") || "";
  var headers = Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, giftCors(origin));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers });
  if (GIFT_ORIGINS.indexOf(origin) === -1) return new Response("{}", { status: 403, headers: headers });

  var ids = (new URL(req.url).searchParams.get("ids") || "").split(",").filter(validTaskId).slice(0, 50);
  var out = {};
  if (!ids.length) return new Response("{}", { headers: headers });

  var sql = await giftSql();
  if (!sql) return new Response("{}", { status: 500, headers: headers });

  ids.forEach(function (id) { out[id] = null; });
  var rows = await sql`SELECT id, done_at FROM gift_tasks WHERE id = ANY(${ids})`;
  rows.forEach(function (r) { out[r.id] = r.done_at ? new Date(r.done_at).toISOString() : null; });
  return new Response(JSON.stringify(out), { headers: headers });
}
