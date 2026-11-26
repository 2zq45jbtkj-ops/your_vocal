/* Тест-драйв для гостей из Instagram (20.11, просьба Николая).

   Как включается: ссылка https://t.me/your_vocal_teacher_bot?startapp=testdrive
   (главное мини-приложение бота, start_param = "testdrive") или кнопка
   «Посмотреть приложение» в боте (?td=1). Кода доступа не нужно, срока нет.
   С 20.11 тест-драйв открывается и у всех, кто открыл приложение в Telegram
   без кода (кнопка «Меню»): см. G.boot.

   Что видит гость:
   — кабинет и караоке «как у Николая» (его карточка «Nikolai Sept (тест)»,
     данные отдаёт api/guest.js?action=demo; имя в шапке — имя гостя);
   — из уроков открыт только «Дыхание»: лекция, тест показан пройденным
     (10 из 10), распевки урока со звуком, упражнение с песней;
   — «Распевки с проверкой»: открыта только первая тема (замки — pitch.js);
   — отправить ДЗ, добавить трек, отметить задание нельзя;
   — трекер «что ещё не посмотрел» (точки на разделах + список), а когда
     всё посмотрено — раз в минуту окно «Записаться на пробный урок».

   Всё, что гость делает, пишется в «Тестовые клиенты» (Ещё → Режим админа):
   экраны, время на каждом, нажатия. Состояние гостя в общий localStorage
   приложения не попадает (saveState молчит), поэтому Николай может
   открыть тест-драйв на своём телефоне и его вход не пострадает. */

(function () {
  var GUEST_TOKEN = "00000000-0000-4000-8000-0000guest000";
  var LS_KEY = "vocal-guest";
  var OWNER_KEY = "vocal-owner";
  var API = "/api/guest";
  var TRIAL_URL = "https://t.me/your_vocal_teacher_bot?start=trial";

  var SECTIONS = [
    { id: "karaoke", label: "Караоке", sub: "Пой свои песни под минус с текстом", go: function () { go("karaoke"); } },
    { id: "karset", label: "Настройки караоке", sub: "Тональность, темп и фон — открой песню и нажми «Настройки»", go: function () { go("karaoke"); } },
    { id: "lessons", label: "Уроки", sub: "Открой урок «Дыхание»", go: function () { openLessonByNumber(1); } },
    { id: "lecture", label: "Лекция", sub: "Как устроено дыхание певца", go: function () { LESSON = LESSON_ONE; go("lecture"); } },
    { id: "warmups", label: "Распевки урока", sub: "Упражнения к теме «Дыхание»", go: function () { LESSON = LESSON_ONE; go("warmups"); } },
    { id: "pitch", label: "Распевки с проверкой", sub: "Поёшь — телефон слушает, попадаешь ли в ноты", go: function () { go("pitch"); } },
    { id: "progress", label: "Прогресс", sub: "Колесо баланса: как растёт голос", go: function () { state._wheelZone = null; go("cab-wheel"); } }
  ];

  // экраны → понятные названия для «Тестовых клиентов»
  var SCREEN_NAMES = {
    "courses": "Уроки", "lesson-home": "Урок «Дыхание»", "lesson-soon": "Закрытый урок", "lecture": "Лекция",
    "quiz": "Тест", "quiz-result": "Тест (пройден)", "warmups": "Распевки урока", "song": "Упражнение с песней",
    "feedback": "Отзыв об уроке", "favorites": "Избранное", "profile": "Кабинет", "cab-lessons": "Мои занятия",
    "cab-hw": "Домашние задания", "cab-voice": "Голосовой профиль", "cab-wheel": "Прогресс (колесо баланса)",
    "karaoke": "Караоке: мои треки", "karaoke-play": "Караоке: песня", "pitch": "Распевки с проверкой",
    "pitch-topic": "Распевки с проверкой: тема", "pitch-sing": "Распевки с проверкой: пою", "pitch-score": "Распевки с проверкой: результат",
    "bylo": "Было и стало", "more": "Ещё", "doc": "Документы", "support": "Поддержка", "questions": "Запись"
  };

  var G = {
    on: false,
    store: { anon: "", explored: [], popupAt: 0, welcomed: false },
    demoP: null,
    queue: [],
    cur: null,          // { screen, label, since }
    hidden: false,
    popupOpen: false,
    allDone: false
  };
  G.trkShown = {};
  window.GUEST = G;
  window.GUEST_ON = false;
  // 26.11: ?td=1&replay=1 — приложение внутри «Пути гостя» у Николая: тест-драйв без записи
  // статистики и без всплывающих окон; экран переключает родитель (postMessage).
  try { G.replay = new URLSearchParams(location.search).get("replay") === "1" && window.parent !== window; } catch (e) { G.replay = false; }
  // 26.11: ?td=1&peek=1 — «Пробный режим» у Николая (Ещё → Пробный режим): приложение глазами
  // нового клиента, с окнами тест-драйва как в первый раз, но без записи в «Путь гостя»
  // и без отправки записи на урок.
  // ptop=1 — тот же режим, но на весь экран без окна-рамки (значок «ДЗ» на экране «Домой»):
  // так iOS размывает содержимое под часами, как в основном приложении, без сплошной полосы.
  try { var pq = new URLSearchParams(location.search); G.peekTop = pq.get("peek") === "1" && pq.get("ptop") === "1"; G.peek = pq.get("peek") === "1" && (window.parent !== window || G.peekTop); } catch (e) { G.peek = false; G.peekTop = false; }
  G.quiet = G.replay || G.peek;

  var realFetch = window.fetch.bind(window);

  function loadStore() {
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (s && typeof s === "object") G.store = Object.assign(G.store, s); } catch (e) {}
    if (!G.store.anon) G.store.anon = "a" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    if (!Array.isArray(G.store.explored)) G.store.explored = [];
  }
  function saveStore() { if (G.quiet) return; try { localStorage.setItem(LS_KEY, JSON.stringify(G.store)); } catch (e) {} }

  function startParam() {
    var sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (sp) return String(sp);
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("td") === "1") return "testdrive";
      var x = q.get("startapp") || q.get("tgWebAppStartParam");
      if (x) return x;
      var h = /tgWebAppStartParam=([^&]+)/.exec(location.hash);
      if (h) return decodeURIComponent(h[1]);
    } catch (e) {}
    return "";
  }

  /* Вызывается из app.js сразу после loadState(). true — включили гостя. */
  G.boot = function () {
    var src = startParam();
    if (src !== "testdrive") {
      // 20.11 (Николай): кто открыл приложение в Telegram без кода (кнопка «Меню»,
      // профиль бота), сразу видит тест-драйв, а не экран кода. Ученики входят по
      // личной ссылке из бота (?k=), у Николая сохранён ключ админа.
      // То же в обычном браузере (ссылка на сайт открылась во встроенном
      // браузере Telegram, Safari и т. п.). Экран входа по коду и паролю
      // остаётся по адресу /?login=1.
      try { if (new URLSearchParams(location.search).get("login") === "1") return false; } catch (e) {}
      if (typeof LINK_TOKEN !== "undefined" && LINK_TOKEN) return false;
      if (state.accessToken || state.isAdmin) return false;
      if (typeof readAdminKey === "function" && readAdminKey()) return false;
      // метка «это Николай» (стояла 20.11 полчаса) уводила на экран пароля — убираем её
      try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
      src = "menu";
      G.auto = true;
    }
    // настоящий ученик с кодом доступа открыл ссылку — просто его приложение
    if (state.accessToken && !state.isAdmin && state.accessToken !== GUEST_TOKEN) return false;
    if (G.replay) G.store = { anon: "replay", explored: [], popupAt: 9e15, welcomed: true };
    else if (G.peek) G.store = { anon: "peek", explored: [], popupAt: 0, welcomed: false };
    else loadStore();
    G.on = true; window.GUEST_ON = true;
    document.documentElement.classList.add("guest-mode");
    if (G.peek) document.documentElement.classList.add("peek-mode");
    if (G.peekTop) peekTopFab();
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    // чистое состояние гостя, только в памяти
    state.isAdmin = false; state._siteAuth = ""; state.adminMode = false;
    state.accessToken = GUEST_TOKEN;
    state.firstName = (u && u.first_name) || "Гость"; state.lastName = (u && u.last_name) || "";
    state.chatId = null; state.tgId = u && u.username ? "@" + u.username : "";
    state.studentPublicData = null;
    state.unlockedLessons = []; state.progressByLesson = {};
    state.quizIndex = 0; state.quizDone = true; state.quizScore = LESSON_ONE.quiz.questions.length;
    state.quizAnswers = LESSON_ONE.quiz.questions.map(function (q) { return q.correct != null ? q.correct : null; });
    state.lectureViewed = false; state.warmupsDone = false; state.songDone = false; state.celebrated = true;
    state.warmupFiles = []; state.songFiles = []; state.favorites = [];
    state._hwReminderShown = true;
    state.screen = "profile";
    installFetch();
    installActs();
    // экран кода доступа гостю не показываем никогда: вместо него кабинет
    var appGo = window.go;
    window.go = function (screen) { return appGo(screen === "token-entry" || screen === "tg" ? "profile" : screen); };
    G.allDone = SECTIONS.every(function (s) { return G.store.explored.indexOf(s.id) !== -1; });
    post("hello", { src: src });
    log({ kind: "open", label: "Открыл тест-драйв" });
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", function () { closeScreen(); flush(true); });
    setInterval(function () { flush(false); }, 8000);
    setInterval(maybePopup, 5000);
    return true;
  };

  /* ---------- данные: всё, что приложение просит с токеном гостя ---------- */

  function demo() {
    if (!G.demoP) {
      G.demoP = realFetch(API + "?action=demo").then(function (r) { return r.json(); }).catch(function () { return null; })
        .then(function (d) {
          if (!d || !d.ok || !d.student || typeof d.student !== "object") d = { student: { student: { name: "", status: "active" }, unlockedLessons: [], progressByLesson: {} }, songs: [], karaoke: { ok: true, marks: {}, meta: {}, covers: {} } };
          var nm = ((state.firstName || "") + " " + (state.lastName || "")).trim() || "Гость";
          d.student.student = { name: nm, status: "active" };
          d.student.unlockedLessons = []; d.student.progressByLesson = {};
          return d;
        });
      // a failed promise must not stay cached: every later request would fail instantly
      G.demoP.catch(function () { G.demoP = null; });
    }
    return G.demoP;
  }
  function resp(obj, status) {
    return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } }));
  }
  function installFetch() {
    window.fetch = function (input, init) {
      if (!G.on) return realFetch(input, init);
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var abs;
      try { abs = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
      if (abs.origin === "https://baza-dannih.vercel.app") {
        var p = abs.pathname;
        if (p === "/api/student-public" && method === "GET") return demo().then(function (d) { return resp(d.student); });
        if (p === "/api/player-tracks" && abs.searchParams.get("action") === "auth") return resp({ session: "guest" });
        if (p === "/api/player-tracks" && method === "GET" && !abs.search) return demo().then(function (d) { return resp({ songs: d.songs }); });
        return resp({ ok: false, guest: true, error: "Тест-драйв" }, 403);
      }
      if (abs.origin === location.origin && abs.pathname.indexOf("/api/") === 0) {
        var ap = abs.pathname;
        if (ap === "/api/karaoke" && method === "GET" && !abs.search) return demo().then(function (d) { return resp(d.karaoke); });
        if (method === "GET" && (ap === "/api/karaoke-cover" || ap === "/api/version")) return realFetch(input, init);
        if (ap === API) return realFetch(input, init);
        // запись на пробный — настоящее свободное время Николая (без этого гость получал отказ)
        if (ap === "/api/bot" && abs.searchParams.get("path") === "app_book") {
          if (!G.peek) return realFetch(input, init);
          // 26.11 (Коля): оплата пробного — в приложении. Здесь показываем тот же экран оплаты,
          // но ничего не записываем и чек не отправляем.
          if (method !== "GET") {
            var pb = {}; try { pb = JSON.parse((init && init.body) || "{}"); } catch (e) {}
            if (pb.action === "receipt") return resp({ ok: false, e: "Это пробный режим: чек не отправляется. Новый клиент на этом шаге прикрепляет чек, и он уходит тебе в бот." });
            return resp({ ok: true, kind: "trial", peekPending: { id: 0, day: pb.day, start: pb.start, status: "pending_payment",
              deadline: new Date(Date.now() + 3600e3).toISOString(),
              pay: { amount: "1 500 ₽", phone: "+7 904 474 87 13", bank: "Сбербанк", to: "Николай С.", note: "Эту сумму я вычту из абонемента, если оформить его в течение 3 дней после урока." } } });
          }
          var P = window.parent, ph = { "x-site-auth": (P.state && P.state._siteAuth) || "", "x-tg-init-data": (P.Telegram && P.Telegram.WebApp && P.Telegram.WebApp.initData) || "" };
          return realFetch("/api/bot?path=app_book&peek=1", { headers: ph });
        }
        return resp({ ok: false, guest: true, error: "Тест-драйв" }, 403);
      }
      return realFetch(input, init);
    };
  }

  /* ---------- что в тест-драйве по-другому ---------- */

  function installActs() {
    // тест урока: сразу результат «Тест пройден, 10 из 10»
    ACTS["go-quiz"] = function () { go("quiz-result"); };
    ACTS["cab-renew"] = function () { G.showTrial("renew"); };
    ACTS["cab-bylo"] = function () { G.toast("«Было и стало» появится после первых занятий: здесь будут твои записи до и после."); };
    ACTS["finish-warmups"] = function () { go("song"); };
    ACTS["finish-lesson"] = function () { G.toast("В тест-драйве задания не отправляются. На занятиях Николай слушает каждую запись."); };
    // распевки урока звучат и у гостя (Коля, 20.11: «открой гостям распевки»)
    var origHw = window.toggleHwDone;
    if (origHw) window.toggleHwDone = function (i) {
      if (G.on) { G.toast("Это пример заданий. Свои задания появятся после первого урока."); return; }
      return origHw(i);
    };
    // «Домашние задания» у гостя: открыто только то, что про «Дыхание»,
    // остальные задания закрыты замком (Коля, 20.11: «открыть доступ только к теме дыхания»)
    var origCabHw = window.renderCabHw;
    if (origCabHw) window.renderCabHw = function (data, homework) {
      if (!G.on) return origCabHw(data, homework);
      var open = [], shut = [];
      (homework || []).forEach(function (hw) { (/дыхан/i.test(String((hw && hw.title) || "")) ? open : shut).push(hw); });
      var html = origCabHw(data, open);
      if (!shut.length) return html;
      var rows = shut.map(function (hw) {
        return '<div class="cab-hw gd-hw-shut"><div class="gd-hw-lock">' + LOCK_ICO + '</div>' +
          '<div style="flex:1;min-width:0;"><div class="hw-title cab-hw-title">' + esc(hw.title || "") + '</div>' +
          '<div class="cab-hw-due">Закрыто в тест-драйве</div></div></div>';
      }).join("");
      var block = '<div class="cab-hw-sub">Закрыто в тест-драйве</div>' +
        G.blockHtml("В тест-драйве открыта только тема «Дыхание». Остальные задания откроются после записи на занятия.") +
        '<div class="cab-hw-list">' + rows + '</div>' +
        '<button type="button" class="cta terra gd-cta" data-gd-trial="hw" style="margin-top:14px;">Записаться на пробный урок</button>';
      var k = html.lastIndexOf("</div>");
      return html.slice(0, k) + block + html.slice(k);
    };
    // уроки кроме «Дыхания» гостю закрыты по любому входу (плитка, дорожная карта, «следующий урок»)
    var lockMsg = "В тест-драйве открыт только урок «Дыхание». Остальные откроются после записи на занятия.";
    var origOpenNum = window.openLessonByNumber;
    if (origOpenNum) window.openLessonByNumber = function (n) {
      if (G.on && n !== 1) { G.toast(lockMsg); return; }
      return origOpenNum(n);
    };
    var origSwitch = window.switchToLesson;
    if (origSwitch) window.switchToLesson = function (n, plan) {
      if (G.on && n !== 1) { G.toast(lockMsg); return; }
      return origSwitch(n, plan);
    };
    var origSupport = window.renderSupport;
    window.renderSupport = function () {
      if (!G.on) return origSupport();
      app.innerHTML = '<div style="padding:var(--screen-top) 20px 130px;">' + backBtn("back") +
        '<div class="cab-screen-title">Поддержка</div>' +
        '<div class="instruction-note" style="margin-bottom:16px;">Написать Николаю можно в боте — там же запись на пробный урок.</div>' +
        '<button class="cta terra" data-gd-trial="support">Записаться на пробный урок</button></div>';
      wireActs(); wireTrial(app);
    };
  }

  G.blockHtml = function (text) {
    return '<div class="gd-lock"><div class="gd-lock-ic">' + LOCK_ICO + "</div><div>" + esc(text) + "</div></div>";
  };
  var LOCK_ICO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  /* ---------- после каждой отрисовки ---------- */

  G.afterRender = function () {
    if (!G.on) return;
    var sc = state.screen;
    // время на экране
    var label = SCREEN_NAMES[sc] || sc;
    if (sc === "karaoke-play" && window.KAR && KAR.song) label += ": " + (KAR.song.title || "");
    if (!G.cur || G.cur.screen !== sc || G.cur.label !== label) {
      closeScreen();
      G.cur = { screen: sc, label: label, since: Date.now() };
    }
    // что посмотрено
    if (sc === "karaoke-play") mark("karaoke");
    if (sc === "lesson-home") mark("lessons");
    if (sc === "lecture") mark("lecture");
    if (sc === "warmups") mark("warmups");
    if (sc === "pitch-topic" || sc === "pitch-sing") mark("pitch");
    if (sc === "cab-wheel") mark("progress");
    if (sc === "warmups" || sc === "song") lockUploads();
    if (sc === "cab-hw") {
      var hb = app.querySelector('[data-gd-trial="hw"]');
      if (hb && !hb.getAttribute("data-gd-w")) { hb.setAttribute("data-gd-w", "1"); hb.addEventListener("click", function (e) { e.stopPropagation(); goTrial("hw"); }); }
    }
    // «Пополнить уроки» у гостя — запись на пробный
    Array.prototype.forEach.call(app.querySelectorAll('[data-act="cab-renew"]'), function (b) {
      if (b.children.length === 0) b.textContent = b.classList.contains("cab-cta-sm") ? "На пробный" : "Записаться на пробный урок";
    });
    paintDots();
    paintChip();
    // окно тест-драйва «что посмотреть»: при первом входе в Кабинет и в «Домашние задания»
    // за каждое открытие приложения, пока не посмотрены все 7 разделов (Коля, 20.11)
    if (!G.replay && (sc === "profile" || sc === "cab-hw") && !G.allDone && !G.trkShown[sc] && !document.querySelector(".gd-sheet")) {
      G.trkShown[sc] = true;
      var first = !G.store.welcomed;
      if (first) { G.store.welcomed = true; saveStore(); }
      setTimeout(G.openTracker, 400, first);
    }
  };

  function lockUploads() {
    ["#hw-zone", "#song-hw-zone"].forEach(function (sel) {
      var z = app.querySelector(sel);
      if (z && !z.getAttribute("data-gd")) {
        z.setAttribute("data-gd", "1");
        z.innerHTML = G.blockHtml("Отправить запись Николаю можно после записи на занятия. В тест-драйве это закрыто.");
      }
    });
  }

  function mark(id) {
    if (G.store.explored.indexOf(id) !== -1) return;
    G.store.explored.push(id); saveStore();
    var sec = SECTIONS.filter(function (s) { return s.id === id; })[0];
    log({ kind: "explored", label: sec ? sec.label : id });
    if (!G.allDone && SECTIONS.every(function (s) { return G.store.explored.indexOf(s.id) !== -1; })) {
      G.allDone = true;
      G.store.popupAt = Date.now() - 50000; saveStore(); // первое окно — через ~10 секунд
    }
    paintChip();
  }
  function seen(id) { return G.store.explored.indexOf(id) !== -1; }

  // точки «ещё не смотрел» на входах в разделы
  var DOTS = {
    karaoke: ['[data-act="cab-karaoke"]'],
    karset: ['[data-kp="settings"]'],
    lessons: ['[data-act="open-lesson"]', '[data-lesson-num="1"]'],
    lecture: ['[data-act="go-lecture"]'],
    warmups: ['[data-act="go-warmups"]'],
    pitch: ['[data-act="cab-pitch"]'],
    progress: ['[data-act="cab-wheel"]']
  };
  function paintDots() {
    Array.prototype.forEach.call(document.querySelectorAll(".gd-dot"), function (el) { el.classList.remove("gd-dot"); });
    var cab = false, les = false;
    SECTIONS.forEach(function (s) {
      if (seen(s.id)) return;
      if (s.id === "karaoke" || s.id === "karset" || s.id === "pitch" || s.id === "progress") cab = true; else les = true;
      (DOTS[s.id] || []).forEach(function (sel) { Array.prototype.forEach.call(document.querySelectorAll(sel), dot); });
    });
    // на доке точка — только где нет своего бейджа с числом
    var dockDot = function (el) { if (!el.querySelector(".dock-badge")) dot(el); };
    if (cab && state.screen !== "profile") Array.prototype.forEach.call(document.querySelectorAll('.dock [data-act="go-profile"]'), dockDot);
    if (les && state.screen !== "courses") Array.prototype.forEach.call(document.querySelectorAll('.dock [data-act="go-courses"]'), dockDot);
  }
  function dot(el) {
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.classList.add("gd-dot");
  }

  /* ---------- значок «Тест-драйв 3/7» и список ---------- */

  function paintChip() {
    var old = document.querySelector(".gd-chip");
    var hide = ["karaoke-play", "pitch-sing"].indexOf(state.screen) !== -1;
    if (hide) { if (old) old.remove(); return; }
    var n = SECTIONS.filter(function (s) { return seen(s.id); }).length;
    var html = '<span class="gd-chip-t">Тест-драйв</span><span class="gd-chip-n">' + n + "/" + SECTIONS.length + "</span>";
    if (!old) {
      old = document.createElement("button");
      old.type = "button"; old.className = "gd-chip";
      old.addEventListener("click", function (e) { e.stopPropagation(); G.openTracker(false); });
      document.body.appendChild(old);
    }
    old.innerHTML = html;
    old.classList.toggle("done", n === SECTIONS.length);
    old.setAttribute("aria-label", "Тест-драйв: посмотрено " + n + " из " + SECTIONS.length);
  }

  G.openTracker = function (first) {
    closeSheets();
    var n = SECTIONS.filter(function (s) { return seen(s.id); }).length;
    var rows = SECTIONS.map(function (s) {
      var ok = seen(s.id);
      return '<button type="button" class="gd-row' + (ok ? " ok" : "") + '" data-gd-go="' + s.id + '">' +
        '<span class="gd-row-m">' + (ok ? "✓" : "") + "</span>" +
        '<span class="gd-row-t"><b>' + esc(s.label) + "</b><span>" + esc(s.sub) + "</span></span>" +
        '<span class="gd-row-c">›</span></button>';
    }).join("");
    var intro = first
      ? "Приложение, в котором ученики Николая делают домашние задания. Загляни в каждый раздел — непросмотренные отмечены оранжевой точкой."
      : (n === SECTIONS.length ? "Ты посмотрел все разделы. Следующий шаг — живой урок." : "Осталось посмотреть: " + (SECTIONS.length - n) + ". Нажми на раздел, чтобы перейти.");
    var ov = sheet(
      '<div class="gd-head"><div class="gd-title">Тест-драйв</div><div class="gd-count">' + n + " из " + SECTIONS.length + "</div></div>" +
      '<div class="gd-prog"><i style="width:' + Math.round(n * 100 / SECTIONS.length) + '%"></i></div>' +
      '<div class="gd-sub gd-sub-l">' + esc(intro) + "</div>" +
      '<div class="gd-rows">' + rows + "</div>" +
      '<button type="button" class="cta terra gd-cta" data-gd-trial="tracker">Записаться на пробный урок</button>' +
      '<button type="button" class="gd-later" data-gd-close>' + (first ? "Начать" : "Закрыть") + "</button>"
    );
    Array.prototype.forEach.call(ov.querySelectorAll("[data-gd-go]"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-gd-go");
        var s = SECTIONS.filter(function (x) { return x.id === id; })[0];
        closeSheets();
        if (s) s.go();
      });
    });
    log({ kind: "popup", label: first ? "Окно «Тест-драйв» при входе" : "Открыл список разделов" });
  };

  /* ---------- «Записаться на пробный урок» ---------- */

  function maybePopup() {
    if (!G.on || !G.allDone || G.popupOpen || G.hidden) return;
    if (document.querySelector(".gd-ov")) return;
    // не перебиваем, пока человек поёт
    if (["karaoke-play", "pitch-sing"].indexOf(state.screen) !== -1) return;
    if (G.store.applied) return; // заявка уже отправлена — больше не зовём
    if (Date.now() - (G.store.popupAt || 0) < 60000) return;
    G.showTrial("auto");
  }

  G.showTrial = function (why) {
    closeSheets();
    G.popupOpen = true;
    var ov = sheet(
      '<div class="gd-badge">🎤</div>' +
      '<div class="gd-title">Запишись на пробный урок</div>' +
      '<div class="gd-sub">За 45 минут Николай послушает твой голос, даст подробный разбор и составит план занятий. Дальше — уроки и это приложение с твоими песнями и заданиями.</div>' +
      '<button type="button" class="cta terra gd-cta" data-gd-trial="' + esc(why || "popup") + '">Записаться на пробный урок</button>' +
      '<button type="button" class="gd-later" data-gd-close>Позже</button>',
      function () { G.popupOpen = false; G.store.popupAt = Date.now(); saveStore(); }
    );
    log({ kind: "popup", label: why === "auto" ? "Окно «Записаться на пробный» (само)" : "Окно «Записаться на пробный»" });
    return ov;
  };

  function wireTrial(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-gd-trial]"), function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); goTrial(b.getAttribute("data-gd-trial")); });
    });
  }
  function goTrial(from) {
    log({ kind: "trial", label: "Нажал «Записаться на пробный урок»" });
    closeScreen(); flush(true);
    post("trial", {});
    // 26.11: запись на пробный — сразу в приложении, со свободным временем Николая.
    if (window.openBooking) { G.store.applied = Date.now(); saveStore(); closeSheets(); window.openBooking(); return; }
    G.store.popupAt = Date.now(); saveStore();
    G.store.applied = Date.now(); saveStore();
    closeSheets();
    G.popupOpen = true;
    sheet(
      '<div class="gd-badge">✅</div>' +
      '<div class="gd-title">Заявка отправлена</div>' +
      '<div class="gd-sub">Ваша заявка отправлена Николаю. В ближайшее время он свяжется с вами в Telegram.</div>' +
      '<button type="button" class="cta terra gd-cta" data-gd-close>Понятно</button>',
      function () { G.popupOpen = false; G.store.popupAt = Date.now(); saveStore(); }
    );
    log({ kind: "popup", label: "Окно «Заявка отправлена»" });
  }

  /* ---------- шторка и подсказка ---------- */

  function sheet(inner, onClose) {
    var ov = document.createElement("div");
    ov.className = "gd-ov";
    // 26.11 (Коля): полоска сверху — шторку можно смахнуть вниз, как все шторки приложения
    ov.innerHTML = '<div class="gd-sheet" role="dialog" aria-modal="true"><div class="gd-grip"></div>' + inner + "</div>";
    document.body.appendChild(ov);
    ov._onClose = onClose;
    requestAnimationFrame(function () { ov.classList.add("on"); });
    if (window.wireSheetSwipe) window.wireSheetSwipe(ov.querySelector(".gd-sheet"), closeSheets, ov);
    statusBar(true);
    ov.addEventListener("click", function (e) { if (e.target === ov) closeSheets(); });
    Array.prototype.forEach.call(ov.querySelectorAll("[data-gd-close]"), function (b) { b.addEventListener("click", closeSheets); });
    wireTrial(ov);
    return ov;
  }
  function closeSheets() {
    var had = false;
    Array.prototype.forEach.call(document.querySelectorAll(".gd-ov"), function (ov) {
      had = true;
      if (ov._onClose) { try { ov._onClose(); } catch (e) {} }
      ov.remove();
    });
    if (had) statusBar(false);
    // 27.11: в «Пути гостя» окно должно исчезать ровно тогда, когда гость его закрыл
    if (had) log({ kind: "close", label: "Закрыл окно" });
  }
  // Полоса под часами (значок на экране «Домой» — её красит theme-color) затемняется вместе
  // со шторкой; в «Пробном режиме» она принадлежит родителю — красим и его.
  function statusBar(dim) {
    var dark = !!(window.state && state.darkMode);
    var col = dim ? (dark ? "#1C1F20" : "#8E8B86") : (dark ? "#232A2E" : "#F1EEE8");
    var docs = [document];
    try { if (window.__peekFrame && window.parent && window.parent.document) docs.push(window.parent.document); } catch (e) {}
    docs.forEach(function (d) {
      try {
        var m = d.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", col);
        var pw = d.getElementById("peek-wrap"); if (pw) pw.style.background = col;
        if (d !== document) { d.documentElement.style.backgroundColor = col; if (d.body) d.body.style.backgroundColor = col; }
      } catch (e) {}
    });
  }
  // Кнопка «Т» (выйти из пробного режима) — когда пробный режим открыт на весь экран
  function peekTopFab() {
    if (document.getElementById("peek-top-fab")) return;
    var ico = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14M12 5v15" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
    var f = document.createElement("div");
    f.id = "peek-top-fab"; f.className = "admin-fab"; f.style.zIndex = "9999";
    f.innerHTML = '<button type="button" class="admin-fab-btn" aria-label="Пробный режим">' + ico + '</button>' +
      '<div class="admin-fab-pop" role="dialog" aria-label="Пробный режим">' +
      '<span>Пробный режим:<b>так видит новый клиент</b></span>' +
      '<button type="button" data-peek-exit>Выйти из пробного режима</button></div>';
    document.body.appendChild(f);
    f.querySelector(".admin-fab-btn").addEventListener("click", function (e) { e.stopPropagation(); f.classList.toggle("open"); });
    f.querySelector(".admin-fab-pop").addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { f.classList.remove("open"); });
    f.querySelector("[data-peek-exit]").addEventListener("click", function () {
      var back = "/";
      try { back = sessionStorage.getItem("peekBack") || localStorage.getItem("peekBack") || "/"; } catch (e) {}
      location.replace(back);
    });
  }
  G.toast = function (text) {
    var old = document.querySelector(".gd-toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "gd-toast"; t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("on"); });
    setTimeout(function () { t.classList.remove("on"); setTimeout(function () { t.remove(); }, 300); }, 3200);
    log({ kind: "tap", label: "Подсказка: " + text.slice(0, 60) });
  };

  /* ---------- журнал для «Тестовых клиентов» ---------- */

  function log(e) {
    if (G.quiet) return;
    e.ts = Date.now();
    e.screen = G.cur ? G.cur.label : (SCREEN_NAMES[state.screen] || state.screen || "");
    G.queue.push(e);
    if (G.queue.length > 60) flush(false);
  }
  function closeScreen() {
    if (!G.cur || G.hidden) return;
    var dur = Date.now() - G.cur.since;
    if (dur >= 500) G.queue.push({ kind: "screen", ts: G.cur.since, screen: G.cur.label, label: G.cur.label, dur: dur });
    G.cur.since = Date.now();
  }
  function onVis() {
    if (document.visibilityState === "hidden") { closeScreen(); G.hidden = true; flush(true); }
    else { G.hidden = false; if (G.cur) G.cur.since = Date.now(); }
  }
  function onClickCapture(e) {
    if (!G.on) return;
    var el = e.target && e.target.closest ? e.target.closest("[data-act],[data-kp],[data-gd-go],[data-gd-trial],button,a,[role=button],.trk-card,.cab-row") : null;
    if (!el) return;
    if (el.closest(".gd-chip")) return;
    if (el.matches('[data-kp="settings"]') || el.closest('[data-kp="settings"]')) mark("karset");
    var lb = el.getAttribute("aria-label") || (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!lb) lb = el.getAttribute("data-act") || el.getAttribute("data-kp") || "кнопка";
    var vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    log({ kind: "tap", label: lb.slice(0, 80), screen: G.cur ? G.cur.label : "",
          x: Math.round(Math.max(0, Math.min(1, e.clientX / vw)) * 1000) / 1000,
          y: Math.round(Math.max(0, Math.min(1, e.clientY / vh)) * 1000) / 1000 });
  }
  function payload(extra) {
    var b = { initData: tg ? tg.initData : "", anon: G.store.anon };
    for (var k in extra) b[k] = extra[k];
    return b;
  }
  function post(action, extra) {
    if (G.quiet) return Promise.resolve(new Response("{}"));
    return realFetch(API + "?action=" + action, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(extra || {})), keepalive: true
    }).catch(function () {});
  }
  function flush(beacon) {
    if (G.quiet) { G.queue = []; return; }
    if (!G.queue.length) return;
    var evs = G.queue.splice(0, 80);
    var body = JSON.stringify(payload({ events: evs, explored: G.store.explored }));
    if (beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(API + "?action=ev", new Blob([body], { type: "application/json" }))) return; } catch (e) {}
    }
    realFetch(API + "?action=ev", { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true })
      .catch(function () { G.queue = evs.concat(G.queue).slice(0, 200); });
  }

  /* ---------- Николай: свою карточку отдаём как образец ---------- */

  G.adminPing = function () {
    if (G.on) return;
    var key = typeof readAdminKey === "function" ? readAdminKey() : null;
    if (!key) return;
    var last = 0;
    try { last = Number(localStorage.getItem("vocal-guest-demo-set") || 0); } catch (e) {}
    if (Date.now() - last < 6 * 3600 * 1000) return;
    realFetch(API + "?action=demo-set", { method: "POST", headers: { "X-Site-Auth": key } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) { try { localStorage.setItem("vocal-guest-demo-set", String(Date.now())); } catch (e) {} } })
      .catch(function () {});
  };

  /* ---------- «Тестовые клиенты» (Ещё → Режим админа) ---------- */

  var AG = { list: null, err: false, open: null, events: {} };

  function fmtDur(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) return s + " с";
    var m = Math.floor(s / 60); s = s % 60;
    if (m < 60) return m + " мин" + (s ? " " + s + " с" : "");
    return Math.floor(m / 60) + " ч " + (m % 60) + " мин";
  }
  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var p = function (x) { return ("0" + x).slice(-2); };
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + " в " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function fmtClock(iso) {
    var d = new Date(iso);
    var p = function (x) { return ("0" + x).slice(-2); };
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function guestName(u) {
    var n = ((u.first_name || "") + " " + (u.last_name || "")).trim();
    return n || (u.tg_id ? "Без имени" : "Открыл в браузере");
  }
  function userLink(u) {
    if (!u.username) return "";
    return '<a class="gd-user" href="https://t.me/' + esc(u.username) + '" data-gd-tg="' + esc(u.username) + '">@' + esc(u.username) + "</a>";
  }

  function loadList(force) {
    if (AG.loading || (AG.list && !force)) return;
    AG.loading = true; AG.err = false;
    realFetch(API + "?action=list", { headers: bazaAuthHeaders() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { AG.loading = false; AG.list = (d && d.guests) || []; if (state.screen === "admin-guests") render(); })
      .catch(function () { AG.loading = false; AG.err = true; AG.list = AG.list || []; if (state.screen === "admin-guests") render(); });
  }
  function loadEvents(gid) {
    if (AG.events[gid] === "loading") return;
    AG.events[gid] = "loading";
    realFetch(API + "?action=events&gid=" + encodeURIComponent(gid), { headers: bazaAuthHeaders() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { AG.events[gid] = (d && d.events) || []; if (state.screen === "admin-guests") render(); })
      .catch(function () { AG.events[gid] = "err"; if (state.screen === "admin-guests") render(); });
  }

  window.renderAdminGuests = function () {
    var head = '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Тестовые клиенты</div><div class="top-sub">Кто открыл тест-драйв из Instagram</div></div></div>';
    var body;
    if (AG.open) body = guestDetailHtml(AG.open);
    else {
      loadList(false);
      if (!AG.list) body = '<div class="courses-empty">Загружаю…</div>';
      else if (AG.err && !AG.list.length) body = '<div class="courses-empty">Не получилось загрузить список. Проверь интернет и открой экран ещё раз.</div>';
      else if (!AG.list.length) body = '<div class="courses-empty">Пока никто не открывал тест-драйв. Ссылка для Instagram: t.me/your_vocal_teacher_bot?startapp=testdrive</div>';
      else body = AG.list.map(function (u, i) {
        var ex = Array.isArray(u.explored) ? u.explored.length : 0;
        var tags = [];
        if (u.trial_clicks) tags.push('<span class="gd-tag hot">Нажал «Записаться»' + (u.trial_clicks > 1 ? " ×" + u.trial_clicks : "") + "</span>");
        if (u.is_owner) tags.push('<span class="gd-tag">это ты</span>');
        return '<div class="lesson-card gd-guest" data-gd-open="' + i + '">' +
          '<div class="lesson-dot" style="background:oklch(60% 0.13 38);">' + esc(guestName(u)[0] || "?") + "</div>" +
          '<div style="flex:1;min-width:0;">' +
            '<div class="lesson-title">' + esc(guestName(u)) + " " + userLink(u) + "</div>" +
            '<div class="lesson-sub">' + esc(fmtWhen(u.last_at)) + " · разделов " + ex + " из 7 · " + fmtDur(Number(u.total_ms) || 0) + " · нажатий " + (u.taps || 0) + (u.visits > 1 ? " · заходов " + u.visits : "") + "</div>" +
            (tags.length ? '<div class="gd-tags">' + tags.join("") + "</div>" : "") +
          "</div>" + SVG.chevronRight + "</div>";
      }).join("");
    }
    app.innerHTML = head + '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' + body + "</div>";
    wireActs();
    Array.prototype.forEach.call(app.querySelectorAll("[data-gd-open]"), function (el) {
      el.addEventListener("click", function () { AG.open = AG.list[parseInt(el.getAttribute("data-gd-open"), 10)]; window.scrollTo(0, 0); render(); });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-gd-tg]"), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        var url = "https://t.me/" + a.getAttribute("data-gd-tg");
        if (tg && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank");
      });
    });
  };

  function guestDetailHtml(u) {
    var evs = AG.events[u.id];
    if (evs === undefined) loadEvents(u.id);
    var top = '<div class="gd-card"><div class="gd-dname">' + esc(guestName(u)) + (u.is_owner ? " (это ты)" : "") + "</div>" +
      (u.username ? '<div style="margin-top:4px;">' + userLink(u) + "</div>" : (u.tg_id ? '<div class="lesson-sub">Ника в Telegram нет</div>' : "")) +
      '<div class="lesson-sub" style="margin-top:6px;">Первый заход ' + esc(fmtWhen(u.first_at)) + " · последний " + esc(fmtWhen(u.last_at)) + "</div>" +
      '<div class="lesson-sub">Посмотрел: ' + esc(exploredText(u.explored)) + "</div>" +
      (u.trial_clicks ? '<div class="gd-tags"><span class="gd-tag hot">Нажал «Записаться на пробный» ' + esc(fmtWhen(u.trial_at)) + "</span></div>" : "") +
      "</div>";
    var list;
    if (evs === undefined || evs === "loading") list = '<div class="courses-empty">Загружаю историю…</div>';
    else if (evs === "err") list = '<div class="courses-empty">Не получилось загрузить историю.</div>';
    else if (!evs.length) list = '<div class="courses-empty">Истории пока нет.</div>';
    else list = replayHtml(evs) + '<details class="gd-card" style="padding:10px 16px;"><summary style="cursor:pointer;color:var(--gray);font-size:14px;">Подробный список по секундам</summary>' + timelineHtml(evs).replace('<div class="gd-card gd-tl">', '<div class="gd-tl">') + '</details>';
    setTimeout(wireReplay, 0);
    return top + list;
  }
  /* ---------- 26.11: анимация пути гостя (вместо списка по секундам) ----------
     Мини-телефон: экраны сменяются как у гостя, на месте нажатия вспыхивает точка
     (у старых заходов места нет — точка внизу экрана с подписью кнопки). */
  var RP = { evs: null, i: 0, t: null, speed: 2, playing: false };
  /* 26.11 (Николай): вместо пустого «телефона» — понятная дорожка пути:
     большая карточка текущего экрана (иконка, название, сколько пробыл), под ней нажатия
     на этом экране, внизу лента всех экранов по порядку. */
  function rpIcon(l) {
    l = String(l || "").toLowerCase();
    var map = [["караоке", "🎤"], ["лекци", "📖"], ["распев", "🎹"], ["тест", "✅"], ["прогресс", "📈"], ["колесо", "📈"],
      ["урок", "📘"], ["кабинет", "👤"], ["дыхан", "🌬"], ["тренаж", "🌬"], ["было и стало", "🎧"], ["запис", "🗓"], ["ещё", "⋯"]];
    for (var i = 0; i < map.length; i++) if (l.indexOf(map[i][0]) !== -1) return map[i][1];
    return "📱";
  }
  function rpScreens() {
    var out = [];
    RP.evs.forEach(function (e, i) { if (e.kind === "screen") out.push({ i: i, label: e.label, dur: Number(e.dur_ms) || 0 }); });
    return out;
  }
  function replayHtml(evs) {
    RP.evs = evs.filter(function (e) { return e.kind === "screen" || e.kind === "tap" || e.kind === "trial" || e.kind === "popup" || e.kind === "close"; });
    RP.i = 0; RP.playing = false; if (RP.t) clearTimeout(RP.t);
    var scr = rpScreens();
    var strip = scr.map(function (x, k) {
      return '<span class="rp-st" data-rpi="' + x.i + '" style="flex:none;display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:12px;background:var(--bgmuted);font-size:12px;color:var(--gray);transition:background .25s,color .25s;">' +
        rpIcon(x.label) + ' ' + esc(String(x.label).split(":")[0].slice(0, 18)) + '</span>' + (k < scr.length - 1 ? '<span style="flex:none;color:var(--gray);opacity:.5;">›</span>' : "");
    }).join("");
    var W = 234, S = W / 390, H = Math.round(844 * S);
    return '<div class="gd-card" style="display:flex;flex-direction:column;gap:14px;align-items:stretch;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;"><b style="font-size:15px;">Путь по приложению</b><span id="rp-step" class="lesson-sub">' + scr.length + ' экранов</span></div>' +
      '<div style="align-self:center;position:relative;width:' + (W + 14) + 'px;height:' + (H + 14) + 'px;border-radius:38px;background:#0d0f11;padding:7px;box-shadow:0 10px 30px rgba(0,0,0,.45);">' +
        '<div style="position:relative;width:' + W + 'px;height:' + H + 'px;border-radius:31px;overflow:hidden;background:var(--bg);">' +
          '<iframe id="rp-frame" src="/?td=1&replay=1" tabindex="-1" style="width:390px;height:844px;border:0;transform:scale(' + S + ');transform-origin:0 0;pointer-events:none;"></iframe>' +
          '<div id="rp-dot" style="position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(245,197,66,.55);border:2px solid #F5C542;opacity:0;pointer-events:none;transition:left .35s ease,top .35s ease,opacity .2s;"></div>' +
          '<div id="rp-cap" style="position:absolute;left:10px;right:10px;top:10px;text-align:center;font-size:11px;line-height:1.3;color:#fff;background:rgba(15,17,20,.82);border-radius:10px;padding:6px 8px;opacity:0;transition:opacity .2s;pointer-events:none;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;"><div id="rp-scr" style="font-weight:700;font-size:15px;">Нажми «Смотреть»</div><div id="rp-sub" class="lesson-sub" style="margin-top:2px;">жёлтый круг — куда нажал гость</div></div>' +
      '<div id="rp-strip" style="display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;">' + strip + '</div>' +
      '<div style="height:6px;border-radius:4px;background:var(--bgmuted);overflow:hidden;"><i id="rp-bar" style="display:block;height:100%;width:0;background:var(--blue);transition:width .3s;"></i></div>' +
      '<div style="display:flex;gap:10px;align-items:center;">' +
        '<button class="filter-btn active-terra" data-rp="play" style="flex:1.4;height:46px;">▶ Смотреть</button>' +
        '<div style="flex:1;display:flex;border-radius:14px;box-shadow:var(--inset-sm);padding:3px;height:46px;">' +
          ['1', '2', '4'].map(function (k) { return '<button data-rp="s' + k + '" style="flex:1;border:none;border-radius:11px;font:700 13px Manrope,sans-serif;cursor:pointer;' + (k === "2" ? 'background:var(--blue);color:#fff;' : 'background:transparent;color:var(--gray);') + '">×' + k + '</button>'; }).join("") +
        '</div>' +
      '</div>' +
    '</div>';
  }
  function rpShow(e) {
    var scr = document.getElementById("rp-scr"); if (!scr) { RP.playing = false; return; }
    var sub = document.getElementById("rp-sub"), dot = document.getElementById("rp-dot"), cap = document.getElementById("rp-cap");
    var fr = document.getElementById("rp-frame");
    document.getElementById("rp-bar").style.width = Math.round((RP.i + 1) / RP.evs.length * 100) + "%";
    if (e.kind === "popup" || e.kind === "close") {
      rpSend(e.kind === "popup" ? { rp: "sheet", label: e.label } : { rp: "close" });
      dot.style.opacity = 0;
      cap.textContent = e.kind === "popup" ? "открылось окно: " + String(e.label).replace(/^Окно\s*/, "") : "закрыл окно";
      cap.style.opacity = 1;
      return;
    }
    if (e.kind === "screen") {
      scr.textContent = rpIcon(e.label) + " " + e.label;
      sub.textContent = "заход " + e.visit + " · пробыл " + fmtDur(Number(e.dur_ms) || 0);
      dot.style.opacity = 0; cap.style.opacity = 0;
      rpSend({ rp: "go", screen: rpScreenKey(e.label) });
      var cur = null;
      Array.prototype.forEach.call(document.querySelectorAll(".rp-st"), function (el) {
        var on = +el.getAttribute("data-rpi") === RP.i;
        el.style.background = on ? "var(--blue)" : "var(--bgmuted)"; el.style.color = on ? "#fff" : "var(--gray)";
        if (on) cur = el;
      });
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      var st = document.getElementById("rp-step"); var n = rpScreens().filter(function (x) { return x.i <= RP.i; }).length;
      if (st) st.textContent = "экран " + n + " из " + rpScreens().length;
    } else {
      var has = e.x != null && e.y != null;
      dot.style.left = (has ? e.x * 100 : 50) + "%"; dot.style.top = (has ? e.y * 100 : 85) + "%";
      dot.style.opacity = 1;
      dot.animate([{ transform: "scale(.5)", boxShadow: "0 0 0 0 rgba(245,197,66,.7)" }, { transform: "scale(1)", boxShadow: "0 0 0 16px rgba(245,197,66,0)" }], { duration: 650, easing: "ease-out" });
      cap.textContent = (e.kind === "trial" ? "🔥 " : "нажал «") + e.label + (e.kind === "trial" ? "" : "»") + (has ? "" : " · место не записано");
      cap.style.opacity = 1;
      // у старых заходов закрытие окна не записано — закрываем по нажатию «Закрыть»/«Начать»/«Позже»
      if (/^(Закрыть|Начать|Позже|Понятно)$/.test(String(e.label).trim())) setTimeout(function () { rpSend({ rp: "close" }); }, 450 / RP.speed);
    }
  }
  function rpSend(msg) {
    var fr = document.getElementById("rp-frame");
    try { fr.contentWindow.postMessage(msg, location.origin); } catch (x) {}
  }
  function rpStep() {
    if (!RP.playing || !RP.evs || RP.i >= RP.evs.length) { RP.playing = false; rpBtn(); return; }
    var e = RP.evs[RP.i]; rpShow(e);
    var next = RP.evs[RP.i + 1];
    var gap = next ? Math.min(3500, Math.max(700, new Date(next.ts) - new Date(e.ts))) : 0;
    if (e.kind === "screen") gap = Math.max(gap, Math.min(3500, (Number(e.dur_ms) || 0) * 0.25));
    RP.i++;
    RP.t = setTimeout(rpStep, gap / RP.speed);
  }
  function rpBtn() {
    var b = document.querySelector('[data-rp="play"]'); if (!b) return;
    b.textContent = RP.playing ? "❚❚ Пауза" : (RP.i >= (RP.evs || []).length ? "↻ Сначала" : "▶ Смотреть");
  }
  function wireReplay() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-rp]"), function (b) {
      if (b._rp) return; b._rp = 1;
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var k = b.getAttribute("data-rp");
        if (k === "play") {
          if (RP.playing) { RP.playing = false; clearTimeout(RP.t); }
          else { if (RP.i >= RP.evs.length) RP.i = 0; RP.playing = true; rpStep(); }
          rpBtn(); return;
        }
        RP.speed = +k.slice(1);
        Array.prototype.forEach.call(document.querySelectorAll('[data-rp^="s"]'), function (x) { x.style.background = x === b ? "var(--blue)" : "transparent"; x.style.color = x === b ? "#fff" : "var(--gray)"; });
      });
    });
  }
  function exploredText(ex) {
    if (!Array.isArray(ex) || !ex.length) return "пока ничего";
    return SECTIONS.filter(function (s) { return ex.indexOf(s.id) !== -1; }).map(function (s) { return s.label; }).join(", ");
  }
  function timelineHtml(evs) {
    var out = "", visit = null;
    evs.forEach(function (e) {
      if (e.visit !== visit) {
        visit = e.visit;
        out += '<div class="gd-visit">Заход ' + visit + " · " + esc(fmtWhen(e.ts)) + "</div>";
      }
      var t = fmtClock(e.ts);
      if (e.kind === "screen") out += '<div class="gd-ev scr"><span class="gd-ev-t">' + t + '</span><b>' + esc(e.label) + '</b><span class="gd-ev-d">' + fmtDur(Number(e.dur_ms) || 0) + "</span></div>";
      else if (e.kind === "tap") out += '<div class="gd-ev"><span class="gd-ev-t">' + t + "</span>нажал «" + esc(e.label) + "»</div>";
      else if (e.kind === "explored") out += '<div class="gd-ev ok"><span class="gd-ev-t">' + t + "</span>✓ посмотрел раздел «" + esc(e.label) + "»</div>";
      else if (e.kind === "close") out += '<div class="gd-ev"><span class="gd-ev-t">' + t + "</span>закрыл окно</div>";
      else if (e.kind === "trial") out += '<div class="gd-ev hot"><span class="gd-ev-t">' + t + "</span>" + esc(e.label) + "</div>";
      else out += '<div class="gd-ev"><span class="gd-ev-t">' + t + "</span>" + esc(e.label) + "</div>";
    });
    return '<div class="gd-card gd-tl">' + out + "</div>";
  }
  if (G.replay) {
    window.addEventListener("message", function (ev) {
      if (ev.origin !== location.origin || !ev.data) return;
      var d = ev.data;
      try {
        if (d.rp === "go") { closeSheets(); if (window.go) window.go(d.screen); }
        else if (d.rp === "close") closeSheets();
        else if (d.rp === "sheet") {
          var l = String(d.label || "");
          if (/Тест-драйв|список разделов/.test(l)) G.openTracker(/при входе/.test(l));
          else if (/Заявка отправлена/.test(l)) { closeSheets(); sheet('<div class="gd-badge">✅</div><div class="gd-title">Заявка отправлена</div><div class="gd-sub">Ваша заявка отправлена Николаю. В ближайшее время он свяжется с вами в Telegram.</div><button type="button" class="cta terra gd-cta">Понятно</button>'); }
          else if (/пробный/.test(l)) G.showTrial("replay");
        }
      } catch (e) {}
    });
  }
  function rpScreenKey(label) {
    label = String(label || "");
    var best = "", key = "profile";
    for (var k in SCREEN_NAMES) {
      var n = SCREEN_NAMES[k];
      if (label.indexOf(n) === 0 && n.length > best.length) { best = n; key = k; }
    }
    if (key === "karaoke-play") key = "karaoke";
    if (/^pitch-/.test(key)) key = "pitch";
    return key;
  }
  // «Назад» из истории гостя — к списку
  G.adminBack = function () {
    if (state.screen === "admin-guests" && AG.open) { AG.open = null; render(); return true; }
    return false;
  };
  G.adminOpenList = function () { AG.open = null; AG.list = null; go("admin-guests"); };
})();
