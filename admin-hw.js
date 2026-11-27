/* «Домашние задания» в режиме админа (28.11, просьба Николая).
   Админ → Действующие ученики → Домашние задания.
   Каждая сдача ученика лежит здесь, в бот приходит только «Новое ДЗ: Имя».

   Цветовая система — как шарики тем в караоке (градиент + белый значок):
     Лекция   — сине-серый, листок с карандашом (тест после лекции)
     Песня    — терракота, ноты (разметка песни, фото/видео задания с песней)
     Распевки — бордо, микрофон (видео распевок и тренажёров)
     Караоке  — индиго, наушники (дубли из караоке)
   Порядок везде один: лекция → песня → распевки → караоке. Данные — api/hw-admin.js. */
(function () {
  var API = "/api/hw-admin";
  var CATS = ["lecture", "song", "warmup", "karaoke"];
  var CAT = {
    lecture: { label: "Лекция", bg: "linear-gradient(145deg,#8fb3c7,#34586b)", c: "#4f7a90",
      svg: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5v4h4" /><path d="M9.8 12.5h5M9.8 15.5h3.2" />' },
    song: { label: "Песня", bg: "linear-gradient(145deg,#d9874f,#8a3a1c)", c: "#b5603a",
      svg: '<path d="M9.5 17.5V6l9-2v11.5" /><circle cx="7.3" cy="17.6" r="2.3" fill="rgba(255,255,255,.3)" /><circle cx="16.3" cy="15.6" r="2.3" fill="rgba(255,255,255,.3)" />' },
    warmup: { label: "Распевки", bg: "linear-gradient(145deg,#d95a6e,#6e1830)", c: "#a83a50",
      svg: '<rect x="9" y="3" width="6" height="11" rx="3" fill="rgba(255,255,255,.3)" /><path d="M5.8 11a6.2 6.2 0 0 0 12.4 0M12 17.3V21M9 21h6" />' },
    karaoke: { label: "Караоке", bg: "linear-gradient(145deg,#7d74e6,#2c2a78)", c: "#5a52c4",
      svg: '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" /><rect x="3.5" y="14" width="4" height="6" rx="1.6" fill="rgba(255,255,255,.3)" /><rect x="16.5" y="14" width="4" height="6" rx="1.6" fill="rgba(255,255,255,.3)" />' }
  };
  var MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var H = window.ADMHW = { list: null, err: false, filter: "new", st: null, stKey: null, stData: null, open: {} };

  var css = document.createElement("style");
  css.textContent =
    ".hw-ball{flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 6px rgba(0,0,0,.18)}" +
    ".hw-ball svg{width:58%;height:58%}" +
    ".hw-legend{display:flex;gap:5px;flex-wrap:nowrap;margin:0 0 2px;justify-content:space-between}" +
    ".hw-legend span{display:inline-flex;align-items:center;gap:5px;padding:4px 8px 4px 4px;border-radius:13px;background:var(--bgmuted);font:600 11.5px Inter,sans-serif;color:var(--ink);white-space:nowrap}" +
    ".hw-chips{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}" +
    ".hw-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 3px;border-radius:13px;background:var(--bgmuted);font:700 12.5px Inter,sans-serif;color:var(--ink)}" +
    ".hw-chip.done{opacity:.5;font-weight:600}" +
    ".hw-new{min-width:24px;height:24px;padding:0 7px;border-radius:12px;background:var(--terra);color:#fff;font:700 12.5px Inter,sans-serif;display:inline-flex;align-items:center;justify-content:center}" +
    ".hw-sec{display:flex;align-items:center;gap:9px;margin:14px 2px 2px;font:700 15px Manrope,Inter,sans-serif;color:var(--ink)}" +
    ".hw-sec small{font:600 12.5px Inter,sans-serif;color:var(--gray)}" +
    ".hw-item{position:relative;background:var(--bg);border-radius:18px;box-shadow:var(--raised);padding:14px 16px 14px 20px;overflow:hidden}" +
    ".hw-item:before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--hwc)}" +
    ".hw-item.checked{box-shadow:var(--raised-sm);opacity:.82}" +
    ".hw-head{display:flex;align-items:flex-start;gap:10px}" +
    ".hw-title{font:700 15px Manrope,Inter,sans-serif;color:var(--ink);line-height:1.3}" +
    ".hw-st{flex:none;margin-left:auto;padding:3px 9px;border-radius:10px;font:700 11.5px Inter,sans-serif;white-space:nowrap}" +
    ".hw-st.new{background:var(--terra);color:#fff}.hw-st.ok{background:var(--bgmuted);color:var(--gray)}" +
    ".hw-body{margin-top:10px;font:500 13.5px/1.5 Inter,sans-serif;color:var(--ink);white-space:pre-wrap;word-break:break-word}" +
    ".hw-body.cut{max-height:7.5em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 60%,transparent)}" +
    ".hw-more{margin-top:4px;font:600 13px Inter,sans-serif;color:var(--blue);cursor:pointer}" +
    ".hw-media{margin-top:10px;border-radius:14px;overflow:hidden;background:#000}" +
    ".hw-media video,.hw-media img{display:block;width:100%;max-height:440px;object-fit:contain;background:#000}" +
    ".hw-audio{margin-top:10px;width:100%}" +
    ".hw-score{margin-top:8px;display:flex;align-items:baseline;gap:8px;font:800 26px Manrope,Inter,sans-serif;color:var(--ink)}" +
    ".hw-score small{font:600 13px Inter,sans-serif;color:var(--gray)}" +
    ".hw-reply{margin-top:10px;padding:9px 12px;border-radius:12px;background:var(--bgmuted);font:500 13px/1.45 Inter,sans-serif;color:var(--ink);white-space:pre-wrap}" +
    ".hw-btns{display:flex;gap:8px;margin-top:12px}" +
    ".hw-btns button{flex:1;height:40px;border:none;border-radius:12px;font:600 14px Inter,sans-serif;cursor:pointer;background:var(--bgmuted);color:var(--ink);box-shadow:var(--raised-sm)}" +
    ".hw-btns button.main{background:var(--blue);color:var(--white-text)}" +
    ".hw-test{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:8px;background:var(--bgmuted);font:600 11px Inter,sans-serif;color:var(--gray);vertical-align:middle}" +
    ".hw-ta{width:100%;min-height:120px;box-sizing:border-box;border:none;border-radius:14px;padding:12px 14px;background:var(--bg);box-shadow:var(--inset);font:500 15px/1.45 Inter,sans-serif;color:var(--ink);resize:none;outline:none}";
  document.head.appendChild(css);

  function hdrs(js) {
    var h = { "x-tg-init-data": (window.tg && tg.initData) || "", "x-site-auth": state._siteAuth || "" };
    if (js) h["content-type"] = "application/json";
    return h;
  }
  function getJ(q) {
    return fetch(API + (q || ""), { headers: hdrs() }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); }, function () { return { ok: false }; });
  }
  function post(body) {
    return fetch(API, { method: "POST", headers: hdrs(true), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); }, function () { return { ok: false }; });
  }
  function ball(cat, size) {
    var c = CAT[cat] || CAT.song;
    return '<i class="hw-ball" style="width:' + size + "px;height:" + size + "px;background:" + c.bg + '"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c.svg + "</svg></i>";
  }
  window.hwBall = ball;
  function when(iso) {
    var d = new Date(iso), now = new Date();
    var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((day0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (diff === 0) return "сегодня " + hm;
    if (diff === 1) return "вчера " + hm;
    return d.getDate() + " " + MON[d.getMonth()] + " " + hm;
  }
  function top(title, sub) {
    return '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">' + esc(title) + '</div><div class="top-sub">' + esc(sub || "Админ") + "</div></div></div>";
  }
  function legend() {
    return '<div class="hw-legend">' + CATS.map(function (c) { return "<span>" + ball(c, 18) + CAT[c].label + "</span>"; }).join("") + "</div>";
  }

  /* сводка — для кружков в хабе админа */
  window.loadHwSummary = function (force) {
    if (H._loading || (H.list && !force && Date.now() - H._at < 20000)) return;
    H._loading = true;
    getJ("").then(function (d) {
      H._loading = false; H._at = Date.now();
      if (d && d.ok) { H.list = d.students; H.fresh = d.fresh; H.err = false; }
      else { H.err = true; if (!H.list) H.list = []; }
      if (/^admin-(hub|active|hw)$/.test(state.screen)) render();
    });
  };
  window.hwFreshCount = function () { return H.fresh || 0; };

  /* ---------- экран 1: ученики ---------- */
  window.renderAdminHw = function () {
    loadHwSummary();
    var list = H.list;
    var body;
    if (list === null) body = '<div class="courses-empty">Загружаю…</div>';
    else {
      var shown = H.filter === "new" ? list.filter(function (s) { return s.fresh > 0; }) : list;
      if (!shown.length) {
        body = '<div class="courses-empty">' + (H.err ? "База не ответила. Попробуй ещё раз через минуту." :
          H.filter === "new" ? "Всё проверено 👌 Новые ДЗ появятся здесь, а в бот придёт короткое сообщение." : "Пока никто не сдавал ДЗ через приложение.") + "</div>";
      } else {
        body = shown.map(function (s) {
          var chips = CATS.filter(function (c) { return s.cats[c]; }).map(function (c) {
            var x = s.cats[c], n = H.filter === "new" ? x.fresh : x.total;
            if (H.filter === "new" && !n) return "";
            return '<span class="hw-chip' + (x.fresh ? "" : " done") + '" title="' + CAT[c].label + '">' + ball(c, 20) + n + "</span>";
          }).join("");
          return '<div class="lesson-card" data-hw-st="' + esc(s.key) + '" style="align-items:flex-start;">' +
            '<div class="lesson-body" style="min-width:0;">' +
              '<div class="lesson-name">' + esc(s.name) + (s.test ? '<span class="hw-test">тест</span>' : "") + "</div>" +
              '<div class="lesson-sub">Последняя сдача: ' + when(s.last) + "</div>" +
              '<div class="hw-chips">' + chips + "</div>" +
            "</div>" +
            (s.fresh ? '<span class="hw-new" style="margin-top:2px;">' + s.fresh + "</span>" : "") +
            '<span style="margin-top:4px;">' + SVG.chevronRight + "</span>" +
          "</div>";
        }).join("");
      }
    }
    app.innerHTML = top("Домашние задания", H.fresh ? "Ждут проверки: " + H.fresh : "Админ") +
      '<div class="llevel-seg" style="margin:4px 16px 12px;">' +
        '<button type="button" data-hw-f="new" class="' + (H.filter === "new" ? "on" : "") + '">Ждут проверки</button>' +
        '<button type="button" data-hw-f="all" class="' + (H.filter === "all" ? "on" : "") + '">Все ученики</button>' +
      "</div>" +
      '<div style="padding:0 16px 130px;display:flex;flex-direction:column;gap:10px;">' + legend() + body + "</div>";
    wireActs();
    Array.prototype.forEach.call(app.querySelectorAll("[data-hw-f]"), function (b) {
      b.onclick = function () { H.filter = b.getAttribute("data-hw-f"); render(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-hw-st]"), function (el) {
      el.onclick = function () { H.stKey = el.getAttribute("data-hw-st"); H.stData = null; H.open = {}; go("admin-hw-st"); };
    });
    if (window.segEnhance) segEnhance();
  };

  /* ---------- экран 2: сдачи одного ученика ---------- */
  function loadSt() {
    if (H._stLoading) return;
    H._stLoading = true;
    var key = H.stKey;
    getJ("?student=" + encodeURIComponent(key)).then(function (d) {
      H._stLoading = false;
      if (key !== H.stKey) return;
      H.stData = d && d.ok ? d : { ok: false, items: [] };
      if (state.screen === "admin-hw-st") render();
    });
  }
  function itemHtml(it) {
    var c = CAT[it.cat] || CAT.song;
    var lesson = it.topic ? (it.lessonNo ? "Урок " + it.lessonNo + " · " : "") + it.topic : "";
    var h = '<div class="hw-item' + (it.status === "checked" ? " checked" : "") + '" style="--hwc:' + c.bg + '">' +
      '<div class="hw-head"><div style="min-width:0;"><div class="hw-title">' + esc(it.kind === "quiz" ? "Тест после лекции" : it.title) + (it.test ? '<span class="hw-test">тест</span>' : "") + "</div>" +
      '<div class="lesson-sub" style="margin-top:2px;">' + esc([lesson, when(it.at)].filter(Boolean).join(" · ")) + "</div></div>" +
      '<span class="hw-st ' + (it.status === "checked" ? 'ok">Проверено' : 'new">Новое') + "</span></div>";
    if (it.kind === "quiz" && it.meta && it.meta.total) {
      var pct = Math.round(100 * it.meta.score / it.meta.total);
      h += '<div class="hw-score">' + it.meta.score + " / " + it.meta.total + "<small>" + pct + "% верно</small></div>";
    }
    if (it.src) {
      if (it.fileType === "photo") h += '<div class="hw-media"><img loading="lazy" src="' + esc(it.src) + '" alt=""></div>';
      else if (it.fileType === "audio" || it.kind === "karaoke-take") h += '<audio class="hw-audio" controls preload="none" src="' + esc(it.src) + '"></audio>';
      else {
        var ar = it.meta && it.meta.width && it.meta.height ? "aspect-ratio:" + it.meta.width + "/" + it.meta.height + ";" : "aspect-ratio:9/16;";
        h += '<div class="hw-media"><video controls playsinline webkit-playsinline preload="metadata" style="' + ar + '" src="' + esc(it.src) + '#t=0.1"></video></div>';
      }
    }
    if (it.body) {
      var long = it.body.length > 260 || it.body.split("\n").length > 5;
      var open = H.open[it.id];
      var label = it.kind === "quiz" ? "Ошибки" : "";
      h += '<div class="hw-body' + (long && !open ? " cut" : "") + '">' + (label ? "<b>" + label + "</b>\n" : "") + esc(it.body) + "</div>";
      if (long) h += '<div class="hw-more" data-hw-more="' + it.id + '">' + (open ? "Свернуть" : "Показать всё") + "</div>";
    } else if (it.kind === "quiz") {
      h += '<div class="hw-body" style="color:var(--gray);">Без ошибок</div>';
    }
    if (it.reply) h += '<div class="hw-reply"><b>Твой ответ:</b>\n' + esc(it.reply) + "</div>";
    h += '<div class="hw-btns">' +
      '<button type="button" data-hw-reply="' + it.id + '">Ответить</button>' +
      (it.status === "checked"
        ? '<button type="button" data-hw-un="' + it.id + '">Вернуть в новые</button>'
        : '<button type="button" class="main" data-hw-ok="' + it.id + '">Проверено</button>') +
      "</div></div>";
    return h;
  }
  window.renderAdminHwStudent = function () {
    if (!H.stKey) { go("admin-hw"); return; }
    var d = H.stData;
    if (!d) loadSt();
    var items = d ? d.items : [];
    var stInfo = (H.list || []).filter(function (s) { return s.key === H.stKey; })[0] || {};
    var name = (d && d.name) || stInfo.name || "Ученик";
    var fresh = items.filter(function (x) { return x.status === "new"; }).length;
    var body = "";
    if (!d) body = '<div class="courses-empty">Загружаю…</div>';
    else if (!d.ok) body = '<div class="courses-empty">Не удалось загрузить. Попробуй ещё раз.</div>';
    else if (!items.length) body = '<div class="courses-empty">Сдач пока нет.</div>';
    else {
      CATS.forEach(function (c) {
        var part = items.filter(function (x) { return x.cat === c; });
        if (!part.length) return;
        var nw = part.filter(function (x) { return x.status === "new"; }).length;
        body += '<div class="hw-sec">' + ball(c, 28) + CAT[c].label + "<small>" + (nw ? "новых " + nw + " из " + part.length : "всё проверено · " + part.length) + "</small></div>";
        body += part.map(itemHtml).join("");
      });
    }
    app.innerHTML = top(name, fresh ? "Ждут проверки: " + fresh : "Всё проверено") +
      '<div style="padding:4px 16px ' + (fresh > 1 ? "200px" : "130px") + ';display:flex;flex-direction:column;gap:10px;">' + body + "</div>" +
      (fresh > 1 ? '<button class="cta dock-cta" type="button" data-hw-all="1">Отметить всё проверенным (' + fresh + ")</button>" : "");
    wireActs();
    function each(sel, fn) { Array.prototype.forEach.call(app.querySelectorAll(sel), function (el) { el.onclick = function (e) { e.stopPropagation(); fn(el); }; }); }
    function setStatus(id, st) {
      items.forEach(function (x) { if (x.id === id) x.status = st; });
      render();
      H.list = null; // сводка пересчитается
    }
    each("[data-hw-more]", function (el) { var id = el.getAttribute("data-hw-more"); H.open[id] = !H.open[id]; render(); });
    each("[data-hw-ok]", function (el) {
      var id = el.getAttribute("data-hw-ok");
      post({ action: "check", id: id }).then(function (r) { if (r.ok) { setStatus(id, "checked"); loadHwSummary(true); } });
    });
    each("[data-hw-un]", function (el) {
      var id = el.getAttribute("data-hw-un");
      post({ action: "uncheck", id: id }).then(function (r) { if (r.ok) { setStatus(id, "new"); loadHwSummary(true); } });
    });
    each("[data-hw-all]", function (el) {
      el.disabled = true;
      post({ action: "checkAll", skey: H.stKey }).then(function (r) {
        if (r.ok) { items.forEach(function (x) { x.status = "checked"; }); render(); loadHwSummary(true); } else el.disabled = false;
      });
    });
    each("[data-hw-reply]", function (el) {
      var id = el.getAttribute("data-hw-reply");
      var it = items.filter(function (x) { return x.id === id; })[0];
      if (it) openReply(it, name);
    });
  };

  /* ответ ученику — шторка, закрывается свайпом вниз */
  function openReply(it, name) {
    var c = CAT[it.cat] || CAT.song;
    var o = admSheetOpen(
      '<div style="display:flex;align-items:center;gap:10px;">' + ball(it.cat, 30) +
        '<div><div style="font:700 17px Manrope,Inter,sans-serif;">Ответ: ' + esc(name) + "</div>" +
        '<div class="lesson-sub" style="margin-top:2px;">' + esc(c.label + " · " + it.title) + "</div></div></div>" +
      (it.canReply
        ? '<textarea class="hw-ta" id="hw-ta" style="margin-top:14px;" placeholder="Что получилось, что поправить…"></textarea>' +
          '<div class="lesson-sub" style="margin-top:8px;">Придёт ученику в чат с ботом. Сдача отметится проверенной.</div>' +
          '<div id="hw-err" class="lesson-sub" style="margin-top:6px;color:oklch(62% 0.2 25);"></div>' +
          '<button class="cta" id="hw-send" type="button" style="margin-top:10px;height:50px;">Отправить</button>'
        : '<div class="lesson-sub" style="margin-top:14px;line-height:1.45;">Этот ученик сдал ДЗ не из Telegram (со значка на экране телефона), поэтому бот не знает его чат. Ответь ему в Telegram сам — сообщение «Новое ДЗ» в боте пришло с его именем.</div>' +
          admBtn("hw-x", "Понятно", "text-align:center;")));
    var sheet = o.firstChild;
    if (window.wireSheetSwipe) wireSheetSwipe(sheet, admSheetClose);
    var x = o.querySelector("#hw-x");
    if (x) x.onclick = admSheetClose;
    var send = o.querySelector("#hw-send");
    if (!send) return;
    var ta = o.querySelector("#hw-ta");
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 250);
    send.onclick = function () {
      var t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      send.disabled = true; send.textContent = "Отправляю…";
      post({ action: "reply", id: it.id, text: t }).then(function (r) {
        if (r.ok) {
          it.reply = it.reply ? it.reply + "\n\n" + t : t;
          it.status = "checked";
          admSheetClose(); render(); loadHwSummary(true);
        } else {
          send.disabled = false; send.textContent = "Отправить";
          o.querySelector("#hw-err").textContent = r.error === "no-tg" ? "Бот не знает чат этого ученика." : "Не отправилось: " + (r.error || "нет связи") + ". Попробуй ещё раз.";
        }
      });
    };
  }
})();
