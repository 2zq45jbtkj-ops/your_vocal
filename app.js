/* Курс вокала — Telegram Mini App (без сборки).
   Экраны и поведение перенесены из дизайн-хэндоффа один в один.
   Контент урока лежит в data/, код менять не нужно. */

"use strict";

// ?reset=1 в адресе — чистит локальный прогресс/данные ученика на этом устройстве.
if (location.search.indexOf("reset=1") !== -1) {
  try { localStorage.removeItem("vocal-app"); } catch (e) {}
}

var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
// Открыто не из Telegram (Safari/Chrome или значок «ДЗ» на экране телефона):
// скрипт Telegram на странице есть, но initData пустая — работаем как обычный
// сайт, без кнопок Telegram. Назад — своими кнопками на экранах и жестом/кнопкой
// «Назад» телефона (см. history ниже).
if (tg && !tg.initData) tg = null;
var BROWSER_MODE = !tg;
if (BROWSER_MODE) document.documentElement.classList.add("browser-mode");

// Личная ссылка из бота: ?k=<код доступа ученика>. Тот же код, что ученик
// вводит вручную на экране входа, — новых секретов нет. Ссылка остаётся в
// адресе, чтобы «На экран Домой» сохранил её в значке (у значка на iPhone своё
// хранилище, отдельное от Safari).
var LINK_TOKEN = (function () {
  var m = /[?&]k=([0-9a-fA-F-]{36})(?:&|$)/.exec(location.search);
  return m ? m[1].toLowerCase() : null;
})();
if (LINK_TOKEN) {
  try {
    var _saved = JSON.parse(localStorage.getItem("vocal-app") || "null");
    // на этом устройстве раньше был другой ученик — его прогресс не смешиваем
    // вход Николая (админ) по личной ссылке не сбрасываем — иначе значок
    // каждый раз выкидывал бы его из режима админа
    if (_saved && !_saved.isAdmin && !localStorage.getItem("vocal-admin") && _saved.accessToken && _saved.accessToken !== LINK_TOKEN) localStorage.removeItem("vocal-app");
  } catch (e) {}
}
var app = document.getElementById("app");

var BAZA_API = "https://baza-dannih.vercel.app";

// Сообщаем baza-dannih свой Telegram chat_id, чтобы бот мог написать ученику
// первым (например, прислать домашнее задание) — без этого бот может только
// отвечать, если ученик написал первым. Шлём один раз за сессию приложения;
// неудача тихо откатывается, попробуем снова при следующем вызове.
var _chatIdSynced = false;
function syncTelegramChatId() {
  if (_chatIdSynced || !state.accessToken || !state.chatId) return;
  _chatIdSynced = true;
  fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(state.accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: state.chatId })
  }).catch(function () { _chatIdSynced = false; });
}

var TOTAL_LESSONS = 30;
var LESSON = null; // текущий урок: data/lesson-01.json либо план из lesson-plans.json
var LESSON_ONE = null; // урок 1 целиком — единственный со своими mp3

// Vercel режет тело запроса примерно на уровне ~4.5 МБ — держим запас.
// Видео сверх этого лимита (по умолчанию — снятое обычной камерой телефона,
// без ограничений по качеству/длительности) уходит преподавателю не через
// сервер, а напрямую в Telegram-чат с ботом.
var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/* Единый знак «Внимание» для всего приложения (21.11, просьба Николая):
   красный треугольник с белым восклицательным знаком. Используй icoWarn(size)
   везде, где нужно срочно обратить внимание ученика. */
function icoWarn(size) {
  size = size || 22;
  return '<svg class="ico-warn" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 3.5L2.8 19.5h18.4L12 3.5z" fill="#E5484D" stroke="#E5484D" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M12 9.6v4.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1.25" fill="#fff"/></svg>';
}
window.icoWarn = icoWarn;
var TEACHER_BOT_USERNAME = "your_vocal_teacher_bot";

/* ---------- состояние ---------- */

var state = {
  screen: "token-entry",
  accessToken: null,       // UUID из baza-dannih — ученик вводит один раз
  studentPublicData: null, // ответ от /api/student-public (обнуляется при открытии)
  tgId: "", chatId: null, firstName: "", lastName: "", birthDate: "",
  unlockedLessons: [], progressByLesson: {}, comingSoonLessonNum: null,
  // «Режим админа» — см. loadIsAdmin/enterAdminMode ниже
  isAdmin: false, isAdminLoadedFor: null, adminStudentsList: null, adminBirthdaysList: null,
  adminMode: false, adminStudentName: "", adminSnapshot: null,
  // «Планы уроков» в режиме админа: индекс открытого плана и раскрытая секция.
  // В localStorage не пишутся (не в списке полей saveState) — живут только в сессии.
  adminPlanIdx: null, adminPlanSection: "lecture",
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
  darkMode: true, notifOn: true, // раздел «Ещё»; darkMode хранится отдельным ключом (см. loadDarkMode)
  // transient (не сохраняется):
  playerIdx: null, playerElapsed: 0, durations: {}, openSettings: {},
  songPlayerKey: null, songPlayerElapsed: 0, songDurations: {}, songOpenSettings: {},
  songRevealed: {}, songSelectedMark: {},
  _profileErr: null, // "net" | "server" — почему не загрузился Кабинет, см. loadStudentPublicData
  _openingOwnCabinet: false, // идёт поиск своей карточки, см. openOwnCabinet
  _adminStudentsErr: false,  // список учеников не загрузился (а не «пуст»)
  _srezCompare: [],          // id срезов, выбранных для сравнения на колесе
  _srezTopicsOpen: false,    // список тем под колесом: раскрыт/свёрнут (жмём по колесу)
  _wheelZone: null,
  _wheelLvl: null,           // выбранный блок колеса (уровень A–D); null — первый по порядку          // номер зоны, подсвеченной после нажатия на точку колеса
  _ownCabinetMsg: null,      // "not-found" | "no-token" | "net" — почему не открылась своя карточка
  feedbackMood: null, feedbackText: "", coursesFilter: null,
  pendingUnstar: null, pendingUnstarData: null, pendingUnstarSecs: 0,
  docKey: null,              // какой текст открыт на экране "doc": offer|privacy|about
  _hwReminderShown: false,   // шторку с дедлайном показываем один раз за сессию
  _hwBusy: {}                // hwKey -> true, пока запрос «выполнено» в полёте
};

var audioEls = {};
var songAudioEls = {};

function saveState() {
  // В «Режиме админа» (Николай зашёл в кабинет ученика для диагностики) —
  // ничего не пишем в общий localStorage, иначе тестовые действия админа
  // перезаписали бы его собственный логин/прогресс на этом устройстве.
  if (state.adminMode) return;
  // Тест-драйв гостя (guest.js) — только в памяти, общий вход не трогаем
  if (window.GUEST_ON) return;
  try {
    localStorage.setItem("vocal-app", JSON.stringify({
      accessToken: state.accessToken,
      tgId: state.tgId, chatId: state.chatId, firstName: state.firstName, lastName: state.lastName,
      birthDate: state.birthDate,
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
      favorites: state.favorites, notifOn: state.notifOn,
      isAdmin: state.isAdmin,
      // Токен преподавателя для базы: без него после перезапуска приложения
      // Николай оставался «админом», но загрузка дорожек и списки песен
      // получали отказ 401.
      _siteAuth: state.isAdmin ? (state._siteAuth || "") : ""
    }));
  } catch (e) {}
}

/* «Тёмная тема» — отдельный ключ localStorage, как в дизайн-файле (vocalAppDarkMode).
   Сама тема — класс .dark на <html>, все цвета/тени переопределены через
   CSS-переменные в styles.css (см. блок html.dark в начале файла). */
function loadDarkMode() {
  // По умолчанию — тёмная тема; светлая только если ученик сам её включил («0»).
  state.darkMode = true;
  try { state.darkMode = localStorage.getItem("vocalAppDarkMode") !== "0"; } catch (e) {}
}
function applyDarkMode() {
  document.documentElement.classList.toggle("dark", !!state.darkMode);
  // Цвет верхнего края (часы на iPhone, значок «ДЗ» на экране «Домой») — под тему
  var tcm = document.querySelector('meta[name="theme-color"]');
  if (tcm && !window.__splashOn) tcm.setAttribute("content", state.darkMode ? "#232A2E" : "#F1EEE8");
  if (tg) {
    try {
      tg.setHeaderColor(state.darkMode ? "#232A2E" : "#F1EEE8");
      tg.setBackgroundColor(state.darkMode ? "#232A2E" : "#F1EEE8");
    } catch (e) {}
  }
}
function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  try { localStorage.setItem("vocalAppDarkMode", state.darkMode ? "1" : "0"); } catch (e) {}
  render();
}

/* Ключи Николая запоминаются отдельно от прогресса ученика (свой ключ
   localStorage): их не стирают ни смена личной ссылки, ни «Сбросить прогресс»,
   ни обновление приложения. Спросим заново, только если сайт отзовёт токен
   (смена пароля сайта → 401). */
var ADMIN_KEY = "vocal-admin";
function saveAdminKey(t) { try { if (t) localStorage.setItem(ADMIN_KEY, JSON.stringify({ t: t })); } catch (e) {} }
function readAdminKey() { try { var a = JSON.parse(localStorage.getItem(ADMIN_KEY) || "null"); return (a && a.t) || ""; } catch (e) { return ""; } }
function forgetAdminKey() { try { localStorage.removeItem(ADMIN_KEY); } catch (e) {} }
/* 20.11 (Николай): ключи админа запоминаются, но сам режим админа
   включается и выключается вручную в «Ещё». По умолчанию выключен —
   Николай в своём аккаунте такой же ученик, как все. */
var ADMIN_ON_KEY = "vocal-admin-on";
function adminOnGet() { try { return localStorage.getItem(ADMIN_ON_KEY) === "1"; } catch (e) { return false; } }
function adminOnSet(on) { try { if (on) localStorage.setItem(ADMIN_ON_KEY, "1"); else localStorage.removeItem(ADMIN_ON_KEY); } catch (e) {} }
function cleanOwnName(n) { return String(n || "").replace(/\s*\((admin|тест|test)\)\s*/ig, " ").replace(/\s+/g, " ").trim(); }

function loadState() {
  loadStateRaw();
  var t = readAdminKey();
  if (t) {
    if (!state.accessToken) {
      // своей карточки на телефоне ещё нет — находим её (нужен доступ админа)
      state.isAdmin = true; state._siteAuth = t; state.screen = "profile";
    } else {
      state.isAdmin = adminOnGet(); state._siteAuth = state.isAdmin ? t : "";
      state.screen = "courses"; // 21.11: Николай просил открывать сразу «Уроки», а не админ-панель
    }
  } else if (state.isAdmin && state._siteAuth) {
    saveAdminKey(state._siteAuth); // вход, сохранённый до отдельного ключа
  }
}

function loadStateRaw() {
  try {
    var raw = localStorage.getItem("vocal-app");
    if (!raw) return;
    var s = JSON.parse(raw);
    for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) state[k] = s[k]; }
    // Вход админа, сохранённый до того, как начали хранить токен: без токена
    // база ничего не даёт загрузить — один раз просим ключи заново.
    if (state.isAdmin && !state._siteAuth) { state.isAdmin = false; state.screen = "token-entry"; return; }
    // 20.11: админ и своя карточка — один аккаунт: сразу кабинет ученика
    if (state.isAdmin) state.screen = state.accessToken ? "courses" : "profile";
    else if (state.accessToken) state.screen = "courses";
    else if (state.tgId && state.firstName && state.lastName) state.screen = "courses";
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
    // 22.11: окно «Готово на 100%» с конфетти убрано по просьбе Николая —
    // теперь празднуют финальные заставки шагов (renderStepDone)
  }
}

/* ---------- отправка домашки преподавателю в Telegram ---------- */

function baseSubmitFields() {
  var f = new FormData();
  f.append("firstName", state.firstName || "");
  f.append("lastName", state.lastName || "");
  f.append("tgId", state.tgId || "");
  if (state.adminMode) f.append("adminTest", "1"); // видно в api/submit.js — отмечает тестовое действие Николая
  f.append("chatId", state.chatId || "");
  f.append("lessonTitle", LESSON ? LESSON.title : "");
  f.append("lessonNo", LESSON && LESSON.id ? String(LESSON.id) : "");
  // подпись Telegram: бот записи по ней узнаёт ученика и кладёт сдачу в «Ученики» → «ДЗ»
  f.append("initData", (tg && tg.initData) || "");
  // вне Telegram подписи нет — бот записи узнаёт ученика по коду доступа
  if (!state.adminMode) f.append("accessToken", state.accessToken || "");
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
    if (meta.note) f.append("note", meta.note); // подпись к видео (тренажёр: упражнение и плечи)
  }
  fetch("/api/submit", { method: "POST", body: f })
    .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
    .then(function (data) { if (data.ok) trackEv("hw_sent", { kind: kind, lesson: LESSON && LESSON.id ? LESSON.id : null }); onStatus(data.ok ? "sent" : "error"); })
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
  lock: '<svg width="14" height="16" viewBox="0 0 14 16" fill="none"><rect x="1" y="7" width="12" height="8" rx="2" stroke="var(--locked)" stroke-width="1.5"/><path d="M4 7V4.5a3 3 0 016 0V7" stroke="var(--locked)" stroke-width="1.5"/></svg>',
  chevron: '<svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="var(--disabled)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stepCheck: '<svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5l4 4 7-8" stroke="var(--white-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="var(--white-text)" stroke-width="1.4"/><path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="var(--white-text)" stroke-width="1.2" stroke-linecap="round"/></svg>',
  // «Тест пройден»: в дизайне цвет ровно var(--blue) — работает и на .result-badge
  // (фон var(--bg), следует теме), и на .celebrate-badge (фон var(--soft-terra), фикс)
  resultCheck: '<svg width="26" height="20" viewBox="0 0 26 20" fill="none"><path d="M2 10l8 8L24 2" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seekBack: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4v6h6" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15a8 8 0 1 0 2-9.5L4 10" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seekFwd: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 4v6h-6" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 15a8 8 0 1 1-2-9.5L20 10" stroke="oklch(56% 0.09 235)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M1 1l10 6-10 6V1z" fill="var(--white-text)"/></svg>',
  pause: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="10" rx="1" fill="var(--white-text)"/><rect x="7" y="1" width="4" height="10" rx="1" fill="var(--white-text)"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  uploadTerra: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5" stroke="oklch(38% 0.1 38)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="oklch(38% 0.1 38)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  // на .hw-icon с фоном var(--soft-blue)/var(--soft-terra) (не реагируют на тему) — оставлен фиксированным
  hwCheck: '<svg width="15" height="12" viewBox="0 0 15 12" fill="none"><path d="M1 6l4 4 9-9" stroke="oklch(28% 0.015 70)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  micIcon: function (color) { return '<svg width="12" height="16" viewBox="0 0 12 16" fill="none"><rect x="3" y="1" width="6" height="10" rx="3" stroke="' + color + '" stroke-width="1.4"/><path d="M1.5 8.5a4.5 4.5 0 009 0M6 13v2" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round"/></svg>'; },
  notesIcon: function (color) { return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="11" r="2.2" stroke="' + color + '" stroke-width="1.4"/><circle cx="11" cy="9" r="2.2" stroke="' + color + '" stroke-width="1.4"/><path d="M6.2 11V2.5L13.2 1v6.5" stroke="' + color + '" stroke-width="1.4"/></svg>'; },
  dockPerson: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.5" r="3.3" stroke="' + c + '" stroke-width="1.6"/><path d="M3.5 17c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>'; },
  dockLessons: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="' + c + '" stroke-width="1.6"/><path d="M6.5 8h7M6.5 12h4.5" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>'; },
  dockQuestion: function (c) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="' + c + '" stroke-width="1.6"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="13.5" r="1.1" fill="' + c + '"/><circle cx="12" cy="13.5" r="1.1" fill="' + c + '"/></svg>'; },
  dockMore: function (c) { return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="4.5" cy="10" r="1.6" fill="' + c + '"/><circle cx="10" cy="10" r="1.6" fill="' + c + '"/><circle cx="15.5" cy="10" r="1.6" fill="' + c + '"/></svg>'; },
  gear: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 5.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z" stroke="var(--gray)" stroke-width="1.3"/><path d="M8 1.3v1.4M8 13.3v1.4M14.7 8h-1.4M2.7 8H1.3M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1" stroke="var(--gray)" stroke-width="1.3" stroke-linecap="round"/></svg>',
  chevronRight: '<svg width="7" height="12" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="var(--disabled)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2.5 4h11M6 4V2.5h4V4M3.5 4l.6 9a1.5 1.5 0 001.5 1.4h4.8a1.5 1.5 0 001.5-1.4l.6-9" stroke="oklch(53% 0.18 25)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: function (filled) {
    var stroke = filled ? "oklch(84% 0.15 92)" : "var(--gray)";
    var fill = filled ? "oklch(84% 0.15 92)" : "none";
    return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.3l1.9 4.1 4.5.5-3.4 3 .9 4.4L8 11.2l-3.9 2.1.9-4.4-3.4-3 4.5-.5L8 1.3z" stroke="' + stroke + '" fill="' + fill + '" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  }
};

/* Своя стрелка «назад» нужна только вне Telegram (Safari/Chrome, значок «ДЗ»
   на экране телефона). В Telegram на этих экранах уже есть его системная
   кнопка «Назад» (tg.BackButton в render()) — вторая стрелка не нужна. */
function backBtn(handlerName) {
  if (!BROWSER_MODE) return "";
  return '<button class="back-btn" data-act="' + handlerName + '">' + SVG.back + "</button>";
}

/* ---------- навигация ---------- */

function go(screen) {
  // каждый новый вход в лекцию заново спрашивает уровень (упрощённая / подробная)
  if (screen === "lecture" && state.screen !== "lecture") { state._lectureLevel = null; state._llevelSkip = false; }
  state.screen = screen;
  if (BROWSER_MODE) pushBackEntry();
  render();
}

/* Вне Telegram нет его кнопки «Назад»: системная «Назад» на Android и жест на
   iPhone листают историю страницы. Держим одну запись истории «над» приложением:
   нажали «Назад» — откатываемся на экран выше (как Telegram BackButton) и снова
   ставим запись. На главных экранах запись не ставим, там «Назад» закрывает. */
function pushBackEntry() {
  var t = state.screen === "quiz" || backTarget();
  if (t && !(history.state && history.state.dzBack)) {
    try { history.pushState({ dzBack: 1 }, "", location.href); } catch (e) {}
  }
}
if (BROWSER_MODE) {
  window.addEventListener("popstate", function () {
    if (state.screen === "quiz" || backTarget()) {
      handleBack();
      pushBackEntry();
    }
  });
}

function backTarget() {
  switch (state.screen) {
    case "name": return "tg";
    case "lesson-home": return "courses";
    case "favorites": return "courses";
    case "lesson-soon": return "courses";
    case "cab-lessons": case "cab-hw": case "cab-voice": case "cab-wheel": return "profile";
    case "doc": return "more";
    case "support": return "more";
    case "admin-hub": return "more";
    case "admin-students": return "admin-hub";
    case "admin-birthdays": return "admin-hub";
    case "admin-dash": return "admin-hub";
    case "admin-guests": return "admin-hub";
    case "admin-plans": return "admin-hub";
    case "admin-screens": return "admin-hub";
    case "admin-plan": return "admin-plans";
    case "karaoke": return "profile";
    case "token-entry": return state._afterAdminLogin ? "karaoke" : null;
    case "karaoke-play": return (window.KAR && KAR.fromAdmEdit) ? "admin-karaoke-edit" : "karaoke";
    case "pitch": return "profile";
    case "bylo": return "profile";
    case "trainer": case "trainer-ex": case "trainer-rec": case "trainer-done": return window.trainerBackTarget ? trainerBackTarget() : "profile";
    case "pitch-topic": return "pitch";
    case "pitch-sing": case "pitch-score": return "pitch-topic";
    case "admin-karaoke": return "admin-hub";
    case "admin-karaoke-songs": return (window.KAR && KAR.adm && KAR.adm.fromKar) ? "karaoke" : "admin-karaoke";
    case "admin-karaoke-edit": return "admin-karaoke-songs";
    case "lecture": case "warmups": case "song": case "quiz-result": return "lesson-home";
    case "step-done": case "lesson-master": return state._preview ? "admin-screens" : "lesson-home";
    case "feedback": return "song";
    case "quiz": return null; // отдельная логика
    default: return null;
  }
}

function handleBack() {
  // открыт слой «Газообмен» — «Назад» закрывает только его
  if (window.BreathAnim && BreathAnim.closeOverlay()) return;
  if (state.screen === "quiz") {
    if (state.quizIndex > 0) { state.quizIndex--; render(); }
    else go("lesson-home");
    return;
  }
  // «Тестовые клиенты»: из истории гостя — сначала к списку
  if (window.GUEST && GUEST.adminBack()) return;
  var t = backTarget();
  if (t) go(t);
}

/* ---------- экраны ---------- */

function renderTokenEntry() {
  var val = state._tokenInput || "";
  var val2 = state._adminKey2 || "";
  var err = state._tokenError || "";
  // 13 Latin letters (no digits/dashes) → admin key pattern
  var isAdminKey = /^[A-Za-z]{13}$/.test(val);
  var btnEnabled = isAdminKey ? !!val2.trim() : !!val.trim();

  app.innerHTML =
    '<div class="auth-screen">' +
      '<div class="auth-logo">' + SVG.telegram + "</div>" +
      '<div class="auth-title">' + (isAdminKey ? "Вход администратора" : "Кабинет ученика") + "</div>" +
      '<div class="auth-sub">' + (isAdminKey
        ? "Введи второй ключ для подтверждения доступа."
        : "Введи код доступа, который тебе отправил преподаватель.") + "</div>" +
      '<label class="field-label">' + (isAdminKey ? "КЛЮЧ 1" : "КОД ДОСТУПА") + "</label>" +
      '<input id="token-input" class="field-input" type="text"' +
        ' placeholder="' + (isAdminKey ? "·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx") + '"' +
        ' value="' + esc(val) + '" autocorrect="off" autocapitalize="none" spellcheck="false">' +
      (isAdminKey
        ? '<label class="field-label" style="margin-top:14px;">КЛЮЧ 2</label>' +
          '<input id="admin-key2" class="field-input" type="text"' +
          ' placeholder="·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·"' +
          ' value="' + esc(val2) + '" autocorrect="off" autocapitalize="none" spellcheck="false">'
        : "") +
      (err ? '<div style="color:oklch(56% 0.18 25);font-size:13px;margin-top:8px;">' + esc(err) + "</div>" : "") +
      '<div class="spacer"></div>' +
      '<button id="token-next" class="cta"' + (btnEnabled ? "" : " disabled") + ">Войти</button>" +
    "</div>";

  var input = document.getElementById("token-input");
  var btn = document.getElementById("token-next");

  input.addEventListener("input", function () {
    var prev = state._tokenInput || "";
    var wasAdmin = /^[A-Za-z]{13}$/.test(prev);
    state._tokenInput = input.value.trim();
    var nowAdmin = /^[A-Za-z]{13}$/.test(state._tokenInput);
    if (wasAdmin !== nowAdmin) {
      state._adminKey2 = "";
      state._tokenError = "";
      render();
    } else {
      btn.disabled = nowAdmin ? !(state._adminKey2 || "").trim() : !state._tokenInput;
    }
  });

  if (isAdminKey) {
    var input2 = document.getElementById("admin-key2");
    input2.addEventListener("input", function () {
      state._adminKey2 = input2.value.trim();
      btn.disabled = !state._adminKey2;
    });
  }

  btn.addEventListener("click", function () {
    var key1 = (state._tokenInput || "").trim();
    if (!key1) return;

    if (/^[A-Za-z]{13}$/.test(key1)) {
      // Двухключевой вход администратора
      var key2 = (state._adminKey2 || "").trim();
      if (!key2) return;
      btn.disabled = true;
      btn.textContent = "Проверяем…";
      fetch(BAZA_API + "/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key1: key1, key2: key2 })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            state.isAdmin = true;
            // Токен преподавателя: /api/students в baza-dannih закрыт и без
            // него отвечает 401 (api/_auth.js). Тот же токен выдаёт пароль
            // от сайта — обе пары подтверждают, что это Николай.
            state._siteAuth = data.token || "";
            saveAdminKey(state._siteAuth);
            state._tokenInput = "";
            state._adminKey2 = "";
            state._tokenError = "";
            saveState();
            // пришёл из «Караоке» своей карточки — сразу туда же, уже админом
            if (state._afterAdminLogin === "karaoke") {
              state._afterAdminLogin = null; state._goKaraoke = "new";
              openOwnCabinet();
              return;
            }
            openOwnCabinet(); // 20.11: сразу своя карточка ученика, админка — в «Ещё»
          } else {
            state._tokenError = "Неверные ключи. Попробуй ещё раз.";
            btn.disabled = false;
            btn.textContent = "Войти";
            render();
          }
        })
        .catch(function () {
          state._tokenError = "Нет соединения. Проверь интернет и попробуй ещё раз.";
          btn.disabled = false;
          btn.textContent = "Войти";
          render();
        });
    } else {
      // Обычный вход ученика по UUID-токену
      btn.disabled = true;
      btn.textContent = "Проверяем…";
      var loginStatus = 0;
      fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(key1))
        .then(function (r) { loginStatus = r.status; return r.json(); })
        .then(function (data) {
          if (data && data.student) {
            state.accessToken = key1;
            state.studentPublicData = data;
            state._tokenInput = "";
            state._tokenError = "";
            state.firstName = data.student.name.split(" ")[0] || data.student.name;
            state.lastName = data.student.name.split(" ").slice(1).join(" ") || "";
            saveState();
            syncTelegramChatId();
            go("profile");
          } else {
            // Не врём про «код не найден», если на самом деле упал сервер:
            // 404 — кода действительно нет, всё остальное — сбой на нашей стороне.
            state._tokenError = (loginStatus === 404 || loginStatus === 400)
              ? "Код не найден. Попроси преподавателя прислать правильный код."
              : "Сервер не отвечает. Код, скорее всего, верный — попробуй ещё раз через минуту.";
            btn.disabled = false;
            btn.textContent = "Войти";
            render();
          }
        })
        .catch(function () {
          state._tokenError = "Нет соединения. Проверь интернет и попробуй ещё раз.";
          btn.disabled = false;
          btn.textContent = "Войти";
          render();
        });
    }
  });
}

function renderTg() { renderTokenEntry(); }

function renderName() {
  app.innerHTML =
    '<div class="auth-screen">' +
      backBtn("back") +
      '<div class="auth-title">Как тебя зовут?</div>' +
      '<div class="auth-sub tight">Укажи фамилию и имя на русском, так тебя увидит преподаватель в приложении.</div>' +
      '<label class="field-label">ФАМИЛИЯ</label>' +
      '<input id="ln-input" class="field-input mb" type="text" placeholder="Иванова" value="' + esc(state.lastName) + '">' +
      '<label class="field-label">ИМЯ</label>' +
      '<input id="fn-input" class="field-input mb" type="text" placeholder="Мария" value="' + esc(state.firstName) + '">' +
      '<label class="field-label">ДАТА РОЖДЕНИЯ</label>' +
      '<input id="bd-input" class="field-input" type="tel" inputmode="numeric" autocomplete="off" placeholder="ДД.ММ.ГГГГ" maxlength="10" value="' + esc(state.birthDate) + '">' +
      '<div class="spacer"></div>' +
      // Явный отступ над кнопкой (независимо от .spacer, который схлопывается
      // при открытой клавиатуре — контента больше, чем видимой высоты). Равен
      // нижнему padding .auth-screen (28px), чтобы при открытой клавиатуре
      // зазор сверху и зазор до клавиатуры снизу были визуально одинаковыми.
      '<button id="name-next" class="cta" style="margin-top:28px;"' + (state.firstName.trim() && state.lastName.trim() ? "" : " disabled") + ">Начать обучение</button>" +
    "</div>";

  var fn = document.getElementById("fn-input");
  var ln = document.getElementById("ln-input");
  var bd = document.getElementById("bd-input");
  var btn = document.getElementById("name-next");
  function upd() {
    state.firstName = fn.value;
    state.lastName = ln.value;
    btn.disabled = !(state.firstName.trim() && state.lastName.trim());
  }
  fn.addEventListener("input", upd);
  ln.addEventListener("input", upd);
  // Без нативного календаря (на мобильном он «плыл» — Reset/галочка съезжали,
  // накладывались на текст): просто цифровая клавиатура (type=tel) и маска
  // ДД.ММ.ГГГГ — точки расставляются сами по мере ввода цифр.
  bd.addEventListener("input", function () {
    bd.value = formatBirthDateInput(bd.value);
    bd.setSelectionRange(bd.value.length, bd.value.length); // курсор всегда в конце — ввод только «дописыванием» цифр
    state.birthDate = bd.value;
  });
  // Имя и дата рождения остаются только на устройстве — для приветствия в
  // интерфейсе. Карточку ученика в базе Николай создаёт сам на baza-dannih и
  // выдаёт код доступа; приложение больше никого не заводит в базе само.
  btn.addEventListener("click", function () {
    saveState();
    go("courses");
  });
  wireActs();
}

/* Маска даты рождения: пользователь вводит только цифры (номерная клавиатура,
   без нативного календаря — на мобильном он визуально ломался), точки
   расставляются сами. Формат строго ДД.ММ.ГГГГ (день-месяц-год, не американский). */
function formatBirthDateInput(raw) {
  var digits = raw.replace(/\D/g, "").slice(0, 8); // ДДММГГГГ, максимум 8 цифр
  var day = digits.slice(0, 2), month = digits.slice(2, 4), year = digits.slice(4, 8);
  var out = day;
  if (month) out += "." + month;
  if (year) out += "." + year;
  return out;
}

/* Статус урока = число пройденных из 4 шагов (Лекция/Тест/Распевки/Песня).
   0 = не начат, 1-3 = в работе, 4 = завершён (Песня засчитывается по тому
   же флагу songDone, что и автопроверка интерактивной разметки — она
   выставляется в момент, когда ученик завершает разметку и жмёт
   «Завершить урок»). Те же 4 флага использует и степпер на lesson-home —
   один источник правды для прогресса везде.

   Урок n по умолчанию — открытый сейчас урок (LESSON.id||1): для него шаги
   берём из локальных флагов устройства (актуальны мгновенно). Для любого
   другого номера — из progressByLesson, который приходит из baza-dannih
   (см. loadStudentPublicData/api/student-public.js). Так работает и
   для уроков, которых пока физически нет в приложении (данные появятся,
   когда Николай добавит контент) — счётчики и разблокировка уже готовы. */
function lessonStepsDone(n) {
  var lessonId = (LESSON && LESSON.id) || 1;
  if (n == null) n = lessonId;
  if (n === lessonId) {
    var s = state, c = 0;
    if (s.lectureViewed) c++;
    if (s.quizDone) c++;
    if (s.warmupsDone) c++;
    if (s.songDone) c++;
    return c;
  }
  var p = state.progressByLesson && state.progressByLesson[n];
  if (!p) return 0;
  var c2 = 0;
  if (p.lecture) c2++;
  if (p.quiz) c2++;
  if (p.warmups) c2++;
  if (p.song) c2++;
  return c2;
}
function lessonStatus(n) {
  var steps = lessonStepsDone(n);
  if (steps === 0) return "not-started";
  if (steps === 4) return "completed";
  return "in-progress";
}
/* первый непройденный шаг — для входа в урок из фильтра «В работе» сразу
   с нужного места, а не с начала */
function firstIncompleteStepScreen() {
  var s = state;
  if (!s.lectureViewed) return "lecture";
  if (!s.quizDone) return "quiz";
  if (!s.warmupsDone) return "warmups";
  if (!s.songDone) return "song";
  return "lesson-home";
}

/* Число уроков в работе/завершённых — по ВСЕМ 30 урокам (не только открытому
   сейчас): урок 1 — по локальным флагам, остальные — по progressByLesson из
   Notion. Запертые уроки сюда никогда не попадают — у них 0 шагов и статус
   not-started, который не считается ни в completed, ни в inProgress. */
function lessonStats() {
  var completed = 0, inProgress = 0;
  for (var n = 1; n <= TOTAL_LESSONS; n++) {
    if (!lessonUnlocked(n)) continue;
    var st = lessonStatus(n);
    if (st === "completed") completed++;
    else if (st === "in-progress") inProgress++;
  }
  return { completed: completed, inProgress: inProgress };
}

/* Коля (17.11): короткие названия тем вместо «Урок N» (плитки и дорожная карта).
   Уроки 1–23 — по data/lesson-plans.json, 24–30 — по каталогу тем в базе. */
var LESSON_SHORT = [
  "Дыхание", "Сила голоса", "Регистры", "Атака звука", "Гортань",
  "Интонация", "Переходные ноты", "Дикция", "Громко и тихо", "Гигиена голоса",
  "Голосовые складки", "Ложные складки", "Щитовидный хрящ", "Перстневидный хрящ", "Черпаловидные хрящи",
  "Яркость звука", "Бэлтинг", "Микст", "Вибрато", "Слух",
  "Фразировка", "Мелизмы", "Без срывов", "Артикуляция", "Мягкое нёбо",
  "Язык", "Челюсть", "Губы", "Анкеровка", "Сочетание приёмов"
];
function lessonShortName(n) { return LESSON_SHORT[n - 1] || "Урок " + n; }

function roadmapCardHtml(mode, n) {
  var s = state;
  var isOpenLesson = LESSON && n === (LESSON.id || 1);
  var act;
  if (isOpenLesson) {
    act = mode === "review" ? "open-lesson-review" : mode === "continue" ? "open-lesson-continue" : "open-lesson";
  } else {
    act = "open-lesson-num"; // номер урока берём из data-lesson-num на карточке
  }
  var p = isOpenLesson
    ? { lecture: s.lectureViewed, quiz: s.quizDone, warmups: s.warmupsDone, song: s.songDone }
    : (state.progressByLesson && state.progressByLesson[n]) || {};
  var steps = [
    { label: isOpenLesson ? "Лекция «" + esc(LESSON.title) + "»" : "Лекция", done: !!p.lecture },
    { label: "Тест", done: !!p.quiz },
    { label: "Распевки", done: !!p.warmups },
    { label: "Песня", done: !!p.song }
  ];
  var stepsHtml = steps.map(function (st) {
    return '<div class="roadmap-step">' +
      '<div class="roadmap-step-dot' + (st.done ? " done" : "") + '">' + (st.done ? SVG.stepCheck : "") + "</div>" +
      '<span>' + st.label + "</span>" +
    "</div>";
  }).join("");
  var title = n + " · " + esc(lessonShortName(n));
  var sub = steps.every(function (st) { return st.done; }) ? "Завершён" : (steps.some(function (st) { return st.done; }) ? "В процессе" : "Открыт");
  return (
    '<div class="roadmap-card" data-act="' + act + '"' + (isOpenLesson ? "" : ' data-lesson-num="' + n + '"') + '>' +
      '<div class="roadmap-title">' + title + "</div>" +
      '<div class="roadmap-sub">' + sub + "</div>" +
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
      '<div class="roadmap-title" style="color:var(--locked);">' + n + " · " + esc(lessonShortName(n)) + "</div>" +
      '<div class="roadmap-sub">Откроется позже</div>' +
      stepsHtml +
    "</div>"
  );
}

/* Без фильтра — все 30 уроков по порядку, запертые с замком. С активным
   фильтром — только разблокированные уроки нужного статуса (запертые никогда
   не попадают ни в «В работе», ни в «Завершено»). Пустая строка означает
   "нечего показывать" — вызывающий код рисует текст пустого состояния. */
function roadmapScrollHtml(filter) {
  if (!filter) {
    var html = "";
    for (var i = 1; i <= TOTAL_LESSONS; i++) {
      html += lessonUnlocked(i) ? roadmapCardHtml(null, i) : lockedRoadmapCardHtml(i);
    }
    return html;
  }
  var out = "";
  for (var n = 1; n <= TOTAL_LESSONS; n++) {
    if (!lessonUnlocked(n)) continue;
    var status = lessonStatus(n);
    var isOpenLesson = LESSON && n === (LESSON.id || 1);
    if (filter === "inProgress" && status === "in-progress") {
      out += roadmapCardHtml(isOpenLesson ? "continue" : null, n);
    } else if (filter === "completed" && status === "completed") {
      out += roadmapCardHtml(isOpenLesson ? "review" : null, n);
    }
  }
  return out;
}

function lessonsGridHtml() {
  var tiles = "";
  for (var n = 1; n <= TOTAL_LESSONS; n++) {
    var isOpenLesson = LESSON && n === (LESSON.id || 1);
    if (isOpenLesson) {
      tiles +=
        '<div class="lesson-tile" data-act="open-lesson">' +
          '<div class="lesson-dot" style="background:oklch(56% 0.09 235);">' + n + "</div>" +
          '<div class="lesson-tile-name">' + esc(lessonShortName(n)) + "</div>" +
        "</div>";
    } else if (lessonUnlocked(n)) {
      tiles +=
        '<div class="lesson-tile" data-act="open-lesson-num" data-lesson-num="' + n + '">' +
          '<div class="lesson-dot" style="background:oklch(56% 0.09 235);">' + n + "</div>" +
          '<div class="lesson-tile-name">' + esc(lessonShortName(n)) + "</div>" +
        "</div>";
    } else {
      tiles +=
        '<div class="lesson-tile locked">' +
          '<div class="lesson-dot" style="background:var(--line);color:var(--locked);">' + n + "</div>" +
          '<div class="lesson-tile-name">' + esc(lessonShortName(n)) + "</div>" +
        "</div>";
    }
  }
  return '<div class="courses-grid">' + tiles + "</div>";
}

/* Свёрнута ли «Дорожная карта урока» — запоминаем выбор ученика между заходами */
function roadmapCollapsed() {
  try { return localStorage.getItem("vocalAppRoadmapCollapsed") === "1"; } catch (e) { return false; }
}

function renderCourses() {
  loadStudentPublicData(); // подтягивает unlockedLessons/progressByLesson для разблокировки
  loadLessonPlans();       // уроки 2+ живут в планах, нужны не только на админ-экранах
  var stats = lessonStats();
  // 20.11 (Николай): кнопки «В работе / Завершено» убраны — всегда видны все уроки
  state.coursesFilter = null;
  var filter = null;
  var favCount = Object.keys(state.favorites || {}).length;

  var roadmapInner = roadmapScrollHtml(filter);
  var roadmapBody = roadmapInner
    ? '<div class="roadmap-scroll">' + roadmapInner + "</div>"
    : '<div class="courses-empty">' +
        (filter === "inProgress"
          ? "Пока нет незавершённых уроков — начни любой открытый урок"
          : "Здесь появятся уроки, которые ты закончишь полностью") +
      "</div>";

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

    '<div class="roadmap-wrap' + (roadmapCollapsed() ? " collapsed" : "") + '">' +
      '<button class="roadmap-toggle" data-act="toggle-roadmap">' +
        '<span>Дорожная карта урока</span>' +
        '<svg class="roadmap-chev" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</button>" +
      '<div class="roadmap-collapse"><div class="roadmap-collapse-inner">' + roadmapBody + "</div></div>" +
    "</div>" +
    lessonsGridHtml();
  wireActs();
}

/* ---------- избранные распевки: тот же плеер урока + снятие звезды с undo (1:1 по макету) ---------- */

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

  // Тот же самый плеер-компонент, что и на экране урока (warmupCardHtml) —
  // перемотка, кольцо, шестерёнка с темпом/тональностью/повтором — всё одинаково.
  // Единственная разница — подпись урока вместо инструкций "как выполнять".
  var cards = entries.map(function (item) {
    var sub = '<div class="fav-item-sub" style="margin-top:6px;">Урок 1 · ' + esc(item.fav.lessonTitle) + "</div>";
    return warmupCardHtml(item.ex, sub);
  }).join("");

  app.innerHTML =
    '<div class="top">' + backBtn("back") +
      '<div class="top-title lg">Избранные распевки</div>' +
    "</div>" +
    '<div style="padding:8px 20px 130px;">' +
      (entries.length ? cards : '<div class="courses-empty">Пока нет избранных распевок — нажми на звезду в плеере урока.</div>') +
    "</div>" +
    (s.pendingUnstar
      ? '<div class="unstar-toast"><span>Убрано из избранного · ' + s.pendingUnstarSecs + 'с</span><button data-act="undo-unstar">Вернуть</button></div>'
      : "");

  entries.forEach(function (item) { wireWarmupCard(item.ex); });
  wireWarmupControls(function (n) {
    // на этом экране звезда не просто снимает избранное, а показывает отменяемый тост
    scheduleUnstar(favKey(n));
  });
  wireActs();
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

/* Загрузка данных ученика из baza-dannih по токену. Вызывается при каждом
   открытии Кабинета — studentPublicData сбрасывается на null при старте. */
function loadStudentPublicData() {
  if (!state.accessToken || state.studentPublicData) return;
  state.studentPublicData = "loading"; // prevents double fetch
  state._profileErr = null;
  var httpStatus = 0;
  fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(state.accessToken))
    .then(function (r) { httpStatus = r.status; return r.json(); })
    .then(function (data) {
      if (data && data.student) {
        state.studentPublicData = data;
        if (!state._openTracked) { state._openTracked = true; trackEv("open", {}); }
        // вход по личной ссылке: имя берём отсюда (обычно его ставит экран входа)
        if (!state.adminMode && !state.firstName && data.student.name) {
          state.firstName = data.student.name.split(" ")[0] || data.student.name;
          state.lastName = data.student.name.split(" ").slice(1).join(" ") || "";
          saveState();
        }
        // Прогресс по шагам урока и персональная разблокировка («Доп. открытые
        // уроки») раньше приходили отдельным запросом в Notion — теперь это
        // часть той же выдачи по токену, одним запросом вместо двух.
        state.unlockedLessons = data.unlockedLessons || [];
        state.progressByLesson = data.progressByLesson || {};
        // Статус «Завершил» — доступ закрыт. В режиме админа это НЕ применяется:
        // Николай должен свободно смотреть кабинет деактивированного ученика.
        if (!state.adminMode && data.student.status === "done") {
          state.screen = "blocked";
        }
        syncTelegramChatId();
        pingSeen();
        // Напоминание о дедлайне — ровно здесь, а не при старте приложения:
        // до этого момента список заданий ещё не загружен и считать не по чему.
        maybeShowHwReminder();
      } else if (httpStatus === 404 || httpStatus === 400) {
        // Единственный случай, когда токен действительно недействителен: ученика
        // удалили или токен перегенерировали. Только здесь стираем код доступа.
        state.studentPublicData = null;
        if (state.adminMode) {
          // Николай смотрит чужой кабинет — его собственную сессию не трогаем,
          // иначе он улетит на экран ввода двойного ключа.
          alert("Токен ученика «" + state.adminStudentName + "» больше недействителен — похоже, его перегенерировали на сайте.");
          exitAdminMode();
          return;
        }
        if (LINK_TOKEN && state.accessToken === LINK_TOKEN) {
          state._tokenError = "Эта ссылка больше не работает. Попроси у Николая новую или введи код доступа.";
          LINK_TOKEN = null;
          try { history.replaceState(history.state, "", location.pathname); } catch (e) {}
        }
        state.accessToken = null;
        saveState();
        go("token-entry");
        return;
      } else {
        // 500/503 и прочие сбои сервера: спящая база, холодный старт, таймаут.
        // Код доступа верный — не стираем его и никуда не выкидываем.
        state.studentPublicData = null;
        state._profileErr = "server";
        if (isCabinetScreen(state.screen)) render();
        return;
      }
      // Не только «Кабинет»: от этих же данных зависят разблокировка уроков на
      // «Курсах» и экран закрытого доступа.
      if (isCabinetScreen(state.screen) || ["courses", "blocked"].indexOf(state.screen) !== -1) render();
    })
    .catch(function () {
      state.studentPublicData = null;
      state._profileErr = "net";
      if (isCabinetScreen(state.screen)) render();
    });
}

/* «Режим админа» — Николай заходит под своим Telegram chat_id и, если он
   совпадает с ADMIN_CHAT_ID на сервере, видит скрытый от учеников пункт в
   «Ещё» и может выбрать любого ученика, чтобы пройти урок/тест/распевки
   «его глазами» и найти техническую проблему за него. */
// isAdmin теперь устанавливается при входе через двойной ключ — API-вызов не нужен.
function loadIsAdmin() {}

/* Заголовок для закрытых ручек baza-dannih. Токен кладётся при входе по
   двум ключам и в localStorage не попадает (см. whitelist в saveState) —
   значит после перезапуска Mini App ключи вводятся заново. */
function bazaAuthHeaders(extra) {
  var h = extra || {};
  if (state._siteAuth) h["X-Site-Auth"] = state._siteAuth;
  return h;
}

function loadAdminStudentsList() {
  if (state.adminStudentsList) return;
  fetch(BAZA_API + "/api/students", { headers: bazaAuthHeaders() })
    .then(function (r) {
      if (r.status === 401 && state.isAdmin) {
        // пароль сайта сменили — старые ключи больше не действуют
        forgetAdminKey();
        if (state.adminMode && state.adminSnapshot) {
          state.accessToken = state.adminSnapshot.accessToken;
          state.firstName = state.adminSnapshot.firstName; state.lastName = state.adminSnapshot.lastName;
          state.studentPublicData = null; state.adminSnapshot = null;
        }
        state.isAdmin = false; state._siteAuth = ""; state.adminMode = false;
        saveState();
        state._tokenError = "Ключи сменились на сайте — введи их один раз заново.";
        go("token-entry");
        throw new Error("401");
      }
      return r.json();
    })
    .then(function (data) {
      var students = (data && data.students) || [];
      state._adminStudentsErr = false;
      state.adminStudentsList = students.map(function (s) {
        return { id: s.id, name: s.name, status: s.status, telegramToken: s.telegramToken };
      });
      if (state.screen === "admin-students" || state.screen === "admin-karaoke") render();
    })
    .catch(function (err) {
      if (err && err.message === "401") { state.adminStudentsList = null; return; }
      // Отличаем «запрос не прошёл» от «учеников правда нет»: раньше обе
      // ситуации выглядели как пустой список, и сетевая ошибка читалась как
      // «база пуста».
      state._adminStudentsErr = true;
      state.adminStudentsList = [];
      if (state.screen === "admin-students" || state.screen === "admin-karaoke") render();
    });
}

function loadAdminBirthdays() {
  // Дни рождения — данные в baza-dannih пока не хранятся, заглушка.
  if (state.adminBirthdaysList) return;
  state.adminBirthdaysList = [];
  if (state.screen === "admin-birthdays") render();
}

/* Снимаем слепок состояния Николая, загружаем профиль выбранного ученика
   через baza-dannih по токену и показываем его профиль («глазами ученика»).
   saveState() во время adminMode в localStorage не пишет — см. защиту там. */
function enterAdminMode(student) {
  // своя карточка — не «режим админа», а просто свой кабинет
  if (student.telegramToken && student.telegramToken === state.accessToken && !state.adminMode) { go("profile"); return; }
  if (!student.telegramToken) {
    alert("У ученика «" + student.name + "» нет токена доступа — сначала зайди на сайт и убедись что токен сгенерирован.");
    return;
  }
  state.adminSnapshot = {
    accessToken: state.accessToken, studentPublicData: state.studentPublicData,
    firstName: state.firstName, lastName: state.lastName, isAdmin: state.isAdmin
  };
  state.adminMode = true;
  state.adminStudentName = student.name;

  fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(student.telegramToken))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.student) {
        state.accessToken = student.telegramToken;
        state.studentPublicData = data;
        state.firstName = data.student.name.split(" ")[0] || data.student.name;
        state.lastName = data.student.name.split(" ").slice(1).join(" ") || "";
        if (state._goKaraoke === "new") { state._goKaraoke = false; KAR.songs = null; go("karaoke"); karNewSong({ id: student.id, name: student.name }); return; }
        if (state._goKaraoke) { state._goKaraoke = false; KAR.songs = null; go("karaoke"); return; }
        go("profile");
      } else {
        state.adminMode = false;
        state.adminStudentName = "";
        state.adminSnapshot = null;
        alert("Не удалось загрузить профиль ученика: " + ((data && data.error) || "нет данных"));
      }
    })
    .catch(function () {
      state.adminMode = false;
      state.adminStudentName = "";
      state.adminSnapshot = null;
      alert("Ошибка загрузки профиля — нет соединения.");
    });
}

/* «Кабинет» под админским ключом открывает собственную карточку Николая —
   ровно в том виде, в каком её видит ученик. Своя запись ищется в списке
   учеников по имени: /api/students отдаёт только id/name/status/telegramToken,
   Telegram chat_id там нет, поэтому сопоставить по Telegram-профилю нельзя.
   Если карточки нет или у неё не сгенерирован токен — показываем выбор ученика
   с объяснением, а не молча кидаем на пустой экран. */
var ADMIN_SELF_NAME = "николай септ";

function findOwnStudentRecord() {
  var list = state.adminStudentsList || [];
  for (var i = 0; i < list.length; i++) {
    var n = String(list[i].name || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (n === ADMIN_SELF_NAME) return list[i];
    if (n.indexOf("септ") !== -1 && n.indexOf("никола") !== -1) return list[i];
    if (n.indexOf("sept") !== -1 && n.indexOf("nikola") !== -1) return list[i];
  }
  return null;
}

function openOwnCabinet() {
  var proceed = function () {
    state._openingOwnCabinet = false;
    var me = findOwnStudentRecord();
    if (me && me.telegramToken) { state._ownCabinetMsg = null; becomeOwnStudent(me); return; }
    state._ownCabinetMsg = me ? "no-token" : "not-found";
    go("admin-students");
  };
  if (state.adminStudentsList) { proceed(); return; }
  loadAdminStudentsList();
  var tries = 0;
  var wait = setInterval(function () {
    tries++;
    if (state.adminStudentsList) { clearInterval(wait); proceed(); return; }
    if (tries > 40) { // ~6 секунд — список так и не доехал
      clearInterval(wait);
      state._openingOwnCabinet = false;
      state._ownCabinetMsg = "net";
      go("admin-students");
    }
  }, 150);
}

/* 20.11 (просьба Николая): админ и своя карточка «Nikolai Sept» — один
   аккаунт. Своя карточка открывается не «режимом админа» (с глазом и
   плашкой «Ты в кабинете»), а как обычный вход ученика: код карточки
   сохраняется на телефоне, и приложение выглядит ровно как у ученика.
   Админские функции — в «Ещё → Режим админа»; чужие карточки по-прежнему
   открываются режимом админа и по выходу возвращают сюда. */
function becomeOwnStudent(me) {
  var nm = cleanOwnName(me.name);
  state.accessToken = me.telegramToken;
  // режим админа остаётся только если Николай сам его включил (или пришёл добавлять песню)
  if (state._goKaraoke) adminOnSet(true);
  state.isAdmin = adminOnGet();
  state._siteAuth = state.isAdmin ? readAdminKey() : "";
  state.studentPublicData = null;
  state.firstName = nm.split(" ")[0] || nm;
  state.lastName = nm.split(" ").slice(1).join(" ");
  saveState();
  if (state._goKaraoke === "new") { state._goKaraoke = false; KAR.songs = null; go("karaoke"); karNewSong({ id: me.id, name: me.name }); return; }
  if (state._goKaraoke) { state._goKaraoke = false; KAR.songs = null; go("karaoke"); return; }
  go("profile");
}

function setAdminOn(on) {
  if (!on && state.adminMode && state.adminSnapshot) {
    var sn = state.adminSnapshot; for (var k in sn) { state[k] = sn[k]; }
  }
  state.adminMode = false; state.adminStudentName = ""; state.adminSnapshot = null;
  adminOnSet(on);
  state.isAdmin = !!on;
  state._siteAuth = on ? readAdminKey() : "";
  state.adminStudentsList = null;
  saveState();
  if (on) go("admin-hub"); else render();
}

/* 20.11 (Николай): две свои карточки в базе — «Николай Септ (admin)» и
   «Nikolai Sept» — сливаются в одну «Nikolai Sept (тест)». Делается один
   раз сам, на телефоне Николая (там лежат его ключи админа): база переносит
   занятия, ДЗ, доступ к урокам, прогресс и треки, пустые поля дополняет
   из второй карточки, вторую удаляет (baza-dannih, students?merge=run). */
var OWN_NAME = "Nikolai Sept (тест)", OWN_MERGED_KEY = "vocal-own-merged";
function isOwnName(n) {
  n = String(n || "").toLowerCase();
  return (n.indexOf("никола") !== -1 && n.indexOf("септ") !== -1) || (n.indexOf("nikola") !== -1 && n.indexOf("sept") !== -1);
}
function autoMergeOwnCards() {
  var t = readAdminKey();
  if (!t) return;
  try { if (localStorage.getItem(OWN_MERGED_KEY) === "1") return; } catch (e) {}
  var H = { "X-Site-Auth": t, "Content-Type": "application/json" };
  fetch(BAZA_API + "/api/students", { headers: { "X-Site-Auth": t } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var mine = ((d && d.students) || []).filter(function (x) { return isOwnName(x.name); });
      var done = function (keep) {
        try { localStorage.setItem(OWN_MERGED_KEY, "1"); } catch (e) {}
        if (keep && keep.telegramToken) {
          state.accessToken = keep.telegramToken;
          var nm = cleanOwnName(OWN_NAME);
          state.firstName = nm.split(" ")[0]; state.lastName = nm.split(" ").slice(1).join(" ");
        }
        state.studentPublicData = null; state.adminStudentsList = null;
        saveState(); render();
      };
      if (mine.length === 1) {
        if (mine[0].name === OWN_NAME) { done(mine[0]); return; }
        return fetch(BAZA_API + "/api/students?id=" + encodeURIComponent(mine[0].id), { method: "PATCH", headers: H, body: JSON.stringify({ name: OWN_NAME }) })
          .then(function (r) { if (r.ok) done(mine[0]); });
      }
      if (mine.length !== 2) return; // 0 или больше двух — не гадаем
      // остаётся та, с которой телефон уже входит; иначе — «(admin)»
      var keep = mine.filter(function (x) { return x.telegramToken && x.telegramToken === state.accessToken; })[0] ||
        mine.filter(function (x) { return /\(admin\)/i.test(x.name); })[0] || mine[0];
      var drop = mine[0] === keep ? mine[1] : mine[0];
      return fetch(BAZA_API + "/api/students?merge=run", { method: "POST", headers: H, body: JSON.stringify({ keep: keep.id, drop: drop.id, name: OWN_NAME }) })
        .then(function (r) { return r.json(); })
        .then(function (res) { if (res && res.ok) done(keep); });
    })
    .catch(function () {});
}

function exitAdminMode() {
  var s = state.adminSnapshot;
  state.adminMode = false;
  state.adminStudentName = "";
  state.adminSnapshot = null;
  if (s) { for (var k in s) { state[k] = s[k]; } }
  go("admin-students");
}

function deleteStudentWithConfirm(studentId, name) {
  var step1 = confirm("Удалить ученика «" + name + "» из базы?\n\nВсе данные (анкета, дневник занятий, токен) будут удалены безвозвратно.");
  if (!step1) return;
  var step2 = confirm("Последнее предупреждение. Данные ученика «" + name + "» удалятся без возможности отменить.\n\nТочно продолжить?");
  if (!step2) return;

  fetch(BAZA_API + "/api/students?id=" + encodeURIComponent(studentId), {
    method: "DELETE",
    headers: bazaAuthHeaders()
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) {
        alert("Готово: «" + name + "» удалён из базы.");
        state.adminStudentsList = null;
        render();
      } else {
        alert("Не получилось: " + ((data && data.error) || "неизвестная ошибка"));
      }
    })
    .catch(function () { alert("Не получилось: сеть/сервер не ответили."); });
}

/* Отправка прогресса шага в baza-dannih — тихо, без ожидания ответа: если
   сеть подвела, просто ничего не запишется, на локальном прохождении урока
   это никак не сказывается. Ключ ученика — код доступа (токен), а не Telegram
   chat_id: в базе Николая ученик опознаётся именно по токену. Автопереход
   статуса «Пробный» → «Активный» делает сервер (см. api/student-public.js). */
/* Событие для дашборда в «Режиме админа» (20.11). Николай сам в
   аналитику не попадает: ни в режиме админа, ни со своей карточки. */
function trackEv(type, data) {
  if (!state.accessToken || state.adminMode || state.isAdmin || window.GUEST_ON) return;
  var body = JSON.stringify({
    token: state.accessToken, type: type, data: data || {},
    name: ((state.firstName || "") + " " + (state.lastName || "")).trim()
  });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch (e) {}
  fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true }).catch(function () {});
}
window.trackEv = trackEv;

function sendProgressToBaza(lessonNum, step) {
  trackEv("step", { lesson: lessonNum, step: step });
  if (!state.accessToken) return;
  fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(state.accessToken), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lessonNum: lessonNum, step: step })
  }).catch(function () {});
}

/* Пройден ли урок n целиком (все 4 шага) — общий источник со счётчиками
   выше (lessonStepsDone), чтобы не разъезжались два разных подсчёта. */
function lessonFullyDone(n) {
  return lessonStepsDone(n) === 4;
}

/* Разблокировка урока n: первый урок всегда открыт; следующий открывается,
   когда предыдущий пройден целиком; плюс персональный override из baza-dannih
   (students.extra_unlocked_lessons) открывает урок вне очереди. */
/* Николай открывает курс целиком со своей карточки «(admin)» — ему нужен
   доступ ко всем урокам сразу, а не по мере прохождения. Опознаём так же,
   как на сайте: по «(admin)» в имени ученика. */
function isAdminStudent() {
  var name = ((state.firstName || "") + " " + (state.lastName || ""));
  var base = state.studentPublicData && state.studentPublicData.student ? state.studentPublicData.student.name : "";
  return /\((admin|тест)\)/i.test(name + " " + base) || state.isAdmin === true;
}

function lessonUnlocked(n) {
  if (n === 1) return true;
  // тест-драйв: открыт только урок «Дыхание»
  if (window.GUEST_ON) return false;
  if (isAdminStudent()) return true;
  if (state.unlockedLessons && state.unlockedLessons.indexOf(n) !== -1) return true;
  return lessonFullyDone(n - 1);
}

/* Открыть урок по номеру: для урока 1 (единственного с реальным контентом
   сейчас) — обычный экран урока; для любого другого разблокированного, но
   пока пустого урока — заглушка «Материалы скоро появятся», чтобы не падать
   на отсутствующих данных. */
/* План из data/lesson-plans.json → объект урока той же формы, что lesson-01.json.
   Лекция, тест и распевки совпадают по формату один в один. Песня — нет: в
   планах вместо готовых треков с mp3 лежит trackIdeas (только названия), и
   отдельного поля song.tracks там не существует. Поэтому песню переносим как
   есть, а экран песни сам показывает задание вместо плеера (см. renderSong). */
function planToLesson(plan, n) {
  return {
    id: n,
    title: plan.topic || ("Урок " + n),
    level: plan.level || "",
    goal: plan.goal || "",
    stepSubtitles: plan.stepSubtitles || { lecture: "", quiz: "", warmups: "", song: "" },
    lecture: plan.lecture,
    quiz: plan.quiz,
    warmups: plan.warmups,
    song: plan.song || {}
  };
}

/* Номер урока → план. lessonId в планах почти везде null, поэтому опираемся
   на порядок: план №1 — первый урок, и так далее. */
function planForLesson(n) {
  var plans = (LESSON_PLANS && LESSON_PLANS.plans) || [];
  return plans[n - 1] || null;
}

/* Переключение LESSON на другой урок. Шаговые флаги глобальные (относятся к
   текущему LESSON.id), поэтому при переходе поднимаем их из progressByLesson,
   иначе новый урок унаследовал бы прогресс предыдущего. */
function switchToLesson(n, plan) {
  stopAllMedia();
  LESSON = planToLesson(plan, n);
  var pr = (state.progressByLesson && state.progressByLesson[n]) || {};
  state.lectureViewed = !!pr.lecture;
  state.quizDone = !!pr.quiz;
  state.warmupsDone = !!pr.warmups;
  state.songDone = !!pr.song;
  state.quizIndex = 0;
  state.quizScore = 0;
  state.quizAnswers = new Array((LESSON.quiz && LESSON.quiz.questions || []).length).fill(null);
  go("lesson-home");
}

function openLessonByNumber(n) {
  if (n === (LESSON && LESSON.id || 1)) { go("lesson-home"); return; }

  // Урок 1 — единственный с собственным файлом и аудио; возвращаемся к нему из кэша
  if (n === 1 && LESSON_ONE) { stopAllMedia(); LESSON = LESSON_ONE; go("lesson-home"); return; }

  var plan = planForLesson(n);
  if (plan) { switchToLesson(n, plan); return; }

  // планов ещё нет в памяти — подгружаем и открываем, когда приедут
  if (!LESSON_PLANS) {
    loadLessonPlans();
    state.pendingLessonNum = n;
    state.comingSoonLessonNum = n;
    go("lesson-soon");
    return;
  }
  state.comingSoonLessonNum = n;
  go("lesson-soon");
}

/* Цвета уровней ДЗ */
var HW_LEVEL_COLORS = {
  "A": { bg: "oklch(90% 0.04 235)", color: "oklch(38% 0.08 235)" },
  "B": { bg: "oklch(88% 0.05 160)", color: "oklch(35% 0.1 160)" },
  "C": { bg: "oklch(90% 0.07 85)",  color: "oklch(40% 0.12 85)" },
  "D": { bg: "oklch(88% 0.06 38)",  color: "oklch(40% 0.12 38)" }
};

function hwLevelBadge(level) {
  var c = HW_LEVEL_COLORS[level] || { bg: "var(--bg)", color: "var(--ink)" };
  return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800;background:' +
    c.bg + ';color:' + c.color + ';">' + esc(level || "?") + "</span>";
}

function formatDue(due) {
  if (!due) return "";
  try {
    var d = new Date(due + "T00:00:00");
    var months = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    return d.getDate() + " " + months[d.getMonth()];
  } catch (e) { return due; }
}

var SVG_HW_CHECK = '<svg viewBox="0 0 11 9" fill="none"><path d="M1 4.4L4.1 7.5L10 1.5" stroke="var(--white-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderHomeworkSection(homework) {
  if (!homework || !homework.length) {
    return '<div class="assessments-title">Домашнее задание</div>' +
      '<div class="instruction-note">Пока нет активных заданий — преподаватель добавит их после занятия.</div>';
  }
  var today = new Date(); today.setHours(0,0,0,0);
  var items = homework.map(function (hw, i) {
    var due = hw.due ? new Date(hw.due + "T00:00:00") : null;
    var overdue = due && due < today && !hw.done;
    var busy = state._hwBusy[hwKey(hw)];
    return '<div class="' + (hw.done ? "hw-item-done" : "") + '" style="display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);">' +
      hwLevelBadge(hw.level) +
      '<div style="flex:1;min-width:0;">' +
        '<div class="hw-title" style="font:600 14px Manrope,sans-serif;color:var(--ink);line-height:1.35;">' + esc(hw.title || "") + "</div>" +
        (due ? '<div style="font-size:12px;margin-top:3px;color:' + (overdue ? "var(--ink-red)" : "var(--gray)") + ';">до ' + formatDue(hw.due) + (overdue ? " · просрочено" : "") + "</div>" : "") +
      "</div>" +
      // Отметка выполнения. Она не косметическая: пока задание не отмечено,
      // бот раз в сутки напоминает о нём в чате (см. api/lessons.js?part=hw-reminder).
      '<button class="hw-check' + (hw.done ? " done" : "") + '" data-hw-toggle="' + i + '"' +
        (busy ? " disabled" : "") + ' aria-pressed="' + (hw.done ? "true" : "false") +
        '" aria-label="Отметить выполненным">' + SVG_HW_CHECK + "</button>" +
    "</div>";
  }).join("");
  return '<div class="assessments-title">Домашнее задание</div>' +
    '<div class="cabinet-inset" style="padding:0 16px;">' + items + "</div>";
}

/* ---------- отметка «выполнено» и напоминание о дедлайне ----------

   Задания приходят из baza-dannih (lesson_log.hw_items) и своего id не имеют —
   склеиваются по паре «название + дедлайн», и ровно этой парой сервер потом
   находит нужный элемент JSONB-массива. Отсюда hwKey(). */

function hwKey(hw) {
  return String((hw && hw.title) || "") + "|" + String((hw && hw.due) || "");
}

// Дедлайн — конец указанного дня по местному времени ученика, а не полночь:
// «до 25 октября» для человека значит «весь день 25-го ещё мой».
function hwDeadlineMs(due) {
  if (!due) return null;
  var t = new Date(String(due).slice(0, 10) + "T23:59:59").getTime();
  return isNaN(t) ? null : t;
}

function pendingHomework() {
  var data = state.studentPublicData;
  if (!data || data === "loading") return [];
  return (data.homework || []).filter(function (hw) {
    return !hw.done && hwDeadlineMs(hw.due) !== null;
  });
}

function toggleHwDone(idx) {
  // В «Режиме админа» Николай смотрит чужой кабинет для диагностики —
  // его клик не должен закрывать ученику реальное задание.
  if (state.adminMode) return;
  var data = state.studentPublicData;
  var hw = data && data.homework && data.homework[idx];
  if (!hw || !state.accessToken) return;

  var key = hwKey(hw);
  if (state._hwBusy[key]) return;
  state._hwBusy[key] = true;

  var next = !hw.done;
  var prevStatus = hw.status;
  // Оптимистично: галочка должна отзываться мгновенно, сеть у ученика
  // может быть медленной. При ошибке откатываем обратно ниже.
  hw.done = next;
  hw.status = next ? "выполнено учеником" : "в приложении: не начато";
  repaintHomework();

  fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(state.accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hwDone: { title: hw.title, due: hw.due, done: next } })
  })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); trackEv("hw_done", { title: hw.title, due: hw.due, done: next }); })
    .catch(function () {
      hw.done = !next;
      hw.status = prevStatus;
      alert("Не удалось сохранить отметку — проверь соединение и попробуй ещё раз.");
    })
    .then(function () {
      delete state._hwBusy[key];
      repaintHomework();
    });
}

// Перерисовать всё, что показывает список ДЗ: экран «Кабинет» и открытую
// шторку-напоминание. Шторка живёт в <body>, а не в #app, поэтому render()
// её не трогает — обновляем отдельно.
function repaintHomework() {
  if (isCabinetScreen(state.screen)) render();
  if (document.getElementById("hw-reminder")) {
    if (!pendingHomework().length) closeHwReminder();
    else paintHwSheet();
  }
}

function wireHwToggles(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll("[data-hw-toggle]"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleHwDone(parseInt(el.getAttribute("data-hw-toggle"), 10));
    });
  });
}

/* Шторка «домашнее задание ждёт» с обратным отсчётом до ближайшего дедлайна.
   Показывается один раз за запуск приложения (state._hwReminderShown) и
   только если есть хотя бы одно невыполненное задание с дедлайном. */

var _hwTimer = null;

function hwCountdownParts(ms) {
  var sec = Math.floor(Math.abs(ms) / 1000);
  return {
    overdue: ms < 0,
    d: Math.floor(sec / 86400),
    h: Math.floor((sec % 86400) / 3600),
    m: Math.floor((sec % 3600) / 60),
    s: sec % 60
  };
}

function hwCountdownHtml(deadlineMs) {
  var p = hwCountdownParts(deadlineMs - Date.now());
  // < 24 часов — терракотовый, просрочено — красный. Отдельным классом, а не
  // инлайновым цветом: в тёмной теме оба берутся из var() и не выцветают.
  var cls = p.overdue ? " overdue" : ((p.d === 0) ? " urgent" : "");
  var cells = [[p.d, "дней"], [p.h, "часов"], [p.m, "минут"], [p.s, "секунд"]];
  return cells.map(function (c) {
    return '<div class="hw-cd-cell">' +
      '<div class="hw-cd-num' + cls + '">' + (c[0] < 10 ? "0" : "") + c[0] + "</div>" +
      '<div class="hw-cd-label">' + c[1] + "</div>" +
    "</div>";
  }).join("");
}

function paintHwSheet() {
  var sheet = document.getElementById("hw-reminder");
  if (!sheet) return;
  var pending = pendingHomework();
  if (!pending.length) { closeHwReminder(); return; }

  // Ближайший дедлайн — по нему и идёт отсчёт; остальные задания просто
  // перечислены ниже, чтобы ученик видел весь долг разом.
  var nearest = pending.slice().sort(function (a, b) {
    return hwDeadlineMs(a.due) - hwDeadlineMs(b.due);
  })[0];
  var deadline = hwDeadlineMs(nearest.due);
  var overdue = deadline - Date.now() < 0;
  var all = (state.studentPublicData.homework || []);

  // Формулировка подгоняется под то, что показывают цифры ниже: при
  // просрочке отсчёт идёт не «до», а «от» дедлайна, и подпись «осталось»
  // над выросшим счётчиком читалась бы как «ещё есть время».
  sheet.querySelector("[data-hw-sub]").textContent = overdue
    ? "Задание «" + (nearest.title || "") + "» просрочено на"
    : "До срока по заданию «" + (nearest.title || "") + "» осталось";
  sheet.querySelector("[data-hw-cd]").innerHTML = hwCountdownHtml(deadline);
  // Сверху — то, что ещё ждёт; выполненные свёрнуты в одну строку
  // «Выполнено N заданий», нажал — раскрылся список (просьба Николая 17.11).
  function itemHtml(hw) {
    var i = all.indexOf(hw);
    var left = hwDeadlineMs(hw.due);
    var isOver = left !== null && left - Date.now() < 0 && !hw.done;
    return '<div class="hw-sheet-item' + (hw.done ? " hw-item-done" : "") + '">' +
      hwLevelBadge(hw.level) +
      '<div style="flex:1;min-width:0;">' +
        '<div class="hw-sheet-item-title">' + esc(hw.title || "") + "</div>" +
        (hw.due ? '<div class="hw-sheet-item-due' + (isOver ? " overdue" : "") + '">до ' +
          formatDue(hw.due) + (isOver ? " · просрочено" : "") + "</div>" : "") +
      "</div>" +
      '<button class="hw-check' + (hw.done ? " done" : "") + '" data-hw-toggle="' + i + '"' +
        (state._hwBusy[hwKey(hw)] ? " disabled" : "") +
        ' aria-label="Отметить выполненным">' + SVG_HW_CHECK + "</button>" +
    "</div>";
  }
  var open = all.filter(function (hw) { return !hw.done; });
  var done = all.filter(function (hw) { return hw.done; });
  var html = open.length ? '<div class="hw-open-list">' + open.map(itemHtml).join("") + "</div>" : "";
  if (done.length) {
    var exp = !!state._hwDoneOpen;
    html += '<button class="hw-done-sum' + (exp ? " open" : "") + '" data-hw-done-toggle>' +
        '<span class="hw-check done">' + SVG_HW_CHECK + "</span>" +
        '<span class="hw-done-sum-t">Выполнено ' + done.length + " " +
          plural(done.length, "задание", "задания", "заданий") + "</span>" +
        '<span class="hw-done-sum-ar">›</span>' +
      "</button>" +
      '<div class="hw-done-hint">' + (exp ? "нажми, чтобы свернуть" : "нажми, чтобы увидеть список") + "</div>" +
      (exp ? '<div class="hw-done-list">' + done.map(itemHtml).join("") + "</div>" : "");
  }
  sheet.querySelector("[data-hw-items]").innerHTML = html;
  var sum = sheet.querySelector("[data-hw-done-toggle]");
  if (sum) sum.addEventListener("click", function () {
    state._hwDoneOpen = !state._hwDoneOpen;
    paintHwSheet();
  });
  wireHwToggles(sheet);
}

function closeHwReminder() {
  if (_hwTimer) { clearInterval(_hwTimer); _hwTimer = null; }
  var el = document.getElementById("hw-reminder");
  if (el) el.remove();
}

function openHwReminder() {
  closeHwReminder();
  var el = document.createElement("div");
  el.id = "hw-reminder";
  el.innerHTML =
    '<div class="hw-sheet">' +
      '<div class="hw-grip"></div>' +
      '<div class="hw-swipe-hint">потяни вниз, чтобы закрыть</div>' +
      '<div class="hw-sheet-title">Домашнее задание ждёт</div>' +
      '<div class="hw-sheet-sub" data-hw-sub></div>' +
      '<div class="hw-countdown" data-hw-cd></div>' +
      "<div data-hw-items></div>" +
      '<div class="hw-sheet-actions">' +
        '<button class="cta" data-hw-go>Открыть кабинет</button>' +
        '<button class="hw-later" data-hw-later>Напомнить позже</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(el);

  // Клик по затемнению (но не по самой шторке) закрывает — привычный жест.
  el.addEventListener("click", function (e) { if (e.target === el) closeHwReminder(); });
  el.querySelector("[data-hw-later]").addEventListener("click", closeHwReminder);
  el.querySelector("[data-hw-go]").addEventListener("click", function () {
    closeHwReminder();
    go("profile");
  });

  wireHwSwipe(el);
  paintHwSheet();
  // Только цифры отсчёта, раз в секунду: перерисовывать всю шторку целиком
  // нельзя — это сбрасывало бы нажатие на галочке посреди клика.
  _hwTimer = setInterval(function () {
    var cd = document.querySelector("#hw-reminder [data-hw-cd]");
    if (!cd) { closeHwReminder(); return; }
    var pending = pendingHomework();
    if (!pending.length) { closeHwReminder(); return; }
    var nearest = pending.slice().sort(function (a, b) {
      return hwDeadlineMs(a.due) - hwDeadlineMs(b.due);
    })[0];
    cd.innerHTML = hwCountdownHtml(hwDeadlineMs(nearest.due));
  }, 1000);
}

/* Свайп вниз закрывает шторку (просьба Николая 17.11). Тянуть можно, только
   когда список внутри шторки прокручен до самого верха — иначе жест вниз
   просто листает список. Шторка едет за пальцем; отпустил дальше 90px или
   резко смахнул — закрылась, иначе вернулась на место. */
function wireHwSwipe(overlay) {
  var sheet = overlay.querySelector(".hw-sheet");
  var y0 = null, t0 = 0, dy = 0, dragging = false;
  sheet.addEventListener("touchstart", function (e) {
    if (sheet.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; }
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; dragging = false;
  }, { passive: true });
  sheet.addEventListener("touchmove", function (e) {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!dragging) {
      if (dy < 6) { if (dy < -6) y0 = null; return; }
      dragging = true;
      sheet.style.transition = "none";
    }
    if (e.cancelable) e.preventDefault();
    sheet.style.transform = "translateY(" + Math.max(0, dy) + "px)";
  }, { passive: false });
  function end() {
    if (y0 === null) return;
    y0 = null;
    if (!dragging) return;
    dragging = false;
    var fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.6;
    sheet.style.transition = "transform .22s ease";
    if (dy > 90 || fast) {
      sheet.style.transform = "translateY(110%)";
      overlay.style.transition = "opacity .22s ease";
      overlay.style.opacity = "0";
      setTimeout(closeHwReminder, 220);
    } else {
      sheet.style.transform = "";
    }
  }
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
}

/* Общий свайп вниз для любой нижней шторки с полоской (20.11, просьба
   Николая: полоски на шторках не смахивались). Логика та же, что у шторки
   ДЗ: тянуть можно, когда содержимое прокручено до верха; дальше 90px или
   резкий смах — закрыть, иначе вернуть на место. Поля ввода не перехватываем. */
function wireSheetSwipe(sheet, onClose, shade) {
  if (!sheet || sheet._swipe) return;
  sheet._swipe = true;
  var y0 = null, x0 = 0, t0 = 0, dy = 0, dragging = false;
  sheet.addEventListener("touchstart", function (e) {
    var t = e.target;
    // поля ввода и колёсики «Тональность/Темп» (.wh) тянутся вбок — их не трогаем
    if (sheet.scrollTop > 0 || e.touches.length !== 1 || (t && t.closest && t.closest("input, textarea, select, .wh"))) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = Date.now(); dy = 0; dragging = false;
  }, { passive: true });
  sheet.addEventListener("touchmove", function (e) {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!dragging) {
      if (Math.abs(e.touches[0].clientX - x0) > Math.abs(dy) + 4) { y0 = null; return; }
      if (dy < 6) { if (dy < -6) y0 = null; return; }
      dragging = true;
      sheet.style.animation = "none";
      sheet.style.transition = "none";
    }
    if (e.cancelable) e.preventDefault();
    sheet.style.transform = "translateY(" + Math.max(0, dy) + "px)";
  }, { passive: false });
  function end() {
    if (y0 === null) return;
    y0 = null;
    if (!dragging) return;
    dragging = false;
    var fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.6;
    sheet.style.transition = "transform .22s ease";
    if (dy > 90 || fast) {
      sheet.style.transform = "translateY(110%)";
      if (shade) { shade.style.transition = "opacity .22s ease"; shade.style.opacity = "0"; }
      setTimeout(onClose, 220);
    } else {
      sheet.style.transform = "";
    }
  }
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
}
window.wireSheetSwipe = wireSheetSwipe;

function maybeShowHwReminder() {
  if (state._hwReminderShown || state.adminMode) return;
  // «Завершил» — доступ закрыт, экран blocked; напоминать такому ученику
  // о домашнем задании поверх сообщения о закрытом доступе бессмысленно.
  if (state.screen === "blocked") return;
  if (!pendingHomework().length) return;
  state._hwReminderShown = true;
  openHwReminder();
}

/* Пинг «ученик открыл приложение» → students.last_seen_at в baza-dannih.
   Без него бот не может отличить того, кто заходит и занимается, от того,
   кто пропал: напоминание уходит только при совпадении обоих условий —
   задание не отмечено И сутки не заходил. Шлём один раз за запуск. */
var _seenPinged = false;
function pingSeen() {
  if (_seenPinged || state.adminMode || !state.accessToken) return;
  _seenPinged = true;
  fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(state.accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seen: true })
  }).catch(function () { _seenPinged = false; });
}

/* «Колесо баланса» в кабинете ученика.
   Одно общее колесо по всем темам сразу — без деления на уровни и без
   подписей вокруг самой фигуры: названия тем идут списком ниже, а на узком
   экране подписи по кругу всё равно налезали бы друг на друга.
   Под списком — история срезов: любой срез можно отметить, и он ляжет на
   колесо отдельным контуром (до трёх одновременно), чтобы видеть динамику. */
var SREZ_COMPARE_COLORS = ["var(--blue)", "var(--ink-red)", "var(--locked)"];

function srezPolygonPoints(topics, order, cx, cy, R) {
  var n = order.length;
  var map = {};
  (topics || []).forEach(function (t) { map[t.name] = t.score; });
  return order.map(function (name, i) {
    var sc = map[name];
    var v = (sc === null || sc === undefined) ? 0 : Math.max(0, Math.min(10, Number(sc)));
    var ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    var r = (v / 10) * R;
    return (cx + r * Math.cos(ang)).toFixed(1) + "," + (cy + r * Math.sin(ang)).toFixed(1);
  }).join(" ");
}

function srezWheelSvg(order, series) {
  var cx = 110, cy = 110, R = 92, n = order.length;
  if (!n) return "";
  var grid = "";
  [0.25, 0.5, 0.75, 1].forEach(function (k) {
    var pts = order.map(function (_, i) {
      var ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return (cx + R * k * Math.cos(ang)).toFixed(1) + "," + (cy + R * k * Math.sin(ang)).toFixed(1);
    }).join(" ");
    grid += '<polygon points="' + pts + '" fill="none" stroke="var(--line)" stroke-width="1"/>';
  });
  order.forEach(function (_, i) {
    var ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    grid += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(ang)).toFixed(1) +
      '" y2="' + (cy + R * Math.sin(ang)).toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
  });
  var shapes = series.map(function (s) {
    return '<polygon points="' + srezPolygonPoints(s.topics, order, cx, cy, R) + '" fill="' + s.color +
      '" fill-opacity="' + s.fill + '" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round"/>';
  }).join("");
  return '<svg viewBox="0 0 220 220" class="srez-wheel" aria-hidden="true">' + grid + shapes + "</svg>";
}

function renderSrezySection(srezy, wheelTopics) {
  var list = Array.isArray(srezy) ? srezy : [];
  var current = (Array.isArray(wheelTopics) && wheelTopics.length)
    ? wheelTopics
    : (list.length ? (list[list.length - 1].topics || []) : []);
  if (!current.length) return "";

  var order = current.map(function (t) { return t.name; });
  var series = [{ topics: current, color: "var(--terra)", fill: 0.18 }];
  var picked = [];
  state._srezCompare.forEach(function (id, i) {
    var found = null;
    for (var k = 0; k < list.length; k++) if (list[k].id === id) found = list[k];
    if (found) {
      picked.push(found);
      series.push({ topics: found.topics, color: SREZ_COMPARE_COLORS[i % SREZ_COMPARE_COLORS.length], fill: 0.07 });
    }
  });

  var rows = current.map(function (t) {
    var score = (t.score === null || t.score === undefined) ? null : Number(t.score);
    var cmp = picked.map(function (z, i) {
      var pv = null;
      (z.topics || []).forEach(function (x) { if (x.name === t.name) pv = x.score; });
      return '<span class="srez-cmp" style="color:' + SREZ_COMPARE_COLORS[i % SREZ_COMPARE_COLORS.length] + ';">' +
        (pv === null || pv === undefined ? "—" : pv) + "</span>";
    }).join("");
    var pct = score === null ? 0 : Math.max(0, Math.min(10, score)) * 10;
    return '<div class="srez-row">' +
        '<div class="srez-row-head">' +
          '<span class="srez-name">' + esc(t.name) + "</span>" + cmp +
          '<span class="srez-score">' + (score === null ? "—" : score + "/10") + "</span>" +
        "</div>" +
        '<div class="srez-bar"><div class="srez-bar-fill" style="width:' + pct + '%;"></div></div>' +
      "</div>";
  }).join("");

  // Срезов за год набирается много, а в кабинете нужен свежий срез, а не архив:
  // показываем пять последних, остальные просто считаем.
  var recent = list.slice().reverse().slice(0, 5);
  var hist = "";
  if (list.length) {
    hist = '<div class="srez-hist-title">Срезы</div>' +
      '<div class="srez-hist-hint">Нажми на дату, чтобы наложить срез на колесо — можно сравнить до трёх.' +
        (list.length > recent.length ? " Показаны последние " + recent.length + " из " + list.length + "." : "") +
      "</div>" +
      recent.map(function (z) {
        var at = state._srezCompare.indexOf(z.id);
        var col = at > -1 ? SREZ_COMPARE_COLORS[at % SREZ_COMPARE_COLORS.length] : "";
        var scored = (z.topics || []).filter(function (t) { return t.score !== null && t.score !== undefined; }).length;
        return '<div class="srez-hist-item' + (at > -1 ? " on" : "") + '" data-act="srez-toggle" data-srez-id="' + esc(z.id) + '"' +
            (col ? ' style="border-color:' + col + ';"' : "") + ">" +
            '<span class="srez-hist-date">' + esc(z.date || "") + "</span>" +
            '<span class="srez-hist-count">' + scored + " из " + (z.topics || []).length + "</span>" +
          "</div>";
      }).join("");
  }

  // По колесу кликаем, чтобы свернуть/развернуть список тем: иначе кабинет
  // превращается в стену из двух десятков шкал и срезы уезжают за экран.
  var open = !!state._srezTopicsOpen;
  var scored = current.filter(function (t) { return t.score !== null && t.score !== undefined; }).length;

  return '<div class="assessments-title">Колесо баланса</div>' +
    '<div class="cabinet-inset">' +
      '<div data-act="srez-topics-toggle" class="srez-wheel-tap">' +
        srezWheelSvg(order, series) +
        '<div class="srez-topics-toggle">' +
          '<span>' + (open ? "Скрыть темы" : "Показать темы") + " · " + scored + " из " + current.length + "</span>" +
          '<span class="srez-chev' + (open ? " open" : "") + '">▾</span>' +
        "</div>" +
      "</div>" +
      (open ? rows : "") +
      hist +
    "</div>";
}

function renderProfile() {
  // Нет кода доступа — обычного ученика отправляем на вход.
  // Николая-админа туда отправлять нельзя: он уже вошёл по двум ключам, и экран
  // входа просто зацикливал его на вводе паролей (ввёл ключи → попал в «Ещё» →
  // нажал «Кабинет» → снова просят ключи). Ведём его к выбору ученика.
  if (!state.accessToken) {
    if (state.isAdmin) {
      // Своя карточка грузится асинхронно — показываем заглушку и не зовём
      // openOwnCabinet повторно, иначе render() зациклится сам на себе.
      app.innerHTML = '<div style="padding:var(--screen-top) 20px;"><div class="courses-empty">Открываю твой кабинет…</div></div>';
      if (!state._openingOwnCabinet) { state._openingOwnCabinet = true; openOwnCabinet(); }
      wireActs();
      return;
    }
    go("token-entry");
    return;
  }

  loadStudentPublicData();

  var data = (state.studentPublicData && state.studentPublicData !== "loading") ? state.studentPublicData : null;
  var student = data ? data.student : null;
  var intake = data ? data.intake : null;
  var homework = data ? (data.homework || []) : [];

  // Шапка
  var name = student ? cleanOwnName(student.name) : "Загружаю…";
  var initials = name.split(" ").filter(Boolean).slice(0,2).map(function(w){return w[0];}).join("").toUpperCase();
  var status = student ? student.status : "";
  var statusLabel = { active: "Активный", trial: "Пробный", pause: "Пауза" }[status] || status;

  // Блок голосового профиля.
  // Две разные цели, и путать их нельзя: первичная — чего хочет сам ученик,
  // он называет её на входе и она лежит в анкете; вторичная — над чем мы
  // работаем сейчас, она берётся из цели последнего проведённого занятия
  // и меняется от урока к уроку.
  var lastGoal = data ? data.lastGoal : null;
  var lastGoalWhen = "";
  if (lastGoal && lastGoal.date) {
    var lgd = new Date(lastGoal.date);
    if (!isNaN(lgd)) lastGoalWhen = ("0" + lgd.getDate()).slice(-2) + "." + ("0" + (lgd.getMonth() + 1)).slice(-2);
  }
  var voiceHtml = "";
  if (intake) {
    var rangeStr = (intake.rangeLow || intake.tessLow) ? ((intake.rangeLow || "?") + " — " + (intake.rangeHigh || "?")) : "";
    var voiceTypeStr = intake.voiceType || "";
    var goalsArr = Array.isArray(intake.goals) ? intake.goals : [];
    var artArr = Array.isArray(intake.articulatory) ? intake.articulatory : [];
    // Репертуар (Коля 17.11): каждая песня с новой строки, по порядку.
    // В базе он строкой через запятую, перенос строки или «;», или списком.
    var repArr = (Array.isArray(intake.repertoire) ? intake.repertoire : String(intake.repertoire || "").split(/\s*(?:\r?\n|;|,\s+)\s*/))
      .map(function (x) { return String(x || "").trim(); }).filter(Boolean);

    voiceHtml =
      '<div class="cabinet-inset">' +
        (voiceTypeStr || rangeStr ? '<div class="cabinet-grid-2col">' +
          (voiceTypeStr ? '<div><div class="profile-card-label">Тип голоса</div><div class="profile-card-value">' + esc(voiceTypeStr) + "</div></div>" : "") +
          (rangeStr ? '<div><div class="profile-card-label">Диапазон</div><div class="profile-card-value">' + esc(rangeStr) + "</div></div>" : "") +
        "</div>" : "") +
        (goalsArr.length ? '<div class="section-label">Первичная цель</div><div class="chips-wrap" style="margin-bottom:12px;">' + chipsHtml(goalsArr) + "</div>" : "") +
        (lastGoal && lastGoal.goal
          ? '<div class="section-label">Вторичная цель</div>' +
            '<div class="goal-box goal-primary" style="margin-bottom:5px;">' + esc(lastGoal.goal) + "</div>" +
            '<div class="goal-src">' +
              (lastGoal.topic ? esc(lastGoal.topic) + " · " : "") +
              (lastGoalWhen ? "с занятия " + lastGoalWhen : "с последнего занятия") +
            "</div>"
          : "") +
        (Array.isArray(intake.tensionAreas) && intake.tensionAreas.length ? '<div class="section-label">Зоны зажима</div><div class="chips-wrap" style="margin-bottom:12px;">' + chipsHtml(intake.tensionAreas) + "</div>" : "") +
        (artArr.length ? '<div class="section-label">Артикуляционные особенности</div><div class="chips-wrap" style="margin-bottom:12px;">' + artArr.map(function(e){ return '<span class="chip-tag">' + esc(e.letter || "") + (e.typeIdx !== undefined ? "" : "") + "</span>"; }).join("") + "</div>" : "") +
        (repArr.length ? '<div class="section-label">Репертуар</div><div class="goal-box goal-primary rep-list" style="margin-bottom:0;">' +
          repArr.map(function (song, k) {
            return '<div class="rep-item"><span class="rep-n">' + (k + 1) + ".</span><span>" + esc(song) + "</span></div>";
          }).join("") + "</div>" : "") +
      "</div>";
  }

  var head =
      '<div class="profile-head cab-head">' +
        '<div class="profile-avatar cab-ava">' + esc(initials || "?") + "</div>" +
        '<div>' +
          '<div class="profile-name cab-name">' + esc(name) + "</div>" +
          (statusLabel ? '<div class="profile-status"><span style="color:var(--terra);font-weight:600;">' + esc(statusLabel) + "</span></div>" : "") +
        "</div>" +
      "</div>";
  var loadingNote = (state.studentPublicData === "loading" ? '<div class="instruction-note" style="margin-top:16px;">Загружаю данные…</div>' : "") +
      (!data && state.studentPublicData !== "loading"
        ? '<div class="instruction-note" style="margin-top:16px;">' +
            (state._profileErr === "server"
              ? "Сервер не отвечает. Код доступа сохранён — просто открой кабинет ещё раз через минуту."
              : "Нет соединения. Открой кабинет ещё раз.") +
          "</div>"
        : "");

  var body;
  switch (state.screen) {
    case "cab-lessons": body = cabBack() + renderCabLessons(data); break;
    case "cab-hw": body = cabBack() + renderCabHw(data, homework); break;
    case "cab-voice": body = cabBack() + '<div class="cab-screen-title">Мой голос</div>' +
      (voiceHtml || '<div class="instruction-note">Николай заполнит твой голосовой профиль после первых уроков.</div>'); break;
    case "cab-wheel": body = cabBack() + renderCabWheel(data); break;
    default: body = head + renderCabMain(data);
  }

  app.innerHTML =
    '<div style="padding:var(--screen-top) 20px 130px;">' + body + loadingNote + "</div>";

  wireActs();
  wireHwToggles(app);
  wireCabWheelDots(app);
  wireCabHistory(app);
}

/* ---------- Кабинет: главная, «Мои уроки», «Домашние задания», «Колесо баланса» ----------
   Собрано 1:1 по макету, который выбрал Николай 17.11 (kabinet-sborka-2,
   golos-i-koleso, koleso-tochki). Данные об абонементе и уроках приходят из
   бота записи через baza-dannih (subscription, upcomingLessons, nextSrez,
   hwTracker), сам Mini App их не считает. */

var CAB_SCREENS = ["cab-lessons", "cab-hw", "cab-voice", "cab-wheel"];
var MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
var WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
var NB = " ";

function isCabinetScreen(s) { return s === "profile" || CAB_SCREENS.indexOf(s) !== -1; }

function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// "2026-12-05" → «5 декабря» (неразрывный пробел, чтобы дата не рвалась на две строки)
function dayMonth(ymdStr) {
  if (!ymdStr) return "";
  var p = String(ymdStr).slice(0, 10).split("-");
  return parseInt(p[2], 10) + NB + MONTHS_GEN[parseInt(p[1], 10) - 1];
}

// ISO из базы → «суббота, 22 ноября, 11:30» во времени самого ученика
function lessonWhen(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return "";
  return WEEKDAYS_FULL[d.getDay()] + ", " + d.getDate() + NB + MONTHS_GEN[d.getMonth()] + ", " +
    d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
}

function cabBack() {
  return '<button class="cab-back" data-act="back"><span class="cab-back-ico">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    "</span><span>Кабинет</span></button>";
}

function cabRing(p, size, stroke, label, sub) {
  var r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return '<div class="cab-ring" style="width:' + size + "px;height:" + size + 'px;">' +
    '<svg width="' + size + '" height="' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--bgmuted)" stroke-width="' + stroke + '"/>' +
      (p > 0 ? '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--terra)" stroke-width="' + stroke +
        '" stroke-linecap="round" stroke-dasharray="' + (c * Math.min(1, p)).toFixed(1) + " " + c.toFixed(1) + '"/>' : "") +
    "</svg>" +
    '<div class="cab-ring-txt"><div class="cab-ring-val">' + label + "</div>" + (sub ? '<div class="cab-ring-sub">' + sub + "</div>" : "") + "</div></div>";
}

// Состояние каждого урока абонемента: использованные, оставшиеся и «золотой»
// (урок-срез) среди оставшихся — по списку ближайших записанных уроков.
function cabLessonSlots(data) {
  var sub = data && data.subscription;
  if (!sub || !sub.lessonsTotal) return [];
  var used = sub.lessonsTotal - sub.lessonsLeft;
  var up = (data.upcomingLessons || []);
  var out = [];
  for (var i = 0; i < sub.lessonsTotal; i++) {
    if (i < used) out.push("used");
    else out.push(up[i - used] && up[i - used].golden ? "gold" : "left");
  }
  return out;
}

function cabTermLines(sub) {
  if (!sub || !sub.termDays) return "";
  if (!sub.started) return '<div class="cab-term">Срок начнётся с' + NB + "первого урока</div>";
  return '<div class="cab-term">Срок до' + NB + dayMonth(sub.termEnd) +
    (sub.extraEnd ? '<br><span class="cab-term-extra">' + esc(sub.extraLabel).replace(" ", NB) + " до" + NB + dayMonth(sub.extraEnd) + "</span>" : "") +
    "</div>";
}

function renderCabMain(data) {
  var sub = data && data.subscription;
  var slots = cabLessonSlots(data);
  var tracker = (data && data.hwTracker) || [];
  var okN = tracker.filter(function (t) { return t.state === "ok"; }).length;

  var lessonsTile = '<div class="cab-tile" data-act="cab-lessons">' +
      '<div class="cab-tile-h">Уроки</div>' +
      (sub
        ? '<div class="cab-big-row"><span class="cab-big">' + sub.lessonsLeft + '</span><span class="cab-big-of">из' + NB + sub.lessonsTotal + "</span></div>" +
          '<div class="cab-dots">' + slots.map(function (s) { return '<span class="cab-dot ' + s + '"></span>'; }).join("") + "</div>" +
          cabTermLines(sub)
        : '<div class="cab-big-row"><span class="cab-big">0</span></div><div class="cab-term">Абонемента пока нет</div>') +
    "</div>";
  var hwTile = '<div class="cab-tile cab-tile-hw" data-act="cab-hw">' +
      '<div class="cab-tile-h">Домашние задания</div>' +
      (tracker.length
        ? cabRing(okN / tracker.length, 88, 9, okN + NB + "из" + NB + tracker.length, "сдано")
        : '<div class="cab-term" style="align-self:flex-start;">Задания появятся после урока</div>') +
    "</div>";

  var srezLine = data && data.nextSrez
    ? 'Следующий срез <span class="cab-gold-txt">★' + NB + dayMonth(data.nextSrez) + "</span>"
    : "Срез — на последнем уроке месяца";

  return '<div class="cab-tiles">' + lessonsTile + hwTile + "</div>" +
    '<button class="cta terra cab-cta" data-act="cab-renew">Пополнить уроки</button>' +
    // Караоке — яркой кнопкой над «Мой голос» (20.11): раньше пряталось строкой в списке
    '<button class="cab-kar-btn" data-act="cab-karaoke" aria-label="Караоке — мои треки"><span class="cab-kar-ic">' + CAB_ICO_KARAOKE_W + '</span>' +
      '<span class="cab-kar-txt"><b>Караоке</b><span>Мои треки: пой под минус с текстом</span></span><span class="cab-kar-go">›</span></button>' +
    '<div class="cab-card cab-rows">' +
      '<div class="cab-row" data-act="cab-voice"><div class="cab-ico">' + CAB_ICO_VOICE + '</div><div class="cab-row-txt"><b>Мой голос</b><div>Тип голоса, диапазон и цель</div></div><div class="cab-chev">›</div></div>' +
      '<div class="cab-row" data-act="cab-wheel"><div class="cab-ico">' + CAB_ICO_WHEEL + '</div><div class="cab-row-txt"><b>Колесо баланса</b><div>' + srezLine + '</div></div><div class="cab-chev">›</div></div>' +
      '<div class="cab-row" data-act="cab-pitch"><div class="cab-ico">' + CAB_ICO_PITCH + '</div><div class="cab-row-txt"><b>Распевки с проверкой</b><div>Поёшь с пианино, телефон слушает, попадаешь ли в ноты</div></div><div class="cab-chev">›</div></div>' +
      '<div class="cab-row" data-act="cab-bylo"><div class="cab-ico">' + CAB_ICO_BYLO + '</div><div class="cab-row-txt"><b>Было и стало</b><div>Послушай, как вырос твой голос</div></div><div class="cab-chev">›</div></div>' +
    "</div>";
}

var CAB_ICO_VOICE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="var(--terra)" stroke-width="1.8"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="var(--terra)" stroke-width="1.8" stroke-linecap="round"/></svg>';
var CAB_ICO_BYLO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 9v-2M7 10v-4M10 9v-2M14 17v-2M17 19v-6M20 17v-2" stroke="var(--terra)" stroke-width="1.8" stroke-linecap="round"/></svg>';
var CAB_ICO_PITCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 17c2.5 0 3-4 5.5-4s3 3 5.5 3 3-7 7-7" stroke="var(--terra)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="9" r="1.6" fill="var(--terra)"/></svg>';
var CAB_ICO_KARAOKE_W = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l11-2v13" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16" r="3" stroke="#fff" stroke-width="2"/></svg>';
var CAB_ICO_KARAOKE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l11-2v13" stroke="var(--terra)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="var(--terra)" stroke-width="1.8"/><circle cx="17" cy="16" r="3" stroke="var(--terra)" stroke-width="1.8"/></svg>';
var CAB_ICO_WHEEL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="12,3 20.5,9 17.5,19.5 6.5,19.5 3.5,9" stroke="var(--blue)" stroke-width="1.8" stroke-linejoin="round"/><polygon points="12,8 16,10.5 14.5,15.5 9,15 8,10.5" fill="var(--blue)" fill-opacity=".3" stroke="var(--blue)" stroke-width="1.4"/></svg>';

function renderCabLessons(data) {
  var sub = data && data.subscription;
  var up = (data && data.upcomingLessons) || [];
  var slots = cabLessonSlots(data);
  var circles = slots.map(function (s, i) {
    if (s === "used") return '<div class="cab-lesson used">✓</div>';
    if (s === "gold") return '<div class="cab-lesson gold">★</div>';
    return '<div class="cab-lesson left">' + (i + 1) + "</div>";
  }).join("");
  var left = sub ? sub.lessonsLeft : 0;
  var card = '<div class="cab-card">' +
      '<div class="cab-card-title">Мои уроки</div>' +
      (slots.length ? '<div class="cab-lessons' + (slots.length > 8 ? " many" : "") + '">' + circles + "</div>" : "") +
      '<div class="cab-left-row"><div>' +
        '<div class="cab-left">' + (sub ? "Осталось " + left + NB + plural(left, "урок", "урока", "уроков") : "Абонемента пока нет") + "</div>" +
        (up.length ? '<div class="cab-mute">Ближайший: ' + lessonWhen(up[0].at) + "</div>" : "") +
      "</div>" +
      '<button class="cta terra cab-cta-sm" data-act="cab-renew">Пополнить</button></div>' +
    "</div>";

  var gold = data && data.nextSrez
    ? '<div class="cab-gold-note"><div class="cab-lesson gold">★</div><div>Золотой урок ' + dayMonth(data.nextSrez) +
      ": делаем срез и заполняем колесо баланса</div></div>"
    : "";

  var term = "";
  if (sub && sub.termDays) {
    term = '<div class="cab-card cab-rows">' +
      '<div class="cab-row cab-row-static"><div class="cab-row-txt"><b>Срок абонемента</b><div>' + sub.termDays + NB + plural(sub.termDays, "день", "дня", "дней") + " с первого урока</div></div>" +
        '<div class="cab-term-val">' + (sub.started ? "до" + NB + dayMonth(sub.termEnd) : "с первого урока") + "</div></div>" +
      (sub.extraLabel
        ? '<div class="cab-row cab-row-static"><div class="cab-row-txt"><b>' + esc(sub.extraLabel) + "</b><div>чтобы успеть пройти оставшиеся уроки</div></div>" +
          '<div class="cab-term-val extra">' + (sub.started ? "до" + NB + dayMonth(sub.extraEnd) : "") + "</div></div>"
        : "") +
      "</div>";
  }
  return card + gold + term + cabHistoryHtml(data);
}

/* История абонементов (Коля, 17.11, вариант B): карточка на каждый абонемент,
   сверху свежий, внизу самый старый. Данные — subscriptionHistory из базы. */
/* История абонементов (вариант A, Коля 17.11): строки в одной карточке, под
   каждой — кружок на каждый урок; нажал на кружки — открылся список уроков
   с датами и тем, что с уроком было. Статусы приходят из бота через базу. */
var CAB_HL = { ok: "Проведён", mv: "Перенесён", cx: "Отменён", ns: "Не пришёл", up: "Впереди", wait: "Ждёт отметки" };
var CAB_HSYM = { ok: "✓", mv: "↻", cx: "✕", ns: "!", up: "", wait: "" };
var CAB_HCLS = { ok: "ok", mv: "rs", cx: "cx", ns: "ns", up: "fut", wait: "fut" };
var CAB_DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function cabDayFull(ymdStr) {
  var p = String(ymdStr).slice(0, 10).split("-").map(Number);
  return CAB_DOW[new Date(p[0], p[1] - 1, p[2]).getDay()] + ", " + dayMonth(ymdStr);
}

function cabHistLine(l) {
  var sub = "";
  if (l.s === "mv" && l.to) sub = "на " + cabDayFull(l.to);
  else if (l.s === "cx") sub = l.paid ? "урок списан: отмена меньше чем за сутки"
    : (l.teacher ? "отменил Николай, урок не списан" : "урок не списан");
  else if (l.s === "ns") sub = "урок списан";
  return '<div class="cab-hl"><div><div class="cab-hl-d">' + cabDayFull(l.day) + "</div>" +
      (sub ? '<div class="cab-hl-s">' + sub + "</div>" : "") + "</div>" +
    '<span class="cab-hst ' + CAB_HCLS[l.s] + '">' + CAB_HL[l.s] + "</span></div>";
}

function cabHistoryHtml(data) {
  var hist = (data && data.subscriptionHistory) || [];
  if (!hist.length) return "";
  var open = state._histOpen || {};
  var rows = hist.map(function (h, i) {
    var total = h.lessonsTotal || 0, used = Math.min(h.lessonsUsed || 0, total);
    var one = total === 1;
    var name = one ? "Разовый урок" : "Абонемент на " + total + NB + plural(total, "урок", "урока", "уроков");
    var lessons = (h.lessons || []).slice();
    if (h.current) {
      var upN = lessons.filter(function (l) { return l.s === "up"; }).length;
      for (var k = Math.max(0, total - used - upN); k > 0; k--) lessons.push({ s: "up" });
    }
    var dots = lessons.map(function (l) {
      return '<div class="cab-hdt ' + CAB_HCLS[l.s] + '">' + CAB_HSYM[l.s] + "</div>";
    }).join("");
    var dated = lessons.filter(function (l) { return l.day; });
    var isOpen = !!open[i];
    return '<div class="cab-hrow2' + (isOpen ? " open" : "") + '">' +
      '<div class="cab-hrow"><div class="cab-hnum ' + (h.current ? "cur" : "old") + '">' + total + "</div>" +
        '<div><b class="cab-hname">' + name + "</b>" +
          '<div class="cab-hs">' + (h.format || 45) + NB + "минут · куплен " + dayMonth(h.bought) + "</div></div>" +
        '<div class="cab-hr"><div class="cab-hv">пройдено ' + used + " из " + total + "</div>" +
          '<span class="cab-htag ' + (h.current ? "cur" : "old") + '">' + (h.current ? "Сейчас" : "Завершён") + "</span></div></div>" +
      (dots ? '<div class="cab-hdots"' + (dated.length ? ' data-hist-toggle="' + i + '" role="button" aria-expanded="' + isOpen + '"' : "") + ">" + dots + "</div>" : "") +
      (dated.length ? '<div class="cab-hlist">' + dated.map(cabHistLine).join("") + "</div>" : "") +
    "</div>";
  }).join("");
  var leg = '<div class="cab-hleg">' + ["ok", "mv", "cx", "ns", "up"].map(function (t) {
    return '<span><div class="cab-hdt ' + CAB_HCLS[t] + '">' + CAB_HSYM[t] + "</div>" + CAB_HL[t] + "</span>";
  }).join("") + "</div>";
  return '<div class="cab-hsec">История абонементов</div>' + leg +
    '<div class="cab-hcard">' + rows + "</div>";
}

function wireCabHistory(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll("[data-hist-toggle]"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      var i = el.getAttribute("data-hist-toggle");
      state._histOpen = state._histOpen || {};
      state._histOpen[i] = !state._histOpen[i];
      el.parentNode.classList.toggle("open", !!state._histOpen[i]);
      el.setAttribute("aria-expanded", String(!!state._histOpen[i]));
    });
  });
}

function renderCabHw(data, homework) {
  var tracker = (data && data.hwTracker) || [];
  var okN = tracker.filter(function (t) { return t.state === "ok"; }).length;
  var sq = "", lab = "";
  tracker.forEach(function (t, i) {
    sq += '<div class="cab-sq ' + t.state + '">' + (t.state === "ok" ? SVG_HW_CHECK : "") + "</div>";
    lab += '<div class="cab-sq-lab">' + (i + 1) + "</div>";
  });
  // Открытые задания: всё, что не сдано, плюс сданное, пока не прошёл его срок —
  // чтобы отмеченное задание не пропадало из-под пальца.
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var list = "", doneItems = [];
  (homework || []).forEach(function (hw, i) {
    var due = hw.due ? new Date(String(hw.due).slice(0, 10) + "T00:00:00") : null;
    if (hw.done && !(due && due >= today)) { doneItems.push({ hw: hw, i: i }); return; }
    var overdue = due && due < today && !hw.done;
    var busy = state._hwBusy[hwKey(hw)];
    list += '<div class="cab-hw' + (hw.done ? " hw-item-done" : "") + '">' +
      '<button class="hw-check' + (hw.done ? " done" : "") + '" data-hw-toggle="' + i + '"' + (busy ? " disabled" : "") +
        ' aria-pressed="' + (hw.done ? "true" : "false") + '" aria-label="Отметить выполненным">' + SVG_HW_CHECK + "</button>" +
      '<div style="flex:1;min-width:0;"><div class="hw-title cab-hw-title">' + esc(hw.title || "") + "</div>" +
        (due ? '<div class="cab-hw-due' + (overdue ? " red" : "") + '">до ' + dayMonth(hw.due) + (overdue ? " · просрочено" : "") + "</div>" : "") +
      "</div></div>";
  });
  // 20.11: сданные задания тоже видны — списком ниже, свежие сверху
  doneItems.sort(function (a, b) { return String(b.hw.lessonDate || b.hw.due || "") < String(a.hw.lessonDate || a.hw.due || "") ? -1 : 1; });
  var done = doneItems.map(function (x) {
    var hw = x.hw, when = hw.lessonDate || hw.due;
    return '<div class="cab-hw hw-item-done">' +
      '<div class="hw-check done" aria-hidden="true">' + SVG_HW_CHECK + "</div>" +
      '<div style="flex:1;min-width:0;"><div class="hw-title cab-hw-title">' + esc(hw.title || "") + "</div>" +
        (when ? '<div class="cab-hw-due">' + (hw.lessonDate ? "урок " : "до ") + dayMonth(when) + " · сдано</div>" : '<div class="cab-hw-due">сдано</div>') +
      "</div></div>";
  }).join("");
  return '<div class="cab-card">' +
      '<div class="cab-card-title">Домашние задания' + (tracker.length ? "<small>сдано " + okN + " из " + tracker.length + "</small>" : "") + "</div>" +
      (tracker.length
        ? '<div class="cab-sqs">' + sq + '</div><div class="cab-sqs">' + lab + "</div>" +
          '<div class="cab-mute cab-sq-cap">Каждый квадрат — задание после урока. Пустой — не сдано.</div>'
        : '<div class="cab-mute">Задания появятся здесь после урока.</div>') +
      (list ? '<div class="cab-hw-list">' + list + "</div>" : "") +
      (done ? '<div class="cab-hw-sub">Сданные</div><div class="cab-hw-list">' + done + "</div>" : "") +
    "</div>";
}

/* «Колесо баланса» отдельным экраном. Вокруг колеса — точки с номерами зон;
   нажал точку — страница едет к этой зоне в списке и подсвечивает её
   (просьба Николая 17.11). Сравнение срезов работает как раньше. */
function renderCabWheel(data) {
  var gold = data && data.nextSrez
    ? '<div class="cab-gold-note"><div class="cab-lesson gold">★</div><div>Следующий срез ' + dayMonth(data.nextSrez) + ", на золотом уроке</div></div>"
    : "";
  var srezy = data ? data.srezy : [];
  var wheelTopics = data ? data.wheelTopics : [];
  var list = Array.isArray(srezy) ? srezy : [];
  var current = (Array.isArray(wheelTopics) && wheelTopics.length)
    ? wheelTopics
    : (list.length ? (list[list.length - 1].topics || []) : []);
  // 20.11 (Николай): пустые зоны (без оценки ни сейчас, ни в срезах) не показываем
  var hasScore = function (v) { return v !== null && v !== undefined && v !== "" && !isNaN(Number(v)) && Number(v) > 0; };
  var filled = {};
  current.forEach(function (t) { if (hasScore(t.score)) filled[t.name] = 1; });
  list.forEach(function (z) { (z.topics || []).forEach(function (t) { if (hasScore(t.score)) filled[t.name] = 1; }); });
  current = current.filter(function (t) { return filled[t.name]; });
  // 20.11: зоны по блокам — уровни A–D, как на сайте; порядок A→D
  var LV = ["A", "B", "C", "D"];
  var lvOf = function (t) { return LV.indexOf(t.level) > -1 ? t.level : ""; };
  current = current.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) {
    var x = LV.indexOf(lvOf(a.t)), y = LV.indexOf(lvOf(b.t));
    return (x < 0 ? 9 : x) - (y < 0 ? 9 : y) || a.i - b.i;
  }).map(function (o) { return o.t; });
  var levels = [];
  current.forEach(function (t) { var l = lvOf(t); if (levels.indexOf(l) < 0) levels.push(l); });
  // 20.11: вкладки «Все» нет — всегда открыт один уровень, по умолчанию первый
  if (state._wheelLvl == null || levels.indexOf(state._wheelLvl) < 0) state._wheelLvl = levels[0];
  var lvName = function (l) { return l ? "Уровень " + l : "Другое"; };
  var lvTabs = levels.length > 1
    ? '<div class="cab-lvl-tabs">' + levels.map(function (l) {
        var on = state._wheelLvl === l;
        return '<span class="cab-lvl-tab' + (on ? " on" : "") + '" data-act="wheel-lvl" data-lvl="' + (l || "-") + '">' + lvName(l) + "</span>";
      }).join("") + "</div>"
    : "";
  current = current.filter(function (t) { return lvOf(t) === state._wheelLvl; });
  if (!current.length) {
    return '<div class="cab-screen-title">Колесо баланса</div>' + gold +
      '<div class="instruction-note">Колесо заполним вместе на первом срезе.</div>';
  }
  var order = current.map(function (t) { return t.name; });
  var series = [{ topics: current, color: "var(--terra)", fill: 0.18 }];
  var picked = [];
  state._srezCompare.forEach(function (id, i) {
    var found = null;
    for (var k = 0; k < list.length; k++) if (list[k].id === id) found = list[k];
    if (found) {
      picked.push(found);
      series.push({ topics: found.topics, color: SREZ_COMPARE_COLORS[i % SREZ_COMPARE_COLORS.length], fill: 0.07 });
    }
  });
  var sel = state._wheelZone;

  var showHeads = false, prevLv = null;
  var rows = current.map(function (t, i) {
    var head = "";
    if (showHeads && lvOf(t) !== prevLv) { prevLv = lvOf(t); head = '<div class="cab-lvl-head">' + lvName(prevLv) + "</div>"; }
    var score = (t.score === null || t.score === undefined) ? null : Number(t.score);
    var cmp = picked.map(function (z, k) {
      var pv = null;
      (z.topics || []).forEach(function (x) { if (x.name === t.name) pv = x.score; });
      return '<span class="srez-cmp" style="color:' + SREZ_COMPARE_COLORS[k % SREZ_COMPARE_COLORS.length] + ';">' +
        (pv === null || pv === undefined ? "—" : pv) + "</span>";
    }).join("");
    var pct = score === null ? 0 : Math.max(0, Math.min(10, score)) * 10;
    // Сравнение срезов (вариант A «Ступени», выбор Николая 17.11): линия
    // разбита на куски цветами срезов. Сзади — текущая оценка терракотой,
    // поверх — оценки сравниваемых срезов, от большей к меньшей, чтобы
    // каждый кусок был виден: сколько выросло с каждого среза.
    var steps = "";
    if (picked.length) {
      picked.map(function (z, k) {
        var pv = null;
        (z.topics || []).forEach(function (x) { if (x.name === t.name) pv = x.score; });
        return { v: (pv === null || pv === undefined) ? null : Math.max(0, Math.min(10, Number(pv))), k: k };
      }).filter(function (o) { return o.v !== null && !isNaN(o.v); })
        .sort(function (a, b) { return b.v - a.v; })
        .forEach(function (o) {
          steps += '<div class="srez-bar-step" style="width:' + (o.v * 10) + '%;background:' +
            SREZ_COMPARE_COLORS[o.k % SREZ_COMPARE_COLORS.length] + ';"></div>';
        });
    }
    return head + '<div class="cab-zone' + (sel === i ? " on" : "") + '" id="cab-zone-' + i + '">' +
      '<div class="cab-zone-num">' + (i + 1) + "</div>" +
      '<div style="flex:1;min-width:0;"><div class="srez-row-head">' +
        '<span class="srez-name">' + esc(t.name) + "</span>" + cmp +
        '<span class="cab-zone-score">' + (score === null ? "—" : score + " из 10") + "</span></div>" +
        '<div class="srez-bar' + (picked.length ? " steps" : "") + '"><div class="srez-bar-fill" style="width:' + pct + '%;"></div>' + steps + "</div>" +
      "</div></div>";
  }).join("");
  // Над зонами — даты сравниваемых срезов их цветами, чтобы куски линии
  // читались без поиска по списку срезов ниже.
  var legend = picked.length
    ? '<div class="srez-legend">' + picked.map(function (z, k) {
        return '<span style="color:' + SREZ_COMPARE_COLORS[k % SREZ_COMPARE_COLORS.length] + ';">● ' + esc(z.date || "") + "</span>";
      }).join("") + '<span style="color:var(--terra);">● сейчас</span></div>'
    : "";

  var recent = list.slice().reverse().slice(0, 5);
  var hist = "";
  if (list.length) {
    hist = '<div class="srez-hist-title">Срезы</div>' +
      '<div class="srez-hist-hint">Нажми на дату, чтобы наложить срез на колесо — можно сравнить до трёх.' +
        (list.length > recent.length ? " Показаны последние " + recent.length + " из " + list.length + "." : "") + "</div>" +
      recent.map(function (z) {
        var at = state._srezCompare.indexOf(z.id);
        var col = at > -1 ? SREZ_COMPARE_COLORS[at % SREZ_COMPARE_COLORS.length] : "";
        var scored = (z.topics || []).filter(function (t) { return t.score !== null && t.score !== undefined; }).length;
        return '<div class="srez-hist-item' + (at > -1 ? " on" : "") + '" data-act="srez-toggle" data-srez-id="' + esc(z.id) + '"' +
            (col ? ' style="border-color:' + col + ';"' : "") + ">" +
            '<span class="srez-hist-date">' + esc(z.date || "") + "</span>" +
            '<span class="srez-hist-count">' + scored + " из " + (z.topics || []).length + "</span></div>";
      }).join("");
  }

  return '<div class="cab-screen-title">Колесо баланса</div>' + gold +
    '<div class="cabinet-inset">' + lvTabs +
      cabWheelSvg(order, series, sel, current.map(function (t) { return t.score; })) +
      '<div class="cab-wheel-hint">Нажми на точку — покажу, что это за зона</div>' +
      '<div class="srez-hist-title">Зоны колеса</div>' + legend + rows + hist +
    "</div>";
}

function cabWheelSvg(order, series, sel, scores) {
  var cx = 120, cy = 120, R = 88, n = order.length;
  var svg = srezWheelSvg(order, series);
  // srezWheelSvg рисует колесо в поле 220×220 с центром 110 и радиусом 92 —
  // кладём его внутрь поля побольше, чтобы снаружи поместились точки.
  var inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  var k = R / 92;
  var dotR = n > 12 ? 9 : 11, fs = n > 12 ? 9 : 11;
  var dots = order.map(function (_, i) {
    var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    var x = (cx + 104 * Math.cos(a)).toFixed(1), y = (cy + 104 * Math.sin(a)).toFixed(1);
    var on = sel === i;
    return '<g class="cab-wdot' + (on ? " on" : "") + '" data-zone="' + i + '">' +
      '<circle cx="' + x + '" cy="' + y + '" r="20" fill="transparent"/>' +
      (on ? '<circle cx="' + x + '" cy="' + y + '" r="' + (dotR + 4) + '" fill="var(--terra)" fill-opacity=".18"/>' : "") +
      '<circle cx="' + x + '" cy="' + y + '" r="' + dotR + '" class="cab-wdot-c"/>' +
      '<text x="' + x + '" y="' + (Number(y) + fs * 0.36).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '" class="cab-wdot-t">' + wdotLabel(scores, i) + "</text></g>";
  }).join("");
  return '<svg viewBox="0 0 240 240" class="cab-wheel">' +
    '<g transform="translate(' + (cx - 110 * k).toFixed(2) + " " + (cy - 110 * k).toFixed(2) + ") scale(" + k.toFixed(4) + ')">' + inner + "</g>" +
    dots + "</svg>";
}

// 20.11 (Николай): на точках колеса — оценка зоны, а не её номер
function wdotLabel(scores, i) {
  if (!scores) return i + 1;
  var v = scores[i];
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "—";
  return String(Math.round(Number(v) * 10) / 10);
}

function wireCabWheelDots(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll(".cab-wdot"), function (el) {
    el.addEventListener("click", function () {
      var i = parseInt(el.getAttribute("data-zone"), 10);
      state._wheelZone = i;
      render();
      var row = document.getElementById("cab-zone-" + i);
      if (row && row.scrollIntoView) {
        try { row.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { row.scrollIntoView(); }
      }
    });
  });
}

function openRenew() {
  // Покупка уроков живёт в боте: start=renew — чтобы бот знал, откуда пришли.
  var url = "https://t.me/" + TEACHER_BOT_USERNAME + "?start=renew";
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
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

/* Расписание преподавателя: пн/вт — выходной, ср — личный день с укороченным
   окном 12:15–16:00, чт-вс — обычные рабочие дни с 10:00, урок 45 минут,
   перерыв 14:30–15:15. */
var STANDARD_SLOTS = ["10:00", "10:45", "11:30", "12:15", "13:00", "13:45", "15:15", "16:00", "16:45", "17:30", "18:15", "19:00"];
var WEDNESDAY_SLOTS = ["12:15", "13:00", "13:45", "14:30", "15:15"];

function dowMonFirst(dateStr) {
  var date = new Date(dateStr + "T00:00:00");
  return (date.getDay() + 6) % 7; // 0=Пн ... 6=Вс
}

function slotsForDate(dateStr) {
  var dow = dowMonFirst(dateStr);
  if (dow === 0 || dow === 1) return []; // пн/вт — выходной
  if (dow === 2) return WEDNESDAY_SLOTS.slice(); // ср — личный день
  return STANDARD_SLOTS.slice(); // чт-вс — рабочие дни
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
    var isDayOff = dow === 0 || dow === 1; // пн/вт — выходной, не бронируется вообще
    var isBusy = state.calConfigured && !isPast && !isSelected && !isDayOff && busy.indexOf(dateStr) !== -1;
    var clickable = !isPast && !isDayOff;
    // свободный день — фирменная сине-мятная «таблетка», не зависит от темы
    // (как акцентные цвета terra/blue), только внешняя тень следует теме
    var bg = "oklch(90% 0.03 235)", color = "oklch(38% 0.06 235)",
      shadow = "3px 3px 6px oklch(var(--sh-base)/0.28), -3px -3px 6px oklch(var(--sh-hi-base)/0.75)";
    if (isSelected) { bg = "var(--blue)"; color = "var(--white-text)"; shadow = "3px 3px 6px oklch(var(--sh-base)/0.35)"; }
    else if (isPast || isDayOff) { bg = "var(--bg)"; color = "var(--locked)"; shadow = "none"; }
    else if (isBusy) { bg = "oklch(88% 0.05 38)"; color = "oklch(45% 0.1 38)"; shadow = "3px 3px 6px oklch(var(--sh-base)/0.28), -3px -3px 6px oklch(var(--sh-hi-base)/0.75)"; }
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
  var slots = slotsForDate(dateStr);
  return slots.map(function (t) {
    var isSelected = selectedTime === t;
    var bg = "var(--bg)", color = "var(--ink)",
      shadow = "5px 5px 10px oklch(var(--sh-base)/0.3), -5px -5px 10px oklch(var(--sh-hi-base)/0.8)";
    if (isSelected) { bg = "var(--blue)"; color = "var(--white-text)"; shadow = "4px 4px 8px oklch(var(--sh-base)/0.35)"; }
    return {
      t: t,
      style: "height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font:700 13px Manrope,sans-serif;background:" + bg + ";color:" + color + ";box-shadow:" + shadow + ";cursor:pointer;"
    };
  });
}

function submitBooking(dateStr, time) {
  var f = baseSubmitFields();
  f.append("kind", "booking");
  f.append("text", "Дата: " + dateStr + ", время: " + time + " (45 мин)");
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
      '<div style="font:600 12.5px Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--gray-mute);">Запись</div>' +
      '<div style="font:800 27px Manrope,sans-serif;color:var(--ink);margin-top:4px;">Запись на занятие</div>' +
      '<div style="font-size:13px;color:var(--gray);margin-top:2px;">Выбери свободную дату</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;">' +
        '<button class="cal-nav-btn" data-act="cal-prev">‹</button>' +
        '<div style="font:700 18px Manrope,sans-serif;color:var(--ink);text-transform:capitalize;">' + CAL_MONTHS[vm] + " " + vy + "</div>" +
        '<button class="cal-nav-btn" data-act="cal-next">›</button>' +
      "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:20px;">' +
        CAL_WEEKDAYS_SHORT.map(function (w) { return '<div style="text-align:center;font:600 10.5px Inter,sans-serif;letter-spacing:.02em;color:var(--gray-mute);text-transform:uppercase;">' + w + "</div>"; }).join("") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:7px 6px;margin-top:8px;">' + cellsHtml + "</div>" +
      '<div style="margin-top:20px;display:flex;gap:16px;font:500 11.5px Inter,sans-serif;color:var(--gray);">' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;border-radius:50%;background:oklch(56% 0.09 235);display:inline-block;"></span>свободный день</div>' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;border-radius:50%;background:oklch(60% 0.13 38);display:inline-block;"></span>уже есть уроки</div>' +
      "</div>" +
      (state.calConfigured
        ? ""
        : '<div class="instruction-note" style="margin-top:18px;">Сейчас показан демо-календарь — как только впишешь ключ HolyHope, точки «занято» станут твоим настоящим расписанием.</div>');
  } else if (!state.calBookedFlag) {
    var selDate = new Date(state.selectedDate + "T00:00:00");
    var selLabel = selDate.getDate() + " " + CAL_MONTHS[selDate.getMonth()] + ", " + CAL_WEEKDAYS_FULL[(selDate.getDay() + 6) % 7];
    var slots = buildTimeSlots(state.selectedDate, state.selectedTime);
    var slotsHtml = slots.length
      ? slots.map(function (sl) {
          return '<div data-slot-time="' + sl.t + '" style="' + sl.style + '">' + sl.t + "</div>";
        }).join("")
      : '<div class="courses-empty" style="grid-column:1/-1;">В этот день занятия не проводятся</div>';
    html =
      '<div style="display:flex;flex-direction:column;min-height:calc(100vh - 188px);">' +
        '<div>' +
          '<button class="cal-nav-btn" style="width:auto;height:44px;padding:0 18px;border-radius:14px;color:var(--blue);font:600 13px Inter,sans-serif;margin-bottom:16px;" data-act="cal-clear">‹ Другая дата</button>' +
          '<div style="font:800 24px Manrope,sans-serif;color:var(--ink);text-transform:capitalize;">' + selLabel + "</div>" +
          '<div style="margin-top:40px;">' +
            '<div class="section-label" style="margin-top:0;">Свободное время</div>' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">' + slotsHtml + "</div>" +
          "</div>" +
        "</div>" +
        '<div style="padding:24px 0 6px;margin-top:auto;">' +
          '<button class="cta" id="confirm-booking-btn"' + (state.selectedTime == null ? " disabled" : "") + '>' +
            (state.selectedTime == null ? "Выбери время 😇" : "Подтвердить на " + state.selectedTime) +
          "</button>" +
        "</div>" +
      "</div>";
  } else {
    html =
      '<div style="margin-top:6px;display:flex;flex-direction:column;gap:14px;">' +
        '<div style="background:oklch(90% 0.04 38);border-radius:18px;padding:16px 18px;font:500 13.5px/1.5 Inter,sans-serif;color:oklch(38% 0.1 38);">' +
          "Заявка отправлена преподавателю. Урок в день занятия отменить или перенести нельзя — планируй заранее 🙏🏻" +
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

  app.innerHTML = '<div style="padding:var(--screen-top) 22px 130px;">' + html + "</div>";

  Array.prototype.forEach.call(app.querySelectorAll("[data-cal-date]"), function (el) {
    el.addEventListener("click", function () {
      state.selectedDate = el.getAttribute("data-cal-date");
      state.selectedTime = null;
      state.calBookedFlag = false;
      render();
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-slot-time]"), function (el) {
    el.addEventListener("click", function () {
      state.selectedTime = el.getAttribute("data-slot-time");
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
  loadIsAdmin();
  // «Тёмная тема»: бейдж/иконка нарочно инвертированы относительно текущей темы —
  // тёмный бейдж на светлом фоне, светлый бейдж на тёмном (наоборот, чем bgmuted/ink
  // обычно себя ведут), чтобы значок луны сразу читался как переключатель темы.
  var darkRowIconBg = s.darkMode ? "oklch(90% 0.012 75)" : "oklch(34% 0.012 235)";
  var darkRowIconColor = s.darkMode ? "oklch(28% 0.015 70)" : "oklch(92% 0.008 235)";
  // «Уведомления»/«Написать в поддержку»: в тёмной теме — свои тёмные насыщенные
  // бейджи вместо светлых пастельных, в светлой теме цвета как в дизайне, не трогаем.
  var notifIconBg = s.darkMode ? "oklch(32% 0.06 235)" : "var(--soft-blue)";
  var notifIconColor = s.darkMode ? "oklch(85% 0.04 235)" : "oklch(38% 0.06 235)";
  var supportIconBg = s.darkMode ? "oklch(32% 0.08 38)" : "var(--soft-terra)";
  var supportIconColor = s.darkMode ? "oklch(85% 0.06 38)" : "oklch(38% 0.1 38)";
  var items = [
    {
      label: "Тёмная тема", isToggle: true, on: s.darkMode,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 108.5 6.9 6 6 0 01-1.5.1z" stroke="' + darkRowIconColor + '" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: darkRowIconBg
    },
    {
      label: "Уведомления", isToggle: true, on: s.notifOn,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1a4 4 0 00-4 4v2.5L2.5 10h11L12 7.5V5a4 4 0 00-4-4z" stroke="' + notifIconColor + '" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.2 12.5a1.9 1.9 0 003.6 0" stroke="' + notifIconColor + '" stroke-width="1.4" stroke-linecap="round"/></svg>',
      iconBg: notifIconBg
    },
    {
      label: "Написать в поддержку", isLink: true, support: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H5l-3 3V3z" stroke="' + supportIconColor + '" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: supportIconBg
    },
    {
      label: "Правила и оферта", isLink: true, doc: "offer",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="var(--gray)" stroke-width="1.4"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3" stroke="var(--gray)" stroke-width="1.2" stroke-linecap="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "Политика конфиденциальности", isLink: true, doc: "privacy",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 2v4c0 3.6-2.3 6-5.5 7-3.2-1-5.5-3.4-5.5-7v-4L8 1.5z" stroke="var(--gray)" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "О преподавателе", isLink: true, doc: "about",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--gray)" stroke-width="1.4"/><path d="M8 5.3v.1M7 7.3h1v3.5h1" stroke="var(--gray)" stroke-width="1.3" stroke-linecap="round"/></svg>',
      iconBg: "var(--bgmuted)"
    },
    {
      label: "Сбросить и войти как другой ученик", danger: true, reset: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2H3.5A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14H6M10.5 11l3-3-3-3M13 8H6" stroke="oklch(53% 0.18 25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      iconBg: "var(--soft-red)"
    }
  ];
  // Тест-драйв: никаких входов по коду (Николай, 20.11)
  if (window.GUEST_ON) items = items.filter(function (it) { return !it.reset; });
  // Виден только Николаю (chatId === ADMIN_CHAT_ID на сервере) — скрыт от учеников.
  if (readAdminKey() && !window.GUEST_ON) {
    items.push({
      label: "Режим админа", isToggle: true, on: !!s.isAdmin, adminToggle: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 2v4c0 3.6-2.3 6-5.5 7-3.2-1-5.5-3.4-5.5-7v-4L8 1.5z" stroke="var(--gray)" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      iconBg: "var(--bgmuted)"
    });
  }
  if (s.isAdmin) {
    // Единая точка входа для всего, что видно только преподавателю — сейчас
    // внутри выбор ученика (имперсонация) и дни рождения, дальше сюда же
    // будут добавляться новые admin-only функции (см. renderAdminHub).
    // Фон иконки — var(--bgmuted), как у остальных пунктов списка: раньше
    // тут был var(--soft-blue), который в тёмной теме не темнеет (акцентные
    // цвета для .dark сознательно не переопределены) и «горел» слишком ярко.
    items.push({
      label: "Панель админа", isLink: true, adminEntry: true,
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 2v4c0 3.6-2.3 6-5.5 7-3.2-1-5.5-3.4-5.5-7v-4L8 1.5z" stroke="var(--gray)" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 8l1.5 1.5L10.5 6" stroke="var(--gray)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      iconBg: "var(--bgmuted)"
    });
  }

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
    '<div style="padding:var(--screen-top) 20px 130px;">' +
      '<div class="courses-title" style="margin-bottom:18px;">Ещё</div>' +
      itemsHtml +
    "</div>";

  Array.prototype.forEach.call(app.querySelectorAll("[data-more-idx]"), function (el) {
    el.addEventListener("click", function () {
      var idx = parseInt(el.getAttribute("data-more-idx"), 10);
      var item = items[idx] || {};
      if (idx === 0) { toggleDarkMode(); return; }
      if (idx === 1) { state.notifOn = !state.notifOn; saveState(); render(); return; }
      // Дальше — по флагу самого пункта, а не по его номеру: номер «Сбросить»
      // съезжает, как только в список добавят ещё один пункт выше.
      if (item.reset) { resetProgress(); return; }
      if (item.doc) { openDoc(item.doc); return; }
      if (item.adminEntry) { go("admin-hub"); return; }
      if (item.adminToggle) { setAdminOn(!state.isAdmin); return; }
      if (item.support) { openSupport(); return; }
    });
  });
  wireActs();
}

/* Текстовые экраны раздела «Ещё»: публичная оферта, политика конфиденциальности
   и «О преподавателе». Вёрстка на все три одна — различается только содержимое,
   которое лежит в legal.js (LEGAL_DOCS). Какой именно документ открыт, помнит
   state.docKey; в localStorage он не пишется — экран живёт только в сессии. */
function openDoc(key) {
  state.docKey = key;
  go("doc");
}

function renderDoc() {
  var doc = (typeof LEGAL_DOCS !== "undefined") && LEGAL_DOCS[state.docKey];
  if (!doc) { go("more"); return; }

  var body = doc.sections.map(function (s) {
    if (s.note) return '<div class="doc-note">' + esc(s.note) + "</div>";
    var html = "";
    if (s.h) html += '<div class="doc-h">' + esc(s.h) + "</div>";
    (s.p || []).forEach(function (t) { html += '<p class="doc-p">' + esc(t) + "</p>"; });
    if (s.list && s.list.length) {
      html += '<ul class="doc-list">' +
        s.list.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") +
        "</ul>";
    }
    // Абзац, который по смыслу идёт ПОСЛЕ списка (например «8.2. Для реализации
    // любого из перечисленных прав…») — иначе он оторвался бы от своего перечня.
    if (s.after) html += '<p class="doc-p">' + esc(s.after) + "</p>";
    return html;
  }).join("");

  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      "<div>" +
        '<div class="top-title lg">' + esc(doc.title) + "</div>" +
        (doc.sub ? '<div class="top-sub">' + esc(doc.sub) + "</div>" : "") +
      "</div>" +
    "</div>" +
    '<div class="doc-body">' +
      (doc.version ? '<div class="doc-version">' + esc(doc.version) + "</div>" : "") +
      body +
    "</div>";
  wireActs();
}

/* ---------- «Написать в поддержку» ----------
   Ученик пишет сообщение и прикладывает сколько угодно фото и видео — всё
   приходит Николаю в бот записи (@your_vocal_teacher_bot), ответ Николая
   приходит ученику в Telegram, в чат с ботом.
   Файлы любого размера сначала уходят прямо в хранилище (vendor/blob-client.js,
   грузится только на этом экране), потом api/support.mjs пересылает их в
   Telegram: до 50 МБ — обычными фото и видео, крупнее — ссылкой. */

var SUPPORT_MAX_TEXT = 3000;
var SUPPORT_TG_PHOTO = 10 * 1024 * 1024;
var SUPPORT_TG_FILE = 50 * 1024 * 1024;
var SUPPORT_BATCH = 48 * 1024 * 1024;

var supportUI = {
  text: "",
  files: [],        // {file, name, size, kind, status: idle|uploading|uploaded|sent, pathname, meta}
  status: "idle",   // idle | sending | sent | error
  stage: "",        // upload | send
  headerId: null,   // карточка обращения у Николая — при «Повторить» новую не шлём
  name: "",
  error: "",
  loaded: 0, total: 0, sentFiles: 0
};

function supportResetForm() {
  supportUI.text = "";
  supportUI.files = [];
  supportUI.status = "idle";
  supportUI.stage = "";
  supportUI.headerId = null;
  supportUI.name = "";
  supportUI.error = "";
  supportUI.loaded = 0; supportUI.total = 0; supportUI.sentFiles = 0;
}

function openSupport() {
  if (supportUI.status === "sent") supportResetForm();
  loadBlobClient();
  go("support");
}

var _blobClientPromise = null;
function loadBlobClient() {
  if (window.BlobClient) return Promise.resolve(window.BlobClient);
  if (_blobClientPromise) return _blobClientPromise;
  _blobClientPromise = new Promise(function (resolve, reject) {
    var s = document.createElement("script");
    s.src = "/vendor/blob-client.js";
    s.onload = function () { window.BlobClient ? resolve(window.BlobClient) : reject(new Error("no client")); };
    s.onerror = function () { _blobClientPromise = null; reject(new Error("load failed")); };
    document.head.appendChild(s);
  });
  return _blobClientPromise;
}

function supportIdentity() {
  return {
    initData: (tg && tg.initData) || "",
    // в «Режиме админа» код ученика не шлём — пишет сам Николай (по подписи Telegram)
    accessToken: state.adminMode ? "" : (state.accessToken || "")
  };
}

function supportSizeText(bytes) {
  var mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1).replace(".", ",") + " ГБ";
  if (mb >= 10) return Math.round(mb) + " МБ";
  if (mb >= 0.1) return mb.toFixed(1).replace(".", ",") + " МБ";
  return Math.max(1, Math.round(bytes / 1024)) + " КБ";
}

function supportKind(file) {
  if (/^video\//.test(file.type || "")) return "video";
  if (/^image\//.test(file.type || "")) return "photo";
  return /\.(mov|mp4|m4v|webm|3gp|avi|mkv)$/i.test(file.name || "") ? "video" : "photo";
}

function supportPathname(item, i) {
  var ext = (String(item.name || "").match(/\.([A-Za-z0-9]{1,5})$/) || [])[1];
  if (!ext) ext = item.kind === "video" ? "mp4" : "jpg";
  return "support/" + item.kind + "-" + Date.now().toString(36) + "-" + i + "." + ext.toLowerCase();
}

var SUPPORT_ICON = {
  photo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.8" y="3" width="12.4" height="10" rx="2" stroke="oklch(38% 0.06 235)" stroke-width="1.4"/><circle cx="5.6" cy="6.6" r="1.2" stroke="oklch(38% 0.06 235)" stroke-width="1.2"/><path d="M2.5 11.5l3.4-3 2.4 2 2.2-1.8 3 2.6" stroke="oklch(38% 0.06 235)" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  video: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="9.5" height="9" rx="2" stroke="oklch(38% 0.1 38)" stroke-width="1.4"/><path d="M11 7l3.5-2v6L11 9" stroke="oklch(38% 0.1 38)" stroke-width="1.4" stroke-linejoin="round"/></svg>'
};

function supportFileHint(item) {
  var size = supportSizeText(item.size);
  if (item.status === "uploading") return size + " · загружаю…";
  if (item.status === "uploaded") return size + " · загружено";
  if (item.status === "sent") return size + " · отправлено ✓";
  return size;
}

function renderSupport() {
  var u = supportUI;
  if (u.status === "sent") { renderSupportSent(); return; }
  var busy = u.status === "sending";
  var canSend = !busy && (u.text.trim() || u.files.length);

  var listHtml = u.files.map(function (item, idx) {
    return (
      '<div class="hw-attached support-file">' +
        '<div class="hw-icon' + (item.kind === "video" ? " terra" : "") + '">' + SUPPORT_ICON[item.kind] + "</div>" +
        '<div style="flex:1;min-width:0;">' +
          '<div class="hw-name support-file-name">' + esc(item.name) + "</div>" +
          '<div class="hw-hint" id="support-hint-' + idx + '">' + supportFileHint(item) + "</div>" +
        "</div>" +
        (busy || item.status === "sent" ? "" : '<button class="hw-replace" data-support-remove="' + idx + '">Убрать</button>') +
      "</div>"
    );
  }).join("");

  var progressHtml = "";
  if (busy) {
    progressHtml =
      '<div class="lesson-progress-label" id="support-progress-label" style="margin-top:4px;">' + supportProgressLabel() + "</div>" +
      '<div class="lesson-progress-bar support-progress"><div id="support-progress-fill" style="width:' + supportProgressPct() + '%;"></div></div>';
  }
  var errorHtml = u.status === "error"
    ? '<div class="support-error">' + esc(u.error || "Не получилось отправить. Проверь интернет и нажми «Отправить ещё раз»: уже загруженное заново грузить не придётся.") + "</div>"
    : "";

  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      "<div>" +
        '<div class="top-title lg">Написать в поддержку</div>' +
        '<div class="top-sub">Николай ответит тебе в Telegram</div>' +
      "</div>" +
    "</div>" +
    '<div class="support-body">' +
      '<div class="instruction-note">Опиши, что случилось или о чём хочешь спросить. Можно приложить сколько угодно фото и видео: например, снимок экрана или запись упражнения.</div>' +
      '<label class="field-label" for="support-text">СООБЩЕНИЕ</label>' +
      '<textarea id="support-text" class="feedback-textarea support-textarea" maxlength="' + SUPPORT_MAX_TEXT + '" placeholder="Например: не открывается видео в третьем уроке"' + (busy ? " disabled" : "") + ">" + esc(u.text) + "</textarea>" +
      '<div class="support-files">' + listHtml + "</div>" +
      (busy ? "" :
        '<div class="hw-choice">' +
          '<label class="hw-upload"><input type="file" accept="image/*,video/*" multiple id="support-file" style="display:none;">' +
            SVG.upload + (u.files.length ? "Прикрепить ещё фото или видео" : "Прикрепить фото или видео") +
          "</label>" +
        "</div>") +
      progressHtml +
      errorHtml +
      '<button class="cta" id="support-send"' + (canSend ? "" : " disabled") + ">" +
        (busy ? "Отправляю…" : u.status === "error" ? "Отправить ещё раз" : "Отправить") +
      "</button>" +
    "</div>";

  var ta = document.getElementById("support-text");
  ta.addEventListener("input", function () {
    supportUI.text = ta.value;
    var btn = document.getElementById("support-send");
    if (btn && supportUI.status !== "sending") btn.disabled = !(supportUI.text.trim() || supportUI.files.length);
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-support-remove]"), function (btn) {
    btn.addEventListener("click", function () {
      supportUI.files.splice(parseInt(btn.getAttribute("data-support-remove"), 10), 1);
      render();
    });
  });
  var input = document.getElementById("support-file");
  if (input) {
    input.addEventListener("change", function (e) {
      Array.prototype.slice.call(e.target.files || []).forEach(function (f) {
        supportUI.files.push({ file: f, name: f.name || "файл", size: f.size || 0, kind: supportKind(f), status: "idle" });
      });
      if (supportUI.status === "error") supportUI.status = "idle";
      render();
    });
  }
  document.getElementById("support-send").addEventListener("click", function () {
    if (supportUI.status === "sending") return;
    if (!(supportUI.text.trim() || supportUI.files.length)) return;
    sendSupport();
  });
  wireActs();
}

function renderSupportSent() {
  var u = supportUI;
  var n = u.files.length;
  var what = n ? " и " + n + " " + plural(n, "вложение", "вложения", "вложений") : "";
  app.innerHTML =
    '<div class="auth-screen support-sent" style="padding-top:var(--screen-top);padding-bottom:130px;">' +
      '<div class="support-sent-check">' + SVG_HW_CHECK + "</div>" +
      '<div class="auth-title">Сообщение отправлено</div>' +
      '<div class="auth-sub">Николай получил твоё сообщение' + what + ". Ответ придёт тебе в Telegram, в чат с ботом.</div>" +
      '<div class="spacer"></div>' +
      '<button class="cta" id="support-done">Готово</button>' +
      '<button class="cta support-more-btn" id="support-again">Написать ещё</button>' +
    "</div>";
  document.getElementById("support-done").addEventListener("click", function () {
    supportResetForm();
    go("more");
  });
  document.getElementById("support-again").addEventListener("click", function () {
    supportResetForm();
    render();
  });
  wireActs();
}

function plural(n, one, few, many) {
  var a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

function supportProgressPct() {
  var u = supportUI;
  if (u.stage === "send") {
    var all = u.files.length || 1;
    return Math.round(70 + 30 * u.sentFiles / all);
  }
  return u.total ? Math.round(70 * u.loaded / u.total) : 0;
}

function supportProgressLabel() {
  var u = supportUI;
  if (u.stage === "send") return "Пересылаю Николаю: " + u.sentFiles + " из " + u.files.length;
  if (!u.files.length) return "Отправляю…";
  return "Загружаю файлы: " + Math.round(100 * u.loaded / (u.total || 1)) + "%";
}

function supportUpdateProgress() {
  var l = document.getElementById("support-progress-label");
  var f = document.getElementById("support-progress-fill");
  if (l) l.textContent = supportProgressLabel();
  if (f) f.style.width = supportProgressPct() + "%";
  supportUI.files.forEach(function (item, idx) {
    var h = document.getElementById("support-hint-" + idx);
    if (h) h.textContent = supportFileHint(item);
  });
}

function supportPost(body) {
  var id = supportIdentity();
  body.initData = id.initData;
  body.accessToken = id.accessToken;
  return fetch("/api/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok || !d.ok) throw new Error(d.error || "Не получилось отправить.");
      return d;
    });
  });
}

/* Пачки для Telegram: альбом до 10 штук и до 48 МБ; большое фото (файлом) и всё,
   что крупнее 50 МБ (ссылкой), — по одному. */
function supportBatches(items) {
  var out = [], cur = [], curSize = 0;
  items.forEach(function (it) {
    var single = it.size > SUPPORT_TG_FILE || (it.kind === "photo" && it.size > SUPPORT_TG_PHOTO);
    if (single) { out.push([it]); return; }
    if (cur.length && (cur.length >= 10 || curSize + it.size > SUPPORT_BATCH)) { out.push(cur); cur = []; curSize = 0; }
    cur.push(it); curSize += it.size;
  });
  if (cur.length) out.push(cur);
  return out;
}

function sendSupport() {
  var u = supportUI;
  var who = supportIdentity();
  if (!who.initData && !who.accessToken) {
    // вне Telegram и без кода доступа бот не узнает, кто пишет, и не сможет ответить
    u.status = "error";
    u.error = "Не получилось понять, кто пишет. Открой приложение из Telegram или по своей личной ссылке и попробуй ещё раз.";
    render();
    return;
  }
  u.status = "sending";
  u.error = "";
  u.stage = "upload";
  u.sentFiles = u.files.filter(function (f) { return f.status === "sent"; }).length;
  u.total = u.files.reduce(function (s, f) { return s + f.size; }, 0);
  u.loaded = u.files.reduce(function (s, f) { return s + (f.status === "uploaded" || f.status === "sent" ? f.size : 0); }, 0);
  render();

  var identity = JSON.stringify(supportIdentity());
  var pending = u.files.filter(function (f) { return f.status === "idle" || f.status === "uploading"; });

  var uploadAll = pending.length
    ? loadBlobClient().then(function (client) {
        // по одному файлу: на телефоне так надёжнее и прогресс честный
        return pending.reduce(function (p, item, i) {
          return p.then(function () {
            item.status = "uploading";
            supportUpdateProgress();
            var before = u.loaded;
            var metaP = item.kind === "video" ? readVideoMeta(item.file) : Promise.resolve(null);
            return metaP.then(function (meta) {
              item.meta = meta;
              return client.upload(supportPathname(item, i), item.file, {
                access: "private",
                handleUploadUrl: "/api/support-upload",
                clientPayload: identity,
                contentType: item.file.type || undefined,
                multipart: item.size > 8 * 1024 * 1024,
                onUploadProgress: function (ev) {
                  u.loaded = before + Math.min(ev.loaded || 0, item.size);
                  supportUpdateProgress();
                }
              });
            }).then(function (blob) {
              item.pathname = blob.pathname;
              item.status = "uploaded";
              u.loaded = before + item.size;
              supportUpdateProgress();
            });
          });
        }, Promise.resolve());
      })
    : Promise.resolve();

  uploadAll
    .then(function () {
      u.stage = "send";
      supportUpdateProgress();
      if (u.headerId) return null;
      var counts = { photo: 0, video: 0 };
      u.files.forEach(function (f) { counts[f.kind]++; });
      return supportPost({
        action: "start", text: u.text.trim(), counts: counts,
        firstName: state.firstName || "", lastName: state.lastName || ""
      }).then(function (d) { u.headerId = d.headerId; u.name = d.name || ""; });
    })
    .then(function () {
      var left = u.files.filter(function (f) { return f.status === "uploaded"; });
      return supportBatches(left).reduce(function (p, batch) {
        return p.then(function () {
          return supportPost({
            action: "send", headerId: u.headerId, name: u.name,
            items: batch.map(function (f) {
              return {
                pathname: f.pathname, size: f.size, kind: f.kind, name: f.name,
                width: f.meta && f.meta.width, height: f.meta && f.meta.height, duration: f.meta && f.meta.duration
              };
            })
          }).then(function () {
            batch.forEach(function (f) { f.status = "sent"; });
            u.sentFiles += batch.length;
            supportUpdateProgress();
          });
        });
      }, Promise.resolve());
    })
    .then(function () {
      u.status = "sent";
      if (state.screen === "support") render();
    })
    .catch(function (e) {
      u.files.forEach(function (f) { if (f.status === "uploading") f.status = "idle"; });
      u.status = "error";
      u.error = e && e.message && /[а-яё]/i.test(e.message) ? e.message.replace(/[.!\s]*$/, ".") + " Нажми «Отправить ещё раз»." : "";
      if (state.screen === "support") render();
    });
}

/* «Режим админа» — хаб admin-only функций. Раньше пункт «Режим админа» в
   «Ещё» сразу вёл на список учеников; теперь сначала показывает список
   разделов (задел на будущее — сюда будут добавляться новые admin-only
   функции, не разбросанные по верхнему уровню «Ещё»). */
function renderAdminHub() {
  var items = [
    {
      label: "Дашборд", act: "admin-hub-dash", sub: "Активность, уроки, ДЗ и результаты учеников",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 13.5h11" stroke="var(--gray)" stroke-width="1.4" stroke-linecap="round"/><rect x="3.5" y="8" width="2" height="4" rx=".6" stroke="var(--gray)" stroke-width="1.3"/><rect x="7" y="5" width="2" height="7" rx=".6" stroke="var(--gray)" stroke-width="1.3"/><rect x="10.5" y="2.5" width="2" height="9.5" rx=".6" stroke="var(--gray)" stroke-width="1.3"/></svg>'
    },
    {
      label: "Тестовые клиенты", act: "admin-hub-guests", sub: "Кто открыл тест-драйв из Instagram: экраны, время, нажатия",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5.5" r="2.4" stroke="var(--gray)" stroke-width="1.4"/><path d="M1.8 13.5c0-2.4 1.9-4.2 4.2-4.2s4.2 1.8 4.2 4.2" stroke="var(--gray)" stroke-width="1.4" stroke-linecap="round"/><path d="M11 3.2l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z" stroke="var(--terra)" stroke-width="1.1" stroke-linejoin="round"/></svg>'
    },
    {
      label: "Выбор ученика", act: "admin-hub-students", sub: "Пройти урок глазами ученика",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.8" stroke="var(--gray)" stroke-width="1.4"/><path d="M2.8 14c0-2.9 2.3-5 5.2-5s5.2 2.1 5.2 5" stroke="var(--gray)" stroke-width="1.4" stroke-linecap="round"/></svg>'
    },
    {
      label: "Дни рождения", act: "admin-hub-birthdays", sub: "Ближайшие 30 дней",
      icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 14v-5.5a2 2 0 012-2h6a2 2 0 012 2V14M3 14h10M3 14a1 1 0 100 2h10a1 1 0 100-2M8 6.5V3M6 3.2c0 .8.5 1 1 .5s.5-1.2 1-1.2 1 .4 1 1.2-.5 1-1 .5" stroke="var(--gray)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    {
      label: "Разметка караоке", act: "admin-hub-karaoke", sub: "Минус, текст и тайминг строк для песен ученика",
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l11-2v13" stroke="var(--gray)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="var(--gray)" stroke-width="1.9"/><circle cx="17" cy="16" r="3" stroke="var(--gray)" stroke-width="1.9"/></svg>'
    }
  ];
  var itemsHtml = items.map(function (item) {
    return (
      '<div class="more-item" data-act="' + item.act + '">' +
        '<div class="more-item-icon" style="background:var(--bgmuted);">' + item.icon + "</div>" +
        '<div style="flex:1;min-width:0;">' +
          '<div class="more-item-label">' + esc(item.label) + "</div>" +
          '<div class="lesson-sub" style="margin-top:1px;">' + esc(item.sub) + "</div>" +
        "</div>" +
        SVG.chevronRight +
      "</div>"
    );
  }).join("");
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Режим админа</div><div class="top-sub">Видно только преподавателю</div></div>' +
    "</div>" +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' + itemsHtml + "</div>";
  wireActs();
}

/* «Режим админа» → список учеников. Только для Николая — эндпоинт сам
   проверяет chatId на сервере, но экран всё равно недостижим для учеников,
   т.к. пункт меню, который сюда ведёт, у них не показывается вовсе. */
function renderAdminStudents() {
  loadAdminStudentsList();
  var list = state.adminStudentsList;
  var body;
  if (list === null) {
    body = '<div class="courses-empty">Загружаю список учеников…</div>';
  } else if (!list.length) {
    body = state._adminStudentsErr
      ? '<div class="courses-empty">Не удалось загрузить список учеников — база не ответила. Это не значит, что учеников нет. Попробуй ещё раз через минуту.</div>'
      : '<div class="courses-empty">Пока нет ни одного ученика с привязанным Telegram — список пуст.</div>';
  } else {
    body = list.map(function (st) {
      var sub = [st.status || "", st.telegramToken ? "✓ токен" : "нет токена"].filter(Boolean).join(" · ");
      return (
        '<div class="lesson-card" data-act="admin-pick-student" data-admin-id="' + esc(st.id) + '" data-admin-token="' + esc(st.telegramToken || "") + '" data-admin-name="' + esc(st.name) + '">' +
          '<div class="lesson-dot" style="background:oklch(56% 0.09 235);">' + esc((st.name || "?")[0]) + "</div>" +
          '<div class="lesson-body"><div class="lesson-name">' + esc(st.name) + "</div>" +
            (sub ? '<div class="lesson-sub">' + esc(sub) + "</div>" : "") +
          "</div>" +
          '<button class="icon-btn" data-act="admin-delete-student" data-admin-id="' + esc(st.id) + '" data-admin-name="' + esc(st.name) + '" title="Удалить ученика">' + SVG.trash + "</button>" +
        "</div>"
      );
    }).join("");
  }
  // Сюда же попадаем, если «Кабинет» не смог открыть собственную карточку —
  // объясняем причину, иначе выглядит как будто кнопка просто не работает.
  var ownMsg = "";
  if (state._ownCabinetMsg) {
    var t = state._ownCabinetMsg === "no-token"
      ? "Твоя карточка «Николай Септ» есть в базе, но у неё не сгенерирован код доступа. Открой её на сайте и создай токен — тогда «Кабинет» будет открывать её сразу."
      : state._ownCabinetMsg === "net"
        ? "Не удалось загрузить список учеников — проверь интернет и попробуй ещё раз."
        : "В базе нет ученика «Николай Септ», поэтому открывать в «Кабинете» нечего. Заведи себя учеником на сайте и сгенерируй код доступа — дальше кнопка будет открывать твою карточку сразу.";
    ownMsg = '<div class="instruction-note" style="margin-bottom:12px;">' + t + "</div>";
    state._ownCabinetMsg = null;
  }
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Режим админа</div><div class="top-sub">Выбери ученика, чтобы пройти урок его глазами</div></div>' +
    "</div>" +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' + ownMsg + body + "</div>";
  wireActs();
}

/* «Дни рождения» — те, у кого до дня рождения ≤30 дней. Экран пока всегда
   пустой: дата рождения в baza-dannih не хранится (см. loadAdminBirthdays —
   заглушка), а прежний источник в Notion отключён. */
function renderAdminBirthdays() {
  loadAdminBirthdays();
  var list = state.adminBirthdaysList;
  var body;
  if (list === null) {
    body = '<div class="courses-empty">Загружаю дни рождения…</div>';
  } else if (!list.length) {
    body = '<div class="courses-empty">В ближайшие 30 дней дней рождения нет (или ни у кого не указана дата рождения).</div>';
  } else {
    body = list.map(function (b) {
      var parts = b.birthDate.split("-");
      var dateLabel = parts[2] + "." + parts[1];
      var whenLabel = b.daysUntil === 0 ? "сегодня!" : b.daysUntil === 1 ? "завтра" : "через " + b.daysUntil + " дн.";
      var sub = dateLabel + " · " + whenLabel + " · исполнится " + b.turningAge;
      return (
        '<div class="lesson-card">' +
          '<div class="lesson-dot" style="background:oklch(56% 0.09 235);">🎂</div>' +
          '<div class="lesson-body"><div class="lesson-name">' + esc(b.name) + "</div>" +
            '<div class="lesson-sub">' + esc(sub) + "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Дни рождения</div><div class="top-sub">Ближайшие 30 дней</div></div>' +
    "</div>" +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' + body + "</div>";
  wireActs();
}

/* ---------- «Планы уроков» (admin-only) ----------
   Темы — ровно те, по которым в baza-dannih строятся срезы и колесо баланса
   (там это const CATALOG в index.html). Планы лежат в data/lesson-plans.json
   и загружаются лениво, только когда Николай реально открыл этот раздел —
   фронт учеников их не тянет вовсе.

   План ≠ готовый урок: у распевок и песенного упражнения тут нет аудио
   (поля src), это описание того, что предстоит записать. «Дыхание» —
   единственная тема со статусом «готов»: её контент скопирован из
   data/lesson-01.json, чтобы эталон в списке не разъезжался с живым уроком. */

var LESSON_PLANS = null;      // { levels, plans[] } из data/lesson-plans.json
var lessonPlansLoading = false;

var PLAN_LEVEL_COLORS = { A: "var(--terra)", B: "var(--blue)", C: "oklch(70% 0.14 85)", D: "oklch(55% 0.12 300)" };

function loadLessonPlans() {
  if (LESSON_PLANS || lessonPlansLoading) return;
  lessonPlansLoading = true;
  fetch("data/lesson-plans.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      LESSON_PLANS = data;
      lessonPlansLoading = false;
      if (state.pendingLessonNum != null) {
        var want = state.pendingLessonNum;
        state.pendingLessonNum = null;
        var pl = planForLesson(want);
        if (pl) { switchToLesson(want, pl); return; }
      }
      if (state.screen === "admin-plans" || state.screen === "admin-plan") render();
    })
    .catch(function () {
      lessonPlansLoading = false;
      LESSON_PLANS = { levels: {}, plans: [], error: true };
      if (state.screen === "admin-plans" || state.screen === "admin-plan") render();
    });
}

function planLevelBadge(level) {
  return '<div class="plan-badge" style="background:' + PLAN_LEVEL_COLORS[level] + ';">' + esc(level) + "</div>";
}

/* topic — ровно строка из CATALOG (baza-dannih), часто сокращённая до кода
   («ИГС», «СЧН», «Динамика f/p»). fullName — расшифровка для подписи. */
function planStepsSummary(plan) {
  var parts = [];
  if (plan.lecture && plan.lecture.blocks) {
    var headers = plan.lecture.blocks.filter(function (b) { return b.type === "header"; }).length;
    parts.push(headers + (headers === 1 ? " блок лекции" : " блока лекции"));
  }
  if (plan.quiz && plan.quiz.questions) parts.push(plan.quiz.questions.length + " вопросов");
  if (plan.warmups && plan.warmups.exercises) parts.push(plan.warmups.exercises.length + " распевки");
  return parts.join(" · ");
}

function renderAdminPlans() {
  loadLessonPlans();
  var body;
  if (!LESSON_PLANS) {
    body = '<div class="courses-empty">Загружаю планы уроков…</div>';
  } else if (LESSON_PLANS.error) {
    body = '<div class="courses-empty">Не удалось загрузить data/lesson-plans.json — проверь соединение.</div>';
  } else if (!LESSON_PLANS.plans.length) {
    body = '<div class="courses-empty">Планы пока не заведены.</div>';
  } else {
    var byLevel = {};
    LESSON_PLANS.plans.forEach(function (plan, idx) {
      (byLevel[plan.level] = byLevel[plan.level] || []).push({ plan: plan, idx: idx });
    });
    body = ["A", "B", "C", "D"].filter(function (lvl) { return byLevel[lvl]; }).map(function (lvl) {
      var meta = LESSON_PLANS.levels[lvl] || {};
      var cards = byLevel[lvl].map(function (item) {
        return (
          '<div class="lesson-card" data-act="admin-open-plan" data-plan-idx="' + item.idx + '">' +
            planLevelBadge(lvl) +
            '<div class="lesson-body">' +
              '<div class="lesson-name">' + esc(item.plan.topic) + "</div>" +
              (item.plan.fullName ? '<div class="lesson-sub">' + esc(item.plan.fullName) + "</div>" : "") +
              '<div class="plan-card-steps">' + esc(planStepsSummary(item.plan)) + "</div>" +
            "</div>" +
            (item.plan.ready
              ? '<div class="plan-ready" title="Урок уже собран в приложении">готов</div>'
              : '<div class="plan-draft" title="План написан, аудио ещё не записано">план</div>') +
            SVG.chevronRight +
          "</div>"
        );
      }).join("");
      return (
        '<div class="plan-group">' +
          '<div class="section-label" style="margin:0 0 8px;">' + esc(meta.label || "Уровень " + lvl) +
            " · " + byLevel[lvl].length + "</div>" +
          (meta.hint ? '<div class="plan-group-hint">' + esc(meta.hint) + "</div>" : "") +
          cards +
        "</div>"
      );
    }).join("");
  }
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Планы уроков</div>' +
        '<div class="top-sub">По темам срезов и колеса баланса · видно только преподавателю</div></div>' +
    "</div>" +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:18px;">' + body + "</div>";
  wireActs();
}

/* ---------- схемы внутри лекции ----------
   Рисуем разметкой, а не картинками: текст остаётся выделяемым, схема
   тянется по ширине экрана и сама следует тёмной теме через переменные.
   Неизвестные типы блоков оба рендерера молча пропускают, поэтому старые
   лекции от появления этих типов не ломаются. */

/* Шкала 1..n с нарастающей заливкой — «насколько сильно работает голос». */
function lectureScaleHtml(blk) {
  var n = blk.max || 10;
  var cells = "";
  for (var i = 1; i <= n; i++) {
    var l = 88 - (i - 1) * (40 / (n - 1));   // один тон, разная светлота
    cells += '<div class="lscale-cell" style="background:oklch(' + l.toFixed(1) + '% 0.055 235);">' +
               "<span>" + i + "</span></div>";
  }
  return '<div class="lscale">' +
      (blk.title ? '<div class="lscale-title">' + esc(blk.title) + "</div>" : "") +
      '<div class="lscale-row">' + cells + "</div>" +
      (blk.lowLabel || blk.highLabel
        ? '<div class="lscale-ends"><span>' + esc(blk.lowLabel || "") + "</span><span>" +
          esc(blk.highLabel || "") + "</span></div>"
        : "") +
    "</div>";
}

/* Таблица: cols — заголовки, rows — массивы ячеек. Ячейка-массив рисуется
   «веткой» — как «средний → вопросительный / разговорный». */
function lectureTableHtml(blk) {
  var head = (blk.cols || []).map(function (c) {
    return '<div class="ltable-th">' + esc(c) + "</div>";
  }).join("");
  var body = (blk.rows || []).map(function (row) {
    return '<div class="ltable-tr">' + row.map(function (cell) {
      if (Array.isArray(cell)) {
        return '<div class="ltable-td"><div class="ltable-branch">' +
          cell.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") +
          "</div></div>";
      }
      return '<div class="ltable-td">' + esc(cell == null ? "" : cell) + "</div>";
    }).join("") + "</div>";
  }).join("");
  return '<div class="ltable" style="--ltable-cols:' + ((blk.cols || []).length || 2) + ';">' +
      (blk.title ? '<div class="ltable-title">' + esc(blk.title) + "</div>" : "") +
      '<div class="ltable-head">' + head + "</div>" + body +
    "</div>";
}

/* Готовая картинка из lesson-content/2-images. loading=lazy — чтобы урок
   открывался сразу, не дожидаясь схем ниже по тексту. */
function lectureImageHtml(blk) {
  if (!blk.src) return "";
  return '<figure class="lfig">' +
      '<img src="' + esc(blk.src) + '" alt="' + esc(blk.caption || "") + '" loading="lazy">' +
      (blk.caption ? "<figcaption>" + esc(blk.caption) + "</figcaption>" : "") +
    "</figure>";
}

/* Пронумерованные панели + расшифровка справа — схема «Дыхание».
   zone говорит, ГДЕ в объёме стоит воздух, а не сколько его: у верхнего
   дыхания заштрихована верхняя треть, у нижнего — нижняя. Показывать это
   растущей снизу заливкой нельзя — верхнее дыхание выглядело бы как
   «мало воздуха внизу», то есть ровно наоборот. */
var LPANEL_ZONES = {
  top:    { top: "4%",  height: "30%" },
  middle: { top: "35%", height: "30%" },
  bottom: { top: "66%", height: "30%" },
  mixed:  { top: "35%", height: "61%" }   // живот + рёбра сразу
};

function lecturePanelsHtml(blk) {
  var items = blk.items || [];
  var panels = items.map(function (it, i) {
    var z = LPANEL_ZONES[it.zone] || LPANEL_ZONES.middle;
    return '<div class="lpanel">' +
        '<div class="lpanel-num">' + (i + 1) + "</div>" +
        '<div class="lpanel-body">' +
          '<div class="lpanel-fill" style="top:' + z.top + ';height:' + z.height + ';"></div>' +
        "</div>" +
      "</div>";
  }).join("");
  var legend = items.map(function (it, i) {
    return "<li><b>" + (i + 1) + ". " + esc(it.name) + "</b>" +
      (it.note ? " — " + esc(it.note) : "") + "</li>";
  }).join("");
  return '<div class="lpanels">' +
      (blk.title ? '<div class="lpanels-title">' + esc(blk.title) + "</div>" : "") +
      '<div class="lpanels-row"><div class="lpanels-strip">' + panels + "</div>" +
      '<ul class="lpanels-legend">' + legend + "</ul></div>" +
    "</div>";
}

/* Лекция «Сила работы»: шкала усилия со смыканием связок, «Что видит врач», предупреждение */
function effortBlockHtml(blk) {
  if (blk.type === "effort-scale") return '<div class="ef-scale-mount"></div>';
  if (blk.type === "effort-anatomy") return '<div class="ef-anatomy-mount"></div>';
  return '<div class="ef-warn"><div class="ef-warn-t">' + icoWarn(20) + esc(blk.title || "") + '</div><div class="ef-warn-p">' + esc(blk.text || "") + "</div></div>";
}

function planLectureHtml(lecture) {
  if (!lecture || !lecture.blocks) return "";
  var html = "";
  var num = 0;
  var first = true;
  lecture.blocks.forEach(function (blk) {
    if (blk.type === "header") {
      num = 0; // нумерация пунктов своя внутри каждого блока лекции
      html += '<div class="plan-sub' + (first ? "" : " mt") + '">' + esc(blk.text) + "</div>";
      first = false;
    } else if (blk.type === "point") {
      num++;
      html += '<div class="point"><span class="point-num">' + num + "</span><div><b>" + esc(blk.b) + "</b><p>" + esc(blk.p) + "</p></div></div>";
    } else if (blk.type === "note") {
      html += '<div class="lecture-note">' + esc(blk.text) + "</div>";
    } else if (blk.type === "para") {
      html += '<p class="lecture-para">' + esc(blk.text) + "</p>";
    } else if (blk.type === "scale") {
      html += lectureScaleHtml(blk);
    } else if (blk.type === "effort-scale" || blk.type === "effort-anatomy" || blk.type === "warning") {
      html += effortBlockHtml(blk); // effort-anim.js монтирует шкалу и связки сам
    } else if (blk.type === "table") {
      html += lectureTableHtml(blk);
    } else if (blk.type === "panels") {
      html += lecturePanelsHtml(blk);
    } else if (blk.type === "image") {
      html += lectureImageHtml(blk);
    } else if (blk.type === "breath-anim") {
      html += '<div class="banim-mount"></div>'; // breath-anim.js монтирует сам
    } else if (blk.type === "breath-muscles") {
      html += '<div class="bmus-mount" data-level="deep"></div>';
    }
  });
  return html;
}

function planQuizHtml(quiz) {
  if (!quiz || !quiz.questions) return "";
  return quiz.questions.map(function (q, i) {
    var opts = q.opts.map(function (text, oi) {
      var right = oi === q.correct;
      return '<div class="plan-opt' + (right ? " right" : "") + '">' +
        '<span class="plan-opt-mark">' + (right ? "✓" : "") + "</span>" +
        "<span>" + esc(text) + "</span></div>";
    }).join("");
    return (
      '<div class="plan-q">' +
        '<div class="plan-q-head"><span class="plan-q-num">' + (i + 1) + "</span>" + esc(q.q) + "</div>" +
        opts +
        (q.explain ? '<div class="plan-explain">' + esc(q.explain) + "</div>" : "") +
      "</div>"
    );
  }).join("");
}

function planWarmupsHtml(warmups, ready) {
  if (!warmups || !warmups.exercises) return "";
  var head = warmups.instruction ? '<div class="plan-instruction">' + warmups.instruction + "</div>" : "";
  return head + warmups.exercises.map(function (ex) {
    var label = [ex.label1, ex.label2].filter(Boolean).join("  ");
    return (
      '<div class="plan-wu">' +
        '<div class="plan-wu-head">' +
          '<span class="plan-wu-n">' + ex.n + "</span>" +
          '<span class="plan-wu-label">' + esc(label) + "</span>" +
          '<span class="plan-wu-time">' + esc(ex.time || "") + "</span>" +
        "</div>" +
        (ex.sub ? '<div class="plan-wu-sub">' + esc(ex.sub) + "</div>" : "") +
        (ex.how ? '<div class="plan-field"><b>Как выполнять</b><p>' + esc(ex.how) + "</p></div>" : "") +
        (ex.mistake ? '<div class="plan-field mistake"><b>Типичная ошибка</b><p>' + esc(ex.mistake) + "</p></div>" : "") +
        '<div class="plan-wu-foot">' + (ready ? "Аудио записано" : "Аудио: не записано") +
          (ex.bpm ? " · ориентир " + ex.bpm + " bpm" : "") + "</div>" +
      "</div>"
    );
  }).join("");
}

function planSongHtml(song) {
  if (!song) return "";
  var html = "";
  if (song.hint) html += '<div class="plan-instruction">' + esc(song.hint) + "</div>";
  if (song.task) html += '<div class="plan-field"><b>Задание ученику</b><p>' + esc(song.task) + "</p></div>";
  if (song.marks && song.marks.length) {
    html += '<div class="plan-field"><b>Обозначения</b>' + song.marks.map(function (m) {
      return '<p><span class="plan-mark">' + esc(m.code) + "</span> — " + esc(m.desc) + "</p>";
    }).join("") + "</div>";
  }
  if (song.lines && song.lines.length) {
    html += '<div class="plan-field"><b>Строки для разбора</b>' + song.lines.map(function (ln) {
      return "<p>" + esc(ln) + "</p>";
    }).join("") + "</div>";
  }
  if (song.trackIdeas && song.trackIdeas.length) {
    html += '<div class="plan-field"><b>Материал</b>' + song.trackIdeas.map(function (t) {
      return "<p>" + esc(t) + "</p>";
    }).join("") + "</div>";
  }
  return html;
}

function renderAdminPlanDetail() {
  loadLessonPlans();
  if (!LESSON_PLANS || !LESSON_PLANS.plans[state.adminPlanIdx]) {
    app.innerHTML =
      '<div class="top pb8">' + backBtn("back") + '<div class="top-title lg">План урока</div></div>' +
      '<div class="courses-empty">Загружаю план…</div>';
    wireActs();
    return;
  }
  var plan = LESSON_PLANS.plans[state.adminPlanIdx];
  var open = state.adminPlanSection; // null — все секции свёрнуты
  var sections = [
    { key: "lecture", title: "Лекция", sub: (plan.stepSubtitles && plan.stepSubtitles.lecture) || "", html: planLectureHtml(plan.lecture) },
    { key: "quiz", title: "Тест", sub: (plan.stepSubtitles && plan.stepSubtitles.quiz) || "", html: planQuizHtml(plan.quiz) },
    { key: "warmups", title: "Распевки", sub: (plan.stepSubtitles && plan.stepSubtitles.warmups) || "", html: planWarmupsHtml(plan.warmups, plan.ready) },
    { key: "song", title: "Упражнение с песней", sub: (plan.stepSubtitles && plan.stepSubtitles.song) || "", html: planSongHtml(plan.song) }
  ];
  var body = sections.map(function (sec) {
    var isOpen = sec.key === open;
    return (
      '<div class="plan-section' + (isOpen ? " open" : "") + '">' +
        '<div class="plan-section-head" data-act="admin-plan-section" data-plan-section="' + sec.key + '">' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="plan-section-title">' + esc(sec.title) + "</div>" +
            (sec.sub ? '<div class="lesson-sub">' + esc(sec.sub) + "</div>" : "") +
          "</div>" +
          '<span class="plan-chevron">' + (isOpen ? "▲" : "▼") + "</span>" +
        "</div>" +
        (isOpen ? '<div class="plan-section-body">' + sec.html + "</div>" : "") +
      "</div>"
    );
  }).join("");

  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div style="flex:1;min-width:0;">' +
        '<div class="top-title lg">' + esc(plan.topic) + "</div>" +
        '<div class="top-sub">' + esc(plan.fullName || (LESSON_PLANS.levels[plan.level] || {}).label || "Уровень " + plan.level) +
          (plan.ready ? " · урок собран" : " · план, аудио не записано") + "</div>" +
      "</div>" +
      planLevelBadge(plan.level) +
    "</div>" +
    '<div style="padding:8px 16px 130px;">' +
      (plan.goal ? '<div class="plan-goal"><b>Цель урока</b><p>' + esc(plan.goal) + "</p></div>" : "") +
      '<div style="display:flex;flex-direction:column;gap:10px;">' + body + "</div>" +
    "</div>";
  wireActs();
}

function renderComingSoon(title, icon) {
  app.innerHTML =
    '<div class="result-screen">' +
      '<div class="result-badge">' + icon + "</div>" +
      '<div class="result-title">' + esc(title) + "</div>" +
      '<div class="result-sub">Скоро</div>' +
    "</div>";
  wireActs();
}

/* Урок разблокирован (по очереди или персонально из baza-dannih), но контент
   для него ещё не добавлен в приложение — просто ждём. */
function renderLessonSoon() {
  renderComingSoon("Урок " + (state.comingSoonLessonNum || ""), SVG.dockLessons("var(--gray)"));
}

/* Статус ученика в baza-dannih переключён на «Завершил» (status = 'done') —
   доступ к приложению закрыт. Дока нет, назад идти некуда. */
function renderBlocked() {
  app.innerHTML =
    '<div class="result-screen" style="padding-bottom:40px;">' +
      '<div class="result-badge">' + SVG.lock + "</div>" +
      '<div class="result-title">Доступ закрыт</div>' +
      '<div class="result-sub">Занятия завершены. Если это ошибка — свяжитесь с преподавателем.</div>' +
    "</div>";
}

/* Главные 4 вкладки дока. */
var MAIN_TAB_SCREENS = ["courses", "profile", "questions", "more"];
/* Подэкраны урока и избранное относятся к вкладке «Уроки» — она подсвечивается
   и на них, даже если открыт конкретный шаг урока, а не список уроков. */
var LESSON_SUB_SCREENS = ["lesson-home", "lecture", "quiz", "quiz-result", "warmups", "song", "feedback", "favorites", "lesson-soon", "step-done", "lesson-master"];
/* Дока нет ТОЛЬКО на экранах входа — на всех остальных она закреплена всегда. */
var NO_DOCK_SCREENS = ["tg", "name", "token-entry", "blocked", "karaoke-play", "admin-karaoke-edit", "pitch-sing", "pitch-score"];

function activeDockTab() {
  if (MAIN_TAB_SCREENS.indexOf(state.screen) !== -1) return state.screen;
  if (LESSON_SUB_SCREENS.indexOf(state.screen) !== -1) return "courses";
  if (CAB_SCREENS.indexOf(state.screen) !== -1 || state.screen === "karaoke" || state.screen === "pitch" || state.screen === "pitch-topic" || state.screen === "bylo") return "profile";
  if (state.screen === "trainer" || state.screen === "trainer-ex" || state.screen === "trainer-rec" || state.screen === "trainer-done") return (window.TRAINER && (TRAINER.from === "lesson-home" || TRAINER.from === "warmups")) ? "courses" : "profile";
  return null;
}

function renderDock() {
  if (NO_DOCK_SCREENS.indexOf(state.screen) !== -1) return;
  var activeTab = activeDockTab();
  // Бейдж с числом на доке «Уроки» убран по просьбе Николая (21.11) — неактуален.
  var items = [
    { screen: "profile", act: "go-profile", icon: SVG.dockPerson, label: "Кабинет" },
    { screen: "courses", act: "go-courses", icon: SVG.dockLessons, label: "Уроки" },
    // "Запись" (календарь записи на занятие) скрыта по просьбе Николая — функционал
    // (renderQuestions, ACTS["go-questions"], case "questions") оставлен нетронутым,
    // чтобы в любой момент вернуть пункт обратно одной строкой.
    { screen: "more", act: "go-more", icon: SVG.dockMore, label: "Ещё" }
  ];
  var html = '<div class="dock"><div class="dock-pill"></div>';
  items.forEach(function (it) {
    var active = activeTab === it.screen;
    var color = active ? "oklch(60% 0.13 38)" : "var(--gray)";
    html += '<button class="dock-item' + (active ? " active" : "") + '" data-act="' + it.act + '">' +
      (it.badge || "") + it.icon(color) + "<span>" + it.label + "</span></button>";
  });
  // Стеклянная грань дока (вариант «D2», 20.11) — слои в styles.css → .dock-fx
  // Док перерисовывается на каждом render() — сдвигаем анимацию по общим
  // часам, чтобы блик не прыгал в начало при переходе между вкладками.
  var rimDelay = -((Date.now() / 1000) % 26).toFixed(2);
  html += '<div class="dock-fx" aria-hidden="true" style="animation-delay:' + rimDelay + 's"><i class="dock-rim dock-rim-base"></i>' +
    '<div class="dock-lit"><i class="dock-rim dock-rim-out"></i><i class="dock-rim dock-rim-in"></i></div></div>';
  html += "</div>";
  app.insertAdjacentHTML("beforeend", html);
  var dock = app.querySelector(".dock");
  // реальная высота дока — по ней кнопки ставятся ровно над ним (21.11)
  if (dock.offsetHeight) document.documentElement.style.setProperty("--dock-h", dock.offsetHeight + "px");
  var pill = dock.querySelector(".dock-pill");
  var btns = dock.querySelectorAll(".dock-item");
  var activeIdx = -1;
  items.forEach(function (it, i) { if (activeTab === it.screen) activeIdx = i; });
  dockAnimate(dock, pill, btns, activeIdx, activeTab);
  bindDockDrag(dock, pill, btns);
  Array.prototype.forEach.call(btns, function (el) {
    el.addEventListener("click", function () {
      // После ведения пальцем по доку браузер присылает click — его глушим,
      // переход уже сделан при отпускании пальца.
      if (dockDragState.justDragged) return;
      dockDragState.tapped = true;
      var fn = ACTS[el.getAttribute("data-act")];
      if (fn) fn();
    });
  });
}

// ---------- анимация дока (вариант «Ж + И», 20.11) ----------
// Док перерисовывается заново на каждом render(), поэтому позицию плашки
// помним снаружи (dockDragState.lastX) и при новой отрисовке ведём её
// от старого места к новому. Иконка выбранного пункта «проседает и
// отпускается»; по доку можно вести пальцем — плашка едет за ним и при
// отпускании встаёт на ближайший пункт.
var dockDragState = { lastX: null, lastTab: null, tapped: false, justDragged: false, run: null };
var DOCK_SPRING = "cubic-bezier(.34,1.35,.5,1)";

/* Переключатели-«ползунки» (21.11, просьба Николая): выбранная плашка не
   перескакивает, а плавно едет к новой кнопке — той же пружиной, что в доке.
   Работает для всех переключателей из SEG_SLIDERS, в том числе когда экран
   перерисовывается целиком: прошлое место плашки запоминаем по ключу. */
var SEG_SLIDERS = [".llevel-seg", ".pt .seg", ".tr-tempo"];
var SEG_LAST = {};
function segEnhance() {
  SEG_SLIDERS.forEach(function (sel) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (box, n) {
      var items = Array.prototype.filter.call(box.children, function (c) { return !c.classList.contains("seg-pill"); });
      var on = items.filter(function (c) { return c.classList.contains("on"); })[0];
      var pill = box.querySelector(":scope > .seg-pill");
      if (!on) { if (pill) pill.style.opacity = 0; return; }
      if (!pill) {
        pill = document.createElement("span");
        pill.className = "seg-pill"; pill.setAttribute("aria-hidden", "true");
        box.insertBefore(pill, box.firstChild);
        box.classList.add("seg-slide");
      }
      var key = (state.screen || "") + "|" + sel + "|" + n;
      var to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
      if (!to.w) return;
      var cur = pill.dataset.x != null ? { x: +pill.dataset.x, w: +pill.dataset.w } : SEG_LAST[key];
      pill.style.opacity = 1;
      pill.style.left = to.x + "px"; pill.style.top = to.y + "px";
      pill.style.width = to.w + "px"; pill.style.height = to.h + "px";
      if (cur && (Math.abs(cur.x - to.x) > 1 || Math.abs(cur.w - to.w) > 1) && pill.animate && !dockReducedMotion()) {
        pill.animate([{ left: cur.x + "px", width: cur.w + "px" }, { left: to.x + "px", width: to.w + "px" }], { duration: 460, easing: DOCK_SPRING });
      }
      pill.dataset.x = to.x; pill.dataset.w = to.w;
      SEG_LAST[key] = { x: to.x, w: to.w };
    });
  });
}
window.segEnhance = segEnhance;
// Нажатие внутри переключателя: экран может перерисоваться своей функцией,
// поэтому догоняем плашку на следующем кадре.
document.addEventListener("click", function (e) {
  var t = e.target;
  if (t && t.closest && t.closest(SEG_SLIDERS.join(","))) requestAnimationFrame(function () { requestAnimationFrame(segEnhance); });
}, true);
// Поворот iPad / смена ширины: старая позиция плашки уже неверна — не ведём от неё.
window.addEventListener("resize", function () { dockDragState.lastX = null; });
function dockReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function dockPressIcon(btn, delay) {
  var svg = btn && btn.querySelector("svg");
  if (!svg || !svg.animate || dockReducedMotion()) return;
  svg.animate([
    { transform: "scale(1)" },
    { transform: "scale(.78)", offset: 0.35 },
    { transform: "scale(1.08)", offset: 0.7 },
    { transform: "scale(1)" }
  ], { duration: 440, delay: delay || 0, easing: "ease-out" });
}
function dockAnimate(dock, pill, btns, idx, tab) {
  if (idx < 0) { pill.style.display = "none"; dockDragState.lastTab = tab; dockDragState.tapped = false; return; }
  var b = btns[idx];
  var toX = b.offsetLeft, w = b.offsetWidth;
  pill.style.width = w + "px";
  var fromX = dockDragState.lastX;
  var tabChanged = dockDragState.lastTab !== null && dockDragState.lastTab !== tab;
  pill.style.left = toX + "px";
  var now = Date.now(), run = dockDragState.run;
  if (fromX !== null && Math.abs(fromX - toX) > 1 && pill.animate && !dockReducedMotion()) {
    pill.animate([{ left: fromX + "px" }, { left: toX + "px" }], { duration: 460, easing: DOCK_SPRING });
    dockDragState.run = { from: fromX, to: toX, start: now, icon: tabChanged ? 120 : null };
    if (tabChanged) dockPressIcon(b, 120);
  } else if (run && run.to === toX && now - run.start < 560 && !dockDragState.tapped) {
    // Экран дорисовался повторно (например, кабинет после загрузки), пока
    // плашка ещё ехала — продолжаем с того же места, а не обрываем.
    var el = now - run.start;
    if (el < 460 && pill.animate) {
      var a = pill.animate([{ left: run.from + "px" }, { left: toX + "px" }], { duration: 460, easing: DOCK_SPRING });
      a.currentTime = el;
    }
    var svg = b.querySelector("svg");
    if (run.icon !== null && svg && svg.animate && el < run.icon + 440) {
      var ia = svg.animate([
        { transform: "scale(1)" }, { transform: "scale(.78)", offset: 0.35 },
        { transform: "scale(1.08)", offset: 0.7 }, { transform: "scale(1)" }
      ], { duration: 440, delay: run.icon, easing: "ease-out" });
      ia.currentTime = el;
    }
  } else if (tabChanged) {
    dockPressIcon(b, 0);
  } else if (dockDragState.tapped) {
    dockPressIcon(b, 0); // повторное нажатие на уже открытый пункт
  }
  dockDragState.lastX = toX;
  dockDragState.lastTab = tab;
  dockDragState.tapped = false;
}
function bindDockDrag(dock, pill, btns) {
  var drag = null;
  dock.addEventListener("pointerdown", function (e) {
    if (pill.style.display === "none") return;
    drag = { id: e.pointerId, sx: e.clientX, bx: pill.offsetLeft, moved: false };
  });
  dock.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.sx;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      try { dock.setPointerCapture(e.pointerId); } catch (_) {}
      pill.getAnimations && pill.getAnimations().forEach(function (a) { a.cancel(); });
      pill.style.transition = "transform .15s";
      pill.style.transform = "scale(1.06)";
    }
    var min = btns[0].offsetLeft, max = btns[btns.length - 1].offsetLeft;
    var x = Math.max(min, Math.min(max, drag.bx + dx));
    pill.style.left = x + "px";
    dockDragState.lastX = x;
  });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.moved) return;
    pill.style.transform = "";
    dockDragState.justDragged = true;
    setTimeout(function () { dockDragState.justDragged = false; }, 50);
    var x = pill.offsetLeft, best = 0;
    Array.prototype.forEach.call(btns, function (b, i) {
      if (Math.abs(b.offsetLeft - x) < Math.abs(btns[best].offsetLeft - x)) best = i;
    });
    var bb = btns[best];
    if (bb.classList.contains("active")) {
      // Вернулись на тот же пункт — просто доводим плашку на место.
      var toX = bb.offsetLeft;
      pill.style.left = toX + "px";
      if (pill.animate && !dockReducedMotion()) pill.animate([{ left: x + "px" }, { left: toX + "px" }], { duration: 420, easing: DOCK_SPRING });
      dockDragState.lastX = toX;
      return;
    }
    var fn = ACTS[bb.getAttribute("data-act")];
    if (fn) fn();
  }
  dock.addEventListener("pointerup", end);
  dock.addEventListener("pointercancel", end);
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
      '<div><div class="top-title lg">' + esc(LESSON.title) + '</div><div class="top-sub">Урок ' + ((LESSON && LESSON.id) || 1) + ' из ' + TOTAL_LESSONS + "</div></div>" +
    "</div>" +
    '<div class="lesson-progress-wrap">' +
      '<div class="lesson-progress-label">Прогресс урока · ' + pct + '%</div>' +
      '<div class="lesson-progress-bar"><div style="width:' + pct + '%;"></div></div>' +
    "</div>" +
    '<div class="stepper">' +
      stepRow({ act: "go-lecture", dotBg: "oklch(60% 0.13 38)", icon: SVG.stepCheck, name: "Лекция «" + esc(LESSON.title) + "»", sub: subs.lecture }) +
      stepRow({ act: "go-quiz", dotBg: s.quizDone ? "oklch(60% 0.13 38)" : "oklch(56% 0.09 235)", icon: s.quizDone ? SVG.stepCheck : SVG.doc, name: "Тест", sub: s.quizDone ? "Пройден · " + s.quizScore + "/" + quizQuestions().length : subs.quiz }) +
      stepRow({ act: "go-warmups", locked: false, lockedText: false,
        dotBg: s.warmupsDone ? "oklch(60% 0.13 38)" : (s.quizDone ? "oklch(56% 0.09 235)" : "var(--bg)"),
        icon: s.warmupsDone ? SVG.stepCheck : SVG.micIcon(s.quizDone ? "var(--white-text)" : "var(--locked)"),
        name: "Распевки «" + esc(LESSON.title) + "»", sub: subs.warmups }) +
      stepRow({ act: "go-song", locked: false, lockedText: false, last: true,
        dotBg: s.songDone ? "oklch(60% 0.13 38)" : (s.warmupsDone ? "oklch(56% 0.09 235)" : "var(--bg)"),
        icon: s.songDone ? SVG.stepCheck : SVG.notesIcon(s.warmupsDone ? "var(--white-text)" : "var(--locked)"),
        name: "Упражнение с песней", sub: subs.song }) +
    "</div>";
  wireActs();
}

// Полоса заполнения под заголовком шага убрана (21.11, просьба Николая):
// «шаг N из 4» в подписи уже говорит то же самое.
function stepHeader(title, stepNum) {
  return '<div class="top pb8">' + backBtn("back") +
      "<div><div class=\"top-title\">" + title + '</div><div class="top-sub">' + esc(LESSON.title) + " · шаг " + stepNum + ' из 4</div></div></div>';
}

function renderLecture() {
  if (!state.lectureViewed) { state.lectureViewed = true; saveState(); sendProgressToBaza((LESSON.id || 1), "lecture"); }
  var html = stepHeader("Лекция «" + esc(LESSON.title) + "»", 1);
  /* Два уровня лекции: lecture.levels = true. Блок с level: "deep" виден
     только в подробной, level: "basic" — только в упрощённой, без level — в обеих. */
  var hasLevels = !!LESSON.lecture.levels;
  var lvl = hasLevels ? (state._lectureLevel || "basic") : null;
  if (hasLevels) {
    html += '<div class="llevel-seg">' +
      '<button class="' + (lvl === "basic" ? "on" : "") + '" data-act="lecture-level" data-level="basic">Упрощённая</button>' +
      '<button class="' + (lvl === "deep" ? "on" : "") + '" data-act="lecture-level" data-level="deep">Подробная</button></div>';
  }
  html += '<div class="lecture-body">';
  var num = 0;
  var first = true;
  LESSON.lecture.blocks.forEach(function (blk) {
    if (hasLevels && blk.level && blk.level !== lvl) return;
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
    } else if (blk.type === "scale") {
      html += lectureScaleHtml(blk);
    } else if (blk.type === "effort-scale" || blk.type === "effort-anatomy" || blk.type === "warning") {
      html += effortBlockHtml(blk); // effort-anim.js монтирует шкалу и связки сам
    } else if (blk.type === "table") {
      html += lectureTableHtml(blk);
    } else if (blk.type === "panels") {
      html += lecturePanelsHtml(blk);
    } else if (blk.type === "image") {
      html += lectureImageHtml(blk);
    } else if (blk.type === "breath-anim") {
      // breath-anim.js монтирует сам; газообмен — только в подробной лекции
      html += '<div class="banim-mount" data-gx="' + (!hasLevels || lvl === "deep" ? "1" : "0") + '"></div>';
      if (blk.legend && blk.legend.length) {
        html += '<ul class="lpanels-legend banim-legend">' + blk.legend.map(function (it, i) {
          return "<li><b>" + (i + 1) + ". " + esc(it.name) + "</b>" + (it.note ? " — " + esc(it.note) : "") + "</li>";
        }).join("") + "</ul>";
      }
    } else if (blk.type === "breath-muscles") {
      // карточка «Дыхательные мышцы»: в упрощённой — только главные мышцы
      html += '<div class="bmus-mount" data-level="' + (!hasLevels || lvl === "deep" ? "deep" : "basic") + '"></div>';
    }
  });
  html += "</div>";
  html += '<div class="bottom-cta"><button class="cta" data-act="finish-lecture">Пройти тест</button></div>';
  if (hasLevels && !state._lectureLevel && !state._llevelSkip) {
    html += '<div class="llevel-ov"><div class="llevel-card">' +
      '<div class="llevel-title">Как будешь проходить лекцию?</div>' +
      '<div class="llevel-sub">Выбор можно поменять в любой момент — переключателем вверху.</div>' +
      '<button class="llevel-opt" data-act="lecture-level" data-level="basic"><b>Упрощённая</b><span>Главное о дыхании — коротко и понятно</span></button>' +
      '<button class="llevel-opt deep" data-act="lecture-level" data-level="deep"><b>Подробная</b><span>С анатомией и тем, как кислород попадает в кровь</span></button>' +
      "</div></div>";
  }
  app.innerHTML = html;
  wireActs();
  // смахнул окно выбора — остаётся упрощённая (переключатель вверху), при следующем входе спросим снова
  var llOv = app.querySelector(".llevel-ov");
  if (llOv) wireSheetSwipe(llOv.querySelector(".llevel-card"), function () { state._llevelSkip = true; if (llOv.parentNode) llOv.parentNode.removeChild(llOv); }, llOv);
}

/* Новый тест урока 1 (quizNew): 10 вопросов, в подробной лекции +5.
   На устройствах Николая (есть ключ админа) сразу показываем правильный ответ. */
function quizPreview() { return !!readAdminKey() && !!(LESSON && LESSON.quizNew); }
function quizQuestions() {
  // 21.11: новый тест открыт всем; мгновенный показ ответа (quizPreview) — только у Николая
  if (!(LESSON && LESSON.quizNew)) return LESSON.quiz.questions;
  return LESSON.quizNew.questions.concat(state._lectureLevel === "deep" ? (LESSON.quizNew.deep || []) : []);
}

function renderQuiz() {
  var s = state;
  var questions = quizQuestions();
  if (s.quizIndex >= questions.length) s.quizIndex = questions.length - 1;
  var preview = quizPreview();
  var cq = questions[s.quizIndex];
  var answered = s.quizAnswers[s.quizIndex];
  var hasAnswer = answered !== null && answered !== undefined;
  var isLast = s.quizIndex === questions.length - 1;

  var optsHtml = "";
  cq.opts.forEach(function (text, i) {
    var mark = "";
    if (preview && hasAnswer) mark = i === cq.correct ? " right" : (answered === i ? " wrong" : "");
    optsHtml += '<div class="quiz-opt' + (answered === i ? " sel" : "") + mark + '" data-opt="' + i + '">' +
      '<div class="quiz-radio"></div><span>' + esc(text) + "</span></div>";
  });

  var answeredCount = s.quizAnswers.filter(function (a) { return a !== null && a !== undefined; }).length;
  var quizFrac = answeredCount / questions.length;
  var quizPct = Math.round(quizFrac * 100);

  app.innerHTML =
    stepHeader("Тест", 2) +
    '<div class="quiz-body">' +
      '<div class="quiz-counter-row">' +
        '<span class="quiz-counter">Вопрос ' + (s.quizIndex + 1) + " из " + questions.length + "</span>" +
      "</div>" +
      '<div class="quiz-card">' +
        (cq.anim ? '<div class="banim-mount quiz-anim" data-quiz="' + esc(cq.anim) + '" data-gx="0"></div>' : "") +
        '<div class="quiz-q">' + esc(cq.q) + "</div>" + optsHtml +
        (preview && hasAnswer && answered !== cq.correct && cq.explain ? '<div class="quiz-explain">' + esc(cq.explain) + "</div>" : "") +
      "</div>" +
      '<div class="quiz-ring-big-wrap">' +
        '<div class="quiz-ring-big" style="background:conic-gradient(oklch(56% 0.09 235) ' + quizPct + '%, oklch(87% 0.01 70) 0);">' +
          '<div class="quiz-ring-big-inner"><span>' + (s.quizIndex + 1) + "/" + questions.length + "</span></div>" +
        "</div>" +
      "</div>" +
    "</div>" +
    '<div class="quiz-cta-wrap"><button id="quiz-next" class="cta' + (isLast ? " terra" : "") + '"' + (hasAnswer ? "" : " disabled") + ">" + (isLast ? "Завершить" : "Далее") + "</button></div>";

  // 21.11: выбор ответа НЕ перерисовывает экран — меняем только отметки на месте.
  // Раньше полный render() пересобирал страницу (с картинкой/анимацией), высота
  // на миг проседала и страница прыгала вверх. Теперь место нажатия не сдвигается.
  Array.prototype.forEach.call(app.querySelectorAll(".quiz-opt"), function (el) {
    el.addEventListener("click", function () {
      var pick = parseInt(el.getAttribute("data-opt"), 10);
      state.quizAnswers[state.quizIndex] = pick;
      saveState();
      answered = pick; hasAnswer = true;
      Array.prototype.forEach.call(app.querySelectorAll(".quiz-opt"), function (o) {
        var i = parseInt(o.getAttribute("data-opt"), 10);
        o.classList.toggle("sel", i === pick);
        o.classList.toggle("right", !!preview && i === cq.correct);
        o.classList.toggle("wrong", !!preview && i === pick && i !== cq.correct);
      });
      if (preview) {
        var card = app.querySelector(".quiz-card");
        var ex = card && card.querySelector(".quiz-explain");
        if (pick !== cq.correct && cq.explain) {
          if (!ex && card) { ex = document.createElement("div"); ex.className = "quiz-explain"; ex.textContent = cq.explain; card.appendChild(ex); }
        } else if (ex) ex.parentNode.removeChild(ex);
      }
      var cnt = state.quizAnswers.filter(function (a) { return a !== null && a !== undefined; }).length;
      var ring = app.querySelector(".quiz-ring-big");
      if (ring) ring.style.background = "conic-gradient(oklch(56% 0.09 235) " + Math.round(cnt / questions.length * 100) + "%, oklch(87% 0.01 70) 0)";
      var nb = document.getElementById("quiz-next");
      if (nb) nb.disabled = false;
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
    firstTry("quiz", score / Math.max(1, questions.length)); // засчитывается только первая попытка
    saveState();
    sendProgressToBaza((LESSON.id || 1), "quiz");
    trackEv("quiz", { lesson: (LESSON.id || 1), score: score, total: questions.length });
    submitQuizResult(score, questions.length, wrongDetails);
    state._foilPending = true; // конфетти только сразу после завершения теста
    go("quiz-result");
  });
  wireActs();
}

function renderQuizResult() {
  app.innerHTML =
    // 21.11: экран неподвижен — fixed-слой без прокрутки. Значок с надписью
    // чуть выше центра, кнопка всегда ровно над доком (см. .quiz-result-screen).
    '<div class="quiz-result-screen">' +
      '<div class="qr-center">' +
        '<div class="result-badge">' + SVG.resultCheck + "</div>" +
        '<div class="result-title">Тест пройден</div>' +
        '<div class="result-sub">Результат: ' + state.quizScore + " из " + quizQuestions().length + "</div>" +
      "</div>" +
      '<button class="cta terra qr-cta" data-act="go-warmups-free">Продолжить: распевки</button>' +
    "</div>";
  wireActs();
  if (state._foilPending && window.playFoilConfetti) {
    state._foilPending = false;
    window.playFoilConfetti(app.querySelector(".quiz-result-screen"));
  }
}

/* ---------- финальные заставки шагов урока (22.11) ----------
   Тот же неподвижный экран, что «Тест пройден»: значок, заголовок, строка,
   кнопка над доком. Конфетти — только если шаг выполнен целиком:
   лекция — читал не меньше 3 минут; распевки и песня — все задания
   сделаны и домашка отправлена Николаю в бот. */
var LECTURE_MIN_SEC = 180;
var lectureT0 = 0;
function lectureKey() { return "lectureSec." + ((LESSON && LESSON.id) || 1); }
function lectureSec() { try { return parseFloat(localStorage.getItem(lectureKey())) || 0; } catch (e) { return 0; } }
function lectureFlush() {
  if (!lectureT0) return;
  var d = Math.min(600, (Date.now() - lectureT0) / 1000); // простой с открытым экраном не считаем дольше 10 мин
  lectureT0 = 0;
  try { localStorage.setItem(lectureKey(), String(lectureSec() + d)); } catch (e) {}
}
function lectureClock() {
  lectureFlush();
  if (state.screen === "lecture" && !document.hidden) lectureT0 = Date.now();
}
document.addEventListener("visibilitychange", function () {
  if (document.hidden) lectureFlush();
  else if (state.screen === "lecture") lectureT0 = Date.now();
});
function anySent(list) { return (list || []).some(function (f) { return f.status === "sent"; }); }

var STEP_ICON = {
  lecture: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M8 13h5M8 17h7"/><path d="M18.4 2.6l3 3L14 13l-4 1 1-4z"/></svg>',
  warmups: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14c2.5 0 2.5-6 5-6s2.5 8 5 8 2.5-10 5-10 2.5 8 5 8"/></svg>',
  song: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="18" r="3"/><circle cx="18" cy="15.5" r="3"/><path d="M9.5 18V5.5L21 3v12.5"/></svg>'
};

function stepFullyDone(kind) {
  if (kind === "lecture") { lectureFlush(); if (state.screen === "lecture") lectureT0 = Date.now(); return lectureSec() >= LECTURE_MIN_SEC; }
  if (kind === "warmups") {
    if (!anySent(state.warmupFiles)) return false;
    if (LESSON && LESSON.id === 1 && window.trainerAllDone) return trainerAllDone();
    return true;
  }
  if (kind === "song") {
    if (!anySent(state.songFiles)) return false;
    var tr = (LESSON && LESSON.song && LESSON.song.tracks) || [];
    return tr.every(function (t, ti) { return trackAttempted(ti, t); });
  }
  return false;
}

/* ---------- «Урок пройден с первого раза» (22.11) ----------
   Отдельный экран, если ученик сделал все 4 шага целиком, с первой попытки
   и не меньше чем на 70% верно (тест и разметка песни). Показывается
   вместо заставки шага «Песня» один раз за урок; конфетти бесконечное. */
var MASTER_MIN = 0.7;
function ftKey(k) { return "firstTry." + ((LESSON && LESSON.id) || 1) + "." + k; }
function firstTry(k, v) {
  try { if (localStorage.getItem(ftKey(k)) === null) localStorage.setItem(ftKey(k), String(v)); } catch (e) {}
}
function firstTryVal(k) { try { var v = localStorage.getItem(ftKey(k)); return v === null ? null : parseFloat(v); } catch (e) { return null; } }
// 22.11: в каждой песне допускается не больше 1 ошибки (строки с неверной разметкой)
var SONG_MAX_ERR = 1;
function songTrackErr(ti, track) { return trackCorrectness(ti, track).filter(function (ok) { return !ok; }).length; }
function masterStats() {
  var tracks = (LESSON && LESSON.song && LESSON.song.tracks) || [];
  var q = firstTryVal("quiz");
  var errs = tracks.map(function (t, ti) {
    var e = firstTryVal("songErr" + ti);
    return e === null ? songTrackErr(ti, t) : e;
  });
  return { quiz: q, songErr: tracks.length ? errs : null };
}
function lessonMastered() {
  if (!stepFullyDone("lecture") || !state.quizDone || !stepFullyDone("warmups") || !stepFullyDone("song")) return false;
  var st = masterStats();
  if (st.quiz === null || st.quiz < MASTER_MIN) return false;
  if (st.songErr && st.songErr.some(function (e) { return e > SONG_MAX_ERR; })) return false;
  return true;
}
function masterShown() { try { return localStorage.getItem(ftKey("masterShown")) === "1"; } catch (e) { return false; } }

function renderAdminScreens() {
  var rows = [
    ["lecture", "Лекция прочитана", "Обычная заставка, конфетти после 3 минут чтения"],
    ["warmups", "Распевки выполнены", "Обычная заставка, конфетти если всё сделано и видео отправлено"],
    ["song", "Упражнение выполнено", "Обычная заставка шага «Песня»"],
    ["trainer", "Раздел тренажёра", "Например, «Спокойствие: готово»"],
    ["master", "Урок пройден с первого раза", "Бесконечное конфетти и светящееся кольцо"]
  ];
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Финальные заставки</div><div class="top-sub">Просмотр — прогресс учеников не меняется</div></div>' +
    "</div>" +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' +
    rows.map(function (r) {
      return '<div class="more-item" data-act="admin-preview" data-k="' + r[0] + '">' +
        '<div style="flex:1;min-width:0;"><div class="more-item-label">' + esc(r[1]) + '</div><div class="lesson-sub" style="margin-top:1px;">' + esc(r[2]) + "</div></div>" +
        SVG.chevronRight + "</div>";
    }).join("") + "</div>";
  wireActs();
}

function renderLessonMaster() {
  var st = state._preview ? { quiz: 0.9, songErr: [0, 0, 0] } : masterStats(), n = LESSON ? quizQuestions().length : 10;
  var parts = [];
  if (st.quiz !== null) parts.push("тест " + Math.round(st.quiz * n) + " из " + n);
  if (st.songErr) parts.push(st.songErr.every(function (e) { return e === 0; }) ? "разметка без ошибок" : "разметка почти без ошибок");
  app.innerHTML =
    '<div class="quiz-result-screen lm-screen">' +
      '<div class="qr-center lm-center lm-card">' +
        '<div class="lm-ring"><div class="lm-glow"></div><div class="lm-glow b"></div>' +
          '<div class="result-badge">' + SVG.resultCheck + "</div></div>" +
        '<div class="result-title">Урок «' + esc((LESSON && LESSON.title) || "Дыхание") + '» пройден</div>' +
        '<div class="result-sub">Всё с первого раза' + (parts.length ? ": " + parts.join(" · ") : "") + "</div>" +
      "</div>" +
      '<button class="cta terra qr-cta" data-act="step-done-next">Продолжить: оценить урок</button>' +
    "</div>";
  wireActs();
  var scr = app.querySelector(".lm-screen");
  // конфетти летит за карточкой и кнопкой (behind), текст не перекрывает
  if (window.playFoilConfetti) window.playFoilConfetti(scr, { loop: true, behind: true, frost: scr.querySelector(".lm-card"), avoid: [scr.querySelector(".lm-center"), scr.querySelector(".qr-cta")] });
}

function showStepDone(kind) {
  // 22.11: у Николая (админ) в теме «Дыхание» экран показывается всегда в конце урока
  var adminShow = kind === "song" && state.isAdmin && LESSON && LESSON.id === 1;
  if (adminShow || (kind === "song" && !masterShown() && lessonMastered())) {
    try { localStorage.setItem(ftKey("masterShown"), "1"); } catch (e) {}
    state._stepKind = "song";
    trackEv("lesson_master", { lesson: (LESSON && LESSON.id) || 1, quiz: masterStats().quiz, songErr: masterStats().songErr });
    go("lesson-master");
    return;
  }
  state._stepKind = kind;
  state._stepFoil = stepFullyDone(kind);
  trackEv("step_done", { lesson: (LESSON && LESSON.id) || 1, step: kind, full: state._stepFoil });
  go("step-done");
}

function renderStepDone() {
  var k = state._stepKind || "lecture", t, sub, cta;
  if (k === "lecture") {
    var m = Math.max(1, Math.round(lectureSec() / 60));
    t = "Лекция прочитана";
    sub = lectureSec() >= LECTURE_MIN_SEC ? "Время чтения: " + m + " мин" : "Можно вернуться и дочитать — это около 3 минут";
    cta = "Продолжить: тест";
  } else if (k === "warmups") {
    t = "Распевки выполнены";
    sub = anySent(state.warmupFiles) ? "Видео отправлено Николаю" : "Видео Николаю ещё не отправлено";
    cta = "Продолжить: упражнение с песней";
  } else {
    t = "Упражнение выполнено";
    sub = anySent(state.songFiles) ? "Разметка отправлена Николаю" : "Разметка Николаю ещё не отправлена";
    cta = "Продолжить: оценить урок";
  }
  app.innerHTML =
    '<div class="quiz-result-screen">' +
      '<div class="qr-center">' +
        '<div class="result-badge">' + STEP_ICON[k] + "</div>" +
        '<div class="result-title">' + t + "</div>" +
        '<div class="result-sub">' + sub + "</div>" +
      "</div>" +
      '<button class="cta terra qr-cta" data-act="step-done-next">' + cta + "</button>" +
    "</div>";
  wireActs();
  if (state._stepFoil && window.playFoilConfetti) {
    state._stepFoil = false;
    window.playFoilConfetti(app.querySelector(".quiz-result-screen"));
  }
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
  if (!stjsModulePromise) {
    stjsModulePromise = import(STJS_URL).catch(function (err) {
      stjsModulePromise = null;   // разовая осечка CDN не должна быть вечной
      throw err;
    });
  }
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
      .then(function (buf) { return getAudioCtx().decodeAudioData(buf); })
      .catch(function (err) {
        // иначе отклонённый промис остаётся в кэше навсегда и трек
        // больше никогда не загрузится, даже когда сеть вернётся
        delete audioBufferCache[n];
        throw err;
      });
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

/* ==========================================================================
   ЕДИНЫЙ ПЛЕЕР РАСПЕВКИ — используется ВЕЗДЕ, где показывается упражнение
   с аудио: на экране урока «Распевки» и на экране «Избранные распевки».
   Интерфейс и весь функционал (перемотка ±10, play/pause, кольцо прогресса,
   звезда, шестерёнка → Темп/Тональность/Повтор/Автовоспроизведение) ОДИН И
   ТОТ ЖЕ везде. Если нужно что-то добавить в плеер — менять СНАЧАЛА здесь
   (warmupCardHtml / wireWarmupCard / wireWarmupControls), а не в отдельных
   экранах, чтобы не разойтись. См. также PLAYER_SPEC.md в корне проекта.
   ========================================================================== */

function warmupCardHtml(ex, extraHtml) {
  var isFav = !!state.favorites[favKey(ex.n)];
  return (
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
      (extraHtml || "") +
      '<audio id="audio-' + ex.n + '" src="' + esc(ex.src) + '" preload="metadata" style="display:none;"></audio>' +
    "</div>"
  );
}

function wireWarmupCard(ex) {
  var n = ex.n;
  var el = document.getElementById("audio-" + n);
  if (!el) return;
  audioEls[n] = el;
  el.preservesPitch = true;
  el.mozPreservesPitch = true;
  el.webkitPreservesPitch = true;
  el.playbackRate = ((state.tempoMap && state.tempoMap[n]) || 100) / 100;
  el.addEventListener("loadedmetadata", function () {
    state.durations[n] = Math.round(el.duration) || 0;
    var t = document.getElementById("time-" + n);
    if (t) t.textContent = warmupTimeLabel(ex);
  });
  el.addEventListener("timeupdate", function () {
    if (el.duration) setRing(n, el.currentTime / el.duration);
    if (state.playerIdx === n) {
      state.playerElapsed = Math.floor(el.currentTime);
      var t = document.getElementById("time-" + n);
      if (t) t.textContent = warmupTimeLabel(ex);
    }
  });
  el.addEventListener("ended", function () { handleExerciseEnded(n); });

  var tempoSlider = document.getElementById("tempo-" + n);
  if (tempoSlider) tempoSlider.addEventListener("input", function () {
    var pct = parseInt(tempoSlider.value, 10);
    state.tempoMap[n] = pct;
    el.playbackRate = pct / 100;
    if (activeShifter && activeShifter.n === n) activeShifter.shifter.tempo = pct / 100;
    var lbl = document.getElementById("tempo-label-" + n);
    if (lbl) lbl.textContent = tempoLabelText(ex, pct);
    saveState();
  });

  var pitchSlider = document.getElementById("pitch-" + n);
  if (pitchSlider) pitchSlider.addEventListener("input", function () {
    var semis = parseFloat(pitchSlider.value);
    state.pitchMap[n] = semis;
    var lbl = document.getElementById("pitch-label-" + n);
    if (lbl) lbl.textContent = pitchLabelText(semis);
    saveState();

    if (state.playerIdx !== n) return; // трек сейчас не играет — применится при следующем запуске
    if (activeShifter && activeShifter.n === n) {
      if (semis) {
        activeShifter.shifter.pitchSemitones = semis; // движок уже включён — просто обновляем на лету
      } else {
        // тональность вернули на 0 — переключаемся обратно на обычное аудио с той же позиции
        var pos = activeShifter.shifter.timePlayed || 0;
        stopShiftedPlayback(n);
        el.currentTime = pos;
        var p = el.play();
        if (p && p.catch) p.catch(function () {});
      }
    } else if (semis) {
      // сейчас играет обычное аудио — подключаем движок с той же позиции
      var pos2 = el.currentTime;
      el.pause();
      getAudioCtx();
      playShifted(n, ex, pos2);
    }
  });
}

/* onFav (необязательно) — свой обработчик звезды. По умолчанию — обычный
   toggle (лесной экран урока). На экране «Избранные распевки» передаём снятие
   с 10-секундным отменяемым тостом — это единственное законное отличие между
   экранами, сам плеер и его настройки при этом идентичны. */
function wireWarmupControls(onFav) {
  Array.prototype.forEach.call(app.querySelectorAll(".play-btn[data-n]"), function (btn) {
    btn.addEventListener("click", function () {
      toggleAudio(parseInt(btn.getAttribute("data-n"), 10));
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll(".seek-btn[data-n]"), function (btn) {
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
      if (onFav) { onFav(n, ex, btn); return; }
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
}

function renderWarmups() {
  // Урок «Дыхание»: вместо прежних распевок — тренажёр «Ритм-лента» с записью
  // видео прямо в приложении (21.11, просьба Николая). Прикрепить готовое видео
  // по-прежнему можно внизу.
  if (LESSON && LESSON.id === 1 && window.trainerSectionsHtml) {
    app.innerHTML =
      stepHeader("Распевки «" + esc(LESSON.title) + "»", 3) +
      '<div class="warmups-body">' +
        '<div class="instruction-note">Музыка не нужна — выполняй упражнения, глядя на ленту. Каждая буква длится минуту. ' +
          'Нажми <b>«Записать видео для Николая»</b>: поставь телефон так, чтобы в рамке были макушка и пояс, — после упражнения видео сразу уйдёт Николаю. ' +
          'Телефон заодно следит, чтобы на вдохе не поднимались плечи.</div>' +
        (window.trainerCamCardHtml ? trainerCamCardHtml() : "") +
        trainerSectionsHtml() +
        '<div class="section-label" style="margin:22px 0 8px;">Или прикрепи готовое видео</div>' +
        '<div id="hw-zone"></div>' +
      "</div>" +
      '<div class="bottom-cta" style="padding-top:0;"><button class="cta" data-act="finish-warmups">Продолжить: упражнение с песней</button></div>';
    renderHwZone();
    wireActs();
    trainerWireSections("warmups");
    if (window.trainerWireCamCard) trainerWireCamCard();
    return;
  }
  var cards = "";
  LESSON.warmups.exercises.forEach(function (ex) {
    var extra =
      '<p class="warmup-sub">' + esc(ex.sub) + "</p>" +
      (ex.how ? '<p class="warmup-how"><b>Как выполнять:</b> ' + esc(ex.how) + "</p>" : "") +
      (ex.mistake ? '<p class="warmup-mistake"><b>Частая ошибка:</b> ' + esc(ex.mistake) + "</p>" : "");
    cards += warmupCardHtml(ex, extra);
  });

  app.innerHTML =
    stepHeader("Распевки «" + esc(LESSON.title) + "»", 3) +
    '<div class="warmups-body">' +
      '<div class="instruction-note">' + LESSON.warmups.instruction + "</div>" +
      cards +
      '<div class="section-label" style="margin:0 0 8px;">Отправка видео</div>' +
      '<div id="hw-zone"></div>' +
    "</div>" +
    '<div class="bottom-cta" style="padding-top:0;"><button class="cta" data-act="finish-warmups">Продолжить: упражнение с песней</button></div>';

  LESSON.warmups.exercises.forEach(function (ex) { wireWarmupCard(ex); });
  wireWarmupControls();

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
      "</div>"
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
  if (window.karaokeStopAll) window.karaokeStopAll();
  if (window.pitchStopAll) window.pitchStopAll();
  if (window.byloStopAll) window.byloStopAll();
  if (window.trainerStopAll) window.trainerStopAll();
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
      "</div>"
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
      .then(function (buf) { return getAudioCtx().decodeAudioData(buf); })
      .catch(function (err) {
        // иначе отклонённый промис остаётся в кэше навсегда и трек
        // больше никогда не загрузится, даже когда сеть вернётся
        delete songAudioBufferCache[ti];
        throw err;
      });
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
  var el = songAudioEl(ti);
  if (!el) {
    abortSongPlayback(ti);
    return;
  }
  el.currentTime = startSeconds || 0;
  var p = el.play();
  if (p && p.catch) p.catch(function () { abortSongPlayback(ti); });
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

/* Элемент <audio> трека. songAudioEls обнуляется в stopAllMedia(), а экран
   песни после перехода (например, с распевок) не всегда успевает заново
   привязать узлы — тогда воспроизведение молча не стартовало, а кнопка
   оставалась в состоянии «играет». Поэтому если кэш пуст — берём узел из DOM. */
function songAudioEl(ti) {
  var el = songAudioEls[ti];
  if (!el) {
    el = document.getElementById("song-audio-" + ti);
    if (el) songAudioEls[ti] = el;
  }
  return el;
}

/* Снять залипшее «играет», если трек стартовать не смог. Без этого кнопка
   показывает паузу при полной тишине, и второе нажатие только «выключает». */
function abortSongPlayback(ti) {
  stopSongShiftedPlayback(ti);
  if (state.songPlayerKey === ti) state.songPlayerKey = null;
  state.songPlayerElapsed = 0;
  setRing("song-" + ti, 0);
  updateSongPlayBtn(ti);
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
    var el = songAudioEl(ti);
    if (!el) {
      abortSongPlayback(ti);
      return;
    }
    el.currentTime = 0;
    var p = el.play();
    if (p && p.catch) p.catch(function () { abortSongPlayback(ti); });
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
  var tracks = (LESSON.song && LESSON.song.tracks) || [];
  if (!tracks.length) return;   // урок из плана: разметки нет, отправлять нечего
  var lines = [];
  tracks.forEach(function (track, ti) {
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
    '<div class="auth-screen" style="padding-top:var(--screen-top);padding-bottom:130px;">' +
      '<div class="auth-title">Как прошёл урок?</div>' +
      '<div class="auth-sub">Домашнее задание выполнено. Оцени, как всё прошло — это поможет сделать курс лучше.</div>' +
      '<div class="mood-row">' + moodsHtml + "</div>" +
      '<div class="mood-label">' + esc(label) + "</div>" +
      '<label class="field-label">РЕКОМЕНДАЦИИ И ПОЖЕЛАНИЯ (необязательно)</label>' +
      '<textarea id="feedback-text" class="feedback-textarea" placeholder="Что понравилось, что было сложно, чего не хватило...">' + esc(s.feedbackText || "") + "</textarea>" +
      // 22.11: кнопка всегда над доком, на том же уровне, что и на других экранах
      '<button class="cta dock-cta" id="feedback-submit"' + (s.feedbackMood ? "" : " disabled") + '>Отправить и завершить</button>' +
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

/* Песня для уроков, к которым ещё не записаны треки: показываем задание и
   названия песен, чтобы шаг можно было выполнить вне приложения и отметить. */
function renderSongWithoutTracks(song) {
  var ideas = (song.trackIdeas || []).map(function (t) {
    return '<li class="plan-wu-row">' + esc(t) + "</li>";
  }).join("");
  var lines = (song.lines || []).map(function (t) {
    return '<li class="plan-wu-row">' + esc(t) + "</li>";
  }).join("");
  app.innerHTML =
    '<div class="top">' + backBtn("back") +
      '<div><div class="top-title">Упражнение с песней</div>' +
      '<div class="top-sub">' + esc(LESSON.title) + " · шаг 4 из 4</div></div>" +
    "</div>" +
    '<div class="lecture-body">' +
      (song.task ? '<p class="lecture-para">' + esc(song.task) + "</p>" : "") +
      (song.hint ? '<div class="note-box">' + esc(song.hint) + "</div>" : "") +
      (lines ? '<div class="lecture-h2">Строки для разбора</div><ul>' + lines + "</ul>" : "") +
      (ideas ? '<div class="lecture-h2">На каких песнях разобрать</div><ul>' + ideas + "</ul>" : "") +
      '<div class="note-box">Аудиофрагменты к этому уроку ещё не записаны — ' +
      'разбери задание на любой из песен выше, а отметку поставь здесь.</div>' +
    "</div>" +
    '<div class="bottom-cta"><button class="cta" data-act="finish-lesson">Отметить шаг выполненным</button></div>';
  wireActs();
}

function renderSong() {
  var s = state;
  var song = LESSON.song || {};

  // У уроков из планов песня описана задачей и списком-подсказкой (trackIdeas),
  // готовых треков с mp3 там нет. Без этой ветки song.tracks.forEach падал бы
  // с TypeError и урок не открывался вообще.
  if (!song.tracks || !song.tracks.length) {
    renderSongWithoutTracks(song);
    return;
  }

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
    stepHeader("Упражнение с песней", 4) +
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
      // первый показ ответа — фиксируем, сколько строк было верно до подсказки
      var tr = LESSON.song.tracks[ti];
      if (tr && !state.songRevealed[ti]) firstTry("songErr" + ti, songTrackErr(+ti, tr));
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
  // из фильтра «Завершено»: заново с первого шага (для повторения)
  "open-lesson-review": function () { go("lecture"); },
  // из фильтра «В работе»: сразу на первый непройденный шаг
  "open-lesson-continue": function () { go(firstIncompleteStepScreen()); },
  "go-lecture": function () { go("lecture"); },
  "lecture-level": function (el) {
    var v = el && el.getAttribute("data-level");
    if (v !== "basic" && v !== "deep") return;
    var y = window.scrollY;
    state._lectureLevel = v;
    render();
    window.scrollTo(0, y);
  },
  "go-quiz": function () { go("quiz"); },
  "go-warmups": function () { go("warmups"); },
  "go-warmups-free": function () { go("warmups"); },
  "go-song": function () { go("song"); },
  "finish-lecture": function () { showStepDone("lecture"); },
  "finish-warmups": function () { state.warmupsDone = true; saveState(); sendProgressToBaza((LESSON.id || 1), "warmups"); showStepDone("warmups"); },
  "finish-lesson": function () { state.songDone = true; saveState(); sendProgressToBaza((LESSON.id || 1), "song"); submitSongMarks(); showStepDone("song"); },
  "step-done-next": function () {
    if (state._preview) { go("admin-screens"); return; }
    var k = state._stepKind;
    if (k === "lecture") ACTS["go-quiz"]();
    else if (k === "warmups") go("song");
    else go("feedback");
  },
  "reset-progress": resetProgress,
  "go-profile": function () { go("profile"); },
  "cab-lessons": function () { go("cab-lessons"); },
  "cab-hw": function () { go("cab-hw"); },
  "cab-voice": function () { go("cab-voice"); },
  "cab-wheel": function () { state._wheelZone = null; go("cab-wheel"); },
  "cab-renew": function () { openRenew(); },
  "go-courses": function () { go("courses"); },
  "go-questions": function () { go("questions"); },
  "go-more": function () { go("more"); },
  "toggle-roadmap": function () {
    // без re-render: свернуть/раскрыть только блок, лента не сбрасывает скролл
    var wrap = app.querySelector(".roadmap-wrap");
    if (!wrap) return;
    var c = !wrap.classList.contains("collapsed");
    wrap.classList.toggle("collapsed", c);
    try { localStorage.setItem("vocalAppRoadmapCollapsed", c ? "1" : "0"); } catch (e) {}
  },
  "filter-inprogress": function () { state.coursesFilter = state.coursesFilter === "inProgress" ? null : "inProgress"; render(); },
  "filter-completed": function () { state.coursesFilter = state.coursesFilter === "completed" ? null : "completed"; render(); },
  "go-favorites": function () { go("favorites"); },
  "admin-hub-students": function () { go("admin-students"); },
  "admin-hub-birthdays": function () { go("admin-birthdays"); },
  "admin-hub-dash": function () { go("admin-dash"); },
  "admin-hub-guests": function () { if (window.GUEST) GUEST.adminOpenList(); },
  "admin-hub-plans": function () { go("admin-plans"); },
  "admin-hub-screens": function () { state._preview = false; go("admin-screens"); },
  "admin-preview": function (el) {
    // 22.11: просмотр заставки для Николая — прогресс урока не меняется
    var k = el.getAttribute("data-k");
    if (LESSON_ONE) LESSON = LESSON_ONE;
    state._preview = true;
    if (k === "master") { go("lesson-master"); return; }
    if (k === "trainer") { if (window.trainerPreviewDone) trainerPreviewDone(); return; }
    state._stepKind = k; state._stepFoil = true; go("step-done");
  },
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
    el.addEventListener("click", function (e) {
      // элементы с data-act иногда вложены друг в друга (например кнопка
      // удаления внутри кликабельной строки ученика) — без этого клик по
      // вложенному элементу срабатывал бы дважды, по нему и по родителю.
      e.stopPropagation();
      var act = el.getAttribute("data-act");
      // карточки/плитки разблокированных уроков без контента — номер в data-lesson-num
      if (act === "open-lesson-num") {
        openLessonByNumber(parseInt(el.getAttribute("data-lesson-num"), 10));
        return;
      }
      if (act === "srez-topics-toggle") {
        state._srezTopicsOpen = !state._srezTopicsOpen;
        render();
        return;
      }
      if (act === "wheel-lvl") {
        var lv = el.getAttribute("data-lvl");
        state._wheelLvl = lv === "-" ? "" : lv;
        state._wheelZone = null;
        render();
        return;
      }
      if (act === "srez-toggle") {
        // Сравнение срезов: отмеченные накладываются на колесо контурами.
        var sid = el.getAttribute("data-srez-id");
        var at = state._srezCompare.indexOf(sid);
        if (at > -1) state._srezCompare.splice(at, 1);
        else if (state._srezCompare.length < 3) state._srezCompare.push(sid);
        render();
        return;
      }
      if (act === "admin-pick-student") {
        enterAdminMode({ id: el.getAttribute("data-admin-id"), telegramToken: el.getAttribute("data-admin-token"), name: el.getAttribute("data-admin-name") });
        return;
      }
      if (act === "admin-delete-student") {
        deleteStudentWithConfirm(el.getAttribute("data-admin-id"), el.getAttribute("data-admin-name"));
        return;
      }
      if (act === "admin-open-plan") {
        state.adminPlanIdx = parseInt(el.getAttribute("data-plan-idx"), 10);
        state.adminPlanSection = "lecture";
        go("admin-plan");
        return;
      }
      if (act === "admin-plan-section") {
        // повторный тап по открытой секции её сворачивает
        var sec = el.getAttribute("data-plan-section");
        state.adminPlanSection = state.adminPlanSection === sec ? null : sec;
        render();
        return;
      }
      var fn = ACTS[act];
      if (fn) fn(el);
    });
  });
}

var lastRenderedScreen = null;
var lastRenderedQuizIndex = null;

function render() {
  applyDarkMode();
  // Караоке: страница под плеером в его цвете — тогда верх под часами на iPhone
  // становится матовым и прозрачным, как в кабинете, без серой полосы (17.11).
  document.documentElement.classList.toggle("kp-open", state.screen === "karaoke-play");
  // Экран результата теста — без прокрутки страницы вообще (21.11)
  document.documentElement.classList.toggle("no-scroll", state.screen === "quiz-result" || state.screen === "trainer-done" || state.screen === "step-done" || state.screen === "lesson-master");
  lectureClock();
  stopAllMedia();
  // Прокручиваем наверх только при переходе на другой шаг/вопрос — не при
  // мелких действиях на том же экране (ответ в тесте, метка в песне и
  // т.п.), иначе страница дёргалась вверх при каждом клике.
  var screenChanged = lastRenderedScreen !== state.screen;
  var quizIndexChanged = state.screen === "quiz" && lastRenderedQuizIndex !== state.quizIndex;
  if (screenChanged || quizIndexChanged) window.scrollTo(0, 0);
  lastRenderedScreen = state.screen;
  // Планшет: tablet.css задаёт ширину колонки по открытому экрану
  document.documentElement.setAttribute("data-screen", state.screen || "");
  lastRenderedQuizIndex = state.quizIndex;
  if (tg) {
    if (MAIN_TAB_SCREENS.indexOf(state.screen) !== -1 || state.screen === "tg" || state.screen === "token-entry") tg.BackButton.hide();
    else tg.BackButton.show();
  }
  switch (state.screen) {
    case "token-entry": renderTokenEntry(); break;
    case "tg": renderTokenEntry(); break;
    case "name": renderName(); break;
    case "courses": renderCourses(); break;
    case "favorites": renderFavorites(); break;
    case "profile": case "cab-lessons": case "cab-hw": case "cab-voice": case "cab-wheel": renderProfile(); break;
    case "questions": renderQuestions(); break;
    case "more": renderMore(); break;
    case "doc": renderDoc(); break;
    case "support": renderSupport(); break;
    case "admin-hub": renderAdminHub(); break;
    case "admin-students": renderAdminStudents(); break;
    case "admin-birthdays": renderAdminBirthdays(); break;
    case "admin-dash": if (window.renderAdminDash) renderAdminDash(); break;
    case "admin-guests": if (window.renderAdminGuests) renderAdminGuests(); break;
    case "admin-plans": renderAdminPlans(); break;
    case "admin-screens": renderAdminScreens(); break;
    case "admin-plan": renderAdminPlanDetail(); break;
    case "karaoke": case "karaoke-play": case "admin-karaoke": case "admin-karaoke-songs": case "admin-karaoke-edit": renderKaraokeScreen(); break;
    case "pitch": case "pitch-topic": case "pitch-sing": case "pitch-score": renderPitchScreen(); break;
    case "bylo": renderByloScreen(); break;
    case "trainer": case "trainer-ex": case "trainer-rec": case "trainer-done": if (window.renderTrainerScreen) renderTrainerScreen(); break;
    case "lesson-home": renderLessonHome(); break;
    case "lesson-soon": renderLessonSoon(); break;
    case "blocked": renderBlocked(); break;
    case "lecture": renderLecture(); break;
    case "quiz": renderQuiz(); break;
    case "quiz-result": renderQuizResult(); break;
    case "step-done": renderStepDone(); break;
    case "lesson-master": renderLessonMaster(); break;
    case "warmups": renderWarmups(); break;
    case "song": renderSong(); break;
    case "feedback": renderFeedback(); break;
    default: renderTg();
  }
  renderAdminBanner();
  renderDock();
  segEnhance();
  maybeCelebrate();
  if (window.GUEST_ON) GUEST.afterRender();
}

/* «Режим админа» (20.11, просьба Николая): вместо широкой плашки — маленькая
   круглая кнопка в правом верхнем углу, не закрывает интерфейс. Тап — окошко
   «Ты в кабинете: имя» и «Выйти из режима админа». */
var ADMIN_FAB_ICO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="#fff" stroke-width="2"/></svg>';

function renderAdminBanner() {
  if (!state.adminMode) return;
  var html =
    '<div class="admin-fab">' +
      '<button type="button" class="admin-fab-btn" aria-expanded="false" aria-label="Режим админа: ты в кабинете ' + esc(state.adminStudentName) + '">' + ADMIN_FAB_ICO + "</button>" +
      '<div class="admin-fab-pop" role="dialog" aria-label="Режим админа">' +
        "<span>Ты в кабинете:<b>" + esc(state.adminStudentName) + "</b></span>" +
        '<button type="button" id="admin-exit-btn">Выйти из режима админа</button>' +
      "</div>" +
    "</div>";
  app.insertAdjacentHTML("afterbegin", html);
  // Слушатели — точечно на новые элементы: повторный wireActs() задвоил бы
  // обработчики уже привязанных на экране элементов.
  var fab = app.querySelector(".admin-fab"), fb = fab.querySelector(".admin-fab-btn");
  fb.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = !fab.classList.contains("open");
    fab.classList.toggle("open", open);
    fb.setAttribute("aria-expanded", String(open));
  });
  fab.querySelector(".admin-fab-pop").addEventListener("click", function (e) { e.stopPropagation(); });
  var btn = document.getElementById("admin-exit-btn");
  if (btn) btn.addEventListener("click", exitAdminMode);
}

// тап мимо окошка — закрыть его
document.addEventListener("click", function () {
  var fab = document.querySelector(".admin-fab.open");
  if (fab) { fab.classList.remove("open"); var b = fab.querySelector(".admin-fab-btn"); if (b) b.setAttribute("aria-expanded", "false"); }
});

/* ---------- запуск ---------- */

if (tg) {
  tg.ready();
  tg.expand();
  // Полный экран (Bot API 8.0) — убирает шапку «Закрыть · имя бота».
  // expand() растягивает окно по высоте, но шапку не трогает — нужен именно
  // requestFullscreen. На клиентах старее 8.0 метода нет, поэтому проверяем
  // версию: без проверки там вылетит исключение и инициализация оборвётся.
  // Отступ сверху в .top уже считается от --tg-safe-area-inset-top, поэтому
  // контент не уедет под часы и вырез — см. styles.css.
  try {
    if (tg.isVersionAtLeast && tg.isVersionAtLeast("8.0") &&
        typeof tg.requestFullscreen === "function") {
      tg.requestFullscreen();
    }
  } catch (e) {}
  try {
    var bootLight = false;
    try { bootLight = localStorage.getItem("vocalAppDarkMode") === "0"; } catch (e) {}
    tg.setHeaderColor(bootLight ? "#F1EEE8" : "#232A2E");
    tg.setBackgroundColor(bootLight ? "#F1EEE8" : "#232A2E");
  } catch (e) {}
  tg.BackButton.onClick(handleBack);
}

// 20.11: ждём, пока загрузятся все скрипты страницы (guest.js и др.). Иначе при
// первом открытии (скрипт ещё не в кэше) данные урока приходили раньше guest.js,
// тест-драйв не включался и гость видел экран кода доступа.
var DOM_READY = document.readyState === "complete";
if (!DOM_READY) document.addEventListener("DOMContentLoaded", function () { DOM_READY = true; });
function whenScriptsReady(v) {
  if (DOM_READY) return v;
  return new Promise(function (res) { document.addEventListener("DOMContentLoaded", function () { res(v); }); });
}

fetch("data/lesson-01.json")
  .then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then(whenScriptsReady)
  .then(function (data) {
    LESSON = data;
    LESSON_ONE = data;
    state.quizAnswers = new Array(data.quiz.questions.length).fill(null);
    loadState();
    // Тест-драйв из Instagram (guest.js): гость без кода доступа
    var guestOn = !!(window.GUEST && GUEST.boot());
    if (!guestOn) autoMergeOwnCards();
    if (!guestOn && window.GUEST) GUEST.adminPing();
    if (LINK_TOKEN && !state.isAdmin && !guestOn) {
      if (state.accessToken !== LINK_TOKEN) {
        state.accessToken = LINK_TOKEN;
        state.firstName = ""; state.lastName = "";
      }
      if (state.screen === "token-entry" || state.screen === "tg") state.screen = "courses";
      saveState();
    }
    loadDarkMode();
    // Данные из baza-dannih не кэшируются между сессиями — загружаем заново
    state.studentPublicData = null;
    // подставляем Telegram-username, если открыто внутри Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && !guestOn) {
      var u = tg.initDataUnsafe.user;
      state.chatId = u.id || state.chatId;
      if (!state.tgId) state.tgId = u.username ? "@" + u.username : String(u.id || "");
    }
    render();
  })
  .catch(function () {
    app.innerHTML = '<div style="padding:40px 24px;text-align:center;color:oklch(60% 0.13 38);font-weight:600;">Не удалось загрузить данные урока.<br>Проверь соединение и открой заново.</div>';
  });
