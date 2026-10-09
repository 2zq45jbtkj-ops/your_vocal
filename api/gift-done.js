/* Кнопка «✅ Выполнил» под уведомлением о талоне ведёт сюда.
   Проверяет подпись, отмечает талон выполненным, меняет сообщение в боте
   и показывает короткую страницу. Повторное нажатие ничего не ломает. */

import { giftSql, validTaskId, signTask } from "./_gift.js";

export const config = { runtime: "edge" };

function page(title, text) {
  var html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + '</title><style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#2b201c;color:#f3e9df;font:16px Georgia,serif;text-align:center;padding:24px}' +
    'h1{font-size:28px;margin:0 0 10px}p{opacity:.8;margin:0}</style></head>' +
    '<body><div><h1>' + title + '</h1><p>' + text + '</p></div></body></html>';
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

export default async function handler(req) {
  var url = new URL(req.url);
  var id = url.searchParams.get("id");
  var s = url.searchParams.get("s");
  if (!validTaskId(id) || !s || s !== (await signTask(id))) {
    return page("Ссылка не подошла", "Похоже, кнопка повреждена.");
  }

  var sql = await giftSql();
  if (!sql) return page("Нет базы", "Не удалось подключиться к базе.");

  var rows = await sql`SELECT title, icon, extras, note, msg_id, done_at FROM gift_tasks WHERE id = ${id}`;
  if (!rows.length) return page("Талон не найден", "Возможно, он уже удалён.");
  var t = rows[0];

  if (!t.done_at) {
    await sql`UPDATE gift_tasks SET done_at = now() WHERE id = ${id} AND done_at IS NULL`;

    var token = process.env.TELEGRAM_BOT_TOKEN;
    var chatId = process.env.ADMIN_CHAT_ID;
    if (token && chatId && t.msg_id) {
      var text = "✅ Выполнено\n" + (t.icon ? t.icon + " " : "") + t.title + (t.extras ? "\n✨ Допы: " + t.extras : "") + (t.note ? "\n💬 Пожелание: " + t.note : "");
      await fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: Number(t.msg_id), text: text })
      }).catch(function () {});
    }
  }

  return page("✅ Готово", "«" + esc(t.title) + "» отмечен выполненным — у Бусинки он уже в истории. Можно закрыть страницу.");
}
