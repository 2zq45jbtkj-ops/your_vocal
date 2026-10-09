/* Общее для подарка «Талоны для Бусинки» (talony-businki.vercel.app):
   таблица gift_tasks в той же Postgres, подпись ссылок «Выполнил» и CORS. */

import { db } from "./_db.js";

export var GIFT_ORIGINS = [
  "https://talony-businki.vercel.app",
  "https://talony-businki-nikolaisept.vercel.app"
];

export function giftCors(origin) {
  var ok = GIFT_ORIGINS.indexOf(origin) !== -1;
  return {
    "access-control-allow-origin": ok ? origin : GIFT_ORIGINS[0],
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin"
  };
}

export async function giftSql() {
  var sql = db();
  if (!sql) return null;
  await sql`CREATE TABLE IF NOT EXISTS gift_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT,
    extras TEXT,
    msg_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_at TIMESTAMPTZ
  )`;
  await sql`ALTER TABLE gift_tasks ADD COLUMN IF NOT EXISTS note TEXT`;
  return sql;
}

/* id задачи генерирует страница талонов (случайный UUID) — проверяем формат. */
export function validTaskId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

/* Подпись ссылки «Выполнил»: HMAC от id на ключе токена бота —
   ссылку нельзя подделать, не зная токена. */
export async function signTask(id) {
  var token = process.env.TELEGRAM_BOT_TOKEN || "";
  var key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode("gift:" + token),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  var sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  return Array.from(new Uint8Array(sig)).slice(0, 16)
    .map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
