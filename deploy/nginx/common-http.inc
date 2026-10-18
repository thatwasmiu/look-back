# Shared by both modes (http level). Included from standalone.conf / behind-proxy.conf.

# Immutable caching only for successful responses; errors (e.g. a thumb not written yet, an expired session) must not stick in browsers.
map $status $immutable_cc {
  default "no-store";
  ~^[23] "private, max-age=31536000, immutable";
}
map $status $assets_cc {
  default "no-store";
  ~^[23] "public, max-age=31536000, immutable";
}

# The api's address is looked up through Docker's DNS every 10s (not once at start): after a reboot or a
# redeploy the container can get a new IP, and a stale one meant 502s until nginx was restarted.
resolver 127.0.0.11 valid=10s ipv6=off;
