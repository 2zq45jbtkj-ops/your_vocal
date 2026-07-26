/* Webhook бота: преподаватель отвечает ученику, просто ОТВЕЧАЯ (reply)
   на присланное этим учеником сообщение в чате с ботом — без поиска.
   Работает и с текстом, и с голосовыми.

   Разовая настройка после деплоя (сделай сам в браузере, вставив токен):
   https://api.telegram.org/bot<ТВОЙ_ТОКЕН>/setWebhook?url=https://your-vocal.vercel.app/api/telegram-webhook

   Нужны те же TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, плюс KV_REST_API_URL и
   KV_REST_API_TOKEN (появляются автоматически после подключения Upstash
   Redis / Vercel KV в Vercel -> Storage). */

import { kvGet, tgApi } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return new Response("ok");

  var token = process.env.TELEGRAM_BOT_TOKEN;
  var adminChatId = process.env.ADMIN_CHAT_ID;
  if (!token || !adminChatId) return new Response("ok");

  var update;
  try {
    update = await req.json();
  } catch (e) {
    return new Response("ok");
  }

  var msg = update.message;
  if (!msg || !msg.reply_to_message) return new Response("ok");
  // Отвечать может только сам преподаватель, из своего чата с ботом.
  if (String(msg.chat.id) !== String(adminChatId)) return new Response("ok");

  var studentKey = await kvGet("msg:" + msg.reply_to_message.message_id);
  if (!studentKey) {
    await tgApi(token, "sendMessage", {
      chat_id: adminChatId,
      text: "Не нашёл, кому это адресовано — сообщение слишком старое (до подключения базы) или это не домашка ученика."
    });
    return new Response("ok");
  }

  var studentRaw = await kvGet("student:" + studentKey);
  var student = null;
  try { student = studentRaw ? JSON.parse(studentRaw) : null; } catch (e) {}
  if (!student || !student.chatId) {
    await tgApi(token, "sendMessage", {
      chat_id: adminChatId,
      text: "У этого ученика ещё нет сохранённого chat_id — он должен открыть мини-апп ещё раз (через бота, не в обычном браузере)."
    });
    return new Response("ok");
  }

  var result = null;
  if (msg.voice) {
    result = await tgApi(token, "sendVoice", {
      chat_id: student.chatId,
      voice: msg.voice.file_id,
      caption: "🎙 Голосовое сообщение от преподавателя"
    });
  } else if (msg.text) {
    result = await tgApi(token, "sendMessage", {
      chat_id: student.chatId,
      text: "✉️ Сообщение от преподавателя:\n\n" + msg.text
    });
  } else {
    await tgApi(token, "sendMessage", {
      chat_id: adminChatId,
      text: "Такой тип сообщения пока не пересылаю (только текст и голосовые)."
    });
    return new Response("ok");
  }

  await tgApi(token, "sendMessage", {
    chat_id: adminChatId,
    text: (result && result.ok)
      ? "Отправлено ученику ✓ (" + (student.lastName || "") + " " + (student.firstName || "") + ")"
      : "Не удалось отправить: " + ((result && result.description) || "ошибка Telegram")
  });
  return new Response("ok");
}
