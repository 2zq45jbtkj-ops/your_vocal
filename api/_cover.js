/* Обложки треков «Мои треки» (20.11) — общая часть для api/karaoke.js и
   api/karaoke-cover.js. Файлы с «_» Vercel функциями не считает.

   karaoke_cover: одна строка на песню из baza-dannih.
     src_url   — из какого файла достали обложку (плюс или минус); сменился
                 файл — приложение достанет заново. '' — обложку поставил Николай.
     jpeg      — уменьшенная обложка 400 px, base64 (≈ 30–50 КБ)
     palette   — палитра той же картинки (PaletteResolver.fromPixels)
     status    — cover | none (в файле обложки нет) | broken (файл не читается)
     manual    — обложку заменил Николай: автоматическое сканирование её не трогает
     v         — версия картинки для ссылки (?v=), браузер кэширует навсегда */

export var BAZA = "https://baza-dannih.vercel.app";

export async function ensureCover(sql) {
  await sql`CREATE TABLE IF NOT EXISTS karaoke_cover (
    song_id TEXT PRIMARY KEY,
    src_url TEXT NOT NULL DEFAULT '',
    jpeg TEXT,
    palette JSONB,
    tag_title TEXT NOT NULL DEFAULT '',
    tag_artist TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'cover',
    manual BOOLEAN NOT NULL DEFAULT false,
    v BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

/* Без самой картинки — только то, что нужно списку. */
export async function listCovers(sql, ids) {
  await ensureCover(sql);
  var rows = await sql`SELECT song_id, src_url, palette, tag_title, tag_artist, status, manual, v
    FROM karaoke_cover WHERE song_id = ANY(${ids})`;
  var out = {};
  rows.forEach(function (r) {
    out[r.song_id] = {
      src: r.src_url, palette: r.palette || null, tagTitle: r.tag_title, tagArtist: r.tag_artist,
      status: r.status, manual: !!r.manual, v: Number(r.v)
    };
  });
  return out;
}

export async function isTeacher(siteAuth) {
  if (!siteAuth) return false;
  try {
    var r = await fetch(BAZA + "/api/player-tracks?studentId=__check__", { headers: { "X-Site-Auth": siteAuth } });
    return r.status === 200;
  } catch (e) {
    return false;
  }
}

export async function sessionSongs(session) {
  if (!session) return null;
  try {
    var r = await fetch(BAZA + "/api/player-tracks", { headers: { "X-Player-Session": session } });
    if (r.status !== 200) return null;
    return ((await r.json()) || {}).songs || [];
  } catch (e) {
    return null;
  }
}
