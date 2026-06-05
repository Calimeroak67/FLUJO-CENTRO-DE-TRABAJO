#!/bin/sh
set -e

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
