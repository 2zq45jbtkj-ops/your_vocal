/* Тренажёр дыхания «Ритм-лента» (21.11, вариант B, выбран Николаем).
   Ученик выполняет упражнения без музыки: справа налево едет лента —
   длинная полоса = тянуть звук, кружок = один толчок, линия = сирена голосом,
   стрелка = вдох. Тихий фон (аккорды) синтезируется в телефоне, без файлов.
   Каждая буква (упражнение) идёт 1 минуту и сама сменяется на следующую.
   Экраны: "trainer" — разделы, "trainer-ex" — лента. Трекер — localStorage. */

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
    mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>'
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
    for (var r = 0; r < reps; r++) ex.seq.forEach(function (e) { var d = e.dur * k; out.push({ type: e.type, label: e.label, peak: e.peak, dur: d, start: t }); t += d; });
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
        '<div class="tr-cue-wrap"><div class="tr-cue" id="tr-cue"></div></div>' +
        '<div class="tr-lane" style="height:' + LANE_H + 'px"><div class="tr-strip" id="tr-strip">' + laneItemsHtml() + '</div><div class="tr-hit"></div><div class="tr-fade"></div></div>' +
        '<div class="tr-stats"><span>Сделано</span><b id="tr-count">0 <i>/ ' + countable() + "</i></b></div>" +
        '<div class="tr-stats tr-next"><span id="tr-next-l"></span><b id="tr-next-t"></b></div>' +
        '<div class="tr-tempo" role="group" aria-label="Темп">' +
          [["slow", "Медленно"], ["mid", "Средне"], ["fast", "Быстро"]].map(function (p) {
            return '<button type="button" data-tr-tempo="' + p[0] + '"' + (TR.tempo === p[0] ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + ">" + p[1] + "</button>";
          }).join("") +
        "</div>" +
        '<div class="tr-chips" style="grid-template-columns:repeat(' + s.exercises.length + ',minmax(0,1fr))">' + chips + "</div>" +
      "</div>";
    wireActs();
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
    paintCue(); paintNext();
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
    // счётчик
    var c = 0; for (var i = 0; i < TR.cur && i < TR.events.length; i++) { var t = TR.events[i].type; if (t === "pulse" || t === "glide" || t === "long") c++; }
    if (TR.finished) c = countable();
    var cnt = document.getElementById("tr-count"); if (cnt) cnt.innerHTML = c + " <i>/ " + countable() + "</i>";
    // пройденные элементы ленты приглушаем
    var prev = app.querySelector('.tr-li[data-i="' + (TR.cur - 1) + '"]'); if (prev) prev.classList.add("past");
  }

  function paintNext() {
    var s = section(), last = TR.exIdx >= s.exercises.length - 1;
    var l = document.getElementById("tr-next-l"), t = document.getElementById("tr-next-t"); if (!l) return;
    if (TR.finished) { l.textContent = last ? "Раздел пройден — отличная работа!" : "Переходим к следующему"; t.textContent = ""; return; }
    l.textContent = last ? "До конца раздела" : "Дальше «" + s.exercises[TR.exIdx + 1].chip + "» через";
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
    markDone(s.id, s.exercises[TR.exIdx].id);
    var chip = app.querySelector('[data-tr-ex="' + TR.exIdx + '"]'); if (chip) chip.classList.add("ok");
    paintNext();
    try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred("success"); } catch (e) {}
    // Автосмена буквы через 1,5 с
    if (TR.exIdx < s.exercises.length - 1) TR.advTimer = setTimeout(function () { if (state.screen === "trainer-ex") switchEx(TR.exIdx + 1); }, 1500);
  }

  /* ---------- подключение к app.js ---------- */
  window.renderTrainerScreen = function () {
    if (state.screen === "trainer-ex") renderEx(); else renderList();
  };
  window.trainerStopAll = function () {
    stopLoop();
    clearTimeout(TR.advTimer);
    if (TR.pad) { TR.pad.stop(); TR.pad = null; }
  };
  window.trainerBackTarget = function () {
    return state.screen === "trainer-ex" ? "trainer" : (TR.from || "profile");
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
