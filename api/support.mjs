/* «Написать в поддержку» → обращение ученика приходит Николаю в бот.

   POST JSON, два шага (приложение вызывает их по очереди):
   1) action "start": {initData|accessToken, text, counts:{photo,video}, firstName, lastName}
      → бот записи (api/support_intake.py) находит ученика, присылает Николаю
        карточку обращения и запоминает её: ответ Николая на карточку (обычный
        «Ответить» в Telegram) бот перешлёт ученику, а обращение видно в «Вопросы».
      ← {ok, headerId, name}
   2) action "send": {initData|accessToken, headerId, name, items:[{pathname,size,kind,
      name,width,height,duration}]} — пачка вложений, уже загруженных приложением в
      хранилище (api/support-upload.mjs). Фото до 10 МБ и видео до 50 МБ уходят в
      Telegram альбомами по 10 штук ответом на карточку, крупнее — ссылкой
      (Telegram не принимает от бота файлы больше 50 МБ). Отправленное стирается
      из хранилища сразу, большие файлы — через 30 дней (api/support-cleanup.js).

   Если бот записи не ответил, карточку присылаем отсюда сами (без «Ответить»):
   обращение не должно потеряться. */

import { get, del } from "@vercel/blob";
import {
  identityOf, callBot, json, tgJson, tgForm, fileLink, humanSize,
  TG_PHOTO_MAX, TG_FILE_MAX, TG_BATCH_MAX, KEEP_DAYS
} from "./_support.mjs";

var PATH_RE = /^support\/[\w.\-]+$/;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function countsLine(c) {
  var parts = [];
  if (c && c.photo) parts.push(c.photo + " фото");
  if (c && c.video) parts.push(c.video + " видео");
  return parts.join(", ");
}

/* ---------- шаг 1: карточка обращения ---------- */

async function start(body, who) {
  var text = String(body.text || "").trim().slice(0, 3000);
  var counts = {
    photo: Math.max(0, parseInt(body.counts && body.counts.photo, 10) || 0),
    video: Math.max(0, parseInt(body.counts && body.counts.video, 10) || 0)
  };
  if (!text && !counts.photo && !counts.video) return json({ ok: false, error: "Пустое обращение" }, 400);

  try {
    var r = await callBot("start", who, { text: text, counts: counts }, 9000);
    if (r.status === 200 && r.data && r.data.ok) {
      return json({ ok: true, headerId: r.data.headerId, name: r.data.name || "" });
    }
    if (r.status === 403 || r.status === 404) {
      return json({ ok: false, error: "Не получилось узнать, кто ты. Открой приложение заново" }, 403);
    }
  } catch (e) {
    console.log("support: bot start failed", String(e && e.message ? e.message : e));
  }

  // запасной путь: бот записи недоступен — карточку шлём сами, чтобы обращение дошло
  var admin = process.env.ADMIN_CHAT_ID;
  var name, idLine = "";
  if (who.user) {
    name = [who.user.first_name, who.user.last_name].filter(Boolean).join(" ") || "Без имени";
    if (who.user.username) name += " (@" + who.user.username + ")";
    idLine = "\nID: <code>" + who.user.id + "</code>";
  } else {
    name = [body.firstName, body.lastName].filter(Boolean).join(" ").trim() || "Без имени";
    name += " (имя из приложения, вход по коду доступа)";
  }
  var att = countsLine(counts);
  var msg =
    "🆘 <b>Поддержка: обращение из приложения</b>\nОт: " + esc(name) + idLine +
    (text ? "\n\n" + esc(text) : "") +
    (att ? "\n\n📎 Вложения ниже: " + att : "") +
    "\n\n<i>Бот записи сейчас не ответил, поэтому кнопкой «Ответить» тут ответить не получится — напиши ученику сам.</i>";
  var sent = await tgJson("sendMessage", { chat_id: admin, text: msg, parse_mode: "HTML" });
  if (!sent.ok) return json({ ok: false, error: "Telegram не принял сообщение" }, 502);
  return json({ ok: true, headerId: sent.result.message_id, name: name.split(" (")[0] });
}

/* ---------- шаг 2: вложения ---------- */

async function download(pathname) {
  var r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200 || !r.stream) throw new Error("Файл не найден в хранилище");
  var buf = await new Response(r.stream).arrayBuffer();
  return { buf: buf, type: r.blob.contentType || "application/octet-stream" };
}

function fileName(item, i, type) {
  var ext = (String(item.name || "").match(/\.[A-Za-z0-9]{1,5}$/) || [""])[0];
  if (!ext) ext = /video/.test(type) ? ".mp4" : ".jpg";
  return (item.kind === "video" ? "video-" : "photo-") + (i + 1) + ext.toLowerCase();
}

function videoExtra(item) {
  var o = {};
  if (item.width) o.width = Math.round(item.width);
  if (item.height) o.height = Math.round(item.height);
  if (item.duration) o.duration = Math.round(item.duration);
  o.supports_streaming = true;
  return o;
}

function replyTo(headerId) {
  return headerId ? JSON.stringify({ message_id: headerId, allow_sending_without_reply: true }) : "";
}

async function sendOne(admin, headerId, item, data, caption, idx) {
  var asPhoto = item.kind === "photo" && item.size <= TG_PHOTO_MAX;
  var asVideo = item.kind === "video";
  var tries = asPhoto ? ["sendPhoto", "sendDocument"] : asVideo ? ["sendVideo", "sendDocument"] : ["sendDocument"];
  for (var t = 0; t < tries.length; t++) {
    var method = tries[t];
    var field = method === "sendPhoto" ? "photo" : method === "sendVideo" ? "video" : "document";
    var form = new FormData();
    form.append("chat_id", String(admin));
    if (caption) form.append("caption", caption);
    var rp = replyTo(headerId);
    if (rp) form.append("reply_parameters", rp);
    if (method === "sendVideo") {
      var ve = videoExtra(item);
      Object.keys(ve).forEach(function (k) { form.append(k, String(ve[k])); });
    }
    form.append(field, new Blob([data.buf], { type: data.type }), fileName(item, idx, data.type));
    var r = await tgForm(method, form);
    if (r.ok) return [r.result.message_id];
    console.log("support:", method, "failed", r.description);
  }
  return null;
}

async function sendGroup(admin, headerId, items, datas, caption) {
  var form = new FormData();
  form.append("chat_id", String(admin));
  var rp = replyTo(headerId);
  if (rp) form.append("reply_parameters", rp);
  var media = items.map(function (item, i) {
    var m = { type: item.kind === "video" ? "video" : "photo", media: "attach://f" + i };
    if (item.kind === "video") Object.assign(m, videoExtra(item));
    if (i === 0 && caption) m.caption = caption;
    form.append("f" + i, new Blob([datas[i].buf], { type: datas[i].type }), fileName(item, i, datas[i].type));
    return m;
  });
  form.append("media", JSON.stringify(media));
  var r = await tgForm("sendMediaGroup", form);
  if (r.ok) return r.result.map(function (m) { return m.message_id; });
  console.log("support: sendMediaGroup failed", r.description);
  return null;
}

async function sendLink(admin, headerId, item, link, name) {
  var what = item.kind === "video" ? "Видео" : "Фото";
  var text =
    what + (name ? " от " + name : "") + ": «" + (item.name || "файл") + "», " + humanSize(item.size) + ".\n" +
    "Telegram не принимает от бота файлы больше 50 МБ, поэтому оно здесь по ссылке. " +
    "Ссылка работает " + KEEP_DAYS + " дней — если файл нужен дольше, сохрани его.";
  var payload = {
    chat_id: admin,
    text: text,
    reply_markup: { inline_keyboard: [[{ text: item.kind === "video" ? "▶️ Открыть видео" : "🖼 Открыть фото", url: link }]] }
  };
  if (headerId) payload.reply_parameters = { message_id: headerId, allow_sending_without_reply: true };
  var r = await tgJson("sendMessage", payload);
  return r.ok ? [r.result.message_id] : null;
}

async function send(body, who, origin) {
  var admin = process.env.ADMIN_CHAT_ID;
  var headerId = parseInt(body.headerId, 10) || 0;
  var name = String(body.name || "").slice(0, 80);
  var items = (Array.isArray(body.items) ? body.items : []).slice(0, 10).map(function (it) {
    return {
      pathname: String(it.pathname || ""),
      size: Math.max(0, parseInt(it.size, 10) || 0),
      kind: it.kind === "video" ? "video" : "photo",
      name: String(it.name || "").slice(0, 120),
      width: it.width, height: it.height, duration: it.duration
    };
  }).filter(function (it) { return PATH_RE.test(it.pathname); });
  if (!items.length) return json({ ok: false, error: "Нет файлов" }, 400);

  var caption = "📎 " + (name ? name + ": в" : "В") + "ложения к обращению в поддержку";
  var messageIds = [];
  var delivered = [];   // уже в Telegram — стереть из хранилища
  var linked = 0;

  // крупнее лимитов Telegram — ссылкой, остальное — альбомом (или по одному)
  var media = [], datas = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var tooBig = it.size > TG_FILE_MAX;
    if (tooBig) {
      var ids = await sendLink(admin, headerId, it, fileLink(origin, it.pathname), name);
      if (!ids) return json({ ok: false, error: "Telegram не принял сообщение" }, 502);
      messageIds = messageIds.concat(ids);
      linked++;
      continue;
    }
    var d = await download(it.pathname);
    it.size = d.buf.byteLength;
    if (it.kind === "photo" && it.size > TG_PHOTO_MAX) {
      // большое фото Telegram берёт только файлом
      var di = await sendOne(admin, headerId, it, d, caption, i);
      if (!di) di = await sendLink(admin, headerId, it, fileLink(origin, it.pathname), name);
      else delivered.push(it.pathname);
      if (!di) return json({ ok: false, error: "Telegram не принял файл" }, 502);
      messageIds = messageIds.concat(di);
      caption = "";
      continue;
    }
    media.push(it);
    datas.push(d);
  }

  // альбомы: до 10 штук и не больше TG_BATCH_MAX за раз
  var start = 0;
  while (start < media.length) {
    var end = start, total = 0;
    while (end < media.length && end - start < 10 && (end === start || total + media[end].size <= TG_BATCH_MAX)) {
      total += media[end].size;
      end++;
    }
    var part = media.slice(start, end), partData = datas.slice(start, end);
    var got = part.length > 1 ? await sendGroup(admin, headerId, part, partData, caption) : null;
    if (got) {
      messageIds = messageIds.concat(got);
      part.forEach(function (p) { delivered.push(p.pathname); });
    } else {
      // альбом не прошёл (или файл один) — шлём по одному, в крайнем случае ссылкой
      for (var j = 0; j < part.length; j++) {
        var one = await sendOne(admin, headerId, part[j], partData[j], j === 0 ? caption : "", start + j);
        if (one) delivered.push(part[j].pathname);
        else {
          one = await sendLink(admin, headerId, part[j], fileLink(origin, part[j].pathname), name);
          if (one) linked++;
        }
        if (!one) return json({ ok: false, error: "Telegram не принял файл" }, 502);
        messageIds = messageIds.concat(one);
      }
    }
    caption = "";
    start = end;
  }

  // ответ Николая на любое вложение тоже дойдёт ученику
  try { await callBot("attach", who, { headerId: headerId, messageIds: messageIds }, 6000); } catch (e) {}
  if (delivered.length) {
    try { await del(delivered); } catch (e) { console.log("support: delete failed", String(e)); }
  }
  return json({ ok: true, sent: messageIds.length, linked: linked });
}

export async function POST(request) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.ADMIN_CHAT_ID) {
    return json({ ok: false, error: "Бот не настроен" }, 500);
  }
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "Некорректный запрос" }, 400);
  }
  var who = identityOf(body || {});
  if (!who) return json({ ok: false, error: "Не получилось узнать, кто ты. Открой приложение заново" }, 403);
  try {
    if (body.action === "start") return await start(body, who);
    if (body.action === "send") return await send(body, who, new URL(request.url).origin);
    return json({ ok: false, error: "Неизвестное действие" }, 400);
  } catch (e) {
    console.log("support: failed", String(e && e.message ? e.message : e));
    return json({ ok: false, error: "Не получилось отправить" }, 500);
  }
}
