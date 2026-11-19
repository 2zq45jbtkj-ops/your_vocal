// Запуск: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../palette-resolver.js");

const W = 64, H = 64;

// Картинка 64×64 из горизонтальных полос: [[r,g,b], доля]
function image(bands) {
  const data = new Uint8ClampedArray(W * H * 4);
  let row = 0;
  bands.forEach(([rgb, share], bi) => {
    const rows = bi === bands.length - 1 ? H - row : Math.round(share * H);
    for (let y = row; y < row + rows; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        // лёгкий шум, как на настоящем фото
        const n = ((x * 7 + y * 13) % 9) - 4;
        data[o] = rgb[0] + n; data[o + 1] = rgb[1] + n; data[o + 2] = rgb[2] + n; data[o + 3] = 255;
      }
    }
    row += rows;
  });
  return data;
}

function gradientBW() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.round((x + y) * 2), o = (y * W + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
  }
  return data;
}

const ORANGE = [214, 120, 40], BLUE = [40, 80, 170], NAVY = [20, 24, 40];

test("цветная обложка: доминантный — самый частый цвет, не монотонная", () => {
  const p = P.fromPixels(image([[ORANGE, 0.55], [BLUE, 0.25], [NAVY, 0.2]]), W, H);
  assert.equal(p.mono, false);
  const d = P.hexToRgb(p.dominant);
  assert.ok(d[0] > 180 && d[2] < 80, "доминантный оранжевый, получили " + p.dominant);
  const s = P.hexToRgb(p.second);
  assert.ok(s[2] > s[0], "второй цвет синий, получили " + p.second);
  assert.ok(P.contrast(p.dark, "#000") < P.contrast(p.dominant, "#000"), "тёмный вариант темнее");
});

test("цветная обложка: фон из обложки, текст и подсветка ≥ 4.5 : 1", () => {
  const p = P.fromPixels(image([[ORANGE, 0.55], [BLUE, 0.25], [NAVY, 0.2]]), W, H);
  ["light", "dark"].forEach((theme) => {
    const r = P.resolve(p, { theme, enabled: P.PRESETS.map((x) => x.hex) });
    assert.equal(r.source, "cover");
    assert.ok(P.contrast(r.text, r.base) >= 4.5, theme + ": текст к base");
    assert.ok(P.contrast(r.text, r.deep) >= 4.5, theme + ": текст к deep");
    assert.ok(P.contrast(r.accent, r.base) >= 4.5 && P.contrast(r.accent, r.deep) >= 4.5, theme + ": подсветка");
  });
});

test("монотонная обложка (один цвет > 85%) → цвет из настроек", () => {
  const p = P.fromPixels(image([[BLUE, 0.92], [[60, 100, 190], 0.08]]), W, H);
  assert.equal(p.mono, true);
  const enabled = ["#6b3a7a", "#1d7458"];
  const r = P.resolve(p, { enabled, rng: () => 0 });
  assert.equal(r.source, "preset");
  assert.ok(enabled.includes(r.color));
});

test("обложка почти без цвета (насыщенность < 0.12) → монотонная", () => {
  const p = P.fromPixels(image([[[150, 140, 132], 0.5], [[90, 86, 82], 0.5]]), W, H);
  assert.equal(p.mono, true);
  assert.ok(p.avgSat < 0.12);
});

test("чёрно-белое фото → монотонная, причина bw", () => {
  const p = P.fromPixels(gradientBW(), W, H);
  assert.equal(p.mono, true);
  assert.equal(p.reason, "bw");
  const r = P.resolve(p, { enabled: P.PRESETS.map((x) => x.hex), rng: () => 0.5 });
  assert.equal(r.source, "preset");
  assert.ok(P.contrast(r.text, r.base) >= 4.5);
});

test("случайный цвет — только среди включённых", () => {
  const enabled = ["#2f5f8a"];
  for (let i = 0; i < 20; i++) {
    assert.equal(P.pickPreset(enabled, { rng: Math.random }), "#2f5f8a");
  }
});

test("случайный цвет не сливается с обложкой", () => {
  // обложка синяя → синий из набора не берём, пока есть другие
  const pick = P.pickPreset(["#2f5f8a", "#a94f37"], { cover: "#2f5f8a", rng: () => 0 });
  assert.equal(pick, "#a94f37");
});

test("средне-серый цвет, не проходящий контраст ни с белым, ни с тёмным текстом,, не выбирается, если есть подходящий", () => {
  const pick = P.pickPreset(["#808080", "#3b3f99"], { rng: () => 0 });
  assert.equal(pick, "#3b3f99");
});

test("сохранённый цвет трека важнее обложки", () => {
  const p = P.fromPixels(image([[ORANGE, 0.6], [BLUE, 0.4]]), W, H);
  const r = P.resolve(p, { saved: "#136a73" });
  assert.equal(r.source, "saved");
  assert.equal(r.color, "#136a73");
});

test("«Перемешать цвет» не выдаёт текущий цвет", () => {
  const all = P.PRESETS.map((x) => x.hex);
  for (let i = 0; i < 30; i++) {
    assert.notEqual(P.pickPreset(all, { exclude: all[0], rng: Math.random }), all[0]);
  }
});

test("все цвета по умолчанию проходят контраст с белым текстом", () => {
  P.PRESETS.forEach((x) => {
    assert.ok(P.contrast("#ffffff", x.hex) >= 4.5, x.name);
    assert.ok(P.contrast("#ffffff", P.darken(x.hex, 0.45)) >= 4.5, x.name + " deep");
  });
});

test("ярко-жёлтая обложка: фон затемняется, пока текст не станет читаемым", () => {
  const p = P.fromPixels(image([[[240, 210, 40], 0.6], [[200, 60, 40], 0.4]]), W, H);
  const r = P.resolve(p, { theme: "light" });
  assert.ok(P.contrast(r.text, r.base) >= 4.5 && P.contrast(r.text, r.deep) >= 4.5);
});

test("пустая / прозрачная картинка не падает", () => {
  const p = P.fromPixels(new Uint8ClampedArray(W * H * 4), W, H);
  assert.equal(p.mono, true);
  const r = P.resolve(p, { enabled: [] });
  assert.equal(r.source, "preset");
});
