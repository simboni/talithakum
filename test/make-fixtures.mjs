/**
 * Builds the offline test fixtures:
 *   - a few real multi-page PDFs, so the reader is exercised for real
 *   - harness.html, which is the built Elementor block with a stubbed
 *     WordPress REST API in front of it
 *
 * Run this once before test/run.mjs:
 *   node make-fixtures.mjs && node run.mjs
 */

import { writeFile, mkdir, readFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "fixtures");

/* ---------------------------------------------------------------- */
/* A minimal but genuinely valid PDF writer                          */
/* ---------------------------------------------------------------- */

function pdf(pages) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  const esc = (s) => s.replace(/([\\()])/g, "\\$1");

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const bodyFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pagesId = objects.length + 1;
  add("PLACEHOLDER_PAGES");

  const pageIds = [];
  for (const page of pages) {
    const lines = [
      "BT /F1 22 Tf 60 760 Td (" + esc(page.title) + ") Tj ET",
      "BT /F2 11 Tf 60 730 Td (" + esc(page.sub) + ") Tj ET",
      "0.07 0.47 0.44 rg 60 715 475 3 re f",
    ];
    page.body.forEach((line, i) => {
      lines.push("BT /F2 12 Tf 60 " + (680 - i * 22) + " Td (" + esc(line) + ") Tj ET");
    });
    lines.push("BT /F2 9 Tf 60 60 Td (" + esc(page.foot) + ") Tj ET");
    const stream = lines.join("\n");
    const contentId = add("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    pageIds.push(add(
      "<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 " + fontId + " 0 R /F2 " + bodyFontId + " 0 R >> >> " +
      "/Contents " + contentId + " 0 R >>"
    ));
  }

  objects[pagesId - 1] =
    "<< /Type /Pages /Kids [" + pageIds.map((i) => i + " 0 R").join(" ") + "] /Count " + pageIds.length + " >>";

  const catalogId = add("<< /Type /Catalog /Pages " + pagesId + " 0 R >>");

  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += (i + 1) + " 0 obj\n" + obj + "\nendobj\n";
  });

  const xrefAt = body.length;
  body += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  offsets.forEach((o) => { body += String(o).padStart(10, "0") + " 00000 n \n"; });
  body += "trailer\n<< /Size " + (objects.length + 1) + " /Root " + catalogId + " 0 R >>\n" +
    "startxref\n" + xrefAt + "\n%%EOF\n";

  return Buffer.from(body, "latin1");
}

function samplePdf(title, sub, pageCount) {
  const pages = [];
  for (let p = 1; p <= pageCount; p++) {
    pages.push({
      title: p === 1 ? title : title + " (cont.)",
      sub: sub,
      body: [
        p === 1 ? "This is sample content used to test the reader." : "Section " + p,
        "",
        "Page " + p + " of " + pageCount + ".",
        "",
        "The four Ps: Prevention, Protection, Partnership, Prayer.",
        "",
        "Lorem ipsum placeholder text for layout testing only.",
      ],
      foot: "SAMPLE DOCUMENT - page " + p + " of " + pageCount,
    });
  }
  return pdf(pages);
}

/* ---------------------------------------------------------------- */
/* Sample publications — illustrative only, not real documents       */
/* ---------------------------------------------------------------- */

const SAMPLES = [
  { t: "Annual Report 2025: Four Ps in Action", ty: "Annual Report", th: ["Prevention", "Partnership"], p: 6, f: true,
    s: "A full year of RAHT Kenya's anti-trafficking work across member congregations, set against the four Ps. Covers awareness reach, survivor referrals, partnerships with county governments, and the network's priorities for the year ahead." },
  { t: "Recruitment Patterns on Social Media: A Field Scan", ty: "Research & Data", th: ["Prevention", "Digital Safety"], p: 5,
    s: "How recruiters approach young people through messaging apps and job pages, based on a scan of reported cases. Sets out the common scripts used, the platforms involved, and what parishes and schools can watch for." },
  { t: "Safe Migration Briefing for Parish Teams", ty: "Policy Brief", th: ["Safe Migration", "Advocacy"], p: 4,
    s: "A short brief for parish teams supporting people preparing to travel for work abroad. Explains contract red flags, the documents a genuine agency must provide, and where to verify a recruitment licence." },
  { t: "Bakhita Day Prayer and Reflection Guide", ty: "Prayer & Reflection", th: ["Prayer", "Faith Formation"], p: 3,
    s: "A guide for parishes and communities marking the International Day of Prayer and Awareness against Human Trafficking on 8 February, with readings, intercessions and reflection questions for small groups." },
  { t: "Community Facilitator Training Manual", ty: "Training Manual", th: ["Prevention", "Youth & Schools"], p: 30,
    s: "The full curriculum used to prepare community facilitators to run awareness sessions, covering session plans, discussion prompts, safeguarding rules and how to respond when a participant discloses an experience." },
  { t: "Network Newsletter: July 2026", ty: "Newsletter", th: ["Partnership"], p: 4,
    s: "News from across the network this month, including new member congregations, a summary of the county-level advocacy meetings, and dates for upcoming training in the coast and western regions." },
  { t: "Identifying Labour Exploitation in Domestic Work", ty: "Awareness Material", th: ["Labour Exploitation", "Protection"], p: 3,
    s: "A plain-language poster and explainer for communities on the warning signs of exploitation in domestic work, what the law protects, and the numbers to call for confidential help and referral." },
  { t: "Survivor Care Standards: Working Draft", ty: "Policy Brief", th: ["Survivor Care", "Protection"], p: 5,
    s: "A working draft of shared standards for member congregations receiving survivors, covering consent, confidentiality, referral pathways and the boundary between pastoral accompaniment and professional care." },
  { t: "Statement on Cross-Border Trafficking Routes", ty: "Press Release", th: ["Advocacy", "Partnership"], p: 2,
    s: "The network's public statement following the regional consultation, calling for coordinated screening at border points and sustained funding for the shelters that receive people intercepted in transit." },
  { t: "Mwongozo wa Uhamasishaji kwa Jamii", ty: "Awareness Material", th: ["Prevention", "Youth & Schools"], p: 3, lang: "sw",
    s: "Mwongozo wa Kiswahili kwa vikundi vya jamii unaoeleza dalili za biashara haramu ya binadamu, jinsi ya kujilinda, na mahali pa kupata msaada wa siri katika ngazi ya kaunti." },
];

async function main() {
  await mkdir(out, { recursive: true });

  const posts = [];
  const files = [];

  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const file = "sample-" + (i + 1) + ".pdf";
    const buf = samplePdf(s.t, "Religious Against Human Trafficking - Kenya", s.p);
    await writeFile(join(out, file), buf);
    files.push(file);

    const d = new Date(Date.UTC(2026, 6 - i, 12 + (i % 5)));
    posts.push({
      id: 100 + i,
      slug: s.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50),
      status: "publish",
      date: d.toISOString(),
      link: "https://talithakumraht.org/?p=" + (100 + i),
      title: { rendered: s.t },
      excerpt: { rendered: "<p>" + s.s + "</p>" },
      content: {
        rendered:
          "<!--TKPUB:" + JSON.stringify({
            v: 1,
            pdf: "fixtures/" + file,
            pdfId: 500 + i,
            pages: s.p,
            size: buf.length,
            lang: s.lang || "en",
            issuer: "RAHT Kenya",
            featured: !!s.f,
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
    });
  }

  /* The stub sits in front of fetch() and answers exactly the calls the
     real page makes against WordPress. */
  const stub = `
window.__TKPUB_FIXTURE__ = ${JSON.stringify(posts)};
(function () {
  var real = window.fetch.bind(window);

  /* Every request header the page sends, so tests can assert on auth. */
  window.__TKPUB_HEADERS__ = [];

  window.fetch = function (url, opts) {
    var u = String(url);
    window.__TKPUB_HEADERS__.push({
      url: u, method: (opts && opts.method) || "GET",
      headers: (opts && opts.headers) || {},
      body: (opts && typeof opts.body === "string") ? opts.body : ""
    });

    function reply(body, headers, status) {
      return Promise.resolve(new Response(JSON.stringify(body), {
        status: status || 200,
        headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
      }));
    }
    /* Lets a test simulate a rejected cookie/nonce. */
    if (window.__TKPUB_REJECT_ME__ && u.indexOf("/users/me") > -1) {
      return reply({ message: "Cookie check failed" }, {}, 401);
    }
    if (u.indexOf("/wp-json/wp/v2/categories") > -1) {
      return reply([{ id: 1, name: "Publications", slug: "publications", parent: 0 }], { "X-WP-TotalPages": "1" });
    }
    if (u.indexOf("/wp-json/wp/v2/posts") > -1) {
      return reply(window.__TKPUB_FIXTURE__, { "X-WP-TotalPages": "1" });
    }
    if (u.indexOf("/wp-json/wp/v2/users/me") > -1) {
      return reply({ id: 3, name: "Sr. Communications", capabilities: { edit_posts: true, publish_posts: true } });
    }
    if (u.indexOf("/wp-json/") > -1) { return reply([]); }
    return real(url, opts);
  };
})();
`;

  let html = await readFile(join(root, "elementor", "publications-page.html"), "utf8");

  /* Point the reader at the local copy of pdf.js — this environment has no
     outbound access to the CDN, and we want the real renderer under test. */
  html = html
    .replace(/lib: "[^"]+"/, 'lib: "vendor/pdf.min.js"')
    .replace(/worker: "[^"]+"/, 'worker: "vendor/pdf.worker.min.js"');

  await mkdir(join(here, "vendor"), { recursive: true });
  for (const f of ["pdf.min.js", "pdf.worker.min.js"]) {
    await copyFile(join(here, "node_modules/pdfjs-dist/build", f), join(here, "vendor", f));
  }

  await writeFile(join(here, "harness.html"), `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publications — test harness</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f2f6f6; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 32px 20px 80px; }
  .banner { background:#0b3c49;color:#fff;padding:10px 20px;font-size:13px; }
</style>
<script>${stub}</script>
</head>
<body class="logged-in">
<div class="banner">TEST HARNESS — stubbed WordPress REST API, sample documents</div>
<div class="wrap">
${html}
</div>
</body></html>`);

  console.log("fixtures: " + files.length + " PDFs, harness.html written");
}

main();
