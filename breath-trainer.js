/* Тренажёр дыхания «Ритм-лента» (21.11, вариант B, выбран Николаем).
   Ученик выполняет упражнения без музыки: справа налево едет лента —
   длинная полоса = тянуть звук, кружок = один толчок, линия = сирена голосом,
   стрелка = вдох. Тихий фон (аккорды) синтезируется в телефоне, без файлов.
   Каждая буква (упражнение) идёт 1 минуту и сама сменяется на следующую.
   Экраны: "trainer" — разделы, "trainer-ex" — лента, "trainer-rec" — запись
   видео с суфлёром (рамка кадра «от макушки до пояса» + контроль плеч).
   21.11 (просьба Николая): тренажёр живёт внутри «Распевок» урока «Дыхание»
   и заменяет прежние распевки; запись сразу уходит Николаю. Трекер — localStorage. */

(function () {
  var EX_SECONDS = 60;   // длительность одного упражнения (буквы)
  var PPS = 80;          // скорость ленты, px/с
  var HIT_X = 64;        // линия выполнения
  var LANE_H = 150;
  var TEMPO = { slow: 1.25, mid: 1, fast: 0.8 };
  var LOG_KEY = "trainerLog.v1";

  function inh(d) { return { type: "inhale", dur: d, label: "вдох" }; }
  function hold(d) { return { type: "hold", dur: d, label: "пауза" }; }
  function long(l, d) { return { type: "long", dur: d, label: l }; }
  function pulses(l, n, d) { var a = []; for (var i = 0; i < n; i++) a.push({ type: "pulse", dur: d || 0.5, label: l }); return a; }
  function glide(l, d, peak) { return { type: "glide", dur: d, label: l, peak: peak == null ? 1 : peak }; }

  /* Упражнения. Длительности в секундах при темпе «Средне»; последовательность
     повторяется, пока не наберётся минута. */
  var SECTIONS = [
    { id: "singing", title: "Дыхание для пения", short: "Дыхание", desc: "Шипящие и свистящие: «С», «Ш», «Ф», «Ц», «С→З»",
      mood: "тёплый", tone: "terra", icon: "wind",
      pad: { chord: [110, 164.81, 196, 246.94, 261.63], cutoff: 800, lfo: 1 / 8 },
      exercises: [
        { id: "s", chip: "С", title: "Долгий «С»", hint: "Ровная тонкая струя, живот уходит медленно", seq: [inh(3), long("С — с — с", 8)] },
        { id: "sh", chip: "Ш", title: "Толчки «Ш»", hint: "Кружок — один короткий толчок животом", seq: [inh(2)].concat(pulses("Ш", 8)) },
        { id: "f", chip: "Ф", title: "Ровная струя «Ф»", hint: "Без рывка в начале — одна скорость до конца", seq: [inh(3), long("Ф — ф — ф", 10)] },
        { id: "ts", chip: "Ц", title: "Стаккато «Ц»", hint: "Быстрые лёгкие толчки, горло свободно", seq: [inh(2)].concat(pulses("Ц", 12, 0.4)) },
        { id: "sz", chip: "С→З", title: "«С» переходит в «З»", hint: "Поток тот же, просто включается голос", seq: [inh(3), long("С — с", 3), long("З — з — з", 4)] }
      ] },
    { id: "calm", title: "Спокойствие", short: "Спокойствие", desc: "Длинный мягкий выдох — снимает напряжение и стресс",
      mood: "тихий", tone: "blue", icon: "moon",
      pad: { chord: [87.31, 130.81, 174.61, 220, 261.63], cutoff: 600, lfo: 1 / 12 },
      exercises: [
        { id: "c1", chip: "Ф", title: "Выдох длиннее вдоха", hint: "Вдох на 4, мягкий «Ф» на 8", seq: [inh(4), long("Ф — ф — ф", 8)] },
        { id: "c2", chip: "Ш", title: "Пауза и «Ш»", hint: "После вдоха замри, потом длинное тихое «Ш»", seq: [inh(4), hold(2), long("Ш — ш — ш", 8)] },
        { id: "c3", chip: "Ха", title: "Вздох облегчения", hint: "Выдох на «Ха», как после трудного дня", seq: [inh(4), long("Ха — а — а", 6)] },
        { id: "c4", chip: "С", title: "Самый длинный «С»", hint: "Тише и дольше, чем кажется возможным", seq: [inh(4), long("С — с — с", 10)] }
      ] },
    { id: "focus", title: "Фокус", short: "Фокус", desc: "Ровный «квадрат»: вдох — пауза — выдох — пауза",
      mood: "ровный", tone: "sky", icon: "target",
      pad: { chord: [146.83, 220, 293.66, 349.23], cutoff: 900, lfo: 1 / 16 },
      exercises: [
        { id: "f1", chip: "С", title: "Квадрат на «С»", hint: "Все четыре части одинаковой длины", seq: [inh(4), hold(4), long("С — с", 4), hold(4)] },
        { id: "f2", chip: "Ф", title: "Квадрат на «Ф»", hint: "Держи счёт ровно, не ускоряйся", seq: [inh(4), hold(4), long("Ф — ф", 4), hold(4)] },
        { id: "f3", chip: "С·", title: "Точные толчки «С»", hint: "Каждый толчок — ровно на линии", seq: [inh(2)].concat(pulses("С", 6, 0.6)) }
      ] },
    { id: "warmup", title: "Разогрев перед пением", short: "Разогрев", desc: "Lip Roll, «Ммм», «В-в-в», плавные «сирены» голосом",
      mood: "светлый", tone: "sand", icon: "wave",
      pad: { chord: [130.81, 196, 293.66, 329.63], cutoff: 1200, lfo: 1 / 4 },
      exercises: [
        { id: "w1", chip: "Бррр", title: "Lip Roll — «Бррр» сиреной", hint: "Губы мягкие. Линия вверх — звук выше, вниз — ниже", seq: [inh(2), glide("бррр", 4, 1), inh(1.5), glide("бррр", 3.5, 0.6)] },
        { id: "w2", chip: "Ммм", title: "«Ммм» сиреной", hint: "Губы сомкнуты, звук щекочет лицо", seq: [inh(2), glide("ммм", 4, 0.8)] },
        { id: "w3", chip: "В-в", title: "«В-в-в» сиреной", hint: "Лёгкое жужжание, без нажима", seq: [inh(2), glide("в-в-в", 4, 0.9)] },
        { id: "w4", chip: "Нг", title: "«Нг» сиреной", hint: "Как в конце слова «гонг», рот приоткрыт", seq: [inh(2), glide("нг", 4, 1)] },
        { id: "w5", chip: "Ву", title: "«Ву» сиреной", hint: "Губы трубочкой, звук мягкий", seq: [inh(2), glide("ву", 4, 1)] }
      ] }
  ];

  var ICO = {
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    wave: '<path d="M2 14c2.5 0 2.5-6 5-6s2.5 8 5 8 2.5-10 5-10 2.5 8 5 8"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    sound: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    cam: '<rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10.5l6-3.5v10l-6-3.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M4 12l16-8-6 16-3-7z"/>',
    redo: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/>'
  };
  function ico(name, size) {
    size = size || 24;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[name] + "</svg>";
  }
  function h(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pl(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b; return c; }

  /* ---------- трекер ---------- */
  function ymd(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function loadLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch (e) { return {}; } }
  function saveLog(l) { try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch (e) {} }
  function todayList() { return loadLog()[ymd()] || []; }
  function markDone(sid, exid) {
    var l = loadLog(), k = ymd(), tag = sid + ":" + exid, list = l[k] || [];
    if (list.indexOf(tag) === -1) { list.push(tag); l[k] = list; saveLog(l); }
    if (window.trackEv) trackEv("trainer_done", { section: sid, exercise: exid });
  }
  function streak() {
    var l = loadLog(), n = 0, d = new Date();
    if (!(l[ymd(d)] || []).length) d.setDate(d.getDate() - 1);
    while ((l[ymd(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- фоновая мелодия ---------- */
  function makePad(cfg) {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    var ctx; try { ctx = new AC(); } catch (e) { return null; }
    var master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    var filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = cfg.cutoff; filt.Q.value = 0.7; filt.connect(master);
    cfg.chord.forEach(function (f) {
      [-5, 5].forEach(function (d) {
        var o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f; o.detune.value = d;
        var g = ctx.createGain(); g.gain.value = 0.045; o.connect(g); g.connect(filt); o.start();
      });
    });
    var lfo = ctx.createOscillator(); lfo.frequency.value = cfg.lfo;
    var lg = ctx.createGain(); lg.gain.value = cfg.cutoff * 0.4; lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
    if (ctx.state === "suspended") ctx.resume();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 2.5);
    return {
      stop: function () {
        try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); } catch (e) {}
        setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1000);
      },
      suspend: function () { try { ctx.suspend(); } catch (e) {} },
      resume: function () { try { ctx.resume(); } catch (e) {} }
    };
  }

  function haptic() { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light"); } catch (e) {} }

  /* ---------- состояние ---------- */
  var TR = { sid: null, exIdx: 0, tempo: "mid", paused: false, soundOn: true, pad: null, raf: 0, t: -1.5, events: [], total: 0, cur: -1, left: EX_SECONDS, finished: false, advTimer: 0, from: "profile" };
  window.TRAINER = TR;
  try { TR.soundOn = localStorage.getItem("trainerSound") !== "0"; } catch (e) {}

  function section() { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === TR.sid) return SECTIONS[i]; return SECTIONS[0]; }

  function buildEvents() {
    var ex = section().exercises[TR.exIdx], k = TEMPO[TR.tempo];
    var cycle = 0; ex.seq.forEach(function (e) { cycle += e.dur * k; });
    var reps = Math.max(1, Math.round(EX_SECONDS / cycle));
    var out = [], t = 0;
    for (var r = 0; r < reps; r++) ex.seq.forEach(function (e) { var d = e.dur * k; out.push({ type: e.type, label: e.label, peak: e.peak, dur: d, start: t, rep: r }); t += d; });
    TR.reps = reps;
    TR.events = out; TR.total = t; TR.t = -1.5; TR.cur = -1; TR.finished = false; TR.left = Math.ceil(t);
  }

  /* ---------- экран разделов ---------- */
  function renderList() {
    var done = todayList(), st = streak();
    var html = '<div class="tr-screen">' +
      (BROWSER_MODE ? '<div class="tr-top">' + backBtn("back") + "</div>" : "") +
      '<div class="tr-head">' +
        '<div class="tr-kicker">Тренажёр</div>' +
        '<h1 class="tr-h1 lg">Дыхание и разогрев</h1>' +
        '<p class="tr-sub">Выбери, что нужно сейчас. Тихий фон включится сам, каждая буква длится минуту</p>' +
      "</div>" +
      '<div class="tr-today"><b>Сегодня сделано: ' + done.length + " " + pl(done.length, "упражнение", "упражнения", "упражнений") + "</b>" +
        "<span>" + (st > 0 ? st + " " + pl(st, "день", "дня", "дней") + " подряд" : "Начни серию сегодня") + "</span></div>";
    SECTIONS.forEach(function (s) {
      var n = s.exercises.length;
      var all = s.exercises.every(function (x) { return done.indexOf(s.id + ":" + x.id) !== -1; });
      html += '<button type="button" class="tr-card tone-' + s.tone + '" data-tr-open="' + s.id + '">' +
        '<span class="tr-card-ic">' + ico(s.icon) + "</span>" +
        '<span class="tr-card-tx">' +
          '<span class="tr-card-t">' + h(s.title) + (all ? ' <span class="tr-card-ok">' + ico("check", 14) + "сегодня</span>" : "") + "</span>" +
          '<span class="tr-card-d">' + h(s.desc) + "</span>" +
          '<span class="tr-card-m">' + n + " " + pl(n, "упражнение", "упражнения", "упражнений") + " · " + n + " мин · фон " + s.mood + "</span>" +
        "</span></button>";
    });
    html += "</div>";
    app.innerHTML = html;
    wireActs();
    Array.prototype.forEach.call(app.querySelectorAll("[data-tr-open]"), function (b) {
      b.addEventListener("click", function () {
        TR.sid = b.getAttribute("data-tr-open"); TR.exIdx = 0; TR.paused = false;
        go("trainer-ex");
      });
    });
  }

  /* ---------- экран упражнения ---------- */
  function laneItemsHtml() {
    var s = "";
    TR.events.forEach(function (e, i) {
      var x = e.start * PPS, w = e.dur * PPS;
      if (e.type === "inhale" || e.type === "hold") {
        s += '<div class="tr-li tr-li-inh" data-i="' + i + '" style="left:' + x + "px;width:" + Math.max(56, w) + 'px">' +
          (e.type === "inhale" ? ico("up", 24) : '<span class="tr-li-hold"></span>') + "<span>" + e.label + "</span></div>";
      } else if (e.type === "long") {
        s += '<div class="tr-li tr-li-long" data-i="' + i + '" style="left:' + (x + 4) + "px;width:" + (w - 8) + 'px">' + h(e.label) + "</div>";
      } else if (e.type === "pulse") {
        s += '<div class="tr-li tr-li-pulse" data-i="' + i + '" style="left:' + (x + (w - 36) / 2) + 'px">' + h(e.label) + "</div>";
      } else {
        var top = 115 - 80 * e.peak;
        var d = "M4 115 C" + (w * 0.2) + " 115 " + (w * 0.3) + " " + top + " " + (w * 0.5) + " " + top + " C" + (w * 0.7) + " " + top + " " + (w * 0.8) + " 115 " + (w - 4) + " 115";
        s += '<svg class="tr-li tr-li-glide" data-i="' + i + '" style="left:' + x + 'px" width="' + w + '" height="' + LANE_H + '" viewBox="0 0 ' + w + " " + LANE_H + '" aria-hidden="true">' +
          '<path d="' + d + '" fill="none" stroke-width="16" stroke-linecap="round"/>' +
          '<text x="' + (w / 2) + '" y="' + (top - 13) + '" text-anchor="middle">' + h(e.label) + "</text></svg>";
      }
    });
    return s;
  }

  function countable() { return TR.events.filter(function (e) { return e.type === "pulse" || e.type === "glide" || e.type === "long"; }).length; }

  function renderEx() {
    var s = section(), ex = s.exercises[TR.exIdx], done = todayList();
    buildEvents();
    var chips = s.exercises.map(function (x, i) {
      var on = i === TR.exIdx, ok = done.indexOf(s.id + ":" + x.id) !== -1;
      return '<button type="button" class="tr-chipx' + (on ? " on" : ok ? " ok" : "") + '" data-tr-ex="' + i + '"' + (on ? ' aria-current="true"' : "") + ">" +
        (ok && !on ? ico("check", 16) + "<small>" + h(x.chip) + "</small>" : h(x.chip)) + "</button>";
    }).join("");
    app.innerHTML =
      '<div class="tr-screen tr-ex tone-' + s.tone + '">' +
        '<div class="tr-top">' +
          '<div class="tr-top-l">' + backBtn("back") + '<div class="tr-kicker">' + h(s.short) + " · " + (TR.exIdx + 1) + " из " + s.exercises.length + "</div></div>" +
          '<div class="tr-top-btns">' +
            '<button type="button" class="tr-sound' + (TR.soundOn ? " on" : "") + '" id="tr-sound" aria-label="Фоновая мелодия" aria-pressed="' + TR.soundOn + '">' + ico(TR.soundOn ? "sound" : "mute", 18) + "<span>Фон</span></button>" +
            '<button type="button" class="tr-round" id="tr-pause" aria-label="' + (TR.paused ? "Продолжить" : "Пауза") + '">' + ico(TR.paused ? "play" : "pause", 18) + "</button>" +
          "</div>" +
        "</div>" +
        '<div class="tr-head"><h1 class="tr-h1">' + h(ex.title) + '</h1><p class="tr-sub">' + h(ex.hint) + "</p></div>" +
        // Вариант 2 (21.11): буква слева в кольце-таймере, справа время до смены и повторы
        '<div class="tr-cue-row">' +
          '<div class="tr-ring-wrap">' +
            '<svg class="tr-ring" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="tr-ring-bg"/><circle cx="60" cy="60" r="54" class="tr-ring-fg" id="tr-ring" stroke-dasharray="' + RING_C + '" stroke-dashoffset="0" transform="rotate(-90 60 60)"/></svg>' +
            '<div class="tr-cue" id="tr-cue"></div>' +
          "</div>" +
          '<div class="tr-cue-info">' +
            '<span class="tr-cue-l" id="tr-next-l"></span>' +
            '<b class="tr-cue-t" id="tr-next-t"></b>' +
            '<span class="tr-cue-d" id="tr-count"></span>' +
            '<div class="tr-reps" id="tr-reps" aria-hidden="true"></div>' +
          "</div>" +
        "</div>" +
        '<div class="tr-lane" style="height:' + LANE_H + 'px"><div class="tr-strip" id="tr-strip">' + laneItemsHtml() + '</div><div class="tr-hit"></div><div class="tr-fade"></div></div>' +
        '<div class="tr-chips" style="grid-template-columns:repeat(' + s.exercises.length + ',minmax(0,1fr))">' + chips + "</div>" +
        '<div class="tr-tempo" role="group" aria-label="Темп">' +
          [["slow", "Медленно"], ["mid", "Средне"], ["fast", "Быстро"]].map(function (p) {
            return '<button type="button" data-tr-tempo="' + p[0] + '"' + (TR.tempo === p[0] ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + ">" + p[1] + "</button>";
          }).join("") +
        "</div>" +
        // кнопка записи — в самом конце, под всеми настройками
        '<button type="button" class="tr-rec-open" id="tr-rec-open">' + ico("cam", 20) + "<span>Записать видео для Николая</span></button>" +
      "</div>";
    wireActs();
    document.getElementById("tr-rec-open").addEventListener("click", function () {
      clearTimeout(TR.advTimer);
      go("trainer-rec");
    });
    document.getElementById("tr-pause").addEventListener("click", function () {
      TR.paused = !TR.paused;
      if (TR.pad) TR.paused ? TR.pad.suspend() : TR.pad.resume();
      this.innerHTML = ico(TR.paused ? "play" : "pause", 18);
      this.setAttribute("aria-label", TR.paused ? "Продолжить" : "Пауза");
    });
    document.getElementById("tr-sound").addEventListener("click", function () {
      TR.soundOn = !TR.soundOn;
      try { localStorage.setItem("trainerSound", TR.soundOn ? "1" : "0"); } catch (e) {}
      if (TR.soundOn) { if (!TR.pad) TR.pad = makePad(s.pad); if (TR.paused && TR.pad) TR.pad.suspend(); }
      else if (TR.pad) { TR.pad.stop(); TR.pad = null; }
      this.classList.toggle("on", TR.soundOn);
      this.setAttribute("aria-pressed", TR.soundOn);
      this.innerHTML = ico(TR.soundOn ? "sound" : "mute", 18) + "<span>Фон</span>";
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-tr-tempo]"), function (b) {
      b.addEventListener("click", function () { TR.tempo = b.getAttribute("data-tr-tempo"); switchEx(TR.exIdx); });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-tr-ex]"), function (b) {
      b.addEventListener("click", function () { switchEx(parseInt(b.getAttribute("data-tr-ex"), 10)); });
    });
    if (TR.soundOn && !TR.pad) { TR.pad = makePad(s.pad); if (TR.paused && TR.pad) TR.pad.suspend(); }
    paintCue(); paintNext(); paintRing();
    if (window.segEnhance) segEnhance();
    startLoop();
  }

  // Смена упражнения без полного render(): фон не прерывается
  function switchEx(i) {
    clearTimeout(TR.advTimer);
    stopLoop();
    TR.exIdx = i;
    var y = window.scrollY;
    renderEx();
    window.scrollTo(0, y);
  }

  var RING_C = 339.3; // 2π·54
  function paintRing() {
    var r = document.getElementById("tr-ring"); if (!r || !TR.total) return;
    var frac = TR.finished ? 1 : Math.max(0, Math.min(1, TR.t / TR.total));
    r.setAttribute("stroke-dashoffset", (RING_C * frac).toFixed(1));
  }
  function paintReps() {
    var done = TR.finished ? TR.reps : (TR.cur >= 0 && TR.events[TR.cur] ? TR.events[TR.cur].rep : 0);
    var cnt = document.getElementById("tr-count");
    if (cnt) cnt.innerHTML = "Сделано <b>" + done + " из " + TR.reps + "</b>";
    var bars = document.getElementById("tr-reps");
    if (bars) {
      if (TR.reps > 12) { bars.innerHTML = ""; return; }
      var html = ""; for (var i = 0; i < TR.reps; i++) html += '<i class="' + (i < done ? "on" : "") + '"></i>';
      bars.innerHTML = html;
    }
  }
  function paintCue() {
    var el = document.getElementById("tr-cue"); if (!el) return;
    var e = TR.events[TR.cur], txt, rest = false;
    if (TR.finished) txt = "✓";
    else if (!e) { txt = "…"; rest = true; }
    else if (e.type === "inhale") { txt = "вдох"; rest = true; }
    else if (e.type === "hold") { txt = "пауза"; rest = true; }
    else if (e.type === "long") txt = e.label.split(" ")[0];
    else txt = e.label;
    el.textContent = txt;
    el.classList.toggle("rest", rest);
    el.classList.toggle("small", txt.length > 3);
    if (e && e.type === "pulse" && !TR.finished) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
    paintReps();
    // пройденные элементы ленты приглушаем
    var prev = app.querySelector('.tr-li[data-i="' + (TR.cur - 1) + '"]'); if (prev) prev.classList.add("past");
  }

  function paintNext() {
    var s = section(), last = TR.exIdx >= s.exercises.length - 1;
    var l = document.getElementById("tr-next-l"), t = document.getElementById("tr-next-t"); if (!l) return;
    if (TR.finished) { l.textContent = last ? "Раздел пройден" : "Переходим к следующему"; t.textContent = last ? "✓" : "0:00"; return; }
    l.textContent = last ? "до конца раздела" : "до буквы «" + s.exercises[TR.exIdx + 1].chip + "»";
    t.textContent = Math.floor(TR.left / 60) + ":" + String(TR.left % 60).padStart(2, "0");
  }

  function startLoop() {
    stopLoop();
    var last = performance.now();
    function tick(now) {
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!TR.paused && !TR.finished && !document.hidden) TR.t += dt;
      var strip = document.getElementById("tr-strip");
      if (!strip) { TR.raf = 0; return; }
      strip.style.transform = "translate3d(" + (HIT_X - TR.t * PPS) + "px,0,0)";
      paintRing();
      var left = Math.max(0, Math.ceil(TR.total - Math.max(0, TR.t)));
      if (left !== TR.left) { TR.left = left; paintNext(); }
      var i = -1;
      if (TR.t >= TR.total) i = TR.events.length;
      else for (var j = 0; j < TR.events.length; j++) { var e = TR.events[j]; if (TR.t >= e.start && TR.t < e.start + e.dur) { i = j; break; } }
      if (i !== TR.cur && i !== -1) {
        TR.cur = i;
        if (i < TR.events.length && TR.events[i].type === "pulse") haptic();
        if (i === TR.events.length && !TR.finished) onFinish();
        paintCue();
      }
      TR.raf = requestAnimationFrame(tick);
    }
    TR.raf = requestAnimationFrame(tick);
  }
  function stopLoop() { if (TR.raf) cancelAnimationFrame(TR.raf); TR.raf = 0; }

  function onFinish() {
    var s = section();
    TR.finished = true;
    if (REC.phase === "rec") { markDone(s.id, s.exercises[TR.exIdx].id); recStop(); return; }
    markDone(s.id, s.exercises[TR.exIdx].id);
    var chip = app.querySelector('[data-tr-ex="' + TR.exIdx + '"]'); if (chip) chip.classList.add("ok");
    paintNext();
    try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred("success"); } catch (e) {}
    // Автосмена буквы через 1,5 с
    if (TR.exIdx < s.exercises.length - 1) TR.advTimer = setTimeout(function () { if (state.screen === "trainer-ex") switchEx(TR.exIdx + 1); }, 1500);
    // 22.11: последняя буква раздела — финальная заставка
    else TR.advTimer = setTimeout(function () { if (state.screen === "trainer-ex") { TR.doneFoil = true; go("trainer-done"); } }, 1500);
  }

  /* ---------- финальная заставка раздела (22.11) ----------
     Неподвижный экран в стиле «Тест пройден»: значок + текст чуть выше центра,
     кнопка ровно над доком, зеркальное конфетти один раз сразу после раздела. */
  function renderDone() {
    // 22.11: дизайн один в один с «Тест пройден»; значок — иконка раздела
    var s = section(), n = s.exercises.length;
    var back = TR.preview ? "Назад к заставкам" : TR.from === "warmups" ? "К распевкам" : "К разделам";
    var full = TR.preview || sectionFull(s);
    app.innerHTML =
      '<div class="quiz-result-screen tr-done">' +
        '<div class="qr-center">' +
          '<div class="result-badge tr-done-badge">' + ico(s.icon, 30) + "</div>" +
          '<div class="result-title">' + h(s.title) + ": готово</div>" +
          '<div class="result-sub">' + n + " " + pl(n, "упражнение", "упражнения", "упражнений") + " · " +
            (sentToday(s.id) ? "видео отправлено Николаю" : "видео Николаю не отправлено") + "</div>" +
        "</div>" +
        '<button type="button" class="cta terra qr-cta" id="tr-done-ok">' + back + "</button>" +
      "</div>";
    wireActs();
    document.getElementById("tr-done-ok").addEventListener("click", function () { if (TR.preview) { TR.preview = false; go("admin-screens"); return; } go(TR.from === "warmups" ? "warmups" : "trainer"); });
    if (window.trackEv && !TR.preview) trackEv("trainer_section_done", { section: s.id, full: full });
    // конфетти — только если все буквы раздела сделаны и видео ушло Николаю
    if (TR.doneFoil && full && window.playFoilConfetti) window.playFoilConfetti(app.querySelector(".tr-done"));
    TR.doneFoil = false;
  }
  var SENT_KEY = "trainerSent.v1";
  function sentToday(sid) { try { return ((JSON.parse(localStorage.getItem(SENT_KEY)) || {})[ymd()] || []).indexOf(sid) !== -1; } catch (e) { return false; } }
  function markSent(sid) {
    try { var l = JSON.parse(localStorage.getItem(SENT_KEY)) || {}, d = ymd(); l[d] = l[d] || []; if (l[d].indexOf(sid) === -1) l[d].push(sid); localStorage.setItem(SENT_KEY, JSON.stringify(l)); } catch (e) {}
  }
  function sectionFull(s) {
    var done = todayList();
    return sentToday(s.id) && s.exercises.every(function (x) { return done.indexOf(s.id + ":" + x.id) !== -1; });
  }
  /* 22.11: просмотр заставки раздела из «Режима админа» (с конфетти) */
  window.trainerPreviewDone = function () { TR.from = "admin"; TR.sid = "calm"; TR.preview = true; TR.doneFoil = true; go("trainer-done"); };
  /* Для заставки «Распевки выполнены»: все буквы всех разделов хоть раз сделаны */
  window.trainerAllDone = function () {
    var log = loadLog(), all = {};
    Object.keys(log).forEach(function (d) { (log[d] || []).forEach(function (k) { all[k] = 1; }); });
    return SECTIONS.every(function (s) { return s.exercises.every(function (x) { return all[s.id + ":" + x.id]; }); });
  };


  /* ---------- запись видео с суфлёром ---------- */
  var POSE_VER = "0.10.14";
  var POSE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + POSE_VER;
  var POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  var POSE = { lm: null, loading: null, failed: false };
  var REC = { phase: "off", stream: null, rec: null, chunks: [], blob: null, url: "", mime: "", poseTimer: 0, frame: "wait",
    samples: [], raised: false, raisedSince: 0, rises: [], liveRise: 0, cdTimer: 0, startedAt: 0, sendStatus: "", sideOk: false };

  function loadPose() {
    if (POSE.lm) return Promise.resolve(POSE.lm);
    if (POSE.loading) return POSE.loading;
    POSE.loading = import(POSE_CDN + "/vision_bundle.mjs").then(function (m) {
      return m.FilesetResolver.forVisionTasks(POSE_CDN + "/wasm").then(function (fs) {
        function make(delegate) {
          return m.PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: POSE_MODEL, delegate: delegate }, runningMode: "VIDEO", numPoses: 1 });
        }
        return make("GPU").catch(function () { return make("CPU"); });
      });
    }).then(function (lm) { POSE.lm = lm; return lm; })
      .catch(function (e) { POSE.failed = true; POSE.loading = null; throw e; });
    return POSE.loading;
  }

  // MediaPipe в режиме VIDEO требует растущие отметки времени — общий счётчик
  // для живой камеры и для разбора готового видео.
  var poseTs = 0;
  function poseDetect(v, ms) { poseTs = Math.max(poseTs + 1, Math.round(ms)); return POSE.lm.detectForVideo(v, poseTs); }

  function pickMime() {
    var list = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return "";
  }

  function recCleanup() {
    clearInterval(REC.cdTimer); REC.cdTimer = 0;
    if (REC.poseTimer) { cancelAnimationFrame(REC.poseTimer); REC.poseTimer = 0; }
    if (REC.rec && REC.rec.state !== "inactive") { REC.discard = true; try { REC.rec.stop(); } catch (e) {} }
    REC.rec = null;
    if (REC.stream) { REC.stream.getTracks().forEach(function (t) { t.stop(); }); REC.stream = null; }
    audioForPlay();
    if (state.screen !== "trainer-rec" && REC.url) { URL.revokeObjectURL(REC.url); REC.url = ""; REC.blob = null; }
    if (state.screen !== "trainer-rec") REC.phase = "off";
  }

  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }

  function renderRec() {
    var s = section(), ex = s.exercises[TR.exIdx];
    if (REC.phase === "off" || REC.phase === "rec" || REC.phase === "countdown") REC.phase = "setup";
    if (REC.phase === "review") { renderReview(); return; }
    buildEvents();
    TR.paused = true;
    REC.samples = []; REC.raised = false; REC.raisedSince = 0;
    app.innerHTML =
      '<div class="tr-rec tone-' + s.tone + '">' +
        '<div class="tr-rec-view">' +
          '<div class="tr-rec-box" id="tr-rec-box">' +
            '<video id="tr-cam" class="tr-cam" playsinline muted autoplay></video>' +
            '<div class="tr-guide" id="tr-guide" aria-hidden="true">' +
              '<div class="tr-guide-line top"><span>макушка</span></div>' +
              '<div class="tr-guide-line bot"><span>пояс</span></div>' +
            "</div>" +
            '<div class="tr-sh-base" id="tr-sh-base" aria-hidden="true"></div>' +
            '<div class="tr-sh-line" id="tr-sh-line" aria-hidden="true"></div>' +
            '<div class="tr-rec-top">' +
              '<button type="button" class="tr-round dark" id="tr-rec-close" aria-label="Закрыть запись">' + ico("close", 18) + "</button>" +
              '<div class="tr-rec-status" id="tr-rec-status" role="status">Включаю камеру…</div>' +
            "</div>" +
            '<div class="tr-sh-warn" id="tr-sh-warn" role="alert"></div>' +
            '<div class="tr-cd" id="tr-cd" aria-live="assertive"></div>' +
            '<div class="tr-cue tr-cue-cam" id="tr-cue"></div>' +
            '<div class="tr-rec-dot" id="tr-rec-dot"><i></i><span id="tr-rec-time">0:00</span></div>' +
          "</div>" +
        "</div>" +
        '<div class="tr-lane tr-lane-rec" style="height:' + LANE_H + 'px"><div class="tr-strip" id="tr-strip">' + laneItemsHtml() + '</div><div class="tr-hit"></div><div class="tr-fade"></div></div>' +
        '<div class="tr-rec-bar">' +
          '<div class="tr-rec-info"><b>' + h(ex.title) + '</b><span id="tr-rec-hint">Поставь телефон так, чтобы макушка и пояс были на линиях</span></div>' +
          '<button type="button" class="tr-rec-btn" id="tr-rec-go" aria-label="Начать запись"><i></i></button>' +
        "</div>" +
        '<div class="tr-rec-alt" id="tr-rec-alt" hidden>' +
          '<button type="button" class="tr-btn ghost" id="tr-cam-retry">' + ico("redo", 18) + "Ещё раз</button>" +
          '<label class="tr-btn main">' + ico("cam", 18) + 'Снять или выбрать видео<input type="file" accept="video/*" id="tr-native" style="display:none;"></label>' +
          // В Telegram на iPhone камера внутри приложения не открывается —
          // в Safari по личной ссылке работает полная запись с лентой.
          ((tg && state.accessToken && !window.GUEST_ON) ? '<button type="button" class="tr-btn ghost wide" id="tr-open-safari">Открыть в Safari — там камера работает вместе с лентой</button>' : "") +
        "</div>" +
      "</div>";
    document.getElementById("tr-rec-close").addEventListener("click", function () { handleBack(); });
    document.getElementById("tr-rec-go").addEventListener("click", recCountdown);
    var saf = document.getElementById("tr-open-safari");
    if (saf) saf.addEventListener("click", function () {
      try { tg.openLink(location.origin + "/?k=" + encodeURIComponent(state.accessToken)); } catch (e) {}
    });
    document.getElementById("tr-cam-retry").addEventListener("click", function () { setStatus("Включаю камеру…", ""); startCamera(); });
    document.getElementById("tr-native").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      useNativeVideo(f);
    });
    paintCue();
    startLoop();
    startCamera();
  }

  function setStatus(txt, kind) {
    var el = document.getElementById("tr-rec-status"); if (!el) return;
    el.textContent = txt; el.className = "tr-rec-status" + (kind ? " " + kind : "");
  }

  /* Камера: сначала с нужными настройками, при отказе — проще, потом без
     требований к размеру. Если не вышло совсем — показываем причину и даём
     снять системной камерой (плечи тогда проверяются по готовому видео). */
  var CAM_TRIES = [
    { video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } }, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
    { video: { facingMode: "user" }, audio: true },
    { video: true, audio: true }
  ];
  /* ГЛАВНОЕ (21.11): заставка (splash.js) ставит звуку режим "ambient" — в нём
     iPhone вообще не даёт включить камеру/микрофон: getUserMedia падает с
     InvalidStateError, окно разрешения даже не появляется (в Safari, в Telegram
     и с иконки). Перед камерой переключаем звук в "play-and-record", после — в "auto". */
  function audioForRecord() { try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {} }
  function audioForPlay() { try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {} }

  function startCamera() {
    audioForRecord();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFailed({ name: "NoMediaDevices" }); return; }
    var i = 0, lastErr = null;
    (function attempt() {
      if (i >= CAM_TRIES.length) { camFailed(lastErr); return; }
      navigator.mediaDevices.getUserMedia(CAM_TRIES[i]).then(camReady).catch(function (e) {
        lastErr = e; i++;
        if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) { camFailed(e); return; }
        attempt();
      });
    })();
  }
  function camReady(stream) {
    try { localStorage.setItem(CAM_KEY, "1"); } catch (e) {}
    if (state.screen !== "trainer-rec") { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    REC.stream = stream;
    var alt = document.getElementById("tr-rec-alt"); if (alt) alt.hidden = true;
    var b = document.getElementById("tr-rec-go"); if (b) b.disabled = false;
    var v = document.getElementById("tr-cam");
    v.srcObject = stream;
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    setStatus("Встань в рамку", "");
    hint("Поставь телефон так, чтобы макушка и пояс были на линиях");
    loadPose().then(function () { if (state.screen === "trainer-rec") poseLoop(); })
      .catch(function () { setStatus("Рамка без подсказок: проверь кадр сам", "warn"); hint("Контроль плеч сейчас недоступен — следи за плечами сам"); });
  }
  function camFailed(err) {
    var name = (err && err.name) || "Error";
    var msg = name === "NotAllowedError" || name === "SecurityError"
      ? "Камера запрещена для приложения"
      : name === "NotReadableError" ? "Камера занята другим приложением"
      : name === "NotFoundError" ? "Камера не найдена"
      : name === "NoMediaDevices" ? "Здесь камера внутри приложения недоступна"
      : "Камера не включилась";
    setStatus(msg + " (" + name + ")", "warn");
    hint(name === "NotAllowedError"
      ? "Разреши камеру и микрофон в настройках iPhone и нажми «Ещё раз». Или сними видео кнопкой ниже — плечи проверю по готовому видео."
      : (tg ? "В Telegram камера внутри приложения может не открываться. Открой в Safari или сними видео кнопкой ниже — плечи проверю по готовому видео."
            : "Нажми «Ещё раз» или сними видео кнопкой ниже — плечи проверю по готовому видео."));
    var b = document.getElementById("tr-rec-go"); if (b) b.disabled = true;
    var alt = document.getElementById("tr-rec-alt"); if (alt) alt.hidden = false;
    if (window.trackEv) trackEv("trainer_cam_error", { error: name, msg: String(err && err.message || "").slice(0, 120) });
  }
  function hint(t) { var el = document.getElementById("tr-rec-hint"); if (el) el.textContent = t; }

  /* Поза: рамка «макушка — пояс» и подъём плеч. Координаты MediaPipe
     нормированы к кадру; кадр 3:4 показан целиком, так что % совпадают с экраном. */
  function poseLoop() {
    var v = document.getElementById("tr-cam"), lastT = 0;
    function step(now) {
      if (state.screen !== "trainer-rec" || !POSE.lm) { REC.poseTimer = 0; return; }
      if (now - lastT > 90 && v.readyState >= 2 && v.videoWidth) {
        lastT = now;
        var res = null;
        try { res = poseDetect(v, now); } catch (e) {}
        onPose(res && res.landmarks && res.landmarks[0], v.videoWidth, v.videoHeight, now);
      }
      REC.poseTimer = requestAnimationFrame(step);
    }
    REC.poseTimer = requestAnimationFrame(step);
  }

  function onPose(L, W, H, now) {
    var line = document.getElementById("tr-sh-line"), base = document.getElementById("tr-sh-base"), guide = document.getElementById("tr-guide");
    function vis(i) { return L[i].visibility == null ? 1 : L[i].visibility; }
    if (!L || vis(0) < 0.5 || vis(11) < 0.5 || vis(12) < 0.5) {
      REC.frame = "none";
      if (REC.phase === "setup") setStatus("Встань в рамку", "");
      if (guide) guide.className = "tr-guide";
      if (line) line.style.opacity = 0;
      return;
    }
    var sy = (L[11].y + L[12].y) / 2;
    var swPx = Math.abs(L[11].x - L[12].x) * W;
    var headTop = L[0].y - (sy - L[0].y) * 0.8;
    var waistY = sy + 1.35 * swPx / H;
    var ok = false, msg;
    if (headTop < 0.01) msg = "Голова не помещается — отодвинь телефон или опусти его";
    else if (waistY > 1.0) msg = "Отойди чуть дальше — нужен кадр до пояса";
    else if (headTop > 0.2 || waistY < 0.72) msg = "Подойди ближе — ты слишком далеко";
    else { ok = true; msg = "Кадр ровный — можно записывать"; }
    REC.frame = ok ? "ok" : "bad";
    if (REC.phase === "setup") setStatus(msg, ok ? "ok" : "warn");
    if (guide) guide.className = "tr-guide " + (ok ? "ok" : "bad");

    // Плечи: высота относительно самого низкого положения за последние 6 с,
    // в долях ширины плеч (не зависит от расстояния до камеры).
    REC.samples.push({ t: now, y: sy });
    while (REC.samples.length && now - REC.samples[0].t > 6000) REC.samples.shift();
    var low = sy; REC.samples.forEach(function (p) { if (p.y > low) low = p.y; });
    var rise = swPx > 10 ? (low - sy) * H / swPx : 0;
    REC.liveRise = rise;
    var active = REC.phase === "rec" || REC.phase === "countdown";
    if (line) {
      line.style.opacity = 1;
      line.style.top = (sy * 100) + "%";
      line.style.left = (Math.min(L[11].x, L[12].x) * 100) + "%";
      line.style.width = (Math.abs(L[11].x - L[12].x) * 100) + "%";
      line.classList.toggle("up", REC.raised);
    }
    if (base) { base.style.opacity = active ? 1 : 0; base.style.top = (low * 100) + "%"; }
    if (REC.phase !== "rec") return;
    if (!REC.raised && rise > 0.07) {
      if (!REC.raisedSince) REC.raisedSince = now;
      if (now - REC.raisedSince > 250) {
        REC.raised = true;
        var e = TR.events[TR.cur];
        REC.rises.push({ at: Math.max(0, TR.t), onInhale: !!(e && e.type === "inhale") });
        showWarn("Плечи поднялись — вдыхай в нижние рёбра и живот");
        try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred("warning"); } catch (er) {}
      }
    } else if (rise <= 0.07) REC.raisedSince = 0;
    if (REC.raised && rise < 0.035) REC.raised = false;
  }

  function showWarn(t) {
    var el = document.getElementById("tr-sh-warn"); if (!el) return;
    el.innerHTML = (window.icoWarn ? icoWarn(20) : "") + "<span>" + h(t) + "</span>"; el.classList.add("on");
    clearTimeout(REC.warnTimer);
    REC.warnTimer = setTimeout(function () { el.classList.remove("on"); }, 2200);
  }

  function recCountdown() {
    if (!REC.stream) return;
    if (REC.phase !== "setup") return;
    if (TR.pad) { TR.pad.stop(); TR.pad = null; } // фон на время записи выключен — Николай слышит только голос
    REC.phase = "countdown";
    var btn = document.getElementById("tr-rec-go"); if (btn) btn.disabled = true;
    hint("Фон на время записи выключен, чтобы Николай слышал только тебя");
    var n = 3, cd = document.getElementById("tr-cd");
    cd.textContent = n; cd.classList.add("on");
    REC.cdTimer = setInterval(function () {
      n--;
      if (n > 0) { cd.textContent = n; return; }
      clearInterval(REC.cdTimer); REC.cdTimer = 0;
      cd.classList.remove("on"); cd.textContent = "";
      recStart();
    }, 1000);
  }

  function recStart() {
    if (state.screen !== "trainer-rec" || !REC.stream) return;
    REC.mime = pickMime();
    REC.chunks = []; REC.rises = []; REC.raised = false; REC.raisedSince = 0; REC.discard = false; REC.native = false;
    var opts = { videoBitsPerSecond: 600000, audioBitsPerSecond: 64000 }; // больше 4 МБ — уйдёт через хранилище
    if (REC.mime) opts.mimeType = REC.mime;
    var mr;
    try { mr = new MediaRecorder(REC.stream, opts); } catch (e) {
      try { mr = new MediaRecorder(REC.stream); } catch (e2) { setStatus("Запись видео на этом телефоне не поддерживается", "warn"); REC.phase = "setup"; return; }
    }
    REC.rec = mr;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) REC.chunks.push(e.data); };
    mr.onstop = function () {
      if (REC.discard) { REC.discard = false; return; }
      var type = (mr.mimeType || REC.mime || "video/mp4").split(";")[0];
      REC.blob = new Blob(REC.chunks, { type: type });
      if (REC.url) URL.revokeObjectURL(REC.url);
      REC.url = URL.createObjectURL(REC.blob);
      REC.duration = Math.round((performance.now() - REC.startedAt) / 1000);
      REC.phase = "review"; REC.sendStatus = "";
      if (REC.stream) { REC.stream.getTracks().forEach(function (t) { t.stop(); }); REC.stream = null; }
      audioForPlay();
      if (REC.poseTimer) { cancelAnimationFrame(REC.poseTimer); REC.poseTimer = 0; }
      if (state.screen === "trainer-rec") renderReview();
    };
    mr.start(1000);
    REC.startedAt = performance.now();
    REC.phase = "rec";
    TR.t = -1.5; TR.cur = -1; TR.finished = false; TR.paused = false;
    setStatus("Идёт запись", "rec");
    var dot = document.getElementById("tr-rec-dot"); if (dot) dot.classList.add("on");
    var btn = document.getElementById("tr-rec-go");
    if (btn) { btn.disabled = false; btn.classList.add("stop"); btn.setAttribute("aria-label", "Остановить запись"); btn.onclick = function () { recStop(); }; }
    hint("Следи за лентой. Запись остановится сама через " + fmt(TR.total));
    REC.timeTimer = setInterval(function () {
      var el = document.getElementById("tr-rec-time");
      if (!el || REC.phase !== "rec") { clearInterval(REC.timeTimer); return; }
      el.textContent = fmt((performance.now() - REC.startedAt) / 1000);
    }, 500);
  }

  /* Видео из системной камеры: плечи проверяем по готовому файлу */
  function useNativeVideo(file) {
    if (REC.stream) { REC.stream.getTracks().forEach(function (t) { t.stop(); }); REC.stream = null; }
    if (REC.poseTimer) { cancelAnimationFrame(REC.poseTimer); REC.poseTimer = 0; }
    stopLoop();
    if (REC.url) URL.revokeObjectURL(REC.url);
    REC.blob = file; REC.url = URL.createObjectURL(file); REC.native = true;
    REC.rises = []; REC.analyzed = false; REC.analyzeFailed = false; REC.analyzePct = 0; REC.duration = 0;
    REC.phase = "review"; REC.sendStatus = "";
    markDone(section().id, section().exercises[TR.exIdx].id);
    renderReview();
    analyzeFile(REC.url, function (pct) {
      REC.analyzePct = pct;
      var el = document.getElementById("tr-sum-live"); if (el) el.textContent = "Проверяю плечи по видео… " + pct + "%";
    }).then(function (r) {
      REC.rises = r.rises; REC.duration = r.duration; REC.analyzed = true;
    }).catch(function () { REC.analyzed = true; REC.analyzeFailed = true; })
      .then(function () { if (state.screen === "trainer-rec" && REC.phase === "review") renderReview(); });
  }

  function analyzeFile(url, onProgress) {
    return loadPose().then(function () {
      return new Promise(function (resolve, reject) {
        var v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto";
        v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
        document.body.appendChild(v);
        var t = 0, dur = 0, STEP = 0.25, samples = [], raised = false, since = -1, rises = [], finished = false;
        var dead = setTimeout(fail, 20000);
        function cleanup() { finished = true; clearTimeout(dead); v.removeAttribute("src"); try { v.load(); } catch (e) {} v.remove(); }
        function fail() { if (finished) return; cleanup(); reject(new Error("analyze")); }
        function next() {
          clearTimeout(dead); dead = setTimeout(fail, 8000);
          if (t > dur || state.screen !== "trainer-rec") { cleanup(); resolve({ rises: rises, duration: Math.round(dur) }); return; }
          v.currentTime = t;
        }
        v.onloadeddata = function () { if (dur) return; dur = v.duration || 0; if (!isFinite(dur) || dur <= 0) { fail(); return; } next(); };
        v.onerror = fail;
        v.onseeked = function () {
          if (finished) return;
          var res = null;
          try { res = poseDetect(v, poseTs + 33); } catch (e) {}
          var L = res && res.landmarks && res.landmarks[0];
          if (L && (L[11].visibility == null || L[11].visibility > 0.5) && (L[12].visibility == null || L[12].visibility > 0.5)) {
            var W = v.videoWidth, H = v.videoHeight;
            var sy = (L[11].y + L[12].y) / 2, swPx = Math.abs(L[11].x - L[12].x) * W;
            samples.push({ t: t, y: sy });
            while (samples.length && t - samples[0].t > 6) samples.shift();
            var low = sy; samples.forEach(function (p) { if (p.y > low) low = p.y; });
            var rise = swPx > 10 ? (low - sy) * H / swPx : 0;
            if (!raised && rise > 0.07) {
              if (since < 0) since = t;
              if (t - since >= 0.25) { raised = true; rises.push({ at: t }); }
            } else if (rise <= 0.07) since = -1;
            if (raised && rise < 0.035) raised = false;
          }
          onProgress(Math.min(99, Math.round(t / dur * 100)));
          t += STEP; next();
        };
        v.src = url;
        try { v.load(); } catch (e) {}
      });
    });
  }

  /* Большое видео — как в «Поддержке»: в хранилище по частям, затем бот
     пересылает Николаю с подписью. */
  function sendBig(blob, name, note, meta, onProgress) {
    var ext = (String(name).match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || "mp4";
    var who = supportIdentity();
    if (!who.initData && !who.accessToken) return Promise.reject(new Error("who"));
    return loadBlobClient().then(function (client) {
      return client.upload("support/video-" + Date.now().toString(36) + "-0." + ext.toLowerCase(), blob, {
        access: "private", handleUploadUrl: "/api/support-upload", clientPayload: JSON.stringify(who),
        contentType: blob.type || undefined, multipart: blob.size > 8 * 1024 * 1024,
        onUploadProgress: function (ev) { onProgress(Math.min(99, Math.round((ev.loaded || 0) / blob.size * 100))); }
      });
    }).then(function (up) {
      return supportPost({ action: "start", text: "🎤 Распевки (видео) · урок «" + (LESSON ? LESSON.title : "") + "»\n" + note, counts: { photo: 0, video: 1 },
        firstName: state.firstName || "", lastName: state.lastName || "" })
        .then(function (d) {
          return supportPost({ action: "send", headerId: d.headerId, name: d.name || "",
            items: [{ pathname: up.pathname, size: blob.size, kind: "video", name: name, width: meta && meta.width, height: meta && meta.height, duration: meta && meta.duration }] });
        });
    });
  }

  function recStop() {
    clearInterval(REC.timeTimer);
    TR.paused = true;
    if (REC.rec && REC.rec.state !== "inactive") { try { REC.rec.stop(); } catch (e) {} }
  }

  function shoulderSummary() {
    var n = REC.rises.length;
    if (REC.native && !REC.analyzed) return { ok: null, text: "Проверяю плечи по видео… " + (REC.analyzePct || 0) + "%", note: "Плечи: не проверены", live: true };
    if (!POSE.lm || (REC.native && REC.analyzeFailed)) return { ok: null, text: "Контроль плеч не работал — проверь себя по видео", note: "Плечи: не отслеживались" };
    if (!n) return { ok: true, text: "Плечи спокойные всю запись — отлично!", note: "Плечи: спокойные ✓" };
    var times = REC.rises.slice(0, 6).map(function (r) { return fmt(r.at); }).join(", ");
    return { ok: false, text: "Плечи поднимались " + n + " " + pl(n, "раз", "раза", "раз") + " (" + times + "). Вдыхай в нижние рёбра и живот.",
      note: "Плечи поднимались: " + n + " " + pl(n, "раз", "раза", "раз") + " (" + times + ")" };
  }

  function renderReview() {
    var s = section(), ex = s.exercises[TR.exIdx], sum = shoulderSummary();
    var big = REC.blob && REC.blob.size > MAX_UPLOAD_BYTES;
    var waiting = REC.native && !REC.analyzed;
    var st = REC.sendStatus;
    var sendTxt = st === "sending" ? "Отправляю Николаю…" : st === "sent" ? "Отправлено Николаю ✓" : st === "error" ? "Не отправилось — ещё раз" : "Отправить Николаю";
    app.innerHTML =
      '<div class="tr-rec tone-' + s.tone + '">' +
        '<div class="tr-rec-view"><div class="tr-rec-box">' +
          '<video class="tr-cam tr-play" id="tr-play" playsinline controls src="' + REC.url + '"></video>' +
          '<div class="tr-rec-top"><button type="button" class="tr-round dark" id="tr-rec-close" aria-label="Закрыть">' + ico("close", 18) + "</button>" +
            '<div class="tr-rec-status ok">Запись готова · ' + fmt(REC.duration || 0) + "</div></div>" +
        "</div></div>" +
        '<div class="tr-review">' +
          '<div class="tr-review-t">' + h(ex.title) + "</div>" +
          '<div class="tr-sum ' + (sum.ok === true ? "ok" : sum.ok === false ? "bad" : "") + '"' + (sum.live ? ' id="tr-sum-live"' : "") + ">" + h(sum.text) + "</div>" +
          (st === "sending" && big ? '<div class="tr-prog"><div id="tr-prog-fill" style="width:' + (REC.upPct || 0) + '%"></div></div>' : "") +
          (window.GUEST_ON ? '<div class="tr-sum">В тест-драйве отправка видео закрыта — она откроется после записи на занятия.</div>' : "") +
          '<div class="tr-review-btns">' +
            '<button type="button" class="tr-btn ghost" id="tr-redo">' + ico("redo", 18) + "Переснять</button>" +
            '<button type="button" class="tr-btn main" id="tr-send"' + (waiting || window.GUEST_ON || st === "sending" || st === "sent" ? " disabled" : "") + ">" + ico("send", 18) + sendTxt + "</button>" +
          "</div>" +
          (st === "sent" && TR.exIdx < s.exercises.length - 1 ? '<button type="button" class="tr-btn next" id="tr-next">Следующее: ' + h(s.exercises[TR.exIdx + 1].title) + "</button>" : "") +
          (st === "sent" && TR.exIdx === s.exercises.length - 1 ? '<button type="button" class="tr-btn next" id="tr-fin">Завершить раздел</button>' : "") +
        "</div>" +
      "</div>";
    document.getElementById("tr-rec-close").addEventListener("click", function () { REC.phase = "off"; handleBack(); });
    document.getElementById("tr-redo").addEventListener("click", function () { REC.phase = "setup"; REC.sendStatus = ""; renderRec(); });
    var fin = document.getElementById("tr-fin");
    if (fin) fin.addEventListener("click", function () { REC.phase = "off"; REC.sendStatus = ""; TR.doneFoil = true; go("trainer-done"); });
    var nx = document.getElementById("tr-next");
    if (nx) nx.addEventListener("click", function () { TR.exIdx++; REC.phase = "setup"; REC.sendStatus = ""; renderRec(); });
    var sb = document.getElementById("tr-send");
    if (sb) sb.addEventListener("click", function () { recSend(sum); });
  }

  function recSend(sum) {
    if (!REC.blob || REC.sendStatus === "sending" || REC.sendStatus === "sent") return;
    var s = section(), ex = s.exercises[TR.exIdx];
    var ext = (String(REC.blob.name || "").match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || (/mp4/.test(REC.blob.type) ? "mp4" : /quicktime/.test(REC.blob.type) ? "mov" : "webm");
    var name = "Тренажёр — " + ex.title.replace(/[«»"]/g, "") + "." + ext;
    REC.sendStatus = "sending"; renderReview();
    var note = "🌬 Тренажёр: " + s.title + " · " + ex.title + " · темп " + ({ slow: "медленно", mid: "средне", fast: "быстро" })[TR.tempo] + "\n" + sum.note;
    readVideoMeta(REC.blob).then(function (meta) {
      meta = meta || {};
      meta.note = note;
      if (!meta.duration) meta.duration = REC.duration;
      if (REC.blob.size > MAX_UPLOAD_BYTES) {
        REC.upPct = 0;
        sendBig(REC.blob, name, note, meta, function (pct) {
          REC.upPct = pct; var f = document.getElementById("tr-prog-fill"); if (f) f.style.width = pct + "%";
        }).then(function () { done("sent"); }).catch(function () { done("error"); });
        return;
      }
      submitFile("warmup", REC.blob, done, name, meta);
      function done(status) {
        if (status === "sending") return;
        REC.sendStatus = status === "sent" ? "sent" : "error";
        if (status === "sent") {
          state.warmupFiles.push({ name: name, status: "sent" });
          markSent(s.id);
          saveState();
          maybeCelebrate();
          if (window.trackEv) trackEv("trainer_video", { section: s.id, exercise: ex.id, rises: REC.rises.length });
        }
        if (state.screen === "trainer-rec" && REC.phase === "review") renderReview();
      }
    });
  }

  /* ---------- подключение к app.js ---------- */
  window.renderTrainerScreen = function () {
    if (state.screen === "trainer-rec") renderRec();
    else if (state.screen === "trainer-done") renderDone();
    else if (state.screen === "trainer-ex") renderEx();
    else renderList();
  };
  window.trainerStopAll = function () {
    stopLoop();
    clearTimeout(TR.advTimer);
    if (TR.pad) { TR.pad.stop(); TR.pad = null; }
    recCleanup();
  };
  window.trainerBackTarget = function () {
    if (state.screen === "trainer-rec") return "trainer-ex";
    if (state.screen === "trainer-done" && TR.preview) { TR.preview = false; return "admin-screens"; }
    if (state.screen === "trainer-ex" || state.screen === "trainer-done") return TR.from === "warmups" ? "warmups" : "trainer";
    return TR.from || "profile";
  };
  /* Список разделов внутри «Распевок» урока (renderWarmups в app.js) */
  window.trainerSectionsHtml = function () {
    var done = todayList(), html = "";
    SECTIONS.forEach(function (s) {
      var n = s.exercises.length;
      var all = s.exercises.every(function (x) { return done.indexOf(s.id + ":" + x.id) !== -1; });
      html += '<button type="button" class="tr-card tone-' + s.tone + '" data-tr-open="' + s.id + '">' +
        '<span class="tr-card-ic">' + ico(s.icon) + "</span>" +
        '<span class="tr-card-tx">' +
          '<span class="tr-card-t">' + h(s.title) + (all ? ' <span class="tr-card-ok">' + ico("check", 14) + "сегодня</span>" : "") + "</span>" +
          '<span class="tr-card-d">' + h(s.desc) + "</span>" +
          '<span class="tr-card-m">' + n + " " + pl(n, "упражнение", "упражнения", "упражнений") + " · " + n + " мин · фон " + s.mood + "</span>" +
        "</span></button>";
    });
    return '<div class="tr-in-warmups">' + html + "</div>";
  };
  /* Разрешение камеры заранее: карточка в «Распевках». Окно iPhone
     «Разрешить доступ к камере» появляется по кнопке, ответ сохраняется. */
  var CAM_KEY = "trainerCamOk";
  function camOk() { try { return localStorage.getItem(CAM_KEY) === "1"; } catch (e) { return false; } }
  window.trainerCamCardHtml = function () {
    if (camOk()) return "";
    return '<div class="tr-camcard" id="tr-camcard">' +
      '<span class="tr-camcard-ic">' + (window.icoWarn ? icoWarn(22) : "!") + "</span>" +
      '<span class="tr-camcard-tx" id="tr-camcard-sub">Разреши камеру для записи упражнений</span>' +
      '<button type="button" class="tr-camcard-btn" id="tr-camcard-btn">Разрешить</button>' +
    "</div>";
  };
  window.trainerWireCamCard = function () {
    var b = document.getElementById("tr-camcard-btn"); if (!b) return;
    b.addEventListener("click", function () {
      var sub = document.getElementById("tr-camcard-sub");
      audioForRecord();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (sub) sub.textContent = "Здесь камера недоступна — обнови iOS или открой приложение в Safari"; return; }
      b.disabled = true; b.textContent = "…";
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true }).then(function (st) {
        st.getTracks().forEach(function (t) { t.stop(); });
        audioForPlay();
        try { localStorage.setItem(CAM_KEY, "1"); } catch (e) {}
        var card = document.getElementById("tr-camcard");
        if (card) card.remove();
        if (window.trackEv) trackEv("trainer_cam_ok", {});
      }).catch(function (e) {
        audioForPlay();
        b.disabled = false; b.textContent = "Ещё раз";
        var n = (e && e.name) || "Error";
        if (sub) sub.textContent = n === "NotAllowedError"
          ? "Камера запрещена — включи её в Настройках iPhone (" + n + ")"
          : "Камера не включилась (" + n + ")";
        if (window.trackEv) trackEv("trainer_cam_error", { error: n, where: "precheck" });
      });
    });
  };
  window.trainerWireSections = function (from) {
    Array.prototype.forEach.call(app.querySelectorAll("[data-tr-open]"), function (b) {
      b.addEventListener("click", function () {
        TR.from = from; TR.sid = b.getAttribute("data-tr-open"); TR.exIdx = 0; TR.paused = false;
        go("trainer-ex");
      });
    });
  };
  document.addEventListener("visibilitychange", function () {
    if (!TR.pad) return;
    if (document.hidden) TR.pad.suspend(); else if (!TR.paused) TR.pad.resume();
  });
  ACTS["open-trainer"] = function (el) {
    TR.from = (el && el.getAttribute("data-from")) || (state.screen === "lesson-home" ? "lesson-home" : "profile");
    go("trainer");
  };
})();
