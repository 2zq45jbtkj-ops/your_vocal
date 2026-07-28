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
  warmupFiles: [], songFile: null,
  songPlacements: {}, // "ti-li" -> [{type:"V"|"v", index:Number}]
  // transient (не сохраняется):
  playerIdx: null, playerElapsed: 0, durations: {},
  songPlayerKey: null, songPlayerElapsed: 0, songDurations: {},
  songRevealed: {}, songSelectedMark: {},
  feedbackMood: null, feedbackText: "", coursesFilter: null,
  songStatus: "idle"
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
      songFile: state.songFile,
      songPlacements: state.songPlacements
    }));
  } catch (e) {}
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
  if (state.songFile) n++;
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
  seekBack: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4v6h6" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15a8 8 0 1 0 2-9.5L4 10" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="17.5" font-size="7.5" font-weight="700" fill="oklch(56% 0.09 235)" text-anchor="middle">10</text></svg>',
  seekFwd: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 4v6h-6" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 15a8 8 0 1 1-2-9.5L20 10" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="17.5" font-size="7.5" font-weight="700" fill="oklch(56% 0.09 235)" text-anchor="middle">10</text></svg>',
  play: '<svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M1 1l10 6-10 6V1z" fill="oklch(95% 0.014 80)"/></svg>',
  pause: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="10" rx="1" fill="oklch(95% 0.014 80)"/><rect x="7" y="1" width="4" height="10" rx="1" fill="oklch(95% 0.014 80)"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="oklch(28% 0.015 70)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="oklch(28% 0.015 70)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  uploadTerra: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="oklch(38% 0.1 38)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="oklch(38% 0.1 38)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  hwCheck: '<svg width="15" height="12" viewBox="0 0 15 12" fill="none"><path d="M1 6l4 4 9-9" stroke="oklch(28% 0.015 70)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  micIcon: function (color) { return '<svg width="12" height="16" viewBox="0 0 12 16" fill="none"><rect x="3" y="1" width="6" height="10" rx="3" stroke="' + color + '" stroke-width="1.4"/><path d="M1.5 8.5a4.5 4.5 0 009 0M6 13v2" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round"/></svg>'; },
  notesIcon: function (color) { return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="11" r="2.2" stroke="' + color + '" stroke-width="1.4"/><circle cx="11" cy="9" r="2.2" stroke="' + color + '" stroke-width="1.4"/><path d="M6.2 11V2.5L13.2 1v6.5" stroke="' + color + '" stroke-width="1.4"/></svg>'; },
  dockPerson: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.5" r="3.3" stroke="' + c + '" stroke-width="1.6"/><path d="M3.5 17c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>'; },
  dockLessons: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="' + c + '" stroke-width="1.6"/><path d="M6.5 8h7M6.5 12h4.5" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>'; },
  dockQuestion: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.3" stroke="' + c + '" stroke-width="1.6"/><path d="M7.8 8a2.2 2.2 0 0 1 4.3.6c0 1.5-2.1 1.6-2.1 3.2" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="14.3" r="0.9" fill="' + c + '"/></svg>'; },
  dockMore: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="4.5" cy="10" r="1.6" fill="' + c + '"/><circle cx="10" cy="10" r="1.6" fill="' + c + '"/><circle cx="15.5" cy="10" r="1.6" fill="' + c + '"/></svg>'; }
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
  var subs = LESSON.stepSubtitles;
  var pct = progressPercent();
  var steps = [
    { label: "Лекция «" + esc(LESSON.title) + "»", done: s.lectureViewed },
    { label: "Тест", done: s.quizDone },
    { label: "Распевки «" + esc(LESSON.title) + "»", done: !!(s.warmupFiles && s.warmupFiles.length) },
    { label: "Упражнение с песней", done: !!s.songFile }
  ];
  var stepsHtml = steps.map(function (st) {
    return '<div class="roadmap-step">' +
      '<div class="roadmap-step-dot' + (st.done ? " done" : "") + '">' + (st.done ? SVG.stepCheck : "") + "</div>" +
      '<span>' + st.label + "</span>" +
    "</div>";
  }).join("");
  return (
    '<div class="roadmap-card" data-act="open-lesson">' +
      '<div class="roadmap-title">' + esc(LESSON.title) + "</div>" +
      '<div class="roadmap-sub">' + (pct === 100 ? "Завершён" : "В процессе · " + pct + "%") + "</div>" +
      stepsHtml +
    "</div>"
  );
}

function renderCourses() {
  var stats = lessonStats();
  var filter = state.coursesFilter || (progressPercent() === 100 ? "completed" : "inProgress");

  var items =
    '<div class="lesson-tile" data-act="open-lesson">' +
      '<div class="lesson-dot" style="background:oklch(56% 0.09 235);">1</div>' +
      '<div class="lesson-tile-name">' + esc(LESSON.title) + "</div>" +
    "</div>";
  for (var i = 2; i <= TOTAL_LESSONS; i++) {
    items +=
      '<div class="lesson-tile locked">' +
        '<div class="lesson-dot" style="background:oklch(95% 0.014 80);">' + SVG.lock + "</div>" +
        '<div class="lesson-tile-name">Урок ' + i + "</div>" +
      "</div>";
  }

  app.innerHTML =
    '<div class="courses-head">' +
      '<div class="courses-title">Курс вокала</div>' +
      '<div class="courses-sub">30 уроков · ' + esc(state.lastName) + " " + esc(state.firstName) + "</div>" +
      '<button class="reset-link" data-act="reset-progress">Сбросить и войти как другой ученик</button>' +
    "</div>" +
    '<div class="filter-row">' +
      '<button class="filter-btn' + (filter === "inProgress" ? " active" : "") + '" data-act="filter-inprogress">В работе · ' + stats.inProgress + "</button>" +
      '<button class="filter-btn' + (filter === "completed" ? " active" : "") + '" data-act="filter-completed">✓ Завершено · ' + stats.completed + "</button>" +
    "</div>" +
    '<div class="roadmap-wrap">' +
      '<div class="roadmap-label">Дорожная карта урока · листайте →</div>' +
      '<div class="roadmap-scroll">' + roadmapCardHtml() + "</div>" +
    "</div>" +
    '<div class="courses-grid">' + items + "</div>";
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
    { screen: "questions", act: "go-questions", icon: SVG.dockQuestion, label: "Вопросы" },
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

  app.innerHTML =
    stepHeader("Тест", 2, 50) +
    '<div class="quiz-body">' +
      '<div class="quiz-counter-row"><span class="quiz-counter">Вопрос ' + (s.quizIndex + 1) + " из " + questions.length + "</span></div>" +
      '<div class="quiz-progress"><div style="width:' + Math.round(((s.quizIndex + 1) / questions.length) * 100) + '%;"></div></div>' +
      '<div class="quiz-card">' +
        '<div class="quiz-q">' + esc(cq.q) + "</div>" + optsHtml +
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

function renderWarmups() {
  var cards = "";
  LESSON.warmups.exercises.forEach(function (ex) {
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
        "</div>" +
        '<div class="tempo-row">' +
          '<span class="tempo-label" id="tempo-label-' + ex.n + '">' + tempoLabelText(ex, 100) + "</span>" +
          '<input type="range" class="tempo-slider" id="tempo-' + ex.n + '" min="50" max="100" step="5" value="100">' +
        "</div>" +
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
    el.addEventListener("ended", function () {
      setRing(ex.n, 0);
      if (state.playerIdx === ex.n) {
        state.playerIdx = null;
        state.playerElapsed = 0;
        updatePlayBtn(ex);
      }
    });
    var slider = document.getElementById("tempo-" + ex.n);
    slider.addEventListener("input", function () {
      var pct = parseInt(slider.value, 10);
      el.playbackRate = pct / 100;
      var lbl = document.getElementById("tempo-label-" + ex.n);
      if (lbl) lbl.textContent = tempoLabelText(ex, pct);
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
      var el = audioEls[n];
      if (!el) return;
      if (delta < 0) el.currentTime = Math.max(0, el.currentTime + delta);
      else el.currentTime = Math.min(el.duration || el.currentTime + delta, el.currentTime + delta);
      if (state.playerIdx === n) {
        state.playerElapsed = Math.floor(el.currentTime);
        var ex = LESSON.warmups.exercises[n - 1];
        var t = document.getElementById("time-" + n);
        if (t) t.textContent = warmupTimeLabel(ex);
      }
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
  var el = audioEls[n];
  if (!el) return;
  var exercises = LESSON.warmups.exercises;
  if (state.playerIdx === n) {
    el.pause();
    state.playerIdx = null;
    updatePlayBtn(exercises[n - 1]);
    return;
  }
  var prev = state.playerIdx;
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  el.currentTime = 0;
  var p = el.play();
  if (p && p.catch) p.catch(function () {});
  state.playerIdx = n;
  state.playerElapsed = 0;
  if (prev) updatePlayBtn(exercises[prev - 1]);
  updatePlayBtn(exercises[n - 1]);
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
  state.playerIdx = null;
  state.playerElapsed = 0;
  Object.keys(songAudioEls).forEach(function (k) { if (songAudioEls[k]) songAudioEls[k].pause(); });
  songAudioEls = {};
  state.songPlayerKey = null;
  state.songPlayerElapsed = 0;
}

/* ---------- упражнение с песней ---------- */

function markCircle(mark, cls) {
  return '<span class="' + cls + " " + (mark === "V" ? "deep" : "short") + '">' + mark + "</span>";
}

function songHint(s) {
  if (!s.songFile) return "JPG, PNG — фото листа с разметкой";
  if (s.songStatus === "sending") return "Отправляю преподавателю…";
  if (s.songStatus === "sent") return "Отправлено преподавателю ✓";
  if (s.songStatus === "error") return "Не отправилось — нажми «Повторить отправку»";
  if (s.songStatus === "toolarge") return "Файл большой — сервер такое не пропустит. Отправь фото преподавателю прямо в чат с ботом";
  return "Файл выбран ✓";
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

function toggleSongAudio(idx) {
  var el = songAudioEls[idx];
  if (!el) return;
  if (state.songPlayerKey === idx) {
    el.pause();
    state.songPlayerKey = null;
    updateSongPlayBtn(idx);
    return;
  }
  var prev = state.songPlayerKey;
  Object.keys(songAudioEls).forEach(function (k) { if (songAudioEls[k]) songAudioEls[k].pause(); });
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  var p = el.play();
  if (p && p.catch) p.catch(function () {});
  state.songPlayerKey = idx;
  state.songPlayerElapsed = Math.floor(el.currentTime);
  if (prev !== null && prev !== undefined) updateSongPlayBtn(prev);
  updateSongPlayBtn(idx);
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

    tracksHtml +=
      '<div class="song-track">' +
        '<div class="song-track-title">' + esc(track.title) + "</div>" +
        '<div class="warmup-row song-player-row">' +
          '<button class="play-btn" id="song-play-' + ti + '" data-ti="' + ti + '">' + SVG.play + "</button>" +
          '<div class="warmup-time" id="song-time-' + ti + '">' + songTimeLabel(ti) + "</div>" +
        "</div>" +
        '<input type="range" class="tempo-slider song-seek" id="song-seek-' + ti + '" data-ti="' + ti + '" min="0" max="1000" value="0">' +
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
      '<label class="photo-upload"><input type="file" accept="image/*" id="song-file" style="display:none;">' +
        '<div class="hw-icon terra">' + SVG.uploadTerra + "</div>" +
        '<div style="flex:1;">' +
          '<div class="hw-name">' + esc(s.songFile || "Загрузить фото разметки") + "</div>" +
          '<div class="hw-hint">' + songHint(s) + "</div>" +
        "</div>" +
      "</label>" +
      (s.songStatus === "error" ? '<button class="hw-replace" id="song-retry" style="margin:-10px 0 16px;">Повторить отправку</button>' : "") +
      (s.songStatus === "toolarge" ? '<button class="cta" id="song-open-tg" style="margin:-10px 0 16px;">Открыть чат с ботом в Telegram</button>' : "") +
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
    var seek = document.getElementById("song-seek-" + ti);
    el.addEventListener("loadedmetadata", function () {
      state.songDurations[ti] = Math.round(el.duration) || 0;
      var t = document.getElementById("song-time-" + ti);
      if (t) t.textContent = songTimeLabel(ti);
    });
    el.addEventListener("timeupdate", function () {
      if (el.duration) seek.value = Math.round((el.currentTime / el.duration) * 1000);
      if (state.songPlayerKey === ti) {
        state.songPlayerElapsed = Math.floor(el.currentTime);
        var t = document.getElementById("song-time-" + ti);
        if (t) t.textContent = songTimeLabel(ti);
      }
    });
    el.addEventListener("ended", function () {
      if (state.songPlayerKey === ti) {
        state.songPlayerKey = null;
        state.songPlayerElapsed = 0;
        updateSongPlayBtn(ti);
      }
    });
    seek.addEventListener("input", function () {
      if (!el.duration) return;
      el.currentTime = (seek.value / 1000) * el.duration;
      state.songPlayerElapsed = Math.floor(el.currentTime);
      var t = document.getElementById("song-time-" + ti);
      if (t) t.textContent = songTimeLabel(ti);
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll(".song-player-row .play-btn"), function (btn) {
    btn.addEventListener("click", function () {
      var ti = parseInt(btn.getAttribute("data-ti"), 10);
      toggleSongAudio(ti);
    });
  });

  document.getElementById("song-file").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (!f) return;
    state.songFile = f.name;
    state.songBlob = f;
    saveState();
    if (f.size > MAX_UPLOAD_BYTES) {
      state.songStatus = "toolarge";
      render();
      return;
    }
    state.songStatus = "sending";
    saveState();
    render();
    submitFile("song", f, function (status) {
      state.songStatus = status;
      if (state.screen === "song") render();
    }, f.name);
  });
  var songRetry = document.getElementById("song-retry");
  if (songRetry) {
    songRetry.addEventListener("click", function () {
      if (!state.songBlob) return;
      state.songStatus = "sending";
      render();
      submitFile("song", state.songBlob, function (status) {
        state.songStatus = status;
        if (state.screen === "song") render();
      }, state.songFile);
    });
  }
  var songOpenTg = document.getElementById("song-open-tg");
  if (songOpenTg) songOpenTg.addEventListener("click", openTeacherChat);
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
  "filter-inprogress": function () { state.coursesFilter = "inProgress"; render(); },
  "filter-completed": function () { state.coursesFilter = "completed"; render(); }
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
    case "profile": renderComingSoon("Личный кабинет", SVG.dockPerson("oklch(60% 0.13 38)")); break;
    case "questions": renderComingSoon("Вопросы", SVG.dockQuestion("oklch(60% 0.13 38)")); break;
    case "more": renderComingSoon("Ещё", SVG.dockMore("oklch(60% 0.13 38)")); break;
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
