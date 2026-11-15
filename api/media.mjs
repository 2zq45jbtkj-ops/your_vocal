/* Файлы, загруженные через /upload (только с ключом k):
   GET /api/media?k=…                  список [{pathname, name, size, uploadedAt, url}]
   GET /api/media?k=…&get=media/…      скачать (переадресация на временный адрес, 1 час)
   GET /api/media?k=…&get=…&b64=1      маленький файл (до 3 МБ) в base64 JSON — для проверки
   GET /api/media?k=…&delete=media/…   удалить */

import { list, get, del, issueSignedToken, presignUrl } from "@vercel/blob";
import { keyOk, json, MEDIA_RE } from "./_media.mjs";

async function presigned(pathname) {
  var until = Date.now() + 60 * 60 * 1000;
  var t = await issueSignedToken({ pathname: pathname, operations: ["get"], validUntil: until });
  var r = await presignUrl(t, { operation: "get", pathname: pathname, access: "private", validUntil: until });
  return r.presignedUrl;
}

export async function GET(request) {
  var u = new URL(request.url);
  var k = u.searchParams.get("k") || "";
  if (!keyOk(k)) return json({ error: "Нет доступа" }, 403);

  var del_ = u.searchParams.get("delete");
  if (del_) {
    if (!MEDIA_RE.test(del_)) return json({ error: "Неверное имя файла" }, 400);
    await del(del_);
    return json({ ok: true, deleted: del_ });
  }

  var p = u.searchParams.get("get");
  if (p) {
    if (!MEDIA_RE.test(p)) return json({ error: "Неверное имя файла" }, 400);
    if (u.searchParams.get("b64")) {
      var f = await get(p, { access: "private" }).catch(function () { return null; });
      if (!f || f.statusCode !== 200) return json({ error: "Файла нет" }, 404);
      var buf = Buffer.from(await new Response(f.stream).arrayBuffer());
      if (buf.length > 3 * 1024 * 1024) return json({ error: "Больше 3 МБ: скачай без b64" }, 413);
      return json({
        pathname: p, size: buf.length,
        sha256: (await import("node:crypto")).createHash("sha256").update(buf).digest("hex"),
        base64: buf.toString("base64")
      });
    }
    try {
      return new Response(null, { status: 302, headers: { location: await presigned(p), "cache-control": "no-store" } });
    } catch (e) {
      console.log("media: presign failed", String(e && e.message ? e.message : e));
      var g = await get(p, { access: "private" }).catch(function () { return null; });
      if (!g || g.statusCode !== 200) return json({ error: "Файла нет" }, 404);
      return new Response(g.stream, { headers: { "content-type": g.blob.contentType || "application/octet-stream", "cache-control": "no-store" } });
    }
  }

  var out = [];
  var cursor;
  do {
    var r = await list({ prefix: "media/", cursor: cursor, limit: 1000 });
    r.blobs.forEach(function (b) {
      out.push({
        pathname: b.pathname,
        name: b.pathname.replace(/^media\/[a-z0-9]+-/, ""),
        size: b.size,
        uploadedAt: b.uploadedAt,
        url: u.origin + "/api/media?k=" + encodeURIComponent(k) + "&get=" + encodeURIComponent(b.pathname)
      });
    });
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  out.sort(function (a, b) { return String(b.uploadedAt).localeCompare(String(a.uploadedAt)); });
  return json({ files: out });
}
