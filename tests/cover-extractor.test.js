// Парсинг тегов: MP3 (ID3v2.3 / v2.4), M4A (covr), FLAC (PICTURE), битые файлы.
// Файлы собираются прямо в тесте — байт в байт по спецификациям форматов.
const test = require("node:test");
const assert = require("node:assert/strict");
const jsmediatags = require("jsmediatags");
const CE = require("../cover-extractor.js");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 3)]);
const MP3_FRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);

function read(buf) {
  return new Promise((res, rej) => jsmediatags.read(buf, { onSuccess: res, onError: rej }));
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const syncsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);

/* ---------- MP3 ---------- */
function id3(version, frames) {
  const body = Buffer.concat(frames.map(([id, data]) =>
    Buffer.concat([Buffer.from(id), version === 4 ? syncsafe(data.length) : u32(data.length), Buffer.from([0, 0]), data])));
  return Buffer.concat([Buffer.from("ID3"), Buffer.from([version, 0, 0]), syncsafe(body.length), body, MP3_FRAME]);
}
const latin = (s) => Buffer.concat([Buffer.from([0]), Buffer.from(s, "latin1")]);
const utf16 = (s) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, "utf16le")]);
const utf8 = (s) => Buffer.concat([Buffer.from([3]), Buffer.from(s, "utf8")]);
const apic = (mime, img) => Buffer.concat([Buffer.from([0]), Buffer.from(mime + "\0", "latin1"), Buffer.from([3]), Buffer.from("\0"), img]);

/* ---------- M4A ---------- */
const box = (type, ...parts) => { const p = Buffer.concat(parts); return Buffer.concat([u32(p.length + 8), Buffer.from(type, "latin1"), p]); };
const dataAtom = (type, payload) => box("data", u32(type), u32(0), payload);
function m4a({ title, artist, cover }) {
  const items = [];
  if (title) items.push(box("©nam", dataAtom(1, Buffer.from(title, "utf8"))));
  if (artist) items.push(box("©ART", dataAtom(1, Buffer.from(artist, "utf8"))));
  if (cover) items.push(box("covr", dataAtom(13, cover)));
  const meta = box("meta", u32(0), box("hdlr", u32(0), u32(0), Buffer.from("mdirappl"), Buffer.alloc(9)), box("ilst", ...items));
  return Buffer.concat([box("ftyp", Buffer.from("M4A "), u32(0), Buffer.from("M4A mp42isom")), box("moov", box("udta", meta)), box("mdat", Buffer.alloc(64))]);
}

/* ---------- FLAC ---------- */
function flac({ comments, cover }) {
  const blocks = [];
  blocks.push([0, Buffer.alloc(34)]); // STREAMINFO
  if (comments) {
    const vendor = Buffer.from("test");
    const list = comments.map((c) => { const b = Buffer.from(c, "utf8"); return Buffer.concat([u32le(b.length), b]); });
    blocks.push([4, Buffer.concat([u32le(vendor.length), vendor, u32le(list.length), ...list])]);
  }
  if (cover) {
    const mime = Buffer.from("image/png");
    blocks.push([6, Buffer.concat([u32(3), u32(mime.length), mime, u32(0), u32(500), u32(500), u32(24), u32(0), u32(cover.length), cover])]);
  }
  const out = [Buffer.from("fLaC")];
  blocks.forEach(([type, data], i) => {
    const last = i === blocks.length - 1 ? 0x80 : 0;
    out.push(Buffer.from([last | type, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255]), data);
  });
  out.push(Buffer.alloc(32));
  return Buffer.concat(out);
}

test("MP3 ID3v2.3: APIC, исполнитель и название (UTF-16, кириллица)", async () => {
  const buf = id3(3, [["TIT2", utf16("Не для тебя")], ["TPE1", utf16("Пелагея")], ["APIC", apic("image/jpeg", JPEG)]]);
  const r = CE.normalize(await read(buf), "track.mp3");
  assert.equal(r.title, "Не для тебя");
  assert.equal(r.artist, "Пелагея");
  assert.equal(r.titleFromTags, true);
  assert.equal(r.picture.mime, "image/jpeg");
  assert.equal(r.picture.bytes.length, JPEG.length);
});

test("MP3 ID3v2.4: UTF-8 теги, MIME в теге неверный — тип берём по байтам", async () => {
  const buf = id3(4, [["TIT2", utf8("Blinding Lights")], ["TPE1", utf8("The Weeknd")], ["APIC", apic("image/jpeg", PNG)]]);
  const r = CE.normalize(await read(buf), "x.mp3");
  assert.equal(r.title, "Blinding Lights");
  assert.equal(r.artist, "The Weeknd");
  assert.equal(r.picture.mime, "image/png");
});

test("MP3 без обложки и без названия: название из имени файла", async () => {
  const buf = id3(3, [["TPE1", latin("Lube")]]);
  const r = CE.normalize(await read(buf), "https://x.public.blob.vercel-storage.com/tracks/Kon_minus.mp3");
  assert.equal(r.picture, null);
  assert.equal(r.artist, "Lube");
  assert.equal(r.title, "Kon minus");
  assert.equal(r.titleFromTags, false);
});

test("M4A: covr, ©nam, ©ART", async () => {
  const r = CE.normalize(await read(m4a({ title: "Обезоружена", artist: "Полина Гагарина", cover: JPEG })), "a.m4a");
  assert.equal(r.title, "Обезоружена");
  assert.equal(r.artist, "Полина Гагарина");
  assert.equal(r.picture.mime, "image/jpeg");
});

test("FLAC: PICTURE и VORBIS_COMMENT", async () => {
  const r = CE.normalize(await read(flac({ comments: ["TITLE=Конь", "ARTIST=Любэ"], cover: PNG })), "b.flac");
  assert.equal(r.title, "Конь");
  assert.equal(r.artist, "Любэ");
  assert.equal(r.picture.mime, "image/png");
});

test("обложка-мусор (не картинка) отбрасывается", async () => {
  const junk = Buffer.alloc(300, 0x41);
  const r = CE.normalize(await read(id3(3, [["TIT2", latin("X")], ["APIC", apic("image/jpeg", junk)]])), "x.mp3");
  assert.equal(r.picture, null);
  assert.equal(r.title, "X");
});

test("повреждённый файл: jsmediatags падает, normalize не нужен — read() вернёт имя файла", async () => {
  await assert.rejects(read(Buffer.from("это не аудио, а просто текст, обрезанный на середине")));
  // то же, что делает read() в браузере при ошибке
  const r = CE.normalize(null, "Мой трек (минус).mp3");
  assert.equal(r.title, "Мой трек (минус)");
  assert.equal(r.picture, null);
});

test("обрезанный ID3 (размер тега больше файла) не роняет разбор", async () => {
  const full = id3(3, [["TIT2", latin("Cut")], ["APIC", apic("image/jpeg", JPEG)]]);
  const cut = full.subarray(0, 60);
  let r;
  try { r = CE.normalize(await read(cut), "cut.mp3"); } catch (e) { r = CE.normalize(null, "cut.mp3"); }
  assert.ok(r.title);
  assert.ok(r.picture === null || r.picture.bytes.length > 0);
});

test("sniff узнаёт JPEG / PNG / WebP", () => {
  assert.equal(CE.sniff(JPEG), "image/jpeg");
  assert.equal(CE.sniff(PNG), "image/png");
  assert.equal(CE.sniff(Buffer.concat([Buffer.from("RIFF"), u32(0), Buffer.from("WEBPVP8 ")])), "image/webp");
  assert.equal(CE.sniff(Buffer.alloc(20)), null);
});
