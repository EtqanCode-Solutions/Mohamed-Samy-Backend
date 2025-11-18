#!/usr/bin/env bash
# سكربت اختياري لانتظار MySQL قبل تشغيل التطبيق داخل Docker
set -e

host="${MYSQL_HOST:-127.0.0.1}"
port="${MYSQL_PORT:-3306}"

echo "Waiting for MySQL at $host:$port ..."
until nc -z "$host" "$port"; do
  sleep 1
done

echo "MySQL is up."
exec "$@"
