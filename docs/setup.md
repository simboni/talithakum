# Setup and Installation

This guide explains how to put the publications library onto talithakumraht.org,
how to give staff the access they need to publish, and what to do when something
does not work.

It is written to be followed by someone who can edit a page in Elementor and add
a category in WordPress. You do not need to write any code.

Related guides:

- [`taxonomy.md`](taxonomy.md) — what a publication is, how to classify it, and
  the safeguarding rules.
- [`publishing-workflow.md`](publishing-workflow.md) — who does what, and the
  step-by-step editorial process for putting a document online.

---

## 1. Before you start

You will need:

| What | Why |
| --- | --- |
| An **Administrator** login on the WordPress site | To create the category and edit the page |
| **Elementor** enabled on the site | The page is installed as an Elementor HTML widget |
| The site running on **HTTPS** | Application Passwords do not work without it |
| WordPress **5.6 or newer** | Application Passwords were added in 5.6 |
| The file `elementor/publications-page.html` from this repository | This is what you paste in |

You do **not** need to install a plugin to get started. The default setup uses
ordinary WordPress posts.

### Getting the file to paste

The file `elementor/publications-page.html` is generated. If it is already in the
repository you can use it as-is. If you have changed anything in `src/`, rebuild
it first from the repository root:

```
node build.mjs
```

That reads the four files in `src/` and writes a single file to
`elementor/publications-page.html` (about 122 KB). Never edit that generated file
by hand — the next build overwrites it.

---

## 2. Choose a mode: posts or cpt

The page can read publications in two different ways. You choose with one word in
the configuration block.

### `mode: "posts"` — the default

Publications are ordinary WordPress posts, filed under a parent category with the
slug `publications`.

- **Document type** (Annual Report, Training Manual, and so on) is a **child
  category** of Publications.
- **Themes and keywords** are ordinary **post tags**.
- **Everything else** — PDF link, page count, file size, language, issuing body,
  featured flag — is stored in a small machine-readable comment at the very start
  of the post content, like this:

  ```
  <!--TKPUB:{"pdf":"https://.../report.pdf","pages":24,"lang":"en", ...}-->
  ```

  The publishing panel writes that comment for you. Nobody needs to type it.

### `mode: "cpt"` — the optional upgrade

Requires installing `plugin/talithakum-publications.php`. The plugin registers a
separate post type, `tk_publication` (REST base `publications`), with its own
taxonomies — `tk_pub_type` (REST base `publication-types`) and `tk_pub_theme`
(REST base `publication-themes`) — real meta fields instead of a comment, and a
download counter at
`POST /wp-json/talithakum/v1/publications/<id>/download`.

### Which to choose

| | posts-mode | cpt-mode |
| --- | --- | --- |
| Back-end work needed | None | Install and keep a plugin |
| Can be live today | Yes | Yes, but with an extra step |
| Publications appear in the blog feed, RSS and site search | Yes, unless you exclude the category | No — completely separate |
| Long-term tidiness | Adequate | Cleaner |
| Download counting | Not available | Available |

The honest trade-off: posts-mode needs no back-end work at all and can be live
today, but publications live inside the blog's post type, so they can turn up in
the blog listing, the RSS feed and site search unless you deliberately exclude the
`publications` category. cpt-mode keeps them entirely separate and is cleaner to
live with, at the cost of maintaining a plugin.

**Recommendation: start with posts-mode.** Get the library live and useful first.
Moving to cpt-mode later is a one-word change (section 8), and you lose nothing by
waiting.

---

## 3. Step-by-step install (posts-mode)

### Step 1 — Create the Publications category

1. In the WordPress dashboard, go to **Posts → Categories**.
2. Name: `Publications`
3. Slug: `publications` — this must be exactly right, in lower case. The page
   looks the category up by slug.
4. Leave the parent as **None**.
5. Click **Add New Category**.

This step is only needed in posts-mode. Skip it if you are going straight to
cpt-mode.

Later, as you publish, each document **Type** becomes a child category underneath
Publications (see `taxonomy.md` section 2 for the agreed list). The publishing
panel creates those child categories for you the first time each one is used.

### Step 2 — Keep publications out of the blog listing (recommended)

Because publications are posts, they will otherwise show up alongside news and
blog articles. How you exclude them depends on how the blog page is built:

- **Elementor Posts / Archive widget** — open the widget's **Query** section and
  add `Publications` under **Exclude → Term**.
- **A theme blog template** — many themes have a "exclude categories from blog"
  setting; check the BigHearts theme options first.
- **Nothing else available** — a small plugin such as one of the "hide category
  from blog" plugins will do it.

This is optional. Nothing breaks if you skip it; publications simply also appear
as blog posts.

### Step 3 — Paste the page into Elementor

1. Create or open the page that will hold the library (for example a page called
   *Publications*).
2. Click **Edit with Elementor**.
3. Drag in a **Section** with a single full-width column.
4. In the section's **Advanced** settings, set padding to `0` on all four sides.
   The page brings its own spacing, and double padding looks wrong on phones.
5. Drag an **HTML** widget into that column.
6. Open `elementor/publications-page.html` in a plain text editor, select
   **everything** (Ctrl+A / Cmd+A), copy, and paste it into the HTML widget's
   content box.
7. Click **Update**.
8. Click the preview eye, or open the page in a new tab, to check it.

If the page shows the message *No category named "publications" was found*, go
back to Step 1 — the slug is wrong or the category does not exist yet.

If Elementor refuses the paste, or the page saves but comes back blank or
truncated, jump to section 5, **Alternative install for large pages**.

### Step 4 — Each staff member creates an Application Password

An Application Password is a separate password that lets the publishing panel
talk to WordPress on that person's behalf. It is **not** the person's normal
login password, and it can be cancelled on its own.

Each person who will publish does this once, on their own account:

1. Log in to WordPress.
2. Go to **Users → Profile** (some sites label it *Users → Your Profile*).
3. Scroll down to **Application Passwords**.
4. Type a name for it, for example `Publications page`, and click
   **Add New Application Password**.
5. WordPress shows a password like `abcd EFGH 1234 wxyz`. **Copy it now** — it is
   shown once and never again.
6. Store it in the person's own password manager, or write it down somewhere
   private. Do not share it between staff; each person uses their own.

Notes:

- The spaces do not matter. You can paste it with or without them; the panel
  strips them automatically.
- Application Passwords require HTTPS. If the section is missing from the profile
  page, the site is probably not on HTTPS, or WordPress is older than 5.6.
- If a laptop is lost or someone leaves, you can revoke just that one Application
  Password from this same profile page. The person's normal account password is
  unaffected.

### Step 5 — Sign in on the page and publish a test draft

1. Log in to WordPress, then visit the Publications page on the public site.
2. The publishing panel appears above the library. Click **Sign in**.
3. Enter the WordPress **username** (not the email address) and the Application
   Password.
4. Leave *stay signed in on this device* **unticked** on any shared or public
   computer. See section 4 for what that setting does.
5. Fill in the form with a real but unimportant document and save it as a
   **Draft**, not Published.
6. Check the draft in the WordPress dashboard: the title, category, tags and the
   `<!--TKPUB:...-->` comment at the top of the content should all be there, and
   the PDF should be in the Media Library.
7. When you are satisfied, delete the test or publish it properly.

If the panel does not appear at all, see **Troubleshooting** in section 9.

### Step 6 — Hand over

Point the publishing team at [`publishing-workflow.md`](publishing-workflow.md)
and [`taxonomy.md`](taxonomy.md). Those two documents, not this one, are what they
will use day to day.

---

## 4. How access actually works

It is worth being precise about this, because the panel looks more protective
than it is.

**The panel is only drawn when WordPress marks the visitor as logged in.**
WordPress adds a `logged-in` class to the page's `<body>` element for signed-in
users, and the panel checks for it. **This is cosmetic only.** It decides whether
the form is *displayed*; it does not decide whether anything can be *saved*.
Anyone can make a form appear in their own browser. That does not give them any
access.

**The panel only works after signing in with a username and an Application
Password.** Those credentials are sent with every request to WordPress.

**The panel checks the account can publish before showing the form.** After
sign-in it asks WordPress who the user is and confirms the account holds
`edit_posts` or `publish_posts`. An account without those capabilities is told so
and gets no form.

**The real enforcement is WordPress itself.** Every save, upload and edit goes
through the WordPress REST API, which re-checks the account's capabilities on the
server for every single write. A user who somehow forced the form open, or who
sent requests directly, still cannot create anything they are not entitled to
create. The browser-side checks are convenience; the server-side check is the
security.

### Where credentials are kept

By default, credentials are held in the browser's `sessionStorage` and are
**cleared when the tab is closed**.

If the user ticks **stay signed in on this device**, they move to `localStorage`
instead and survive closing the browser.

- On a personal laptop or phone, ticking it is reasonable.
- On a **shared or public computer, do not tick it.** The next person to use that
  browser would still be signed in to the publishing panel.
- Signing out from the panel clears both stores.
- If a device is lost, revoke that Application Password from **Users → Profile**.
  Only that one credential dies; the account password and other devices are
  unaffected.

### Upload limits

The panel checks file sizes in the browser before uploading anything:

| File | Limit enforced in the browser |
| --- | --- |
| PDF | 25 MB |
| Cover image | 3 MB |

The web host has its own limits too, set in PHP as `upload_max_filesize` and
`post_max_size`, and these are often **lower** than 25 MB. If an upload fails with
a **413** error, the host's limit is the one that stopped it, not ours. Either
compress the PDF, or ask the host to raise those two PHP values.

---

## 5. Alternative install for large pages

The single pasted block is around 122 KB. Most hosts handle that fine, but some
security plugins, web application firewalls (WAFs) and mod_security rules reject a
large inline paste — the save fails, or it appears to succeed but the page comes
back truncated or blank.

If that happens, split the page into four separate files instead.

1. **Upload three files to the site.** You need `src/publications.css`,
   `src/publications.js` and `src/admin.js` somewhere the browser can fetch them.
   Two workable places:

   - A folder inside the active child theme, via **Appearance → Theme File
     Editor** or FTP.
   - A folder such as `/wp-content/uploads/tkpub/`, created with the host's file
     manager, cPanel, or FTP.

   **Note:** WordPress does not allow `.js` or `.css` files through the Media
   Library by default. You will need file manager or FTP access, or a plugin that
   permits those file types.

2. **Paste only the markup.** Open `src/markup.html` (about 8 KB), copy all of it,
   and paste that into the Elementor HTML widget.

3. **Add three tags** in the same HTML widget, after the markup, pointing at the
   three files you uploaded:

   ```html
   <link rel="stylesheet" href="/wp-content/uploads/tkpub/publications.css">
   <script src="/wp-content/uploads/tkpub/publications.js"></script>
   <script src="/wp-content/uploads/tkpub/admin.js"></script>
   ```

   Adjust the paths to wherever you actually put the files.

**`publications.js` must load before `admin.js`.** The admin panel is built on
top of the public page's code and will not work if the order is reversed.

Remember that with this method, `node build.mjs` no longer updates the live site.
After any change to `src/`, you must re-upload the changed file or files.

---

## 6. Settings you may want to change

All the settings live in one block at the top of `src/publications.js`, an object
called `CONFIG`. The same block appears near the top of the generated
`elementor/publications-page.html`, inside the first `<script>` tag, so you can
also edit it there before pasting.

```js
var CONFIG = {
  mode: "posts",                    // 'posts' | 'cpt'
  restRoot: "/wp-json/",
  parentCategory: "publications",   // posts-mode: parent category slug
  perPage: 9,                       // cards shown before "Load more"
  maxFetch: 500,                    // safety ceiling on total items pulled
  defaultView: "grid",              // 'grid' | 'list'
  defaultSort: "newest",
  pdfjs: {
    lib: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    worker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  },
  languages: { en: "English", sw: "Kiswahili", fr: "French" },
  org: "Talitha Kum Kenya"
};
```

The ones you are most likely to touch:

| Setting | What it does |
| --- | --- |
| `mode` | `"posts"` or `"cpt"`. See section 2. |
| `perPage` | How many document cards show before the **Load more** button. `9` fills three rows of three on a desktop. `12` or `6` also look tidy. |
| `defaultView` | `"grid"` for cards, `"list"` for a denser row-per-document layout. Visitors can switch either way; this is just where they start. |
| `defaultSort` | `"newest"`, `"oldest"`, `"az"` (title A–Z) or `"za"` (title Z–A). |
| `org` | The organisation name shown on generated covers, and used as the issuing body when a document does not name one. |
| `languages` | The languages offered in the filter and in the publishing form. The key is the short code stored with the document; the value is what readers see. Add a line to add a language, for example `so: "Somali"`. |
| `parentCategory` | The category slug the page reads from in posts-mode. Only change this if you deliberately used a different slug in Step 1. |
| `maxFetch` | A safety ceiling on how many documents are pulled from WordPress in one go. Raise it only if the library ever exceeds 500 documents. |
| `restRoot` | Where the WordPress REST API lives. Leave as `/wp-json/` unless the site uses a non-standard REST route. |

### Brand colours and type

The design tokens sit at the very top of `src/publications.css`, scoped to
`.tkpub`. They were taken from the live BigHearts theme settings so the page
matches the rest of the site. Nothing else in the stylesheet hard-codes a colour,
so changing these values changes the whole page.

| Token | Value | Used for |
| --- | --- | --- |
| `--tk-accent` | `#F74F22` | Theme primary — buttons, active filters, links |
| `--tk-accent-dark` | `#d93d13` | Hover and pressed states |
| `--tk-accent-soft` | `#fdeae3` | Tinted backgrounds behind labels |
| `--tk-gold` | `#FFAC00` | Theme secondary — highlights, featured badges, focus rings |
| `--tk-gold-soft` | `#fff4dc` | Tinted gold backgrounds |
| `--tk-deep` | `#232323` | Heading colour |
| `--tk-body` | `#616161` | Body text colour |
| `--tk-radius` | `10px` | Card corner radius |
| `--tk-radius-pill` | `28px` | Button corner radius |
| `--tk-shadow` | `11px 10px 38px 0 rgba(0,0,0,.1)` | The theme's card shadow |
| `--tk-font` | `"Nunito Sans", …` | Body typeface |
| `--tk-head-font` | `"Quicksand", …` | Heading typeface |

If the BigHearts theme colours are ever changed in Elementor, update these values
to match and the whole library follows.

### If the site header covers the filter bar

The search and filter bar sticks to the top of the screen as the visitor scrolls.
If the theme has a fixed header, the two can overlap.

Fix it by setting `--tk-sticky-offset` as an inline style on the `.tkpub`
element. In `src/markup.html` (or in the pasted block), find:

```html
<div class="tkpub">
```

and change it to the height of the fixed header, for example:

```html
<div class="tkpub" style="--tk-sticky-offset: 90px">
```

It must be an inline `style` attribute on that element for the rule to apply.
Adjust the number until the filter bar sits just below the header.

### After any change

If you edited files in `src/`, rebuild and re-paste:

```
node build.mjs
```

Then copy the new `elementor/publications-page.html` into the HTML widget again
and click **Update**. (Unless you used the split install in section 5, in which
case re-upload the changed file instead.)

---

## 7. The PDF reader, honestly

Readers can open a document in the page rather than downloading it. Here is
exactly how that works and where it stops working.

**The normal case.** When a visitor opens a document, the page loads
[pdf.js](https://mozilla.github.io/pdf.js/) from the cdnjs CDN and renders the
pages itself, with page navigation and zoom. The library is only fetched when a
document is actually opened, so it costs nothing to visitors who just browse.

**If the CDN is blocked or the browser is old.** Some networks and some corporate
or institutional firewalls block cdnjs. If pdf.js cannot load, the page falls back
to showing the PDF in an `<iframe>` using the browser's own built-in PDF viewer.
The document is still readable; it just looks like the browser's viewer rather
than ours.

**On mobile browsers that refuse to embed PDFs.** Many phone browsers will not
display a PDF inside a frame at all. In that case the page shows an **Open the
PDF** button instead, which opens the document in a new tab or the phone's PDF
app. This is a limitation of mobile browsers, not a fault on the page.

**To turn the in-page renderer off entirely**, set:

```js
pdfjs: null
```

Every document then uses the browser's own viewer or the Open the PDF button.
This is a reasonable choice if the CDN is unreliable on your visitors' networks.

**To self-host pdf.js instead of using the CDN**, download the pdf.js
distribution, upload `pdf.min.js` and `pdf.worker.min.js` to the site, and point
the two settings at your copies:

```js
pdfjs: {
  lib: "/wp-content/uploads/tkpub/pdf.min.js",
  worker: "/wp-content/uploads/tkpub/pdf.worker.min.js"
}
```

Both files must be from the same pdf.js version. Self-hosting removes the
dependency on an outside service, at the cost of having to update it yourself.

---

## 8. Switching to cpt-mode later

Only do this once posts-mode is working and the team is comfortable. It is a
small change, but it does change where publications are stored, so plan a quiet
hour for it.

1. Upload `plugin/talithakum-publications.php` to
   `/wp-content/plugins/talithakum-publications/` on the site, or zip it and
   install it through **Plugins → Add New → Upload Plugin**.
2. Activate it under **Plugins**.
3. Confirm a new **Publications** menu appears in the WordPress dashboard.
4. Edit the configuration block and change one word:

   ```js
   mode: "cpt",
   ```

5. Rebuild with `node build.mjs` and re-paste the page into Elementor.

Once active, publications are stored as `tk_publication` posts, kept out of the
blog entirely, with real fields instead of the `<!--TKPUB:...-->` comment, and
downloads are counted.

Existing posts-mode publications are **not** moved automatically. Either
re-publish the important ones through the panel in cpt-mode, or keep the old page
in posts-mode until the archive has been re-entered. Decide which before you
switch, and tell the team.

---

## 9. Troubleshooting

### The page shows: No category named "publications" was found

The category does not exist, or its slug is not exactly `publications`.

Go to **Posts → Categories**, find or create *Publications*, and check the slug
column. It must be lower case, one word, no spaces, no trailing characters.
WordPress sometimes appends `-2` if a similar slug already exists — look for that.
Fix the slug and reload the page.

### A publication is not appearing on the page

Check, in this order:

1. **Is it published?** Drafts and pending posts are invisible to the public page
   by design. **Posts → All Posts**, check the status.
2. **Is it under the Publications category?** Open the post and look at the
   Categories box. The **Type** category (for example *Annual Report*) must be a
   **child** of Publications. If someone created the type as a top-level category
   by mistake, the post is outside the library and will not be found. Fix it in
   **Posts → Categories** by setting the type's parent to Publications, or tick
   Publications on the post as well.
3. **Is there a PDF attached?** A publication with no PDF link in its
   `<!--TKPUB:...-->` comment has nothing to open. Re-save it through the panel.
4. **Caching.** If a caching plugin is active, clear the cache and reload.

### The PDF upload is rejected

- **413 error, or "the server refused the file".** The host's PHP limit is lower
  than the file. Compress the PDF (see `publishing-workflow.md`, Step 4) or ask
  the host to raise `upload_max_filesize` and `post_max_size`.
- **"Larger than 25 MB".** That is our own limit, checked before upload. Compress
  the PDF — a 25 MB document is also too heavy for a visitor on mobile data.
- **"Sorry, this file type is not permitted for security reasons".** WordPress is
  refusing the MIME type. Confirm the file really is a PDF and its name ends in
  `.pdf`. If it is, a security plugin or a `ALLOW_UNFILTERED_UPLOADS` restriction
  is blocking PDFs — ask <site admin email> to allow PDF uploads.

### The reader is blank on a phone

Most likely the mobile browser will not embed PDFs. The page should show an
**Open the PDF** button instead — tap that. If you get a blank grey area with no
button, the PDF file itself may be corrupt; open its direct URL in a new tab to
check, and re-upload if needed.

### The publishing panel does not appear

1. **Are you logged in to WordPress?** The panel is only drawn for signed-in
   users. Log in to the dashboard in another tab, then reload the public page.
2. **Is a caching plugin serving you the logged-out page?** This is the most
   common cause. Full-page caches (WP Rocket, LiteSpeed Cache, W3 Total Cache,
   Cloudflare page rules, and the caching layers many hosts run by default) serve
   one saved copy of the page to everyone — and that copy usually has the
   `logged-in` class stripped from `<body>`, so the panel never draws.

   **The fix:** exclude the publications page from full-page caching in the
   caching plugin's settings, and from the host's or CDN's caching if they have
   their own. Look for a setting named *Never cache these pages*, *Excluded
   URLs*, or similar, and add the publications page's path. Then purge the cache.

3. **Did the JavaScript load?** In the split install (section 5), check that both
   script tags point at real files and that `publications.js` comes before
   `admin.js`.

### Sign-in is refused

- Use the WordPress **username**, not the email address.
- Use the **Application Password**, not the normal login password.
- Confirm the Application Password has not been revoked — check **Users →
  Profile**. If you are unsure, delete it and create a fresh one.
- Confirm the account has an author-level role or higher. Subscribers cannot
  publish, and the panel will say so.

### Something else

Note down exactly what you did, what you expected and what happened instead,
including the wording of any error message, and send it to <site admin email>.
`publishing-workflow.md` section 7 covers what the publishing team should try
before escalating.

---

## 10. Running the tests

There is a browser test suite that drives the built page in a real Chromium
browser against a stubbed WordPress REST API. It does **not** touch the live site.
It is useful after changing anything in `src/`.

```
cd test
npm install
node make-fixtures.mjs
node run.mjs
```

- `npm install` fetches Playwright and pdf.js.
- `make-fixtures.mjs` generates sample PDFs and builds `harness.html` — the built
  Elementor block wrapped in a page with a fake WordPress REST API in front of it.
- `run.mjs` starts a local web server, launches Chromium, and runs the checks,
  writing screenshots into `test/shots/`.

It currently runs **30 checks**, covering rendering, search, the filters, the PDF
reader, deep links (`?publication=<slug>`), the admin panel and the mobile layout.

If you are working in a sandbox or container that does not have a Chromium build
matching the installed Playwright version, point the suite at a Chromium you do
have:

```
CHROMIUM_PATH=/path/to/chrome node run.mjs
```

Note that the tests exercise a **stubbed** WordPress API, not the live site. They
tell you that the page behaves correctly against the API shape it expects. They do
not tell you that talithakumraht.org is configured correctly — only Step 5 of the
install does that.
