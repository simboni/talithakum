#!/usr/bin/env bash
#
# Read-only survey of a server before installing anything.
#
#   curl -fsSL https://raw.githubusercontent.com/simboni/talithakum/claude/talithakum-repo-sug8lg/deploy/preflight.sh | bash
#
# Changes NOTHING. Run this first on a machine that already has other
# applications on it, and send the output to whoever is doing the install.

set -uo pipefail

line() { printf '\n\033[1;33m── %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "Talitha Kum — pre-install survey   $(date -u '+%Y-%m-%d %H:%M UTC')"

line "Machine"
. /etc/os-release 2>/dev/null && echo "  OS         ${PRETTY_NAME:-unknown}"
echo "  Kernel     $(uname -r)   Arch $(uname -m)"
echo "  Memory     $(free -h 2>/dev/null | awk '/^Mem:/{print $2" total, "$7" available"}')"
echo "  Disk /     $(df -h / 2>/dev/null | awk 'NR==2{print $4" free of "$2}')"

line "Node.js"
if have node; then
  echo "  system node  $(node --version)  at $(command -v node)"
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${major:-0}" -ge 20 ]; then
    echo "  -> new enough; the install will use it and change nothing"
  else
    echo "  -> TOO OLD for this site (needs 20+)"
    echo "     The install will NOT upgrade it. Other apps on this machine may"
    echo "     depend on $(node --version), so a private copy of Node 20 is"
    echo "     installed under /opt/talithakum-node instead and only this"
    echo "     service uses it."
  fi
else
  echo "  not installed -> a private copy goes to /opt/talithakum-node"
fi
have npm && echo "  npm          $(npm --version 2>/dev/null)"
have pm2 && echo "  pm2 present  — other Node apps are probably managed by it"

line "What is listening"
if have ss; then ss -lntp 2>/dev/null | awk 'NR==1 || /LISTEN/' | head -30
elif have netstat; then netstat -lntp 2>/dev/null | head -30
else echo "  (neither ss nor netstat available)"; fi

line "Ports this install wants"
if have ss || have netstat; then
  for p in 80 443 8080; do
    if have ss && ss -lnt "( sport = :$p )" 2>/dev/null | grep -q LISTEN; then
      who="$(ss -lntp "( sport = :$p )" 2>/dev/null | awk 'NR==2{print $NF}')"
      echo "  :$p   IN USE   $who"
    elif have netstat && netstat -lnt 2>/dev/null | grep -qE "[:.]$p "; then
      echo "  :$p   IN USE"
    else
      echo "  :$p   free"
    fi
  done
else
  # Saying "free" here would be a guess, and a wrong guess is how an
  # installer ends up fighting another application for a port.
  echo "  UNKNOWN — neither ss nor netstat is installed, so this cannot be"
  echo "  checked. Install iproute2 (apt-get install -y iproute2) and re-run."
fi
echo "  (8080 is only a default — the installer picks the first free port"
echo "   from 8080 upward, so a clash moves the site, not your app.)"

line "Web servers"
for s in nginx apache2 httpd caddy traefik haproxy; do
  if have "$s" || systemctl list-unit-files 2>/dev/null | grep -q "^$s\.service"; then
    state="$(systemctl is-active "$s" 2>/dev/null || echo unknown)"
    echo "  $s: installed, $state"
  fi
done
if [ -d /etc/nginx/sites-enabled ]; then
  echo "  nginx sites-enabled:"
  for f in /etc/nginx/sites-enabled/*; do
    [ -e "$f" ] || continue
    names="$(grep -hoP '^\s*server_name\s+\K[^;]+' "$f" 2>/dev/null | tr '\n' ' ')"
    echo "    - $(basename "$f")   server_name: ${names:-(none)}"
  done
  grep -rl 'default_server' /etc/nginx/sites-enabled/ 2>/dev/null \
    | sed 's/^/    default_server set in: /'
fi
[ -d /etc/nginx/conf.d ] && ls -1 /etc/nginx/conf.d/*.conf 2>/dev/null | sed 's/^/  conf.d: /'

line "Containers"
if have docker; then
  echo "  docker installed"
  docker ps --format '    {{.Names}}  {{.Image}}  {{.Ports}}' 2>/dev/null | head -20 \
    || echo "    (cannot list — need root?)"
else
  echo "  docker not installed"
fi

line "Existing services that look like apps"
systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null \
  | awk '{print "  "$1}' \
  | grep -Ev '(systemd|dbus|cron|ssh|rsyslog|getty|polkit|udev|networkd|resolved|journald|timesync|accounts|unattended|snapd)' \
  | head -25

line "Name clashes with this install"
for u in talithakum; do
  systemctl list-unit-files 2>/dev/null | grep -q "^$u\.service" \
    && echo "  service $u already exists" || echo "  service $u — free"
done
id -u talithakum >/dev/null 2>&1 && echo "  user talithakum already exists" || echo "  user talithakum — free"
[ -e /srv/talithakum ] && echo "  /srv/talithakum already exists" || echo "  /srv/talithakum — free"
[ -e /etc/talithakum.env ] && echo "  /etc/talithakum.env already exists (its secret will be kept)" \
  || echo "  /etc/talithakum.env — free"

line "Certificates already on this machine"
[ -d /etc/letsencrypt/live ] && ls -1 /etc/letsencrypt/live 2>/dev/null | sed 's/^/  /' \
  || echo "  none"

cat <<'EOF'

── Summary
  Nothing was changed by this script.

  The installer will only ever:
    - add the user "talithakum" and /srv/talithakum
    - add /etc/systemd/system/talithakum.service
    - add one nginx site file for talithakumraht.org
    - listen on the first free port from 8080 upward

  It will NOT touch other nginx sites, the default site, system Node,
  other services, or anything in /var/www.

  Send this output back before running the installer.
EOF
