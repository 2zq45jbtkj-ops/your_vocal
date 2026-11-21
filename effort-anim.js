/* Лекция «Сила работы голоса».
   .ef-scale-mount   — шкала усилия 1–10 (нюансы ppp…fffff) + смыкание связок по усилию
   .ef-anatomy-mount — «Что видит врач»: норма / отёк / узелки / кровоизлияние, вдох / звук, подписи
   Монтируется сам (MutationObserver по #app), анимация идёт только пока карточка на экране. */
(function () {
  "use strict";

  var C10 = ["#bfe3f7", "#acd4ea", "#99c4db", "#87b3cb", "#75a2ba", "#6390a8", "#527e96", "#416b82", "#c7716a", "#b24a45"];
  var NU = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "fffff"];
  var NW = ["очень-очень тихо", "очень тихо", "тихо", "чуть тише среднего", "чуть громче среднего", "громко", "очень громко", "очень-очень громко", "крик", "предел"];
  var ET = [
    "Связки едва касаются друг друга, колеблются широко и свободно. Звук лёгкий, может быть с воздухом.",
    "Очень лёгкое смыкание — тихий, мягкий звук.",
    "Как в спокойном разговоре: связки встречаются мягко, без удара.",
    "Чуть плотнее разговора — связки смыкаются чисто и легко.",
    "Рабочая зона: смыкание плотное, но без удара. Голос звучит и не устаёт.",
    "Громкий разговор: связки дольше остаются сомкнутыми, встреча становится сильнее.",
    "Плотное смыкание и заметный удар. Долго так петь тяжело.",
    "Связки прижаты друг к другу, колеблются мало. Сверху начинают сближаться ложные связки.",
    "Крик: связки бьются с силой, ложные связки сжимают звук сверху. Долго так нельзя.",
    "Предел: максимальный удар, ложные связки почти закрывают голосовые. Травмоопасно."
  ];
  var HT = ["мягко", "мягко", "мягко", "лёгкая", "умеренная", "средняя", "сильная", "сильная", "очень сильная", "предельная"];
  var SN = ["Норма", "Отёк", "Узелки", "Кровоизлияние"];
  var DS = [
    "Голосовые складки гладкие, перламутрово-белые, края ровные. При звуке колеблется перепончатая часть, а хрящевая сомкнута — щель закрывается по всей длине, без удара.",
    "Острая перегрузка: складки покраснели и утолщены за счёт отёка поверхностного слоя слизистой (пространство Рейнке), видны расширенные сосуды. Колебания тяжелее, амплитуда меньше — голос садится. Обратимо после голосового покоя.",
    "Хроническая перегрузка: симметричные утолщения на краях обеих складок на границе передней и средней трети перепончатой части — там, где удар сильнее всего. Смыкание по типу «песочных часов»: щели спереди и сзади от узелков, голос хрипит и уходит в воздух.",
    "Разрыв сосуда под слизистой при резком ударе на пределе: красное пятно на одной складке. Она становится тяжелее и колеблется хуже второй — колебания несимметричны. Острая травма: голосовой покой и срочный осмотр у фониатра."
  ];
  var LEG = ["щитовидный хрящ", "выступ гортани (кадык)", "верхний рог щитовидного хряща", "пластинка перстневидного хряща", "черпаловидный хрящ", "голосовой отросток", "мышечный отросток", "рожковидный хрящ", "голосовая складка", "голосовая связка внутри складки", "преддверная (ложная) складка", "вход в желудочек гортани", "передняя комиссура — крепление к щитовидному хрящу", "перепончатая часть щели", "хрящевая часть щели", "межчерпаловидная область"];

  /* ---------- нюансы нотными знаками ---------- */
  var GL = { p: "", m: "", f: "" };
  var useGlyphs = false;
  var dynViews = [];
  function dyn(s, sz) {
    if (useGlyphs) return '<span class="ef-dy" style="font-size:' + sz + 'px">' + s.split("").map(function (c) { return GL[c]; }).join("") + "</span>";
    return '<span class="ef-dt" style="font-size:' + Math.round(sz * 0.75) + 'px">' + s + "</span>";
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('20px "SeptDyn"', "").then(function (fs) {
      if (fs && fs.length) { useGlyphs = true; dynViews.forEach(function (fn) { fn(); }); }
    }).catch(function () {});
  }

  /* ---------- геометрия гортани (вид сверху) ---------- */
  var CA = "#e3ebee", CS = "#9fb1ba", MU = "#c98581", ML = "#f3d6d0", FO = "#f4efe6", FS = "#d6cabb", A = [150, 53];
  function F(n) { return n.toFixed(1); }
  function PL(a) { return a.map(function (p, i) { return (i ? "L" : "M") + F(p[0]) + " " + F(p[1]); }).join(" "); }
  function rot(p, c, a) { var x = p[0] - c[0], y = p[1] - c[1], co = Math.cos(a), si = Math.sin(a); return [c[0] + x * co - y * si, c[1] + x * si + y * co]; }
  function tri(s, S) {
    var a = S.op * 0.6, c = [160, 236], g = S.op * 4;
    var T = [[151.2, 196], [187, 224], [151.6, 242]].map(function (p) { var r = rot(p, c, a); return [r[0] + g, r[1]]; });
    if (s < 0) T = T.map(function (p) { return [300 - p[0], p[1]]; });
    return T;
  }
  function cen(P) { var x = 0, y = 0; P.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / P.length, y / P.length]; }
  function rp(P, r, bend) {
    var c = cen(P), N = P.length, ex = [], en = [], i;
    for (i = 0; i < N; i++) {
      var p = P[i], a = P[(i + N - 1) % N], b = P[(i + 1) % N], ua = [a[0] - p[0], a[1] - p[1]], ub = [b[0] - p[0], b[1] - p[1]];
      var la = Math.hypot(ua[0], ua[1]), lb = Math.hypot(ub[0], ub[1]), rr = Math.min(r, la * 0.4, lb * 0.4);
      en.push([p[0] + ua[0] / la * rr, p[1] + ua[1] / la * rr]); ex.push([p[0] + ub[0] / lb * rr, p[1] + ub[1] / lb * rr]);
    }
    var d = "M" + F(ex[0][0]) + " " + F(ex[0][1]);
    for (i = 0; i < N; i++) {
      var j = (i + 1) % N, m = [(ex[i][0] + en[j][0]) / 2, (ex[i][1] + en[j][1]) / 2], v = [m[0] - c[0], m[1] - c[1]], lv = Math.hypot(v[0], v[1]);
      var q = [m[0] + v[0] / lv * bend, m[1] + v[1] / lv * bend];
      d += " Q" + F(q[0]) + " " + F(q[1]) + " " + F(en[j][0]) + " " + F(en[j][1]) + " Q" + F(P[j][0]) + " " + F(P[j][1]) + " " + F(ex[j][0]) + " " + F(ex[j][1]);
    }
    return d + "Z";
  }
  function scl(P, k) { var c = cen(P); return P.map(function (p) { return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]; }); }
  function cqOf(e) { return 0.3 + 0.055 * (e - 1); }

  function fold(s, vib, S) {
    var st = S.st, op = S.op, e = S.eff, VP = tri(s, S)[0], dx = VP[0] - A[0], dy = VP[1] - A[1], Ln = Math.hypot(dx, dy);
    var d = [dx / Ln, dy / Ln], n = [s * d[1], -s * d[0]];
    var ea = Math.max(0.9, 4.6 - 0.38 * (e - 1));
    var amp = st === 1 ? 1.8 : st === 2 ? 2.5 : (st === 3 && s === 1) ? 1.1 : ea;
    var hem = st === 3 && s === 1, base = e <= 2 ? 1.3 - 0.4 * (e - 1) : 0.4, bul = S.cmp ? Math.max(0, e - 5) * 0.25 : 0;
    var ffs = S.cmp ? Math.max(0, e - 7) * 3.4 : 0, med = [], lat = [], ffi = [], ffo = [];
    for (var i = 0; i <= 44; i++) {
      var u = i / 44, mem = Math.sin(Math.PI * u), nod = st === 2 ? 4.6 * Math.exp(-Math.pow((u - 0.33) / 0.06, 2)) : 0, hg = st === 2 ? 3.2 * mem * (1 - op) : 0;
      var gh = base + (1 - op) * (vib * amp * mem + hg) - nod - (st === 1 ? 1.4 * mem * (1 - op) : 0);
      if (gh < 0.3) gh = 0.3;
      var w = (2.6 + 9 * Math.pow(Math.sin(Math.PI * Math.min(u, 0.97)), 0.6)) * (st === 1 ? 1.4 : hem ? 1.2 : 1) + bul * mem;
      var b = [A[0] + d[0] * Ln * u + n[0] * gh, A[1] + d[1] * Ln * u + n[1] * gh], l = [b[0] + n[0] * w, b[1] + n[1] * w];
      med.push(b); lat.push(l);
      if (u > 0.03) {
        var sh = ffs * Math.sin(Math.PI * u), fi = [l[0] + n[0] * (4.5 - sh), l[1] + n[1] * (4.5 - sh) + 1];
        var fw = 4 + 18 * Math.sin(Math.PI * Math.min(1, u * 1.02)) + sh * 0.6;
        ffi.push(fi); ffo.push([fi[0] + n[0] * fw, fi[1] + n[1] * fw + 1]);
      }
    }
    var ee = lat[44], m = med[44];
    var cap = "Q" + F((ee[0] + m[0]) / 2 + d[0] * 5) + " " + F((ee[1] + m[1]) / 2 + d[1] * 5) + " " + F(m[0]) + " " + F(m[1]);
    var fD = PL(med.slice().reverse()) + " " + PL(lat).replace(/^M/, "L") + " " + cap + "Z";
    var la = ffo[ffo.length - 1], e2 = [la[0] + d[0] * 14, la[1] + d[1] * 14];
    var ffD = PL(ffi) + " Q" + F(e2[0]) + " " + F(e2[1]) + " " + F(la[0]) + " " + F(la[1]) + " " + PL(ffo.slice().reverse()).replace(/^M/, "L") +
      " Q" + F(ffi[0][0] - d[0] * 6) + " " + F(ffi[0][1] - d[1] * 6) + " " + F(ffi[0][0]) + " " + F(ffi[0][1]) + "Z";
    return { med: med, lat: lat, ffi: ffi, ffo: ffo, fD: fD, ffD: ffD, n: n, d: d };
  }

  var TH = "M150 30 Q158 31 163 39 C192 70 238 104 243 152 C246 186 242 214 240 232 L244 256 Q245 264 238 263 Q233 262 232 254 L230 236 C232 214 234 186 231 152 C226 110 180 78 150 52";
  var MUC = "M150 52 C178 78 232 110 236 152 C238 192 232 224 222 246 Q150 282 78 246 C68 224 62 192 64 152 C68 110 122 78 150 52 Z";
  var CR = "M92 222 Q150 250 208 222 Q222 238 210 260 Q150 292 90 260 Q78 238 92 222 Z";

  function pill(tx, x, y, an, c) {
    var w = tx.length * 5.6 + 12, rx = an === "middle" ? x - w / 2 : an === "end" ? x - w : x, tX = an === "middle" ? x : an === "end" ? x - 6 : x + 6;
    return '<rect x="' + F(rx) + '" y="' + (y - 10) + '" width="' + F(w) + '" height="14" rx="7" fill="rgba(15,21,24,.9)"/><text x="' + F(tX) + '" y="' + y + '" fill="' + (c || "#e3e7ea") + '" font-size="10" text-anchor="' + an + '">' + tx + "</text>";
  }
  function label(tx, x, y, an, pt, c) {
    var w = tx.length * 5.6 + 12, rx = an === "middle" ? x - w / 2 : an === "end" ? x - w : x;
    var ax = Math.max(rx + 6, Math.min(rx + w - 6, pt[0])), ay = pt[1] > y ? y + 4 : y - 10;
    return '<line x1="' + F(pt[0]) + '" y1="' + F(pt[1]) + '" x2="' + F(ax) + '" y2="' + F(ay) + '" stroke="#8b969d" stroke-width=".7"/><circle cx="' + F(pt[0]) + '" cy="' + F(pt[1]) + '" r="1.8" fill="#e3e7ea"/>' + pill(tx, x, y, an, c);
  }

  function draw(S, t, p) {
    var st = S.st, op = S.op, e = S.eff, cq = cqOf(e), phs = (t * 0.0009) % 1, open = 1 - cq;
    var vib = S.ph ? (phs < open ? Math.sin(Math.PI * phs / open) : 0) : 0;
    var L = fold(-1, vib, S), R = fold(1, vib, S), TL = tri(-1, S), TR = tri(1, S);
    var gl = PL(L.med) + " L" + F(TL[0][0]) + " " + F(TL[0][1]) + " L" + F(TL[2][0]) + " " + F(TL[2][1]) + " L" + F(TR[2][0]) + " " + F(TR[2][1]) +
      " L" + F(TR[0][0]) + " " + F(TR[0][1]) + " " + PL(R.med.slice().reverse()).replace(/^M/, "L") + "Z";
    var o = '<defs><linearGradient id="$bg" x2="0" y2="1"><stop offset="0" stop-color="#1d262b"/><stop offset="1" stop-color="#0f1518"/></linearGradient>' +
      '<clipPath id="$gc"><path d="' + gl + '"/></clipPath><clipPath id="$fl"><path d="' + L.fD + '"/></clipPath><clipPath id="$fr"><path d="' + R.fD + '"/></clipPath>';
    [["o", "#e07a4a"], ["r", "#e24b4a"], ["b", "#3a8bb8"]].forEach(function (k) {
      o += '<marker id="$m' + k[0] + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="' + k[1] + '" stroke-width="2"/></marker>';
    });
    o += '</defs><rect width="300" height="314" rx="14" fill="url(#$bg)"/>';
    var mir = 'transform="translate(300,0) scale(-1,1)"';
    o += '<path d="' + MUC + '" fill="' + MU + '" stroke="' + ML + '" stroke-width="1.2"/><path d="' + TH + ' Z" fill="' + CA + '"/><path d="' + TH + ' Z" fill="' + CA + '" ' + mir + '/>' +
      '<line x1="150" y1="32" x2="150" y2="51" stroke="' + CA + '" stroke-width="3"/><path d="' + TH + '" fill="none" stroke="' + CS + '" stroke-linejoin="round"/><path d="' + TH + '" fill="none" stroke="' + CS + '" stroke-linejoin="round" ' + mir + '/>' +
      '<path d="M150 38 Q154 46 152 52" stroke="' + CS + '" stroke-width=".6" fill="none" opacity=".7"/><path d="M150 38 Q146 46 148 52" stroke="' + CS + '" stroke-width=".6" fill="none" opacity=".7"/>' +
      '<ellipse cx="150" cy="170" rx="64" ry="86" fill="none" stroke="' + CS + '" stroke-width=".7" stroke-dasharray="3 3" opacity=".45"/><path d="' + CR + '" fill="' + CA + '" stroke="' + CS + '"/>';
    var ffC = st === 1 ? "#d98c86" : (S.cmp && e >= 9 ? "#cf7e78" : "#d39893");
    function FFs() {
      var r = "";
      [L, R].forEach(function (Fd) { r += '<path d="' + Fd.ffD + '" fill="' + ffC + '" stroke="' + ML + '" stroke-width="1"/><path d="' + PL(Fd.ffi) + '" stroke="#5e2a2c" stroke-width="2.4" fill="none" stroke-linecap="round"/>'; });
      return r;
    }
    var over = S.cmp && e >= 8;
    if (!over) o += FFs();
    o += '<path d="' + gl + '" fill="#0d1215"/>';
    if (op > 0.25) {
      o += '<g clip-path="url(#$gc)" opacity="' + F(Math.min(1, (op - 0.25) * 1.4)) + '">';
      for (var r = 0; r < 7; r++) o += '<path d="M' + (132 - r * 4) + " " + (116 + r * 16) + " Q150 " + (108 + r * 16) + " " + (168 + r * 4) + " " + (116 + r * 16) + '" stroke="#2b3a42" stroke-width="3" fill="none" stroke-linecap="round"/>';
      o += "</g>";
    }
    o += '<path d="M' + F(TL[2][0] - 2) + " " + F(TL[2][1]) + " Q150 " + F(248 - op * 2) + " " + F(TR[2][0] + 2) + " " + F(TR[2][1]) + " L" + F(TR[2][0] + 2) + " " + F(TR[2][1] + 12) +
      " Q150 262 " + F(TL[2][0] - 2) + " " + F(TL[2][1] + 12) + 'Z" fill="' + MU + '" stroke="' + ML + '" stroke-width="1"/>';
    [[L, -1, "fl"], [R, 1, "fr"]].forEach(function (x) {
      var Fd = x[0], s = x[1], k = x[2], hem = st === 3 && s === 1, i, a, m, l;
      o += '<path d="' + Fd.fD + '" fill="' + (st === 1 ? "#f0d3a6" : hem ? "#f1dcd3" : FO) + '" stroke="' + FS + '" stroke-width=".9"/><g clip-path="url(#$' + k + ')">';
      if (st === 1) [0.35, 0.65].forEach(function (f) {
        var arr = [];
        for (var j = 2; j <= 42; j += 2) { var mm = Fd.med[j], ll = Fd.lat[j]; arr.push([mm[0] + (ll[0] - mm[0]) * f + Math.sin(j * 0.6 + f * 8) * 1.2 * Fd.n[0], mm[1] + (ll[1] - mm[1]) * f]); }
        o += '<path d="' + PL(arr) + '" stroke="#c0474a" stroke-width=".9" fill="none" opacity=".85"/>';
      });
      if (hem) {
        m = Fd.med[18]; l = Fd.lat[18];
        var c = [(m[0] + l[0]) / 2, (m[1] + l[1]) / 2], an = F(Math.atan2(Fd.d[0], Fd.d[1]) * -57.3);
        o += '<ellipse cx="' + F(c[0]) + '" cy="' + F(c[1]) + '" rx="9" ry="22" fill="#9c1a29" transform="rotate(' + an + " " + F(c[0]) + " " + F(c[1]) + ')"/><ellipse cx="' + F(c[0] - Fd.n[0] * 1.5) + '" cy="' + F(c[1]) + '" rx="4" ry="11" fill="#5e0a14" opacity=".75"/>';
      }
      a = [];
      for (i = 1; i <= 43; i += 3) { m = Fd.med[i]; l = Fd.lat[i]; a.push([m[0] + (l[0] - m[0]) * 0.2, m[1] + (l[1] - m[1]) * 0.2]); }
      o += '<path d="' + PL(a) + '" stroke="#e2d6c5" stroke-width=".8" fill="none"/></g>';
      if (st === 2) { m = Fd.med[15]; o += '<ellipse cx="' + F(m[0] - Fd.n[0] * 0.5) + '" cy="' + F(m[1]) + '" rx="3.6" ry="5.4" fill="#fffaf2" stroke="#cdbdb0" stroke-width=".7"/>'; }
    });
    o += '<path d="M147.6 51.5 Q150 55 152.4 51.5" fill="' + FO + '" stroke="' + FS + '" stroke-width=".7"/>';
    if (over) o += FFs();
    var CO = {};
    [[TL, -1], [TR, 1]].forEach(function (x) {
      var T = x[0];
      o += '<path d="' + rp(scl(T, 1.18), 9, -3.5) + '" fill="#d39591" stroke="' + ML + '" stroke-width="1"/><path d="' + rp(T, 7, -3.5) + '" fill="' + CA + '" stroke="' + CS + '" stroke-width="1.1"/>';
      var ap = [(T[0][0] * 0.6 + T[1][0] + 2.4 * T[2][0]) / 4, (T[0][1] * 0.6 + T[1][1] + 2.4 * T[2][1]) / 4];
      CO[x[1]] = ap;
      o += '<ellipse cx="' + F(ap[0]) + '" cy="' + F(ap[1] - 3) + '" rx="5" ry="4.4" fill="#cfdade" stroke="' + CS + '"/>';
    });
    if (S.cmp && S.ph) {
      var col = e >= 9 ? "r" : e >= 6 ? "o" : "b", cc = { r: "#e24b4a", o: "#e07a4a", b: "#3a8bb8" }[col], len = 8 + e * 2.4, sw = F(1 + e * 0.22);
      [[L, TL], [R, TR]].forEach(function (x) {
        var Fd = x[0], T = x[1], l = Fd.lat[22], M = T[1];
        o += '<line x1="' + F(l[0] + Fd.n[0] * (len + 8)) + '" y1="' + F(l[1]) + '" x2="' + F(l[0] + Fd.n[0] * 6) + '" y2="' + F(l[1]) + '" stroke="' + cc + '" stroke-width="' + sw + '" marker-end="url(#$m' + col + ')"/>';
        o += '<line x1="' + F(M[0] + (M[0] - 150) * 0.35) + '" y1="' + F(M[1] + 8) + '" x2="' + F(M[0] + (M[0] - 150) * 0.05) + '" y2="' + F(M[1] + 2) + '" stroke="' + cc + '" stroke-width="' + sw + '" marker-end="url(#$m' + col + ')" opacity=".8"/>';
      });
      if (e >= 6 && phs > open && phs < open + 0.09) {
        var kk = (phs - open) / 0.09, mm = L.med[15];
        o += '<circle cx="150" cy="' + F(mm[1]) + '" r="' + F(3 + kk * (6 + e * 1.4)) + '" fill="none" stroke="' + cc + '" stroke-width="' + F(2.2 * (1 - kk) + 0.4) + '" opacity="' + F(1 - kk) + '"/>';
      }
    }
    if (!S.cmp && S.ph && st > 0) [L, R].forEach(function (Fd) {
      var l = Fd.lat[15];
      o += '<line x1="' + F(l[0] + Fd.n[0] * 30) + '" y1="' + F(l[1] - 6) + '" x2="' + F(l[0] + Fd.n[0] * 7) + '" y2="' + F(l[1] - 2) + '" stroke="#e07a4a" stroke-width="2.4" marker-end="url(#$mo)"/>';
    });
    var tc = cen(TR);
    if (S.cmp) {
      o += pill("сила смыкания: " + e + " из 10", 150, 16, "middle", e >= 9 ? "#f09595" : e >= 6 ? "#f3b08f" : "#e3e7ea");
      if (e >= 8) o += pill("ложные связки сжимают", 150, 306, "middle", "#f3b08f");
    }
    if (S.lm === 1) {
      var fl = R.lat[14], ff = L.ffo[30];
      o += label("щитовидный хрящ", 4, 16, "start", [64, 190]) + label("голосовая щель", 150, 16, "middle", [150, op > 0.4 ? 140 : 110]) + label("голосовая связка", 296, 16, "end", [fl[0] - R.n[0] * 3, fl[1]]);
      if (st > 0) {
        var pt = st === 2 ? R.med[15] : st === 3 ? [(R.med[18][0] + R.lat[18][0]) / 2, R.med[18][1]] : R.lat[26];
        o += label(SN[st].toLowerCase(), 296, 34, "end", pt, "#e07a4a");
      }
      o += label("ложная связка", 4, 294, "start", [ff[0] - L.n[0] * 4, ff[1]]) + label("черпаловидный хрящ", 296, 294, "end", [tc[0] + 4, tc[1] + 2]) + label("перстневидный хрящ", 150, 310, "middle", [150, 276]);
    }
    if (S.lm === 2) {
      var m24 = R.med[24], l24 = R.lat[24];
      var P = [[64, 190], [150, 34], [241, 259], [150, 278], [tc[0] + 3, tc[1] + 3], TR[0], TR[1], CO[1], R.lat[22], [m24[0] + (l24[0] - m24[0]) * 0.2, m24[1]], L.ffo[24], L.ffi[16], [150, 54], [150, op > 0.4 ? 120 : 108], [150, 214], [150, 250]];
      var colm = function (ids, x) {
        var srt = ids.slice().sort(function (a, b) { return P[a][1] - P[b][1]; }), rr = "";
        srt.forEach(function (id, k) {
          var y = 34 + k * 35, q = P[id];
          rr += '<line x1="' + F(q[0]) + '" y1="' + F(q[1]) + '" x2="' + x + '" y2="' + y + '" stroke="#8b969d" stroke-width=".6"/><circle cx="' + F(q[0]) + '" cy="' + F(q[1]) + '" r="1.7" fill="#e3e7ea"/><circle cx="' + x + '" cy="' + y + '" r="8" fill="#e07a4a"/><text x="' + x + '" y="' + (y + 3.5) + '" fill="#fff" font-size="9" text-anchor="middle">' + (id + 1) + "</text>";
        });
        return rr;
      };
      o += colm([0, 1, 10, 11, 12, 13, 14, 15], 12) + colm([2, 3, 4, 5, 6, 7, 8, 9], 288);
    }
    return ('<svg viewBox="0 0 300 314" role="img" aria-label="Голосовые связки, вид сверху">' + o + "</svg>").replace(/\$/g, p);
  }

  /* ---------- цикл анимации: только видимые карточки ---------- */
  var figs = [], uid = 0, raf = 0;
  function loop(t) {
    raf = 0;
    figs = figs.filter(function (f) { return f.el.isConnected; });
    var any = false;
    figs.forEach(function (f) {
      if (!f.visible) return;
      any = true;
      f.S.op += ((f.S.ph ? 0 : 1) - f.S.op) * 0.06;
      f.el.innerHTML = draw(f.S, t, f.id);
    });
    if (any) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) { figs.forEach(function (f) { if (f.el === en.target) f.visible = en.isIntersecting; }); });
    kick();
  }) : null;
  function addFig(el, S) {
    var f = { el: el, S: S, id: "ef" + (++uid) + "_", visible: !io };
    figs.push(f);
    if (io) io.observe(el);
    el.innerHTML = draw(S, 0, f.id);
    kick();
    return f;
  }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------- карточка «Шкала усилия» ---------- */
  function buildScale(mount) {
    var S = { st: 0, ph: 1, op: 0, eff: 3, lm: 0, cmp: 1 };
    var card = h("div", "ef");
    var modes = h("div", "ef-modes");
    [["Говорю", 3], ["Громко говорю", 6], ["Кричу", 9]].forEach(function (m) {
      var b = h("button", "ef-btn", m[0]); b.type = "button"; b.dataset.v = m[1]; modes.appendChild(b);
    });
    var track = h("div", "ef-track", '<div class="ef-line"></div><div class="ef-danger"></div><div class="ef-ring"></div><div class="ef-dot"></div>');
    var cells = h("div", "ef-cells"), nus = h("div", "ef-nus");
    for (var i = 0; i < 10; i++) {
      var c = h("div", "ef-cell", String(i + 1)); c.style.background = C10[i]; c.style.color = i < 4 ? "#22282c" : "#f2f5f7"; c.dataset.v = i + 1; cells.appendChild(c);
      var n = h("div", "ef-nu" + (i >= 8 ? " hot" : "")); n.dataset.v = i + 1; nus.appendChild(n);
    }
    var ends = h("div", "ef-ends", "<span>1 — почти без усилия</span><span>10 — предел</span>");
    var fig = h("div", "ef-fig");
    var stats = h("div", "ef-stats", '<div class="ef-stat"><small>Связки сомкнуты</small><b class="ef-cq"></b></div><div class="ef-stat"><small>Сила удара</small><b class="ef-hit"></b></div>');
    var rd = h("div", "ef-read");
    [modes, track, cells, nus, ends, fig, stats, rd].forEach(function (x) { card.appendChild(x); });
    mount.appendChild(card);
    addFig(fig, S);

    function fillNu() {
      Array.prototype.forEach.call(nus.children, function (n, i) {
        var len = NU[i].length, sz = len >= 5 ? 10 : len === 4 ? 11.5 : len === 3 ? 13 : 15;
        n.innerHTML = dyn(NU[i], sz);
      });
    }
    function setL(v) {
      S.eff = v;
      var red = v >= 9, pos = (v - 0.5) * 10 + "%", dot = track.querySelector(".ef-dot"), ring = track.querySelector(".ef-ring");
      dot.style.left = pos; ring.style.left = pos; dot.style.background = red ? "#e24b4a" : "#3a8bb8";
      ring.style.animation = red ? "ef-pu " + (v === 10 ? 0.7 : 1.2) + "s ease-out infinite" : "none";
      Array.prototype.forEach.call(cells.children, function (c, i) { c.style.outline = i === v - 1 ? "3px solid " + (red ? "#f09595" : "#e3e7ea") : "none"; c.style.outlineOffset = "-3px"; });
      Array.prototype.forEach.call(nus.children, function (n, i) { n.style.color = i === v - 1 ? (red ? "#f7c1c1" : "#e07a4a") : (i >= 8 ? "#f09595" : "#c9d1d6"); });
      Array.prototype.forEach.call(modes.children, function (b) { b.classList.toggle("on", +b.dataset.v === v); });
      rd.className = "ef-read" + (red ? " red" : "");
      rd.innerHTML = '<div class="ef-read-top"><b style="font-weight:600;color:' + (red ? "#f09595" : "#e3e7ea") + '">' + v + ' из 10</b><span style="color:' + (red ? "#f09595" : "#e07a4a") + '">' + dyn(NU[v - 1], 19) + "</span><span>— " + NW[v - 1] + "</span></div>" + ET[v - 1];
      stats.querySelector(".ef-cq").textContent = Math.round(cqOf(v) * 100) + "% цикла";
      var hit = stats.querySelector(".ef-hit"); hit.textContent = HT[v - 1]; hit.style.color = red ? "#f09595" : v >= 6 ? "#f3b08f" : "#e3e7ea";
    }
    card.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-v]");
      if (t && card.contains(t)) setL(+t.dataset.v);
    });
    fillNu(); setL(3);
    dynViews.push(function () { if (card.isConnected) { fillNu(); setL(S.eff); } });
  }

  /* ---------- карточка «Что видит врач» ---------- */
  function buildAnatomy(mount) {
    var S = { st: 0, ph: 1, op: 0, eff: 5, lm: 1, cmp: 0 };
    var card = h("div", "ef");
    var sts = h("div", "ef-states");
    SN.forEach(function (s, i) { var b = h("button", "ef-st" + (i ? "" : " on"), s); b.type = "button"; b.dataset.st = i; sts.appendChild(b); });
    var fig = h("div", "ef-fig");
    fig.style.marginTop = "0";
    var ph = h("div", "ef-row", '<button type="button" class="ef-btn" data-ph="0">Вдох</button><button type="button" class="ef-btn on" data-ph="1">Звук</button>');
    var lm = h("div", "ef-row", '<button type="button" class="ef-btn on" data-lm="1">Основные</button><button type="button" class="ef-btn" data-lm="2">Подробно</button><button type="button" class="ef-btn" data-lm="0">Без подписей</button>');
    var leg = h("div");
    var desc = h("div", "ef-desc", DS[0]);
    var foot = h("div", "ef-foot", "Вид сверху на уровне голосовой щели. Длина голосовой складки: ≈17–23 мм у мужчин, ≈12–17 мм у женщин. Колебания замедлены — в жизни это сотни раз в секунду.");
    [sts, fig, ph, lm, leg, desc, foot].forEach(function (x) { card.appendChild(x); });
    mount.appendChild(card);
    addFig(fig, S);
    card.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b || !card.contains(b)) return;
      if (b.dataset.st != null) {
        S.st = +b.dataset.st;
        Array.prototype.forEach.call(sts.children, function (x) { x.classList.toggle("on", x === b); });
        desc.textContent = DS[S.st];
      } else if (b.dataset.ph != null) {
        S.ph = +b.dataset.ph;
        Array.prototype.forEach.call(ph.children, function (x) { x.classList.toggle("on", x === b); });
      } else if (b.dataset.lm != null) {
        S.lm = +b.dataset.lm;
        Array.prototype.forEach.call(lm.children, function (x) { x.classList.toggle("on", x === b); });
        leg.innerHTML = S.lm === 2 ? '<div class="ef-legend">' + LEG.map(function (l, i) { return "<b>" + (i + 1) + "</b><span>" + l + "</span>"; }).join("") + "</div>" : "";
      }
      kick();
    });
  }

  /* ---------- автомонтаж ---------- */
  function scan(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".ef-scale-mount:not([data-ef])"), function (m) { m.setAttribute("data-ef", "1"); buildScale(m); });
    Array.prototype.forEach.call((root || document).querySelectorAll(".ef-anatomy-mount:not([data-ef])"), function (m) { m.setAttribute("data-ef", "1"); buildAnatomy(m); });
  }
  function start() {
    scan(document);
    var app = document.getElementById("app") || document.body;
    new MutationObserver(function () { scan(app); }).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.EffortAnim = { mount: scan };
})();
