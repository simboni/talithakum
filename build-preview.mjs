/**
 * Builds a self-contained design preview of the publications page.
 *
 *   node build-preview.mjs
 *
 * Output: preview/publications-preview.html
 *
 * The preview uses the real CSS, markup and JavaScript from src/ — it is the
 * actual page, not a mockup of it. Only three things are swapped:
 *
 *   1. fetch() is stubbed, so it reads sample publications instead of talking
 *      to WordPress.
 *   2. CONFIG.renderer is set, so the reader draws a representative document
 *      page instead of loading pdf.js (the preview has to run with no network
 *      access at all).
 *   3. The admin panel is forced visible, since there is no WordPress session
 *      to mark the viewer as logged in.
 *
 * The theme's real fonts are embedded as data URIs so the type is accurate.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = (n) => readFile(join(root, "src", n), "utf8");

const FONTS_CSS = process.env.TKPUB_FONTS || "";

const [markupRaw, css, publicJs, adminJs] = await Promise.all([
  src("markup.html"), src("publications.css"), src("publications.js"), src("admin.js"),
]);

const fonts = FONTS_CSS ? await readFile(FONTS_CSS, "utf8") : "";

/* The preview has no WordPress session, so the panel is shown explicitly. */
const markup = markupRaw.replace(
  'id="tkpub-admin" class="tkpub-admin"',
  'id="tkpub-admin" class="tkpub-admin" data-force-admin'
);

/* ---------------------------------------------------------------- */
/* Sample publications — illustrative, not real RAHT documents       */
/* ---------------------------------------------------------------- */

const SAMPLES = [
  { t: "Annual Report 2025: The Four Ps in Action", ty: "Annual Report", th: ["Prevention", "Partnership"], p: 48, kb: 4200, f: true,
    s: "A full year of anti-trafficking work across member congregations, organised around the four Ps. Covers awareness reach, survivor referrals, partnerships with county governments, and the network's priorities for the year ahead." },
  { t: "Recruitment Patterns on Social Media: A Field Scan", ty: "Research & Data", th: ["Prevention", "Digital Safety"], p: 24, kb: 2100,
    s: "How recruiters approach young people through messaging apps and job pages, based on a scan of reported cases. Sets out the common scripts used, the platforms involved, and the warning signs parishes and schools can watch for." },
  { t: "Safe Migration Briefing for Parish Teams", ty: "Policy Brief", th: ["Safe Migration", "Advocacy"], p: 12, kb: 980,
    s: "A short brief for parish teams supporting people preparing to travel for work abroad. Explains contract red flags, the documents a genuine agency must provide, and where to verify a recruitment licence before anyone signs." },
  { t: "Bakhita Day Prayer and Reflection Guide", ty: "Prayer & Reflection", th: ["Prayer", "Faith Formation"], p: 16, kb: 1400,
    s: "A guide for parishes and communities marking the International Day of Prayer and Awareness against Human Trafficking on 8 February, with readings, intercessions and reflection questions for small groups." },
  { t: "Community Facilitator Training Manual", ty: "Training Manual", th: ["Prevention", "Youth & Schools"], p: 86, kb: 6800,
    s: "The full curriculum used to prepare community facilitators to run awareness sessions, covering session plans, discussion prompts, safeguarding rules, and how to respond when a participant discloses an experience." },
  { t: "Network Newsletter: July 2026", ty: "Newsletter", th: ["Partnership"], p: 8, kb: 1900,
    s: "News from across the network this month, including new member congregations, a summary of the county-level advocacy meetings, and dates for upcoming training in the coast and western regions." },
  { t: "Identifying Labour Exploitation in Domestic Work", ty: "Awareness Material", th: ["Labour Exploitation", "Protection"], p: 4, kb: 640,
    s: "A plain-language explainer for communities on the warning signs of exploitation in domestic work, what the law protects, and the numbers to call for confidential help and referral." },
  { t: "Survivor Care Standards: Working Draft", ty: "Policy Brief", th: ["Survivor Care", "Protection"], p: 20, kb: 1250,
    s: "A working draft of shared standards for member congregations receiving survivors, covering consent, confidentiality, referral pathways, and the boundary between pastoral accompaniment and professional care." },
  { t: "Statement on Cross-Border Trafficking Routes", ty: "Press Release", th: ["Advocacy", "Partnership"], p: 2, kb: 320,
    s: "The network's public statement following the regional consultation, calling for coordinated screening at border points and sustained funding for the shelters that receive people intercepted in transit." },
  { t: "Mwongozo wa Uhamasishaji kwa Jamii", ty: "Awareness Material", th: ["Prevention", "Youth & Schools"], p: 10, kb: 870, lang: "sw",
    s: "Mwongozo wa Kiswahili kwa vikundi vya jamii unaoeleza dalili za biashara haramu ya binadamu, jinsi ya kujilinda, na mahali pa kupata msaada wa siri katika ngazi ya kaunti." },
  { t: "Schools Outreach Report: Coast Region", ty: "Research & Data", th: ["Youth & Schools", "Prevention"], p: 32, kb: 2900,
    s: "Findings from a term of school outreach in the coast region, including what pupils already knew about trafficking risk, which messages held their attention, and what teachers asked for next." },
  { t: "Working with County Governments: A Practical Guide", ty: "Training Manual", th: ["Advocacy", "Partnership"], p: 28, kb: 2400,
    s: "How member congregations can open and sustain a working relationship with county officials, with sample letters, meeting agendas and a one-page brief that can be left behind after a first meeting." },
];

const posts = SAMPLES.map((s, i) => {
  const d = new Date(Date.UTC(2026, 6 - i, 8 + ((i * 3) % 20)));
  return {
    id: 100 + i,
    slug: s.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48),
    status: "publish",
    date: d.toISOString(),
    link: "#",
    title: { rendered: s.t },
    excerpt: { rendered: "<p>" + s.s + "</p>" },
    content: {
      rendered: "<!--TKPUB:" + JSON.stringify({
        v: 1, pdf: "#sample.pdf", pdfId: 0, pages: s.p, size: s.kb * 1024,
        lang: s.lang || "en", issuer: "Talitha Kum Kenya", featured: !!s.f,
        date: d.toISOString().slice(0, 10),
      }) + "-->\n<p>" + s.s + "</p>",
    },
    _embedded: {
      "wp:term": [
        [{ id: 1, taxonomy: "category", name: "Publications", slug: "publications", parent: 0 },
         { id: 10 + i, taxonomy: "category", name: s.ty, slug: s.ty.toLowerCase().replace(/\W+/g, "-"), parent: 1 }],
        s.th.map((t, j) => ({ id: 200 + j, taxonomy: "post_tag", name: t, slug: t.toLowerCase().replace(/\W+/g, "-") })),
      ],
    },
  };
});

/* ---------------------------------------------------------------- */
/* Preview-only behaviour                                            */
/* ---------------------------------------------------------------- */

const previewScript = `
(function () {
  var FIXTURE = ${JSON.stringify(posts)};

  /* --- stubbed WordPress ------------------------------------------------ */
  window.fetch = function (url) {
    var u = String(url), body = [], headers = { "Content-Type": "application/json" };
    if (u.indexOf("/categories") > -1) {
      body = [{ id: 1, name: "Publications", slug: "publications", parent: 0 }];
      headers["X-WP-TotalPages"] = "1";
    } else if (u.indexOf("/posts") > -1) {
      body = FIXTURE; headers["X-WP-TotalPages"] = "1";
    } else if (u.indexOf("/users/me") > -1) {
      body = { id: 3, name: "Sr. Agnes (sample)", capabilities: { edit_posts: true, publish_posts: true } };
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: headers }));
  };

  /* --- reader ------------------------------------------------------------
     The live page renders the real PDF with pdf.js. This preview has no
     network access, so it draws a representative page instead. Every control
     around it - paging, zoom, download, copy link - is the real thing.       */

  var scale = 1, current = 1, wired = false;

  function docPage(pub, n) {
    var lines = pub.summary.split(/(?<=\\.)\\s+/).filter(Boolean);
    var body = "";
    for (var i = 0; i < 8; i++) {
      var w = [96, 92, 99, 88, 94, 90, 97, 64][i];
      body += '<span class="pv-line" style="width:' + w + '%"></span>';
    }
    return '<div class="pv-page">' +
      (n === 1
        ? '<div class="pv-page-head">' +
            '<span class="pv-kicker">' + pub.type + '</span>' +
            '<h4>' + pub.title + '</h4>' +
            '<span class="pv-rule"></span>' +
            '<p>' + (lines[0] || pub.summary) + '</p>' +
          '</div>'
        : '<div class="pv-page-head is-cont"><span class="pv-kicker">Section ' + n + '</span>' +
          '<span class="pv-rule"></span></div>') +
      '<div class="pv-body">' + body + '</div>' +
      '<div class="pv-body">' + body + '</div>' +
      '<div class="pv-body">' + body + '</div>' +
      '<div class="pv-page-foot"><span>Talitha Kum Kenya</span><span>' + n + '</span></div>' +
      '</div>';
  }

  function draw(ctx) {
    var pub = ctx.pub;
    var total = Math.min(pub.pages || 4, 6);
    ctx.setPager(true, total);
    ctx.stage.className = "tkpub-modal-stage";
    var html = '<div class="pv-note">Design preview &mdash; on the live site this is the real PDF, ' +
      'rendered in the page. Paging, zoom and download all work here.</div>';
    for (var i = 1; i <= total; i++) html += docPage(pub, i);
    ctx.stage.innerHTML = html;
    scale = 1; current = 1;
    apply(ctx.stage);

    if (wired) return;
    wired = true;
    var modal = ctx.modal;
    modal.addEventListener("click", function (ev) {
      var t = ev.target.closest("button");
      if (!t) return;
      var stage = modal.querySelector("#tkpub-stage");
      var pages = stage.querySelectorAll(".pv-page");
      if (!pages.length) return;
      if (t.hasAttribute("data-next")) go(stage, pages, current + 1);
      else if (t.hasAttribute("data-prev")) go(stage, pages, current - 1);
      else if (t.hasAttribute("data-zoomin")) { scale = Math.min(scale + 0.25, 2); apply(stage); }
      else if (t.hasAttribute("data-zoomout")) { scale = Math.max(scale - 0.25, 0.5); apply(stage); }
    });
  }

  function go(stage, pages, n) {
    n = Math.min(Math.max(1, n), pages.length);
    current = n;
    pages[n - 1].scrollIntoView({ behavior: "smooth", block: "start" });
    var input = stage.closest(".tkpub-modal-panel").querySelector(".tkpub-pager input");
    if (input) input.value = String(n);
  }

  function apply(stage) {
    stage.style.setProperty("--pv-scale", scale);
    var label = stage.closest(".tkpub-modal-panel").querySelector(".tkpub-zoomlevel");
    if (label) label.textContent = Math.round(scale * 100) + "%";
  }

  window.TKPUB.config.pdfjs = null;
  window.TKPUB.config.renderer = draw;
})();
`;

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

const chrome = `
:root {
  --pv-ground: #efebe6;
  --pv-ground-2: #e4ded7;
  --pv-ink: #241f1b;
  --pv-dim: #6d635b;
  --pv-line: #d6cec5;
  --pv-accent: #F74F22;
  --pv-gold: #FFAC00;
  --pv-chrome: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --pv-ground: #17140f;
    --pv-ground-2: #221d17;
    --pv-ink: #f2ece5;
    --pv-dim: #a3988c;
    --pv-line: #342d25;
    --pv-chrome: #241f19;
  }
}
:root[data-theme="dark"] {
  --pv-ground: #17140f; --pv-ground-2: #221d17; --pv-ink: #f2ece5;
  --pv-dim: #a3988c; --pv-line: #342d25; --pv-chrome: #241f19;
}
:root[data-theme="light"] {
  --pv-ground: #efebe6; --pv-ground-2: #e4ded7; --pv-ink: #241f1b;
  --pv-dim: #6d635b; --pv-line: #d6cec5; --pv-chrome: #ffffff;
}

body {
  margin: 0;
  background: var(--pv-ground);
  color: var(--pv-ink);
  font-family: "Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

.pv-wrap { max-width: 1240px; margin: 0 auto; padding: 44px 20px 72px; }

.pv-intro { max-width: 74ch; margin-bottom: 30px; }
.pv-eyebrow {
  display: inline-flex; align-items: center; gap: 9px;
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--pv-accent);
  margin-bottom: 14px;
}
.pv-eyebrow::before {
  content: ""; width: 26px; height: 3px; border-radius: 2px;
  background: linear-gradient(90deg, var(--pv-accent), var(--pv-gold));
}
.pv-intro h1 {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: clamp(30px, 4.4vw, 46px);
  line-height: 1.12; letter-spacing: -.02em;
  margin: 0 0 12px; text-wrap: balance;
  color: var(--pv-ink);
}
.pv-intro p { margin: 0 0 10px; color: var(--pv-dim); font-size: 17px; }
.pv-intro b { color: var(--pv-ink); font-weight: 700; }

.pv-try {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin: 22px 0 0; padding: 0; list-style: none;
}
.pv-try li {
  font-size: 13.5px; font-weight: 600;
  background: var(--pv-ground-2); color: var(--pv-dim);
  border: 1px solid var(--pv-line);
  padding: 7px 14px; border-radius: 28px;
}
.pv-try li b { color: var(--pv-accent); font-weight: 700; }

/* Browser frame ------------------------------------------------------- */
.pv-frame {
  border-radius: 16px;
  overflow: hidden;
  background: var(--pv-chrome);
  border: 1px solid var(--pv-line);
  box-shadow: 0 40px 80px -40px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.06);
}
.pv-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 16px;
  background: var(--pv-ground-2);
  border-bottom: 1px solid var(--pv-line);
}
.pv-dots { display: flex; gap: 7px; flex-shrink: 0; }
.pv-dots i { width: 11px; height: 11px; border-radius: 50%; background: var(--pv-line); display: block; }
.pv-url {
  flex: 1; min-width: 0;
  background: var(--pv-chrome);
  border: 1px solid var(--pv-line);
  border-radius: 20px;
  padding: 6px 15px;
  font-size: 13px; color: var(--pv-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: "Nunito Sans", sans-serif;
}
.pv-url b { color: var(--pv-ink); font-weight: 600; }
.pv-screen { background: #fff; padding: 34px 30px 44px; }

/* The page itself is always light — it previews a light WordPress site. */
.pv-screen .tkpub { color-scheme: light; }

.pv-foot {
  margin-top: 30px;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}
.pv-card {
  background: var(--pv-ground-2);
  border: 1px solid var(--pv-line);
  border-radius: 12px;
  padding: 18px 20px;
}
.pv-card h2 {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 15px; margin: 0 0 7px; color: var(--pv-ink);
}
.pv-card p { margin: 0; font-size: 14px; color: var(--pv-dim); }
.pv-card p + p { margin-top: 8px; }

/* Mock document pages inside the reader -------------------------------- */
#tkpub-stage { --pv-scale: 1; }
.pv-note {
  background: rgba(255,255,255,.14);
  border: 1px solid rgba(255,255,255,.22);
  color: #fff;
  font-size: 12.5px; line-height: 1.55;
  padding: 9px 14px; border-radius: 8px;
  max-width: 560px; text-align: center;
}
.pv-page {
  width: calc(620px * var(--pv-scale));
  max-width: 100%;
  aspect-ratio: 1 / 1.414;
  background: #fff;
  box-shadow: 0 6px 22px rgba(0,0,0,.32);
  border-radius: 2px;
  padding: calc(52px * var(--pv-scale)) calc(56px * var(--pv-scale));
  display: flex; flex-direction: column;
  flex-shrink: 0;
  font-size: calc(13px * var(--pv-scale));
}
.pv-kicker {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: .78em; letter-spacing: .12em; text-transform: uppercase;
  color: #F74F22;
}
.pv-page h4 {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 1.75em; line-height: 1.2; color: #232323;
  margin: .4em 0 .5em; text-wrap: balance;
}
.pv-rule {
  display: block; height: 3px; width: 64px;
  background: #FFAC00; border-radius: 2px;
  margin-top: 1.1em;
}
.pv-page-head p { margin: 1.2em 0 0; color: #616161; font-size: 1em; line-height: 1.75; }
.pv-page-head.is-cont { margin-bottom: 1.4em; }
.pv-body { margin-top: 1.6em; display: flex; flex-direction: column; gap: .62em; }
.pv-line { display: block; height: .58em; border-radius: 3px; background: #e9e5e1; }
.pv-page-foot {
  margin-top: auto; padding-top: 1.4em;
  display: flex; justify-content: space-between;
  font-size: .76em; color: #a9a29b; letter-spacing: .04em;
}

/* On a phone the framing is not the point — the page is. Everything above
   the browser frame is compressed so the real thing is reachable in one
   short scroll, which is also how the audience will meet it. */
@media (max-width: 640px) {
  .pv-wrap { padding: 20px 10px 40px; }
  .pv-intro { margin-bottom: 18px; }
  .pv-intro h1 { font-size: 27px; line-height: 1.16; margin-bottom: 8px; }
  .pv-intro p { font-size: 14.5px; line-height: 1.5; margin-bottom: 8px; }
  .pv-eyebrow { margin-bottom: 10px; font-size: 11px; }
  .pv-try { gap: 6px; margin-top: 14px; }
  .pv-try li { font-size: 12px; padding: 6px 11px; }
  .pv-screen { padding: 14px 10px 24px; }
  .pv-frame { border-radius: 10px; }
  .pv-bar { padding: 9px 11px; gap: 10px; }
  .pv-url { font-size: 11.5px; padding: 5px 11px; }
  .pv-dots { display: none; }          /* pure decoration, and it costs width */
  .pv-foot { margin-top: 20px; gap: 12px; }
  .pv-card { padding: 14px 16px; }
  .pv-card p { font-size: 13.5px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; }
}
`;

/* The artifact host owns <head>, so this page cannot declare its own charset.
   Escaping every non-ASCII character makes the output pure ASCII, which
   renders identically no matter what encoding the page is served as. */
const asciiHtml = (s) => s.replace(/[^\x00-\x7F]/g, (c) => "&#" + c.codePointAt(0) + ";");
const asciiJs = (s) => s.replace(/[^\x00-\x7F]/g, (c) => {
  const cp = c.codePointAt(0);
  return cp > 0xffff
    ? "\\u{" + cp.toString(16) + "}"
    : "\\u" + cp.toString(16).padStart(4, "0");
});

const html = `<title>Publications &#8212; design preview for Talitha Kum Kenya</title>

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
    <h1>A publications library for Talitha Kum Kenya</h1>
    <p>
      This is the working page, not a picture of one &#8212; search, filters and the
      document reader are all live. Best viewed on a phone, which is where
      almost all of its readers will be.
    </p>
    <p>
      The twelve documents are <b>sample content</b>, and the reader draws a
      representative page rather than a real PDF because this preview runs with
      no network access.
    </p>
    <ul class="pv-try">
      <li><b>Search</b> for "migration"</li>
      <li><b>Filter</b> by type, then stack a theme on top</li>
      <li><b>Read</b> any document in the page</li>
      <li><b>Switch</b> to list view</li>
      <li><b>Open panel</b> to see what staff see</li>
    </ul>
  </div>

  <div class="pv-frame">
    <div class="pv-bar">
      <span class="pv-dots"><i></i><i></i><i></i></span>
      <span class="pv-url">talithakumraht.org/<b>publications</b></span>
    </div>
    <div class="pv-screen">
${asciiHtml(markup.trim())}
    </div>
  </div>

  <div class="pv-foot">
    <div class="pv-card">
      <h2>What staff do</h2>
      <p>
        The orange panel above the page is only drawn for signed-in staff. In this
        preview it is unlocked so you can see it; sign in with anything.
      </p>
      <p>
        On the live site it needs a WordPress username and an Application Password,
        and the account has to be allowed to publish.
      </p>
    </div>
    <div class="pv-card">
      <h2>How a document is filed</h2>
      <p>
        One <b>type</b> (what kind of document it is), one to three <b>themes</b>
        (what it is about, led by the four Ps), and free <b>keywords</b> for places
        and partners.
      </p>
      <p>Type and theme become the filter rows; keywords feed the search.</p>
    </div>
    <div class="pv-card">
      <h2>Sharing a document</h2>
      <p>
        Opening a document changes the address bar, so the link you copy opens
        that document directly for whoever you send it to.
      </p>
      <p>Every document can also be downloaded, and the reader works on a phone.</p>
    </div>
  </div>

</div>

<script>
${asciiJs(publicJs.replace(/<\/script>/gi, "<\\/script>").trim())}
</script>

<script>
${asciiJs(adminJs.replace(/<\/script>/gi, "<\\/script>").trim())}
</script>

<script>
${asciiJs(previewScript.replace(/<\/script>/gi, "<\\/script>").trim())}
</script>
`;

await mkdir(join(root, "preview"), { recursive: true });
await writeFile(join(root, "preview", "publications-preview.html"), html, "utf8");
console.log(
  "built preview/publications-preview.html  " +
  (Buffer.byteLength(html, "utf8") / 1024).toFixed(0) + " KB" +
  (fonts ? "" : "  (no fonts embedded — set TKPUB_FONTS to a css file)")
);
