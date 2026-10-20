/* Список учеников для выбора в панели срезов (admin.html).

   Заменил api/notion-students-list.js: раньше список приходил из Notion, но
   дальше панель всё равно работает по chat_id из этой базы — то есть Notion
   был лишним звеном. Теперь читаем те же строки напрямую.

   Формат ответа оставлен прежним ({ ok, students: [{ chatId, name, status }] }),
   чтобы admin.html не переделывать. Поля status в этой таблице нет — отдаём
   пустую строку, панель её и так показывает через `s.status || ""`. */

import { db, json, isAdminChatId } from "./_db.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  var url = new URL(req.url);
  var chatId = url.searchParams.get("chatId");
  // Та же проверка, что была в notion-students-list.js: сверяем на сервере,
  // клиенту не доверяем.
  if (!isAdminChatId(chatId)) {
    return json({ ok: false, error: "Доступно только преподавателю" }, 403);
  }

  var sql = db();
  if (!sql) return json({ ok: true, configured: false, students: [] });

  try {
    var rows = await sql`
      SELECT chat_id, first_name, last_name
        FROM students
       WHERE chat_id IS NOT NULL AND chat_id <> ''`;

    var students = rows
      .map(function (r) {
        var name = ((r.first_name || "") + " " + (r.last_name || "")).trim();
        return { chatId: r.chat_id, name: name || r.chat_id, status: "" };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "ru"); });

    return json({ ok: true, configured: true, students: students });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
