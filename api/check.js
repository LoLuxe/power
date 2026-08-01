// api/check.js
// Vercel Cron вызывает этот endpoint каждую минуту.
// Если роутер молчит >5 минут — шлём алерт в Telegram.

export default async function handler(req, res) {
  // Vercel Cron присылает заголовок Authorization
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ALERT_AFTER_MS = 5 * 60 * 1000; // 5 минут
  const now = Date.now();

  const lastStr = await kv_get('last_heartbeat');
  const isOffline = await kv_get('is_offline');

  if (!lastStr) {
    // Ещё ни одного heartbeat — ничего не делаем
    return res.status(200).json({ status: 'no data yet' });
  }

  const last = parseInt(lastStr);
  const silence = now - last;
  const silenceMin = Math.round(silence / 60000);

  console.log(`Silence: ${silenceMin} min, isOffline: ${isOffline}`);

  if (silence > ALERT_AFTER_MS && isOffline !== 'true') {
    // Переходим в offline — отправляем алерт
    await kv_set('is_offline', 'true');
    await kv_set('offline_since', last.toString());

    const lastSeen = new Date(last).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow', // поменяй на свой часовой пояс
    });

    await sendTelegram(
      `🚨 *Нет света / роутер упал!*\nПоследний сигнал: ${lastSeen}\nМолчание: ${silenceMin} мин.`
    );

    return res.status(200).json({ status: 'alert_sent', silenceMin });
  }

  return res.status(200).json({
    status: isOffline === 'true' ? 'offline' : 'ok',
    silenceMin,
  });
}

// ── Helpers (дублируем, чтобы не городить shared модуль) ─────────────────────

async function kv_get(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.result ?? null;
}

async function kv_set(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}/${encodeURIComponent(value)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!r.ok) throw new Error(`KV set failed: ${r.status}`);
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TG_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    }),
  });
}
