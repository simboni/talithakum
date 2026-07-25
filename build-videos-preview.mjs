/**
 * Self-contained design preview of the videos page.
 *
 *   TKPUB_FONTS=/path/to/fonts.css node build-videos-preview.mjs
 *
 * Output: preview/videos-preview.html
 *
 * Uses the real src/ files. Three things are swapped, all because the
 * preview must run with no network at all:
 *   1. fetch() is stubbed with sample videos.
 *   2. Thumbnails are replaced with the organisation's own photographs. On
 *      the live site they come from YouTube automatically, from the link.
 *   3. Pressing play shows an explanation instead of the real player.
 *
 * The sample entries carry deliberately generic titles and no real video
 * IDs, so nothing here can be mistaken for a description of an actual film.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = (n) => readFile(join(root, "src", n), "utf8");

const fonts = process.env.TKPUB_FONTS ? await readFile(process.env.TKPUB_FONTS, "utf8") : "";
const [markupRaw, css, js] = await Promise.all([
  src("videos-markup.html"), src("videos.css"), src("videos.js"),
]);

const markup = markupRaw.replace(
  'id="tkvid-admin" class="tkvid-admin"',
  'id="tkvid-admin" class="tkvid-admin" data-force-admin'
);

/* The originals are print-sized. Downscaling to thumbnail width through
   Chromium keeps the whole preview page around a third of a megabyte
   instead of one and a half. */
async function thumbnails(files) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();
  const out = {};
  for (const [key, file] of Object.entries(files)) {
    const raw = await readFile(join(root, "assets", "images", file));
    out[key] = await page.evaluate(async (src) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const w = 640, h = Math.round((w / im.width) * im.height);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(im, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.72);
    }, `data:image/jpeg;base64,${raw.toString("base64")}`);
  }
  await browser.close();
  return out;
}

const PHOTO = await thumbnails({
  youth: "youth-workshop.jpg",
  police: "police-training.jpg",
  pfan: "pfan-summit.jpg",
  border: "border-session.jpg",
});

/* ---- sample videos ----------------------------------------------------- */

const SAMPLES = [
  { t: "Ending Human Trafficking Begins With You and Me", ty: "Awareness Video",
    th: ["Prevention", "Advocacy"], dur: "4:53", f: true, ph: "pfan",
    s: "An introduction to the network, the four Ps, and what any parish or school can do first." },
  { t: "Know the Signs: How Recruiters Approach Students", ty: "Training",
    th: ["Prevention", "Digital Safety"], dur: "12:04", ph: "youth",
    s: "A facilitator walks through the recruitment patterns now targeting educated young people." },
  { t: "Sensitising Border Officers at Taveta", ty: "Event Highlights",
    th: ["Protection", "Partnership"], dur: "6:41", ph: "police",
    s: "Highlights from the border police sessions in Kwale and Taita Taveta counties." },
  { t: "A Reflection for Bakhita Day", ty: "Prayer & Reflection",
    th: ["Prayer", "Faith Formation"], dur: "1:20", ph: "border",
    s: "A short reflection for parishes marking 8 February." },
  { t: "Working With County Governments", ty: "Interview",
    th: ["Advocacy", "Partnership"], dur: "9:12", ph: "pfan",
    s: "What it takes to open and keep a working relationship with county officials." },
  { t: "Community Facilitators in Their Own Words", ty: "Testimony",
    th: ["Prevention", "Youth & Schools"], dur: "7:38", ph: "youth",
    s: "Facilitators describe running awareness sessions in their own communities." },
];

const posts = SAMPLES.map((s, i) => {
  const d = new Date(Date.UTC(2026, 6 - i, 9 + ((i * 3) % 18)));
  return {
    id: 400 + i,
    slug: s.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 46),
    status: "publish",
    date: d.toISOString(),
    title: { rendered: s.t },
    excerpt: { rendered: `<p>${s.s}</p>` },
    content: {
      rendered: `<!--TKVID:${JSON.stringify({
        url: `https://www.youtube.com/watch?v=SAMPLE${i}`,
        dur: s.dur, featured: !!s.f, date: d.toISOString().slice(0, 10),
      })}-->\n<p>${s.s}</p>`,
    },
    _embedded: {
      "wp:term": [
        [{ id: 1, taxonomy: "category", name: "Videos", slug: "videos", parent: 0 },
         { id: 30 + i, taxonomy: "category", name: s.ty, slug: s.ty.toLowerCase().replace(/\W+/g, "-"), parent: 1 }],
        s.th.map((t, j) => ({ id: 40 + j, taxonomy: "post_tag", name: t, slug: t.toLowerCase().replace(/\W+/g, "-") })),
      ],
    },
    __photo: s.ph,
  };
});

const photoBySlug = {};
posts.forEach((p) => { photoBySlug[p.slug] = PHOTO[p.__photo]; delete p.__photo; });

/* ---- preview-only behaviour -------------------------------------------- */

const previewScript = `
(function () {
  var V = ${JSON.stringify(posts)};
  var PHOTO = ${JSON.stringify(photoBySlug)};

  window.fetch = function (url) {
    var u = String(url), body = [];
    if (u.indexOf("/categories") > -1) body = [{ id: 1, name: "Videos", slug: "videos", parent: 0 }];
    else if (u.indexOf("/users/me") > -1) body = { id: 4, name: "Sr. Agnes (sample)", capabilities: { edit_posts: true, publish_posts: true } };
    else if (u.indexOf("/posts") > -1) body = V;
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" } }));
  };

  /* On the live site the thumbnail comes straight from YouTube. There is no
     network here, so the organisation's own photographs stand in. */
  function swapThumbs() {
    document.querySelectorAll(".tkvid-thumb[data-play]").forEach(function (b) {
      var photo = PHOTO[b.getAttribute("data-play")];
      if (!photo) return;
      var img = b.querySelector("img");
      if (img && img.src.indexOf("data:") !== 0) img.src = photo;
    });
  }
  new MutationObserver(swapThumbs).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", swapThumbs);

  /* Intercept play before the page's own handler so the preview can explain
     itself rather than showing a blocked iframe. */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-play]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();

    var card = b.closest(".tkvid-card");
    var title = card ? (card.querySelector("h3") || {}).textContent : "";
    var meta = card ? (card.querySelector(".tkvid-meta") || {}).textContent : "";
    var modal = document.getElementById("tkvid-modal");
    document.getElementById("tkvid-ptitle").textContent = title || "Sample video";
    document.getElementById("tkvid-pmeta").textContent = (meta || "").trim();
    document.getElementById("tkvid-pout").style.display = "none";
    document.getElementById("tkvid-frame").innerHTML =
      '<div class="pv-mock">' +
        '<span class="pv-mock-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5Z"/></svg></span>' +
        '<b>The video plays right here</b>' +
        '<span>On the live page this is the real YouTube player, full width on a phone. ' +
        'This preview has no network access, so it shows this instead.</span>' +
      '</div>';
    modal.classList.add("is-open");
    document.body.classList.add("tkvid-locked");
  }, true);
})();
`;

/* ---- page --------------------------------------------------------------- */

const chrome = `
:root {
  --pv-ground:#efebe6; --pv-ground-2:#e4ded7; --pv-ink:#241f1b; --pv-dim:#6d635b;
  --pv-line:#d6cec5; --pv-accent:#F74F22; --pv-gold:#FFAC00; --pv-chrome:#fff;
}
@media (prefers-color-scheme: dark) {
  :root { --pv-ground:#17140f; --pv-ground-2:#221d17; --pv-ink:#f2ece5;
          --pv-dim:#a3988c; --pv-line:#342d25; --pv-chrome:#241f19; }
}
:root[data-theme="dark"] { --pv-ground:#17140f; --pv-ground-2:#221d17; --pv-ink:#f2ece5;
  --pv-dim:#a3988c; --pv-line:#342d25; --pv-chrome:#241f19; }
:root[data-theme="light"] { --pv-ground:#efebe6; --pv-ground-2:#e4ded7; --pv-ink:#241f1b;
  --pv-dim:#6d635b; --pv-line:#d6cec5; --pv-chrome:#fff; }

body {
  margin:0; background:var(--pv-ground); color:var(--pv-ink);
  font-family:"Nunito Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  line-height:1.7; -webkit-font-smoothing:antialiased;
}
.pv-wrap { max-width:1240px; margin:0 auto; padding:44px 20px 72px; }
.pv-intro { max-width:74ch; margin-bottom:30px; }
.pv-eyebrow {
  display:inline-flex; align-items:center; gap:9px;
  font-family:"Quicksand",sans-serif; font-weight:700; font-size:12px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--pv-accent); margin-bottom:14px;
}
.pv-eyebrow::before { content:""; width:26px; height:3px; border-radius:2px;
  background:linear-gradient(90deg,var(--pv-accent),var(--pv-gold)); }
.pv-intro h1 {
  font-family:"Quicksand",sans-serif; font-weight:700;
  font-size:clamp(30px,4.4vw,46px); line-height:1.12; letter-spacing:-.02em;
  margin:0 0 12px; text-wrap:balance; color:var(--pv-ink);
}
.pv-intro p { margin:0 0 10px; color:var(--pv-dim); font-size:17px; }
.pv-intro b { color:var(--pv-ink); }
.pv-try { display:flex; flex-wrap:wrap; gap:8px; margin:22px 0 0; padding:0; list-style:none; }
.pv-try li { font-size:13.5px; font-weight:600; background:var(--pv-ground-2);
  color:var(--pv-dim); border:1px solid var(--pv-line); padding:7px 14px; border-radius:28px; }
.pv-try li b { color:var(--pv-accent); }

.pv-frame { border-radius:16px; overflow:hidden; background:var(--pv-chrome);
  border:1px solid var(--pv-line);
  box-shadow:0 40px 80px -40px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.06); }
.pv-bar { display:flex; align-items:center; gap:14px; padding:12px 16px;
  background:var(--pv-ground-2); border-bottom:1px solid var(--pv-line); }
.pv-dots { display:flex; gap:7px; flex-shrink:0; }
.pv-dots i { width:11px; height:11px; border-radius:50%; background:var(--pv-line); display:block; }
.pv-url { flex:1; min-width:0; background:var(--pv-chrome); border:1px solid var(--pv-line);
  border-radius:20px; padding:6px 15px; font-size:13px; color:var(--pv-dim);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pv-url b { color:var(--pv-ink); font-weight:600; }
.pv-screen { background:#fff; padding:34px 30px 44px; }
.pv-screen .tkvid { color-scheme:light; }

.pv-foot { margin-top:30px; display:grid;
  grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:18px; }
.pv-card { background:var(--pv-ground-2); border:1px solid var(--pv-line);
  border-radius:12px; padding:18px 20px; }
.pv-card h2 { font-family:"Quicksand",sans-serif; font-weight:700; font-size:15px;
  margin:0 0 7px; color:var(--pv-ink); }
.pv-card p { margin:0; font-size:14px; color:var(--pv-dim); }
.pv-card p + p { margin-top:8px; }

/* Stand-in for the real player. */
.pv-mock { position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:10px; text-align:center;
  padding:24px; background:linear-gradient(140deg,#2a2422,#151110); color:#fff; }
.pv-mock-play { width:60px; height:60px; border-radius:50%; background:var(--pv-accent);
  display:grid; place-items:center; }
.pv-mock-play svg { width:24px; height:24px; margin-left:3px; }
.pv-mock b { font-family:"Quicksand",sans-serif; font-size:16px; }
.pv-mock span { font-size:13px; color:rgba(255,255,255,.7); max-width:44ch; line-height:1.5; }

@media (max-width:640px) {
  .pv-wrap { padding:20px 10px 40px; }
  .pv-intro { margin-bottom:18px; }
  .pv-intro h1 { font-size:27px; line-height:1.16; margin-bottom:8px; }
  .pv-intro p { font-size:14.5px; line-height:1.5; margin-bottom:8px; }
  .pv-try { gap:6px; margin-top:14px; }
  .pv-try li { font-size:12px; padding:6px 11px; }
  .pv-screen { padding:14px 10px 24px; }
  .pv-frame { border-radius:10px; }
  .pv-dots { display:none; }
  .pv-bar { padding:9px 11px; }
  .pv-url { font-size:11.5px; }
  .pv-foot { margin-top:20px; gap:12px; }
  .pv-card { padding:14px 16px; }
}
`;

const asciiHtml = (s) => s.replace(/[^\x00-\x7F]/g, (c) => "&#" + c.codePointAt(0) + ";");
const asciiJs = (s) => s.replace(/[^\x00-\x7F]/g, (c) => {
  const cp = c.codePointAt(0);
  return cp > 0xffff ? "\\u{" + cp.toString(16) + "}" : "\\u" + cp.toString(16).padStart(4, "0");
});

const html = `<title>Videos &#8212; design preview for Talitha Kum Kenya</title>

<style>
${fonts}
</style>

<style>
${chrome}
</style>

<style>
${css.trim()}
</style>

<div class="pv-wrap">
  <div class="pv-intro">
    <span class="pv-eyebrow">Design preview</span>
    <h1>A videos page for Talitha Kum Kenya</h1>
    <p>
      The working page &#8212; search, filters and the player are live. Built
      light on purpose: <b>55&#160;KB against the publications page's 173&#160;KB</b>,
      and no YouTube code loads at all until someone presses play.
    </p>
    <p>
      Six <b>sample entries</b> with deliberately generic titles. Thumbnails
      here are the organisation's own photographs; on the live site YouTube
      supplies them automatically from the link.
    </p>
    <ul class="pv-try">
      <li><b>Press play</b> on any card</li>
      <li><b>Filter</b> by type</li>
      <li><b>Search</b> for "border"</li>
      <li><b>Open panel</b> to add one</li>
    </ul>
  </div>

  <div class="pv-frame">
    <div class="pv-bar">
      <span class="pv-dots"><i></i><i></i><i></i></span>
      <span class="pv-url">talithakumraht.org/<b>videos</b></span>
    </div>
    <div class="pv-screen">
${asciiHtml(markup.trim())}
    </div>
  </div>

  <div class="pv-foot">
    <div class="pv-card">
      <h2>Adding a video takes one field</h2>
      <p>Paste the YouTube or Vimeo link. The title, thumbnail and player all
         follow from it &#8212; nothing is uploaded and no cover is needed.</p>
      <p>The panel shows you the thumbnail as you paste, so a wrong link is
         obvious before you publish.</p>
    </div>
    <div class="pv-card">
      <h2>Filed the same way as documents</h2>
      <p>One <b>type</b>, one to three <b>themes</b> led by the four Ps, and
         free <b>keywords</b>. Staff learn the system once.</p>
      <p>Types here are video-specific: awareness, testimony, training, event
         highlights, interview, reflection, documentary.</p>
    </div>
    <div class="pv-card">
      <h2>Why it stays fast</h2>
      <p>A video is a link, so the page carries only thumbnails. The player
         iframe is created on the tap that plays it and destroyed on close.</p>
      <p>YouTube is loaded from its no-cookie host, so nothing tracks a
         visitor who never presses play.</p>
    </div>
  </div>
</div>

<script>
${asciiJs(js.replace(/<\/script>/gi, "<\\/script>").trim())}
</script>

<script>
${asciiJs(previewScript.replace(/<\/script>/gi, "<\\/script>").trim())}
</script>
`;

await mkdir(join(root, "preview"), { recursive: true });
await writeFile(join(root, "preview", "videos-preview.html"), html, "utf8");
console.log(`built preview/videos-preview.html  ${(Buffer.byteLength(html, "utf8") / 1024).toFixed(0)} KB`);
