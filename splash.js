/* Заставка при каждом открытии приложения.
   Логотип — кадры из оригинального видео (splash/logo.mp4: белый логотип на
   чёрном = маска). Каждый кадр рисуем в canvas, яркость → прозрачность,
   цвет — кремовый #F3F2EB, поэтому вибрация камертона совпадает с видео кадр в кадр.
   Заставка уходит, когда отыграла анимация (~4 с) И приложение отрисовалось. */
(function () {
  var root = document.getElementById("splash");
  if (!root) return;
  window.__splashOn = true;
  var v = root.querySelector("video"), c = root.querySelector("canvas");
  var x = c.getContext("2d", { willReadFrequently: true });
  var pill = root.querySelector(".sp-pill"), bar = root.querySelector(".sp-bar"), fill = bar.querySelector("i");
  var SPLASH_TOP = "#2f3f52";
  function getTg() { return window.Telegram && window.Telegram.WebApp; }
  var meta = document.querySelector('meta[name="theme-color"]');
  // Верх экрана (часы, размытие iOS) — в цвет заставки, без светлой плашки
  document.documentElement.style.backgroundColor = SPLASH_TOP;
  if (meta) meta.setAttribute("content", SPLASH_TOP);
  var DARK = SPLASH_TOP, animDone = false, gone = false, t0 = Date.now();

  function tgColor(col) { try { var tg = getTg(); if (tg) { tg.setHeaderColor(col); tg.setBackgroundColor(col); } } catch (e) {} }
  tgColor(DARK);
  // app.js при запуске красит шапку Telegram в светлый — держим тёмный, пока видна заставка
  var keep = setInterval(function () { if (gone) clearInterval(keep); else tgColor(DARK); }, 250);

  function draw() {
    try {
      x.clearRect(0, 0, 880, 392); x.drawImage(v, 0, 0, 880, 392);
      var d = x.getImageData(0, 0, 880, 392), p = d.data;
      for (var i = 0; i < p.length; i += 4) {
        var a = p[i] - 12; a = a < 0 ? 0 : a * 1.05;
        p[i] = 243; p[i + 1] = 242; p[i + 2] = 235; p[i + 3] = a > 255 ? 255 : a;
      }
      x.putImageData(d, 0, 0);
    } catch (e) {}
  }
  var useVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
  function loop() {
    draw();
    if (v.ended || gone) return;
    if (useVFC) v.requestVideoFrameCallback(loop); else requestAnimationFrame(loop);
  }
  function showStatic() { // автозапуск запрещён — сразу последний кадр
    v.addEventListener("seeked", draw, { once: true });
    try { v.currentTime = 3.75; } catch (e) {}
  }
  function start() {
    var pr = v.play();
    if (pr && pr.catch) pr.catch(showStatic);
    loop();
  }
  v.addEventListener("ended", draw);
  if (v.readyState >= 2) start(); else v.addEventListener("loadeddata", start, { once: true });
  v.addEventListener("error", showStatic);


  /* ---- Удар камертона: только звук, без вибрации ----
     Оригинальная запись камертона из видео (splash/kamerton.m4a), удар —
     на 1,05 с анимации, как в видео. Телефоны запрещают звук до первого
     нажатия, поэтому пробуем по очереди Web Audio и аудио-элемент; если оба
     запрещены — звук включится от первого касания экрана. В беззвучном
     режиме iPhone звук не играет. */
  var STRIKE = 1.05, struck = false, actx = null, forkBuf = null, played = false, strikeAt = 0;
  // Звук подчиняется беззвучному режиму iPhone (как звуки игр), а не играет поверх него
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}
  var forkEl = null;
  try { forkEl = new Audio("/splash/kamerton.m4a"); forkEl.preload = "auto"; } catch (e) {}
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { actx = new AC(); if (actx.resume) actx.resume().catch(function () {}); }
  } catch (e) { actx = null; }
  if (actx && window.fetch) {
    fetch("/splash/kamerton.m4a").then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { actx.decodeAudioData(ab, function (b) { forkBuf = b; }, function () {}); })
      .catch(function () {});
  }
  function playBuffer(offset) {
    if (!forkBuf) return false;
    try {
      var src = actx.createBufferSource(); src.buffer = forkBuf; src.connect(actx.destination);
      src.start(0, Math.min(offset || 0, forkBuf.duration - 0.05)); return true;
    } catch (e) { return false; }
  }
  function playElement(offset) {
    if (!forkEl) return;
    try {
      if (offset) forkEl.currentTime = offset;
      var pr = forkEl.play();
      if (pr && pr.then) pr.then(function () { played = true; }).catch(function () {});
      else played = true;
    } catch (e) {}
  }
  function forkSound() {
    // 1) Web Audio — если телефон разрешил звук без нажатия
    if (actx && actx.state !== "running" && actx.resume) actx.resume().catch(function () {});
    if (actx && actx.state === "running" && playBuffer(0)) { played = true; return; }
    // 2) обычный аудио-элемент — в части Telegram-клиентов разрешён, когда Web Audio нет
    playElement(0);
  }
  /* Если система не дала звук сама — первое касание экрана во время заставки
     включает его с того места, где камертон звучал бы сейчас (не с начала). */
  function onTouch() {
    root.removeEventListener("pointerdown", onTouch);
    if (played) return;
    if (!struck) { try { if (actx && actx.resume) actx.resume(); } catch (e) {} root.addEventListener("pointerdown", onTouch, { once: true }); return; }
    var off = (Date.now() - strikeAt) / 1000;
    if (actx) {
      var go = function () { if (actx.state === "running" && playBuffer(off)) played = true; else playElement(off); };
      if (actx.state !== "running" && actx.resume) actx.resume().then(go, function () { playElement(off); }); else go();
    } else playElement(off);
  }
  root.addEventListener("pointerdown", onTouch, { once: true });
  function strike() { if (struck) return; struck = true; strikeAt = Date.now(); forkSound(); }
  (function watch() {
    if (struck || gone) return;
    if (v.currentTime >= STRIKE) { strike(); return; }
    if (v.ended || v.error) return;
    requestAnimationFrame(watch);
  })();
  setTimeout(function () { bar.classList.add("on"); }, 150);
  [[200, "18%", .5], [900, "42%", .9], [2000, "63%", .7], [2900, "81%", .8]].forEach(function (s) {
    setTimeout(function () { if (!gone) { fill.style.transition = "width " + s[2] + "s ease-in-out"; fill.style.width = s[1]; } }, s[0]);
  });
  setTimeout(function () { pill.classList.add("on"); }, 3100);
  setTimeout(function () { animDone = true; tryHide(); }, 4100);

  function appReady() { var a = document.getElementById("app"); return a && a.children.length > 0; }
  function tryHide() {
    if (gone || !animDone) return;
    if (!appReady() && Date.now() - t0 < 12000) { setTimeout(tryHide, 150); return; }
    gone = true;
    fill.style.transition = "width .35s ease-out"; fill.style.width = "100%";
    setTimeout(function () {
      root.classList.add("sp-out");
      document.documentElement.style.backgroundColor = "";
      window.__splashOn = false;
      if (typeof window.applyDarkMode === "function") { try { window.applyDarkMode(); } catch (e) {} }
      else tgColor("#F1EEE8");
      setTimeout(function () { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} root.remove(); try { if (actx) setTimeout(function () { actx.close(); }, 9000); } catch (e) {} }, 500);
    }, 380);
  }
})();
