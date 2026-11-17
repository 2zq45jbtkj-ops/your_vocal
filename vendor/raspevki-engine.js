/* Raspevki sound engine: synthesized piano + level-aware sequence builder + MIDI export.
   The piano voice is isolated in PianoVoice so it can be retuned or replaced by real samples
   (e.g. Nick's reference timbre) without touching the scheduler. */
(function (G) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- Piano voice ----------
  // Timbre knobs live here; once reference recordings arrive, tune these (or swap to samples).
  const TONE = {
    sampleStep: 3,          // one synthesized sample every N semitones, neighbours via playbackRate
    lowNote: 28, highNote: 91,
    strike: 0.13,           // hammer position along string (fraction) -> comb in spectrum
    rolloff: 0.85,          // partial amplitude ~ 1/n^rolloff
    brightHz: 5200,         // spectral tilt corner for a medium-hard strike
    detuneCents: [0, 0.55, -0.45],
    promptMix: 0.6,         // two-stage decay: share of the fast "prompt sound"
    hammer: 0.035,          // hammer knock noise level
    reverbSec: 1.9, wet: 0.2,
  };

  function synthNote(midi, sr) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = clamp(6.2 - (midi - 30) * 0.075, 1.6, 6.2);
    const len = Math.floor(dur * sr);
    const out = new Float32Array(len);
    const B = clamp(0.00009 * Math.pow(2, (midi - 48) / 13), 0.00003, 0.006);
    const tau0 = clamp(11 * Math.pow(2, -(midi - 33) / 15), 0.7, 11); // aftersound of fundamental
    const nyq = sr * 0.45;
    const maxN = Math.min(56, Math.floor(11000 / f0) + 2);
    let seed = (midi * 7919) % 2147483647;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 1; n <= maxN; n++) {
      const fn = n * f0 * Math.sqrt(1 + B * n * n);
      if (fn > nyq) break;
      let amp = Math.pow(Math.abs(Math.sin(Math.PI * n * TONE.strike)) + 0.04, 0.9) / Math.pow(n, TONE.rolloff);
      amp *= Math.exp(-fn / (TONE.brightHz + f0 * 1.2));
      if (n === 1 && midi < 48) amp *= 0.75;       // thin bass fundamentals like a real board
      if (amp < 1e-4) continue;
      const tauLong = tau0 / (1 + Math.pow(fn / 1300, 1.25));
      const tauShort = Math.max(0.03, tauLong * 0.16);
      const k1 = Math.exp(-1 / (tauShort * sr)), k2 = Math.exp(-1 / (tauLong * sr));
      const strings = midi < 34 ? 1 : (midi < 46 ? 2 : 3);
      for (let s = 0; s < strings; s++) {
        const cents = TONE.detuneCents[s] * (0.7 + 0.6 * rnd());
        const w = 2 * Math.PI * fn * Math.pow(2, cents / 1200) / sr;
        const c = Math.cos(w), sn = Math.sin(w);
        const ph = rnd() * 2 * Math.PI;
        let x = Math.cos(ph), y = Math.sin(ph);
        let e1 = amp * TONE.promptMix / strings, e2 = amp * (1 - TONE.promptMix) / strings;
        // short attack ramp (hammer contact ~2-4 ms) to avoid clicks
        const att = Math.floor(sr * (0.0015 + 0.002 * (midi < 60 ? 1 : 0.5)));
        for (let i = 0; i < len; i++) {
          const nx = x * c - y * sn; y = x * sn + y * c; x = nx;
          const env = e1 + e2; e1 *= k1; e2 *= k2;
          out[i] += (i < att ? i / att : 1) * env * y;
          if (env < 1e-6) break;
        }
        // renormalise oscillator drift
      }
    }
    // hammer knock: short low-passed noise burst + soundboard thump
    let lp = 0; const kn = Math.floor(sr * 0.03);
    const a = Math.exp(-2 * Math.PI * clamp(f0 * 6, 900, 5000) / sr);
    for (let i = 0; i < kn && i < len; i++) {
      const t = i / sr;
      lp = a * lp + (1 - a) * (rnd() * 2 - 1);
      out[i] += TONE.hammer * lp * Math.exp(-t / 0.006) + 0.02 * Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.04);
    }
    // loudness normalisation over the first 300 ms, mild treble lift (perceived evenness)
    let e = 0; const m = Math.min(len, Math.floor(sr * 0.3));
    for (let i = 0; i < m; i++) e += out[i] * out[i];
    const rms = Math.sqrt(e / m) || 1;
    const target = 0.16 * (1 + clamp((midi - 60) / 60, -0.15, 0.25));
    const g = target / rms;
    for (let i = 0; i < len; i++) out[i] *= g;
    // fade tail
    const ft = Math.floor(sr * 0.25);
    for (let i = 0; i < ft; i++) out[len - 1 - i] *= i / ft;
    return out;
  }

  function makeImpulse(ctx, sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0; let seed = 12345 + ch * 777;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        const t = i / sr, nz = seed / 2147483647 * 2 - 1;
        const cut = 0.55 - 0.45 * (t / sec);           // darker as it decays
        lp = lp + cut * (nz - lp);
        const pre = t < 0.012 ? 0 : 1;                 // small predelay
        d[i] = pre * lp * Math.exp(-t * 6.9 / sec) * (t < 0.08 ? 1.3 : 1);
      }
    }
    return buf;
  }

  class PianoVoice {
    constructor(ctx, dest) {
      this.ctx = ctx; this.samples = new Map(); this.active = new Set();
      this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
      const rev = ctx.createConvolver(); rev.buffer = makeImpulse(ctx, TONE.reverbSec);
      const wet = ctx.createGain(); wet.gain.value = TONE.wet;
      this.bus.connect(comp); this.bus.connect(rev); rev.connect(wet); wet.connect(comp);
      comp.connect(dest || ctx.destination);
    }
    anchors() { const a = []; for (let m = TONE.lowNote; m <= TONE.highNote + TONE.sampleStep; m += TONE.sampleStep) a.push(m); return a; }
    anchorFor(midi) { const st = TONE.sampleStep; return clamp(TONE.lowNote + Math.round((midi - TONE.lowNote) / st) * st, TONE.lowNote, TONE.highNote + st); }
    // build samples in small chunks so the page stays responsive; onProgress(0..1)
    prepare(onProgress) {
      const list = this.anchors().filter(m => !this.samples.has(m));
      const sr = Math.min(this.ctx.sampleRate, 32000);
      return new Promise(res => {
        let i = 0;
        const step = () => {
          const t = Date.now();
          while (i < list.length && Date.now() - t < 40) {
            const data = synthNote(list[i], sr);
            const b = this.ctx.createBuffer(1, data.length, sr); b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
            this.samples.set(list[i], b); i++;
          }
          onProgress && onProgress(list.length ? i / list.length : 1);
          if (i < list.length) setTimeout(step, 0); else res();
        };
        step();
      });
    }
    play(midi, when, dur, vel) {
      const ctx = this.ctx, a = this.anchorFor(midi), buf = this.samples.get(a);
      if (!buf) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (midi - a) / 12);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.value = 900 + 9000 * vel * vel; f.Q.value = 0.3;
      const g = ctx.createGain(); const lvl = 0.25 + 0.75 * vel;
      g.gain.setValueAtTime(lvl, when);
      const off = when + Math.max(0.05, dur);
      g.gain.setValueAtTime(lvl, off);
      g.gain.setTargetAtTime(0, off, 0.09);       // damper
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = clamp((midi - 62) / 40, -0.45, 0.45); }
      src.connect(f); f.connect(g); (p ? (g.connect(p), p) : g).connect(this.bus);
      src.start(when); src.stop(off + 0.8);
      const rec = { src, g }; this.active.add(rec); src.onended = () => this.active.delete(rec);
    }
    stopAll() {
      const now = this.ctx.currentTime;
      for (const r of this.active) { try { r.g.gain.cancelScheduledValues(now); r.g.gain.setTargetAtTime(0, now, 0.03); r.src.stop(now + 0.2); } catch (e) {} }
      this.active.clear();
    }
  }

  // ---------- Harmony helpers ----------
  const QUAL = { '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
    '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], '69': [0, 4, 7, 9, 14], 'sus4': [0, 5, 7], 'dim': [0, 3, 6], 'm7b5': [0, 3, 6, 10],
    'dim7': [0, 3, 6, 9], '9': [0, 4, 7, 10, 14], 'add9': [0, 4, 7, 14], 'm9': [0, 3, 7, 10, 14], '7sus4': [0, 5, 7, 10] };
  const NAMES_EN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NAMES_EN_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const RU_MAJ = ['до', 'ре-бемоль', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'ля-бемоль', 'ля', 'си-бемоль', 'си'];
  const RU_MIN = ['до', 'до-диез', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'соль-диез', 'ля', 'си-бемоль', 'си'];
  const pc = m => ((m % 12) + 12) % 12;
  const chordName = (rootMidi, q) => NAMES_EN_FLAT[pc(rootMidi)].replace('b', '♭') + (q === 'm7b5' ? 'm7♭5' : q);
  const keyNameRu = (tonic, mode) => (mode === 'min' ? RU_MIN : RU_MAJ)[pc(tonic)] + (mode === 'min' ? ' минор' : ' мажор');

  // close voicing of chord tones near a target centre, under a ceiling
  function voiceChord(root, q, centre) {
    const iv = QUAL[q] || QUAL[''];
    let best = null;
    for (let base = centre - 14; base <= centre + 2; base++) {
      if (pc(base) !== pc(root)) continue;
      for (let inv = 0; inv < iv.length; inv++) {
        const notes = iv.map((x, k) => base + x + (k < inv ? 12 : 0)).map(n => (n - base > 14 ? n - 12 : n)).sort((a, b) => a - b);
        const mid = (notes[0] + notes[notes.length - 1]) / 2;
        const spread = notes[notes.length - 1] - notes[0];
        const cost = Math.abs(mid - centre) + (spread > 12 ? 6 : 0);
        if (!best || cost < best.cost) best = { notes, cost };
      }
    }
    return best.notes;
  }
  const bassOf = root => { let b = root; while (b > 47) b -= 12; while (b < 35) b += 12; return b; };

  // ---------- Sequence builder ----------
  // ex: { bpm, beats(per bar), mode, start (MIDI tonic of first link), top, bottom?, step, dir:'updown'|'up'|'down',
  //       mel: [[semi|null, beats], ...] relative to tonic,
  //       ch: [[rootSemi, quality, beats], ...] relative to tonic (covers the link),
  //       pat: 'block'|'pulse'|'arp' }
  function keyList(ex, shift) {
    const hi = Math.max(...ex.mel.filter(n => n[0] != null).map(n => n[0]));
    const lo = Math.min(...ex.mel.filter(n => n[0] != null).map(n => n[0]));
    const s0 = ex.start + shift, top = ex.top + shift, step = ex.step || 1;
    const up = [];
    for (let t = s0; t + hi <= top; t += step) up.push(t);
    if (!up.length) up.push(s0);
    if (ex.dir === 'up') return up;
    if (ex.dir === 'down') { // start high, go down to bottom
      const bot = (ex.bottom != null ? ex.bottom : ex.start) + shift, down = [];
      for (let t = s0; t + lo >= bot; t -= step) down.push(t);
      return down.length ? down : [s0];
    }
    const down = up.slice(0, -1).reverse();
    return up.concat(down);
  }

  function linkBeats(ex) {
    const m = ex.mel.reduce((a, n) => a + n[1], 0);
    const bar = ex.beats || 4;
    return Math.ceil(m / bar) * bar;
  }

  // Harmony in Nick's style: only tonic (I) and dominant (V), chosen per half bar from the melody.
  function harmonyPlan(ex, L) {
    const seg = 2, n = Math.round(L / seg), out = [];
    const I = ex.mode === 'min' ? [0, 3, 7] : [0, 4, 7], V = [7, 11, 2, 5];
    for (let k = 0; k < n; k++) {
      let si = 0, sv = 0, any = false, t = 0;
      for (const [s, d] of ex.mel) {
        const a = Math.max(t, k * seg), b = Math.min(t + d, (k + 1) * seg);
        if (s != null && b > a) {
          any = true; const p = ((s % 12) + 12) % 12, w = b - a;
          if (I.includes(p)) si += w * (p === 0 ? 1.3 : 1);
          if (V.includes(p)) sv += w * (p === 7 ? 0.4 : 1);
        }
        t += d;
      }
      out.push(any ? (sv > si ? 'V' : 'I') : (out.length ? out[out.length - 1] : 'I'));
    }
    return out;
  }
  // Left hand: octave on the root, tonic octave lower note in A1..G#2; dominant a fourth below or fifth above, whichever is closer.
  function bassOct(tonic, fn) {
    let b = 36 + ((((tonic - 36) % 12) + 12) % 12);
    if (fn === 'V') { const up = b + 7, dn = b - 5; b = (dn >= 31 && b - dn <= up - b) ? dn : up; if (b > 48) b -= 12; }
    return [b, b + 12];
  }

  // ---------- Sequence builder ----------
  // Level 1: melody alone. Level 2: melody + left-hand bass octaves (I–V–I). Level 3: the melody is heard
  // in the first two repetitions as an ear cue, then only the bass octaves.
  function buildTimeline(ex, level, opts) {
    opts = opts || {};
    const shift = opts.shift || 0;
    const bar = ex.beats || 4, L = linkBeats(ex);
    const keys = keyList(ex, shift);
    const ev = [], marks = [];
    const VM = 0.8, VB = 0.5, VO = 0.4;
    const plan2 = harmonyPlan(ex, L);
    const oct = (tonic, fn, t, d, k) => {
      const [lo, hi] = bassOct(tonic, fn);
      ev.push({ t, d, m: lo, v: VB * (k || 1), part: 'b' });
      ev.push({ t, d, m: hi, v: VO * (k || 1), part: 'c' });
    };
    const addBass = (tonic, t0) => {
      // strike at each harmony change and at every bar line
      let k = 0;
      while (k < plan2.length) {
        let j = k + 1;
        while (j < plan2.length && plan2[j] === plan2[k] && (j * 2) % bar !== 0) j++;
        oct(tonic, plan2[k], t0 + k * 2, (j - k) * 2 * 0.97, (k * 2) % bar === 0 ? 1 : 0.85);
        k = j;
      }
    };
    const addMel = (tonic, t0, vel) => {
      let t = t0;
      for (const [s, d, art] of ex.mel) {
        if (s != null) ev.push({ t, d: art === 's' ? Math.min(d, 0.35) : d * 0.95, m: tonic + s, v: vel, part: 'm' });
        t += d;
      }
    };
    const firstNote = ex.mel.find(n => n[0] != null)[0];
    // Cue bar into key `to` («та-та»): two beats to breathe, then two short hits in the new key.
    // Hit 1: dominant bass octave; hit 2: tonic bass octave with the first melody note on top.
    // Level 1 (melody only): the first melody note twice. One function, easy to swap for Nick's exact cue.
    const addTransition = (to, t0) => {
      const h1 = t0 + bar - 2, h2 = t0 + bar - 1, cue = to + firstNote;
      if (level === 1) {
        ev.push({ t: h1, d: 0.8, m: cue, v: 0.5, part: 'm' });
        ev.push({ t: h2, d: 0.9, m: cue, v: 0.5, part: 'm' });
        return;
      }
      oct(to, 'V', h1, 0.8, 0.95);
      oct(to, 'I', h2, 0.9, 0.95);
      ev.push({ t: h2, d: 0.9, m: cue, v: level === 3 ? 0.35 : 0.45, part: 'm' });
    };
    const plan = [];
    if (level === 3) { plan.push({ key: keys[0], mel: true }, { key: keys[0], mel: true }); keys.slice(1).forEach(k => plan.push({ key: k, mel: false })); }
    else keys.forEach(k => plan.push({ key: k, mel: true }));
    let t = 0;
    addTransition(plan[0].key, t); t += bar;           // intro: the same «та-та» cue gives the first key
    plan.forEach((p, i) => {
      marks.push({ t, rep: i + 1, of: plan.length, key: p.key, withMel: p.mel });
      if (p.mel) addMel(p.key, t, VM);
      if (level >= 2) addBass(p.key, t);
      t += L;
      if (i < plan.length - 1) { addTransition(plan[i + 1].key, t); t += bar; }
    });
    if (level >= 2) oct(plan[plan.length - 1].key, 'I', t, 3, 0.85);
    t += 2;
    ev.sort((a, b) => a.t - b.t);
    return { events: ev, marks, total: t, keys };
  }

  // ---------- Player (lookahead scheduler) ----------
  class Player {
    constructor() { this.ctx = null; this.voice = null; this.state = 'idle'; this.timer = null; this.onTick = null; this.onEnd = null; }
    ensure() {
      if (!this.ctx) {
        const AC = G.AudioContext || G.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'playback' });
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
        this.voice = new PianoVoice(this.ctx);
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      return this.ctx;
    }
    async start(ex, level, opts, onPrep) {
      this.stop();
      this.ensure();
      const token = this.token = {};
      await this.voice.prepare(onPrep);
      if (token !== this.token) return;
      const tl = buildTimeline(ex, level, opts);
      const spb = 60 / (ex.bpm * ((opts && opts.tempo) || 1));
      this.tl = tl; this.spb = spb; this.t0 = this.ctx.currentTime + 0.12; this.idx = 0; this.state = 'playing';
      const tick = () => {
        if (token !== this.token) return;
        const now = this.ctx.currentTime, horizon = now + 0.35;
        while (this.idx < tl.events.length) {
          const e = tl.events[this.idx], at = this.t0 + e.t * spb;
          if (at > horizon) break;
          if (at >= now - 0.02) this.voice.play(e.m, Math.max(at, now), e.d * spb, e.v);
          this.idx++;
        }
        const beat = (now - this.t0) / spb;
        let mk = null; for (const m of tl.marks) if (m.t <= beat) mk = m;
        this.onTick && this.onTick({ beat, total: tl.total, mark: mk, marks: tl.marks });
        if (beat >= tl.total + 1) { this.stop(true); return; }
        this.timer = setTimeout(tick, 40);
      };
      tick();
    }
    stop(natural) {
      this.token = null; clearTimeout(this.timer); this.timer = null;
      if (this.voice) this.voice.stopAll();
      const was = this.state; this.state = 'idle';
      if (was === 'playing' && this.onEnd) this.onEnd(!!natural);
    }
  }

  // ---------- MIDI export (SMF type 1) ----------
  function toMidi(ex, level, opts, title) {
    const tl = buildTimeline(ex, level, opts), PPQ = 480;
    const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const str = s => Array.from(new TextEncoder().encode(s));
    const track = (evs, ch, name, extra) => {
      const raw = [];
      evs.forEach(e => { raw.push([Math.round(e.t * PPQ), 0x90 | ch, e.m, Math.round(clamp(e.v, 0.05, 1) * 110)]); raw.push([Math.round((e.t + e.d) * PPQ), 0x80 | ch, e.m, 0]); });
      raw.sort((a, b) => a[0] - b[0] || (a[1] & 0xf0) - (b[1] & 0xf0));
      const nm = str(name);
      let bytes = [0, 0xff, 0x03, ...vlq(nm.length), ...nm, ...(extra || []), 0, 0xc0 | ch, 0];
      let last = 0;
      raw.forEach(r => { bytes.push(...vlq(r[0] - last), r[1], r[2], r[3]); last = r[0]; });
      bytes.push(0, 0xff, 0x2f, 0);
      return [0x4d, 0x54, 0x72, 0x6b, (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes];
    };
    const usq = Math.round(60000000 / (ex.bpm * ((opts && opts.tempo) || 1)));
    const tempoMeta = [0xff, 0x51, 0x03, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255, 0, 0xff, 0x58, 0x04, ex.beats || 4, 2, 24, 8];
    const mel = tl.events.filter(e => e.part === 'm'), acc = tl.events.filter(e => e.part !== 'm');
    const tracks = [track(mel, 0, title || 'Мелодия', tempoMeta)];
    if (acc.length) tracks.push(track(acc, 1, 'Аккорды'));
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return new Uint8Array(head.concat(...tracks));
  }

  G.Raspevki = { harmonyPlan, bassOct, TONE, synthNote, PianoVoice, Player, buildTimeline, keyList, linkBeats, toMidi, voiceChord, chordName, keyNameRu, QUAL, NAMES_EN };
})(typeof window !== 'undefined' ? window : globalThis);
