/* Ручная синхронизация расписания (для случая, когда нет authkey от владельца
   студии в HolyHope). Вызывается только Claude по команде Николая: "обнови
   расписание" — Claude открывает его собственное расписание в браузере
   (Николай уже залогинен под своим сотрудническим аккаунтом на labzvuka.t8s.ru,
   пароль/API-ключ тут никогда не участвуют) и присылает сюда список занятых
   дат. api/schedule.js потом просто отдаёт эти даты в календарь приложения.

   Нужна одна переменная окружения в Vercel:
     SYNC_SECRET — произвольная строка, придуманная Claude (не учётные данные
     HolyHope), защищает эндпоинт от посторонних записей. */

import { kvSet } from "./_lib.js";

export const config = { runtime: "edge" };

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  var secret = process.env.SYNC_SECRET;
  if (!secret) return json({ ok: false, error: "SYNC_SECRET не настроен в Vercel" }, 500);

  var given = req.headers.get("x-sync-secret");
  if (given !== secret) return json({ ok: false, error: "Неверный секрет" }, 401);

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Некорректный JSON" }, 400); }

  var busyDates = Array.isArray(body.busyDates)
    ? body.busyDates.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
    : [];

  await kvSet("schedule:busyDates", JSON.stringify(busyDates));
  await kvSet("schedule:syncedAt", new Date().toISOString());

  return json({ ok: true, count: busyDates.length });
}
