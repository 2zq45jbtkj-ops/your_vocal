/* 26.11: мост приложение → бот записи (vocal-bot /api/app_admin, /api/app_book).
   Приложение не всегда открыто внутри Telegram (иконка на экране, браузер) — тогда у него
   нет подписи Telegram, и бот отказывал. Здесь личность проверяется так же, как во всём
   приложении (подпись Telegram или ключ преподавателя), и бот получает свежую подпись
   от имени того же бота (TELEGRAM_BOT_TOKEN — тот же бот, через который открыто приложение). */
import { json, isAdminReq, verifiedTgId } from "./_db.js";
export const config = { runtime: "edge" };
var BOT = "https://vocal-bot.vercel.app/api/";
var PATHS = { app_admin: 1, app_book: 1 };
function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
async function hmac(key, msg) {
  var k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}
async function sign(user, token) {
  var p = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) };
  var dcs = Object.keys(p).sort().map(function (k) { return k + "=" + p[k]; }).join("\n");
  var secret = await hmac(new TextEncoder().encode("WebAppData"), token);
  p.hash = hex(await hmac(new Uint8Array(secret), dcs));
  return new URLSearchParams(p).toString();
}
export default async function handler(req) {
  var url = new URL(req.url);
  var path = url.searchParams.get("path") || "";
  if (!PATHS[path]) return json({ ok: false, e: "path" }, 404);
  var token = process.env.TELEGRAM_BOT_TOKEN, admin = process.env.ADMIN_CHAT_ID;
  if (!token) return json({ ok: false, e: "Бот не настроен" }, 500);
  var uid = null;
  if (await isAdminReq(req)) uid = String(admin);
  else uid = await verifiedTgId(req);
  if (!uid) return json({ ok: false, e: "Открой приложение через бота" }, 403);
  var orig = {};
  try { orig = JSON.parse(new URLSearchParams(req.headers.get("x-tg-init-data") || "").get("user") || "{}") || {}; } catch (e) {}
  var user = { id: Number(uid), first_name: orig.first_name || (uid === String(admin) ? "Николай" : "Ученик") };
  if (orig.last_name) user.last_name = orig.last_name;
  if (orig.username) user.username = orig.username;
  url.searchParams.delete("path");
  var qs = url.searchParams.toString();
  var init = { method: req.method, headers: { "X-Tg-Init-Data": await sign(user, token), "content-type": "application/json" } };
  if (req.method === "POST") init.body = await req.text();
  var r = await fetch(BOT + path + (qs ? "?" + qs : ""), init);
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
