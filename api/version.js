/* Какая версия приложения сейчас выложена. Значок «ДЗ» на iPhone не
   перезапускает страницу, когда его снова открывают: в памяти остаётся старый
   код, и новые изменения не видны часами. Приложение при каждом возвращении
   на экран спрашивает здесь версию и, если она сменилась, перезагружается. */
export const config = { runtime: "edge" };

export default function handler() {
  var v = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || "";
  return new Response(JSON.stringify({ v: v }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
