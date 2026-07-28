/* Чтение занятости преподавателя из CRM HolyHope (hollihop, домен *.t8s.ru).
   Документация API: https://hollipedia.t8s.ru/books/api/page/api-20

   Нужны переменные окружения в Vercel (Project Settings -> Environment Variables):
     HOLLIHOP_DOMAIN   — поддомен вида "labzvuka" (без .t8s.ru), как в адресе твоего расписания
     HOLLIHOP_AUTHKEY  — ключ доступа из HolyHope: Настройки -> Интеграция -> API

   Без этих переменных эндпоинт просто отвечает { configured: false } —
   календарь в приложении тогда работает как обычный визуальный (без реальных данных),
   ничего не ломается.

   ВАЖНО: точный формат ответа GetEdUnits не был протестирован на реальном ключе
   (документация описывает структуру, но у меня нет доступа к твоему аккаунту HolyHope).
   Разбор ответа ниже — по описанию из документации, сделан с запасом (проверяет
   несколько вероятных названий полей). Если после того как ты впишешь ключ календарь
   не покажет занятые даты — пришли мне, что возвращает /api/schedule?from=...&to=...,
   и я поправлю разбор под реальный ответ. */

export const config = { runtime: "edge" };

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

export default async function handler(req) {
  var domain = process.env.HOLLIHOP_DOMAIN;
  var authkey = process.env.HOLLIHOP_AUTHKEY;

  if (!domain || !authkey) {
    return json({ ok: true, configured: false, busyDates: [] });
  }

  var url = new URL(req.url);
  var dateFrom = url.searchParams.get("from");
  var dateTo = url.searchParams.get("to");
  if (!dateFrom || !dateTo) {
    return json({ ok: false, configured: true, error: "Нужны параметры from и to (YYYY-MM-DD)" }, 400);
  }

  try {
    var api =
      "https://" + domain + ".t8s.ru/Api/V2/GetEdUnits" +
      "?authkey=" + encodeURIComponent(authkey) +
      "&dateFrom=" + encodeURIComponent(dateFrom) +
      "&dateTo=" + encodeURIComponent(dateTo) +
      "&queryDays=true";

    var res = await fetch(api);
    var raw = await res.text();
    var data;
    try { data = JSON.parse(raw); } catch (e) {
      return json({ ok: false, configured: true, error: "HolyHope вернул не JSON (проверь authkey/домен)", raw: raw.slice(0, 300) }, 502);
    }

    var units = data.EdUnits || data.edUnits || data.Result || [];
    var busy = {};
    units.forEach(function (unit) {
      var days = unit.Days || unit.days || [];
      days.forEach(function (day) {
        var d = day.Date || day.date || day.BeginDate || day.beginDate;
        if (!d) return;
        // приводим к YYYY-MM-DD, если пришло с временем
        busy[String(d).slice(0, 10)] = true;
      });
    });

    return json({ ok: true, configured: true, busyDates: Object.keys(busy) });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
