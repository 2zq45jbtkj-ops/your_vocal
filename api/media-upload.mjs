/* Разрешение на прямую загрузку файла со страницы /upload в хранилище Blob
   (любой размер, большие файлы — по частям). Только с правильным ключом. */

import { handleUpload } from "@vercel/blob/client";
import { keyOk, json, MEDIA_RE } from "./_media.mjs";

export async function POST(request) {
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Некорректный запрос" }, 400);
  }
  try {
    var result = await handleUpload({
      body: body,
      request: request,
      onBeforeGenerateToken: async function (pathname, clientPayload) {
        if (!MEDIA_RE.test(pathname)) throw new Error("Неверное имя файла");
        var p = {};
        try { p = JSON.parse(clientPayload || "{}"); } catch (e) {}
        if (!keyOk(p.k)) throw new Error("Нет доступа");
        return {
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
          validUntil: Date.now() + 6 * 60 * 60 * 1000
        };
      }
    });
    return json(result);
  } catch (e) {
    console.log("media-upload: failed", String(e && e.message ? e.message : e));
    return json({ error: String(e && e.message ? e.message : e) }, 400);
  }
}
