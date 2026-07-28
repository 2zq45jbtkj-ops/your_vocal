/* Карточка ученика (Кабинет: профиль + Срезы) из Notion.

   Данные ведёт сам Николай в двух связанных базах Notion — «Ученики»
   и «Срезы» (создал их структуру Claude через Notion MCP). Правки в
   Notion сразу видны в приложении — эта функция дёргает Notion API
   "вживую" при каждом открытии экрана «Кабинет», без промежуточного
   кэша/файла.

   Разовая настройка (делает сам Николай, это его секрет — сюда не пишем):
   1. notion.so/my-integrations -> New integration -> скопировать Secret.
   2. В обеих базах («Ученики» и «Срезы») через "..." -> Connections
      подключить эту интеграцию.
   3. В Vercel: Project Settings -> Environment Variables ->
      NOTION_TOKEN = вставленный secret.

   Требуется также сопоставление ученика в Notion с чатом в Telegram:
   в базе «Ученики» есть текстовое поле "Telegram chat_id" — один раз
   вписывается туда вручную (или бот сам подставит при первом заходе). */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var ASSESSMENTS_DATA_SOURCE_ID = "61be3937-4c4a-4654-9955-4e30ab9c58d2";
var NOTION_VERSION = "2025-09-03";

// Порядок и состав метрик "Срезов" — фиксированная рубрика, колонки в Notion.
var METRIC_COLUMNS = [
  "Актёрское мастерство", "Работа с микрофоном", "Дыхание", "Сила звука",
  "Регистры", "Атака и окончание звука", "Гортань", "Голосовые складки",
  "Ложные голосовые складки", "Щитовидный хрящ", "Перстневидный хрящ",
  "Черпаловидный хрящ", "Черпало-надгортанный сфинктер", "Мягкое нёбо",
  "Язык", "Нижняя челюсть", "Губы", "Анкеровка"
];

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

function richText(prop) {
  if (!prop || !prop.rich_text) return "";
  return prop.rich_text.map(function (t) { return t.plain_text; }).join("");
}
function titleText(prop) {
  if (!prop || !prop.title) return "";
  return prop.title.map(function (t) { return t.plain_text; }).join("");
}
function selectName(prop) {
  return (prop && prop.select && prop.select.name) || "";
}
function multiSelectNames(prop) {
  if (!prop || !prop.multi_select) return [];
  return prop.multi_select.map(function (o) { return o.name; });
}
function numberVal(prop) {
  return prop && typeof prop.number === "number" ? prop.number : null;
}
function initials(name) {
  var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join("");
}
function formatDate(iso) {
  if (!iso) return "";
  var d = iso.slice(0, 10).split("-");
  return d[2] + "." + d[1] + "." + d[0];
}

export default async function handler(req) {
  var url = new URL(req.url);
  var chatId = url.searchParams.get("chatId");
  if (!chatId) return json({ ok: false, error: "Нужен параметр chatId" }, 400);

  var token = process.env.NOTION_TOKEN;
  if (!token) return json({ ok: true, configured: false });

  try {
    var studentRes = await notionFetch(token, "data_sources/" + STUDENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Telegram chat_id", rich_text: { equals: String(chatId) } },
      page_size: 1
    });
    if (!studentRes.ok) {
      return json({ ok: false, configured: true, error: "Notion API (ученики): " + JSON.stringify(studentRes.data) }, 502);
    }
    var studentPage = studentRes.data.results && studentRes.data.results[0];
    if (!studentPage) {
      return json({ ok: true, configured: true, found: false });
    }
    var sp = studentPage.properties;
    var profile = {
      short: initials(titleText(sp["Имя"])),
      name: titleText(sp["Имя"]),
      age: numberVal(sp["Возраст"]),
      status: selectName(sp["Статус"]),
      lessonType: richText(sp["Тип занятий"]),
      range: richText(sp["Диапазон · тембр"]),
      voiceType: richText(sp["Тип голоса"]),
      primaryGoal: richText(sp["Первичная цель"]),
      focus: richText(sp["Вторичная цель"]),
      goals: multiSelectNames(sp["Задачи"]),
      notes: multiSelectNames(sp["Особенности"])
    };

    var assessRes = await notionFetch(token, "data_sources/" + ASSESSMENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Ученик", relation: { contains: studentPage.id } },
      sorts: [{ property: "Дата", direction: "ascending" }],
      page_size: 50
    });
    if (!assessRes.ok) {
      return json({ ok: false, configured: true, error: "Notion API (срезы): " + JSON.stringify(assessRes.data) }, 502);
    }

    var assessments = (assessRes.data.results || []).map(function (page) {
      var p = page.properties;
      var metrics = METRIC_COLUMNS
        .map(function (label) { return [label, numberVal(p[label])]; })
        .filter(function (pair) { return pair[1] != null; });
      return {
        date: formatDate(p["Дата"] && p["Дата"].date && p["Дата"].date.start),
        homework: richText(p["ДЗ"]),
        score: numberVal(p["Оценка за ДЗ"]),
        recommendations: richText(p["Рекомендации"]),
        goal: richText(p["Цель периода"]),
        metrics: metrics
      };
    });

    return json({ ok: true, configured: true, found: true, profile: profile, assessments: assessments });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
