/* «Сила голоса»: громкометр 1–10 (распевки) и разметка усилия в песне.
   Громкость меряем микрофоном без автоусиления. Шкала привязана к голосу
   ученика: в начале он говорит «а-а-а» спокойным разговорным голосом — это 3,
   дальше каждые ≈4,5 дБ — следующая цифра. 9 и 10 в заданиях не используем:
   это крик и предел, лекция прямо говорит, что так петь нельзя. */
(function () {
  "use strict";

  var C10 = ["#bfe3f7", "#acd4ea", "#99c4db", "#87b3cb", "#75a2ba", "#6390a8", "#527e96", "#416b82", "#c7716a", "#b24a45"];
  var NU = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "fffff"];
  var NW = ["очень-очень тихо", "очень тихо", "тихо", "чуть тише среднего", "чуть громче среднего", "громко", "очень громко", "очень-очень громко", "крик", "предел"];
  var STEP_DB = 4.5;          // дБ на одну цифру шкалы
  var TARGETS = [4, 2, 6, 3, 5, 7, 1, 8];
  var HOLD = 2;               // секунд удержать цифру
  var TGT_MAX = 12;           // секунд на одну цифру, потом дальше
  var CNT_BEAT = 1.2;         // счёт «ровно на 8»

  function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function dyn(s, sz) { return window.EffortAnim && EffortAnim.dyn ? EffortAnim.dyn(s, sz) : '<span class="ef-dt" style="font-size:' + Math.round(sz * 0.75) + 'px">' + s + "</span>"; }
  function warnIco(n) { return window.icoWarn ? icoWarn(n || 18) : "!"; }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function audioForRecord() { try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {} }
  function audioForPlay() { try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {} }

  /* ---------- микрофон и уровень ---------- */
  function Mic() {
    this.ctx = null; this.an = null; this.buf = null; this.db = -100; this.ema = -100;
  }
  Mic.prototype.attach = function (stream) {
    var AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === "suspended") this.ctx.resume();
    var src = this.ctx.createMediaStreamSource(stream);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048;
    src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
  };
  Mic.prototype.read = function (dt) {
    if (!this.an) return -100;
    if (this.an.getFloatTimeDomainData) this.an.getFloatTimeDomainData(this.buf);
    else { var b8 = new Uint8Array(this.an.fftSize); this.an.getByteTimeDomainData(b8); for (var j = 0; j < b8.length; j++) this.buf[j] = (b8[j] - 128) / 128; }
    var s = 0; for (var i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    var db = 10 * Math.log10(s / this.buf.length + 1e-12);
    var k = 1 - Math.exp(-dt / 0.12);
    this.ema = this.ema < -90 ? db : this.ema + (db - this.ema) * k;
    this.db = db;
    return this.ema;
  };
  Mic.prototype.close = function () { try { if (this.ctx) this.ctx.close(); } catch (e) {} this.ctx = null; this.an = null; };

  function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function levelOf(db, cal) { return 3 + (db - cal.anchor) / STEP_DB; }
  function voiced(db, cal) { return db > Math.max(cal.noise + 8, -62); }

  /* ---------- шкала (общая разметка) ---------- */
  function scaleHtml(id, opts) {
    opts = opts || {};
    var cells = "", nus = "";
    for (var i = 0; i < 10; i++) {
      cells += '<div class="ef-cell mt-cell' + (i >= 8 ? " no" : "") + '" data-c="' + (i + 1) + '" style="background:' + C10[i] + ";color:" + (i < 4 ? "#22282c" : "#f2f5f7") + '">' + (i + 1) + "</div>";
      var len = NU[i].length, sz = len >= 5 ? 10 : len === 4 ? 11.5 : len === 3 ? 13 : 15;
      nus += '<div class="ef-nu' + (i >= 8 ? " hot" : "") + '">' + dyn(NU[i], sz) + "</div>";
    }
    return '<div class="mt-scale" id="' + id + '">' +
      '<div class="ef-track"><div class="ef-line"></div><div class="ef-danger"></div><div class="ef-ring"></div><div class="ef-dot mt-dot"></div></div>' +
      '<div class="ef-cells">' + cells + "</div>" +
      '<div class="ef-nus">' + nus + "</div>" +
      (opts.ends === false ? "" : '<div class="ef-ends"><span>1 — почти без усилия</span><span>9–10 — не поём</span></div>') +
    "</div>";
  }
  function paintScale(root, lvl, target, band) {
    if (!root) return;
    var dot = root.querySelector(".mt-dot"), ring = root.querySelector(".ef-ring");
    var on = lvl != null;
    var v = on ? Math.max(0.5, Math.min(10.4, lvl)) : 0, red = on && v >= 8.5;
    dot.style.opacity = on ? "1" : ".25";
    if (on) { dot.style.left = ((v - 0.5) * 10) + "%"; ring.style.left = dot.style.left; }
    dot.style.background = red ? "#e24b4a" : "#3a8bb8";
    ring.style.animation = red ? "ef-pu 1s ease-out infinite" : "none";
    var cur = on ? Math.round(Math.max(1, Math.min(10, v))) : 0;
    Array.prototype.forEach.call(root.querySelectorAll(".mt-cell"), function (c) {
      var n = +c.getAttribute("data-c");
      var inBand = band && n >= band[0] && n <= band[1];
      c.classList.toggle("tgt", n === target || !!inBand);
      c.classList.toggle("cur", n === cur);
    });
  }

  /* ---------- распевки: экран громкометра ---------- */
  var MT = { phase: "off" };
  window.METER = MT;

  function stages() {
    var a = [
      { id: "quiet", dur: 1.6, t: "Тишина", d: "Помолчи секунду — меряю шум вокруг." },
      { id: "cal", dur: 4, t: "Калибровка", d: "Скажи «а-а-а» спокойно, как в обычном разговоре. Это будет твоя тройка." }
    ];
    TARGETS.forEach(function (n, i) {
      a.push({ id: "tgt", n: n, i: i, t: "Попади в " + n, d: "Спой «а» на удобной ноте — " + NW[n - 1] + ". Удержи " + HOLD + " секунды." });
    });
    a.push({ id: "siren", dur: 20, t: "Сирена на 4–5", d: "Губная вибрация снизу вверх и обратно. Держи 4–5: голос поднимается сам, громче не делаем." });
    a.push({ id: "count", dur: 8 * CNT_BEAT, t: "Ровно на 8 счётов", d: "Тонкое смыкание на одном выдохе. Ровно до конца — без «поддать» на последних счётах." });
    return a;
  }

  function resetRun() {
    MT.st = stages(); MT.si = 0; MT.sT = 0; MT.hold = 0;
    MT.cal = { noise: -70, anchor: -30, qs: [], cs: [], ok: false };
    MT.res = { tgt: [], siren: { inZ: 0, above: 0, voiced: 0 }, count: [], max: 0, over9: 0 };
    MT.lvl = null; MT.lastNow = 0; MT.elapsed = 0;
  }

  window.meterStopAll = function () {
    if (MT.raf) cancelAnimationFrame(MT.raf); MT.raf = 0;
    clearInterval(MT.timeTimer);
    if (MT.rec && MT.rec.state !== "inactive") { MT.discard = true; try { MT.rec.stop(); } catch (e) {} }
    MT.rec = null;
    if (MT.mic) { MT.mic.close(); MT.mic = null; }
    if (MT.stream) { MT.stream.getTracks().forEach(function (t) { t.stop(); }); MT.stream = null; }
    if (MT.phase === "run" || MT.phase === "setup") MT.phase = "off";
    audioForPlay();
  };

  window.openMeter = function (video) {
    MT.video = !!video; MT.phase = "setup"; MT.sendStatus = ""; MT.blob = null;
    if (MT.url) { URL.revokeObjectURL(MT.url); MT.url = null; }
    go("meter");
  };

  window.renderMeterScreen = function () {
    if (MT.phase === "review") { renderReview(); return; }
    MT.phase = "setup";
    resetRun();
    app.innerHTML =
      '<div class="tr-rec mt-rec">' +
        '<div class="mt-head"><button type="button" class="tr-round dark" id="mt-close" aria-label="Закрыть">' + closeIco() + "</button>" +
          '<div class="tr-rec-status" id="mt-status">' + (MT.video ? "Включаю камеру…" : "Включаю микрофон…") + "</div>" +
          '<div class="mt-time" id="mt-time" hidden>0:00</div></div>' +
        (MT.video
          ? '<div class="tr-rec-view mt-view"><div class="tr-rec-box">' +
              '<video id="mt-cam" class="tr-cam" playsinline muted autoplay></video>' +
              '<div class="tr-guide" aria-hidden="true"><div class="tr-guide-line top"><span>макушка</span></div><div class="tr-guide-line bot"><span>пояс</span></div></div>' +
            "</div></div>"
          : "") +
        '<div class="mt-panel' + (MT.video ? "" : " big") + '">' +
          '<div class="mt-stage" id="mt-stage"></div>' +
          scaleHtml("mt-scale") +
          '<div class="mt-warn" id="mt-warn" hidden>' + warnIco(18) + "<span>Это уже 9 — тише. В пении 9 и 10 не используем.</span></div>" +
          '<div class="mt-bar">' +
            '<div class="mt-bar-tx" id="mt-hint">' + (MT.video ? "Поставь телефон так, чтобы макушка и пояс были в рамке, и нажми запись." : "Нажми кнопку и начинай с тишины.") + "</div>" +
            '<button type="button" class="tr-rec-btn' + (MT.video ? "" : " mt-go") + '" id="mt-go" aria-label="Начать" disabled><i></i></button>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.getElementById("mt-close").addEventListener("click", function () { handleBack(); });
    document.getElementById("mt-go").addEventListener("click", function () { if (MT.phase === "run") finishRun(true); else startRun(); });
    paintStage();
    paintScale(document.getElementById("mt-scale"), null, null);
    startMedia();
  };
  function closeIco() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'; }
  function status(t, k) { var el = document.getElementById("mt-status"); if (el) { el.textContent = t; el.className = "tr-rec-status" + (k ? " " + k : ""); } }
  function hint(t) { var el = document.getElementById("mt-hint"); if (el) el.textContent = t; }

  var AUDIO_RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  function startMedia() {
    audioForRecord();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { mediaFailed({ name: "NoMediaDevices" }); return; }
    var tries = MT.video
      ? [{ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } }, audio: AUDIO_RAW }, { video: { facingMode: "user" }, audio: AUDIO_RAW }, { video: true, audio: true }]
      : [{ audio: AUDIO_RAW }, { audio: true }];
    var i = 0, last = null;
    (function attempt() {
      if (i >= tries.length) { mediaFailed(last); return; }
      navigator.mediaDevices.getUserMedia(tries[i]).then(mediaReady).catch(function (e) {
        last = e; i++;
        if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) { mediaFailed(e); return; }
        attempt();
      });
    })();
  }
  function mediaReady(stream) {
    if (state.screen !== "meter") { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    MT.stream = stream;
    if (MT.video) {
      try { localStorage.setItem("trainerCamOk", "1"); } catch (e) {}
      var v = document.getElementById("mt-cam");
      if (v) { v.srcObject = stream; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      status("Встань в рамку", "");
    } else status("Микрофон готов", "ok");
    var b = document.getElementById("mt-go"); if (b) b.disabled = false;
  }
  function mediaFailed(err) {
    var n = (err && err.name) || "Error";
    status((n === "NotAllowedError" || n === "SecurityError" ? (MT.video ? "Камера или микрофон запрещены" : "Микрофон запрещён") : "Не включилось") + " (" + n + ")", "warn");
    hint(n === "NotAllowedError"
      ? "Разреши доступ в настройках iPhone и открой упражнение снова."
      : (window.tg ? "В Telegram запись может не открываться — попробуй без видео или открой приложение в Safari." : "Закрой и открой упражнение ещё раз."));
    if (window.trackEv) trackEv("meter_media_error", { error: n, video: MT.video ? 1 : 0 });
  }

  function startRun() {
    if (!MT.stream || MT.phase === "run") return;
    MT.mic = new Mic();
    try { MT.mic.attach(MT.stream); } catch (e) { status("Микрофон не отдаёт звук", "warn"); return; }
    if (MT.video) {
      var mime = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"].filter(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m); })[0];
      var o = { videoBitsPerSecond: 600000, audioBitsPerSecond: 96000 }; if (mime) o.mimeType = mime;
      var mr;
      try { mr = new MediaRecorder(MT.stream, o); } catch (e) { try { mr = new MediaRecorder(MT.stream); } catch (e2) { status("Запись видео здесь не поддерживается", "warn"); return; } }
      MT.rec = mr; MT.chunks = []; MT.discard = false;
      mr.ondataavailable = function (e) { if (e.data && e.data.size) MT.chunks.push(e.data); };
      mr.onstop = function () {
        if (MT.discard) { MT.discard = false; return; }
        var type = (mr.mimeType || mime || "video/mp4").split(";")[0];
        MT.blob = new Blob(MT.chunks, { type: type });
        if (MT.url) URL.revokeObjectURL(MT.url);
        MT.url = URL.createObjectURL(MT.blob);
        toReview();
      };
      mr.start(1000);
    }
    MT.phase = "run"; MT.startedAt = performance.now(); MT.lastNow = 0;
    var b = document.getElementById("mt-go"); if (b) { b.classList.add("stop"); b.setAttribute("aria-label", "Остановить"); }
    var tm = document.getElementById("mt-time"); if (tm) tm.hidden = false;
    status(MT.video ? "Идёт запись" : "Слушаю", MT.video ? "rec" : "ok");
    hint("Шаги переключаются сами. Остановить можно в любой момент — кнопкой справа.");
    MT.timeTimer = setInterval(function () {
      var el = document.getElementById("mt-time");
      if (!el || MT.phase !== "run") { clearInterval(MT.timeTimer); return; }
      el.textContent = fmt((performance.now() - MT.startedAt) / 1000);
    }, 500);
    MT.raf = requestAnimationFrame(tick);
    if (window.trackEv) trackEv("meter_start", { video: MT.video ? 1 : 0 });
  }

  function tick(now) {
    MT.raf = 0;
    if (MT.phase !== "run" || state.screen !== "meter") return;
    var dt = MT.lastNow ? Math.min(0.1, (now - MT.lastNow) / 1000) : 0.016; MT.lastNow = now;
    var db = MT.mic.read(dt), cal = MT.cal, st = MT.st[MT.si];
    MT.sT += dt;
    var isVoiced = cal.ok && voiced(db, cal);
    MT.lvl = isVoiced ? levelOf(db, cal) : null;
    if (st.id === "quiet") {
      cal.qs.push(db);
      if (MT.sT >= st.dur) { cal.noise = median(cal.qs) || -70; next(); }
    } else if (st.id === "cal") {
      if (db > cal.noise + 10) cal.cs.push(db);
      MT.lvl = db > cal.noise + 10 ? 3 : null;
      if (MT.sT >= st.dur) {
        if (cal.cs.length < 40 && MT.sT < 9) { hint("Не слышу — скажи «а-а-а» чуть громче или поднеси телефон ближе."); }
        else { cal.anchor = median(cal.cs) || (cal.noise + 25); cal.ok = true; next(); }
      }
    } else if (st.id === "tgt") {
      var ok = MT.lvl != null && Math.abs(MT.lvl - st.n) <= 0.6;
      MT.hold = ok ? MT.hold + dt : Math.max(0, MT.hold - dt * 0.5);
      if (MT.hold >= HOLD) { MT.res.tgt.push({ n: st.n, ok: true, t: MT.sT }); next(); }
      else if (MT.sT >= TGT_MAX) { MT.res.tgt.push({ n: st.n, ok: false }); next(); }
    } else if (st.id === "siren") {
      if (MT.lvl != null) {
        MT.res.siren.voiced += dt;
        if (MT.lvl >= 3.5 && MT.lvl <= 5.6) MT.res.siren.inZ += dt;
        if (MT.lvl > 5.6) MT.res.siren.above += dt;
      }
      if (MT.sT >= st.dur) next();
    } else if (st.id === "count") {
      if (MT.lvl != null) MT.res.count.push({ t: MT.sT, v: MT.lvl });
      if (MT.sT >= st.dur) next();
    }
    if (MT.lvl != null && st.id !== "cal") {
      if (MT.lvl > MT.res.max) MT.res.max = MT.lvl;
      if (MT.lvl >= 8.5) MT.res.over9 += dt;
    }
    if (MT.phase !== "run") return;
    paint();
    MT.raf = requestAnimationFrame(tick);
  }
  function next() {
    MT.si++; MT.sT = 0; MT.hold = 0;
    try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light"); } catch (e) {}
    if (MT.si >= MT.st.length) { finishRun(false); return; }
    paintStage();
  }
  function paintStage() {
    var el = document.getElementById("mt-stage"); if (!el) return;
    var st = MT.st[MT.si] || MT.st[MT.st.length - 1], total = MT.st.length;
    var big = st.id === "tgt" ? '<div class="mt-goal"><b style="background:' + C10[st.n - 1] + ";color:" + (st.n < 5 ? "#22282c" : "#f2f5f7") + '">' + st.n + "</b>" + dyn(NU[st.n - 1], 22) + "</div>"
      : st.id === "siren" ? '<div class="mt-goal"><b style="background:' + C10[3] + ';color:#22282c">4</b><b style="background:' + C10[4] + ';color:#f2f5f7">5</b></div>'
      : st.id === "count" ? '<div class="mt-goal mt-cnt" id="mt-cnt">1</div>'
      : "";
    el.innerHTML =
      '<div class="mt-stage-top"><span class="mt-stage-n">' + (MT.phase === "run" ? (MT.si + 1) + " / " + total : "Громкометр") + "</span>" +
        '<span class="mt-stage-t">' + h(MT.phase === "run" ? st.t : "Шкала усилия — по твоему голосу") + "</span></div>" +
      '<div class="mt-stage-row">' + (MT.phase === "run" ? big : "") +
        '<div class="mt-stage-d">' + h(MT.phase === "run" ? st.d : "Сначала секунда тишины и калибровка «а-а-а» как в разговоре. Потом попадаешь в цифры, сирена на 4–5 и ровный выдох на 8 счётов. Всего около двух минут.") + "</div></div>" +
      (MT.phase === "run" && st.id !== "quiet" ? '<div class="mt-hold"><i id="mt-hold-fill"></i></div>' : "");
  }
  function paint() {
    var st = MT.st[MT.si];
    var root = document.getElementById("mt-scale");
    paintScale(root, MT.lvl, st.id === "tgt" ? st.n : st.id === "cal" ? 3 : null, st.id === "siren" ? [4, 5] : null);
    var f = document.getElementById("mt-hold-fill");
    if (f) {
      var p = st.id === "tgt" ? MT.hold / HOLD : st.dur ? MT.sT / st.dur : 0;
      f.style.width = Math.min(100, p * 100).toFixed(1) + "%";
      f.className = st.id === "tgt" && MT.lvl != null && Math.abs(MT.lvl - st.n) <= 0.6 ? "ok" : "";
    }
    if (st.id === "count") { var c = document.getElementById("mt-cnt"); if (c) c.textContent = String(Math.min(8, Math.floor(MT.sT / CNT_BEAT) + 1)); }
    var w = document.getElementById("mt-warn"); if (w) w.hidden = !(MT.lvl != null && MT.lvl >= 8.5);
  }

  function finishRun(early) {
    if (MT.phase !== "run") return;
    MT.phase = "done"; MT.early = !!early;
    if (MT.raf) cancelAnimationFrame(MT.raf); MT.raf = 0;
    clearInterval(MT.timeTimer);
    MT.duration = Math.round((performance.now() - MT.startedAt) / 1000);
    if (MT.mic) { MT.mic.close(); MT.mic = null; }
    if (MT.rec && MT.rec.state !== "inactive") { try { MT.rec.stop(); } catch (e) {} }   // onstop → toReview
    else toReview();
    if (window.trackEv) trackEv("meter_done", { early: early ? 1 : 0, hit: MT.res.tgt.filter(function (x) { return x.ok; }).length });
  }
  function toReview() {
    if (MT.stream) { MT.stream.getTracks().forEach(function (t) { t.stop(); }); MT.stream = null; }
    audioForPlay();
    MT.phase = "review"; MT.sendStatus = "";
    if (state.screen === "meter") renderReview();
  }

  function summary() {
    var r = MT.res, out = [];
    var hit = r.tgt.filter(function (x) { return x.ok; }).length;
    out.push({ ok: hit >= Math.ceil(TARGETS.length * 0.6), t: "Попал в " + hit + " из " + TARGETS.length + " цифр", n: "Цифры: " + (r.tgt.map(function (x) { return x.n + (x.ok ? "✓" : "✗"); }).join(" ") || "—") });
    if (r.siren.voiced > 2) {
      var zp = Math.round(r.siren.inZ / r.siren.voiced * 100);
      out.push({ ok: zp >= 60 && r.siren.above < 3, t: "Сирена: в зоне 4–5 — " + zp + "% времени" + (r.siren.above >= 1 ? ", выше 5 — " + Math.round(r.siren.above) + " с" : ""), n: "Сирена: 4–5 " + zp + "%, выше 5 — " + Math.round(r.siren.above) + " с" });
    } else out.push({ ok: null, t: "Сирена: голос не услышан", n: "Сирена: не услышана" });
    if (r.count.length > 20) {
      var vs = r.count.map(function (p) { return p.v; }), mean = vs.reduce(function (a, b) { return a + b; }, 0) / vs.length;
      var sd = Math.sqrt(vs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / vs.length);
      var tail = r.count.filter(function (p) { return p.t > 6 * CNT_BEAT; }).map(function (p) { return p.v; });
      var tm = tail.length ? tail.reduce(function (a, b) { return a + b; }, 0) / tail.length : mean;
      var push = tm - mean > 0.8;
      out.push({ ok: sd < 0.8 && !push, t: "Счёт: " + (sd < 0.8 ? "ровно" : "неровно") + " (±" + sd.toFixed(1) + ")" + (push ? ", в конце поддал" : ""), n: "Счёт на 8: ±" + sd.toFixed(1) + (push ? ", поддал в конце" : "") });
    } else out.push({ ok: null, t: "Счёт: голос не услышан", n: "Счёт: не услышан" });
    if (r.over9 >= 0.5) out.push({ ok: false, t: "Был уровень 9 и выше — " + r.over9.toFixed(1) + " с. Петь так нельзя, в следующий раз тише.", n: "⚠️ 9+ — " + r.over9.toFixed(1) + " с" });
    return out;
  }

  function renderReview() {
    var sum = summary(), st = MT.sendStatus;
    var sendTxt = st === "sending" ? "Отправляю Николаю…" : st === "sent" ? "Отправлено Николаю ✓" : st === "error" ? "Не отправилось — ещё раз" : "Отправить Николаю";
    app.innerHTML =
      '<div class="tr-rec mt-rec">' +
        '<div class="mt-head"><button type="button" class="tr-round dark" id="mt-close" aria-label="Закрыть">' + closeIco() + "</button>" +
          '<div class="tr-rec-status ok">' + (MT.video ? "Запись готова · " + fmt(MT.duration || 0) : "Готово · " + fmt(MT.duration || 0)) + "</div></div>" +
        (MT.video && MT.url ? '<div class="tr-rec-view mt-view"><div class="tr-rec-box"><video class="tr-cam tr-play" playsinline controls src="' + MT.url + '"></video></div></div>' : "") +
        '<div class="tr-review mt-review">' +
          '<div class="tr-review-t">Громкометр' + (MT.early ? " · остановлено раньше" : "") + "</div>" +
          sum.map(function (s) { return '<div class="tr-sum ' + (s.ok === true ? "ok" : s.ok === false ? "bad" : "") + '">' + h(s.t) + "</div>"; }).join("") +
          (st === "sending" && MT.big ? '<div class="tr-prog"><div id="mt-prog" style="width:' + (MT.upPct || 0) + '%"></div></div>' : "") +
          (MT.video && window.GUEST_ON ? '<div class="tr-sum">В тест-драйве отправка видео закрыта — она откроется после записи на занятия.</div>' : "") +
          '<div class="tr-review-btns">' +
            '<button type="button" class="tr-btn ghost" id="mt-redo">Ещё раз</button>' +
            (MT.video
              ? '<button type="button" class="tr-btn main" id="mt-send"' + (window.GUEST_ON || st === "sending" || st === "sent" ? " disabled" : "") + ">" + sendTxt + "</button>"
              : '<button type="button" class="tr-btn main" id="mt-rec-video">Записать с видео</button>') +
          "</div>" +
          (st === "sent" || !MT.video ? '<button type="button" class="tr-btn next" id="mt-fin">Вернуться к распевкам</button>' : "") +
        "</div>" +
      "</div>";
    document.getElementById("mt-close").addEventListener("click", function () { handleBack(); });
    document.getElementById("mt-redo").addEventListener("click", function () { MT.phase = "setup"; renderMeterScreen(); });
    var rv = document.getElementById("mt-rec-video"); if (rv) rv.addEventListener("click", function () { MT.video = true; MT.phase = "setup"; renderMeterScreen(); });
    var fin = document.getElementById("mt-fin"); if (fin) fin.addEventListener("click", function () { MT.phase = "off"; go("warmups"); });
    var sb = document.getElementById("mt-send"); if (sb) sb.addEventListener("click", function () { send(sum); });
  }

  function send(sum) {
    if (!MT.blob || MT.sendStatus === "sending" || MT.sendStatus === "sent") return;
    var ext = /mp4/.test(MT.blob.type) ? "mp4" : /quicktime/.test(MT.blob.type) ? "mov" : "webm";
    var name = "Громкометр." + ext;
    var note = "🎚 Громкометр · " + sum.map(function (s) { return s.n; }).join(" · ") + " · максимум " + MT.res.max.toFixed(1);
    MT.sendStatus = "sending"; MT.big = MT.blob.size > MAX_UPLOAD_BYTES; MT.upPct = 0; renderReview();
    function done(s) {
      if (s === "sending") return;
      MT.sendStatus = s === "sent" ? "sent" : "error";
      if (s === "sent") {
        state.warmupFiles.push({ name: name, status: "sent" });
        saveState();
        maybeCelebrate();
        if (window.trackEv) trackEv("meter_video", { hit: MT.res.tgt.filter(function (x) { return x.ok; }).length });
      }
      if (state.screen === "meter" && MT.phase === "review") renderReview();
    }
    readVideoMeta(MT.blob).then(function (meta) {
      meta = meta || {}; meta.note = note; if (!meta.duration) meta.duration = MT.duration;
      if (MT.big && window.trainerSendBig) {
        trainerSendBig(MT.blob, name, note, meta, function (p) { MT.upPct = p; var f = document.getElementById("mt-prog"); if (f) f.style.width = p + "%"; })
          .then(function () { done("sent"); }).catch(function () { done("error"); });
        return;
      }
      submitFile("warmup", MT.blob, done, name, meta);
    });
  }

  /* Карточки в «Распевках» урока */
  window.meterCardsHtml = function () {
    var ex = (LESSON && LESSON.warmups && LESSON.warmups.exercises) || [];
    var list = ex.map(function (e) {
      return '<div class="mt-ex"><span class="mt-ex-n">' + e.n + "</span><div><b>" + h(e.label1) + (e.label2 ? " " + h(e.label2) : "") + "</b>" +
        "<p>" + h(e.sub) + "</p>" + (e.how ? '<p class="mt-ex-how">' + h(e.how) + "</p>" : "") +
        (e.mistake ? '<p class="mt-ex-err"><b>Частая ошибка:</b> ' + h(e.mistake) + "</p>" : "") + "</div></div>";
    }).join("");
    return '<div class="mt-card">' +
        '<div class="mt-card-head"><span class="mt-card-ic">' + meterIco() + '</span><span><b>Громкометр</b><small>Телефон слушает голос и показывает усилие от 1 до 10</small></span></div>' +
        '<div class="mt-card-scale">' + scaleHtml("mt-demo", { ends: false }) + "</div>" +
        '<button type="button" class="cta mt-cta" data-meter="1">Записать видео для Николая</button>' +
        '<button type="button" class="mt-alt" data-meter="0">Потренироваться без видео</button>' +
      "</div>" +
      '<div class="section-label" style="margin:22px 0 8px;">Что внутри — по шагам</div>' + list;
  };
  window.meterWireCards = function () {
    Array.prototype.forEach.call(app.querySelectorAll("[data-meter]"), function (b) {
      b.addEventListener("click", function () { openMeter(b.getAttribute("data-meter") === "1"); });
    });
    var d = document.getElementById("mt-demo");
    if (d) paintScale(d, null, null, [4, 5]);
  };
  function meterIco() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e3c9bd" stroke-width="2" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/><path d="M6.5 13.5l1 .6M12 9.5v1.2M17.5 13.5l-1 .6"/></svg>';
  }

  /* ---------- упражнение с песней: усилие по строкам ---------- */
  var SG = { marks: null, after: null, mic: null, stream: null, raf: 0, line: -1, peaks: {} };
  function sgKey() { return "effSong." + ((LESSON && LESSON.id) || 2); }
  function sgLoad() {
    if (SG.marks) return;
    try { var o = JSON.parse(localStorage.getItem(sgKey())) || {}; SG.marks = o.m || {}; SG.after = o.a || {}; SG.peaks = o.p || {}; }
    catch (e) { SG.marks = {}; SG.after = {}; SG.peaks = {}; }
  }
  function sgSave() { try { localStorage.setItem(sgKey(), JSON.stringify({ m: SG.marks, a: SG.after, p: SG.peaks })); } catch (e) {} }
  function sgStopMic() {
    if (SG.raf) cancelAnimationFrame(SG.raf); SG.raf = 0;
    if (SG.mic) { SG.mic.close(); SG.mic = null; }
    if (SG.stream) { SG.stream.getTracks().forEach(function (t) { t.stop(); }); SG.stream = null; }
    SG.line = -1;
    audioForPlay();
  }
  window.effortSongStop = sgStopMic;

  window.effortSongAllMarked = function () {
    sgLoad();
    var lines = (LESSON && LESSON.song && LESSON.song.lines) || [];
    return lines.length > 0 && lines.every(function (_, i) { return SG.marks[i] != null && (SG.marks[i] < 6 || SG.after[i] != null); });
  };
  window.effortSongText = function () {
    sgLoad();
    var song = LESSON.song || {}, lines = song.lines || [];
    var out = [(song.trackTitle || "Куплет") + " — усилие по строкам (оценка ученика · замер громкометром):"];
    lines.forEach(function (t, i) {
      var m = SG.marks[i], a = SG.after[i], p = SG.peaks[i];
      out.push("«" + t + "» — " + (m != null ? m : "—") + (p != null ? " · замер " + p : "") + (a != null ? " → тише: " + a + (SG.peaks[i + "a"] != null ? " · замер " + SG.peaks[i + "a"] : "") : ""));
    });
    return out.join("\n");
  };

  function chipRow(i, which, cur) {
    var r = "";
    for (var n = 1; n <= 10; n++) {
      r += '<button type="button" class="es-chip' + (cur === n ? " on" : "") + (n >= 9 ? " hot" : "") + '" data-es="' + i + '" data-w="' + which + '" data-n="' + n + '" style="--c:' + C10[n - 1] + ";--t:" + (n < 5 ? "#22282c" : "#f2f5f7") + '">' + n + "</button>";
    }
    return '<div class="es-chips">' + r + "</div>";
  }
  function measBtn(i, which) {
    var k = which === "a" ? i + "a" : String(i), p = SG.peaks[k], live = String(SG.line) === k;
    return '<button type="button" class="es-meas' + (live ? " live" : "") + '" data-meas="' + k + '">' +
      (live ? '<span class="es-live" id="es-live">…</span> Стоп' : (p != null ? "Замер: " + p + " · ещё раз" : "Спеть и замерить")) + "</button>";
  }

  window.renderEffortSong = function () {
    sgLoad();
    var song = LESSON.song || {}, lines = song.lines || [];
    var marksLegend = (song.marks || []).map(function (m) { return '<div class="es-leg"><b>' + h(m.code) + "</b><span>" + h(m.desc) + "</span></div>"; }).join("");
    var cards = lines.map(function (t, i) {
      var m = SG.marks[i], a = SG.after[i];
      var badge = m != null ? '<span class="es-badge" style="background:' + C10[m - 1] + ";color:" + (m < 5 ? "#22282c" : "#f2f5f7") + '">' + m + "</span>" : '<span class="es-badge empty">?</span>';
      return '<div class="song-line-card es-line' + (m >= 6 ? " hi" : "") + '">' +
        '<div class="es-text">' + badge + "<span>" + h(t) + "</span></div>" +
        chipRow(i, "m", m) + measBtn(i, "m") +
        (m >= 6
          ? '<div class="es-again">' + warnIco(16) + "<span>Перепой эту строку тише и с меньшим количеством воздуха. Сколько теперь?</span></div>" + chipRow(i, "a", a) + measBtn(i, "a") +
            (a != null ? '<div class="es-diff">' + m + " → " + a + (a < m ? " — тише получилось, запомни это ощущение" : " — попробуй ещё тише: убери лишнее, а не добавляй") + "</div>" : "")
          : "") +
      "</div>";
    }).join("");
    app.innerHTML =
      stepHeader("Упражнение с песней", 4) +
      '<div class="song-body">' +
        '<div class="es-legend">' + marksLegend + "</div>" +
        (song.hint ? '<div class="song-hint">' + h(song.hint) + "</div>" : "") +
        (song.task ? '<div class="song-hint">' + h(song.task) + "</div>" : "") +
        '<div class="section-label" style="margin-top:0;">' + h(song.trackTitle || "Куплет") + "</div>" +
        '<div class="es-meter">' + scaleHtml("es-scale", { ends: false }) +
          '<div class="es-meter-tx">«Спеть и замерить» — телефон послушает строку и покажет громкость. Сначала один раз скажи «а-а-а» как в разговоре — это 3.</div>' +
          '<button type="button" class="es-cal" id="es-cal">' + (SG.cal ? "Калибровка готова · заново" : "Калибровка: сказать «а-а-а»") + "</button></div>" +
        cards +
        '<div class="section-label" style="margin:8px 0;">Видео, как поёшь куплет</div>' +
        '<div id="es-video-zone"></div>' +
      "</div>" +
      '<div class="final-cta-wrap"><button class="cta terra" data-act="finish-lesson"' + (effortSongAllMarked() ? "" : " disabled") + ">Завершить урок</button></div>";
    paintScale(document.getElementById("es-scale"), null, null);
    app.querySelectorAll("[data-es]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-es"), n = +b.getAttribute("data-n"), w = b.getAttribute("data-w");
        if (w === "m") { SG.marks[i] = n; if (n < 6) delete SG.after[i]; } else SG.after[i] = n;
        sgSave(); keepScroll(renderEffortSong);
      });
    });
    app.querySelectorAll("[data-meas]").forEach(function (b) {
      b.addEventListener("click", function () { toggleMeasure(b.getAttribute("data-meas")); });
    });
    document.getElementById("es-cal").addEventListener("click", function () { toggleMeasure("cal"); });
    renderVideoZone();
    wireActs();
  };
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  function micStart(cb) {
    if (SG.stream) { cb(); return; }
    audioForRecord();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ audio: AUDIO_RAW }).catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); })
      .then(function (s) {
        SG.stream = s; SG.mic = new Mic(); SG.mic.attach(s); cb();
      }).catch(function () {
        var t = document.querySelector(".es-meter-tx"); if (t) t.textContent = "Микрофон не включился — разреши его в настройках и попробуй снова. Цифры можно ставить и без замера.";
      });
  }
  function toggleMeasure(k) {
    if (SG.line !== -1) {               // уже слушаем — останавливаем и сохраняем
      var was = SG.line;
      finishMeasure();
      if (String(was) === String(k)) return;
    }
    micStart(function () {
      SG.line = k; SG.vals = []; SG.cs = []; SG.lastNow = 0;
      if (k === "cal") { var c = document.getElementById("es-cal"); if (c) c.textContent = "Скажи «а-а-а»… (нажми, чтобы закончить)"; }
      else keepScroll(renderEffortSong);
      SG.raf = requestAnimationFrame(sgTick);
      if (k === "cal") setTimeout(function () { if (SG.line === "cal") finishMeasure(); }, 4000);
    });
  }
  function sgTick(now) {
    SG.raf = 0;
    if (SG.line === -1 || state.screen !== "song") return;
    var dt = SG.lastNow ? Math.min(0.1, (now - SG.lastNow) / 1000) : 0.016; SG.lastNow = now;
    var db = SG.mic.read(dt), cal = SG.cal;
    if (SG.line === "cal") {
      SG.cs.push(db);
      paintScale(document.getElementById("es-scale"), null, 3);
    } else if (cal) {
      var lv = voiced(db, cal) ? levelOf(db, cal) : null;
      if (lv != null) SG.vals.push(lv);
      paintScale(document.getElementById("es-scale"), lv, null);
      var el = document.getElementById("es-live"); if (el) el.textContent = lv != null ? String(Math.round(Math.max(1, Math.min(10, lv)))) : "…";
    }
    SG.raf = requestAnimationFrame(sgTick);
  }
  function finishMeasure() {
    var k = SG.line;
    if (SG.raf) cancelAnimationFrame(SG.raf); SG.raf = 0;
    SG.line = -1;
    if (k === "cal") {
      var s = SG.cs.slice().sort(function (a, b) { return a - b; });
      if (s.length > 20) {
        var noise = s[Math.floor(s.length * 0.1)], loud = s.filter(function (x) { return x > noise + 10; });
        if (loud.length > 15) SG.cal = { noise: noise, anchor: median(loud) };
      }
    } else if (SG.vals && SG.vals.length > 8) {
      var v = SG.vals.slice().sort(function (a, b) { return a - b; });
      SG.peaks[k] = Math.round(Math.max(1, Math.min(10, v[Math.floor(v.length * 0.9)])));   // 90-й процентиль, без случайных пиков
      sgSave();
    }
    if (!SG.cal && k !== "cal") { var t = document.querySelector(".es-meter-tx"); if (t) t.textContent = "Сначала калибровка: нажми кнопку ниже и скажи «а-а-а» как в разговоре."; }
    keepScroll(renderEffortSong);
  }

  /* видео куплета: прикрепить или снять системной камерой */
  function renderVideoZone() {
    var z = document.getElementById("es-video-zone"); if (!z) return;
    var files = state.songFiles || [];
    z.innerHTML = files.map(function (f) {
      var t = f.status === "sending" ? "Отправляю Николаю…" + (f.pct ? " " + f.pct + "%" : "") : f.status === "sent" ? "Отправлено Николаю ✓" : f.status === "error" ? "Не отправилось — прикрепи ещё раз" : "";
      return '<div class="hw-attached"><div style="flex:1;"><div class="hw-name">' + h(f.name) + '</div><div class="hw-hint' + (f.status === "error" ? " error" : "") + '">' + t + "</div></div></div>";
    }).join("") +
      (window.GUEST_ON ? '<div class="song-hint">В тест-драйве отправка видео закрыта.</div>'
        : '<label class="hw-upload wide"><input type="file" accept="video/*" id="es-file" style="display:none;">Снять или прикрепить видео</label>');
    var inp = document.getElementById("es-file");
    if (inp) inp.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0]; if (!file) return;
      var item = { name: file.name || "Куплет.mp4", status: "sending" };
      state.songFiles.push(item); saveState(); renderVideoZone();
      var note = "🎚 Сила голоса · песня\n" + effortSongText();
      readVideoMeta(file).then(function (meta) {
        meta = meta || {}; meta.note = note.slice(0, 390);
        var fin = function (s) { if (s === "sending") return; item.status = s === "sent" ? "sent" : "error"; saveState(); maybeCelebrate(); if (state.screen === "song") renderVideoZone(); };
        if (file.size > MAX_UPLOAD_BYTES && window.trainerSendBig) {
          trainerSendBig(file, item.name, note, meta, function (p) { item.pct = p; if (state.screen === "song") renderVideoZone(); }, "🎵 Песня (видео)")
            .then(function () { fin("sent"); }).catch(function () { fin("error"); });
        } else submitFile("song", file, fin, item.name, meta);
      });
    });
  }
})();
