/* Распевки «Силы голоса» (28.11, выбран вариант В «Лента + клавиатура»).
   Как тренажёр «Дыхания»: разделы → упражнения кружками → кольцо-таймер,
   запись видео Николаю, финальная заставка. Но поём под пианино, которое
   синтезирует телефон по схеме Николая: левая рука — бас октавой на тонике,
   на верхней ноте — доминанта, в конце снова тоника; правая рука — мелодия.
   Глиссандо — в пределах квинты, секвенция 1-2-3-4-5-4-3-2-1; каждый круг на
   полтона выше, всего 13 кругов — подъём на октаву.
   Диапазон: высокий голос ля малой (A3) → ми второй (E5), низкий — на кварту ниже
   (E3 → B4); выбирает ученик.
   Громкость: цифра 1–10 у каждого упражнения (9 и 10 не поём). Микрофон без
   автоусиления; «а-а-а» в разговоре = 3, дальше ≈4,5 дБ на цифру. Пианино из
   динамика тоже слышно микрофону — его вклад вычитаем: в настройке телефон
   один раз меряет, насколько громко микрофон слышит своё пианино. */
(function () {
  "use strict";

  var C10 = ["#bfe3f7", "#acd4ea", "#99c4db", "#87b3cb", "#75a2ba", "#6390a8", "#527e96", "#416b82", "#c7716a", "#b24a45"];
  var STEP_DB = 4.5;
  var CIRCLES = 13;               // 0…12 полутонов вверх — октава
  var SPAN = 19;                  // от тоники первого круга до квинты последнего
  var PPS = 70, LANE_H = 150, KPX = 11, HIT_X = 64;
  var TEMPO = { slow: 1.3, mid: 1, fast: 0.8 };
  var LOG_KEY = "vtLog.v1", SENT_KEY = "vtSent.v1", CAL_KEY = "vtCal.v1", VOICE_KEY = "vtVoice", SOUND_KEY = "vtPiano";
  var VOICES = { high: { base: 57, label: "Высокий голос" }, low: { base: 52, label: "Низкий голос" } };
  var NOTE_RU = ["до", "до-диез", "ре", "ре-диез", "ми", "фа", "фа-диез", "соль", "соль-диез", "ля", "ля-диез", "си"];
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  var SEQ = [0, 2, 4, 5, 7, 5, 4, 2, 0];

  var SECTIONS = [
    { id: "gliss", title: "Глиссандо", short: "Глиссандо", tone: "terra", kind: "gliss",
      desc: "Плавно вверх и вниз в пределах квинты: «У», «Бррр», «Нг»",
      icon: '<path d="M2 18c4 0 5-12 10-12s6 12 10 12"/>',
      exercises: [
        { id: "u", chip: "У", syl: "У", title: "Глиссандо на «У»", hint: "Плавно вверх до пятой ноты и обратно, без рывков", lvl: [3] },
        { id: "br", chip: "Бррр", syl: "Бррр", title: "Глиссандо на «Бррр»", hint: "Губы мягкие и свободные, звук скользит сам", lvl: [4] },
        { id: "ng", chip: "Нг", syl: "Нг", title: "Глиссандо на «Нг»", hint: "Как в конце слова «гонг», рот приоткрыт", lvl: [5] }
      ] },
    { id: "seq", title: "Секвенции", short: "Секвенции", tone: "blue", kind: "seq",
      desc: "Пять нот вверх-вниз, каждый круг на полтона выше — до октавы",
      icon: '<path d="M3 19h4v-4h4v-4h4V7h4V3"/>',
      exercises: [
        { id: "ma", chip: "Ма", syl: "Ма", title: "Секвенция на «Ма»", hint: "Пять нот вверх и вниз. Каждый круг — на полтона выше", lvl: [4] },
        { id: "mi", chip: "Ми", syl: "Ми", title: "Секвенция на «Ми»", hint: "Звук узкий и светлый, челюсть свободна", lvl: [5] },
        { id: "nu", chip: "Ну", syl: "Ну", title: "Секвенция на «Ну»", hint: "Губы чуть вперёд, звук мягкий", lvl: [6] }
      ] },
    { id: "dyn", title: "Громкость на нотах", short: "Громкость", tone: "sand", kind: "seq",
      desc: "Одна секвенция на разных цифрах: цифра меняется каждый круг",
      icon: '<path d="M3 18h2M8 18v-4M13 18v-8M18 18V6"/>',
      exercises: [
        { id: "d1", chip: "3·5·7", syl: "Ма", title: "«Ма» на 3 → 5 → 7 → 4", hint: "Новая цифра — каждый круг. Громче — не значит сильнее давить", lvl: [3, 5, 7, 4] },
        { id: "d2", chip: "4·6·2", syl: "Ну", title: "«Ну» на 4 → 6 → 2 → 5", hint: "Тише тоже бывает трудно — держи звук ровным", lvl: [4, 6, 2, 5] }
      ] }
  ];

  function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pl(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b; return c; }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function svg(p, n) { return '<svg width="' + (n || 24) + '" height="' + (n || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
  var IC = {
    sound: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="M7 5l12 7-12 7z"/>',
    cam: '<rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10.5l6-3.5v10l-6-3.5"/>',
    check: '<path d="M5 12l5 5 9-10"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', redo: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/>'
  };
  function warn(n) { return window.icoWarn ? icoWarn(n || 18) : "!"; }
  function haptic(k) { try { tg && tg.HapticFeedback && (k ? tg.HapticFeedback.notificationOccurred(k) : tg.HapticFeedback.impactOccurred("light")); } catch (e) {} }
  function audioForRecord() { try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {} }
  function audioForPlay() { try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {} }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  /* ---------- трекер (как в «Дыхании») ---------- */
  function ymd(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function jget(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function todayList() { return jget(LOG_KEY)[ymd()] || []; }
  function markDone(sid, exid) {
    var l = jget(LOG_KEY), d = ymd(), t = sid + ":" + exid; l[d] = l[d] || [];
    if (l[d].indexOf(t) === -1) { l[d].push(t); ls(LOG_KEY, JSON.stringify(l)); }
    if (window.trackEv) trackEv("vt_done", { section: sid, exercise: exid });
  }
  function streak() {
    var l = jget(LOG_KEY), n = 0, d = new Date();
    if (!(l[ymd(d)] || []).length) d.setDate(d.getDate() - 1);
    while ((l[ymd(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function sentToday(sid) { return (jget(SENT_KEY)[ymd()] || []).indexOf(sid) !== -1; }
  function markSent(sid) { var l = jget(SENT_KEY), d = ymd(); l[d] = l[d] || []; if (l[d].indexOf(sid) === -1) { l[d].push(sid); ls(SENT_KEY, JSON.stringify(l)); } }
  function sectionFull(s) { var dn = todayList(); return sentToday(s.id) && s.exercises.every(function (x) { return dn.indexOf(s.id + ":" + x.id) !== -1; }); }

  /* ---------- пианино (синтез) ---------- */
  function Piano() {
    var AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.out = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
    this.master.connect(this.out); this.out.connect(this.ctx.destination);
    this.notes = []; // для оценки, сколько пианино слышит микрофон
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  var PART = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05]];
  Piano.prototype.note = function (midi, when, dur, vel) {
    var c = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12), t0 = Math.max(c.currentTime, when);
    var g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = Math.min(9000, f * 7); lp.Q.value = 0.4;
    var end = t0 + dur, rel = 0.28;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vel, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.32, t0 + 0.45);
    g.gain.setTargetAtTime(vel * 0.12, t0 + 0.45, 1.2);
    g.gain.setTargetAtTime(0.0001, end, rel / 3);
    g.connect(lp); lp.connect(this.master);
    PART.forEach(function (p) {
      var o = c.createOscillator(); o.type = "sine"; o.frequency.value = f * p[0];
      o.detune.value = p[0] > 1 ? p[0] * 1.5 : 0;
      var pg = c.createGain(); pg.gain.value = p[1] / (p[0] > 2 && f > 600 ? 2 : 1);
      o.connect(pg); pg.connect(g); o.start(t0); o.stop(end + rel * 2);
    });
    this.notes.push({ t0: t0, end: end, vel: vel });
    if (this.notes.length > 64) this.notes.splice(0, 16);
  };
  /* приблизительная огибающая всех звучащих нот сейчас (сумма квадратов) */
  Piano.prototype.envPow = function () {
    var now = this.ctx.currentTime, s = 0;
    for (var i = 0; i < this.notes.length; i++) {
      var n = this.notes[i]; if (now < n.t0) continue;
      var a, dt = now - n.t0;
      if (now > n.end) { a = n.vel * 0.15 * Math.exp(-(now - n.end) * 10); if (a < 1e-4) continue; }
      else if (dt < 0.45) a = n.vel * Math.pow(0.32, dt / 0.45);
      else a = n.vel * (0.12 + 0.2 * Math.exp(-(dt - 0.45) / 1.2));
      s += a * a;
    }
    return s * this.master.gain.value * this.master.gain.value;
  };
  Piano.prototype.suspend = function () { try { this.ctx.suspend(); } catch (e) {} };
  Piano.prototype.resume = function () { try { this.ctx.resume(); } catch (e) {} };
  Piano.prototype.close = function () { var c = this.ctx; try { this.master.gain.setTargetAtTime(0, c.currentTime, 0.05); } catch (e) {} setTimeout(function () { try { c.close(); } catch (e) {} }, 300); };

  /* ---------- микрофон ---------- */
  function Mic(stream) {
    var AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC(); if (this.ctx.state === "suspended") this.ctx.resume();
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048;
    this.ctx.createMediaStreamSource(stream).connect(this.an);
    this.buf = new Float32Array(this.an.fftSize); this.ema = -100;
  }
  Mic.prototype.pow = function () {
    if (this.an.getFloatTimeDomainData) this.an.getFloatTimeDomainData(this.buf);
    else { var b8 = new Uint8Array(this.an.fftSize); this.an.getByteTimeDomainData(b8); for (var j = 0; j < b8.length; j++) this.buf[j] = (b8[j] - 128) / 128; }
    var s = 0; for (var i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return s / this.buf.length;
  };
  Mic.prototype.close = function () { try { this.ctx.close(); } catch (e) {} };
  function dbOf(p) { return 10 * Math.log10(p + 1e-12); }
  function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  var AUDIO_RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

  /* ---------- состояние ---------- */
  var VT = { sid: "gliss", exIdx: 0, tempo: "mid", paused: false, from: "warmups", ev: [], notes: [], total: 0, t: -1.6,
    raf: 0, last: 0, piano: null, mic: null, stream: null, cal: null, calPh: null, lvl: null, stats: null, finished: false, advTimer: 0 };
  window.VOICETR = VT;
  VT.voice = ls(VOICE_KEY) === "low" ? "low" : "high";
  VT.soundOn = ls(SOUND_KEY) !== "0";
  try { var c0 = JSON.parse(ls(CAL_KEY) || "null"); if (c0 && Date.now() - c0.t < 20 * 3600 * 1000) VT.cal = c0; } catch (e) {}

  function section() { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === VT.sid) return SECTIONS[i]; return SECTIONS[0]; }
  function exercise() { return section().exercises[VT.exIdx]; }
  function base() { return VOICES[VT.voice].base; }

  /* События упражнения: ноты правой руки, бас левой, полосы для ленты */
  function build() {
    var s = section(), ex = exercise(), k = TEMPO[VT.tempo], t = 0, b = base();
    var ev = [], drawn = [], circ = [];
    var nd = 0.42 * k, last = 0.9 * k, gap = 1.5 * k, gl = 3.2 * k;
    for (var r = 0; r < CIRCLES; r++) {
      var ton = b + r, c0 = t, lvl = ex.lvl[r % ex.lvl.length];
      if (s.kind === "gliss") {
        ev.push({ at: t, m: ton, d: gl * 0.45, v: 0.32 }, { at: t, m: ton - 12, d: gl * 0.45, v: 0.22 }, { at: t, m: ton - 24 < 33 ? ton - 12 : ton - 24, d: gl * 0.45, v: 0.18 });
        ev.push({ at: t + gl * 0.5, m: ton + 7, d: gl * 0.3, v: 0.3 }, { at: t + gl * 0.5, m: ton + 7 - 12, d: gl * 0.3, v: 0.2 }, { at: t + gl * 0.5, m: ton + 7 - 24 < 33 ? ton - 5 : ton - 17, d: gl * 0.3, v: 0.16 });
        ev.push({ at: t + gl * 0.86, m: ton, d: gl * 0.3, v: 0.28 }, { at: t + gl * 0.86, m: ton - 12, d: gl * 0.3, v: 0.2 });
        drawn.push({ type: "glide", start: t, dur: gl, from: r, to: r + 7, syl: ex.syl });
        circ.push({ r: r, start: c0, end: t + gl, lvl: lvl, notes: [ton, ton + 7], seqT: [[t, ton], [t + gl * 0.5, ton + 7], [t + gl * 0.86, ton]] });
        t += gl;
      } else {
        var seqT = [];
        SEQ.forEach(function (n, i) {
          var d = i === SEQ.length - 1 ? last : nd;
          ev.push({ at: t, m: ton + n, d: d * 0.95, v: 0.3 });
          if (i === 0 || i === SEQ.length - 1) { ev.push({ at: t, m: ton - 12, d: i ? d : nd * 4, v: 0.2 }, { at: t, m: ton - 24 < 33 ? ton - 12 : ton - 24, d: i ? d : nd * 4, v: 0.16 }); }
          if (i === 4) { ev.push({ at: t, m: ton + 7 - 24 < 33 ? ton - 5 : ton - 17, d: nd * 4, v: 0.18 }, { at: t, m: ton - 5, d: nd * 4, v: 0.2 }); }
          drawn.push({ type: "note", start: t, dur: d, rel: r + n, syl: i === 0 ? ex.syl : "" });
          seqT.push([t, ton + n]);
          t += d;
        });
        circ.push({ r: r, start: c0, end: t, lvl: lvl, notes: [ton, ton + 2, ton + 4, ton + 5, ton + 7], seqT: seqT });
      }
      if (r < CIRCLES - 1) {
        drawn.push({ type: "gap", start: t, dur: gap });
        ev.push({ at: t + gap - 0.35 * k, m: ton + 1, d: 0.3 * k, v: 0.16 }); // подсказка следующей тоники
        t += gap;
      }
    }
    VT.ev = ev.sort(function (a, b2) { return a.at - b2.at; });
    VT.drawn = drawn; VT.circ = circ; VT.total = t; VT.t = -1.6; VT.evI = 0; VT.finished = false;
    VT.stats = { voiced: 0, inZone: 0, over9: 0, max: 0 };
    VT.lead = true;
  }
  function circleAt(t) {
    var c = VT.circ; if (!c || !c.length) return null;
    for (var i = 0; i < c.length; i++) if (t < c[i].end + (i < c.length - 1 ? (c[i + 1].start - c[i].end) : 0)) return c[i];
    return c[c.length - 1];
  }
  function noteAt(t, cc) { if (!cc) return null; var m = null; cc.seqT.forEach(function (p) { if (t >= p[0] - 0.02) m = p[1]; }); return m; }

  /* ---------- рисунки ---------- */
  function ringHtml(id, size) {
    var R = 54, C = 2 * Math.PI * R;
    return '<div class="tr-ring-wrap vt-ringw"' + (size ? ' style="width:' + size + "px;height:" + size + 'px"' : "") + ">" +
      '<svg class="tr-ring" width="120" height="120" viewBox="0 0 120 120"' + (size ? ' style="width:' + size + "px;height:" + size + 'px"' : "") + ' aria-hidden="true"><circle cx="60" cy="60" r="54" class="tr-ring-bg"/><circle cx="60" cy="60" r="54" class="tr-ring-fg" id="' + id + '-ring" stroke-dasharray="' + C + '" stroke-dashoffset="0" transform="rotate(-90 60 60)"/></svg>' +
      '<div class="tr-cue vt-cue" id="' + id + '-cue"></div><span class="vt-badge" id="' + id + '-badge"></span></div>';
  }
  function laneSvg(LH) {
    var w = Math.ceil((VT.total + 6) * PPS), y0 = LH - 24, s = "";
    for (var g = 0; g <= SPAN; g++) s += '<line class="vt-guide" x1="-400" x2="' + w + '" y1="' + (y0 - g * KPX) + '" y2="' + (y0 - g * KPX) + '" opacity="' + (g % 2 ? 0.35 : 0.7) + '"/>';
    VT.drawn.forEach(function (d) {
      var x = HIT_X + d.start * PPS;
      if (d.type === "note") {
        var y = y0 - d.rel * KPX, ww = Math.max(18, d.dur * PPS - 4);
        s += '<rect class="vt-note" x="' + x + '" y="' + (y - 10) + '" width="' + ww + '" height="20" rx="10"/>';
        if (d.syl) s += '<text class="vt-note-tx" x="' + (x + ww / 2) + '" y="' + (y + 4.5) + '" text-anchor="middle">' + h(d.syl) + "</text>";
      } else if (d.type === "glide") {
        var b0 = y0 - d.from * KPX, tp = y0 - d.to * KPX, gw = d.dur * PPS;
        s += '<path d="M' + x + " " + b0 + " C" + (x + gw * 0.25) + " " + b0 + " " + (x + gw * 0.3) + " " + tp + " " + (x + gw * 0.5) + " " + tp +
          " C" + (x + gw * 0.7) + " " + tp + " " + (x + gw * 0.75) + " " + b0 + " " + (x + gw) + " " + b0 + '" fill="none" class="vt-glide" stroke-width="14" stroke-linecap="round"/>';
        s += '<text class="vt-glide-tx" x="' + (x + gw / 2) + '" y="' + (tp - 13) + '" text-anchor="middle">' + h(d.syl) + "</text>";
      } else {
        s += '<text class="vt-gap-tx" x="' + (x + d.dur * PPS / 2) + '" y="' + (y0 - (d.rel || 0)) + '" text-anchor="middle" data-gap="1">вдох</text>';
      }
    });
    return '<svg class="vt-strip" id="vt-strip" width="' + w + '" height="' + LH + '" style="height:' + LH + 'px">' + s + "</svg>";
  }
  function fixGapLabels(h) {
    // подпись «вдох» — на уровне только что спетой тоники
    var y0 = h - 24, list = app.querySelectorAll("[data-gap]"), i = 0;
    VT.drawn.forEach(function (d, k) {
      if (d.type !== "gap") return;
      var prev = VT.drawn[k - 1], rel = prev ? (prev.type === "note" ? prev.rel : prev.from) + 5 : 5;
      if (list[i]) list[i].setAttribute("y", y0 - rel * KPX);
      i++;
    });
  }
  function keysHtml() {
    var b = base(), whites = [], blacks = [];
    for (var m = b; m <= b + SPAN; m++) (BLACK[m % 12] ? blacks : whites).push(m);
    var w = whites.map(function (m) { return '<div class="vt-w" data-m="' + m + '"></div>'; }).join("");
    var bl = blacks.map(function (m) {
      var pos = whites.indexOf(m - 1) + 1;
      return '<div class="vt-b" data-m="' + m + '" style="left:calc(' + (pos / whites.length * 100) + '% - 2.6%)"></div>';
    }).join("");
    return '<div class="vt-keys" id="vt-keys">' + w + bl + "</div>" +
      '<div class="vt-cap"><span>самая низкая: ' + NOTE_RU[b % 12] + "</span><span>самая высокая: " + NOTE_RU[(b + SPAN) % 12] + "</span></div>";
  }
  function meterHtml() {
    var cells = "", ns = "";
    for (var i = 1; i <= 10; i++) { cells += '<i data-c="' + i + '" style="background:' + C10[i - 1] + '"></i>'; ns += "<span>" + (i > 8 ? "—" : i) + "</span>"; }
    return '<div class="vt-meter" id="vt-meter"><div class="vt-meter-row"><span>Громкость: держи <b id="vt-tgt">—</b></span><span id="vt-now">сейчас <b>—</b></span></div>' +
      '<div class="vt-bar">' + cells + '</div><div class="vt-bar-n">' + ns + "</div>" +
      '<div class="vt-msg" id="vt-msg" hidden></div></div>';
  }

  /* ---------- экран упражнения ---------- */
  function renderEx() {
    var s = section(), ex = exercise(), done = todayList();
    build();
    var chips = s.exercises.map(function (x, i) {
      var on = i === VT.exIdx, ok = done.indexOf(s.id + ":" + x.id) !== -1;
      return '<button type="button" class="tr-chipx' + (on ? " on" : ok ? " ok" : "") + '" data-vt-ex="' + i + '">' + (ok && !on ? svg(IC.check, 16) + "<small>" + h(x.chip) + "</small>" : h(x.chip)) + "</button>";
    }).join("");
    app.innerHTML =
      '<div class="tr-screen tr-ex vt-ex tone-' + s.tone + '">' +
        '<div class="tr-top">' +
          '<div class="tr-top-l">' + backBtn("back") + '<div class="tr-kicker">' + h(s.short) + " · " + (VT.exIdx + 1) + " из " + s.exercises.length + "</div></div>" +
          '<div class="tr-top-btns">' +
            '<button type="button" class="tr-sound' + (VT.soundOn ? " on" : "") + '" id="vt-sound" aria-pressed="' + VT.soundOn + '">' + svg(VT.soundOn ? IC.sound : IC.mute, 18) + "<span>Пианино</span></button>" +
            '<button type="button" class="tr-round" id="vt-pause" aria-label="Пауза">' + svg(VT.paused ? IC.play : IC.pause, 18) + "</button>" +
          "</div></div>" +
        '<div class="tr-head"><h1 class="tr-h1">' + h(ex.title) + '</h1><p class="tr-sub">' + h(ex.hint) + "</p></div>" +
        '<div class="tr-cue-row">' + ringHtml("vt") +
          '<div class="tr-cue-info"><span class="tr-cue-l" id="vt-l">До конца</span><b class="tr-cue-t" id="vt-time">' + fmt(VT.total) + '</b><span class="tr-cue-d" id="vt-circ"></span></div></div>' +
        '<div class="tr-lane vt-lane" style="height:' + LANE_H + 'px">' + laneSvg(LANE_H) + '<div class="tr-hit"></div><div class="tr-fade"></div></div>' +
        "<div>" + keysHtml() + "</div>" +
        meterHtml() +
        '<div class="tr-chips" style="grid-template-columns:repeat(' + s.exercises.length + ',minmax(0,1fr))">' + chips + "</div>" +
        '<div class="tr-tempo" role="group" aria-label="Темп">' +
          [["slow", "Медленно"], ["mid", "Средне"], ["fast", "Быстро"]].map(function (p) { return '<button type="button" data-vt-tempo="' + p[0] + '"' + (VT.tempo === p[0] ? ' class="on"' : "") + ">" + p[1] + "</button>"; }).join("") +
        "</div>" +
        '<div class="tr-tempo vt-voice" role="group" aria-label="Голос">' +
          ["high", "low"].map(function (v) { return '<button type="button" data-vt-voice="' + v + '"' + (VT.voice === v ? ' class="on"' : "") + ">" + VOICES[v].label + "</button>"; }).join("") +
        "</div>" +
        '<button type="button" class="tr-rec-open" id="vt-rec-open">' + svg(IC.cam, 20) + "<span>Записать видео для Николая</span></button>" +
      "</div>";
    wireActs();
    fixGapLabels(LANE_H);
    on("vt-rec-open", function () { clearTimeout(VT.advTimer); go("vt-rec"); });
    on("vt-pause", function () { VT.paused = !VT.paused; if (VT.piano) VT.paused ? VT.piano.suspend() : VT.piano.resume(); this.innerHTML = svg(VT.paused ? IC.play : IC.pause, 18); });
    on("vt-sound", function () {
      VT.soundOn = !VT.soundOn; ls(SOUND_KEY, VT.soundOn ? "1" : "0");
      if (VT.piano) VT.piano.master.gain.setTargetAtTime(VT.soundOn ? 0.5 : 0, VT.piano.ctx.currentTime, 0.03);
      this.classList.toggle("on", VT.soundOn); this.innerHTML = svg(VT.soundOn ? IC.sound : IC.mute, 18) + "<span>Пианино</span>";
    });
    each("[data-vt-tempo]", function (b) { VT.tempo = b.getAttribute("data-vt-tempo"); restartEx(); });
    each("[data-vt-voice]", function (b) { VT.voice = b.getAttribute("data-vt-voice"); ls(VOICE_KEY, VT.voice); restartEx(); });
    each("[data-vt-ex]", function (b) { VT.exIdx = +b.getAttribute("data-vt-ex"); restartEx(); });
    if (window.segEnhance) segEnhance();
    startAudio(false);
    paint();
    startLoop();
  }
  function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }
  function each(sel, fn) { Array.prototype.forEach.call(app.querySelectorAll(sel), function (b) { b.addEventListener("click", function () { fn(b); }); }); }
  function restartEx() { clearTimeout(VT.advTimer); stopLoop(); if (VT.piano) { VT.piano.close(); VT.piano = null; } VT.paused = false; render(); }

  /* ---------- звук и микрофон ---------- */
  function startAudio(withVideo) {
    if (!VT.piano) { try { VT.piano = new Piano(); VT.piano.master.gain.value = VT.soundOn ? 0.5 : 0; } catch (e) { VT.piano = null; } }
    if (VT.stream || (VT.mic && VT.micStream)) return; // микрофон уже открыт
    if (withVideo) return;
    audioForRecord();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { micOff("Микрофон недоступен — громкость не видна"); return; }
    VT.micWait = true;
    navigator.mediaDevices.getUserMedia({ audio: AUDIO_RAW }).catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); })
      .then(function (st) {
        VT.micWait = false;
        if (state.screen !== "vt-ex") { st.getTracks().forEach(function (t) { t.stop(); }); return; }
        attachMic(st);
      }).catch(function (e) {
        VT.micWait = false;
        micOff((e && e.name) === "NotAllowedError" ? "Микрофон запрещён — громкость не видна. Разреши его в настройках iPhone" : "Микрофон не включился — громкость не видна");
      });
  }
  function attachMic(st) {
    VT.micStream = st;
    try { VT.mic = new Mic(st); } catch (e) { micOff("Микрофон не отдаёт звук"); return; }
    if (!VT.cal || VT.forceCal) beginCal();
  }
  function micOff(t) { VT.mic = null; VT.micNote = t; msg(t, "info"); }
  function msg(t, kind) {
    var el = document.getElementById("vt-msg"); if (!el) return;
    if (!t) { el.hidden = true; return; }
    el.hidden = false; el.className = "vt-msg " + (kind || "");
    el.innerHTML = (kind === "warn" ? warn(16) : "") + "<span>" + h(t) + "</span>";
  }
  /* Настройка: тишина → пианино одну ноту (сколько его слышит микрофон) → «а-а-а» = 3 */
  function beginCal() { VT.calPh = { ph: "quiet", t: 0, q: [], p: [], e: [], a: [] }; VT.forceCal = false; }
  function stepCal(dt, pw) {
    var c = VT.calPh; c.t += dt;
    if (c.ph === "quiet") {
      msg("Настройка громкомера: помолчи секунду…", "cal");
      c.q.push(pw);
      if (c.t > 1.1) {
        c.noise = median(c.q) || 1e-9; c.ph = "ping"; c.t = 0;
        if (VT.piano) { var g = VT.piano.master.gain.value; VT.piano.master.gain.value = 0.5; VT.piano.note(base() + 4, VT.piano.ctx.currentTime + 0.05, 0.7, 0.3); VT._restoreGain = g; }
      }
    } else if (c.ph === "ping") {
      msg("Настройка: слушаю пианино…", "cal");
      if (VT.piano && c.t > 0.1) { var e = VT.piano.envPow(); if (e > 1e-6) { c.p.push(Math.max(0, pw - c.noise)); c.e.push(e); } }
      if (c.t > 1.0) {
        var sp = c.p.reduce(function (a, b) { return a + b; }, 0), se = c.e.reduce(function (a, b) { return a + b; }, 0);
        c.leak = se > 0 ? sp / se : 0;
        if (VT.piano && VT._restoreGain != null) { VT.piano.master.gain.value = VT.soundOn ? 0.5 : 0; VT._restoreGain = null; }
        c.ph = "say"; c.t = 0;
      }
    } else if (c.ph === "say") {
      msg("Скажи «а-а-а» спокойно, как в разговоре — это твоя тройка", "cal");
      if (dbOf(pw) > dbOf(c.noise) + 10) c.a.push(dbOf(pw));
      if (c.t > 3.2 && c.a.length >= 40) {
        VT.cal = { noise: dbOf(c.noise), anchor: median(c.a), leak: c.leak || 0, t: Date.now() };
        ls(CAL_KEY, JSON.stringify(VT.cal)); VT.calPh = null;
        msg("Готово — начинаем", "ok"); haptic("success");
        setTimeout(function () { if (!VT.calPh) msg(null); }, 1200);
      } else if (c.t > 9) { msg("Не слышу — скажи «а-а-а» чуть громче или поднеси телефон ближе", "cal"); c.t = 3.3; }
    }
  }
  function readLevel(dt) {
    if (!VT.mic) { VT.lvl = null; return; }
    var pw = VT.mic.pow();
    if (VT.calPh) { stepCal(dt, pw); VT.lvl = null; return; }
    var cal = VT.cal; if (!cal) { VT.lvl = null; return; }
    var leak = VT.piano && VT.soundOn ? (cal.leak || 0) * VT.piano.envPow() : 0;
    var vp = Math.max(1e-12, pw - leak * 1.15 - Math.pow(10, cal.noise / 10));
    var db = dbOf(vp);
    var k = 1 - Math.exp(-dt / 0.12);
    VT.ema = VT.ema == null || VT.ema < -90 ? db : VT.ema + (db - VT.ema) * k;
    VT.lvl = VT.ema > Math.max(cal.noise + 8, -62) ? 3 + (VT.ema - cal.anchor) / STEP_DB : null;
  }

  /* ---------- цикл ---------- */
  function startLoop() { stopLoop(); VT.last = 0; VT.raf = requestAnimationFrame(tick); }
  function stopLoop() { if (VT.raf) cancelAnimationFrame(VT.raf); VT.raf = 0; }
  function tick(now) {
    VT.raf = 0;
    if (state.screen !== "vt-ex" && state.screen !== "vt-rec") return;
    var dt = VT.last ? Math.min(0.1, (now - VT.last) / 1000) : 0.016; VT.last = now;
    readLevel(dt);
    var hold = VT.paused || VT.calPh || VT.micWait || (state.screen === "vt-rec" && VT.recPh !== "rec") || VT.finished;
    if (!hold) {
      VT.t += dt;
      schedule();
      if (VT.t >= VT.total + 0.6) { finish(); return; }
      var cc = circleAt(VT.t);
      if (VT.lvl != null && VT.t > 0 && cc) {
        VT.stats.voiced += dt;
        if (Math.abs(VT.lvl - cc.lvl) <= 1) VT.stats.inZone += dt;
        if (VT.lvl >= 8.5) VT.stats.over9 += dt;
        if (VT.lvl > VT.stats.max) VT.stats.max = VT.lvl;
      }
    }
    paint();
    VT.raf = requestAnimationFrame(tick);
  }
  function schedule() {
    var p = VT.piano; if (!p) return;
    var ahead = 0.25, ctxNow = p.ctx.currentTime;
    while (VT.evI < VT.ev.length && VT.ev[VT.evI].at <= VT.t + ahead) {
      var e = VT.ev[VT.evI++];
      if (e.at < VT.t - 0.05) continue;
      p.note(e.m, ctxNow + (e.at - VT.t), e.d, e.v);
    }
    // вступление: тоника первого круга, пока идёт отсчёт
    if (VT.lead && VT.t > -1.2) { VT.lead = false; p.note(base(), ctxNow + 0.02, 0.9, 0.24); p.note(base() - 12, ctxNow + 0.02, 0.9, 0.18); }
  }
  function paint() {
    var cc = circleAt(Math.max(0, VT.t)), ex = exercise();
    var strip = document.getElementById("vt-strip");
    if (strip && cc) {
      var camR = cc.r;
      var nxt = VT.circ[cc.r + 1];
      if (nxt && VT.t > cc.end) camR = cc.r + Math.min(1, (VT.t - cc.end) / Math.max(0.2, nxt.start - cc.end));
      VT.camR = VT.camR == null ? camR : VT.camR + (camR - VT.camR) * 0.2;
      var off = strip.getAttribute("height") >= 150 ? -2 * KPX : 0;
      strip.style.transform = "translate3d(" + (-Math.max(-1.6, VT.t) * PPS) + "px," + (VT.camR * KPX + off) + "px,0)";
    }
    var id = state.screen === "vt-rec" ? "vtr" : "vt";
    var cue = document.getElementById(id + "-cue");
    var inGap = cc && VT.t > cc.end && cc.r < CIRCLES - 1;
    if (cue) {
      var txt = VT.calPh ? "а" : VT.t < 0 ? String(Math.ceil(-VT.t)) : inGap ? "вдох" : ex.syl;
      if (cue.textContent !== txt) { cue.textContent = txt; cue.classList.toggle("rest", txt === "вдох"); cue.classList.toggle("small", txt.length > 2 && txt !== "вдох"); }
    }
    var badge = document.getElementById(id + "-badge");
    if (badge && cc) { var nb = String(cc.lvl); if (badge.textContent !== nb) { badge.textContent = nb; badge.style.background = C10[cc.lvl - 1]; } }
    var ring = document.getElementById(id + "-ring");
    if (ring) { var C = 2 * Math.PI * 54; ring.setAttribute("stroke-dashoffset", String(C * (VT.total ? Math.min(1, Math.max(0, VT.t) / VT.total) : 0))); }
    var tm = document.getElementById("vt-time"); if (tm) tm.textContent = fmt(VT.total - Math.max(0, VT.t));
    var ci = document.getElementById("vt-circ"); if (ci && cc) ci.textContent = "Круг " + (cc.r + 1) + " из " + CIRCLES + " · до октавы";
    // клавиатура: ноты круга и та, что звучит
    var keys = document.getElementById("vt-keys");
    if (keys && cc) {
      var cur = VT.t >= 0 && !inGap ? noteAt(VT.t, cc) : null, set = {};
      cc.notes.forEach(function (m) { set[m] = 1; });
      if (keys._sig !== cc.r + ":" + cur) {
        keys._sig = cc.r + ":" + cur;
        Array.prototype.forEach.call(keys.children, function (k) {
          var m = +k.getAttribute("data-m");
          k.classList.toggle("on", m === cur || (cur == null && m === cc.notes[0]));
          k.classList.toggle("ton", !!set[m] && m !== cur);
        });
      }
    }
    // громкомер
    var meter = document.getElementById("vt-meter");
    if (meter) {
      var tg2 = document.getElementById("vt-tgt"); if (tg2 && cc) tg2.textContent = String(cc.lvl);
      var lv = VT.lvl, curN = lv == null ? 0 : Math.round(Math.max(1, Math.min(10, lv)));
      var nw = document.getElementById("vt-now"); if (nw) nw.innerHTML = VT.mic ? "сейчас <b>" + (curN || "—") + "</b>" : "";
      Array.prototype.forEach.call(meter.querySelectorAll("[data-c]"), function (c) {
        var n = +c.getAttribute("data-c");
        c.classList.toggle("on", n <= curN);
        c.classList.toggle("tgt", cc && n === cc.lvl);
      });
      if (!VT.calPh && VT.mic) {
        if (lv != null && lv >= 8.5) { msg("Это уже 9 — тише. В пении 9 и 10 не используем", "warn"); VT.lvlWarn = true; }
        else if (VT.lvlWarn) { msg(null); VT.lvlWarn = false; }
      }
    }
  }
  function finish() {
    var s = section(), ex = exercise();
    VT.finished = true;
    markDone(s.id, ex.id);
    if (state.screen === "vt-rec") { recStop(); return; }
    haptic("success");
    var chip = app.querySelector('[data-vt-ex="' + VT.exIdx + '"]'); if (chip) chip.classList.add("ok");
    var tm = document.getElementById("vt-l"); if (tm) tm.textContent = "Готово";
    if (VT.exIdx < s.exercises.length - 1) VT.advTimer = setTimeout(function () { if (state.screen === "vt-ex") { VT.exIdx++; restartEx(); } }, 1600);
    else VT.advTimer = setTimeout(function () { if (state.screen === "vt-ex") { VT.doneFoil = true; go("vt-done"); } }, 1600);
  }
  function summaryLine() {
    var st = VT.stats, ex = exercise(), zp = st.voiced > 2 ? Math.round(st.inZone / st.voiced * 100) : null;
    return {
      ok: zp != null && zp >= 60 && st.over9 < 0.5,
      t: zp == null ? "Громкость: голос не услышан" : "Громкость: в своей цифре " + zp + "% времени" + (st.over9 >= 0.5 ? ", 9 и выше — " + st.over9.toFixed(1) + " с" : ""),
      n: ex.title + " · " + VOICES[VT.voice].label.toLowerCase() + " · цифра " + ex.lvl.join("→") + (zp == null ? " · громкость не измерена" : " · в цифре " + zp + "%, максимум " + st.max.toFixed(1) + (st.over9 >= 0.5 ? " · ⚠️ 9+ " + st.over9.toFixed(1) + " с" : ""))
    };
  }

  /* ---------- запись видео ---------- */
  var REC = { blob: null, url: "", chunks: [], mr: null, sendStatus: "" };
  function renderRec() {
    var s = section(), ex = exercise();
    if (VT.recPh === "review") { renderReview(); return; }
    build();
    VT.recPh = "setup";
    app.innerHTML =
      '<div class="tr-rec vt-rec tone-' + s.tone + '">' +
        '<div class="tr-rec-view"><div class="tr-rec-box">' +
          '<video id="vt-cam" class="tr-cam" playsinline muted autoplay></video>' +
          '<div class="tr-guide" aria-hidden="true"><div class="tr-guide-line top"><span>макушка</span></div><div class="tr-guide-line bot"><span>пояс</span></div></div>' +
          '<div class="tr-rec-top"><button type="button" class="tr-round dark" id="vt-rec-close" aria-label="Закрыть">' + svg(IC.close, 18) + "</button>" +
            '<div class="tr-rec-status" id="vt-rec-status">Включаю камеру…</div></div>' +
          '<div class="tr-cd" id="vt-cd"></div>' +
          '<div class="vt-cam-ring">' + ringHtml("vtr") + "</div>" +
          '<div class="tr-rec-dot" id="vt-rec-dot"><i></i><span id="vt-rec-time">0:00</span></div>' +
        "</div></div>" +
        '<div class="tr-lane tr-lane-rec vt-lane" style="height:118px">' + laneSvg(118) + '<div class="tr-hit"></div><div class="tr-fade"></div></div>' +
        '<div class="vt-rec-meter">' + meterHtml() + "</div>" +
        '<div class="tr-rec-bar"><div class="tr-rec-info"><b>' + h(ex.title) + '</b><span id="vt-rec-hint">Поставь телефон так, чтобы макушка и пояс были на линиях</span></div>' +
          '<button type="button" class="tr-rec-btn" id="vt-rec-go" aria-label="Начать запись" disabled><i></i></button></div>' +
        '<div class="tr-rec-alt" id="vt-rec-alt" hidden>' +
          '<button type="button" class="tr-btn ghost" id="vt-cam-retry">' + svg(IC.redo, 18) + "Ещё раз</button>" +
          '<label class="tr-btn main">' + svg(IC.cam, 18) + 'Снять или выбрать видео<input type="file" accept="video/*" id="vt-native" style="display:none;"></label>' +
          ((tg && state.accessToken && !window.GUEST_ON) ? '<button type="button" class="tr-btn ghost wide" id="vt-safari">Открыть в Safari — там камера работает вместе с лентой</button>' : "") +
        "</div>" +
      "</div>";
    fixGapLabels(118);
    on("vt-rec-close", function () { handleBack(); });
    on("vt-rec-go", function () { if (VT.recPh === "rec") { VT.finished = true; recStop(); } else countdown(); });
    on("vt-cam-retry", startCamera);
    on("vt-safari", function () { try { tg.openLink(location.origin + "/?k=" + encodeURIComponent(state.accessToken)); } catch (e) {} });
    var nat = document.getElementById("vt-native");
    if (nat) nat.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      REC.blob = f; if (REC.url) URL.revokeObjectURL(REC.url); REC.url = URL.createObjectURL(f);
      VT.native = true; toReview();
    });
    startAudio(true);
    paint();
    startLoop();
    startCamera();
  }
  function recStatus(t, k) { var el = document.getElementById("vt-rec-status"); if (el) { el.textContent = t; el.className = "tr-rec-status" + (k ? " " + k : ""); } }
  function recHint(t) { var el = document.getElementById("vt-rec-hint"); if (el) el.textContent = t; }
  function startCamera() {
    audioForRecord();
    var alt = document.getElementById("vt-rec-alt"); if (alt) alt.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFail({ name: "NoMediaDevices" }); return; }
    var tries = [{ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } }, audio: AUDIO_RAW }, { video: { facingMode: "user" }, audio: AUDIO_RAW }, { video: true, audio: true }];
    var i = 0, lastE = null;
    (function attempt() {
      if (i >= tries.length) { camFail(lastE); return; }
      navigator.mediaDevices.getUserMedia(tries[i]).then(camReady).catch(function (e) {
        lastE = e; i++;
        if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) { camFail(e); return; }
        attempt();
      });
    })();
  }
  function camReady(st) {
    if (state.screen !== "vt-rec") { st.getTracks().forEach(function (t) { t.stop(); }); return; }
    VT.stream = st;
    ls("trainerCamOk", "1");
    var v = document.getElementById("vt-cam"); if (v) { v.srcObject = st; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    if (VT.mic) VT.mic.close();
    try { VT.mic = new Mic(st); } catch (e) { VT.mic = null; }
    if (VT.mic && (!VT.cal || VT.forceCal)) beginCal();
    recStatus("Встань в рамку", "");
    var b = document.getElementById("vt-rec-go"); if (b) b.disabled = false;
  }
  function camFail(err) {
    var n = (err && err.name) || "Error";
    recStatus(n === "NotAllowedError" || n === "SecurityError" ? "Камера запрещена (" + n + ")" : "Камера не включилась (" + n + ")", "warn");
    recHint(n === "NotAllowedError" ? "Разреши камеру в настройках iPhone или сними видео сам — кнопкой ниже" : "Можно снять видео камерой телефона — кнопкой ниже");
    var alt = document.getElementById("vt-rec-alt"); if (alt) alt.hidden = false;
    if (window.trackEv) trackEv("vt_cam_error", { error: n });
  }
  function countdown() {
    if (!VT.stream || VT.calPh) return;
    var b = document.getElementById("vt-rec-go"); if (b) b.disabled = true;
    var cd = document.getElementById("vt-cd"), n = 3;
    (function step() {
      if (state.screen !== "vt-rec") return;
      if (n === 0) { if (cd) cd.classList.remove("on"); recStart(); return; }
      if (cd) { cd.textContent = String(n); cd.classList.add("on"); }
      haptic(); n--; setTimeout(step, 800);
    })();
  }
  function recStart() {
    var mime = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"].filter(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m); })[0];
    var o = { videoBitsPerSecond: 650000, audioBitsPerSecond: 96000 }; if (mime) o.mimeType = mime;
    var mr;
    try { mr = new MediaRecorder(VT.stream, o); } catch (e) { try { mr = new MediaRecorder(VT.stream); } catch (e2) { camFail({ name: "NoRecorder" }); return; } }
    REC.chunks = []; REC.mr = mr; REC.discard = false;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) REC.chunks.push(e.data); };
    mr.onstop = function () {
      if (REC.discard) { REC.discard = false; return; }
      var type = (mr.mimeType || mime || "video/mp4").split(";")[0];
      REC.blob = new Blob(REC.chunks, { type: type });
      if (REC.url) URL.revokeObjectURL(REC.url); REC.url = URL.createObjectURL(REC.blob);
      toReview();
    };
    build();
    VT.native = false;
    mr.start(1000);
    VT.recPh = "rec"; VT.recAt = performance.now();
    var b = document.getElementById("vt-rec-go"); if (b) { b.disabled = false; b.classList.add("stop"); b.setAttribute("aria-label", "Остановить"); }
    var dot = document.getElementById("vt-rec-dot"); if (dot) dot.classList.add("on");
    recStatus("Идёт запись", "rec");
    recHint("Пой вместе с пианино. Запись остановится сама после последнего круга");
    VT.recTimer = setInterval(function () { var el = document.getElementById("vt-rec-time"); if (!el || VT.recPh !== "rec") { clearInterval(VT.recTimer); return; } el.textContent = fmt((performance.now() - VT.recAt) / 1000); }, 500);
    if (window.trackEv) trackEv("vt_rec_start", { section: VT.sid, exercise: exercise().id });
  }
  function recStop() {
    clearInterval(VT.recTimer);
    VT.recDur = Math.round((performance.now() - (VT.recAt || performance.now())) / 1000);
    if (REC.mr && REC.mr.state !== "inactive") { try { REC.mr.stop(); } catch (e) { toReview(); } }
    else toReview();
  }
  function releaseMedia() {
    if (VT.stream) { VT.stream.getTracks().forEach(function (t) { t.stop(); }); VT.stream = null; }
    if (VT.micStream) { VT.micStream.getTracks().forEach(function (t) { t.stop(); }); VT.micStream = null; }
    if (VT.mic) { VT.mic.close(); VT.mic = null; }
    audioForPlay();
  }
  function toReview() {
    stopLoop();
    if (VT.piano) { VT.piano.close(); VT.piano = null; }
    releaseMedia();
    VT.recPh = "review"; REC.sendStatus = "";
    VT.sum = summaryLine();
    if (state.screen === "vt-rec") renderReview();
  }
  function renderReview() {
    var st = REC.sendStatus, sum = VT.native ? { ok: null, t: "Видео снято камерой телефона — громкость не измерена", n: exercise().title + " · видео снято камерой телефона" } : VT.sum || summaryLine();
    var sendTxt = st === "sending" ? "Отправляю Николаю…" : st === "sent" ? "Отправлено Николаю ✓" : st === "error" ? "Не отправилось — ещё раз" : "Отправить Николаю";
    app.innerHTML =
      '<div class="tr-rec vt-rec tone-' + section().tone + '">' +
        '<div class="tr-rec-view"><div class="tr-rec-box"><video class="tr-cam tr-play" playsinline controls src="' + REC.url + '"></video>' +
          '<div class="tr-rec-top"><button type="button" class="tr-round dark" id="vt-rv-close" aria-label="Закрыть">' + svg(IC.close, 18) + "</button>" +
          '<div class="tr-rec-status ok">Запись готова' + (VT.recDur ? " · " + fmt(VT.recDur) : "") + "</div></div></div></div>" +
        '<div class="tr-review">' +
          '<div class="tr-review-t">' + h(exercise().title) + "</div>" +
          '<div class="tr-sum ' + (sum.ok === true ? "ok" : sum.ok === false ? "bad" : "") + '">' + h(sum.t) + "</div>" +
          (st === "sending" && REC.big ? '<div class="tr-prog"><div id="vt-prog" style="width:' + (REC.pct || 0) + '%"></div></div>' : "") +
          (window.GUEST_ON ? '<div class="tr-sum">В тест-драйве отправка видео закрыта — она откроется после записи на занятия.</div>' : "") +
          '<div class="tr-review-btns">' +
            '<button type="button" class="tr-btn ghost" id="vt-redo">Ещё раз</button>' +
            '<button type="button" class="tr-btn main" id="vt-send"' + (window.GUEST_ON || st === "sending" || st === "sent" ? " disabled" : "") + ">" + sendTxt + "</button>" +
          "</div>" +
          (st === "sent" ? '<button type="button" class="tr-btn next" id="vt-next">' + (VT.exIdx < section().exercises.length - 1 ? "Следующее упражнение" : "Готово") + "</button>" : "") +
        "</div>" +
      "</div>";
    on("vt-rv-close", function () { handleBack(); });
    on("vt-redo", function () { VT.recPh = "setup"; render(); });
    on("vt-send", function () { send(sum); });
    on("vt-next", function () {
      VT.recPh = null;
      if (VT.exIdx < section().exercises.length - 1) { VT.exIdx++; go("vt-ex"); }
      else { VT.doneFoil = true; go("vt-done"); }
    });
  }
  function send(sum) {
    if (!REC.blob || REC.sendStatus === "sending" || REC.sendStatus === "sent") return;
    var ext = (String(REC.blob.name || "").match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || (/mp4/.test(REC.blob.type) ? "mp4" : /quicktime/.test(REC.blob.type) ? "mov" : "webm");
    var name = "Распевки — " + exercise().title.replace(/[«»"]/g, "") + "." + ext;
    var note = "🎹 " + sum.n;
    REC.sendStatus = "sending"; REC.big = REC.blob.size > MAX_UPLOAD_BYTES; REC.pct = 0; renderReview();
    function done(s) {
      if (s === "sending") return;
      REC.sendStatus = s === "sent" ? "sent" : "error";
      if (s === "sent") {
        markSent(VT.sid);
        state.warmupFiles.push({ name: name, status: "sent" }); saveState();
        maybeCelebrate();
        if (window.trackEv) trackEv("vt_video", { section: VT.sid, exercise: exercise().id });
      }
      if (state.screen === "vt-rec" && VT.recPh === "review") renderReview();
    }
    readVideoMeta(REC.blob).then(function (meta) {
      meta = meta || {}; meta.note = note; if (!meta.duration) meta.duration = VT.recDur;
      if (REC.big && window.trainerSendBig) {
        trainerSendBig(REC.blob, name, note, meta, function (p) { REC.pct = p; var f = document.getElementById("vt-prog"); if (f) f.style.width = p + "%"; })
          .then(function () { done("sent"); }).catch(function () { done("error"); });
        return;
      }
      submitFile("warmup", REC.blob, done, name, meta);
    });
  }

  /* ---------- финальная заставка раздела (как «Тест пройден») ---------- */
  function renderDone() {
    var s = section(), n = s.exercises.length, full = sectionFull(s);
    app.innerHTML =
      '<div class="quiz-result-screen tr-done tone-' + s.tone + '">' +
        '<div class="qr-center">' +
          '<div class="result-badge tr-done-badge">' + svg(s.icon, 30) + "</div>" +
          '<div class="result-title">' + h(s.title) + ": готово</div>" +
          '<div class="result-sub">' + n + " " + pl(n, "упражнение", "упражнения", "упражнений") + " · " + (sentToday(s.id) ? "видео отправлено Николаю" : "видео Николаю не отправлено") + "</div>" +
        "</div>" +
        '<button type="button" class="cta terra qr-cta" id="vt-done-ok">К распевкам</button>' +
      "</div>";
    wireActs();
    on("vt-done-ok", function () { go("warmups"); });
    if (window.trackEv) trackEv("vt_section_done", { section: s.id, full: full });
    if (VT.doneFoil && full && window.playFoilConfetti) window.playFoilConfetti(app.querySelector(".tr-done"));
    VT.doneFoil = false;
  }

  /* ---------- экспорт ---------- */
  window.renderVoiceTrainer = function () {
    if (state.screen === "vt-rec") renderRec();
    else if (state.screen === "vt-done") renderDone();
    else renderEx();
  };
  window.voiceTrainerStopAll = function () {
    stopLoop();
    clearTimeout(VT.advTimer);
    clearInterval(VT.recTimer);
    if (REC.mr && REC.mr.state !== "inactive") { REC.discard = true; try { REC.mr.stop(); } catch (e) {} }
    REC.mr = null;
    if (VT.piano) { VT.piano.close(); VT.piano = null; }
    if (VT.recPh !== "review") VT.recPh = null;
    releaseMedia();
    VT.calPh = null;
  };
  window.voiceTrainerBackTarget = function () {
    if (state.screen === "vt-rec") { VT.recPh = null; return "vt-ex"; }
    return "warmups";
  };
  window.voiceSectionsHtml = function () {
    var done = todayList(), st = streak();
    var html = '<div class="tr-today"><b>Сегодня сделано: ' + done.length + " " + pl(done.length, "упражнение", "упражнения", "упражнений") + "</b>" +
      "<span>" + (st > 0 ? st + " " + pl(st, "день", "дня", "дней") + " подряд" : "Начни серию сегодня") + "</span></div>" +
      '<div class="tr-tempo vt-voice" role="group" aria-label="Голос" style="margin:12px 0;">' +
        ["high", "low"].map(function (v) { return '<button type="button" data-vt-voice-l="' + v + '"' + (VT.voice === v ? ' class="on"' : "") + ">" + VOICES[v].label + "</button>"; }).join("") +
      "</div>";
    SECTIONS.forEach(function (s) {
      var n = s.exercises.length, lv = [];
      s.exercises.forEach(function (x) { x.lvl.forEach(function (l) { lv.push(l); }); });
      var all = s.exercises.every(function (x) { return done.indexOf(s.id + ":" + x.id) !== -1; });
      html += '<button type="button" class="tr-card tone-' + s.tone + '" data-vt-open="' + s.id + '">' +
        '<span class="tr-card-ic">' + svg(s.icon) + "</span>" +
        '<span class="tr-card-tx"><span class="tr-card-t">' + h(s.title) + (all ? ' <span class="tr-card-ok">' + svg(IC.check, 14) + "сегодня</span>" : "") + "</span>" +
          '<span class="tr-card-d">' + h(s.desc) + "</span>" +
          '<span class="tr-card-m">' + n + " " + pl(n, "упражнение", "упражнения", "упражнений") + " · громкость " + Math.min.apply(null, lv) + "–" + Math.max.apply(null, lv) + "</span>" +
        "</span></button>";
    });
    return '<div class="tr-in-warmups">' + html + "</div>";
  };
  window.voiceWireSections = function () {
    each("[data-vt-open]", function (b) { VT.sid = b.getAttribute("data-vt-open"); VT.exIdx = 0; VT.paused = false; VT.recPh = null; go("vt-ex"); });
    each("[data-vt-voice-l]", function (b) { VT.voice = b.getAttribute("data-vt-voice-l"); ls(VOICE_KEY, VT.voice); render(); });
    if (window.segEnhance) segEnhance();
  };
  window.voiceRecalibrate = function () { VT.cal = null; VT.forceCal = true; };
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state && state.screen === "vt-ex" && !VT.paused) { VT.paused = true; if (VT.piano) VT.piano.suspend(); var p = document.getElementById("vt-pause"); if (p) p.innerHTML = svg(IC.play, 18); }
  });
})();
