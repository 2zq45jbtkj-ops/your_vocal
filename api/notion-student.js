/* Карточка ученика (Кабинет: профиль + Срезы) + данные для разблокировки
   уроков (Уроки: последовательное открытие + персональный override) — из Notion.

   Данные ведёт сам Николай в трёх связанных базах Notion — «Ученики»,
   «Срезы» и «Прогресс» (создал их структуру Claude через Notion MCP). Правки в
   Notion сразу видны в приложении — эта функция дёргает Notion API
   "вживую" при каждом открытии экрана «Кабинет»/«Уроки», без промежуточного
   кэша/файла.

   «Прогресс» — одна строка на пару (ученик, номер урока), чекбоксы по 4
   шагам (Лекция/Тест/Распевки/Песня); туда же app.js дозаписывает прогресс
   через api/notion-progress.js по мере прохождения. «Доп. открытые уроки» —
   текстовое поле в «Ученики» со списком номеров через запятую (например
   "10, 15") — персональная разблокировка вне очереди.

   Сама строка в «Ученики» (и стартовая строка в «Срезы») создаётся
   автоматически при первом входе ученика — см. api/notion-onboard.js.

   Метрики "Срезов" (колесо баланса) — список колонок читается из схемы базы
   живьём (resolveMetricColumns): если Николай добавит новую колонку-число в
   «Срезы», она подхватится сама, без правки кода. Колесо на экране рисует
   ровно те метрики, что заполнены в конкретном срезе — не хардкод на 18.

   Разовая настройка (делает сам Николай, это его секрет — сюда не пишем):
   1. notion.so/my-integrations -> New integration -> скопировать Secret.
   2. Во всех трёх базах («Ученики», «Срезы», «Прогресс») через "..." ->
      Connections подключить эту интеграцию.
   3. В Vercel: Project Settings -> Environment Variables ->
      NOTION_TOKEN = вставленный secret.

   Требуется также сопоставление ученика в Notion с чатом в Telegram: в базе
   «Ученики» есть текстовое поле "Telegram chat_id" — заполняется само при
   первом заходе ученика (см. api/notion-onboard.js), вручную вписывать не
   нужно. */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var ASSESSMENTS_DATA_SOURCE_ID = "61be3937-4c4a-4654-9955-4e30ab9c58d2";
var PROGRESS_DATA_SOURCE_ID = "726838f7-738f-47dc-84a7-8a67739be77c";
var NOTION_VERSION = "2025-09-03";

// Известный порядок метрик "Срезов" на сегодня — стартовая часть общего
// списка колонок-метрик. Колонки НЕ входящие сюда, но добавленные Николаем
// в Notion позже, подхватываются динамически (см. resolveMetricColumns) —
// без правки кода, просто дописываются в конец.
var KNOWN_METRIC_COLUMNS = [
  "Актёрское мастерство", "Работа с микрофоном", "Дыхание", "Сила звука",
  "Регистры", "Атака и окончание звука", "Гортань", "Голосовые складки",
  "Ложные голосовые складки", "Щитовидный хрящ", "Перстневидный хрящ",
  "Черпаловидный хрящ", "Черпало-надгортанный сфинктер", "Мягкое нёбо",
  "Язык", "Нижняя челюсть", "Губы", "Анкеровка"
];
// Колонки-числа в базе «Срезы», которые НЕ являются метриками колеса баланса.
var NON_METRIC_NUMBER_KEYS = ["Оценка за ДЗ"];

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

function notionGet(token, path) {
  return fetch("https://api.notion.com/v1/" + path, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION
    }
  }).then(function (res) {
    return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
  });
}

/* Живой список колонок-метрик "Срезов": известные 18 (в привычном порядке)
   + любые новые NUMBER-колонки, которые Николай добавит в Notion позже
   (кроме "Оценка за ДЗ" — это не метрика колеса). Порядок и подписи у всех
   учеников одинаковые, потому что список строится один раз из схемы базы,
   а не из данных конкретного среза. */
async function resolveMetricColumns(token) {
  var res = await notionGet(token, "data_sources/" + ASSESSMENTS_DATA_SOURCE_ID);
  var columns = KNOWN_METRIC_COLUMNS.slice();
  if (res.ok && res.data && res.data.properties) {
    Object.keys(res.data.properties).forEach(function (key) {
      var prop = res.data.properties[key];
      if (prop.type === "number" && NON_METRIC_NUMBER_KEYS.indexOf(key) === -1 && columns.indexOf(key) === -1) {
        columns.push(key);
      }
    });
  }
  return columns;
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
function checkboxVal(prop) {
  return !!(prop && prop.checkbox);
}
// "10, 15" -> [10, 15]; мусор/пустое -> []
function parseLessonNumbers(text) {
  return String(text || "")
    .split(",")
    .map(function (s) { return parseInt(s.trim(), 10); })
    .filter(function (n) { return !isNaN(n) && n > 0; });
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
      // «Возраст (авто)» — formula-поле в Notion, formula-значения не отдаются
      // через обычный page-properties ответ API так же просто, как число —
      // пока используем ручное «Возраст»; авто-возраст можно добавить отдельно,
      // если понадобится показывать именно его.
      birthDate: formatDate(sp["Дата рождения"] && sp["Дата рождения"].date && sp["Дата рождения"].date.start),
      status: selectName(sp["Статус"]),
      // поля переведены в select в Notion — раньше тут был richText(), из-за
      // чего эти три поля показывались пустыми после конвертации типа.
      lessonType: selectName(sp["Тип занятий"]),
      range: selectName(sp["Диапазон · тембр"]),
      voiceType: selectName(sp["Тип голоса"]),
      primaryGoal: richText(sp["Первичная цель"]),
      focus: richText(sp["Вторичная цель"]),
      // поля переименованы в Notion: "Задачи"→"Проблемы в пении", "Особенности"→"Физ. особенности голоса"
      goals: multiSelectNames(sp["Проблемы в пении"]),
      notes: multiSelectNames(sp["Физ. особенности голоса"])
    };
    var unlockedLessons = parseLessonNumbers(richText(sp["Доп. открытые уроки"]));

    var progressRes = await notionFetch(token, "data_sources/" + PROGRESS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Ученик", relation: { contains: studentPage.id } },
      page_size: 100
    });
    if (!progressRes.ok) {
      return json({ ok: false, configured: true, error: "Notion API (прогресс): " + JSON.stringify(progressRes.data) }, 502);
    }
    // { "1": { lecture:true, quiz:true, warmups:false, song:false }, "2": {...} }
    var progressByLesson = {};
    (progressRes.data.results || []).forEach(function (page) {
      var p = page.properties;
      var n = numberVal(p["Номер урока"]);
      if (n == null) return;
      progressByLesson[n] = {
        lecture: checkboxVal(p["Лекция"]),
        quiz: checkboxVal(p["Тест"]),
        warmups: checkboxVal(p["Распевки"]),
        song: checkboxVal(p["Песня"])
      };
    });

    var assessRes = await notionFetch(token, "data_sources/" + ASSESSMENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Ученик", relation: { contains: studentPage.id } },
      sorts: [{ property: "Дата", direction: "ascending" }],
      page_size: 50
    });
    if (!assessRes.ok) {
      return json({ ok: false, configured: true, error: "Notion API (срезы): " + JSON.stringify(assessRes.data) }, 502);
    }

    var metricColumns = await resolveMetricColumns(token);
    var assessments = (assessRes.data.results || []).map(function (page) {
      var p = page.properties;
      var metrics = metricColumns
        .map(function (label) { return [label, numberVal(p[label])]; })
        .filter(function (pair) { return pair[1] != null; });
      return {
        date: formatDate(p["Дата"] && p["Дата"].date && p["Дата"].date.start),
        homework: richText(p["Пройденные Темы"]), // поле называлось "ДЗ", переименовано по просьбе Николая
        score: numberVal(p["Оценка за ДЗ"]),
        recommendations: richText(p["Рекомендации"]),
        goal: richText(p["Цель периода"]),
        metrics: metrics
      };
    });

    return json({
      ok: true, configured: true, found: true, profile: profile, assessments: assessments,
      unlockedLessons: unlockedLessons, progressByLesson: progressByLesson
    });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
