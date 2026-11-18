/* breath-anim.js — анимации к лекции «Дыхание».

   1) Блок лекции { "type": "breath-anim" } → карточка «Дыхательный цикл»:
      анатомический вид спереди, 4 типа дыхания (верхнее / среднее / нижнее /
      двойной W), вдох и выдох по кругу. Всё рисуется кодом (SVG), никаких
      картинок: геометрия считается каждый кадр из трёх параметров —
        c — ключичный компонент (лестничные, ГКС: ключицы и 1–2 ребро вверх),
        r — рёберный (наружные межрёберные: «ручка ведра» нижних рёбер,
            «ручка насоса» верхних),
        d — диафрагмальный (купол опускается и уплощается, органы живота
            уходят вниз и вперёд, сердце едет вниз вместе с сухожильным центром).
   2) Кнопка «Газообмен в альвеолах» → полноэкранный слой: ацинус с циклом
      вдох → обмен → выдох и крупный план аэрогематического барьера.

   Монтируется сам: MutationObserver находит .banim-mount в #app. Цикл
   останавливается, когда карточка ушла из DOM или из поля зрения. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  function E(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function eio(t) { t = clamp(t, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function f1(n) { return (Math.round(n * 10) / 10).toString(); }
  function P(p) { return f1(p[0]) + " " + f1(p[1]); }
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(lerp(pa >> 16, pb >> 16, t)),
        g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t)),
        bl = Math.round(lerp(pa & 255, pb & 255, t));
    return "rgb(" + r + "," + g + "," + bl + ")";
  }
  // детерминированный «рандом» — частицы стабильны между кадрами
  function rnd(i, j) {
    var x = Math.sin(i * 127.1 + j * 311.7 + 7.13) * 43758.5453;
    return x - Math.floor(x);
  }

  /* Catmull-Rom → кубические безье */
  function crCtrl(pts, i, closed) {
    var n = pts.length;
    function g(k) { return closed ? pts[(k + n) % n] : pts[clamp(k, 0, n - 1)]; }
    var p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    return [p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2];
  }
  function crPath(pts, closed) {
    var n = pts.length, d = "M" + P(pts[0]);
    var segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var c = crCtrl(pts, i, closed);
      d += "C" + P(c[1]) + " " + P(c[2]) + " " + P(c[3]);
    }
    return d + (closed ? "Z" : "");
  }
  function crSample(pts, per) {
    var out = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++) {
      var c = crCtrl(pts, i, false);
      for (var s = 1; s <= per; s++) {
        var t = s / per, u = 1 - t;
        out.push([
          u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0],
          u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1]
        ]);
      }
    }
    return out;
  }
  function polyY(poly, x) {
    for (var i = 0; i < poly.length - 1; i++) {
      var a = poly[i], b = poly[i + 1];
      if ((x >= a[0] && x <= b[0]) || (x <= a[0] && x >= b[0])) {
        var t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
        return lerp(a[1], b[1], t);
      }
    }
    return x < poly[0][0] ? poly[0][1] : poly[poly.length - 1][1];
  }

  /* ===================================================================
     1. ДЫХАТЕЛЬНЫЙ ЦИКЛ
     =================================================================== */
  var X0 = 200;

  /* Передние отделы рёбер: l — латеральная точка, j — рёберно-хрящевое
     соединение, st — прикрепление хряща к грудине (истинные рёбра 1–7);
     8–10 — ложные: хрящ уходит в хрящ вышележащего ребра (to, t — доля по
     нему), формируя рёберную дугу; 11–12 — колеблющиеся, свободный конец. */
  var RIBS = [null,
    { l: [60, 138], j: [34, 150], st: [14, 141] },
    { l: [78, 150], j: [44, 170], st: [15, 162] },
    { l: [90, 166], j: [52, 194], st: [15, 182] },
    { l: [98, 184], j: [58, 218], st: [15, 201] },
    { l: [104, 204], j: [62, 242], st: [15, 221] },
    { l: [108, 226], j: [64, 266], st: [15, 243] },
    { l: [110, 250], j: [66, 292], st: [11, 265] },
    { l: [110, 276], j: [72, 318], to: 7, t: 0.35 },
    { l: [107, 302], j: [80, 338], to: 8, t: 0.42 },
    { l: [102, 326], j: [90, 356], to: 9, t: 0.33 },
    { l: [98, 350], j: [93, 376], free: true },
    { l: [88, 372], j: [85, 392], free: true }
  ];
  // смещения рёбер (px при параметре = 1)
  var UPC  = [0, 12, 9.5, 7, 5, 3.5, 2.5, 2, 1.5, 1.2, 1, 0.8, 0.5];
  var UPR  = [0, 1, 2, 3, 3.5, 4, 4.5, 4.5, 4.5, 4, 3.5, 3, 2];
  var OUTR = [0, 1, 2.5, 4, 5.5, 7, 8.5, 9.5, 10.5, 10.5, 10, 9, 7];
  var OUTC = [0, 1.5, 1.2, 0.8, 0.5, 0.3, 0, 0, 0, 0, 0, 0, 0];
  var DIA_DESC = 36;      // ход купола при глубоком диафрагмальном вдохе

  var MODES = [
    { key: "top", name: "1. Верхнее", c: 1, r: 0.22, d: 0.08,
      text: "<b>Ключичное.</b> Вдох делают лестничные и грудино-ключично-сосцевидные мышцы шеи: поднимаются ключицы, плечи и верхние рёбра. Диафрагма почти стоит — воздуха мало, а шея и гортань зажимаются." },
    { key: "mid", name: "2. Среднее", c: 0.04, r: 1, d: 0.32,
      text: "<b>Межрёберное.</b> Наружные межрёберные мышцы поднимают рёбра и разводят их в стороны — нижние как «ручка ведра», верхние как «ручка насоса». Грудная клетка шире, диафрагма опускается немного." },
    { key: "low", name: "3. Нижнее", c: 0, r: 0.14, d: 1,
      text: "<b>Диафрагмальное.</b> Диафрагма сокращается: купол уплощается и опускается, органы живота сдвигаются вниз — живот мягко выходит вперёд. Сердце опускается вместе с сухожильным центром. Плечи и грудь спокойны." },
    { key: "w", name: "4. Двойной (W)", c: 0.04, r: 1, d: 1, w: true,
      text: "<b>Двойной вдох.</b> Сначала диафрагма (живот), сразу следом, без паузы, — рёбра. На выдохе всё возвращается вместе. Самый большой объём — для длинных фраз и кульминаций." }
  ];
  var T_IN = 2.6, T_HOLD = 0.35, T_OUT = 3.6, T_REST = 0.7;
  var T_CYC = T_IN + T_HOLD + T_OUT + T_REST;

  function breathParams(mode, t) {
    t = ((t % T_CYC) + T_CYC) % T_CYC;
    var f, u = -1;
    if (t < T_IN) { u = t / T_IN; f = eio(u); }
    else if (t < T_IN + T_HOLD) f = 1;
    else if (t < T_IN + T_HOLD + T_OUT) f = 1 - eio((t - T_IN - T_HOLD) / T_OUT);
    else f = 0;
    var p = { c: mode.c * f, r: mode.r * f, d: mode.d * f, f: f, inhale: t < T_IN + T_HOLD, u: u, t: t };
    if (mode.w && u >= 0) {           // двойной: сначала диафрагма, затем рёбра
      p.d = mode.d * eio(u / 0.55);
      p.r = mode.r * eio((u - 0.42) / 0.58);
    }
    return p;
  }

  function ribGeo(i, s, p) {
    var R = RIBS[i];
    var up = p.c * UPC[i] + p.r * UPR[i];
    var out = p.r * OUTR[i] + p.c * OUTC[i];
    return {
      L: [X0 + s * (R.l[0] + out), R.l[1] - up],
      J: [X0 + s * (R.j[0] + out * 0.6), R.j[1] - up * 0.85]
    };
  }
  function sternDy(p) { return p.c * 7 + p.r * 3; }
  function cartilage(i, s, p, G) {         // [начало (у ребра), конец]
    var R = RIBS[i], J = G[i].J;
    if (R.st) return [J, [X0 + s * R.st[0], R.st[1] - sternDy(p)]];
    var prev = cartilage(R.to, s, p, G);
    return [J, [lerp(prev[0][0], prev[1][0], R.t), lerp(prev[0][1], prev[1][1], R.t)]];
  }
  function ribPath(i, J, L, s) {
    var k = i <= 3 ? 0.55 : i >= 11 ? 0.6 : 1;
    var c1 = [lerp(J[0], L[0], 0.85), lerp(J[1], L[1], 0.12)];
    var T = [L[0] - s * 12 * k, L[1] - 24 * k];
    var c2 = [L[0] + s * 3, L[1] - 12 * k];
    return "M" + P(J) + "Q" + P(c1) + " " + P(L) + "Q" + P(c2) + " " + P(T);
  }
  /* Передний отдел ребра (от хряща до бокового изгиба) — лежит спереди;
     «хвостик» после изгиба — это уже задний отдел ребра, он уходит назад к
     позвоночнику и рисуется ПОЗАДИ лёгких, а не поверх соседних рёбер. */
  function ribFront(i, J, L, s) {
    var c1 = [lerp(J[0], L[0], 0.85), lerp(J[1], L[1], 0.12)];
    return "M" + P(J) + "Q" + P(c1) + " " + P(L);
  }
  function ribBack(i, J, L, s) {
    var k = i <= 3 ? 0.55 : i >= 11 ? 0.6 : 1;
    var T = [L[0] - s * 12 * k, L[1] - 24 * k], c2 = [L[0] + s * 3, L[1] - 12 * k];
    return "M" + P(L) + "Q" + P(c2) + " " + P(T);
  }
  function qPt(a, c, b, u) {
    var v = 1 - u;
    return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
  }
  function ribPt(J, L, u) { return qPt(J, [lerp(J[0], L[0], 0.85), lerp(J[1], L[1], 0.12)], L, u); }   // 0 = хрящ, 1 = бок
  function cartPt(a, b, u) { return qPt(a, [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5) + 3], b, u); } // 0 = ребро, 1 = грудина
  function cartPath(a, b) {
    var m = [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5) + 3];
    return "M" + P(a) + "Q" + P(m) + " " + P(b);
  }
  function diaphragm(p, G) {
    var dd = DIA_DESC * p.d;
    var Wl = X0 - G.left[10].L[0] - 4, Wr = G.right[10].L[0] - X0 - 4;
    var ay = 372 - p.r * 3;
    var pts = [
      [X0 - Wl, ay - 2],
      [X0 - Wl * 0.8, 318 + dd * 0.55],
      [X0 - 48, 262 + dd],
      [X0, 281 + dd * 0.85],
      [X0 + 50, 272 + dd],
      [X0 + Wr * 0.8, 326 + dd * 0.55],
      [X0 + Wr, ay]
    ];
    return { pts: pts, poly: crSample(pts, 10), dd: dd, Wl: Wl, Wr: Wr };
  }
  function lungPts(s, p, G, D) {
    var g = s < 0 ? G.left : G.right, pts = [];
    // верхушка лёгкого прячется за ключицу, а не выпирает над ней
    pts.push([X0 + s * 20, 137]);
    pts.push([X0 + s * 36, 129 - p.c * 2]);
    pts.push([X0 + s * 55, 135 - p.c * 3]);
    for (var i = 1; i <= 8; i++) pts.push([g[i].L[0] - s * 7, g[i].L[1] + (i === 1 ? 4 : 8)]);
    var W = s < 0 ? D.Wl : D.Wr;
    var recess = 20 - 15 * p.d;                     // рёберно-диафрагмальный синус
    var cx = X0 + s * (W - recess), cy = polyY(D.poly, cx) - 5;
    var r9 = [g[9].L[0] - s * 8, g[9].L[1] + 8];
    if (r9[1] < cy - 6) pts.push(r9);
    var medial = s < 0 ? 7 : 30, n = 6;
    for (var k = 0; k <= n; k++) {
      var hx = lerp(W - recess, medial, k / n);
      var x = X0 + s * hx;
      pts.push([x, polyY(D.poly, x) - 5]);
    }
    if (s < 0) {
      pts.push([X0 - 6, 236]); pts.push([X0 - 7, 172]); pts.push([X0 - 12, 134]);
    } else {
      var base = polyY(D.poly, X0 + 30) - 5;
      pts.push([X0 + 46, base - 14]); pts.push([X0 + 55, 238]);
      pts.push([X0 + 40, 213]); pts.push([X0 + 9, 200]);
      pts.push([X0 + 7, 170]); pts.push([X0 + 12, 134]);
    }
    return pts;
  }

  /* бронхиальное дерево: [hx1, y1, hx2, y2, ширина] от карины (0,166) */
  var BR = {
    R: [[0, 166, 30, 190, 10], [24, 184, 52, 164, 6], [52, 164, 56, 140, 3.5], [52, 164, 74, 160, 3.5],
        [56, 140, 50, 124, 2], [56, 140, 66, 128, 2], [30, 190, 36, 214, 7], [36, 214, 56, 230, 5],
        [56, 230, 76, 234, 3], [56, 230, 60, 248, 3], [36, 214, 42, 240, 6], [42, 240, 30, 256, 3.5],
        [42, 240, 60, 254, 3.5], [42, 240, 82, 262, 3], [60, 254, 72, 274, 2], [82, 262, 92, 280, 2]],
    L: [[0, 166, 44, 196, 9], [44, 196, 62, 176, 6], [62, 176, 64, 148, 3.5], [62, 176, 84, 168, 3.5],
        [64, 148, 58, 128, 2], [64, 148, 74, 134, 2], [50, 202, 60, 228, 4.5], [60, 228, 66, 248, 3],
        [60, 228, 78, 236, 3], [44, 196, 50, 246, 6], [50, 246, 40, 262, 3.5], [50, 246, 68, 262, 3.5],
        [50, 246, 88, 272, 3], [68, 262, 80, 284, 2], [88, 272, 98, 292, 2]]
  };

  var LABELS = [
    { t: "Гортань", side: -1, y: 58, a: function () { return [187, 58]; } },
    { t: "Ключица", side: -1, y: 100, a: function (S) { return S.clavL; } },
    { t: "Правое лёгкое", side: -1, y: 184, a: function (S) { return [X0 - 64, 180 - S.p.c * 2]; } },
    { t: "Рёбра", side: -1, y: 236, a: function (S) { var g = S.G.left[6]; return [lerp(g.J[0], g.L[0], 0.7), lerp(g.J[1], g.L[1], 0.7) + 4]; } },
    { t: "Диафрагма", side: -1, y: 300, a: function (S) { var x = X0 - 74; return [x, polyY(S.D.poly, x) + 2]; } },
    { t: "Печень", side: -1, y: 360, a: function (S) { return [X0 - 52, polyY(S.D.poly, X0 - 52) + 44]; } },
    { t: "Брюшная стенка", side: -1, y: 474, a: function (S) { return [X0 - 26 - S.p.d * 2, 486]; } },
    { t: "Трахея", side: 1, y: 82, a: function () { return [X0 + 7, 112]; } },
    { t: "Грудина", side: 1, y: 140, a: function (S) { return [X0 + 6, 212 - sternDy(S.p)]; } },
    { t: "Бронхи", side: 1, y: 166, a: function (S) { return S.bronL; } },
    { t: "Сердце", side: 1, y: 228, a: function (S) { return [X0 + 26, 213 + S.hDy * 0.5]; } },
    { t: "Левое лёгкое", side: 1, y: 266, a: function (S) { return [X0 + 96 + S.p.r * 7, 196]; } },
    { t: "Межрёберные\nмышцы", side: 1, y: 292, a: function (S) { return S.icR || [X0 + 90, 250]; } },
    { t: "Рёберная дуга", side: 1, y: 330, a: function (S) { var c = S.cartR9; return [lerp(c[0][0], c[1][0], 0.5), lerp(c[0][1], c[1][1], 0.5)]; } },
    { t: "Желудок", side: 1, y: 402, a: function (S) { return [X0 + 66, polyY(S.D.poly, X0 + 66) + 36]; } }
  ];

  var C = {
    bone: "#e9dcbb", boneO: "#8d7d60", cart: "#c3d3da", cartO: "#7b8f99",
    lung: "#eaa6a1", lungO: "#b0636a", fiss: "#b06a72",
    musc: "#b2473c", muscO: "#6e2a24", tendon: "#e8d6bb",
    torso: "#262a30", torsoO: "#343940", arrow: "#79b8ff", inAir: "#8fd3ff", outAir: "#c3a6ff",
    label: "#cdd4db", lead: "#79828c"
  };

  /* ===================================================================
     1б. ДЫХАТЕЛЬНЫЕ МЫШЦЫ — отдельная карточка (блок { "type": "breath-muscles" }).
     Та же фигура спереди, но подписи костей/органов скрыты, органы приглушены;
     кнопка мышцы показывает только её, она светлеет, когда работает
     (мышцы вдоха — на вдохе, мышцы выдоха — на выдохе), а скелет дышит в
     подходящем режиме. В упрощённой лекции — только главные мышцы.
     =================================================================== */
  var MUSCLES = [
    { key: "dia", g: "in", mode: 2, basic: true, name: "Диафрагма",
      text: "<b>Диафрагма</b> — главная мышца вдоха. Куполом лежит под лёгкими. Сокращаясь, уплощается и опускается: лёгкие растягиваются вниз, воздух входит, живот мягко выходит вперёд. На выдохе расслабляется и поднимается обратно." },
    { key: "ext", g: "in", mode: 1, basic: true, name: "Наружные межрёберные",
      text: "<b>Наружные межрёберные</b> лежат между рёбрами, волокна идут вниз и к середине — как руки в карманах. Сокращаясь, поднимают рёбра и разводят их в стороны: грудная клетка становится шире." },
    { key: "scal", g: "in", mode: 0, name: "Лестничные",
      text: "<b>Лестничные мышцы</b> тянутся от шейных позвонков к 1-му и 2-му рёбрам и поднимают их. Это вспомогательные мышцы вдоха: если вдох идёт «шеей», работают в первую очередь они — шея и гортань зажимаются." },
    { key: "scm", g: "in", mode: 0, name: "Грудино-ключично-сосцевидная",
      text: "<b>Грудино-ключично-сосцевидная</b> идёт от кости за ухом к грудине и ключице. При глубоком или ключичном вдохе тянет грудину и ключицы вверх. Вспомогательная — в спокойном певческом вдохе ей лучше отдыхать." },
    { key: "allIn", g: "in", mode: 3, all: ["dia", "ext", "scal", "scm"], name: "Все мышцы вдоха",
      text: "<b>Вдох вместе:</b> диафрагма опускается, наружные межрёберные поднимают рёбра; при очень глубоком или ключичном вдохе подключаются лестничные и грудино-ключично-сосцевидные." },
    { key: "int", g: "out", mode: 1, name: "Внутренние межрёберные",
      text: "<b>Внутренние межрёберные</b> лежат глубже наружных, их волокна идут поперёк. На активном выдохе опускают и сближают рёбра — помогают выпускать воздух дозированно." },
    { key: "tra", g: "out", mode: 2, basic: true, name: "Поперечная мышца живота",
      text: "<b>Поперечная мышца живота</b> — самая глубокая, её волокна идут поперёк, как широкий пояс. Сжимает живот и мягко подаёт органы вверх, к диафрагме, — главная мышца опоры на выдохе." },
    { key: "obl", g: "out", mode: 2, name: "Косые мышцы живота",
      text: "<b>Наружная и внутренняя косые</b> лежат по бокам живота, их волокна перекрещиваются. Опускают нижние рёбра и сужают талию — помогают ровно вести выдох." },
    { key: "rec", g: "out", mode: 2, name: "Прямая мышца живота",
      text: "<b>Прямая мышца живота</b> идёт от лобка к рёбрам и грудине, разделена сухожильными перемычками — те самые «кубики». Тянет грудную клетку вниз и сгибает корпус; в опоре главная роль — у поперечной и косых." },
    { key: "allOut", g: "out", mode: 3, all: ["int", "tra", "obl", "rec"], name: "Все мышцы выдоха",
      text: "<b>Выдох вместе:</b> поперечная, косые и прямая сжимают живот и подают органы к диафрагме, внутренние межрёберные опускают рёбра — выдох становится управляемым." }
  ];
  function musAct(g, t) {                       // 0…1: насколько мышца сейчас работает
    t = ((t % T_CYC) + T_CYC) % T_CYC;
    var inEnd = T_IN + T_HOLD, outEnd = inEnd + T_OUT, r = 0.3;
    if (g === "in") return clamp(t / r, 0, 1) * clamp((inEnd + r - t) / r, 0, 1);
    return clamp((t - inEnd) / r, 0, 1) * clamp((outEnd + r - t) / r, 0, 1);
  }
  function mkMus(parent, op) {
    return {
      base: E("path", { fill: C.musc, stroke: C.muscO, "stroke-width": 1, "stroke-linejoin": "round", "fill-opacity": op || 1 }, parent),
      hi: E("path", { fill: "#e07a68", "fill-opacity": 0, stroke: "none" }, parent),
      fibD: E("path", { fill: "none", stroke: C.muscO, "stroke-opacity": .55, "stroke-width": .7, "stroke-linecap": "round" }, parent),
      fibL: E("path", { fill: "none", stroke: "#e88b7a", "stroke-opacity": .55, "stroke-width": .6, "stroke-linecap": "round" }, parent)
    };
  }
  function edgeAt(arr, t) {
    if (t < 0 || t > arr.length - 1) return null;
    var k = Math.min(Math.floor(t), arr.length - 2), f = t - k;
    return [lerp(arr[k][0], arr[k + 1][0], f), lerp(arr[k][1], arr[k + 1][1], f)];
  }
  function polyOf(a, b) { return "M" + a.map(P).join("L") + "L" + b.slice().reverse().map(P).join("L") + "Z"; }
  function musLook(o, act) {
    o.hi.setAttribute("fill-opacity", (act * 0.38).toFixed(2));
    o.fibL.setAttribute("stroke-opacity", (0.4 + act * 0.45).toFixed(2));
  }
  // волокна поперёк ленты: от края up к краю dn со сдвигом dir (в долях отрезков)
  function musBand(o, up, dn, step, dir, act) {
    var poly = polyOf(up, dn); o.base.setAttribute("d", poly); o.hi.setAttribute("d", poly);
    var n = up.length - 1, dD = "", dL = "";
    for (var k = -step * 3; k <= step * (n + 3); k++) {
      var a = k / step, b = a + dir * 0.9;
      var A = edgeAt(up, clamp(a, 0, n)), B = edgeAt(dn, clamp(b, 0, n));
      if ((a < 0 && b < 0) || (a > n && b > n) || !A || !B) continue;
      if ((a < 0 || a > n) || (b < 0 || b > n)) continue;
      var seg = "M" + P([lerp(A[0], B[0], .04), lerp(A[1], B[1], .04)]) + "L" + P([lerp(A[0], B[0], .96), lerp(A[1], B[1], .96)]);
      if (k % 2) dL += seg; else dD += seg;
    }
    o.fibD.setAttribute("d", dD); o.fibL.setAttribute("d", dL); musLook(o, act);
  }
  // волокна вдоль ленты (лестничные, ГКС, прямая)
  function musStrap(o, l, r, nF, act) {
    var poly = polyOf(l, r); o.base.setAttribute("d", poly); o.hi.setAttribute("d", poly);
    var dD = "", dL = "";
    for (var f = 1; f < nF; f++) {
      var w = f / nF, pts = l.map(function (q, k) { return [lerp(q[0], r[k][0], w), lerp(q[1], r[k][1], w)]; });
      var seg = "M" + pts.map(P).join("L");
      if (f % 2) dL += seg; else dD += seg;
    }
    o.fibD.setAttribute("d", dD); o.fibL.setAttribute("d", dL); musLook(o, act);
  }

  function buildBreath(mount, MUS) {
    mount.innerHTML = "";
    mount.classList.add("banim");
    var head = H("div", "banim-head", mount);
    var phaseEl = H("div", "banim-phase", head, "Вдох");
    var subEl = H("div", "banim-sub", head, "вид спереди");
    var bar = H("div", "banim-bar", mount); var barFill = H("div", "", bar);

    var fig = H("div", "banim-fig", mount);
    var svg = E("svg", { viewBox: "0 0 400 560", role: "img", "aria-label": "Анимация дыхательного цикла, вид спереди" }, fig);
    var pauseBadge = H("div", "banim-pause", fig, "пауза · нажми, чтобы продолжить");

    var defs = E("defs", null, svg);
    defs.innerHTML =
      '<radialGradient id="ba-lung" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#f6c3bd"/><stop offset=".7" stop-color="#e59c98"/><stop offset="1" stop-color="#c5767a"/></radialGradient>' +
      '<linearGradient id="ba-heart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9534c"/><stop offset="1" stop-color="#8a2c2b"/></linearGradient>' +
      '<linearGradient id="ba-torso" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f35"/><stop offset="1" stop-color="#22262b"/></linearGradient>' +
      '<linearGradient id="ba-stern" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8c69c"/><stop offset=".5" stop-color="#f3e8cc"/><stop offset="1" stop-color="#d3c094"/></linearGradient>' +
      '<linearGradient id="ba-trach" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7f93a0"/><stop offset=".5" stop-color="#b7c6cf"/><stop offset="1" stop-color="#7f93a0"/></linearGradient>' +
      '<pattern id="ba-alv" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="2.2" fill="none" stroke="#b9666d" stroke-opacity=".22" stroke-width=".8"/></pattern>';

    // порядок слоёв: бронхи лежат позади сердца, сердце — в переднем средостении
    var gTorso = E("g", null, svg), gAbd = E("g", null, svg),
        gRibBack = E("g", null, svg), gLung = E("g", null, svg), gBr = E("g", null, svg), gHeart = E("g", null, svg), gDia = E("g", null, svg),
        gAbdM = E("g", null, svg), gIc = E("g", null, svg), gRib = E("g", null, svg), gStern = E("g", null, svg), gTop = E("g", null, svg), gNeckM = E("g", null, svg),
        gArr = E("g", null, svg), gLab = E("g", null, svg);

    // туловище
    var torso = E("path", { fill: "url(#ba-torso)", stroke: C.torsoO, "stroke-width": 1.2 }, gTorso);
    // брюшная стенка: прямые мышцы, белая линия, сухожильные перемычки, пупок
    var rectus = E("path", { fill: "none", stroke: "#3a4047", "stroke-width": 1.2 }, gTorso);
    var umb = E("ellipse", { cx: X0, cy: 456, rx: 3, ry: 4, fill: "#1b1e22" }, gTorso);
    // органы живота
    var liver = E("path", { fill: "#7e3c33", "fill-opacity": 0.42, stroke: "#5c2a24", "stroke-width": 1 }, gAbd);
    var stomach = E("path", { fill: "#b97a6c", "fill-opacity": 0.28, stroke: "#8b574d", "stroke-opacity": .6, "stroke-width": 1 }, gAbd);
    // сердце и крупные сосуды
    var gHeartIn = E("g", null, gHeart);
    gHeartIn.innerHTML =
      // ВПВ (венозная — синяя), дуга аорты с ветвями, лёгочный ствол (бедная O2 кровь — синий)
      '<path d="M186 208 L186 150 M186 152 L170 132 M186 152 L206 130" stroke="#3d4f9c" stroke-width="11" fill="none" stroke-linecap="round"/>' +
      '<path d="M186 208 L186 150 M186 152 L170 132 M186 152 L206 130" stroke="#5a6fc4" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<path d="M206 154 L198 126 M216 151 L216 124 M226 155 L234 128" stroke="#a8433d" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M200 212 C195 182 200 152 218 152 C232 152 237 164 235 180" stroke="#9a3a35" stroke-width="14" fill="none" stroke-linecap="round"/>' +
      '<path d="M200 212 C195 182 200 152 218 152 C232 152 237 164 235 180" stroke="#cf5f56" stroke-width="9.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M216 204 C214 192 214 184 220 178 L242 184 M220 178 L192 186" stroke="#3f509f" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<path d="M216 204 C214 192 214 184 220 178 L242 184 M220 178 L192 186" stroke="#6577c6" stroke-width="6.5" fill="none" stroke-linecap="round"/>' +
      // тело сердца: ПП — правый контур, ПЖ — нижний на диафрагме, ЛЖ — левый, ушко ЛП
      '<path d="M184 206 C173 222 171 248 180 266 C196 278 230 281 258 268 C266 252 256 230 238 212 C234 204 240 197 233 190 C223 185 213 193 205 197 C197 201 190 202 184 206 Z" fill="url(#ba-heart)" stroke="#5f1f1e" stroke-width="1.2"/>' +
      '<path d="M184 206 C176 222 175 246 182 263 C186 254 188 230 196 210 Z" fill="#a23d3a" fill-opacity=".6"/>' +
      // борозды с жиром и венечными артериями
      '<path d="M222 206 C229 230 240 252 252 271" stroke="#d6a24b" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".85"/>' +
      '<path d="M222 206 C229 230 240 252 252 271" stroke="#e1584f" stroke-width="1.1" fill="none"/>' +
      '<path d="M197 204 C188 228 189 258 205 276" stroke="#d6a24b" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M197 204 C188 228 189 258 205 276" stroke="#e1584f" stroke-width="1" fill="none"/>';

    // лёгкие
    function lungEls() {
      return {
        body: E("path", { fill: "url(#ba-lung)", "fill-opacity": 0.86, stroke: C.lungO, "stroke-width": 1.4 }, gLung),
        tex: E("path", { fill: "url(#ba-alv)" }, gLung),
        f1: E("path", { fill: "none", stroke: C.fiss, "stroke-width": 1.4, "stroke-linecap": "round" }, gLung),
        f2: E("path", { fill: "none", stroke: C.fiss, "stroke-width": 1.4, "stroke-linecap": "round" }, gLung)
      };
    }
    var LR = lungEls(), LL = lungEls();
    var pleura = E("path", { fill: "none", stroke: "#d9a2a2", "stroke-opacity": .45, "stroke-width": 1, "stroke-dasharray": "3 3" }, gLung);

    // трахея и бронхи
    var trach = E("rect", { x: X0 - 8, y: 82, width: 16, height: 84, rx: 5, fill: "url(#ba-trach)", stroke: "#5e717d", "stroke-width": 1 }, gBr);
    var rings = E("path", { fill: "none", stroke: "#e3ecf1", "stroke-opacity": .75, "stroke-width": 1.6, "stroke-linecap": "round" }, gBr);
    var brO = [], brI = [];
    ["R", "L"].forEach(function (k) {
      BR[k].forEach(function (b) {
        brO.push(E("path", { stroke: "#a26a72", "stroke-width": b[4] * 0.72 + 1.4, "stroke-linecap": "round", fill: "none", "stroke-opacity": .55 }, gBr));
      });
    });
    ["R", "L"].forEach(function (k) {
      BR[k].forEach(function (b) {
        brI.push(E("path", { stroke: "#f6dcdc", "stroke-width": b[4] * 0.72, "stroke-linecap": "round", fill: "none", "stroke-opacity": .75 }, gBr));
      });
    });
    var airDots = [];
    for (var a = 0; a < 7; a++) airDots.push(E("circle", { r: 2.1, cx: X0, cy: 100, fill: C.inAir }, gBr));

    // диафрагма: мышечная часть + сухожильный центр
    var diaFill = E("path", { fill: "#7c2f29", "fill-opacity": .28 }, gDia);
    var diaM = E("path", { fill: "none", stroke: C.muscO, "stroke-width": 12, "stroke-linecap": "round" }, gDia);
    var diaM2 = E("path", { fill: "none", stroke: C.musc, "stroke-width": 9, "stroke-linecap": "round" }, gDia);
    var diaT = E("path", { fill: "none", stroke: C.tendon, "stroke-width": 6.5, "stroke-opacity": .9, "stroke-linecap": "round" }, gDia);
    var diaFib = E("path", { fill: "none", stroke: "#d86a5c", "stroke-opacity": .55, "stroke-width": 1, "stroke-dasharray": "1.5 3.5" }, gDia);

    /* межрёберные мышцы — плотная мышечная ткань «окном» справа (левая
       половина груди), между 5–6 и 6–7 рёбрами: у кости — наружные (волокна
       вниз и к середине), у грудины между хрящами — внутренние (волокна
       поперёк). Цвета — как у диафрагмы. */
    var IC_SIDE = "right", IC_SPACES = [5, 6];
    var icEls = {};
    IC_SPACES.forEach(function (i) {
      var o = {};
      ["", "c"].forEach(function (pre) {
        o[pre + "base"] = E("path", { fill: C.musc, stroke: C.muscO, "stroke-width": 1, "stroke-linejoin": "round" }, gIc);
        o[pre + "hi"]   = E("path", { fill: "#e07a68", "fill-opacity": 0, stroke: "none" }, gIc);
        o[pre + "fibD"] = E("path", { fill: "none", stroke: C.muscO, "stroke-opacity": .55, "stroke-width": .7, "stroke-linecap": "round" }, gIc);
        o[pre + "fibL"] = E("path", { fill: "none", stroke: "#e88b7a", "stroke-opacity": .55, "stroke-width": .6, "stroke-linecap": "round" }, gIc);
      });
      icEls[i] = o;
    });

    // рёбра (обе стороны)
    var ribEls = { left: [], right: [] };
    ["left", "right"].forEach(function (side) {
      for (var i = 1; i <= 12; i++) {
        var o = {};
        if (!RIBS[i].free) {
          o.cO = E("path", { fill: "none", stroke: C.cartO, "stroke-width": 6.2, "stroke-linecap": "round" }, gRib);
          o.cI = E("path", { fill: "none", stroke: C.cart, "stroke-width": 4.2, "stroke-linecap": "round", "stroke-opacity": .95 }, gRib);
        }
        o.kO = E("path", { fill: "none", stroke: C.boneO, "stroke-width": i === 1 ? 8.5 : 7.6, "stroke-linecap": "round" }, gRibBack);
        o.kI = E("path", { fill: "none", stroke: "#cfc2a2", "stroke-width": i === 1 ? 6.3 : 5.2, "stroke-linecap": "round" }, gRibBack);
        o.bO = E("path", { fill: "none", stroke: C.boneO, "stroke-width": i === 1 ? 8.5 : 7.6, "stroke-linecap": "round" }, gRib);
        o.bI = E("path", { fill: "none", stroke: C.bone, "stroke-width": i === 1 ? 6.3 : 5.2, "stroke-linecap": "round" }, gRib);
        ribEls[side][i] = o;
      }
    });

    // грудина: рукоятка, тело, мечевидный отросток
    var stern = E("path", { fill: "url(#ba-stern)", stroke: C.boneO, "stroke-width": 1.2 }, gStern);
    var sternLines = E("path", { fill: "none", stroke: "#a8946c", "stroke-width": 1 }, gStern);
    var sternRidges = E("path", { fill: "none", stroke: "#a8946c", "stroke-opacity": .45, "stroke-width": .8 }, gStern);

    // ключицы, гортань
    var clav = {};
    [-1, 1].forEach(function (s) {
      clav[s] = {
        e: E("path", { fill: "none", stroke: C.boneO, "stroke-width": 12.5, "stroke-linecap": "round" }, gTop),
        o: E("path", { fill: "none", stroke: C.boneO, "stroke-width": 9.5, "stroke-linecap": "round" }, gTop),
        eI: E("path", { fill: "none", stroke: C.bone, "stroke-width": 10, "stroke-linecap": "round" }, gTop),
        i: E("path", { fill: "none", stroke: C.bone, "stroke-width": 7, "stroke-linecap": "round" }, gTop)
      };
    });
    var lar = E("g", null, gTop);
    lar.innerHTML =
      '<path d="M178 36 Q200 47 222 36" fill="none" stroke="' + C.boneO + '" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M178 36 Q200 47 222 36" fill="none" stroke="' + C.bone + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M180 45 L194 47 L200 53 L206 47 L220 45 L214 66 Q200 74 186 66 Z" fill="#a5b6c1" stroke="#617683" stroke-width="1.2"/>' +
      '<path d="M200 53 L200 70" stroke="#7f93a0" stroke-width="1"/>' +
      '<rect x="188" y="74" width="24" height="7" rx="3" fill="#a5b6c1" stroke="#617683" stroke-width="1.1"/>';

    // стрелки движения
    function arrow() {
      var g = E("g", { opacity: 0 }, gArr);
      E("path", { d: "M0 -11 L0 10 M-5.5 4 L0 10 L5.5 4", fill: "none", stroke: C.arrow, "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
      return g;
    }
    var arrAir = arrow(), arrClav = [arrow(), arrow()], arrRib = [arrow(), arrow()],
        arrDia = [arrow(), arrow()], arrAbd = [arrow(), arrow()];
    var fwd = E("g", { opacity: 0 }, gArr);
    var fwdC = E("circle", { cx: X0, cy: 418, r: 7, fill: "none", stroke: C.arrow, "stroke-width": 2 }, fwd);
    var fwdDot = E("circle", { cx: X0, cy: 418, r: 2.2, fill: C.arrow }, fwd);
    var fwdX = E("path", { d: "M195 413 L205 423 M205 413 L195 423", stroke: C.arrow, "stroke-width": 2, "stroke-linecap": "round" }, fwd);
    var fwdT = E("text", { x: X0, y: 438, "text-anchor": "middle", "font-size": 10, fill: C.arrow }, fwd);
    function setArrow(g, x, y, rot, op) {
      g.setAttribute("transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + rot + ")");
      g.setAttribute("opacity", f1(clamp(op, 0, 1) * 10) / 10);
    }

    // подписи
    var labEls = LABELS.map(function (L) {
      var x = L.side < 0 ? 6 : 394;
      var tx = E("text", { x: x, y: L.y, "text-anchor": L.side < 0 ? "start" : "end", "font-size": 9, fill: C.label, stroke: "#1b1f24", "stroke-width": 2.6, "stroke-linejoin": "round", "paint-order": "stroke" }, gLab);
      var lines = L.t.split("\n"), spans = [];
      if (lines.length === 1) tx.textContent = L.t;
      else lines.forEach(function (t, n) { var sp = E("tspan", { x: x, dy: n ? 11 : 0 }, tx); sp.textContent = t; spans.push(sp); });
      var ln = E("path", { fill: "none", stroke: C.lead, "stroke-width": 0.9 }, gLab);
      var dot = E("circle", { r: 2.2, fill: "#eef2f5" }, gLab);
      return { L: L, tx: tx, ln: ln, dot: dot, w: 0, spans: spans, n: lines.length };
    });

    // кнопки режимов
    var modesEl = H("div", "banim-modes", mount);
    var cap = H("div", "banim-cap", mount);
    var gxBtn = H("button", "banim-gx", mount,
      '<span class="banim-gx-ico">' + GX_ICON + '</span><span><b>Газообмен в альвеолах</b><small>Как O₂ попадает в кровь, а CO₂ выходит</small></span><span class="banim-gx-go">›</span>');
    gxBtn.type = "button";
    gxBtn.addEventListener("click", function () { openGasExchange(); });
    if (mount.getAttribute("data-gx") === "0" || MUS) gxBtn.remove();   // упрощённая лекция / карточка мышц

    var st = { mode: 2, t0: performance.now(), paused: false, pauseAt: 0, visible: true, raf: 0, last: 0, airOff: 0, lastT: 0, mus: null };
    var MU = null;                                    // слои мышц (только в карточке мышц)
    if (MUS) MU = buildMuscleLayers();
    function buildMuscleLayers() {
      [gLung, gHeart, gAbd, gBr].forEach(function (g) { g.setAttribute("opacity", ".55"); });
      labEls.forEach(function (le) { [le.tx, le.ln, le.dot].forEach(function (e) { e.style.display = "none"; }); });
      gIc.style.display = "none";                     // «окно» межрёберных из карточки дыхания
      var L = {};
      function grp(parent) { var g = E("g", { display: "none" }, parent); return g; }
      // межрёберные: все промежутки, обе стороны; костная часть + хрящевая
      ["ext", "int"].forEach(function (key) {
        var g = grp(gRib.parentNode.insertBefore(E("g", null), gRib)), sp = { left: [], right: [] };
        ["left", "right"].forEach(function (side) {
          for (var i = 1; i <= 11; i++) sp[side][i] = { b: mkMus(g), c: i <= 6 ? mkMus(g) : null };
        });
        L[key] = { g: g, sp: sp };
      });
      L.scal = { g: grp(gIc.parentNode.insertBefore(E("g", null), gRib)) };
      L.scal.m = { "-1": [mkMus(L.scal.g), mkMus(L.scal.g), mkMus(L.scal.g)], "1": [mkMus(L.scal.g), mkMus(L.scal.g), mkMus(L.scal.g)] };
      L.scm = { g: grp(gNeckM) };
      L.scm.m = { "-1": [mkMus(L.scm.g), mkMus(L.scm.g)], "1": [mkMus(L.scm.g), mkMus(L.scm.g)] };
      L.tra = { g: grp(gAbdM) };
      L.tra.m = { "-1": mkMus(L.tra.g), "1": mkMus(L.tra.g) };
      L.tra.apo = E("path", { fill: "none", stroke: C.tendon, "stroke-opacity": .3, "stroke-width": .7, "stroke-dasharray": "3 3" }, L.tra.g);
      L.obl = { g: grp(gAbdM) };
      L.obl.io = { "-1": mkMus(L.obl.g), "1": mkMus(L.obl.g) };
      L.obl.eo = { "-1": mkMus(L.obl.g, .62), "1": mkMus(L.obl.g, .62) };
      L.rec = { g: grp(gAbdM) };
      L.rec.m = { "-1": mkMus(L.rec.g), "1": mkMus(L.rec.g) };
      L.rec.tend = E("path", { fill: "none", stroke: C.tendon, "stroke-width": 2.2, "stroke-opacity": .8, "stroke-linecap": "round" }, L.rec.g);
      L.dia = { g: grp(gDia) };
      L.dia.hl = E("path", { fill: "none", stroke: "#ff9c84", "stroke-width": 8, "stroke-linecap": "round", "stroke-opacity": .3 }, L.dia.g);
      return L;
    }
    if (MUS) {
      subEl.textContent = "дыхательные мышцы";
      var basicOnly = MUS.level === "basic";
      var list = MUSCLES.filter(function (m) { return basicOnly ? m.basic : true; });
      var mbtns = [];
      modesEl.className = "bmus-groups";
      [["in", "Вдох"], ["out", "Выдох"]].forEach(function (gr) {
        H("div", "bmus-ghead " + gr[0], modesEl, gr[1]);
        var grid = H("div", "banim-modes bmus-grid", modesEl);
        list.filter(function (m) { return m.g === gr[0]; }).forEach(function (m) {
          var b = H("button", "banim-mode bmus-btn" + (m.all ? " all" : ""), grid, m.name);
          b.type = "button";
          b.addEventListener("click", function () { pickMuscle(m); });
          mbtns.push([b, m]);
        });
      });
      var pickMuscle = function (m) {
        st.mus = m; st.mode = m.mode; st.t0 = performance.now(); st.paused = false; st.airOff = 0;
        mount.classList.remove("paused");
        mbtns.forEach(function (x) { x[1].on = x[1] === m; x[0].classList.toggle("on", x[1] === m); });
        var show = m.all ? m.all.filter(function (k) { return list.some(function (q) { return q.key === k; }); }) : [m.key];
        Object.keys(MU).forEach(function (k) { MU[k].g.setAttribute("display", show.indexOf(k) >= 0 ? "inline" : "none"); });
        cap.innerHTML = m.text;
        kick();
      };
      setTimeout(function () { pickMuscle(list[0]); }, 0);
    }
    var btns = (MUS ? [] : MODES).map(function (m, i) {
      var b = H("button", "banim-mode", modesEl, m.name);
      b.type = "button";
      b.addEventListener("click", function () {
        st.mode = i; st.t0 = performance.now(); st.paused = false; st.airOff = 0;
        mount.classList.remove("paused");
        syncModes(); kick();
      });
      return b;
    });
    function syncModes() {
      if (MUS) return;
      btns.forEach(function (b, i) { b.classList.toggle("on", i === st.mode); });
      cap.innerHTML = MODES[st.mode].text +
        '<span class="banim-cap-ex">Выдох: диафрагма расслабляется и поднимается куполом, рёбра опускаются, воздух выходит.</span>';
    }
    syncModes();
    fig.addEventListener("click", function () {
      if (st.paused) { st.t0 += performance.now() - st.pauseAt; st.paused = false; mount.classList.remove("paused"); kick(); }
      else { st.paused = true; st.pauseAt = performance.now(); mount.classList.add("paused"); }
    });

    /* ---------- кадр ---------- */
    function geometry(p) {
      var G = { left: [], right: [] };
      for (var i = 1; i <= 12; i++) { G.left[i] = ribGeo(i, -1, p); G.right[i] = ribGeo(i, 1, p); }
      return G;
    }

    function frame(t) {
      var mode = MODES[st.mode];
      var p = breathParams(mode, t), p2 = breathParams(mode, t + 0.06);
      var v = { c: (p2.c - p.c) / 0.06, r: (p2.r - p.r) / 0.06, d: (p2.d - p.d) / 0.06, f: (p2.f - p.f) / 0.06 };
      var G = geometry(p), D = diaphragm(p, G), dd = D.dd, sdy = sternDy(p);
      var S = { p: p, G: G, D: D, hDy: dd * 0.8 };

      // туловище: плечи поднимаются при ключичном, живот шире при диафрагмальном
      var side = function (s) {
        return [[X0 + s * 26, -2], [X0 + s * 29, 90], [X0 + s * 78, 111 - p.c * 9], [X0 + s * 148, 134 - p.c * 13],
          [X0 + s * 156, 176 - p.c * 6], [X0 + s * 133, 206], [X0 + s * (131 + p.r * 4), 300],
          [X0 + s * (123 + p.d * 3), 398], [X0 + s * (127 + p.d * 6), 470], [X0 + s * (131 + p.d * 3), 564]];
      };
      var Ls = side(-1), Rs = side(1).reverse();
      torso.setAttribute("d", crPath(Ls, false) + crPath(Rs, false).replace(/^M/, "L") + "Z");

      var ab = 1 + p.d * 0.05;
      var rx = function (hx) { return X0 + hx * ab; };
      rectus.setAttribute("d",
        "M" + f1(rx(-6)) + " 300 L" + f1(rx(-8)) + " 560 M" + f1(rx(6)) + " 300 L" + f1(rx(8)) + " 560" +
        "M" + f1(rx(-46)) + " 306 Q" + f1(rx(-54)) + " 430 " + f1(rx(-40)) + " 560 M" + f1(rx(46)) + " 306 Q" + f1(rx(54)) + " 430 " + f1(rx(40)) + " 560" +
        "M" + f1(rx(-48)) + " 338 L" + f1(rx(-6)) + " 334 M" + f1(rx(6)) + " 334 L" + f1(rx(48)) + " 338" +
        "M" + f1(rx(-51)) + " 392 L" + f1(rx(-7)) + " 390 M" + f1(rx(7)) + " 390 L" + f1(rx(51)) + " 392" +
        "M" + f1(rx(-50)) + " 446 L" + f1(rx(-7)) + " 446 M" + f1(rx(7)) + " 446 L" + f1(rx(50)) + " 446");
      umb.setAttribute("rx", f1(3 + p.d * 0.6));

      // печень под правым куполом, желудок под левым — опускаются с диафрагмой
      var liv = [];
      for (var k = 0; k <= 8; k++) { var lx = lerp(X0 - D.Wl + 4, X0 + 36, k / 8); liv.push([lx, polyY(D.poly, lx) + 7]); }
      liv.push([X0 + 30, 296 + dd * 0.9]); liv.push([X0 - 20, 318 + dd * 0.9]);
      liv.push([X0 - 70, 352 + dd * 0.9]); liv.push([X0 - 98, 366 + dd * 0.7]);
      liver.setAttribute("d", crPath(liv, true));
      var sto = [];
      for (var k2 = 0; k2 <= 5; k2++) { var sx = lerp(X0 + 26, X0 + 94, k2 / 5); sto.push([sx, polyY(D.poly, sx) + 8]); }
      sto.push([X0 + 96, 342 + dd * 0.85]); sto.push([X0 + 80, 370 + dd * 0.85]);
      sto.push([X0 + 50, 376 + dd * 0.85]); sto.push([X0 + 32, 358 + dd * 0.85]); sto.push([X0 + 34, 326 + dd * 0.85]);
      stomach.setAttribute("d", crPath(sto, true));

      // сердце: едет вниз с сухожильным центром + сердцебиение ~72 уд/мин
      var beat = 1 - 0.028 * Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 1.2)), 6);
      gHeartIn.setAttribute("transform", "translate(0 " + f1(S.hDy) + ") translate(218 250) scale(" + beat.toFixed(4) + ") translate(-218 -250)");

      // лёгкие
      var lr = lungPts(-1, p, G, D), ll = lungPts(1, p, G, D);
      var dR = crPath(lr, true), dL = crPath(ll, true);
      LR.body.setAttribute("d", dR); LR.tex.setAttribute("d", dR);
      LL.body.setAttribute("d", dL); LL.tex.setAttribute("d", dL);
      var vol = clamp(0.45 * p.d + 0.35 * p.r + 0.2 * p.c, 0, 1);
      LR.body.setAttribute("fill-opacity", (0.8 + vol * 0.14).toFixed(3));
      LL.body.setAttribute("fill-opacity", (0.8 + vol * 0.14).toFixed(3));
      // щели: справа горизонтальная (по IV хрящу) + косая; слева косая
      var r4 = lr[6], r5 = lr[7];
      var obR0 = [lerp(r4[0], r5[0], .3), lerp(r4[1], r5[1], .3)], obR1 = [X0 - 46, polyY(D.poly, X0 - 46) - 5];
      LR.f1.setAttribute("d", "M" + P(obR0) + "Q" + P([X0 - 66, lerp(obR0[1], obR1[1], .55)]) + " " + P(obR1));
      var hz0 = [X0 - 8, 206 - p.r * 3.5 - p.c * 5], hz1 = [lerp(obR0[0], obR1[0], .18), lerp(obR0[1], obR1[1], .18)];
      LR.f2.setAttribute("d", "M" + P(hz0) + "Q" + P([X0 - 50, hz0[1] + 4]) + " " + P(hz1));
      var l4 = ll[6], l5 = ll[7];
      var obL0 = [lerp(l4[0], l5[0], .1), lerp(l4[1], l5[1], .1)], obL1 = [X0 + 40, polyY(D.poly, X0 + 40) - 5];
      LL.f1.setAttribute("d", "M" + P(obL0) + "Q" + P([X0 + 68, lerp(obL0[1], obL1[1], .5)]) + " " + P(obL1));
      LL.f2.setAttribute("d", "");
      // плевральные синусы — граница париетальной плевры
      var plL = [], plR = [];
      [3, 5, 7, 8, 9, 10].forEach(function (i) {
        plL.push([G.left[i].L[0] + 5, G.left[i].L[1] + 6]); plR.push([G.right[i].L[0] - 5, G.right[i].L[1] + 6]);
      });
      plL.push([X0 - D.Wl + 8, polyY(D.poly, X0 - D.Wl + 8) - 2]); plR.push([X0 + D.Wr - 8, polyY(D.poly, X0 + D.Wr - 8) - 2]);
      pleura.setAttribute("d", crPath(plL, false) + crPath(plR, false));

      // трахея + бронхи: карина опускается на вдохе, дерево растягивается
      var cy = 166 + dd * 0.15 - p.c * 2;
      trach.setAttribute("height", f1(cy - 82));
      var rd = "";
      for (var ry = 88; ry < cy - 3; ry += 6.4) rd += "M" + f1(X0 - 6) + " " + f1(ry) + "Q" + X0 + " " + f1(ry + 2.4) + " " + f1(X0 + 6) + " " + f1(ry);
      rings.setAttribute("d", rd);
      var sx2 = 1 + 0.07 * p.r + 0.02 * p.c, sy2 = 1 + 0.15 * p.d / 1 * 1 + 0.04 * p.r;
      var bt = function (hx, y, s) { return [X0 + s * hx * sx2, cy + (y - 166) * sy2]; };
      var bi = 0;
      [["R", -1], ["L", 1]].forEach(function (kk) {
        BR[kk[0]].forEach(function (b) {
          var a1 = bt(b[0], b[1], kk[1]), a2 = bt(b[2], b[3], kk[1]);
          var d = "M" + P(a1) + "L" + P(a2);
          brO[bi].setAttribute("d", d); brI[bi].setAttribute("d", d); bi++;
        });
      });
      S.bronL = bt(26, 184, 1);

      // частицы воздуха в трахее: вниз на вдохе, вверх на выдохе
      var dtA = clamp(t - st.lastT, 0, 0.1); st.lastT = t;
      st.airOff += v.f * dtA * 55;
      var flow = clamp(Math.abs(v.f) * 1.4, 0, 1);
      airDots.forEach(function (c, i) {
        var yy = 84 + (((i * 11.5 + st.airOff) % 80) + 80) % 80;
        c.setAttribute("cy", f1(yy));
        c.setAttribute("cx", f1(X0 + Math.sin(i * 2.3) * 3.2));
        c.setAttribute("opacity", (yy < cy - 2 ? flow : 0).toFixed(2));
        c.setAttribute("fill", v.f >= 0 ? C.inAir : C.outAir);
      });

      // диафрагма
      var dpath = crPath(D.pts, false);
      diaM.setAttribute("d", dpath); diaM2.setAttribute("d", dpath); diaFib.setAttribute("d", dpath);
      var tend = D.poly.filter(function (q) { return q[0] > X0 - 40 && q[0] < X0 + 38; });
      diaT.setAttribute("d", tend.length ? "M" + tend.map(P).join("L") : "");
      diaFill.setAttribute("d", dpath + "L" + P([X0 + D.Wr, 392]) + "L" + P([X0 - D.Wl, 392]) + "Z");

      // рёбра и хрящи
      ["left", "right"].forEach(function (sideKey) {
        var s = sideKey === "left" ? -1 : 1, g = G[sideKey];
        for (var i = 1; i <= 12; i++) {
          var o = ribEls[sideKey][i], bd = ribFront(i, g[i].J, g[i].L, s), bk = ribBack(i, g[i].J, g[i].L, s);
          o.bO.setAttribute("d", bd); o.bI.setAttribute("d", bd);
          o.kO.setAttribute("d", bk); o.kI.setAttribute("d", bk);
          if (o.cO) {
            var cc = cartilage(i, s, p, g), cd = cartPath(cc[0], cc[1]);
            o.cO.setAttribute("d", cd); o.cI.setAttribute("d", cd);
            if (i === 9 && s === 1) S.cartR9 = cc;
          }
        }
      });

      // межрёберные мышцы — светлеют, когда сокращаются (вдох с участием рёбер)
      var icAct = clamp(p.r * (p.inhale ? 1 : 0.5), 0, 1);
      if (MU) drawMuscles(p, G, D, sdy, t);
      if (!MU) (function () {
        var s = IC_SIDE === "left" ? -1 : 1, g = G[IC_SIDE];
        function band(o, pre, up, dn, step, dir) {
          var poly = "M" + up.map(P).join("L") + "L" + dn.slice().reverse().map(P).join("L") + "Z";
          o[pre + "base"].setAttribute("d", poly); o[pre + "hi"].setAttribute("d", poly);
          o[pre + "hi"].setAttribute("fill-opacity", (icAct * 0.32).toFixed(2));
          var n = up.length - 1, dD = "", dL = "";
          // густые волокна: каждая линия — от верхнего края к нижнему со сдвигом (наклон)
          for (var k = -step * 2; k <= step * (n + 2); k++) {
            var t = k / step, a = t, b = t + dir * 0.9;          // в долях отрезков
            if (Math.max(a, b) < 0 || Math.min(a, b) > n) continue;
            var A = edgePt(up, a), B = edgePt(dn, b);
            if (!A || !B) continue;
            var seg = "M" + P([lerp(A[0], B[0], .04), lerp(A[1], B[1], .04)]) + "L" + P([lerp(A[0], B[0], .96), lerp(A[1], B[1], .96)]);
            if (k % 2) dL += seg; else dD += seg;
          }
          o[pre + "fibD"].setAttribute("d", dD); o[pre + "fibL"].setAttribute("d", dL);
          o[pre + "fibL"].setAttribute("stroke-opacity", (0.45 + icAct * 0.35).toFixed(2));
        }
        function edgePt(arr, t) {                              // точка по ломаной, t в отрезках (обрезка по краям)
          if (t < 0 || t > arr.length - 1) return null;
          var k = Math.min(Math.floor(t), arr.length - 2), f = t - k;
          return [lerp(arr[k][0], arr[k + 1][0], f), lerp(arr[k][1], arr[k + 1][1], f)];
        }
        IC_SPACES.forEach(function (i) {
          var o = icEls[i], A = g[i], B = g[i + 1], N = 10, up = [], dn = [], k;
          for (k = 0; k <= N; k++) { var u = lerp(0.02, 0.9, k / N); up.push(ribPt(A.J, A.L, u)); dn.push(ribPt(B.J, B.L, u)); }
          band(o, "", up, dn, 4, -1.6);                        // наружные: к середине (к хрящу) книзу
          var ca = cartilage(i, s, p, g), cb = cartilage(i + 1, s, p, g), cu = [], cd = [], M = 8;
          for (k = 0; k <= M; k++) { var w = lerp(0, 0.97, k / M); cu.push(cartPt(ca[0], ca[1], w)); cd.push(cartPt(cb[0], cb[1], w)); }
          band(o, "c", cu, cd, 4, -1.4);                       // внутренние: книзу к ребру (в сторону)
          if (i === 6) { var m = ribPt(A.J, A.L, 0.3), m2 = ribPt(B.J, B.L, 0.3); S.icR = [lerp(m[0], m2[0], .5), lerp(m[1], m2[1], .5)]; }
        });
      })();

      // грудина
      var yS = function (y) { return f1(y - sdy); };
      /* Грудина по анатомии: рукоятка (яремная вырезка, ключичные вырезки,
         вырезка 1-го ребра) → грудинный угол → тело, слегка расширяющееся
         книзу, с рёберными вырезками по краям (2–7 рёбра) → маленький тупой
         мечевидный отросток. Правая половина, затем зеркально. */
      var SH = [[0, 134.5], [6, 129.5], [12, 129], [15.5, 131.5], [19, 134], [22.5, 137], [22, 141],
                [20.5, 145], [17.5, 152], [15, 158], [16.5, 162], [15.2, 166], [16.4, 172], [15.2, 182],
                [17, 191], [15.6, 201], [17.6, 211], [15.8, 221], [17, 232], [14.6, 243], [13.8, 252],
                [11.5, 260], [9.6, 265.5], [8, 268.5], [7.6, 272.5], [6.4, 277], [4.2, 280.5], [0, 282]];
      var shR = SH.map(function (q) { return [X0 + q[0], q[1] - sdy]; });
      var shL = SH.slice(1, -1).reverse().map(function (q) { return [X0 - q[0], q[1] - sdy]; });
      stern.setAttribute("d", crPath(shR.concat(shL), true));
      // грудинный угол и мечевидно-грудинное соединение — чётко; сросшиеся сегменты тела — еле заметно
      sternLines.setAttribute("d", "M" + (X0 - 15) + " " + yS(160) + " Q" + X0 + " " + yS(162) + " " + (X0 + 15) + " " + yS(160) +
        "M" + (X0 - 7.5) + " " + yS(267.5) + " L" + (X0 + 7.5) + " " + yS(267.5));
      sternRidges.setAttribute("d", [182, 201, 221, 243].map(function (y, k) {
        var w = [12, 13, 13, 11][k];
        return "M" + (X0 - w) + " " + yS(y) + " Q" + X0 + " " + yS(y + 1.5) + " " + (X0 + w) + " " + yS(y);
      }).join(""));

      // ключицы
      [-1, 1].forEach(function (s) {
        // короче и анатомичнее: медиальный конец толще (у грудины), лёгкий S-изгиб,
        // латеральный конец почти горизонтально уходит к акромиону
        var m = [X0 + s * 17, 132 - p.c * 3 - p.r * 1], lat = [X0 + s * 96, 121 - p.c * 13 - p.r * 1.5];
        var d = "M" + P(m) + "C" + P([X0 + s * 38, 139 - p.c * 5]) + " " + P([X0 + s * 66, 117 - p.c * 10]) + " " + P(lat);
        var de = "M" + P(m) + "L" + P([X0 + s * 24, 134.5 - p.c * 3.6 - p.r]);
        clav[s].e.setAttribute("d", de); clav[s].eI.setAttribute("d", de);
        clav[s].o.setAttribute("d", d); clav[s].i.setAttribute("d", d);
        if (s < 0) S.clavL = [X0 - 62, 125 - p.c * 9];
      });

      // стрелки — видны, только пока соответствующая часть движется
      var dir = function (val) { return val >= 0 ? 1 : -1; };
      setArrow(arrAir, X0, 16, v.f >= 0 ? 0 : 180, Math.abs(v.f) * 1.6);
      [-1, 1].forEach(function (s, i) {
        setArrow(arrClav[i], X0 + s * 122, 100 - p.c * 12, dir(v.c) > 0 ? 180 : 0, Math.abs(v.c) * 1.4);
        setArrow(arrRib[i], X0 + s * (140 + p.r * 6), 262, (dir(v.r) > 0 ? -s : s) * 90, Math.abs(v.r) * 1.4);
        var dx = X0 + s * 58;
        setArrow(arrDia[i], dx, polyY(D.poly, dx) - 26, dir(v.d) > 0 ? 0 : 180, Math.abs(v.d) * 1.4);
        setArrow(arrAbd[i], X0 + s * (150 + p.d * 6), 452, (dir(v.d) > 0 ? -s : s) * 90, Math.abs(v.d) * 1.3);
      });
      var fo = clamp(Math.abs(v.d) * 1.3, 0, 1);
      fwd.setAttribute("opacity", fo.toFixed(2));
      var forward = v.d >= 0;
      fwdDot.setAttribute("opacity", forward ? 1 : 0); fwdX.setAttribute("opacity", forward ? 0 : 1);
      fwdT.textContent = forward ? "живот вперёд" : "живот назад";

      // подписи
      labEls.forEach(function (le) {
        if (!le.w) {
          try { le.w = le.spans.length ? Math.max.apply(null, le.spans.map(function (sp) { return sp.getComputedTextLength(); })) : le.tx.getComputedTextLength(); } catch (e) {}
          if (!le.w) le.w = Math.max.apply(null, le.L.t.split("\n").map(function (t) { return t.length; })) * 5;
        }
        var a = le.L.a(S);
        var sx = le.L.side < 0 ? 6 + le.w + 4 : 394 - le.w - 4, sy = le.L.y - 3 + (le.n - 1) * 5;
        var mx = le.L.side < 0 ? sx + 8 : sx - 8;
        le.ln.setAttribute("d", "M" + f1(sx) + " " + f1(sy) + "L" + f1(mx) + " " + f1(sy) + "L" + P(a));
        le.dot.setAttribute("cx", f1(a[0])); le.dot.setAttribute("cy", f1(a[1]));
      });

      // шапка
      var txt = p.inhale ? "Вдох" : "Выдох";
      phaseEl.textContent = txt;
      phaseEl.className = "banim-phase " + (p.inhale ? "in" : "out");
      if (MUS) subEl.textContent = st.mus ? st.mus.name.toLowerCase() : "дыхательные мышцы";
      else if (mode.w && p.u >= 0) subEl.textContent = p.u < 0.5 ? "① диафрагма" : "② рёбра";
      else subEl.textContent = "вид спереди";
      barFill.style.width = (p.t / T_CYC * 100).toFixed(1) + "%";
    }

    function drawMuscles(p, G, D, sdy, t) {
      var m = st.mus; if (!m) return;
      var aIn = musAct("in", t), aOut = musAct("out", t);
      var vis = function (k) { return MU[k].g.getAttribute("display") !== "none"; };
      var ab = 1 + p.d * 0.05;
      var latX = function (s, y) {
        var T = [[206, 133], [300, 131 + p.r * 4], [398, 123 + p.d * 3], [470, 127 + p.d * 6], [564, 131 + p.d * 3]];
        for (var k = 0; k < T.length - 1; k++) if (y <= T[k + 1][0]) return X0 + s * lerp(T[k][1], T[k + 1][1], (y - T[k][0]) / (T[k + 1][0] - T[k][0]));
        return X0 + s * T[T.length - 1][1];
      };
      var col = function (n, f) { var a = []; for (var k = 0; k <= n; k++) a.push(f(k / n)); return a; };
      if (vis("dia")) {
        MU.dia.hl.setAttribute("d", "M" + D.poly.map(P).join("L"));
        MU.dia.hl.setAttribute("stroke-opacity", (0.25 + aIn * 0.7).toFixed(2));
      }
      ["ext", "int"].forEach(function (key) {
        if (!vis(key)) return;
        var act = key === "ext" ? aIn : aOut;
        ["left", "right"].forEach(function (side) {
          var s = side === "left" ? -1 : 1, g = G[side];
          for (var i = 1; i <= 11; i++) {
            var o = MU[key].sp[side][i], A = g[i], B = g[i + 1], N = 10;
            var up = col(N, function (u) { return ribPt(A.J, A.L, lerp(0.02, i <= 2 ? 0.8 : 0.93, u)); });
            var dn = col(N, function (u) { return ribPt(B.J, B.L, lerp(0.02, i <= 2 ? 0.8 : 0.93, u)); });
            // наружные — вниз и к середине; внутренние — вниз и в стороны
            musBand(o.b, up, dn, 3, key === "ext" ? -1.6 : 1.6, act);
            if (o.c) {
              var ca = cartilage(i, s, p, g), cb = cartilage(i + 1, s, p, g);
              var cu = col(8, function (w) { return cartPt(ca[0], ca[1], w * 0.97); });
              var cd = col(8, function (w) { return cartPt(cb[0], cb[1], w * 0.97); });
              musBand(o.c, cu, cd, 3, key === "ext" ? 1.4 : -1.4, act);
            }
          }
        });
      });
      if (vis("scal")) [-1, 1].forEach(function (s) {
        var g = G[s < 0 ? "left" : "right"], r1 = function (u) { return ribPt(g[1].J, g[1].L, u); }, r2 = function (u) { return ribPt(g[2].J, g[2].L, u); };
        var X = function (x, y) { return [X0 + s * x, y]; };
        var S3 = [
          [[X(15, 50), X(17, 78), X(24, 100), r1(0.45)], [X(19, 48), X(22, 78), X(31, 100), r1(0.62)]],   // передняя
          [[X(20, 46), X(23, 76), X(33, 100), r1(0.72)], [X(24, 44), X(27, 76), X(42, 102), r1(0.9)]],    // средняя
          [[X(24, 58), X(27.5, 84), X(46, 108), r2(0.82)], [X(27, 56), X(29, 84), X(56, 108), r2(0.97)]]  // задняя
        ];
        S3.forEach(function (q, k) { musStrap(MU.scal.m[s][k], q[0], q[1], 4, aIn); });
      });
      if (vis("scm")) [-1, 1].forEach(function (s) {
        var X = function (x, y) { return [X0 + s * x, y]; }, cy = 131 - p.c * 4;
        musStrap(MU.scm.m[s][0], [X(30, -2), X(22, 46), X(11, 98), X(4, 131 - sdy)], [X(42, -2), X(31, 46), X(19, 98), X(12, 131 - sdy)], 5, aIn);   // грудинная головка
        musStrap(MU.scm.m[s][1], [X(30, 40), X(26, 70), X(22, 102), X(20, cy)], [X(34, 38), X(32, 70), X(32, 102), X(37, cy - 1)], 5, aIn);       // ключичная головка
      });
      if (vis("tra")) {
        var apo = "";
        [-1, 1].forEach(function (s) {
          var med = col(12, function (u) { var y = lerp(292, 512, u); return [X0 + s * 46 * ab, y]; });
          var lat = col(12, function (u) { var y = lerp(292, 500, u); return [latX(s, y) - s * 4, y]; });
          musBand(MU.tra.m[s], med, lat, 3, 0, aOut);
          apo += polyOf(col(4, function (u) { return [X0 + s * 6, lerp(300, 512, u)]; }), col(4, function (u) { return [X0 + s * 46 * ab, lerp(300, 512, u)]; }));
        });
        MU.tra.apo.setAttribute("d", apo);
      }
      if (vis("obl")) [-1, 1].forEach(function (s) {
        var ioLat = col(12, function (u) { var y = lerp(300, 482, u); return [latX(s, y) - s * 3, y]; });
        var ioMed = col(12, function (u) { var y = lerp(262, 462, u); return [X0 + s * lerp(56, 50, u) * ab, y]; });
        musBand(MU.obl.io[s], ioLat, ioMed, 3, 0, aOut);          // внутренняя: от бока вверх к середине
        var eoLat = col(12, function (u) { var y = lerp(236, 470, u); return [latX(s, y) - s * 2, y]; });
        var eoMed = col(12, function (u) { var y = lerp(300, 540, u); return [X0 + s * lerp(52, 30, u * u) * ab, y]; });
        musBand(MU.obl.eo[s], eoLat, eoMed, 3, 0, aOut);          // наружная: от рёбер вниз к середине
      });
      if (vis("rec")) {
        [-1, 1].forEach(function (s) {
          var med = [[X0 + s * 8 * ab, 272 - sdy], [X0 + s * 7 * ab, 340], [X0 + s * 7 * ab, 400], [X0 + s * 7 * ab, 470], [X0 + s * 8 * ab, 545]];
          var lat = [[X0 + s * 52 * ab, 288 - sdy], [X0 + s * 54 * ab, 340], [X0 + s * 52 * ab, 400], [X0 + s * 44 * ab, 470], [X0 + s * 24 * ab, 545]];
          musStrap(MU.rec.m[s], med, lat, 6, aOut);
        });
        MU.rec.tend.setAttribute("d", [334, 390, 446].map(function (y) {
          var w = y < 400 ? 52 : 48;
          return "M" + f1(X0 - w * ab) + " " + (y + 2) + "Q" + X0 + " " + (y - 3) + " " + f1(X0 + w * ab) + " " + (y + 2);
        }).join(""));
      }
    }

    function loop(now) {
      st.raf = 0;
      if (!mount.isConnected) return;
      if (st.paused || !st.visible) return;
      frame((now - st.t0) / 1000);
      st.raf = requestAnimationFrame(loop);
    }
    function kick() { if (!st.raf && !st.paused && st.visible) st.raf = requestAnimationFrame(loop); }
    frame(0);
    st.t0 = performance.now();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        st.visible = en[0].isIntersecting;
        if (st.visible) { st.lastT = 0; kick(); }
      }).observe(mount);
    }
    kick();
    mount._banim = st;
  }

  var GX_ICON = '<svg viewBox="0 0 32 32" width="28" height="28"><g fill="#f2c9c6" stroke="#b9666d" stroke-width="1.2">' +
    '<circle cx="19" cy="10" r="5"/><circle cx="25" cy="15" r="5"/><circle cx="21" cy="21" r="5"/><circle cx="14" cy="17" r="5"/></g>' +
    '<path d="M3 26 L12 18" stroke="#b9666d" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="18" cy="13" r="1.6" fill="#4fc3f7"/><circle cx="22" cy="19" r="1.6" fill="#b39ddb"/></svg>';

  /* ===================================================================
     2. ГАЗООБМЕН
     =================================================================== */
  var GX_T = 9;              // цикл: вдох 0–3, обмен 3–6, выдох 6–9 с
  var O2C = "#4fd0ff", CO2C = "#b896ff";
  var DEOXY = "#7a2448", OXY = "#e8383d";

  var ACI = {
    tubes: [
      [[[-14, 60], [40, 70], [96, 92]], 30, 20],
      [[[96, 92], [134, 108], [170, 128]], 24, 15],
      [[[170, 128], [200, 108], [238, 90]], 21, 14],
      [[[170, 128], [198, 152], [242, 187]], 21, 14]
    ],
    // [cx, cy, r, группа]  группа: 0 — почки на дыхательной бронхиоле, 1 — ходы, 2 — мешочек A, 3 — мешочек B
    alv: [
      [110, 111, 7.5, 0], [155, 106, 8.5, 0], [145, 128, 8, 0],
      [210, 87, 10, 1], [222, 113, 10, 1], [180, 156, 10, 1], [209, 179, 10, 1], [227, 158, 10, 1],
      [258, 64, 17, 2], [282, 46, 17, 2], [308, 56, 17, 2], [323, 82, 17, 2], [308, 107, 17, 2], [281, 110, 17, 2], [252, 90, 15, 2], [286, 78, 18, 2],
      [252, 200, 17, 3], [263, 172, 17, 3], [290, 161, 17, 3], [317, 172, 17, 3], [326, 199, 17, 3], [312, 225, 17, 3], [284, 233, 17, 3], [258, 226, 15, 3], [290, 198, 18, 3]
    ]
  };
  function aciRoute(ai) {
    var a = ACI.alv[ai], g = a[3], r = [[-14, 60], [40, 70], [96, 92]];
    if (g === 0) { r.push([lerp(96, 170, (a[0] - 96) / 74), lerp(92, 128, (a[0] - 96) / 74)]); }
    else {
      r.push([134, 108]); r.push([170, 128]);
      var upper = (g === 2) || (g === 1 && a[1] < 125);
      if (upper) { r.push([200, 108]); r.push([238, 90]); }
      else { r.push([198, 152]); r.push([242, 187]); }
    }
    r.push([a[0], a[1]]);
    return r;
  }
  function polyAt(route, f) {
    var L = [0], tot = 0;
    for (var i = 1; i < route.length; i++) { tot += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); L.push(tot); }
    var want = clamp(f, 0, 1) * tot;
    for (var j = 1; j < route.length; j++) {
      if (want <= L[j]) {
        var t = (want - L[j - 1]) / ((L[j] - L[j - 1]) || 1);
        return [lerp(route[j - 1][0], route[j][0], t), lerp(route[j - 1][1], route[j][1], t)];
      }
    }
    return route[route.length - 1].slice();
  }

  var gxOpen = null;

  function openGasExchange() {
    if (gxOpen) return;
    var ov = H("div", "gx-ov", document.body);
    var sheet = H("div", "gx-sheet", ov);
    var head = H("div", "gx-head", sheet);
    H("div", "gx-title", head, "Газообмен в альвеолах");
    var close = H("button", "gx-close", head, "×"); close.type = "button";
    close.setAttribute("aria-label", "Закрыть");
    close.addEventListener("click", closeGasExchange);

    // шаги — кнопки: нажатие останавливает анимацию на этом этапе, ▶ / ❚❚ — пуск и пауза
    var steps = H("div", "gx-steps", sheet);
    var playBtn = H("button", "gx-play", steps, ""); playBtn.type = "button";
    var stepEls = ["1 · Вдох", "2 · Обмен", "3 · Выдох"].map(function (t, i) {
      var b = H("button", "gx-step", steps, t); b.type = "button";
      b.addEventListener("click", function () { pickStep(i); });
      return b;
    });
    var stepBar = H("div", "gx-stepbar", sheet); var stepFill = H("div", "", stepBar);

    H("div", "gx-sec", sheet, "Ацинус — здесь начинается газообмен");
    var figA = H("div", "gx-fig", sheet);
    var svgA = E("svg", { viewBox: "0 0 400 300", role: "img", "aria-label": "Ацинус: бронхиолы, альвеолярные ходы, мешочки и капилляры" }, figA);
    var capEl = H("div", "gx-cap", sheet);

    H("div", "gx-sec", sheet, "Аэрогематический барьер — крупно");
    var figB = H("div", "gx-fig", sheet);
    var svgB = E("svg", { viewBox: "0 0 400 250", role: "img", "aria-label": "Барьер между воздухом альвеолы и кровью капилляра" }, figB);
    H("div", "gx-grad", sheet,
      '<div class="gx-grad-row"><span>Из лёгочной артерии<br><b>PO₂ 40 · PCO₂ 46</b></span><span class="r">В лёгочные вены<br><b>PO₂ ≈ 100 · PCO₂ 40</b></span></div>' +
      '<div class="gx-grad-bar"><i></i></div>' +
      '<div class="gx-grad-note">мм рт. ст. · кровь проходит капилляр за ≈ 0,75 с, а насыщается O₂ уже за первую треть пути (≈ 0,25 с) — запас на нагрузку</div>');
    H("div", "gx-legend", sheet,
      '<span><i style="background:' + O2C + '"></i>O₂ кислород</span>' +
      '<span><i style="background:' + CO2C + '"></i>CO₂ углекислый газ</span>' +
      '<span><i style="background:' + DEOXY + '"></i>кровь бедна O₂</span>' +
      '<span><i style="background:' + OXY + '"></i>кровь богата O₂</span>');
    H("div", "gx-notes", sheet,
      "<p>На самом деле обмен идёт непрерывно — и на вдохе, и на выдохе: в лёгких всегда остаётся около 2,5 л воздуха (функциональная остаточная ёмкость). Фазы разделены для наглядности.</p>" +
      "<p>O₂ переносит гемоглобин — до 4 молекул на одну Hb. CO₂ едет в основном как бикарбонат (≈ 70%), связанным с Hb (≈ 20%) и растворённым в плазме (≈ 7–10%).</p>" +
      "<p>Толщина барьера ≈ 0,5 мкм, эритроцит ≈ 7,5 мкм — барьер на схеме утолщён, чтобы были видны слои.</p>");

    var stA = buildAcinus(svgA), stB = buildBarrier(svgB);
    var vt = 0, lastNow = 0, paused = false, raf = 0, lastPh = -1;
    var FREEZE = [2.2, 4.4, 6.9];      // кадр, на котором останавливаемся в каждом этапе
    var CAPS = [
      "<b>Вдох.</b> Воздух (≈ 21% O₂) идёт по терминальной и дыхательной бронхиолам, альвеолярным ходам — в мешочки и альвеолы.",
      "<b>Обмен.</b> O₂ проходит через стенку альвеолы в кровь капилляров и садится на гемоглобин, CO₂ выходит из крови в альвеолу. Всё — простой диффузией, по разнице давлений.",
      "<b>Выдох.</b> CO₂ и неиспользованный O₂ уходят обратно: в выдыхаемом воздухе ≈ 16% O₂ и ≈ 4% CO₂."
    ];
    function draw(t) {
      var ct = t % GX_T, ph = Math.min(2, Math.floor(ct / 3));
      stA(ct, t); stB(t);
      if (ph !== lastPh) {
        lastPh = ph;
        stepEls.forEach(function (s, i) { s.classList.toggle("on", i === ph); });
        capEl.innerHTML = CAPS[ph];
      }
      stepFill.style.width = (ct / GX_T * 100).toFixed(1) + "%";
    }
    function loop(now) {
      raf = 0;
      if (!ov.isConnected || paused) return;
      if (lastNow) vt += Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      draw(vt);
      raf = requestAnimationFrame(loop);
    }
    function setPaused(p) {
      paused = p;
      ov.classList.toggle("paused", p);
      playBtn.innerHTML = p   // SVG, а не символы ▶ — на iPhone они превращаются в эмодзи
        ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5 L13 8 L4 13.5 Z" fill="#fff"/></svg>'
        : '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="#fff"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="#fff"/></svg>';
      playBtn.setAttribute("aria-label", p ? "Продолжить" : "Пауза");
      if (!p) { lastNow = 0; if (!raf) raf = requestAnimationFrame(loop); }
    }
    function pickStep(i) {
      vt = Math.floor(vt / GX_T) * GX_T + FREEZE[i];
      lastPh = -1;
      setPaused(true);
      draw(vt);
    }
    playBtn.addEventListener("click", function () { setPaused(!paused); });
    figA.addEventListener("click", function () { setPaused(!paused); });
    figB.addEventListener("click", function () { setPaused(!paused); });
    setPaused(false);
    requestAnimationFrame(function () { ov.classList.add("show"); });
    gxOpen = { ov: ov, stop: function () { if (raf) cancelAnimationFrame(raf); } };
  }
  function closeGasExchange() {
    if (!gxOpen) return false;
    var g = gxOpen; gxOpen = null;
    g.ov.classList.remove("show");
    setTimeout(function () { g.stop(); g.ov.remove(); }, 220);
    return true;
  }

  function buildAcinus(svg) {
    var defs = E("defs", null, svg);
    defs.innerHTML =
      '<linearGradient id="gx-cap" gradientUnits="userSpaceOnUse" x1="240" y1="0" x2="340" y2="0">' +
      '<stop offset="0" stop-color="#5068d8"/><stop offset=".45" stop-color="#b0408a"/><stop offset="1" stop-color="#e64545"/></linearGradient>' +
      '<radialGradient id="gx-lum" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#fff3f1"/><stop offset="1" stop-color="#f7d6d4"/></radialGradient>';

    // межацинарная перегородка (в ней идёт вена)
    E("path", { d: "M352 -4 C364 60 384 120 372 180 C364 230 378 270 392 304", fill: "none", stroke: "#3a3f47", "stroke-width": 10, "stroke-linecap": "round" }, svg);
    // ветвь лёгочной артерии — вдоль бронхиолы (кровь бедна O2)
    var artD = "M-14 88 C40 98 80 114 120 124 C150 132 172 146 196 162 C214 174 232 190 244 204";
    var art2D = "M170 140 C196 124 220 104 240 92";
    // лёгочная венула — по периферии, в перегородке (кровь богата O2)
    var venD = "M342 202 C358 196 368 178 372 150 C376 120 370 100 340 84";
    var ven2D = "M372 150 C378 110 384 60 380 -8";
    [[artD, "#2d3f8f", 10], [art2D, "#2d3f8f", 7], [venD, "#8e2323", 9], [ven2D, "#8e2323", 11]].forEach(function (v) {
      E("path", { d: v[0], fill: "none", stroke: v[1], "stroke-width": v[2], "stroke-linecap": "round" }, svg);
    });
    var art = E("path", { d: artD, fill: "none", stroke: "#4d68d6", "stroke-width": 6.5, "stroke-linecap": "round" }, svg);
    var art2 = E("path", { d: art2D, fill: "none", stroke: "#4d68d6", "stroke-width": 4.2, "stroke-linecap": "round" }, svg);
    var ven = E("path", { d: venD, fill: "none", stroke: "#e04848", "stroke-width": 5.6, "stroke-linecap": "round" }, svg);
    var ven2 = E("path", { d: ven2D, fill: "none", stroke: "#e04848", "stroke-width": 7, "stroke-linecap": "round" }, svg);

    // стенки (наружный контур) → просветы: объединение даёт цельный мешочек
    var gW = E("g", null, svg), gL = E("g", null, svg), gS = E("g", null, svg), gC = E("g", null, svg), gP = E("g", null, svg), gLab = E("g", null, svg);
    ACI.tubes.forEach(function (tb) {
      var d = "M" + tb[0].map(P).join("L");
      E("path", { d: d, fill: "none", stroke: "#d98a92", "stroke-width": tb[1], "stroke-linecap": "round", "stroke-linejoin": "round" }, gW);
      E("path", { d: d, fill: "none", stroke: "#f5d0cf", "stroke-width": tb[2], "stroke-linecap": "round", "stroke-linejoin": "round" }, gL);
    });
    // гладкие мышцы терминальной бронхиолы (хряща и желёз здесь уже нет)
    E("path", { d: "M10 56 L14 78 M24 59 L28 81 M38 63 L42 85 M52 68 L56 90 M66 73 L69 95", stroke: "#c06e78", "stroke-width": 1.3, "stroke-opacity": .6 }, gW);
    ACI.alv.forEach(function (a) {
      E("circle", { cx: a[0], cy: a[1], r: a[2] + 3.5, fill: "#d98a92" }, gW);
      E("circle", { cx: a[0], cy: a[1], r: a[2], fill: "url(#gx-lum)" }, gL);
      E("circle", { cx: a[0], cy: a[1], r: a[2] - 0.5, fill: "none", stroke: "#e7aeb3", "stroke-width": 1.1, "stroke-opacity": .7 }, gS);
    });
    // капилляры — в стенках альвеол (межальвеолярных перегородках)
    var ringDots = [];
    ACI.alv.forEach(function (a, i) {
      if (a[3] < 1) return;
      E("circle", { cx: a[0], cy: a[1], r: a[2] + 1.8, fill: "none", stroke: "url(#gx-cap)", "stroke-width": 2.4, "stroke-opacity": .95 }, gC);
      if (a[3] >= 2 && i % 2 === 0) {
        var ang = rnd(i, 3) * 6.28;
        E("path", { d: "M" + P([a[0] + Math.cos(ang) * (a[2] + 2), a[1] + Math.sin(ang) * (a[2] + 2)]) + "Q" + P([a[0], a[1]]) + " " +
          P([a[0] + Math.cos(ang + 2.4) * (a[2] + 2), a[1] + Math.sin(ang + 2.4) * (a[2] + 2)]),
          fill: "none", stroke: "url(#gx-cap)", "stroke-width": 1.4, "stroke-opacity": .55 }, gC);
      }
      ringDots.push({ a: a, el: E("ellipse", { rx: 2.4, ry: 1.7, fill: DEOXY }, gC), ph: rnd(i, 9) });
    });
    // альвеолярный макрофаг и альвеолоцит II типа — деталь для внимательных
    E("ellipse", { cx: 300, cy: 92, rx: 5, ry: 3.6, fill: "#c7a27e", stroke: "#8d6c50", "stroke-width": .8 }, gS);
    E("circle", { cx: 298.5, cy: 91.5, r: 1.4, fill: "#6d4c36" }, gS);
    E("path", { d: "M264 233 q4 -6 8 0", fill: "#e8b3a0", stroke: "#a86a5a", "stroke-width": .8 }, gS);

    // эритроциты в сосудах
    var vessels = [{ el: art, n: 5, c: DEOXY, sp: 26 }, { el: art2, n: 2, c: DEOXY, sp: 22 }, { el: ven, n: 3, c: OXY, sp: 24 }, { el: ven2, n: 4, c: OXY, sp: 26 }];
    vessels.forEach(function (v) {
      v.len = v.el.getTotalLength ? v.el.getTotalLength() : 100;
      v.dots = [];
      for (var i = 0; i < v.n; i++) v.dots.push(E("ellipse", { rx: 2.8, ry: 1.9, fill: v.c, stroke: "#00000033", "stroke-width": .5 }, gP));
    });

    // частицы газов
    var targets = []; ACI.alv.forEach(function (a, i) { if (a[3] >= 1 || i % 2 === 0) targets.push(i); });
    var O2 = [], CO2 = [];
    for (var i = 0; i < 38; i++) {
      var ai = targets[Math.floor(rnd(i, 1) * targets.length)];
      O2.push({ ai: ai, route: aciRoute(ai), s: rnd(i, 2) * 1.3, dur: 1.4 + rnd(i, 3) * 0.4, abs: rnd(i, 4) < 0.62,
        at: 3.15 + rnd(i, 5) * 2.4, th: rnd(i, 6) * 6.283, ox: rnd(i, 7), oy: rnd(i, 8), ex: 6.1 + rnd(i, 13) * 0.9,
        el: E("circle", { r: 2.6, fill: O2C, stroke: "#0b3b52", "stroke-width": .6, opacity: 0 }, gP),
        glow: E("circle", { r: 0, fill: "none", stroke: O2C, "stroke-width": 1.2, opacity: 0 }, gP) });
    }
    for (var j = 0; j < 26; j++) {
      var aj = targets[Math.floor(rnd(j, 21) * targets.length)];
      CO2.push({ ai: aj, route: aciRoute(aj), e: 3.25 + rnd(j, 22) * 2.4, th: rnd(j, 23) * 6.283, ox: rnd(j, 24), oy: rnd(j, 25),
        ex: 6.0 + rnd(j, 26) * 0.9, dur: 1.6 + rnd(j, 27) * 0.4,
        el: E("circle", { r: 2.7, fill: CO2C, stroke: "#2f1d5c", "stroke-width": .6, opacity: 0 }, gP) });
    }

    // подписи
    var LAB = [
      ["Терминальная бронхиола", 6, 16, "start", [40, 66], [6, 22]],
      ["Дыхательная бронхиола", 66, 36, "start", [134, 104], [100, 41]],
      ["Альвеолярный мешочек", 394, 16, "end", [304, 40], [330, 21]],
      ["Альвеола", 394, 134, "end", [327, 176], [366, 139]],
      ["Альвеолярный ход", 92, 232, "start", [205, 180], [150, 222]],
      ["Ветвь лёгочной артерии", 6, 262, "start", [116, 123], [60, 252]],
      ["Капилляры в стенках альвеол", 394, 262, "end", [322, 238], [330, 252]],
      ["Лёгочная венула", 394, 284, "end", [376, 176], [372, 274]]
    ];
    LAB.forEach(function (l) {
      var t = E("text", { x: l[1], y: l[2], "text-anchor": l[3], "font-size": 11, fill: "#cdd4db" }, gLab);
      t.textContent = l[0];
      E("path", { d: "M" + P(l[5]) + "L" + P(l[4]), stroke: "#79828c", "stroke-width": .9, fill: "none" }, gLab);
      E("circle", { cx: l[4][0], cy: l[4][1], r: 2, fill: "#eef2f5" }, gLab);
    });
    var sub1 = E("text", { x: 6, y: 276, "font-size": 9.5, fill: "#8d96a0" }, gLab); sub1.textContent = "кровь бедна O₂";
    var sub2 = E("text", { x: 394, y: 297, "text-anchor": "end", "font-size": 9.5, fill: "#8d96a0" }, gLab); sub2.textContent = "в перегородке, кровь богата O₂";

    function inAlv(a, ox, oy, t, k) {
      var rr = a[2] * 0.55 * Math.sqrt(ox), an = oy * 6.283 + Math.sin(t * 1.3 + k) * 0.5;
      return [a[0] + Math.cos(an) * rr + Math.sin(t * 2.1 + k * 1.7) * 1.2, a[1] + Math.sin(an) * rr + Math.cos(t * 1.9 + k) * 1.2];
    }
    function setC(el, x, y, op) { el.setAttribute("cx", f1(x)); el.setAttribute("cy", f1(y)); el.setAttribute("opacity", clamp(op, 0, 1).toFixed(2)); }

    return function (ct, t) {
      // кровь
      vessels.forEach(function (v) {
        v.dots.forEach(function (d, i) {
          var L = ((t * v.sp + i * v.len / v.n) % v.len);
          var q = v.el.getPointAtLength(L);
          d.setAttribute("cx", f1(q.x)); d.setAttribute("cy", f1(q.y));
        });
      });
      ringDots.forEach(function (rd, i) {
        var a = rd.a, an = (t * 0.9 + rd.ph * 6.283) % 6.283;
        var x = a[0] + Math.cos(an) * (a[2] + 1.8), y = a[1] + Math.sin(an) * (a[2] + 1.8);
        rd.el.setAttribute("cx", f1(x)); rd.el.setAttribute("cy", f1(y));
        rd.el.setAttribute("fill", mixHex(DEOXY, OXY, clamp((x - 245) / 80, 0, 1)));
      });
      // O2
      O2.forEach(function (o, k) {
        var a = ACI.alv[o.ai], x, y, op = 0, g = 0;
        if (ct < o.s) { op = 0; x = -20; y = 60; }
        else if (ct < o.s + o.dur) {
          var fr = eio((ct - o.s) / o.dur), q = polyAt(o.route, fr);
          var r2 = inAlv(a, o.ox, o.oy, t, k), w = clamp((fr - 0.85) / 0.15, 0, 1);
          x = lerp(q[0], r2[0], w); y = lerp(q[1], r2[1], w); op = clamp((ct - o.s) / 0.25, 0, 1);
        } else if (o.abs && ct >= o.at) {
          var wall = [a[0] + Math.cos(o.th) * (a[2] + 1.5), a[1] + Math.sin(o.th) * (a[2] + 1.5)];
          var r3 = inAlv(a, o.ox, o.oy, t, k), u = clamp((ct - o.at) / 0.45, 0, 1);
          x = lerp(r3[0], wall[0], eio(u)); y = lerp(r3[1], wall[1], eio(u));
          op = 1 - clamp((ct - o.at - 0.45) / 0.25, 0, 1);
          g = ct > o.at + 0.4 ? clamp(1 - (ct - o.at - 0.4) / 0.6, 0, 1) : 0;
          if (g > 0) { o.glow.setAttribute("cx", f1(wall[0])); o.glow.setAttribute("cy", f1(wall[1])); o.glow.setAttribute("r", f1(2 + (1 - g) * 7)); }
        } else if (!o.abs && ct >= o.ex) {
          var fr2 = eio((ct - o.ex) / 1.7), q2 = polyAt(o.route, 1 - fr2);
          x = q2[0]; y = q2[1]; op = 1 - clamp((fr2 - 0.8) / 0.2, 0, 1);
        } else {
          var r4 = inAlv(a, o.ox, o.oy, t, k); x = r4[0]; y = r4[1]; op = 1;
        }
        setC(o.el, x, y, op);
        o.glow.setAttribute("opacity", (g * 0.9).toFixed(2));
      });
      // CO2
      CO2.forEach(function (c, k) {
        var a = ACI.alv[c.ai], x = -20, y = 60, op = 0;
        var wall = [a[0] + Math.cos(c.th) * (a[2] + 1.5), a[1] + Math.sin(c.th) * (a[2] + 1.5)];
        if (ct >= c.e && ct < c.ex) {
          var u = clamp((ct - c.e) / 0.6, 0, 1), r = inAlv(a, c.ox, c.oy, t, k + 50);
          x = lerp(wall[0], r[0], eio(u)); y = lerp(wall[1], r[1], eio(u)); op = clamp(u * 3, 0, 1);
        } else if (ct >= c.ex && ct < c.ex + c.dur) {
          var fr = eio((ct - c.ex) / c.dur), q = polyAt(c.route, 1 - fr);
          var r0 = inAlv(a, c.ox, c.oy, t, k + 50), w = clamp(fr / 0.12, 0, 1);
          x = lerp(r0[0], q[0], w); y = lerp(r0[1], q[1], w); op = 1 - clamp((fr - 0.82) / 0.18, 0, 1);
        }
        setC(c.el, x, y, op);
      });
    };
  }

  function buildBarrier(svg) {
    var W = 272;
    var defs = E("defs", null, svg);
    defs.innerHTML =
      '<linearGradient id="gx-air" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4f2"/><stop offset="1" stop-color="#f7dcda"/></linearGradient>' +
      '<linearGradient id="gx-air2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff4f2"/><stop offset="1" stop-color="#f7dcda"/></linearGradient>' +
      '<linearGradient id="gx-pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3cfa6"/><stop offset=".5" stop-color="#f8dcbb"/><stop offset="1" stop-color="#f3cfa6"/></linearGradient>' +
      '<clipPath id="gx-clip"><rect x="0" y="0" width="' + W + '" height="250" rx="10"/></clipPath>';
    var g = E("g", { "clip-path": "url(#gx-clip)" }, svg);
    // верхняя альвеола
    E("rect", { x: 0, y: 0, width: W, height: 97, fill: "url(#gx-air)" }, g);
    // слои барьера (сверху вниз): сурфактант, альвеолоцит I, общая базальная мембрана, эндотелий
    E("rect", { x: 0, y: 96, width: W, height: 3, fill: "#eecb6a" }, g);
    E("rect", { x: 0, y: 99, width: W, height: 7, fill: "#e3909c" }, g);
    E("ellipse", { cx: 64, cy: 100, rx: 28, ry: 8, fill: "#e3909c" }, g);
    E("ellipse", { cx: 64, cy: 100.5, rx: 13, ry: 4.6, fill: "#9c4a69" }, g);
    E("path", { d: "M36 96 Q64 86 92 96", fill: "none", stroke: "#eecb6a", "stroke-width": 3 }, g);
    E("rect", { x: 0, y: 106, width: W, height: 3, fill: "#a785b6" }, g);
    E("rect", { x: 0, y: 109, width: W, height: 6, fill: "#e8a29b" }, g);
    // просвет капилляра — плазма
    E("rect", { x: 0, y: 115, width: W, height: 70, fill: "url(#gx-pl)" }, g);
    E("ellipse", { cx: 196, cy: 116, rx: 24, ry: 6.5, fill: "#e8a29b" }, g);
    E("ellipse", { cx: 196, cy: 116.5, rx: 11, ry: 3.6, fill: "#a85461" }, g);
    // нижняя стенка и соседняя альвеола (тонкая сторона перегородки)
    E("rect", { x: 0, y: 185, width: W, height: 5, fill: "#e8a29b" }, g);
    E("rect", { x: 0, y: 190, width: W, height: 2.5, fill: "#a785b6" }, g);
    E("rect", { x: 0, y: 192.5, width: W, height: 5, fill: "#e3909c" }, g);
    E("rect", { x: 0, y: 197.5, width: W, height: 2.5, fill: "#eecb6a" }, g);
    E("rect", { x: 0, y: 200, width: W, height: 50, fill: "url(#gx-air2)" }, g);

    var gR = E("g", null, g), gP = E("g", null, g);
    // эритроцит в капилляре деформируется «парашютом»: выпуклый фронт, вогнутый хвост
    var RBC_D = "M-13 -27 C5 -30 22 -17 22 0 C22 17 5 30 -13 27 C-9 18 -8 9 -8 0 C-8 -9 -9 -18 -13 -27 Z";
    var rbcs = [];
    var SP = 22, GAP = 74, NR = Math.ceil((W + 80) / GAP);
    for (var i = 0; i < NR; i++) {
      var rg = E("g", null, gR);
      var body = E("path", { d: RBC_D, stroke: "#5a1830", "stroke-width": 1 }, rg);
      var pal = E("path", { d: "M-2 -14 C6 -13 11 -7 11 0 C11 7 6 13 -2 14", fill: "none", stroke: "#ffffff", "stroke-opacity": .18, "stroke-width": 3 }, rg);
      rbcs.push({ g: rg, body: body });
    }
    var O2 = [], CO2 = [];
    for (var k = 0; k < 16; k++) O2.push(E("circle", { r: 2.7, fill: O2C, stroke: "#0b3b52", "stroke-width": .6, opacity: 0 }, gP));
    for (var m = 0; m < 12; m++) CO2.push(E("circle", { r: 2.8, fill: CO2C, stroke: "#2f1d5c", "stroke-width": .6, opacity: 0 }, gP));

    var tx = function (s, x, y, size, fill, anchor) {
      var t = E("text", { x: x, y: y, "font-size": size, fill: fill, "text-anchor": anchor || "start" }, svg); t.textContent = s; return t;
    };
    tx("Альвеола · PO₂ ≈ 100, PCO₂ ≈ 40", 8, 16, 9.5, "#9a6066");
    tx("соседняя альвеола", 8, 242, 9.5, "#9a6066");
    E("rect", { x: 0.5, y: 0.5, width: W - 1, height: 249, rx: 10, fill: "none", stroke: "#3a3f47" }, svg);

    var LB = [
      ["Воздух альвеолы", 40, [250, 52]],
      ["Сурфактант", 76, [266, 97.5]],
      ["Альвеолоцит I типа", 94, [266, 102.5]],
      ["Базальная мембрана", 112, [266, 107.5]],
      ["Эндотелий", 130, [266, 112]],
      ["Плазма", 150, [262, 128]],
      ["Эритроцит (Hb)", 172, null],
      ["Соседняя альвеола", 226, [250, 224]]
    ];
    var rbcLead = null, rbcDot = null;
    LB.forEach(function (l) {
      tx(l[0], 281, l[1], 10.5, "#cdd4db");
      if (l[2]) {
        E("path", { d: "M279 " + (l[1] - 4) + " L272 " + (l[1] - 4) + " L" + P(l[2]), stroke: "#79828c", "stroke-width": .9, fill: "none" }, svg);
        E("circle", { cx: l[2][0], cy: l[2][1], r: 1.9, fill: "#3b4148" }, svg);
      } else {
        rbcLead = E("path", { stroke: "#79828c", "stroke-width": .9, fill: "none" }, svg);
        rbcDot = E("circle", { r: 1.9, fill: "#ffffff" }, svg);
      }
    });

    function rbcColor(x) { return mixHex(DEOXY, OXY, eio(clamp((x - 30) / 80, 0, 1))); }

    return function (t) {
      var lastX = null;
      rbcs.forEach(function (r, i) {
        var x = ((t * SP + i * GAP) % (NR * GAP)) - 40;
        r.g.setAttribute("transform", "translate(" + f1(x) + " 150)");
        r.body.setAttribute("fill", rbcColor(x));
        if (x > 170 && x < 240 && (lastX === null || x > lastX)) lastX = x;
      });
      if (lastX !== null) { rbcLead.setAttribute("d", "M279 168 L272 168 L" + f1(lastX + 14) + " 156"); rbcDot.setAttribute("cx", f1(lastX + 14)); rbcDot.setAttribute("cy", 156); rbcLead.setAttribute("opacity", 1); rbcDot.setAttribute("opacity", 1); }
      else { rbcLead.setAttribute("opacity", 0); rbcDot.setAttribute("opacity", 0); }

      // O2: из обеих альвеол через барьер в плазму → на эритроцит; больше у входа (там градиент больше)
      O2.forEach(function (el, k) {
        var per = 2.3, ph = t / per + rnd(k, 31), cyc = Math.floor(ph), u = ph - cyc;
        var top = rnd(k, cyc) < 0.68;
        var x0 = 10 + 150 * Math.pow(rnd(k + 7, cyc), 1.7);
        var y0 = top ? 26 + rnd(k + 3, cyc) * 58 : 212 + rnd(k + 3, cyc) * 26;
        var y1 = top ? 140 + rnd(k + 5, cyc) * 8 : 160 - rnd(k + 5, cyc) * 8;
        var y = lerp(y0, y1, eio(u));
        var inLumen = top ? y > 115 : y < 185;
        var drift = inLumen ? (Math.abs(y - (top ? 115 : 185)) / Math.abs(y1 - (top ? 115 : 185))) * 0.6 * SP * per * 0.5 : 0;
        var x = x0 + Math.sin(u * 9 + k) * 2.2 + drift;
        el.setAttribute("cx", f1(x)); el.setAttribute("cy", f1(y));
        el.setAttribute("opacity", (Math.min(clamp(u / 0.12, 0, 1), 1 - clamp((u - 0.86) / 0.14, 0, 1))).toFixed(2));
      });
      // CO2: из эритроцитов/плазмы в обе альвеолы
      CO2.forEach(function (el, k) {
        var per = 2.5, ph = t / per + rnd(k, 41), cyc = Math.floor(ph), u = ph - cyc;
        var top = rnd(k + 2, cyc) < 0.65;
        var x0 = 12 + 170 * Math.pow(rnd(k + 9, cyc), 1.5);
        var y0 = 150 + (rnd(k + 4, cyc) - 0.5) * 30;
        var y1 = top ? 22 + rnd(k + 6, cyc) * 56 : 214 + rnd(k + 6, cyc) * 26;
        var y = lerp(y0, y1, eio(u));
        var x = x0 + Math.sin(u * 8 + k) * 2.4 + (1 - clamp(Math.abs(y - y0) / 35, 0, 1)) * u * 10;
        el.setAttribute("cx", f1(x)); el.setAttribute("cy", f1(y));
        el.setAttribute("opacity", (Math.min(clamp(u / 0.12, 0, 1), 1 - clamp((u - 0.82) / 0.18, 0, 1))).toFixed(2));
      });
    };
  }

  /* ---------- автомонтаж ---------- */
  function scan(root) {
    var list = (root || document).querySelectorAll(".banim-mount:not([data-banim])");
    Array.prototype.forEach.call(list, function (m) { m.setAttribute("data-banim", "1"); buildBreath(m); });
    var ml = (root || document).querySelectorAll(".bmus-mount:not([data-banim])");
    Array.prototype.forEach.call(ml, function (m) { m.setAttribute("data-banim", "1"); buildBreath(m, { level: m.getAttribute("data-level") || "deep" }); });
  }
  function start() {
    scan(document);
    var app = document.getElementById("app") || document.body;
    new MutationObserver(function () { scan(app); }).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.BreathAnim = { closeOverlay: closeGasExchange, openGasExchange: openGasExchange, mount: scan };
})();
