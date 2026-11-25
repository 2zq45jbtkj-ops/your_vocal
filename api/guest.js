/* Тест-драйв приложения для гостей из Instagram (20.11, просьба Николая).

   Гость открывает https://t.me/your_vocal_teacher_bot?startapp=testdrive
   (или кнопку «Посмотреть приложение» в боте) и сразу попадает в приложение
   без кода доступа. Здесь — всё серверное для этого режима:

   POST ?action=hello   { initData, anon, src }      — гость открыл приложение
   POST ?action=ev      { initData, anon, events, explored } — экраны и нажатия
   POST ?action=trial   { initData, anon }           — нажал «Записаться на пробный»:
                                                       сообщение Николаю в бот
   GET  ?action=demo                                  — данные «как у Николая»:
        его кабинет и караоке (своя карточка «Nikolai Sept (тест)»), без токенов
   POST ?action=demo-set  (X-Site-Auth)              — запомнить свою карточку
        Николая как образец (приложение Николая делает это само при запуске)
   GET  ?action=list      (X-Site-Auth)              — «Тестовые клиенты»
   GET  ?action=events&gid=… (X-Site-Auth)           — история одного гостя
   GET  ?action=health                                — какой бот и включено ли
        главное мини-приложение (без секретов)

   Кто гость, берём из initData Telegram и проверяем подпись токеном бота.
   Если подпись не сошлась (приложение открыли из другого бота), гость всё
   равно записывается, но с пометкой verified=false. */

import { db, json } from "./_db.js";
import { listCovers, isTeacher, BAZA } from "./_cover.js";

export const config = { runtime: "edge" };

var OWN_NAME = "Nikolai Sept (тест)";
var DEMO_TTL_MS = 5 * 60 * 1000;
var KINDS = { screen: 1, tap: 1, open: 1, explored: 1, trial: 1, popup: 1 };

async function ensure(sql) {
  await sql`CREATE TABLE IF NOT EXISTS guest_users (
    id TEXT PRIMARY KEY,
    tg_id BIGINT,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    verified BOOLEAN NOT NULL DEFAULT false,
    is_owner BOOLEAN NOT NULL DEFAULT false,
    src TEXT NOT NULL DEFAULT '',
    first_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    visits INT NOT NULL DEFAULT 1,
    explored JSONB NOT NULL DEFAULT '[]',
    trial_clicks INT NOT NULL DEFAULT 0,
    trial_at TIMESTAMPTZ,
    notified_at TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS guest_events (
    id BIGSERIAL PRIMARY KEY,
    gid TEXT NOT NULL,
    visit INT NOT NULL DEFAULT 1,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,
    screen TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT '',
    dur_ms INT NOT NULL DEFAULT 0
  )`;
  await sql`CREATE INDEX IF NOT EXISTS guest_events_gid ON guest_events (gid, ts)`;
  // 26.11: где на экране нажал (доли ширины/высоты) — для анимации пути гостя
  await sql`ALTER TABLE guest_events ADD COLUMN IF NOT EXISTS x REAL`;
  await sql`ALTER TABLE guest_events ADD COLUMN IF NOT EXISTS y REAL`;
  await sql`CREATE TABLE IF NOT EXISTS guest_kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

/* ---------- initData ---------- */

function hex(buf) {
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
}
async function hmac(keyBytes, msg) {
  var k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}
async function readInitData(initData) {
  initData = String(initData || "");
  if (!initData || initData.length > 4096) return null;
  var p = new URLSearchParams(initData);
  var user = null;
  try { user = JSON.parse(p.get("user") || "null"); } catch (e) { user = null; }
  if (!user || !user.id) return null;
  var verified = false;
  var token = process.env.TELEGRAM_BOT_TOKEN;
  var hash = p.get("hash");
  if (token && hash) {
    var pairs = [];
    p.forEach(function (v, k) { if (k !== "hash") pairs.push([k, v]); });
    pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var dcs = pairs.map(function (x) { return x[0] + "=" + x[1]; }).join("\n");
    try {
      var secret = await hmac(new TextEncoder().encode("WebAppData"), token);
      verified = hex(await hmac(new Uint8Array(secret), dcs)) === hash;
    } catch (e) { verified = false; }
  }
  return { user: user, verified: verified, startParam: p.get("start_param") || "" };
}

function cut(s, n) { return String(s == null ? "" : s).slice(0, n); }

/* Кто это: гость Telegram (tg:<id>) или открыл в браузере (anon:<id>). */
async function who(body) {
  var info = await readInitData(body && body.initData);
  if (info) {
    var u = info.user;
    return {
      id: "tg:" + u.id, tgId: Number(u.id) || null, first: cut(u.first_name, 80), last: cut(u.last_name, 80),
      username: cut(u.username, 64).replace(/[^A-Za-z0-9_]/g, ""), verified: info.verified,
      owner: !!(process.env.ADMIN_CHAT_ID && String(u.id) === String(process.env.ADMIN_CHAT_ID))
    };
  }
  var anon = cut(body && body.anon, 40).replace(/[^A-Za-z0-9-]/g, "");
  if (anon.length < 8) return null;
  return { id: "anon:" + anon, tgId: null, first: "", last: "", username: "", verified: false, owner: false };
}

async function touch(sql, g, src) {
  var rows = await sql`SELECT last_at, visits FROM guest_users WHERE id = ${g.id}`;
  if (!rows.length) {
    await sql`INSERT INTO guest_users (id, tg_id, first_name, last_name, username, verified, is_owner, src)
      VALUES (${g.id}, ${g.tgId}, ${g.first}, ${g.last}, ${g.username}, ${g.verified}, ${g.owner}, ${cut(src, 40)})
      ON CONFLICT (id) DO NOTHING`;
    return 1;
  }
  // новый заход — если прошло больше 30 минут с последнего действия
  var gap = Date.now() - new Date(rows[0].last_at).getTime();
  var visits = Number(rows[0].visits) || 1;
  if (gap > 30 * 60 * 1000) visits += 1;
  await sql`UPDATE guest_users SET last_at = now(), visits = ${visits},
      first_name = CASE WHEN ${g.first} <> '' THEN ${g.first} ELSE first_name END,
      last_name = CASE WHEN ${g.first} <> '' THEN ${g.last} ELSE last_name END,
      username = CASE WHEN ${g.first} <> '' THEN ${g.username} ELSE username END,
      verified = verified OR ${g.verified}, is_owner = is_owner OR ${g.owner}
    WHERE id = ${g.id}`;
  return visits;
}

/* ---------- образец «как у Николая» ---------- */

var INTAKE_KEYS = ["rangeLow", "rangeHigh", "tessLow", "tessHigh", "voiceType", "goals", "articulatory", "repertoire", "tensionAreas"];
var TOP_KEYS = ["intake", "lastGoal", "subscription", "subscriptionHistory", "upcomingLessons", "nextSrez", "hwTracker", "homework", "srezy", "wheelTopics"];

function cleanStudentPublic(sp) {
  var out = { student: { name: "", status: "active" }, unlockedLessons: [], progressByLesson: {} };
  if (!sp || typeof sp !== "object") return out;
  TOP_KEYS.forEach(function (k) { if (sp[k] !== undefined) out[k] = sp[k]; });
  if (sp.intake && typeof sp.intake === "object") {
    var it = {};
    INTAKE_KEYS.forEach(function (k) { if (sp.intake[k] !== undefined) it[k] = sp.intake[k]; });
    out.intake = it;
  }
  return out;
}

/* Карточку Николая находит бот (у него база учеников): спрашиваем подписью
   токеном бота, а если подпись не подошла — initData самого Николая (Коля, 20.11:
   «гостям» показать профиль с его аккаунта). Код карточки гостю не отдаётся. */
var DEMO_CARD_URL = "https://vocal-bot.vercel.app/api/demo_card";
async function askBotForCard(sql, initData) {
  var token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  var bodies = [];
  if (token) {
    var ts = String(Math.floor(Date.now() / 1000));
    bodies.push({ ts: ts, sign: hex(await hmac(new TextEncoder().encode(token), "demo-card:" + ts)) });
  }
  if (initData) bodies.push({ initData: String(initData) });
  for (var i = 0; i < bodies.length; i++) {
    try {
      var r = await fetch(DEMO_CARD_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodies[i]) });
      if (!r.ok) continue;
      var d = await r.json();
      var tok = d && d.ok && String(d.token || "").toLowerCase();
      if (tok && /^[0-9a-f-]{36}$/.test(tok)) {
        await sql`INSERT INTO guest_kv (k, v, updated_at) VALUES ('demo_token', ${tok}, now())
          ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
        await sql`DELETE FROM guest_kv WHERE k = 'demo_cache'`;
        return tok;
      }
    } catch (e) {}
  }
  return "";
}

async function buildDemo(sql) {
  var tr = await sql`SELECT v FROM guest_kv WHERE k = 'demo_token'`;
  var tok = tr.length ? tr[0].v : "";
  if (!tok) {
    // не чаще раза в минуту, чтобы гости не дёргали бота
    var last = await sql`SELECT updated_at FROM guest_kv WHERE k = 'demo_ask'`;
    if (!last.length || Date.now() - new Date(last[0].updated_at).getTime() > 60000) {
      await sql`INSERT INTO guest_kv (k, v, updated_at) VALUES ('demo_ask', '1', now())
        ON CONFLICT (k) DO UPDATE SET updated_at = now()`;
      tok = await askBotForCard(sql, "");
    }
  }
  var empty = { ok: true, ready: false, student: cleanStudentPublic(null), songs: [], karaoke: { ok: true, marks: {}, meta: {}, covers: {} } };
  if (!tok) return empty;
  var sp = null;
  try {
    var r = await fetch(BAZA + "/api/student-public?token=" + encodeURIComponent(tok));
    if (r.ok) sp = await r.json();
  } catch (e) { sp = null; }
  var songs = [];
  try {
    var a = await fetch(BAZA + "/api/player-tracks?action=auth", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: tok })
    });
    if (a.ok) {
      var sess = ((await a.json()) || {}).session;
      if (sess) {
        var s = await fetch(BAZA + "/api/player-tracks", { headers: { "X-Player-Session": sess } });
        if (s.ok) songs = (((await s.json()) || {}).songs || []).filter(function (x) { return x && !x.appHidden && x.music && x.music.url; });
      }
    }
  } catch (e) { /* без караоке */ }
  var ids = songs.map(function (x) { return x.id; });
  var marks = {}, meta = {}, covers = {};
  if (ids.length) {
    try {
      var mr = await sql`SELECT song_id, lines FROM karaoke_marks WHERE song_id = ANY(${ids})`;
      mr.forEach(function (row) { marks[row.song_id] = { lines: row.lines || {} }; });
    } catch (e) {}
    try {
      var me = await sql`SELECT song_id, music_url, bpm, key_root, key_minor FROM karaoke_meta WHERE song_id = ANY(${ids})`;
      me.forEach(function (row) { meta[row.song_id] = { url: row.music_url, bpm: Number(row.bpm), root: Number(row.key_root), minor: !!row.key_minor }; });
    } catch (e) {}
    try { covers = await listCovers(sql, ids); } catch (e) {}
  }
  return { ok: true, ready: !!(sp && sp.student), student: cleanStudentPublic(sp), songs: songs, karaoke: { ok: true, marks: marks, meta: meta, covers: covers } };
}

async function getDemo(sql) {
  var c = await sql`SELECT v, updated_at FROM guest_kv WHERE k = 'demo_cache'`;
  if (c.length && Date.now() - new Date(c[0].updated_at).getTime() < DEMO_TTL_MS) {
    try { return JSON.parse(c[0].v); } catch (e) {}
  }
  var d = await buildDemo(sql);
  if (d.ready) {
    var raw = JSON.stringify(d);
    await sql`INSERT INTO guest_kv (k, v, updated_at) VALUES ('demo_cache', ${raw}, now())
      ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
  }
  return d;
}

function isOwnName(n) {
  n = String(n || "").toLowerCase();
  return (n.indexOf("никола") !== -1 && n.indexOf("септ") !== -1) || (n.indexOf("nikola") !== -1 && n.indexOf("sept") !== -1);
}

async function demoSet(sql, siteAuth) {
  if (!siteAuth) return json({ ok: false, error: "Только преподаватель" }, 403);
  var r;
  try { r = await fetch(BAZA + "/api/students", { headers: { "X-Site-Auth": siteAuth } }); } catch (e) { return json({ ok: false }, 502); }
  if (r.status !== 200) return json({ ok: false, error: "Только преподаватель" }, 403);
  var list = ((await r.json()) || {}).students || [];
  var mine = list.filter(function (x) { return x && x.telegramToken && isOwnName(x.name); });
  var pick = mine.filter(function (x) { return x.name === OWN_NAME; })[0] || mine[0];
  if (!pick) return json({ ok: false, error: "Своя карточка не найдена" }, 404);
  var prev = await sql`SELECT v FROM guest_kv WHERE k = 'demo_token'`;
  if (!prev.length || prev[0].v !== pick.telegramToken) {
    await sql`INSERT INTO guest_kv (k, v, updated_at) VALUES ('demo_token', ${pick.telegramToken}, now())
      ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
    await sql`DELETE FROM guest_kv WHERE k = 'demo_cache'`;
  }
  return json({ ok: true, name: pick.name });
}

/* ---------- сообщение Николаю ---------- */

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function notifyTrial(sql, g) {
  var token = process.env.TELEGRAM_BOT_TOKEN, admin = process.env.ADMIN_CHAT_ID;
  if (!token || !admin) return false;
  var rows = await sql`SELECT first_name, last_name, username, notified_at, explored, visits FROM guest_users WHERE id = ${g.id}`;
  if (!rows.length) return false;
  var u = rows[0];
  if (u.notified_at && Date.now() - new Date(u.notified_at).getTime() < 10 * 60 * 1000) return false;
  // защита от потока нажатий: не больше 20 сообщений в час на всех
  var hour = await sql`SELECT count(*)::int AS n FROM guest_users WHERE notified_at > now() - interval '1 hour'`;
  if (hour.length && hour[0].n >= 20) return false;
  var name = (String(u.first_name || "") + " " + String(u.last_name || "")).trim() || "Гость без имени";
  var who = u.username ? '<a href="https://t.me/' + u.username + '">@' + escHtml(u.username) + "</a>" : (g.tgId ? '<a href="tg://user?id=' + g.tgId + '">написать</a>' : "без Telegram");
  var explored = Array.isArray(u.explored) ? u.explored.length : 0;
  var text = (g.owner ? "(Проверка — это ты сам)\n" : "") + "🎤 Тест-драйв: гость нажал «Записаться на пробный урок»\n\n" +
    "<b>" + escHtml(name) + "</b> · " + who + "\n" +
    "Посмотрел разделов: " + explored + " из 7 · заходов: " + (Number(u.visits) || 1) + "\n\n" +
    "Вся история — в приложении: Ещё → Режим админа → Тестовые клиенты.";
  try {
    var res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: admin, text: text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    var d = await res.json();
    if (d && d.ok) {
      await sql`UPDATE guest_users SET notified_at = now() WHERE id = ${g.id}`;
      return true;
    }
  } catch (e) {}
  return false;
}

/* ---------- обработчик ---------- */

export default async function handler(req) {
  var url = new URL(req.url);
  var action = url.searchParams.get("action") || "";
  var sql = db();
  if (!sql) return json({ ok: false, error: "База не подключена" }, 503);
  var siteAuth = req.headers.get("x-site-auth") || "";

  try {
    await ensure(sql);

    if (req.method === "GET") {
      if (action === "demo") {
        var d = await getDemo(sql);
        return new Response(JSON.stringify(d), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      if (action === "health") {
        var out = { ok: true, demoReady: false, bot: null, mainApp: null };
        var t = await sql`SELECT 1 FROM guest_kv WHERE k = 'demo_token'`;
        out.demoReady = !!t.length;
        var token = process.env.TELEGRAM_BOT_TOKEN;
        if (token) {
          try {
            var me = await (await fetch("https://api.telegram.org/bot" + token + "/getMe")).json();
            if (me && me.ok) { out.bot = me.result.username; out.mainApp = !!me.result.has_main_web_app; }
          } catch (e) {}
        }
        return json(out);
      }
      if (action === "list" || action === "events") {
        if (!(await isTeacher(siteAuth))) return json({ ok: false, error: "Только преподаватель" }, 403);
        if (action === "list") {
          // 20.11: убрать запись «Проверка», которую оставила проверка входа без кода (не настоящий гость)
          await sql`DELETE FROM guest_events WHERE gid = 'tg:111222333'`;
          await sql`DELETE FROM guest_users WHERE id = 'tg:111222333' AND verified = false AND username = 'probe_guest'`;
          // 26.11 (Николай): убрать анонимные «Открыл в браузере» — без имени, неизвестно кто
          var done = await sql`SELECT 1 FROM guest_kv WHERE k = 'anon_purged_2611'`;
          if (!done.length) {
            await sql`DELETE FROM guest_events WHERE gid LIKE 'anon:%'`;
            await sql`DELETE FROM guest_users WHERE id LIKE 'anon:%'`;
            await sql`INSERT INTO guest_kv (k, v) VALUES ('anon_purged_2611', '1') ON CONFLICT (k) DO NOTHING`;
          }
          var users = await sql`SELECT id, tg_id, first_name, last_name, username, verified, is_owner, src,
              first_at, last_at, visits, explored, trial_clicks, trial_at
            FROM guest_users ORDER BY last_at DESC LIMIT 200`;
          var secs = await sql`SELECT gid, COALESCE(sum(dur_ms), 0)::bigint AS ms, count(*) FILTER (WHERE kind = 'tap')::int AS taps
            FROM guest_events GROUP BY gid`;
          var byG = {};
          secs.forEach(function (r) { byG[r.gid] = { ms: Number(r.ms) || 0, taps: r.taps }; });
          users.forEach(function (u) { var x = byG[u.id] || { ms: 0, taps: 0 }; u.total_ms = x.ms; u.taps = x.taps; });
          // пустые анонимные заходы (0 с, 0 нажатий) — шум, не показываем
          users = users.filter(function (u) { return !(String(u.id).indexOf("anon:") === 0 && !u.taps && u.total_ms < 3000); });
          return json({ ok: true, guests: users });
        }
        var gid = cut(url.searchParams.get("gid"), 60);
        var ev = await sql`SELECT visit, ts, kind, screen, label, dur_ms, x, y FROM guest_events WHERE gid = ${gid} ORDER BY ts ASC, id ASC LIMIT 3000`;
        return json({ ok: true, events: ev });
      }
      return json({ ok: false }, 400);
    }

    if (req.method !== "POST") return json({ ok: false }, 405);
    if (action === "demo-set") return demoSet(sql, siteAuth);

    var body;
    try { body = await req.json(); } catch (e) { return json({ ok: false }, 400); }
    var g = await who(body);
    if (!g) return json({ ok: false, error: "Кто гость — непонятно" }, 400);

    if (action === "hello") {
      var visit = await touch(sql, g, body.src);
      if (g.owner) {
        var have = await sql`SELECT 1 FROM guest_kv WHERE k = 'demo_token'`;
        if (!have.length) await askBotForCard(sql, body.initData);
      }
      return json({ ok: true, visit: visit, owner: g.owner });
    }
    if (action === "ev") {
      var v = await touch(sql, g, "");
      var evs = Array.isArray(body.events) ? body.events.slice(0, 80) : [];
      for (var i = 0; i < evs.length; i++) {
        var e = evs[i] || {};
        var kind = String(e.kind || "");
        if (!KINDS[kind]) continue;
        var ts = Number(e.ts);
        if (!(ts > 1.7e12 && ts < Date.now() + 60000)) ts = Date.now();
        var dur = Math.max(0, Math.min(6 * 3600 * 1000, Math.round(Number(e.dur) || 0)));
        var px = Number(e.x), py = Number(e.y);
        px = px >= 0 && px <= 1 ? px : null; py = py >= 0 && py <= 1 ? py : null;
        await sql`INSERT INTO guest_events (gid, visit, ts, kind, screen, label, dur_ms, x, y)
          VALUES (${g.id}, ${v}, ${new Date(ts).toISOString()}, ${kind}, ${cut(e.screen, 60)}, ${cut(e.label, 120)}, ${dur}, ${px}, ${py})`;
      }
      if (Array.isArray(body.explored)) {
        var ex = body.explored.map(function (x) { return cut(x, 20); }).filter(Boolean).slice(0, 12);
        await sql`UPDATE guest_users SET explored = ${JSON.stringify(ex)}::jsonb WHERE id = ${g.id}`;
      }
      return json({ ok: true });
    }
    if (action === "trial") {
      await touch(sql, g, "");
      await sql`UPDATE guest_users SET trial_clicks = trial_clicks + 1, trial_at = now() WHERE id = ${g.id}`;
      var sent = await notifyTrial(sql, g);
      return json({ ok: true, notified: sent });
    }
    return json({ ok: false }, 400);
  } catch (e) {
    return json({ ok: false, error: "Ошибка сервера" }, 500);
  }
}
