// api/heartbeat.js

export default async function handler(req, res) {
  const token = req.headers['x-token'] || req.query.token;
  if (token !== process.env.SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();

  await kv_set('last_heartbeat', now.toString());

  // История последних 5 сигналов
  const historyStr = await kv_get('heartbeat_history');
  const history = historyStr ? JSON.parse(historyStr) : [];
  history.unshift(now);
  if (history.length > 5) history.length = 5;
  await kv_set('heartbeat_history', JSON.stringify(history));

  // Если был оффлайн — рассылаем восстановление
  const wasOffline = await kv_get('is_offline');
  if (wasOffline === 'true') {
    await kv_set('is_offline', 'false');
    const downSince = await kv_get('offline_since');
    const downtimeMs = downSince ? now - parseInt(downSince) : 0;
    const downtimeMin = Math.round(downtimeMs / 60000);
    await broadcast(`✅ *Свет вернулся!*\nРоутер снова в сети.\nПростой: ~${downtimeMin} мин.`);
  }

  return res.status(200).json({ ok: true, ts: now });
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
