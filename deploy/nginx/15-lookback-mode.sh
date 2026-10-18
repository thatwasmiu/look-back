#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.d before nginx starts: picks the config for LOOKBACK_MODE.
set -e
case "${LOOKBACK_MODE:-behind-proxy}" in
  standalone)   cp /etc/nginx/lookback/standalone.conf /etc/nginx/conf.d/default.conf ;;
  behind-proxy) cp /etc/nginx/lookback/behind-proxy.conf /etc/nginx/conf.d/default.conf ;;
  *) echo "LOOKBACK_MODE must be 'standalone' or 'behind-proxy' (got '$LOOKBACK_MODE')" >&2; exit 1 ;;
esac
echo "lookback: nginx mode ${LOOKBACK_MODE:-behind-proxy}"
