/* 26.11: диагностика входа в «Админ» — что приложение знает о подписи Telegram.
   Отдаёт только да/нет, без токенов и идентификаторов. */
import { json, verifyInitData } from "./_db.js";
export const config = { runtime: "edge" };
export default async function handler(req) {
  var init = String(req.headers.get("x-tg-init-data") || "");
  var p = new URLSearchParams(init);
  var age = Number(p.get("auth_date") || 0);
  var me = init ? await verifyInitData(init) : null;
  var admin = process.env.ADMIN_CHAT_ID;
  var u = null; try { u = JSON.parse(p.get("user") || "null"); } catch (e) {}
  return json({ hasInit: !!init, hasHash: !!p.get("hash"), ageMin: age ? Math.round((Date.now() / 1000 - age) / 60) : null,
    verifiedHere: !!me, adminHere: !!(me && admin && me === String(admin)), claimsAdmin: !!(u && admin && String(u.id) === String(admin)) });
}
