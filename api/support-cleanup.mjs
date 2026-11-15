/* Раз в день (cron в vercel.json): стираем из хранилища файлы обращений в
   поддержку старше 30 дней — большие видео, которые ушли Николаю ссылкой, и
   брошенные загрузки (ученик закрыл приложение, не дождавшись отправки).
   Всё, что ушло в Telegram, стирается сразу при отправке (api/support.mjs). */

import { list, del } from "@vercel/blob";
import { KEEP_DAYS } from "./_support.mjs";

export async function GET(request) {
  var secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== "Bearer " + secret) {
    return new Response("forbidden", { status: 403 });
  }
  var border = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  var removed = 0, cursor;
  do {
    var page = await list({ prefix: "support/", cursor: cursor, limit: 1000 });
    var old = page.blobs.filter(function (b) { return new Date(b.uploadedAt).getTime() < border; })
      .map(function (b) { return b.url; });
    if (old.length) { await del(old); removed += old.length; }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return new Response(JSON.stringify({ ok: true, removed: removed }), { headers: { "content-type": "application/json" } });
}
