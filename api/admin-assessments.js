/* Срезы (новая модель: тема x знание/практика x уровень) + архив старого
   формата. GET читает и ученик про себя, и админ про любого. Все изменяющие
   действия — только админ, chat_id проверяется на сервере.
   "Текущий редактируемый срез" — не флаг в базе, а просто срез с максимальным
   id у этого ученика (последний созданный) — см. kabinet-tz.md п.4, "не по
   позиции в списке". Дата можно менять у него в любую сторону, редактируемым
   он всё равно останется, потому что id не меняется.
   Срезы не удаляются никогда — см. constraint #4 в ТЗ. */

import { db, json, isAdminChatId, ensureStudent } from "./_db.js";

export const config = { runtime: "edge" };

async function studentIdFor(sql, chatId) {
  var rows = await sql`SELECT id FROM students WHERE chat_id = ${chatId}`;
  return rows.length ? rows[0].id : null;
}

async function logHistory(sql, studentId, entity, entityId, field, oldVal, newVal) {
  await sql`
    INSERT INTO field_history (student_id, entity, entity_id, field, old_value, new_value)
    VALUES (${studentId}, ${entity}, ${entityId}, ${field}, ${String(oldVal)}, ${String(newVal)})`;
}

export default async function handler(req) {
  var sql = db();
  if (!sql) return json({ configured: false, assessments: [], legacy: [] });

  if (req.method === "GET") {
    var url = new URL(req.url);
    var chatId = url.searchParams.get("chatId");
    var studentChatId = url.searchParams.get("studentChatId") || chatId;
    var admin = isAdminChatId(chatId);
    if (!admin && studentChatId !== chatId) return json({ ok: false, error: "Forbidden" }, 403);

    var studentId = await studentIdFor(sql, studentChatId);
    if (!studentId) return json({ configured: true, found: false, assessments: [], legacy: [] });

    var assessRows = await sql`
      SELECT id, date, period_goal, recommendations, comment
      FROM assessments WHERE student_id = ${studentId} AND archived = false
      ORDER BY id DESC`;
    var maxId = assessRows.length ? Math.max.apply(null, assessRows.map(function (a) { return a.id; })) : null;

    var scoreRows = await sql`
      SELECT s.assessment_id, s.topic_id, s.theory, s.practice
      FROM assessment_scores s
      JOIN assessments a ON a.id = s.assessment_id
      WHERE a.student_id = ${studentId} AND a.archived = false`;
    var scoresByAssessment = {};
    scoreRows.forEach(function (r) {
      if (!scoresByAssessment[r.assessment_id]) scoresByAssessment[r.assessment_id] = {};
      scoresByAssessment[r.assessment_id][r.topic_id] = [r.theory, r.practice];
    });

    var assessments = assessRows.map(function (a) {
      return {
        id: a.id, date: a.date, periodGoal: a.period_goal,
        recommendations: a.recommendations, comment: a.comment,
        editable: a.id === maxId,
        scores: scoresByAssessment[a.id] || {}
      };
    });

    var legacyRows = await sql`
      SELECT id, date, topics_covered, homework_grade, recommendations, period_goal, metrics
      FROM legacy_assessments WHERE student_id = ${studentId} ORDER BY date DESC`;

    return json({ configured: true, found: true, assessments: assessments, legacy: legacyRows });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }
  if (!isAdminChatId(body.chatId)) return json({ ok: false, error: "Not admin" }, 403);

  var action = body.action;

  if (action === "create") {
    var studentId2 = await ensureStudent(sql, body.studentChatId, body.firstName, body.lastName);
    var latest = await sql`
      SELECT id FROM assessments WHERE student_id = ${studentId2} AND archived = false
      ORDER BY id DESC LIMIT 1`;
    var created = await sql`
      INSERT INTO assessments (student_id, date, period_goal)
      VALUES (${studentId2}, ${new Date().toISOString().slice(0, 10)}, '')
      RETURNING id, date, period_goal, recommendations, comment`;
    var newId = created[0].id;
    // Наследуем оценки последнего среза — см. п.4 ТЗ.
    if (latest.length) {
      var prevScores = await sql`SELECT topic_id, theory, practice FROM assessment_scores WHERE assessment_id = ${latest[0].id}`;
      for (var i = 0; i < prevScores.length; i++) {
        var s = prevScores[i];
        await sql`
          INSERT INTO assessment_scores (assessment_id, topic_id, theory, practice)
          VALUES (${newId}, ${s.topic_id}, ${s.theory}, ${s.practice})`;
      }
    }
    return json({ ok: true, assessment: { id: newId, date: created[0].date, periodGoal: "", recommendations: "", comment: "", editable: true, scores: {} } });
  }

  if (action === "save-score") {
    // upsert одной оценки — вызывается на каждое движение ползунка, как в прототипе.
    await sql`
      INSERT INTO assessment_scores (assessment_id, topic_id, theory, practice)
      VALUES (${body.assessmentId}, ${body.topicId}, ${body.theory}, ${body.practice})
      ON CONFLICT (assessment_id, topic_id)
      DO UPDATE SET theory = ${body.theory}, practice = ${body.practice}`;
    return json({ ok: true });
  }

  if (action === "save-meta") {
    var current = await sql`SELECT date, period_goal, recommendations, comment FROM assessments WHERE id = ${body.assessmentId}`;
    if (!current.length) return json({ ok: false, error: "Not found" }, 404);
    var before = current[0];
    await sql`
      UPDATE assessments SET
        date = ${body.date != null ? body.date : before.date},
        period_goal = ${body.periodGoal != null ? body.periodGoal : before.period_goal},
        recommendations = ${body.recommendations != null ? body.recommendations : before.recommendations},
        comment = ${body.comment != null ? body.comment : before.comment}
      WHERE id = ${body.assessmentId}`;
    if (body.date != null && body.date !== before.date) {
      await logHistory(sql, body.studentId, "assessment", body.assessmentId, "date", before.date, body.date);
    }
    return json({ ok: true });
  }

  if (action === "archive") {
    // Ошибочная запись — archived=true, не удаление (constraint #4 ТЗ).
    await sql`UPDATE assessments SET archived = true WHERE id = ${body.assessmentId}`;
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
}
