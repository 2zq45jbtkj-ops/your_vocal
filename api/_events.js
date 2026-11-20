/* Аналитика для дашборда в «Режиме админа» (20.11, просьба Николая).
   Одна таблица событий: кто (хэш кода доступа ученика — сам код в базу не
   кладём), что сделал, когда. Пишет api/track.js, читает api/admin-dash.js. */

export async function ensureEvents(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_events (
    id BIGSERIAL PRIMARY KEY,
    skey TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS app_events_skey_at ON app_events (skey, at)`;
  await sql`CREATE INDEX IF NOT EXISTS app_events_type_at ON app_events (type, at)`;
}

export async function studentKey(token) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("").slice(0, 32);
}
