#!/usr/bin/env bash
#
# Provisioning for the Talitha Kum Kenya site, safe on a shared server.
#
#   curl -fsSL https://raw.githubusercontent.com/simboni/talithakum/claude/talithakum-repo-sug8lg/deploy/setup.sh | sudo bash
#
# Run deploy/preflight.sh first — it surveys the machine and changes nothing.
#
# This script only ever ADDS things:
#   - the user "talithakum" and /srv/talithakum
#   - /etc/systemd/system/talithakum.service
#   - one nginx site file for talithakumraht.org
#   - a listening port, chosen as the first free one from 8080 upward
#
# It never touches system Node, other nginx sites, the default site, other
# services, or anything under /var/www. Where it cannot proceed without
# changing something that belongs to another application, it stops and says so.
#
# Safe to run twice: SESSION_SECRET is generated once and kept, because
# regenerating it signs out every editor.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/simboni/talithakum.git}"
BRANCH="${BRANCH:-claude/talithakum-repo-sug8lg}"
APP_DIR="${APP_DIR:-/srv/talithakum}"
ENV_FILE="${ENV_FILE:-/etc/talithakum.env}"
APP_USER="${APP_USER:-talithakum}"
DOMAIN="${DOMAIN:-talithakumraht.org}"
NODE_VERSION="${NODE_VERSION:-20.18.1}"
PRIVATE_NODE_DIR="/opt/talithakum-node"

say()  { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;31m!!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mStopped:\033[0m %s\n\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(id -u)" -eq 0 ] || die "Run this with sudo."
have apt-get || die "This installer is for Debian or Ubuntu. Tell me the OS and I'll adapt it."

port_free() {
  if have ss; then ! ss -lnt "( sport = :$1 )" 2>/dev/null | grep -q LISTEN
  elif have netstat; then ! netstat -lnt 2>/dev/null | grep -qE "[:.]$1 "
  else
    # Guessing "free" is how an installer ends up fighting another
    # application for a port, so get the tool rather than assume.
    apt-get install -y -qq iproute2 >/dev/null 2>&1 || true
    if have ss; then ! ss -lnt "( sport = :$1 )" 2>/dev/null | grep -q LISTEN
    else die "Cannot check which ports are in use (no ss or netstat). Install iproute2 and re-run."; fi
  fi
}

# ---------------------------------------------------------------- packages

say "Installing git and curl if missing"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
for p in git curl ca-certificates xz-utils; do
  dpkg -s "$p" >/dev/null 2>&1 || apt-get install -y -qq "$p" >/dev/null
done

# ---------------------------------------------------------------- web server

# Installing nginx on a machine already serving port 80 with something else
# would fight for the port and take the other application down.
NGINX_OK=0
if have nginx || systemctl list-unit-files 2>/dev/null | grep -q '^nginx\.service'; then
  NGINX_OK=1
  say "nginx is already here — adding one site file, touching nothing else"
elif port_free 80; then
  say "Installing nginx (port 80 is free)"
  apt-get install -y -qq nginx >/dev/null
  NGINX_OK=1
else
  holder="$(ss -lntp '( sport = :80 )' 2>/dev/null | awk 'NR==2{print $NF}')"
  warn "Port 80 is already in use by: ${holder:-something else}"
  warn "Not installing nginx — that would fight it and take that application down."
  warn "The site will still be installed and will run on its own port."
  warn "Tell me what is on port 80 and I will write the right vhost for it."
fi

# ---------------------------------------------------------------- node

# Other applications here may depend on the system Node. Replacing it is the
# single most likely way this install breaks something that was working, so a
# too-old system Node is left completely alone and a private copy is used.
NODE_BIN=""
if have node; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${major:-0}" -ge 20 ]; then
    NODE_BIN="$(command -v node)"
    say "Using the system Node $(node --version) — unchanged"
  else
    say "System Node is $(node --version); leaving it alone for the other apps"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  if [ -x "$PRIVATE_NODE_DIR/bin/node" ]; then
    NODE_BIN="$PRIVATE_NODE_DIR/bin/node"
    say "Using the private Node at $NODE_BIN ($("$NODE_BIN" --version))"
  else
    case "$(uname -m)" in
      x86_64) arch=x64 ;;
      aarch64|arm64) arch=arm64 ;;
      *) die "Unsupported architecture $(uname -m) — tell me and I'll adapt it." ;;
    esac
    say "Installing a private Node $NODE_VERSION into $PRIVATE_NODE_DIR"
    tmp="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$arch.tar.xz" \
      -o "$tmp/node.tar.xz" || die "Could not download Node."
    mkdir -p "$PRIVATE_NODE_DIR"
    tar -xJf "$tmp/node.tar.xz" -C "$PRIVATE_NODE_DIR" --strip-components=1
    rm -rf "$tmp"
    NODE_BIN="$PRIVATE_NODE_DIR/bin/node"
    say "Private Node $("$NODE_BIN" --version) installed — system Node untouched"
  fi
fi

# ---------------------------------------------------------------- port

PORT="${PORT:-}"
if [ -z "$PORT" ]; then
  PORT=8080
  while ! port_free "$PORT"; do
    PORT=$((PORT + 1))
    [ "$PORT" -gt 8130 ] && die "No free port between 8080 and 8130."
  done
fi
[ "$PORT" = "8080" ] || warn "Port 8080 was taken; using $PORT instead."
say "The site will listen on 127.0.0.1:$PORT"

# ---------------------------------------------------------------- user, code

say "Creating the $APP_USER user"
id -u "$APP_USER" >/dev/null 2>&1 || \
  adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER" >/dev/null

say "Fetching the site"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout --quiet "$BRANCH" 2>/dev/null || true
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ] && \
    die "$APP_DIR exists and is not empty, and is not a git clone. Move it aside first."
  mkdir -p "$APP_DIR"
  chown "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ---------------------------------------------------------------- settings

if [ -f "$ENV_FILE" ] && grep -q '^SESSION_SECRET=.\{20,\}' "$ENV_FILE"; then
  say "Keeping the existing SESSION_SECRET"
  secret="$(grep '^SESSION_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
else
  say "Generating a SESSION_SECRET"
  secret="$("$NODE_BIN" -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
fi
cat > "$ENV_FILE" <<EOF
TK_LOCAL_DIR=$APP_DIR
SESSION_SECRET=$secret
PORT=$PORT
HOST=127.0.0.1
# Commit and push content after each publish. Needs a deploy key —
# see "Backups" in deploy/README.md. Leave 0 until that key works.
TK_GIT_PUSH=0
EOF
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------- service

say "Installing the talithakum service"
sed "s#^ExecStart=.*#ExecStart=$NODE_BIN $APP_DIR/server/serve.mjs#" \
  "$APP_DIR/deploy/talithakum.service" > /etc/systemd/system/talithakum.service
chmod 644 /etc/systemd/system/talithakum.service
systemctl daemon-reload
systemctl enable --quiet talithakum
systemctl restart talithakum

# ---------------------------------------------------------------- nginx site

if [ "$NGINX_OK" -eq 1 ]; then
  # Never remove or edit anything already enabled — only add our own file.
  if grep -rl "server_name.*$DOMAIN" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null \
     | grep -qv 'talithakum'; then
    warn "Another nginx site already claims $DOMAIN. Not overriding it."
    warn "Sort that out by hand before pointing DNS here."
  fi

  site=/etc/nginx/sites-available/talithakum
  [ -d /etc/nginx/sites-available ] || { mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled; }
  sed "s#proxy_pass http://127.0.0.1:8080;#proxy_pass http://127.0.0.1:$PORT;#g" \
    "$APP_DIR/deploy/nginx.conf" > "$site"

  # nginx refuses to start when a server block names a certificate that does
  # not exist yet, and certbot cannot issue one until DNS points here. On a
  # shared machine that failure would take every other site down too, so the
  # TLS block waits until the certificate exists.
  if ! [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    sed -i '/listen 443 ssl/,$d' "$site"
    echo "# TLS block omitted until certbot has run — re-copy deploy/nginx.conf after." >> "$site"
  fi

  ln -sf "$site" /etc/nginx/sites-enabled/talithakum
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    say "nginx reloaded; other sites untouched"
  else
    rm -f /etc/nginx/sites-enabled/talithakum
    nginx -t || true
    die "nginx rejected the new site, so it was removed again and nginx left as it was."
  fi
fi

# ---------------------------------------------------------------- check

say "Waiting for the site to answer"
ok=0
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && { ok=1; break; }
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  warn "The service did not come up. What it said:"
  journalctl -u talithakum -n 40 --no-pager >&2
  exit 1
fi

ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<EOF

  Running, on 127.0.0.1:$PORT, with Node $("$NODE_BIN" --version).

  Check it without touching DNS:
      $NODE_BIN $APP_DIR/deploy/verify.mjs ${ip:-127.0.0.1}

  Or look at it yourself — add to your own computer's hosts file:
      $ip   $DOMAIN www.$DOMAIN

  Once the domain resolves here:
      certbot --nginx -d $DOMAIN -d www.$DOMAIN
      sed "s#127.0.0.1:8080#127.0.0.1:$PORT#g" $APP_DIR/deploy/nginx.conf \\
        > /etc/nginx/sites-available/talithakum
      nginx -t && systemctl reload nginx

  Logs:    journalctl -u talithakum -f
  Remove:  systemctl disable --now talithakum
           rm /etc/systemd/system/talithakum.service /etc/nginx/sites-enabled/talithakum
           nginx -t && systemctl reload nginx
EOF
