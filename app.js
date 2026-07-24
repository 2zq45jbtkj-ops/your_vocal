/* Курс вокала — Telegram Mini App (без сборки).
   Экраны и поведение перенесены из дизайн-хэндоффа один в один.
   Контент урока лежит в data/, код менять не нужно. */

"use strict";

var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
var app = document.getElementById("app");

var TOTAL_LESSONS = 30;
var LESSON = null; // data/lesson-01.json

/* ---------- состояние ---------- */

var state = {
  screen: "tg",
  tgId: "", firstName: "", lastName: "",
  quizIndex: 0, quizAnswers: [], quizScore: 0,
  quizDone: false, warmupsDone: false, songDone: false,
  lectureViewed: false, celebrated: false,
  warmupFile: null, songFile: null,
  selectedMark: null, songMarks: {},
  // transient (не сохраняется):
  playerIdx: null, playerElapsed: 0, durations: {},
  cameraStage: "idle", recordSeconds: 0
};

var audioEls = {};
var stream = null, recorder = null, recChunks = [], recTimer = null;

function saveState() {
  try {
    localStorage.setItem("vocal-app", JSON.stringify({
      tgId: state.tgId, firstName: state.firstName, lastName: state.lastName,
      quizIndex: state.quizIndex, quizAnswers: state.quizAnswers,
      quizScore: state.quizScore, quizDone: state.quizDone,
      warmupsDone: state.warmupsDone, songDone: state.songDone,
      lectureViewed: state.lectureViewed, celebrated: state.celebrated,
      warmupFile: state.warmupFile, songFile: state.songFile,
      songMarks: state.songMarks
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
  if (state.warmupFile) n++;
  if (state.songFile) n++;
  return n * 25;
}

var CONFETTI_COLORS = ["#E8B84B", "#C1503F", "#D98B4A", "#6C91A6", "#7A9B6E"];

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
  setTimeout(function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 3000);
}

function maybeCelebrate() {
  if (!LESSON) return;
  if (progressPercent() === 100 && !state.celebrated) {
    state.celebrated = true;
    saveState();
    showConfetti();
  }
}

/* ---------- SVG ---------- */

var SVG = {
  back: '<svg width="11" height="18" viewBox="0 0 11 18" fill="none"><path d="M9 1L2 9l7 8" stroke="#6C91A6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  telegram: '<svg width="52" height="52" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"><linearGradient id="tgg" x1="53.72" y1="49" x2="191" y2="186" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#37aee2"/><stop offset="1" stop-color="#1e96c8"/></linearGradient><circle cx="120" cy="120" r="120" fill="url(#tgg)"/><path fill="#c8daea" d="M98 175c-3.888 0-3.227-1.468-4.568-5.17L82 132.207 152.988 87"/><path fill="#a9c9dd" d="M98 175c3 0 4.325-1.372 6-3l16-15.558-19.958-12.035"/><path fill="#fff" d="M100.04 154.41l48.36 35.729c5.519 3.045 9.501 1.468 10.876-5.123l19.685-92.788c1.977-8.085-3.077-11.746-8.359-9.32l-115.59 44.571c-7.891 3.165-7.843 7.567-1.438 9.523l29.663 9.259 68.673-43.325c3.242-1.966 6.218-.909 3.776 1.258"/></svg>',
  lock: '<svg width="14" height="16" viewBox="0 0 14 16" fill="none"><rect x="1" y="7" width="12" height="8" rx="2" stroke="#AEB6BB" stroke-width="1.5"/><path d="M4 7V4.5a3 3 0 016 0V7" stroke="#AEB6BB" stroke-width="1.5"/></svg>',
  chevron: '<svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="#C7CDD1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stepCheck: '<svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5l4 4 7-8" stroke="#FBEFE8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="#F2ECE7" stroke-width="1.4"/><path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="#F2ECE7" stroke-width="1.2" stroke-linecap="round"/></svg>',
  resultCheck: '<svg width="26" height="20" viewBox="0 0 26 20" fill="none"><path d="M2 10l8 8L24 2" stroke="#1F3A47" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seekBack: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4v6h6" stroke="#6C91A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15a8 8 0 1 0 2-9.5L4 10" stroke="#6C91A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="17.5" font-size="7.5" font-weight="700" fill="#6C91A6" text-anchor="middle">10</text></svg>',
  seekFwd: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 4v6h-6" stroke="#6C91A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 15a8 8 0 1 1-2-9.5L20 10" stroke="#6C91A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="17.5" font-size="7.5" font-weight="700" fill="#6C91A6" text-anchor="middle">10</text></svg>',
  play: '<svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M1 1l10 6-10 6V1z" fill="#F2ECE7"/></svg>',
  pause: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="10" rx="1" fill="#F2ECE7"/><rect x="7" y="1" width="4" height="10" rx="1" fill="#F2ECE7"/></svg>',
  camera: '<svg width="20" height="16" viewBox="0 0 20 16" fill="none"><rect x="1" y="2" width="13" height="12" rx="2.5" stroke="#F2ECE7" stroke-width="1.5"/><path d="M14 6.5l5-3v9l-5-3" stroke="#F2ECE7" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="#3E5866" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="#3E5866" stroke-width="1.6" stroke-linecap="round"/></svg>',
  uploadTerra: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="#5A3B26" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="#5A3B26" stroke-width="1.6" stroke-linecap="round"/></svg>',
  hwCheck: '<svg width="15" height="12" viewBox="0 0 15 12" fill="none"><path d="M1 6l4 4 9-9" stroke="#1F3A47" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  micIcon: function (color) { return '<svg width="12" height="16" viewBox="0 0 12 16" fill="none"><rect x="3" y="1" width="6" height="10" rx="3" stroke="' + color + '" stroke-width="1.4"/><path d="M1.5 8.5a4.5 4.5 0 009 0M6 13v2" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round"/></svg>'; },
  notesIcon: function (color) { return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="11" r="2.2" stroke="' + color + '" stroke-width="1.4"/><circle cx="11" cy="9" r="2.2" stroke="' + color + '" stroke-width="1.4"/><path d="M6.2 11V2.5L13.2 1v6.5" stroke="' + color + '" stroke-width="1.4"/></svg>'; }
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

function renderCourses() {
  var items = "";
  for (var i = 1; i <= TOTAL_LESSONS; i++) {
    if (i === 1) {
      var pct = progressPercent();
      items +=
        '<div class="lesson-card" data-act="open-lesson">' +
          '<div class="lesson-dot" style="background:#6C91A6;">1</div>' +
          '<div class="lesson-body">' +
            '<div class="lesson-name">' + esc(LESSON.title) + "</div>" +
            '<div class="lesson-sub">' + (pct === 100 ? "Пройден · 100%" : pct + "% выполнено") + "</div>" +
          "</div>" + SVG.chevron +
        "</div>";
    } else {
      items +=
        '<div class="lesson-card locked">' +
          '<div class="lesson-dot" style="background:#F2ECE7;">' + SVG.lock + "</div>" +
          '<div class="lesson-body">' +
            '<div class="lesson-name">Урок ' + i + "</div>" +
            '<div class="lesson-sub">Скоро</div>' +
          "</div>" +
        "</div>";
    }
  }
  app.innerHTML =
    '<div class="courses-head">' +
      '<div class="courses-title">Курс вокала</div>' +
      '<div class="courses-sub">30 уроков · ' + esc(state.lastName) + " " + esc(state.firstName) + "</div>" +
    "</div>" +
    '<div class="courses-list">' + items + "</div>";
  wireActs();
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
      stepRow({ act: "go-lecture", dotBg: "#AE5F3F", icon: SVG.stepCheck, name: "Лекция «" + esc(LESSON.title) + "»", sub: subs.lecture }) +
      stepRow({ act: "go-quiz", dotBg: s.quizDone ? "#AE5F3F" : "#6C91A6", icon: s.quizDone ? SVG.stepCheck : SVG.doc, name: "Тест", sub: s.quizDone ? "Пройден · " + s.quizScore + "/" + LESSON.quiz.questions.length : subs.quiz }) +
      stepRow({ act: "go-warmups", locked: false, lockedText: false,
        dotBg: s.warmupsDone ? "#AE5F3F" : (s.quizDone ? "#6C91A6" : "#fff"),
        icon: s.warmupsDone ? SVG.stepCheck : SVG.micIcon(s.quizDone ? "#F2ECE7" : "#AEB6BB"),
        name: "Распевки «" + esc(LESSON.title) + "»", sub: subs.warmups }) +
      stepRow({ act: "go-song", locked: false, lockedText: false, last: true,
        dotBg: s.songDone ? "#AE5F3F" : (s.warmupsDone ? "#6C91A6" : "#fff"),
        icon: s.songDone ? SVG.stepCheck : SVG.notesIcon(s.warmupsDone ? "#F2ECE7" : "#AEB6BB"),
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
    questions.forEach(function (q, i) { if (state.quizAnswers[i] === q.correct) score++; });
    state.quizDone = true;
    state.quizScore = score;
    saveState();
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
          '<button class="play-btn" id="play-' + ex.n + '" data-n="' + ex.n + '">' + SVG.play + "</button>" +
          '<button class="seek-btn" data-seek="10" data-n="' + ex.n + '">' + SVG.seekFwd + "</button>" +
          '<div class="warmup-labels">' +
            '<div class="warmup-label">' + esc(ex.label1) + "</div>" +
            (ex.label2 ? '<div class="warmup-label">' + esc(ex.label2) + "</div>" : "") +
          "</div>" +
          '<div class="warmup-time" id="time-' + ex.n + '">' + warmupTimeLabel(ex) + "</div>" +
        "</div>" +
        '<p class="warmup-sub">' + esc(ex.sub) + "</p>" +
        '<audio id="audio-' + ex.n + '" src="' + esc(ex.src) + '" preload="metadata" style="display:none;"></audio>' +
      "</div>";
  });

  app.innerHTML =
    stepHeader("Распевки «" + esc(LESSON.title) + "»", 3, 75) +
    '<div class="warmups-body">' +
      '<div class="instruction-note">' + LESSON.warmups.instruction + "</div>" +
      cards +
      '<div class="tempo-note">' + esc(LESSON.warmups.tempoLinkText) + ' <a href="' + esc(LESSON.warmups.tempoLinkUrl) + '" target="_blank">' + esc(LESSON.warmups.tempoLinkLabel) + "</a></div>" +
      '<div class="section-label" style="margin:0 0 8px;">Отправка видео</div>' +
      '<div id="hw-zone"></div>' +
    "</div>" +
    '<div class="bottom-cta" style="padding-top:0;"><button class="cta" data-act="finish-warmups">Продолжить: упражнение с песней</button></div>';

  LESSON.warmups.exercises.forEach(function (ex) {
    var el = document.getElementById("audio-" + ex.n);
    audioEls[ex.n] = el;
    el.addEventListener("loadedmetadata", function () {
      state.durations[ex.n] = Math.round(el.duration) || 0;
      var t = document.getElementById("time-" + ex.n);
      if (t) t.textContent = warmupTimeLabel(ex);
    });
    el.addEventListener("timeupdate", function () {
      if (state.playerIdx === ex.n) {
        state.playerElapsed = Math.floor(el.currentTime);
        var t = document.getElementById("time-" + ex.n);
        if (t) t.textContent = warmupTimeLabel(ex);
      }
    });
    el.addEventListener("ended", function () {
      if (state.playerIdx === ex.n) {
        state.playerIdx = null;
        state.playerElapsed = 0;
        updatePlayBtn(ex);
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

function renderHwZone() {
  var zone = document.getElementById("hw-zone");
  if (!zone) return;
  var s = state;

  if (s.warmupFile) {
    zone.innerHTML =
      '<div class="hw-attached">' +
        '<div class="hw-icon">' + SVG.hwCheck + "</div>" +
        '<div style="flex:1;">' +
          '<div class="hw-name">' + esc(s.warmupFile) + "</div>" +
          '<div class="hw-hint">Видео прикреплено</div>' +
        "</div>" +
        '<button class="hw-replace" id="hw-retake">Заменить</button>' +
      "</div>";
    document.getElementById("hw-retake").addEventListener("click", function () {
      state.warmupFile = null;
      state.cameraStage = "idle";
      saveState();
      renderHwZone();
    });
    return;
  }

  if (s.cameraStage === "ready" || s.cameraStage === "recording") {
    var recording = s.cameraStage === "recording";
    zone.innerHTML =
      '<div class="camera-frame">' +
        '<video id="cam-video" autoplay muted playsinline></video>' +
        (recording ? '<div class="rec-indicator"><span></span><em id="rec-time" style="font-style:normal;">' + fmtTime(s.recordSeconds) + "</em></div>" : "") +
      "</div>" +
      (recording
        ? '<button class="camera-stop" id="cam-stop">Остановить запись</button>'
        : '<div class="camera-btns">' +
            '<button class="camera-cancel" id="cam-cancel">Отмена</button>' +
            '<button class="camera-start" id="cam-start">Начать запись</button>' +
          "</div>");
    var video = document.getElementById("cam-video");
    if (stream) video.srcObject = stream;
    if (recording) {
      document.getElementById("cam-stop").addEventListener("click", stopRecording);
    } else {
      document.getElementById("cam-cancel").addEventListener("click", cancelCamera);
      document.getElementById("cam-start").addEventListener("click", beginRecording);
    }
    return;
  }

  zone.innerHTML =
    '<div class="hw-choice">' +
      '<button class="hw-record" id="hw-camera">' + SVG.camera + "Записать в приложении</button>" +
      '<label class="hw-upload"><input type="file" accept="video/*" id="hw-file" style="display:none;">' + SVG.upload + "Загрузить готовое</label>" +
    "</div>";
  document.getElementById("hw-camera").addEventListener("click", startCamera);
  document.getElementById("hw-file").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (f) { state.warmupFile = f.name; saveState(); renderHwZone(); maybeCelebrate(); }
  });
}

function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Не удалось получить доступ к камере. Проверьте разрешения браузера.");
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (s) {
    stream = s;
    state.cameraStage = "ready";
    renderHwZone();
  }).catch(function () {
    alert("Не удалось получить доступ к камере. Проверьте разрешения браузера.");
  });
}

function beginRecording() {
  recChunks = [];
  try {
    recorder = new MediaRecorder(stream);
  } catch (e) {
    alert("Запись не поддерживается в этом браузере.");
    return;
  }
  recorder.ondataavailable = function (e) { if (e.data.size > 0) recChunks.push(e.data); };
  recorder.onstop = function () {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    clearInterval(recTimer);
    state.cameraStage = "idle";
    state.warmupFile = "Видео из приложения";
    saveState();
    renderHwZone();
    maybeCelebrate();
  };
  recorder.start();
  state.cameraStage = "recording";
  state.recordSeconds = 0;
  renderHwZone();
  recTimer = setInterval(function () {
    state.recordSeconds++;
    var t = document.getElementById("rec-time");
    if (t) t.textContent = fmtTime(state.recordSeconds);
  }, 1000);
}

function stopRecording() { if (recorder) recorder.stop(); }

function cancelCamera() {
  if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  stream = null;
  clearInterval(recTimer);
  state.cameraStage = "idle";
  state.recordSeconds = 0;
  renderHwZone();
}

function stopAllMedia() {
  Object.keys(audioEls).forEach(function (k) { if (audioEls[k]) audioEls[k].pause(); });
  audioEls = {};
  state.playerIdx = null;
  state.playerElapsed = 0;
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  clearInterval(recTimer);
  state.cameraStage = "idle";
}

/* ---------- упражнение с песней ---------- */

function markCircle(mark, cls) {
  return '<span class="' + cls + " " + (mark === "V" ? "deep" : "short") + '">' + mark + "</span>";
}

function renderSong() {
  var s = state;
  var song = LESSON.song;

  var exampleHtml = "";
  song.example.forEach(function (part) {
    if (part.t !== undefined) exampleHtml += esc(part.t);
    else exampleHtml += '<span class="marked-word">' + markCircle(part.mark, "word-mark") + esc(part.word) + "</span>";
  });

  var linesHtml = "";
  song.lines.forEach(function (line) {
    var mark = s.songMarks[line.id] || null;
    var cls = "blank-mark" + (mark ? " set-" + mark : (s.selectedMark ? " armed" : ""));
    linesHtml +=
      '<div class="song-line-card mb10">' +
        esc(line.before) + ' <span class="marked-word">' +
        '<span class="' + cls + '" data-line="' + line.id + '">' + (mark || "") + "</span>" +
        esc(line.word) + "</span> " + esc(line.after) +
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
      '<div class="section-label" style="margin-top:0;">Твоя очередь</div>' +
      '<div class="turn-hint">1. Выбери значок ниже → 2. коснись места в строке, где нужен вдох</div>' +
      '<div class="chips-row">' +
        '<div class="chip' + (s.selectedMark === "V" ? " sel-V" : "") + '" id="chip-V">' + markCircle("V", "mark-circle") + "глубокий</div>" +
        '<div class="chip' + (s.selectedMark === "v" ? " sel-v" : "") + '" id="chip-v">' + markCircle("v", "mark-circle") + "короткий</div>" +
      "</div>" +
      linesHtml +
      '<label class="photo-upload"><input type="file" accept="image/*" id="song-file" style="display:none;">' +
        '<div class="hw-icon terra">' + SVG.uploadTerra + "</div>" +
        '<div style="flex:1;">' +
          '<div class="hw-name">' + esc(s.songFile || "Загрузить фото разметки") + "</div>" +
          '<div class="hw-hint">' + (s.songFile ? "Файл выбран ✓" : "JPG, PNG — фото листа с разметкой") + "</div>" +
        "</div>" +
      "</label>" +
    "</div>" +
    '<div class="final-cta-wrap"><button class="cta terra" data-act="finish-lesson">Завершить урок</button></div>';

  document.getElementById("chip-V").addEventListener("click", function () {
    state.selectedMark = state.selectedMark === "V" ? null : "V";
    render();
  });
  document.getElementById("chip-v").addEventListener("click", function () {
    state.selectedMark = state.selectedMark === "v" ? null : "v";
    render();
  });
  Array.prototype.forEach.call(app.querySelectorAll(".blank-mark"), function (el) {
    el.addEventListener("click", function () {
      if (!state.selectedMark) return;
      var id = el.getAttribute("data-line");
      state.songMarks[id] = state.songMarks[id] === state.selectedMark ? null : state.selectedMark;
      saveState();
      render();
    });
  });
  document.getElementById("song-file").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (f) { state.songFile = f.name; saveState(); render(); }
  });
  wireActs();
}

/* ---------- обвязка ---------- */

var ACTS = {
  "back": handleBack,
  "open-lesson": function () { go("lesson-home"); },
  "go-lecture": function () { go("lecture"); },
  "go-quiz": function () { go("quiz"); },
  "go-warmups": function () { go("warmups"); },
  "go-warmups-free": function () { go("warmups"); },
  "go-song": function () { go("song"); },
  "finish-warmups": function () { state.warmupsDone = true; saveState(); go("song"); },
  "finish-lesson": function () { state.songDone = true; saveState(); go("lesson-home"); }
};

function wireActs() {
  Array.prototype.forEach.call(app.querySelectorAll("[data-act]"), function (el) {
    el.addEventListener("click", function () {
      var fn = ACTS[el.getAttribute("data-act")];
      if (fn) fn();
    });
  });
}

function render() {
  stopAllMedia();
  window.scrollTo(0, 0);
  if (tg) {
    if (state.screen === "tg" || state.screen === "courses") tg.BackButton.hide();
    else tg.BackButton.show();
  }
  switch (state.screen) {
    case "tg": renderTg(); break;
    case "name": renderName(); break;
    case "courses": renderCourses(); break;
    case "lesson-home": renderLessonHome(); break;
    case "lecture": renderLecture(); break;
    case "quiz": renderQuiz(); break;
    case "quiz-result": renderQuizResult(); break;
    case "warmups": renderWarmups(); break;
    case "song": renderSong(); break;
    default: renderTg();
  }
  maybeCelebrate();
}

/* ---------- запуск ---------- */

if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#F2ECE7");
    tg.setBackgroundColor("#F2ECE7");
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
    data.song.lines.forEach(function (l) { state.songMarks[l.id] = null; });
    loadState();
    // подставляем Telegram-username, если открыто внутри Telegram
    if (!state.tgId && tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      var u = tg.initDataUnsafe.user;
      state.tgId = u.username ? "@" + u.username : String(u.id || "");
    }
    render();
  })
  .catch(function () {
    app.innerHTML = '<div style="padding:40px 24px;text-align:center;color:#AE5F3F;font-weight:600;">Не удалось загрузить данные урока.<br>Проверь соединение и открой заново.</div>';
  });
