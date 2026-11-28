/* «Домашние задания» в режиме админа (28.11). Только для Николая (isAdminReq).
   GET                      — сводка по ученикам: сколько новых в каждом разделе
   GET ?student=<skey>      — все сдачи ученика (лекция → песня → распевки → караоке)
   POST {action:"check"|"uncheck", id}
   POST {action:"checkAll", skey}
   POST {action:"reply", id, text} — ответ уходит ученику в чат с ботом, сдача — «проверено» */

import { db, json, isAdminReq } from "./_db.js";
import { ensureHw, HW_CATS, fileUrl } from "./_hw.js";
import { tgApi } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (!(await isAdminReq(req))) return json({ ok: false, error: "Доступно только преподавателю" }, 403);
  var sql = db();
  if (!sql) return json({ ok: false, error: "База не подключена" }, 500);
  await ensureHw(sql);

  if (req.method === "POST") {
    var b = {};
    try { b = await req.json(); } catch (e) {}
    var id = Number(b.id) || 0;
    if (b.action === "check" && id) {
      await sql`UPDATE hw_items SET status = 'checked', checked_at = now() WHERE id = ${id}`;
      return json({ ok: true });
    }
    if (b.action === "uncheck" && id) {
      await sql`UPDATE hw_items SET status = 'new', checked_at = NULL WHERE id = ${id}`;
      return json({ ok: true });
    }
    if (b.action === "checkAll" && b.skey) {
      await sql`UPDATE hw_items SET status = 'checked', checked_at = now() WHERE skey = ${String(b.skey)} AND status = 'new'`;
      return json({ ok: true });
    }
    if (b.action === "reply" && id) {
      var text = String(b.text || "").trim().slice(0, 3500);
      if (!text) return json({ ok: false, error: "Пустой ответ" }, 400);
      var rows = await sql`SELECT * FROM hw_items WHERE id = ${id}`;
      if (!rows.length) return json({ ok: false, error: "Сдача не найдена" }, 404);
      var it = rows[0];
      if (!it.tg_id) return json({ ok: false, error: "no-tg" }, 409);
      var lesson = it.topic ? (it.lesson_no ? " (урок " + it.lesson_no + " «" + it.topic + "»)" : " («" + it.topic + "»)") : "";
      var r = await tgApi(String(process.env.TELEGRAM_BOT_TOKEN || "").trim(), "sendMessage", {
        chat_id: it.tg_id,
        text: "💬 Николай посмотрел твоё ДЗ — " + it.title + lesson + ":\n\n" + text
      }).catch(function () { return null; });
      if (!r || !r.ok) return json({ ok: false, error: (r && r.description) || "Telegram не доставил" }, 502);
      await sql`UPDATE hw_items SET status = 'checked', checked_at = now(),
        reply = CASE WHEN reply = '' THEN ${text} ELSE reply || E'\n\n' || ${text} END WHERE id = ${id}`;
      return json({ ok: true });
    }
    return json({ ok: false, error: "Неизвестное действие" }, 400);
  }

  var u = new URL(req.url);
  var skey = u.searchParams.get("student");
  if (skey) {
    var items = await sql`SELECT id, created_at, name, tg_id, is_test, cat, kind, lesson_no, topic, title, body,
        file_type, (file_id <> '' OR meta ? 'blob') AS has_file, meta, status, checked_at, reply
      FROM hw_items WHERE skey = ${skey} ORDER BY created_at DESC LIMIT 300`;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var x = items[i];
      out.push({
        id: String(x.id), at: x.created_at, cat: x.cat, kind: x.kind, lessonNo: x.lesson_no, topic: x.topic,
        title: x.title, body: x.body, fileType: x.file_type, src: x.has_file ? await fileUrl(String(x.id)) : "",
        meta: x.meta || {}, status: x.status, checkedAt: x.checked_at, reply: x.reply, test: x.is_test, canReply: !!x.tg_id
      });
    }
    out.sort(function (a, b2) {
      var d = HW_CATS.indexOf(a.cat) - HW_CATS.indexOf(b2.cat);
      return d || (new Date(b2.at) - new Date(a.at));
    });
    return json({ ok: true, name: items[0] ? items[0].name : "", items: out });
  }

  var rows2 = await sql`SELECT skey, max(name) AS name, bool_or(is_test) AS test, cat,
      count(*) FILTER (WHERE status = 'new') AS fresh, count(*) AS total, max(created_at) AS last
    FROM hw_items GROUP BY skey, cat`;
  var by = {};
  rows2.forEach(function (r) {
    var s = by[r.skey] || (by[r.skey] = { key: r.skey, name: r.name, test: false, last: r.last, fresh: 0, cats: {} });
    s.cats[r.cat] = { fresh: Number(r.fresh), total: Number(r.total) };
    s.fresh += Number(r.fresh);
    if (r.test) s.test = true;
    if (new Date(r.last) > new Date(s.last)) s.last = r.last;
  });
  var list = Object.keys(by).map(function (k) { return by[k]; });
  list.sort(function (a, b3) { return (b3.fresh > 0) - (a.fresh > 0) || new Date(b3.last) - new Date(a.last); });
  return json({ ok: true, students: list, fresh: list.reduce(function (n, s) { return n + s.fresh; }, 0) });
}
