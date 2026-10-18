# Shared by both modes (server level). The including server sets $fwd_proto first.

root /usr/share/nginx/html;
set $api api:3000;

# Shared proxy headers. X-Forwarded-For is OVERWRITTEN with $remote_addr (the real visitor: the TLS client in
# standalone mode, or the address recovered from the outer proxy in behind-proxy mode), so clients can't spoof
# the IP used for the login rate limit; the api runs with TRUST_PROXY=true.
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $fwd_proto;

# SPA: index.html never cached, hashed assets immutable.
location / {
  try_files $uri /index.html;
  add_header Cache-Control "no-cache" always;
  # index.html's link-preview tags need absolute URLs: fill in this site's own origin.
  sub_filter_once off;
  sub_filter '__ORIGIN__' '$fwd_proto://$host';
}
# PWA manifest: nginx's stock mime.types doesn't know .webmanifest.
location = /manifest.webmanifest {
  default_type application/manifest+json;
  add_header Cache-Control "no-cache" always;
}
location /assets/ {
  try_files $uri =404;
  add_header Cache-Control $assets_cc always;
}

location /api/ {
  client_max_body_size 1m;
  proxy_pass http://$api;
}

# tus: 50 MiB chunks streamed straight to the api (Location stays relative: tus relativeLocation=true).
location /api/uploads {
  client_max_body_size 60m;
  proxy_request_buffering off;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  proxy_pass http://$api;
}

# Media straight from disk, gated by the api: the owner's session, or a share link for that album.
location /media/ {
  auth_request /_auth;
  alias /data/media/;
  # nginx's stock mime.types already maps these; restated so HLS never depends on the base image.
  include /etc/nginx/mime.types;
  types {
    application/vnd.apple.mpegurl m3u8;
    video/mp2t ts;
  }
  add_header Cache-Control $immutable_cc always;
}
location = /_auth {
  internal;
  proxy_pass http://$api/api/auth/check;
  proxy_pass_request_body off;
  proxy_set_header Content-Length "";
  # The original request path ($uri here would be "/_auth"). It's raw, so the api accepts only plain paths
  # (no '..', no %-escapes, no '//') — those are exactly the file nginx serves.
  proxy_set_header X-Original-URI $request_uri;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $fwd_proto;
}
