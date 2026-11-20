/* Уведомления из подарка «Талоны для Бусинки» (talony-businki.vercel.app)
   в личный чат преподавателя через того же бота, что принимает ДЗ.
   Использует уже настроенные TELEGRAM_BOT_TOKEN и ADMIN_CHAT_ID — токен
   не попадает на страницу талонов. Принимает запросы только с сайта талонов,
   текст собирается здесь из коротких полей (не произвольное сообщение).

   Активированный талон сохраняется в gift_tasks и приходит с кнопкой
   «✅ Выполнил» (ссылка на gift-done.js с подписью). Пока не нажата —
   у Насти он висит в «Талон на реализации», после — уходит в историю. */

import { GIFT_ORIGINS, giftCors, giftSql, validTaskId, signTask } from "./_gift.js";

export const config = { runtime: "edge" };

function clip(s, n) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").slice(0, n);
}

/* GET ?check=1 — yes/no check that the bot can reach Nick's chat (no secrets, no message sent):
   sendChatAction shows "печатает…" for a few seconds and fails the same way sendMessage would. */
async function selfCheck() {
  var token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  var chatId = String(process.env.ADMIN_CHAT_ID || "").trim();
  var out = { token: !!token, chat: !!chatId };
  if (token && chatId) {
    var r = await fetch("https://api.telegram.org/bot" + token + "/sendChatAction", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });
    var d = await r.json().catch(function () { return {}; });
    out.telegram = { ok: !!d.ok, error: d.description || null };
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/* GET ?resend=1 — coupons she activated whose message never reached Nick (msg_id is empty,
   e.g. while the bot token was outdated) are sent again with «✅ Выполнил». Safe to repeat:
   a coupon gets msg_id once its message is delivered, so it is never sent twice. */
async function resendLost(req) {
  var token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  var chatId = String(process.env.ADMIN_CHAT_ID || "").trim();
  var sql = await giftSql();
  if (!token || !chatId || !sql) return new Response("{}", { status: 500 });
  var rows = await sql`SELECT id, title, icon, extras, note, created_at FROM gift_tasks
    WHERE done_at IS NULL AND msg_id IS NULL AND created_at >= '2026-10-09T19:00:00Z'
    ORDER BY created_at ASC LIMIT 30`;
  var base = new URL(req.url).origin;
  var sent = 0, failed = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var when = new Date(r.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    var lines = ["🎟 Бусинка активировала талон (" + when + ", уведомление не дошло вовремя)",
      (r.icon ? r.icon + " " : "") + r.title];
    if (r.extras) lines.push("✨ Допы: " + r.extras);
    if (r.note) lines.push("💬 Пожелание: " + r.note);
    var link = base + "/api/gift-done?id=" + encodeURIComponent(r.id) + "&s=" + (await signTask(r.id));
    var res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "✅ Выполнил", url: link }]] } })
    });
    var d = await res.json().catch(function () { return {}; });
    if (d.ok && d.result) {
      await sql`UPDATE gift_tasks SET msg_id = ${d.result.message_id} WHERE id = ${r.id}`;
      sent++;
    } else {
      failed.push(r.title + ": " + (d.description || res.status));
    }
  }
  return new Response(JSON.stringify({ found: rows.length, sent: sent, failed: failed }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export default async function handler(req) {
  var origin = req.headers.get("origin") || "";
  var headers = giftCors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers });
  if (req.method === "GET" && new URL(req.url).searchParams.get("check") === "1") return selfCheck();
  if (req.method === "GET" && new URL(req.url).searchParams.get("resend") === "1") return resendLost(req);
  if (req.method !== "POST" || GIFT_ORIGINS.indexOf(origin) === -1) {
    return new Response("forbidden", { status: 403, headers: headers });
  }

  var token = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.ADMIN_CHAT_ID;
  if (!token || !chatId) return new Response("not configured", { status: 500, headers: headers });

  var b;
  try { b = await req.json(); } catch (e) { return new Response("bad json", { status: 400, headers: headers }); }

  var lines = [];
  var icon = clip(b.icon, 8);
  var title = clip(b.title, 120);
  var extras = Array.isArray(b.extras) ? b.extras.slice(0, 8).map(function (x) { return clip(x, 40); }) : [];
  // her wishes / details for this coupon (optional); newlines kept, other control chars dropped
  var note = String(b.note == null ? "" : b.note).replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 500);
  var replyMarkup = null;
  var taskId = validTaskId(b.taskId) ? b.taskId : null;
  var sql = null;

  if (b.event === "use") {
    lines.push("🎟 Бусинка активировала талон");
    var row = (icon ? icon + " " : "") + title;
    if (typeof b.left === "number" && typeof b.max === "number") {
      row += b.kind === "counter"
        ? " — " + (b.max - b.left) + " из " + b.max
        : " — осталось " + b.left + " из " + b.max;
    } else if (b.kind === "unlimited") {
      row += " — ∞";
    }
    lines.push(row);
    if (extras.length) lines.push("✨ Допы: " + extras.join(", "));
    if (note) lines.push("💬 Пожелание: " + note);

    if (taskId) {
      sql = await giftSql();
      if (sql) {
        await sql`INSERT INTO gift_tasks (id, title, icon, extras, note)
                  VALUES (${taskId}, ${title}, ${icon}, ${extras.join(", ")}, ${note || null})
                  ON CONFLICT (id) DO NOTHING`;
        var base = new URL(req.url).origin;
        var link = base + "/api/gift-done?id=" + encodeURIComponent(taskId) + "&s=" + (await signTask(taskId));
        replyMarkup = { inline_keyboard: [[{ text: "✅ Выполнил", url: link }]] };
      }
    }
  } else if (b.event === "plan") {
    lines.push("🗓 Бусинка составила план");
  } else {
    return new Response("bad event", { status: 400, headers: headers });
  }

  if (Array.isArray(b.plan) && b.plan.length) {
    var plan = b.plan.slice(0, 15).map(function (t, i) { return (i + 1) + ". " + clip(t, 80); });
    lines.push("🗓 План: " + plan.join(" → "));
  }

  var payload = { chat_id: chatId, text: lines.join("\n") };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  var res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  var data = await res.json().catch(function () { return {}; });
  if (!data.ok) console.error("gift-notify: telegram refused", res.status, data.description || "");

  if (data.ok && sql && taskId && data.result) {
    await sql`UPDATE gift_tasks SET msg_id = ${data.result.message_id} WHERE id = ${taskId}`;
  }

  return new Response(JSON.stringify({ ok: !!data.ok, tracked: !!replyMarkup }), {
    status: data.ok ? 200 : 502,
    headers: Object.assign({ "content-type": "application/json" }, headers)
  });
}
