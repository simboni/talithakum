# Running the site on your own server

This moves the website and its admin panel off Netlify onto a plain VPS
(Contabo, or any other). Cost after the move: whatever the server already
costs, and nothing else.

Everything runs as **one Node process with no npm dependencies**. The admin
API is the same file Netlify ran; with `TK_LOCAL_DIR` set it stores accounts
in a file and writes content straight to disk, so no GitHub token and no
Netlify Blobs are involved.

What you gain, besides the bill:

- **Publishing is seconds, not a minute.** Content is written to disk and the
  site is rebuilt locally, rather than committed to GitHub to wait for a
  remote build.
- **The 4 MB upload limit can go.** It existed because uploads travelled
  through the GitHub API as base64. `client_max_body_size` in nginx is the
  only ceiling now.

What you take on: uptime, patching, backups and certificate renewal. Read
**Backups** and **If something breaks** below before you cut over, not after.

---

## 1. Prepare the server

Debian or Ubuntu, as root:

```bash
apt update && apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version          # must be 20 or newer

adduser --system --group --home /srv/talithakum talithakum
```

## 2. Get the code

```bash
sudo -u talithakum git clone https://github.com/simboni/talithakum.git /srv/talithakum
cd /srv/talithakum
sudo -u talithakum git checkout claude/talithakum-repo-sug8lg
```

## 3. Settings

```bash
cat > /etc/talithakum.env <<'EOF'
TK_LOCAL_DIR=/srv/talithakum
SESSION_SECRET=CHANGE-THIS-to-40-or-more-random-characters
PORT=8080
HOST=127.0.0.1
# Commit and push content after each publish — see Backups.
TK_GIT_PUSH=0
EOF

chown talithakum:talithakum /etc/talithakum.env
chmod 600 /etc/talithakum.env
```

`SESSION_SECRET` must be long and random. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The server refuses to start without it. That is deliberate: an empty secret
signs session cookies with an empty key, which anyone can reproduce.

## 4. Start it

```bash
cp /srv/talithakum/deploy/talithakum.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now talithakum
systemctl status talithakum
curl -sI http://127.0.0.1:8080/ | head -1      # expect: HTTP/1.1 200 OK
```

The first start builds the site, which takes a few seconds.

## 5. nginx and a certificate

```bash
cp /srv/talithakum/deploy/nginx.conf /etc/nginx/sites-available/talithakum
ln -s /etc/nginx/sites-available/talithakum /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d talithakumraht.org -d www.talithakumraht.org
```

Certbot installs its own renewal timer. Check it survives:

```bash
certbot renew --dry-run
```

## 6. Test before touching DNS

Do not point the domain yet. Edit your own machine's hosts file
(`/etc/hosts`, or `C:\Windows\System32\drivers\etc\hosts`):

```
YOUR.SERVER.IP   talithakumraht.org www.talithakumraht.org
```

Now open `https://talithakumraht.org` and work through it properly:

- [ ] Homepage, News, Publications, Videos, Our Team, Gallery all load
- [ ] Photographs appear (not broken images)
- [ ] An old address still redirects — try `/blog-grid/`
- [ ] `/admin` signs in
- [ ] Publish a change and confirm it appears on the public page
- [ ] Upload a photograph to the gallery and publish it

Remove the hosts entry afterwards.

## 7. Point the domain

Only once step 6 passes. In whichever DNS you use, replace the Netlify
records with:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | your server's IPv4 |
| A | `www` | your server's IPv4 |

Lower the TTL to 300 a day beforehand if you can, so a mistake is quick to
undo. Propagation takes minutes to a few hours.

**Do not cancel Netlify until the domain has moved and stayed up for a few
days.** While DNS is still pointing there, that account is the website.

## 8. Consider Cloudflare in front — free, and worth it

A single VPS in Europe serves Kenyan visitors more slowly than Netlify's
edge did, and it is exposed directly to any traffic that arrives. Cloudflare's
free tier fixes both: caching near your visitors, TLS, and absorbing junk
traffic before it reaches the server.

Point the nameservers at Cloudflare, set the two A records above to
**Proxied**, and use SSL mode **Full (strict)** so the Let's Encrypt
certificate on the server is still used and checked.

---

## Backups

**This is the part that bites people.** On Netlify every publish was a commit,
which is why "any earlier version can be restored" was true. On this server
the content is files on one disk.

Set `TK_GIT_PUSH=1` in `/etc/talithakum.env` and give the server a deploy key,
and each publish is committed and pushed as before — history preserved, and an
off-site copy on GitHub:

```bash
sudo -u talithakum ssh-keygen -t ed25519 -N "" -f /srv/talithakum/.ssh/id_ed25519
sudo -u talithakum cat /srv/talithakum/.ssh/id_ed25519.pub
```

Add that key to the repository on GitHub under **Settings → Deploy keys**,
with **Allow write access** ticked. Then switch the remote to SSH and test:

```bash
cd /srv/talithakum
sudo -u talithakum git remote set-url origin git@github.com:simboni/talithakum.git
sudo -u talithakum git config user.email "admin@talithakumraht.org"
sudo -u talithakum git config user.name  "Talitha Kum admin panel"
sudo -u talithakum git push               # must succeed before you rely on it
systemctl restart talithakum
```

Pushing is best-effort by design: if GitHub is unreachable the publish still
succeeds and the site still updates, and the commit waits locally. Check the
log occasionally (`journalctl -u talithakum | grep push`).

Also take a server snapshot in the Contabo panel — Netlify was, in effect,
somebody else's backup, and it no longer is.

## If something breaks

```bash
systemctl status talithakum
journalctl -u talithakum -n 100 --no-pager
journalctl -u talithakum -f                  # follow
```

**A failed build leaves the previous version live** rather than blanking the
site — look for `BUILD FAILED` in the log and fix the content that caused it.

**The panel says sign-in is not configured** — `SESSION_SECRET` is missing
from `/etc/talithakum.env`, or the service was not restarted after it was
added.

**Nothing on port 80** — `nginx -t`, then `systemctl status nginx`.

**Rebuild by hand** if you ever need to:

```bash
cd /srv/talithakum && sudo -u talithakum node site/build.mjs
```

## Updating the site's code

```bash
cd /srv/talithakum
sudo -u talithakum git pull
systemctl restart talithakum
```

If you enabled `TK_GIT_PUSH`, pull before you push-heavy-edit, or the server's
commits and yours will diverge and the push will start failing quietly.

## Going back to Netlify

Nothing here is one-way. Point DNS back, set `GITHUB_TOKEN` and
`SESSION_SECRET` in Netlify, redeploy. The content in `site/content/` is the
same either way, which is exactly why the move is reversible — provided you
kept pushing it to GitHub.
