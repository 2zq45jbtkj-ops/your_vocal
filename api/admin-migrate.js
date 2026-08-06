/* Разовое применение sql/schema.sql к базе. Защищено проверкой админа —
   тем же паттерном, что и остальные admin-*.js. CREATE TABLE IF NOT EXISTS
   везде, так что повторный вызов безопасен (идемпотентно). Файл можно
   удалить после того, как схема применена и проверена, эндпоинт больше не
   нужен для повседневной работы. */

import { db, json, isAdminChatId } from "./_db.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  var url = new URL(req.url);
  var chatId = url.searchParams.get("chatId");
  if (!isAdminChatId(chatId)) return json({ ok: false, error: "Not admin" }, 403);

  var sql = db();
  if (!sql) return json({ ok: false, error: "POSTGRES_URL not configured" }, 500);

  var log = [];
  try {
    await sql`CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      chat_id TEXT UNIQUE NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
    log.push("students ok");

    await sql`CREATE TABLE IF NOT EXISTS levels (
      code CHAR(1) PRIMARY KEY,
      letter TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )`;
    log.push("levels ok");

    await sql`INSERT INTO levels (code, letter, sort_order) VALUES
      ('A', 'A', 1), ('B', 'B', 2), ('C', 'C', 3)
      ON CONFLICT (code) DO NOTHING`;
    log.push("levels seeded");

    await sql`CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      level CHAR(1) NOT NULL REFERENCES levels(code),
      sort_order INTEGER NOT NULL DEFAULT 0,
      lesson_ref INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true
    )`;
    log.push("topics ok");

    await sql`CREATE TABLE IF NOT EXISTS assessments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      date DATE NOT NULL,
      period_goal TEXT DEFAULT '',
      recommendations TEXT DEFAULT '',
      comment TEXT DEFAULT '',
      archived BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
    log.push("assessments ok");

    await sql`CREATE TABLE IF NOT EXISTS assessment_scores (
      assessment_id INTEGER NOT NULL REFERENCES assessments(id),
      topic_id INTEGER NOT NULL REFERENCES topics(id),
      theory SMALLINT CHECK (theory BETWEEN 0 AND 5),
      practice SMALLINT CHECK (practice BETWEEN 0 AND 5),
      PRIMARY KEY (assessment_id, topic_id)
    )`;
    log.push("assessment_scores ok");

    await sql`CREATE TABLE IF NOT EXISTS legacy_assessments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      date DATE NOT NULL,
      topics_covered TEXT DEFAULT '',
      homework_grade NUMERIC,
      recommendations TEXT DEFAULT '',
      period_goal TEXT DEFAULT '',
      metrics JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
    log.push("legacy_assessments ok");

    await sql`CREATE TABLE IF NOT EXISTS field_history (
      id SERIAL PRIMARY KEY,
      student_id INTEGER,
      entity TEXT,
      entity_id INTEGER,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TIMESTAMPTZ DEFAULT now()
    )`;
    log.push("field_history ok");

    var check = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    return json({ ok: true, log: log, tables: check.map(function (r) { return r.table_name; }) });
  } catch (e) {
    return json({ ok: false, error: String(e), log: log }, 500);
  }
}
