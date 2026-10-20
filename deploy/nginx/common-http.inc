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

# Link-preview crawlers (Facebook/Messenger, Zalo, Telegram, Discord, Slack…) opening a share link get the api's
# preview page with that album's title and cover (they don't run the app); people get the app as usual.
# Zalo's in-app browser also says "Zalo": a phone browser (iPhone / iPad / Android) is a person, not the crawler.
# Regexes are tried in order, so that line comes first.
map $http_user_agent $link_crawler {
  default 0;
  ~*(iphone|ipad|android).*zalo 0;
  ~*(facebookexternalhit|facebot|zalo|twitterbot|slackbot|telegrambot|discordbot|whatsapp|linkedinbot|skypeuripreview|pinterest|redditbot|embedly|vkshare|applebot) 1;
}
# /s/<token>?app always gets the app: the preview page sends anyone it reaches there (a browser taken for a crawler).
map "$link_crawler:$uri:$args" $share_preview {
  default "";
  "~^1:/s/(?<share_tok>[A-Za-z0-9_-]{43}):$" /api/share/$share_tok/preview;
}
