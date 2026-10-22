/* Собирает читаемые .md-версии оферты, политики конфиденциальности и страницы
   «О преподавателе» из ../legal.js — того самого файла, который показывает
   приложение. Единственный источник правды — legal.js; эти .md пересобираются,
   а не правятся руками, иначе они разойдутся с тем, что видит ученик.

   Запуск (из папки приложения):
       node документация/собрать.js
*/

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

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

const FILES = {
  offer: "оферта.md",
  privacy: "политика-конфиденциальности.md",
  about: "о-преподавателе.md",
};

function render(doc) {
  const out = ["# " + doc.title, ""];
  if (doc.sub) out.push("**" + doc.sub + "**", "");
  if (doc.version) out.push("_" + doc.version + "_", "");

  doc.sections.forEach((s) => {
    if (s.note) {
      // Выделенная плашка приложения → цитата в Markdown.
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

  // Схлопываем хвост пустых строк, чтобы файл заканчивался одним переводом.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

let written = 0;
Object.keys(FILES).forEach((key) => {
  if (!DOCS[key]) {
    console.error("В legal.js нет документа «" + key + "» — пропускаю.");
    return;
  }
  const file = path.join(__dirname, FILES[key]);
  fs.writeFileSync(file, render(DOCS[key]), "utf8");
  console.log("  записан  " + FILES[key]);
  written += 1;
});

console.log(written === Object.keys(FILES).length
  ? "\nГотово: " + written + " документа пересобрано из legal.js"
  : "\nЗаписано " + written + " из " + Object.keys(FILES).length + " — см. ошибки выше");
