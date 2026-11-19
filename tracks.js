/* ==========================================================================
   «МОИ ТРЕКИ» (20.11) — сетка карточек вместо списка на экране караоке.

   Модули (глобальные, как остальной код приложения):
     KaraokeSettings — «Цвета фона» караоке: набор цветов, вкл/выкл, свои цвета,
                       цвет, закреплённый за треком. Хранится на устройстве.
     TrackCovers     — обложки: что уже есть на сервере (KAR.covers), фоновая
                       очередь разбора файлов (CoverExtractor), отправка на сервер.
     TrackCard       — разметка одной карточки (трек / черновик / «+ Добавить
                       трек» / skeleton).
     TrackGrid       — виртуальная сетка 2 в ряд: в DOM только видимые карточки
                       ± запас, подгрузка страницами по 20.
     TrackEditSheet  — шторка «Исполнитель / Название / Заменить обложку».
     KarBg           — фон плеера караоке по палитре обложки (PaletteResolver).

   Песни — те же, что были (Репертуар ученика в baza-dannih). Название и
   исполнитель, которые Николай ввёл сам, всегда главнее тегов файла: теги
   подставляются, только если поле пустое.
   ========================================================================== */

/* ---------- KaraokeSettings ---------- */

var KaraokeSettings = (function () {
  var KEY = "kar.colors.v1", SONG = "kar.bg.";
  function load() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    o.off = o.off && typeof o.off === "object" ? o.off : {};
    o.custom = Array.isArray(o.custom) ? o.custom.filter(function (c) { return c && PaletteResolver.hexToRgb(c.hex); }) : [];
    return o;
  }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function list() {
    var o = load();
    return PaletteResolver.PRESETS.map(function (p) { return { id: p.id, name: p.name, hex: p.hex, on: !o.off[p.id], custom: false }; })
      .concat(o.custom.map(function (c) { return { id: "c" + c.hex.slice(1), name: "Свой цвет", hex: c.hex, on: c.on !== false, custom: true }; }));
  }
  return {
    list: list,
    enabled: function () { return list().filter(function (c) { return c.on; }).map(function (c) { return c.hex; }); },
    toggle: function (id) {
      var o = load();
      if (id.charAt(0) === "c") o.custom.forEach(function (c) { if ("c" + c.hex.slice(1) === id) c.on = c.on === false; });
      else o.off[id] = !o.off[id];
      save(o);
    },
    addCustom: function (hex) {
      hex = String(hex || "").toLowerCase();
      if (!PaletteResolver.hexToRgb(hex)) return false;
      var o = load();
      if (o.custom.some(function (c) { return c.hex === hex; })) return false;
      o.custom.push({ hex: hex, on: true }); save(o); return true;
    },
    removeCustom: function (hex) {
      var o = load();
      o.custom = o.custom.filter(function (c) { return c.hex !== hex; }); save(o);
    },
    savedFor: function (songId) { try { return localStorage.getItem(SONG + songId) || null; } catch (e) { return null; } },
    saveFor: function (songId, hex) {
      try { if (hex) localStorage.setItem(SONG + songId, hex); else localStorage.removeItem(SONG + songId); } catch (e) {}
    }
  };
})();

/* ---------- общие мелочи ---------- */

function trkHaptic() {
  try {
    var h = window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback;
    if (h && h.impactOccurred) { h.impactOccurred("light"); return; }
    if (navigator.vibrate) navigator.vibrate(8);
  } catch (e) {}
}

// Из какого файла брать обложку: плюс (оригинал с голосом), иначе минус.
function trkSrc(song) {
  if (song.voice && song.voice.url) return { url: song.voice.url, name: song.voice.name || "" };
  if (song.music && song.music.url) return { url: song.music.url, name: song.music.name || "" };
  return null;
}

function trkCover(song) { return (KAR.covers && KAR.covers[song.id]) || null; }

function trkCoverUrl(song) {
  var c = trkCover(song);
  if (!c || c.status !== "cover") return "";
  if (c.local) return c.local;
  return c.v ? "/api/karaoke-cover?id=" + encodeURIComponent(song.id) + "&v=" + c.v : "";
}

// Что показать на карточке. Ввод Николая главнее тегов файла.
function trkLabels(song) {
  var c = trkCover(song) || {};
  var t = String(song.title || "").trim();
  if (!t || t === "Новая песня") t = c.tagTitle || "";
  if (!t) { var s = trkSrc(song); t = s ? CoverExtractor.baseName(s.name || s.url) : "Песня"; }
  var a = String(song.artist || "").trim() || c.tagArtist || "";
  return { artist: a, title: t };
}

function trkBlobToB64(blob) {
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onload = function () { res(String(fr.result).split(",")[1] || ""); };
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/* ---------- TrackCovers: фоновый разбор файлов ---------- */

var TrackCovers = {
  tried: {}, q: [], busy: 0,

  // Нужно ли разбирать файл этого трека.
  need: function (song) {
    var s = trkSrc(song);
    if (!s) return false;
    var c = trkCover(song);
    if (c && (c.manual || c.src === s.url)) return false;
    return !TrackCovers.tried[song.id + "|" + s.url];
  },

  enqueue: function (song) {
    if (!TrackCovers.need(song)) return;
    TrackCovers.tried[song.id + "|" + trkSrc(song).url] = true;
    TrackCovers.q.push(song);
    TrackCovers.pump();
  },

  pump: function () {
    while (TrackCovers.busy < 2 && TrackCovers.q.length) {
      var song = TrackCovers.q.shift();
      TrackCovers.busy++;
      var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 30); };
      (function (sg) {
        idle(function () {
          TrackCovers.run(sg).catch(function () {}).then(function () { TrackCovers.busy--; TrackCovers.pump(); });
        });
      })(song);
    }
  },

  run: function (song) {
    var src = trkSrc(song);
    return CoverExtractor.read(src.url, src.name).then(function (r) {
      var rec = { src: src.url, tagTitle: r.titleFromTags ? r.title : "", tagArtist: r.artist || "", status: r.picture ? "cover" : r.ok ? "none" : "broken", manual: false, v: 0, palette: null };
      if (!r.picture) return TrackCovers.store(song, rec, null);
      return CoverExtractor.thumb(r.picture).then(function (t) {
        rec.palette = PaletteResolver.fromPixels(t.pixels, t.size, t.size);
        rec.local = URL.createObjectURL(t.jpeg);
        return trkBlobToB64(t.jpeg).then(function (b64) { return TrackCovers.store(song, rec, b64); });
      }, function () {
        rec.status = "broken"; // картинка в теге есть, но не декодируется
        return TrackCovers.store(song, rec, null);
      });
    });
  },

  store: function (song, rec, b64) {
    var cur = trkCover(song);
    if (cur && cur.manual) return Promise.resolve();
    KAR.covers = KAR.covers || {};
    KAR.covers[song.id] = rec;
    TrackGrid.refreshSong(song.id);
    return TrackCovers.post({
      songId: song.id, src: rec.src, jpeg: b64, palette: rec.palette,
      tagTitle: rec.tagTitle, tagArtist: rec.tagArtist, status: rec.status
    }).then(function (d) { if (d && d.v) rec.v = d.v; }).catch(function () { /* покажем локально, сервер попробует в следующий раз */ });
  },

  post: function (payload) {
    var send = function (headers) {
      return fetch("/api/karaoke-cover", { method: "POST", headers: headers, body: JSON.stringify(payload) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    };
    if (karIsAdm()) return send(bazaAuthHeaders({ "Content-Type": "application/json" }));
    return karSession().then(function (sess) { return send({ "Content-Type": "application/json", "X-Player-Session": sess }); });
  }
};

/* ---------- TrackCard ---------- */

var TRK_ICO = {
  pencil: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  note: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.7"/><circle cx="17" cy="16" r="3" stroke="currentColor" stroke-width="1.7"/></svg>'
};

var TrackCard = {
  html: function (it) {
    if (it.kind === "skel") {
      return '<div class="trk-card trk-skel" aria-hidden="true"><div class="trk-cover"></div><div class="trk-meta"><i></i><i></i></div></div>';
    }
    if (it.kind === "add") {
      return '<div class="trk-card trk-add" role="button" tabindex="0" data-trk-add aria-label="Добавить трек">' +
        '<div class="trk-add-ic">' + TRK_ICO.plus + '</div><div class="trk-add-t">Добавить трек</div></div>';
    }
    var s = it.song, lb = trkLabels(s), url = trkCoverUrl(s), c = trkCover(s) || {}, adm = karIsAdm() || state.isAdmin;
    var tint = c.palette && c.palette.dominant ? ' style="--tc:' + c.palette.dominant + ";--tc2:" + (c.palette.second || c.palette.dominant) + '"' : "";
    var cover = url
      ? '<img src="' + esc(url) + '" alt="" loading="lazy" decoding="async" draggable="false">'
      : '<div class="trk-ph">' + TRK_ICO.note + (adm ? '<span>Добавьте обложку вручную</span>' : "") + "</div>";
    var line1 = lb.artist || lb.title, line2 = lb.artist ? lb.title : "";
    var badge = it.kind === "draft" ? '<span class="trk-badge">нет минуса</span>' : "";
    var label = (it.kind === "draft" ? "Открыть песню: " : "Петь: ") + (lb.artist ? lb.artist + " — " : "") + lb.title;
    return '<div class="trk-card' + (it.kind === "draft" ? " trk-draft" : "") + '"' + tint + ' role="button" tabindex="0" aria-label="' + esc(label) + '">' +
      '<div class="trk-tint"></div>' +
      '<div class="trk-cover">' + cover + badge + "</div>" +
      (adm ? '<button class="trk-edit" type="button" data-trk-edit aria-label="Изменить трек">' + TRK_ICO.pencil + "</button>" : "") +
      '<div class="trk-meta"><div class="trk-artist">' + esc(line1) + "</div>" + (line2 ? '<div class="trk-title">' + esc(line2) + "</div>" : "") + "</div>" +
      "</div>";
  }
};

/* ---------- TrackGrid: виртуальная сетка ---------- */

var TrackGrid = {
  GAP: 14, PAGE: 20, BUF: 3,
  g: null,

  /* items: [{kind:'song'|'draft'|'add'|'skel', song}]
     opts: { onOpen(item), onEdit(item), onAdd(el) } */
  mount: function (el, items, opts) {
    TrackGrid.destroy();
    var g = TrackGrid.g = { el: el, items: items, opts: opts || {}, nodes: {}, limit: TrackGrid.PAGE, raf: 0 };
    el.classList.add("trk-grid");
    g.onScroll = function () { if (!g.raf) g.raf = requestAnimationFrame(function () { g.raf = 0; TrackGrid.paint(); }); };
    g.onResize = function () { g.nodes = {}; el.innerHTML = ""; TrackGrid.paint(); };
    window.addEventListener("scroll", g.onScroll, { passive: true });
    window.addEventListener("resize", g.onResize);
    TrackGrid.wire(el);
    TrackGrid.paint();
  },

  destroy: function () {
    var g = TrackGrid.g;
    if (!g) return;
    window.removeEventListener("scroll", g.onScroll);
    window.removeEventListener("resize", g.onResize);
    cancelAnimationFrame(g.raf);
    TrackGrid.g = null;
  },

  geom: function () {
    var g = TrackGrid.g, W = g.el.clientWidth || 390;
    var cw = (W - TrackGrid.GAP) / 2, ch = Math.round(cw * 1.25);
    return { cw: cw, ch: ch, rowH: ch + TrackGrid.GAP };
  },

  paint: function () {
    var g = TrackGrid.g;
    if (!g) return;
    if (!document.body.contains(g.el)) { TrackGrid.destroy(); return; }
    var m = TrackGrid.geom(), n = Math.min(g.items.length, g.limit);
    var rows = Math.ceil(n / 2);
    g.el.style.height = Math.max(0, rows * m.rowH - TrackGrid.GAP) + "px";
    var top = g.el.getBoundingClientRect().top, vh = window.innerHeight || 800;
    var r0 = Math.max(0, Math.floor(-top / m.rowH) - TrackGrid.BUF);
    var r1 = Math.min(rows - 1, Math.floor((vh - top) / m.rowH) + TrackGrid.BUF);
    // следующая страница, когда до конца уже показанного осталось 2 ряда
    if (n < g.items.length && r1 >= rows - 2) {
      g.limit += TrackGrid.PAGE;
      return TrackGrid.paint();
    }
    var want = {};
    for (var i = r0 * 2; i <= r1 * 2 + 1 && i < n; i++) want[i] = true;
    Object.keys(g.nodes).forEach(function (k) {
      if (!want[k]) { g.el.removeChild(g.nodes[k]); delete g.nodes[k]; }
    });
    Object.keys(want).forEach(function (k) {
      var idx = +k;
      if (g.nodes[idx]) return;
      var it = g.items[idx];
      var wrap = document.createElement("div");
      wrap.innerHTML = TrackCard.html(it);
      var node = wrap.firstChild;
      node.setAttribute("data-trk", idx);
      node.style.width = m.cw + "px"; node.style.height = m.ch + "px";
      node.style.transform = "translate(" + (idx % 2 ? m.cw + TrackGrid.GAP : 0) + "px," + Math.floor(idx / 2) * m.rowH + "px)";
      g.el.appendChild(node);
      g.nodes[idx] = node;
      if (it.song) TrackCovers.enqueue(it.song);
    });
  },

  // Карточка этого трека перерисуется (появилась обложка, поменялось название).
  refreshSong: function (songId) {
    var g = TrackGrid.g;
    if (!g) return;
    Object.keys(g.nodes).forEach(function (k) {
      var it = g.items[k];
      if (it.song && it.song.id === songId) { g.el.removeChild(g.nodes[k]); delete g.nodes[k]; }
    });
    TrackGrid.paint();
  },

  wire: function (el) {
    var lp = 0, lpDone = false, x0 = 0, y0 = 0, pressed = null;
    function card(e) { return e.target.closest && e.target.closest("[data-trk]"); }
    function item(c) { var g = TrackGrid.g; return g && g.items[+c.getAttribute("data-trk")]; }
    function release() { clearTimeout(lp); lp = 0; if (pressed) pressed.classList.remove("pressed"); pressed = null; }
    el.addEventListener("pointerdown", function (e) {
      var c = card(e);
      if (!c || c.classList.contains("trk-skel") || e.target.closest("[data-trk-edit]")) return;
      x0 = e.clientX; y0 = e.clientY; lpDone = false;
      pressed = c; c.classList.add("pressed"); trkHaptic();
      var it = item(c), g = TrackGrid.g;
      if (it && it.song && g.opts.onEdit && (state.isAdmin || karIsAdm())) {
        lp = setTimeout(function () { lp = 0; lpDone = true; release(); trkHaptic(); g.opts.onEdit(it); }, 500);
      }
    });
    el.addEventListener("pointermove", function (e) { if (pressed && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) release(); });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("contextmenu", function (e) { if (card(e)) e.preventDefault(); });
    function activate(e) {
      var g = TrackGrid.g, c = card(e);
      if (!g || !c) return;
      if (lpDone) { lpDone = false; return; }
      var it = item(c);
      if (!it || it.kind === "skel") return;
      if (e.target.closest("[data-trk-edit]")) { trkHaptic(); if (g.opts.onEdit) g.opts.onEdit(it); return; }
      if (it.kind === "add") { if (g.opts.onAdd) g.opts.onAdd(c); return; }
      if (g.opts.onOpen) g.opts.onOpen(it);
    }
    el.addEventListener("click", activate);
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!card(e)) return;
      e.preventDefault(); activate(e);
    });
  }
};

/* Skeleton на время загрузки — 6 карточек той же формы. */
function trkSkeletonHtml() {
  var h = "";
  for (var i = 0; i < 6; i++) h += TrackCard.html({ kind: "skel" });
  return '<div class="trk-skel-grid">' + h + "</div>";
}

/* ---------- TrackEditSheet ---------- */

var TrackEditSheet = {
  open: function (song, onFull) {
    var lb = trkLabels(song), url = trkCoverUrl(song);
    var ov = document.createElement("div");
    ov.className = "trk-shade";
    ov.innerHTML =
      '<div class="hw-sheet trk-sheet" role="dialog" aria-modal="true" aria-label="Изменить трек">' +
        '<div class="hw-grip"></div>' +
        '<div class="hw-sheet-title">Изменить трек</div>' +
        '<div class="trk-sheet-cover"><div class="trk-sheet-img">' + (url ? '<img src="' + esc(url) + '" alt="Обложка">' : TRK_ICO.note) + "</div>" +
          '<label class="trk-sheet-btn">Заменить обложку<input type="file" accept="image/*" hidden></label></div>' +
        '<label class="field-label" for="trk-artist">Исполнитель</label>' +
        '<input id="trk-artist" class="field-input mb" maxlength="120" autocomplete="off" value="' + esc(song.artist || (trkCover(song) || {}).tagArtist || "") + '">' +
        '<label class="field-label" for="trk-title">Название</label>' +
        '<input id="trk-title" class="field-input" maxlength="160" autocomplete="off" value="' + esc(lb.title) + '" aria-describedby="trk-err">' +
        '<div class="trk-err" id="trk-err" role="alert"></div>' +
        (onFull ? '<button class="trk-sheet-link" type="button" data-trs="full">Текст, минус и разметка<span>›</span></button>' : "") +
        '<div class="trk-sheet-row"><button class="trk-sheet-cancel" type="button" data-trs="cancel">Отмена</button>' +
          '<button class="cta" type="button" data-trs="save">Сохранить</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    var sheet = ov.querySelector(".trk-sheet"), file = null, preview = null;
    var tIn = ov.querySelector("#trk-title"), aIn = ov.querySelector("#trk-artist"), err = ov.querySelector(".trk-err");
    function close() { if (preview) URL.revokeObjectURL(preview); if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector('[data-trs="cancel"]').onclick = close;
    var full = ov.querySelector('[data-trs="full"]');
    if (full) full.onclick = function () { close(); onFull(); };
    tIn.addEventListener("input", function () { if (tIn.value.trim()) { err.textContent = ""; tIn.classList.remove("bad"); } });
    ov.querySelector('input[type="file"]').addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.textContent = "Это не картинка — выбери фото обложки."; return; }
      file = f;
      if (preview) URL.revokeObjectURL(preview);
      preview = URL.createObjectURL(f);
      ov.querySelector(".trk-sheet-img").innerHTML = '<img src="' + preview + '" alt="Новая обложка">';
    });
    ov.querySelector('[data-trs="save"]').onclick = function () {
      var title = tIn.value.trim(), artist = aIn.value.trim(), btn = this;
      if (!title) { err.textContent = "Введи название трека"; tIn.classList.add("bad"); tIn.focus(); return; }
      btn.disabled = true; btn.textContent = "Сохраняю…"; err.textContent = "";
      var jobs = [];
      if (title !== String(song.title || "").trim() || artist !== String(song.artist || "").trim()) {
        jobs.push(karAdmFetch("/api/player-tracks?id=" + encodeURIComponent(song.id), {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title, artist: artist })
        }).then(function (d) { song.title = (d && d.song && d.song.title) || title; song.artist = d && d.song ? d.song.artist : artist; }));
      }
      if (file) {
        jobs.push(CoverExtractor.thumb(file).then(function (t) {
          var pal = PaletteResolver.fromPixels(t.pixels, t.size, t.size);
          return trkBlobToB64(t.jpeg).then(function (b64) {
            return fetch("/api/karaoke-cover", {
              method: "POST", headers: bazaAuthHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ songId: song.id, jpeg: b64, palette: pal, status: "cover", manual: true })
            }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
              var c = trkCover(song) || {};
              KAR.covers = KAR.covers || {};
              KAR.covers[song.id] = { src: "", palette: pal, tagTitle: c.tagTitle || "", tagArtist: c.tagArtist || "", status: "cover", manual: true, v: d.v, local: URL.createObjectURL(t.jpeg) };
            });
          });
        }));
      }
      Promise.all(jobs).then(function () {
        close();
        TrackGrid.refreshSong(song.id);
      }).catch(function () {
        btn.disabled = false; btn.textContent = "Сохранить";
        err.textContent = "Не сохранилось. Если ты давно не входил, выйди из режима админа и войди по ключам заново.";
      });
    };
    setTimeout(function () { sheet.classList.add("on"); }, 0);
  }
};

/* ---------- KarBg: фон караоке по обложке ---------- */

var KarBg = {
  theme: function () { return document.documentElement.classList.contains("dark") ? "dark" : "light"; },

  // Палитра трека: с сервера (посчитана при разборе обложки), иначе — сейчас из картинки.
  palette: function (song) {
    var c = trkCover(song);
    if (!c || c.status !== "cover") return Promise.resolve(null);
    if (c.palette) return Promise.resolve(c.palette);
    var url = trkCoverUrl(song);
    if (!url) return Promise.resolve(null);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(CoverExtractor.thumb).then(function (t) { c.palette = PaletteResolver.fromPixels(t.pixels, t.size, t.size); return c.palette; })
      .catch(function () { return null; });
  },

  apply: function (root, song, opts) {
    opts = opts || {};
    return KarBg.palette(song).then(function (pal) {
      if (!root.isConnected) return;
      var saved = KaraokeSettings.savedFor(song.id);
      var r = PaletteResolver.resolve(pal, { saved: saved, enabled: KaraokeSettings.enabled(), theme: KarBg.theme() });
      // случайный цвет закрепляется за треком, чтобы не менялся при каждом запуске
      if (r.source === "preset") KaraokeSettings.saveFor(song.id, r.color);
      KarBg.paint(root, r);
      KP.bg = { res: r, pal: pal };
      return r;
    });
  },

  paint: function (root, r) {
    var light = r.lightText, rgb = PaletteResolver.hexToRgb(r.text).join(",");
    root.classList.add("pal");
    root.classList.toggle("dk", !light);
    var st = root.style;
    st.setProperty("--kb1", r.base);
    st.setProperty("--kb2", r.deep);
    st.setProperty("--g1", r.base);
    st.setProperty("--g2", r.glow2);
    st.setProperty("--g3", r.deep); // нижнее пятно — тёмное: светлое пятно под текстом съедало контраст
    st.setProperty("--hi", r.text);
    st.setProperty("--gtx", r.text);
    st.setProperty("--dim", "rgba(" + rgb + "," + (light ? 0.55 : 0.6) + ")");
    st.setProperty("--acc", r.accent);
    // полоса под часами на iPhone — в цвет фона
    document.documentElement.style.setProperty("--kp-page", r.base);
    document.documentElement.classList.add("kp-pal");
  },

  // «Перемешать цвет»: случайный включённый цвет, не текущий, закрепляется за треком.
  shuffle: function (root, song) {
    var cur = KP.bg && KP.bg.res ? KP.bg.res.color : null;
    var pal = KP.bg ? KP.bg.pal : null;
    var hex = PaletteResolver.pickPreset(KaraokeSettings.enabled(), { exclude: cur, theme: KarBg.theme(), cover: pal && pal.average });
    KaraokeSettings.saveFor(song.id, hex);
    return KarBg.apply(root, song);
  },

  // Вернуть цвет обложки (если обложка цветная).
  useCover: function (root, song) {
    KaraokeSettings.saveFor(song.id, null);
    return KarBg.apply(root, song);
  }
};

/* Шторка «Цвета фона» в плеере караоке. */
function karOpenColors() {
  var old = KP.root.querySelector(".ksheet");
  if (old) old.parentNode.removeChild(old);
  var d = document.createElement("div");
  d.className = "ksheet kcolors";
  KP.root.appendChild(d);
  KP.sheet = d;
  karPaintColors();
}

function karPaintColors() {
  var d = KP.sheet, s = KAR.song;
  if (!d || !d.parentNode || !s) return;
  var cur = KP.bg && KP.bg.res ? KP.bg.res.color : "";
  var coverOk = KP.bg && KP.bg.pal && !KP.bg.pal.mono;
  var list = KaraokeSettings.list();
  var none = !list.some(function (c) { return c.on; });
  d.innerHTML =
    '<div class="t">Цвета фона</div>' +
    '<div class="s">' + (coverOk ? "Фон берётся из обложки. " : "Обложка без цвета — фон из включённых цветов. ") + "Нажми на цвет, чтобы включить или выключить его.</div>" +
    '<div class="kcol-grid">' + list.map(function (c) {
      return '<button type="button" class="kcol' + (c.on ? " on" : "") + (c.hex === cur ? " cur" : "") + '" data-col="' + c.id + '" style="--c:' + c.hex + '" aria-pressed="' + c.on + '" aria-label="' + esc(c.name) + (c.on ? ", включён" : ", выключен") + '">' +
        (c.custom ? '<span class="kcol-x" data-colx="' + c.hex + '" aria-label="Удалить свой цвет">✕</span>' : "") + "</button>";
    }).join("") +
      '<label class="kcol kcol-add" aria-label="Добавить свой цвет">+<input type="color" value="#3b6ea5"></label>' +
    "</div>" +
    (none ? '<div class="s" style="margin-top:8px">Все цвета выключены — будет терракота.</div>' : "") +
    '<div class="row" style="display:flex;gap:10px;margin-top:14px">' +
      (coverOk && KaraokeSettings.savedFor(s.id) ? '<div class="bt" data-s="cover">Цвет обложки</div>' : "") +
      '<div class="bt" data-s="shuffle">Перемешать цвет</div><div class="bt main" data-s="ok">Готово</div></div>';
  Array.prototype.forEach.call(d.querySelectorAll("[data-col]"), function (b) {
    b.onclick = function (e) {
      var x = e.target.closest("[data-colx]");
      if (x) { KaraokeSettings.removeCustom(x.getAttribute("data-colx")); karPaintColors(); return; }
      KaraokeSettings.toggle(b.getAttribute("data-col"));
      karPaintColors();
    };
  });
  var inp = d.querySelector('.kcol-add input');
  inp.addEventListener("change", function () {
    var hex = inp.value.toLowerCase();
    if (PaletteResolver.contrast("#ffffff", hex) < 4.5 && PaletteResolver.contrast("#14181b", PaletteResolver.darken(hex, 0.45)) < 4.5) {
      karToast("Этот цвет слишком средний: текст на нём плохо читается. Выбери темнее или светлее.", true);
      return;
    }
    KaraokeSettings.addCustom(hex);
    karPaintColors();
  });
  d.querySelector('[data-s="shuffle"]').onclick = function () { KarBg.shuffle(KP.root, s).then(karPaintColors); };
  var cv = d.querySelector('[data-s="cover"]');
  if (cv) cv.onclick = function () { KarBg.useCover(KP.root, s).then(karPaintColors); };
  d.querySelector('[data-s="ok"]').onclick = function () { d.parentNode.removeChild(d); KP.sheet = null; };
}
