#!/usr/bin/env bash
# Usage: SMOKE_PASSWORD=<owner password> [BASE=https://localhost] bash deploy/smoke.sh
BASE="${BASE:-https://localhost}"
PW="${SMOKE_PASSWORD:?set SMOKE_PASSWORD to the owner password}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
fail=0
check() { # name expected-status curl-args...
  local name="$1" want="$2"; shift 2
  local got; got=$(curl -ks -o /dev/null -w '%{http_code}' "$@") || got=000
  if [ "$got" = "$want" ]; then echo "PASS $name ($got)"; else echo "FAIL $name (want $want, got $got)"; fail=1; fi
}
check "health"                 200 "$BASE/api/health"
check "albums needs login"     401 "$BASE/api/albums"
check "media needs login"      401 "$BASE/media/x"
check "login"                  204 -c "$JAR" -H 'Content-Type: application/json' -d "{\"password\":\"$PW\"}" "$BASE/api/auth/login"
check "albums with cookie"     200 -b "$JAR" "$BASE/api/albums"
exit $fail
