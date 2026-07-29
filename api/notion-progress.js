/* Запись прогресса ученика по уроку в Notion (база «Прогресс»).

   Дёргается из app.js каждый раз, когда ученик закрывает шаг урока
   (лекция просмотрена / тест пройден / распевки сданы / песня сдана).
   Одна строка в «Прогресс» = пара (ученик, номер урока); если строки для
   этого урока ещё нет — создаётся, если есть — просто ставится чекбокс.

   На этом же прогрессе строится последовательная разблокировка следующего
   урока (см. api/notion-student.js -> progressByLesson, и app.js ->
   lessonUnlocked()).

   Тот же NOTION_TOKEN и подключение интеграции к базам, что и у
   notion-student.js — отдельной настройки не требует. */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var PROGRESS_DATA_SOURCE_ID = "726838f7-738f-47dc-84a7-8a67739be77c";
var NOTION_VERSION = "2025-09-03";
var STEP_TO_COLUMN = { lecture: "Лекция", quiz: "Тест", warmups: "Распевки", song: "Песня" };

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
  if (!token) return json({ ok: true, configured: false });

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Нужен JSON body" }, 400); }

  var chatId = body.chatId;
  var lessonNum = parseInt(body.lessonNum, 10);
  var step = body.step;
  var column = STEP_TO_COLUMN[step];
  if (!chatId || !lessonNum || !column) {
    return json({ ok: false, error: "Нужны chatId, lessonNum и step (lecture|quiz|warmups|song)" }, 400);
  }

  try {
    var studentRes = await notionRequest(token, "POST", "data_sources/" + STUDENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Telegram chat_id", rich_text: { equals: String(chatId) } },
      page_size: 1
    });
    if (!studentRes.ok) return json({ ok: false, configured: true, error: "Notion API (ученики): " + JSON.stringify(studentRes.data) }, 502);
    var studentPage = studentRes.data.results && studentRes.data.results[0];
    if (!studentPage) return json({ ok: true, configured: true, found: false });

    var rowRes = await notionRequest(token, "POST", "data_sources/" + PROGRESS_DATA_SOURCE_ID + "/query", {
      filter: {
        and: [
          { property: "Ученик", relation: { contains: studentPage.id } },
          { property: "Номер урока", number: { equals: lessonNum } }
        ]
      },
      page_size: 1
    });
    if (!rowRes.ok) return json({ ok: false, configured: true, error: "Notion API (прогресс, поиск): " + JSON.stringify(rowRes.data) }, 502);
    var existing = rowRes.data.results && rowRes.data.results[0];

    if (existing) {
      var patchProps = {};
      patchProps[column] = { checkbox: true };
      var patchRes = await notionRequest(token, "PATCH", "pages/" + existing.id, { properties: patchProps });
      if (!patchRes.ok) return json({ ok: false, configured: true, error: "Notion API (прогресс, обновление): " + JSON.stringify(patchRes.data) }, 502);
    } else {
      var props = {
        "Название": { title: [{ text: { content: "Урок " + lessonNum } }] },
        "Ученик": { relation: [{ id: studentPage.id }] },
        "Номер урока": { number: lessonNum }
      };
      props[column] = { checkbox: true };
      var createRes = await notionRequest(token, "POST", "pages", {
        parent: { type: "data_source_id", data_source_id: PROGRESS_DATA_SOURCE_ID },
        properties: props
      });
      if (!createRes.ok) return json({ ok: false, configured: true, error: "Notion API (прогресс, создание): " + JSON.stringify(createRes.data) }, 502);
    }

    return json({ ok: true, configured: true, found: true });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
