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


  /* ---- Удар камертона: звук + затухающая вибрация ----
     Звук удара в оригинальном видео начинается на 1,05 с — синхронно с ним.
     Звук — оригинальная запись камертона из видео (splash/kamerton.m4a),
     пока она не загрузилась — синтез ля 440 Гц. Играет только если телефон разрешил звук без нажатия; в беззвучном
     режиме iPhone сам его глушит. Вибрация — Telegram HapticFeedback
     (вне Telegram на iPhone вибрации у веб-страниц нет). */
  var STRIKE = 1.05, struck = false, actx = null, forkBuf = null;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { actx = new AC(); if (actx.resume) actx.resume().catch(function () {}); }
  } catch (e) { actx = null; }
  if (actx && window.fetch) {
    fetch("/splash/kamerton.m4a").then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { actx.decodeAudioData(ab, function (b) { forkBuf = b; }, function () {}); })
      .catch(function () {});
  }
  function forkSound() {
    if (!actx || actx.state !== "running") return;
    if (forkBuf) {
      try { var src = actx.createBufferSource(); src.buffer = forkBuf; src.connect(actx.destination); src.start(); return; } catch (e) {}
    }
    try {
      var t = actx.currentTime + 0.01, out = actx.createGain();
      out.gain.value = 0.5; out.connect(actx.destination);
      function tone(f, g, dec) {
        var o = actx.createOscillator(), a = actx.createGain();
        o.type = "sine"; o.frequency.value = f;
        a.gain.setValueAtTime(0.0001, t);
        a.gain.exponentialRampToValueAtTime(g, t + 0.006);
        a.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(a); a.connect(out); o.start(t); o.stop(t + dec + 0.05);
      }
      tone(440, 0.55, 3.4);      // основной тон, долгое затухание
      tone(2760, 0.12, 0.35);    // металлический обертон удара (≈6,27×)
      tone(880, 0.04, 1.2);      // лёгкая вторая гармоника
    } catch (e) {}
  }
  function forkHaptic() {
    var tg = getTg(), h = tg && tg.HapticFeedback;
    if (!h || !h.impactOccurred) return;
    try { if (tg.isVersionAtLeast && !tg.isVersionAtLeast("6.1")) return; } catch (e) {}
    // от сильного к еле заметному, паузы растут — как гаснущий камертон
    var seq = [["heavy",0],["heavy",70],["medium",150],["medium",230],["medium",320],
               ["light",420],["light",530],["light",650],["light",780],["soft",930],
               ["soft",1100],["soft",1290],["soft",1500],["soft",1740],["soft",2010],["soft",2320],["soft",2680],["soft",3100]];
    seq.forEach(function (s) { setTimeout(function () { if (!gone) try { h.impactOccurred(s[0]); } catch (e) {} }, s[1]); });
  }
  function strike() { if (struck) return; struck = true; forkSound(); forkHaptic(); }
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
