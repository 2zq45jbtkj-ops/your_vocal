/* 27.11 (Коля): то, что раньше было только в меню админа в боте, — теперь в приложении.
   Бот больше не показывает Николаю «Рабочее меню», только уведомления с кнопкой «Открыть в приложении».

   • «🌴 Отпуск» — в «Расписании», только у Николая. Дни закрываются для записи, уроки снимаются
     и возвращаются ученикам на баланс, сроки абонементов сдвигаются на длину отпуска; ученику
     приходит сообщение в боте с кнопкой прямо в его Кабинет, а в Кабинете — плашка об отпуске.
   • «Продлить абонемент» — в «Действующих учениках»: личная пауза одному ученику (заболел,
     сломалась машина…) — срок абонемента +N дней, по желанию с сообщением ученику.
   • «Группы» — в хабе админа: заявки в группу (пригласить / написать / отклонить)
     и переключатель «показывать групповые новичкам и ученикам».

   Данные — в боте записи (vocal-bot /api/app_extra) через мост /api/bot?path=app_extra. */
(function () {
  var API = "/api/bot?path=app_extra";
  var MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  var X = window.ADMX = { vac: null, vacList: null, groups: null, ext: null, my: null };

  function hdrs(json) {
    var h = { "x-tg-init-data": (window.tg && tg.initData) || "", "x-site-auth": state._siteAuth || "" };
    if (json) h["content-type"] = "application/json";
    return h;
  }
  function get(q) {
    return fetch(API + "&" + q, { headers: hdrs() }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); },
      function () { return { ok: false }; });
  }
  function post(op, body) {
    return fetch(API + "&op=" + op, { method: "POST", headers: hdrs(true), body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); }, function () { return { ok: false }; });
  }
  function iso(dt) { return dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2); }
  function dm(s) { var p = String(s).split("-"); return (+p[2]) + " " + MON[+p[1] - 1]; }
  function dow(s) { var p = String(s).split("-"); return DOW[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }
  function hm(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  function days(n) { var a = n % 10, b = n % 100; return n + (a === 1 && b !== 11 ? " день" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? " дня" : " дней"); }
  function card(h, extra) { return '<div class="cab-card" style="margin:0;' + (extra || "") + '">' + h + "</div>"; }
  function line(l, r, st) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--line);font-size:14.5px;">' +
      "<span>" + l + '</span><span style="text-align:right;' + (st || "") + '">' + r + "</span></div>";
  }
  function top(title, sub) {
    return '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">' + esc(title) + '</div><div class="top-sub">' + esc(sub || "Админ") + "</div></div></div>";
  }
  function page(title, body, sub) {
    app.innerHTML = top(title, sub) + '<div style="padding:8px 16px 130px;display:flex;flex-direction:column;gap:12px;">' + body + "</div>";
    wireActs();
  }
  function on(sel, fn) {
    Array.prototype.forEach.call(app.querySelectorAll(sel), function (el) {
      el.addEventListener("click", function (e) { e.stopPropagation(); fn(el, e); });
    });
  }
  function note(t, warn) {
    return '<div class="lesson-sub" style="margin-top:8px;line-height:1.4;' + (warn ? "color:oklch(78% 0.12 80);" : "") + '">' + t + "</div>";
  }
  var WARN_ICO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex:none;margin-top:1px"><path d="M12 3 2 21h20L12 3z" fill="oklch(62% 0.2 25)"/><path d="M12 10v5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="#fff"/></svg>';

  /* ================================================================ Отпуск (Николай) */
  function vacState() {
    if (!X.vac) {
      var t = new Date();
      X.vac = { d1: iso(t), d2: iso(t), reason: "", preview: null, busy: false, result: null, err: "" };
    }
    return X.vac;
  }
  function loadVacList(force) {
    if ((X.vacList && !force) || X._vlBusy) return;
    X._vlBusy = true;
    get("op=vac_list").then(function (d) { X._vlBusy = false; X.vacList = d; if (state.screen === "admin-vac") render(); });
  }
  window.renderAdminVac = function () {
    var v = vacState();
    loadVacList();
    var body = "";
    if (v.result) {
      var r = v.result;
      body += card('<div style="font-size:30px;text-align:center;">🌴</div>' +
        '<div class="top-title" style="text-align:center;margin:4px 0 6px;">Отпуск ' + esc(r.words) + "</div>" +
        line("Снято уроков", String(r.lessons)) +
        line("Ученикам отправлено", String(r.sent), "color:oklch(72% 0.13 150)") +
        (r.failed ? line("Не доставлено", String(r.failed), "color:oklch(65% 0.17 25)") : "") +
        line("Сроки абонементов сдвинуты", r.subs ? r.subs + " · +" + days(r.days) : "—") +
        (r.no_tg && r.no_tg.length ? '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;">' + WARN_ICO +
          '<div class="lesson-sub" style="line-height:1.4;">Нет Телеграма — напиши сам: ' + esc(r.no_tg.join(", ")) + "</div></div>" : "") +
        '<button class="cta terra" data-x="vac-done" style="margin-top:14px;">Готово</button>');
    } else {
      var pv = v.preview;
      body += card('<div class="lesson-sub" style="margin-bottom:10px;">Новый отпуск</div>' +
        '<div style="display:flex;gap:10px;">' +
          '<label style="flex:1;min-width:0;"><span class="field-label">С</span><input id="vac-d1" class="field-input" type="date" style="width:100%;min-width:0;box-sizing:border-box;padding-left:12px;padding-right:8px;" value="' + v.d1 + '" min="' + iso(new Date()) + '"></label>' +
          '<label style="flex:1;min-width:0;"><span class="field-label">ПО</span><input id="vac-d2" class="field-input" type="date" style="width:100%;min-width:0;box-sizing:border-box;padding-left:12px;padding-right:8px;" value="' + v.d2 + '" min="' + iso(new Date()) + '"></label>' +
        "</div>" +
        '<label style="display:block;margin-top:12px;"><span class="field-label">ПРИЧИНА — ЕЁ УВИДЯТ УЧЕНИКИ</span>' +
          '<input id="vac-reason" class="field-input" type="text" maxlength="200" placeholder="Например: уезжаю на конкурс" value="' + esc(v.reason) + '"></label>' +
        (v.err ? note(esc(v.err), true) : "") +
        (pv ? "" : '<button class="cta terra" data-x="vac-preview" style="margin-top:14px;"' + (v.busy ? " disabled" : "") + ">" + (v.busy ? "Смотрю…" : "Показать, кого затронет") + "</button>"));
      if (pv) {
        var ls = pv.lessons || [];
        body += card('<div class="lesson-sub">Что произойдёт</div>' +
          '<div style="font:700 17px Manrope,sans-serif;margin:4px 0 2px;">' + esc(pv.words) + " · " + days(pv.days) + "</div>" +
          line("Дни закроются для записи", "все " + days(pv.days)) +
          line("Уроки снимутся", ls.length ? ls.length + " · вернутся на баланс" : "нет") +
          line("Сроки абонементов", pv.subs ? "+" + days(pv.days) + " у " + pv.subs : "не меняются") +
          (ls.length ? '<div style="margin-top:6px;">' + ls.map(function (x) {
            return '<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13.5px;">' +
              '<span style="color:var(--gray);min-width:104px;">' + dow(x.day) + ", " + dm(x.day) + ", " + hm(x.start) + "</span>" +
              "<span>" + (x.trial ? "Пробный: " : "") + esc(x.name) + (x.tg ? "" : ' <span style="color:oklch(78% 0.12 80);">· нет Телеграма</span>') + "</span></div>";
          }).join("") + "</div>" : "") +
          note("Каждому ученику придёт сообщение в боте с причиной и кнопкой «Выбрать новое время в приложении» — она откроет его Кабинет. В Кабинете тоже появится плашка об отпуске.") +
          '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="filter-btn" data-x="vac-edit" style="flex:1;">Изменить</button>' +
            '<button class="cta terra" data-x="vac-send" style="flex:2;margin:0;"' + (v.busy ? " disabled" : "") + ">" + (v.busy ? "Отправляю…" : "Отправить ученикам") + "</button>" +
          "</div>");
      }
    }
    var vl = X.vacList;
    if (vl && vl.ok && vl.vacations.length) {
      body += card('<div class="lesson-sub">Отпуска</div>' + vl.vacations.map(function (z) {
        var past = z.d2 < vl.today;
        var moved = z.items.filter(function (i) { return i.status === "moved"; }).length;
        return '<div style="padding:11px 0;border-top:1px solid var(--line);' + (past ? "opacity:.6;" : "") + '">' +
          '<div style="display:flex;justify-content:space-between;gap:10px;font-size:14.5px;"><b>' + esc(z.words) + "</b><span style=\"color:var(--gray);\">" + days(z.days) + "</span></div>" +
          '<div class="lesson-sub" style="margin-top:2px;">' + esc(z.reason) + "</div>" +
          (z.items.length ? '<div class="lesson-sub" style="margin-top:4px;">Снято уроков: ' + z.items.length + (moved ? " · перенесли: " + moved : "") + " — " +
            esc(z.items.map(function (i) { return i.name.split(" ")[0]; }).join(", ")) + "</div>" : "") +
        "</div>";
      }).join(""));
    }
    page("Отпуск", body, "Видно только тебе");
    var keep = function () {
      var a = document.getElementById("vac-d1"), b = document.getElementById("vac-d2"), c = document.getElementById("vac-reason");
      if (a) v.d1 = a.value || v.d1; if (b) v.d2 = b.value || v.d2; if (c) v.reason = c.value;
      if (v.d2 < v.d1) v.d2 = v.d1;
    };
    ["vac-d1", "vac-d2", "vac-reason"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", function () { keep(); if (id === "vac-d1" && v.d2 < v.d1) { v.d2 = v.d1; document.getElementById("vac-d2").value = v.d2; } });
    });
    on('[data-x="vac-preview"]', function () {
      keep();
      if (!v.reason.trim()) { v.err = "Напиши причину — её увидят ученики."; render(); return; }
      v.err = ""; v.busy = true; render();
      get("op=vac_preview&d1=" + v.d1 + "&d2=" + v.d2).then(function (d) {
        v.busy = false;
        if (d && d.ok) { v.preview = d; v.d1 = d.d1; v.d2 = d.d2; } else v.err = (d && d.error) || "Бот не ответил, попробуй ещё раз.";
        render();
      });
    });
    on('[data-x="vac-edit"]', function () { v.preview = null; render(); });
    on('[data-x="vac-send"]', function () {
      if (v.busy) return;
      v.busy = true; render();
      post("vac_apply", { d1: v.d1, d2: v.d2, reason: v.reason }).then(function (d) {
        v.busy = false;
        if (d && d.ok) { v.result = d; v.preview = null; X.vacList = null; state.adminWeek = null; state.adminToday = null; }
        else { v.err = (d && d.error) || "Не получилось отправить. Проверь, не ушло ли сообщение ученикам, прежде чем пробовать снова."; v.preview = null; }
        render();
      });
    });
    on('[data-x="vac-done"]', function () { X.vac = null; render(); });
  };

  /* ================================================================ Группы */
  function loadGroups(force) {
    if ((X.groups && !force) || X._grBusy) return;
    X._grBusy = true;
    get("op=groups").then(function (d) { X._grBusy = false; X.groups = d; if (state.screen === "admin-groups") render(); });
  }
  window.renderAdminGroups = function () {
    loadGroups();
    var g = X.groups, body;
    if (!g) body = '<div class="courses-empty">Загружаю заявки…</div>';
    else if (!g.ok) body = '<div class="courses-empty">Бот не ответил. Закрой экран и открой ещё раз.</div>';
    else {
      body = card('<div style="display:flex;align-items:center;gap:12px;">' +
          '<div style="flex:1;"><div style="font:700 15px Manrope,sans-serif;">Групповые занятия</div>' +
          '<div class="lesson-sub" style="margin-top:2px;">' + (g.hidden ? "Скрыты: новички и ученики их не видят" : "Видны новичкам и ученикам") + "</div></div>" +
          '<button class="toggle-pill' + (g.hidden ? "" : " on") + '" data-x="grp-toggle" aria-pressed="' + (!g.hidden) + '" aria-label="Показывать групповые"><span class="toggle-dot"></span></button>' +
        "</div>");
      body += card('<div class="lesson-sub">Заявки в группу' + (g.requests.length ? " · " + g.requests.length : "") + "</div>" +
        (g.requests.length ? g.requests.map(function (q) {
          var ask = X._grAsk === q.id;
          return '<div style="padding:12px 0;border-top:1px solid var(--line);">' +
            '<div style="font:700 15px Manrope,sans-serif;">' + esc(q.name) + "</div>" +
            '<div class="lesson-sub" style="margin-top:3px;line-height:1.4;">Состав: ' + esc(q.composition || "не указан") +
              "<br>Опыт: " + esc(q.experience || "не указан") + (q.since ? "<br>Ждёт с " + dm(q.since) : "") + "</div>" +
            (ask
              ? '<div class="lesson-sub" style="margin-top:10px;">Отклонить заявку? Человеку сразу придёт сообщение.</div>' +
                '<div style="display:flex;gap:8px;margin-top:8px;"><button class="filter-btn" data-x="grp-keep" style="flex:1;">Нет</button>' +
                '<button class="filter-btn" data-x="grp-decline" data-id="' + q.id + '" style="flex:1;color:oklch(65% 0.17 25);">Да, отклонить</button></div>'
              : '<div style="display:flex;gap:8px;margin-top:10px;">' +
                  '<button class="cta terra" data-x="grp-invite" data-id="' + q.id + '" style="flex:1.4;margin:0;padding:10px 8px;font-size:14px;">Пригласить</button>' +
                  '<button class="filter-btn" data-x="grp-write" data-tg="' + q.tg + '" style="flex:1;">Написать</button>' +
                  '<button class="filter-btn" data-x="grp-ask" data-id="' + q.id + '" style="flex:1;">Отклонить</button></div>') +
          "</div>";
        }).join("") : '<div class="lesson-sub" style="margin-top:8px;">Заявок на группу пока нет.</div>'));
      if (X._grMsg) body += note(esc(X._grMsg));
    }
    page("Группы", body);
    on('[data-x="grp-toggle"]', function () {
      g.hidden = !g.hidden; render();
      post("groups_toggle").then(function (d) { if (d && d.ok) g.hidden = d.hidden; else { g.hidden = !g.hidden; X._grMsg = "Не сохранилось, попробуй ещё раз."; } render(); });
    });
    on('[data-x="grp-ask"]', function (el) { X._grAsk = +el.getAttribute("data-id"); render(); });
    on('[data-x="grp-keep"]', function () { X._grAsk = null; render(); });
    on('[data-x="grp-write"]', function (el) {
      location.href = "tg://user?id=" + el.getAttribute("data-tg");
    });
    var act = function (op, msg) {
      return function (el) {
        el.disabled = true;
        post(op, { id: +el.getAttribute("data-id") }).then(function (d) {
          X._grAsk = null;
          X._grMsg = d && d.ok ? msg : (d && d.error) || "Не получилось, попробуй ещё раз.";
          X.groups = null; render();
        });
      };
    };
    on('[data-x="grp-invite"]', act("grp_invite", "Приглашение отправлено ✅"));
    on('[data-x="grp-decline"]', act("grp_decline", "Заявка отклонена."));
  };

  /* ================================================================ Продлить абонемент (личная пауза) */
  function loadExt(force) {
    if ((X.ext && !force) || X._exBusy) return;
    X._exBusy = true;
    get("op=ext_list").then(function (d) { X._exBusy = false; X.ext = d; if (state.screen === "admin-ext") render(); });
  }
  function addDays(isoS, n) { var p = isoS.split("-"); return iso(new Date(+p[0], +p[1] - 1, +p[2] + n)); }
  window.renderAdminExt = function () {
    loadExt();
    var e = X.ext, f = X.extForm || (X.extForm = { sid: "", days: 7, reason: "", notify: true, busy: false, done: null, err: "" }), body;
    if (!e) body = '<div class="courses-empty">Загружаю учеников…</div>';
    else if (!e.ok) body = '<div class="courses-empty">Бот не ответил. Закрой экран и открой ещё раз.</div>';
    else if (f.done) {
      body = card('<div style="font-size:30px;text-align:center;">🤝</div>' +
        '<div class="top-title" style="text-align:center;margin:4px 0 6px;">Срок продлён</div>' +
        '<div class="lesson-sub" style="text-align:center;line-height:1.45;">' + esc(f.done.name) + ": абонемент действует до " + esc(f.done.words) + "." +
          (f.done.notified ? "<br>Сообщение ученику отправлено." : f.notify ? "<br>Сообщение не дошло — напиши ученику сам." : "") + "</div>" +
        '<button class="cta terra" data-x="ext-again" style="margin-top:14px;">Готово</button>');
    } else {
      var st = e.students.filter(function (s) { return s.id === f.sid; })[0];
      var chips = [3, 7, 14, 30].map(function (n) {
        return '<button class="filter-btn' + (f.days === n ? " active-terra" : "") + '" data-x="ext-days" data-n="' + n + '" style="flex:1;">' + days(n) + "</button>";
      }).join("");
      body = card('<div class="lesson-sub" style="line-height:1.4;">Когда ученик не может заниматься по уважительной причине — заболел, сломалась машина, срочная работа, — продли ему срок абонемента. Уроки не сгорят.</div>' +
        '<label style="display:block;margin-top:14px;"><span class="field-label">УЧЕНИК</span>' +
          '<select id="ext-sid" class="field-input"><option value="">Выбери ученика</option>' +
          e.students.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === f.sid ? " selected" : "") + ">" + esc(s.name) + " · до " + dm(s.deadline) + "</option>"; }).join("") +
          "</select></label>" +
        '<div class="field-label" style="margin-top:14px;">НА СКОЛЬКО ПРОДЛИТЬ</div>' +
        '<div style="display:flex;gap:6px;">' + chips + "</div>" +
        '<label style="display:flex;align-items:center;gap:10px;margin-top:10px;"><span class="lesson-sub" style="flex:1;">Другое число дней</span>' +
          '<input id="ext-n" class="field-input" type="number" inputmode="numeric" min="1" max="90" value="' + f.days + '" style="width:90px;text-align:center;"></label>' +
        '<label style="display:block;margin-top:12px;"><span class="field-label">ПРИЧИНА — ДЛЯ ТЕБЯ, УЧЕНИК ЕЁ НЕ УВИДИТ</span>' +
          '<input id="ext-reason" class="field-input" type="text" maxlength="200" placeholder="Например: больничный" value="' + esc(f.reason) + '"></label>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-top:14px;">' +
          '<div style="flex:1;"><div style="font-size:14.5px;">Сообщить ученику</div><div class="lesson-sub">Придёт в боте: «Николай продлил срок твоего абонемента…»</div></div>' +
          '<button class="toggle-pill' + (f.notify ? " on" : "") + '" data-x="ext-notify" aria-pressed="' + f.notify + '" aria-label="Сообщить ученику"><span class="toggle-dot"></span></button></div>' +
        (st ? '<div style="margin-top:14px;padding:12px;border-radius:14px;background:var(--bgmuted);font-size:14.5px;">Срок: до ' + dm(st.deadline) +
          ' → <b style="color:var(--terra);">до ' + dm(addDays(st.deadline, f.days)) + "</b></div>" : "") +
        (f.err ? note(esc(f.err), true) : "") +
        '<button class="cta terra" data-x="ext-go" style="margin-top:14px;"' + (!st || f.busy ? " disabled" : "") + ">" + (f.busy ? "Продлеваю…" : "Продлить на " + days(f.days)) + "</button>");
      if (e.history.length) body += card('<div class="lesson-sub">Уже продлевал</div>' + e.history.map(function (h) {
        return line(esc(h.name) + (h.reason ? '<br><span class="lesson-sub">' + esc(h.reason) + "</span>" : ""),
          "+" + days(h.days) + (h.till ? '<br><span class="lesson-sub">до ' + dm(h.till) + "</span>" : ""));
      }).join(""));
    }
    page("Продлить абонемент", body);
    var keep = function () {
      var a = document.getElementById("ext-sid"), b = document.getElementById("ext-n"), c = document.getElementById("ext-reason");
      if (a) f.sid = a.value; if (c) f.reason = c.value;
      if (b) { var n = parseInt(b.value, 10); if (n >= 1 && n <= 90) f.days = n; }
    };
    ["ext-sid", "ext-n"].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener("change", function () { keep(); render(); }); });
    var rs = document.getElementById("ext-reason"); if (rs) rs.addEventListener("input", function () { f.reason = rs.value; });
    on('[data-x="ext-days"]', function (el) { keep(); f.days = +el.getAttribute("data-n"); render(); });
    on('[data-x="ext-notify"]', function () { keep(); f.notify = !f.notify; render(); });
    on('[data-x="ext-again"]', function () { X.extForm = null; render(); });
    on('[data-x="ext-go"]', function () {
      keep(); if (!f.sid || f.busy) return;
      f.busy = true; f.err = ""; render();
      post("ext_apply", { student_id: f.sid, days: f.days, reason: f.reason, notify: f.notify }).then(function (d) {
        f.busy = false;
        if (d && d.ok) { f.done = d; X.ext = null; } else f.err = (d && d.error) || "Не получилось, попробуй ещё раз.";
        render();
      });
    });
  };

  /* ================================================================ плашка об отпуске у ученика */
  function loadMy() {
    if (X.my || X._myBusy || window.GUEST_ON) return;
    X._myBusy = true;
    get("op=my_vac").then(function (d) { X._myBusy = false; X.my = d && d.ok ? d : { ok: false }; if (state.screen === "profile" && d && d.vac) render(); });
  }
  function vacBanner() {
    var v = X.my && X.my.vac;
    if (!v) return "";
    var ls = v.lessons || [];
    var txt = ls.length
      ? (ls.length === 1 ? "Твой урок " + dow(ls[0].day) + ", " + dm(ls[0].day) + " в " + ls[0].at + " снят и вернулся на баланс."
        : "Твои уроки (" + ls.map(function (l) { return dm(l.day) + " в " + l.at; }).join(", ") + ") сняты и вернулись на баланс.") +
        " Выбери новое время — срок абонемента тоже сдвинулся на " + days(v.days) + "."
      : "В эти дни уроков не будет. Срок абонемента сдвинулся на " + days(v.days) + ".";
    return '<div class="cab-card" style="margin:0 0 14px;border:1px solid oklch(60% 0.13 38 / .35);">' +
      '<div style="display:flex;gap:10px;align-items:flex-start;">' + WARN_ICO +
        '<div style="flex:1;"><div style="font:700 15px Manrope,sans-serif;">Николай не работает ' + esc(v.words) + "</div>" +
        '<div class="lesson-sub" style="margin-top:4px;line-height:1.45;">Причина: ' + esc(v.reason) + ".<br>" + esc(txt) + "</div></div></div>" +
      (ls.length ? '<button class="cta terra" data-act="cab-book" style="margin-top:12px;">Выбрать новое время</button>' : "") +
    "</div>";
  }
  var origCab = window.renderCabMain;
  if (typeof origCab === "function") {
    window.renderCabMain = function (data) {
      var html = origCab(data);
      if (window.GUEST_ON) return html;
      loadMy();
      return vacBanner() + html;
    };
  }

  /* ================================================================ входы */
  ACTS["admin-hub-groups"] = function () { X.groups = null; X._grMsg = ""; X._grAsk = null; go("admin-groups"); };
  ACTS["admin-hub-ext"] = function () { X.ext = null; X.extForm = null; go("admin-ext"); };
  ACTS["admin-week-vac"] = function () { X.vacList = null; if (X.vac && X.vac.result) X.vac = null; go("admin-vac"); };
  if (app && app.innerHTML && (/^admin-(vac|groups|ext)$/.test(state.screen) || state.screen === "profile")) render();
})();
