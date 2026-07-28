/* Занятость преподавателя для календаря "Запись".

   Два независимых источника данных, проверяются по очереди:

   1) Ручная синхронизация (api/sync-schedule.js) — Николай не владелец студии
      и не может получить authkey от HolyHope, поэтому вместо официального API
      данные обновляются вручную: он просит Claude "обнови расписание", Claude
      открывает его собственное расписание в браузере (он уже залогинен под
      своим сотрудническим аккаунтом) и пишет актуальные занятые даты в KV
      через api/sync-schedule.js. Этот эндпоинт просто читает то, что там лежит.

   2) Официальный API HolyHope (если когда-нибудь появится authkey от
      владельца студии) — нужны переменные окружения в Vercel:
        HOLLIHOP_DOMAIN   — поддомен вида "labzvuka" (без .t8s.ru)
        HOLLIHOP_AUTHKEY  — ключ доступа из HolyHope: Настройки -> Интеграция -> API
      Документация: https://hollipedia.t8s.ru/books/api/page/api-20

   Если не настроено ни то, ни другое — отвечает { configured: false },
   календарь в приложении работает как обычный визуальный, ничего не ломается. */

import { kvGet } from "./_lib.js";

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

  // 1) ручная синхронизация через KV
  try {
    var raw = await kvGet("schedule:busyDates");
    if (raw) {
      var manualDates = JSON.parse(raw);
      if (Array.isArray(manualDates)) {
        var filtered = manualDates.filter(function (d) { return d >= dateFrom && d <= dateTo; });
        var syncedAt = await kvGet("schedule:syncedAt");
        return json({ ok: true, configured: true, source: "manual", syncedAt: syncedAt || null, busyDates: filtered });
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
