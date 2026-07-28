/**
 * Drives the rebuilt site pages in a real browser.
 *
 *   node site.mjs        (from the test/ directory)
 *
 * The home page is served with a stubbed WordPress REST API so the
 * latest-news section is exercised both ways: filled from posts, and
 * removing itself when the API is unreachable.
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const read = (n) => readFile(join(here, "..", "elementor", "site", n), "utf8");

const POSTS = [1, 2, 3].map((i) => ({
  id: 700 + i,
  date: `2026-0${i}-10T09:00:00`,
  link: `https://talithakumraht.org/story-${i}/`,
  title: { rendered: `Story number ${i} from the field` },
  excerpt: { rendered: `<p>Summary of story ${i}.</p>` },
  _embedded: {},
}));

const stub = `
window.fetch = function (url) {
  var u = String(url), body = [];
  if (location.search.indexOf("norest") > -1) {
    return Promise.resolve(new Response("down", { status: 503 }));
  }
  if (u.indexOf("/categories") > -1) body = [{ id: 9, slug: "publications" }];
  else if (u.indexOf("/posts") > -1) body = ${JSON.stringify(POSTS)};
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" } }));
};
`;

const PAGES = ["home", "about", "vision", "contacts", "donate"];
const built = {};
for (const p of PAGES) built[p] = await read(`${p}.html`);

await mkdir(join(here, "shots"), { recursive: true });
const server = createServer((req, res) => {
  const name = (req.url.split("?")[0].replace(/\//g, "") || "home");
  if (!built[name]) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title><style>body{margin:0}</style>
<script>${stub}</script></head><body>${built[name]}</body></html>`);
});
await new Promise((r) => server.listen(4178, r));
const base = "http://127.0.0.1:4178/";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  <- " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/* Block the live site so every page must be complete without it. */
async function newPage(opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/talithakumraht\.org/, (r) => r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

/* ---- every page: chrome present, no errors ------------------------------ */

for (const name of PAGES) {
  const { ctx, page, errors } = await newPage();
  await page.goto(base + name, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  check(`${name}: header, nav and footer render`,
    (await page.locator("#tks-head").count()) === 1 &&
    (await page.locator(".tks-nav [data-mega]").count()) === 3 &&
    (await page.locator(".tks-foot").count()) === 1);
  check(`${name}: no uncaught JavaScript errors`, errors.length === 0, errors.slice(0, 2).join("|"));
  await ctx.close();
}

/* ---- mega menu behaviour ------------------------------------------------ */

{
  const { ctx, page } = await newPage();
  await page.goto(base + "home", { waitUntil: "domcontentloaded" });

  const megas = page.locator(".tks-nav [data-mega]");
  await megas.first().click();
  check("clicking opens a mega menu",
    (await megas.first().getAttribute("aria-expanded")) === "true");
  await megas.nth(1).click();
  check("opening another closes the first",
    (await megas.first().getAttribute("aria-expanded")) === "false" &&
    (await megas.nth(1).getAttribute("aria-expanded")) === "true");
  await page.keyboard.press("Escape");
  check("Escape closes the menus",
    (await megas.nth(1).getAttribute("aria-expanded")) === "false");

  const links = await page.locator(".tks-mega a").count();
  check("mega menus carry the whole site map", links >= 12, `${links} links`);

  /* ---- homepage sections ---- */
  await page.waitForTimeout(400);
  const cards = await page.locator("#tks-news .tks-ncard").count();
  check("latest news is filled from WordPress", cards === 3, `${cards} cards`);

  await page.locator(".tks-impact").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1700);
  const big = await page.locator('[data-count="121000"]').textContent();
  check("impact counters count up to the real numbers", big.replace(/\D/g, "") === "121000", big);

  check("the four Ps are all on the page", (await page.locator(".tks-p").count()) === 4);
  check("partners marquee is doubled for the loop",
    (await page.locator(".tks-marq span").count()) === 24);
  await page.screenshot({ path: join(here, "shots", "site-home.png"), fullPage: true });
  await ctx.close();
}

/* ---- news section removes itself when REST is down ---------------------- */

{
  const { ctx, page, errors } = await newPage();
  await page.goto(base + "home?norest=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  check("news section removes itself when WordPress is unreachable",
    (await page.locator("#tks-news").count()) === 0);
  check("a dead REST API causes no errors", errors.length === 0, errors.join("|"));
  await ctx.close();
}

/* ---- phone -------------------------------------------------------------- */

{
  const { ctx, page } = await newPage({
    viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  await page.goto(base + "home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);

  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("360x800: no horizontal overflow", over <= 1, `${over}px`);

  check("360x800: desktop nav is hidden, burger shown",
    !(await page.locator(".tks-nav").isVisible()) &&
    (await page.locator(".tks-burger").isVisible()));

  await page.click("[data-drawer-open]");
  await page.waitForTimeout(250);
  check("the drawer opens", await page.locator("#tks-drawer.is-open").count() === 1);
  await page.locator(".tks-dgroup").first().click();
  await page.waitForTimeout(200);
  check("a drawer group expands",
    (await page.locator(".tks-dgroup").first().getAttribute("aria-expanded")) === "true");
  const dlinks = await page.locator(".tks-dsub a").count();
  check("the drawer carries the whole site map", dlinks >= 12, `${dlinks} links`);
  await page.locator("[data-drawer-close].tks-x").click();
  await page.waitForTimeout(250);
  check("the drawer closes", (await page.locator("#tks-drawer.is-open").count()) === 0);

  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".tks-bar a, .tks-bar button, .tks-drawer a, .tks-drawer button").forEach((n) => {
      if (!(n.offsetWidth || n.offsetHeight)) return;
      const r = n.getBoundingClientRect();
      if (r.width >= 44 || r.height >= 44) return;
      out.push(`${n.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  check("360x800: header and drawer controls are touch-sized", small.length === 0, small.slice(0, 3).join("|"));

  await page.screenshot({ path: join(here, "shots", "site-mobile.png") });
  await ctx.close();
}

await browser.close();
server.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
