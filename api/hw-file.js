/* Файл сдачи (видео/фото/аудио) для экрана «Домашние задания». Ссылка подписана
   (api/_hw.js → fileUrl), файл берём у Telegram по file_id и отдаём потоком,
   с перемоткой (Range). Токен бота наружу не уходит. */

import { db } from "./_db.js";
import { fileSigOk } from "./_hw.js";

export const config = { runtime: "edge" };

var TYPES = { video: "video/mp4", photo: "image/jpeg", audio: "audio/mpeg" };

function txt(t, s) { return new Response(t, { status: s, headers: { "content-type": "text/plain; charset=utf-8" } }); }

export default async function handler(req) {
  var u = new URL(req.url);
  var id = u.searchParams.get("id") || "";
  if (!/^\d+$/.test(id) || !(await fileSigOk(id, u.searchParams.get("e"), u.searchParams.get("s")))) return txt("Ссылка устарела — обнови экран", 403);
  var sql = db();
  if (!sql) return txt("База не подключена", 500);
  var rows = await sql`SELECT file_id, file_type FROM hw_items WHERE id = ${Number(id)}`;
  if (!rows.length || !rows[0].file_id) return txt("Файла нет", 404);
  var token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  var g = await fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + encodeURIComponent(rows[0].file_id)).then(function (r) { return r.json(); }).catch(function () { return null; });
  if (!g || !g.ok) return txt("Telegram не отдал файл" + (g && g.description ? ": " + g.description : ""), 502);
  var h = {};
  var range = req.headers.get("range");
  if (range) h.range = range;
  var f = await fetch("https://api.telegram.org/file/bot" + token + "/" + g.result.file_path, { headers: h });
  var out = new Headers();
  var ct = f.headers.get("content-type");
  out.set("content-type", ct && ct !== "application/octet-stream" ? ct : (/\.mov$/i.test(g.result.file_path) ? "video/quicktime" : TYPES[rows[0].file_type] || "application/octet-stream"));
  ["content-length", "content-range", "accept-ranges"].forEach(function (k) { var v = f.headers.get(k); if (v) out.set(k, v); });
  if (!out.get("accept-ranges")) out.set("accept-ranges", "bytes");
  out.set("cache-control", "private, max-age=3600");
  return new Response(f.body, { status: f.status, headers: out });
}
