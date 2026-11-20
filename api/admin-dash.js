/* Данные дашборда для «Режима админа». GET ?days=30, заголовок X-Site-Auth
   (токен преподавателя из baza-dannih — та же проверка, что у караоке).
   Отдаём сырые сводки по ученикам (ключ — хэш кода доступа); имена, ДЗ и
   прохождение уроков приложение берёт из baza-dannih и сводит само. */

import { db, json } from "./_db.js";
import { isTeacher } from "./_cover.js";
import { ensureEvents } from "./_events.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  var sql = db();
  if (!sql) return json({ ok: false, error: "База не подключена" }, 503);
  if (!(await isTeacher(req.headers.get("x-site-auth") || ""))) return json({ ok: false, error: "Только преподаватель" }, 403);
  var url = new URL(req.url);
  var days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days"), 10) || 30));
  try {
    await ensureEvents(sql);
    var since = new Date(Date.now() - days * 86400000).toISOString();
    // дни — по времени Николая (UTC+5)
    var people = await sql`
      SELECT skey, max(name) FILTER (WHERE name <> '') AS name, max(at) AS last_at, min(at) AS first_at
        FROM app_events GROUP BY skey`;
    var activeDays = await sql`
      SELECT skey, array_agg(DISTINCT to_char(at AT TIME ZONE 'Asia/Yekaterinburg', 'YYYY-MM-DD')) AS days
        FROM app_events WHERE at >= now() - interval '60 days' GROUP BY skey`;
    var daily = await sql`
      SELECT to_char(at AT TIME ZONE 'Asia/Yekaterinburg', 'YYYY-MM-DD') AS d, count(DISTINCT skey)::int AS n
        FROM app_events WHERE at >= ${since} GROUP BY 1 ORDER BY 1`;
    var counts = await sql`
      SELECT skey, type, count(*)::int AS n FROM app_events WHERE at >= ${since} GROUP BY skey, type`;
    var quiz = await sql`
      SELECT DISTINCT ON (skey, data->>'lesson') skey, data->>'lesson' AS lesson,
             (data->>'score')::int AS score, (data->>'total')::int AS total, at
        FROM app_events WHERE type = 'quiz' ORDER BY skey, data->>'lesson', at DESC`;
    var pitch = await sql`
      SELECT skey, (data->>'pct')::int AS pct, data->>'topic' AS topic, at
        FROM app_events WHERE type = 'pitch' AND at >= now() - interval '90 days' ORDER BY at`;
    var hw = await sql`
      SELECT skey, data->>'title' AS title, data->>'due' AS due, at
        FROM app_events WHERE type = 'hw_done' AND (data->>'done')::boolean IS TRUE AND at >= ${since}`;
    var karSongs = await sql`
      SELECT skey, count(DISTINCT data->>'song')::int AS songs FROM app_events
       WHERE type = 'kar_play' AND at >= ${since} GROUP BY skey`;
    return json({ ok: true, days: days, people: people, activeDays: activeDays, daily: daily,
      counts: counts, quiz: quiz, pitch: pitch, hw: hw, karSongs: karSongs });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
