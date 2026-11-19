/* ==========================================================================
   PaletteResolver — цвет фона караоке по обложке (20.11).

   1) fromPixels(): k-means по уменьшенной обложке 64×64 → доминантный цвет,
      второй по частоте, тёмный вариант, акцент (самый насыщенный заметный
      кластер) и признак «монотонная / ч/б».
   2) resolve(): из палитры (или, если обложка без цвета, из набора цветов
      в настройках) собирает фон: градиент base → deep (deep = base, темнее на
      45%), цвет текста (белый или тёмный, контраст ≥ 4.5 : 1 с обоими концами
      градиента) и цвет подсвеченной строки (акцент палитры, доведённый до
      контраста ≥ 4.5 : 1).

   Без DOM — чистые функции, поэтому те же файлы гоняют unit-тесты в Node
   (tests/palette-resolver.test.js).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PaletteResolver = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_CONTRAST = 4.5;
  var MONO_SAT = 0.12;      // средняя насыщенность ниже — обложка без цвета
  var MONO_SHARE = 0.85;    // один кластер занимает больше — тоже без цвета
  var DARKEN = 0.45;        // deep = base, темнее на 45%
  var TEXT_LIGHT = "#ffffff";
  var TEXT_DARK = "#14181b";

  /* Набор «Цвета фона» по умолчанию. Все достаточно тёмные, чтобы белый
     текст проходил 4.5 : 1 на обоих концах градиента (проверяет тест). */
  var PRESETS = [
    { id: "terra",   name: "Терракота",  hex: "#a94f37" },
    { id: "blue",    name: "Синий",      hex: "#2f5f8a" },
    { id: "emerald", name: "Изумрудный", hex: "#1d7458" },
    { id: "plum",    name: "Сливовый",   hex: "#6b3a7a" },
    { id: "indigo",  name: "Индиго",     hex: "#3b3f99" },
    { id: "wine",    name: "Бордо",      hex: "#8e2b3f" },
    { id: "teal",    name: "Бирюза",     hex: "#136a73" },
    { id: "olive",   name: "Олива",      hex: "#55632a" }
  ];

  /* ---------- цвет: hex / rgb / hsl / контраст ---------- */

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(c) {
    return "#" + c.map(function (v) {
      var s = Math.round(clamp(v, 0, 255)).toString(16);
      return s.length < 2 ? "0" + s : s;
    }).join("");
  }

  function rgbToHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(hsl) {
    var h = hsl[0], s = hsl[1], l = hsl[2];
    if (s === 0) return [l * 255, l * 255, l * 255];
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }

  /* Насыщенность «как видит глаз»: (max − min) / max (HSV). У HSL
     почти чёрные пиксели с крошечным оттенком получают s ≈ 1 — это врёт. */
  function saturation(c) {
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    return mx === 0 ? 0 : (mx - mn) / mx;
  }

  function luminance(c) {
    var a = c.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function contrast(a, b) {
    var ca = typeof a === "string" ? hexToRgb(a) : a, cb = typeof b === "string" ? hexToRgb(b) : b;
    var la = luminance(ca), lb = luminance(cb);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function darken(hex, amount) {
    var hsl = rgbToHsl(hexToRgb(hex));
    hsl[2] = hsl[2] * (1 - amount);
    return rgbToHex(hslToRgb(hsl));
  }

  function withLightness(hex, l) {
    var hsl = rgbToHsl(hexToRgb(hex));
    hsl[2] = clamp(l, 0, 1);
    return rgbToHex(hslToRgb(hsl));
  }

  /* Расстояние между цветами, примерно «как видит глаз» (redmean). */
  function distance(a, b) {
    var ca = typeof a === "string" ? hexToRgb(a) : a, cb = typeof b === "string" ? hexToRgb(b) : b;
    var rm = (ca[0] + cb[0]) / 2, dr = ca[0] - cb[0], dg = ca[1] - cb[1], db = ca[2] - cb[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }

  /* ---------- k-means ---------- */

  // Детерминированный генератор: одна и та же обложка → та же палитра.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function kmeans(px, k, iters) {
    var n = px.length, rnd = mulberry32(1);
    if (!n) return [];
    // k-means++: первый центр случайный, следующие — подальше от уже выбранных
    var cents = [px[Math.floor(rnd() * n)].slice()];
    var d2 = new Float64Array(n);
    while (cents.length < k) {
      var sum = 0;
      for (var i = 0; i < n; i++) {
        var best = Infinity;
        for (var c = 0; c < cents.length; c++) {
          var dr = px[i][0] - cents[c][0], dg = px[i][1] - cents[c][1], db = px[i][2] - cents[c][2];
          var dd = dr * dr + dg * dg + db * db;
          if (dd < best) best = dd;
        }
        d2[i] = best; sum += best;
      }
      if (sum === 0) break; // все пиксели одинаковые
      var pick = rnd() * sum, j = 0;
      for (; j < n - 1; j++) { pick -= d2[j]; if (pick <= 0) break; }
      cents.push(px[j].slice());
    }
    var K = cents.length, asg = new Int32Array(n), counts;
    for (var it = 0; it < iters; it++) {
      var acc = [], moved = false;
      counts = new Array(K).fill(0);
      for (c = 0; c < K; c++) acc.push([0, 0, 0]);
      for (i = 0; i < n; i++) {
        var bi = 0, bd = Infinity;
        for (c = 0; c < K; c++) {
          var r0 = px[i][0] - cents[c][0], g0 = px[i][1] - cents[c][1], b0 = px[i][2] - cents[c][2];
          var dist = r0 * r0 + g0 * g0 + b0 * b0;
          if (dist < bd) { bd = dist; bi = c; }
        }
        if (asg[i] !== bi) moved = true;
        asg[i] = bi; counts[bi]++;
        acc[bi][0] += px[i][0]; acc[bi][1] += px[i][1]; acc[bi][2] += px[i][2];
      }
      for (c = 0; c < K; c++) if (counts[c]) cents[c] = [acc[c][0] / counts[c], acc[c][1] / counts[c], acc[c][2] / counts[c]];
      if (!moved && it > 0) break;
    }
    var out = [];
    for (c = 0; c < K; c++) if (counts[c]) out.push({ rgb: cents[c], count: counts[c], share: counts[c] / n });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  /* Кластеры, которые глаз не различает (шум, градиент одного цвета),
     сливаем: иначе «один цвет на 90%» дробился на три кластера по 30%. */
  function mergeNear(cl, thr) {
    var out = [];
    cl.forEach(function (c) {
      var t = null;
      for (var i = 0; i < out.length; i++) if (distance(out[i].rgb, c.rgb) < thr) { t = out[i]; break; }
      if (!t) { out.push({ rgb: c.rgb.slice(), count: c.count, share: c.share }); return; }
      var n = t.count + c.count;
      t.rgb = [0, 1, 2].map(function (j) { return (t.rgb[j] * t.count + c.rgb[j] * c.count) / n; });
      t.count = n; t.share += c.share;
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  /* ---------- палитра по пикселям ---------- */

  /* data — RGBA (Uint8ClampedArray из canvas getImageData), обычно 64×64. */
  function fromPixels(data, w, h) {
    var px = [], satSum = 0, gray = 0;
    for (var i = 0; i < w * h; i++) {
      var o = i * 4;
      if (data[o + 3] < 128) continue; // прозрачное не считаем
      var c = [data[o], data[o + 1], data[o + 2]];
      px.push(c);
      satSum += saturation(c);
      if (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 18) gray++;
    }
    if (!px.length) return { mono: true, reason: "empty", clusters: [] };
    var avgSat = satSum / px.length;
    var grayShare = gray / px.length;
    var clusters = mergeNear(kmeans(px, 5, 14), 45);
    var top = clusters[0];

    var avg = [0, 0, 0];
    px.forEach(function (c) { avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2]; });
    avg = avg.map(function (v) { return v / px.length; });

    var reason = null;
    if (grayShare > 0.95) reason = "bw";
    else if (avgSat < MONO_SAT) reason = "low-saturation";
    else if (top.share > MONO_SHARE) reason = "single-cluster";

    var dominant = rgbToHex(top.rgb);
    var second = null;
    for (var k = 1; k < clusters.length; k++) {
      if (distance(clusters[k].rgb, top.rgb) > 60) { second = rgbToHex(clusters[k].rgb); break; }
    }
    // акцент — самый насыщенный кластер, который занимает хотя бы 4% картинки
    var accent = clusters.filter(function (c) { return c.share >= 0.04; })
      .sort(function (a, b) { return saturation(b.rgb) - saturation(a.rgb); })[0];

    return {
      mono: !!reason,
      reason: reason,
      dominant: dominant,
      second: second || darken(dominant, 0.25),
      dark: darken(dominant, DARKEN),
      accent: rgbToHex(accent.rgb),
      average: rgbToHex(avg),
      avgSat: Math.round(avgSat * 1000) / 1000,
      topShare: Math.round(top.share * 1000) / 1000
    };
  }

  /* ---------- фон, текст, подсветка ---------- */

  // Какой текст (белый/тёмный) лучше читается на обоих концах градиента.
  function textFor(base, deep) {
    var wl = Math.min(contrast(TEXT_LIGHT, base), contrast(TEXT_LIGHT, deep));
    var wd = Math.min(contrast(TEXT_DARK, base), contrast(TEXT_DARK, deep));
    return wl >= wd ? { text: TEXT_LIGHT, ratio: wl } : { text: TEXT_DARK, ratio: wd };
  }

  /* Из одного цвета — градиент и текст. Если ни белый, ни тёмный текст не
     дотягивают до 4.5 : 1 (средне-яркие цвета), base затемняется до прохода. */
  function gradientFrom(hex, theme) {
    var base = hex;
    if (theme === "dark") {
      var l = rgbToHsl(hexToRgb(base))[2];
      if (l > 0.42) base = withLightness(base, 0.42); // в тёмной теме фон не светится
    }
    var deep = darken(base, DARKEN), t = textFor(base, deep), guard = 0;
    while (t.ratio < MIN_CONTRAST && guard++ < 40) {
      base = darken(base, 0.06); deep = darken(base, DARKEN); t = textFor(base, deep);
    }
    return { base: base, deep: deep, text: t.text, ratio: Math.round(t.ratio * 100) / 100 };
  }

  /* Подсвеченная строка — акцент палитры, сдвинутый по яркости в сторону
     текста, пока не будет ≥ 4.5 : 1 к обоим концам фона. Не вышло — цвет текста. */
  function accentFor(accent, g) {
    if (!accent) return g.text;
    var hsl = rgbToHsl(hexToRgb(accent));
    if (hsl[1] < 0.2) return g.text; // серый акцент — не акцент
    var up = g.text === TEXT_LIGHT;
    for (var step = 0; step <= 40; step++) {
      var l = clamp(hsl[2] + (up ? 1 : -1) * step * 0.02, 0, 1);
      var c = rgbToHex(hslToRgb([hsl[0], Math.min(hsl[1], 0.9), l]));
      if (Math.min(contrast(c, g.base), contrast(c, g.deep)) >= MIN_CONTRAST) return c;
    }
    return g.text;
  }

  /* Случайный цвет из включённых: проходит контраст с текстом и заметно
     отличается от обложки (иначе обложка сливается с фоном). */
  function pickPreset(enabled, opts) {
    opts = opts || {};
    var rnd = opts.rng || Math.random;
    var list = (enabled || []).filter(function (h) { return !!hexToRgb(h); });
    if (!list.length) list = [PRESETS[0].hex];
    function ok(h, needCover) {
      // контраст проверяем у самого цвета, без затемнения: иначе «случайный»
      // светлый цвет молча превратился бы в другой
      if (textFor(h, darken(h, DARKEN)).ratio < MIN_CONTRAST) return false;
      if (needCover && opts.cover && distance(h, opts.cover) < 110) return false;
      return true;
    }
    var pool = list.filter(function (h) { return h !== opts.exclude && ok(h, true); });
    if (!pool.length) pool = list.filter(function (h) { return h !== opts.exclude && ok(h, false); });
    if (!pool.length) pool = list.filter(function (h) { return ok(h, false); });
    if (!pool.length) pool = list; // все включённые светлые — gradientFrom всё равно затемнит
    return pool[Math.floor(rnd() * pool.length) % pool.length];
  }

  /* Главная функция.
     palette — результат fromPixels или null (обложки нет / не прочиталась);
     opts.saved — цвет, сохранённый для трека (из «Перемешать цвет» или
     прошлого случайного выбора); opts.enabled — включённые цвета настроек;
     opts.theme — "dark" | "light"; opts.rng — для тестов. */
  function resolve(palette, opts) {
    opts = opts || {};
    var source, hex, accent = null;
    if (opts.saved && hexToRgb(opts.saved)) {
      source = "saved"; hex = opts.saved;
    } else if (palette && !palette.mono && palette.dominant) {
      source = "cover"; hex = palette.dominant; accent = palette.accent;
    } else {
      source = "preset";
      hex = pickPreset(opts.enabled, { rng: opts.rng, theme: opts.theme, cover: palette && palette.average });
    }
    var g = gradientFrom(hex, opts.theme);
    // второе пятно свечения: второй цвет обложки, иначе чуть сдвинутый base
    var glow2 = source === "cover" && palette.second ? palette.second : darken(g.base, 0.2);
    return {
      source: source,
      color: hex,           // что сохранить для трека
      base: g.base,
      deep: g.deep,
      glow2: glow2,
      text: g.text,
      textRatio: g.ratio,
      lightText: g.text === TEXT_LIGHT,
      accent: accentFor(accent, g)
    };
  }

  return {
    PRESETS: PRESETS,
    MIN_CONTRAST: MIN_CONTRAST,
    fromPixels: fromPixels,
    resolve: resolve,
    pickPreset: pickPreset,
    contrast: contrast,
    darken: darken,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    _kmeans: kmeans
  };
});
