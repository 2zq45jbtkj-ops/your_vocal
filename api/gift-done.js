/* Кнопка «✅ Выполнил» под уведомлением о талоне ведёт сюда.
   Проверяет подпись, отмечает талон выполненным, меняет сообщение в боте
   и показывает короткую страницу. Повторное нажатие ничего не ломает. */

import { giftSql, validTaskId, signTask } from "./_gift.js";

export const config = { runtime: "edge" };

// The page is a big holographic coupon like in the app: foil, soft diagonal glare and a slow
// 3D sway done with CSS animation only (no gyroscope needed).
function page(title, text, icon) {
  var css =
    '*{box-sizing:border-box}' +
    'html,body{margin:0;height:100%;background:#2b201c}' +
    'body{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:28px;' +
      'font-family:"PT Serif",Georgia,serif;color:#fff8f0;' +
      'background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,.035) 1px,transparent 0);background-size:7px 7px}' +
    '.stage{perspective:1000px;width:100%;max-width:330px}' +
    '.card{position:relative;width:100%;aspect-ratio:3/4;border-radius:24px;overflow:visible;' +
      'transform-style:preserve-3d;animation:sway 7s ease-in-out infinite alternate;' +
      'box-shadow:0 22px 50px rgba(0,0,0,.55),0 0 34px rgba(170,140,255,.16)}' +
    '.foil{position:absolute;inset:0;border-radius:inherit;overflow:hidden;isolation:isolate}' +
    '.tex{position:absolute;inset:-25%;background:url(/gift/holo-texture-dark.jpg) 0 0/640px auto repeat;' +
      'animation:tex 7s ease-in-out infinite alternate}' +
    '.veil{position:absolute;inset:0;background:linear-gradient(165deg,rgba(24,14,10,.15) 0%,rgba(24,14,10,.32) 45%,rgba(24,14,10,.5) 100%)}' +
    '.glare{position:absolute;inset:0;mix-blend-mode:screen;' +
      'background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,240,255,.42) 46%,rgba(200,255,250,.22) 54%,rgba(255,255,255,0) 70%) 0 0/260% 260%;' +
      'animation:glare 7s ease-in-out infinite alternate}' +
    '.edge{position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),inset 0 1px 0 rgba(255,255,255,.4),inset 0 0 18px rgba(255,255,255,.08)}' +
    '.tape{position:absolute;top:-13px;left:50%;width:96px;height:26px;transform:translateX(-50%) rotate(-2deg);' +
      'background:rgba(214,170,190,.78);border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.25);z-index:3}' +
    '.punch{position:absolute;width:12px;height:12px;border-radius:50%;background:#1a110d;box-shadow:0 1px 0 rgba(255,255,255,.3);z-index:3}' +
    '.p1{top:14px;left:14px}.p2{top:14px;right:14px}.p3{bottom:14px;left:14px}.p4{bottom:14px;right:14px}' +
    '.content{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:14px;padding:34px 26px;text-align:center;transform:translateZ(30px)}' +
    '.icon{width:92px;height:92px;border-radius:26px;display:flex;align-items:center;justify-content:center;font-size:44px;' +
      'background:rgba(26,15,11,.62);border:1px solid rgba(255,255,255,.18)}' +
    'h1{margin:0;font:600 40px/1.05 Caveat,cursive;text-shadow:0 1px 3px rgba(0,0,0,.6)}' +
    'p{margin:0;font-size:16px;line-height:1.45;color:#f3e6da;text-shadow:0 1px 2px rgba(0,0,0,.6)}' +
    '@keyframes sway{0%{transform:rotateY(-11deg) rotateX(7deg)}50%{transform:rotateY(4deg) rotateX(-6deg)}100%{transform:rotateY(11deg) rotateX(4deg)}}' +
    '@keyframes tex{0%{transform:translate3d(10%,-6%,0);filter:hue-rotate(-30deg)}50%{transform:translate3d(-3%,8%,0);filter:hue-rotate(10deg)}100%{transform:translate3d(-10%,-4%,0);filter:hue-rotate(35deg)}}' +
    '@keyframes glare{0%{background-position:5% 20%}50%{background-position:55% 75%}100%{background-position:95% 35%}}' +
    '@media (prefers-reduced-motion:reduce){.card,.tex,.glare{animation:none}}';
  var html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="theme-color" content="#2b201c">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=PT+Serif:wght@400;700&display=swap">' +
    '<title>' + title + '</title><style>' + css + '</style></head><body>' +
    '<div class="stage"><div class="card">' +
      '<div class="foil"><div class="tex"></div><div class="veil"></div><div class="glare"></div><div class="edge"></div></div>' +
      '<div class="tape"></div><span class="punch p1"></span><span class="punch p2"></span><span class="punch p3"></span><span class="punch p4"></span>' +
      '<div class="content">' + (icon ? '<div class="icon">' + icon + '</div>' : '') +
        '<h1>' + title + '</h1><p>' + text + '</p></div>' +
    '</div></div></body></html>';
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

export default async function handler(req) {
  var url = new URL(req.url);
  var id = url.searchParams.get("id");
  var s = url.searchParams.get("s");
  if (!validTaskId(id) || !s || s !== (await signTask(id))) {
    return page("Ссылка не подошла", "Похоже, кнопка повреждена.");
  }

  var sql = await giftSql();
  if (!sql) return page("Нет базы", "Не удалось подключиться к базе.");

  var rows = await sql`SELECT title, icon, extras, note, msg_id, done_at FROM gift_tasks WHERE id = ${id}`;
  if (!rows.length) return page("Талон не найден", "Возможно, он уже удалён.");
  var t = rows[0];

  if (!t.done_at) {
    await sql`UPDATE gift_tasks SET done_at = now() WHERE id = ${id} AND done_at IS NULL`;

    var token = process.env.TELEGRAM_BOT_TOKEN;
    var chatId = process.env.ADMIN_CHAT_ID;
    if (token && chatId && t.msg_id) {
      var text = "✅ Выполнено\n" + (t.icon ? t.icon + " " : "") + t.title + (t.extras ? "\n✨ Допы: " + t.extras : "") + (t.note ? "\n💬 Пожелание: " + t.note : "");
      await fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: Number(t.msg_id), text: text })
      }).catch(function () {});
    }
  }

  return page("✅ Готово!", "«" + esc(t.title) + "» отмечен выполненным — у Бусинки он уже в истории 💛<br><span style=\"opacity:.75;font-size:14px\">Можно закрыть страницу</span>", t.icon || "✅");
}
