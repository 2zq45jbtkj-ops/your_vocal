/* Первичная анкета ученика — одна запись на человека, редактируется редко.
   GET доступен и ученику (про себя) и админу (про любого) — как в
   admin-assessments.js. Сохранение — только админ. Апсерт (INSERT ...
   ON CONFLICT student_id DO UPDATE), потому что запись либо есть, либо
   создаётся при первом заполнении — отдельного "create" действия не нужно. */

import { db, json, isAdminChatId, ensureStudent } from "./_db.js";

export const config = { runtime: "edge" };

var FIELDS = [
  "age", "goal", "genreRefs", "priorExperience", "complaints", "symptomDuration",
  "entHistory", "vocalLoadOther", "smoking", "hydration", "sleep",
  "rangeLow", "rangeHigh", "tessituraComfort", "registerBreak",
  "cvtModesStart", "metallicBalance", "laryngealPosition", "tensionAreas",
  "breathType", "referenceAudioUrl"
];

var COLUMN = {
  age: "age", goal: "goal", genreRefs: "genre_refs", priorExperience: "prior_experience",
  complaints: "complaints", symptomDuration: "symptom_duration", entHistory: "ent_history",
  vocalLoadOther: "vocal_load_other", smoking: "smoking", hydration: "hydration", sleep: "sleep",
  rangeLow: "range_low", rangeHigh: "range_high", tessituraComfort: "tessitura_comfort",
  registerBreak: "register_break", cvtModesStart: "cvt_modes_start", metallicBalance: "metallic_balance",
  laryngealPosition: "laryngeal_position", tensionAreas: "tension_areas", breathType: "breath_type",
  referenceAudioUrl: "reference_audio_url"
};

function rowToApi(row) {
  if (!row) return null;
  var out = {};
  FIELDS.forEach(function (f) { out[f] = row[COLUMN[f]]; });
  return out;
}

async function studentIdFor(sql, chatId) {
  var rows = await sql`SELECT id FROM students WHERE chat_id = ${chatId}`;
  return rows.length ? rows[0].id : null;
}

export default async function handler(req) {
  var sql = db();
  if (!sql) return json({ configured: false, intake: null });

  if (req.method === "GET") {
    var url = new URL(req.url);
    var chatId = url.searchParams.get("chatId");
    var studentChatId = url.searchParams.get("studentChatId") || chatId;
    var admin = isAdminChatId(chatId);
    if (!admin && studentChatId !== chatId) return json({ ok: false, error: "Forbidden" }, 403);

    var studentId = await studentIdFor(sql, studentChatId);
    if (!studentId) return json({ configured: true, found: false, intake: null });

    var rows = await sql`SELECT * FROM student_intake WHERE student_id = ${studentId}`;
    return json({ configured: true, found: true, intake: rowToApi(rows[0]) });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  var body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: "Bad JSON" }, 400); }
  if (!isAdminChatId(body.chatId)) return json({ ok: false, error: "Not admin" }, 403);

  var studentId2 = await ensureStudent(sql, body.studentChatId, body.firstName, body.lastName);
  var v = body.intake || {};

  // Апсерт вручную по колонкам (без динамического построения SQL — держим
  // список полей явным, как и в остальных admin-*.js).
  await sql`
    INSERT INTO student_intake (
      student_id, age, goal, genre_refs, prior_experience, complaints, symptom_duration,
      ent_history, vocal_load_other, smoking, hydration, sleep,
      range_low, range_high, tessitura_comfort, register_break,
      cvt_modes_start, metallic_balance, laryngeal_position, tension_areas,
      breath_type, reference_audio_url, updated_at
    ) VALUES (
      ${studentId2}, ${v.age || null}, ${v.goal || ""}, ${v.genreRefs || ""}, ${v.priorExperience || ""},
      ${v.complaints || []}, ${v.symptomDuration || ""},
      ${v.entHistory || ""}, ${v.vocalLoadOther || ""}, ${v.smoking || ""}, ${v.hydration || ""}, ${v.sleep || ""},
      ${v.rangeLow || ""}, ${v.rangeHigh || ""}, ${v.tessituraComfort || ""}, ${v.registerBreak || ""},
      ${v.cvtModesStart || []}, ${v.metallicBalance || ""}, ${v.laryngealPosition || ""}, ${v.tensionAreas || []},
      ${v.breathType || ""}, ${v.referenceAudioUrl || ""}, now()
    )
    ON CONFLICT (student_id) DO UPDATE SET
      age = EXCLUDED.age, goal = EXCLUDED.goal, genre_refs = EXCLUDED.genre_refs,
      prior_experience = EXCLUDED.prior_experience, complaints = EXCLUDED.complaints,
      symptom_duration = EXCLUDED.symptom_duration, ent_history = EXCLUDED.ent_history,
      vocal_load_other = EXCLUDED.vocal_load_other, smoking = EXCLUDED.smoking,
      hydration = EXCLUDED.hydration, sleep = EXCLUDED.sleep,
      range_low = EXCLUDED.range_low, range_high = EXCLUDED.range_high,
      tessitura_comfort = EXCLUDED.tessitura_comfort, register_break = EXCLUDED.register_break,
      cvt_modes_start = EXCLUDED.cvt_modes_start, metallic_balance = EXCLUDED.metallic_balance,
      laryngeal_position = EXCLUDED.laryngeal_position, tension_areas = EXCLUDED.tension_areas,
      breath_type = EXCLUDED.breath_type, reference_audio_url = EXCLUDED.reference_audio_url,
      updated_at = now()
  `;

  return json({ ok: true });
}
