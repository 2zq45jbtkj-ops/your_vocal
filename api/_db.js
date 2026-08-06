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

/* Тот же паттерн, что в notion-is-admin.js — сверяем chat_id с ADMIN_CHAT_ID
   на сервере, не доверяем клиенту.
   MIGRATE_SECRET — временный запасной путь (тот же приём, что SYNC_SECRET в
   sync-schedule.js): строка, которую Claude сам придумывает и вписывает в
   Vercel, чтобы один раз прогнать схему/проверить запись в базу без
   настоящего chat_id Николая. Убрать эту строку и переменную из Vercel
   после того, как всё проверено вживую. */
export function isAdminChatId(chatId) {
  var adminId = process.env.ADMIN_CHAT_ID;
  var migrateSecret = process.env.MIGRATE_SECRET;
  if (migrateSecret && chatId && String(chatId) === String(migrateSecret)) return true;
  return !!(adminId && chatId && String(chatId) === String(adminId));
}

/* Находит студента по chat_id, создаёт строку, если её ещё нет (идемпотентно,
   как notion-onboard.js) — используется и учеником, и админом при первом
   обращении к новой базе. */
export async function ensureStudent(sql, chatId, firstName, lastName) {
  var rows = await sql`SELECT id FROM students WHERE chat_id = ${chatId}`;
  if (rows.length) return rows[0].id;
  var inserted = await sql`
    INSERT INTO students (chat_id, first_name, last_name)
    VALUES (${chatId}, ${firstName || ""}, ${lastName || ""})
    RETURNING id`;
  return inserted[0].id;
}
