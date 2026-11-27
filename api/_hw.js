/* Домашние задания в приложении (28.11, просьба Николая).
   Раньше каждая сдача (видео, фото, тест, дубль) приходила Николаю в бот целиком.
   Теперь сдача лежит в приложении: «Админ → Действующие ученики → Домашние задания»,
   а в бот приходит одно короткое сообщение «Новое ДЗ: Имя Фамилия» (несколько сдач
   подряд за 30 минут — одно сообщение, которое дописывается).

   Файлы хранит сам Telegram: бот тихо отправляет файл в чат Николая и сразу удаляет
   сообщение — остаётся file_id, по нему приложение показывает видео/фото/аудио
   (api/hw-file.js). Тот же file_id получает бот записи (Ученики → ДЗ, «Мои записи»).

   Разделы и порядок: лекция (тест) → задание с песней → распевки → караоке. */

import { kvGet, kvSet, tgApi } from "./_lib.js";

export var HW_CATS = ["lecture", "song", "warmup", "karaoke"];
export var HW_CAT_LABEL = { lecture: "Лекция", song: "Песня", warmup: "Распевки", karaoke: "Караоке" };

export function hwCat(kind) {
  if (kind === "quiz") return "lecture";
  if (kind === "warmup") return "warmup";
  if (kind === "karaoke-take") return "karaoke";
  return "song"; // song (фото/видео разметки), song-marks и всё прочее — между лекцией и распевками
}

var tableReady = false;
export async function ensureHw(sql) {
  if (tableReady) return;
  await sql`CREATE TABLE IF NOT EXISTS hw_items (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    skey TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    tg_id TEXT NOT NULL DEFAULT '',
    is_test BOOLEAN NOT NULL DEFAULT false,
    cat TEXT NOT NULL,
    kind TEXT NOT NULL,
    lesson_no TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    file_id TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT '',
    meta JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'new',
    checked_at TIMESTAMPTZ,
    reply TEXT NOT NULL DEFAULT ''
  )`;
  await sql`CREATE INDEX IF NOT EXISTS hw_items_skey ON hw_items (skey, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS hw_items_status ON hw_items (status)`;
  tableReady = true;
}

/* Тихая копия файла: отправить без звука в чат Николая и сразу удалить.
   Возвращает сообщение Telegram (из него берём file_id) или null. */
export async function tgStore(token, chatId, method, field, file, extra) {
  var form = new FormData();
  form.append("chat_id", chatId);
  form.append("disable_notification", "true");
  form.append(field, file, file.name || "upload");
  if (extra) Object.keys(extra).forEach(function (k) { if (extra[k]) form.append(k, String(extra[k])); });
  var res = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", body: form });
  var r = await res.json().catch(function () { return { ok: false }; });
  if (!r.ok || !r.result) return { ok: false, description: r.description };
  await tgApi(token, "deleteMessage", { chat_id: chatId, message_id: r.result.message_id }).catch(function () {});
  return { ok: true, result: r.result };
}

function catLine(cats) {
  return HW_CATS.filter(function (c) { return cats[c]; }).map(function (c) {
    return HW_CAT_LABEL[c] + (cats[c] > 1 ? " ×" + cats[c] : "");
  }).join(" · ");
}

/* Короткое уведомление в бот. Возвращает message_id (для ответа реплаем). */
export async function notifyShort(token, chatId, o) {
  var key = "hwn:" + o.skey;
  var prev = null;
  try { prev = JSON.parse((await kvGet(key)) || "null"); } catch (e) { prev = null; }
  var now = Date.now();
  var fresh = prev && prev.mid && now - prev.t < 30 * 60 * 1000 && prev.lesson === o.lesson;
  var cats = fresh ? prev.cats : {};
  cats[o.cat] = (cats[o.cat] || 0) + 1;
  var text = (o.isTest ? "🛠 Тест админа\n" : "") +
    "✅ Новое ДЗ: " + o.name + "\n" +
    catLine(cats) + (o.lesson ? "\n" + o.lesson : "") +
    "\n\nСмотри в приложении: Админ → Действующие ученики → Домашние задания";
  var mid = null;
  if (fresh) {
    var e = await tgApi(token, "editMessageText", { chat_id: chatId, message_id: prev.mid, text: text }).catch(function () { return null; });
    if (e && e.ok) mid = prev.mid;
  }
  if (!mid) {
    var s = await tgApi(token, "sendMessage", { chat_id: chatId, text: text });
    if (!s || !s.ok) return null;
    mid = s.result.message_id;
  }
  await kvSet(key, JSON.stringify({ mid: mid, t: now, cats: cats, lesson: o.lesson })).catch(function () {});
  return mid;
}

/* Подпись ссылок на файлы (видео-тег не умеет слать заголовки, поэтому ссылка
   подписана: живёт 6 часов, подделать без токена бота нельзя). */
async function hmacHex(msg) {
  var secret = "hw-file:" + String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  var k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("").slice(0, 40);
}
export async function fileUrl(id) {
  var exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  return "/api/hw-file?id=" + id + "&e=" + exp + "&s=" + (await hmacHex(id + "." + exp));
}
export async function fileSigOk(id, exp, s) {
  if (!id || !exp || !s || Number(exp) < Date.now() / 1000) return false;
  return (await hmacHex(id + "." + exp)) === s;
}
