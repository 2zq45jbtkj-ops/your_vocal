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
import { listCovers } from "./_cover.js";

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

// Темп (BPM) и тональность минуса: приложение определяет их само по звуку
// (karaoke.js, karDetect) и сохраняет сюда, чтобы не считать на каждом телефоне.
// Ключ — id песни; url — какой минус разбирали (сменился минус — считаем заново).
async function ensureMeta(sql) {
  await sql`CREATE TABLE IF NOT EXISTS karaoke_meta (
    song_id TEXT PRIMARY KEY,
    music_url TEXT NOT NULL,
    bpm REAL NOT NULL,
    key_root SMALLINT NOT NULL,
    key_minor BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

function cleanMeta(m) {
  if (!m || typeof m !== "object") return null;
  var url = String(m.url || "").slice(0, 600);
  var bpm = Math.round(Number(m.bpm) * 10) / 10;
  var root = Math.round(Number(m.root));
  if (!/^https:\/\//.test(url) || !(bpm >= 40 && bpm <= 240) || !(root >= 0 && root <= 11)) return null;
  return { url: url, bpm: bpm, root: root, minor: !!m.minor };
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
    // обложки песен ученика для «Разметки караоке» (Николай, 20.11)
    var cids = url.searchParams.get("covers");
    if (cids) {
      if (!(await isTeacher(siteAuth))) return json({ ok: false, error: "Только преподаватель" }, 403);
      var cl = cids.split(",").map(function (x) { return x.trim().slice(0, 80); }).filter(Boolean).slice(0, 60);
      var cv = {};
      try { cv = await listCovers(sql, cl); } catch (e) { /* без обложек — заглушки */ }
      return json({ ok: true, covers: cv });
    }
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
    if (!ids.length) return json({ ok: true, marks: {}, meta: {}, covers: {} });
    var rows = await sql`SELECT song_id, lines FROM karaoke_marks WHERE song_id = ANY(${ids})`;
    var marks = {};
    rows.forEach(function (row) { marks[row.song_id] = { lines: row.lines || {} }; });
    var meta = {};
    try {
      await ensureMeta(sql);
      var mrows = await sql`SELECT song_id, music_url, bpm, key_root, key_minor FROM karaoke_meta WHERE song_id = ANY(${ids})`;
      mrows.forEach(function (row) {
        meta[row.song_id] = { url: row.music_url, bpm: Number(row.bpm), root: Number(row.key_root), minor: !!row.key_minor };
      });
    } catch (e) { /* без темпа и тональности караоке работает как раньше */ }
    var covers = {};
    try { covers = await listCovers(sql, ids); } catch (e) { /* без обложек — заглушки */ }
    return json({ ok: true, marks: marks, meta: meta, covers: covers });
  }

  if (req.method === "POST") {
    var body;
    try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }
    if (body.meta) return saveMeta(sql, body, siteAuth, session);
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

/* Сохранить темп и тональность минуса. Пишет преподаватель или ученик, чья это
   песня и чей это минус (проверяет baza-dannih по его сессии). */
async function saveMeta(sql, body, siteAuth, session) {
  var songId = String(body.songId || "").slice(0, 80);
  var m = cleanMeta(body.meta);
  if (!songId || !m) return json({ ok: false, error: "Неверные данные" }, 400);
  var ok = false;
  if (session) {
    try {
      var r = await fetch(BAZA + "/api/player-tracks", { headers: { "X-Player-Session": session } });
      if (r.status === 200) {
        var songs = ((await r.json()) || {}).songs || [];
        ok = songs.some(function (s) { return s.id === songId && s.music && s.music.url === m.url; });
      }
    } catch (e) {}
  }
  if (!ok) ok = await isTeacher(siteAuth);
  if (!ok) return json({ ok: false, error: "Не твоя песня" }, 403);
  await ensureMeta(sql);
  await sql`
    INSERT INTO karaoke_meta (song_id, music_url, bpm, key_root, key_minor, updated_at)
    VALUES (${songId}, ${m.url}, ${m.bpm}, ${m.root}, ${m.minor}, now())
    ON CONFLICT (song_id) DO UPDATE SET music_url = EXCLUDED.music_url, bpm = EXCLUDED.bpm,
      key_root = EXCLUDED.key_root, key_minor = EXCLUDED.key_minor, updated_at = now()`;
  return json({ ok: true, meta: m });
}
