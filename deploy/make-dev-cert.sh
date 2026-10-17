#!/usr/bin/env bash
# Self-signed cert for local runs -> deploy/certs/{fullchain,privkey}.pem (git-ignored). Needs only Docker.
set -e
cd "$(dirname "$0")"
mkdir -p certs
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd)/certs:/certs" alpine/openssl \
  req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout /certs/privkey.pem -out /certs/fullchain.pem
echo "wrote deploy/certs/fullchain.pem and privkey.pem"
