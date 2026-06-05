#!/bin/sh
set -e

# Suporte a variáveis com prefixo VITE_ (Easypanel) ou sem prefixo (docker-compose)
SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"

CONFIG_FILE="/usr/share/nginx/html/config.js"
TEMPLATE="/etc/dashboard/config.template.js"

if [ -f "$TEMPLATE" ]; then
  sed \
    -e "s|__SUPABASE_URL__|${SUPABASE_URL}|g" \
    -e "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" \
    -e "s|__DASHBOARD_ANO__|${DASHBOARD_ANO:-2026}|g" \
    "$TEMPLATE" > "$CONFIG_FILE"
fi

exec nginx -g "daemon off;"
