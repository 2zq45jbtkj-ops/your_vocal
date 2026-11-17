/* ==========================================================================
   КАРАОКЕ (вариант A, выбран Николаем 17.11) + окно «Наушники».

   Песни не заводятся здесь второй раз: это песни из «Репертуара» ученика на
   сайте baza-dannih (минус, текст, тайминг строк lyricTimes, тональность и
   темп по умолчанию). Ученик получает их по своему коду доступа
   (player-tracks?action=auth → сессия на 12 часов), Николай — по своему
   токену преподавателя (X-Site-Auth). Пометки V / v и подсказки лежат у нас,
   в api/karaoke.js.

   Экраны (state.screen):
     karaoke              — список песен (из Кабинета)
     karaoke-play         — плеер на весь экран: свечение под матовым стеклом,
                            текущая строка целиком белая, повтор строк
     admin-karaoke        — Николай: выбор ученика
     admin-karaoke-songs  — Николай: выбор песни
     admin-karaoke-edit   — Николай: «Разметка караоке»
   ========================================================================== */

var KAR = {
  session: null, sessFor: null, sessAt: 0,
  songs: null, songsErr: null, marks: {},
  song: null,
  showMarks: true,
  hp: null,          // ответ про наушники в этом сеансе: "yes" | "no"
  adm: { student: null, songs: null, songsErr: null, song: null }
};

/* ---------- общие мелочи ---------- */

function karFmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
}
function karFmtTenth(sec) {
  if (sec == null || !isFinite(sec)) return "—";
  var m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
}
function karSign(n) { return n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0"; }

var KAR_ICO = {
  play: '<svg width="22" height="24" viewBox="0 0 12 14"><path d="M1.5 1l10 6-10 6V1z" fill="oklch(30% 0.02 50)"/></svg>',
  pause: '<svg width="18" height="20" viewBox="0 0 18 20"><rect x="2" y="1" width="5" height="18" rx="1.5" fill="oklch(30% 0.02 50)"/><rect x="11" y="1" width="5" height="18" rx="1.5" fill="oklch(30% 0.02 50)"/></svg>',
  loop: function (c) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M17 2l3 3-3 3" stroke="' + c + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3" stroke="' + c + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 13v2a4 4 0 0 1-4 4H4" stroke="' + c + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  },
  back: '<svg width="11" height="18" viewBox="0 0 11 18" fill="none"><path d="M9 1L2 9l7 8" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  note: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.9"/><circle cx="17" cy="16" r="3" stroke="currentColor" stroke-width="1.9"/></svg>',
  hp: function (c) {
    return '<svg width="58" height="58" viewBox="0 0 24 24" fill="none"><path d="M4 14v-2a8 8 0 0 1 16 0v2" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/><rect x="3" y="13.5" width="4.5" height="7" rx="2" stroke="' + c + '" stroke-width="1.7"/><rect x="16.5" y="13.5" width="4.5" height="7" rx="2" stroke="' + c + '" stroke-width="1.7"/></svg>';
  },
  speaker: function (c) {
    return '<svg width="58" height="58" viewBox="0 0 24 24" fill="none"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" stroke="' + c + '" stroke-width="1.7" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }
};

/* ==========================================================================
   НАУШНИКИ — общее окно для караоке и питча (решение Николая 17.11:
   ученик сам отмечает; без наушников — только с галочкой согласия).
   Ответ помним до закрытия приложения.
   ========================================================================== */

function hpGate(kind, onGo) {
  if (KAR.hp) { onGo(); return; }
  var why = kind === "pitch"
    ? "Так микрофон слышит только твой голос, без музыки, и проверка получится точной."
    : "В наушниках музыка не заглушает твой голос, и петь получается точнее.";
  var wrap = document.createElement("div");
  wrap.className = "hp-dim";
  document.body.appendChild(wrap);
  function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });

  function step1() {
    wrap.innerHTML =
      '<div class="hp-sheet"><div class="hp-grab"></div>' +
        '<div class="hp-ill">' + KAR_ICO.hp("var(--terra)") + "</div>" +
        "<h3>Надень наушники</h3><p>" + why + "</p>" +
        '<button class="hp-b1" data-hp="yes">Наушники подключены</button>' +
        '<button class="hp-b2" data-hp="no">Пою без наушников</button>' +
      "</div>";
    wrap.querySelector('[data-hp="yes"]').onclick = function () { KAR.hp = "yes"; close(); onGo(); };
    wrap.querySelector('[data-hp="no"]').onclick = step2;
  }
  function step2() {
    var ticked = false;
    wrap.innerHTML =
      '<div class="hp-sheet"><div class="hp-grab"></div>' +
        '<div class="hp-ill">' + KAR_ICO.speaker("var(--terra)") + "</div>" +
        "<h3>Без наушников</h3>" +
        "<p>Петь можно, но музыка из динамика будет мешать, и результат получится хуже.</p>" +
        '<div class="hp-chk" data-hp="tick"><div class="bx"></div><p>Понимаю, что без наушников результат будет хуже по качеству</p></div>' +
        '<button class="hp-b1 off" data-hp="go">Петь без наушников</button>' +
        '<button class="hp-b2" data-hp="back">Подключу наушники</button>' +
      "</div>";
    var chk = wrap.querySelector('[data-hp="tick"]');
    var go = wrap.querySelector('[data-hp="go"]');
    chk.onclick = function () {
      ticked = !ticked;
      chk.classList.toggle("on", ticked);
      chk.querySelector(".bx").textContent = ticked ? "✓" : "";
      go.classList.toggle("off", !ticked);
    };
    go.onclick = function () { if (!ticked) return; KAR.hp = "no"; close(); onGo(); };
    wrap.querySelector('[data-hp="back"]').onclick = step1;
  }
  step1();
}
window.hpGate = hpGate;

/* ==========================================================================
   ДАННЫЕ УЧЕНИКА
   ========================================================================== */

function karSession() {
  var tok = state.accessToken;
  if (!tok) return Promise.reject(new Error("no-token"));
  if (KAR.session && KAR.sessFor === tok && Date.now() - KAR.sessAt < 11 * 3600 * 1000) return Promise.resolve(KAR.session);
  return fetch(BAZA_API + "/api/player-tracks?action=auth", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: tok })
  }).then(function (r) {
    if (!r.ok) throw new Error("auth " + r.status);
    return r.json();
  }).then(function (d) {
    KAR.session = d.session; KAR.sessFor = tok; KAR.sessAt = Date.now();
    return d.session;
  });
}

/* Список песен ученика. Старый список показываем сразу, но при каждом входе
   на экран перечитываем его с базы: иначе песня, которую Николай только что
   добавил (через «Разметку караоке» или с другого устройства), не появлялась
   до перезапуска приложения (17.11). */
function karLoadSongs(force) {
  if (KAR.loading) return;
  var tok = state.accessToken;
  var have = KAR.songsFor === tok && Array.isArray(KAR.songs);
  if (have && !force) return;
  KAR.loading = true; KAR.songsErr = null;
  if (!have) { KAR.songs = "loading"; KAR.songsFor = tok; }
  var before = have ? karSongsKey(KAR.songs) : null;
  karSession().then(function (sess) {
    var h = { "X-Player-Session": sess };
    return Promise.all([
      fetch(BAZA_API + "/api/player-tracks", { headers: h }).then(function (r) { if (!r.ok) throw new Error("songs " + r.status); return r.json(); }),
      fetch("/api/karaoke", { headers: h }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]);
  }).then(function (res) {
    KAR.loading = false;
    if (state.accessToken !== tok) return;
    var all = (res[0] && res[0].songs) || [];
    var songs = all.filter(function (s) { return s.music && s.music.url; });
    // Николаю видны и песни, где ещё нет минуса (ученику — нет): иначе
    // песня с текстом и плюсом «пропадала» из Караоке, хотя в базе была (17.11).
    KAR.drafts = all.filter(function (s) {
      return !(s.music && s.music.url) && ((s.lyrics || "").trim() || (s.voice && s.voice.url) || (s.title && s.title !== "Новая песня"));
    });
    KAR.songs = songs; KAR.songsFor = tok; KAR.loadedAt = Date.now();
    KAR.marks = (res[1] && res[1].marks) || {};
    KAR.meta = (res[1] && res[1].meta) || {};
    if (state.screen === "karaoke" && karSongsKey(songs) !== before) { KAR.justLoaded = true; render(); }
  }).catch(function () {
    KAR.loading = false;
    if (state.accessToken !== tok) return;
    if (have) return; // старый список остаётся на экране
    KAR.songs = null; KAR.songsErr = true;
    if (state.screen === "karaoke") { KAR.justLoaded = true; render(); }
  });
}

/* Изменить уже загруженную песню — вариант C (выбран Николаем 17.11): удерживаешь
   песню в списке Караоке, снизу «Петь» или «Изменить песню». Только Николаю.
   «Изменить песню» открывает экран песни (название, плюс, минус, текст, разметка). */
function karWireSongMenu(el) {
  var t = 0, x = 0, y = 0;
  function cancel() { clearTimeout(t); t = 0; }
  el.addEventListener("pointerdown", function (e) {
    x = e.clientX; y = e.clientY; el._lp = false;
    cancel();
    t = setTimeout(function () { t = 0; el._lp = true; karSongMenu(el); }, 500);
  });
  el.addEventListener("pointermove", function (e) { if (t && Math.hypot(e.clientX - x, e.clientY - y) > 8) cancel(); });
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}

function karSongMenu(el) {
  var song = KAR.songs[parseInt(el.getAttribute("data-kar-song"), 10)];
  if (!song) return;
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  var shade = document.createElement("div"); shade.className = "kshade";
  var menu = document.createElement("div"); menu.className = "kmenu";
  menu.innerHTML = '<div data-km="sing">▶︎&nbsp; Петь</div><div data-km="edit">✎&nbsp; Изменить песню</div>';
  el.classList.add("kup");
  document.body.appendChild(shade); document.body.appendChild(menu);
  function close() {
    el.classList.remove("kup");
    [shade, menu].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  }
  shade.addEventListener("click", close);
  menu.querySelector('[data-km="sing"]').onclick = function () {
    close();
    KAR.song = song; KAR.fromAdmEdit = false; KAR.startK = null; KAR.tapMode = false;
    go("karaoke-play");
  };
  menu.querySelector('[data-km="edit"]').onclick = function () {
    close();
    var tok = state.accessToken;
    var st = (state.adminStudentsList || []).filter(function (x) { return x && x.telegramToken && x.telegramToken === tok; })[0];
    KAR.adm.student = { id: song.studentId || (st && st.id), name: st ? st.name : (state.studentPublicData && state.studentPublicData.student && state.studentPublicData.student.name) || "" };
    KAR.adm.songs = null; KAR.adm.fromKar = true; KAR.adm.song = song; KAR.songs = null;
    go("admin-karaoke-edit");
  };
}

function karSongsKey(list) {
  return JSON.stringify((KAR.drafts || []).map(function (s) { return [s.id, s.title, (s.lyrics || "").length, s.voice && s.voice.url]; })) + JSON.stringify((list || []).map(function (s) { return [s.id, s.title, s.artist, s.music && s.music.url, (s.lyrics || "").length, (s.lyricTimes || []).length]; }));
}

/* Строки песни: пустые строки текста — граница куплета, в списке их нет,
   но индекс i у каждой строки — её номер в исходном тексте (как в lyricTimes). */
function karBuildLines(song, marks) {
  var raw = String(song.lyrics || "").replace(/\r/g, "").split("\n");
  var times = {};
  (song.lyricTimes || []).forEach(function (m) {
    var line = raw[m.i];
    if (line == null) return;
    if (m.text && m.text.trim() && m.text.trim() !== line.trim()) return; // текст поменяли — тайминг этой строки устарел
    times[m.i] = Number(m.t);
  });
  var ml = (marks && marks.lines) || {};
  var out = [], blank = false;
  raw.forEach(function (txt, i) {
    if (!txt.trim()) { blank = out.length > 0; return; }
    var m = ml[i];
    if (m && m.text && m.text.trim() !== txt.trim()) m = null;
    out.push({ i: i, text: txt.trim(), t: times[i], mk: (m && m.mk) || {}, hint: (m && m.hint) || "", gap: blank });
    blank = false;
  });
  return out;
}

function karLineHtml(l, withMarks) {
  var words = l.text.split(/\s+/);
  var h = "";
  for (var k = 0; k <= words.length; k++) {
    if (withMarks && l.mk[k]) h += '<span class="mk">' + l.mk[k] + "</span>";
    if (k < words.length) h += esc(words[k]) + (k < words.length - 1 ? " " : "");
  }
  if (withMarks && l.hint) h += '<br><span class="ktag">' + esc(l.hint) + "</span>";
  return h;
}

/* ==========================================================================
   ЭКРАН «КАРАОКЕ» — список песен
   ========================================================================== */

function renderKaraokeList() {
  // перечитать при каждом заходе; не перечитывать только когда экран
  // перерисован самим ответом базы
  var force = !KAR.justLoaded; KAR.justLoaded = false;
  karLoadSongs(force);
  var body;
  if (KAR.songs === "loading" || (KAR.songs == null && !KAR.songsErr)) {
    body = '<div class="instruction-note">Загружаю песни…</div>';
  } else if (KAR.songsErr) {
    body = '<div class="instruction-note">Не получилось загрузить песни. Проверь интернет и открой экран ещё раз.</div>';
  } else if (!KAR.songs.length && !(state.isAdmin && (KAR.drafts || []).length)) {
    body = '<div class="instruction-note">Здесь появятся песни, над которыми ты работаешь с Николаем, когда он добавит к ним минус.</div>';
  } else {
    body = '<div class="kar-list">' + KAR.songs.map(function (s, k) {
      var timed = (s.lyricTimes || []).length > 0;
      var sub = [s.artist, !s.lyrics ? "без текста" : timed ? "" : "текст без подсветки строк"].filter(Boolean).join(" · ");
      return '<div class="kar-song" data-kar-song="' + k + '"><div class="kar-ic">' + KAR_ICO.note + "</div>" +
        '<div style="flex:1;min-width:0;"><b>' + esc(s.title || "Песня") + "</b>" + (sub ? '<div class="kar-sub">' + esc(sub) + "</div>" : "") + "</div>" +
        '<div class="cab-chev">›</div></div>';
    }).join("") + (state.isAdmin ? (KAR.drafts || []).map(function (s, k) {
      var n = String(s.lyrics || "").split("\n").filter(function (x) { return x.trim(); }).length;
      var sub = ["нет минуса — ученик её пока не видит", s.voice && s.voice.url ? "плюс ✓" : "", n ? "текст ✓" : ""].filter(Boolean).join(" · ");
      return '<div class="kar-song" data-kar-draft="' + k + '"><div class="kar-ic">' + KAR_ICO.note + "</div>" +
        '<div style="flex:1;min-width:0;"><b>' + esc(s.title || "Песня") + "</b>" + '<div class="kar-sub">' + esc(sub) + "</div></div>" +
        '<div class="cab-chev">›</div></div>';
    }).join("") : "") + "</div>";
  }
  // Николай смотрит кабинет ученика (или свой) — отсюда же добавляет песни
  // этому ученику, без захода в «Ещё → Разметка караоке».
  // Значок на телефоне открывается по личной ссылке как ученик (своя карточка
  // Николая) — там тоже есть «+ Новая песня»: один раз просит ключи админа и
  // возвращает сюда уже в режиме админа.
  var spName = String((state.studentPublicData && state.studentPublicData.student && state.studentPublicData.student.name) || (state.firstName || "") + " " + (state.lastName || "")).toLowerCase();
  var ownCard = !state.isAdmin && ((spName.indexOf("септ") !== -1 && spName.indexOf("никола") !== -1) || (spName.indexOf("sept") !== -1 && spName.indexOf("nikola") !== -1));
  var admAdd = (state.isAdmin || ownCard) ? '<button class="cta" data-kar-adm-add style="margin-top:14px;">+ Новая песня</button>' : "";
  app.innerHTML = '<div style="padding:var(--screen-top) 20px 130px;">' + cabBack() +
    '<div class="cab-screen-title">Караоке</div>' + body + admAdd + "</div>";
  wireActs();
  var addBtn = app.querySelector("[data-kar-adm-add]");
  if (addBtn) addBtn.addEventListener("click", function () {
    if (!state.isAdmin) {
      // Своя карточка Николая: входим админом по его личной ссылке, без ключей.
      // Ключи спрашиваем, только если сервер ссылку не признал.
      var askKeys = function () {
        state._afterAdminLogin = "karaoke";
        state._tokenInput = ""; state._adminKey2 = ""; state._tokenError = "";
        go("token-entry");
      };
      addBtn.disabled = true; addBtn.textContent = "Открываю…";
      fetch(BAZA_API + "/api/admin-auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkToken: state.accessToken || "" })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!(d && d.ok && d.token)) { askKeys(); return; }
        state.isAdmin = true; state._siteAuth = d.token;
        saveAdminKey(d.token); saveState();
        state._goKaraoke = "new";
        openOwnCabinet();
      }).catch(askKeys);
      return;
    }
    var tok = state.accessToken;
    var st = (state.adminStudentsList || []).filter(function (x) { return x && x.telegramToken && x.telegramToken === tok; })[0];
    KAR.songs = null; // после разметки список ученика перечитается
    if (!st) { go("admin-karaoke"); return; }
    karNewSong(st, addBtn);
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-kar-draft]"), function (el) {
    el.addEventListener("click", function () {
      var d = KAR.drafts[parseInt(el.getAttribute("data-kar-draft"), 10)];
      var tok = state.accessToken;
      var st = (state.adminStudentsList || []).filter(function (x) { return x && x.telegramToken && x.telegramToken === tok; })[0];
      KAR.adm.student = { id: d.studentId || (st && st.id), name: st ? st.name : "" };
      KAR.adm.songs = null; KAR.adm.fromKar = true; KAR.adm.song = d; KAR.songs = null;
      go("admin-karaoke-edit");
    });
  });
  Array.prototype.forEach.call(app.querySelectorAll("[data-kar-song]"), function (el) {
    if (state.isAdmin) karWireSongMenu(el);
    el.addEventListener("click", function () {
      if (el._lp) { el._lp = false; return; }
      KAR.song = KAR.songs[parseInt(el.getAttribute("data-kar-song"), 10)];
      KAR.fromAdmEdit = false; KAR.startK = null; KAR.tapMode = false;
      go("karaoke-play");
    });
  });
}

/* ==========================================================================
   ДВИЖОК ВОСПРОИЗВЕДЕНИЯ
   Тональность 0 — обычный <audio> (темп через playbackRate без смены высоты).
   Тональность ≠ 0 — SoundTouch, как в распевках (loadSoundTouch из app.js).
   ========================================================================== */

var KE = null;

function karEngineNew(song) {
  karEngineStop();
  var el = new Audio();
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  el.src = song.music.url;
  try { el.preservesPitch = true; el.webkitPreservesPitch = true; } catch (e) {}
  KE = {
    el: el, song: song, playing: false, busy: false,
    pitch: Math.max(-6, Math.min(6, Math.round(Number(song.pitchSemitones) || 0))),
    tempo: Math.max(70, Math.min(120, Number(song.tempoPct) || 100)),
    dur: Number(song.music.durationSec) || 0,
    shifter: null, buf: null, bufP: null, pos: 0, posAt: 0, gen: 0,
    voice: false,  // «С голосом»: играет плюс (голос Николая) вместо минуса
    meta: karMetaFor(song)  // темп (BPM) и тональность минуса, если уже определены
  };
  el.playbackRate = KE.tempo / 100;
  el.addEventListener("loadedmetadata", function () { if (KE && KE.el === el && el.duration && isFinite(el.duration)) KE.dur = el.duration; });
  el.addEventListener("ended", function () { if (KE && KE.el === el) karOnEnded(); });
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
  return KE;
}

function karEngineStop() {
  if (!KE) return;
  try { KE.el.pause(); } catch (e) {}
  karKillShifter();
  KE.playing = false;
}

function karKillShifter() {
  if (KE && KE.shifter) { try { KE.shifter.disconnect(); } catch (e) {} KE.shifter = null; }
}

function karTime() {
  if (!KE) return 0;
  if (KE.pitch === 0) return KE.el.currentTime || 0;
  if (KE.playing && KE.shifter) {
    var ctx = getAudioCtx();
    return Math.min(KE.dur || 1e9, KE.pos + Math.max(0, ctx.currentTime - KE.posAt) * KE.tempo / 100);
  }
  return KE.pos;
}

function karDecode() {
  if (KE.buf) return Promise.resolve(KE.buf);
  if (!KE.bufP) {
    var url = karSrcUrl();
    KE.bufP = fetch(url).then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { return getAudioCtx().decodeAudioData(ab); })
      .then(function (b) { if (KE && karSrcUrl() === url) KE.buf = b; return b; })
      .catch(function (e) { if (KE) KE.bufP = null; throw e; });
  }
  return KE.bufP;
}

function karStartShifted(t) {
  var gen = ++KE.gen;
  KE.busy = true; karPaintPlay();
  return karDecode().then(function (buf) {
    return loadSoundTouch().then(function (mod) {
      if (!KE || KE.gen !== gen) return;
      karKillShifter();
      var ctx = getAudioCtx();
      var sh = new mod.PitchShifter(ctx, buf, 4096, function () { if (KE && KE.gen === gen) karOnEnded(); });
      sh.tempo = KE.tempo / 100;
      sh.pitchSemitones = KE.pitch;
      KE.dur = buf.duration;
      sh.percentagePlayed = Math.max(0, Math.min(0.999, t / buf.duration));
      KE.pos = t; KE.posAt = ctx.currentTime;
      sh.on("play", function (d) { if (KE && KE.gen === gen) { KE.pos = d.timePlayed; KE.posAt = ctx.currentTime; } });
      sh.connect(ctx.destination);
      KE.shifter = sh;
      KE.busy = false; KE.playing = true; karPaintPlay();
    });
  }).catch(function () {
    if (!KE || KE.gen !== gen) return;
    // минус не удалось разобрать на этом телефоне — играем без сдвига тональности
    KE.busy = false; KE.pitch = 0; karPaintChips();
    KE.el.currentTime = t; karNativePlay();
  });
}

function karSrcUrl() {
  return KE.voice && KE.song.voice && KE.song.voice.url ? KE.song.voice.url : KE.song.music.url;
}

/* «С голосом» вкл/выкл (вариант B, выбран Николаем 17.11): та же позиция,
   тональность и темп, меняется только дорожка — плюс или минус. */
function karSetVoice(on) {
  if (!KE || KE.voice === on) return;
  var t = karTime(), was = KE.playing || KE.busy;
  karPause();
  KE.voice = on;
  KE.buf = null; KE.bufP = null;
  var el = KE.el;
  el.src = karSrcUrl();
  el.playbackRate = KE.tempo / 100;
  KE.pos = t;
  karPaintChips();
  if (KE.pitch === 0) {
    var started = false;
    var go2 = function () {
      if (!KE || KE.el !== el || KE.voice !== on) return;
      if (Math.abs((el.currentTime || 0) - t) > 0.3) { try { el.currentTime = t; } catch (e) {} }
      // если файл ещё нельзя перематывать, повторим на следующем событии загрузки
      if (Math.abs((el.currentTime || 0) - t) > 0.3 && !el.seekable.length) return;
      ["loadedmetadata", "canplay", "canplaythrough"].forEach(function (ev) { el.removeEventListener(ev, go2); });
      el.playbackRate = KE.tempo / 100;
      if (was && !started) { started = true; karNativePlay(); }
    };
    ["loadedmetadata", "canplay", "canplaythrough"].forEach(function (ev) { el.addEventListener(ev, go2); });
    el.load(); // новая дорожка: позицию ставим, когда она загрузится
  } else if (was) karStartShifted(t);
}

function karNativePlay() {
  var p = KE.el.play();
  KE.playing = true; karPaintPlay();
  if (p && p.catch) p.catch(function () { KE.playing = false; karPaintPlay(); });
}

function karPlay() {
  if (!KE || KE.playing || KE.busy) return;
  var t = karTime();
  if (KE.dur && t >= KE.dur - 0.2) t = 0;
  if (KE.pitch === 0) { if (Math.abs(KE.el.currentTime - t) > 0.05) KE.el.currentTime = t; karNativePlay(); }
  else karStartShifted(t);
}

function karPause() {
  if (!KE) return;
  var t = karTime();
  KE.gen++;
  if (KE.pitch === 0) KE.el.pause();
  else { karKillShifter(); KE.pos = t; }
  KE.playing = false; KE.busy = false; karPaintPlay();
}

function karSeek(t) {
  if (!KE) return;
  t = Math.max(0, Math.min((KE.dur || t + 1) - 0.05, t));
  if (KE.pitch === 0) { KE.el.currentTime = t; }
  else {
    KE.pos = t;
    if (KE.playing) { KE.playing = false; karKillShifter(); karStartShifted(t); }
  }
  karTick(true);
}

function karSetPitch(n) {
  var t = karTime(), was = KE.playing;
  if (was) karPause();
  KE.pitch = n;
  if (n === 0) { karKillShifter(); KE.el.currentTime = t; }
  else { KE.pos = t; KE.el.pause(); }
  karPaintChips();
  if (was) karPlay();
}

function karSetTempo(p) {
  KE.tempo = p;
  KE.el.playbackRate = p / 100;
  if (KE.shifter) { KE.pos = karTime(); KE.posAt = getAudioCtx().currentTime; KE.shifter.tempo = p / 100; }
  karPaintChips();
}

function karOnEnded() {
  if (!KE) return;
  if (KP.loop) { karSeek(KP.loop.s); KP.loop.lap++; karPaintLoopChip(); if (!KE.playing) karPlay(); return; }
  karKillShifter();
  KE.playing = false; KE.pos = 0;
  try { KE.el.pause(); KE.el.currentTime = 0; } catch (e) {}
  karPaintPlay(); karTick(true);
}

/* ==========================================================================
   ЭКРАН ПЛЕЕРА
   ========================================================================== */

var KP = { root: null, lines: [], cur: -2, sel: null, loop: null, raf: 0, env: null, envStep: 0.05, glow: 0, pulse: 0, lastE: 0, sheet: null };
var KAR_BARS = 58;

function renderKaraokePlay() {
  var s = KAR.song;
  if (!s) { go("karaoke"); return; }
  karEngineNew(s);
  // Разметка строк (Николай, 17.11): тот же экран караоке, строки — общие с
  // редактором, тап ставит время строке. Тон и темп родные, чтобы время было точным.
  KP.tap = !!(KAR.tapMode && KAE && KAE.song === s);
  if (KP.tap) { KE.pitch = 0; KE.tempo = 100; KE.el.playbackRate = 1; }
  KP.lines = KP.tap ? KAE.lines : karBuildLines(s, KAR.marks[s.id]);
  KP.cur = -2; KP.sel = null; KP.loop = null; KP.sheet = null; KP.env = null;
  var timed = KP.tap || KP.lines.some(function (l) { return l.t != null; });
  KP.timed = timed;

  app.innerHTML =
    '<div class="kp">' +
      '<div class="amb"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div><div class="frost"></div>' +
      '<div class="hd">' +
        (BROWSER_MODE ? '<div class="kback" data-kp="back">' + KAR_ICO.back + "</div>" : "") +
        '<div style="min-width:0"><div class="tt">' + esc(s.title || "Песня") + '</div><div class="ts">' + esc((s.artist ? s.artist + " · " : "") + "караоке") + "</div></div>" +
      "</div>" +
      '<div class="khint" style="display:none">Отметь строки, которые хочешь повторять</div>' +
      '<div class="lyr"><div class="lyr-in"></div></div>' +
      '<div class="kbottom"></div>' +
    "</div>";
  KP.root = app.querySelector(".kp");
  karPaintLyrics();
  karPaintBottom();
  var back = KP.root.querySelector('[data-kp="back"]');
  if (back) back.onclick = function () { handleBack(); };
  karPrepareEnvelope();
  cancelAnimationFrame(KP.raf);
  KP.raf = requestAnimationFrame(karLoop);
  if (KAR.startK != null) {
    var st = KP.lines[KAR.startK];
    KAR.startK = null;
    if (st && st.t != null) karSeek(st.t); // ровно на строку, чтобы она сразу подсветилась
  }
  if (KP.tap && KAR.tapStart != null) {
    var t0 = KAR.tapStart; KAR.tapStart = null;
    karSeek(t0); karPlay();
  }
}

function karPaintLyrics() {
  var inner = KP.root.querySelector(".lyr-in");
  var selMode = !!KP.sel;
  var h = "";
  if (!KP.lines.length) {
    h = '<div class="knote">У этой песни пока нет текста. Музыку можно слушать и петь по памяти.</div>';
  } else {
    if (!KP.timed && !selMode) h += '<div class="knote">Николай ещё не разметил строки, поэтому они пока не подсвечиваются под музыку.</div>';
    KP.lines.forEach(function (l, k) {
      var ck = "";
      if (selMode) {
        var on = karSelHas(k);
        ck = '<span class="ck' + (on ? " on" : "") + '"></span>';
      }
      h += '<p data-k="' + k + '" class="' + (l.gap ? "gap" : "") + '">' + ck + karLineHtml(l, KAR.showMarks) + "</p>";
    });
  }
  if (KP.loop) h += '<div class="bracket"></div>';
  inner.innerHTML = h;
  var lyr = KP.root.querySelector(".lyr");
  lyr.classList.toggle("selm", selMode);
  KP.root.querySelector(".khint").style.display = selMode ? "" : "none";
  var adm = karIsAdm() && !selMode && !KP.tap;
  lyr.classList.toggle("kadmlp", adm);
  karFreeOff(true);
  if (!lyr._swipe) { lyr._swipe = true; karWireSwipe(lyr, inner); }
  Array.prototype.forEach.call(inner.querySelectorAll("p[data-k]"), function (p) {
    var k = parseInt(p.getAttribute("data-k"), 10);
    p.addEventListener("click", function () {
      if (KP.lpDone) { KP.lpDone = false; return; } // после долгого нажатия обычный тап не срабатывает
      if (KP.swiped) { KP.swiped = false; return; } // это был свайп по тексту, а не тап по строке
      if (KP.free) karFreeOff(); // тап по строке после свайпа — петь с неё, текст снова идёт за музыкой
      if (KP.tap) return; // при разметке строки не трогаем — тапают только кнопку
      karLineTap(k);
    });
    if (adm) karWireLongPress(p, k);
  });
  KP.cur = -2;
  if (selMode) { inner.style.transform = "none"; inner.style.paddingTop = "0px"; inner.style.paddingBottom = "24px"; }
  karTick(true);
}

/* ---------- Свайп текста, как в Apple Music (17.11) ----------
   Текст листается пальцем вверх и вниз, с инерцией. Пока листаешь, все строки
   чёткие и экран не возвращается к текущей строке. Тап по строке — музыка с
   этой строки. Если ничего не нажать, через пару секунд текст сам
   возвращается к строке, которая сейчас звучит. */
function karWireSwipe(lyr, inner) {
  var drag = null, vel = 0, lastY = 0, lastT = 0, raf = 0;
  function setY(y) {
    // дальше последней строки не листается: она встаёт туда же, где стоит звучащая строка
    var ps = inner.querySelectorAll("p[data-k]"), last = ps[ps.length - 1];
    var max = last ? Math.max(0, last.offsetTop - lyr.clientHeight * 0.32) : 0;
    KP.y = Math.max(0, Math.min(max, y));
    inner.style.transform = "translateY(" + (-KP.y) + "px)";
  }
  lyr.addEventListener("pointerdown", function (ev) {
    if (KP.sel || !KP.lines || !KP.lines.length) return;
    cancelAnimationFrame(raf); clearTimeout(KP.freeT);
    KP.swiped = false;
    drag = { y0: ev.clientY, start: KP.y || 0, moved: false, id: ev.pointerId };
    lastY = ev.clientY; lastT = performance.now(); vel = 0;
  });
  lyr.addEventListener("pointermove", function (ev) {
    if (!drag) return;
    var dy = ev.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dy) < 8) return;
      drag.moved = true; KP.swiped = true;
      try { lyr.setPointerCapture(drag.id); } catch (e) {}
      KP.free = true; lyr.classList.add("free"); inner.style.transition = "none";
    }
    var now = performance.now();
    vel = (ev.clientY - lastY) / Math.max(1, now - lastT);
    lastY = ev.clientY; lastT = now;
    setY(drag.start - dy);
  });
  function up() {
    if (!drag) return;
    var moved = drag.moved; drag = null;
    if (!moved) { if (KP.free) karFreeLater(); return; }
    var v = -vel * 16;
    (function fling() {
      if (Math.abs(v) < 0.4 || !KP.free) { karFreeLater(); return; }
      setY(KP.y + v); v *= 0.94;
      raf = requestAnimationFrame(fling);
    })();
  }
  lyr.addEventListener("pointerup", up);
  lyr.addEventListener("pointercancel", up);
}
function karFreeLater() { clearTimeout(KP.freeT); KP.freeT = setTimeout(function () { karFreeOff(); }, 3000); }
function karFreeOff(silent) {
  clearTimeout(KP.freeT);
  if (!KP.root) return;
  var was = KP.free;
  KP.free = false;
  var lyr = KP.root.querySelector(".lyr"), inner = KP.root.querySelector(".lyr-in");
  if (lyr) lyr.classList.remove("free");
  if (inner) inner.style.transition = "";
  if (was && !silent && KE) karSetCur(KP.cur);
}

function karLineTap(k) {
  if (KP.sel) {
    var at = KP.sel.indexOf(k);
    if (at > -1) KP.sel.splice(at, 1); else KP.sel.push(k);
    karPaintLyrics(); karPaintBottom();
    return;
  }
  var l = KP.lines[k];
  if (l.t == null) return;
  if (KP.loop && (k < KP.loop.a || k > KP.loop.b)) karLoopOff();
  karSeek(Math.max(0, l.t - 0.05));
  hpGate("karaoke", karPlay);
}

/* ---------- Николай: долгое нажатие на строку → редактор строки (вариант B, 17.11) ----------
   Шторка снизу: строка с «+» между словами для V / v, подсказка мелко под строкой,
   «▶ Петь с этой строки», «Очистить» / «Готово». Ученик видит только результат. */
function karIsAdm() { return !!(state.isAdmin && state._siteAuth); }

function karWireLongPress(p, k) {
  var tm = 0, x0 = 0, y0 = 0;
  function stop() { clearTimeout(tm); tm = 0; }
  p.addEventListener("pointerdown", function (ev) {
    if (KP.sel) return;
    x0 = ev.clientX; y0 = ev.clientY; stop();
    tm = setTimeout(function () {
      tm = 0;
      if (KP.swiped) return; // палец листал текст
      KP.lpDone = true;
      try { window.Telegram.WebApp.HapticFeedback.impactOccurred("medium"); } catch (e) {}
      karOpenLineEditor(k);
    }, 500);
  });
  p.addEventListener("pointermove", function (ev) { if (tm && (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10)) stop(); });
  p.addEventListener("pointerup", stop);
  p.addEventListener("pointercancel", stop);
  p.addEventListener("pointerleave", stop);
  p.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
}

function karOpenLineEditor(k) {
  var l = KP.lines[k];
  if (!l || !KP.root) return;
  if (KE && KE.playing) karPause();
  var old = KP.root.querySelector(".kedit");
  if (old) old.parentNode.removeChild(old);
  var ed = { mk: {}, hint: l.hint || "", mode: "V" };
  Object.keys(l.mk || {}).forEach(function (g) { ed.mk[g] = l.mk[g]; });
  var words = l.text.split(/\s+/);
  var d = document.createElement("div");
  d.className = "kedit";
  KP.root.appendChild(d);
  function paint() {
    var h = "";
    for (var g = 0; g <= words.length; g++) {
      h += ed.mk[g] ? '<span class="km ' + (ed.mk[g] === "V" ? "kmV" : "kmv") + '" data-g="' + g + '">' + ed.mk[g] + "</span>" : '<span class="kg" data-g="' + g + '">+</span>';
      if (g < words.length) h += esc(words[g]);
    }
    d.innerHTML =
      '<div class="hdl"></div>' +
      '<div class="cap">Строка ' + (k + 1) + (l.t != null ? " · " + karFmt(l.t) : "") + " · тапни «+» между словами</div>" +
      '<div class="ln">' + h + "</div>" +
      '<div class="chs"><span class="ch' + (ed.mode === "V" ? " onV" : "") + '" data-e="V">V вдох</span><span class="ch' + (ed.mode === "v" ? " onv" : "") + '" data-e="v">v добор</span></div>' +
      '<input type="text" class="hin" maxlength="200" placeholder="Подсказка к строке, мелко под ней" value="' + esc(ed.hint) + '">' +
      (l.t != null ? '<div class="sing" data-e="sing">▶ Петь с этой строки</div>' : "") +
      '<div class="bts"><span class="bt2" data-e="clear">Очистить</span><span class="bt2 main" data-e="ok">Готово</span></div>';
    Array.prototype.forEach.call(d.querySelectorAll("[data-g]"), function (el) {
      el.onclick = function () {
        var g = el.getAttribute("data-g");
        if (ed.mk[g]) delete ed.mk[g]; else ed.mk[g] = ed.mode;
        paint();
      };
    });
    d.querySelector('[data-e="V"]').onclick = function () { ed.mode = "V"; paint(); };
    d.querySelector('[data-e="v"]').onclick = function () { ed.mode = "v"; paint(); };
    var hin = d.querySelector(".hin");
    hin.oninput = function () { ed.hint = hin.value; };
    hin.onkeydown = function (e) { if (e.key === "Enter") hin.blur(); };
    d.querySelector('[data-e="clear"]').onclick = function () { ed.mk = {}; ed.hint = ""; paint(); };
    d.querySelector('[data-e="ok"]').onclick = function () { apply(); close(); };
    var sing = d.querySelector('[data-e="sing"]');
    if (sing) sing.onclick = function () { apply(); close(); karLineTap(k); };
  }
  function close() { if (d.parentNode) d.parentNode.removeChild(d); }
  function apply() {
    var changed = ed.hint.trim() !== (l.hint || "").trim() || JSON.stringify(ed.mk) !== JSON.stringify(l.mk || {});
    if (!changed) return;
    l.mk = ed.mk; l.hint = ed.hint.trim();
    karPaintLyrics();
    karMarksSave(KAR.song, KP.lines);
  }
  paint();
}

/* Сохранить пометки и подсказки песни (api/karaoke.js, токен Николая).
   Обновляет и список в «Разметке караоке», если он открыт для этой песни. */
function karMarksSave(song, lines) {
  var marks = {};
  lines.forEach(function (l) {
    if (Object.keys(l.mk || {}).length || (l.hint || "").trim()) marks[l.i] = { text: l.text, mk: l.mk, hint: (l.hint || "").trim() };
  });
  KAR.marks[song.id] = { lines: marks };
  if (KAE && KAE.song && KAE.song.id === song.id) {
    KAE.lines.forEach(function (x) { var m = marks[x.i]; x.mk = m ? JSON.parse(JSON.stringify(m.mk || {})) : {}; x.hint = m ? m.hint : ""; });
  }
  var tries = 0;
  (function send() {
    fetch("/api/karaoke", {
      method: "POST", headers: bazaAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ songId: song.id, studentId: song.studentId, lines: marks })
    }).then(function (r) { if (!r.ok) throw new Error(r.status); if (tries) karToast("Сохранено ✓"); })
      .catch(function () {
        if (++tries < 4) { karToast("Не сохранилось. Пробую ещё раз…", true); setTimeout(send, 4000); }
        else karToast("Не сохранилось. Проверь интернет и поправь строку ещё раз.", true);
      });
  })();
}

function karToast(t, err) {
  if (!KP.root || state.screen !== "karaoke-play") return;
  var o = KP.root.querySelector(".ktoast");
  if (!o) { o = document.createElement("div"); o.className = "ktoast"; KP.root.appendChild(o); }
  o.textContent = t; o.classList.toggle("err", !!err); o.classList.add("on");
  clearTimeout(KP.toastT);
  KP.toastT = setTimeout(function () { o.classList.remove("on"); }, 2200);
}

function karSelRange() {
  if (!KP.sel || !KP.sel.length) return null;
  return { a: Math.min.apply(null, KP.sel), b: Math.max.apply(null, KP.sel) };
}
function karSelHas(k) { var r = karSelRange(); return !!r && k >= r.a && k <= r.b; }

// Начало и конец куска по таймингу строк: от начала первой отмеченной строки
// до начала строки, идущей за последней отмеченной (или до конца песни).
function karRangeTimes(a, b) {
  var s = null, e = null, k;
  for (k = a; k >= 0 && s == null; k--) if (KP.lines[k].t != null) s = KP.lines[k].t;
  for (k = b + 1; k < KP.lines.length && e == null; k++) if (KP.lines[k].t != null) e = KP.lines[k].t;
  if (e == null) e = KE.dur || null;
  if (s == null || e == null || e <= s) return null;
  return { s: s, e: e };
}

function karPaintBottom() {
  var box = KP.root.querySelector(".kbottom");
  if (KP.sel) {
    var r = karSelRange(), tm = r && karRangeTimes(r.a, r.b);
    var title = !r ? "Отметь строки" : (r.a === r.b ? "Строка " + (r.a + 1) : "Строки " + (r.a + 1) + "–" + (r.b + 1)) + (tm ? " · " + karFmt(tm.e - tm.s) : "");
    box.innerHTML = '<div class="selbar"><div class="t">' + title + '</div><div class="s">Музыка будет крутить этот кусок по кругу</div>' +
      '<div class="row"><div class="bt" data-kp="sel-cancel">Отмена</div><div class="bt main' + (tm ? "" : " off") + '" data-kp="sel-go">Повторять</div></div></div>';
    box.querySelector('[data-kp="sel-cancel"]').onclick = function () { KP.sel = null; karPaintLyrics(); karPaintBottom(); };
    box.querySelector('[data-kp="sel-go"]').onclick = function () {
      var rr = karSelRange(), t2 = rr && karRangeTimes(rr.a, rr.b);
      if (!t2) return;
      KP.loop = { a: rr.a, b: rr.b, s: t2.s, e: t2.e, lap: 1 };
      KP.sel = null;
      karPaintLyrics(); karPaintBottom();
      karSeek(t2.s);
      hpGate("karaoke", karPlay);
    };
    return;
  }
  var bars = "";
  for (var i = 0; i < KAR_BARS; i++) bars += "<i></i>";
  box.innerHTML =
    '<div class="tr">' +
      '<div class="wave">' + bars + "</div>" +
      '<div class="tms"><span class="t1">0:00</span><span class="t2">−' + karFmt(KE.dur) + "</span></div>" +
      '<div class="ctl">' +
        '<div class="sk" data-kp="m10">−10</div>' +
        '<div class="pl" data-kp="play">' + KAR_ICO.play + "</div>" +
        '<div class="sk" data-kp="p10">+10</div>' +
        (KP.timed && !KP.tap ? '<div class="lp' + (KP.loop ? " on" : "") + '" data-kp="loop">' + KAR_ICO.loop(KP.loop ? "oklch(45% 0.1 40)" : "var(--gtx)") + "</div>" : "") +
      "</div>" +
      (KP.tap ? '<div class="ktap" data-kp="tap">ТАП</div><div class="bt kundo" data-kp="undo">← Назад на строку</div>' : '<div class="chs"></div>') +
    "</div>";
  karPaintWaveShape();
  karPaintChips();
  karPaintPlay();
  box.querySelector('[data-kp="play"]').onclick = function () { if (KE.playing) karPause(); else if (KP.tap) karPlay(); else hpGate("karaoke", karPlay); };
  if (KP.tap) karWireTap(box);
  box.querySelector('[data-kp="m10"]').onclick = function () { karSeek(karTime() - 10); };
  box.querySelector('[data-kp="p10"]').onclick = function () { karSeek(karTime() + 10); };
  var lp = box.querySelector('[data-kp="loop"]');
  if (lp) lp.onclick = function () {
    if (KP.loop) { karLoopOff(); return; }
    KP.sel = [];
    if (KP.cur >= 0) KP.sel.push(KP.cur);
    karPaintLyrics(); karPaintBottom();
  };
  var wave = box.querySelector(".wave");
  function seekAt(ev) {
    var r = wave.getBoundingClientRect();
    var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    if (KE.dur) karSeek(Math.max(0, Math.min(1, x / r.width)) * KE.dur);
  }
  var dragging = false;
  wave.addEventListener("pointerdown", function (ev) { dragging = true; try { wave.setPointerCapture(ev.pointerId); } catch (e) {} seekAt(ev); });
  wave.addEventListener("pointermove", function (ev) { if (dragging) seekAt(ev); });
  wave.addEventListener("pointerup", function () { dragging = false; });
  wave.addEventListener("pointercancel", function () { dragging = false; });
}

function karLoopOff() {
  KP.loop = null;
  karPaintLyrics(); karPaintBottom();
}

function karPaintLoopChip() {
  var c = KP.root && KP.root.querySelector(".gch.on .lap");
  if (c && KP.loop) c.textContent = KP.loop.lap + "-й круг";
}

function karPaintChips() {
  if (!KP.root) return;
  var chs = KP.root.querySelector(".chs");
  if (!chs) return;
  if (KP.loop) {
    var L = KP.loop;
    chs.innerHTML = '<span class="gch on" data-kp="loop-off">Повтор: ' + (L.a === L.b ? "строка " + (L.a + 1) : "строки " + (L.a + 1) + "–" + (L.b + 1)) +
      ' · <span class="lap">' + L.lap + '-й круг</span> <b>✕</b></span>';
    chs.querySelector('[data-kp="loop-off"]').onclick = karLoopOff;
    return;
  }
  var hasVoice = !!(KE.song.voice && KE.song.voice.url);
  chs.innerHTML =
    (hasVoice ? '<span class="gch' + (KE.voice ? " on" : "") + '" data-kp="voice">С голосом <b>' + (KE.voice ? "вкл" : "выкл") + "</b></span>" : "") +
    '<span class="gch" data-kp="pitch">Тональность <b>' + karKeyLabel(KE.pitch) + "</b></span>" +
    '<span class="gch" data-kp="tempo">Темп <b>' + karTempoLabel(KE.tempo) + "</b></span>" +
    '<span class="gch" data-kp="marks">Пометки <b>' + (KAR.showMarks ? "вкл" : "выкл") + "</b></span>";
  var vc = chs.querySelector('[data-kp="voice"]');
  if (vc) vc.onclick = function () { karSetVoice(!KE.voice); };
  chs.querySelector('[data-kp="pitch"]').onclick = function () { karOpenSheet(); };
  chs.querySelector('[data-kp="tempo"]').onclick = function () { karOpenSheet(); };
  chs.querySelector('[data-kp="marks"]').onclick = function () { KAR.showMarks = !KAR.showMarks; karPaintLyrics(); karPaintChips(); };
}

/* Тональность и темп — вариант A (выбран Николаем 17.11): одна панель, два
   колёсика по горизонтали, как будильник в iPhone. Тональность буквами (Em),
   темп в BPM — их приложение определяет по минусу само (karDetect). Пока не
   определены или не получилось — полутоны и проценты, как было. */
function karOpenSheet() {
  var old = KP.root.querySelector(".ksheet");
  if (old) old.parentNode.removeChild(old);
  var d = document.createElement("div");
  d.className = "ksheet";
  KP.root.appendChild(d);
  KP.sheet = d;
  karPaintSheet();
}

function karPaintSheet() {
  var d = KP.sheet;
  if (!d || !d.parentNode || !KE) return;
  var m = KE.meta;
  d.innerHTML =
    '<div class="t">Тональность и темп</div>' +
    '<div class="wl">Тональность<span>в песне ' + (m ? karKeyName(m.root, m.minor) : "0") + "</span></div>" +
    '<div class="wh" data-w="pitch"></div>' +
    '<div class="wl">' + (m ? "Темп, BPM" : "Темп, %") + "<span>в песне " + (m ? Math.round(m.bpm) : "100") + "</span></div>" +
    '<div class="wh" data-w="tempo"></div>' +
    '<div class="row" style="display:flex;gap:10px;margin-top:14px"><div class="bt" data-s="reset">Как в песне</div><div class="bt main" data-s="ok">Готово</div></div>';
  var pl = [], pv = [];
  for (var n = -6; n <= 6; n++) { pv.push(n); pl.push(karKeyLabel(n)); }
  var tl = [], tv = [];
  if (m) {
    var b0 = Math.round(m.bpm);
    for (var x = Math.ceil(b0 * 0.7); x <= Math.floor(b0 * 1.2); x++) { tv.push(x / b0 * 100); tl.push(String(x)); }
  } else {
    for (var q = 70; q <= 120; q += 5) { tv.push(q); tl.push(String(q)); }
  }
  function nearest(vals, v) {
    var bi = 0;
    vals.forEach(function (z, i) { if (Math.abs(z - v) < Math.abs(vals[bi] - v)) bi = i; });
    return bi;
  }
  var wp = karWheel(d.querySelector('[data-w="pitch"]'), pl, pv.indexOf(KE.pitch), function (i) {
    if (KE && pv[i] !== KE.pitch) karSetPitch(pv[i]);
  });
  var wt = karWheel(d.querySelector('[data-w="tempo"]'), tl, nearest(tv, KE.tempo), function (i) {
    if (KE && Math.abs(tv[i] - KE.tempo) > 0.01) karSetTempo(tv[i]);
  });
  d.querySelector('[data-s="reset"]').onclick = function () {
    if (KE.pitch !== 0) karSetPitch(0);
    if (KE.tempo !== 100) karSetTempo(100);
    wp.to(pv.indexOf(0)); wt.to(nearest(tv, 100));
  };
  d.querySelector('[data-s="ok"]').onclick = function () { d.parentNode.removeChild(d); KP.sheet = null; };
}

/* Колёсико по горизонтали: тянешь пальцем, отпускаешь — докатывается и
   встаёт на ближайшее значение; тап по значению — встаёт на него. Звук
   меняется, когда колёсико остановилось. */
function karWheel(box, labels, idx, onPick) {
  var GAP = 68, pos = Math.max(0, idx), its = [], anim = 0, picked = pos;
  box.innerHTML = '<div class="cap"></div>';
  labels.forEach(function (t, i) {
    var it = document.createElement("div");
    it.className = "it"; it.textContent = t;
    box.appendChild(it); its.push(it);
  });
  function paint() {
    its.forEach(function (it, i) {
      var o = i - pos, a = Math.abs(o);
      if (a > 3.6) { it.style.visibility = "hidden"; return; }
      it.style.visibility = "";
      var sc = a <= 1 ? 1 - 0.18 * a : a <= 3 ? 0.82 - 0.09 * (a - 1) : 0.64;
      var op = a <= 1 ? 1 - 0.15 * a : a <= 2 ? 0.85 - 0.3 * (a - 1) : Math.max(0, 0.55 - 0.2 * (a - 2));
      it.style.transform = "translateX(" + (o * GAP).toFixed(1) + "px) scale(" + sc.toFixed(3) + ")";
      it.style.opacity = op.toFixed(2);
      it.classList.toggle("c", a < 0.5);
    });
  }
  function clamp(i) { return Math.max(0, Math.min(labels.length - 1, i)); }
  function to(i, fire) {
    i = clamp(Math.round(i));
    cancelAnimationFrame(anim);
    var from = pos, t0 = 0, dur = Math.min(420, 160 + Math.abs(i - from) * 40);
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      pos = from + (i - from) * e; paint();
      if (k < 1) { anim = requestAnimationFrame(step); return; }
      pos = i; paint();
      if (fire !== false && i !== picked) { picked = i; onPick(i); }
      else picked = i;
    }
    anim = requestAnimationFrame(step);
  }
  var drag = null, moved = false;
  box.addEventListener("pointerdown", function (e) {
    cancelAnimationFrame(anim);
    drag = { x: e.clientX, p: pos, lx: e.clientX, lt: e.timeStamp, v: 0 };
    moved = false;
    try { box.setPointerCapture(e.pointerId); } catch (er) {}
  });
  box.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) moved = true;
    var p = drag.p - dx / GAP;
    if (p < 0) p = p * 0.35; else if (p > labels.length - 1) p = labels.length - 1 + (p - labels.length + 1) * 0.35;
    pos = p; paint();
    var dt = e.timeStamp - drag.lt;
    if (dt > 0) { drag.v = 0.8 * ((e.clientX - drag.lx) / dt) + 0.2 * drag.v; drag.lx = e.clientX; drag.lt = e.timeStamp; }
  });
  function end(ev) {
    if (!drag) return;
    var v = drag.v; drag = null;
    if (!moved) {
      // тап по значению: встаёт на него (захват касания уводит click с самого значения)
      var r = box.getBoundingClientRect();
      to(pos + (ev.clientX - (r.left + r.width / 2)) / GAP, true);
      return;
    }
    to(pos - v * 180 / GAP, true);
  }
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
  paint();
  return { to: function (i) { to(i, false); } };
}

var KAR_KEYS_MAJ = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
var KAR_KEYS_MIN = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
function karKeyName(root, minor) { return (minor ? KAR_KEYS_MIN : KAR_KEYS_MAJ)[((root % 12) + 12) % 12]; }
function karKeyLabel(shift) {
  var m = KE && KE.meta;
  return m ? karKeyName(m.root + shift, m.minor) : karSign(shift);
}
function karTempoLabel(pct) {
  var m = KE && KE.meta;
  return m ? Math.round(m.bpm * pct / 100) + " BPM" : Math.round(pct) + "%";
}

/* Темп и тональность минуса: берём сохранённые (api/karaoke.js), иначе из
   памяти телефона, иначе определяем сами по звуку один раз и сохраняем. */
function karMetaFor(song) {
  var url = song && song.music && song.music.url;
  if (!url) return null;
  var m = KAR.meta && KAR.meta[song.id];
  if (m && m.url === url) return m;
  try {
    var j = JSON.parse(localStorage.getItem("karMeta:" + url) || "null");
    if (j && j.bpm && j.root != null) return j;
  } catch (e) {}
  return null;
}

function karDetect(buf, song) {
  if (KAR.detecting === song.music.url) return;
  KAR.detecting = song.music.url;
  var url = song.music.url, sr = buf.sampleRate;
  var c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  var step = sr > 30000 ? 2 : 1, max = Math.min(c0.length, Math.round(sr * 200));
  var x = new Float32Array(Math.floor(max / step));
  for (var i = 0, j = 0; j < x.length; i += step, j++) x[j] = c1 ? (c0[i] + c1[i]) * 0.5 : c0[i];
  var w;
  try { w = new Worker(URL.createObjectURL(new Blob([KAR_DETECT_SRC], { type: "text/javascript" }))); }
  catch (e) { KAR.detecting = null; return; }
  w.onmessage = function (ev) {
    w.terminate(); KAR.detecting = null;
    var r = ev.data || {};
    if (!(r.bpm > 0) || r.root == null) return;
    var m = { url: url, bpm: Math.round(r.bpm), root: r.root, minor: !!r.minor };
    try { localStorage.setItem("karMeta:" + url, JSON.stringify(m)); } catch (e) {}
    KAR.meta = KAR.meta || {}; KAR.meta[song.id] = m;
    if (KE && KE.song === song && !KE.meta) { KE.meta = m; karPaintChips(); karPaintSheet(); }
    karSaveMeta(song, m);
  };
  w.onerror = function () { w.terminate(); KAR.detecting = null; };
  w.postMessage({ x: x, sr: sr / step }, [x.buffer]);
}

function karSaveMeta(song, m) {
  karSession().then(function (sess) {
    var h = { "Content-Type": "application/json", "X-Player-Session": sess };
    if (karIsAdm()) { var a = bazaAuthHeaders(); Object.keys(a).forEach(function (k) { h[k] = a[k]; }); }
    return fetch("/api/karaoke", { method: "POST", headers: h, body: JSON.stringify({ songId: song.id, meta: m }) });
  }).catch(function () {});
}

/* Разбор звука в отдельном потоке, чтобы плеер не подтормаживал.
   Темп: всплески громкости по частотам (spectral flux) → автокорреляция,
   уточнение по 8 долям, предпочтение 60–180 BPM. Тональность: хрома по
   спектральным пикам 80–2000 Гц → корреляция с профилями Крумхансла. */
var KAR_DETECT_SRC = [
  "function fft(re,im){var n=re.length,i,j=0,k,t;for(i=1;i<n;i++){var b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}",
  "for(var len=2;len<=n;len<<=1){var a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(i=0;i<n;i+=len){var cr=1,ci=0;for(k=0;k<len/2;k++){var p=i+k,q=p+len/2,xr=re[q]*cr-im[q]*ci,xi=re[q]*ci+im[q]*cr;",
  "re[q]=re[p]-xr;im[q]=im[p]-xi;re[p]+=xr;im[p]+=xi;t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}",
  "function hann(n){var w=new Float32Array(n);for(var i=0;i<n;i++)w[i]=0.5-0.5*Math.cos(2*Math.PI*i/n);return w;}",
  "function tempo(x,sr){var N=1024,H=128,w=hann(N),re=new Float32Array(N),im=new Float32Array(N),prev=new Float32Array(N/2),F=Math.floor((x.length-N)/H);if(F<200)return 0;var o=new Float32Array(F);",
  "for(var f=0;f<F;f++){for(var i=0;i<N;i++){re[i]=x[f*H+i]*w[i];im[i]=0;}fft(re,im);var s=0;for(i=1;i<N/2;i++){var m=Math.log(1+100*Math.sqrt(re[i]*re[i]+im[i]*im[i]));var d=m-prev[i];if(d>0)s+=d;prev[i]=m;}o[f]=s;}",
  "var W=Math.round(0.4*sr/H),c=new Float32Array(F),acc=0;for(f=0;f<F;f++){acc+=o[f];if(f>=W)acc-=o[f-W];c[f]=Math.max(0,o[f]-acc/Math.min(f+1,W));}",
  "var fr=sr/H,maxL=Math.ceil(fr*60/40*8)+2;if(maxL>F-1)maxL=F-1;var ac=new Float32Array(maxL+1);for(var L=1;L<=maxL;L++){var z=0;for(f=0;f+L<F;f++)z+=c[f]*c[f+L];ac[L]=z/(F-L);}",
  "function at(l){var a=Math.floor(l),b=l-a;if(a+1>maxL)return 0;return ac[a]*(1-b)+ac[a+1]*b;}",
  "var best=0,bs=-1;for(var bpm=50;bpm<=200;bpm+=0.1){var L0=fr*60/bpm,sc=0,cnt=0;for(var k=1;k<=8;k++){if(k*L0>maxL)break;sc+=at(k*L0);cnt++;}if(!cnt)continue;sc/=cnt;var lg=Math.log(bpm/110)/Math.LN2;sc*=Math.exp(-0.5*lg*lg/0.64);if(sc>bs){bs=sc;best=bpm;}}",
  "return best;}",
  "var MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];",
  "function corr(a,b){var ma=0,mb=0,i;for(i=0;i<12;i++){ma+=a[i];mb+=b[i];}ma/=12;mb/=12;var s=0,sa=0,sb=0;for(i=0;i<12;i++){var p=a[i]-ma,q=b[i]-mb;s+=p*q;sa+=p*p;sb+=q*q;}return s/Math.sqrt(sa*sb||1);}",
  "function key(x,sr){var N=8192;while(N*2<=sr*0.75)N*=2;var H=N/2,w=hann(N),re=new Float32Array(N),im=new Float32Array(N),ch=new Float64Array(12),F=Math.floor((x.length-N)/H),i,f;",
  "var lo=Math.ceil(80*N/sr),hi=Math.floor(2000*N/sr),pc=new Int8Array(hi+2),mag=new Float32Array(hi+2);for(i=lo;i<=hi;i++){var mid=69+12*Math.log(i*sr/N/440)/Math.LN2;pc[i]=((Math.round(mid)%12)+12)%12;}",
  "for(f=0;f<F;f++){for(i=0;i<N;i++){re[i]=x[f*H+i]*w[i];im[i]=0;}fft(re,im);for(i=lo-1;i<=hi+1;i++)mag[i]=Math.sqrt(re[i]*re[i]+im[i]*im[i]);var fc=new Float64Array(12),mx=0;",
  "for(i=lo;i<=hi;i++){if(mag[i]>mag[i-1]&&mag[i]>=mag[i+1]){fc[pc[i]]+=Math.sqrt(mag[i]);}}for(i=0;i<12;i++)if(fc[i]>mx)mx=fc[i];if(mx>0)for(i=0;i<12;i++)ch[i]+=fc[i]/mx;}",
  "var bs=-2,root=0,minor=false;for(var r=0;r<12;r++){var rot=[];for(i=0;i<12;i++)rot.push(ch[(i+r)%12]);var a=corr(rot,MAJ),b=corr(rot,MIN);if(a>bs){bs=a;root=r;minor=false;}if(b>bs){bs=b;root=r;minor=true;}}",
  "return {root:root,minor:minor};}",
  "onmessage=function(e){var x=e.data.x,sr=e.data.sr,out={};try{out.bpm=tempo(x,sr);var k=key(x,sr);out.root=k.root;out.minor=k.minor;}catch(er){}postMessage(out);};"
].join("\n");

/* Разметка: ТАП ставит начало следующей строки, «Назад на строку» снимает
   последний тап и отматывает музыку на 2 секунды перед этой строкой. */
function karWireTap(box) {
  box.querySelector('[data-kp="tap"]').addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    if (!KAE || !KP.lines.length) return;
    if (!KE.playing) { karPlay(); return; }
    if (KAE.cursor >= KAE.lines.length) { karToast("Все строки размечены ✓"); return; }
    // −0,15 с на реакцию пальца: подсветка лучше чуть раньше, чем позже
    KAE.lines[KAE.cursor].t = Math.max(0, karTime() - 0.15);
    KAE.cursor++;
    karAdmDirty(); karTick(true);
    if (KAE.cursor >= KAE.lines.length) karToast("Все строки размечены ✓");
  });
  box.querySelector('[data-kp="undo"]').onclick = function () {
    if (!KAE || KAE.cursor <= 0) return;
    KAE.cursor--;
    var l = KAE.lines[KAE.cursor], was = l.t;
    l.t = null;
    if (was != null) karSeek(Math.max(0, was - 2));
    karAdmDirty(); karTick(true);
  };
}

function karPaintPlay() {
  if (!KP.root || !KE) return;
  var b = KP.root.querySelector('[data-kp="play"]');
  if (!b) return;
  b.innerHTML = KE.playing ? KAR_ICO.pause : KAR_ICO.play;
  b.classList.toggle("busy", !!KE.busy);
}

/* Волна: из готовых чисел baza-dannih (peaksMusic), а пока их нет —
   из огибающей громкости, которую считаем для свечения. */
function karPaintWaveShape() {
  var wave = KP.root && KP.root.querySelector(".wave");
  if (!wave) return;
  var src = (KAR.song.peaksMusic && KAR.song.peaksMusic.length) ? KAR.song.peaksMusic : (KP.env ? KP.env : null);
  var bars = wave.children;
  for (var i = 0; i < bars.length; i++) {
    var v = 0.35;
    if (src) {
      var a = Math.floor(i / bars.length * src.length), b = Math.max(a + 1, Math.floor((i + 1) / bars.length * src.length));
      v = 0; for (var j = a; j < b && j < src.length; j++) v = Math.max(v, src[j]);
      if (src === KP.env) v = Math.min(1, v * 1.6);
    }
    bars[i].style.height = (6 + Math.round(20 * Math.max(0.05, Math.min(1, v)))) + "px";
  }
}

/* Огибающая громкости минуса (шаг 50 мс) — по ней огоньки «дышат» в такт.
   Декодируем с низкой частотой, чтобы не держать в памяти весь файл. */
function karPrepareEnvelope() {
  var song = KAR.song;
  var url = song.music.url;
  fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx;
    try { ctx = new Off(1, 1, 22050); } catch (e) { ctx = getAudioCtx(); }
    return new Promise(function (res, rej) {
      var p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }).then(function (buf) {
    if (KAR.song !== song) return;
    var ch = buf.getChannelData(0), ch2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    var win = Math.max(1, Math.round(buf.sampleRate * KP.envStep));
    var n = Math.ceil(ch.length / win), env = new Array(n), mx = 1e-6;
    for (var w = 0; w < n; w++) {
      var sum = 0, cnt = 0;
      for (var j = w * win; j < (w + 1) * win && j < ch.length; j += 4) {
        var v = ch2 ? (ch[j] + ch2[j]) * 0.5 : ch[j];
        sum += v * v; cnt++;
      }
      env[w] = Math.sqrt(sum / (cnt || 1));
      if (env[w] > mx) mx = env[w];
    }
    for (w = 0; w < n; w++) env[w] /= mx;
    KP.env = env;
    if (!KE.dur) KE.dur = buf.duration;
    karPaintWaveShape();
    if (KE && KE.song === song && !KE.meta) karDetect(buf, song);
  }).catch(function () { /* без огибающей огоньки просто медленно плывут */ });
}

function karEnergy(t) {
  if (!KP.env) return 0.35;
  var i = Math.floor(t / KP.envStep);
  return KP.env[Math.max(0, Math.min(KP.env.length - 1, i))] || 0;
}

function karLoop(ts) {
  if (!KP.root || !document.body.contains(KP.root)) { karEngineStop(); KP.root = null; return; }
  karTick(false, ts);
  KP.raf = requestAnimationFrame(karLoop);
}

function karTick(force, ts) {
  if (!KP.root || !KE) return;
  var t = karTime();
  // повтор куска
  if (KP.loop && KE.playing && !KE.busy && t >= KP.loop.e - 0.03) {
    KP.loop.lap++; karPaintLoopChip(); karSeek(KP.loop.s); t = KP.loop.s;
  }
  // текущая строка
  var cur = -1;
  if (KP.timed) for (var k = 0; k < KP.lines.length; k++) if (KP.lines[k].t != null && KP.lines[k].t <= t + 0.02) cur = k;
  if (cur !== KP.cur || force) karSetCur(cur);
  // волна и время
  var tr = KP.root.querySelector(".tr");
  if (tr && KE.dur) {
    var bars = tr.querySelector(".wave").children, on = Math.round(t / KE.dur * bars.length);
    for (var i = 0; i < bars.length; i++) bars[i].classList.toggle("on", i < on);
    tr.querySelector(".t1").textContent = karFmt(t);
    tr.querySelector(".t2").textContent = "−" + karFmt(KE.dur - t);
  }
  karGlow(t, ts || performance.now());
}

function karSetCur(cur) {
  KP.cur = cur;
  var inner = KP.root.querySelector(".lyr-in");
  var ps = inner.querySelectorAll("p[data-k]");
  for (var k = 0; k < ps.length; k++) {
    var p = ps[k], d = cur < 0 ? k + 1 : Math.abs(k - cur);
    p.classList.toggle("cur", k === cur && !KP.sel);
    // две строки рядом с текущей — чёткие, размытие начинается с третьей (17.11)
    p.classList.toggle("f1", !KP.sel && d === 3);
    p.classList.toggle("f2", !KP.sel && d === 4);
    p.classList.toggle("f3", !KP.sel && d >= 5);
    p.style.opacity = (KP.loop && !KP.sel && (k < KP.loop.a || k > KP.loop.b)) ? ".5" : "";
  }
  if (!KP.sel && ps.length) {
    var target = ps[Math.max(0, cur)];
    var lyr = KP.root.querySelector(".lyr");
    // сверху и снизу у текста запас, чтобы и первая, и последняя строка
    // вставали на одно и то же место, на треть высоты экрана
    var pad = Math.round(lyr.clientHeight * 0.32) + "px";
    if (inner.style.paddingTop !== pad) { inner.style.paddingTop = pad; inner.style.paddingBottom = Math.round(lyr.clientHeight * 0.6) + "px"; }
    var y = target.offsetTop - lyr.clientHeight * 0.32;
    // пока Николай листает текст пальцем, строка подсвечивается, но экран не дёргается
    if (!KP.free) { KP.y = Math.max(0, y); inner.style.transform = "translateY(" + (-KP.y) + "px)"; }
  }
  var br = inner.querySelector(".bracket");
  if (br && KP.loop && ps[KP.loop.a] && ps[KP.loop.b]) {
    var top = ps[KP.loop.a].offsetTop - 4;
    br.style.top = top + "px";
    br.style.height = (ps[KP.loop.b].offsetTop + ps[KP.loop.b].offsetHeight - 16 - top) + "px";
  }
}

/* Огоньки: медленно плывут по своим траекториям всегда, а под музыку
   разгораются и «дышат» — на громких местах и на ударах (рост громкости). */
function karGlow(t, ts) {
  var amb = KP.root.querySelector(".amb");
  if (!amb) return;
  var playing = KE && KE.playing;
  var e = playing ? karEnergy(t) : 0.25;
  var rise = Math.max(0, e - KP.lastE);
  KP.lastE = e;
  KP.glow += (e - KP.glow) * 0.08;
  KP.pulse = Math.max(KP.pulse * 0.9, Math.min(1, rise * 4));
  var s = ts / 1000, sp = playing ? 1 : 0.45;
  var g = KP.glow, pu = KP.pulse;
  var bl = amb.children;
  if (bl.length < 3) return;
  bl[0].style.transform = "translate(" + (Math.sin(s * 0.23 * sp) * 9) + "%," + (Math.cos(s * 0.19 * sp) * 7) + "%) scale(" + (0.92 + g * 0.22 + pu * 0.12).toFixed(3) + ")";
  bl[1].style.transform = "translate(" + (Math.cos(s * 0.17 * sp + 1) * 8) + "%," + (Math.sin(s * 0.21 * sp + 2) * 9) + "%) scale(" + (0.95 + g * 0.18 + pu * 0.08).toFixed(3) + ")";
  bl[2].style.transform = "translate(" + (Math.sin(s * 0.27 * sp + 3) * 10) + "%," + (Math.cos(s * 0.15 * sp + 1) * 6) + "%) scale(" + (0.9 + g * 0.25 + pu * 0.15).toFixed(3) + ")";
  bl[0].style.opacity = (0.75 + g * 0.25).toFixed(3);
  bl[1].style.opacity = (0.8 + g * 0.2).toFixed(3);
  bl[2].style.opacity = (0.7 + g * 0.3).toFixed(3);
}

window.karaokeStopAll = function () {
  if (KE && state.screen !== "karaoke-play") { karEngineStop(); }
  if (KAE && state.screen !== "admin-karaoke-edit") { try { KAE.el.pause(); } catch (e) {} karAdmFlush(); }
};

/* ==========================================================================
   НИКОЛАЙ: «РАЗМЕТКА КАРАОКЕ»
   Ученик → песня → минус, текст, тапы в начале строк под музыку, V / v,
   подсказки. Всё сохраняется само через пару секунд после изменения.
   ========================================================================== */

var KAE = null; // { el, song, lines, cursor, dirty, saveT }

function karAdmFetch(path, opts) {
  opts = opts || {};
  opts.headers = bazaAuthHeaders(opts.headers || {});
  return fetch(BAZA_API + path, opts).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
}

function karAdmTop(title, sub) {
  return '<div class="top pb8">' + backBtn("back") +
    '<div><div class="top-title lg">' + esc(title) + '</div><div class="top-sub">' + esc(sub) + "</div></div></div>";
}

function renderAdminKaraoke() {
  loadAdminStudentsList();
  var list = state.adminStudentsList, body;
  if (list === null || list === undefined) body = '<div class="courses-empty">Загружаю список учеников…</div>';
  else if (!list.length) body = '<div class="courses-empty">' + (state._adminStudentsErr ? "Не удалось загрузить список учеников. Попробуй ещё раз через минуту." : "Учеников пока нет.") + "</div>";
  else body = list.map(function (st, k) {
    return '<div class="lesson-card" data-kadm-st="' + k + '"><div class="lesson-dot" style="background:oklch(56% 0.09 235);">' + esc((st.name || "?")[0]) + '</div>' +
      '<div class="lesson-body"><div class="lesson-name">' + esc(st.name) + "</div></div>" + SVG.chevronRight + "</div>";
  }).join("");
  app.innerHTML = karAdmTop("Разметка караоке", "Выбери ученика") +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' + body + "</div>";
  wireActs();
  Array.prototype.forEach.call(app.querySelectorAll("[data-kadm-st]"), function (el) {
    el.onclick = function () {
      var st = state.adminStudentsList[parseInt(el.getAttribute("data-kadm-st"), 10)];
      KAR.adm.student = { id: st.id, name: st.name };
      KAR.adm.songs = null; KAR.adm.fromKar = false;
      go("admin-karaoke-songs");
    };
  });
}

function karAdmLoadSongs() {
  var st = KAR.adm.student;
  if (!st || KAR.adm.songs === "loading") return;
  KAR.adm.songs = "loading"; KAR.adm.songsErr = null;
  karAdmFetch("/api/player-tracks?studentId=" + encodeURIComponent(st.id)).then(function (d) {
    KAR.adm.songs = d.songs || [];
    if (state.screen === "admin-karaoke-songs") render();
  }).catch(function () {
    KAR.adm.songs = []; KAR.adm.songsErr = true;
    if (state.screen === "admin-karaoke-songs") render();
  });
}

function renderAdminKaraokeSongs() {
  var st = KAR.adm.student;
  if (!st) { go("admin-karaoke"); return; }
  if (KAR.adm.songs == null) karAdmLoadSongs();
  var songs = KAR.adm.songs, body;
  if (songs == null || songs === "loading") body = '<div class="courses-empty">Загружаю песни…</div>';
  else {
    body = (KAR.adm.songsErr ? '<div class="instruction-note">Не удалось загрузить песни. Если ты давно не входил, выйди из режима админа и войди по ключам заново.</div>' : "") +
      songs.map(function (s, k) {
        var n = String(s.lyrics || "").split("\n").filter(function (x) { return x.trim(); }).length;
        var m = (s.lyricTimes || []).length;
        var sub = [s.music && s.music.url ? "минус ✓" : "нет минуса", n ? "текст ✓" : "нет текста", n ? "размечено " + Math.min(m, n) + " из " + n : ""].filter(Boolean).join(" · ");
        return '<div class="lesson-card" data-kadm-song="' + k + '"><div class="lesson-dot" style="background:oklch(60% 0.13 38);">♪</div>' +
          '<div class="lesson-body"><div class="lesson-name">' + esc(s.title || "Песня") + (s.artist ? " · " + esc(s.artist) : "") + '</div><div class="lesson-sub">' + esc(sub) + "</div></div>" + SVG.chevronRight + "</div>";
      }).join("") +
      '<button class="cta" data-kadm="new" style="margin-top:6px;">+ Новая песня</button>';
  }
  app.innerHTML = karAdmTop("Разметка караоке", st.name) +
    '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:10px;">' + body + "</div>";
  wireActs();
  Array.prototype.forEach.call(app.querySelectorAll("[data-kadm-song]"), function (el) {
    el.onclick = function () {
      KAR.adm.song = KAR.adm.songs[parseInt(el.getAttribute("data-kadm-song"), 10)];
      go("admin-karaoke-edit");
    };
  });
  var nb = app.querySelector('[data-kadm="new"]');
  if (nb) nb.onclick = function () {
    nb.disabled = true; nb.textContent = "Создаю…";
    karAdmFetch("/api/player-tracks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: st.id }) })
      .then(function (d) {
        KAR.adm.songs.push(d.song);
        KAR.adm.song = d.song;
        KAR.adm.editMeta = true;
        go("admin-karaoke-edit");
      })
      .catch(function () { nb.disabled = false; nb.textContent = "Не получилось. Нажми ещё раз"; });
  };
}

/* «+ Новая песня» из Караоке карточки: сразу новая песня и экран, где вводится
   название, текст и загружаются минус и плюс. Назад — список песен ученика,
   оттуда — обратно в Караоке. */
function karNewSong(st, btn) {
  KAR.adm.student = { id: st.id, name: st.name };
  KAR.adm.songs = null; KAR.adm.fromKar = true; KAR.songs = null;
  if (btn) { btn.disabled = true; btn.textContent = "Создаю…"; }
  karAdmFetch("/api/player-tracks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: st.id }) })
    .then(function (d) {
      KAR.adm.song = d.song;
      KAR.adm.editMeta = true;
      go("admin-karaoke-edit");
    })
    .catch(function () {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = "Не получилось. Нажми ещё раз"; }
      else go("karaoke");
    });
}

function karAdmPatch(fields) {
  var s = KAR.adm.song;
  return karAdmFetch("/api/player-tracks?id=" + encodeURIComponent(s.id), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields)
  }).then(function (d) {
    if (d && d.song) {
      Object.keys(d.song).forEach(function (k) { s[k] = d.song[k]; });
    }
    return s;
  });
}

function renderAdminKaraokeEdit() {
  var s = KAR.adm.song;
  if (!s) { go("admin-karaoke-songs"); return; }
  if (!KAE || KAE.song !== s) {
    if (KAE) { try { KAE.el.pause(); } catch (e) {} }
    var el = new Audio();
    el.preload = "auto"; el.setAttribute("playsinline", "");
    if (s.music && s.music.url) el.src = s.music.url;
    KAE = { el: el, song: s, lines: [], cursor: 0, pick: -1, mode: null, dirty: false, saveT: 0, msg: "", marksLoaded: false, marks: {}, showLyrics: false };
    KAE.lines = karBuildLines(s, null);
    KAE.cursor = karAdmFirstUnmarked();
    fetch("/api/karaoke?songId=" + encodeURIComponent(s.id), { headers: bazaAuthHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!KAE || KAE.song !== s) return;
        KAE.lines = karBuildLines(s, d && d.lines ? { lines: d.lines } : null);
        KAE.marksLoaded = true;
        karAdmPaintLines();
      })
      .catch(function () { if (KAE) KAE.marksLoaded = true; });
  }
  var hasMusic = !!(s.music && s.music.url);
  var hasVoice = !!(s.voice && s.voice.url);
  var nLines = KAE.lines.length;
  app.innerHTML = karAdmTop("Разметка караоке", "Режим Николая · " + (KAR.adm.student ? KAR.adm.student.name : "")) +
    '<div class="kadm">' +
      '<div class="fld" data-ka="meta"><span>Песня</span><b>' + esc(s.title || "Песня") + (s.artist ? " · " + esc(s.artist) : "") + " ▾</b></div>" +
      '<div class="kmeta"></div>' +
      '<div class="ksteps">' +
        karAdmStep("voice", 1, hasVoice, "Плюс с голосом", hasVoice ? karAdmFileSub(s.voice) : "Ещё не загружен", hasVoice ? "Заменить" : "Загрузить", "") +
        '<input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" style="display:none" data-ka="vfile">' +
        karAdmStep("music", 2, hasMusic, "Минус", hasMusic ? karAdmFileSub(s.music) : "Без голоса, под него поёт ученик", hasMusic ? "Заменить" : "Загрузить", "") +
        '<input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" style="display:none" data-ka="file">' +
        karAdmStep("lyrics", 3, nLines > 0, "Текст", nLines ? nLines + " " + plural(nLines, "строка", "строки", "строк") : "Ещё не добавлен", nLines ? "Изменить" : "Вставить",
          nLines ? '<div class="kprev">' + KAE.lines.slice(0, 2).map(function (l) { return "<div>" + esc(l.text) + "</div>"; }).join("") +
            (nLines > 2 ? '<div class="more">… ещё ' + (nLines - 2) + " " + plural(nLines - 2, "строка", "строки", "строк") + "</div>" : "") + "</div>" : "") +
      "</div>" +
      '<div class="klyr"></div>' +
      '<div class="khl-hd"><div>Подсказки и дыхание</div>' + (hasMusic && nLines ? '<b data-ka="openkar">Открыть в караоке ›</b>' : "") + "</div>" +
      '<div class="khl"></div>' +
      '<div class="khl-note">Ставятся в караоке: удерживай строку. Тап по подсказке здесь открывает караоке с этой строки.</div>' +
      (hasMusic ? '<div class="play-mini"><button class="pbtn" data-ka="play"></button><div class="bar" data-ka="bar"><i></i></div><div class="tm">0:00</div></div>' : "") +
      '<div class="tapbig' + (hasMusic && nLines ? "" : " off") + '" data-ka="tap">Тап: включить музыку и начать</div>' +
      '<div class="row2"><button class="btn2" data-ka="undo">Отменить тап</button><button class="btn2" data-ka="restart">Разметить заново</button></div>' +
      '<div class="note">Музыка играет — тапаешь в начале каждой строки.</div>' +
      '<div class="msg"></div>' +
    "</div>";
  wireActs();
  karAdmWire();
  karAdmPaintLines();
  if (KAR.adm.editMeta) { KAR.adm.editMeta = false; karAdmOpenMeta(); }
}

function karAdmFirstUnmarked() {
  for (var k = 0; k < KAE.lines.length; k++) if (KAE.lines[k].t == null) return k;
  return KAE.lines.length;
}

/* «Разметка караоке», вариант C (выбран Николаем 17.11): три шага —
   1 плюс с голосом, 2 минус, 3 текст. Готовый шаг — зелёная галочка. */
function karAdmFileSub(t) {
  // имя файла — в одну строку, длинное обрезается многоточием, длительность видна всегда
  return '<span class="fn">' + esc(t.name || "файл") + "</span>" + (t.durationSec ? "<span>&nbsp;· " + karFmt(t.durationSec) + "</span>" : "");
}
function karAdmStep(key, n, done, title, sub, act, extra) {
  return '<div class="kstep" data-ka="' + key + '"><div class="kstep-top">' +
    (done ? '<div class="kstep-n done">✓</div>' : '<div class="kstep-n">' + n + "</div>") +
    '<div class="kstep-t"><b>' + title + '</b><div class="sub">' + sub + "</div></div>" +
    '<b class="kstep-a' + (done ? " ok" : "") + '">' + act + "</b></div>" + extra + "</div>";
}

function karAdmMsg(t, err) {
  var m = app.querySelector(".kadm .msg");
  if (m) {
    m.textContent = t || ""; m.classList.toggle("err", !!err);
    // ошибку видно сразу, даже если строка сообщения ниже экрана
    if (err && m.scrollIntoView) { try { m.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {} }
  }
}

/* Список «Подсказки и дыхание» (заменил список строк, 17.11): только строки, где есть
   V, v или подсказка. Тап по строке — караоке с этой строки. Ставятся они в самом
   караоке долгим нажатием на строку. */
function karAdmPaintLines() {
  var card = app.querySelector(".kadm .khl");
  if (!card || !KAE) return;
  karAdmPaintNext();
  if (!KAE.lines.length) {
    card.innerHTML = '<div class="khl-empty">Сначала вставь текст песни — каждая строка с новой строки, куплеты через пустую строку.</div>';
    return;
  }
  var rows = [];
  KAE.lines.forEach(function (l, k) {
    if (!Object.keys(l.mk).length && !(l.hint || "").trim()) return;
    var words = l.text.split(/\s+/), h = "";
    for (var g = 0; g <= words.length; g++) {
      if (l.mk[g]) h += '<b class="' + l.mk[g] + '">' + l.mk[g] + "</b>";
      if (g < words.length) h += esc(words[g]) + (g < words.length - 1 ? " " : "");
    }
    rows.push('<div class="khl-row" data-hl="' + k + '"><div class="tm">' + (l.t == null ? "—" : karFmt(l.t)) + "</div>" +
      '<div class="tx"><div class="l">' + h + "</div>" + (l.hint ? '<div class="h">' + esc(l.hint) + "</div>" : "") + "</div>" +
      '<div class="cv">›</div></div>');
  });
  card.innerHTML = rows.length ? rows.join("") : '<div class="khl-empty">Пока пусто. Удерживай строку в караоке, чтобы поставить V, v или подсказку.</div>';
  Array.prototype.forEach.call(card.querySelectorAll("[data-hl]"), function (el) {
    el.onclick = function () { karAdmOpenKaraoke(parseInt(el.getAttribute("data-hl"), 10)); };
  });
}

/* Под кнопкой тапа — какая строка следующая (раньше это было видно в списке строк). */
function karAdmPaintNext() {
  var n = app.querySelector(".kadm .note");
  if (!n || !KAE) return;
  if (KAE.el.paused || !KAE.lines.length) { n.textContent = "Музыка играет — тапаешь в начале каждой строки."; return; }
  var l = KAE.lines[KAE.cursor];
  n.textContent = l ? "Следующая (" + (KAE.cursor + 1) + " из " + KAE.lines.length + "): " + l.text : "Все строки размечены ✓";
}

/* Открыть караоке этой песни (с этой строки). Назад — обратно в «Разметку». */
function karAdmOpenKaraoke(k) {
  var s = KAE && KAE.song;
  if (!s) return;
  if (!(s.music && s.music.url)) { karAdmMsg("Сначала загрузи минус — без него караоке не откроется.", true); return; }
  if (KAE.dirty) { clearTimeout(KAE.saveT); karAdmSave(); }
  try { KAE.el.pause(); } catch (e) {}
  s.lyricTimes = KAE.lines.filter(function (l) { return l.t != null; }).map(function (l) { return { i: l.i, t: Math.round(l.t * 100) / 100, text: l.text }; });
  var marks = {};
  KAE.lines.forEach(function (l) {
    if (Object.keys(l.mk).length || (l.hint || "").trim()) marks[l.i] = { text: l.text, mk: JSON.parse(JSON.stringify(l.mk)), hint: (l.hint || "").trim() };
  });
  KAR.marks[s.id] = { lines: marks };
  KAR.song = s;
  KAR.fromAdmEdit = true;
  KAR.tapMode = false;
  KAR.startK = k == null ? null : k;
  go("karaoke-play");
}

/* Большая кнопка в «Разметке»: открывает караоке в режиме разметки и сразу
   включает музыку — с начала или чуть раньше последней размеченной строки. */
function karAdmOpenTap() {
  var s = KAE && KAE.song;
  if (!s || !KAE.lines.length) return;
  if (!(s.music && s.music.url)) { karAdmMsg("Сначала загрузи минус — без него караоке не откроется.", true); return; }
  try { KAE.el.pause(); } catch (e) {}
  if (KAE.cursor >= KAE.lines.length) KAE.cursor = karAdmFirstUnmarked();
  var prev = KAE.lines[KAE.cursor - 1];
  KAR.tapStart = prev && prev.t != null ? Math.max(0, prev.t - 1) : 0;
  KAR.song = s; KAR.fromAdmEdit = true; KAR.tapMode = true; KAR.startK = null;
  go("karaoke-play");
}

function karAdmDirty() {
  KAE.dirty = true;
  karAdmMsg("Сохраняю…");
  clearTimeout(KAE.saveT);
  KAE.saveT = setTimeout(karAdmSave, 1200);
}

function karAdmSave() {
  if (!KAE) return;
  var s = KAE.song, lines = KAE.lines, my = KAE;
  var times = lines.filter(function (l) { return l.t != null; }).map(function (l) { return { i: l.i, t: Math.round(l.t * 100) / 100, text: l.text }; });
  var marks = {};
  lines.forEach(function (l) {
    if (Object.keys(l.mk).length || (l.hint && l.hint.trim())) marks[l.i] = { text: l.text, mk: l.mk, hint: (l.hint || "").trim() };
  });
  Promise.all([
    karAdmPatch({ lyricTimes: times }),
    fetch("/api/karaoke", {
      method: "POST", headers: bazaAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ songId: s.id, studentId: s.studentId, lines: marks })
    }).then(function (r) { if (!r.ok) throw new Error(r.status); })
  ]).then(function () {
    if (KAE !== my) return;
    KAE.dirty = false;
    karAdmMsg("Сохранено ✓");
  }).catch(function () {
    if (KAE !== my) return;
    karAdmMsg("Не сохранилось. Проверь интернет — попробую ещё раз через несколько секунд.", true);
    clearTimeout(KAE.saveT);
    KAE.saveT = setTimeout(karAdmSave, 5000);
  });
}

function karAdmOpenMeta() {
  var box = app.querySelector(".kadm .kmeta");
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; return; }
  var s = KAE.song;
  box.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:8px;margin:-2px 0 12px;">' +
      '<input type="text" data-km="title" placeholder="Название" value="' + esc(s.title === "Новая песня" ? "" : s.title || "") + '">' +
      '<input type="text" data-km="artist" placeholder="Исполнитель" value="' + esc(s.artist || "") + '">' +
      '<div class="row2" style="margin-top:2px"><button class="btn2" data-km="other">Другая песня</button><button class="btn2 main" data-km="save">Сохранить</button></div>' +
    "</div>";
  // Название и исполнитель сохраняются сами, пока печатаешь: раньше без
  // кнопки «Сохранить» они терялись, стоило нажать на «Текст» или «Назад» (17.11).
  Array.prototype.forEach.call(box.querySelectorAll("input"), function (inp) {
    inp.addEventListener("input", function () {
      KAE.pendMeta = function () {
        return { title: box.querySelector('[data-km="title"]').value.trim() || "Без названия", artist: box.querySelector('[data-km="artist"]').value.trim() };
      }();
      karAdmMsg("Сохраняю…");
      clearTimeout(KAE.metaT); KAE.metaT = setTimeout(karAdmSaveMeta, 900);
    });
  });
  box.querySelector('[data-km="other"]').onclick = function () { handleBack(); };
  box.querySelector('[data-km="save"]').onclick = function () {
    var title = box.querySelector('[data-km="title"]').value.trim() || "Без названия";
    var artist = box.querySelector('[data-km="artist"]').value.trim();
    karAdmMsg("Сохраняю…");
    clearTimeout(KAE.metaT); KAE.pendMeta = null;
    karAdmPatch({ title: title, artist: artist }).then(function () { render(); karAdmMsg("Сохранено ✓"); })
      .catch(function () { KAE.pendMeta = { title: title, artist: artist }; karAdmMsg("Название не сохранилось. Проверь интернет — попробую ещё раз через несколько секунд.", true); KAE.metaT = setTimeout(karAdmSaveMeta, 5000); });
  };
}

function karAdmOpenLyrics() {
  var box = app.querySelector(".kadm .klyr");
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; return; }
  box.innerHTML =
    '<div style="margin:-2px 0 12px;">' +
      '<textarea rows="10" placeholder="Вставь текст песни. Каждая строка с новой строки, куплеты разделяй пустой строкой.">' + esc(KAE.song.lyrics || "") + "</textarea>" +
      '<div class="row2"><button class="btn2" data-kl="cancel">Отмена</button><button class="btn2 main" data-kl="save">Сохранить текст</button></div>' +
    "</div>";
  // Текст тоже сохраняется сам через пару секунд после вставки: если уйти
  // с экрана, не нажав «Сохранить текст», он раньше пропадал (17.11).
  box.querySelector("textarea").addEventListener("input", function (e) {
    KAE.pendLyrics = e.target.value.replace(/\r/g, "");
    karAdmMsg("Сохраняю текст…");
    clearTimeout(KAE.lyrT); KAE.lyrT = setTimeout(karAdmSaveLyricsDraft, 1500);
  });
  box.querySelector('[data-kl="cancel"]').onclick = function () { box.innerHTML = ""; };
  box.querySelector('[data-kl="save"]').onclick = function () {
    var txt = box.querySelector("textarea").value.replace(/\r/g, "");
    var raw = txt.split("\n");
    // тайминг и пометки остаются у строк, текст которых не изменился
    var keepT = {}, keepM = {};
    KAE.lines.forEach(function (l) { if (l.t != null) keepT[l.text] = keepT[l.text] || l.t; if (Object.keys(l.mk).length || l.hint) keepM[l.text] = keepM[l.text] || l; });
    var times = [];
    raw.forEach(function (line, i) {
      var tt = line.trim();
      if (tt && keepT[tt] != null) times.push({ i: i, t: keepT[tt], text: tt });
    });
    karAdmMsg("Сохраняю…");
    clearTimeout(KAE.lyrT); KAE.pendLyrics = null;
    karAdmPatch({ lyrics: txt, lyricTimes: times }).then(function () {
      var marks = {};
      KAE.lines = karBuildLines(KAE.song, null);
      KAE.lines.forEach(function (l) { var m = keepM[l.text]; if (m) { l.mk = m.mk; l.hint = m.hint; marks[l.i] = 1; } });
      KAE.cursor = karAdmFirstUnmarked();
      render();
      karAdmDirty();
    }).catch(function () { KAE.pendLyrics = txt; karAdmMsg("Текст не сохранился. Проверь интернет — попробую ещё раз через несколько секунд.", true); KAE.lyrT = setTimeout(karAdmSaveLyricsDraft, 5000); });
  };
}

function karAdmSaveMeta() {
  if (!KAE || !KAE.pendMeta) return Promise.resolve();
  var my = KAE, f = KAE.pendMeta;
  clearTimeout(my.metaT);
  return karAdmPatch(f).then(function () {
    if (my.pendMeta === f) my.pendMeta = null;
    if (KAE === my && state.screen === "admin-karaoke-edit") {
      var b = app.querySelector('.kadm [data-ka="meta"] b');
      if (b) b.textContent = (my.song.title || "Песня") + (my.song.artist ? " · " + my.song.artist : "") + " ▾";
      karAdmMsg("Сохранено ✓");
    }
  }).catch(function () {
    karAdmMsg("Название не сохранилось. Проверь интернет — попробую ещё раз через несколько секунд.", true);
    my.metaT = setTimeout(function () { if (KAE === my) karAdmSaveMeta(); }, 5000);
  });
}

// Черновик текста: сохраняем как есть, тайминг оставляем у строк, текст которых не изменился.
function karAdmSaveLyricsDraft() {
  if (!KAE || KAE.pendLyrics == null) return Promise.resolve();
  var my = KAE, txt = KAE.pendLyrics;
  clearTimeout(my.lyrT);
  var keepT = {};
  my.lines.forEach(function (l) { if (l.t != null) keepT[l.text] = keepT[l.text] || l.t; });
  var times = [];
  txt.split("\n").forEach(function (line, i) { var tt = line.trim(); if (tt && keepT[tt] != null) times.push({ i: i, t: keepT[tt], text: tt }); });
  return karAdmPatch({ lyrics: txt, lyricTimes: times }).then(function () {
    if (my.pendLyrics === txt) my.pendLyrics = null;
    var keepM = {};
    my.lines.forEach(function (l) { if (Object.keys(l.mk).length || l.hint) keepM[l.text] = keepM[l.text] || l; });
    my.lines = karBuildLines(my.song, null);
    my.lines.forEach(function (l) { var m = keepM[l.text]; if (m) { l.mk = m.mk; l.hint = m.hint; } });
    my.cursor = karAdmFirstUnmarked();
    if (Object.keys(keepM).length && KAE === my) karAdmDirty();
    if (KAE === my && state.screen === "admin-karaoke-edit") { karAdmPaintLines(); karAdmMsg("Текст сохранён ✓"); }
  }).catch(function () {
    karAdmMsg("Текст не сохранился. Проверь интернет — попробую ещё раз через несколько секунд.", true);
    my.lyrT = setTimeout(function () { if (KAE === my) karAdmSaveLyricsDraft(); }, 5000);
  });
}

// Ушёл с экрана, не дождавшись автосохранения, — сохраняем сразу.
function karAdmFlush() {
  if (!KAE) return;
  if (KAE.pendMeta) karAdmSaveMeta();
  if (KAE.pendLyrics != null) {
    karAdmSaveLyricsDraft();
  }
}

function karAdmUpload(file, kind) {
  if (!file) return;
  var isVoice = kind === "voice", word = isVoice ? "плюс" : "минус", Word = isVoice ? "Плюс" : "Минус";
  if (file.size > 80 * 1024 * 1024) { karAdmMsg("Файл больше 80 МБ — возьми файл поменьше.", true); return; }
  karAdmMsg("Загружаю " + word + "… 0%");
  var ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  var name = "tracks/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "." + ext;
  function withClient() {
    if (window.BlobClient && window.BlobClient.upload) return Promise.resolve(window.BlobClient);
    return new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "/vendor/blob-client.js";
      sc.onload = function () { window.BlobClient ? res(window.BlobClient) : rej(new Error("no client")); };
      sc.onerror = rej;
      document.head.appendChild(sc);
    });
  }
  var dur = 0;
  var probe = new Audio();
  var probeUrl = URL.createObjectURL(file);
  probe.preload = "metadata"; probe.src = probeUrl;
  probe.onloadedmetadata = function () { dur = isFinite(probe.duration) ? probe.duration : 0; };
  withClient().then(function (BC) {
    return BC.upload(name, file, {
      access: "public",
      contentType: file.type || "audio/mpeg",
      handleUploadUrl: BAZA_API + "/api/player-upload",
      clientPayload: state._siteAuth || "",
      onUploadProgress: function (p) { karAdmMsg("Загружаю " + word + "… " + Math.round(p.percentage) + "%"); }
    });
  }).then(function (blob) {
    karAdmMsg("Сохраняю…");
    return karAdmPeaks(file).catch(function () { return null; }).then(function (pk) {
      var f = {};
      f[isVoice ? "voice" : "music"] = { url: blob.url, name: file.name, durationSec: Math.round(dur) };
      // Как на сайте: основная волна песни — с плюса, если он есть.
      if (pk) {
        if (isVoice) { f.peaksVoice = pk; f.peaks = pk; }
        else { f.peaksMusic = pk; if (!(KAE.song.voice && KAE.song.voice.url)) f.peaks = pk; }
      }
      return karAdmPatch(f);
    });
  }).then(function () {
    URL.revokeObjectURL(probeUrl);
    if (!isVoice) {
      try { KAE.el.pause(); } catch (e) {}
      KAE.el.src = KAE.song.music.url;
    }
    render();
    karAdmMsg(Word + " загружен ✓");
  }).catch(function () {
    karAdmMsg(Word + " не загрузился. Если ты давно не входил, выйди из режима админа и войди по ключам заново.", true);
  });
}

// Волна для «Репертуара» на сайте — те же 90 столбиков, что считает сайт.
function karAdmPeaks(file) {
  return file.arrayBuffer().then(function (ab) {
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx;
    try { ctx = new Off(1, 1, 22050); } catch (e) { ctx = getAudioCtx(); }
    return new Promise(function (res, rej) { var p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  }).then(function (buf) {
    var ch = buf.getChannelData(0), N = 90, step = Math.floor(ch.length / N) || 1, out = [], mx = 1e-6;
    for (var i = 0; i < N; i++) {
      var m = 0;
      for (var j = i * step; j < (i + 1) * step && j < ch.length; j += 16) m = Math.max(m, Math.abs(ch[j]));
      out.push(m); if (m > mx) mx = m;
    }
    return out.map(function (v) { return v / mx; });
  });
}

function karAdmWire() {
  var root = app.querySelector(".kadm");
  var q = function (k) { return root.querySelector('[data-ka="' + k + '"]'); };
  q("meta").onclick = karAdmOpenMeta;
  q("lyrics").onclick = karAdmOpenLyrics;
  var file = q("file");
  q("music").onclick = function () { file.click(); };
  file.onchange = function () { karAdmUpload(file.files && file.files[0], "music"); file.value = ""; };
  var vfile = q("vfile");
  q("voice").onclick = function () { vfile.click(); };
  vfile.onchange = function () { karAdmUpload(vfile.files && vfile.files[0], "voice"); vfile.value = ""; };
  var ok = q("openkar");
  if (ok) ok.onclick = function () { karAdmOpenKaraoke(null); };
  var tap = q("tap");
  // Тапы ставятся в караоке (текст перед глазами) — см. karAdmOpenTap.
  tap.addEventListener("click", function () { karAdmOpenTap(); });
  q("undo").onclick = function () {
    if (KAE.cursor <= 0) return;
    KAE.cursor--;
    var l = KAE.lines[KAE.cursor];
    if (l.t != null) {
      try { KAE.el.currentTime = Math.max(0, l.t - 2); } catch (e) {}
      l.t = null;
      karAdmPaintLines(); karAdmDirty();
    }
  };
  q("restart").onclick = function () {
    if (!confirm("Стереть тайминг всех строк и разметить заново? Пометки V, v и подсказки останутся.")) return;
    KAE.lines.forEach(function (l) { l.t = null; });
    KAE.cursor = 0;
    try { KAE.el.pause(); KAE.el.currentTime = 0; } catch (e) {}
    karAdmPaintLines(); karAdmPaintPlay(); karAdmDirty();
  };
  var pb = q("play");
  if (pb) {
    pb.onclick = function () {
      if (KAE.el.paused) { var p = KAE.el.play(); if (p && p.catch) p.catch(function () {}); } else KAE.el.pause();
      karAdmPaintPlay();
    };
    var bar = q("bar");
    bar.onclick = function (ev) {
      var r = bar.getBoundingClientRect();
      if (KAE.el.duration) KAE.el.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * KAE.el.duration;
    };
    karAdmPaintPlay();
    KAE.el.onplay = KAE.el.onpause = karAdmPaintPlay;
    clearInterval(KAE.iv);
    KAE.iv = setInterval(function () {
      if (!KAE || state.screen !== "admin-karaoke-edit") { if (KAE) { clearInterval(KAE.iv); try { KAE.el.pause(); } catch (e) {} } return; }
      var i = app.querySelector(".kadm .bar i"), tm = app.querySelector(".kadm .play-mini .tm");
      var d = KAE.el.duration || 0, t = KAE.el.currentTime || 0;
      if (i) i.style.width = (d ? t / d * 100 : 0) + "%";
      if (tm) tm.textContent = karFmt(t) + " / " + karFmt(d);
    }, 200);
  }
}

function karAdmPaintPlay() {
  var pb = app.querySelector('.kadm [data-ka="play"]');
  if (pb && KAE) pb.innerHTML = KAE.el.paused
    ? '<svg width="14" height="16" viewBox="0 0 12 14"><path d="M1.5 1l10 6-10 6V1z" fill="var(--terra)"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 18 20"><rect x="2" y="1" width="5" height="18" rx="1.5" fill="var(--terra)"/><rect x="11" y="1" width="5" height="18" rx="1.5" fill="var(--terra)"/></svg>';
  var tap = app.querySelector('.kadm [data-ka="tap"]');
  if (tap && KAE) tap.textContent = "Тап: включить музыку и начать";
  karAdmPaintNext();
}

/* ---------- подключение к навигации app.js ---------- */

function renderKaraokeScreen() {
  switch (state.screen) {
    case "karaoke": renderKaraokeList(); break;
    case "karaoke-play": renderKaraokePlay(); break;
    case "admin-karaoke": renderAdminKaraoke(); break;
    case "admin-karaoke-songs": renderAdminKaraokeSongs(); break;
    case "admin-karaoke-edit": renderAdminKaraokeEdit(); break;
  }
}

ACTS["cab-karaoke"] = function () { go("karaoke"); };
ACTS["admin-hub-karaoke"] = function () { go("admin-karaoke"); };
