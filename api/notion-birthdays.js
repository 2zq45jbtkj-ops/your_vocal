/* Ближайшие дни рождения учеников — «Режим админа» (только для Николая).

   Требует chatId в query — сервер сам сверяет его с ADMIN_CHAT_ID, как и
   api/notion-students-list.js. Берёт поле "Дата рождения" (date) из
   «Ученики_Бот» — заполняется учеником самим на онбординге (см.
   api/notion-onboard.js) или Николаем вручную в Notion.

   Считаем "дни до следующего дня рождения" по месяцу/дню, год не важен:
   если день рождения в этом году уже прошёл — берём тот же день в
   следующем году. Отдаём только тех, у кого до дня рождения <= 30 дней,
   отсортированных по возрастанию. Возраст "Возраст (авто)" не трогаем
   здесь — это отдельное formula-поле в самом Notion. */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var NOTION_VERSION = "2025-09-03";
var WINDOW_DAYS = 30;

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

// UTC-полночь на сегодня — без этого расчёт дней "плывёт" от часового пояса сервера.
function todayUTC() {
  var n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

export default async function handler(req) {
  var url = new URL(req.url);
  var chatId = url.searchParams.get("chatId");
  var adminChatId = process.env.ADMIN_CHAT_ID;
  if (!chatId || !adminChatId || String(chatId) !== String(adminChatId)) {
    return json({ ok: false, error: "Доступно только преподавателю" }, 403);
  }

  var token = process.env.NOTION_TOKEN;
  if (!token) return json({ ok: true, configured: false, birthdays: [] });

  try {
    var res = await notionFetch(token, "data_sources/" + STUDENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Дата рождения", date: { is_not_empty: true } },
      page_size: 100
    });
    if (!res.ok) return json({ ok: false, configured: true, error: "Notion API (ученики): " + JSON.stringify(res.data) }, 502);

    var today = todayUTC();
    var msDay = 24 * 60 * 60 * 1000;

    var birthdays = (res.data.results || [])
      .map(function (page) {
        var p = page.properties;
        var iso = p["Дата рождения"] && p["Дата рождения"].date && p["Дата рождения"].date.start;
        if (!iso) return null;
        var parts = iso.slice(0, 10).split("-").map(Number);
        var birthYear = parts[0], month = parts[1] - 1, day = parts[2];

        var thisYear = new Date().getUTCFullYear();
        var next = Date.UTC(thisYear, month, day);
        if (next < today) next = Date.UTC(thisYear + 1, month, day);

        var daysUntil = Math.round((next - today) / msDay);
        var turningAge = new Date(next).getUTCFullYear() - birthYear;

        return {
          name: titleText(p["Имя"]),
          birthDate: iso.slice(0, 10),
          daysUntil: daysUntil,
          turningAge: turningAge
        };
      })
      .filter(function (b) { return b && b.daysUntil <= WINDOW_DAYS; })
      .sort(function (a, b) { return a.daysUntil - b.daysUntil; });

    return json({ ok: true, configured: true, birthdays: birthdays });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
