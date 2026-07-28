/* Занятость преподавателя для календаря "Запись".

   Николай — не владелец студии, а сотрудник, поэтому официальный ключ доступа
   к API HolyHope ему недоступен. Решение без API-ключа: данные о занятых датах
   лежат прямо в проекте, в data/schedule-busy.json. Когда нужно обновить —
   Николай пишет "обнови расписание", Claude открывает его собственное
   расписание в браузере (Николай уже залогинен под своим сотрудническим
   аккаунтом на labzvuka.t8s.ru — пароль и API-ключ тут никогда не участвуют),
   считывает актуальные занятые даты и коммитит новый data/schedule-busy.json —
   так же, как обновляется любой другой файл в проекте.

   Если данные устарели или отсутствуют — эндпоинт просто отвечает
   { configured: false }, календарь в приложении работает как визуальный,
   ничего не ломается.

   Официальный API HolyHope (на случай, если когда-нибудь появится authkey от
   владельца студии) оставлен как запасной путь — переменные окружения:
     HOLLIHOP_DOMAIN   — поддомен вида "labzvuka" (без .t8s.ru)
     HOLLIHOP_AUTHKEY  — ключ доступа: Настройки -> Интеграция -> API
   Документация: https://hollipedia.t8s.ru/books/api/page/api-20 */

export const config = { runtime: "edge" };

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

export default async function handler(req) {
  var url = new URL(req.url);
  var dateFrom = url.searchParams.get("from");
  var dateTo = url.searchParams.get("to");
  if (!dateFrom || !dateTo) {
    return json({ ok: false, error: "Нужны параметры from и to (YYYY-MM-DD)" }, 400);
  }

  // 1) файл в проекте, обновляемый вручную
  try {
    var fileRes = await fetch(url.origin + "/data/schedule-busy.json");
    if (fileRes.ok) {
      var fileData = await fileRes.json();
      if (fileData && Array.isArray(fileData.busyDates)) {
        var filtered = fileData.busyDates.filter(function (d) { return d >= dateFrom && d <= dateTo; });
        return json({ ok: true, configured: true, source: "manual", syncedAt: fileData.syncedAt || null, busyDates: filtered });
      }
    }
  } catch (e) {}

  // 2) официальный API HolyHope, если когда-нибудь появится ключ владельца студии
  var domain = process.env.HOLLIHOP_DOMAIN;
  var authkey = process.env.HOLLIHOP_AUTHKEY;
  if (!domain || !authkey) {
    return json({ ok: true, configured: false, busyDates: [] });
  }

  try {
    var api =
      "https://" + domain + ".t8s.ru/Api/V2/GetEdUnits" +
      "?authkey=" + encodeURIComponent(authkey) +
      "&dateFrom=" + encodeURIComponent(dateFrom) +
      "&dateTo=" + encodeURIComponent(dateTo) +
      "&queryDays=true";

    var res = await fetch(api);
    var apiRaw = await res.text();
    var data;
    try { data = JSON.parse(apiRaw); } catch (e) {
      return json({ ok: false, configured: true, error: "HolyHope вернул не JSON (проверь authkey/домен)", raw: apiRaw.slice(0, 300) }, 502);
    }

    var units = data.EdUnits || data.edUnits || data.Result || [];
    var busy = {};
    units.forEach(function (unit) {
      var days = unit.Days || unit.days || [];
      days.forEach(function (day) {
        var d = day.Date || day.date || day.BeginDate || day.beginDate;
        if (!d) return;
        busy[String(d).slice(0, 10)] = true;
      });
    });

    return json({ ok: true, configured: true, source: "api", busyDates: Object.keys(busy) });
  } catch (e) {
    return json({ ok: false, configured: true, error: String(e && e.message ? e.message : e) }, 500);
  }
}
