# Talitha Kum Kenya — Publications Repository

A public, searchable library of PDF documents for **talithakumraht.org**, the
website of Talitha Kum Kenya.

It does two things:

1. Gives visitors a filterable shelf of every document the organisation
   publishes, which they can read **in the page** without downloading anything.
2. Gives staff a publishing form **on the front end of the site**, so a new
   document can go online without anyone learning the WordPress dashboard.

It is built for the site as it stands — WordPress with the **BigHearts** theme
and **Elementor**. It installs as a single HTML widget on one page. There is no
build step on the server, no framework, and no required plugin.

---

## Who this is for

- **Publishing staff** who prepare and upload documents each week or month.
  Start with [`docs/publishing-workflow.md`](docs/publishing-workflow.md).
- **Whoever classifies documents** — deciding what counts as a publication and
  which type and themes it carries.
  Start with [`docs/taxonomy.md`](docs/taxonomy.md).
- **Whoever installs and maintains the site.**
  Start with [`docs/setup.md`](docs/setup.md).

---

## What is in here

| Path | What it is |
| --- | --- |
| `build.mjs` | Node script that bundles `src/` into the single pasteable block |
| `build-preview.mjs` | Node script that builds an offline design preview |
| `src/markup.html` | The page markup |
| `src/publications.css` | The design system — BigHearts brand tokens at the top |
| `src/publications.js` | The public page: data loading, filters, PDF reader |
| `src/admin.js` | The front-end publishing panel |
| `elementor/publications-page.html` | **Generated.** The one file you paste into Elementor (~122 KB) |
| `preview/publications-preview.html` | **Generated.** A self-contained offline preview of the page, with sample documents. Open it in a browser to see the design without a WordPress site |
| `plugin/talithakum-publications.php` | Optional WordPress plugin, for cpt-mode |
| `docs/setup.md` | Install, configuration and troubleshooting |
| `docs/taxonomy.md` | The content model — types, themes, titles, safeguarding |
| `docs/publishing-workflow.md` | The editorial workflow — who does what, and when |
| `test/` | Browser test suite (Playwright) and fixtures |

Everything in `src/` is the source of truth. **Never hand-edit
`elementor/publications-page.html`** — it is overwritten on every build.

---

## Quickstart

```
node build.mjs
```

That writes `elementor/publications-page.html`. Then:

1. In WordPress, create a category named **Publications** with the slug
   `publications`.
2. In Elementor, add an **HTML** widget to the publications page — full width,
   padding removed.
3. Paste the entire contents of `elementor/publications-page.html` into it.
4. Click **Update**.

Full instructions, including how staff sign in to publish, are in
[`docs/setup.md`](docs/setup.md).

---

## Two modes

**`mode: "posts"`** is the default and needs no plugin: publications are ordinary
WordPress posts under a parent `publications` category, with the document type as
a child category, themes and keywords as tags, and the remaining details stored in
a small machine-readable comment the publishing panel writes for you.

**`mode: "cpt"`** requires `plugin/talithakum-publications.php` and keeps
publications in their own post type with real taxonomies, real meta fields and a
download counter, so they never appear in the blog, RSS or site search.

Switching between them is a one-word change to `CONFIG.mode` at the top of
`src/publications.js`. Start with posts-mode.

---

## What it does

**The public page** lists every published document as a card or a list row, with a
generated cover for documents that do not have their own. Visitors can search
across titles, summaries, document type, issuing body and keywords; narrow the
shelf with type and theme chips or the year and language menus; and sort by
newest, oldest or title. Opening a document renders it in
the page with pdf.js — page navigation, zoom, and a download button — falling back
to the browser's own PDF viewer where pdf.js cannot load, and to an "Open the PDF"
button on mobile browsers that refuse to embed PDFs. Every document has a
shareable deep link (`?publication=<slug>`). The layout works on a phone, and the
whole page is scoped so it cannot clash with the theme.

**The publishing panel** appears above the library for signed-in staff. It takes a
title, summary, type, themes, keywords, language, issuing body and date; uploads
the PDF and an optional cover image; reads the PDF's page count and file size
automatically; and saves the result as a draft or a published document. Staff sign
in with their WordPress username and an Application Password — never their normal
login password — and every write is re-checked against their WordPress permissions
on the server. Existing publications can be edited or unpublished from the same
panel.

---

## Safeguarding

Everything published through this library is subject to the safeguarding and
consent rules in [`docs/taxonomy.md`](docs/taxonomy.md), section 9.

In short: no survivor is named, described identifiably or photographed
recognisably without documented written consent held on file; case studies are
anonymised; and annexes are checked for consent forms, attendance lists and phone
numbers before a PDF goes up. A published PDF is downloaded, copied and cached
beyond our control — taking it down later does not undo it.

If there is any doubt at all about a document, it does not go up until the doubt
is resolved. Read section 9 before publishing anything, and section 6 of
[`docs/publishing-workflow.md`](docs/publishing-workflow.md) if something needs to
come down.
