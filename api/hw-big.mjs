/* Большое видео ДЗ (больше ~4 МБ: распевки, громкометр, тренажёры) — 28.11.
   Приложение само грузит файл в закрытое хранилище (api/support-upload, папка
   support/), а сюда шлёт только запись о сдаче. Сдача ложится в «Домашние
   задания» админа, в бот — короткое «Новое ДЗ: Имя». Файл живёт 30 дней
   (api/support-cleanup), приложение играет его по подписанной ссылке. */

import { db } from "./_db.js";
import { identityOf, json, botToken, adminChat } from "./_support.mjs";
import { ensureHw, notifyShort } from "./_hw.js";

export async function POST(request) {
  var b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Некорректный запрос" }, 400); }
  var who = identityOf(b);
  if (!who) return json({ ok: false, error: "Нет доступа" }, 403);
  var path = String(b.pathname || "");
  if (!/^support\/[\w.\-]+$/.test(path)) return json({ ok: false, error: "Неверный файл" }, 400);
  var sql = db();
  if (!sql) return json({ ok: false, error: "База не подключена" }, 500);
  await ensureHw(sql);
  var first = String(b.firstName || "").slice(0, 60), last = String(b.lastName || "").slice(0, 60);
  var name = (first + " " + last).trim() || "Без имени";
  var tgId = who.user ? String(who.user.id) : "";
  var skey = tgId ? "tg:" + tgId : who.accessToken ? "code:" + who.accessToken : "name:" + name;
  var isTest = !!b.adminTest;
  var lessonNo = String(b.lessonNo || "").slice(0, 8), topic = String(b.lessonTitle || "").slice(0, 80);
  var cat = b.cat === "song" ? "song" : "warmup";
  var title = String(b.title || "Распевки, видео").slice(0, 80);
  var meta = { blob: path, size: Number(b.size) || 0, width: Number(b.width) || 0, height: Number(b.height) || 0, duration: Number(b.duration) || 0 };
  await sql`INSERT INTO hw_items (skey, name, tg_id, is_test, cat, kind, lesson_no, topic, title, body, file_id, file_type, meta)
    VALUES (${skey}, ${name}, ${tgId}, ${isTest}, ${cat}, ${cat},  ${lessonNo}, ${topic}, ${title},
            ${String(b.note || "").slice(0, 600)}, '', 'video', ${JSON.stringify(meta)})`;
  var token = botToken(), chat = adminChat();
  var lessonLine = topic ? (lessonNo ? "Урок " + lessonNo + " «" + topic + "»" : "«" + topic + "»") : "";
  if (token && chat) await notifyShort(token, chat, { skey: skey, name: name, cat: cat, lesson: lessonLine, isTest: isTest }).catch(function () {});
  return json({ ok: true });
}
