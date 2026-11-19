// Запуск: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../karaoke-fx.js");

function mem() { const m = {}; return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, m }; }

test("первая песня — рифлёное + лучи + Бордо, вариант закрепляется", () => {
  const st = mem();
  assert.deepEqual(F._comboFor("a", st, () => 0.99), { g: 0, u: 0, p: 0 });
  assert.deepEqual(F._comboFor("a", st, () => 0.5), { g: 0, u: 0, p: 0 });
});

test("следующие песни — случайный вариант, тоже закрепляется", () => {
  const st = mem();
  F._comboFor("a", st);
  const c = F._comboFor("b", st, () => 0.99);
  assert.deepEqual(c, { g: 1, u: 3, p: 2 });
  assert.deepEqual(F._comboFor("b", st, () => 0), c);
});

test("испорченная запись заменяется корректной", () => {
  const st = mem();
  st.set("kar.fx.first", "1");
  st.set("kar.fx.song.x", '{"g":5,"u":1,"p":0}');
  assert.ok(F._validCombo(F._comboFor("x", st, () => 0.1)));
});

test("«Случайный» не повторяет текущий вариант", () => {
  let i = 0; const seq = [0, 0, 0, 0.6, 0.6, 0.6];
  const c = F._randomCombo(() => seq[i++], { g: 0, u: 0, p: 0 });
  assert.notDeepEqual(c, { g: 0, u: 0, p: 0 });
});
