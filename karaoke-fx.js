/* ==========================================================================
   KarFx — фон караоке (20.11, утверждён Николаем).

   Стиль фона выбирает ученик в шторке «Фон», выбор хранится на телефоне:
     • «Стекло» (по умолчанию) — WebGL: рифлёное (ширина ребра 20, глубина 2.8),
       матовое или квадратное (плитки-линзы 64px на весь экран, 20.11), под ним
       свет: лучи софитов / круглые софиты / лава-лампа / цветной дым /
       световые полосы (20.11, движутся на 79% медленнее); палитры Бордо /
       Терракота / Индиго / Спектр (20.11). В шторке — пилюли: шарик с
       примером узора и название.
       Тёмного ~70% экрана (подстраивается само), светлые тона насыщенные,
       чтобы не сливаться с белым текстом; контраст текста ≥ 4.5 : 1.
       Верх экрана плавно уходит в цвет страницы — без «порога» под часами.
       Свет едва «дышит» в долю песни (9% силы, плавно) — темп из karDetect.
       У каждой песни свой вариант: первая — рифлёное + лучи + Бордо,
       остальные — случайный, закрепляется за песней. Выбор в шторке тоже
       закрепляется за песней.
     • «Слоновая кость» и «Глубокий чёрный» — спокойные фоны без эффектов,
       для всех песен сразу.
   Без WebGL — прежние CSS-огоньки в цветах палитры.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KarFx = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PAL = [
    { name: "Бордо",     c: [[.07, .012, .025], [.50, .12, .20], [.95, .40, .38], [.74, .16, .26]] },
    { name: "Терракота", c: [[.08, .025, .015], [.60, .24, .14], [.98, .56, .20], [.82, .30, .14]] },
    { name: "Индиго",    c: [[.025, .025, .09], [.20, .20, .55], [.52, .46, 1.0], [.58, .26, .78]] },
    // «Спектр» (20.11): глубокий синий + оранжевый, как на фото со световыми полосами
    { name: "Спектр",    c: [[.012, .016, .045], [.10, .26, .80], [1.0, .55, .22], [.36, .62, 1.0]], n: 2 }
  ];
  PAL[0].n = PAL[1].n = PAL[2].n = 1;

  /* Палитры по числу цветов (20.11): «1 цвет», «2 цвета», «3 цвета» и «Свои».
     Палитру фона (C0 тёмная основа, C1 основной, C2 яркий, C3 акцент) строим
     из 1–3 цветов: насыщенность не ниже 50%, светлота ограничена — светлые
     тона не сливаются с белым текстом (и шейдер дополнительно держит яркость). */
  function h2rgb(h) { h = String(h || "#000").replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255 || 0; }); }
  function rgb2hsl(c) {
    var r = c[0], g = c[1], b = c[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s2 = 0;
    if (mx !== mn) {
      var d = mx - mn; s2 = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
    }
    return [h, s2, l];
  }
  function hsl2rgb(h, s2, l) {
    h = ((h % 1) + 1) % 1;
    function f(n) { var k = (n + h * 12) % 12, a = s2 * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }
    return [f(0), f(8), f(4)];
  }
  function palFrom(hexes) {
    var hs = (hexes || []).slice(0, 3).map(function (x) { return rgb2hsl(h2rgb(x)); });
    if (!hs.length) hs = [[0, .7, .4]];
    var a = hs[0], b = hs[1], c = hs[2];
    function mk(x, l, dh) { return hsl2rgb(x[0] + (dh || 0), Math.max(x[1], .5), l); }
    var C0 = hsl2rgb(a[0], .6, .045), C1 = mk(a, .42);
    var C3 = b ? mk(b, .46) : mk(a, .40, -0.05);
    var C2 = c ? mk(c, .64) : b ? mk(b, .66) : mk(a, .66, 0.04);
    return [C0, C1, C2, C3];
  }
  [
    [1, "Изумруд", ["#1fa37a"]], [1, "Янтарь", ["#e0901f"]], [1, "Сапфир", ["#2f5fe0"]], [1, "Фуксия", ["#d6338f"]],
    [2, "Закат", ["#d8342c", "#f28a1e"]], [2, "Неон", ["#e0338f", "#22b8e0"]], [2, "Океан", ["#14a3a0", "#2340c8"]], [2, "Вишня и фиолет", ["#c41e4a", "#7a35d6"]],
    [3, "Радуга", ["#f28a1e", "#e8458f", "#3aa0ff"]], [3, "Северное сияние", ["#16b07a", "#22c0d8", "#8a3ce0"]],
    [3, "Карнавал", ["#e0338f", "#f28a1e", "#f2c21e"]], [3, "Ночной город", ["#3a2bd8", "#d6338f", "#22c0d8"]]
  ].forEach(function (x) { PAL.push({ n: x[0], name: x[1], hx: x[2], c: palFrom(x[2]) }); });

  // свои палитры — на телефоне ученика; в варианте песни это p = 100 + номер
  var K_CUSTOM = "kar.fx.custom", CUST = 100, EDIT = 99, ED = null;
  function customs() { try { var a = JSON.parse(lsGetEarly(K_CUSTOM) || "[]"); return Array.isArray(a) ? a.filter(function (x) { return x && Array.isArray(x.hx) && x.hx.length; }) : []; } catch (e) { return []; } }
  function saveCustoms(a) { try { localStorage.setItem(K_CUSTOM, JSON.stringify(a)); } catch (e) {} }
  function lsGetEarly(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function getPal(p) {
    if (p === EDIT && ED) return { name: "Своя", n: "c", c: palFrom(ED.hx) };
    if (p >= CUST) { var cu = customs()[p - CUST]; if (cu) return { name: "Моя " + (p - CUST + 1), n: "c", c: palFrom(cu.hx), hx: cu.hx }; }
    return PAL[p] || PAL[0];
  }
  var UNDER = ["Лучи софитов", "Лава-лампа", "Цветной дым", "Круглые софиты", "Световые полосы"];
  var UNDER_ORDER = [0, 3, 1, 2, 4];
  var GLASS = ["Рифлёное", "Матовое", "Квадратное"];
  var MODES = [["auto", "Стекло"], ["ivory", "Слоновая кость"], ["black", "Глубокий чёрный"]];
  var FLASH = 0.09, DARK_SHARE = 0.70, RIB = 20, DEPTH = 2.8, TILE = 64;
  // «Световые полосы» движутся на 79% медленнее обычного (просьба Николая 20.11)
  var STREAK_SLOW = 0.21;
  var K_MODE = "kar.fx.mode", K_FIRST = "kar.fx.first", K_SONG = "kar.fx.song.";

  /* ---------- хранение ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function getMode() { var m = lsGet(K_MODE); return m === "ivory" || m === "black" ? m : "auto"; }
  function setMode(m) { lsSet(K_MODE, m === "ivory" || m === "black" ? m : null); }

  function validCombo(o) {
    return o && o.g >= 0 && o.g <= 2 && o.u >= 0 && o.u <= 4 &&
      ((o.p >= 0 && o.p < PAL.length) || (o.p >= CUST && o.p - CUST < customs().length)) &&
      o.g === Math.floor(o.g) && o.u === Math.floor(o.u) && o.p === Math.floor(o.p);
  }
  function randomCombo(rnd, not) {
    rnd = rnd || Math.random;
    for (var i = 0; i < 8; i++) {
      var c = { g: Math.floor(rnd() * 3), u: Math.floor(rnd() * 5), p: Math.floor(rnd() * PAL.length)};
      if (!not || c.g !== not.g || c.u !== not.u || c.p !== not.p) return c;
    }
    return { g: 0, u: 0, p: 0};
  }
  // Вариант песни: закреплённый → он; самая первая песня → рифлёное + лучи + Бордо; иначе случайный.
  function comboFor(songId, store, rnd) {
    store = store || { get: lsGet, set: lsSet };
    var key = K_SONG + songId, c = null;
    try { c = JSON.parse(store.get(key) || "null"); } catch (e) { c = null; }
    if (validCombo(c)) return c;
    if (!store.get(K_FIRST)) { c = { g: 0, u: 0, p: 0}; store.set(K_FIRST, "1"); }
    else c = randomCombo(rnd);
    store.set(key, JSON.stringify(c));
    return c;
  }
  function pin(songId, c) { lsSet(K_SONG + songId, JSON.stringify(c)); }

  function hex(c) {
    return "#" + c.map(function (v) { var s = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return s.length < 2 ? "0" + s : s; }).join("");
  }

  /* ---------- шейдеры ---------- */
  var NOISE = "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}" +
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}" +
    "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}";
  var HEAD = "precision highp float;varying vec2 v;uniform float T,A,B;uniform vec3 C0,C1,C2,C3;" + NOISE;
  var VS = "attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}";
  var FS_UNDER = [
    // 0 лучи софитов
    HEAD + "void main(){vec2 p=vec2(v.x*A,v.y);vec3 c=C0*.55;float hz=fbm(p*3.+vec2(T*.12,-T*.06));" +
    "for(int i=0;i<4;i++){float fi=float(i);vec2 o=vec2((.08+.28*fi)*A,1.12);float an=sin(T*(.22+.06*fi)+fi*1.7)*.55;vec2 dr=vec2(sin(an),-cos(an));vec2 d=p-o;float al=dot(d,dr);float pe=abs(d.x*dr.y-d.y*dr.x);" +
    "float bm=smoothstep(.06+al*.2,0.,pe)*step(0.,al)*exp(-al*.8);vec3 col=fi<.5?C3:(fi<1.5?C2:(fi<2.5?C1*1.7:C3*.9));c+=col*bm*(.45+.7*hz)*(1.+B*.9);}" +
    "c+=C1*.25*smoothstep(.35,0.,v.y)*hz;gl_FragColor=vec4(c,1.);}",
    // 1 лава-лампа
    HEAD + "void main(){vec2 p=vec2(v.x*A,v.y);float s=0.;" +
    "for(int i=0;i<7;i++){float fi=float(i);vec2 c=vec2((.15+.7*h(vec2(fi,1.)))*A+.08*sin(T*.3+fi),.5+.48*sin(T*(.10+.05*h(vec2(fi,3.)))+fi*2.1));float r=(.09+.06*h(vec2(fi,7.)))*(1.+B*.14);vec2 d=p-c;s+=r*r/max(dot(d,d),1e-4);}" +
    "float m=smoothstep(.85,1.15,s);float gl=smoothstep(.15,.9,s);" +
    "vec3 bg=mix(C1*.55,C0,v.y);vec3 c=bg+C3*gl*.28;vec3 bl=mix(C3,C2,smoothstep(1.2,3.5,s));c=mix(c,bl,m);c*=.85+.35*(1.-v.y)+B*.1;gl_FragColor=vec4(c,1.);}",
    // 2 цветной дым
    HEAD + "void main(){vec2 p=vec2(v.x*A,v.y)*1.8;float t=T*.06;" +
    "vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t));" +
    "vec2 r=vec2(fbm(p+2.8*q+vec2(1.7,9.2)+t*.6),fbm(p+2.8*q+vec2(8.3,2.8)-t*.4));" +
    "float f=fbm(p+2.2*r);vec3 c=mix(C0,C1,smoothstep(.25,.5,f));c=mix(c,C3,smoothstep(.45,.58,f)*.5);c=mix(c,C2,smoothstep(.52,.68,f));" +
    "c+=C2*.1*(smoothstep(.6,.66,f)-smoothstep(.66,.76,f));c*=1.+B*.2;gl_FragColor=vec4(c,1.);}",
    // 3 круглые софиты
    HEAD + "void main(){vec2 p=vec2(v.x*A,v.y);vec3 c=C0*.6;float hz=fbm(p*2.5+vec2(T*.08,T*.05));" +
    "for(int i=0;i<5;i++){float fi=float(i);" +
    "vec2 ce=vec2((.2+.6*h(vec2(fi,2.)))*A+.22*A*sin(T*(.15+.04*fi)+fi*1.9),.5+.38*sin(T*(.11+.05*h(vec2(fi,5.)))+fi*2.7));" +
    "float r=(.16+.07*h(vec2(fi,9.)))*(1.+B*.08);float dd=length(p-ce);" +
    "float disc=smoothstep(r,r*.82,dd);float hot=exp(-dd*dd/(r*r*.18));float halo=exp(-dd*dd/(r*r*1.6))*.25;" +
    "vec3 col=fi<.5?C2:(fi<1.5?C3:(fi<2.5?C1*1.6:(fi<3.5?C3*1.1:C2*.85)));" +
    "c+=col*(disc*(.55+.25*hz)+hot*.35+halo)*(1.+B*.6);}" +
    "gl_FragColor=vec4(c,1.);}",
    // 4 световые полосы (фото 3): много вытянутых размытых мазков — синее тело, горячая оранжево-белая сердцевина,
    // тонкая радужная кайма; дрейф на 79% медленнее (SL = 0.21)
    HEAD + "uniform float SL;void main(){vec2 p=vec2(v.x*A,v.y);float t=T*SL;" +
    "vec3 c=C0*.8+C1*.06*fbm(p*1.4+vec2(t*.04,0.));" +
    "for(int i=0;i<22;i++){float fi=float(i);float r1=h(vec2(fi,1.)),r2=h(vec2(fi,2.)),r3=h(vec2(fi,3.)),r4=h(vec2(fi,4.)),r5=h(vec2(fi,5.));" +
    "float an=-.30+.38*r3+.08*sin(t*.25+fi);vec2 dr=vec2(cos(an),sin(an));" +
    "vec2 ce=vec2(fract(r1+t*(.02+.025*r2)*(r5<.5?1.:-1.))*(A+.6)-.3,.04+.92*r2+.04*sin(t*.35+fi*1.3));" +
    "vec2 d=p-ce;d.y+=.025*sin(d.x*6.+t*.45+fi);float a=dot(d,dr);float b=d.x*dr.y-d.y*dr.x;" +
    "float ln=.07+.17*r4;float wd=.006+.016*r5;float al=exp(-a*a/(ln*ln));" +
    "float bd=exp(-b*b/(wd*wd*4.));float core=exp(-pow((b+wd*.6*sign(r3-.5))/(wd*.55),2.))*exp(-a*a/(ln*ln*.25));" +
    "float rr=exp(-pow((b-wd*1.8)/(wd*.6),2.)),bb=exp(-pow((b+wd*1.8)/(wd*.6),2.));" +
    "float warm=step(.68,r5*.6+r1*.6);vec3 body=warm>.5?C2*vec3(1.,.62,.45):mix(C1*1.25,C3*.8,r4*.4);vec3 hot=warm>.5?mix(C2,vec3(1.,.82,.55),.25):mix(C3,vec3(.75,.9,1.),.2);" +
    "vec3 col=body*bd*.75+hot*core*.8+vec3(rr*.9,0.,bb)*core*.25;c+=col*al*(.45+.55*r4)*(1.+B*.5);}" +
    "gl_FragColor=vec4(c,1.);}"
  ];
  var FS_GLASS = "precision highp float;uniform sampler2D S;uniform vec2 R;uniform float T,RW,DP,K,M,TS;uniform vec3 D,HL;" + NOISE +
    "vec3 sm(float x,float y){return texture2D(S,vec2(x,y)/R).rgb;}" +
    "vec3 fin(vec3 c,vec2 px){c=clamp(c,0.,1.);vec3 li=pow(c,vec3(2.2));float Lm=dot(li,vec3(.2126,.7152,.0722));if(Lm>.16)c*=pow(.16/Lm,1./2.2);vec2 q=px/R-.5;c*=1.-dot(q,q)*.3;return c;}" +
    "void main(){vec2 px=gl_FragCoord.xy;" +
    "if(M>.5&&M<1.5){float rr=R.x*.045;vec3 c=vec3(0.);for(int i=0;i<20;i++){float fi=float(i);float a=fi*2.39996;float r=sqrt((fi+.5)/20.)*rr;c+=sm(px.x+cos(a)*r,px.y+sin(a)*r);}c/=20.;" +
    "float lu=dot(c,vec3(.3,.59,.11));float g=smoothstep(K,K+.1,lu);c=mix(D+c*.12,c,g);" +
    "vec2 uv=px/R;c+=HL*.05*smoothstep(.9,.2,length(uv-vec2(.15,.95)));" +
    "float tex=n(px*.35)*.5+n(px*.9)*.5;c*=.96+.06*tex;" +
    // блики на матовом: мягкие косые мазки, медленно плывут
    "c=fin(c,px);float gr=h(px+fract(T*9.)*511.)-.5;float l2=dot(c,vec3(.3,.59,.11));c+=gr*.09*(1.-abs(l2-.4));" +
    "c=mix(D,c,smoothstep(0.,.08,1.-px.y/R.y));gl_FragColor=vec4(c,1.);return;}" +
    "if(M>1.5){float ts=TS;vec2 id=floor(px/ts);vec2 l=fract(px/ts)*2.-1.;vec2 cp=(id+.5)*ts;" +
    "float e=max(abs(l.x),abs(l.y));float bv=smoothstep(.62,1.,e);" +
    "vec2 nr=l*bv*.9;vec3 Nn=normalize(vec3(nr,1.));" +
    // каждая плитка — как линза: показывает пятно шире себя, сжатым к центру (как на референсе)
    "vec2 sp0=cp+l*ts*.5*1.75+nr*ts*.35;float br=ts*.15;" +
    "vec3 c=vec3(0.);for(int i=0;i<14;i++){float fi=float(i);float a=fi*2.39996;float r=sqrt((fi+.5)/14.)*br;c+=sm(sp0.x+cos(a)*r,sp0.y+sin(a)*r);}c/=14.;" +
    "float lu=dot(c,vec3(.3,.59,.11));float g=smoothstep(K,K+.1,lu);c=mix(D+c*.12,c,g);" +
    "vec3 L=normalize(vec3(-.5,.45,.75));float dl=dot(Nn,L);float sp=pow(max(dot(reflect(-L,Nn),vec3(0,0,1)),0.),30.);" +
    "float tex=n(px*.4)*.5+n(px*1.1)*.5;c*=.94+.08*tex;" +
    "c*=.80+.28*dl;c+=sp*HL*.22*bv;" +
    "c*=1.-smoothstep(.86,.96,e)*.35;c+=smoothstep(.955,.99,e)*HL*.09;" +
    // блики: волна света идёт по сетке наискосок и скользит по скосам плиток
    "c=fin(c,px);c+=(h(px+fract(T*7.)*317.)-.5)*.04;c=mix(D,c,smoothstep(0.,.08,1.-px.y/R.y));gl_FragColor=vec4(c,1.);return;}" +
    "float w=RW;float id=floor(px.x/w);float u=fract(px.x/w);float xc=u*2.-1.;float cx=(id+.5)*w;" +
    "float nz=sqrt(max(1.-xc*xc,0.));vec3 Nn=normalize(vec3(xc*.9,0.,nz+.05));" +
    "float sx=cx+xc*w*.5*DP;float bw=w*.12*DP;" +
    "vec3 c=vec3(0.);for(int i=-3;i<=3;i++){c+=sm(sx+float(i)*bw*.33,px.y);}c/=7.;" +
    "float ca=w*.05*DP*xc;c.r=mix(c.r,sm(sx+ca,px.y).r,.6);c.b=mix(c.b,sm(sx-ca,px.y).b,.6);" +
    "float lu=dot(c,vec3(.3,.59,.11));float g=smoothstep(K,K+.1,lu);c=mix(D+c*.12,c,g);" +
    "vec3 L=normalize(vec3(-.55,.25,.8));float d=dot(Nn,L);float lv=n(vec2(id*.37,px.y/R.y*2.5+T*.03));" +
    "float sp=pow(max(dot(reflect(-L,Nn),vec3(0,0,1)),0.),48.);float fr=pow(1.-nz,2.5);" +
    "c*=.78+.32*d;c=mix(c,HL*.8,fr*.18*(.5+lv));c+=sp*HL*(.14+.4*lv);" +
    "c*=1.-smoothstep(.88,1.,abs(xc))*.38;c+=(smoothstep(.93,.97,xc)-smoothstep(.97,1.,xc))*HL*.1*(.5+lv);" +
    // блики: по каждому ребру медленно скользит цветная полоса света, у края ребра — радужная кайма
    "c=fin(c,px);c+=(h(px+fract(T*7.)*317.)-.5)*.045;c=mix(D,c,smoothstep(0.,.08,1.-px.y/R.y));gl_FragColor=vec4(c,1.);}";

  /* ---------- рендер ---------- */
  function Renderer(cv, opt) {
    opt = opt || {};
    var gl = null;
    try { gl = cv.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false }); } catch (e) {}
    if (!gl) throw new Error("no webgl");
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    function pr(fs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "a"); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link");
      var u = {}; ["T", "A", "B", "C0", "C1", "C2", "C3", "S", "R", "RW", "DP", "K", "M", "D", "HL", "TS", "SL"].forEach(function (k) { u[k] = gl.getUniformLocation(p, k); });
      return { p: p, u: u };
    }
    var UP = FS_UNDER.map(pr), PG = pr(FS_GLASS);
    var bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var tx = gl.createTexture(), fb = gl.createFramebuffer();
    var W = 0, H = 0, fw = 0, fh = 0, dpr = 1, buf = null, K = 0.3, Kt = 0.3, lastMeasure = 0;

    function size() {
      var r = opt.w ? { width: opt.w, height: opt.h } : cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      dpr = opt.w ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      var px = r.width * r.height * dpr * dpr, cap = 1.6e6;
      if (px > cap) dpr *= Math.sqrt(cap / px);
      var w = Math.round(r.width * dpr), hh = Math.round(r.height * dpr);
      if (w === W && hh === H) return true;
      W = cv.width = w; H = cv.height = hh; fw = W >> 1; fh = H >> 1;
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      buf = new Uint8Array(fw * fh * 4);
      lastMeasure = 0;
      return true;
    }
    // какая яркость отделяет нужную долю тёмного (70%)
    function measure() {
      gl.readPixels(0, 0, fw, fh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      var a = [];
      for (var i = 0; i < buf.length; i += 4 * 11) a.push((buf[i] * 0.3 + buf[i + 1] * 0.59 + buf[i + 2] * 0.11) / 255);
      a.sort(function (x, y) { return x - y; });
      Kt = a[Math.min(a.length - 1, Math.floor(a.length * DARK_SHARE))] || 0.3;
    }

    this.cv = cv;
    this.combo = null;
    this.reset = function () { lastMeasure = 0; };
    this.kGet = function () { return K; };
    this.kSet = function (v) { K = Kt = v; lastMeasure = 1e15; };
    this.draw = function (T, B, now) {
      if (!this.combo || !size()) return;
      var C = getPal(this.combo.p).c, P = UP[this.combo.u], A = W / H;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, fw, fh); gl.useProgram(P.p);
      gl.uniform1f(P.u.T, T); gl.uniform1f(P.u.A, A); gl.uniform1f(P.u.B, B); gl.uniform1f(P.u.SL, STREAK_SLOW);
      gl.uniform3fv(P.u.C0, C[0]); gl.uniform3fv(P.u.C1, C[1]); gl.uniform3fv(P.u.C2, C[2]); gl.uniform3fv(P.u.C3, C[3]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (now - lastMeasure > 700) { var first = !lastMeasure; measure(); if (first) K = Kt; lastMeasure = now; }
      K += (Kt - K) * 0.03;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(PG.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.uniform1i(PG.u.S, 0); gl.uniform2f(PG.u.R, W, H); gl.uniform1f(PG.u.T, T);
      var sc = opt.scale || 1;
      gl.uniform1f(PG.u.RW, RIB * dpr * sc); gl.uniform1f(PG.u.TS, TILE * dpr * sc); gl.uniform1f(PG.u.DP, DEPTH); gl.uniform1f(PG.u.M, this.combo.g);
      gl.uniform1f(PG.u.K, K); gl.uniform3fv(PG.u.D, C[0]);
      gl.uniform3fv(PG.u.HL, [(1 + C[2][0]) / 2, (1 + C[2][1]) / 2, (1 + C[2][2]) / 2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    this.destroy = function () {
      try { var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch (e) {}
    };
    this.isLost = function () { return gl.isContextLost(); };
  }

  /* ---------- состояние экрана ---------- */
  var S = { root: null, song: null, r: null, combo: null, tAcc: 0, prev: 0, last: 0 };

  function setPage(color) {
    document.documentElement.style.setProperty("--kp-page", color);
    document.documentElement.classList.add("kp-pal");
  }

  function apply(rootEl, song) {
    var cv = rootEl.querySelector("canvas.kfx");
    // Тот же экран (смена стиля в шторке) — WebGL того же холста не гасим:
    // погашенный контекст обратно не оживает, и стекло не возвращалось (20.11).
    stop(!S.r || S.r.cv !== cv);
    S.root = rootEl; S.song = song;
    var cl = rootEl.classList;
    cl.remove("fx-glass", "fx-fallback", "fx-ivory", "fx-black", "pal", "dk");
    var mode = getMode();
    if (mode === "ivory") { cl.add("fx-ivory"); setPage("#f7f2e8"); return; }
    if (mode === "black") { cl.add("fx-black"); setPage("#0b0f17"); return; }
    S.combo = comboFor(song.id);
    paintVars();
    try {
      if (!cv) throw new Error("no canvas");
      if (cv._kfxR && !cv._kfxR.isLost()) S.r = cv._kfxR;
      else {
        S.r = cv._kfxR = new Renderer(cv);
        cv.addEventListener("webglcontextlost", function (e) {
          e.preventDefault();
          if (S.root !== rootEl) return;
          S.r = null; cl.remove("fx-glass"); cl.add("fx-fallback");
        });
      }
      S.r.combo = S.combo;
      S.r.reset();
      cl.add("fx-glass");
    } catch (e) {
      S.r = null; cl.add("fx-fallback");
    }
  }

  // цвета для запасных CSS-огоньков и полосы под часами
  function paintVars() {
    var C = getPal(S.combo.p).c, st = S.root.style;
    st.setProperty("--kfx-d", hex(C[0]));
    st.setProperty("--g1", hex(C[1]));
    st.setProperty("--g2", hex(C[3]));
    st.setProperty("--g3", hex(C[0]));
    setPage(hex(C[0]));
  }

  function stop(destroy) {
    if (S.r && destroy !== false) { S.r.destroy(); if (S.r.cv) S.r.cv._kfxR = null; }
    S.r = null; S.root = null; S.song = null; S.combo = null;
  }

  function setCombo(c) {
    if (!S.song) return;
    S.combo = c; pin(S.song.id, c);
    paintVars();
    if (S.r) { S.r.combo = c; S.r.reset(); }
  }

  /* Кадр. Возвращает true, если фон рисует KarFx (тогда CSS-огоньки не нужны).
     t — время песни, ke — движок караоке (playing, tempo, meta.bpm). */
  function tick(t, ts, ke) {
    if (!S.root) return false;
    if (!S.root.isConnected) { stop(); return false; }
    if (!S.r) return !S.root.classList.contains("fx-fallback");
    if (S.r.isLost()) return false;
    var dt = S.prev ? Math.min((ts - S.prev) / 1000, 0.1) : 0;
    S.prev = ts;
    var playing = !!(ke && ke.playing), bpm = ke && ke.meta && ke.meta.bpm > 0 ? ke.meta.bpm : 0;
    var rate = ke && ke.tempo ? ke.tempo / 100 : 1;
    // фон движется сразу, с той же скоростью, что и под музыку (20.11, просьба Николая)
    S.tAcc += dt * (bpm || 100) / 60 * 0.6 * (playing ? rate : 1);
    if (ts - S.last < 33) return true;
    S.last = ts;
    var B = 0;
    if (playing && bpm) {
      var ph = ((t * bpm / 60) % 1 + 1) % 1;
      B = Math.pow(0.5 + 0.5 * Math.cos(ph * 2 * Math.PI), 2) * FLASH;
    }
    S.r.draw(S.tAcc, B, ts);
    return true;
  }

  /* ---------- шторка «Фон» ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function openSheet(kp) {
    TAB = null; ED = null;
    var old = kp.root.querySelector(".ksheet");
    if (old) old.parentNode.removeChild(old);
    var d = document.createElement("div");
    d.className = "ksheet kfxs";
    kp.root.appendChild(d);
    wireSheetSwipe(d, function () { var ok = d.querySelector('[data-s="ok"]'); if (ok) ok.click(); else if (d.parentNode) d.parentNode.removeChild(d); });
    kp.sheet = d;
    paintSheet(kp);
  }

  /* Живые шарики в пилюлях (20.11): один маленький WebGL-холст рисует по
     очереди каждый вариант и копирует кадр в холстик шарика. ~15 кадров/с,
     только пока шторка открыта; время то же, что у фона, — скорость совпадает. */
  var TH = null, THfail = false, BALL = 72, ballRaf = 0, ballLast = 0, KC = {};
  function thR() {
    if (TH || THfail) return TH;
    try { var cv = document.createElement("canvas"); TH = new Renderer(cv, { w: BALL, h: BALL, scale: 0.5 }); }
    catch (e) { THfail = true; TH = null; }
    return TH;
  }
  function paintBalls(d, ts) {
    var r = thR(); if (!r) return;
    var list = d.querySelectorAll("canvas.kfx-bc");
    var T = S.tAcc || ts / 1000;
    for (var i = 0; i < list.length; i++) {
      var el = list[i], c = el.getAttribute("data-c").split(",").map(Number);
      r.combo = { g: c[0], u: c[1], p: c[2] };
      // порог тёмного меряем один раз на вариант — readPixels каждый кадр тормозил бы телефон
      var key = c.join(","), k = KC[key];
      try {
        if (k == null) { r.reset(); r.draw(T, 0, 1e12); KC[key] = r.kGet(); }
        else { r.kSet(k); r.draw(T, 0, 1); }
      } catch (e) { continue; }
      var cx = el._cx || (el._cx = el.getContext("2d"));
      if (cx) cx.drawImage(r.cv, 0, 0, BALL, BALL);
    }
  }
  function ballLoop(kp) {
    cancelAnimationFrame(ballRaf);
    var step = function (ts) {
      var d = kp.sheet;
      if (!d || !d.isConnected) { ballRaf = 0; return; }
      if (ts - ballLast > 66) { ballLast = ts; paintBalls(d, ts); }
      ballRaf = requestAnimationFrame(step);
    };
    ballRaf = requestAnimationFrame(step);
  }
  var CALM = {
    ivory: "radial-gradient(80% 25% at 30% 32%, rgba(255,253,248,.75), rgba(255,253,248,0)), linear-gradient(180deg,#f7f2e8,#f3ede1 50%,#ebe2d1)",
    black: "radial-gradient(85% 28% at 50% 34%, rgba(40,54,82,.35), rgba(40,54,82,0)), linear-gradient(180deg,#0b0f17,#080b12 55%,#05070b)"
  };
  function card(attr, val, label, on, combo, bg) {
    var pic = combo && !THfail
      ? '<canvas class="kfx-bc" width="' + BALL + '" height="' + BALL + '" data-c="' + combo.g + "," + combo.u + "," + combo.p + '"></canvas>'
      : '<i style="background:' + (bg || hex(getPal((combo && combo.p) || 0).c[1])) + '"></i>';
    // пилюля, как переключатель режима админа: слева шарик с примером узора, рядом название
    return '<span class="kfx-pill' + (on ? " on" : "") + '" ' + attr + '="' + val + '" role="button" aria-pressed="' + on + '">' +
      '<span class="kfx-ball">' + pic + "</span>" + esc(label) + "</span>";
  }
  function withK(c, k, v) { var o = { g: c.g, u: c.u, p: c.p }; o[k] = v; return o; }

  var TAB = null;
  var TABS = [[1, "1 цвет"], [2, "2 цвета"], [3, "3 цвета"], ["c", "Свои"]];
  function colorBlock(c) {
    if (TAB == null) TAB = c.p >= CUST || c.p === EDIT ? "c" : (getPal(c.p).n || 1);
    var h = '<div class="kfx-l">Цвет</div><div class="kfx-tabs">' + TABS.map(function (t) {
      return '<span class="kfx-tab' + (String(TAB) === String(t[0]) ? " on" : "") + '" data-ft="' + t[0] + '" role="button">' + t[1] + "</span>";
    }).join("") + '</div><div class="kfx-row">';
    if (TAB === "c") {
      h += customs().map(function (cu, i) { return card("data-fp", CUST + i, "Моя " + (i + 1), c.p === CUST + i, withK(c, "p", CUST + i)); }).join("");
      if (customs().length < 6) h += '<span class="kfx-pill kfx-new" data-fnew role="button"><span class="kfx-ball kfx-plus">+</span>Создать палитру</span>';
    } else {
      PAL.forEach(function (p, i) { if (p.n === TAB) h += card("data-fp", i, p.name, c.p === i, withK(c, "p", i)); });
    }
    h += "</div>";
    if (TAB === "c" && ED) {
      h += '<div class="kfx-ed"><div class="kfx-ed-t">' + (ED.i >= 0 ? "Моя " + (ED.i + 1) : "Новая палитра") + '</div>' +
        '<div class="kfx-mute">Нажми на кружок и выбери цвет — фон меняется сразу. Можно 1, 2 или 3 цвета.</div><div class="kfx-sls">' +
        ED.hx.map(function (x, k) {
          return '<div class="kfx-slw"><label class="kfx-sl" style="background:' + x + '"><input type="color" value="' + x + '" data-fi="' + k + '" aria-label="Цвет ' + (k + 1) + '"></label>' +
            (ED.hx.length > 1 ? '<span class="kfx-x" data-fx="' + k + '" role="button">убрать</span>' : '<span class="kfx-x off">цвет ' + (k + 1) + "</span>") + "</div>";
        }).join("") +
        (ED.hx.length < 3 ? '<div class="kfx-slw"><span class="kfx-sl add" data-fadd role="button">+</span><span class="kfx-x off">добавить</span></div>' : "") +
        '</div><div class="kfx-edrow">' +
        (ED.i >= 0 ? '<div class="bt" data-fdel>Удалить</div>' : '<div class="bt" data-fcancel>Отмена</div>') +
        '<div class="bt main" data-fsave>Сохранить</div></div></div>';
    }
    return h;
  }
  function wireColor(kp, d) {
    function each(sel, fn) { Array.prototype.forEach.call(d.querySelectorAll(sel), fn); }
    each("[data-ft]", function (b) {
      b.onclick = function () { var t = b.getAttribute("data-ft"); TAB = t === "c" ? "c" : +t; if (TAB !== "c") stopEdit(); paintSheet(kp); };
    });
    each("[data-fp]", function (b) {
      b.onclick = function () {
        var p = +b.getAttribute("data-fp");
        if (p >= CUST && S.combo && S.combo.p === p && !ED) { ED = { i: p - CUST, hx: customs()[p - CUST].hx.slice(), back: S.combo.p }; previewEdit(); paintSheet(kp); return; }
        stopEdit(); setCombo(withK(S.combo, "p", p)); paintSheet(kp);
      };
    });
    var nb = d.querySelector("[data-fnew]");
    if (nb) nb.onclick = function () {
      var base = getPal(S.combo ? S.combo.p : 0);
      ED = { i: -1, hx: (base.hx || [hex(base.c[1])]).slice(0, 3), back: S.combo ? S.combo.p : 0 };
      previewEdit(); paintSheet(kp);
    };
    each("[data-fi]", function (inp) {
      inp.addEventListener("input", function () {
        var k = +inp.getAttribute("data-fi"); ED.hx[k] = inp.value;
        inp.parentNode.style.background = inp.value; previewEdit();
      });
    });
    each("[data-fx]", function (b) { b.onclick = function () { ED.hx.splice(+b.getAttribute("data-fx"), 1); previewEdit(); paintSheet(kp); }; });
    var ad = d.querySelector("[data-fadd]");
    if (ad) ad.onclick = function () {
      var last = rgb2hsl(h2rgb(ED.hx[ED.hx.length - 1]));
      ED.hx.push(hex(hsl2rgb(last[0] + .18, Math.max(last[1], .6), .5))); previewEdit(); paintSheet(kp);
    };
    var cn = d.querySelector("[data-fcancel]");
    if (cn) cn.onclick = function () { var b = ED.back; stopEdit(); setCombo(withK(S.combo, "p", b)); paintSheet(kp); };
    var dl = d.querySelector("[data-fdel]");
    if (dl) dl.onclick = function () {
      var a = customs(), i = ED.i; a.splice(i, 1); saveCustoms(a); ED = null; KC = {};
      setCombo(withK(S.combo, "p", 0)); TAB = 1; paintSheet(kp);
    };
    var sv = d.querySelector("[data-fsave]");
    if (sv) sv.onclick = function () {
      var a = customs(), i = ED.i;
      if (i >= 0) a[i] = { hx: ED.hx.slice() }; else { a.push({ hx: ED.hx.slice() }); i = a.length - 1; }
      saveCustoms(a); ED = null; KC = {};
      setCombo(withK(S.combo, "p", CUST + i)); paintSheet(kp);
    };
  }
  // пока палитру собирают — фон показывает её сразу, но за песней не закрепляется
  function previewEdit() {
    if (!S.combo || !ED) return;
    var c = withK(S.combo, "p", EDIT); S.combo = c; paintVars();
    if (S.r) { S.r.combo = c; S.r.reset(); }
  }
  function stopEdit() { if (ED && S.combo && S.combo.p === EDIT) S.combo = withK(S.combo, "p", ED.back); ED = null; }

  function paintSheet(kp) {
    var d = kp.sheet;
    if (!d || !d.parentNode) return;
    var mode = getMode(), c = S.combo || { g: 0, u: 0, p: 0};
    var cur = S.combo || (S.song ? comboFor(S.song.id) : c);
    var html = '<div class="t">Фон</div>' +
      '<div class="s">' + (mode === "auto" ? "У каждой песни свой вариант. Выбери здесь — и он закрепится за этой песней." : "Спокойный фон без эффектов — для всех песен.") + "</div>" +
      '<div class="kfx-l">Стиль</div><div class="kfx-row">' +
      MODES.map(function (m) {
        return card("data-fm", m[0], m[1], mode === m[0], m[0] === "auto" ? cur : null, CALM[m[0]]);
      }).join("") + "</div>";
    if (mode === "auto") {
      html += '<div class="kfx-l">Стекло</div><div class="kfx-row">' +
        GLASS.map(function (n, i) { return card("data-fg", i, n, c.g === i, withK(c, "g", i)); }).join("") + "</div>" +
        '<div class="kfx-l">Свет под стеклом</div><div class="kfx-row">' +
        UNDER_ORDER.map(function (i) { return card("data-fu", i, UNDER[i], c.u === i, withK(c, "u", i)); }).join("") + "</div>" +
        colorBlock(c);
    }
    html += '<div class="row" style="display:flex;gap:10px;margin-top:16px">' +
      (mode === "auto" ? '<div class="bt" data-s="rnd">Случайный</div>' : "") +
      '<div class="bt main" data-s="ok">Готово</div></div>';
    var keep = {};
    Array.prototype.forEach.call(d.querySelectorAll(".kfx-row"), function (r, i) { keep[i] = r.scrollLeft; });
    var top = d.scrollTop;
    d.innerHTML = html;
    Array.prototype.forEach.call(d.querySelectorAll(".kfx-row"), function (r, i) { if (keep[i]) r.scrollLeft = keep[i]; });
    d.scrollTop = top;
    paintBalls(d, performance.now());
    ballLoop(kp);
    function each(sel, fn) { Array.prototype.forEach.call(d.querySelectorAll(sel), fn); }
    each("[data-fm]", function (b) {
      b.onclick = function () {
        var m = b.getAttribute("data-fm");
        if (m === getMode()) return;
        setMode(m);
        var song = S.song || kp.song;
        if (song) apply(kp.root, song);
        paintSheet(kp);
      };
    });
    function upd(key, attr) {
      each("[" + attr + "]", function (b) {
        b.onclick = function () {
          var nc = withK(S.combo, key, +b.getAttribute(attr));
          if (ED) { var pc = withK(nc, "p", ED.back); pin(S.song.id, pc); S.combo = nc; paintVars(); if (S.r) { S.r.combo = nc; S.r.reset(); } }
          else setCombo(nc);
          paintSheet(kp);
        };
      });
    }
    if (mode === "auto" && S.combo) { upd("g", "data-fg"); upd("u", "data-fu"); wireColor(kp, d); }
    var rb = d.querySelector('[data-s="rnd"]');
    if (rb) rb.onclick = function () { if (S.combo) { stopEdit(); var r = randomCombo(null, S.combo); TAB = getPal(r.p).n; setCombo(r); paintSheet(kp); } };
    d.querySelector('[data-s="ok"]').onclick = function () {
      if (ED) { var b = ED.back; stopEdit(); setCombo(withK(S.combo, "p", b)); }
      d.parentNode.removeChild(d); kp.sheet = null; TAB = null;
    };
  }

  // шарик с текущим фоном — для капсулы «Фон» в «Настройках» (20.11)
  function currentBall() {
    var mode = getMode();
    if (mode !== "auto" || !S.combo) return '<i style="background:' + (CALM[mode] || "#111") + '"></i>';
    var c = S.combo;
    return THfail ? '<i style="background:' + hex(getPal(c.p).c[1]) + '"></i>'
      : '<canvas class="kfx-bc" width="' + BALL + '" height="' + BALL + '" data-c="' + c.g + "," + c.u + "," + c.p + '"></canvas>';
  }
  function liveBalls(kp) { if (kp.sheet) { paintBalls(kp.sheet, performance.now()); ballLoop(kp); } }
  /* Неподвижные шарики (25.11): темы пометок — пилюли на фонах, но без
     движения. Один кадр в момент t, без цикла; без WebGL — цвет палитры. */
  function staticBall(c) {
    return THfail ? '<i style="background:' + hex(getPal(c.p).c[1]) + '"></i>'
      : '<canvas class="kfx-bc kfx-still" width="' + BALL + '" height="' + BALL + '" data-c="' + c.g + "," + c.u + "," + c.p + '"></canvas>';
  }
  function paintStill(d) {
    var r = thR(); if (!r) return;
    var list = d.querySelectorAll("canvas.kfx-still");
    for (var i = 0; i < list.length; i++) {
      var el = list[i], c = el.getAttribute("data-c").split(",").map(Number);
      r.combo = { g: c[0], u: c[1], p: c[2] };
      try { r.reset(); r.draw(14, 0, 1e12); } catch (e) { continue; }
      var cx = el.getContext("2d");
      if (cx) cx.drawImage(r.cv, 0, 0, BALL, BALL);
    }
  }

  return {
    apply: apply, tick: tick, openSheet: openSheet, stop: stop, currentBall: currentBall, liveBalls: liveBalls, staticBall: staticBall, paintStill: paintStill,
    // для тестов
    _comboFor: comboFor, _randomCombo: randomCombo, _validCombo: validCombo, PAL: PAL, UNDER: UNDER
  };
});
