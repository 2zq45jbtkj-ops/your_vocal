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

// V — вдох, v — добор, W — двойной / глубокий вдох (25.11)
var MK_OK = { V: 1, v: 1, W: 1 };

function cleanLines(src) {
  var out = {};
  if (!src || typeof src !== "object") return out;
  Object.keys(src).slice(0, 400).forEach(function (k) {
    if (!/^\d{1,4}$/.test(k)) return;
    var l = src[k] || {};
    var mk = {};
    if (l.mk && typeof l.mk === "object") {
      Object.keys(l.mk).slice(0, 60).forEach(function (g) {
        if (/^\d{1,3}$/.test(g) && MK_OK[l.mk[g]]) mk[g] = l.mk[g];
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
      var stu1 = null;
      try {
        await ensureStu(sql);
        var rs1 = await sql`SELECT * FROM karaoke_student_marks WHERE song_id = ${one}`;
        stu1 = {};
        rs1.forEach(function (row) { stu1[row.theme] = stuOut(row, true); });
      } catch (e) { /* без разметки ученика — как раньше */ }
      return json({ ok: true, lines: r1.length ? r1[0].lines : {}, stu: stu1 });
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
    // Разметка ученика (25.11). Пока Николай не проверил её, его эталонные
    // V / v / W ученику не отдаём вовсе — только подсказки к строкам.
    var stu = {};
    try {
      await ensureStu(sql);
      var srows = await sql`SELECT * FROM karaoke_student_marks WHERE song_id = ANY(${ids})`;
      srows.forEach(function (row) {
        (stu[row.song_id] = stu[row.song_id] || {})[row.theme] = stuOut(row, row.status === "checked");
        // эталон Николая сейчас — только дыхание
        if (row.theme === "breath" && row.status !== "checked" && marks[row.song_id]) marks[row.song_id] = { lines: hideKey(marks[row.song_id].lines), hidden: true };
      });
    } catch (e) { /* без разметки ученика — как раньше */ }
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
    return json({ ok: true, marks: marks, meta: meta, covers: covers, stu: stu });
  }

  if (req.method === "POST") {
    var body;
    try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }
    if (body.meta) return saveMeta(sql, body, siteAuth, session);
    if (body.stu) return saveStu(sql, body, session);
    if (body.review) return saveReview(sql, body, siteAuth);
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

/* ==========================================================================
   РАЗМЕТКА УЧЕНИКА И ПРОВЕРКА НИКОЛАЯ (25.11)
   Ученик сам ставит V / v / W в своей песне (шторка «Пометки» → «Разметить
   самому») и отправляет Николаю. Николай отмечает каждую пометку ✓ / ✗,
   дорисовывает пропущенные вдохи, пишет комментарии к строкам и общий.

   status: draft → sent (у Николая, ученик править не может) → checked
           (ученик видит проверку и эталон; «Разметить заново» → draft)
   lines:  как у эталона, без подсказок: { "<i>": { text, mk: { "<g>": "V"|"v"|"W" } } }
   review: { general, lines: { "<i>": { ok: { "<g>": 1|0 }, miss: { "<g>": "V"|"v"|"W" }, c } } }
   ========================================================================== */

async function ensureStu(sql) {
  await sql`CREATE TABLE IF NOT EXISTS karaoke_student_marks (
    song_id TEXT NOT NULL,
    theme TEXT NOT NULL DEFAULT 'breath',
    student_id TEXT,
    lines JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    review JSONB NOT NULL DEFAULT '{}',
    chat_id TEXT,
    student_name TEXT,
    song_title TEXT,
    sent_at TIMESTAMPTZ,
    checked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (song_id, theme)
  )`;
}

/* Темы пометок (Коля, 25.11): дыхание, регистры, атака и окончание звука,
   голосовые связки, бэлтинг, твэнг. У каждой темы своя разметка ученика и
   своя проверка. Значки пока есть только у дыхания: V, v, W. */
var THEMES = { breath: 1, reg: 1, onset: 1, folds: 1, belt: 1, twang: 1 };
function themeOf(x) { return THEMES[x] ? x : "breath"; }
var THEME_NAME = { breath: "дыхания", reg: "регистров", onset: "атаки и окончания звука", folds: "голосовых связок", belt: "бэлтинга", twang: "твэнга" };

function hideKey(lines) {
  var out = {};
  Object.keys(lines || {}).forEach(function (k) {
    var l = lines[k] || {};
    if (l.hint) out[k] = { text: l.text, mk: {}, hint: l.hint };
  });
  return out;
}

function stuOut(row, withReview) {
  return {
    lines: row.lines || {}, status: row.status || "draft",
    review: withReview ? (row.review || {}) : null,
    sentAt: row.sent_at || null, checkedAt: row.checked_at || null
  };
}

function cleanStuLines(src) {
  var out = {};
  if (!src || typeof src !== "object") return out;
  Object.keys(src).slice(0, 400).forEach(function (k) {
    if (!/^\d{1,4}$/.test(k)) return;
    var l = src[k] || {}, mk = {};
    if (l.mk && typeof l.mk === "object") {
      Object.keys(l.mk).slice(0, 60).forEach(function (g) { if (/^\d{1,3}$/.test(g) && MK_OK[l.mk[g]]) mk[g] = l.mk[g]; });
    }
    if (Object.keys(mk).length) out[k] = { text: String(l.text || "").slice(0, 300), mk: mk };
  });
  return out;
}

function cleanReview(src) {
  var out = { general: String((src && src.general) || "").trim().slice(0, 1500), lines: {} };
  var ls = (src && src.lines) || {};
  if (typeof ls !== "object") return out;
  Object.keys(ls).slice(0, 400).forEach(function (k) {
    if (!/^\d{1,4}$/.test(k)) return;
    var l = ls[k] || {}, ok = {}, miss = {};
    if (l.ok && typeof l.ok === "object") Object.keys(l.ok).slice(0, 60).forEach(function (g) { if (/^\d{1,3}$/.test(g) && (l.ok[g] === 1 || l.ok[g] === 0)) ok[g] = l.ok[g]; });
    if (l.miss && typeof l.miss === "object") Object.keys(l.miss).slice(0, 60).forEach(function (g) { if (/^\d{1,3}$/.test(g) && MK_OK[l.miss[g]]) miss[g] = l.miss[g]; });
    var c = String(l.c || "").trim().slice(0, 500);
    if (Object.keys(ok).length || Object.keys(miss).length || c) out.lines[k] = { ok: ok, miss: miss, c: c };
  });
  return out;
}

// Чья песня — знает только baza-dannih: спрашиваем по сессии ученика.
async function stuSong(session, songId) {
  if (!session) return null;
  try {
    var r = await fetch(BAZA + "/api/player-tracks", { headers: { "X-Player-Session": session } });
    if (r.status !== 200) return null;
    var songs = ((await r.json()) || {}).songs || [];
    return songs.filter(function (s) { return s.id === songId; })[0] || null;
  } catch (e) { return null; }
}

/* ---------- initData: кто прислал (нужно только, чтобы потом написать ученику) ---------- */
function hex(buf) {
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
}
async function hmac(keyBytes, msg) {
  var k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}
async function tgUser(initData) {
  initData = String(initData || "");
  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!initData || initData.length > 4096 || !token) return null;
  var p = new URLSearchParams(initData), hash = p.get("hash");
  if (!hash) return null;
  var pairs = [];
  p.forEach(function (v, k) { if (k !== "hash") pairs.push([k, v]); });
  pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  try {
    var secret = await hmac(new TextEncoder().encode("WebAppData"), token);
    if (hex(await hmac(new Uint8Array(secret), pairs.map(function (x) { return x[0] + "=" + x[1]; }).join("\n"))) !== hash) return null;
    var u = JSON.parse(p.get("user") || "null");
    return u && u.id ? u : null;
  } catch (e) { return null; }
}

async function tgSend(chatId, text) {
  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  } catch (e) { /* уведомление не дошло — разметка всё равно сохранена */ }
}

function countMarks(lines) {
  var n = 0;
  Object.keys(lines || {}).forEach(function (k) { n += Object.keys((lines[k] && lines[k].mk) || {}).length; });
  return n;
}

// Ученик: save — черновик, send — отправить Николаю, reset — разметить заново
async function saveStu(sql, body, session) {
  var songId = String(body.songId || "").slice(0, 80);
  var action = body.action === "send" ? "send" : body.action === "reset" ? "reset" : "save";
  if (!songId) return json({ ok: false, error: "songId required" }, 400);
  var theme = themeOf(body.theme);
  var song = await stuSong(session, songId);
  if (!song) return json({ ok: false, error: "Не твоя песня" }, 403);
  await ensureStu(sql);
  var cur = (await sql`SELECT * FROM karaoke_student_marks WHERE song_id = ${songId} AND theme = ${theme}`)[0] || null;
  var st = cur ? cur.status : "draft";
  if (action === "reset") {
    await sql`
      INSERT INTO karaoke_student_marks (song_id, theme, student_id, lines, status, review, updated_at)
      VALUES (${songId}, ${theme}, ${String(song.studentId || "")}, '{}', 'draft', '{}', now())
      ON CONFLICT (song_id, theme) DO UPDATE SET lines = '{}', status = 'draft', review = '{}', sent_at = NULL, checked_at = NULL, updated_at = now()`;
    return json({ ok: true, stu: { lines: {}, status: "draft", review: null } });
  }
  if (st === "sent") return json({ ok: false, error: "Разметка уже у Николая на проверке" }, 409);
  if (st === "checked") return json({ ok: false, error: "Разметка уже проверена" }, 409);
  var lines = cleanStuLines(body.lines);
  if (action === "send" && !countMarks(lines)) return json({ ok: false, error: "Поставь хотя бы один вдох" }, 400);
  var u = action === "send" ? await tgUser(body.initData) : null;
  var name = String(body.name || (u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "") || "Ученик").slice(0, 120);
  var title = String(song.title || "Песня").slice(0, 200);
  var status = action === "send" ? "sent" : "draft";
  await sql`
    INSERT INTO karaoke_student_marks (song_id, theme, student_id, lines, status, chat_id, student_name, song_title, sent_at, updated_at)
    VALUES (${songId}, ${theme}, ${String(song.studentId || "")}, ${JSON.stringify(lines)}, ${status}, ${u ? String(u.id) : null}, ${name}, ${title},
            ${action === "send" ? new Date().toISOString() : null}, now())
    ON CONFLICT (song_id, theme) DO UPDATE SET lines = EXCLUDED.lines, status = EXCLUDED.status, student_id = EXCLUDED.student_id,
      chat_id = COALESCE(EXCLUDED.chat_id, karaoke_student_marks.chat_id), student_name = EXCLUDED.student_name,
      song_title = EXCLUDED.song_title, sent_at = COALESCE(EXCLUDED.sent_at, karaoke_student_marks.sent_at), updated_at = now()`;
  if (action === "send") {
    await tgSend(process.env.ADMIN_CHAT_ID,
      "🫁 Разметка " + THEME_NAME[theme] + " в караоке\n" + name + " · «" + title + (song.artist ? "» — " + song.artist : "»") +
      "\nПометок: " + countMarks(lines) +
      "\n\nПроверить: Админ → Разметка караоке → ученик → песня → «Проверить в караоке».");
  }
  return json({ ok: true, stu: { lines: lines, status: status, review: null } });
}

// Николай: save — черновик проверки, done — отправить проверку ученику
async function saveReview(sql, body, siteAuth) {
  if (!(await isTeacher(siteAuth))) return json({ ok: false, error: "Только преподаватель" }, 403);
  var songId = String(body.songId || "").slice(0, 80);
  if (!songId) return json({ ok: false, error: "songId required" }, 400);
  var theme = themeOf(body.theme);
  await ensureStu(sql);
  var cur = (await sql`SELECT * FROM karaoke_student_marks WHERE song_id = ${songId} AND theme = ${theme}`)[0];
  if (!cur || cur.status === "draft") return json({ ok: false, error: "Ученик ещё не отправил разметку" }, 409);
  var review = cleanReview(body.review);
  var done = body.action === "done";
  if (done) {
    await sql`UPDATE karaoke_student_marks SET review = ${JSON.stringify(review)}, status = 'checked', checked_at = now(), updated_at = now() WHERE song_id = ${songId} AND theme = ${theme}`;
    var ok = 0, bad = 0, miss = 0;
    Object.keys(review.lines).forEach(function (k) {
      var l = review.lines[k];
      Object.keys(l.ok).forEach(function (g) { if (l.ok[g]) ok++; else bad++; });
      miss += Object.keys(l.miss).length;
    });
    if (cur.chat_id) {
      await tgSend(cur.chat_id,
        "✅ Николай проверил твою разметку " + THEME_NAME[theme] + " в песне «" + (cur.song_title || "песня") + "».\n" +
        "Верно: " + ok + (bad ? " · Поправить: " + bad : "") + (miss ? " · Пропущено: " + miss : "") +
        "\n\nОткрой караоке с этой песней → Настройки → Пометки дыхания → «Комментарии».");
    }
  } else {
    await sql`UPDATE karaoke_student_marks SET review = ${JSON.stringify(review)}, updated_at = now() WHERE song_id = ${songId} AND theme = ${theme}`;
  }
  return json({ ok: true, stu: stuOut(Object.assign({}, cur, { review: review, status: done ? "checked" : cur.status }), true) });
}
