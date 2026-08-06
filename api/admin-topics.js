/* Темы и уровни колеса баланса. GET — открыт всем (ученику нужны названия тем
   для чтения своих срезов), POST — только админ.
   См. kabinet-tz.md, раздел 2 и 7. */

import { db, json, isAdminChatId } from "./_db.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  var sql = db();
  if (!sql) return json({ configured: false, levels: [], topics: [] });

  if (req.method === "GET") {
    var levels = await sql`SELECT code, letter, sort_order FROM levels ORDER BY sort_order`;
    var topics = await sql`SELECT id, title, level, sort_order, lesson_ref, is_active FROM topics ORDER BY level, sort_order, id`;
    return json({ configured: true, levels: levels, topics: topics });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }

  if (!isAdminChatId(body.chatId)) return json({ ok: false, error: "Not admin" }, 403);

  var action = body.action;

  if (action === "create-topic") {
    var maxRow = await sql`SELECT COALESCE(MAX(sort_order), 0) AS m FROM topics WHERE level = ${body.level}`;
    var row = await sql`
      INSERT INTO topics (title, level, sort_order)
      VALUES (${body.title || "Новая тема"}, ${body.level}, ${maxRow[0].m + 1})
      RETURNING id, title, level, sort_order, lesson_ref, is_active`;
    return json({ ok: true, topic: row[0] });
  }

  if (action === "rename-topic") {
    await sql`UPDATE topics SET title = ${body.title} WHERE id = ${body.topicId}`;
    return json({ ok: true });
  }

  if (action === "archive-topic") {
    // Тема не удаляется никогда — только is_active=false (см. п.2 ТЗ:
    // "Удаления темы из базы нет"). Оценки в прошлых срезах остаются как есть.
    await sql`UPDATE topics SET is_active = false WHERE id = ${body.topicId}`;
    return json({ ok: true });
  }

  if (action === "rename-level") {
    var letter = (body.letter || "?").slice(0, 2);
    await sql`UPDATE levels SET letter = ${letter} WHERE code = ${body.code}`;
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
}
