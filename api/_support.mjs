/* Общие хелперы «Написать в поддержку» (api/support.mjs, api/support-upload.mjs,
   api/support-file.mjs). Файл с "_" — Vercel не делает из него роут.

   Кто пишет: в Telegram ученика узнаём по подписи Telegram (initData, проверка
   токеном бота), вне Telegram (значок «СЕПТ · ДЗ» на экране телефона) — по его
   коду доступа. Окончательно ученика находит бот записи (общая база учеников):
   api/support_intake.py в проекте vocal-bot. Запросы к нему подписаны HMAC с
   ключом из токена бота — бот тот же (@your_vocal_teacher_bot), новых секретов
   не нужно, а чужой не сможет ни подделать обращение, ни перебрать коды. */

import crypto from "node:crypto";

export var SUPPORT_INTAKE_URL = process.env.SUPPORT_INTAKE_URL || "https://vocal-bot.vercel.app/api/support_intake";
export var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Telegram: бот грузит по multipart фото до 10 МБ и остальные файлы до 50 МБ.
export var TG_PHOTO_MAX = 10 * 1024 * 1024;
export var TG_FILE_MAX = 50 * 1024 * 1024;
// одна пачка (альбом до 10 штук) — не больше этого, чтобы влезть в лимит запроса Telegram
export var TG_BATCH_MAX = 48 * 1024 * 1024;
// большие видео остаются в хранилище и приходят Николаю ссылкой — столько дней
export var KEEP_DAYS = 30;

// значения из Vercel могли вставить с переводом строки — Telegram в адресе его
// прощает, а подпись (HMAC) нет, поэтому всегда обрезаем пробелы
export function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export function adminChat() {
  return String(process.env.ADMIN_CHAT_ID || "").trim();
}

function supportKey() {
  return crypto.createHash("sha256").update("vocal-support:" + botToken()).digest();
}

export function sign(text) {
  return crypto.createHmac("sha256", supportKey()).update(text).digest("hex");
}

export function safeEqual(a, b) {
  var x = Buffer.from(String(a || ""));
  var y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Подпись Telegram Mini App (initData) → пользователь Telegram или null. */
export function checkInitData(initData) {
  var token = botToken();
  if (!initData || !token) return null;
  var params = new URLSearchParams(initData);
  var hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  var keys = Array.from(params.keys()).sort();
  var check = keys.map(function (k) { return k + "=" + params.get(k); }).join("\n");
  var secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  var want = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (!safeEqual(want, hash)) return null;
  // приложение могло быть открыто давно — как в боте, принимаем подпись до 7 дней
  var age = Date.now() / 1000 - parseInt(params.get("auth_date") || "0", 10);
  if (!(age < 7 * 24 * 3600)) return null;
  try {
    var u = JSON.parse(params.get("user") || "{}");
    return u && u.id ? u : null;
  } catch (e) {
    return null;
  }
}

/* Кто пишет — то, что пришло от приложения. Возвращает null, если ни подписи
   Telegram, ни кода доступа нет. */
export function identityOf(body) {
  var initData = String(body.initData || "");
  var user = initData ? checkInitData(initData) : null;
  var token = String(body.accessToken || "").trim().toLowerCase();
  if (!UUID_RE.test(token)) token = "";
  if (!user && !token && !initData) return null;
  // подпись Telegram, которую мы не смогли проверить сами, всё равно передаём
  // боту записи: он проверит её своим токеном
  return { initData: initData, user: user, accessToken: user ? "" : token };
}

/* Запрос к боту записи: тело JSON + заголовок X-Support-Sign. */
export async function callBot(action, identity, extra, timeoutMs) {
  var payload = Object.assign({
    action: action,
    ts: Math.floor(Date.now() / 1000),
    initData: identity.initData || "",
    accessToken: identity.accessToken || ""
  }, extra || {});
  var raw = JSON.stringify(payload);
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 8000);
  try {
    var res = await fetch(SUPPORT_INTAKE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-support-sign": sign(raw) },
      body: raw,
      signal: ctl.signal
    });
    var data = await res.json().catch(function () { return null; });
    return { status: res.status, data: data };
  } finally {
    clearTimeout(timer);
  }
}

/* Ссылка Николаю на большой файл: подписана, без срока — работает, пока файл
   лежит в хранилище (KEEP_DAYS дней). */
export function fileLink(origin, pathname) {
  return origin + "/api/support-file?p=" + encodeURIComponent(pathname) + "&s=" + sign("file:" + pathname).slice(0, 32);
}

export function checkFileSig(pathname, s) {
  return safeEqual(sign("file:" + pathname).slice(0, 32), s);
}

export function tgUrl(method) {
  return "https://api.telegram.org/bot" + botToken() + "/" + method;
}

export async function tgJson(method, payload) {
  var res = await fetch(tgUrl(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function tgForm(method, form) {
  var res = await fetch(tgUrl(method), { method: "POST", body: form });
  return res.json();
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

export function humanSize(bytes) {
  var mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1).replace(".", ",") + " ГБ";
  if (mb >= 10) return Math.round(mb) + " МБ";
  return mb.toFixed(1).replace(".", ",") + " МБ";
}
