#!/usr/bin/env bash
#
# One-command provisioning for the Talitha Kum Kenya site.
#
#   curl -fsSL https://raw.githubusercontent.com/simboni/talithakum/claude/talithakum-repo-sug8lg/deploy/setup.sh | sudo bash
#
# or, having cloned already:  sudo bash deploy/setup.sh
#
# Debian 11/12 or Ubuntu 20.04+. Safe to run twice: it never overwrites a
# secret that already exists, and a second run just updates the code.
#
# TLS is deliberately NOT done here — certbot needs the domain already
# pointing at this machine. Step 5 of deploy/README.md covers it.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/simboni/talithakum.git}"
BRANCH="${BRANCH:-claude/talithakum-repo-sug8lg}"
APP_DIR="${APP_DIR:-/srv/talithakum}"
ENV_FILE="${ENV_FILE:-/etc/talithakum.env}"
APP_USER="${APP_USER:-talithakum}"
PORT="${PORT:-8080}"

say() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run this with sudo." >&2; exit 1; }

say "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nginx >/dev/null

# Node 20+. The site build and the server both need it; distro packages are
# often far older, so use NodeSource when what is installed is too old.
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 20 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  say "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
say "Node $(node --version)"

say "Creating the $APP_USER user"
id -u "$APP_USER" >/dev/null 2>&1 || \
  adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

say "Fetching the site"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout --quiet "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  mkdir -p "$APP_DIR"
  chown "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# The secret is generated once and never regenerated: rewriting it would sign
# out every editor and invalidate their sessions on each run.
if [ -f "$ENV_FILE" ] && grep -q '^SESSION_SECRET=.\{20,\}' "$ENV_FILE"; then
  say "Keeping the existing SESSION_SECRET"
else
  say "Generating a SESSION_SECRET"
  secret="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  cat > "$ENV_FILE" <<EOF
TK_LOCAL_DIR=$APP_DIR
SESSION_SECRET=$secret
PORT=$PORT
HOST=127.0.0.1
# Commit and push content after each publish. Needs a deploy key —
# see "Backups" in deploy/README.md. Leave 0 until that key works.
TK_GIT_PUSH=0
EOF
fi
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

say "Installing the service"
install -m 644 "$APP_DIR/deploy/talithakum.service" /etc/systemd/system/talithakum.service
systemctl daemon-reload
systemctl enable --quiet talithakum
systemctl restart talithakum

say "Installing the nginx site"
install -m 644 "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/talithakum
ln -sf /etc/nginx/sites-available/talithakum /etc/nginx/sites-enabled/talithakum
rm -f /etc/nginx/sites-enabled/default
# Only the plain-HTTP server block can load before certbot writes the
# certificate lines, so drop the TLS block until then.
if ! [ -f /etc/letsencrypt/live/talithakumraht.org/fullchain.pem ]; then
  sed -i '/listen 443 ssl/,$d' /etc/nginx/sites-available/talithakum
  echo "# TLS block removed until certbot runs; re-copy deploy/nginx.conf afterwards." \
    >> /etc/nginx/sites-available/talithakum
fi
nginx -t >/dev/null && systemctl reload nginx

say "Waiting for the site to answer"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then ok=1; break; fi
  sleep 2
done

if [ "$ok" -eq 1 ]; then
  ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  cat <<EOF

  The site is running on this machine.

  Check it before touching DNS — add this to your own computer's hosts file
  (/etc/hosts, or C:\\Windows\\System32\\drivers\\etc\\hosts):

      $ip   talithakumraht.org www.talithakumraht.org

  then open http://talithakumraht.org and sign in at /admin.

  Next:
    1. Point the A records for @ and www at $ip
    2. sudo certbot --nginx -d talithakumraht.org -d www.talithakumraht.org
    3. sudo cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/talithakum
       sudo nginx -t && sudo systemctl reload nginx

  Logs:  journalctl -u talithakum -f
EOF
else
  echo
  echo "  The service did not come up. What it said:" >&2
  journalctl -u talithakum -n 40 --no-pager >&2
  exit 1
fi
