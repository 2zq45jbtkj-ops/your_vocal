/* Список учеников для «Режима админа» (только для Николая).

   Требует chatId в query — сервер сам сверяет его с ADMIN_CHAT_ID (тем же,
   что и в api/notion-is-admin.js/api/submit.js), и только если совпало —
   отдаёт список. Так список учеников (имена + Telegram chat_id) не может
   утащить кто угодно, кто узнает адрес эндпоинта.

   Строки без Telegram chat_id (например, размеченные "УДАЛИ МЕНЯ" тестовые
   записи с очищенным chat_id) в список не попадают — их некуда "войти". */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var NOTION_VERSION = "2025-09-03";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

function notionFetch(token, path, body) {
  return fetch("https://api.notion.com/v1/" + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify(body || {})
  }).then(function (res) {
    return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
  });
}

function titleText(prop) {
  if (!prop || !prop.title) return "";
  return prop.title.map(function (t) { return t.plain_text; }).join("");
}
function richText(prop) {
  if (!prop || !prop.rich_text) return "";
  return prop.rich_text.map(function (t) { return t.plain_text; }).join("");
}
function selectName(prop) {
  return (prop && prop.select && prop.select.name) || "";
}
function numberVal(prop) {
  return prop && typeof prop.number === "number" ? prop.number : null;
}

export default async function handler(req) {
  var url = new URL(req.url);
  var chatId = url.searchParams.get("chatId");
  var adminChatId = process.env.ADMIN_CHAT_ID;
  if (!chatId || !adminChatId || String(chatId) !== String(adminChatId)) {
    return json({ ok: false, error: "Доступно только преподавателю" }, 403);
  }

  var token = process.env.NOTION_TOKEN;
  if (!token) return json({ ok: true, configured: false, students: [] });

  try {
    var res = await notionFetch(token, "data_sources/" + STUDENTS_DATA_SOURCE_ID + "/query", { page_size: 100 });
    if (!res.ok) return json({ ok: false, configured: true, error: "Notion API (ученики): " + JSON.stringify(res.data) }, 502);

    var students = (res.data.results || [])
      .map(function (page) {
        var p = page.properties;
        return {
          chatId: richText(p["Telegram chat_id"]),
          name: titleText(p["Имя"]),
          age: numberVal(p["Возраст"]),
          status: selectName(p["Статус"])
        };
      })
      .filter(function (s) { return s.chatId; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "ru"); });

    return json({ ok: true, configured: true, students: students });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
