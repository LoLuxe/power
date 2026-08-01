// api/status.js — отдаёт статус + последние 5 сигналов

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const [lastStr, isOffline, historyStr] = await Promise.all([
    kv_get('last_heartbeat'),
    kv_get('is_offline'),
    kv_get('heartbeat_history'),
  ]);

  if (!lastStr) {
    return res.status(200).json({ status: 'no_data', history: [] });
  }

  const last = parseInt(lastStr);
  const silenceMs = Date.now() - last;
  const history = historyStr ? JSON.parse(historyStr) : [];

  return res.status(200).json({
    status: isOffline === 'true' ? 'OFFLINE' : 'ONLINE',
    last_seen: new Date(last).toISOString(),
    silence_seconds: Math.round(silenceMs / 1000),
    history,
  });
}

async function kv_get(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.result ?? null;
}
