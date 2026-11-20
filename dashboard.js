/* Дашборд в «Режиме админа» (20.11, просьба Николая): активность учеников,
   прохождение уроков, ДЗ, результаты. События приложения — api/admin-dash.js,
   список учеников, ДЗ и прогресс по урокам — baza-dannih (по коду доступа
   каждого ученика). Сводим по хэшу кода доступа: сам код в базу событий не
   кладётся. Только для Николая — экран доступен лишь из «Режима админа». */

var DASH = { days: 30, data: null, loading: false, err: "", roster: null, pub: {}, keys: {} };

function dashSha(token) {
  if (DASH.keys[token]) return Promise.resolve(DASH.keys[token]);
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token))).then(function (buf) {
    var h = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("").slice(0, 32);
    DASH.keys[token] = h;
    return h;
  });
}

function dashPaint() { if (state.screen === "admin-dash") renderAdminDash(); }

function dashLoad(force) {
  if (DASH.loading || (DASH.data && !force)) return;
  DASH.loading = true; DASH.err = "";
  var want = DASH.days;
  var ev = fetch("/api/admin-dash?days=" + want, { headers: bazaAuthHeaders() }).then(function (r) {
    if (r.status === 403) throw new Error("auth");
    return r.json();
  });
  var roster = fetch(BAZA_API + "/api/students", { headers: bazaAuthHeaders() }).then(function (r) {
    if (!r.ok) throw new Error("students " + r.status);
    return r.json();
  }).then(function (d) {
    var list = (Array.isArray(d) ? d : (d && d.students) || []).map(function (s) {
      return { id: s.id, name: s.name || "", status: s.status || "", token: s.telegramToken || "" };
    }).filter(function (s) { return s.token && s.status !== "done" && !/\(admin\)/i.test(s.name); });
    return Promise.all(list.map(function (s) { return dashSha(s.token).then(function (k) { s.key = k; return s; }); }));
  });
  Promise.all([ev, roster]).then(function (res) {
    if (want !== DASH.days) { DASH.loading = false; dashLoad(true); return; }
    if (!res[0] || !res[0].ok) throw new Error((res[0] && res[0].error) || "dash");
    DASH.data = res[0]; DASH.roster = res[1];
    DASH.loading = false;
    dashPaint();
    dashLoadPublic(res[1]);
  }).catch(function (e) {
    DASH.loading = false;
    DASH.err = String(e && e.message) === "auth" ? "Нет доступа: войди в режим админа заново." : "Не удалось загрузить данные. Проверь интернет и обнови.";
    dashPaint();
  });
}

/* ДЗ и прогресс по урокам — по 4 ученика за раз, чтобы не душить сеть */
function dashLoadPublic(list) {
  var queue = list.filter(function (s) { return !DASH.pub[s.key]; }), active = 0, timer = 0;
  function next() {
    while (active < 4 && queue.length) {
      var s = queue.shift(); active++;
      (function (s) {
        fetch(BAZA_API + "/api/student-public?token=" + encodeURIComponent(s.token))
          .then(function (r) { return r.json(); })
          .then(function (d) { DASH.pub[s.key] = { homework: (d && d.homework) || [], progress: (d && d.progressByLesson) || {} }; })
          .catch(function () { DASH.pub[s.key] = { homework: [], progress: {}, failed: true }; })
          .then(function () {
            active--;
            clearTimeout(timer); timer = setTimeout(dashPaint, 120);
            next();
          });
      })(s);
    }
  }
  next();
}

/* ---------- сборка показателей ---------- */

function dashDayStr(d) {
  var t = new Date(d.getTime() + 5 * 3600000); // время Николая (UTC+5)
  return t.toISOString().slice(0, 10);
}
function dashToday() { return dashDayStr(new Date()); }
function dashDaysAgo(iso) {
  if (!iso) return null;
  var a = new Date(dashToday() + "T00:00:00Z"), b = new Date(dashDayStr(new Date(iso)) + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}
function dashStreak(days) {
  var set = {}; (days || []).forEach(function (d) { set[d] = 1; });
  var n = 0, t = new Date(dashToday() + "T00:00:00Z");
  if (!set[dashToday()]) t = new Date(t.getTime() - 86400000); // сегодня ещё не заходил — серия не прервана
  while (set[t.toISOString().slice(0, 10)]) { n++; t = new Date(t.getTime() - 86400000); }
  return n;
}

function dashModel() {
  var D = DASH.data, roster = DASH.roster || [];
  var by = {};
  function P(k) { return by[k] || (by[k] = { key: k, counts: {}, quiz: [], pitch: [], hwOnTime: {}, days: [], songs: 0 }); }
  roster.forEach(function (s) { var p = P(s.key); p.name = s.name; p.inRoster = true; });
  (D.people || []).forEach(function (r) { var p = P(r.skey); p.last = r.last_at; if (!p.name) p.name = r.name || "Без имени"; });
  (D.activeDays || []).forEach(function (r) { P(r.skey).days = r.days || []; });
  (D.counts || []).forEach(function (r) { P(r.skey).counts[r.type] = r.n; });
  (D.quiz || []).forEach(function (r) { if (r.total > 0) P(r.skey).quiz.push({ lesson: r.lesson, score: r.score, total: r.total }); });
  (D.pitch || []).forEach(function (r) { if (r.pct != null) P(r.skey).pitch.push(r.pct); });
  (D.karSongs || []).forEach(function (r) { P(r.skey).songs = r.songs; });
  (D.hw || []).forEach(function (r) {
    var key = (r.title || "") + "|" + (r.due || "");
    var dl = r.due ? new Date(String(r.due).slice(0, 10) + "T23:59:59+05:00").getTime() : null;
    P(r.skey).hwOnTime[key] = dl == null ? true : new Date(r.at).getTime() <= dl;
  });

  var today = new Date(dashToday() + "T00:00:00+05:00").getTime();
  var list = Object.keys(by).map(function (k) {
    var p = by[k], pub = DASH.pub[k];
    p.ago = dashDaysAgo(p.last);
    p.streak = dashStreak(p.days);
    var winDays = p.days.filter(function (d) { var a = dashDaysAgo(d + "T12:00:00+05:00"); return a != null && a < DASH.days; });
    p.activeInWin = winDays.length;
    // ДЗ из baza-dannih
    p.hw = { onTime: 0, late: 0, overdue: 0, open: 0, done: 0, known: !!pub };
    if (pub) pub.homework.forEach(function (hw) {
      var dl = hw.due ? new Date(String(hw.due).slice(0, 10) + "T23:59:59+05:00").getTime() : null;
      var key = (hw.title || "") + "|" + (hw.due || "");
      if (hw.done) {
        p.hw.done++;
        if (p.hwOnTime[key] === true) p.hw.onTime++;
        else if (p.hwOnTime[key] === false) p.hw.late++;
      } else if (dl != null && dl < today) p.hw.overdue++;
      else p.hw.open++;
    });
    p.progress = pub ? pub.progress : {};
    var qs = p.quiz.map(function (q) { return q.score / q.total; });
    p.quizAvg = qs.length ? Math.round(qs.reduce(function (a, b) { return a + b; }, 0) / qs.length * 100) : null;
    p.pitchAvg = p.pitch.length ? Math.round(p.pitch.reduce(function (a, b) { return a + b; }, 0) / p.pitch.length) : null;
    p.pitchGrowth = p.pitch.length >= 2 ? p.pitch[p.pitch.length - 1] - p.pitch[0] : null;
    return p;
  });
  list.sort(function (a, b) {
    var x = a.ago == null ? 1e9 : a.ago, y = b.ago == null ? 1e9 : b.ago;
    return x - y || String(a.name).localeCompare(String(b.name), "ru");
  });
  return list;
}

/* ---------- отрисовка ---------- */

function dashEsc(s) { return esc(String(s == null ? "" : s)); }

function dashTile(val, label, sub) {
  return '<div class="dash-tile"><div class="dash-tile-v">' + val + '</div><div class="dash-tile-l">' + dashEsc(label) + "</div>" +
    (sub ? '<div class="dash-tile-s">' + dashEsc(sub) + "</div>" : "") + "</div>";
}

function dashAgoTxt(p) {
  if (p.ago == null) return "заходов в приложение пока нет";
  if (p.ago === 0) return "последний заход: сегодня";
  if (p.ago === 1) return "последний заход: вчера";
  return "последний заход: " + p.ago + " дн. назад";
}

function dashDots(p) {
  var set = {}; p.days.forEach(function (d) { set[d] = 1; });
  var h = "", t = new Date(dashToday() + "T00:00:00Z");
  for (var i = 13; i >= 0; i--) {
    var d = new Date(t.getTime() - i * 86400000).toISOString().slice(0, 10);
    h += '<i class="' + (set[d] ? "on" : "") + '"></i>';
  }
  return '<div class="dash-dots" aria-label="Заходы за 14 дней">' + h + "</div>";
}

function dashChart() {
  var map = {}; (DASH.data.daily || []).forEach(function (r) { map[r.d] = r.n; });
  var n = Math.min(DASH.days, 30), max = 1, cols = [], t = new Date(dashToday() + "T00:00:00Z");
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(t.getTime() - i * 86400000).toISOString().slice(0, 10), v = map[d] || 0;
    if (v > max) max = v;
    cols.push({ d: d, v: v });
  }
  var bars = cols.map(function (c) {
    return '<div class="dash-bar" title="' + c.d.slice(8, 10) + "." + c.d.slice(5, 7) + ": " + c.v + '"><b style="height:' + Math.max(c.v ? 8 : 2, Math.round(c.v / max * 100)) + '%"></b></div>';
  }).join("");
  return '<div class="dash-card"><div class="dash-h">Сколько учеников заходило по дням</div>' +
    '<div class="dash-chart">' + bars + '</div><div class="dash-axis"><span>' + n + ' дн. назад</span><span>макс. ' + max + '</span><span>сегодня</span></div></div>';
}

function dashFunnel(list) {
  var lessons = {};
  list.forEach(function (p) {
    Object.keys(p.progress || {}).forEach(function (n) {
      var s = p.progress[n] || {};
      var L = lessons[n] || (lessons[n] = { lecture: 0, quiz: 0, warmups: 0, song: 0 });
      ["lecture", "quiz", "warmups", "song"].forEach(function (k) { if (s[k]) L[k]++; });
    });
  });
  var nums = Object.keys(lessons).map(Number).sort(function (a, b) { return a - b; });
  var total = (DASH.roster || []).length || 1;
  if (!nums.length) return '<div class="dash-card"><div class="dash-h">Прохождение уроков</div><div class="dash-empty">Пока никто не начал уроки.</div></div>';
  var names = { lecture: "Лекция", quiz: "Тест", warmups: "Распевки", song: "Песня" };
  var rows = nums.map(function (n) {
    var L = lessons[n];
    var title = (typeof LESSON_SHORT !== "undefined" && LESSON_SHORT[n - 1]) ? LESSON_SHORT[n - 1] : "";
    var steps = ["lecture", "quiz", "warmups", "song"].map(function (k) {
      var pct = Math.round(L[k] / total * 100);
      return '<div class="dash-step"><span>' + names[k] + '</span><div class="dash-meter"><b style="width:' + pct + '%"></b></div><em>' + L[k] + "</em></div>";
    }).join("");
    return '<div class="dash-lesson"><div class="dash-lesson-t">Урок ' + n + (title ? " · " + dashEsc(title) : "") + "</div>" + steps + "</div>";
  }).join("");
  return '<div class="dash-card"><div class="dash-h">Прохождение уроков</div><div class="dash-hint">Сколько учеников из ' + total + ' дошли до шага. Где число резко падает — там бросают.</div>' + rows + "</div>";
}

function dashStudent(p) {
  var lost = p.inRoster && (p.ago == null || p.ago > 7);
  var tags = [];
  if (p.streak >= 2) tags.push('<span class="dash-tag ok">' + p.streak + " дн. подряд</span>");
  if (lost) tags.push('<span class="dash-tag warn">пропал</span>');
  if (!p.inRoster) tags.push('<span class="dash-tag">нет в списке учеников</span>');
  var hwAny = p.hw.done + p.hw.overdue + p.hw.open;
  var hw = p.hw.known && !hwAny ? "ДЗ: заданий нет" : p.hw.known
    ? "ДЗ: вовремя " + p.hw.onTime + (p.hw.late ? " · с опозданием " + p.hw.late : "") +
      (p.hw.done - p.hw.onTime - p.hw.late > 0 ? " · сдано " + (p.hw.done - p.hw.onTime - p.hw.late) : "") +
      (p.hw.overdue ? ' · <b class="warn">просрочено ' + p.hw.overdue + "</b>" : "") + (p.hw.open ? " · в работе " + p.hw.open : "")
    : (p.inRoster ? "ДЗ: загружаю…" : "");
  var res = [];
  if (p.quizAvg != null) res.push("тесты " + p.quizAvg + "%");
  if (p.pitchAvg != null) res.push("распевки " + p.pitchAvg + "%" + (p.pitchGrowth ? " (" + (p.pitchGrowth > 0 ? "+" : "") + p.pitchGrowth + ")" : ""));
  if (p.songs) res.push("песен в караоке " + p.songs);
  return '<div class="dash-st' + (lost ? " lost" : "") + '">' +
    '<div class="dash-st-top"><div class="dash-st-n">' + dashEsc(p.name) + "</div>" + tags.join("") + "</div>" +
    '<div class="dash-st-s">' + dashAgoTxt(p) + (p.activeInWin ? " · дней с заходами: " + p.activeInWin : "") + "</div>" +
    dashDots(p) +
    (hw ? '<div class="dash-st-s">' + hw + "</div>" : "") +
    (res.length ? '<div class="dash-st-s">Результаты: ' + res.join(" · ") + "</div>" : "") +
    "</div>";
}

function renderAdminDash() {
  dashLoad(false);
  var seg = '<div class="dash-seg">' + [7, 30, 90].map(function (d) {
    return '<button type="button" class="' + (DASH.days === d ? "on" : "") + '" data-dash-days="' + d + '">' + d + " дн.</button>";
  }).join("") + "</div>";
  var body;
  if (DASH.err) body = '<div class="courses-empty">' + dashEsc(DASH.err) + '</div><button class="cta" data-dash-reload>Обновить</button>';
  else if (!DASH.data) body = '<div class="courses-empty">Собираю данные…</div>';
  else {
    var list = dashModel();
    var roster = list.filter(function (p) { return p.inRoster; });
    var active = roster.filter(function (p) { return p.activeInWin > 0; }).length;
    var lost = roster.filter(function (p) { return p.ago == null || p.ago > 7; }).length;
    var hwT = { onTime: 0, late: 0, overdue: 0 };
    roster.forEach(function (p) { hwT.onTime += p.hw.onTime; hwT.late += p.hw.late; hwT.overdue += p.hw.overdue; });
    var timed = hwT.onTime + hwT.late;
    var qa = roster.filter(function (p) { return p.quizAvg != null; });
    var quizAvg = qa.length ? Math.round(qa.reduce(function (a, p) { return a + p.quizAvg; }, 0) / qa.length) : null;
    var loadingPub = roster.some(function (p) { return !p.hw.known; });
    body =
      '<div class="dash-tiles">' +
        dashTile(active + "<small> / " + roster.length + "</small>", "заходили за " + DASH.days + " дн.", lost ? "пропали больше недели: " + lost : "") +
        dashTile(timed ? Math.round(hwT.onTime / timed * 100) + "%" : "—", "ДЗ сдано вовремя", timed ? hwT.onTime + " из " + timed : "пока нет отметок") +
        dashTile(loadingPub ? "…" : String(hwT.overdue), "ДЗ просрочено", "") +
        dashTile(quizAvg == null ? "—" : quizAvg + "%", "средний балл тестов", "") +
      "</div>" +
      dashChart() +
      dashFunnel(roster) +
      '<div class="dash-card"><div class="dash-h">Ученики</div><div class="dash-hint">Точки — заходы за последние 14 дней. Сверху те, кто заходил недавно.</div>' +
        (list.length ? list.map(dashStudent).join("") : '<div class="dash-empty">Учеников пока нет.</div>') +
      "</div>" +
      '<div class="dash-foot">Заходы, тесты, распевки и караоке считаются с 20.11.2026 — до этого приложение их не записывало. ДЗ и уроки — из базы целиком.</div>';
  }
  app.innerHTML =
    '<div class="top pb8">' + backBtn("back") +
      '<div><div class="top-title lg">Дашборд</div><div class="top-sub">Как ученики занимаются в приложении</div></div>' +
    "</div>" +
    '<div class="dash">' + seg + body + "</div>";
  Array.prototype.forEach.call(app.querySelectorAll("[data-dash-days]"), function (b) {
    b.onclick = function () {
      var d = +b.getAttribute("data-dash-days");
      if (d === DASH.days) return;
      DASH.days = d; DASH.data = null; dashLoad(true); renderAdminDash();
    };
  });
  var rl = app.querySelector("[data-dash-reload]");
  if (rl) rl.onclick = function () { DASH.err = ""; DASH.data = null; dashLoad(true); renderAdminDash(); };
  wireActs();
}
window.renderAdminDash = renderAdminDash;
