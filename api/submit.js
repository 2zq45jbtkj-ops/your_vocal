/* Приём домашки от ученика и пересылка в Telegram-чат преподавателя.
   Edge-функция Vercel — без npm-зависимостей и сборки.
   Нужны переменные окружения в Vercel (Project Settings -> Environment Variables):
     TELEGRAM_BOT_TOKEN  — токен бота от @BotFather
     ADMIN_CHAT_ID       — твой личный chat_id в Telegram (куда слать домашку)
     KV_REST_API_URL     — появляется после подключения Upstash Redis / Vercel KV
     KV_REST_API_TOKEN   — появляется после подключения Upstash Redis / Vercel KV
   Без KV_REST_API_* всё продолжит работать как раньше (просто не будет
   быстрых ответов ученику через api/telegram-webhook.js). */

import { kvSet } from "./_lib.js";

export const config = { runtime: "edge" };

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

function studentHashtag(lastName, firstName) {
  var clean = function (s) {
    return (s || "").trim().replace(/[^\p{L}\p{N}_]+/gu, "");
  };
  var tag = (clean(lastName) + "_" + clean(firstName)).replace(/^_+|_+$/g, "");
  return tag || "ученик";
}

async function tgSendMessage(token, chatId, text) {
  var res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
  return res.json();
}

async function tgSendFile(token, chatId, method, fieldName, file, caption, extra) {
  var form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append(fieldName, file, file.name || "upload");
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      if (extra[k]) form.append(k, String(extra[k]));
    });
  }
  var res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    body: form
  });
  return res.json();
}

async function rememberStudent(tagKey, chatIdOfStudent, firstName, lastName, tgId) {
  if (!chatIdOfStudent) return;
  await kvSet("student:" + tagKey, JSON.stringify({
    chatId: chatIdOfStudent, firstName: firstName, lastName: lastName, tgId: tgId
  }));
}

async function rememberMessage(messageId, tagKey) {
  if (!messageId) return;
  await kvSet("msg:" + messageId, tagKey);
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  var token = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.ADMIN_CHAT_ID;
  if (!token || !chatId) {
    return json({ ok: false, error: "Бот не настроен: нет TELEGRAM_BOT_TOKEN или ADMIN_CHAT_ID в Vercel" }, 500);
  }

  var form;
  try {
    form = await req.formData();
  } catch (e) {
    return json({ ok: false, error: "Некорректный запрос" }, 400);
  }

  var kind = form.get("kind"); // "quiz" | "warmup" | "song" | "song-marks"
  var firstName = (form.get("firstName") || "").toString();
  var lastName = (form.get("lastName") || "").toString();
  var tgId = (form.get("tgId") || "").toString();
  var studentChatId = (form.get("chatId") || "").toString();
  var lessonTitle = (form.get("lessonTitle") || "").toString();
  var isAdminTest = !!form.get("adminTest");
  var who = (lastName + " " + firstName).trim() || "Без имени";
  var tagKey = studentHashtag(lastName, firstName);
  var head = (isAdminTest ? "🛠 ТЕСТ АДМИНА (не настоящий ученик)\n" : "") +
    "#" + tagKey + "\n" + who + " (" + (tgId || "TG ID не указан") + ")\nУрок: " + lessonTitle;

  // Запоминаем ученика (для быстрых ответов из бота), не блокируем ответ ученику из-за этого.
  await rememberStudent(tagKey, studentChatId, firstName, lastName, tgId).catch(function () {});

  try {
    if (kind === "quiz") {
      var score = form.get("score");
      var total = form.get("total");
      var details = (form.get("details") || "").toString();
      var msg = "📝 Тест пройден\n" + head + "\nРезультат: " + score + "/" + total;
      if (details) msg += "\n\nОшибки:\n" + details;
      var r = await tgSendMessage(token, chatId, msg);
      if (!r.ok) return json({ ok: false, error: r.description || "Telegram отклонил сообщение" }, 502);
      if (r.result) await rememberMessage(r.result.message_id, tagKey).catch(function () {});
      return json({ ok: true });
    }

    if (kind === "feedback") {
      var moodEmoji = ["", "😞", "😐", "🙂", "😊", "🤩"];
      var moodVal = parseInt(form.get("mood"), 10) || 0;
      var moodLabel = (form.get("moodLabel") || "").toString();
      var fbText = (form.get("text") || "").toString();
      var fbMsg = "💬 Обратная связь по уроку\n" + head + "\nНастроение: " + (moodEmoji[moodVal] || "") + " " + moodLabel;
      if (fbText) fbMsg += "\n\n" + fbText;
      var r3 = await tgSendMessage(token, chatId, fbMsg);
      if (!r3.ok) return json({ ok: false, error: r3.description || "Telegram отклонил сообщение" }, 502);
      if (r3.result) await rememberMessage(r3.result.message_id, tagKey).catch(function () {});
      return json({ ok: true });
    }

    if (kind === "song-marks") {
      var text = (form.get("text") || "").toString();
      var r2 = await tgSendMessage(token, chatId, "🎼 Разметка дыхания (песни)\n" + head + "\n\n" + text);
      if (!r2.ok) return json({ ok: false, error: r2.description || "Telegram отклонил сообщение" }, 502);
      if (r2.result) await rememberMessage(r2.result.message_id, tagKey).catch(function () {});
      return json({ ok: true });
    }

    if (kind === "booking") {
      var bookText = (form.get("text") || "").toString();
      var r4 = await tgSendMessage(token, chatId, "📅 Заявка на запись\n" + head + "\n" + bookText);
      if (!r4.ok) return json({ ok: false, error: r4.description || "Telegram отклонил сообщение" }, 502);
      if (r4.result) await rememberMessage(r4.result.message_id, tagKey).catch(function () {});
      return json({ ok: true });
    }

    var file = form.get("file");
    if (!file) return json({ ok: false, error: "Файл не передан" }, 400);

    var isSong = kind === "song";
    var label = isSong ? "🎵 Разметка песни (фото)" : "🎤 Распевки (видео)";
    var method = isSong ? "sendPhoto" : "sendVideo";
    var field = isSong ? "photo" : "video";

    // Реальные width/height/duration видео — без них Telegram иногда неверно
    // угадывает пропорции и растягивает картинку в квадрат.
    var extra = isSong ? null : {
      width: form.get("width"),
      height: form.get("height"),
      duration: form.get("duration"),
      supports_streaming: "true"
    };

    var result = await tgSendFile(token, chatId, method, field, file, label + "\n" + head, extra);
    if (!result.ok) {
      // фолбэк: если Telegram не смог обработать как видео/фото (например формат/размер), шлём документом
      var result2 = await tgSendFile(token, chatId, "sendDocument", "document", file, label + " (файлом)\n" + head);
      if (!result2.ok) {
        return json({ ok: false, error: result2.description || result.description || "Telegram отклонил файл" }, 502);
      }
      if (result2.result) await rememberMessage(result2.result.message_id, tagKey).catch(function () {});
      return json({ ok: true });
    }
    if (result.result) await rememberMessage(result.result.message_id, tagKey).catch(function () {});
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
