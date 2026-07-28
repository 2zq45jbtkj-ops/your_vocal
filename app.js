/* Курс вокала — Telegram Mini App (без сборки).
   Экраны и поведение перенесены из дизайн-хэндоффа один в один.
   Контент урока лежит в data/, код менять не нужно. */

"use strict";

// ?reset=1 в адресе — чистит локальный прогресс/данные ученика на этом устройстве.
if (location.search.indexOf("reset=1") !== -1) {
  try { localStorage.removeItem("vocal-app"); } catch (e) {}
}

var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
var app = document.getElementById("app");

var TOTAL_LESSONS = 30;
var LESSON = null; // data/lesson-01.json

// Vercel режет тело запроса примерно на уровне ~4.5 МБ — держим запас.
// Видео сверх этого лимита (по умолчанию — снятое обычной камерой телефона,
// без ограничений по качеству/длительности) уходит преподавателю не через
// сервер, а напрямую в Telegram-чат с ботом.
var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
var TEACHER_BOT_USERNAME = "your_vocal_teacher_bot";

/* ---------- состояние ---------- */

var state = {
  screen: "tg",
  tgId: "", chatId: null, firstName: "", lastName: "",
  quizIndex: 0, quizAnswers: [], quizScore: 0,
  quizDone: false, warmupsDone: false, songDone: false,
  lectureViewed: false, celebrated: false,
  warmupFiles: [], songFiles: [],
  songPlacements: {}, // "ti-li" -> [{type:"V"|"v", index:Number}]
  // настройки плеера распевок (шестерёнка): темп/тональность/повтор — на упражнение,
  // автовоспроизведение — общее на весь блок распевок.
  tempoMap: {}, pitchMap: {}, loopMap: {}, autoplayNext: false,
  // то же самое, но для плеера в упражнении с песней — свой набор настроек.
  songTempoMap: {}, songPitchMap: {}, songLoopMap: {}, songAutoplayNext: false,
  favorites: {}, // "lessonId-w-n" / "lessonId-s-ti" -> { lessonTitle, label }
  darkMode: false, notifOn: true, // раздел «Ещё»; darkMode хранится отдельным ключом (см. loadDarkMode)
  // transient (не сохраняется):
  playerIdx: null, playerElapsed: 0, durations: {}, openSettings: {},
  songPlayerKey: null, songPlayerElapsed: 0, songDurations: {}, songOpenSettings: {},
  songRevealed: {}, songSelectedMark: {},
  feedbackMood: null, feedbackText: "", coursesFilter: null,
  favPlayerKey: null, pendingUnstar: null, pendingUnstarData: null, pendingUnstarSecs: 0
};

var audioEls = {};
var songAudioEls = {};

function saveState() {
  try {
    localStorage.setItem("vocal-app", JSON.stringify({
      tgId: state.tgId, chatId: state.chatId, firstName: state.firstName, lastName: state.lastName,
      quizIndex: state.quizIndex, quizAnswers: state.quizAnswers,
      quizScore: state.quizScore, quizDone: state.quizDone,
      warmupsDone: state.warmupsDone, songDone: state.songDone,
      lectureViewed: state.lectureViewed, celebrated: state.celebrated,
      warmupFiles: state.warmupFiles.map(function (f) { return { name: f.name, status: f.status }; }),
      songFiles: state.songFiles.map(function (f) { return { name: f.name, status: f.status }; }),
      songPlacements: state.songPlacements,
      tempoMap: state.tempoMap, pitchMap: state.pitchMap, loopMap: state.loopMap,
      autoplayNext: state.autoplayNext,
      songTempoMap: state.songTempoMap, songPitchMap: state.songPitchMap,
      songLoopMap: state.songLoopMap, songAutoplayNext: state.songAutoplayNext,
      favorites: state.favorites, notifOn: state.notifOn
    }));
  } catch (e) {}
}

/* «Тёмная тема» — отдельный ключ localStorage, как в дизайн-файле (vocalAppDarkMode) */
function loadDarkMode() {
  try { state.darkMode = localStorage.getItem("vocalAppDarkMode") === "1"; } catch (e) {}
}
function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  try { localStorage.setItem("vocalAppDarkMode", state.darkMode ? "1" : "0"); } catch (e) {}
  render();
}

function loadState() {
  try {
    var raw = localStorage.getItem("vocal-app");
    if (!raw) return;
    var s = JSON.parse(raw);
    for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) state[k] = s[k]; }
    if (state.tgId && state.firstName && state.lastName) state.screen = "courses";
  } catch (e) {}
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- прогресс урока и празднование 100% ---------- */

function progressPercent() {
  var n = 0;
  if (state.lectureViewed) n++;
  if (state.quizDone) n++;
  if (state.warmupFiles && state.warmupFiles.length) n++;
  if (state.songFiles && state.songFiles.length) n++;
  return n * 25;
}

var CONFETTI_COLORS = ["#E8B84B", "#C1503F", "#D98B4A", "oklch(56% 0.09 235)", "#7A9B6E"];

function showConfetti() {
  var overlay = document.createElement("div");
  overlay.id = "confetti-overlay";

  var count = 60;
  for (var i = 0; i < count; i++) {
    var p = document.createElement("div");
    p.className = "confetti-piece";
    var color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    var size = 6 + Math.random() * 7;
    var round = Math.random() > 0.5;
    p.style.background = color;
    p.style.width = size + "px";
    p.style.height = (round ? size : size * 1.6) + "px";
    p.style.borderRadius = round ? "50%" : "2px";
    p.style.left = Math.random() * 100 + "%";
    var duration = 2.4 + Math.random() * 1.6;
    var delay = Math.random() * 0.3;
    p.style.animationDuration = duration + "s";
    p.style.animationDelay = delay + "s";
    overlay.appendChild(p);
  }

  var card = document.createElement("div");
  card.className = "celebrate-card";
  card.innerHTML =
    '<div class="celebrate-badge">' + SVG.resultCheck + "</div>" +
    '<div class="celebrate-title">Готово на 100%!</div>' +
    '<div class="celebrate-sub">Все материалы урока выполнены</div>';
  overlay.appendChild(card);

  document.body.appendChild(overlay);
  // Самый долгий кусочек: duration до 4.0с + delay до 0.3с — держим оверлей
  // дольше этого, иначе конфетти обрывались на середине падения.
  setTimeout(function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 4600);
}

function maybeCelebrate() {
  if (!LESSON) return;
  var pct = progressPercent();
  // Прогресс упал ниже 100% (заменили/убрали файл) — снимаем флаг,
  // чтобы при повторном достижении 100% конфетти сыграли снова.
  if (pct < 100) {
    if (state.celebrated) { state.celebrated = false; saveState(); }
    return;
  }
  if (pct === 100 && !state.celebrated) {
    state.celebrated = true;
    saveState();
    showConfetti();
  }
}

/* ---------- отправка домашки преподавателю в Telegram ---------- */

function baseSubmitFields() {
  var f = new FormData();
  f.append("firstName", state.firstName || "");
  f.append("lastName", state.lastName || "");
  f.append("tgId", state.tgId || "");
  f.append("chatId", state.chatId || "");
  f.append("lessonTitle", LESSON ? LESSON.title : "");
  return f;
}

function submitFile(kind, file, onStatus, filename, meta) {
  onStatus("sending");
  var f = baseSubmitFields();
  f.append("kind", kind);
  f.append("file", file, filename || file.name || (kind + "-upload"));
  if (meta) {
    if (meta.width) f.append("width", meta.width);
    if (meta.height) f.append("height", meta.height);
    if (meta.duration) f.append("duration", meta.duration);
  }
  fetch("/api/submit", { method: "POST", body: f })
    .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
    .then(function (data) { onStatus(data.ok ? "sent" : "error"); })
    .catch(function () { onStatus("error"); });
}

/* читаем реальные width/height/duration видео перед отправкой —
   без этого Telegram иногда растягивает картинку в квадрат */
function readVideoMeta(file) {
  return new Promise(function (resolve) {
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { resolve(null); return; }
    var v = document.createElement("video");
    v.preload = "metadata";
    var done = function (meta) { URL.revokeObjectURL(url); resolve(meta); };
    v.onloadedmetadata = function () {
      done({ width: v.videoWidth, height: v.videoHeight, duration: Math.round(v.duration) || 0 });
    };
    v.onerror = function () { done(null); };
    setTimeout(function () { done(null); }, 4000); // не ждём вечно на странных файлах
    v.src = url;
  });
}

function submitQuizResult(score, total, wrongDetails) {
  var f = baseSubmitFields();
  f.append("kind", "quiz");
  f.append("score", score);
  f.append("total", total);
  if (wrongDetails && wrongDetails.length) {
    var lines = wrongDetails.map(function (w, i) {
      var block = "❌ Вопрос " + (i + 1) + ": " + w.q +
        "\n   Ответ ученика: " + w.chosen +
        "\n   Правильный ответ: " + w.correct;
      if (w.explain) block += "\n   Почему: " + w.explain;
      return block;
    });
    f.append("details", lines.join("\n\n"));
  }
  fetch("/api/submit", { method: "POST", body: f }).catch(function () {});
}

function openTeacherChat() {
  var url = "https://t.me/" + TEACHER_BOT_USERNAME;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

/* ---------- SVG ---------- */

var SVG = {
  back: '<svg width="11" height="18" viewBox="0 0 11 18" fill="none"><path d="M9 1L2 9l7 8" stroke="oklch(56% 0.09 235)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  telegram: '<svg width="52" height="52" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"><linearGradient id="tgg" x1="53.72" y1="49" x2="191" y2="186" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#37aee2"/><stop offset="1" stop-color="#1e96c8"/></linearGradient><circle cx="120" cy="120" r="120" fill="url(#tgg)"/><path fill="#c8daea" d="M98 175c-3.888 0-3.227-1.468-4.568-5.17L82 132.207 152.988 87"/><path fill="#a9c9dd" d="M98 175c3 0 4.325-1.372 6-3l16-15.558-19.958-12.035"/><path fill="#fff" d="M100.04 154.41l48.36 35.729c5.519 3.045 9.501 1.468 10.876-5.123l19.685-92.788c1.977-8.085-3.077-11.746-8.359-9.32l-115.59 44.571c-7.891 3.165-7.843 7.567-1.438 9.523l29.663 9.259 68.673-43.325c3.242-1.966 6.218-.909 3.776 1.258"/></svg>',
  lock: '<svg width="14" height="16" viewBox="0 0 14 16" fill="none"><rect x="1" y="7" width="12" height="8" rx="2" stroke="oklch(65% 0.01 70)" stroke-width="1.5"/><path d="M4 7V4.5a3 3 0 016 0V7" stroke="oklch(65% 0.01 70)" stroke-width="1.5"/></svg>',
  chevron: '<svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="oklch(75% 0.01 70)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stepCheck: '<svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5l4 4 7-8" stroke="oklch(97% 0.01 80)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="oklch(95% 0.014 80)" stroke-width="1.4"/><path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="oklch(95% 0.014 80)" stroke-width="1.2" stroke-linecap="round"/></svg>',
  resultCheck: '<svg width="26" height="20" viewBox="0 0 26 20" fill="none"><path d="M2 10l8 8L24 2" stroke="oklch(28% 0.015 70)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seekBack: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4v6h6" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15a8 8 0 1 0 2-9.5L4 10" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seekFwd: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 4v6h-6" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 15a8 8 0 1 1-2-9.5L20 10" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M1 1l10 6-10 6V1z" fill="oklch(95% 0.014 80)"/></svg>',
  pause: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="10" rx="1" fill="oklch(95% 0.014 80)"/><rect x="7" y="1" width="4" height="10" rx="1" fill="oklch(95% 0.014 80)"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="oklch(28% 0.015 70)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="oklch(28% 0.015 70)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  uploadTerra: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="oklch(38% 0.1 38)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="oklch(38% 0.1 38)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  hwCheck: '<svg width="15" height="12" viewBox="0 0 15 12" fill="none"><path d="M1 6l4 4 9-9" stroke="oklch(28% 0.015 70)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  micIcon: function (color) { return '<svg width="12" height="16" viewBox="0 0 12 16" fill="none"><rect x="3" y="1" width="6" height="10" rx="3" stroke="' + color + '" stroke-width="1.4"/><path d="M1.5 8.5a4.5 4.5 0 009 0M6 13v2" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round"/></svg>'; },
  notesIcon: function (color) { return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="11" r="2.2" stroke="' + color + '" stroke-width="1.4"/><circle cx="11" cy="9" r="2.2" stroke="' + color + '" stroke-width="1.4"/><path d="M6.2 11V2.5L13.2 1v6.5" stroke="' + color + '" stroke-width="1.4"/></svg>'; },
  dockPerson: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.5" r="3.3" stroke="' + c + '" stroke-width="1.6"/><path d="M3.5 17c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>'; },
  dockLessons: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="' + c + '" stroke-width="1.6"/><path d="M6.5 8h7M6.5 12h4.5" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>'; },
  dockQuestion: function (c) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="' + c + '" stroke-width="1.6"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="13.5" r="1.1" fill="' + c + '"/><circle cx="12" cy="13.5" r="1.1" fill="' + c + '"/></svg>'; },
  dockMore: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="4.5" cy="10" r="1.6" fill="' + c + '"/><circle cx="10" cy="10" r="1.6" fill="' + c + '"/><circle cx="15.5" cy="10" r="1.6" fill="' + c + '"/></svg>'; },
  gear: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 5.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z" stroke="oklch(52% 0.012 70)" stroke-width="1.3"/><path d="M8 1.3v1.4M8 13.3v1.4M14.7 8h-1.4M2.7 8H1.3M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1" stroke="oklch(52% 0.012 70)" stroke-width="1.3" stroke-linecap="round"/></svg>',
  chevronRight: '<svg width="7" height="12" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="oklch(75% 0.01 70)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: function (filled) {
    var stroke = filled ? "oklch(84% 0.15 92)" : "oklch(52% 0.012 70)";
    var fill = filled ? "oklch(84% 0.15 92)" : "none";
    return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.3l1.9 4.1 4.5.5-3.4 3 .9 4.4L8 11.2l-3.9 2.1.9-4.4-3.4-3 4.5-.5L8 1.3z" stroke="' + stroke + '" fill="' + fill + '" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  }
};

function backBtn(handlerName) {
  return '<button class="back-btn" data-act="' + handlerName + '">' + SVG.back + "</button>";
}

/* ---------- навигация ---------- */

function go(screen) {
  state.screen = screen;
  render();
}

function backTarget() {
  switch (state.screen) {
    case "name": return "tg";
    case "lesson-home": return "courses";
    case "favorites": return "courses";
    case "lecture": case "warmups": case "song": case "quiz-result": return "lesson-home";
    case "feedback": return "song";
    case "quiz": return null; // отдельная логика
    default: return null;
  }
}

function handleBack() {
  if (state.screen === "quiz") {
    if (state.quizIndex > 0) { state.quizIndex--; render(); }
    else go("lesson-home");
    return;
  }
  var t = backTarget();
  if (t) go(t);
}

/* ---------- экраны ---------- */

function renderTg() {
  app.innerHTML =
    '<div class="auth-screen">' +
      '<div class="auth-logo">' + SVG.telegram + "</div>" +
      '<div class="auth-title">Вход в курс</div>' +
      '<div class="auth-sub">Введите ваш Telegram ID — так преподаватель свяжет аккаунт с вашим профилем ученика.</div>' +
      '<label class="field-label">TELEGRAM ID</label>' +
      '<input id="tg-input" class="field-input" type="text" placeholder="@username" value="' + esc(state.tgId) + '">' +
      '<div class="spacer"></div>' +
      '<button id="tg-next" class="cta"' + (state.tgId.trim() ? "" : " disabled") + ">Продолжить</button>" +
    "</div>";

  var input = document.getElementById("tg-input");
  var btn = document.getElementById("tg-next");
  input.addEventListener("input", function () {
    state.tgId = input.value;
    btn.disabled = !state.tgId.trim();
  });
  btn.addEventListener("click", function () { saveState(); go("name"); });
}

function renderName() {
  app.innerHTML =
    '<div class="auth-screen">' +
      backBtn("back") +
      '<div class="auth-title">Как вас зовут?</div>' +
      '<div class="auth-sub tight">Укажите имя и фамилию на русском — так вас увидит преподаватель.</div>' +
      '<label class="field-label">ИМЯ</label>' +
      '<input id="fn-input" class="field-input mb" type="text" placeholder="Мария" value="' + esc(state.firstName) + '">' +
      '<label class="field-label">ФАМИЛИЯ</label>' +
      '<input id="ln-input" class="field-input" type="text" placeholder="Иванова" value="' + esc(state.lastName) + '">' +
      '<div class="spacer"></div>' +
      '<button id="name-next" class="cta"' + (state.firstName.trim() && state.lastName.trim() ? "" : " disabled") + ">Начать обучение</button>" +
    "</div>";

  var fn = document.getElementById("fn-input");
  var ln = document.getElementById("ln-input");
  var btn = document.getElementById("name-next");
  function upd() {
    state.firstName = fn.value;
    state.lastName = ln.value;
    btn.disabled = !(state.firstName.trim() && state.lastName.trim());
  }
  fn.addEventListener("input", upd);
  ln.addEventListener("input", upd);
  btn.addEventListener("click", function () { saveState(); go("courses"); });
  wireActs();
}

/* число пройденных/начатых уроков — сейчас есть только урок 1,
   но логика уже готова к появлению следующих */
function lessonStats() {
  var completed = 0, inProgress = 0;
  var pct = progressPercent();
  if (pct === 100) completed++;
  else if (pct > 0) inProgress++;
  return { completed: completed, inProgress: inProgress };
}

function roadmapCardHtml() {
  var s = state;
  var steps = [
    { label: "Лекция «" + esc(LESSON.title) + "»", done: true },
    { label: "Тест", done: s.quizDone },
    { label: "Распевки", done: !!(s.warmupFiles && s.warmupFiles.length) },
    { label: "Песня", done: !!(s.songFiles && s.songFiles.length) }
  ];
  var stepsHtml = steps.map(function (st) {
    return '<div class="roadmap-step">' +
      '<div class="roadmap-step-dot' + (st.done ? " done" : "") + '">' + (st.done ? SVG.stepCheck : "") + "</div>" +
      '<span>' + st.label + "</span>" +
    "</div>";
  }).join("");
  return (
    '<div class="roadmap-card" data-act="open-lesson">' +
      '<div class="roadmap-title">Урок 1 · ' + esc(LESSON.title) + "</div>" +
      '<div class="roadmap-sub">' + (s.songFiles && s.songFiles.length ? "Завершён" : "В процессе") + "</div>" +
      stepsHtml +
    "</div>"
  );
}

function lockedRoadmapCardHtml(n) {
  var lockedSteps = ["Лекция", "Тест", "Распевки", "Песня"];
  var stepsHtml = lockedSteps.map(function (label) {
    return '<div class="roadmap-step">' +
      '<div class="roadmap-step-dot"></div>' +
      '<span style="color:var(--locked);">' + label + "</span>" +
    "</div>";
  }).join("");
  return (
    '<div class="roadmap-card locked">' +
      '<div class="roadmap-title" style="color:var(--locked);">Урок ' + n + "</div>" +
      '<div class="roadmap-sub">Откроется позже</div>' +
      stepsHtml +
    "</div>"
  );
}

function roadmapScrollHtml() {
  var html = roadmapCardHtml();
  for (var i = 2; i <= TOTAL_LESSONS; i++) html += lockedRoadmapCardHtml(i);
  return html;
}

function lessonsGridHtml() {
  var tile1 =
    '<div class="lesson-tile" data-act="open-lesson">' +
      '<div class="lesson-dot" style="background:oklch(56% 0.09 235);">1</div>' +
      '<div class="lesson-tile-name">' + esc(LESSON.title) + "</div>" +
    "</div>";
  var rest = "";
  for (var i = 2; i <= TOTAL_LESSONS; i++) {
    rest +=
      '<div class="lesson-tile locked">' +
        '<div class="lesson-dot" style="background:var(--line);">' + SVG.lock + "</div>" +
        '<div class="lesson-tile-name">Урок ' + i + "</div>" +
      "</div>";
  }
  return '<div class="courses-grid">' + tile1 + rest + "</div>";
}

function renderCourses() {
  var stats = lessonStats();
  var filter = state.coursesFilter; // "inProgress" | "completed" | null — пилюли чисто визуальные, как в макете
  var favCount = Object.keys(state.favorites || {}).length;

  app.innerHTML =
    '<div class="courses-head">' +
      '<div class="section-label" style="margin-top:0;">Курс</div>' +
      '<div class="courses-title">Курс вокала</div>' +
      '<div class="courses-sub">30 уроков · ' + esc(state.lastName) + " " + esc(state.firstName) + "</div>" +
      '<button class="fav-warmups-btn" data-act="go-favorites">' +
        SVG.star(true) +
        '<span>Избранные распевки</span>' +
        '<span class="fav-warmups-count">' + favCount + "</span>" +
      "</button>" +
    "</div>" +
    '<div class="filter-row">' +
      '<button class="filter-btn' + (filter === "inProgress" ? " active" : "") + '" data-act="filter-inprogress">В работе · ' + stats.inProgress + "</button>" +
      '<button class="filter-btn' + (filter === "completed" ? " active" : "") + '" data-act="filter-completed">✓ Завершено · ' + stats.completed + "</button>" +
    "</div>" +
    '<div class="roadmap-wrap">' +
      '<div class="roadmap-label">Дорожная карта урока · листайте →</div>' +
      '<div class="roadmap-scroll">' + roadmapScrollHtml() + "</div>" +
    "</div>" +
    lessonsGridHtml();
  wireActs();
}

/* ---------- избранные распевки: список + мини-плеер + снятие звезды с undo (1:1 по макету) ---------- */

var favAudioEls = {};
var unstarTimer = null;

function renderFavorites() {
  var s = state;
  var entries = [];
  Object.keys(s.favorites || {}).forEach(function (key) {
    var m = key.match(/-w-(\d+)$/);
    if (!m) return;
    var n = parseInt(m[1], 10);
    var ex = LESSON.warmups.exercises[n - 1];
    if (!ex) return;
    entries.push({ key: key, n: n, ex: ex, fav: s.favorites[key] });
  });

  var listHtml = entries.map(function (item) {
    var playing = s.favPlayerKey === item.n;
    return (
      '<div class="fav-item">' +
        '<button class="fav-play-btn' + (playing ? " playing" : "") + '" data-fav-play="' + item.n + '">' + (playing ? SVG.pause : SVG.play) + "</button>" +
        '<div class="fav-item-body">' +
          '<div class="fav-item-label">' + esc(item.ex.label1 + (item.ex.label2 ? " " + item.ex.label2 : "")) + "</div>" +
          '<div class="fav-item-sub">Урок 1 · ' + esc(item.fav.lessonTitle) + "</div>" +
        "</div>" +
        '<button class="fav-unstar-btn" data-fav-unstar="' + item.key + '">' + SVG.star(true) + "</button>" +
        '<audio id="fav-audio-' + item.n + '" src="' + esc(item.ex.src) + '" preload="none" style="display:none;"></audio>' +
      "</div>"
    );
  }).join("");

  app.innerHTML =
    '<div class="top">' + backBtn("back") +
      '<div class="top-title lg">Избранные распевки</div>' +
    "</div>" +
    '<div style="padding:8px 20px 130px;">' +
      (entries.length ? listHtml : '<div class="courses-empty">Пока нет избранных распевок — нажми на звезду в плеере урока.</div>') +
    "</div>" +
    (s.pendingUnstar
      ? '<div class="unstar-toast"><span>Убрано из избранного · ' + s.pendingUnstarSecs + 'с</span><button data-act="undo-unstar">Вернуть</button></div>'
      : "");

  Array.prototype.forEach.call(app.querySelectorAll("[data-fav-play]"), function (btn) {
    btn.addEventListener("click", function () {
      toggleFavAudio(parseInt(btn.getAttribute("data-fav-play"), 10));
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-fav-unstar]"), function (btn) {
    btn.addEventListener("click", function () {
      scheduleUnstar(btn.getAttribute("data-fav-unstar"));
    });
  });
  wireActs();
}

function toggleFavAudio(n) {
  var el = document.getElementById("fav-audio-" + n);
  if (!el) return;
  favAudioEls[n] = el;
  if (state.favPlayerKey === n) {
    el.pause();
    state.favPlayerKey = null;
    render();
    return;
  }
  Object.keys(favAudioEls).forEach(function (k) { if (favAudioEls[k]) favAudioEls[k].pause(); });
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  Object.keys(songAudioEls).forEach(function (k) { if (songAudioEls[k]) songAudioEls[k].pause(); });
  el.currentTime = 0;
  var p = el.play();
  if (p && p.catch) p.catch(function () {});
  state.favPlayerKey = n;
  render();
  el.addEventListener("ended", function onEnded() {
    if (state.favPlayerKey === n) { state.favPlayerKey = null; render(); }
    el.removeEventListener("ended", onEnded);
  });
}

function scheduleUnstar(key) {
  if (unstarTimer) clearInterval(unstarTimer);
  var removed = state.favorites[key];
  delete state.favorites[key];
  saveState();
  state.pendingUnstar = key;
  state.pendingUnstarData = removed;
  state.pendingUnstarSecs = 10;
  render();
  unstarTimer = setInterval(function () {
    state.pendingUnstarSecs--;
    if (state.pendingUnstarSecs <= 0) {
      clearInterval(unstarTimer);
      unstarTimer = null;
      state.pendingUnstar = null;
      state.pendingUnstarData = null;
      if (state.screen === "favorites") render();
      return;
    }
    var el = document.querySelector(".unstar-toast span");
    if (el) el.textContent = "Убрано из избранного · " + state.pendingUnstarSecs + "с";
  }, 1000);
}

function undoUnstar() {
  if (unstarTimer) { clearInterval(unstarTimer); unstarTimer = null; }
  if (state.pendingUnstar && state.pendingUnstarData) {
    state.favorites[state.pendingUnstar] = state.pendingUnstarData;
    saveState();
  }
  state.pendingUnstar = null;
  state.pendingUnstarData = null;
  render();
}

/* ---------- личный кабинет: колесо баланса (1:1 по макету дизайнера) ---------- */

function renderWheel(metrics) {
  var size = 240, R = 92, cx = size / 2, cy = size / 2, n = metrics.length;
  function angleFor(i) { return -Math.PI / 2 + i * (2 * Math.PI / n); }
  function ptStr(fracFn) {
    return metrics.map(function (m, i) {
      var a = angleFor(i), r = fracFn(m) * R;
      return (cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1);
    }).join(" ");
  }
  var rings = [0.25, 0.5, 0.75, 1].map(function (f) {
    return '<polygon points="' + ptStr(function () { return f; }) + '" fill="none" stroke="oklch(85% 0.01 70)" stroke-width="1"></polygon>';
  }).join("");
  var axes = metrics.map(function (m, i) {
    var a = angleFor(i);
    return '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(a)).toFixed(1) + '" y2="' + (cy + R * Math.sin(a)).toFixed(1) + '" stroke="oklch(88% 0.01 70)" stroke-width="1"></line>';
  }).join("");
  var dataPoly = '<polygon points="' + ptStr(function (m) { return m.score / 10; }) + '" fill="oklch(56% 0.09 235 / 0.35)" stroke="oklch(56% 0.09 235)" stroke-width="2"></polygon>';
  var dots = metrics.map(function (m, i) {
    var a = angleFor(i), r = (m.score / 10) * R;
    return '<circle cx="' + (cx + r * Math.cos(a)).toFixed(1) + '" cy="' + (cy + r * Math.sin(a)).toFixed(1) + '" r="2.6" fill="oklch(60% 0.13 38)"></circle>';
  }).join("");
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '">' + rings + axes + dataPoly + dots + "</svg>";
}

/* демо-профиль и срезы — та же самая тестовая карточка, что в макете дизайнера
   (Мария Ивановна). Реальные данные ученика подключим вместе с бэкендом кабинета. */
var DEMO_PROFILE = {
  short: "МИ", name: "Мария Ивановна", age: 27, status: "Активный",
  lessonType: "Вокал",
  range: "Ля малой октавы — До 2-й октавы", voiceType: "Лирико-колоратурное сопрано",
  primaryGoal: "Убрать зажим гортани и компенсаторное дыхание ключицей, укрепить опору дыхания, начать уверенно брать высокие ноты.",
  goals: ["Не берутся высокие ноты", "Уверенность в голосе"],
  notes: ["Гортанный зажим", "Компенсаторное дыхание ключицей"],
  focus: "Снятие зажима гортани через упражнения на сирена и полуприкрытые гласные"
};

var DEMO_ASSESSMENTS = [
  { date: "01.07.2026", homework: "Дыхание, Гортань", score: 7, recommendations: "Sirens, работа над зевком, полуприкрытые гласные", goal: "Стабилизировать опору дыхания",
    metrics: [["Актёрское мастерство",6],["Работа с микрофоном",5],["Дыхание",7],["Сила звука",6],["Регистры",5],["Атака и окончание звука",6],["Гортань",5],["Голосовые складки",6],["Ложные голосовые складки",5],["Щитовидный хрящ",6],["Перстневидный хрящ",6],["Черпаловидный хрящ",5],["Черпало-надгортанный сфинктер",5],["Мягкое нёбо",6],["Язык",6],["Нижняя челюсть",6],["Губы",7],["Анкеровка",10]] },
  { date: "14.07.2026", homework: "Дыхание, Регистры, Ложные голосовые складки", score: null, recommendations: "", goal: "",
    metrics: [["Актёрское мастерство",1],["Атака и окончание звука",1],["Гортань",1],["Голосовые складки",1],["Губы",1],["Анкеровка",1],["Работа с микрофоном",4],["Дыхание",8],["Сила звука",7],["Регистры",6],["Ложные голосовые складки",3],["Щитовидный хрящ",5],["Перстневидный хрящ",6],["Черпаловидный хрящ",4],["Черпало-надгортанный сфинктер",5],["Мягкое нёбо",7],["Язык",6],["Нижняя челюсть",5]] }
];

function chipsHtml(arr) {
  return arr.map(function (x) { return '<span class="chip-tag">' + esc(x) + "</span>"; }).join("");
}

function renderProfile() {
  var s = state;
  var p = DEMO_PROFILE;

  var appHomeworkDone = [];
  if (s.quizDone) appHomeworkDone.push("Тест: " + LESSON.title);
  if (s.warmupsDone) appHomeworkDone.push("Распевки: " + LESSON.title);
  if (s.songDone) appHomeworkDone.push("Песня: " + LESSON.title);

  var assessmentsHtml = DEMO_ASSESSMENTS.map(function (a, ai) {
    var metrics = a.metrics.map(function (m) { return { label: m[0], score: m[1], pct: m[1] * 10 }; });
    var lowPoints = metrics.slice().sort(function (x, y) { return x.score - y.score; }).slice(0, 3);
    var expanded = !!(s.expandedAssessments && s.expandedAssessments[ai]);

    var metricsGrid = expanded
      ? '<div class="assessment-metrics-grid">' +
          metrics.map(function (m) {
            return '<div><div class="assessment-metric-row"><span>' + esc(m.label) + '</span><span class="assessment-metric-score">' + m.score + "</span></div>" +
              '<div class="assessment-metric-bar"><div style="width:' + m.pct + '%;"></div></div></div>';
          }).join("") +
        "</div>"
      : "";

    var lowPointsHtml = lowPoints.map(function (lp) {
      return '<span class="lowpoint-chip">' + esc(lp.label) + " · " + lp.score + "</span>";
    }).join("");

    return (
      '<div class="assessment-card">' +
        '<div class="assessment-date">Срез — ' + a.date + "</div>" +
        '<div class="assessment-wheel-wrap" data-toggle-assessment="' + ai + '">' + renderWheel(metrics) + "</div>" +
        '<div class="assessment-toggle" data-toggle-assessment="' + ai + '">' + (expanded ? "Свернуть список" : "Показать списком") + "</div>" +
        metricsGrid +
        '<div class="section-label" style="margin-top:0;">Точки роста</div>' +
        '<div class="chips-wrap" style="margin-bottom:12px;">' + lowPointsHtml + "</div>" +
        '<div class="assessment-line"><b>ДЗ:</b> ' + esc(a.homework) + "</div>" +
        (a.score != null ? '<div class="assessment-line"><b>Оценка за ДЗ:</b> ' + a.score + "</div>" : "") +
        (a.recommendations ? '<div class="assessment-line"><b>Рекомендации:</b> ' + esc(a.recommendations) + "</div>" : "") +
        (a.goal ? '<div class="assessment-line"><b>Цель периода:</b> ' + esc(a.goal) + "</div>" : "") +
      "</div>"
    );
  }).join("");

  app.innerHTML =
    '<div style="padding:58px 20px 130px;">' +
      '<div class="profile-head">' +
        '<div class="profile-avatar">' + esc(p.short) + "</div>" +
        '<div>' +
          '<div class="profile-name">' + esc(p.name) + "</div>" +
          '<div class="profile-status">' + p.age + ' лет · <span style="color:var(--terra);font-weight:600;">' + esc(p.status) + "</span></div>" +
        "</div>" +
      "</div>" +
      '<div class="cabinet-inset">' +
        '<div class="cabinet-grid-2col">' +
          '<div><div class="profile-card-label">Тип занятий</div><div class="profile-card-value">' + esc(p.lessonType) + "</div></div>" +
          '<div><div class="profile-card-label">Диапазон · тембр</div><div class="profile-card-value">' + esc(p.range) + '</div><div class="profile-card-sub">' + esc(p.voiceType) + "</div></div>" +
        "</div>" +
        '<div class="section-label" style="margin-top:0;">Первичная цель</div>' +
        '<div class="goal-box goal-primary" style="margin-bottom:16px;">' + esc(p.primaryGoal) + "</div>" +
        '<div class="section-label">Вторичная цель</div>' +
        '<div class="goal-box goal-secondary" style="margin-bottom:16px;">' + esc(p.focus) + "</div>" +
        '<div class="section-label">Задачи</div>' +
        '<div class="chips-wrap" style="margin-bottom:16px;">' + chipsHtml(p.goals) + "</div>" +
        '<div class="section-label">Особенности</div>' +
        '<div class="chips-wrap" style="margin-bottom:16px;">' + chipsHtml(p.notes) + "</div>" +
        '<div class="section-label">Пройдённые ДЗ в приложении</div>' +
        '<div class="chips-wrap">' +
          (appHomeworkDone.length ? chipsHtml(appHomeworkDone) : '<span class="chips-empty">Пока ничего не пройдено</span>') +
        "</div>" +
      "</div>" +
      '<div class="assessments-title">Срезы · колесо баланса</div>' +
      assessmentsHtml +
      '<div class="instruction-note" style="margin-top:6px;">Профиль и срезы выше — пример, один в один с макетом дизайнера. Реальные данные ученика появятся, когда подключим бэкенд личного кабинета.</div>' +
    "</div>";

  Array.prototype.forEach.call(app.querySelectorAll("[data-toggle-assessment]"), function (el) {
    el.addEventListener("click", function () {
      var ai = el.getAttribute("data-toggle-assessment");
      state.expandedAssessments = state.expandedAssessments || {};
      state.expandedAssessments[ai] = !state.expandedAssessments[ai];
      render();
    });
  });
  wireActs();
}

/* ---------- запись на занятие: календарь → время → подтверждение (1:1 по макету) ---------- */

var CAL_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
var CAL_WEEKDAYS_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
var CAL_WEEKDAYS_SHORT = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function pad2(n) { return String(n).padStart(2, "0"); }

function loadScheduleForMonth(vy, vm) {
  var key = vy + "-" + vm;
  if (state.calLoadedKey === key) return;
  state.calLoadedKey = key;
  var from = vy + "-" + pad2(vm + 1) + "-01";
  var lastDay = new Date(vy, vm + 1, 0).getDate();
  var to = vy + "-" + pad2(vm + 1) + "-" + pad2(lastDay);
  fetch("/api/schedule?from=" + from + "&to=" + to)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.calBusyDates = data.busyDates || [];
      state.calConfigured = !!data.configured;
      if (state.screen === "questions") render();
    })
    .catch(function () {});
}

function buildCalendarCells(vy, vm, selectedDate) {
  var firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7;
  var daysInMonth = new Date(vy, vm + 1, 0).getDate();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var busy = state.calBusyDates || [];
  var cells = [];
  for (var i = 0; i < firstDow; i++) cells.push({ empty: true });
  for (var d = 1; d <= daysInMonth; d++) {
    var date = new Date(vy, vm, d);
    var dow = (date.getDay() + 6) % 7;
    var isPast = date < today;
    var isToday = date.getTime() === today.getTime();
    var dateStr = vy + "-" + pad2(vm + 1) + "-" + pad2(d);
    var isSelected = selectedDate === dateStr;
    var fullyBooked = state.calConfigured
      ? (!isPast && !isSelected && busy.indexOf(dateStr) !== -1)
      : (!isPast && !isSelected && ((d + dow) % 4 === 0));
    var clickable = !isPast && !fullyBooked;
    var bg = "oklch(90% 0.03 235)", color = "oklch(38% 0.06 235)",
      shadow = "3px 3px 6px oklch(70% 0.02 80/0.28), -3px -3px 6px oklch(100% 0 0/0.75)";
    if (isSelected) { bg = "oklch(56% 0.09 235)"; color = "oklch(97% 0.01 80)"; shadow = "3px 3px 6px oklch(70% 0.02 80/0.35)"; }
    else if (isPast) { bg = "oklch(92% 0.008 70)"; color = "oklch(70% 0.008 70)"; shadow = "none"; }
    else if (fullyBooked) { bg = "oklch(88% 0.05 38)"; color = "oklch(45% 0.1 38)"; shadow = "3px 3px 6px oklch(70% 0.02 80/0.28), -3px -3px 6px oklch(100% 0 0/0.75)"; }
    var ring = (isToday && !isSelected) ? "box-shadow:0 0 0 2px oklch(60% 0.13 38 / 0.55);" : "";
    cells.push({
      num: d, dateStr: dateStr, clickable: clickable,
      style: "aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 13px Manrope,sans-serif;background:" + bg + ";color:" + color + ";box-shadow:" + shadow + ";" + ring + "cursor:" + (clickable ? "pointer" : "default") + ";"
    });
  }
  return cells;
}

function buildTimeSlots(dateStr, selectedTime) {
  if (!dateStr) return [];
  var d = parseInt(dateStr.slice(8, 10), 10);
  var hours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  return hours.map(function (h) {
    var disabled = (d + h) % 5 === 0;
    var isSelected = selectedTime === h;
    var bg = "oklch(95% 0.014 80)", color = "oklch(30% 0.015 70)",
      shadow = "5px 5px 10px oklch(70% 0.02 80/0.3), -5px -5px 10px oklch(100% 0 0/0.8)";
    if (disabled) { bg = "oklch(90% 0.008 70)"; color = "oklch(70% 0.008 70)"; shadow = "none"; }
    else if (isSelected) { bg = "oklch(56% 0.09 235)"; color = "oklch(97% 0.01 80)"; shadow = "4px 4px 8px oklch(70% 0.02 80/0.35)"; }
    return {
      h: h, disabled: disabled,
      style: "height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font:700 13px Manrope,sans-serif;background:" + bg + ";color:" + color + ";box-shadow:" + shadow + ";cursor:" + (disabled ? "default" : "pointer") + ";"
    };
  });
}

function submitBooking(dateStr, hour) {
  var f = baseSubmitFields();
  f.append("kind", "booking");
  f.append("text", "Дата: " + dateStr + ", время: " + hour + ":00");
  fetch("/api/submit", { method: "POST", body: f }).catch(function () {});
}

function renderQuestions() {
  var now = new Date();
  var vy = state.calYear != null ? state.calYear : now.getFullYear();
  var vm = state.calMonth != null ? state.calMonth : now.getMonth();
  state.calYear = vy;
  state.calMonth = vm;

  var html;

  if (!state.selectedDate) {
    var cells = buildCalendarCells(vy, vm, state.selectedDate);
    var cellsHtml = cells.map(function (c) {
      return c.empty
        ? '<div style="aspect-ratio:1;"></div>'
        : '<div' + (c.clickable ? ' data-cal-date="' + c.dateStr + '"' : "") + ' style="' + c.style + '">' + c.num + "</div>";
    }).join("");
    html =
      '<div style="font:600 12.5px Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:oklch(52% 0.012 70 / 0.8);">Запись</div>' +
      '<div style="font:800 27px Manrope,sans-serif;color:var(--ink);margin-top:4px;">Запись на занятие</div>' +
      '<div style="font-size:13px;color:var(--gray);margin-top:2px;">Выберите свободную дату</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;">' +
        '<button class="cal-nav-btn" data-act="cal-prev">‹</button>' +
        '<div style="font:700 18px Manrope,sans-serif;color:var(--ink);text-transform:capitalize;">' + CAL_MONTHS[vm] + " " + vy + "</div>" +
        '<button class="cal-nav-btn" data-act="cal-next">›</button>' +
      "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:20px;">' +
        CAL_WEEKDAYS_SHORT.map(function (w) { return '<div style="text-align:center;font:600 10.5px Inter,sans-serif;letter-spacing:.02em;color:oklch(52% 0.012 70/0.7);text-transform:uppercase;">' + w + "</div>"; }).join("") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:7px 6px;margin-top:8px;">' + cellsHtml + "</div>" +
      '<div style="margin-top:20px;display:flex;gap:16px;font:500 11.5px Inter,sans-serif;color:var(--gray);">' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;border-radius:50%;background:oklch(56% 0.09 235);display:inline-block;"></span>свободно</div>' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;border-radius:50%;background:oklch(60% 0.13 38);display:inline-block;"></span>занято</div>' +
      "</div>" +
      (state.calConfigured
        ? ""
        : '<div class="instruction-note" style="margin-top:18px;">Сейчас показан демо-календарь — как только впишешь ключ HolyHope, точки «занято» станут твоим настоящим расписанием.</div>');
  } else if (!state.calBookedFlag) {
    var selDate = new Date(state.selectedDate + "T00:00:00");
    var selLabel = selDate.getDate() + " " + CAL_MONTHS[selDate.getMonth()] + ", " + CAL_WEEKDAYS_FULL[(selDate.getDay() + 6) % 7];
    var slots = buildTimeSlots(state.selectedDate, state.selectedTime);
    var slotsHtml = slots.map(function (sl) {
      return '<div' + (sl.disabled ? "" : ' data-slot-hour="' + sl.h + '"') + ' style="' + sl.style + '">' + sl.h + ":00</div>";
    }).join("");
    html =
      '<button class="cal-nav-btn" style="width:auto;height:44px;padding:0 18px;border-radius:14px;color:var(--blue);font:600 13px Inter,sans-serif;margin-bottom:16px;" data-act="cal-clear">‹ Другая дата</button>' +
      '<div style="font:800 24px Manrope,sans-serif;color:var(--ink);text-transform:capitalize;">' + selLabel + "</div>" +
      '<div style="margin-top:40px;">' +
        '<div class="section-label" style="margin-top:0;">Свободное время</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">' + slotsHtml + "</div>" +
      "</div>" +
      '<div style="padding:24px 0 16px;">' +
        '<button class="cta" id="confirm-booking-btn"' + (state.selectedTime == null ? " disabled" : "") + ' style="' + (state.selectedTime == null ? "background:oklch(85% 0.01 70);box-shadow:none;" : "") + '">' +
          (state.selectedTime == null ? "Выберите время" : "Подтвердить на " + state.selectedTime + ":00") +
        "</button>" +
      "</div>";
  } else {
    html =
      '<div style="margin-top:6px;display:flex;flex-direction:column;gap:14px;">' +
        '<div style="background:oklch(90% 0.04 38);border-radius:18px;padding:16px 18px;font:500 13.5px/1.5 Inter,sans-serif;color:oklch(38% 0.1 38);">' +
          "Заявка отправлена преподавателю. Урок в день занятия отменить или перенести нельзя — планируйте заранее." +
        "</div>" +
        '<div class="section-label" style="margin-top:0;">Связаться с преподавателем</div>' +
        '<div data-act="cal-open-tg" style="background:var(--bg);border-radius:18px;box-shadow:var(--raised-lg);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">' +
          '<div><div style="font:600 14.5px Inter,sans-serif;color:var(--ink);">Telegram</div><div style="font:500 13px Inter,sans-serif;color:var(--gray);margin-top:2px;">@' + esc(TEACHER_BOT_USERNAME) + '</div></div>' +
          '<div style="font:600 13px Manrope,sans-serif;color:var(--terra);">Написать</div>' +
        "</div>" +
        '<div style="font:500 12px/1.5 Inter,sans-serif;color:var(--gray);text-align:center;margin-top:2px;">Преподавателю уже пришло уведомление в Telegram-бот.</div>' +
        '<button class="cta" data-act="cal-clear" style="background:var(--bg);color:var(--ink);box-shadow:var(--raised-sm);">Выбрать другое время</button>' +
      "</div>";
  }

  app.innerHTML = '<div style="padding:58px 22px 130px;">' + html + "</div>";

  Array.prototype.forEach.call(app.querySelectorAll("[data-cal-date]"), function (el) {
    el.addEventListener("click", function () {
      state.selectedDate = el.getAttribute("data-cal-date");
      state.selectedTime = null;
      state.calBookedFlag = false;
      render();
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-slot-hour]"), function (el) {
    el.addEventListener("click", function () {
      state.selectedTime = parseInt(el.getAttribute("data-slot-hour"), 10);
      render();
    });
  });
  var confirmBtn = document.getElementById("confirm-booking-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      if (state.selectedTime == null) return;
      state.calBookedFlag = true;
      submitBooking(state.selectedDate, state.selectedTime);
      render();
    });
  }

  wireActs();
  loadScheduleForMonth(vy, vm);
}

/* ---------- «Ещё» — 1:1 по дизайн-файлу, ничего сверх списка ---------- */

function renderMore() {
  var s = state;
  var items = [
    {
      label: "Тёмная тема", isToggle: true, on: s.darkMode,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 108.5 6.9 6 6 0 01-1.5.1z" stroke="var(--gray)" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "Уведомления", isToggle: true, on: s.notifOn,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1a4 4 0 00-4 4v2.5L2.5 10h11L12 7.5V5a4 4 0 00-4-4z" stroke="oklch(38% 0.06 235)" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.2 12.5a1.9 1.9 0 003.6 0" stroke="oklch(38% 0.06 235)" stroke-width="1.4" stroke-linecap="round"/></svg>',
      iconBg: "var(--soft-blue)"
    },
    {
      label: "Написать в поддержку", isLink: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H5l-3 3V3z" stroke="oklch(38% 0.1 38)" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: "var(--soft-terra)"
    },
    {
      label: "Правила и оферта", isLink: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="var(--gray)" stroke-width="1.4"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3" stroke="var(--gray)" stroke-width="1.2" stroke-linecap="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "Политика конфиденциальности", isLink: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 2v4c0 3.6-2.3 6-5.5 7-3.2-1-5.5-3.4-5.5-7v-4L8 1.5z" stroke="var(--gray)" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "О преподавателе", isLink: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--gray)" stroke-width="1.4"/><path d="M8 5.3v.1M7 7.3h1v3.5h1" stroke="var(--gray)" stroke-width="1.3" stroke-linecap="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "Сбросить и войти как другой ученик", danger: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2H3.5A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14H6M10.5 11l3-3-3-3M13 8H6" stroke="oklch(53% 0.18 25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      iconBg: "var(--soft-red)"
    }
  ];

  var itemsHtml = items.map(function (item, i) {
    var right = item.isToggle
      ? '<div class="toggle-pill' + (item.on ? " on" : "") + '"><div class="toggle-dot"></div></div>'
      : (item.isLink ? SVG.chevronRight : "");
    var color = item.danger ? "oklch(53% 0.18 25)" : "var(--ink)";
    return (
      '<div class="more-item" data-more-idx="' + i + '">' +
        '<div class="more-item-icon" style="background:' + item.iconBg + ';">' + item.icon + "</div>" +
        '<span class="more-item-label" style="color:' + color + ';">' + esc(item.label) + "</span>" +
        right +
      "</div>"
    );
  }).join("");

  app.innerHTML =
    '<div style="padding:58px 20px 130px;">' +
      '<div class="courses-title" style="margin-bottom:18px;">Ещё</div>' +
      itemsHtml +
    "</div>";

  Array.prototype.forEach.call(app.querySelectorAll("[data-more-idx]"), function (el) {
    el.addEventListener("click", function () {
      var idx = parseInt(el.getAttribute("data-more-idx"), 10);
      if (idx === 0) { toggleDarkMode(); return; }
      if (idx === 1) { state.notifOn = !state.notifOn; saveState(); render(); return; }
      if (idx === 6) { resetProgress(); return; }
      // «Написать в поддержку», «Правила и оферта», «Политика конфиденциальности»,
      // «О преподавателе» — в дизайн-файле это заглушки без содержимого, оставляю как есть.
    });
  });
  wireActs();
}

function renderComingSoon(title, icon) {
  app.innerHTML =
    '<div class="result-screen" style="padding-bottom:110px;">' +
      '<div class="result-badge">' + icon + "</div>" +
      '<div class="result-title">' + esc(title) + "</div>" +
      '<div class="result-sub">Скоро</div>' +
    "</div>";
  wireActs();
}

var DOCK_SCREENS = ["courses", "profile", "questions", "more"];

function renderDock() {
  if (DOCK_SCREENS.indexOf(state.screen) === -1) return;
  var stats = lessonStats();
  var badge = stats.completed ? '<span class="dock-badge">' + stats.completed + "</span>" : "";
  var items = [
    { screen: "profile", act: "go-profile", icon: SVG.dockPerson, label: "Кабинет" },
    { screen: "courses", act: "go-courses", icon: SVG.dockLessons, label: "Уроки", badge: badge },
    { screen: "questions", act: "go-questions", icon: SVG.dockQuestion, label: "Запись" },
    { screen: "more", act: "go-more", icon: SVG.dockMore, label: "Ещё" }
  ];
  var html = '<div class="dock">';
  items.forEach(function (it) {
    var active = state.screen === it.screen;
    var color = active ? "oklch(60% 0.13 38)" : "oklch(52% 0.012 70)";
    html += '<button class="dock-item' + (active ? " active" : "") + '" data-act="' + it.act + '">' +
      (it.badge || "") + it.icon(color) + "<span>" + it.label + "</span></button>";
  });
  html += "</div>";
  app.insertAdjacentHTML("beforeend", html);
  Array.prototype.forEach.call(app.querySelectorAll(".dock [data-act]"), function (el) {
    el.addEventListener("click", function () {
      var fn = ACTS[el.getAttribute("data-act")];
      if (fn) fn();
    });
  });
}

function stepRow(opts) {
  var dot = '<div class="step-dot" style="background:' + opts.dotBg + ';">' + opts.icon + "</div>";
  return '<div class="step-row' + (opts.locked ? " locked" : "") + '" data-act="' + opts.act + '">' +
    '<div class="step-rail">' + dot + (opts.last ? "" : '<div class="step-line"></div>') + "</div>" +
    '<div class="step-body' + (opts.last ? " last" : "") + '">' +
      '<div class="step-name' + (opts.lockedText ? " locked" : "") + '">' + opts.name + "</div>" +
      '<div class="step-sub">' + opts.sub + "</div>" +
    "</div></div>";
}

function renderLessonHome() {
  var s = state;
  var subs = LESSON.stepSubtitles;
  var pct = progressPercent();
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">' + esc(LESSON.title) + '</div><div class="top-sub">Урок 1 из ' + TOTAL_LESSONS + "</div></div>" +
    "</div>" +
    '<div class="lesson-progress-wrap">' +
      '<div class="lesson-progress-label">Прогресс урока · ' + pct + '%</div>' +
      '<div class="lesson-progress-bar"><div style="width:' + pct + '%;"></div></div>' +
    "</div>" +
    '<div class="stepper">' +
      stepRow({ act: "go-lecture", dotBg: "oklch(60% 0.13 38)", icon: SVG.stepCheck, name: "Лекция «" + esc(LESSON.title) + "»", sub: subs.lecture }) +
      stepRow({ act: "go-quiz", dotBg: s.quizDone ? "oklch(60% 0.13 38)" : "oklch(56% 0.09 235)", icon: s.quizDone ? SVG.stepCheck : SVG.doc, name: "Тест", sub: s.quizDone ? "Пройден · " + s.quizScore + "/" + LESSON.quiz.questions.length : subs.quiz }) +
      stepRow({ act: "go-warmups", locked: false, lockedText: false,
        dotBg: s.warmupsDone ? "oklch(60% 0.13 38)" : (s.quizDone ? "oklch(56% 0.09 235)" : "#fff"),
        icon: s.warmupsDone ? SVG.stepCheck : SVG.micIcon(s.quizDone ? "oklch(95% 0.014 80)" : "oklch(65% 0.01 70)"),
        name: "Распевки «" + esc(LESSON.title) + "»", sub: subs.warmups }) +
      stepRow({ act: "go-song", locked: false, lockedText: false, last: true,
        dotBg: s.songDone ? "oklch(60% 0.13 38)" : (s.warmupsDone ? "oklch(56% 0.09 235)" : "#fff"),
        icon: s.songDone ? SVG.stepCheck : SVG.notesIcon(s.warmupsDone ? "oklch(95% 0.014 80)" : "oklch(65% 0.01 70)"),
        name: "Упражнение с песней", sub: subs.song }) +
    "</div>";
  wireActs();
}

function stepHeader(title, stepNum, pct) {
  return '<div class="top">' + backBtn("back") +
      "<div><div class=\"top-title\">" + title + '</div><div class="top-sub">' + esc(LESSON.title) + " · шаг " + stepNum + ' из 4</div></div></div>' +
    '<div class="step-progress-wrap' + (pct === 50 ? " tight" : "") + '"><div class="step-progress"><div style="width:' + pct + '%;"></div></div></div>';
}

function renderLecture() {
  if (!state.lectureViewed) { state.lectureViewed = true; saveState(); }
  var html = stepHeader("Лекция «" + esc(LESSON.title) + "»", 1, 25);
  html += '<div class="lecture-body">';
  var num = 0;
  var first = true;
  LESSON.lecture.blocks.forEach(function (blk) {
    if (blk.type === "header") {
      html += '<div class="section-label' + (first ? "" : " mt") + '">' + esc(blk.text) + "</div>";
      first = false;
    } else if (blk.type === "point") {
      num++;
      html += '<div class="point"><span class="point-num">' + num + "</span><div><b>" + esc(blk.b) + "</b><p>" + esc(blk.p) + "</p></div></div>";
    } else if (blk.type === "note") {
      html += '<div class="lecture-note">' + esc(blk.text) + "</div>";
    } else if (blk.type === "para") {
      html += '<p class="lecture-para">' + esc(blk.text) + "</p>";
    }
  });
  html += "</div>";
  html += '<div class="bottom-cta"><button class="cta" data-act="go-quiz">Пройти тест</button></div>';
  app.innerHTML = html;
  wireActs();
}

function renderQuiz() {
  var s = state;
  var questions = LESSON.quiz.questions;
  var cq = questions[s.quizIndex];
  var answered = s.quizAnswers[s.quizIndex];
  var hasAnswer = answered !== null && answered !== undefined;
  var isLast = s.quizIndex === questions.length - 1;

  var optsHtml = "";
  cq.opts.forEach(function (text, i) {
    optsHtml += '<div class="quiz-opt' + (answered === i ? " sel" : "") + '" data-opt="' + i + '">' +
      '<div class="quiz-radio"></div><span>' + esc(text) + "</span></div>";
  });

  var answeredCount = s.quizAnswers.filter(function (a) { return a !== null && a !== undefined; }).length;
  var quizFrac = answeredCount / questions.length;
  var quizPct = Math.round(quizFrac * 100);

  app.innerHTML =
    stepHeader("Тест", 2, 50) +
    '<div class="quiz-body">' +
      '<div class="quiz-counter-row">' +
        '<span class="quiz-counter">Вопрос ' + (s.quizIndex + 1) + " из " + questions.length + "</span>" +
      "</div>" +
      '<div class="quiz-progress"><div style="width:' + quizPct + '%;"></div></div>' +
      '<div class="quiz-card">' +
        '<div class="quiz-q">' + esc(cq.q) + "</div>" + optsHtml +
      "</div>" +
      '<div class="quiz-ring-big-wrap">' +
        '<div class="quiz-ring-big" style="background:conic-gradient(oklch(56% 0.09 235) ' + quizPct + '%, oklch(87% 0.01 70) 0);">' +
          '<div class="quiz-ring-big-inner"><span>' + (s.quizIndex + 1) + "/" + questions.length + "</span></div>" +
        "</div>" +
      "</div>" +
    "</div>" +
    '<div class="quiz-cta-wrap"><button id="quiz-next" class="cta' + (isLast ? " terra" : "") + '"' + (hasAnswer ? "" : " disabled") + ">" + (isLast ? "Завершить" : "Далее") + "</button></div>";

  Array.prototype.forEach.call(app.querySelectorAll(".quiz-opt"), function (el) {
    el.addEventListener("click", function () {
      state.quizAnswers[state.quizIndex] = parseInt(el.getAttribute("data-opt"), 10);
      saveState();
      render();
    });
  });
  document.getElementById("quiz-next").addEventListener("click", function () {
    if (!hasAnswer) return;
    if (!isLast) { state.quizIndex++; render(); return; }
    var score = 0;
    var wrongDetails = [];
    questions.forEach(function (q, i) {
      var chosen = state.quizAnswers[i];
      if (chosen === q.correct) {
        score++;
      } else {
        wrongDetails.push({
          q: q.q,
          chosen: (chosen === null || chosen === undefined) ? "(не отвечено)" : q.opts[chosen],
          correct: q.opts[q.correct],
          explain: q.explain || ""
        });
      }
    });
    state.quizDone = true;
    state.quizScore = score;
    saveState();
    submitQuizResult(score, questions.length, wrongDetails);
    go("quiz-result");
  });
  wireActs();
}

function renderQuizResult() {
  app.innerHTML =
    '<div class="result-screen">' +
      '<div class="result-badge">' + SVG.resultCheck + "</div>" +
      '<div class="result-title">Тест пройден</div>' +
      '<div class="result-sub">Результат: ' + state.quizScore + " из " + LESSON.quiz.questions.length + "</div>" +
      '<div class="spacer"></div>' +
      '<button class="cta terra" data-act="go-warmups-free">Продолжить: распевки</button>' +
    "</div>";
  wireActs();
}

/* ---------- распевки ---------- */

function fmtTime(sec) {
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function tempoLabelText(ex, pct) {
  if (ex.bpm) {
    var cur = Math.round(ex.bpm * pct / 100);
    return cur + " / " + ex.bpm + " BPM";
  }
  return "Скорость: " + pct + "%";
}

function warmupTimeLabel(ex) {
  var playing = state.playerIdx === ex.n;
  var dur = state.durations[ex.n] || 0;
  if (playing) return fmtTime(state.playerElapsed) + " / " + fmtTime(dur);
  return dur ? fmtTime(dur) : ex.time;
}

function pitchLabelText(semis) {
  if (!semis) return "0 полутонов";
  return (semis > 0 ? "+" : "") + semis + " полут.";
}

/* ---------- Тональность: реальный питч-шифт через SoundTouchJS (Web Audio) ----------
   Тёмп (BPM) как и раньше — обычный audio.playbackRate с preservesPitch=true,
   это лёгкий нативный путь и он не трогается. Питч-шифт — отдельная, более тяжёлая
   технология (собственный аудио-движок), включается только когда ученик реально
   сдвинул тональность (не 0). Пока тональность = 0, играет привычный <audio>. */

var STJS_URL = "https://cdn.jsdelivr.net/npm/soundtouchjs@0.1.30/dist/soundtouch.js";
var stjsModulePromise = null;
function loadSoundTouch() {
  if (!stjsModulePromise) stjsModulePromise = import(STJS_URL);
  return stjsModulePromise;
}

var sharedAudioCtx = null;
function getAudioCtx() {
  if (!sharedAudioCtx) sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
  return sharedAudioCtx;
}

var audioBufferCache = {}; // n -> Promise<AudioBuffer>
function getAudioBuffer(n, ex) {
  if (!audioBufferCache[n]) {
    audioBufferCache[n] = fetch(ex.src)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { return getAudioCtx().decodeAudioData(buf); });
  }
  return audioBufferCache[n];
}

var activeShifter = null; // { n, shifter }
// «поколение» запуска движка на упражнение — каждый новый playShifted() аннулирует
// все более ранние ещё не догрузившиеся запуски того же трека (иначе при быстром
// перетаскивании слайдера тональности накапливаются параллельные запуски и звук
// накладывается друг на друга / не останавливается по паузе).
var shiftGeneration = {};

function stopShiftedPlayback(n) {
  if (n != null) shiftGeneration[n] = (shiftGeneration[n] || 0) + 1;
  if (activeShifter) {
    if (n == null) shiftGeneration[activeShifter.n] = (shiftGeneration[activeShifter.n] || 0) + 1;
    try { activeShifter.shifter.disconnect(); } catch (e) {}
    activeShifter = null;
  }
}

function playShifted(n, ex, startSeconds) {
  var pct = (state.tempoMap && state.tempoMap[n]) || 100;
  var semis = (state.pitchMap && state.pitchMap[n]) || 0;
  shiftGeneration[n] = (shiftGeneration[n] || 0) + 1;
  var myGen = shiftGeneration[n];
  getAudioBuffer(n, ex).then(function (buffer) {
    if (state.playerIdx !== n || shiftGeneration[n] !== myGen) return; // устарело — новее вызов уже перехватил
    loadSoundTouch().then(function (mod) {
      if (state.playerIdx !== n || shiftGeneration[n] !== myGen) return;
      var ctx = getAudioCtx();
      var shifter = new mod.PitchShifter(ctx, buffer, 4096, function () {
        if (shiftGeneration[n] !== myGen) return;
        handleExerciseEnded(n);
      });
      shifter.tempo = pct / 100;
      shifter.pitchSemitones = semis;
      if (startSeconds && shifter.duration) shifter.percentagePlayed = startSeconds / shifter.duration;
      shifter.on("play", function (detail) {
        if (state.playerIdx !== n || shiftGeneration[n] !== myGen) return;
        setRing(n, (detail.percentagePlayed || 0) / 100);
        state.playerElapsed = Math.floor(detail.timePlayed || 0);
        var t = document.getElementById("time-" + n);
        if (t) t.textContent = warmupTimeLabel(ex);
      });
      if (state.playerIdx !== n || shiftGeneration[n] !== myGen) { try { shifter.disconnect(); } catch (e) {} return; }
      shifter.connect(ctx.destination);
      activeShifter = { n: n, shifter: shifter };
    }).catch(function () { fallbackToNative(n, startSeconds); });
  }).catch(function () { fallbackToNative(n, startSeconds); });
}

function fallbackToNative(n, startSeconds) {
  if (state.playerIdx !== n) return;
  var el = audioEls[n];
  if (!el) return;
  el.currentTime = startSeconds || 0;
  var p = el.play();
  if (p && p.catch) p.catch(function () {});
}

function handleExerciseEnded(n) {
  var exercises = LESSON.warmups.exercises;
  var ex = exercises[n - 1];
  if (activeShifter && activeShifter.n === n) stopShiftedPlayback();
  if (state.loopMap && state.loopMap[n]) {
    state.playerIdx = null;
    toggleAudio(n);
    return;
  }
  setRing(n, 0);
  state.playerIdx = null;
  state.playerElapsed = 0;
  updatePlayBtn(ex);
  if (state.autoplayNext) {
    var next = exercises[n]; // n от 1, массив с индекса 0 — exercises[n] это следующий по счёту
    if (next) toggleAudio(next.n);
  }
}

/* ---------- избранные распевки (звезда) ---------- */

function favKey(n) {
  return (LESSON.id || 1) + "-w-" + n;
}
function toggleFavorite(n, ex) {
  var key = favKey(n);
  if (state.favorites[key]) {
    delete state.favorites[key];
  } else {
    state.favorites[key] = {
      lessonTitle: LESSON.title,
      label: ex.label1 + (ex.label2 ? " " + ex.label2 : "")
    };
  }
  saveState();
}

function warmupSettingsPanelHtml(ex) {
  var pct = (state.tempoMap && state.tempoMap[ex.n]) || 100;
  var semis = (state.pitchMap && state.pitchMap[ex.n]) || 0;
  var loopOn = !!(state.loopMap && state.loopMap[ex.n]);
  var autoOn = !!state.autoplayNext;
  var open = !!(state.openSettings && state.openSettings[ex.n]);
  return (
    '<div class="settings-panel' + (open ? " open" : "") + '" id="settings-' + ex.n + '">' +
      '<div class="settings-panel-inner">' +
        '<div class="settings-box">' +
          '<div class="settings-slider-row">' +
            '<span class="settings-slider-label">Темп</span>' +
            '<input type="range" class="tempo-slider" id="tempo-' + ex.n + '" min="50" max="100" step="5" value="' + pct + '">' +
            '<span class="settings-slider-value" id="tempo-label-' + ex.n + '">' + tempoLabelText(ex, pct) + "</span>" +
          "</div>" +
          '<div class="settings-slider-row">' +
            '<span class="settings-slider-label">Тональность</span>' +
            '<input type="range" class="pitch-slider" id="pitch-' + ex.n + '" min="-5" max="3" step="0.5" value="' + semis + '">' +
            '<span class="settings-slider-value" id="pitch-label-' + ex.n + '">' + pitchLabelText(semis) + "</span>" +
          "</div>" +
          '<div class="settings-toggle-row" data-toggle-loop="' + ex.n + '">' +
            '<span>Повтор (loop)</span>' +
            '<div class="toggle-pill' + (loopOn ? " on" : "") + '"><div class="toggle-dot"></div></div>' +
          "</div>" +
          '<div class="settings-toggle-row" data-toggle-autoplay="' + ex.n + '">' +
            '<span>Автовоспроизведение следующей</span>' +
            '<div class="toggle-pill' + (autoOn ? " on" : "") + '"><div class="toggle-dot"></div></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function renderWarmups() {
  var cards = "";
  LESSON.warmups.exercises.forEach(function (ex) {
    var isFav = !!state.favorites[favKey(ex.n)];
    cards +=
      '<div class="warmup-card">' +
        '<div class="warmup-row">' +
          '<button class="seek-btn" data-seek="-10" data-n="' + ex.n + '">' + SVG.seekBack + "</button>" +
          '<div class="player-ring-wrap">' +
            '<svg class="player-ring" viewBox="0 0 44 44"><circle class="ring-track" cx="22" cy="22" r="19"></circle><circle class="ring-progress" id="ring-' + ex.n + '" cx="22" cy="22" r="19"></circle></svg>' +
            '<button class="play-btn" id="play-' + ex.n + '" data-n="' + ex.n + '">' + SVG.play + "</button>" +
          "</div>" +
          '<button class="seek-btn" data-seek="10" data-n="' + ex.n + '">' + SVG.seekFwd + "</button>" +
          '<div class="warmup-labels">' +
            '<div class="warmup-label">' + esc(ex.label1) + "</div>" +
            (ex.label2 ? '<div class="warmup-label">' + esc(ex.label2) + "</div>" : "") +
          "</div>" +
          '<div class="warmup-time" id="time-' + ex.n + '">' + warmupTimeLabel(ex) + "</div>" +
          '<button class="icon-btn' + (isFav ? " fav-on" : "") + '" data-fav="' + ex.n + '" title="В избранное">' + SVG.star(isFav) + "</button>" +
          '<button class="icon-btn" data-gear="' + ex.n + '" title="Настройки">' + SVG.gear + "</button>" +
        "</div>" +
        warmupSettingsPanelHtml(ex) +
        '<p class="warmup-sub">' + esc(ex.sub) + "</p>" +
        (ex.how ? '<p class="warmup-how"><b>Как выполнять:</b> ' + esc(ex.how) + "</p>" : "") +
        (ex.mistake ? '<p class="warmup-mistake"><b>Частая ошибка:</b> ' + esc(ex.mistake) + "</p>" : "") +
        '<audio id="audio-' + ex.n + '" src="' + esc(ex.src) + '" preload="metadata" style="display:none;"></audio>' +
      "</div>";
  });

  app.innerHTML =
    stepHeader("Распевки «" + esc(LESSON.title) + "»", 3, 75) +
    '<div class="warmups-body">' +
      '<div class="instruction-note">' + LESSON.warmups.instruction + "</div>" +
      cards +
      '<div class="section-label" style="margin:0 0 8px;">Отправка видео</div>' +
      '<div id="hw-zone"></div>' +
    "</div>" +
    '<div class="bottom-cta" style="padding-top:0;"><button class="cta" data-act="finish-warmups">Продолжить: упражнение с песней</button></div>';

  LESSON.warmups.exercises.forEach(function (ex) {
    var el = document.getElementById("audio-" + ex.n);
    audioEls[ex.n] = el;
    // Замедление без "плывущего" питча — держим исходную тональность упражнения.
    el.preservesPitch = true;
    el.mozPreservesPitch = true;
    el.webkitPreservesPitch = true;
    el.playbackRate = ((state.tempoMap && state.tempoMap[ex.n]) || 100) / 100;
    el.addEventListener("loadedmetadata", function () {
      state.durations[ex.n] = Math.round(el.duration) || 0;
      var t = document.getElementById("time-" + ex.n);
      if (t) t.textContent = warmupTimeLabel(ex);
    });
    el.addEventListener("timeupdate", function () {
      if (el.duration) setRing(ex.n, el.currentTime / el.duration);
      if (state.playerIdx === ex.n) {
        state.playerElapsed = Math.floor(el.currentTime);
        var t = document.getElementById("time-" + ex.n);
        if (t) t.textContent = warmupTimeLabel(ex);
      }
    });
    el.addEventListener("ended", function () { handleExerciseEnded(ex.n); });

    var tempoSlider = document.getElementById("tempo-" + ex.n);
    tempoSlider.addEventListener("input", function () {
      var pct = parseInt(tempoSlider.value, 10);
      state.tempoMap[ex.n] = pct;
      el.playbackRate = pct / 100;
      if (activeShifter && activeShifter.n === ex.n) activeShifter.shifter.tempo = pct / 100;
      var lbl = document.getElementById("tempo-label-" + ex.n);
      if (lbl) lbl.textContent = tempoLabelText(ex, pct);
      saveState();
    });

    var pitchSlider = document.getElementById("pitch-" + ex.n);
    pitchSlider.addEventListener("input", function () {
      var semis = parseFloat(pitchSlider.value);
      state.pitchMap[ex.n] = semis;
      var lbl = document.getElementById("pitch-label-" + ex.n);
      if (lbl) lbl.textContent = pitchLabelText(semis);
      saveState();

      if (state.playerIdx !== ex.n) return; // трек сейчас не играет — применится при следующем запуске
      if (activeShifter && activeShifter.n === ex.n) {
        if (semis) {
          activeShifter.shifter.pitchSemitones = semis; // движок уже включён — просто обновляем на лету
        } else {
          // тональность вернули на 0 — переключаемся обратно на обычное аудио с той же позиции
          var pos = activeShifter.shifter.timePlayed || 0;
          stopShiftedPlayback();
          if (el) { el.currentTime = pos; var p = el.play(); if (p && p.catch) p.catch(function () {}); }
        }
      } else if (semis) {
        // сейчас играет обычное аудио — подключаем движок с той же позиции
        var pos2 = el ? el.currentTime : 0;
        if (el) el.pause();
        getAudioCtx();
        playShifted(ex.n, ex, pos2);
      }
    });
  });

  Array.prototype.forEach.call(app.querySelectorAll(".play-btn"), function (btn) {
    btn.addEventListener("click", function () {
      var n = parseInt(btn.getAttribute("data-n"), 10);
      toggleAudio(n);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll(".seek-btn"), function (btn) {
    btn.addEventListener("click", function () {
      var n = parseInt(btn.getAttribute("data-n"), 10);
      var delta = parseInt(btn.getAttribute("data-seek"), 10);
      var ex = LESSON.warmups.exercises[n - 1];
      if (activeShifter && activeShifter.n === n) {
        var sh = activeShifter.shifter;
        var dur = sh.duration || 1;
        var newSec = Math.max(0, Math.min(dur, sh.timePlayed + delta));
        sh.percentagePlayed = newSec / dur; // сеттер этой библиотеки ждёт долю 0..1, а не проценты
        if (state.playerIdx === n) {
          state.playerElapsed = Math.floor(newSec);
          setRing(n, newSec / dur);
          var t1 = document.getElementById("time-" + n);
          if (t1) t1.textContent = warmupTimeLabel(ex);
        }
        return;
      }
      var el = audioEls[n];
      if (!el) return;
      if (delta < 0) el.currentTime = Math.max(0, el.currentTime + delta);
      else el.currentTime = Math.min(el.duration || el.currentTime + delta, el.currentTime + delta);
      if (state.playerIdx === n) {
        state.playerElapsed = Math.floor(el.currentTime);
        var t2 = document.getElementById("time-" + n);
        if (t2) t2.textContent = warmupTimeLabel(ex);
      }
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-gear]"), function (btn) {
    btn.addEventListener("click", function () {
      var n = btn.getAttribute("data-gear");
      state.openSettings[n] = !state.openSettings[n];
      var panel = document.getElementById("settings-" + n);
      if (panel) panel.classList.toggle("open", !!state.openSettings[n]);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-fav]"), function (btn) {
    btn.addEventListener("click", function () {
      var n = parseInt(btn.getAttribute("data-fav"), 10);
      var ex = LESSON.warmups.exercises[n - 1];
      toggleFavorite(n, ex);
      var isFav = !!state.favorites[favKey(n)];
      btn.classList.toggle("fav-on", isFav);
      btn.innerHTML = SVG.star(isFav);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-toggle-loop]"), function (row) {
    row.addEventListener("click", function () {
      var n = row.getAttribute("data-toggle-loop");
      state.loopMap[n] = !state.loopMap[n];
      row.querySelector(".toggle-pill").classList.toggle("on", !!state.loopMap[n]);
      saveState();
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-toggle-autoplay]"), function (row) {
    row.addEventListener("click", function () {
      state.autoplayNext = !state.autoplayNext;
      Array.prototype.forEach.call(app.querySelectorAll("[data-toggle-autoplay] .toggle-pill"), function (p) {
        p.classList.toggle("on", state.autoplayNext);
      });
      saveState();
    });
  });

  renderHwZone();
  wireActs();
}

var RING_CIRC = 2 * Math.PI * 19;

function setRing(n, frac) {
  var ring = document.getElementById("ring-" + n);
  if (!ring) return;
  ring.style.strokeDasharray = RING_CIRC;
  ring.style.strokeDashoffset = RING_CIRC * (1 - Math.max(0, Math.min(1, frac || 0)));
}

function updatePlayBtn(ex) {
  var btn = document.getElementById("play-" + ex.n);
  var t = document.getElementById("time-" + ex.n);
  if (!btn) return;
  var playing = state.playerIdx === ex.n;
  btn.className = "play-btn" + (playing ? " playing" : "");
  btn.innerHTML = playing ? SVG.pause : SVG.play;
  if (t) t.textContent = warmupTimeLabel(ex);
}

function toggleAudio(n) {
  var exercises = LESSON.warmups.exercises;
  var ex = exercises[n - 1];
  if (!ex) return;

  if (state.playerIdx === n) {
    stopShiftedPlayback(n);
    var curEl = audioEls[n];
    if (curEl) curEl.pause();
    state.playerIdx = null;
    updatePlayBtn(ex);
    return;
  }

  var prev = state.playerIdx;
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  if (prev != null) stopShiftedPlayback(prev);

  state.playerIdx = n;
  state.playerElapsed = 0;

  // Обычное аудио по умолчанию — надёжно играет всегда, в т.ч. если телефон
  // в беззвучном режиме (Web Audio API там иногда молчит). Более тяжёлый
  // движок с питч-шифтом включаем только когда тональность реально сдвинута —
  // и умеем на лету подключать/отключать его без остановки трека (см. слайдер).
  var semis = (state.pitchMap && state.pitchMap[n]) || 0;
  if (semis) {
    getAudioCtx();
    playShifted(n, ex);
  } else {
    var el = audioEls[n];
    if (el) {
      el.currentTime = 0;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  if (prev) updatePlayBtn(exercises[prev - 1]);
  updatePlayBtn(ex);
}

/* зона отправки видео (перерисовывается отдельно, не трогая аудио) */

var MAX_VIDEOS = 5;

function finalizeWarmupUpload(blob, filename) {
  if (state.warmupFiles.length >= MAX_VIDEOS) return;
  var item = { name: filename, blob: blob, status: "idle" };
  state.warmupFiles.push(item);
  saveState();
  if (blob.size > MAX_UPLOAD_BYTES) {
    item.status = "toolarge";
    renderHwZone();
    maybeCelebrate();
    return;
  }
  item.status = "sending";
  renderHwZone();
  maybeCelebrate();
  readVideoMeta(blob).then(function (meta) {
    submitFile("warmup", blob, function (status) {
      item.status = status;
      renderHwZone();
    }, filename, meta);
  });
}

function warmupHint(item) {
  if (item.status === "sending") return "Отправляю преподавателю…";
  if (item.status === "sent") return "Отправлено преподавателю ✓";
  if (item.status === "error") return "Не отправилось — нажми «Повторить»";
  if (item.status === "toolarge") return "Файл большой — сервер такое не пропустит. Отправь это видео преподавателю прямо в чат с ботом";
  return "Видео прикреплено";
}

function renderHwZone() {
  var zone = document.getElementById("hw-zone");
  if (!zone) return;
  var s = state;
  var count = s.warmupFiles.length;

  var listHtml = s.warmupFiles.map(function (item, idx) {
    var hint = warmupHint(item);
    var isErr = item.status === "error" || item.status === "toolarge";
    return (
      '<div class="hw-attached">' +
        '<div class="hw-icon">' + SVG.hwCheck + "</div>" +
        '<div style="flex:1;">' +
          '<div class="hw-name">' + esc(item.name) + "</div>" +
          '<div class="hw-hint' + (isErr ? " error" : "") + '">' + hint + "</div>" +
        "</div>" +
        (item.status === "error" ? '<button class="hw-replace" data-retry-idx="' + idx + '">Повторить</button>' : "") +
        '<button class="hw-replace" data-remove-idx="' + idx + '">Убрать</button>' +
      "</div>" +
      (item.status === "toolarge" ? '<button class="cta" data-opentg-idx="' + idx + '" style="margin:-8px 0 12px;">Открыть чат с ботом в Telegram</button>' : "")
    );
  }).join("");

  var uploadHtml = count < MAX_VIDEOS
    ? '<div class="instruction-note">Сними видео обычной камерой телефона — без ограничений по качеству (Full HD 1080p и выше) и по длительности. Можно прикрепить до ' + MAX_VIDEOS + ' видео.</div>' +
      '<div class="hw-choice">' +
        '<label class="hw-upload wide"><input type="file" accept="video/*" multiple id="hw-file" style="display:none;">' + SVG.upload + "Прикрепить видео (" + count + "/" + MAX_VIDEOS + ")</label>" +
      "</div>"
    : '<div class="instruction-note">Прикреплено максимум видео — ' + MAX_VIDEOS + ".</div>";

  zone.innerHTML = listHtml + uploadHtml;

  Array.prototype.forEach.call(zone.querySelectorAll("[data-remove-idx]"), function (btn) {
    btn.addEventListener("click", function () {
      state.warmupFiles.splice(parseInt(btn.getAttribute("data-remove-idx"), 10), 1);
      saveState();
      renderHwZone();
      maybeCelebrate();
    });
  });
  Array.prototype.forEach.call(zone.querySelectorAll("[data-retry-idx]"), function (btn) {
    btn.addEventListener("click", function () {
      var item = state.warmupFiles[parseInt(btn.getAttribute("data-retry-idx"), 10)];
      if (!item || !item.blob) return;
      item.status = "sending";
      renderHwZone();
      readVideoMeta(item.blob).then(function (meta) {
        submitFile("warmup", item.blob, function (status) {
          item.status = status;
          renderHwZone();
        }, item.name, meta);
      });
    });
  });
  Array.prototype.forEach.call(zone.querySelectorAll("[data-opentg-idx]"), function (btn) {
    btn.addEventListener("click", openTeacherChat);
  });

  var input = document.getElementById("hw-file");
  if (input) {
    input.addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      files.forEach(function (f) {
        if (state.warmupFiles.length >= MAX_VIDEOS) return;
        finalizeWarmupUpload(f, f.name);
      });
    });
  }
}

function stopAllMedia() {
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  audioEls = {};
  stopShiftedPlayback();
  state.playerIdx = null;
  state.playerElapsed = 0;
  Object.keys(songAudioEls).forEach(function (k) { if (songAudioEls[k]) songAudioEls[k].pause(); });
  songAudioEls = {};
  stopSongShiftedPlayback();
  state.songPlayerKey = null;
  state.songPlayerElapsed = 0;
}

/* ---------- упражнение с песней ---------- */

function markCircle(mark, cls) {
  return '<span class="' + cls + " " + (mark === "V" ? "deep" : "short") + '">' + mark + "</span>";
}

function songSettingsPanelHtml(ti, track) {
  var pct = (state.songTempoMap && state.songTempoMap[ti]) || 100;
  var semis = (state.songPitchMap && state.songPitchMap[ti]) || 0;
  var loopOn = !!(state.songLoopMap && state.songLoopMap[ti]);
  var autoOn = !!state.songAutoplayNext;
  var open = !!(state.songOpenSettings && state.songOpenSettings[ti]);
  return (
    '<div class="settings-panel' + (open ? " open" : "") + '" id="song-settings-' + ti + '">' +
      '<div class="settings-panel-inner">' +
        '<div class="settings-box">' +
          '<div class="settings-slider-row">' +
            '<span class="settings-slider-label">Темп</span>' +
            '<input type="range" class="tempo-slider" id="song-tempo-' + ti + '" min="50" max="100" step="5" value="' + pct + '">' +
            '<span class="settings-slider-value" id="song-tempo-label-' + ti + '">' + tempoLabelText(track, pct) + "</span>" +
          "</div>" +
          '<div class="settings-slider-row">' +
            '<span class="settings-slider-label">Тональность</span>' +
            '<input type="range" class="pitch-slider" id="song-pitch-' + ti + '" min="-5" max="3" step="0.5" value="' + semis + '">' +
            '<span class="settings-slider-value" id="song-pitch-label-' + ti + '">' + pitchLabelText(semis) + "</span>" +
          "</div>" +
          '<div class="settings-toggle-row" data-song-toggle-loop="' + ti + '">' +
            '<span>Повтор (loop)</span>' +
            '<div class="toggle-pill' + (loopOn ? " on" : "") + '"><div class="toggle-dot"></div></div>' +
          "</div>" +
          '<div class="settings-toggle-row" data-song-toggle-autoplay="' + ti + '">' +
            '<span>Автовоспроизведение следующего трека</span>' +
            '<div class="toggle-pill' + (autoOn ? " on" : "") + '"><div class="toggle-dot"></div></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

/* ---------- фото ДЗ упражнения с песней: до 5 файлов, как в распевках ---------- */

var MAX_PHOTOS = 5;

function songPhotoHint(item) {
  if (item.status === "sending") return "Отправляю преподавателю…";
  if (item.status === "sent") return "Отправлено преподавателю ✓";
  if (item.status === "error") return "Не отправилось — нажми «Повторить»";
  if (item.status === "toolarge") return "Файл большой — сервер такое не пропустит. Отправь это фото преподавателю прямо в чат с ботом";
  return "Фото прикреплено";
}

function finalizeSongPhotoUpload(blob, filename) {
  if (state.songFiles.length >= MAX_PHOTOS) return;
  var item = { name: filename, blob: blob, status: "idle" };
  state.songFiles.push(item);
  saveState();
  if (blob.size > MAX_UPLOAD_BYTES) {
    item.status = "toolarge";
    renderSongPhotoZone();
    maybeCelebrate();
    return;
  }
  item.status = "sending";
  renderSongPhotoZone();
  maybeCelebrate();
  submitFile("song", blob, function (status) {
    item.status = status;
    renderSongPhotoZone();
  }, filename);
}

function renderSongPhotoZone() {
  var zone = document.getElementById("song-hw-zone");
  if (!zone) return;
  var s = state;
  var count = s.songFiles.length;

  var listHtml = s.songFiles.map(function (item, idx) {
    var hint = songPhotoHint(item);
    var isErr = item.status === "error" || item.status === "toolarge";
    return (
      '<div class="hw-attached">' +
        '<div class="hw-icon terra">' + SVG.hwCheck + "</div>" +
        '<div style="flex:1;">' +
          '<div class="hw-name">' + esc(item.name) + "</div>" +
          '<div class="hw-hint' + (isErr ? " error" : "") + '">' + hint + "</div>" +
        "</div>" +
        (item.status === "error" ? '<button class="hw-replace" data-song-retry-idx="' + idx + '">Повторить</button>' : "") +
        '<button class="hw-replace" data-song-remove-idx="' + idx + '">Убрать</button>' +
      "</div>" +
      (item.status === "toolarge" ? '<button class="cta" data-song-opentg-idx="' + idx + '" style="margin:-8px 0 12px;">Открыть чат с ботом в Telegram</button>' : "")
    );
  }).join("");

  var uploadHtml = count < MAX_PHOTOS
    ? '<div class="instruction-note">Сфотографируй лист с разметкой. Можно прикрепить до ' + MAX_PHOTOS + ' фото.</div>' +
      '<div class="hw-choice">' +
        '<label class="hw-upload wide"><input type="file" accept="image/*" multiple id="song-hw-file" style="display:none;">' + SVG.uploadTerra + "Прикрепить фото (" + count + "/" + MAX_PHOTOS + ")</label>" +
      "</div>"
    : '<div class="instruction-note">Прикреплено максимум фото — ' + MAX_PHOTOS + ".</div>";

  zone.innerHTML = listHtml + uploadHtml;

  Array.prototype.forEach.call(zone.querySelectorAll("[data-song-remove-idx]"), function (btn) {
    btn.addEventListener("click", function () {
      state.songFiles.splice(parseInt(btn.getAttribute("data-song-remove-idx"), 10), 1);
      saveState();
      renderSongPhotoZone();
      maybeCelebrate();
    });
  });
  Array.prototype.forEach.call(zone.querySelectorAll("[data-song-retry-idx]"), function (btn) {
    btn.addEventListener("click", function () {
      var item = state.songFiles[parseInt(btn.getAttribute("data-song-retry-idx"), 10)];
      if (!item || !item.blob) return;
      item.status = "sending";
      renderSongPhotoZone();
      submitFile("song", item.blob, function (status) {
        item.status = status;
        renderSongPhotoZone();
      }, item.name);
    });
  });
  Array.prototype.forEach.call(zone.querySelectorAll("[data-song-opentg-idx]"), function (btn) {
    btn.addEventListener("click", openTeacherChat);
  });

  var input = document.getElementById("song-hw-file");
  if (input) {
    input.addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      files.forEach(function (f) {
        if (state.songFiles.length >= MAX_PHOTOS) return;
        finalizeSongPhotoUpload(f, f.name);
      });
    });
  }
}

/* сегменты для статичного примера: {t:"текст"} или {mark:"V"|"v"} */
function renderLineSegments(segments) {
  var html = "";
  segments.forEach(function (seg) {
    html += seg.t !== undefined ? esc(seg.t) : markCircle(seg.mark, "mark-circle");
  });
  return html;
}

function songTimeLabel(idx) {
  var playing = state.songPlayerKey === idx;
  var dur = state.songDurations[idx] || 0;
  if (playing) return fmtTime(state.songPlayerElapsed) + " / " + fmtTime(dur);
  return dur ? fmtTime(dur) : "";
}

function updateSongPlayBtn(idx) {
  var btn = document.getElementById("song-play-" + idx);
  var t = document.getElementById("song-time-" + idx);
  if (!btn) return;
  var playing = state.songPlayerKey === idx;
  btn.className = "play-btn" + (playing ? " playing" : "");
  btn.innerHTML = playing ? SVG.pause : SVG.play;
  if (t) t.textContent = songTimeLabel(idx);
}

/* ---------- плеер песни: тот же движок, что и в распевках (свой неймспейс) ---------- */

var songAudioBufferCache = {}; // ti -> Promise<AudioBuffer>
function getSongAudioBuffer(ti, track) {
  if (!songAudioBufferCache[ti]) {
    songAudioBufferCache[ti] = fetch(track.audio)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { return getAudioCtx().decodeAudioData(buf); });
  }
  return songAudioBufferCache[ti];
}

var activeSongShifter = null; // { ti, shifter }
var songShiftGeneration = {}; // то же самое «поколение» вызовов, что и в распевках — см. shiftGeneration

function stopSongShiftedPlayback(ti) {
  if (ti != null) songShiftGeneration[ti] = (songShiftGeneration[ti] || 0) + 1;
  if (activeSongShifter) {
    if (ti == null) songShiftGeneration[activeSongShifter.ti] = (songShiftGeneration[activeSongShifter.ti] || 0) + 1;
    try { activeSongShifter.shifter.disconnect(); } catch (e) {}
    activeSongShifter = null;
  }
}

function playSongShifted(ti, track, startSeconds) {
  var pct = (state.songTempoMap && state.songTempoMap[ti]) || 100;
  var semis = (state.songPitchMap && state.songPitchMap[ti]) || 0;
  songShiftGeneration[ti] = (songShiftGeneration[ti] || 0) + 1;
  var myGen = songShiftGeneration[ti];
  getSongAudioBuffer(ti, track).then(function (buffer) {
    if (state.songPlayerKey !== ti || songShiftGeneration[ti] !== myGen) return;
    loadSoundTouch().then(function (mod) {
      if (state.songPlayerKey !== ti || songShiftGeneration[ti] !== myGen) return;
      var ctx = getAudioCtx();
      var shifter = new mod.PitchShifter(ctx, buffer, 4096, function () {
        if (songShiftGeneration[ti] !== myGen) return;
        handleSongTrackEnded(ti);
      });
      shifter.tempo = pct / 100;
      shifter.pitchSemitones = semis;
      if (startSeconds && shifter.duration) shifter.percentagePlayed = startSeconds / shifter.duration;
      shifter.on("play", function (detail) {
        if (state.songPlayerKey !== ti || songShiftGeneration[ti] !== myGen) return;
        setRing("song-" + ti, (detail.percentagePlayed || 0) / 100);
        state.songPlayerElapsed = Math.floor(detail.timePlayed || 0);
        var t = document.getElementById("song-time-" + ti);
        if (t) t.textContent = songTimeLabel(ti);
      });
      if (state.songPlayerKey !== ti || songShiftGeneration[ti] !== myGen) { try { shifter.disconnect(); } catch (e) {} return; }
      shifter.connect(ctx.destination);
      activeSongShifter = { ti: ti, shifter: shifter };
    }).catch(function () { fallbackToNativeSong(ti, startSeconds); });
  }).catch(function () { fallbackToNativeSong(ti, startSeconds); });
}

function fallbackToNativeSong(ti, startSeconds) {
  if (state.songPlayerKey !== ti) return;
  var el = songAudioEls[ti];
  if (!el) return;
  el.currentTime = startSeconds || 0;
  var p = el.play();
  if (p && p.catch) p.catch(function () {});
}

function handleSongTrackEnded(ti) {
  var track = LESSON.song.tracks[ti];
  if (activeSongShifter && activeSongShifter.ti === ti) stopSongShiftedPlayback();
  if (state.songLoopMap && state.songLoopMap[ti]) {
    state.songPlayerKey = null;
    toggleSongAudio(ti);
    return;
  }
  setRing("song-" + ti, 0);
  state.songPlayerKey = null;
  state.songPlayerElapsed = 0;
  updateSongPlayBtn(ti);
  if (state.songAutoplayNext) {
    var next = LESSON.song.tracks[ti + 1];
    if (next) toggleSongAudio(ti + 1);
  }
}

function toggleSongAudio(ti) {
  var track = LESSON.song.tracks[ti];
  if (!track) return;

  if (state.songPlayerKey === ti) {
    stopSongShiftedPlayback(ti);
    var curEl = songAudioEls[ti];
    if (curEl) curEl.pause();
    state.songPlayerKey = null;
    updateSongPlayBtn(ti);
    return;
  }

  var prev = state.songPlayerKey;
  Object.keys(songAudioEls).forEach(function (k) { if (songAudioEls[k]) songAudioEls[k].pause(); });
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  if (prev != null && prev !== undefined) stopSongShiftedPlayback(prev);
  stopShiftedPlayback();

  state.songPlayerKey = ti;
  state.songPlayerElapsed = 0;

  // Обычное аудио по умолчанию (надёжно играет всегда), движок с питч-шифтом —
  // только если тональность реально сдвинута. См. toggleAudio в распевках — то же самое.
  var semis = (state.songPitchMap && state.songPitchMap[ti]) || 0;
  if (semis) {
    getAudioCtx();
    playSongShifted(ti, track);
  } else {
    var el = songAudioEls[ti];
    if (el) {
      el.currentTime = 0;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  if (prev !== null && prev !== undefined) updateSongPlayBtn(prev);
  updateSongPlayBtn(ti);
}

function songFavKey(ti) {
  return (LESSON.id || 1) + "-s-" + ti;
}
function toggleSongFavorite(ti, track) {
  var key = songFavKey(ti);
  if (state.favorites[key]) {
    delete state.favorites[key];
  } else {
    state.favorites[key] = { lessonTitle: LESSON.title, label: track.title };
  }
  saveState();
}

/* ---- посимвольная разметка (свободная расстановка меток) ---- */

function lineKey(ti, li) { return ti + "-" + li; }

function getLineMarks(ti, li) {
  var key = lineKey(ti, li);
  if (!state.songPlacements[key]) state.songPlacements[key] = [];
  return state.songPlacements[key];
}

function trackAttempted(ti, track) {
  return track.lines.every(function (line, li) { return getLineMarks(ti, li).length > 0; });
}

function trackCorrectness(ti, track) {
  return track.lines.map(function (line, li) {
    var placed = getLineMarks(ti, li).map(function (m) { return m.type + ":" + m.index; }).sort();
    var correct = line.correct.map(function (m) { return m.type + ":" + m.index; }).sort();
    return placed.length === correct.length && placed.every(function (v, i) { return v === correct[i]; });
  });
}

/* текстовое превью строки со вставленными метками — для отчёта преподавателю */
function markedTextPreview(text, marks) {
  var sorted = marks.slice().sort(function (a, b) { return a.index - b.index; });
  var out = "";
  var pos = 0;
  sorted.forEach(function (m) {
    out += text.slice(pos, m.index) + "[" + m.type + "]";
    pos = m.index;
  });
  out += text.slice(pos);
  return out;
}

function renderChars(text, from, to, ti, li) {
  var html = "";
  for (var i = from; i < to; i++) {
    html += '<span class="song-char" data-ti="' + ti + '" data-li="' + li + '" data-pos="' + i + '">' + esc(text[i]) + "</span>";
  }
  return html;
}

function renderInteractiveLine(ti, li, text) {
  var marks = getLineMarks(ti, li);
  var sorted = marks.map(function (m, i) { return { type: m.type, index: m.index, _idx: i }; })
    .sort(function (a, b) { return a.index - b.index; });
  var html = '<div class="song-text-line">';
  var pos = 0;
  sorted.forEach(function (m) {
    html += renderChars(text, pos, m.index, ti, li);
    html += '<span class="song-mark-badge ' + (m.type === "V" ? "deep" : "short") +
      '" draggable="true" data-ti="' + ti + '" data-li="' + li + '" data-idx="' + m._idx + '">' + m.type + "</span>";
    pos = m.index;
  });
  html += renderChars(text, pos, text.length, ti, li);
  html += '<span class="song-char song-end" data-ti="' + ti + '" data-li="' + li + '" data-pos="' + text.length + '">&nbsp;</span>';
  html += "</div>";
  return html;
}

function renderReferenceLine(text, correct) {
  var sorted = correct.slice().sort(function (a, b) { return a.index - b.index; });
  var html = "";
  var pos = 0;
  sorted.forEach(function (m) {
    html += esc(text.slice(pos, m.index)) + markCircle(m.type, "mark-circle");
    pos = m.index;
  });
  html += esc(text.slice(pos));
  return html;
}

function placeMark(ti, li, index, type) {
  getLineMarks(ti, li).push({ type: type, index: index });
  saveState();
  render();
}

function submitSongMarks() {
  var lines = [];
  LESSON.song.tracks.forEach(function (track, ti) {
    if (!trackAttempted(ti, track)) {
      lines.push(track.title + ": попытка не завершена");
      return;
    }
    var correctness = trackCorrectness(ti, track);
    var ok = correctness.filter(Boolean).length;
    lines.push(track.title + ": " + ok + "/" + correctness.length + " строк совпадает");
    if (ok < correctness.length) {
      track.lines.forEach(function (line, li) {
        if (correctness[li]) return;
        var placed = getLineMarks(ti, li);
        lines.push(
          "   ❌ Строка: «" + line.text + "»\n" +
          "      Отметил ученик: " + markedTextPreview(line.text, placed) + "\n" +
          "      Правильно: " + markedTextPreview(line.text, line.correct)
        );
      });
    }
  });
  var f = baseSubmitFields();
  f.append("kind", "song-marks");
  f.append("text", lines.join("\n"));
  fetch("/api/submit", { method: "POST", body: f }).catch(function () {});
}

/* ---------- обратная связь после урока ---------- */

var MOODS = [
  { v: 1, emoji: "😞", label: "Было сложно" },
  { v: 2, emoji: "😐", label: "Не очень" },
  { v: 3, emoji: "🙂", label: "Нормально" },
  { v: 4, emoji: "😊", label: "Хорошо" },
  { v: 5, emoji: "🤩", label: "Отлично" }
];

function submitFeedback(moodValue, moodLabel, text) {
  var f = baseSubmitFields();
  f.append("kind", "feedback");
  f.append("mood", moodValue);
  f.append("moodLabel", moodLabel);
  f.append("text", text || "");
  fetch("/api/submit", { method: "POST", body: f }).catch(function () {});
}

function renderFeedback() {
  var s = state;
  var moodsHtml = MOODS.map(function (m) {
    var sel = s.feedbackMood === m.v;
    return '<button class="mood-btn' + (sel ? " sel" : "") + '" data-mood="' + m.v + '">' + m.emoji + "</button>";
  }).join("");
  var label = "";
  MOODS.forEach(function (m) { if (m.v === s.feedbackMood) label = m.label; });

  app.innerHTML =
    '<div class="auth-screen" style="padding-top:58px;">' +
      '<div class="auth-title">Как прошёл урок?</div>' +
      '<div class="auth-sub">Домашнее задание выполнено. Оцени, как всё прошло — это поможет сделать курс лучше.</div>' +
      '<div class="mood-row">' + moodsHtml + "</div>" +
      '<div class="mood-label">' + esc(label) + "</div>" +
      '<label class="field-label">РЕКОМЕНДАЦИИ И ПОЖЕЛАНИЯ (необязательно)</label>' +
      '<textarea id="feedback-text" class="feedback-textarea" placeholder="Что понравилось, что было сложно, чего не хватило...">' + esc(s.feedbackText || "") + "</textarea>" +
      '<div class="spacer"></div>' +
      '<button class="cta" id="feedback-submit"' + (s.feedbackMood ? "" : " disabled") + ' style="margin-top:16px;">Отправить и завершить</button>' +
    "</div>";

  Array.prototype.forEach.call(app.querySelectorAll(".mood-btn"), function (btn) {
    btn.addEventListener("click", function () {
      state.feedbackMood = parseInt(btn.getAttribute("data-mood"), 10);
      render();
    });
  });
  var ta = document.getElementById("feedback-text");
  ta.addEventListener("input", function () { state.feedbackText = ta.value; });
  document.getElementById("feedback-submit").addEventListener("click", function () {
    if (!state.feedbackMood) return;
    var m = MOODS.filter(function (mm) { return mm.v === state.feedbackMood; })[0];
    submitFeedback(state.feedbackMood, m ? m.label : "", state.feedbackText || "");
    state.feedbackMood = null;
    state.feedbackText = "";
    go("lesson-home");
  });
  wireActs();
}

function renderSong() {
  var s = state;
  var song = LESSON.song;

  var exampleHtml = renderLineSegments(song.example);

  var tracksHtml = "";
  song.tracks.forEach(function (track, ti) {
    var attempted = trackAttempted(ti, track);
    var revealed = !!s.songRevealed[ti];
    var correctness = revealed ? trackCorrectness(ti, track) : null;
    var sel = s.songSelectedMark[ti];

    var linesHtml = "";
    track.lines.forEach(function (line, li) {
      var cls = "song-line-card mb10";
      if (correctness) cls += correctness[li] ? " line-correct" : " line-wrong";
      linesHtml += '<div class="' + cls + '">' + renderInteractiveLine(ti, li, line.text) + "</div>";
      if (revealed) {
        linesHtml += '<div class="song-reference">Правильно: ' + renderReferenceLine(line.text, line.correct) + "</div>";
      }
    });

    var isSongFav = !!state.favorites[songFavKey(ti)];
    tracksHtml +=
      '<div class="song-track">' +
        '<div class="song-track-title">' + esc(track.title) + "</div>" +
        '<div class="warmup-row song-player-row">' +
          '<button class="seek-btn" data-song-seek="-10" data-ti="' + ti + '">' + SVG.seekBack + "</button>" +
          '<div class="player-ring-wrap">' +
            '<svg class="player-ring" viewBox="0 0 44 44"><circle class="ring-track" cx="22" cy="22" r="19"></circle><circle class="ring-progress" id="ring-song-' + ti + '" cx="22" cy="22" r="19"></circle></svg>' +
            '<button class="play-btn" id="song-play-' + ti + '" data-ti="' + ti + '">' + SVG.play + "</button>" +
          "</div>" +
          '<button class="seek-btn" data-song-seek="10" data-ti="' + ti + '">' + SVG.seekFwd + "</button>" +
          '<div class="warmup-time" id="song-time-' + ti + '" style="flex:1;">' + songTimeLabel(ti) + "</div>" +
          '<button class="icon-btn' + (isSongFav ? " fav-on" : "") + '" data-song-fav="' + ti + '" title="В избранное">' + SVG.star(isSongFav) + "</button>" +
          '<button class="icon-btn" data-song-gear="' + ti + '" title="Настройки">' + SVG.gear + "</button>" +
        "</div>" +
        songSettingsPanelHtml(ti, track) +
        '<audio id="song-audio-' + ti + '" src="' + esc(track.audio) + '" preload="metadata" style="display:none;"></audio>' +
        '<div class="chips-row">' +
          '<div class="chip drag-chip' + (sel === "V" ? " sel-V" : "") + '" id="chip-V-' + ti + '" draggable="true" data-ti="' + ti + '" data-mark="V">' + markCircle("V", "mark-circle") + "глубокий</div>" +
          '<div class="chip drag-chip' + (sel === "v" ? " sel-v" : "") + '" id="chip-v-' + ti + '" draggable="true" data-ti="' + ti + '" data-mark="v">' + markCircle("v", "mark-circle") + "короткий</div>" +
        "</div>" +
        linesHtml +
        (attempted
          ? '<button class="reveal-link" data-ti="' + ti + '">' + (revealed ? "Скрыть правильный вариант" : "Показать правильный вариант") + "</button>"
          : '<div class="reveal-locked">Расставь метки во всех строках, чтобы открыть правильный вариант</div>') +
      "</div>";
  });

  app.innerHTML =
    stepHeader("Упражнение с песней", 4, 100) +
    '<div class="song-body">' +
      '<div class="legend-row">' +
        '<div class="legend-item">' + markCircle("V", "mark-circle") + "глубокий вдох</div>" +
        '<div class="legend-item">' + markCircle("v", "mark-circle") + "короткий вдох</div>" +
      "</div>" +
      '<div class="song-hint">' + esc(song.hint) + "</div>" +
      '<div class="section-label" style="margin-top:0;">Пример разметки</div>' +
      '<div class="song-line-card">' + exampleHtml + "</div>" +
      '<div class="song-hint">' + esc(song.practiceHint) + " Значок можно перетащить (на компьютере) или выбрать и коснуться места в тексте (на телефоне) — в любую точку, даже внутри слова." + "</div>" +
      tracksHtml +
      '<div class="section-label" style="margin:8px 0;">Отправка разметки</div>' +
      '<div id="song-hw-zone"></div>' +
    "</div>" +
    '<div class="final-cta-wrap"><button class="cta terra" data-act="finish-lesson">Завершить урок</button></div>';

  /* палитра: тап-выбор (мобильный сценарий) + перетаскивание (десктоп) */
  var justDragged = {};
  song.tracks.forEach(function (track, ti) {
    ["V", "v"].forEach(function (mark) {
      var chip = document.getElementById("chip-" + mark + "-" + ti);
      if (!chip) return;
      chip.addEventListener("click", function () {
        if (justDragged[ti]) { justDragged[ti] = false; return; }
        state.songSelectedMark[ti] = state.songSelectedMark[ti] === mark ? null : mark;
        render();
      });
      chip.addEventListener("dragstart", function (e) {
        justDragged[ti] = true;
        e.dataTransfer.setData("text/plain", "new:" + mark);
      });
      chip.addEventListener("dragend", function () {
        setTimeout(function () { justDragged[ti] = false; }, 50);
      });
    });
  });

  /* места вставки метки — посимвольная сетка */
  Array.prototype.forEach.call(app.querySelectorAll(".song-char"), function (el) {
    el.addEventListener("click", function (e) {
      var ti = parseInt(el.getAttribute("data-ti"), 10);
      var sel = state.songSelectedMark[ti];
      if (!sel) return;
      var li = parseInt(el.getAttribute("data-li"), 10);
      var pos = parseInt(el.getAttribute("data-pos"), 10);
      var insertAt = pos;
      if (!el.classList.contains("song-end")) {
        var rect = el.getBoundingClientRect();
        insertAt = (e.clientX - rect.left) < rect.width / 2 ? pos : pos + 1;
      }
      placeMark(ti, li, insertAt, sel);
    });
    el.addEventListener("dragover", function (e) { e.preventDefault(); });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      var data = e.dataTransfer.getData("text/plain");
      var ti = parseInt(el.getAttribute("data-ti"), 10);
      var li = parseInt(el.getAttribute("data-li"), 10);
      var pos = parseInt(el.getAttribute("data-pos"), 10);
      var insertAt = pos;
      if (!el.classList.contains("song-end")) {
        var rect = el.getBoundingClientRect();
        insertAt = (e.clientX - rect.left) < rect.width / 2 ? pos : pos + 1;
      }
      if (data.indexOf("new:") === 0) {
        placeMark(ti, li, insertAt, data.slice(4));
      } else if (data.indexOf("move:") === 0) {
        var parts = data.split(":");
        var fArr = getLineMarks(parseInt(parts[1], 10), parseInt(parts[2], 10));
        var fIdx = parseInt(parts[3], 10);
        var m = fArr[fIdx];
        if (m) {
          fArr.splice(fIdx, 1);
          getLineMarks(ti, li).push({ type: m.type, index: insertAt });
          saveState();
          render();
        }
      }
    });
  });

  /* удаление / перетаскивание уже поставленной метки */
  Array.prototype.forEach.call(app.querySelectorAll(".song-mark-badge"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      var ti = parseInt(el.getAttribute("data-ti"), 10);
      var li = parseInt(el.getAttribute("data-li"), 10);
      var idx = parseInt(el.getAttribute("data-idx"), 10);
      getLineMarks(ti, li).splice(idx, 1);
      saveState();
      render();
    });
    el.addEventListener("dragstart", function (e) {
      var ti = el.getAttribute("data-ti");
      var li = el.getAttribute("data-li");
      var idx = el.getAttribute("data-idx");
      e.dataTransfer.setData("text/plain", "move:" + ti + ":" + li + ":" + idx);
    });
  });

  Array.prototype.forEach.call(app.querySelectorAll(".reveal-link"), function (btn) {
    btn.addEventListener("click", function () {
      var ti = btn.getAttribute("data-ti");
      state.songRevealed[ti] = !state.songRevealed[ti];
      render();
    });
  });

  song.tracks.forEach(function (track, ti) {
    var el = document.getElementById("song-audio-" + ti);
    songAudioEls[ti] = el;
    el.preservesPitch = true;
    el.mozPreservesPitch = true;
    el.webkitPreservesPitch = true;
    el.playbackRate = ((state.songTempoMap && state.songTempoMap[ti]) || 100) / 100;
    el.addEventListener("loadedmetadata", function () {
      state.songDurations[ti] = Math.round(el.duration) || 0;
      var t = document.getElementById("song-time-" + ti);
      if (t) t.textContent = songTimeLabel(ti);
    });
    el.addEventListener("timeupdate", function () {
      if (el.duration) setRing("song-" + ti, el.currentTime / el.duration);
      if (state.songPlayerKey === ti) {
        state.songPlayerElapsed = Math.floor(el.currentTime);
        var t = document.getElementById("song-time-" + ti);
        if (t) t.textContent = songTimeLabel(ti);
      }
    });
    el.addEventListener("ended", function () { handleSongTrackEnded(ti); });

    var tempoSlider = document.getElementById("song-tempo-" + ti);
    tempoSlider.addEventListener("input", function () {
      var pct = parseInt(tempoSlider.value, 10);
      state.songTempoMap[ti] = pct;
      el.playbackRate = pct / 100;
      if (activeSongShifter && activeSongShifter.ti === ti) activeSongShifter.shifter.tempo = pct / 100;
      var lbl = document.getElementById("song-tempo-label-" + ti);
      if (lbl) lbl.textContent = tempoLabelText(track, pct);
      saveState();
    });

    var pitchSlider = document.getElementById("song-pitch-" + ti);
    pitchSlider.addEventListener("input", function () {
      var semis = parseFloat(pitchSlider.value);
      state.songPitchMap[ti] = semis;
      var lbl = document.getElementById("song-pitch-label-" + ti);
      if (lbl) lbl.textContent = pitchLabelText(semis);
      saveState();

      if (state.songPlayerKey !== ti) return;
      if (activeSongShifter && activeSongShifter.ti === ti) {
        if (semis) {
          activeSongShifter.shifter.pitchSemitones = semis;
        } else {
          var pos = activeSongShifter.shifter.timePlayed || 0;
          stopSongShiftedPlayback();
          if (el) { el.currentTime = pos; var p = el.play(); if (p && p.catch) p.catch(function () {}); }
        }
      } else if (semis) {
        var pos2 = el ? el.currentTime : 0;
        if (el) el.pause();
        getAudioCtx();
        playSongShifted(ti, track, pos2);
      }
    });
  });

  Array.prototype.forEach.call(app.querySelectorAll(".song-player-row .play-btn"), function (btn) {
    btn.addEventListener("click", function () {
      var ti = parseInt(btn.getAttribute("data-ti"), 10);
      toggleSongAudio(ti);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-song-seek]"), function (btn) {
    btn.addEventListener("click", function () {
      var ti = parseInt(btn.getAttribute("data-ti"), 10);
      var delta = parseInt(btn.getAttribute("data-song-seek"), 10);
      if (activeSongShifter && activeSongShifter.ti === ti) {
        var sh = activeSongShifter.shifter;
        var dur = sh.duration || 1;
        var newSec = Math.max(0, Math.min(dur, sh.timePlayed + delta));
        sh.percentagePlayed = newSec / dur;
        if (state.songPlayerKey === ti) {
          state.songPlayerElapsed = Math.floor(newSec);
          setRing("song-" + ti, newSec / dur);
          var t1 = document.getElementById("song-time-" + ti);
          if (t1) t1.textContent = songTimeLabel(ti);
        }
        return;
      }
      var el = songAudioEls[ti];
      if (!el) return;
      if (delta < 0) el.currentTime = Math.max(0, el.currentTime + delta);
      else el.currentTime = Math.min(el.duration || el.currentTime + delta, el.currentTime + delta);
      if (state.songPlayerKey === ti) {
        state.songPlayerElapsed = Math.floor(el.currentTime);
        var t2 = document.getElementById("song-time-" + ti);
        if (t2) t2.textContent = songTimeLabel(ti);
      }
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-song-gear]"), function (btn) {
    btn.addEventListener("click", function () {
      var ti = btn.getAttribute("data-song-gear");
      state.songOpenSettings[ti] = !state.songOpenSettings[ti];
      var panel = document.getElementById("song-settings-" + ti);
      if (panel) panel.classList.toggle("open", !!state.songOpenSettings[ti]);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-song-fav]"), function (btn) {
    btn.addEventListener("click", function () {
      var ti = parseInt(btn.getAttribute("data-song-fav"), 10);
      var track = song.tracks[ti];
      toggleSongFavorite(ti, track);
      var isFav = !!state.favorites[songFavKey(ti)];
      btn.classList.toggle("fav-on", isFav);
      btn.innerHTML = SVG.star(isFav);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-song-toggle-loop]"), function (row) {
    row.addEventListener("click", function () {
      var ti = row.getAttribute("data-song-toggle-loop");
      state.songLoopMap[ti] = !state.songLoopMap[ti];
      row.querySelector(".toggle-pill").classList.toggle("on", !!state.songLoopMap[ti]);
      saveState();
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-song-toggle-autoplay]"), function (row) {
    row.addEventListener("click", function () {
      state.songAutoplayNext = !state.songAutoplayNext;
      Array.prototype.forEach.call(app.querySelectorAll("[data-song-toggle-autoplay] .toggle-pill"), function (p) {
        p.classList.toggle("on", state.songAutoplayNext);
      });
      saveState();
    });
  });

  renderSongPhotoZone();
  wireActs();
}

/* ---------- обвязка ---------- */

function resetProgress() {
  if (!confirm("Сбросить весь прогресс и данные ученика на этом устройстве?")) return;
  try { localStorage.removeItem("vocal-app"); } catch (e) {}
  location.href = location.pathname;
}

var ACTS = {
  "back": handleBack,
  "open-lesson": function () { go("lesson-home"); },
  "go-lecture": function () { go("lecture"); },
  "go-quiz": function () { go("quiz"); },
  "go-warmups": function () { go("warmups"); },
  "go-warmups-free": function () { go("warmups"); },
  "go-song": function () { go("song"); },
  "finish-warmups": function () { state.warmupsDone = true; saveState(); go("song"); },
  "finish-lesson": function () { state.songDone = true; saveState(); submitSongMarks(); go("feedback"); },
  "reset-progress": resetProgress,
  "go-profile": function () { go("profile"); },
  "go-courses": function () { go("courses"); },
  "go-questions": function () { go("questions"); },
  "go-more": function () { go("more"); },
  "filter-inprogress": function () { state.coursesFilter = state.coursesFilter === "inProgress" ? null : "inProgress"; render(); },
  "filter-completed": function () { state.coursesFilter = state.coursesFilter === "completed" ? null : "completed"; render(); },
  "go-favorites": function () { go("favorites"); },
  "undo-unstar": undoUnstar,
  "cal-prev": function () {
    var m = state.calMonth - 1, y = state.calYear;
    if (m < 0) { m = 11; y -= 1; }
    state.calMonth = m; state.calYear = y; render();
  },
  "cal-next": function () {
    var m = state.calMonth + 1, y = state.calYear;
    if (m > 11) { m = 0; y += 1; }
    state.calMonth = m; state.calYear = y; render();
  },
  "cal-open-tg": openTeacherChat,
  "cal-clear": function () {
    state.selectedDate = null; state.selectedTime = null; state.calBookedFlag = false; render();
  }
};

function wireActs() {
  Array.prototype.forEach.call(app.querySelectorAll("[data-act]"), function (el) {
    el.addEventListener("click", function () {
      var fn = ACTS[el.getAttribute("data-act")];
      if (fn) fn();
    });
  });
}

var lastRenderedScreen = null;
var lastRenderedQuizIndex = null;

function render() {
  stopAllMedia();
  // Прокручиваем наверх только при переходе на другой шаг/вопрос — не при
  // мелких действиях на том же экране (ответ в тесте, метка в песне и
  // т.п.), иначе страница дёргалась вверх при каждом клике.
  var screenChanged = lastRenderedScreen !== state.screen;
  var quizIndexChanged = state.screen === "quiz" && lastRenderedQuizIndex !== state.quizIndex;
  if (screenChanged || quizIndexChanged) window.scrollTo(0, 0);
  lastRenderedScreen = state.screen;
  lastRenderedQuizIndex = state.quizIndex;
  if (tg) {
    if (DOCK_SCREENS.indexOf(state.screen) !== -1 || state.screen === "tg") tg.BackButton.hide();
    else tg.BackButton.show();
  }
  switch (state.screen) {
    case "tg": renderTg(); break;
    case "name": renderName(); break;
    case "courses": renderCourses(); break;
    case "favorites": renderFavorites(); break;
    case "profile": renderProfile(); break;
    case "questions": renderQuestions(); break;
    case "more": renderMore(); break;
    case "lesson-home": renderLessonHome(); break;
    case "lecture": renderLecture(); break;
    case "quiz": renderQuiz(); break;
    case "quiz-result": renderQuizResult(); break;
    case "warmups": renderWarmups(); break;
    case "song": renderSong(); break;
    case "feedback": renderFeedback(); break;
    default: renderTg();
  }
  renderDock();
  maybeCelebrate();
}

/* ---------- запуск ---------- */

if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#F1EEE8");
    tg.setBackgroundColor("#F1EEE8");
  } catch (e) {}
  tg.BackButton.onClick(handleBack);
}

fetch("data/lesson-01.json")
  .then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then(function (data) {
    LESSON = data;
    state.quizAnswers = new Array(data.quiz.questions.length).fill(null);
    loadState();
    loadDarkMode();
    // подставляем Telegram-username, если открыто внутри Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      var u = tg.initDataUnsafe.user;
      state.chatId = u.id || state.chatId;
      if (!state.tgId) state.tgId = u.username ? "@" + u.username : String(u.id || "");
    }
    render();
  })
  .catch(function () {
    app.innerHTML = '<div style="padding:40px 24px;text-align:center;color:oklch(60% 0.13 38);font-weight:600;">Не удалось загрузить данные урока.<br>Проверь соединение и открой заново.</div>';
  });
