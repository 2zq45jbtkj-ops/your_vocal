/* Приём домашки от ученика и пересылка в Telegram-чат преподавателя.
   Edge-функция Vercel — без npm-зависимостей и сборки.
   Нужны переменные окружения в Vercel (Project Settings -> Environment Variables):
     TELEGRAM_BOT_TOKEN — токен бота от @BotFather
     ADMIN_CHAT_ID      — твой личный chat_id в Telegram (куда слать домашку) */

export const config = { runtime: "edge" };

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

async function tgSendMessage(token, chatId, text) {
  var res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
  return res.json();
}

async function tgSendFile(token, chatId, method, fieldName, file, caption) {
  var form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append(fieldName, file, file.name || "upload");
  var res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    body: form
  });
  return res.json();
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

  var kind = form.get("kind"); // "quiz" | "warmup" | "song"
  var firstName = (form.get("firstName") || "").toString();
  var lastName = (form.get("lastName") || "").toString();
  var tgId = (form.get("tgId") || "").toString();
  var lessonTitle = (form.get("lessonTitle") || "").toString();
  var who = (lastName + " " + firstName).trim() || "Без имени";
  var head = who + " (" + (tgId || "TG ID не указан") + ")\nУрок: " + lessonTitle;

  try {
    if (kind === "quiz") {
      var score = form.get("score");
      var total = form.get("total");
      var r = await tgSendMessage(token, chatId, "📝 Тест пройден\n" + head + "\nРезультат: " + score + "/" + total);
      if (!r.ok) return json({ ok: false, error: r.description || "Telegram отклонил сообщение" }, 502);
      return json({ ok: true });
    }

    var file = form.get("file");
    if (!file) return json({ ok: false, error: "Файл не передан" }, 400);

    var isSong = kind === "song";
    var label = isSong ? "🎵 Разметка песни (фото)" : "🎤 Распевки (видео)";
    var method = isSong ? "sendPhoto" : "sendVideo";
    var field = isSong ? "photo" : "video";

    var result = await tgSendFile(token, chatId, method, field, file, label + "\n" + head);
    if (!result.ok) {
      // фолбэк: если Telegram не смог обработать как видео/фото (например формат/размер), шлём документом
      var result2 = await tgSendFile(token, chatId, "sendDocument", "document", file, label + " (файлом)\n" + head);
      if (!result2.ok) {
        return json({ ok: false, error: result2.description || result.description || "Telegram отклонил файл" }, 502);
      }
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
