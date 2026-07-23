/* Домашка по вокалу — Telegram Mini App (без сборки).
   Роутинг: #/ — список уроков, #/lesson/1 — урок.
   Контент лежит в data/, код менять не нужно. */

"use strict";

var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
var app = document.getElementById("app");

var lessonsIndex = null;
var lessonCache = {};

/* ---------- утилиты ---------- */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function storeGet(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    return {};
  }
}

function storeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* приватный режим — молча пропускаем */ }
}

function storeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

function loadJSON(path) {
  return fetch(path).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + path);
    return r.json();
  });
}

/* ---------- иконки блоков ---------- */

var ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"/><path d="M17.5 2.5a2.1 2.1 0 0 1 3 3L13 13l-4 1 1-4Z"/></svg>'
};

function blockHead(iconName, iconClass, title) {
  return '<div class="block-head">' +
    '<span class="block-ico ' + iconClass + '">' + ICONS[iconName] + '</span>' +
    '<h2>' + esc(title) + '</h2>' +
    '</div>';
}

/* ---------- данные ---------- */

function getIndex() {
  if (lessonsIndex) return Promise.resolve(lessonsIndex);
  return loadJSON("data/lessons.json").then(function (data) {
    lessonsIndex = data;
    return data;
  });
}

function getLesson(id) {
  if (lessonCache[id]) return Promise.resolve(lessonCache[id]);
  return getIndex().then(function (idx) {
    var meta = null;
    for (var i = 0; i < idx.lessons.length; i++) {
      if (idx.lessons[i].id === id) { meta = idx.lessons[i]; break; }
    }
    if (!meta || !meta.ready) throw new Error("lesson not ready");
    return loadJSON(meta.file).then(function (data) {
      lessonCache[id] = data;
      return data;
    });
  });
}

/* ---------- роутер ---------- */

function parseRoute() {
  var h = location.hash.replace(/^#\/?/, "");
  if (h.indexOf("lesson/") === 0) {
    var id = parseInt(h.slice(7), 10);
    if (!isNaN(id)) return { view: "lesson", id: id };
  }
  return { view: "home" };
}

function render() {
  var route = parseRoute();
  window.scrollTo(0, 0);
  if (tg) {
    if (route.view === "lesson") tg.BackButton.show();
    else tg.BackButton.hide();
  }
  var task = route.view === "lesson" ? renderLesson(route.id) : renderHome();
  task.catch(function () {
    app.innerHTML = '<div class="wrap"><div class="error">Не удалось загрузить данные.<br>Проверь соединение и открой заново.</div></div>';
  });
}

/* ---------- главный экран ---------- */

function renderHome() {
  return getIndex().then(function (idx) {
    var byId = {};
    idx.lessons.forEach(function (l) { byId[l.id] = l; });
    var items = "";
    for (var i = 1; i <= idx.total; i++) {
      var meta = byId[i];
      if (meta && meta.ready) {
        items +=
          '<a class="lesson-card" href="#/lesson/' + i + '">' +
            '<div class="lesson-num">' + i + '</div>' +
            '<div class="lesson-info">' +
              '<div class="lesson-count">Урок ' + i + ' из ' + idx.total + '</div>' +
              '<div class="lesson-title">' + esc(meta.title) + '</div>' +
            '</div>' +
            '<div class="lesson-arrow">&rsaquo;</div>' +
          '</a>';
      } else {
        items +=
          '<div class="lesson-card locked">' +
            '<div class="lesson-num">' + i + '</div>' +
            '<div class="lesson-info">' +
              '<div class="lesson-count">Урок ' + i + ' из ' + idx.total + '</div>' +
              '<div class="lesson-title muted">Скоро</div>' +
            '</div>' +
            '<div class="badge">скоро</div>' +
          '</div>';
      }
    }
    app.innerHTML =
      '<div class="wrap">' +
        '<header class="home-head">' +
          '<h1>Домашка по вокалу</h1>' +
          '<p class="subtitle">Задания к урокам — проходи блоки по порядку</p>' +
        '</header>' +
        '<div class="lesson-list">' + items + '</div>' +
      '</div>';
  });
}

/* ---------- экран урока ---------- */

function renderLesson(id) {
  return getIndex().then(function (idx) {
    return getLesson(id).then(function (data) {
      var b = data.blocks;
      app.innerHTML =
        '<div class="wrap">' +
          '<a class="back-link" href="#/">&lsaquo; Все уроки</a>' +
          '<header class="lesson-head">' +
            '<div class="lesson-count">Урок ' + id + ' из ' + idx.total + '</div>' +
            '<h1>' + esc(data.title) + '</h1>' +
          '</header>' +
          '<section class="block">' + lectureHTML(b.lecture) + '</section>' +
          '<section class="block">' +
            blockHead("pencil", "ico-terra", b.quiz.title) +
            '<div id="quiz-main"></div>' +
          '</section>' +
          '<section class="block">' + chantsHTML(b.chants) + '</section>' +
          '<section class="block">' + songworkShellHTML(b.songwork) + '</section>' +
        '</div>';

      buildQuiz(document.getElementById("quiz-main"), b.quiz.questions, null);
      buildQuiz(
        document.getElementById("song-practice"),
        b.songwork.practice.questions,
        markedLine
      );
      b.songwork.excerpts.forEach(function (ex, i) {
        renderExcerpt(
          document.getElementById("excerpt-" + i),
          ex,
          "vocal-marks-l" + id + "-e" + i
        );
      });
    });
  });
}

/* ---------- блок: лекция ---------- */

function lectureHTML(lecture) {
  var html = blockHead("pencil", "ico-blue", lecture.title);
  lecture.sections.forEach(function (s) {
    html += "<h3>" + esc(s.heading) + "</h3>";
    s.paragraphs.forEach(function (p) {
      html += "<p>" + esc(p) + "</p>";
    });
  });
  return html;
}

/* ---------- блок: тест (универсальный) ---------- */

function buildQuiz(root, questions, optionRenderer) {
  var renderOption = optionRenderer || function (t) { return esc(t); };
  var answers = [];
  var checked = false;

  var html = "";
  questions.forEach(function (q, qi) {
    answers.push(null);
    html += '<div class="q">' +
      '<div class="q-text">' + (qi + 1) + ". " + esc(q.q) + "</div>" +
      '<div class="q-opts">';
    q.options.forEach(function (o, oi) {
      html += '<button type="button" class="opt" data-qi="' + qi + '" data-oi="' + oi + '">' +
        renderOption(o) + "</button>";
    });
    html += "</div></div>";
  });
  html += '<button type="button" class="btn check">Показать результат</button>' +
    '<div class="quiz-result hidden"></div>';
  root.innerHTML = html;

  var opts = root.querySelectorAll(".opt");
  Array.prototype.forEach.call(opts, function (btn) {
    btn.addEventListener("click", function () {
      if (checked) return;
      var qi = parseInt(btn.getAttribute("data-qi"), 10);
      answers[qi] = parseInt(btn.getAttribute("data-oi"), 10);
      var siblings = root.querySelectorAll('.opt[data-qi="' + qi + '"]');
      Array.prototype.forEach.call(siblings, function (b) { b.classList.remove("sel"); });
      btn.classList.add("sel");
    });
  });

  var checkBtn = root.querySelector(".btn.check");
  var resultEl = root.querySelector(".quiz-result");
  checkBtn.addEventListener("click", function () {
    if (!checked) {
      checked = true;
      var score = 0;
      questions.forEach(function (q, qi) {
        var siblings = root.querySelectorAll('.opt[data-qi="' + qi + '"]');
        Array.prototype.forEach.call(siblings, function (b) {
          var oi = parseInt(b.getAttribute("data-oi"), 10);
          if (oi === q.correct) b.classList.add("right");
          else if (answers[qi] === oi) b.classList.add("wrong");
        });
        if (answers[qi] === q.correct) score++;
      });
      var text = "Результат: " + score + " из " + questions.length;
      if (score === questions.length) text += " — отлично!";
      else if (score >= questions.length / 2) text += " — хорошо, просмотри ошибки.";
      else text += " — перечитай материал и попробуй ещё раз.";
      resultEl.textContent = text;
      resultEl.classList.remove("hidden");
      checkBtn.textContent = "Пройти ещё раз";
    } else {
      buildQuiz(root, questions, optionRenderer);
    }
  });
}

/* ---------- блок: распевки ---------- */

function chantsHTML(chants) {
  var html = blockHead("mic", "ico-blue", chants.title);
  chants.items.forEach(function (it) {
    html += '<div class="chant">' +
      '<span class="block-ico ico-blue">' + ICONS.mic + "</span>" +
      '<div class="chant-info">' +
        '<div class="chant-topic">' + esc(it.topic) + "</div>" +
        (it.description ? '<div class="chant-desc">' + esc(it.description) + "</div>" : "") +
        (it.audio
          ? '<audio controls preload="none" src="' + esc(it.audio) + '"></audio>'
          : '<div class="chant-soon">аудио появится позже</div>') +
      "</div></div>";
  });
  return html;
}

/* ---------- блок: упражнение с песней ---------- */

/* В текстах используются пометки [В] — полный вдох и [д] — добор */
function markedLine(line) {
  return esc(line)
    .split("[В]").join('<span class="mark mark-full" title="полный вдох">&#8744;</span>')
    .split("[д]").join('<span class="mark mark-catch" title="добор">&rsquo;</span>');
}

function legendHTML() {
  return '<div class="legend">' +
    '<span><span class="mark mark-full">&#8744;</span> полный вдох</span>' +
    '<span><span class="mark mark-catch">&rsquo;</span> добор</span>' +
    "</div>";
}

function songworkShellHTML(sw) {
  var html = blockHead("notes", "ico-terra", sw.title);
  sw.lecture.paragraphs.forEach(function (p) {
    html += "<p>" + esc(p) + "</p>";
  });
  html += legendHTML();
  html += "<p><strong>" + esc(sw.example.intro) + "</strong></p>";
  html += '<div class="song-example">';
  sw.example.lines.forEach(function (line) {
    html += '<div class="x-line">' + markedLine(line) + "</div>";
  });
  html += "</div>";
  html += "<h3>Проверь себя</h3>";
  html += '<div id="song-practice"></div>';
  html += "<h3>Теперь сам</h3>";
  html += '<p class="hint">Нажимай на точки между словами: один раз — полный вдох, два раза — добор, три — убрать пометку. Разметка сохраняется на твоём устройстве.</p>';
  sw.excerpts.forEach(function (ex, i) {
    html += '<div class="excerpt">' +
      '<div class="excerpt-title">' + esc(ex.title) + "</div>" +
      '<div id="excerpt-' + i + '"></div>' +
      "</div>";
  });
  return html;
}

/* интерактивная разметка дыхания в отрывке */

function gapChar(state) {
  if (state === "full") return "∨";
  if (state === "catch") return "’";
  return "·";
}

function gapHTML(id, state) {
  return '<button type="button" class="gap' + (state ? " " + state : "") +
    '" data-id="' + id + '" data-state="' + (state || "") + '">' +
    gapChar(state) + "</button>";
}

function renderExcerpt(root, excerpt, storageKey) {
  var saved = storeGet(storageKey);
  var html = "";
  excerpt.lines.forEach(function (line, li) {
    var words = line.split(" ");
    html += '<div class="x-line">';
    words.forEach(function (w, wi) {
      html += '<span class="w">' + esc(w) + "</span>";
      var gapId = li + "-" + wi;
      if (wi < words.length - 1) html += gapHTML(gapId, saved[gapId]);
    });
    html += gapHTML(li + "-end", saved[li + "-end"]);
    html += "</div>";
  });
  html += '<button type="button" class="btn ghost reset">Сбросить разметку</button>';
  root.innerHTML = html;

  var gaps = root.querySelectorAll(".gap");
  Array.prototype.forEach.call(gaps, function (g) {
    g.addEventListener("click", function () {
      var id = g.getAttribute("data-id");
      var cur = g.getAttribute("data-state") || "";
      var next = cur === "" ? "full" : (cur === "full" ? "catch" : "");
      g.setAttribute("data-state", next);
      g.className = "gap" + (next ? " " + next : "");
      g.textContent = gapChar(next);
      var marks = storeGet(storageKey);
      if (next) marks[id] = next;
      else delete marks[id];
      storeSet(storageKey, marks);
    });
  });

  root.querySelector(".reset").addEventListener("click", function () {
    storeRemove(storageKey);
    renderExcerpt(root, excerpt, storageKey);
  });
}

/* ---------- запуск ---------- */

if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#F2ECE7");
    tg.setBackgroundColor("#F2ECE7");
  } catch (e) {}
  tg.BackButton.onClick(function () {
    location.hash = "#/";
  });
}

window.addEventListener("hashchange", render);
render();
