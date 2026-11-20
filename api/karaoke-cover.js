/* Обложка трека для «Мои треки» и фона караоке (20.11).

   GET  ?id=<songId>&v=<версия> → сама картинка (JPEG 400 px). Ссылка с версией
        не меняется, пока не сменится обложка, поэтому браузер держит её в
        дисковом кэше навсегда (immutable).
   POST { songId, src, jpeg (base64 | null), palette, tagTitle, tagArtist, status, manual }
        Пишет:
        • приложение после разбора файла (status cover/none/broken) — Николай
          (X-Site-Auth) или сам ученик, чья это песня (X-Player-Session), и
          только если src — действительно плюс или минус этой песни;
        • вручную («Заменить обложку», manual: true) — Николай (X-Site-Auth)
          или ученик у трека, который загрузил сам.
        Автоматический разбор никогда не перезаписывает обложку, которую
        Николай поставил вручную. */

import { db, json } from "./_db.js";
import { ensureCover, isTeacher, sessionSongs } from "./_cover.js";

export const config = { runtime: "edge" };

var STATUSES = ["cover", "none", "broken"];

function b64ToBytes(s) {
  var bin = atob(s), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function cleanPalette(p) {
  if (!p || typeof p !== "object") return null;
  var hex = /^#[0-9a-f]{6}$/i, out = {};
  ["dominant", "second", "dark", "accent", "average"].forEach(function (k) { if (hex.test(p[k] || "")) out[k] = p[k].toLowerCase(); });
  out.mono = !!p.mono;
  out.reason = typeof p.reason === "string" ? p.reason.slice(0, 20) : null;
  return out.dominant ? out : null;
}

export default async function handler(req) {
  var sql = db();
  if (!sql) return json({ ok: false, error: "База не подключена" }, 503);

  if (req.method === "GET") {
    var id = new URL(req.url).searchParams.get("id") || "";
    if (!id) return json({ ok: false, error: "id required" }, 400);
    await ensureCover(sql);
    var rows = await sql`SELECT jpeg FROM karaoke_cover WHERE song_id = ${id} AND jpeg IS NOT NULL`;
    if (!rows.length) return new Response("", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(b64ToBytes(rows[0].jpeg), {
      headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" }
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }
  var songId = String(body.songId || "").slice(0, 80);
  var manual = !!body.manual;
  var status = STATUSES.indexOf(body.status) !== -1 ? body.status : "cover";
  var jpeg = typeof body.jpeg === "string" ? body.jpeg.replace(/^data:image\/jpeg;base64,/, "") : null;
  if (!songId) return json({ ok: false, error: "songId required" }, 400);
  if (jpeg && (jpeg.length > 400000 || !/^[A-Za-z0-9+/=]+$/.test(jpeg))) return json({ ok: false, error: "Картинка слишком большая" }, 413);
  if (status === "cover" && !jpeg) return json({ ok: false, error: "Нет картинки" }, 400);
  if (status !== "cover") jpeg = null;
  var src = manual ? "" : String(body.src || "").slice(0, 600);

  var siteAuth = req.headers.get("x-site-auth") || "";
  var teacher = await isTeacher(siteAuth);
  if (!teacher) {
    var songs = await sessionSongs(req.headers.get("x-player-session") || "");
    var song = (songs || []).filter(function (s) { return s.id === songId; })[0];
    var files = song ? [song.voice && song.voice.url, song.music && song.music.url] : [];
    if (!song) return json({ ok: false, error: "Не твоя песня" }, 403);
    // обложку ученик меняет у любой своей песни, и у трека от Николая тоже (20.11)
    if (!manual && (!src || files.indexOf(src) === -1)) return json({ ok: false, error: "Не твоя песня" }, 403);
  }

  var palette = cleanPalette(body.palette);
  var tagTitle = String(body.tagTitle || "").slice(0, 200);
  var tagArtist = String(body.tagArtist || "").slice(0, 200);
  var v = Date.now();
  await ensureCover(sql);
  var rows2;
  if (manual) {
    rows2 = await sql`
      INSERT INTO karaoke_cover (song_id, src_url, jpeg, palette, status, manual, v, updated_at)
      VALUES (${songId}, '', ${jpeg}, ${palette ? JSON.stringify(palette) : null}, 'cover', true, ${v}, now())
      ON CONFLICT (song_id) DO UPDATE SET src_url = '', jpeg = EXCLUDED.jpeg, palette = EXCLUDED.palette,
        status = 'cover', manual = true, v = EXCLUDED.v, updated_at = now()
      RETURNING v`;
  } else {
    // теги файла обновляем всегда, картинку — только если её не ставил Николай
    rows2 = await sql`
      INSERT INTO karaoke_cover (song_id, src_url, jpeg, palette, tag_title, tag_artist, status, manual, v, updated_at)
      VALUES (${songId}, ${src}, ${jpeg}, ${palette ? JSON.stringify(palette) : null}, ${tagTitle}, ${tagArtist}, ${status}, false, ${v}, now())
      ON CONFLICT (song_id) DO UPDATE SET
        tag_title = EXCLUDED.tag_title, tag_artist = EXCLUDED.tag_artist,
        src_url = CASE WHEN karaoke_cover.manual THEN karaoke_cover.src_url ELSE EXCLUDED.src_url END,
        jpeg    = CASE WHEN karaoke_cover.manual THEN karaoke_cover.jpeg    ELSE EXCLUDED.jpeg END,
        palette = CASE WHEN karaoke_cover.manual THEN karaoke_cover.palette ELSE EXCLUDED.palette END,
        status  = CASE WHEN karaoke_cover.manual THEN karaoke_cover.status  ELSE EXCLUDED.status END,
        v       = CASE WHEN karaoke_cover.manual THEN karaoke_cover.v       ELSE EXCLUDED.v END,
        updated_at = now()
      RETURNING v, manual`;
  }
  return json({ ok: true, v: Number(rows2[0].v) });
}
