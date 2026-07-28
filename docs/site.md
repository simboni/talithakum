# Site rebuild

Five pages rebuilt in the BigHearts look — same palette, faces and radii —
with a modern shell: sticky header with mega menus, a mobile drawer, scroll
reveals, animated impact counters, a partners marquee and a REST-driven
latest-news section. Everything degrades: with JavaScript blocked the pages
are complete, only quieter, and if WordPress's API is unreachable the news
section removes itself instead of erroring.

## What was built

| File in `elementor/site/` | Replaces |
| --- | --- |
| `home.html` | Homepage |
| `about.html` | /about-us/ |
| `vision.html` | /vision-mission-and-values/ |
| `contacts.html` | /contacts/ |
| `donate.html` | /donate/ (bank + M-Pesa details) |

Each file carries its own header and footer, so the five pages can be
replaced one at a time without touching the rest of the site — the pages not
yet rebuilt keep the theme's header and simply get linked from the new mega
menus.

## Install (per page)

1. Edit the page in Elementor.
2. **Page Settings** (gear icon, bottom left) → Page Layout →
   **Elementor Canvas**. The page brings its own header and footer, so the
   theme's must not also render. If Canvas is skipped the page shows two
   headers — that is the symptom to look for.
3. Drop in an **HTML** widget, full width, no padding.
4. Paste the whole file, **Update**.

The image links point at the site's own media library (files that are
already uploaded), so nothing new needs uploading.

## The mega menus

Three of them — **Our Work** (the four Ps + all projects), **Media** (News,
Publications, Videos, Gallery) and **About** (About, Vision, Team,
Contacts) — plus Home and a Donate button. Click-driven rather than
hover-driven, because hover menus are unusable on touch screens; Escape and
any outside click close them. On phones the same links live in a slide-in
drawer with accordion groups.

To change a link or add one: the header lives once in
`src/site/chrome-head.html` (and the drawer copy of it, lower in the same
file); rebuild with `node build-site.mjs` and re-paste the pages.

## Latest news

The homepage asks WordPress for the three most recent posts, excluding the
publications, videos and team categories, and links each to its own page.
Publish a post and the homepage picks it up — nothing to edit.

## Tests

```
cd test && node site.mjs
```

27 checks: chrome on all five pages, mega menu behaviour, the news section
filled and failing gracefully, counters, marquee, and the phone layout with
the drawer. `node build-site-preview.mjs` builds the all-in-one preview.
