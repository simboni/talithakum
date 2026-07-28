/**
 * Self-contained preview of the rebuilt site: all five pages in one file,
 * with the header's own links switching between them, so the mega menus,
 * pages and footer can all be tried exactly as they will behave live.
 *
 *   node build-site-preview.mjs        -> preview/site-preview.html
 *
 * No network: images are embedded downscaled from the archive the client
 * sent, and the latest-news section shows three real stories statically.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const S = (n) => readFile(join(root, "src", "site", n), "utf8");

const [css, js, head, foot] = await Promise.all([
  S("site.css"), S("site.js"), S("chrome-head.html"), S("chrome-foot.html"),
]);
const PAGES = {};
for (const n of ["home", "about", "vision", "contacts", "donate"]) {
  PAGES[n] = await S(join("pages", `${n}.html`));
}

/* ---- embed the archive's images, downscaled through Chromium ------------- */

const IMG = {   // live URL -> local file in assets/site-src/images
  "https://talithakumraht.org/wp-content/uploads/2024/02/DSC_0023-scaled.jpg": "DSC_0023-scaled-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2023/12/DSC_0535.jpg": "DSC_0535-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2023/12/ToT-police.jpg": "ToT-police.jpg",
  "https://talithakumraht.org/wp-content/uploads/2024/05/Novices.jpg": "Novices-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2024/05/IMG-20240421-WA0375-1.jpg": "IMG-20240421-WA0375-1-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2025/02/IMG_6463-1-scaled.jpg": "IMG_6463-1-scaled-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2023/12/IMG_20220324_102453-scaled.jpg": "IMG_20220324_102453-scaled-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2023/12/hand-g880142d87_1920.jpg": "hand-g880142d87_1920-740x800.jpg",
  "https://talithakumraht.org/wp-content/uploads/2020/09/cropped-TIK-LOGO-192x192.png": "TIK-LOGO.png",
  "https://talithakumraht.org/wp-content/uploads/2024/01/HT-month.jpg": "HT-month-1170x935.jpg",
  "https://talithakumraht.org/wp-content/uploads/2025/02/IMG-20250215-WA0020.jpg": "IMG-20250215-WA0020-1170x935.jpg",
};

async function embed() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();
  const out = {};
  for (const [url, file] of Object.entries(IMG)) {
    const raw = await readFile(join(root, "assets", "site-src", "images", file));
    const isLogo = file.includes("LOGO");
    out[url] = await page.evaluate(async ([src, logo]) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const w = logo ? 128 : 900;
      const h = Math.round((Math.min(w, im.width) / im.width) * im.height);
      const c = document.createElement("canvas");
      c.width = Math.min(w, im.width); c.height = h;
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      return logo ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.66);
    }, [`data:image/${file.endsWith("png") ? "png" : "jpeg"};base64,${raw.toString("base64")}`, isLogo]);
  }
  await browser.close();
  return out;
}
const EMB = await embed();
const swapImages = (s) => {
  for (const [url, data] of Object.entries(EMB)) s = s.split(url).join(data);
  return s;
};

/* ---- static stand-in for the REST-driven news section -------------------- */

const NEWS = `
<a class="tks-ncard" href="https://talithakumraht.org/blog-grid/" data-nav="external">
  <span class="tks-nimg"><img src="${EMB["https://talithakumraht.org/wp-content/uploads/2025/02/IMG-20250215-WA0020.jpg"]}" alt=""></span>
  <span class="tks-nbody"><time>15 February 2026</time>
    <h3>Bakhita Day marked across the network</h3>
    <p>Parishes and communities across Kenya gathered to mark the feast of St Josephine Bakhita, patron of trafficking survivors.</p>
    <span class="tks-plink">Read the story <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
  </span></a>
<a class="tks-ncard" href="https://talithakumraht.org/blog-grid/" data-nav="external">
  <span class="tks-nimg"><img src="${EMB["https://talithakumraht.org/wp-content/uploads/2024/01/HT-month.jpg"]}" alt=""></span>
  <span class="tks-nbody"><time>26 January 2026</time>
    <h3>Human trafficking awareness month</h3>
    <p>A month of outreach in schools, churches and markets, equipping communities to recognise the signs.</p>
    <span class="tks-plink">Read the story <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
  </span></a>
<a class="tks-ncard" href="https://talithakumraht.org/blog-grid/" data-nav="external">
  <span class="tks-nimg"><img src="${EMB["https://talithakumraht.org/wp-content/uploads/2023/12/ToT-police.jpg"]}" alt=""></span>
  <span class="tks-nbody"><time>12 December 2025</time>
    <h3>Training of trainers with border police</h3>
    <p>Officers from border counties trained as first responders, closing the gap between rescue and care.</p>
    <span class="tks-plink">Read the story <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
  </span></a>`;

/* ---- assemble ------------------------------------------------------------ */

/* Map live URLs to preview page ids so the chrome's own links switch pages. */
const ROUTES = {
  "https://talithakumraht.org/": "home",
  "https://talithakumraht.org/about-us/": "about",
  "https://talithakumraht.org/vision-mission-and-values/": "vision",
  "https://talithakumraht.org/contacts/": "contacts",
  "https://talithakumraht.org/donate/": "donate",
};

let body = swapImages(head.trim());
body += Object.entries(PAGES).map(([n, c]) => {
  let s = swapImages(c.trim());
  s = s.replace('<div class="tks-news" id="tks-news">\n      <!-- filled from WordPress; the whole section removes itself if that fails -->\n    </div>',
    `<div class="tks-news">${NEWS}</div>`);
  return `<div class="pv-page" data-page="${n}" ${n === "home" ? "" : "hidden"}>${s}</div>`;
}).join("\n");
body += swapImages(foot.trim());

const router = `
(function () {
  var ROUTES = ${JSON.stringify(ROUTES)};
  function show(name) {
    document.querySelectorAll(".pv-page").forEach(function (p) {
      p.hidden = p.getAttribute("data-page") !== name;
    });
    window.scrollTo(0, 0);
    document.querySelectorAll("[data-mega]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    var d = document.getElementById("tks-drawer");
    if (d) { d.classList.remove("is-open"); document.body.classList.remove("tks-locked"); }
    if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      document.querySelectorAll('.pv-page[data-page="' + name + '"] [data-reveal]').forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (r.top < window.innerHeight) n.classList.add("is-in");
      });
    }
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var name = ROUTES[a.getAttribute("href")];
    if (name) { ev.preventDefault(); show(name); return; }
    if (a.getAttribute("href").indexOf("talithakumraht.org") > -1) {
      ev.preventDefault();
      var t = document.querySelector(".pv-toast");
      t.textContent = "On the live site this opens " + a.getAttribute("href").replace("https://talithakumraht.org", "");
      t.classList.add("is-on");
      clearTimeout(t._h);
      t._h = setTimeout(function () { t.classList.remove("is-on"); }, 2600);
    }
  }, true);
})();
`;

const ascii = (s) => s.replace(/[^\x00-\x7F]/g, (c) => "&#" + c.codePointAt(0) + ";");
const asciiJs = (s) => s.replace(/[^\x00-\x7F]/g, (c) => "\\u" + c.codePointAt(0).toString(16).padStart(4, "0"));
const safe = (s) => s.replace(/<\/script>/gi, "<\\/script>");

const html = `<title>Talitha Kum Kenya &#8212; site rebuild preview</title>
<style>
${ascii(css.trim())}
.pv-note { position: sticky; top: 0; z-index: 1300; background: #232323; color: #fff;
  font: 600 13px/1.5 "Nunito Sans", sans-serif; text-align: center; padding: 9px 16px; }
.pv-note b { color: #FFAC00; }
.pv-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(80px);
  background: #232323; color: #fff; font: 600 13.5px/1.4 "Nunito Sans", sans-serif;
  padding: 12px 20px; border-radius: 28px; transition: transform .25s; z-index: 4000;
  max-width: min(90vw, 480px); text-align: center; }
.pv-toast.is-on { transform: translateX(-50%) translateY(0); }
</style>
<div class="pv-note">Design preview &#8212; the header links switch between the five rebuilt pages.
  <b>Try the mega menus, and try it on a phone.</b></div>
<div class="tks">
${ascii(body)}
</div>
<div class="pv-toast" role="status"></div>
<script>
${asciiJs(safe(js.trim()))}
</script>
<script>
${asciiJs(safe(router.trim()))}
</script>
`;

await mkdir(join(root, "preview"), { recursive: true });
await writeFile(join(root, "preview", "site-preview.html"), html, "utf8");
console.log(`built preview/site-preview.html  ${(Buffer.byteLength(html, "utf8") / 1024).toFixed(0)} KB`);
