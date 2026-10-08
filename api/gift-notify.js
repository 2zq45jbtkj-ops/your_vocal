/* Уведомления из подарка «Талоны для Бусинки» (talony-businki.vercel.app)
   в личный чат преподавателя через того же бота, что принимает ДЗ.
   Использует уже настроенные TELEGRAM_BOT_TOKEN и ADMIN_CHAT_ID — токен
   не попадает на страницу талонов. Принимает запросы только с сайта талонов,
   текст собирается здесь из коротких полей (не произвольное сообщение). */

export const config = { runtime: "edge" };

var ALLOWED_ORIGINS = [
  "https://talony-businki.vercel.app",
  "https://talony-businki-nikolaisept.vercel.app"
];

function cors(origin) {
  var ok = ALLOWED_ORIGINS.indexOf(origin) !== -1;
  return {
    "access-control-allow-origin": ok ? origin : ALLOWED_ORIGINS[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin"
  };
}

function clip(s, n) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").slice(0, n);
}

export default async function handler(req) {
  var origin = req.headers.get("origin") || "";
  var headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers });
  if (req.method !== "POST" || ALLOWED_ORIGINS.indexOf(origin) === -1) {
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
    if (Array.isArray(b.extras) && b.extras.length) {
      lines.push("✨ Допы: " + b.extras.slice(0, 8).map(function (x) { return clip(x, 40); }).join(", "));
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

  var res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") })
  });
  var data = await res.json().catch(function () { return {}; });
  return new Response(JSON.stringify({ ok: !!data.ok }), {
    status: data.ok ? 200 : 502,
    headers: Object.assign({ "content-type": "application/json" }, headers)
  });
}
