# Leaving WordPress: the standalone site

The whole site now lives in this repository. `node site/build.mjs` turns the
content files in `site/content/` into a complete static site in `site/dist/`
— 21 pages, no WordPress, no database, no PHP, nothing to hack or update.

Staff publish through **Decap CMS** at `/admin`: a free, open-source panel
where they sign in with an email invitation (no GitHub account needed) and
edit publications, videos, team members and news in plain forms. Every save
commits to this repository and Netlify redeploys the site — a change is live
in about a minute.

## How the pages work without WordPress

The publications, videos and team pages are the same tested code that ran
against WordPress. The build generates a static, WordPress-shaped API under
`/api/`, and Netlify redirect rules map the `/wp-json/` queries those pages
make onto the static files. The pages cannot tell the difference. The
in-page staff panels never render (there is no logged-in WordPress user),
because Decap replaced them.

## What every menu link now opens

| Menu item | Page |
| --- | --- |
| Home | `/` |
| Our Work → Prayer / Protection / Prevention / Partnership | `/category/<p>/` — stories filtered by that P |
| Our Work → All our work | `/our-work/` |
| Media → News | `/news/` and `/news/<story>/` |
| Media → Publications | `/publications/` (in-page PDF reader) |
| Media → Videos | `/videos/` (in-page player) |
| Media → Gallery | `/gallery/` |
| About → About us / Vision / Team / Contacts | their pages |
| Donate | `/donate/` |

Old WordPress addresses (`/our-team-2/`, `/blog-grid/`, `/portfolio-grid/`,
`/portfolio-gallery/`, …) redirect permanently, so links shared over the
years keep working.

## Going live on Netlify — one-time setup, about 30 minutes

1. **Push this repository to GitHub** (already done if you are reading this
   on GitHub). Note the default branch name; `site/admin/config.yml` says
   `branch: main` — change it there if the repo uses a different one.
2. **Create a Netlify account** (free) at netlify.com → *Add new site* →
   *Import an existing project* → pick this repository. Netlify reads
   `netlify.toml` and knows how to build. Deploy.
3. **Check the temporary URL** it gives you (something.netlify.app). The
   whole site should be there.
4. **Enable the admin:** Site configuration → Identity → *Enable Identity*.
   Then Identity → Registration → **Invite only**. Then Identity →
   Services → **Enable Git Gateway**.
5. **Invite staff:** Identity → *Invite users* → their email addresses.
   They get an email, set a password, and land in `/admin`.
6. **Enable the contact form:** Forms → *Enable form detection*, redeploy.
   Messages appear under Forms and can be forwarded to
   info@talithakumraht.org (Forms → Notifications).
7. **Connect the domain:** Domain management → add `talithakumraht.org`,
   then follow the DNS instructions at the registrar. Netlify issues the
   HTTPS certificate itself.
8. **Retire WordPress** only after the domain has switched and everything
   has been checked. Keep a final backup export of WordPress first; the old
   hosting can then be cancelled or kept as archive.

## Content that must be re-entered once

- **Real publications and videos** currently in WordPress: add them at
  `/admin` (the two seeded videos are placeholders — replace their links).
- **News stories** worth keeping: copy the text across as News entries.
- **Sr. Mary Gitau's photograph** is still pending; add it to her team entry
  when it arrives.

## Day-to-day

- **Add anything:** open `/admin`, pick the collection, fill the form,
  Publish. Live in about a minute.
- **Edit or delete:** same place.
- **Nothing to update, ever:** there is no WordPress, no plugins, no PHP.
  The only moving parts are static files on a CDN.

## Tests

```
cd test && node staticsite.mjs
```

39 checks: every route with the chrome, the three app pages against the
static API, homepage news, redirects from old addresses, story and category
pages, the Netlify form, the 404, and the phone layout.
