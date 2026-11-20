/* Приём событий для дашборда. POST { token, name, type, data }.
   token — код доступа ученика (тот же, что у baza-dannih); храним только его
   хэш. Николай сам в аналитику не пишется (клиент не шлёт в режиме админа). */

import { db, json } from "./_db.js";
import { ensureEvents, studentKey } from "./_events.js";

export const config = { runtime: "edge" };

var TYPES = { open: 1, step: 1, quiz: 1, hw_done: 1, hw_sent: 1, pitch: 1, kar_play: 1, kar_end: 1 };

export default async function handler(req) {
  if (req.method !== "POST") return json({ ok: false }, 405);
  var sql = db();
  if (!sql) return json({ ok: false }, 503);
  var b;
  try { b = await req.json(); } catch (e) { return json({ ok: false }, 400); }
  var token = String((b && b.token) || "").trim();
  var type = String((b && b.type) || "");
  if (!token || token.length > 200 || !TYPES[type]) return json({ ok: false }, 400);
  var data = b.data && typeof b.data === "object" ? b.data : {};
  var raw = JSON.stringify(data);
  if (raw.length > 2000) return json({ ok: false }, 413);
  var name = String(b.name || "").trim().slice(0, 120);
  try {
    await ensureEvents(sql);
    var skey = await studentKey(token);
    await sql`INSERT INTO app_events (skey, name, type, data) VALUES (${skey}, ${name}, ${type}, ${raw}::jsonb)`;
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false }, 500);
  }
}
