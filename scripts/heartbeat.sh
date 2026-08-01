#!/bin/sh
# heartbeat.sh — запускается на роутере через cron каждые 2 минуты
#
# Установка на Keenetic:
#   1. Включи OPKG / Entware в веб-интерфейсе роутера
#   2. opkg install curl
#   3. Положи этот файл в /opt/etc/heartbeat.sh
#   4. chmod +x /opt/etc/heartbeat.sh
#   5. Добавь в cron (crontab -e):
#      */2 * * * * /opt/etc/heartbeat.sh

VERCEL_URL="https://ВАШ-ПРОЕКТ.vercel.app"
SECRET_TOKEN="ВАШ_СЕКРЕТНЫЙ_ТОКЕН"

curl -s -X POST \
  "${VERCEL_URL}/api/heartbeat?token=${SECRET_TOKEN}" \
  -o /dev/null \
  --max-time 10 \
  --retry 2 \
  --retry-delay 3

# Лог для отладки (опционально, уберите если не нужен)
# echo "$(date): heartbeat sent" >> /opt/var/log/heartbeat.log
