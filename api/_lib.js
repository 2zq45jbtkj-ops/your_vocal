/* Общие хелперы для api/submit.js и api/telegram-webhook.js.
   Файл с "_" в начале имени — Vercel не делает из него отдельный роут,
   его можно спокойно импортировать как обычный модуль. */

export async function kvCmd(cmd) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    var res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(cmd)
    });
    var data = await res.json();
    return data ? data.result : null;
  } catch (e) {
    return null;
  }
}

export function kvSet(key, value) {
  return kvCmd(["SET", key, value]);
}

export function kvGet(key) {
  return kvCmd(["GET", key]);
}

export async function tgApi(token, method, payload) {
  var res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}
