# The admin panel

`/admin` is Talitha Kum Kenya's own content panel. Editors sign in with an
**email and password** — no GitHub, Netlify or Google accounts — and manage
News, Publications, Videos, Team and the Gallery.

> **Looking for how to actually use it?** This page is the technical setup.
> For staff — how to sign in, publish, add photographs, reset a forgotten
> password — see **[using-the-admin-panel.md](using-the-admin-panel.md)**.

## Getting in

**<https://talithakumraht.org/admin>** — type it into the address bar. There
is deliberately no link to it from the public site.

The **first** person to open it is asked to create an account, and that
account becomes the administrator. Until somebody does, anyone who finds the
page can claim it, so claim it the moment the site is live.

After that it shows a sign-in form. Everyone else is added from **Users** by
an administrator.

## How it works

- The panel (`site/admin/index.html`) talks to one API
  (`netlify/functions/admin-api.mjs`, despite the path) behind `/api/admin/*`.
- On the server that API runs inside `server/serve.mjs` — see
  [../deploy/README.md](../deploy/README.md). Accounts live in
  **`/srv/talithakum/.tk-admin-users.json`**, passwords as scrypt hashes;
  sessions are signed HttpOnly cookies lasting seven days.
- Publishing writes the content straight to disk and rebuilds the site in
  place, so a change is live in seconds. Editors never see the repository.

> The same file still runs unchanged as a Netlify Function, where accounts
> live in Netlify Blobs and publishing commits to GitHub instead. That is
> what the `GITHUB_TOKEN` and `GITHUB_REPO` settings in the code are for.
> **Nothing on the server uses them**, and no GitHub token is needed there.

## Roles and privileges

- **Admin** — everything, plus the Users page: create editors, set their
  passwords, decide which sections each one can manage, remove accounts.
- **Editor** — only the sections ticked on their account (e.g. just News
  and Gallery). The API enforces this server-side, not just in the menu.

**Keep two administrators.** Only an administrator can reset a password, so a
single one who forgets theirs locks everybody out. The Users screen says so
until there are two.

## Settings

All of it lives in `/etc/talithakum.env` (mode 600):

| Name | What it does |
| --- | --- |
| `TK_LOCAL_DIR` | the checkout the panel reads and writes — `/srv/talithakum` |
| `SESSION_SECRET` | signs session cookies; 40+ random characters |
| `PORT` / `HOST` | where the service listens |
| `TK_GIT_PUSH` | `1` commits and pushes each publish — see Backups in the deploy guide |

**`SESSION_SECRET` is not optional.** Without it the API refuses to start:
an empty key signs cookies anybody can forge, so a forged cookie would be a
valid administrator session.

After changing anything there: `systemctl restart talithakum`.

## Limits worth knowing

- The panel shrinks photographs in the browser before uploading — longest
  edge 2000px, JPEG quality 0.82 — so a phone photo arrives as a few hundred
  kilobytes rather than ten megabytes. PDFs are sent unchanged, and the API
  caps any upload at **12 MB**. Anything larger belongs in
  `site/static/uploads/` directly.
- The proxy in front has its own ceiling — `request_body max_size` in
  `/srv/edge/sites/talithakum.caddy`. Raising the API limit without raising
  that one just moves where the upload fails.

## If nobody can get in

Only an administrator can reset a password, so a single administrator who
forgets theirs is the one case the panel cannot fix. Recovering means
clearing the accounts so first-run setup is offered again:

```bash
systemctl stop talithakum
mv /srv/talithakum/.tk-admin-users.json /root/tk-users-backup-$(date +%F).json
systemctl start talithakum
```

Then go to `/admin` **immediately** and create the first account again — until
you do, anyone who finds the page can.

Move the file rather than deleting it: if the password turns up afterwards,
putting it back restores every account. **No content is affected** either way
— stories, photographs and team members are files in `site/content/`, not in
that one.
