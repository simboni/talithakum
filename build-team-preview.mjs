/**
 * Self-contained design preview of the team page.
 *
 *   TKPUB_FONTS=/path/to/fonts.css node build-team-preview.mjs
 *
 * Output: preview/team-preview.html
 *
 * Uses the real src/ files and the real board, cropped by
 * tools/crop-portraits.mjs from the photographs the client sent. Two things
 * are swapped, both because the preview must run with no network at all:
 *   1. fetch() is stubbed with the entries below.
 *   2. Portraits are embedded as data URIs rather than loaded from the
 *      media library, which is where they live on the real site.
 *
 * The staff section is deliberately unnamed: those people have not been
 * given to us, and inventing them would put made-up names next to real ones.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = (n) => readFile(join(root, "src", n), "utf8");

const fonts = process.env.TKPUB_FONTS ? await readFile(process.env.TKPUB_FONTS, "utf8") : "";
const [markupRaw, css, js] = await Promise.all([
  src("team-markup.html"), src("team.css"), src("team.js"),
]);

const markup = markupRaw.replace(
  'id="tkteam-admin" class="tkteam-admin"',
  'id="tkteam-admin" class="tkteam-admin" data-force-admin'
);

/* The crops are 720x900. A card shows one at about 250px, so 460px covers a
   retina phone and keeps the whole preview around a third of a megabyte. */
async function portraits() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();
  const dir = join(root, "assets", "team");
  const out = {};
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg"))) {
    const raw = await readFile(join(dir, file));
    out[file.replace(/\.jpg$/, "")] = await page.evaluate(async (s) => {
      const im = new Image();
      im.src = s;
      await im.decode();
      const w = 460, h = Math.round((w / im.width) * im.height);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(im, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.72);
    }, `data:image/jpeg;base64,${raw.toString("base64")}`);
  }
  await browser.close();
  return out;
}

const PHOTO = await portraits();

/* ---- the board, from the photographs the client sent -------------------- */

const PEOPLE = [
  { n: "Sr. Joyce Nyagucha", r: "Board Vice Chair", g: "Board", o: 20,
    p: "sr-joyce-nyagucha-board-vice-chair" },
  { n: "Sr. Mary Gitau", r: "Board Treasurer", g: "Board", o: 30,
    p: "sr-mary-gitau-board-treasurer" },
  { n: "Sr. Catherine Mutindi", r: "Board Member", g: "Board", o: 50,
    p: "sr-catherine-mutindi-board-member" },
  { n: "Sr. Matilda Baabuo", r: "Board Member", g: "Board", o: 50,
    p: "sr-matilda-baabuo-board-member" },
  { n: "Sr. Pasilisa Namikoye", r: "Board Member", g: "Board", o: 50,
    p: "sr-pasilisa-namikoye-board-member" },
  { n: "Bro. Bernard Juma", r: "Board Member", g: "Board", o: 50,
    p: "bro-bernard-juma-board-member" },
  { n: "Bildad Keke", r: "Board Member", g: "Board", o: 50,
    p: "bildadrd-keke-board-member" },
  /* Placeholders: the roles are real, the names are not ours to invent. */
  { n: "To be added", r: "National Coordinator", g: "Staff", o: 10, p: "",
    b: "This is where a two or three sentence biography appears. Only people " +
       "who have one are clickable, so nobody taps a card and gets nothing." },
  { n: "To be added", r: "Programme Officer", g: "Staff", o: 50, p: "" },
];

const posts = PEOPLE.map((s, i) => ({
  id: 600 + i,
  slug: "person-" + i,
  status: "publish",
  date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString(),
  title: { rendered: s.n },
  excerpt: { rendered: s.b ? `<p>${s.b}</p>` : "" },
  content: {
    rendered: `<!--TKTEAM:${JSON.stringify({ role: s.r, photo: s.p ? PHOTO[s.p] : "", order: s.o })}-->`,
  },
  _embedded: {
    "wp:term": [[
      { id: 1, taxonomy: "category", name: "Team", slug: "team", parent: 0 },
      { id: s.g === "Board" ? 70 : 71, taxonomy: "category", name: s.g,
        slug: s.g.toLowerCase(), parent: 1 },
    ]],
  },
}));

/* ---- preview-only behaviour --------------------------------------------- */

const previewScript = `
(function () {
  var P = ${JSON.stringify(posts)};

  window.fetch = function (url) {
    var u = String(url), body = [];
    if (u.indexOf("/categories") > -1) body = [{ id: 1, name: "Team", slug: "team", parent: 0 }];
    else if (u.indexOf("/users/me") > -1) body = { id: 4, name: "Sr. Agnes (sample)", capabilities: { edit_posts: true, publish_posts: true } };
    else if (u.indexOf("/posts") > -1) body = P;
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" } }));
  };
})();
`;

/* ---- page ---------------------------------------------------------------- */

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
.pv-screen .tkteam { color-scheme:light; }

.pv-foot { margin-top:30px; display:grid;
  grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:18px; }
.pv-card { background:var(--pv-ground-2); border:1px solid var(--pv-line);
  border-radius:12px; padding:18px 20px; }
.pv-card h2 { font-family:"Quicksand",sans-serif; font-weight:700; font-size:15px;
  margin:0 0 7px; color:var(--pv-ink); }
.pv-card p { margin:0; font-size:14px; color:var(--pv-dim); }
.pv-card p + p { margin-top:8px; }
.pv-card.is-flag { background:#fff6e3; border-color:#f0d79a; }
.pv-card.is-flag h2, .pv-card.is-flag p { color:#6b5316; }

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

/* The artifact host owns <head>, so every non-ASCII character is written as
   an entity or an escape. Otherwise the page arrives as mojibake. */
const asciiHtml = (s) => s.replace(/[^\x00-\x7F]/g, (c) => "&#" + c.codePointAt(0) + ";");
const asciiJs = (s) => s.replace(/[^\x00-\x7F]/g, (c) =>
  "\\u" + c.codePointAt(0).toString(16).padStart(4, "0"));

const html = `<title>Team page &#8212; Talitha Kum Kenya</title>
<style>
${fonts}
${chrome}
${asciiHtml(css.trim())}
</style>

<div class="pv-wrap">
  <div class="pv-intro">
    <span class="pv-eyebrow">Design preview</span>
    <h1>A team page for Talitha Kum Kenya</h1>
    <p>
      The working page &#8212; the group filter, the profile and the staff
      panel are all live. <b>51&#160;KB</b>, one request for the people and
      nothing else.
    </p>
    <p>
      The seven board portraits are the photographs you sent, straightened,
      cut out of the paper and cropped to head and shoulders. The staff
      section shows the second group with the names left blank, because
      those are not ours to invent.
    </p>
    <ul class="pv-try">
      <li><b>Filter</b> by Board or Staff</li>
      <li><b>Tap a card</b> with Read more</li>
      <li><b>Open panel</b> to add someone</li>
    </ul>
  </div>

  <div class="pv-frame">
    <div class="pv-bar">
      <span class="pv-dots"><i></i><i></i><i></i></span>
      <span class="pv-url">talithakumraht.org/<b>team</b></span>
    </div>
    <div class="pv-screen">
${asciiHtml(markup.trim())}
    </div>
  </div>

  <div class="pv-foot">
    <div class="pv-card">
      <h2>Adding someone takes a minute</h2>
      <p>Name, designation, group. The photograph can be taken on a phone and
         uploaded straight from the panel &#8212; it lands in the ordinary
         media library.</p>
      <p>Display order puts the chair first and the members after, without
         anybody having to rename anything.</p>
    </div>
    <div class="pv-card">
      <h2>No photograph is not a problem</h2>
      <p>A card with no picture shows the person's initials on a coloured
         panel, and the honorific is left out so Sr. Joyce Nyagucha reads
         JN rather than SJ.</p>
      <p>The same panel sits behind every portrait while it loads, so the
         page never shows a grey hole.</p>
    </div>
    <div class="pv-card is-flag">
      <h2>Two things to check</h2>
      <p><b>Sr. Mary Gitau and Sr. Matilda Baabuo</b> appear to be the same
         photograph under two names. One of them needs the right print.</p>
      <p>The eighth file, the WhatsApp one, has no name on it. Tell me who it
         is and it goes in with the rest.</p>
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
await writeFile(join(root, "preview", "team-preview.html"), html, "utf8");
console.log(`built preview/team-preview.html  ${(Buffer.byteLength(html, "utf8") / 1024).toFixed(0)} KB`);
