/* Манифест для значка «ДЗ» на экране телефона по личной ссылке ?k=<код доступа>.
   Отличается от /manifest.webmanifest только адресом запуска: значок открывает
   приложение сразу в кабинете этого ученика. Код ничего не открывает сам по
   себе — это тот же код доступа, который ученик вводит на экране входа. */
export const config = { runtime: "edge" };

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function handler(req) {
  var k = (new URL(req.url).searchParams.get("k") || "").toLowerCase();
  var start = UUID.test(k) ? "/?k=" + k : "/";
  var body = {
    id: start,
    name: "Домашка по вокалу",
    short_name: "СЕПТ · ДЗ",
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: "#F2ECE7",
    theme_color: "#F2ECE7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
    ]
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex"
    }
  });
}
