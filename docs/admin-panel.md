# The admin panel

`/admin` is Talitha Kum Kenya's own content panel. Editors sign in with an
**email and password** — no GitHub, Netlify or Google accounts — and manage
News, Publications, Videos, Team and the Gallery. Every publish updates the
live site in about a minute.

> **Looking for how to actually use it?** This page is the technical setup.
> For staff — how to sign in, publish, add photographs, reset a forgotten
> password — see **[using-the-admin-panel.md](using-the-admin-panel.md)**.

## How it works

- The panel (`site/admin/index.html`) talks to one serverless function
  (`netlify/functions/admin-api.mjs`) behind `/api/admin/*`.
- Accounts, roles and privileges live in **Netlify Blobs**, the key-value
  store included with the site. Passwords are stored as scrypt hashes;
  sessions are signed HttpOnly cookies that last seven days.
- When someone publishes, the function commits the change to the repository
  with a machine token, which triggers the normal Netlify rebuild. Editors
  never see the repository.

## Roles and privileges

- **Admin** — everything, plus the Users page: create editors, set their
  passwords, decide which sections each one can manage, remove accounts.
- **Editor** — only the sections ticked on their account (e.g. just News
  and Gallery). The API enforces this server-side, not just in the menu.

## One-time setup

1. **Machine token** — as the repository owner, open
   github.com → Settings → Developer settings → *Fine-grained personal
   access tokens* → Generate new token. Repository access: **only this
   repository**. Permissions: **Contents → Read and write**. Copy the token.
2. **Environment variables** — in Netlify: *Project configuration →
   Environment variables*, add:
   | Name | Value |
   | --- | --- |
   | `GITHUB_TOKEN` | the token from step 1 |
   | `GITHUB_REPO` | `simboni/talithakum` |
   | `GITHUB_BRANCH` | the deployed branch |
   | `SESSION_SECRET` | a long random string (40+ characters of anything) |
3. **Redeploy** (*Deploys → Trigger deploy*) so the function picks them up.
4. **Claim the first account.** Visit `/admin` immediately after the deploy:
   the first account created becomes the administrator. Until that happens
   anyone who finds the page could claim it, so do this right away.
5. Add your editors under **Users**, and hand each their email + password.
   They can change their password later under **Account**.

## Limits worth knowing

- Uploads go through the function, which caps files at about **4 MB**.
  Larger PDFs should be added to `site/static/uploads/` directly.
- If a token expires (fine-grained PATs have an expiry date), publishing
  fails with a GitHub error — generate a new token and update
  `GITHUB_TOKEN`.
- Forgotten admin password with no second admin: delete the `users` key in
  the `tk-admin` Blobs store (Netlify dashboard → Blobs) and `/admin`
  offers first-run setup again. Content is untouched.
