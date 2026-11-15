/* Ссылка Николаю на большой файл из обращения в поддержку (Telegram не берёт от
   бота больше 50 МБ). Хранилище закрытое: проверяем подпись ссылки и
   перенаправляем на временный адрес файла (час), который открывается в браузере
   и проигрывается с перемоткой. Файлы живут 30 дней (api/support-cleanup.js). */

import { issueSignedToken, presignUrl, get } from "@vercel/blob";
import { checkFileSig } from "./_support.js";

export async function GET(request) {
  var u = new URL(request.url);
  var p = u.searchParams.get("p") || "";
  var s = u.searchParams.get("s") || "";
  if (!/^support\/[\w.\-]+$/.test(p) || !checkFileSig(p, s)) {
    return new Response("Ссылка неверная", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  var until = Date.now() + 60 * 60 * 1000;
  try {
    var t = await issueSignedToken({ pathname: p, operations: ["get"], validUntil: until });
    var r = await presignUrl(t, { operation: "get", pathname: p, access: "private", validUntil: until });
    return new Response(null, { status: 302, headers: { location: r.presignedUrl, "cache-control": "no-store" } });
  } catch (e) {
    console.log("support-file: presign failed", String(e && e.message ? e.message : e));
  }
  // запасной путь — отдаём файл сами
  var f = await get(p, { access: "private" }).catch(function () { return null; });
  if (!f || f.statusCode !== 200) {
    return new Response("Файла уже нет: ссылки работают 30 дней", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(f.stream, { headers: { "content-type": f.blob.contentType || "application/octet-stream", "cache-control": "no-store" } });
}
