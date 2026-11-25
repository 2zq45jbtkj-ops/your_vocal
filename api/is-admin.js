/* Проверка «это преподаватель или ученик?» — для пункта «Режим админа» в «Ещё».

   Переиспользует уже существующий ADMIN_CHAT_ID (тот же env var, что и для
   уведомлений о домашке в api/submit.js) — отдельно настраивать ничего не
   нужно. Это личный chat_id Николая в Telegram: когда он сам открывает
   приложение, tg.initDataUnsafe.user.id совпадает с ADMIN_CHAT_ID (для
   приватного чата с ботом chat_id всегда равен user id).

   Значение ADMIN_CHAT_ID клиенту никогда не отдаётся — сравнение целиком
   на сервере, наружу уходит только true/false. */

export const config = { runtime: "edge" };

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

import { isAdminReq } from "./_db.js";
export default async function handler(req) {
  return json({ ok: true, isAdmin: await isAdminReq(req) });
}
