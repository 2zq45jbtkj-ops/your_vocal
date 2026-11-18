/* Заставка при каждом открытии приложения.
   Логотип — кадры из оригинального видео (splash/logo.mp4: белый логотип на
   чёрном = маска). Каждый кадр рисуем в canvas, яркость → прозрачность,
   цвет — кремовый #F3F2EB, поэтому вибрация камертона совпадает с видео кадр в кадр.
   Заставка уходит, когда отыграла анимация (~4 с) И приложение отрисовалось. */
(function () {
  var root = document.getElementById("splash");
  if (!root) return;
  var v = root.querySelector("video"), c = root.querySelector("canvas");
  var x = c.getContext("2d", { willReadFrequently: true });
  var pill = root.querySelector(".sp-pill"), bar = root.querySelector(".sp-bar"), fill = bar.querySelector("i");
  var tg = window.Telegram && window.Telegram.WebApp;
  var DARK = "#232d3b", animDone = false, gone = false, t0 = Date.now();

  function tgColor(col) { try { if (tg) { tg.setHeaderColor(col); tg.setBackgroundColor(col); } } catch (e) {} }
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
      if (typeof window.applyDarkMode === "function") { try { window.applyDarkMode(); } catch (e) {} }
      else tgColor("#F1EEE8");
      setTimeout(function () { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} root.remove(); }, 500);
    }, 380);
  }
})();
