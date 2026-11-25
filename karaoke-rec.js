/* ==========================================================================
   ЗАПИСЬ В КАРАОКЕ (25.11, просьба Николая)

   Ученик поёт под минус и (в проводных наушниках) слышит свой голос уже
   обработанным: компрессор 10%, дилей 1,8% (1/8 под темп песни), ревер 6%
   (короткий плейт). Перед записью — один ползунок «Обработка» 0–100%.

   Настройка наушников: щелчки играют в наушник, поднесённый к низу телефона,
   микрофон их ловит — так меряется вся задержка «наушник → микрофон» на этом
   телефоне. Для Bluetooth (AirPods) щелчок ловит микрофон самого наушника,
   и это ровно тот путь, по которому потом пойдёт запись голоса. По задержке:
     • дубль сдвигается так, что ложится точно в минус;
     • прослушивание себя включается, только если задержка маленькая
       (проводные). Убрать её совсем в браузере нельзя — только измерить.
   Задержка запоминается на этом телефоне для этих наушников (по названию
   микрофона и задержке выхода); другие наушники — проверка заново.

   Дубль: прослушать (голос с обработкой + минус), записать заново,
   отправить Николаю в бот (mp3, api/submit.js, kind = "karaoke-take").
   ========================================================================== */

var KR_FX = { comp: 0.10, delay: 0.018, reverb: 0.06 }; // значения Николая при «Обработка 100%»
var KR_MON_MAX = 0.06;   // до 60 мс туда-обратно — прослушивание себя включаем
var KR_CLICKS = 6, KR_GAP = 0.6;

var KREC = {
  stream: null, src: null, node: null, sink: null, label: "",
  calib: null, chunks: null, on: false,
  rec: null,      // идёт запись: { T0, p0, rate, startF }
  take: null,     // последний дубль
  play: null,     // прослушивание дубля
  mon: null,      // цепочка прослушивания себя
  amt: 1
};

(function () { try { KREC.amt = Math.max(0, Math.min(1, Number(localStorage.getItem("kr-amt") || 1))); } catch (e) {} })();

function krStore(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) {} }
function krLoad(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }

/* ---------- микрофон и запись сырого звука ---------- */

var KR_WORKLET = "class R extends AudioWorkletProcessor{constructor(){super();this.on=false;this.b=new Float32Array(4096);this.n=0;this.f0=0;" +
  "this.port.onmessage=e=>{if(e.data==='start'){this.on=true;this.n=0;}else if(e.data==='stop'){if(this.n)this.port.postMessage({f:this.f0,d:this.b.slice(0,this.n)});this.on=false;this.n=0;this.port.postMessage({done:1});}};}" +
  "process(i){const c=i[0]&&i[0][0];if(this.on&&c){if(!this.n)this.f0=currentFrame;let k=0;while(k<c.length){const m=Math.min(c.length-k,4096-this.n);this.b.set(c.subarray(k,k+m),this.n);this.n+=m;k+=m;" +
  "if(this.n===4096){this.port.postMessage({f:this.f0,d:this.b.slice(0)});this.n=0;this.f0=currentFrame+k;}}}return true;}}registerProcessor('kr-rec',R);";

function krCtx() {
  var ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function krMicOpen() {
  if (KREC.stream && KREC.stream.active && KREC.node) return Promise.resolve();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("nomic"));
  try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
  var ctx = krCtx();
  var wp = KREC.wp || (KREC.wp = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([KR_WORKLET], { type: "application/javascript" }))));
  return navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, latency: 0
  } }).then(function (st) {
    KREC.stream = st;
    var tr = st.getAudioTracks()[0];
    KREC.label = (tr && tr.label) || "";
    return wp;
  }).then(function () {
    KREC.src = ctx.createMediaStreamSource(KREC.stream);
    KREC.node = new AudioWorkletNode(ctx, "kr-rec", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    KREC.sink = ctx.createGain(); KREC.sink.gain.value = 0;
    KREC.src.connect(KREC.node); KREC.node.connect(KREC.sink); KREC.sink.connect(ctx.destination);
    KREC.node.port.onmessage = function (e) {
      if (e.data.done) { if (KREC.onDone) { var f = KREC.onDone; KREC.onDone = null; f(); } return; }
      if (KREC.chunks) KREC.chunks.push(e.data);
    };
  });
}

function krMicClose() {
  krMonOff();
  if (KREC.stream) { KREC.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); }
  try { if (KREC.src) KREC.src.disconnect(); if (KREC.node) KREC.node.disconnect(); if (KREC.sink) KREC.sink.disconnect(); } catch (e) {}
  KREC.stream = KREC.src = KREC.node = KREC.sink = null;
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
}

function krRecStart() { KREC.chunks = []; KREC.node.port.postMessage("start"); }
function krRecStop() {
  return new Promise(function (res) {
    KREC.onDone = function () { var c = KREC.chunks || []; KREC.chunks = null; res(c); };
    KREC.node.port.postMessage("stop");
  });
}

// куски записи → один массив, начиная с кадра fromF (по часам AudioContext)
function krJoin(chunks, fromF, toF) {
  var len = Math.max(0, Math.floor(toF - fromF)), out = new Float32Array(len);
  chunks.forEach(function (c) {
    var off = Math.round(c.f - fromF);
    for (var i = 0; i < c.d.length; i++) { var j = off + i; if (j >= 0 && j < len) out[j] = c.d[i]; }
  });
  return out;
}

/* ---------- наушники: чьи они и какая задержка ---------- */

function krIsBT() {
  var ctx = getAudioCtx(), ol = Number(ctx.outputLatency) || 0;
  return ol > 0.08 || /airpods|beats|bluetooth|buds|hands-?free|jbl|sony|wh-|marshall|bose|redmi|honor|huawei|galaxy/i.test(KREC.label);
}
function krFp() {
  var ol = Number(getAudioCtx().outputLatency) || 0;
  return (KREC.label || "mic") + "|" + Math.round(ol * 50);
}
function krCalibGet() {
  var all = krLoad("kr-calib") || {};
  return all[krFp()] || null;
}
function krCalibSet(c) {
  var all = krLoad("kr-calib") || {};
  all[krFp()] = c;
  krStore("kr-calib", all);
}

/* Проверка: KR_CLICKS щелчков в наушник; микрофон (телефона или самого
   Bluetooth-наушника) их ловит. Задержка = медиана «услышал − сыграл». */
function krMeasure(onTick) {
  var ctx = krCtx(), sr = ctx.sampleRate;
  var T0 = ctx.currentTime + 0.9;
  krRecStart();
  for (var k = 0; k < KR_CLICKS; k++) {
    var t = T0 + k * KR_GAP;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = 2200;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.001); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.04);
    (function (kk, tt) { setTimeout(function () { if (onTick) onTick(kk); }, Math.max(0, (tt - ctx.currentTime) * 1000)); })(k, t);
  }
  var endT = T0 + KR_CLICKS * KR_GAP + 0.5;
  return new Promise(function (res) { setTimeout(res, (endT - ctx.currentTime) * 1000 + 80); })
    .then(krRecStop)
    .then(function (chunks) {
      var f0 = Math.round((T0 - 0.8) * sr), x = krJoin(chunks, f0, Math.round(endT * sr));
      var bin = Math.round(sr / 2000), nb = Math.floor(x.length / bin), env = new Float32Array(nb);
      for (var b = 0; b < nb; b++) { var m = 0; for (var i = b * bin; i < (b + 1) * bin; i++) { var v = Math.abs(x[i]); if (v > m) m = v; } env[b] = m; }
      var pre = Array.prototype.slice.call(env, 0, Math.floor(0.7 * 2000)).sort(function (a, c) { return a - c; });
      var noise = pre.length ? pre[Math.floor(pre.length * 0.9)] : 0;
      var res = [];
      for (var k2 = 0; k2 < KR_CLICKS; k2++) {
        var s = Math.round((0.8 + k2 * KR_GAP) * 2000), e = Math.min(nb, s + Math.round(0.5 * 2000)), pk = 0;
        for (var q = s; q < e; q++) if (env[q] > pk) pk = env[q];
        if (pk < noise * 4 || pk < 0.01) continue;
        var thr = Math.max(noise * 3, pk * 0.4);
        for (var r = s; r < e; r++) if (env[r] >= thr) { res.push((r - s) / 2000); break; }
      }
      if (res.length < 4) return { ok: false, why: "quiet" };
      res.sort(function (a, c) { return a - c; });
      var med = res[Math.floor(res.length / 2)];
      var spread = res[res.length - 1] - res[0];
      if (spread > 0.05) return { ok: false, why: "noisy" };
      return { ok: true, l: med };
    });
}

/* ---------- обработка голоса ---------- */

function krPlateIR(ctx, sec) {
  var sr = ctx.sampleRate, n = Math.round(sr * sec), pre = Math.round(sr * 0.01);
  var ir = ctx.createBuffer(2, n + pre, sr);
  for (var ch = 0; ch < 2; ch++) {
    var d = ir.getChannelData(ch), lp = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.55 - 0.4 * i / n); // к хвосту темнее
      d[pre + i] = lp * Math.pow(1 - i / n, 2.2);
    }
  }
  return ir;
}

/* Цепочка: компрессор → сухой + дилей + ревер. amt — ползунок «Обработка». */
function krChain(ctx, input, out, amt, bpm) {
  var a = Math.max(0, Math.min(1, amt));
  var c = KR_FX.comp * a;
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6 - 60 * c;  // 10% → −12 дБ
  comp.ratio.value = 1 + 10 * c;       // 10% → 2:1
  comp.knee.value = 12; comp.attack.value = 0.005; comp.release.value = 0.12;
  var mk = ctx.createGain(); mk.gain.value = 1 + 2 * c; // компенсация громкости после компрессора
  input.connect(comp); comp.connect(mk);
  var dry = ctx.createGain(); dry.gain.value = 1;
  mk.connect(dry); dry.connect(out);
  var dl = ctx.createDelay(2); dl.delayTime.value = Math.max(0.12, Math.min(0.6, 30 / (bpm || 100)));
  var fb = ctx.createGain(); fb.gain.value = 0.28;
  var dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 4200;
  var dwet = ctx.createGain(); dwet.gain.value = KR_FX.delay * a * 6; // в процентах «посыла», как в DAW
  mk.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dwet); dwet.connect(out);
  var cv = ctx.createConvolver();
  if (!KREC.ir || KREC.ir.sampleRate !== ctx.sampleRate) KREC.ir = krPlateIR(ctx, 1.2);
  cv.buffer = KREC.ir;
  var rwet = ctx.createGain(); rwet.gain.value = KR_FX.reverb * a * 4;
  mk.connect(cv); cv.connect(rwet); rwet.connect(out);
  return { nodes: [comp, mk, dry, dl, fb, dlp, dwet, cv, rwet], set: function (na) {
    var a2 = Math.max(0, Math.min(1, na)), c2 = KR_FX.comp * a2;
    comp.threshold.value = -6 - 60 * c2; comp.ratio.value = 1 + 10 * c2; mk.gain.value = 1 + 2 * c2;
    dwet.gain.value = KR_FX.delay * a2 * 6; rwet.gain.value = KR_FX.reverb * a2 * 4;
  } };
}

function krBpm() { return (KE && KE.meta && KE.meta.bpm ? KE.meta.bpm * (KE.tempo / 100) : 100); }

function krMonOn() {
  krMonOff();
  var ctx = krCtx();
  var out = ctx.createGain(); out.gain.value = 1;
  out.connect(ctx.destination);
  KREC.mon = { out: out, ch: krChain(ctx, KREC.src, out, KREC.amt, krBpm()) };
}
function krMonOff() {
  if (!KREC.mon) return;
  try { KREC.mon.out.disconnect(); KREC.mon.ch.nodes.forEach(function (n) { n.disconnect(); }); } catch (e) {}
  try { if (KREC.src && KREC.node) { KREC.src.disconnect(); KREC.src.connect(KREC.node); } } catch (e) {}
  KREC.mon = null;
}

/* ---------- минус для записи: с той тональностью и темпом, что выбраны ---------- */

function krTrackBuffer() {
  return karDecode().then(function (buf) {
    if (KE.pitch === 0 && KE.tempo === 100) return buf;
    var key = KE.pitch + "|" + KE.tempo;
    if (KREC.tb && KREC.tb.key === key && KREC.tb.src === buf) return KREC.tb.buf;
    return loadSoundTouch().then(function (mod) {
      var st = new mod.SoundTouch();
      st.pitchSemitones = KE.pitch; st.tempo = KE.tempo / 100;
      var filt = new mod.SimpleFilter(new mod.WebAudioBufferSource(buf), st);
      var est = Math.ceil(buf.length / (KE.tempo / 100)) + 8192;
      var L = new Float32Array(est), R = new Float32Array(est), tmp = new Float32Array(8192 * 2), n = 0, got;
      while ((got = filt.extract(tmp, 8192)) > 0 && n < est) {
        for (var i = 0; i < got && n < est; i++, n++) { L[n] = tmp[i * 2]; R[n] = tmp[i * 2 + 1]; }
      }
      var ctx = getAudioCtx(), out = ctx.createBuffer(2, Math.max(1, n), buf.sampleRate);
      out.copyToChannel(L.subarray(0, n), 0); out.copyToChannel(R.subarray(0, n), 1);
      KREC.tb = { key: key, src: buf, buf: out };
      return out;
    });
  });
}

/* ---------- запись дубля ---------- */

// Время песни для подсветки строк, пока идёт запись или прослушивание дубля
function krSongTime() {
  var ctx = getAudioCtx(), s = KREC.rec || KREC.play;
  if (!s) return null;
  return s.p0 + Math.max(0, ctx.currentTime - s.T0 - (Number(ctx.outputLatency) || 0)) * s.rate;
}

function krStartRecording() {
  var cal = krCalibGet();
  if (!cal) { krOpenCalib(); return; }
  if (KE && KE.playing) karPause();
  KP.recPrep = true; karPaintBottom();
  var p0 = Math.max(0, karTime() - 1);
  krTrackBuffer().then(function (tb) {
    var ctx = krCtx(), rate = KE.tempo / 100;
    var T0 = ctx.currentTime + 3.2; // отсчёт 3-2-1
    var src = ctx.createBufferSource(); src.buffer = tb;
    var tg = ctx.createGain(); tg.gain.value = 0.9;
    src.connect(tg); tg.connect(ctx.destination);
    src.start(T0, p0 / rate);
    src.onended = function () { if (KREC.rec && KREC.rec.src === src) krStopRecording(); };
    if (cal.mon && KREC.monWant !== false) krMonOn();
    krRecStart();
    KREC.rec = { T0: T0, p0: p0, rate: rate, src: src, l: cal.l, tb: tb };
    KP.recPrep = false; KP.recOn = true;
    karPaintBottom(); karPaintLyrics();
  }).catch(function () {
    KP.recPrep = false; karPaintBottom();
    karToast("Не загрузился минус. Проверь интернет и попробуй ещё раз.", true);
  });
}

function krStopRecording() {
  var r = KREC.rec;
  if (!r) return;
  KREC.rec = null; KP.recOn = false;
  try { r.src.onended = null; r.src.stop(); } catch (e) {}
  krMonOff();
  var ctx = getAudioCtx(), sr = ctx.sampleRate, endT = ctx.currentTime;
  krRecStop().then(function (chunks) {
    // голос, спетый под звук в момент t, приходит в запись на задержку позже —
    // сдвигаем дубль на измеренную задержку, и он ложится точно в минус
    var from = Math.round((r.T0 + r.l) * sr), to = Math.round((endT + r.l) * sr);
    var x = krJoin(chunks, from, to);
    if (x.length < sr * 1.5) { karToast("Слишком короткий дубль"); karPaintBottom(); return; }
    var vb = ctx.createBuffer(1, x.length, sr); vb.copyToChannel(x, 0);
    KREC.take = { voice: vb, tb: r.tb, p0: r.p0, rate: r.rate, dur: x.length / sr, song: KAR.song, sent: false };
    karSeek(Math.min((KE && KE.dur) || 1e9, r.p0 + (endT - r.T0) * r.rate));
    karPaintBottom(); karPaintLyrics();
    krOpenTake();
  });
}

/* ---------- прослушать дубль ---------- */

function krPlayTake() {
  krStopTake();
  var t = KREC.take; if (!t) return;
  var ctx = krCtx(), T0 = ctx.currentTime + 0.15;
  var out = ctx.createGain(); out.connect(ctx.destination);
  var vs = ctx.createBufferSource(); vs.buffer = t.voice;
  var ch = krChain(ctx, vs, out, KREC.amt, krBpm());
  var ts = ctx.createBufferSource(); ts.buffer = t.tb;
  var tg = ctx.createGain(); tg.gain.value = 0.8; ts.connect(tg); tg.connect(out);
  vs.start(T0); ts.start(T0, t.p0 / t.rate, t.dur);
  vs.onended = function () { if (KREC.play && KREC.play.vs === vs) { krStopTake(); krPaintTake(); karPaintLyrics(); } };
  KREC.play = { T0: T0, p0: t.p0, rate: t.rate, vs: vs, ts: ts, out: out, ch: ch };
  krPaintTake();
}
function krStopTake() {
  var p = KREC.play; if (!p) return;
  KREC.play = null;
  try { p.vs.onended = null; p.vs.stop(); p.ts.stop(); p.out.disconnect(); p.ch.nodes.forEach(function (n) { n.disconnect(); }); } catch (e) {}
}

/* ---------- отправить дубль Николаю (mp3) ---------- */

function krLoadLame() {
  if (window.lamejs) return Promise.resolve();
  return new Promise(function (res, rej) {
    var s = document.createElement("script"); s.src = "vendor/lame.min.js?v=1"; s.onload = function () { res(); }; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function krRenderMix(t) {
  var sr = 44100, len = Math.ceil(t.dur * sr) + sr; // секунда на хвост ревера
  var oc = new OfflineAudioContext(2, len, sr);
  var out = oc.createGain(); out.connect(oc.destination);
  var vs = oc.createBufferSource(); vs.buffer = t.voice;
  krChain(oc, vs, out, KREC.amt, krBpm());
  var ts = oc.createBufferSource(); ts.buffer = t.tb;
  var tg = oc.createGain(); tg.gain.value = 0.8; ts.connect(tg); tg.connect(out);
  vs.start(0); ts.start(0, t.p0 / t.rate, t.dur);
  return oc.startRendering();
}

function krEncodeMp3(buf) {
  var enc = new lamejs.Mp3Encoder(2, buf.sampleRate, 128), L = buf.getChannelData(0), R = buf.getChannelData(1);
  var parts = [], blk = 1152, li = new Int16Array(blk), ri = new Int16Array(blk), peak = 0, i;
  for (i = 0; i < L.length; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  var g = peak > 0.98 ? 0.98 / peak : 1; // без перегруза
  for (i = 0; i < L.length; i += blk) {
    var n = Math.min(blk, L.length - i);
    for (var k = 0; k < n; k++) { li[k] = Math.max(-32768, Math.min(32767, L[i + k] * g * 32767)); ri[k] = Math.max(-32768, Math.min(32767, R[i + k] * g * 32767)); }
    var mp = enc.encodeBuffer(li.subarray(0, n), ri.subarray(0, n));
    if (mp.length) parts.push(new Uint8Array(mp));
  }
  var end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: "audio/mpeg" });
}

function krSendTake(onState) {
  var t = KREC.take; if (!t) return;
  onState("render");
  krLoadLame().then(function () { return krRenderMix(t); }).then(function (mix) {
    var blob = krEncodeMp3(mix);
    if (blob.size > 4.3 * 1024 * 1024) { onState("big"); return; }
    var s = t.song || {};
    var f = baseSubmitFields();
    f.append("kind", "karaoke-take");
    f.append("note", "«" + (s.title || "Песня") + "»" + (s.artist ? " — " + s.artist : "") + " · с " + karFmt(t.p0) + " · " + karFmt(t.dur) +
      (KE && (KE.pitch || KE.tempo !== 100) ? " · тон " + karSign(KE.pitch) + ", темп " + Math.round(KE.tempo) + "%" : "") +
      " · обработка " + Math.round(KREC.amt * 100) + "%");
    f.append("file", blob, ((s.title || "dubl").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40) || "dubl") + ".mp3");
    onState("send");
    return fetch("/api/submit", { method: "POST", body: f })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) { if (d.ok) { t.sent = true; onState("sent"); } else onState("error"); });
  }).catch(function () { onState("error"); });
}

/* ==========================================================================
   ЭКРАНЫ (шторки поверх караоке)
   ========================================================================== */

function krSheet(cls) {
  var old = KP.root.querySelector(".ksheet");
  if (old) old.parentNode.removeChild(old);
  var d = document.createElement("div");
  d.className = "ksheet " + (cls || "");
  KP.root.appendChild(d);
  KP.sheet = d;
  var close = function () { if (d.parentNode) d.parentNode.removeChild(d); if (KP.sheet === d) KP.sheet = null; };
  wireSheetSwipe(d, function () { if (d._onClose) d._onClose(); close(); });
  d._close = close;
  return d;
}

// Чип «● Запись» → настройка наушников (если нужно) → «Перед записью»
function krOpen() {
  if (KE && KE.playing) karPause();
  if (KREC.take && !KREC.take.sent && KREC.take.song === KAR.song) { krOpenTake(); return; }
  krMicOpen().then(function () {
    if (!krCalibGet()) krOpenCalib(); else krOpenPrep();
  }).catch(function () { krOpenNoMic(); });
}

function krOpenNoMic() {
  var d = krSheet("krs");
  d.innerHTML = '<div class="t">Нет доступа к микрофону</div>' +
    '<div class="kr-p">Чтобы записать себя, разреши приложению микрофон: Telegram спросит об этом, когда нажмёшь «Попробовать ещё раз». Если не спрашивает — открой Настройки iPhone → Telegram → Микрофон.</div>' +
    '<div class="row kr-row"><div class="bt" data-k="x">Закрыть</div><div class="bt main" data-k="again">Попробовать ещё раз</div></div>';
  d.querySelector('[data-k="x"]').onclick = d._close;
  d.querySelector('[data-k="again"]').onclick = function () { d._close(); krOpen(); };
}

/* Настройка наушников — три шага, простыми словами */
function krOpenCalib(again) {
  var d = krSheet("krs");
  var bt = krIsBT();
  function intro(msg) {
    d.innerHTML = '<div class="t">Настроим наушники</div>' +
      '<div class="s">Один раз — телефон запомнит, на сколько опаздывает звук</div>' +
      (msg ? '<div class="kr-warn">' + msg + "</div>" : "") +
      '<div class="kr-steps">' +
        '<div class="kr-st"><b>1</b><span>Подключи наушники, в которых будешь петь</span></div>' +
        '<div class="kr-st"><b>2</b><span>Поднеси один наушник к низу телефона, где микрофон</span></div>' +
        '<div class="kr-st"><b>3</b><span>Нажми «Проверить» и не двигай его, пока звучат щелчки</span></div>' +
      "</div>" +
      '<div class="row kr-row"><div class="bt" data-k="x">Отмена</div><div class="bt main" data-k="go">Проверить</div></div>';
    d.querySelector('[data-k="x"]').onclick = function () { d._close(); krMicClose(); };
    d.querySelector('[data-k="go"]').onclick = run;
  }
  function run() {
    d.innerHTML = '<div class="t">Слушаю щелчки…</div><div class="s">Держи наушник у низа телефона</div>' +
      '<div class="kr-dots">' + new Array(KR_CLICKS + 1).join("<i></i>") + "</div>";
    var dots = d.querySelectorAll(".kr-dots i");
    krMicOpen().then(function () {
      return krMeasure(function (k) { if (dots[k]) dots[k].classList.add("on"); });
    }).then(function (r) {
      if (!d.parentNode) return;
      if (!r.ok) {
        intro(r.why === "quiet" ? "Телефон не услышал щелчки. Поднеси наушник прямо к низу телефона и сделай звук погромче."
          : "Мешал шум вокруг. Попробуй ещё раз в тишине и держи наушник неподвижно.");
        return;
      }
      bt = krIsBT();
      var mon = !bt; // в проводных слышать себя можно всегда; заметная задержка — ученик сам выключит
      krCalibSet({ l: r.l, mon: mon, bt: bt, at: Date.now() });
      var ms = Math.round(r.l * 1000);
      d.innerHTML = '<div class="t">Наушники настроены ✓</div>' +
        '<div class="kr-big">' + ms + ' <small>мс</small></div>' +
        '<div class="kr-p">' + (bt
          ? "Это беспроводные наушники: в них звук всегда опаздывает, поэтому свой голос в них не включаю — будет мешать. Вынь один наушник, чтобы слышать себя вживую. Запись всё равно ляжет точно в музыку."
          : (r.l <= KR_MON_MAX
            ? "Задержка маленькая — ты будешь слышать свой голос в наушниках с обработкой, как в студии. Запись ляжет точно в музыку."
            : "Ты будешь слышать свой голос в наушниках с обработкой, но с небольшим опозданием. Если мешает — выключи «Слышать себя» перед записью. Запись в любом случае ляжет точно в музыку.")) + "</div>" +
        '<div class="row kr-row"><div class="bt main" data-k="next">Дальше</div></div>';
      d.querySelector('[data-k="next"]').onclick = krOpenPrep;
    }).catch(function () { if (d.parentNode) { d._close(); krOpenNoMic(); } });
  }
  intro(again ? "" : "");
}

/* Перед записью: наушники, «Слышать себя», ползунок «Обработка», старт */
function krOpenPrep() {
  var d = krSheet("krs");
  var cal = krCalibGet() || {};
  if (KREC.monWant == null) KREC.monWant = true;
  function paint() {
    var monOk = !!cal.mon, pct = Math.round(KREC.amt * 100);
    d.innerHTML = '<div class="t">Запись</div>' +
      '<div class="kr-hp"><span>' + (cal.bt ? "Беспроводные наушники" : "Наушники") + " · " + Math.round((cal.l || 0) * 1000) + ' мс</span><b data-k="re">Проверить заново</b></div>' +
      '<div class="kr-sw' + (monOk ? "" : " off") + '" data-k="mon"><span>Слышать себя в наушниках</span><i class="' + (monOk && KREC.monWant ? "on" : "") + '"></i></div>' +
      (monOk ? "" : '<div class="kr-note">В этих наушниках голос опаздывает — вынь один наушник, чтобы слышать себя вживую</div>') +
      '<div class="kr-sl"><div class="kr-sl-t"><span>Обработка голоса</span><b>' + pct + '%</b></div>' +
        '<input type="range" min="0" max="100" step="1" value="' + pct + '" data-k="amt"></div>' +
      '<div class="kr-note">Сжатие, эхо и лёгкий объём, как в студии. Меньше — голос звучит суше</div>' +
      '<div class="row kr-row"><div class="bt" data-k="x">Отмена</div><div class="bt main kr-recbt" data-k="go"><i></i>Записать</div></div>';
    d.querySelector('[data-k="x"]').onclick = function () { d._close(); krMicClose(); };
    d.querySelector('[data-k="re"]').onclick = function () { krOpenCalib(true); };
    d.querySelector('[data-k="mon"]').onclick = function () {
      if (!monOk) { karToast(cal.bt ? "В беспроводных наушниках голос опаздывает — вынь один наушник" : "Задержка в этих наушниках слишком большая"); return; }
      KREC.monWant = !KREC.monWant; paint();
    };
    var sl = d.querySelector('[data-k="amt"]');
    sl.oninput = function () { KREC.amt = sl.value / 100; d.querySelector(".kr-sl-t b").textContent = sl.value + "%"; if (KREC.mon) KREC.mon.ch.set(KREC.amt); };
    sl.onchange = function () { krStore("kr-amt", String(KREC.amt)); };
    // попробовать звук: пока шторка открыта, голос уже слышен в наушниках
    d.querySelector('[data-k="go"]').onclick = function () { krMonOff(); d._close(); krStartRecording(); };
    if (monOk && KREC.monWant) krMonOn(); else krMonOff();
  }
  d._onClose = function () { krMicClose(); };
  paint();
}

/* Дубль готов */
function krOpenTake() {
  var d = krSheet("krs krtake");
  d._onClose = function () { krStopTake(); krMicClose(); karPaintLyrics(); };
  KREC.takeSheet = d;
  krPaintTake();
}
function krPaintTake(state) {
  var d = KREC.takeSheet, t = KREC.take;
  if (!d || !d.parentNode || !t) return;
  if (state) d._state = state;
  var st = d._state || "", playing = !!KREC.play;
  var msg = { render: "Свожу голос с музыкой…", send: "Отправляю Николаю…", sent: "Отправлено Николаю ✓", big: "Дубль слишком длинный для отправки — запиши кусок покороче (до 4 минут).", error: "Не отправилось. Проверь интернет и попробуй ещё раз." }[st] || "";
  d.innerHTML = '<div class="t">Дубль готов</div><div class="s">' + karFmt(t.dur) + " · с " + karFmt(t.p0) + "</div>" +
    '<div class="kr-play" data-k="play"><span class="kr-pbtn">' + (playing ? KAR_ICO.pause : KAR_ICO.play) + "</span>" + (playing ? "Пауза" : "Прослушать") + "</div>" +
    (msg ? '<div class="kr-msg' + (st === "error" || st === "big" ? " err" : "") + '">' + msg + "</div>" : "") +
    '<div class="row kr-row"><div class="bt" data-k="again">Записать заново</div><div class="bt main' + (st === "render" || st === "send" || t.sent ? " off" : "") + '" data-k="send">' + (t.sent ? "Отправлено ✓" : "Отправить Николаю") + "</div></div>" +
    '<div class="kr-link" data-k="done">Готово</div>';
  d.querySelector('[data-k="play"]').onclick = function () { if (KREC.play) { krStopTake(); krPaintTake(); karPaintLyrics(); } else krPlayTake(); };
  d.querySelector('[data-k="again"]').onclick = function () { krStopTake(); KREC.take = null; d._close(); krOpenPrep(); };
  d.querySelector('[data-k="send"]').onclick = function () { krStopTake(); krSendTake(function (s) { krPaintTake(s); }); };
  d.querySelector('[data-k="done"]').onclick = function () { krStopTake(); d._close(); krMicClose(); karPaintLyrics(); };
}

/* Нижняя панель, пока идёт запись */
function krPaintRecBar(box) {
  if (KP.recPrep) {
    box.innerHTML = '<div class="selbar"><div class="t">Готовлю минус…</div><div class="s">Пара секунд</div></div>';
    return;
  }
  box.innerHTML = '<div class="selbar kr-bar"><div class="kr-live"><i></i><span class="kr-time">0:00</span><span class="kr-cd"></span></div>' +
    '<div class="s">' + (KREC.mon ? "Ты слышишь себя в наушниках" : "Себя слышишь вживую — вынь один наушник") + "</div>" +
    '<div class="kr-stop" data-k="stop"><i></i></div></div>';
  box.querySelector('[data-k="stop"]').onclick = krStopRecording;
}

// раз в кадр из karTick: таймер и отсчёт
function krTickBar() {
  var r = KREC.rec; if (!r || !KP.root) return;
  var ctx = getAudioCtx(), el = KP.root.querySelector(".kr-time"), cd = KP.root.querySelector(".kr-cd");
  var dt = ctx.currentTime - r.T0;
  if (el) el.textContent = dt < 0 ? "0:00" : karFmt(dt);
  if (cd) cd.textContent = dt < 0 ? "Начинаем через " + Math.ceil(-dt) : "Запись";
}

window.krSongTime = krSongTime;
window.krTickBar = krTickBar;

// ушли с экрана караоке — запись и микрофон выключаем
function krLeave() {
  if (KREC.rec) { try { KREC.rec.src.onended = null; KREC.rec.src.stop(); } catch (e) {} KREC.rec = null; if (KREC.node) KREC.node.port.postMessage("stop"); }
  krStopTake();
  krMicClose();
  if (window.KP) { KP.recOn = false; KP.recPrep = false; }
}
window.krLeave = krLeave;
