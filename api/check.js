// api/check.js — вызывается cron-job.org каждую минуту

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ALERT_AFTER_MS = 5 * 60 * 1000;
  const now = Date.now();

  const [lastStr, isOffline] = await Promise.all([
    kv_get('last_heartbeat'),
    kv_get('is_offline'),
  ]);

  if (!lastStr) return res.status(200).json({ status: 'no data yet' });

  const silence = now - parseInt(lastStr);
  const silenceMin = Math.round(silence / 60000);

  if (silence > ALERT_AFTER_MS && isOffline !== 'true') {
    await kv_set('is_offline', 'true');
    await kv_set('offline_since', parseInt(lastStr).toString());

    const lastSeen = new Date(parseInt(lastStr)).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    await broadcast(`🚨 *Нет света / роутер упал!*\nПоследний сигнал: ${lastSeen}\nМолчание: ${silenceMin} мин.`);

    return res.status(200).json({ status: 'alert_sent', silenceMin });
  }

  return res.status(200).json({ status: isOffline === 'true' ? 'offline' : 'ok', silenceMin });
}

async function broadcast(text) {
  const str = await kv_get('subscribers');
  const subscribers = str ? JSON.parse(str) : [];
  await Promise.all(subscribers.map(chatId => sendTelegram(chatId, text)));
}

async function kv_get(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  if (!r.ok) return null;
  const data = await r.json();
  return data.result ?? null;
}

async function kv_set(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}/${encodeURIComponent(value)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  if (!r.ok) throw new Error(`KV set failed: ${r.status}`);
}

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}
