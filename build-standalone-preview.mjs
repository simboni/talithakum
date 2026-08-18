/**
 * All-pages preview of the standalone site, as one self-contained file.
 *
 *   node build-standalone-preview.mjs   -> preview/standalone-preview.html
 *
 * Serves site/dist locally, loads every page in Chromium, snapshots the
 * rendered result (so the publications, videos and team pages appear exactly
 * as their code paints them from the static API), embeds every image, and
 * stitches the pages together behind the header's own navigation.
 *
 * Scripts are stripped from the snapshots: the PDF reader and video player
 * run on the real site, and the preview says so when they are tapped.
 */

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "site", "dist");

/* ---- serve dist with the Netlify redirect rules ------------------------- */

const rules = (await readFile(join(dist, "_redirects"), "utf8"))
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const parts = l.split(/\s+/);
    const path = parts.shift();
    const status = /^\d+$/.test(parts[parts.length - 1]) ? Number(parts.pop()) : 301;
    const target = parts.pop();
    const query = {};
    for (const p of parts) { const [k, v] = p.split("="); query[k] = v; }
    return { path, query, target, status };
  });
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf" };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  for (const r of rules) {
    if (r.path !== u.pathname) continue;
    if (!Object.entries(r.query).every(([k, v]) => u.searchParams.get(k) === decodeURIComponent(v))) continue;
    if (r.status === 200) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(await readFile(join(dist, r.target.replace(/^\//, ""))));
    } else { res.writeHead(r.status, { Location: r.target }); res.end(); }
    return;
  }
  let p = u.pathname.replace(/^\//, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  /* Read first, then write the head: writing 200 before the read means a
     missing file throws with the headers already sent, which kills the run. */
  let body = null;
  try { body = await readFile(join(dist, p)); } catch { /* falls through to 404 */ }
  if (body) {
    res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
    res.end(body);
  } else { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4181, r));

/* ---- snapshot every page ------------------------------------------------- */

/* Gallery pagination follows the photo count, so derive the routes rather than
   hard-coding them — otherwise removing photos leaves a dead /gallery/N/. */
const GALLERY_PER_PAGE = 8;
const galleryCount = JSON.parse(
  await readFile(join(here, "site", "content", "gallery.json"), "utf8").catch(() => '{"photos":[]}')
).photos?.length || 0;
const GALLERY_ROUTES = Array.from(
  { length: Math.max(1, Math.ceil(galleryCount / GALLERY_PER_PAGE)) },
  (_, i) => (i === 0 ? "/gallery/" : `/gallery/${i + 1}/`),
);

const ROUTES = ["/", "/about-us/", "/vision-mission-and-values/", "/contacts/", "/donate/",
  "/our-work/", "/news/", ...GALLERY_ROUTES, "/publications/", "/videos/", "/our-team/",
  "/category/prayer/", "/category/protection/", "/category/prevention/", "/category/partnership-networking/",
  "/news/bakhita-day-marked-across-the-network/", "/news/human-trafficking-awareness-month/",
  "/news/training-of-trainers-with-border-police/"];
const id = (r) => r === "/" ? "home" : r.replace(/^\/|\/$/g, "").replace(/\//g, "-");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route(/cdnjs|ytimg|youtube|vimeo|unpkg|identity\.netlify|fonts\.g/, (r) => r.abort());

const SNAP = {};
const cssBlocks = new Map();       // whole <style> blocks, deduped verbatim
for (const route of ROUTES) {
  await page.goto("http://127.0.0.1:4181" + route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(route === "/" || /publications|videos|our-team/.test(route) ? 1400 : 350);
  const got = await page.evaluate(() => {
    document.querySelectorAll("script").forEach((s) => s.remove());
    /* reveal everything: the preview has no IntersectionObserver run */
    document.querySelectorAll("[data-reveal]").forEach((n) => n.classList.add("is-in"));
    return {
      body: document.body.innerHTML,
      css: [...document.querySelectorAll("style")].map((s) => s.textContent),
    };
  });
  SNAP[route] = got.body;
  for (const block of got.css) cssBlocks.set(block, block);
}

/* ---- embed images --------------------------------------------------------- */

const imgs = new Set();
for (const b of Object.values(SNAP)) {
  for (const m of b.matchAll(/(?:src|href)="(\/uploads\/[^"]+\.(?:png|jpe?g))"/g)) imgs.add(m[1]);
  for (const m of b.matchAll(/url\('(\/uploads\/[^']+)'\)/g)) imgs.add(m[1]);
}
const DATA = {};
for (const u of imgs) {
  const raw = await readFile(join(dist, u.replace(/^\//, "")));
  DATA[u] = await page.evaluate(async ([src, isLogo]) => {
    const im = new Image(); im.src = src; await im.decode();
    const w = Math.min(isLogo ? 128 : 700, im.width);
    const c = document.createElement("canvas");
    c.width = w; c.height = Math.round((w / im.width) * im.height);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return isLogo ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.58);
  }, [`data:image/${u.endsWith("png") ? "png" : "jpeg"};base64,${raw.toString("base64")}`, u.includes("tik-logo")]);
}
await browser.close();
server.close();

/* ---- stitch --------------------------------------------------------------- */

function rewrite(html) {
  html = html.replace(/href="(\/[^"]*)"/g, (m, u) => {
    if (u.startsWith("data:")) return m;
    const route = ROUTES.find((r) => r === u);
    if (route) return `href="#p-${id(route)}"`;
    if (u.startsWith("/uploads/") && u.endsWith(".pdf")) return `href="#ext" data-ext="downloads this PDF"`;
    return `href="#ext" data-ext="opens ${u}"`;
  });
  return html;
}

const pages = ROUTES.map((r) =>
  `<div class="pv-page" data-page="${id(r)}" ${r === "/" ? "" : "hidden"}>${rewrite(SNAP[r])}</div>`).join("\n");

const ascii = (s) => s.replace(/[^\x00-\x7F]/g, (c) => "&#" + c.codePointAt(0) + ";");

/* The artifact sandbox blocks font CDNs, so the preview embeds the latin
   subsets of the real faces as data URIs — the typography the live site
   gets from Google Fonts, carried inside the file. */
function fontCss() {
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const url = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Nunito+Sans:ital,wght@0,400..900;1,400..900&display=swap";
  const css = execSync(`curl -s --max-time 30 -H "User-Agent: ${UA}" "${url}"`).toString();
  const out = [];
  const blocks = css.split("@font-face").slice(1);
  for (const b of blocks) {
    if (!/U\+0000-00FF/.test(b)) continue;              // latin subset only
    const src = /url\((https:[^)]+\.woff2)\)/.exec(b);
    if (!src) continue;
    const woff = execSync(`curl -s --max-time 30 "${src[1]}" | base64 -w0`, { maxBuffer: 1 << 26 }).toString();
    out.push("@font-face" + b.slice(0, b.indexOf("src:")) +
      `src: url(data:font/woff2;base64,${woff}) format('woff2');\n}`);
  }
  return out.join("\n");
}
const embeddedFonts = fontCss();
console.log(`embedded ${(embeddedFonts.length / 1024).toFixed(0)} KB of fonts`);
const allCss = embeddedFonts + "\n" + [...cssBlocks.values()].join("\n");

const html = `<title>Talitha Kum Kenya &#8212; standalone site preview</title>
<style>
${ascii(allCss)}
.pv-note { position: sticky; top: 0; z-index: 1300; background: #232323; color: #fff;
  font: 600 13px/1.5 "Nunito Sans", sans-serif; text-align: center; padding: 9px 16px; }
.pv-note b { color: #FFAC00; }
.pv-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(90px);
  background: #232323; color: #fff; font: 600 13.5px/1.4 "Nunito Sans", sans-serif;
  padding: 12px 20px; border-radius: 28px; transition: transform .25s; z-index: 4000;
  max-width: min(90vw, 480px); text-align: center; }
.pv-toast.is-on { transform: translateX(-50%) translateY(0); }
</style>
<div class="pv-note">Standalone site preview &#8212; every menu link works.
  <b>The PDF reader and video player run on the live site, not in this file.</b></div>
${ascii(pages)}
<div class="pv-toast" role="status"></div>
<script>
/* Every image is stored once and injected here, instead of being embedded
   again on every page that shows it. */
var PV_IMG = ${JSON.stringify(DATA)};
(function () {
  function hydrate() {
    document.querySelectorAll('img[src^="/uploads/"]').forEach(function (im) {
      var d = PV_IMG[im.getAttribute("src")];
      if (d) im.src = d;
    });
    document.querySelectorAll('[style*="/uploads/"]').forEach(function (n) {
      var st = n.getAttribute("style");
      Object.keys(PV_IMG).forEach(function (u) {
        if (st.indexOf(u) > -1) st = st.split(u).join(PV_IMG[u]);
      });
      n.setAttribute("style", st);
    });
  }
  hydrate();
})();
(function () {
  function show(name) {
    document.querySelectorAll(".pv-page").forEach(function (p) {
      p.hidden = p.getAttribute("data-page") !== name;
    });
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    var t = document.querySelector(".pv-toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("is-on"); }, 2600);
  }
  document.addEventListener("click", function (ev) {
    var mega = ev.target.closest && ev.target.closest("[data-mega]");
    if (mega) {
      ev.stopPropagation();
      var open = mega.getAttribute("aria-expanded") === "true";
      document.querySelectorAll("[data-mega]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
      mega.setAttribute("aria-expanded", String(!open));
      return;
    }
    var dOpen = ev.target.closest && ev.target.closest("[data-drawer-open]");
    if (dOpen) {
      ev.target.closest(".pv-page").querySelector(".tks-drawer").classList.add("is-open");
      return;
    }
    var dClose = ev.target.closest && ev.target.closest("[data-drawer-close]");
    if (dClose) {
      ev.target.closest(".tks-drawer").classList.remove("is-open");
      return;
    }
    var dg = ev.target.closest && ev.target.closest(".tks-dgroup");
    if (dg) { dg.setAttribute("aria-expanded", String(dg.getAttribute("aria-expanded") !== "true")); return; }

    var a = ev.target.closest && ev.target.closest("a[href]");
    if (a) {
      var href = a.getAttribute("href") || "";
      if (href.indexOf("#p-") === 0) { ev.preventDefault(); show(href.slice(3)); return; }
      if (a.hasAttribute("data-ext")) {
        ev.preventDefault();
        toast("On the live site this " + a.getAttribute("data-ext") + ".");
        return;
      }
      if (href.indexOf("#") === 0) ev.preventDefault();
      return;
    }
    var act = ev.target.closest && ev.target.closest("[data-play], [data-person], .tkpub-card, .tkvid-thumb");
    if (act) {
      ev.preventDefault();
      toast("The reader and player are live features \\u2014 they run on the real site, not in this preview.");
    }
  }, true);
  document.addEventListener("click", function () {
    /* outside click closes menus (bubble phase, after the capture handler) */
  });
})();
</script>
`;

await mkdir(join(here, "preview"), { recursive: true });
await writeFile(join(here, "preview", "standalone-preview.html"), html, "utf8");
console.log(`built preview/standalone-preview.html  ${(Buffer.byteLength(html, "utf8") / 1024).toFixed(0)} KB, ${ROUTES.length} pages`);
