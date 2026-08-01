// api/telegram.js — вебхук Telegram бота
// Команды: /start (подписаться), /stop (отписаться), /status (текущий статус)
//
// Настройка вебхука (один раз, после деплоя):
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://ВАШ-ПРОЕКТ.vercel.app/api/telegram

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const update = req.body;
  const msg = update?.message;
  if (!msg) return res.status(200).end();

  const chatId = msg.chat.id.toString();
  const text = (msg.text || '').trim().toLowerCase();
  const firstName = msg.from?.first_name || 'друг';

  if (text.startsWith('/start')) {
    await addSubscriber(chatId);
    await sendTelegram(chatId,
      `👋 Привет, ${firstName}!\n\nТы подписан на уведомления о питании роутера.\n\n` +
      `Я напишу тебе если:\n• 🚨 Пропадёт свет (роутер замолчит >5 мин)\n• ✅ Свет вернётся\n\n` +
      `Команды:\n/status — текущий статус\n/stop — отписаться`
    );
  } else if (text.startsWith('/stop')) {
    await removeSubscriber(chatId);
    await sendTelegram(chatId, '👋 Ты отписан от уведомлений. Напиши /start чтобы подписаться снова.');
  } else if (text.startsWith('/status')) {
    const lastStr = await kv_get('last_heartbeat');
    const isOffline = await kv_get('is_offline');
    if (!lastStr) {
      await sendTelegram(chatId, '❓ Данных пока нет — роутер ещё не отправлял сигналы.');
    } else {
      const silenceSec = Math.round((Date.now() - parseInt(lastStr)) / 1000);
      const silenceStr = silenceSec < 60 ? `${silenceSec} сек` : `${Math.round(silenceSec/60)} мин`;
      const lastTime = new Date(parseInt(lastStr)).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const statusEmoji = isOffline === 'true' ? '🔴' : '🟢';
      const statusText = isOffline === 'true' ? 'НЕТ СВЕТА' : 'Есть свет';
      await sendTelegram(chatId,
        `${statusEmoji} *${statusText}*\n\nПоследний сигнал: ${lastTime}\nТишина: ${silenceStr}`
      );
    }
  } else {
    await sendTelegram(chatId, 'Команды: /start — подписаться, /stop — отписаться, /status — статус');
  }

  return res.status(200).end();
}

// ── Подписчики ────────────────────────────────────────────────────────────────

async function addSubscriber(chatId) {
  const list = await getSubscribers();
  if (!list.includes(chatId)) {
    list.push(chatId);
    await kv_set('subscribers', JSON.stringify(list));
  }
}

async function removeSubscriber(chatId) {
  const list = await getSubscribers();
  const updated = list.filter(id => id !== chatId);
  await kv_set('subscribers', JSON.stringify(updated));
}

async function getSubscribers() {
  const str = await kv_get('subscribers');
  return str ? JSON.parse(str) : [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
