/* Распевки с проверкой (питч).
   Пианино играет распевку из документа распевок Николая (13 тем, высокий и низкий
   голос), микрофон слушает ученика и показывает, попадает ли он в ноты.
   Вид: переключатель «Полоски / Ноты» (выбор запоминается). В конце — оценка:
   звёзды (не ниже трёх), процент нот в цель, сравнение с прошлым разом, цвет
   каждой тональности (зелёный / жёлтый / синий, без красного), «Здорово / Попробуй».

   Ноты и звук — vendor/raspevki-engine.js и vendor/raspevki-data.js (тот же движок,
   что в документе распевок). Подгружаются только при входе в этот раздел.
   Экраны: "pitch" (темы), "pitch-topic" (ступени темы), "pitch-sing", "pitch-score". */

var PT = {
  voice: null, view: null, topic: null, ex: null, run: null, res: null,
  ctx: null, piano: null, pianoReady: false, mic: null, libLoading: false
};

function ptGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function ptSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
PT.voice = ptGet("pt-voice", "high") === "low" ? "low" : "high";
PT.view = ptGet("pt-view", "bars") === "notes" ? "notes" : "bars";

function ptLast() { try { return JSON.parse(ptGet("pt-last", "{}")) || {}; } catch (e) { return {}; } }
function ptExKey(ex, voice) { return (voice || PT.voice) + ":" + ex.topic + ":" + ex.lvl; }

function ptLib(cb) {
  if (window.Raspevki && window.RASPEVKI) { cb(); return; }
  if (PT.libLoading) return;
  PT.libLoading = true;
  var files = ["vendor/raspevki-engine.js", "vendor/raspevki-data.js"], i = 0;
  (function next() {
    if (i >= files.length) { PT.libLoading = false; cb(); return; }
    var s = document.createElement("script");
    s.src = files[i++];
    s.onload = next;
    s.onerror = function () { PT.libLoading = false; PT.libErr = true; if (/^pitch/.test(state.screen)) render(); };
    document.head.appendChild(s);
  })();
}

function ptTopics() { return window.RASPEVKI_TOPICS || []; }
function ptTopicOf(id) { return ptTopics().filter(function (t) { return t.id === id; })[0]; }
function ptExOf(topicId) {
  return (window.RASPEVKI || []).filter(function (e) { return e.topic === topicId; })
    .sort(function (a, b) { return a.lvl - b.lvl; });
}
function ptShift() { return PT.voice === "low" ? (window.RASPEVKI_LOW_SHIFT || -6) : 0; }
function ptSyl(ex) { return String(ex.syl || "").split(" · ")[0]; }

/* ---------- названия нот ---------- */
var PT_SHARP_KEYS = [7, 2, 9, 4, 11, 6, 0];
var PT_LET_S = [[0, ""], [0, "♯"], [1, ""], [1, "♯"], [2, ""], [3, ""], [3, "♯"], [4, ""], [4, "♯"], [5, ""], [5, "♯"], [6, ""]];
var PT_LET_F = [[0, ""], [1, "♭"], [1, ""], [2, "♭"], [2, ""], [3, ""], [4, "♭"], [4, ""], [5, "♭"], [5, ""], [6, "♭"], [6, ""]];
var PT_RU = ["до", "ре", "ми", "фа", "соль", "ля", "си"];
function ptPc(m) { return ((m % 12) + 12) % 12; }
function ptSpell(midi, tonic, mode) {
  var majT = mode === "min" ? ptPc(tonic + 3) : ptPc(tonic);
  var tab = PT_SHARP_KEYS.indexOf(majT) !== -1 ? PT_LET_S : PT_LET_F;
  var p = tab[ptPc(midi)];
  return { idx: p[0] + 7 * (Math.floor(midi / 12) - 1), acc: p[1], name: PT_RU[p[0]] + p[1] };
}

/* ==========================================================================
   СПИСКИ
   ========================================================================== */

function ptBack(label) {
  return '<button class="cab-back" data-act="back"><span class="cab-back-ico">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    "</span><span>" + esc(label) + "</span></button>";
}

function ptVoiceSeg() {
  return '<div class="seg" data-pt-seg="voice"><div data-v="high" class="' + (PT.voice === "high" ? "on" : "") + '">Высокий голос</div>' +
    '<div data-v="low" class="' + (PT.voice === "low" ? "on" : "") + '">Низкий голос</div></div>';
}
function ptWireVoiceSeg() {
  Array.prototype.forEach.call(app.querySelectorAll('[data-pt-seg="voice"] [data-v]'), function (el) {
    el.onclick = function () { PT.voice = el.getAttribute("data-v"); ptSet("pt-voice", PT.voice); render(); };
  });
}

function renderPitchList() {
  var last = ptLast();
  var rows = ptTopics().map(function (tp, k) {
    var list = ptExOf(tp.id);
    var done = list.filter(function (e) { return last[ptExKey(e)] != null; }).length;
    return '<div class="pt-row" data-pt-topic="' + esc(tp.id) + '"><div class="ic" style="background:' + esc(tp.color) + '">' + (k + 1) + "</div>" +
      '<div style="flex:1;min-width:0;"><b>' + esc(tp.name) + '</b><div class="sub">' + esc(tp.goal) + "</div></div>" +
      (done ? '<div class="pct">' + done + " из " + list.length + "</div>" : "") +
      '<div class="cab-chev">›</div></div>';
  }).join("");
  app.innerHTML = '<div class="pt" style="padding:var(--screen-top) 20px 130px;">' + cabBack() +
    '<div class="cab-screen-title">Распевки с проверкой</div>' +
    '<p class="pt-intro">Пианино играет распевку, ты поёшь вместе с ним. Телефон слушает голос через микрофон и показывает, попадаешь ли ты в ноты.</p>' +
    ptVoiceSeg() + '<div class="pt-list">' + rows + "</div></div>";
  wireActs();
  ptWireVoiceSeg();
  Array.prototype.forEach.call(app.querySelectorAll("[data-pt-topic]"), function (el) {
    el.onclick = function () { PT.topic = el.getAttribute("data-pt-topic"); go("pitch-topic"); };
  });
}

function renderPitchTopic() {
  var tp = ptTopicOf(PT.topic);
  if (!tp) { go("pitch"); return; }
  var last = ptLast();
  var rows = ptExOf(tp.id).map(function (ex) {
    var p = last[ptExKey(ex)];
    return '<div class="pt-row" data-pt-ex="' + ex.lvl + '"><div class="ic" style="background:' + esc(tp.color) + '">' + ex.lvl + "</div>" +
      '<div style="flex:1;min-width:0;"><b>' + esc(ex.title) + '</b><div class="sub">Ступень ' + ex.lvl + " · " + esc(ex.what) + "</div></div>" +
      (p != null ? '<div class="pct">' + p + "%</div>" : "") +
      '<div class="cab-chev">›</div></div>';
  }).join("");
  app.innerHTML = '<div class="pt" style="padding:var(--screen-top) 20px 130px;">' + ptBack("Распевки") +
    '<div class="cab-screen-title">' + esc(tp.name) + "</div>" +
    '<p class="pt-goal">' + esc(tp.goal) + "</p>" +
    ptVoiceSeg() + '<div class="pt-list">' + rows + "</div></div>";
  wireActs();
  ptWireVoiceSeg();
  Array.prototype.forEach.call(app.querySelectorAll("[data-pt-ex]"), function (el) {
    el.onclick = function () {
      var lvl = parseInt(el.getAttribute("data-pt-ex"), 10);
      PT.ex = ptExOf(tp.id).filter(function (e) { return e.lvl === lvl; })[0];
      go("pitch-sing");
    };
  });
}

/* ==========================================================================
   ЭКРАН РАСПЕВКИ
   ========================================================================== */

var PT_ICO = {
  play: '<svg viewBox="0 0 14 14"><path d="M3.5 1.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 14 14"><rect x="2.5" y="1.5" width="3.3" height="11" rx=".6" fill="currentColor"/><rect x="8.2" y="1.5" width="3.3" height="11" rx=".6" fill="currentColor"/></svg>'
};
var PT_U = 30, PT_SY = 11, PT_H = 300; // пикселей на долю, на полутон; высота дорожки

function ptMmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

function ptBuild(ex) {
  var R = window.Raspevki, shift = ptShift();
  var tl = R.buildTimeline(ex, 2, { shift: shift });
  var L = R.linkBeats(ex), bar = ex.beats || 4;
  var notes = [];
  tl.marks.forEach(function (mk, k) {
    tl.events.forEach(function (e) {
      if (e.part === "m" && e.t >= mk.t - 1e-6 && e.t < mk.t + L - 1e-6) notes.push({ t: e.t, d: e.d, m: e.m, key: k, st: "up", v: 0, inN: 0, nearN: 0, fr: 0 });
    });
  });
  notes.sort(function (a, b) { return a.t - b.t; });
  notes.forEach(function (n, i) {
    n.i = i;
    var tonic = tl.marks[n.key].key;
    n.sp = ptSpell(n.m, tonic, ex.mode);
  });
  var mids = notes.map(function (n) { return n.m; });
  return { ex: ex, tl: tl, L: L, bar: bar, spb: 60 / ex.bpm, notes: notes, lo: Math.min.apply(null, mids), hi: Math.max.apply(null, mids) };
}

function ptMarkAt(run, beat) {
  var mk = null, k = -1;
  run.tl.marks.forEach(function (m, i) { if (m.t <= beat + 1e-6) { mk = m; k = i; } });
  return { mk: mk, k: k };
}

function renderPitchSing() {
  var ex = PT.ex;
  if (!ex) { go("pitch"); return; }
  var tp = ptTopicOf(ex.topic) || {};
  var run = PT.run = ptBuild(ex);
  run.view = PT.view;
  app.innerHTML = '<div class="pt pt-sing">' +
    '<div class="top pb8">' + backBtn("back") + '<div><div class="top-title lg">Распевка с проверкой</div>' +
      '<div class="top-sub">«' + esc(ptSyl(ex)) + "» · " + esc(tp.name || "") + " · ступень " + ex.lvl + "</div></div></div>" +
    '<div class="seg" data-pt-seg="view"><div data-v="bars" class="' + (PT.view === "bars" ? "on" : "") + '">Полоски</div>' +
      '<div data-v="notes" class="' + (PT.view === "notes" ? "on" : "") + '">Ноты</div></div>' +
    '<div class="pt-lane"></div>' +
    '<div class="pt-hint"></div>' +
    '<div class="pt-mini"><button class="pl" data-pt="play">' + PT_ICO.play + "</button>" +
      '<div style="flex:1;min-width:0;"><div class="bar"><i></i></div><div class="times"><span class="k"></span><span class="tm"></span></div></div></div>' +
  "</div>";
  wireActs();
  Array.prototype.forEach.call(app.querySelectorAll('[data-pt-seg="view"] [data-v]'), function (el) {
    el.onclick = function () {
      PT.view = el.getAttribute("data-v"); ptSet("pt-view", PT.view);
      Array.prototype.forEach.call(el.parentNode.children, function (c) { c.classList.toggle("on", c === el); });
      ptDrawInit(run);
      ptFrame(true);
    };
  });
  app.querySelector('[data-pt="play"]').onclick = ptPlayTap;
  run.lane = app.querySelector(".pt-lane");
  run.hintEl = app.querySelector(".pt-hint");
  run.barEl = app.querySelector(".pt-mini .bar i");
  run.kEl = app.querySelector(".pt-mini .k");
  run.tmEl = app.querySelector(".pt-mini .tm");
  run.btn = app.querySelector('[data-pt="play"]');
  run.heard = 0; run.playing = false; run.frames = []; run.pts = []; run.voicedTotal = 0;
  run.hintAt = 0;
  ptDrawInit(run);
  ptFrame(true);
  var first = run.notes[0];
  ptHint("Нажми на кнопку внизу и пой вместе с пианино", first ? "первая нота «" + first.sp.name + "»" : "", true);
  if (PT.autostart) { PT.autostart = false; ptPlayTap(); }
}

function ptHint(big, small, force) {
  var run = PT.run;
  if (!run || !run.hintEl) return;
  var now = Date.now();
  if (!force && now - run.hintAt < 300) return;
  var html = esc(big) + (small ? "<small>" + esc(small) + "</small>" : "");
  if (run.hintEl._h !== html) { run.hintEl.innerHTML = html; run.hintEl._h = html; }
  run.hintAt = now;
}

/* ---------- отрисовка: «Полоски» ---------- */

function ptDrawInit(run) {
  run.view = PT.view;
  var W = run.lane.clientWidth || 358;
  run.W = W; run.playX = Math.round(W * 0.42);
  var ns = "http://www.w3.org/2000/svg";
  var svg = '<svg viewBox="0 0 ' + W + " " + PT_H + '">';
  if (run.view === "bars") {
    svg += '<g data-g="gy">';
    for (var m = run.lo - 14; m <= run.hi + 14; m += 2) {
      svg += '<line x1="0" x2="' + W + '" y1="' + (-m * PT_SY) + '" y2="' + (-m * PT_SY) + '" stroke="var(--line)" stroke-width="1" opacity=".7"/>';
    }
    svg += '</g><g data-g="gw">';
    run.notes.forEach(function (n) {
      var x = n.t * PT_U, y = -n.m * PT_SY, w = Math.max(10, n.d * PT_U - 4);
      svg += '<rect data-n="' + n.i + '" x="' + (x + 2) + '" y="' + (y - 9) + '" width="' + w + '" height="18" rx="9" fill="var(--soft-blue)"/>' +
        '<text x="' + (x + 2 + w / 2) + '" y="' + (y - 14) + '" text-anchor="middle" font-family="Inter" font-weight="700" font-size="10.5" fill="var(--gray)">' + n.sp.name + "</text>";
    });
    svg += '<path data-g="line" d="" fill="none" stroke="var(--terra)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>';
    svg += '<line x1="' + run.playX + '" x2="' + run.playX + '" y1="0" y2="' + PT_H + '" stroke="var(--terra)" stroke-width="1.5" stroke-dasharray="4 5" opacity=".6"/>';
  } else {
    svg += '<g data-g="staff"></g><path data-g="line" d="" fill="none" stroke="var(--terra)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>';
  }
  svg += '<g data-g="dot" style="display:none"><circle r="14" fill="var(--terra)" opacity=".2"/><circle r="' + (run.view === "bars" ? 8 : 7) + '" fill="var(--terra)"/></g></svg>';
  run.lane.innerHTML = svg;
  run.gy = run.lane.querySelector('[data-g="gy"]');
  run.gw = run.lane.querySelector('[data-g="gw"]');
  run.lineEl = run.lane.querySelector('[data-g="line"]');
  run.dotEl = run.lane.querySelector('[data-g="dot"]');
  run.staffEl = run.lane.querySelector('[data-g="staff"]');
  run.rects = {};
  if (run.gw) Array.prototype.forEach.call(run.gw.querySelectorAll("rect[data-n]"), function (r) { run.rects[r.getAttribute("data-n")] = r; });
  run.staffKey = -1;
  var mk0 = run.tl.marks[0];
  run.ty = PT_H / 2 + ((mk0 ? mk0.key : run.lo) + (run.hi - run.lo) / 4) * PT_SY;
  run.notes.forEach(function (n) { n.drawn = null; });
  void ns;
}

var PT_FILL = { up: "var(--soft-blue)", cur: "var(--blue)", hit: "var(--soft-green)", near: "var(--soft-green)", miss: "var(--soft-blue)" };
var PT_OP = { up: "1", cur: "1", hit: "1", near: ".55", miss: ".5" };
var PT_HEAD = { up: "var(--ink)", cur: "var(--blue)", hit: "var(--green)", near: "var(--green)", miss: "var(--gray)" };

function ptPaintNote(run, n) {
  var st = n.st;
  if (n.drawn === st) return;
  n.drawn = st;
  if (run.view === "bars") {
    var r = run.rects[n.i];
    if (r) { r.setAttribute("fill", PT_FILL[st]); r.setAttribute("opacity", PT_OP[st]); }
  } else if (n.headEl) {
    n.headEl.setAttribute("fill", PT_HEAD[st]);
    if (n.stemEl) n.stemEl.setAttribute("stroke", PT_HEAD[st]);
    if (n.accEl) n.accEl.setAttribute("fill", PT_HEAD[st]);
    var o = st === "near" ? ".55" : "1";
    n.headEl.setAttribute("opacity", o);
  }
}

/* ---------- отрисовка: «Ноты» (одно звено распевки на нотном стане) ---------- */

var PT_STAFF_TOP = 100, PT_G = 14;
function ptStaffY(idx) { return PT_STAFF_TOP + 4 * PT_G - (idx - 30) * (PT_G / 2); } // ми первой октавы на нижней линейке
function ptDisp(m) { return m + (PT.voice === "low" ? 12 : 0); } // низкий голос — скрипичный ключ с восьмёркой

function ptStaffBuild(run, k) {
  run.staffKey = k;
  var mk = run.tl.marks[k];
  var notes = run.notes.filter(function (n) { return n.key === k; });
  run.staffNotes = notes;
  var W = run.W, n = notes.length;
  var gap = n > 1 ? Math.min(31, (W - 100) / (n - 1)) : 31;
  var s = "";
  for (var li = 0; li < 5; li++) s += '<line x1="14" x2="' + (W - 14) + '" y1="' + (PT_STAFF_TOP + li * PT_G) + '" y2="' + (PT_STAFF_TOP + li * PT_G) + '" stroke="var(--gray)" stroke-width="1.2" opacity=".6"/>';
  s += '<text x="18" y="' + (PT_STAFF_TOP + 4 * PT_G + 8) + '" font-size="58" fill="var(--gray)" font-family="serif">' + (PT.voice === "low" ? "𝄠" : "𝄞") + "</text>";
  var tonic = mk.key;
  notes.forEach(function (nt, j) {
    var x = 70 + j * gap;
    var sp = ptSpell(ptDisp(nt.m), ptDisp(tonic), run.ex.mode), y = ptStaffY(sp.idx);
    nt.sx = x; nt.sy = y;
    var led = "";
    for (var a = 28; a >= sp.idx; a -= 2) led += '<line x1="' + (x - 12) + '" x2="' + (x + 12) + '" y1="' + ptStaffY(a) + '" y2="' + ptStaffY(a) + '" stroke="var(--gray)" stroke-width="1.2"/>';
    for (var b = 40; b <= sp.idx; b += 2) led += '<line x1="' + (x - 12) + '" x2="' + (x + 12) + '" y1="' + ptStaffY(b) + '" y2="' + ptStaffY(b) + '" stroke="var(--gray)" stroke-width="1.2"/>';
    var up = sp.idx < 34;
    s += led +
      (sp.acc ? '<text data-acc="' + nt.i + '" x="' + (x - 20) + '" y="' + (y + 5) + '" font-size="16" fill="var(--ink)">' + sp.acc + "</text>" : "") +
      '<ellipse data-head="' + nt.i + '" cx="' + x + '" cy="' + y + '" rx="7.5" ry="5.6" transform="rotate(-20 ' + x + " " + y + ')" fill="var(--ink)"/>' +
      '<line data-stem="' + nt.i + '" x1="' + (up ? x + 7 : x - 7) + '" x2="' + (up ? x + 7 : x - 7) + '" y1="' + y + '" y2="' + (up ? y - 36 : y + 36) + '" stroke="var(--ink)" stroke-width="1.4"/>';
  });
  run.staffEl.innerHTML = s;
  notes.forEach(function (nt) {
    nt.headEl = run.staffEl.querySelector('[data-head="' + nt.i + '"]');
    nt.stemEl = run.staffEl.querySelector('[data-stem="' + nt.i + '"]');
    nt.accEl = run.staffEl.querySelector('[data-acc="' + nt.i + '"]');
    nt.drawn = null;
  });
  run.gap = gap;
  run.staffPts = [];
}

// Высота голоса (дробный MIDI) → вертикаль на стане текущей тональности.
function ptStaffYOf(run, p) {
  var tonic = run.tl.marks[run.staffKey].key, m0 = Math.floor(p);
  var y0 = ptStaffY(ptSpell(ptDisp(m0), ptDisp(tonic), run.ex.mode).idx);
  var y1 = ptStaffY(ptSpell(ptDisp(m0 + 1), ptDisp(tonic), run.ex.mode).idx);
  return y0 + (p - m0) * (y1 - y0);
}
// Доля (beat) → горизонталь на стане: между головками нот текущего звена.
function ptStaffXOf(run, beat) {
  var ns = run.staffNotes;
  if (!ns.length) return 70;
  if (beat <= ns[0].t) return ns[0].sx - 8;
  for (var j = 0; j < ns.length; j++) {
    var a = ns[j], next = ns[j + 1];
    var end = next ? next.t : a.t + a.d;
    if (beat < end) return a.sx - 6 + Math.min(1, (beat - a.t) / Math.max(0.01, end - a.t)) * (next ? next.sx - a.sx : run.gap);
  }
  var l = ns[ns.length - 1];
  return l.sx - 6 + run.gap;
}

/* ---------- кадр ---------- */

function ptFrame(still) {
  var run = PT.run;
  if (!run || !run.lane) return;
  var beat = run.heard;
  var at = ptMarkAt(run, beat), k = at.k < 0 ? 0 : at.k;
  // какая нота звучит сейчас
  var cur = null;
  for (var i = 0; i < run.notes.length; i++) {
    var n = run.notes[i];
    if (beat >= n.t && beat < n.t + n.d) cur = n;
    if (n.st === "up" || n.st === "cur") n.st = n === cur ? "cur" : "up";
  }
  run.cur = cur;
  if (run.view === "bars") {
    var target = run.tl.marks[k] ? run.tl.marks[k].key + (run.hi - run.lo) / 4 : run.lo;
    if (at.k >= 0 && beat > at.mk.t + run.L && run.tl.marks[k + 1]) target = run.tl.marks[k + 1].key + (run.hi - run.lo) / 4;
    var want = PT_H / 2 + target * PT_SY;
    run.ty += (want - run.ty) * (still ? 1 : 0.08);
    var tx = run.playX - beat * PT_U;
    run.gy.setAttribute("transform", "translate(0," + run.ty.toFixed(1) + ")");
    run.gw.setAttribute("transform", "translate(" + tx.toFixed(1) + "," + run.ty.toFixed(1) + ")");
    run.notes.forEach(function (nt) { ptPaintNote(run, nt); });
    // линия голоса
    var d = "", pen = false, lastB = -1;
    run.pts.forEach(function (p) {
      if (p.b < beat - run.playX / PT_U - 1) return;
      var x = (p.b * PT_U).toFixed(1), y = (-p.p * PT_SY).toFixed(1);
      d += (pen && p.b - lastB < 0.4 ? "L" : "M") + x + " " + y;
      pen = true; lastB = p.b;
    });
    run.lineEl.setAttribute("d", d);
    var lp = run.pts[run.pts.length - 1];
    if (lp && beat - lp.b < 0.35 && run.playing) {
      run.dotEl.style.display = "";
      run.dotEl.setAttribute("transform", "translate(" + (lp.b * PT_U + tx).toFixed(1) + "," + (-lp.p * PT_SY + run.ty).toFixed(1) + ")");
    } else run.dotEl.style.display = "none";
  } else {
    var sk = k;
    if (at.k >= 0 && beat > at.mk.t + run.L && run.tl.marks[k + 1]) sk = k + 1;
    if (sk !== run.staffKey) ptStaffBuild(run, sk);
    run.staffNotes.forEach(function (nt) { ptPaintNote(run, nt); });
    var d2 = "", pen2 = false, lb = -1, mk = run.tl.marks[run.staffKey];
    run.pts.forEach(function (p) {
      if (p.b < mk.t - 0.5 || p.b > mk.t + run.L + 0.5) return;
      var x = ptStaffXOf(run, p.b).toFixed(1), y = ptStaffYOf(run, p.p).toFixed(1);
      d2 += (pen2 && p.b - lb < 0.4 ? "L" : "M") + x + " " + y;
      pen2 = true; lb = p.b;
    });
    run.lineEl.setAttribute("d", d2);
    var lp2 = run.pts[run.pts.length - 1];
    if (lp2 && beat - lp2.b < 0.35 && run.playing && lp2.b >= mk.t - 0.5) {
      run.dotEl.style.display = "";
      run.dotEl.setAttribute("transform", "translate(" + ptStaffXOf(run, lp2.b).toFixed(1) + "," + ptStaffYOf(run, lp2.p).toFixed(1) + ")");
    } else run.dotEl.style.display = "none";
  }
  // мини-плеер
  var total = run.tl.total;
  run.barEl.style.width = Math.max(0, Math.min(100, beat / total * 100)).toFixed(1) + "%";
  var kk = at.k >= 0 && beat > at.mk.t + run.L && run.tl.marks[k + 1] ? k + 1 : k;
  run.kEl.textContent = "Тональность " + (kk + 1) + " из " + run.tl.marks.length;
  run.tmEl.textContent = ptMmss((total - beat) * run.spb);
}

/* ==========================================================================
   ЗВУК: пианино (движок распевок) + микрофон
   ========================================================================== */

function ptCtx() {
  if (!PT.ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    try { PT.ctx = new AC({ latencyHint: "interactive" }); } catch (e) { PT.ctx = new AC(); }
    // Пианино идёт через отвод: так мы знаем, насколько громко оно звучит прямо сейчас,
    // и можем отличить его отголосок в микрофоне от голоса.
    PT.pOut = PT.ctx.createGain();
    PT.pOut.connect(PT.ctx.destination);
    PT.pAn = PT.ctx.createAnalyser(); PT.pAn.fftSize = 2048;
    PT.pBuf = new Float32Array(2048);
    PT.pOut.connect(PT.pAn);
    PT.piano = new window.Raspevki.PianoVoice(PT.ctx, PT.pOut);
  }
  try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
  if (PT.ctx.state !== "running") PT.ctx.resume();
  return PT.ctx;
}

function ptMicOpen(headphones) {
  if (PT.mic && PT.mic.hp === headphones) return Promise.resolve(PT.mic);
  ptMicClose();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("nomic"));
  return navigator.mediaDevices.getUserMedia({
    audio: {
      // В наушниках музыки в микрофоне нет — выключаем обработку, она портит высоту.
      // Без наушников оставляем эхоподавление: оно убирает часть пианино из микрофона.
      echoCancellation: !headphones, noiseSuppression: false, autoGainControl: false
    }
  }).then(function (stream) {
    var ctx = ptCtx();
    var src = ctx.createMediaStreamSource(stream);
    var an = ctx.createAnalyser();
    an.fftSize = 2048;
    var mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(an); an.connect(mute); mute.connect(ctx.destination);
    PT.mic = { stream: stream, src: src, an: an, mute: mute, hp: headphones, buf: new Float32Array(2048) };
    return PT.mic;
  });
}
function ptMicClose() {
  if (!PT.mic) return;
  try { PT.mic.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  try { PT.mic.src.disconnect(); PT.mic.mute.disconnect(); } catch (e) {}
  PT.mic = null;
}

// YIN по прореженному до ~24 кГц кадру. Возвращает частоту или 0 (тишина / шум).
var PT_YD = null, PT_DEC = null;
function ptDetect(buf, sr) {
  var dec = sr > 30000 ? 2 : 1, N = Math.floor(buf.length / dec), i, j;
  if (!PT_DEC || PT_DEC.length !== N) PT_DEC = new Float32Array(N);
  var x = PT_DEC, rms = 0;
  for (i = 0; i < N; i++) {
    var v = 0;
    for (j = 0; j < dec; j++) v += buf[i * dec + j];
    x[i] = v / dec; rms += x[i] * x[i];
  }
  rms = Math.sqrt(rms / N);
  if (rms < 0.012) return 0;
  var rate = sr / dec, W = N >> 1;
  var maxLag = Math.min(W - 1, Math.floor(rate / 65)), minLag = Math.max(2, Math.floor(rate / 1100));
  if (!PT_YD || PT_YD.length < maxLag + 2) PT_YD = new Float32Array(maxLag + 2);
  var d = PT_YD, run = 0;
  d[0] = 1;
  for (var tau = 1; tau <= maxLag; tau++) {
    var sum = 0;
    for (i = 0; i < W; i++) { var df = x[i] - x[i + tau]; sum += df * df; }
    run += sum;
    d[tau] = run > 0 ? sum * tau / run : 1;
  }
  var best = -1;
  for (tau = minLag; tau <= maxLag; tau++) {
    if (d[tau] < 0.13) {
      while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
      best = tau; break;
    }
  }
  if (best < 0) return 0;
  var a = d[best - 1], b = d[best], c = best + 1 <= maxLag ? d[best + 1] : b;
  var den = a - 2 * b + c, shiftT = den ? 0.5 * (a - c) / den : 0;
  return rate / (best + shiftT);
}

function ptFold(p, target) {
  while (p - target > 6) p -= 12;
  while (target - p > 6) p += 12;
  return p;
}

/* ---------- запуск, пауза, конец ---------- */

function ptPlayTap() {
  var run = PT.run;
  if (!run) return;
  if (run.playing) { ptPause(); return; }
  hpGate("pitch", function () {
    ptCtx(); // AudioContext запускаем прямо в нажатии — иначе iPhone его не включит
    var hp = (window.KAR && KAR.hp) === "yes";
    ptHint("Включаю микрофон…", "", true);
    ptMicOpen(hp).then(function () {
      if (PT.run !== run) return;
      if (!PT.pianoReady) {
        ptHint("Готовлю пианино…", "", true);
        return PT.piano.prepare(function (f) { if (PT.run === run) ptHint("Готовлю пианино…", Math.round(f * 100) + "%", true); })
          .then(function () { PT.pianoReady = true; });
      }
    }).then(function () {
      if (PT.run !== run || state.screen !== "pitch-sing") return;
      ptStartFrom(run, run.resumeAt || 0);
    }).catch(function () {
      if (PT.run !== run) return;
      ptHint("Нет доступа к микрофону", "Разреши Telegram пользоваться микрофоном в настройках телефона и открой распевку ещё раз", true);
    });
  });
}

function ptStartFrom(run, beat) {
  var ctx = ptCtx();
  // всё, что будет спето заново, считаем заново
  run.notes.forEach(function (n) { if (n.t >= beat - 1e-6) { n.st = "up"; n.v = 0; n.inN = 0; n.nearN = 0; n.fr = 0; n.cents = []; n.done = false; } });
  run.pts = run.pts.filter(function (p) { return p.b < beat; });
  run.t0 = ctx.currentTime + 0.15 - beat * run.spb;
  run.outLat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  run.idx = 0;
  while (run.idx < run.tl.events.length && run.tl.events[run.idx].t < beat - 1e-6) run.idx++;
  run.nPtr = 0;
  run.med = [];
  run.pHist = []; run.vRun = 0;
  if (!run.bleedS) { run.bleedS = []; run.bleed = ptBleedLoad(); } // начинаем с прошлого замера на этом телефоне
  run.playing = true;
  run.btn.innerHTML = PT_ICO.pause;
  ptSchedule(run);
  run.timer = setInterval(function () { ptSchedule(run); }, 40);
  cancelAnimationFrame(run.raf);
  run.raf = requestAnimationFrame(function loop() { if (!run.playing) return; ptTick(run); run.raf = requestAnimationFrame(loop); });
}

function ptSchedule(run) {
  if (!run.playing) return;
  var ctx = PT.ctx, now = ctx.currentTime, horizon = now + 0.35, ev = run.tl.events;
  while (run.idx < ev.length) {
    var e = ev[run.idx], at = run.t0 + e.t * run.spb;
    if (at > horizon) break;
    if (at >= now - 0.02) PT.piano.play(e.m, Math.max(at, now), e.d * run.spb, e.v);
    run.idx++;
  }
}

function ptPause() {
  var run = PT.run;
  if (!run) return;
  ptHalt(run);
  // продолжим с подсказки «та-та» перед тональностью, на которой остановились
  var at = ptMarkAt(run, run.heard);
  var mk = at.k >= 0 && run.heard > at.mk.t + run.L && run.tl.marks[at.k + 1] ? run.tl.marks[at.k + 1] : at.mk;
  run.resumeAt = mk ? Math.max(0, mk.t - run.bar) : 0;
  run.heard = run.resumeAt;
  ptFrame(true);
  ptHint("Пауза", "продолжим с начала этой тональности", true);
}

function ptHalt(run) {
  run.playing = false;
  clearInterval(run.timer);
  cancelAnimationFrame(run.raf);
  if (PT.piano) PT.piano.stopAll();
  if (run.btn) run.btn.innerHTML = PT_ICO.play;
}

/* ---------- голос или пианино? ----------
   Без наушников пианино из динамика попадает в микрофон — и ровно на тех же нотах,
   что поёт ученик. Поэтому смотрим на громкость: сколько пианино сейчас звучит
   (знаем точно, это наш же звук) и какая доля его доходит до микрофона.
   Эту долю меряем в паузах между тональностями, где петь не нужно, и запоминаем
   на телефоне. Голосом считаем только звук заметно громче этого отголоска. */
var PT_GATE_K = 2.2;       // во сколько раз голос должен быть громче отголоска пианино (~7 дБ)
var PT_MIC_FLOOR = 0.01;   // совсем тихо — не голос

function ptRms(buf) { var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
function ptBleedKey() { return "pt-bleed-" + (PT.mic && PT.mic.hp ? "hp" : "spk"); }
function ptBleedLoad() {
  var v = parseFloat(ptGet(ptBleedKey(), ""));
  return isFinite(v) && v > 0 ? v : 0;
}
// Громкость пианино «на слух микрофона»: максимум за последние ~0.4 с —
// звук доходит до микрофона с задержкой и тянется хвостом реверба.
function ptPianoEnv(run, now) {
  if (!PT.pAn) return 0;
  PT.pAn.getFloatTimeDomainData(PT.pBuf);
  var h = run.pHist || (run.pHist = []);
  h.push({ t: now, r: ptRms(PT.pBuf) });
  while (h.length && h[0].t < now - 0.4) h.shift();
  var mx = 0; for (var i = 0; i < h.length; i++) if (h[i].r > mx) mx = h[i].r;
  return mx;
}
// В паузе между тональностями (своих нот нет рядом) учимся, сколько пианино слышно в микрофоне.
function ptLearnBleed(run, sungBeat, micR, pEnv) {
  if (pEnv < 0.02) return;
  for (var i = Math.max(0, run.nPtr - 1); i < run.notes.length; i++) {
    var n = run.notes[i];
    if (n.t > sungBeat + 1) break;
    if (sungBeat > n.t - 0.5 && sungBeat < n.t + n.d + 0.6) return; // рядом нота — тут может звучать голос
  }
  var arr = run.bleedS || (run.bleedS = []);
  arr.push(micR / pEnv);
  if (arr.length > 400) arr.shift();
  if (arr.length >= 10) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var est = s[Math.floor(s.length * 0.4)]; // устойчиво к случайному «подпеванию» в паузе
    run.bleed = est;
    if (arr.length % 20 === 0) ptSet(ptBleedKey(), String(est));
  }
}
function ptIsVoice(run, micR, pEnv) {
  if (micR < PT_MIC_FLOOR) return false;
  var r = run.bleed || 0;
  if (!r && pEnv > 0.02 && !(PT.mic && PT.mic.hp)) r = 0.6; // ещё не измерили — осторожно
  return micR > PT_GATE_K * r * pEnv;
}

function ptTick(run) {
  var ctx = PT.ctx, now = ctx.currentTime;
  run.heard = (now - run.outLat - run.t0) / run.spb;
  // момент, когда звук попал в микрофон, в долях «услышанного» времени
  var sungBeat = (now - (PT.mic ? 1024 / ctx.sampleRate + 0.02 : 0) - run.outLat - run.t0) / run.spb;
  // голос
  var mic = PT.mic, p = 0;
  if (mic) {
    mic.an.getFloatTimeDomainData(mic.buf);
    var micR = ptRms(mic.buf), pEnv = ptPianoEnv(run, now);
    ptLearnBleed(run, sungBeat, micR, pEnv);
    var f = ptIsVoice(run, micR, pEnv) ? ptDetect(mic.buf, ctx.sampleRate) : 0;
    // голос держится — пианинный «укол» на атаке ноты в 1–2 кадра не считаем
    run.vRun = f > 0 ? (run.vRun || 0) + 1 : 0;
    if (run.vRun < 3) f = 0;
    if (f > 0) {
      var m = 69 + 12 * Math.log(f / 440) / Math.LN2;
      run.med.push(m); if (run.med.length > 3) run.med.shift();
      var s = run.med.slice().sort(function (a, b) { return a - b; });
      p = s[s.length >> 1];
    } else run.med = [];
  }
  var ref = run.cur || ptNearNote(run, sungBeat);
  if (p) {
    run.voicedTotal++;
    var pd = ptFold(p, ref ? ref.m : run.lo);
    run.pts.push({ b: sungBeat, p: pd });
    if (run.pts.length > 900) run.pts.splice(0, 300);
  }
  ptScoreFrame(run, sungBeat, p);
  ptLiveHint(run, sungBeat);
  ptFrame(false);
  if (run.heard >= run.tl.total) ptFinish(run);
}

function ptNearNote(run, beat) {
  var best = null, bd = 1e9;
  for (var i = Math.max(0, run.nPtr - 2); i < run.notes.length; i++) {
    var n = run.notes[i], dd = Math.abs(n.t - beat);
    if (dd < bd) { bd = dd; best = n; }
    if (n.t > beat + 8) break;
  }
  return best;
}

// Кадр голоса → в окно своей ноты. Начало ноты пропускаем: на вход в звук нужно время.
function ptScoreFrame(run, beat, p) {
  var sec = beat * run.spb;
  while (run.nPtr < run.notes.length) {
    var n = run.notes[run.nPtr];
    var a = n.t * run.spb + Math.min(0.22, 0.35 * n.d * run.spb), b = (n.t + n.d) * run.spb + 0.08;
    if (sec > b) { ptCloseNote(n); run.nPtr++; continue; }
    if (sec >= a) {
      n.fr++;
      if (p) {
        var c = (p - n.m) * 100;
        c = ((c + 600) % 1200 + 1200) % 1200 - 600; // октава не в счёт
        n.v++;
        if (Math.abs(c) <= 50) n.inN++;
        if (Math.abs(c) <= 100) n.nearN++;
        (n.cents || (n.cents = [])).push(c);
      }
    }
    break;
  }
}
function ptCloseNote(n) {
  if (n.done) return;
  n.done = true;
  if (n.v >= 3 && n.inN / n.v >= 0.5) n.st = "hit";
  else if (n.v >= 3 && n.nearN / n.v >= 0.5) n.st = "near";
  else n.st = "miss";
}

function ptLiveHint(run, beat) {
  var n = run.cur;
  if (!n) {
    var nx = null;
    for (var i = run.nPtr; i < run.notes.length; i++) if (run.notes[i].t >= run.heard) { nx = run.notes[i]; break; }
    var at = ptMarkAt(run, run.heard);
    if (at.k < 0 || run.heard > at.mk.t + run.L) ptHint("Слушай: новая тональность", nx ? "первая нота «" + nx.sp.name + "»" : "", false);
    return;
  }
  var cs = (n.cents || []).slice(-8);
  var next = run.notes[n.i + 1] && run.notes[n.i + 1].key === n.key ? run.notes[n.i + 1] : null;
  var linkNotes = run.notes.filter(function (x) { return x.key === n.key; });
  var top = Math.max.apply(null, linkNotes.map(function (x) { return x.m; }));
  var nextTxt = next ? "следующая нота «" + next.sp.name + "»" + (next.m === top && next.m !== n.m ? ", самая высокая" : "") : "";
  if (cs.length < 3) { ptHint("Пой вместе с пианино", "сейчас нота «" + n.sp.name + "»", false); return; }
  var s = cs.slice().sort(function (a, b) { return a - b; }), med = s[s.length >> 1];
  if (Math.abs(med) <= 40) {
    var prev = run.notes[n.i - 1];
    ptHint(prev && prev.st === "hit" ? "Отлично держишь линию" : "Попал в ноту", nextTxt || "сейчас нота «" + n.sp.name + "»", false);
  } else if (med < 0) ptHint("Чуть выше, и будет точно", "сейчас нота «" + n.sp.name + "»", false);
  else ptHint("Чуть ниже, и будет точно", "сейчас нота «" + n.sp.name + "»", false);
}

function ptFinish(run) {
  ptHalt(run);
  run.notes.forEach(ptCloseNote);
  run.resumeAt = 0;
  if (run.voicedTotal < 15) {
    run.heard = 0;
    run.notes.forEach(function (n) { n.st = "up"; n.done = false; });
    run.pts = [];
    ptFrame(true);
    ptHint("Я не услышал твой голос", "Проверь, что микрофон ничем не закрыт, и спой ещё раз", true);
    return;
  }
  PT.res = ptResult(run);
  go("pitch-score");
}

/* ==========================================================================
   ОЦЕНКА
   ========================================================================== */

function ptResult(run) {
  var notes = run.notes, N = notes.length || 1;
  var hits = notes.filter(function (n) { return n.st === "hit"; }).length;
  var pct = Math.round(hits / N * 100);
  var keys = run.tl.marks.map(function (mk, k) {
    var ns = notes.filter(function (n) { return n.key === k; });
    var h = ns.filter(function (n) { return n.st === "hit"; }).length;
    var nr = ns.filter(function (n) { return n.st === "near"; }).length;
    var share = ns.length ? h / ns.length : 1, close = ns.length ? (h + nr) / ns.length : 1;
    return { tonic: mk.key, share: share, cls: share >= 0.75 ? "ok" : close >= 0.5 ? "near" : "more" };
  });
  // зоны по высоте тональности: нижние / средние / верхние
  var tonics = keys.map(function (k) { return k.tonic; });
  var lo = Math.min.apply(null, tonics), hi = Math.max.apply(null, tonics), span = Math.max(1, hi - lo);
  var zones = [{ name: "нижние", s: 0, n: 0 }, { name: "средние", s: 0, n: 0 }, { name: "верхние", s: 0, n: 0 }];
  keys.forEach(function (k) {
    var z = hi === lo ? 1 : Math.min(2, Math.floor((k.tonic - lo) / span * 3));
    zones[z].s += k.share; zones[z].n++;
  });
  zones.forEach(function (z) { z.avg = z.n ? z.s / z.n : null; });
  var good = zones.filter(function (z) { return z.avg != null && z.avg >= 0.75; });
  var well;
  if (pct >= 90) well = "почти все ноты точно, по всему диапазону.";
  else if (good.length && good.length < 3) well = good.map(function (z) { return z.name; }).join(" и ") + " тональности почти без промахов.";
  else if (good.length === 3) well = "все тональности ровно, без провалов.";
  else well = "ты уже попадаешь в часть нот, и это хорошее начало.";
  var weak = zones.filter(function (z) { return z.avg != null; }).sort(function (a, b) { return a.avg - b.avg; })[0];
  var tryTxt;
  if (!weak || weak.avg >= 0.75) tryTxt = "спой ещё раз и закрепи результат.";
  else if (weak.name === "верхние") tryTxt = "на самом верху не дави, звук попадёт сам.";
  else if (weak.name === "нижние") tryTxt = "внизу не проваливайся, пой так же легко, как в середине.";
  else tryTxt = "в середине слушай первую ноту каждой тональности и начинай с неё.";
  var stars = pct >= 90 ? 5 : pct >= 70 ? 4 : 3;
  var title = stars === 5 ? "Отлично!" : stars === 4 ? "Очень хорошо!" : pct >= 50 ? "Хорошо!" : "Хорошее начало!";
  var key = ptExKey(run.ex), last = ptLast(), prev = last[key];
  var cmp = prev == null ? "первая попытка с проверкой" : pct > prev ? "в прошлый раз " + prev + "%, ты растёшь" : pct === prev ? "в прошлый раз тоже " + prev + "%" : "в прошлый раз " + prev + "%";
  last[key] = pct;
  ptSet("pt-last", JSON.stringify(last));
  return { ex: run.ex, pct: pct, stars: stars, title: title, cmp: cmp, keys: keys, well: well, tryTxt: tryTxt };
}

function renderPitchScore() {
  var r = PT.res;
  if (!r) { go("pitch-topic"); return; }
  var st = "";
  for (var i = 1; i <= 5; i++) st += '<span class="star' + (i <= r.stars ? "" : " off") + '">★</span>';
  var col = { ok: "var(--green)", near: "var(--yellow)", more: "var(--blue)" };
  var dots = r.keys.map(function (k) { return '<i style="background:' + col[k.cls] + '"></i>'; }).join("");
  var n = r.keys.length;
  app.innerHTML = '<div class="pt">' +
    '<div class="top pb8">' + backBtn("back") + '<div><div class="top-title lg">Распевка готова</div>' +
      '<div class="top-sub">«' + esc(ptSyl(r.ex)) + "» · " + n + " " + plural(n, "тональность", "тональности", "тональностей") + "</div></div></div>" +
    '<div class="pt-res">' +
      '<div class="card" style="text-align:center;padding:18px 18px 16px"><div class="stars">' + st + "</div><h2>" + esc(r.title) + "</h2>" +
        '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px"><div class="big">' + r.pct + "%</div>" +
        '<div style="text-align:left"><div style="font:800 15px Manrope,sans-serif;color:var(--ink)">нот в цель</div><p style="font-size:12px;color:var(--gray)">' + esc(r.cmp) + "</p></div></div></div>" +
      '<div class="card" style="margin-top:14px"><div class="sec">Каждая тональность</div><div class="kdots">' + dots + "</div>" +
        '<div class="legend"><span><i style="background:var(--green)"></i>точно</span><span><i style="background:var(--yellow)"></i>почти</span><span><i style="background:var(--blue)"></i>попробуем ещё</span></div></div>' +
      '<div class="card" style="margin-top:14px"><p><b>Здорово:</b> ' + esc(r.well) + '</p><p style="margin-top:8px"><b>Попробуй:</b> ' + esc(r.tryTxt) + "</p></div>" +
      '<div class="btns"><button class="main" data-pt="again">Спеть ещё раз</button><button data-pt="next">Дальше</button></div>' +
    "</div></div>";
  wireActs();
  app.querySelector('[data-pt="again"]').onclick = function () { PT.autostart = true; go("pitch-sing"); };
  app.querySelector('[data-pt="next"]').onclick = function () {
    var list = ptExOf(r.ex.topic), i = list.indexOf(r.ex);
    if (list[i + 1]) { PT.ex = list[i + 1]; go("pitch-sing"); return; }
    var tps = ptTopics(), ti = tps.indexOf(ptTopicOf(r.ex.topic));
    var nt = tps[ti + 1];
    if (nt) { PT.topic = nt.id; PT.ex = ptExOf(nt.id)[0]; go("pitch-sing"); }
    else go("pitch");
  };
}

/* ==========================================================================
   ВХОД
   ========================================================================== */

function renderPitchScreen() {
  if (!(window.Raspevki && window.RASPEVKI)) {
    app.innerHTML = '<div class="pt" style="padding:var(--screen-top) 20px 130px;">' + cabBack() +
      '<div class="cab-screen-title">Распевки с проверкой</div><div class="instruction-note">' +
      (PT.libErr ? "Не получилось загрузить распевки. Проверь интернет и открой экран ещё раз." : "Загружаю распевки…") + "</div></div>";
    wireActs();
    if (!PT.libErr) ptLib(function () { if (/^pitch/.test(state.screen)) render(); });
    else PT.libErr = false;
    return;
  }
  switch (state.screen) {
    case "pitch": renderPitchList(); break;
    case "pitch-topic": renderPitchTopic(); break;
    case "pitch-sing": renderPitchSing(); break;
    case "pitch-score": renderPitchScore(); break;
  }
}

window.pitchStopAll = function () {
  if (PT.run) { ptHalt(PT.run); PT.run.lane = null; }
  if (state.screen !== "pitch-sing" && state.screen !== "pitch-score") ptMicClose();
};
document.addEventListener("visibilitychange", function () {
  if (document.hidden && PT.run && PT.run.playing) ptPause();
});

ACTS["cab-pitch"] = function () { go("pitch"); };
