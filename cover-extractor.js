/* ==========================================================================
   CoverExtractor — обложка, исполнитель и название прямо из файла трека (20.11).

   Читает теги проверенной библиотекой jsmediatags (vendor/jsmediatags.min.js):
   ID3v2 APIC (MP3), covr (M4A/MP4), PICTURE (FLAC), плюс исполнитель/название.
   По ссылке библиотека качает только нужные куски файла (Range-запросы),
   а не весь трек; если сервер так не умеет — качаем файл целиком.

   Обложка уменьшается до 400 px (JPEG) — её хранит сервер (api/karaoke-cover),
   браузер кэширует на диске. Заодно из той же картинки 64×64 считается
   палитра (PaletteResolver), чтобы не декодировать обложку второй раз.
   Декодирование — createImageBitmap: браузер делает его вне основного потока.

   Повреждённый файл или теги не роняют ничего: read() всегда возвращает
   объект, в худшем случае { ok:false, title:<имя файла> }.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CoverExtractor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var THUMB = 400, PAL = 64;

  function clean(s) {
    return String(s == null ? "" : s).replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  }

  function baseName(name) {
    var n = String(name || "").split(/[\\/]/).pop().split("?")[0];
    try { n = decodeURIComponent(n); } catch (e) {}
    return n.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim() || "Трек";
  }

  // Что за картинка на самом деле (по первым байтам) — теги часто врут в MIME.
  function sniff(b) {
    if (!b || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
    return null;
  }

  /* Ответ jsmediatags → { title, artist, picture:{mime,bytes}|null }.
     Отдельная функция без браузера — её проверяют unit-тесты. */
  function normalize(result, fileName) {
    var t = (result && result.tags) || {};
    var title = clean(t.title);
    var artist = clean(t.artist) || clean(t.albumartist) || clean(t.TPE2 && t.TPE2.data);
    var picture = null;
    var p = t.picture;
    if (p && p.data && p.data.length > 64) {
      var bytes = p.data instanceof Uint8Array ? p.data : Uint8Array.from(p.data);
      var mime = sniff(bytes);
      if (mime) picture = { mime: mime, bytes: bytes };
    }
    return {
      ok: true,
      type: (result && result.type) || "",
      title: title || baseName(fileName),
      titleFromTags: !!title,
      artist: artist,
      picture: picture
    };
  }

  function failed(fileName, err) {
    return { ok: false, error: String((err && (err.info || err.message || err.type)) || err || "read"), title: baseName(fileName), titleFromTags: false, artist: "", picture: null };
  }

  /* ---------- дальше — только браузер ---------- */

  var libP = null;
  function lib() {
    if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
    if (window.jsmediatags) return Promise.resolve(window.jsmediatags);
    if (libP) return libP;
    libP = new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "/vendor/jsmediatags.min.js";
      sc.onload = function () { window.jsmediatags ? res(window.jsmediatags) : rej(new Error("no lib")); };
      sc.onerror = function () { libP = null; rej(new Error("lib load")); };
      document.head.appendChild(sc);
    });
    return libP;
  }

  function readWith(jm, src) {
    return new Promise(function (res, rej) {
      try { jm.read(src, { onSuccess: res, onError: rej }); } catch (e) { rej(e); }
    });
  }

  /* src — File/Blob (только что выбранный файл) или https-ссылка на трек. */
  function read(src, fileName) {
    var name = fileName || (src && src.name) || (typeof src === "string" ? src : "");
    return lib().then(function (jm) {
      return readWith(jm, src).catch(function (err) {
        if (typeof src !== "string") throw err;
        // Нет Range/CORS для HEAD — качаем файл целиком один раз.
        return fetch(src).then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.blob();
        }).then(function (b) { return readWith(jm, b); });
      });
    }).then(function (r) { return normalize(r, name); }, function (e) { return failed(name, e); });
  }

  function decode(blob) {
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(blob);
      img.onload = function () { URL.revokeObjectURL(u); res(img); };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error("decode")); };
      img.src = u;
    });
  }

  function canvas(w, h) {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
    var c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }

  function toJpeg(c) {
    if (c.convertToBlob) return c.convertToBlob({ type: "image/jpeg", quality: 0.82 });
    return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.82); });
  }

  /* Картинка (Blob или {mime,bytes}) → квадратная JPEG 400 px (центр,
     как object-fit: cover) + пиксели 64×64 для палитры. */
  function thumb(pic) {
    var blob = pic instanceof Blob ? pic : new Blob([pic.bytes], { type: pic.mime });
    return decode(blob).then(function (bm) {
      var w = bm.width, h = bm.height, s = Math.min(w, h);
      if (!s) throw new Error("empty image");
      var sx = (w - s) / 2, sy = (h - s) / 2, out = Math.min(THUMB, s);
      var c = canvas(out, out), x = c.getContext("2d");
      x.imageSmoothingQuality = "high";
      x.drawImage(bm, sx, sy, s, s, 0, 0, out, out);
      var p = canvas(PAL, PAL), px = p.getContext("2d", { willReadFrequently: true });
      px.drawImage(bm, sx, sy, s, s, 0, 0, PAL, PAL);
      var data = px.getImageData(0, 0, PAL, PAL).data;
      if (bm.close) bm.close();
      return toJpeg(c).then(function (jpeg) {
        return { jpeg: jpeg, pixels: data, size: PAL };
      });
    });
  }

  return { read: read, thumb: thumb, normalize: normalize, sniff: sniff, baseName: baseName, THUMB: THUMB };
});
