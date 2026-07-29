/* «Удалить данные ученика» (Режим админа) — только для Николая.

   Настоящего удаления страниц Notion API не даёт (см. более ранние
   ограничения, с которыми мы уже сталкивались) — вместо этого:
   1. Статус ученика в «Ученики_Бот» переключается на «Завершил» — это
      закрывает ему доступ к приложению (см. app.js: если статус «Завершил»
      и это не режим админа — показывается экран «доступ закрыт»).
   2. Все его строки в базе «ДЗ» (прогресс по урокам) очищаются — чекбоксы
      Лекция/Тест/Распевки/Песня сбрасываются на false, то есть прогресс
      функционально стирается, даже если сами строки физически остаются
      в Notion (Николай может удалить их окончательно сам, если нужно).

   Двойное подтверждение (два последовательных confirm с именем ученика) —
   на клиенте, см. app.js renderAdminStudents(). Сюда долетает уже принятое
   решение, эндпоинт не переспрашивает. */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var PROGRESS_DATA_SOURCE_ID = "726838f7-738f-47dc-84a7-8a67739be77c";
var NOTION_VERSION = "2025-09-03";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

function notionRequest(token, method, path, body) {
  return fetch("https://api.notion.com/v1/" + path, {
    method: method,
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (res) {
    return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
  });
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  var token = process.env.NOTION_TOKEN;
  var adminChatId = process.env.ADMIN_CHAT_ID;
  if (!token || !adminChatId) return json({ ok: true, configured: false });

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Нужен JSON body" }, 400); }

  var callerChatId = body.chatId;
  var targetChatId = body.targetChatId;
  if (!callerChatId || String(callerChatId) !== String(adminChatId)) {
    return json({ ok: false, error: "Доступно только преподавателю" }, 403);
  }
  if (!targetChatId) return json({ ok: false, error: "Нужен targetChatId" }, 400);

  try {
    var studentRes = await notionRequest(token, "POST", "data_sources/" + STUDENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Telegram chat_id", rich_text: { equals: String(targetChatId) } },
      page_size: 1
    });
    if (!studentRes.ok) return json({ ok: false, configured: true, error: "Notion API (поиск ученика): " + JSON.stringify(studentRes.data) }, 502);
    var studentPage = studentRes.data.results && studentRes.data.results[0];
    if (!studentPage) return json({ ok: true, configured: true, found: false });

    var deactivateRes = await notionRequest(token, "PATCH", "pages/" + studentPage.id, {
      properties: { "Статус": { select: { name: "Завершил" } } }
    });
    if (!deactivateRes.ok) return json({ ok: false, configured: true, error: "Notion API (статус): " + JSON.stringify(deactivateRes.data) }, 502);

    var progressRes = await notionRequest(token, "POST", "data_sources/" + PROGRESS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Ученик", relation: { contains: studentPage.id } },
      page_size: 100
    });
    if (!progressRes.ok) return json({ ok: false, configured: true, error: "Notion API (поиск прогресса): " + JSON.stringify(progressRes.data) }, 502);

    var rows = progressRes.data.results || [];
    for (var i = 0; i < rows.length; i++) {
      await notionRequest(token, "PATCH", "pages/" + rows[i].id, {
        properties: {
          "Лекция": { checkbox: false }, "Тест": { checkbox: false },
          "Распевки": { checkbox: false }, "Песня": { checkbox: false }
        }
      });
    }

    return json({ ok: true, configured: true, found: true, resetCount: rows.length });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
