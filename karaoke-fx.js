/* ==========================================================================
   KarFx — фон караоке (20.11, утверждён Николаем).

   Стиль фона выбирает ученик в шторке «Фон», выбор хранится на телефоне:
     • «Стекло» (по умолчанию) — WebGL: рифлёное (ширина ребра 20, глубина 2.8)
       или матовое стекло, под ним свет: лучи софитов / круглые софиты /
       лава-лампа / цветной дым; палитры Бордо / Терракота / Индиго.
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
    { name: "Индиго",    c: [[.025, .025, .09], [.20, .20, .55], [.52, .46, 1.0], [.58, .26, .78]] }
  ];
  var UNDER = ["Лучи софитов", "Лава-лампа", "Цветной дым", "Круглые софиты"];
  var UNDER_ORDER = [0, 3, 1, 2];
  var GLASS = ["Рифлёное", "Матовое"];
  var MODES = [["auto", "Стекло"], ["ivory", "Слоновая кость"], ["black", "Глубокий чёрный"]];
  var FLASH = 0.09, DARK_SHARE = 0.70, RIB = 20, DEPTH = 2.8;
  var K_MODE = "kar.fx.mode", K_FIRST = "kar.fx.first", K_SONG = "kar.fx.song.";

  /* ---------- хранение ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function getMode() { var m = lsGet(K_MODE); return m === "ivory" || m === "black" ? m : "auto"; }
  function setMode(m) { lsSet(K_MODE, m === "ivory" || m === "black" ? m : null); }

  function validCombo(o) {
    return o && o.g >= 0 && o.g <= 1 && o.u >= 0 && o.u <= 3 && o.p >= 0 && o.p <= 2 &&
      o.g === Math.floor(o.g) && o.u === Math.floor(o.u) && o.p === Math.floor(o.p);
  }
  function randomCombo(rnd, not) {
    rnd = rnd || Math.random;
    for (var i = 0; i < 8; i++) {
      var c = { g: Math.floor(rnd() * 2), u: Math.floor(rnd() * 4), p: Math.floor(rnd() * 3) };
      if (!not || c.g !== not.g || c.u !== not.u || c.p !== not.p) return c;
    }
    return { g: 0, u: 0, p: 0 };
  }
  // Вариант песни: закреплённый → он; самая первая песня → рифлёное + лучи + Бордо; иначе случайный.
  function comboFor(songId, store, rnd) {
    store = store || { get: lsGet, set: lsSet };
    var key = K_SONG + songId, c = null;
    try { c = JSON.parse(store.get(key) || "null"); } catch (e) { c = null; }
    if (validCombo(c)) return c;
    if (!store.get(K_FIRST)) { c = { g: 0, u: 0, p: 0 }; store.set(K_FIRST, "1"); }
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
    "gl_FragColor=vec4(c,1.);}"
  ];
  var FS_GLASS = "precision highp float;uniform sampler2D S;uniform vec2 R;uniform float T,RW,DP,K,M;uniform vec3 D,HL;" + NOISE +
    "vec3 sm(float x,float y){return texture2D(S,vec2(x,y)/R).rgb;}" +
    "vec3 fin(vec3 c,vec2 px){c=clamp(c,0.,1.);vec3 li=pow(c,vec3(2.2));float Lm=dot(li,vec3(.2126,.7152,.0722));if(Lm>.16)c*=pow(.16/Lm,1./2.2);vec2 q=px/R-.5;c*=1.-dot(q,q)*.3;return c;}" +
    "void main(){vec2 px=gl_FragCoord.xy;" +
    "if(M>.5){float rr=R.x*.045;vec3 c=vec3(0.);for(int i=0;i<20;i++){float fi=float(i);float a=fi*2.39996;float r=sqrt((fi+.5)/20.)*rr;c+=sm(px.x+cos(a)*r,px.y+sin(a)*r);}c/=20.;" +
    "float lu=dot(c,vec3(.3,.59,.11));float g=smoothstep(K,K+.1,lu);c=mix(D+c*.12,c,g);" +
    "vec2 uv=px/R;c+=HL*.05*smoothstep(.9,.2,length(uv-vec2(.15,.95)));" +
    "float tex=n(px*.35)*.5+n(px*.9)*.5;c*=.96+.06*tex;" +
    "c=fin(c,px);float gr=h(px+fract(T*9.)*511.)-.5;float l2=dot(c,vec3(.3,.59,.11));c+=gr*.09*(1.-abs(l2-.4));" +
    "c=mix(D,c,smoothstep(0.,.08,1.-px.y/R.y));gl_FragColor=vec4(c,1.);return;}" +
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
    "c=fin(c,px);c+=(h(px+fract(T*7.)*317.)-.5)*.045;c=mix(D,c,smoothstep(0.,.08,1.-px.y/R.y));gl_FragColor=vec4(c,1.);}";

  /* ---------- рендер ---------- */
  function Renderer(cv) {
    var gl = null;
    try { gl = cv.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false }); } catch (e) {}
    if (!gl) throw new Error("no webgl");
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    function pr(fs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "a"); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link");
      var u = {}; ["T", "A", "B", "C0", "C1", "C2", "C3", "S", "R", "RW", "DP", "K", "M", "D", "HL"].forEach(function (k) { u[k] = gl.getUniformLocation(p, k); });
      return { p: p, u: u };
    }
    var UP = FS_UNDER.map(pr), PG = pr(FS_GLASS);
    var bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var tx = gl.createTexture(), fb = gl.createFramebuffer();
    var W = 0, H = 0, fw = 0, fh = 0, dpr = 1, buf = null, K = 0.3, Kt = 0.3, lastMeasure = 0;

    function size() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    this.draw = function (T, B, now) {
      if (!this.combo || !size()) return;
      var C = PAL[this.combo.p].c, P = UP[this.combo.u], A = W / H;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, fw, fh); gl.useProgram(P.p);
      gl.uniform1f(P.u.T, T); gl.uniform1f(P.u.A, A); gl.uniform1f(P.u.B, B);
      gl.uniform3fv(P.u.C0, C[0]); gl.uniform3fv(P.u.C1, C[1]); gl.uniform3fv(P.u.C2, C[2]); gl.uniform3fv(P.u.C3, C[3]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (now - lastMeasure > 700) { var first = !lastMeasure; measure(); if (first) K = Kt; lastMeasure = now; }
      K += (Kt - K) * 0.03;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(PG.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.uniform1i(PG.u.S, 0); gl.uniform2f(PG.u.R, W, H); gl.uniform1f(PG.u.T, T);
      gl.uniform1f(PG.u.RW, RIB * dpr); gl.uniform1f(PG.u.DP, DEPTH); gl.uniform1f(PG.u.M, this.combo.g);
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
    var C = PAL[S.combo.p].c, st = S.root.style;
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
    S.tAcc += dt * (playing ? (bpm || 100) / 60 * 0.6 * rate : 0.25);
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
    var old = kp.root.querySelector(".ksheet");
    if (old) old.parentNode.removeChild(old);
    var d = document.createElement("div");
    d.className = "ksheet kfxs";
    kp.root.appendChild(d);
    kp.sheet = d;
    paintSheet(kp);
  }

  function chip(attr, val, label, on, extra) {
    return '<span class="gch' + (on ? " on" : "") + '" ' + attr + '="' + val + '" role="button" aria-pressed="' + on + '">' + (extra || "") + esc(label) + "</span>";
  }

  function paintSheet(kp) {
    var d = kp.sheet;
    if (!d || !d.parentNode) return;
    var mode = getMode(), c = S.combo || { g: 0, u: 0, p: 0 };
    var html = '<div class="t">Фон</div>' +
      '<div class="s">' + (mode === "auto" ? "У каждой песни свой вариант. Выбери здесь — и он закрепится за этой песней." : "Спокойный фон без эффектов — для всех песен.") + "</div>" +
      '<div class="kfx-l">Стиль</div><div class="kfx-row">' +
      MODES.map(function (m) { return chip("data-fm", m[0], m[1], mode === m[0]); }).join("") + "</div>";
    if (mode === "auto") {
      html += '<div class="kfx-l">Стекло</div><div class="kfx-row">' +
        GLASS.map(function (n, i) { return chip("data-fg", i, n, c.g === i); }).join("") + "</div>" +
        '<div class="kfx-l">Свет под стеклом</div><div class="kfx-row">' +
        UNDER_ORDER.map(function (i) { return chip("data-fu", i, UNDER[i], c.u === i); }).join("") + "</div>" +
        '<div class="kfx-l">Цвет</div><div class="kfx-row">' +
        PAL.map(function (p, i) { return chip("data-fp", i, p.name, c.p === i, '<i class="kfx-sw" style="background:' + hex(p.c[1]) + '"></i>'); }).join("") + "</div>";
    }
    html += '<div class="row" style="display:flex;gap:10px;margin-top:16px">' +
      (mode === "auto" ? '<div class="bt" data-s="rnd">Случайный</div>' : "") +
      '<div class="bt main" data-s="ok">Готово</div></div>';
    d.innerHTML = html;
    function each(sel, fn) { Array.prototype.forEach.call(d.querySelectorAll(sel), fn); }
    each("[data-fm]", function (b) {
      b.onclick = function () {
        var m = b.getAttribute("data-fm");
        if (m === getMode()) return;
        setMode(m);
        var song = S.song;
        if (song) apply(kp.root, song);
        paintSheet(kp);
      };
    });
    function upd(key, attr) {
      each("[" + attr + "]", function (b) {
        b.onclick = function () {
          var nc = { g: S.combo.g, u: S.combo.u, p: S.combo.p };
          nc[key] = +b.getAttribute(attr);
          setCombo(nc); paintSheet(kp);
        };
      });
    }
    if (mode === "auto" && S.combo) { upd("g", "data-fg"); upd("u", "data-fu"); upd("p", "data-fp"); }
    var rb = d.querySelector('[data-s="rnd"]');
    if (rb) rb.onclick = function () { if (S.combo) { setCombo(randomCombo(null, S.combo)); paintSheet(kp); } };
    d.querySelector('[data-s="ok"]').onclick = function () { d.parentNode.removeChild(d); kp.sheet = null; };
  }

  return {
    apply: apply, tick: tick, openSheet: openSheet, stop: stop,
    // для тестов
    _comboFor: comboFor, _randomCombo: randomCombo, _validCombo: validCombo, PAL: PAL, UNDER: UNDER
  };
});
