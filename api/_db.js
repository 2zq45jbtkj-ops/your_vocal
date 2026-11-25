/* Общий клиент Postgres для admin-topics.js / admin-assessments.js.
   Единственная npm-зависимость в проекте — @neondatabase/serverless: обычный
   pg-драйвер держит постоянный TCP-сокет, edge runtime Vercel этого не умеет,
   а этот драйвер работает поверх HTTP/WebSocket и совместим с edge.

   Переменная окружения POSTGRES_URL подставляется в проект автоматически
   после Storage -> Create Database -> Postgres в дашборде Vercel — вручную
   вписывать не нужно, так же как раньше не вписывали data source ID для Notion. */

import { neon } from "@neondatabase/serverless";

export function db() {
  var url = process.env.POSTGRES_URL;
  if (!url) return null;
  return neon(url);
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

/* Тот же паттерн, что в is-admin.js — сверяем chat_id с ADMIN_CHAT_ID
   на сервере, не доверяем клиенту.
   MIGRATE_SECRET — временный запасной путь (тот же приём, что SYNC_SECRET в
   sync-schedule.js): строка, которую Claude сам придумывает и вписывает в
   Vercel, чтобы один раз прогнать схему/проверить запись в базу без
   настоящего chat_id Николая. Убрать эту строку и переменную из Vercel
   после того, как всё проверено вживую. */
/* 26.11: chatId из ссылки/тела больше НЕ доказывает, кто пришёл (его мог
   подставить кто угодно). Личность берём только из подписанного Telegram
   initData (заголовок X-Tg-Init-Data), токен преподавателя baza-dannih
   (X-Site-Auth) или MIGRATE_SECRET в заголовке X-Migrate-Secret. */
function hex(buf) {
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
}
async function hmac(keyBytes, msg) {
  var k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}
export async function verifiedTgId(req) {
  return verifyInitData(req.headers.get("x-tg-init-data"));
}
export async function verifyInitData(initData) {
  initData = String(initData || "");
  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!initData || initData.length > 4096 || !token) return null;
  var p = new URLSearchParams(initData);
  var hash = p.get("hash");
  if (!hash) return null;
  var authDate = Number(p.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 7 * 24 * 3600) return null;
  var pairs = [];
  p.forEach(function (v, k) { if (k !== "hash") pairs.push([k, v]); });
  pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  var dcs = pairs.map(function (x) { return x[0] + "=" + x[1]; }).join("\n");
  try {
    var secret = await hmac(new TextEncoder().encode("WebAppData"), token);
    if (hex(await hmac(new Uint8Array(secret), dcs)) !== hash) return null;
    var user = JSON.parse(p.get("user") || "null");
    return user && user.id ? String(user.id) : null;
  } catch (e) { return null; }
}
export async function isAdminReq(req) {
  var migrateSecret = process.env.MIGRATE_SECRET;
  var given = req.headers.get("x-migrate-secret");
  if (migrateSecret && given && given === migrateSecret) return true;
  var adminId = process.env.ADMIN_CHAT_ID;
  var me = await verifiedTgId(req);
  if (adminId && me && me === String(adminId)) return true;
  var siteAuth = req.headers.get("x-site-auth") || "";
  if (siteAuth) {
    try { var c = await import("./_cover.js"); if (await c.isTeacher(siteAuth)) return true; } catch (e) {}
  }
  return false;
}

/* Находит студента по chat_id, создаёт строку, если её ещё нет (идемпотентно)
   — используется и учеником, и админом при первом обращении к новой базе. */
export async function ensureStudent(sql, chatId, firstName, lastName) {
  var rows = await sql`SELECT id FROM students WHERE chat_id = ${chatId}`;
  if (rows.length) return rows[0].id;
  var inserted = await sql`
    INSERT INTO students (chat_id, first_name, last_name)
    VALUES (${chatId}, ${firstName || ""}, ${lastName || ""})
    RETURNING id`;
  return inserted[0].id;
}
