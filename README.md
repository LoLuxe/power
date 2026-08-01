# 🔌 Heartbeat Monitor — мониторинг питания роутера

Роутер каждые 2 минуты стучится на Vercel. Если тишина >5 минут — Telegram-бот пишет алерт.
При восстановлении питания бот сообщит сколько времени пропало.

---

## Шаг 1 — Telegram бот

1. Напиши [@BotFather](https://t.me/BotFather) → `/newbot` → получишь **токен** вида `123456:ABCdef...`
2. Напиши своему новому боту любое сообщение
3. Открой в браузере: `https://api.telegram.org/bot<ТОКЕН>/getUpdates`
4. В ответе найди `"chat":{"id": 123456789}` — это твой **CHAT_ID**

---

## Шаг 2 — Upstash Redis (бесплатное KV хранилище)

1. Зайди на [upstash.com](https://upstash.com) → Sign Up (бесплатно)
2. Create Database → выбери регион поближе (EU West)
3. Открой созданную базу → вкладка **REST API**
4. Скопируй:
   - `UPSTASH_REDIS_REST_URL` → это будет `KV_REST_API_URL`
   - `UPSTASH_REDIS_REST_TOKEN` → это будет `KV_REST_API_TOKEN`

> Бесплатный план: 10k команд/день — нам нужно ~1440 (раз в 2 мин) + ~1440 (cron) = ~3k. Влезаем.

---

## Шаг 3 — Deploy на Vercel

```bash
# Установи Vercel CLI если нет
npm i -g vercel

# Задеплой
cd heartbeat-monitor
vercel --prod
```

Или через GitHub: залей папку в репозиторий → подключи на vercel.com → Import Project.

### Переменные окружения (Settings → Environment Variables)

| Переменная          | Значение                          |
|---------------------|-----------------------------------|
| `SECRET_TOKEN`      | Придумай сам, например `abc123xyz` |
| `KV_REST_API_URL`   | URL из Upstash                    |
| `KV_REST_API_TOKEN` | Token из Upstash                  |
| `TG_BOT_TOKEN`      | Токен от BotFather                |
| `TG_CHAT_ID`        | Твой chat_id                      |
| `CRON_SECRET`       | Придумай сам, например `cron_xyz` |

---

## Шаг 4 — Настройка роутера Keenetic

### Включить Entware (если ещё не включено)

1. Веб-интерфейс роутера → **Управление** → **Возможности** → установи **OPKG**
2. Или через USB: вставь флешку → роутер предложит установить Entware

### Установить curl и настроить cron

```sh
# Подключись к роутеру по SSH (порт 22 или 222)
ssh admin@192.168.1.1

# Установи curl
opkg update
opkg install curl

# Создай скрипт
cat > /opt/etc/heartbeat.sh << 'EOF'
#!/bin/sh
VERCEL_URL="https://ВАШ-ПРОЕКТ.vercel.app"
SECRET_TOKEN="ВАШ_СЕКРЕТНЫЙ_ТОКЕН"

curl -s -X POST \
  "${VERCEL_URL}/api/heartbeat?token=${SECRET_TOKEN}" \
  -o /dev/null \
  --max-time 10 \
  --retry 2 \
  --retry-delay 3
EOF

chmod +x /opt/etc/heartbeat.sh

# Добавь в cron (каждые 2 минуты)
echo "*/2 * * * * /opt/etc/heartbeat.sh" >> /opt/etc/cron.d/heartbeat

# Перезапусти cron
/etc/init.d/cron restart
```

### Проверка

```sh
# Запусти вручную и посмотри что вернёт
/opt/etc/heartbeat.sh && echo "OK"

# Или через curl напрямую
curl -v -X POST "https://ВАШ-ПРОЕКТ.vercel.app/api/heartbeat?token=ВАШ_ТОКЕН"
# Должен вернуть: {"ok":true,"ts":1234567890}
```

---

## Шаг 5 — Проверить что всё работает

1. Открой `https://ВАШ-ПРОЕКТ.vercel.app/api/status` — должно быть `{"status":"ONLINE",...}`
2. Подожди 2 минуты после первого запуска роутера
3. Чтобы проверить алерт: временно измени `ALERT_AFTER_MS` в `api/check.js` на `1 * 60 * 1000` (1 минута), задеплой, подожди

---

## Как это работает

```
Роутер                     Vercel                      Telegram
  │                           │                             │
  ├──POST /heartbeat──────────►│ сохраняет timestamp в KV   │
  │  (каждые 2 мин)           │                             │
  │                           │                             │
  │                    cron каждую минуту                   │
  │                           ├── если тишина > 5 мин ─────►│ 🚨 "Нет света!"
  │                           │                             │
  ├──POST /heartbeat──────────►│ видит is_offline=true      │
  │  (свет вернулся)          ├────────────────────────────►│ ✅ "Свет вернулся!"
```

---

## Часовой пояс

В `api/check.js` найди строку:
```js
timeZone: 'Europe/Moscow',
```
Замени на свой, например `Europe/Berlin`, `Asia/Yekaterinburg`, `Asia/Almaty`.

---

## Troubleshooting

**Роутер не может установить curl через opkg:**
Попробуй `opkg install wget` — замени `curl` на `wget -q -O /dev/null --post-data=""` в скрипте.

**Vercel Cron не работает на бесплатном плане:**
Бесплатный план Vercel поддерживает 1 cron job с минимальным интервалом 1 раз в день.
Решение: используй [cron-job.org](https://cron-job.org) (бесплатно) — создай задачу на URL `/api/check` с интервалом каждую минуту, добавь заголовок `Authorization: Bearer ВАШ_CRON_SECRET`.

**Альтернатива Vercel Cron → cron-job.org:**
1. Зайди на cron-job.org → Sign Up
2. Create cronjob → URL: `https://ВАШ-ПРОЕКТ.vercel.app/api/check`
3. Interval: every 1 minute
4. Advanced → Headers: `Authorization: Bearer ВАШ_CRON_SECRET`
