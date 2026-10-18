#!/usr/bin/env bash
# Usage: SMOKE_PASSWORD=<owner password> [BASE=http://localhost:8080] bash deploy/smoke.sh   (standalone: BASE=https://localhost)
BASE="${BASE:-http://localhost:8080}"
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
check "encoded /api needs login" 401 "$BASE/%61pi/albums"
check "media needs login"      401 "$BASE/media/x"
check "login"                  204 -c "$JAR" -H 'Content-Type: application/json' -d "{\"password\":\"$PW\"}" "$BASE/api/auth/login"
check "albums with cookie"     200 -b "$JAR" "$BASE/api/albums"
check "media missing is 404"   404 -b "$JAR" "$BASE/media/00000000-0000-0000-0000-000000000000/thumb.webp"
if curl -ks -D- -o /dev/null -b "$JAR" "$BASE/media/00000000-0000-0000-0000-000000000000/thumb.webp" | grep -qi immutable; then echo "FAIL 404 carries immutable"; fail=1; else echo "PASS 404 not immutable"; fi
if curl -ks --path-as-is -b "$JAR" "$BASE/media/../../../../etc/passwd" | grep -q "^root:"; then echo "FAIL path traversal leaks /etc/passwd"; fail=1; else echo "PASS path traversal does not leak"; fi
# SPA + a real upload, fetched at /media/<key> exactly as the built bundle builds media URLs.
check "spa index"              200 "$BASE/"
JS=$(curl -ks "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)
if [ -n "$JS" ] && curl -ks "$BASE$JS" | grep -q '"/media"'; then echo "PASS bundle builds /media URLs"; else echo "FAIL bundle builds /media URLs ($JS)"; fail=1; fi
FX="$(dirname "$0")/../server/test/fixtures/rotated.jpg"
b64() { printf %s "$1" | base64 | tr -d '\n'; }
ALBUM=$(curl -ks -b "$JAR" -H 'Content-Type: application/json' -d '{"title":"smoke"}' "$BASE/api/albums" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
LOC=$(curl -ks -D- -o /dev/null -b "$JAR" -X POST -H 'Tus-Resumable: 1.0.0' -H "Upload-Length: $(wc -c <"$FX" | tr -d ' ')" \
  -H "Upload-Metadata: albumId $(b64 "$ALBUM"),filename $(b64 smoke.jpg),filetype $(b64 image/jpeg)" "$BASE/api/uploads" \
  | tr -d '\r' | sed -n 's/^[Ll]ocation: //p')
check "tus patch"              204 -b "$JAR" -X PATCH -H 'Tus-Resumable: 1.0.0' -H 'Upload-Offset: 0' \
  -H 'Content-Type: application/offset+octet-stream' --data-binary @"$FX" "$BASE$LOC"
KEY=""
for _ in $(seq 1 30); do
  KEY=$(curl -ks -b "$JAR" "$BASE/api/media/${LOC##*/}" | grep -o '"display":"[^"]*"' | cut -d'"' -f4)
  [ -n "$KEY" ] && break; sleep 1
done
check "uploaded media url"     200 -b "$JAR" "$BASE/media/$KEY"
[ -n "$ALBUM" ] && curl -ks -o /dev/null -b "$JAR" -X DELETE "$BASE/api/albums/$ALBUM"
exit $fail
