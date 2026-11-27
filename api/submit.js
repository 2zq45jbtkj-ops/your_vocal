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
import { verifyInitData, db } from "./_db.js";
import { ensureHw, hwCat, tgStore, notifyShort } from "./_hw.js";

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

/* Копия сдачи для «Ученики» → «ДЗ» в боте записи (тот же бот, поэтому file_id из
   ответа Telegram годится и там). Ученика бот узнаёт по подписи Telegram (initData),
   новых секретов не нужно. Ошибка здесь не мешает ученику: домашка уже у Николая. */
var HW_INTAKE_URL = "https://vocal-bot.vercel.app/api/hw_intake";

function fileOf(msg) {
  if (!msg) return {};
  if (msg.video) return { fileId: msg.video.file_id, fileType: "video" };
  if (msg.photo && msg.photo.length) return { fileId: msg.photo[msg.photo.length - 1].file_id, fileType: "photo" };
  if (msg.audio) return { fileId: msg.audio.file_id, fileType: "audio" };
  if (msg.document) return { fileId: msg.document.file_id, fileType: "document" };
  return {};
}

async function recordForBot(initData, accessToken, rec) {
  // в Telegram ученика узнают по подписи; вне Telegram (значок «ДЗ» на экране
  // телефона) — по его коду доступа
  if (!initData && !accessToken) return;
  if (initData) rec.initData = initData;
  else rec.accessToken = accessToken;
  // не больше 8 секунд: ученик не должен ждать бота записи
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, 8000);
  try {
    await fetch(process.env.HW_INTAKE_URL || HW_INTAKE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rec),
      signal: ctl.signal
    });
  } finally {
    clearTimeout(timer);
  }
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
  var initData = (form.get("initData") || "").toString();
  var accessToken = (form.get("accessToken") || "").toString().trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accessToken)) accessToken = "";
  var lessonNo = (form.get("lessonNo") || "").toString();
  var save = function (kind2, title, body, msg, extra) {
    var f = fileOf(msg);
    var rec = {
      kind: kind2, title: title, body: body || "", lessonNo: lessonNo, topic: lessonTitle,
      fileId: f.fileId || "", fileType: f.fileType || ""
    };
    if (extra) Object.keys(extra).forEach(function (k) { rec[k] = extra[k]; });
    return recordForBot(initData, accessToken, rec).catch(function () {});
  };
  var who = (lastName + " " + firstName).trim() || "Без имени";
  var tagKey = studentHashtag(lastName, firstName);
  var head = (isAdminTest ? "🛠 ТЕСТ АДМИНА (не настоящий ученик)\n" : "") +
    "#" + tagKey + "\n" + who + " (" + (tgId || "TG ID не указан") + ")\nУрок: " + lessonTitle;

  // Запоминаем ученика (для быстрых ответов из бота), не блокируем ответ ученику из-за этого.
  // 26.11: chat_id для ответов берём только из подписи Telegram — иначе любой мог
  // подставить чужое имя и свой chat_id и получать ответы Николая вместо ученика.
  var verifiedId = await verifyInitData(initData).catch(function () { return null; });
  if (verifiedId) await rememberStudent(tagKey, verifiedId, firstName, lastName, tgId).catch(function () {});

  /* 28.11: домашка → в приложение (Админ → Домашние задания), в бот — короткое
     «Новое ДЗ: Имя». Если база недоступна — старый путь ниже (всё целиком в бот),
     чтобы сдача не потерялась. */
  if (kind === "quiz" || kind === "song-marks" || kind === "song" || kind === "warmup" || kind === "karaoke-take") {
    var sql = db();
    if (sql) {
      try {
        var res = await toApp(sql);
        if (res) return res;
      } catch (e) {
        console.log("submit: app path failed, fallback to bot", String(e && e.message ? e.message : e));
      }
    }
  }

  async function toApp(sql) {
    await ensureHw(sql);
    var cat = hwCat(kind);
    var title = "", body = "", msg = null, meta = {};
    if (kind === "quiz") {
      var sc = (form.get("score") || "").toString(), tt = (form.get("total") || "").toString();
      var det = (form.get("details") || "").toString();
      title = "Тест: " + sc + " из " + tt;
      body = det;
      meta = { score: Number(sc) || 0, total: Number(tt) || 0 };
    } else if (kind === "song-marks") {
      title = (form.get("marksTitle") || "").toString().slice(0, 60) || "Разметка дыхания в песне";
      body = (form.get("text") || "").toString();
    } else {
      var file = form.get("file");
      if (!file) return null;
      var note = (form.get("note") || "").toString().slice(0, 400);
      body = note;
      if (kind === "karaoke-take") {
        title = "Дубль из караоке";
        msg = await tgStore(token, chatId, "sendAudio", "audio", file);
        if (!msg.ok) msg = await tgStore(token, chatId, "sendDocument", "document", file);
      } else {
        var isPhoto = /^image\//.test(file.type || "") || (kind === "song" && !/^video\//.test(file.type || ""));
        title = kind === "warmup" ? "Распевки, видео" : isPhoto ? "Разметка песни, фото" : "Задание с песней, видео";
        var vx = { width: form.get("width"), height: form.get("height"), duration: form.get("duration"), supports_streaming: "true" };
        msg = isPhoto
          ? await tgStore(token, chatId, "sendPhoto", "photo", file)
          : await tgStore(token, chatId, "sendVideo", "video", file, vx);
        if (!msg.ok) msg = await tgStore(token, chatId, "sendDocument", "document", file);
        meta = { width: Number(form.get("width")) || 0, height: Number(form.get("height")) || 0, duration: Number(form.get("duration")) || 0 };
      }
      if (!msg.ok) return json({ ok: false, error: msg.description || "Telegram отклонил файл" }, 502);
      msg = msg.result;
    }
    var f = fileOf(msg);
    var skey = verifiedId ? "tg:" + verifiedId : accessToken ? "code:" + accessToken : "name:" + tagKey;
    var shown = ((firstName + " " + lastName).trim()) || "Без имени";
    await sql`INSERT INTO hw_items (skey, name, tg_id, is_test, cat, kind, lesson_no, topic, title, body, file_id, file_type, meta)
      VALUES (${skey}, ${shown}, ${verifiedId || ""}, ${isAdminTest}, ${cat}, ${kind}, ${lessonNo}, ${lessonTitle},
              ${title}, ${body}, ${f.fileId || ""}, ${f.fileType || ""}, ${JSON.stringify(meta)})`;
    var lessonLine = lessonTitle ? (lessonNo ? "Урок " + lessonNo + " «" + lessonTitle + "»" : "«" + lessonTitle + "»") : "";
    var mid = await notifyShort(token, chatId, { skey: skey, name: shown, cat: cat, lesson: lessonLine, isTest: isAdminTest }).catch(function () { return null; });
    if (mid) await rememberMessage(mid, tagKey).catch(function () {});
    // бот записи: «Ученики → ДЗ» и «Мои записи» ученика (file_id тот же бот)
    await save(f.fileType === "audio" || kind === "karaoke-take" ? "audio" : kind === "quiz" ? "test" : kind === "song-marks" || f.fileType === "photo" ? "markup" : "video",
      kind === "song-marks" && title === "Разметка дыхания (песни)" ? "Разметка дыхания в песне" : title, body, msg);
    return json({ ok: true, inApp: true });
  }

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
      await save("test", "Тест: " + score + " из " + total, details ? "Ошибки:\n" + details : "");
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
      await save("review", "Обратная связь по уроку",
        "Настроение: " + (moodEmoji[moodVal] || "") + " " + moodLabel + (fbText ? "\n\n" + fbText : ""));
      return json({ ok: true });
    }

    if (kind === "song-marks") {
      var text = (form.get("text") || "").toString();
      var marksTitle = (form.get("marksTitle") || "").toString().slice(0, 60) || "Разметка дыхания (песни)";
      var r2 = await tgSendMessage(token, chatId, "🎼 " + marksTitle + "\n" + head + "\n\n" + text);
      if (!r2.ok) return json({ ok: false, error: r2.description || "Telegram отклонил сообщение" }, 502);
      if (r2.result) await rememberMessage(r2.result.message_id, tagKey).catch(function () {});
      await save("markup", marksTitle === "Разметка дыхания (песни)" ? "Разметка дыхания в песне" : marksTitle, text);
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

    // Дубль из караоке (25.11): голос с обработкой + минус, mp3
    if (kind === "karaoke-take") {
      var tnote = (form.get("note") || "").toString().slice(0, 400);
      var cap = "🎙 Дубль из караоке\n" + (tnote ? tnote + "\n" : "") + head;
      var ra = await tgSendFile(token, chatId, "sendAudio", "audio", file, cap);
      if (!ra.ok) ra = await tgSendFile(token, chatId, "sendDocument", "document", file, cap);
      if (!ra.ok) return json({ ok: false, error: ra.description || "Telegram отклонил файл" }, 502);
      if (ra.result) await rememberMessage(ra.result.message_id, tagKey).catch(function () {});
      // бот ставит под этим сообщением «Ответить …» и кладёт дубль в «Ученики → Записи»
      await save("audio", "Дубль из караоке", tnote, ra.result,
        ra.result ? { adminChatId: ra.result.chat && ra.result.chat.id, adminMsgId: ra.result.message_id } : null);
      return json({ ok: true });
    }

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

    // Подпись от тренажёра дыхания: упражнение, темп и как вели себя плечи
    var note = (form.get("note") || "").toString().slice(0, 400);
    if (note) label = label + "\n" + note;
    var result = await tgSendFile(token, chatId, method, field, file, label + "\n" + head, extra);
    if (!result.ok) {
      // фолбэк: если Telegram не смог обработать как видео/фото (например формат/размер), шлём документом
      var result2 = await tgSendFile(token, chatId, "sendDocument", "document", file, label + " (файлом)\n" + head);
      if (!result2.ok) {
        return json({ ok: false, error: result2.description || result.description || "Telegram отклонил файл" }, 502);
      }
      if (result2.result) await rememberMessage(result2.result.message_id, tagKey).catch(function () {});
      await save(isSong ? "markup" : "video", isSong ? "Разметка песни, фото" : "Распевки, видео", "", result2.result);
      return json({ ok: true });
    }
    if (result.result) await rememberMessage(result.result.message_id, tagKey).catch(function () {});
    await save(isSong ? "markup" : "video", isSong ? "Разметка песни, фото" : "Распевки, видео", "", result.result);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
