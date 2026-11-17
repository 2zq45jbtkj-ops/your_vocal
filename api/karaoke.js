/* Пометки караоке: V (вдох), v (добор) и подсказки Николая к строкам песни.

   Сама песня (минус, текст, тайминг строк) живёт в baza-dannih, в «Репертуаре»
   ученика (player_tracks): её Николай и так заводит на сайте, второй раз
   заливать не нужно. Здесь — только то, чего в той таблице нет: пометки
   внутри строк и подсказки. Ключ — id песни из baza-dannih.

   GET  (заголовок X-Player-Session — сессия ученика из baza-dannih)
        → { marks: { <songId>: { lines: {...} } } } только по своим песням.
        Чьи песни, знает только baza-dannih: пересылаем ей ту же сессию.
   GET  ?songId=… (заголовок X-Site-Auth — токен преподавателя) → пометки песни
   POST { songId, studentId, lines } (X-Site-Auth) → сохранить

   lines: { "<индекс строки в тексте>": { text, mk: { "<номер промежутка>": "V"|"v" }, hint } }
   Номер промежутка k — место перед k-м словом строки (k = числу слов — в конце). */

import { db, json } from "./_db.js";

export const config = { runtime: "edge" };

var BAZA = "https://baza-dannih.vercel.app";

async function ensureTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS karaoke_marks (
    song_id TEXT PRIMARY KEY,
    student_id TEXT,
    lines JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

// Преподаватель ли это: тот же токен, которым Mini App ходит в закрытые ручки
// baza-dannih. Проверяет его сама baza-dannih — секрета подписи у нас нет.
async function isTeacher(siteAuth) {
  if (!siteAuth) return false;
  try {
    var r = await fetch(BAZA + "/api/player-tracks?studentId=__check__", { headers: { "X-Site-Auth": siteAuth } });
    return r.status === 200;
  } catch (e) {
    return false;
  }
}

function cleanLines(src) {
  var out = {};
  if (!src || typeof src !== "object") return out;
  Object.keys(src).slice(0, 400).forEach(function (k) {
    if (!/^\d{1,4}$/.test(k)) return;
    var l = src[k] || {};
    var mk = {};
    if (l.mk && typeof l.mk === "object") {
      Object.keys(l.mk).slice(0, 60).forEach(function (g) {
        if (/^\d{1,3}$/.test(g) && (l.mk[g] === "V" || l.mk[g] === "v")) mk[g] = l.mk[g];
      });
    }
    var hint = String(l.hint || "").trim().slice(0, 200);
    if (!Object.keys(mk).length && !hint) return;
    out[k] = { text: String(l.text || "").slice(0, 300), mk: mk, hint: hint };
  });
  return out;
}

export default async function handler(req) {
  var sql = db();
  if (!sql) return json({ ok: false, error: "База не подключена" }, 503);
  var siteAuth = req.headers.get("x-site-auth") || "";
  var session = req.headers.get("x-player-session") || "";

  if (req.method === "GET") {
    var url = new URL(req.url);
    var one = url.searchParams.get("songId");
    await ensureTable(sql);
    if (one) {
      if (!(await isTeacher(siteAuth))) return json({ ok: false, error: "Только преподаватель" }, 403);
      var r1 = await sql`SELECT lines FROM karaoke_marks WHERE song_id = ${one}`;
      return json({ ok: true, lines: r1.length ? r1[0].lines : {} });
    }
    if (!session) return json({ ok: false, error: "Нет сессии" }, 401);
    var songsRes;
    try {
      songsRes = await fetch(BAZA + "/api/player-tracks", { headers: { "X-Player-Session": session } });
    } catch (e) {
      return json({ ok: false, error: "baza-dannih не ответила" }, 502);
    }
    if (songsRes.status !== 200) return json({ ok: false, error: "Сессия не принята" }, 401);
    var songs = ((await songsRes.json()) || {}).songs || [];
    var ids = songs.map(function (s) { return s.id; });
    if (!ids.length) return json({ ok: true, marks: {} });
    var rows = await sql`SELECT song_id, lines FROM karaoke_marks WHERE song_id = ANY(${ids})`;
    var marks = {};
    rows.forEach(function (row) { marks[row.song_id] = { lines: row.lines || {} }; });
    return json({ ok: true, marks: marks });
  }

  if (req.method === "POST") {
    var body;
    try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }
    if (!(await isTeacher(siteAuth))) return json({ ok: false, error: "Только преподаватель" }, 403);
    var songId = String(body.songId || "").slice(0, 80);
    if (!songId) return json({ ok: false, error: "songId required" }, 400);
    var lines = cleanLines(body.lines);
    await ensureTable(sql);
    await sql`
      INSERT INTO karaoke_marks (song_id, student_id, lines, updated_at)
      VALUES (${songId}, ${String(body.studentId || "").slice(0, 80)}, ${JSON.stringify(lines)}, now())
      ON CONFLICT (song_id) DO UPDATE SET lines = EXCLUDED.lines, student_id = EXCLUDED.student_id, updated_at = now()`;
    return json({ ok: true, lines: lines });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}
