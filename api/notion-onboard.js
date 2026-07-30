/* Автосоздание карточки ученика в Notion при первом входе в приложение.

   Дёргается один раз со экрана «Как тебя зовут?» (см. app.js, renderName),
   сразу после того как ученик сам ввёл имя и фамилию — этот текст и уходит
   в поле «Имя» в Notion, а не имя/username из Telegram-аккаунта (его
   добавляем только справочно, в скобках, чтобы Николаю было легче сверить
   кто есть кто: "Мария Иванова (@username)").

   Идемпотентно: если строка с этим Telegram chat_id уже есть в «Ученики_Бот» —
   новая не создаётся (защита от дублей при перезаходе/повторной отправке
   формы). Но не полностью «глухо»: если у существующей строки ещё нет даты
   рождения, а в этом запросе она пришла — дозаписываем именно это поле,
   ничего больше не трогая (баг был найден: раньше уже зарегистрированные
   ученики, повторно прошедшие форму, теряли дату рождения молча).

   Заодно создаёт связанную стартовую строку в «Срезы», чтобы таблица среза
   была готова, когда Николай будет заполнять первую оценку.

   Тот же NOTION_TOKEN и подключение интеграции к базам, что и у
   notion-student.js / notion-progress.js — отдельной настройки не требует. */

export const config = { runtime: "edge" };

var STUDENTS_DATA_SOURCE_ID = "1f7a4505-f823-4aa0-b7d5-a2a70bd0b261";
var ASSESSMENTS_DATA_SOURCE_ID = "61be3937-4c4a-4654-9955-4e30ab9c58d2";
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
  if (!token) return json({ ok: true, configured: false });

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Нужен JSON body" }, 400); }

  var chatId = body.chatId;
  var tgId = (body.tgId || "").toString().trim();
  var firstName = (body.firstName || "").toString().trim();
  var lastName = (body.lastName || "").toString().trim();
  // "YYYY-MM-DD" — на экране ученик вводит ДД.ММ.ГГГГ, в ISO конвертирует
  // app.js (birthDateToIso) перед отправкой сюда; необязательное поле.
  // Дополнительно проверяем формат тут же — на случай кривого/пустого значения.
  var birthDateRaw = (body.birthDate || "").toString().trim();
  var birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw) ? birthDateRaw : "";
  if (!chatId || !firstName || !lastName) {
    return json({ ok: false, error: "Нужны chatId, firstName, lastName" }, 400);
  }

  try {
    var existingRes = await notionRequest(token, "POST", "data_sources/" + STUDENTS_DATA_SOURCE_ID + "/query", {
      filter: { property: "Telegram chat_id", rich_text: { equals: String(chatId) } },
      page_size: 1
    });
    if (!existingRes.ok) return json({ ok: false, configured: true, error: "Notion API (поиск ученика): " + JSON.stringify(existingRes.data) }, 502);
    var existingPage = existingRes.data.results && existingRes.data.results[0];
    if (existingPage) {
      // Строка уже была (ученик регистрировался ещё до появления поля «Дата
      // рождения», либо просто повторно прошёл экран «Как тебя зовут?») —
      // новую не создаём, но раньше это означало, что ВСЁ из формы, включая
      // дату рождения, молча терялось. Теперь: если в Notion поле «Дата
      // рождения» ещё пустое, а в этом запросе оно пришло — дописываем его.
      // Уже заполненную дату не трогаем и не перезаписываем.
      var existingDateProp = existingPage.properties["Дата рождения"];
      var existingBirthDate = existingDateProp && existingDateProp.date && existingDateProp.date.start;
      if (!existingBirthDate && birthDate) {
        var patchRes = await notionRequest(token, "PATCH", "pages/" + existingPage.id, {
          properties: { "Дата рождения": { date: { start: birthDate } } }
        });
        if (!patchRes.ok) {
          return json({ ok: true, configured: true, alreadyExists: true, birthDateUpdated: false, error: JSON.stringify(patchRes.data) });
        }
        return json({ ok: true, configured: true, alreadyExists: true, birthDateUpdated: true });
      }
      return json({ ok: true, configured: true, alreadyExists: true });
    }

    // «Иванова Мария (@username)» — строго Фамилия Имя, единообразно со всем
    // приложением; если username/ID из Telegram недоступен, скобки не добавляются
    var fullName = (lastName + " " + firstName).trim();
    var title = tgId ? fullName + " (" + tgId + ")" : fullName;

    var studentProps = {
      "Имя": { title: [{ text: { content: title } }] },
      "Telegram chat_id": { rich_text: [{ text: { content: String(chatId) } }] },
      // «Пробный» по умолчанию — автоматически переключится на «Активный»,
      // как только ученик пройдёт больше одного урока (см. notion-progress.js).
      // Возраст/Тип занятий/Диапазон/Тип голоса/цели/задачи/особенности —
      // намеренно не заполняем, дозаполняет Николай вручную.
      "Статус": { select: { name: "Пробный" } }
    };
    // Дату рождения ученик вводит сам на этом же экране — если указал,
    // «Возраст (авто)» в Notion (formula) посчитается сам, без правки Николаем.
    if (birthDate) {
      studentProps["Дата рождения"] = { date: { start: birthDate } };
    }

    var createStudentRes = await notionRequest(token, "POST", "pages", {
      parent: { type: "data_source_id", data_source_id: STUDENTS_DATA_SOURCE_ID },
      properties: studentProps
    });
    if (!createStudentRes.ok) return json({ ok: false, configured: true, error: "Notion API (создание ученика): " + JSON.stringify(createStudentRes.data) }, 502);
    var studentId = createStudentRes.data.id;

    var createAssessmentRes = await notionRequest(token, "POST", "pages", {
      parent: { type: "data_source_id", data_source_id: ASSESSMENTS_DATA_SOURCE_ID },
      properties: {
        "Название": { title: [{ text: { content: "Срез — ожидает заполнения" } }] },
        "Ученик": { relation: [{ id: studentId }] }
        // Дата/метрики/ДЗ — пусто, Николай заполнит при первом срезе.
      }
    });
    if (!createAssessmentRes.ok) {
      // Ученик уже создан, но стартовый срез — нет: не фейлим весь онбординг из-за этого,
      // просто сообщаем частичный успех.
      return json({ ok: true, configured: true, created: true, studentCreated: true, assessmentCreated: false, error: JSON.stringify(createAssessmentRes.data) });
    }

    return json({ ok: true, configured: true, created: true, studentCreated: true, assessmentCreated: true });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
