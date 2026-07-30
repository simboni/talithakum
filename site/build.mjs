/**
 * Talitha Kum Kenya — standalone static site generator.
 *
 *   node site/build.mjs           -> site/dist/
 *
 * No WordPress and no dependencies. Netlify runs this on every commit.
 *
 * The clever part: the publications, videos and team pages are the SAME
 * tested code that ran against WordPress. This build generates a static,
 * WordPress-shaped API under /api/, and Netlify redirect rules map the
 * /wp-json/ queries those pages make onto the static files. The pages
 * cannot tell the difference, so nothing had to be rewritten or retested.
 *
 * Content lives in site/content/ as JSON files that Decap CMS (the /admin
 * panel) reads and writes. Uploads land in site/static/uploads/.
 */

import { readFile, writeFile, mkdir, readdir, copyFile, stat, rm } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const dist = join(here, "dist");

const read = (p) => readFile(p, "utf8");
const S = (n) => read(join(repo, "src", "site", n));

/* ---------------------------------------------------------------------------
   Load content
--------------------------------------------------------------------------- */

async function collection(name) {
  const dir = join(here, "content", name);
  const out = [];
  for (const f of (await readdir(dir).catch(() => []))) {
    if (!f.endsWith(".json")) continue;
    out.push({ __file: f, ...JSON.parse(await read(join(dir, f))) });
  }
  return out;
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pubs = (await collection("publications")).sort((a, b) => b.date.localeCompare(a.date));
const vids = (await collection("videos")).sort((a, b) => b.date.localeCompare(a.date));
const team = (await collection("team"));
const news = (await collection("news")).sort((a, b) => b.date.localeCompare(a.date));
for (const n of news) n.slug = n.slug || slugify(n.title);

/* ---------------------------------------------------------------------------
   Tiny markdown for news bodies: paragraphs, headings, bold, links, images.
--------------------------------------------------------------------------- */

function md(src) {
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return String(src || "").split(/\n{2,}/).map((block) => {
    const b = block.trim();
    if (!b) return "";
    const h = /^(#{1,4})\s+(.*)$/.exec(b);
    if (h) return `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(b);
    if (img) return `<figure><img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy"></figure>`;
    if (/^[-*]\s/.test(b)) {
      return "<ul>" + b.split(/\n/).map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("") + "</ul>";
    }
    return `<p>${inline(b).replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
}

/* ---------------------------------------------------------------------------
   Chrome, retargeted at the static site's own routes
--------------------------------------------------------------------------- */

const LIVE = "https://talithakumraht.org";
const ROUTE = {
  "/": "/", "/about-us/": "/about-us/", "/vision-mission-and-values/": "/vision-mission-and-values/",
  "/contacts/": "/contacts/", "/donate/": "/donate/",
  "/publications/": "/publications/", "/videos/": "/videos/",
  "/our-team-2/": "/our-team/",
  "/blog-grid/": "/news/",
  "/portfolio-grid/": "/our-work/",
  "/portfolio-gallery/": "/gallery/",
  "/category/prayer/": "/category/prayer/",
  "/category/protection/": "/category/protection/",
  "/category/prevention/": "/category/prevention/",
  "/category/partnership-networking/": "/category/partnership-networking/",
  "/terms-of-use/": "/terms/", "/privacy-environmental-policy/": "/privacy/",
};
/* Live media the pages reference -> files bundled into /uploads. */
const MEDIA = {
  "/wp-content/uploads/2020/09/cropped-TIK-LOGO-192x192.png": ["/uploads/tik-logo.png", join(repo, "assets/site-src/images/TIK-LOGO.png")],
  "/wp-content/uploads/2024/02/DSC_0023-scaled.jpg": ["/uploads/hero-network.jpg", join(repo, "assets/site-src/images/DSC_0023-scaled-1170x935.jpg")],
  /* Homepage hero — 2026 network group photo (not on the old WP site). */
  "/wp-content/uploads/2026/07/tkk-network-2026.jpg": ["/uploads/hero-home.jpg", join(repo, "assets/site-src/images/tkk-network-2026.jpg")],
  "/wp-content/uploads/2026/07/stop-human-trafficking.png": ["/uploads/stop-trafficking.png", join(repo, "assets/site-src/images/stop-human-trafficking.png")],
  "/wp-content/uploads/2023/12/DSC_0535.jpg": ["/uploads/network-meeting.jpg", join(repo, "assets/site-src/images/DSC_0535-1170x935.jpg")],
  "/wp-content/uploads/2023/12/ToT-police.jpg": ["/uploads/tot-police.jpg", join(repo, "assets/site-src/images/ToT-police.jpg")],
  "/wp-content/uploads/2024/05/Novices.jpg": ["/uploads/novices.jpg", join(repo, "assets/site-src/images/Novices-1170x935.jpg")],
  "/wp-content/uploads/2024/05/IMG-20240421-WA0375-1.jpg": ["/uploads/outreach.jpg", join(repo, "assets/site-src/images/IMG-20240421-WA0375-1-1170x935.jpg")],
  "/wp-content/uploads/2025/02/IMG_6463-1-scaled.jpg": ["/uploads/team-photo.jpg", join(repo, "assets/site-src/images/IMG_6463-1-scaled-1170x935.jpg")],
  "/wp-content/uploads/2023/12/IMG_20220324_102453-scaled.jpg": ["/uploads/contact-hero.jpg", join(repo, "assets/site-src/images/IMG_20220324_102453-scaled-1170x935.jpg")],
  "/wp-content/uploads/2023/12/hand-g880142d87_1920.jpg": ["/uploads/donate-hero.jpg", join(repo, "assets/site-src/images/hand-g880142d87_1920-740x800.jpg")],
  "/wp-content/uploads/2024/01/HT-month.jpg": ["/uploads/ht-month.jpg", join(repo, "assets/site-src/images/HT-month-1170x935.jpg")],
  "/wp-content/uploads/2025/02/IMG-20250215-WA0020.jpg": ["/uploads/bakhita-day.jpg", join(repo, "assets/site-src/images/IMG-20250215-WA0020-1170x935.jpg")],
};

function retarget(html) {
  for (const [path, [local]] of Object.entries(MEDIA)) html = html.split(LIVE + path).join(local);
  for (const [from, to] of Object.entries(ROUTE)) html = html.split(`"${LIVE}${from}"`).join(`"${to}"`);
  html = html.split(`"${LIVE}/"`).join('"/"').split(LIVE).join("");
  return html;
}

const css = await S("site.css");
const js = await S("site.js");
const chromeHead = retarget(await S("chrome-head.html"));
const chromeFoot = retarget(await S("chrome-foot.html"));
const safe = (s) => s.replace(/<\/script>/gi, "<\\/script>");

const ORIGIN = "https://talithakumraht.org";

function shell({ title, desc, body, extraCss = "", extraJs = "", canonical = "",
                 image = "/uploads/hero-network.jpg", ogType = "website", published = "" }) {
  /* scrapers (WhatsApp, Facebook, X, Slack…) need absolute image URLs */
  const absImage = /^https?:/.test(image) ? image : ORIGIN + image;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${ORIGIN}${canonical}">` : ""}
<link rel="icon" href="/uploads/tik-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Nunito+Sans:ital,wght@0,400..900;1,400..900&display=swap">
<meta name="theme-color" content="#221a14">
<meta property="og:site_name" content="Talitha Kum Kenya">
<meta property="og:type" content="${ogType}">
${canonical ? `<meta property="og:url" content="${ORIGIN}${canonical}">` : ""}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(absImage)}">
${published ? `<meta property="article:published_time" content="${esc(published)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(absImage)}">
<style>
/* Cross-document view transitions: page changes cross-fade in browsers
   that support it, and are ordinary navigations everywhere else. */
@view-transition { navigation: auto; }
@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: .28s; }
}
body { margin: 0; background: #fffdfa; }
${css.trim()}
${extraCss}
</style>
</head>
<body>
<div class="tks">
${chromeHead}

${body}

${chromeFoot}
</div>
<script>
${safe(js).trim()}
</script>
${extraJs}
</body>
</html>`;
}

async function page(route, html) {
  const dir = join(dist, route === "/" ? "" : route);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

/* ---------------------------------------------------------------------------
   Static WordPress-shaped API
--------------------------------------------------------------------------- */

const IDS = { publications: 1001, videos: 1002, team: 1003 };
let termId = 2000, postId = 3000, mediaId = 5000;
const termIds = {};
const T = (tax, name, parent) => {
  const key = tax + "|" + name;
  if (!termIds[key]) termIds[key] = { id: ++termId, taxonomy: tax, name, slug: slugify(name), parent: parent || 0 };
  return termIds[key];
};

function wpPost({ title, date, slug, payloadTag, payload, summary, type, parentId, parentSlug, tags, cover }) {
  const terms = [
    { id: parentId, taxonomy: "category", name: parentSlug, slug: parentSlug, parent: 0 },
  ];
  if (type) terms.push({ ...T("category", type, parentId) });
  const tagTerms = (tags || []).map((t) => ({ ...T("post_tag", t), parent: 0, taxonomy: "post_tag" }));
  const embedded = { "wp:term": [terms, tagTerms] };
  if (cover) {
    embedded["wp:featuredmedia"] = [{
      id: ++mediaId, source_url: cover, alt_text: "",
      media_details: { sizes: { medium_large: { source_url: cover } } },
    }];
  }
  return {
    id: ++postId,
    slug: slug || slugify(title),
    status: "publish",
    date: `${date}T09:00:00`,
    link: "/",
    title: { rendered: esc(title) },
    excerpt: { rendered: `<p>${esc(summary || "")}</p>` },
    content: { rendered: `<!--${payloadTag}:${JSON.stringify(payload)}-->\n<p>${esc(summary || "")}</p>` },
    _embedded: embedded,
  };
}

async function writeApi() {
  const api = join(dist, "api");
  await mkdir(api, { recursive: true });
  const J = (n, v) => writeFile(join(api, n), JSON.stringify(v), "utf8");

  await J("categories-publications.json", [{ id: IDS.publications, name: "Publications", slug: "publications", parent: 0 }]);
  await J("categories-videos.json", [{ id: IDS.videos, name: "Videos", slug: "videos", parent: 0 }]);
  await J("categories-team.json", [{ id: IDS.team, name: "Team", slug: "team", parent: 0 }]);
  await J("categories-skip.json", [
    { id: IDS.publications, slug: "publications" }, { id: IDS.videos, slug: "videos" }, { id: IDS.team, slug: "team" },
  ]);

  await J("posts-publications.json", await Promise.all(pubs.map(async (p) => {
    let size = 0;
    try { size = (await stat(join(here, "static", p.pdf.replace(/^\//, "")))).size; } catch (e) {}
    return wpPost({
      title: p.title, date: p.date, summary: p.summary,
      type: p.type, parentId: IDS.publications, parentSlug: "publications",
      tags: [...(p.themes || []), ...(p.keywords || [])],
      cover: p.cover || "",
      payloadTag: "TKPUB",
      payload: {
        pdf: p.pdf, pages: p.pages || 0, size, cover: p.cover || "",
        lang: p.lang || "en", issuer: p.issuer || "Talitha Kum Kenya",
        featured: !!p.featured, date: p.date, themes: p.themes || [], keywords: p.keywords || [],
      },
    });
  })));

  await J("posts-videos.json", vids.map((v) => wpPost({
    title: v.title, date: v.date, summary: v.summary,
    type: v.type, parentId: IDS.videos, parentSlug: "videos",
    tags: v.themes || [],
    payloadTag: "TKVID",
    payload: { url: v.url, dur: v.dur || "", featured: !!v.featured, date: v.date },
  })));

  await J("posts-team.json", team.map((p) => wpPost({
    title: p.name, date: p.date || "2026-01-01", summary: p.bio || "",
    type: p.group, parentId: IDS.team, parentSlug: "team",
    payloadTag: "TKTEAM",
    payload: { role: p.role, photo: p.photo || "", order: p.order == null ? 50 : p.order },
  })));

  await J("news-latest.json", news.slice(0, 3).map((n) => ({
    id: ++postId, date: `${n.date}T09:00:00`, link: `/news/${n.slug}/`,
    title: { rendered: esc(n.title) },
    excerpt: { rendered: `<p>${esc(n.summary || "")}</p>` },
    _embedded: n.image ? { "wp:featuredmedia": [{ source_url: n.image, media_details: { sizes: { medium_large: { source_url: n.image } } } }] } : {},
  })));
}

/* ---------------------------------------------------------------------------
   Simple content pages (reuse the fragments built for Elementor)
--------------------------------------------------------------------------- */

const frag = async (n) => retarget(await S(join("pages", `${n}.html`)));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

/* The homepage "In pictures" strip: the newest photos from the gallery the
   admin panel manages, so it refreshes with every gallery publish. */
const galleryPhotos = JSON.parse(await read(join(here, "content", "gallery.json")).catch(() => '{"photos":[]}')).photos || [];
const galleryStrip = galleryPhotos.length < 3 ? "" : `
<section class="tks-sec">
  <div class="tks-wrap">
    <div class="tks-sechead is-split" data-reveal>
      <div>
        <span class="tks-kicker">In pictures</span>
        <h2 class="tks-h2">Moments from across the network</h2>
      </div>
      <a class="tks-btn tks-btn-ghost" href="/gallery/">View the gallery</a>
    </div>
    <div class="tks-galstrip">
      ${galleryPhotos.slice(0, 5).map((p) => `<a href="/gallery/" data-reveal>
        <img src="${esc(p.image)}" alt="${esc(p.caption || "Photograph from the Talitha Kum Kenya network")}" loading="lazy"></a>`).join("")}
    </div>
  </div>
</section>`;

await page("/", shell({
  title: "Talitha Kum Kenya — Ending human trafficking in Kenya",
  desc: "A network of consecrated religious, lay women and men working to end human trafficking in Kenya since 2016.",
  canonical: "/", image: "/uploads/hero-home.jpg",
  body: (await frag("home")).replace(/<!-- gallery-strip:[\s\S]*?-->/, galleryStrip),
}));
await page("/about-us/", shell({
  title: "About us — Talitha Kum Kenya",
  desc: "Who we are and how the network began in the Jubilee Year of Mercy.",
  canonical: "/about-us/", body: await frag("about"),
}));
await page("/vision-mission-and-values/", shell({
  title: "Vision, Mission & Values — Talitha Kum Kenya",
  desc: "Inspired by the mercy of God, we envision a world free from human trafficking.",
  canonical: "/vision-mission-and-values/", body: await frag("vision"),
}));
await page("/donate/", shell({
  title: "Donate — Talitha Kum Kenya",
  desc: "Give by M-Pesa or bank transfer, direct to Talitha Kum Kenya Registered Trustees.",
  canonical: "/donate/", body: await frag("donate"),
}));

/* Contacts gets a real, working Netlify form. */
{
  let body = await frag("contacts");
  body = body.replace(/<!-- If a WPForms[\s\S]*?-->/, `
    <form name="contact" method="POST" action="/thanks/" data-netlify="true" netlify-honeypot="website"
          style="display:grid;gap:16px;margin-top:8px" data-reveal>
      <p style="display:none"><label>Leave this empty <input name="website"></label></p>
      <div class="tks-f" style="display:grid;gap:6px">
        <label for="cf-name" style="font-weight:700;color:var(--s-deep);font-size:13px">Your name</label>
        <input id="cf-name" name="name" required style="font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--s-line);border-radius:8px;background:var(--s-surface)">
      </div>
      <div style="display:grid;gap:6px">
        <label for="cf-email" style="font-weight:700;color:var(--s-deep);font-size:13px">Email or phone</label>
        <input id="cf-email" name="contact" required style="font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--s-line);border-radius:8px;background:var(--s-surface)">
      </div>
      <div style="display:grid;gap:6px">
        <label for="cf-msg" style="font-weight:700;color:var(--s-deep);font-size:13px">Message</label>
        <textarea id="cf-msg" name="message" required rows="5" style="font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--s-line);border-radius:8px;background:var(--s-surface);resize:vertical"></textarea>
      </div>
      <button class="tks-btn tks-btn-p" type="submit" style="justify-self:start">Send the message</button>
    </form>`);
  await page("/contacts/", shell({
    title: "Contacts — Talitha Kum Kenya",
    desc: "Reach out — we are here to help. Toll-free helpline 0800 724 690.",
    canonical: "/contacts/", body,
  }));
}

await page("/thanks/", shell({
  title: "Message sent — Talitha Kum Kenya",
  desc: "Thank you for reaching out.",
  body: `<section class="tks-sec"><div class="tks-wrap" style="text-align:center;padding:60px 22px">
    <span class="tks-kicker">Message sent</span>
    <h1 class="tks-h2" style="margin:0 auto">Thank you — we will get back to you</h1>
    <p class="tks-lede" style="margin:14px auto 26px">Your message has reached the coordination office.
    If it is urgent, call the toll-free helpline <b>0800 724 690</b>.</p>
    <a class="tks-btn tks-btn-p" href="/">Back to the homepage</a></div></section>`,
}));

/* ---------------------------------------------------------------------------
   The three app pages — same code that ran against WordPress
--------------------------------------------------------------------------- */

async function appPage({ route, title, desc, files, extraCssFiles = [] }) {
  const markup = await read(join(repo, "src", files.markup));
  let cssApp = await read(join(repo, "src", files.css));
  for (const f of extraCssFiles) cssApp += "\n" + await read(join(repo, "src", f));
  const jsApp = await read(join(repo, "src", files.js));
  const body = `<div style="max-width:1200px;margin:0 auto;padding:34px 22px 70px">\n${markup}\n</div>`;
  await page(route, shell({
    title, desc, canonical: route, body,
    extraCss: cssApp.trim(),
    extraJs: `<script>\n${safe(jsApp).trim()}\n</script>`,
  }));
}

await appPage({
  route: "/publications/", title: "Publications — Talitha Kum Kenya",
  desc: "Reports, briefs and newsletters from the network — readable on the page.",
  files: { markup: "markup.html", css: "publications.css", js: "publications.js" },
  extraCssFiles: ["mobile.css"],
});
await appPage({
  route: "/videos/", title: "Videos — Talitha Kum Kenya",
  desc: "Awareness films, trainings and testimony from the network.",
  files: { markup: "videos-markup.html", css: "videos.css", js: "videos.js" },
});
await appPage({
  route: "/our-team/", title: "Our Team — Talitha Kum Kenya",
  desc: "The board and staff of Talitha Kum Kenya.",
  files: { markup: "team-markup.html", css: "team.css", js: "team.js" },
});

/* ---------------------------------------------------------------------------
   News, categories, our-work, gallery
--------------------------------------------------------------------------- */

const CATS = {
  "prayer": "Prayer", "protection": "Protection", "prevention": "Prevention",
  "partnership-networking": "Partnership & Networking",
};

/* Category tabs shown on /news/ and every /category/ page: All + the four Ps,
   each with its story count, the current page highlighted. */
function catTabs(active) {
  const tabs = [["", "All", news.length]].concat(
    Object.entries(CATS).map(([slug, name]) => [slug, name,
      news.filter((n) => (n.category || "") === name || (n.category || "") === slug).length])
  );
  return `<nav class="tks-cattabs" aria-label="Story categories">
    ${tabs.map(([slug, name, count]) => `<a href="${slug ? `/category/${slug}/` : "/news/"}"
      ${slug === (active || "") ? 'class="is-on" aria-current="page"' : ""}>${esc(name)} <b>${count}</b></a>`).join("")}
  </nav>`;
}

function newsCard(n) {
  return `<a class="tks-ncard" href="/news/${n.slug}/" data-reveal>
    <span class="tks-nimg">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy">` : ""}${n.category ? `<span class="tks-ntag">${esc(n.category)}</span>` : ""}</span>
    <span class="tks-nbody">
      <time>${new Date(n.date + "T12:00:00").toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</time>
      <h3>${esc(n.title)}</h3><p>${esc(n.summary || "")}</p>
      <span class="tks-plink">Read the story <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
    </span></a>`;
}

function listPage({ kicker, h1, lede, items, empty, nav = "", pager = "" }) {
  return `<section class="tks-pagehead"><div class="tks-hbg" style="background-image:url('/uploads/hero-network.jpg')"></div>
    <div class="tks-wrap"><span class="tks-kicker">${esc(kicker)}</span><h1>${esc(h1)}</h1><p>${esc(lede)}</p></div></section>
  <section class="tks-sec"><div class="tks-wrap">
    ${nav}
    ${items.length ? `<div class="tks-news">${items.map(newsCard).join("")}</div>`
      : `<div style="text-align:center;border:1px dashed var(--s-line);border-radius:10px;padding:48px 22px">
           <h3 style="font-size:18px">${esc(empty)}</h3>
           <p style="color:var(--s-muted);margin-top:6px">New stories are added from the admin panel and appear here.</p></div>`}
    ${pager}
  </div></section>`;
}

/* Stories are paginated nine to a page (three rows of the grid), with the
   same pager the gallery uses. Story slugs are never bare numbers, so the
   numeric page routes cannot collide with /news/<slug>/. */
const NEWS_PER_PAGE = 9;

function chunkPages(items, per) {
  const pages = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  if (!pages.length) pages.push([]);
  return pages;
}

function listPager(routeOf, n, total, label) {
  if (total < 2) return "";
  return `<nav class="tks-pgn" aria-label="${esc(label)}">
    ${n > 1 ? `<a class="tks-pgn-step" href="${routeOf(n - 1)}" rel="prev">&larr; Newer</a>` : ""}
    ${Array.from({ length: total }, (_, i) => i + 1 === n
      ? `<span class="is-here" aria-current="page">${i + 1}</span>`
      : `<a href="${routeOf(i + 1)}">${i + 1}</a>`).join("")}
    ${n < total ? `<a class="tks-pgn-step" href="${routeOf(n + 1)}" rel="next">Older &rarr;</a>` : ""}
  </nav>`;
}

{
  const pages = chunkPages(news, NEWS_PER_PAGE);
  const routeOf = (i) => (i === 1 ? "/news/" : `/news/${i}/`);
  for (let n = 1; n <= pages.length; n++) {
    await page(routeOf(n), shell({
      title: `News${n > 1 ? ` — page ${n}` : ""} — Talitha Kum Kenya`,
      desc: "Stories and updates from across the network.",
      canonical: routeOf(n),
      body: listPage({ kicker: "News", h1: "Latest from the network", lede: "Stories and updates from the field.",
        items: pages[n - 1], empty: "No stories yet", nav: catTabs(""),
        pager: listPager(routeOf, n, pages.length, "News pages") }),
    }));
  }
}

for (const [slug, name] of Object.entries(CATS)) {
  const items = news.filter((n) => (n.category || "") === name || (n.category || "") === slug);
  const pages = chunkPages(items, NEWS_PER_PAGE);
  const routeOf = (i) => (i === 1 ? `/category/${slug}/` : `/category/${slug}/${i}/`);
  for (let n = 1; n <= pages.length; n++) {
    await page(routeOf(n), shell({
      title: `${name}${n > 1 ? ` — page ${n}` : ""} — Talitha Kum Kenya`,
      desc: `Our work in ${name.toLowerCase()}.`,
      canonical: routeOf(n),
      body: listPage({ kicker: "Our work", h1: name, lede: `Stories from our ${name.toLowerCase()} work.`,
        items: pages[n - 1], empty: `No ${name.toLowerCase()} stories yet`, nav: catTabs(slug),
        pager: listPager(routeOf, n, pages.length, `${name} pages`) }),
    }));
  }
}

for (const n of news) {
  await page(`/news/${n.slug}/`, shell({
    title: `${n.title} — Talitha Kum Kenya`,
    desc: n.summary || n.title,
    canonical: `/news/${n.slug}/`,
    ogType: "article",
    published: n.date,
    ...(n.image ? { image: n.image } : {}),
    body: `<section class="tks-pagehead">${n.image ? `<div class="tks-hbg" style="background-image:url('${esc(n.image)}')"></div>` : ""}
      <div class="tks-wrap"><span class="tks-kicker">${esc(n.category || "News")}</span>
      <h1>${esc(n.title)}</h1>
      <p>${new Date(n.date + "T12:00:00").toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</p></div></section>
    <section class="tks-sec"><div class="tks-wrap"><div class="tks-prose">
      ${md(n.body || n.summary || "")}
      <p style="margin-top:28px"><a class="tks-btn tks-btn-ghost" href="/news/">All news</a></p>
    </div></div></section>`,
  }));
}

/* Our Work overview: the four Ps, full width. */
await page("/our-work/", shell({
  title: "Our Work — Talitha Kum Kenya",
  desc: "Prayer, Protection, Prevention and Partnership — the four Ps that define us.",
  canonical: "/our-work/",
  body: `<section class="tks-pagehead"><div class="tks-hbg" style="background-image:url('/uploads/tot-police.jpg')"></div>
    <div class="tks-wrap"><span class="tks-kicker">Our Work</span><h1>The four Ps that define us</h1>
    <p>Everything the network does is organised under four commitments.</p></div></section>
  <section class="tks-sec"><div class="tks-wrap"><div class="tks-ps">
    ${Object.entries(CATS).map(([slug, name]) => `
      <article class="tks-p" data-reveal>
        <h3>${esc(name)}</h3>
        <p>${{
          Prayer: "Rooted in faith, we commit to uplifting both survivors and perpetrators through prayer.",
          Protection: "Comprehensive care: psychosocial support, medical aid and shelter for survivors.",
          Prevention: "Community workshops, training and media advocacy that equip first responders.",
          "Partnership & Networking": "A diverse network of stakeholders, amplifying our impact together.",
        }[name]}</p>
        <a class="tks-plink" href="/category/${slug}/">Stories from this work
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></a>
      </article>`).join("")}
  </div></div></section>`,
}));

/* Gallery: photos come from site/content/gallery.json (edited in the admin
   panel), eight to a page; more photos grow into /gallery/2/, /gallery/3/… */
const galleryRoutes = [];
{
  const PER_PAGE = 8;
  const photos = galleryPhotos;
  const pages = [];
  for (let i = 0; i < photos.length; i += PER_PAGE) pages.push(photos.slice(i, i + PER_PAGE));
  if (!pages.length) pages.push([]);
  const routeOf = (n) => (n === 1 ? "/gallery/" : `/gallery/${n}/`);
  for (let n = 1; n <= pages.length; n++) {
    const nav = pages.length < 2 ? "" : `
      <nav class="tks-pgn" aria-label="Gallery pages">
        ${n > 1 ? `<a class="tks-pgn-step" href="${routeOf(n - 1)}" rel="prev">&larr; Newer</a>` : ""}
        ${pages.map((_, i) => i + 1 === n
          ? `<span class="is-here" aria-current="page">${i + 1}</span>`
          : `<a href="${routeOf(i + 1)}">${i + 1}</a>`).join("")}
        ${n < pages.length ? `<a class="tks-pgn-step" href="${routeOf(n + 1)}" rel="next">Older &rarr;</a>` : ""}
      </nav>`;
    galleryRoutes.push(routeOf(n));
    await page(routeOf(n), shell({
      title: `Gallery${n > 1 ? ` — page ${n}` : ""} — Talitha Kum Kenya`,
      desc: "Photographs from across the network.",
      canonical: routeOf(n),
      ...(pages[n - 1][0] ? { image: pages[n - 1][0].image } : {}),
      body: `<section class="tks-pagehead"><div class="tks-hbg" style="background-image:url('/uploads/outreach.jpg')"></div>
        <div class="tks-wrap"><span class="tks-kicker">Gallery</span><h1>Photographs from across the network</h1>
        <p>Workshops, trainings, commissioning days and the people who make the work happen.</p></div></section>
      <section class="tks-sec"><div class="tks-wrap">
        <div class="tks-gal">
          ${pages[n - 1].map((p) => `<figure data-reveal>
            <img src="${esc(p.image)}" alt="${esc(p.caption || "Photograph from the network")}" loading="lazy">
            ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}
          </figure>`).join("")}
        </div>
        ${nav}
      </div></section>`,
    }));
  }
}

for (const [route, title] of [["/terms/", "Terms of use"], ["/privacy/", "Privacy policy"]]) {
  await page(route, shell({
    title: `${title} — Talitha Kum Kenya`, desc: title, canonical: route,
    body: `<section class="tks-sec"><div class="tks-wrap"><div class="tks-prose">
      <span class="tks-kicker">${title}</span>
      <h1 class="tks-h2">${title}</h1>
      <p style="margin-top:14px">This page carries the organisation's ${title.toLowerCase()}.
      The text is managed from the admin panel and can be updated at any time.</p>
    </div></div></section>`,
  }));
}

/* 404 */
await writeFile(join(dist, "404.html"), shell({
  title: "Page not found — Talitha Kum Kenya", desc: "That page does not exist.",
  body: `<section class="tks-sec"><div class="tks-wrap" style="text-align:center;padding:70px 22px">
    <span class="tks-kicker">404</span><h1 class="tks-h2" style="margin:0 auto">That page could not be found</h1>
    <p class="tks-lede" style="margin:14px auto 26px">It may have moved when the site was rebuilt.</p>
    <a class="tks-btn tks-btn-p" href="/">Back to the homepage</a></div></section>`,
}), "utf8");

/* ---------------------------------------------------------------------------
   Static assets, API, redirects, admin, sitemap
--------------------------------------------------------------------------- */

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  for (const f of (await readdir(from).catch(() => []))) {
    const s = await stat(join(from, f));
    if (s.isDirectory()) await copyDir(join(from, f), join(to, f));
    else await copyFile(join(from, f), join(to, f));
  }
}
await copyDir(join(here, "static"), dist);
for (const [, [local, src]] of Object.entries(MEDIA)) {
  await mkdir(join(dist, "uploads"), { recursive: true });
  await copyFile(src, join(dist, local.replace(/^\//, "")));
}
await copyDir(join(here, "admin"), join(dist, "admin"));
await writeApi();

/* Netlify redirects: the WordPress-shaped queries the app pages make, then
   the old WordPress URLs, so links shared over the years keep working. */
const redirects = `
# --- static API, shaped like WordPress ---
/wp-json/wp/v2/categories slug=publications /api/categories-publications.json 200
/wp-json/wp/v2/categories slug=videos /api/categories-videos.json 200
/wp-json/wp/v2/categories slug=team /api/categories-team.json 200
/wp-json/wp/v2/categories slug=publications,videos,team /api/categories-skip.json 200
/wp-json/wp/v2/posts categories=${IDS.publications} /api/posts-publications.json 200
/wp-json/wp/v2/posts categories=${IDS.videos} /api/posts-videos.json 200
/wp-json/wp/v2/posts categories=${IDS.team} /api/posts-team.json 200
/wp-json/wp/v2/posts per_page=3 /api/news-latest.json 200

# --- old WordPress addresses ---
/our-team-2/ /our-team/ 301
/blog-grid/ /news/ 301
/portfolio-grid/ /our-work/ 301
/portfolio-gallery/ /gallery/ 301
/vision-mission-and-values-2/ /vision-mission-and-values/ 301
/terms-of-use/ /terms/ 301
/privacy-environmental-policy/ /privacy/ 301
`;
await writeFile(join(dist, "_redirects"), redirects.trim() + "\n", "utf8");

const routes = ["/", "/about-us/", "/vision-mission-and-values/", "/contacts/", "/donate/",
  "/publications/", "/videos/", "/our-team/", "/news/", "/our-work/", ...galleryRoutes,
  ...Object.keys(CATS).map((c) => `/category/${c}/`),
  ...news.map((n) => `/news/${n.slug}/`)];
await writeFile(join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  routes.map((r) => `  <url><loc>https://talithakumraht.org${r}</loc></url>`).join("\n") +
  `\n</urlset>\n`, "utf8");
await writeFile(join(dist, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://talithakumraht.org/sitemap.xml\n", "utf8");

console.log(`built site/dist — ${routes.length + 3} pages, API for ${pubs.length} publications, ${vids.length} videos, ${team.length} team members, ${news.length} stories`);
