/* Закрытая загрузка файлов для Николая (/upload?k=…): треки, видео, фото —
   в хранилище Vercel Blob (папка media/). Ключ доступа в коде не хранится,
   только его SHA-256: по коду ключ не восстановить. */

import crypto from "node:crypto";

var KEY_SHA256 = "6815056e30d34123ee9a7d3d1186a4873e297ef9d8b21ca46bdf3821a9e0ce3a";

export var MEDIA_RE = /^media\/[\w.\-]+$/;

export function keyOk(k) {
  var h = crypto.createHash("sha256").update(String(k || "")).digest();
  var want = Buffer.from(KEY_SHA256, "hex");
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
