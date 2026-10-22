/* Собирает читаемые версии оферты, политики конфиденциальности и страницы
   «О преподавателе» из ../legal.js — того самого файла, который показывает
   приложение. Единственный источник правды — legal.js; .md и .pdf
   пересобираются, а не правятся руками, иначе они разойдутся с тем, что
   видит ученик, а для публичной оферты это уже юридическая проблема.

   Запуск (из папки приложения):
       node документация/собрать.js

   Markdown собирается всегда. PDF — только если найден Chrome: он верстает
   страницу и сам умеет в кириллицу, сторонних конвертеров на этой машине нет
   (Homebrew не установлен). Нумерация страниц дописывается отдельным
   проходом через PyMuPDF, если найден venv; без него PDF просто будет без
   номеров — на содержимое это не влияет.
*/

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PYTHON = path.join(os.homedir(), ".local/vocal-stt/bin/python");

const FILES = {
  offer: "оферта",
  privacy: "политика-конфиденциальности",
  about: "о-преподавателе",
};

/* ---------- источник ---------- */

// legal.js — обычный браузерный скрипт без module.exports, поэтому
// выполняем его в песочнице и забираем объявленные в нём переменные.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "legal.js"), "utf8"), sandbox);

const DOCS = sandbox.LEGAL_DOCS;
if (!DOCS) {
  console.error("Не нашёл LEGAL_DOCS в legal.js — формат файла изменился?");
  process.exit(1);
}

/* ---------- markdown ---------- */

function toMarkdown(doc) {
  const out = ["# " + doc.title, ""];
  if (doc.sub) out.push("**" + doc.sub + "**", "");
  if (doc.version) out.push("_" + doc.version + "_", "");

  doc.sections.forEach((s) => {
    if (s.note) {
      out.push(s.note.split("\n").map((l) => "> " + l).join("\n"), "");
      return;
    }
    if (s.h) out.push("## " + s.h, "");
    (s.p || []).forEach((t) => out.push(t, ""));
    if (s.list && s.list.length) {
      s.list.forEach((t) => out.push("- " + t));
      out.push("");
    }
    if (s.after) out.push(s.after, "");
  });

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* ---------- html для печати ---------- */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Georgia для текста и Helvetica Neue для заголовков — обе есть в macOS из
   коробки и обе покрывают кириллицу, подключать веб-шрифты незачем (Chrome
   печатает офлайн). `page-break-after: avoid` на заголовках не даёт пункту
   оторваться от своего номера на разрыве страницы — в договоре это важно. */
function toHtml(doc) {
  const body = doc.sections.map((s) => {
    if (s.note) {
      return '<div class="note">' + esc(s.note).replace(/\n/g, "<br>") + "</div>";
    }
    let h = "";
    if (s.h) h += "<h2>" + esc(s.h) + "</h2>";
    (s.p || []).forEach((t) => { h += "<p>" + esc(t) + "</p>"; });
    if (s.list && s.list.length) {
      h += "<ul>" + s.list.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>";
    }
    if (s.after) h += "<p>" + esc(s.after) + "</p>";
    return "<section>" + h + "</section>";
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm 18mm; }
  body {
    font: 10.5pt/1.55 Georgia, 'Times New Roman', serif;
    color: #111; margin: 0; hyphens: auto;
  }
  h1 {
    font: 700 19pt/1.25 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 0 0 4pt;
  }
  .sub {
    font: 400 11pt/1.3 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #444; margin-bottom: 2pt;
  }
  .version { font-size: 9pt; color: #777; margin-bottom: 16pt; }
  hr { border: none; border-top: 1px solid #ccc; margin: 0 0 16pt; }
  h2 {
    font: 700 12pt/1.3 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 16pt 0 6pt; page-break-after: avoid;
  }
  section { page-break-inside: auto; }
  p { margin: 0 0 7pt; text-align: justify; }
  ul { margin: 2pt 0 9pt; padding-left: 16pt; }
  li { margin-bottom: 5pt; }
  .note {
    background: #f4f1ec; border-left: 3px solid #AE5F3F;
    padding: 9pt 12pt; margin: 0 0 14pt; font-size: 10pt;
    page-break-inside: avoid;
  }
</style></head><body>
<h1>${esc(doc.title)}</h1>
${doc.sub ? '<div class="sub">' + esc(doc.sub) + "</div>" : ""}
${doc.version ? '<div class="version">' + esc(doc.version) + "</div>" : ""}
<hr>
${body}
</body></html>`;
}

/* ---------- pdf ---------- */

function chromeAvailable() {
  try { fs.accessSync(CHROME, fs.constants.X_OK); return true; }
  catch (e) { return false; }
}

function htmlToPdf(htmlPath, pdfPath) {
  // --no-pdf-header-footer убирает служебную шапку Chrome: без него в углу
  // каждой страницы печатался бы длинный file:///… путь.
  execFileSync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--print-to-pdf=" + pdfPath,
    "file://" + htmlPath,
  ], { stdio: "ignore", timeout: 60000 });
}

// Нумерация страниц вторым проходом: Chrome из командной строки свой колонтитул
// настроить не даёт (только весь или ничего), а в договоре «стр. 3 из 7» нужна.
// Встроенные шрифты PDF (helv и прочая «базовая четырнадцатка») — latin-1,
// кириллицы в них нет вообще: «3 из 7» напечаталось бы как «3 ·· 7».
// Поэтому подкладываем системный Arial; если его нет — пишем «3 / 7»,
// что читается без кириллицы.
const STAMP_PY = `
import os, sys, fitz

ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
path = sys.argv[1]
doc = fitz.open(path)
total = len(doc)
if total > 1:
    cyrillic = os.path.exists(ARIAL)
    for i, page in enumerate(doc):
        r = page.rect
        label = ("%d из %d" if cyrillic else "%d / %d") % (i + 1, total)
        kw = {"fontfile": ARIAL, "fontname": "ar"} if cyrillic else {"fontname": "helv"}
        page.insert_text(
            (r.width / 2 - 26, r.height - 28), label,
            fontsize=8, color=(0.45, 0.45, 0.45), **kw)
    # Ради десятка цифр в колонтитуле PDF тащил бы в себе ВЕСЬ Arial (~1 МБ
    # на документ). subset_fonts оставляет только использованные глифы, а
    # полное пересохранение с garbage=4 — вместо saveIncr, который лишь
    # дописывает новую ревизию в хвост файла, ничего не выбрасывая.
    try:
        doc.subset_fonts()
    except Exception:
        pass
    tmp = path + ".tmp"
    doc.save(tmp, garbage=4, deflate=True)
    doc.close()
    os.replace(tmp, path)
print(total)
`;

function stampPageNumbers(pdfPath) {
  try { fs.accessSync(PYTHON, fs.constants.X_OK); } catch (e) { return null; }
  try {
    const out = execFileSync(PYTHON, ["-c", STAMP_PY, pdfPath], { encoding: "utf8", timeout: 60000 });
    return parseInt(out.trim(), 10) || null;
  } catch (e) {
    return null;
  }
}

/* ---------- сборка ---------- */

const keys = Object.keys(FILES).filter((k) => {
  if (DOCS[k]) return true;
  console.error("В legal.js нет документа «" + k + "» — пропускаю.");
  return false;
});

const withPdf = chromeAvailable();
if (!withPdf) {
  console.log("Chrome не найден — собираю только Markdown.\n" +
    "  (ожидался " + CHROME + ")\n");
}

let pages = 0;
keys.forEach((key) => {
  const base = FILES[key];
  fs.writeFileSync(path.join(HERE, base + ".md"), toMarkdown(DOCS[key]), "utf8");
  let line = "  " + base + ".md";

  if (withPdf) {
    // .html — промежуточный файл только ради Chrome, в папке не остаётся.
    const htmlPath = path.join(os.tmpdir(), "legal-" + key + ".html");
    const pdfPath = path.join(HERE, base + ".pdf");
    fs.writeFileSync(htmlPath, toHtml(DOCS[key]), "utf8");
    try {
      htmlToPdf(htmlPath, pdfPath);
      const n = stampPageNumbers(pdfPath);
      if (n) pages += n;
      line += "  +  " + base + ".pdf" + (n ? " (" + n + " стр.)" : "");
    } catch (e) {
      line += "  — PDF не собрался: " + (e.message || e).toString().split("\n")[0];
    }
    fs.unlinkSync(htmlPath);
  }
  console.log(line);
});

console.log("\nГотово: " + keys.length + " документа пересобрано из legal.js" +
  (pages ? ", " + pages + " страниц в PDF" : ""));
