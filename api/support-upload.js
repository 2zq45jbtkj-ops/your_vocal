/* «Написать в поддержку»: разрешение на загрузку файла в хранилище Vercel Blob.
   Приложение грузит фото/видео прямо в хранилище (любой размер, по частям),
   минуя лимит ~4,5 МБ на запрос к /api. Сюда приходит только просьба о
   разрешении — выдаём его лишь ученику (подпись Telegram или код доступа).
   Нужна переменная BLOB_READ_WRITE_TOKEN — Vercel добавляет её сам, когда к
   проекту подключено хранилище Blob (Storage → your-vocal-support). */

import { handleUpload } from "@vercel/blob/client";
import { identityOf, callBot, json } from "./_support.js";

async function allowed(clientPayload) {
  var p = {};
  try { p = JSON.parse(clientPayload || "{}"); } catch (e) { return false; }
  var who = identityOf(p);
  if (!who) return false;
  if (who.user) return true; // подпись Telegram проверена токеном бота
  // код доступа — спросим бот записи, есть ли такой ученик
  try {
    var r = await callBot("check", who, null, 6000);
    if (r.status === 200 && r.data && r.data.found) return true;
    if (r.status === 200 || r.status === 403) return false;
  } catch (e) {
    // бот записи не ответил — не мешаем ученику, код уже похож на настоящий
  }
  return true;
}

export async function POST(request) {
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Некорректный запрос" }, 400);
  }
  try {
    var result = await handleUpload({
      body: body,
      request: request,
      onBeforeGenerateToken: async function (pathname, clientPayload) {
        if (!/^support\/[\w.\-]+$/.test(pathname)) throw new Error("Неверное имя файла");
        if (!(await allowed(clientPayload))) throw new Error("Нет доступа");
        return {
          allowedContentTypes: ["image/*", "video/*"],
          maximumSizeInBytes: 4 * 1024 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 3 * 60 * 60 * 1000
        };
      }
    });
    return json(result);
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 400);
  }
}
