/**
 * Drives the standalone static site in a real browser.
 *
 *   node staticsite.mjs        (from the test/ directory)
 *
 * Serves site/dist with a small server that implements the same query-based
 * redirect rules Netlify will apply, so the publications, videos and team
 * pages exercise the static WordPress-shaped API exactly as in production.
 */

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "site", "dist");

/* Parse _redirects the way Netlify does: path, optional query filters,
   target, status. */
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

const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".css": "text/css",
  ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".pdf": "application/pdf", ".xml": "application/xml", ".txt": "text/plain" };

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  for (const r of rules) {
    if (r.path !== u.pathname) continue;
    const qok = Object.entries(r.query).every(([k, v]) => u.searchParams.get(k) === decodeURIComponent(v));
    if (!qok) continue;
    if (r.status === 200) {
      const b = await readFile(join(dist, r.target.replace(/^\//, "")));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(b);
    } else {
      res.writeHead(r.status, { Location: r.target });
      res.end();
    }
    return;
  }
  let p = u.pathname.replace(/^\//, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  try {
    const b = await readFile(join(dist, p));
    res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
    res.end(b);
  } catch {
    const b = await readFile(join(dist, "404.html"));
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(b);
  }
});
await new Promise((r) => server.listen(4180, r));
const base = "http://127.0.0.1:4180";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  <- " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function open(path, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  /* Only pdf.js and video hosts are external; block them to prove the pages
     stand on their own. */
  await page.route(/cdnjs|ytimg|youtube|vimeo|unpkg|identity\.netlify|fonts\.g/, (r) => r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors };
}

/* ---- every route renders with the chrome -------------------------------- */

const ROUTES = ["/", "/about-us/", "/vision-mission-and-values/", "/contacts/", "/donate/",
  "/news/", "/our-work/", "/gallery/", "/gallery/2/", "/category/prayer/", "/terms/", "/privacy/", "/thanks/"];
for (const r of ROUTES) {
  const { ctx, page, errors } = await open(r);
  await page.waitForTimeout(300);
  check(`${r} renders with header and footer`,
    (await page.locator("#tks-head").count()) === 1 && (await page.locator(".tks-foot").count()) === 1);
  check(`${r} has no JS errors`, errors.length === 0, errors.slice(0, 2).join("|"));
  await ctx.close();
}

/* ---- the gallery paginates ----------------------------------------------- */

{
  /* Pagination only appears once the photos overflow one page, so drive the
     expectations from the real photo count rather than assuming two pages. */
  const PER_PAGE = 8;
  const total = JSON.parse(
    await readFile(join(dist, "..", "content", "gallery.json"), "utf8"),
  ).photos.length;
  const pages = Math.ceil(total / PER_PAGE);

  const { ctx, page } = await open("/gallery/");
  const figures = await page.locator(".tks-gal figure").count();
  check("gallery page 1 holds a full page of photos",
    figures === Math.min(PER_PAGE, total), `${figures} figures of ${total}`);

  if (pages > 1) {
    const here = await page.locator(".tks-pgn .is-here").textContent();
    check("gallery pagination marks the current page", here === "1", here);
    await page.click(".tks-pgn a[rel=next]");
    await page.waitForSelector(".tks-gal figure");
    const rest = await page.locator(".tks-gal figure").count();
    check("gallery pagination reaches page 2",
      page.url().includes("/gallery/2/") && rest > 0, `${page.url()} ${rest}`);
  } else {
    check("single-page gallery shows no pagination",
      (await page.locator(".tks-pgn").count()) === 0);
  }
  await ctx.close();
}

/* ---- the three app pages against the static API ------------------------- */

{
  const { ctx, page } = await open("/publications/");
  await page.waitForSelector(".tkpub-card", { timeout: 10000 });
  /* The newest/featured publication is promoted out of the grid into the
     hero slot, so three documents render as one hero plus two cards. */
  const cards = await page.locator(".tkpub-card").count();
  const hero = await page.locator("[class*=tkpub-feat], .tkpub-hero").count();
  check("publications load from the static API", cards + Math.min(hero, 1) === 3,
    `${cards} cards + ${hero} hero`);
  const admin = await page.locator("#tkpub-admin .tkpub-admin-bar, #tkpub-admin > *").count();
  check("no staff panel on the static site", admin === 0, `${admin} nodes`);
  await ctx.close();
}
{
  const { ctx, page } = await open("/videos/");
  await page.waitForSelector(".tkvid-card", { timeout: 10000 });
  const cards = await page.locator(".tkvid-card").count();
  check("videos load from the static API", cards >= 2, `${cards} cards`);
  await ctx.close();
}
{
  /* Derive both expectations from site/content/team so a roster change does
     not need a matching edit here — only a real ordering bug should fail. */
  const GROUPS = ["Board", "Staff"];          // the order team.js renders them in
  const dir = join(dist, "..", "content", "team");
  const people = await Promise.all(
    (await readdir(dir)).filter((f) => f.endsWith(".json"))
      .map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8"))),
  );
  people.sort((a, b) =>
    GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
    a.order - b.order || a.name.localeCompare(b.name));

  const { ctx, page } = await open("/our-team/");
  await page.waitForSelector(".tkteam-card", { timeout: 10000 });
  const cards = await page.locator(".tkteam-card").count();
  check("team loads from the static API", cards === people.length,
    `${cards} cards, expected ${people.length}`);
  const first = await page.locator(".tkteam-role").first().textContent();
  check("display order holds on the static site", first === people[0].role,
    `${first}, expected ${people[0].role}`);
  await ctx.close();
}

/* ---- homepage news from the static API ---------------------------------- */

{
  const { ctx, page } = await open("/");
  await page.waitForTimeout(600);
  const cards = await page.locator("#tks-news .tks-ncard").count();
  check("homepage news is filled from the static API", cards === 3, `${cards} cards`);
  const href = await page.locator("#tks-news .tks-ncard").first().getAttribute("href");
  check("news cards link to the story pages", /^\/news\//.test(href || ""), href);
  check("footer links the five social profiles",
    (await page.locator(".tks-social a").count()) === 5 &&
    (await page.locator('.tks-social a[aria-label="YouTube"]').getAttribute("href")).includes("@TalithaKumKenya") &&
    (await page.locator('.tks-social a[aria-label="TikTok"]').getAttribute("href")).includes("tiktok.com/@talitha.kum.kenya"));
  check("top bar links the five social profiles",
    (await page.locator(".tks-topsoc a").count()) === 5 &&
    (await page.locator('.tks-topsoc a[aria-label="X"]').getAttribute("href")).includes("x.com/Talithakumkenya") &&
    (await page.locator('.tks-topsoc a[aria-label="TikTok"]').getAttribute("href")).includes("tiktok.com/@talitha.kum.kenya"));
  await ctx.close();
}

/* ---- old WordPress addresses redirect ----------------------------------- */

{
  const { ctx, page } = await open("/our-team-2/");
  await page.waitForTimeout(400);
  check("/our-team-2/ redirects to /our-team/", page.url().includes("/our-team/"), page.url());
  await ctx.close();
}
{
  const { ctx, page } = await open("/blog-grid/");
  check("/blog-grid/ redirects to /news/", page.url().includes("/news/"), page.url());
  await ctx.close();
}

/* ---- a story page and a category page ----------------------------------- */

{
  const { ctx, page } = await open("/news/training-of-trainers-with-border-police/");
  check("a story page renders its body",
    (await page.locator(".tks-prose p").count()) >= 1 &&
    (await page.locator("h1").textContent()).includes("Training of trainers"));
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  check("stories share with their own absolute og:image",
    /^https:\/\/talithakumraht\.org\/uploads\/.+/.test(og || ""), og);
  check("stories carry article type and twitter card",
    (await page.locator('meta[property="og:type"]').getAttribute("content")) === "article" &&
    (await page.locator('meta[name="twitter:card"]').getAttribute("content")) === "summary_large_image" &&
    (await page.locator('meta[property="og:url"]').getAttribute("content")) === "https://talithakumraht.org/news/training-of-trainers-with-border-police/");
  await ctx.close();
}
{
  const { ctx, page } = await open("/category/protection/");
  const n = await page.locator(".tks-ncard").count();
  check("a category page lists its own stories", n === 1, `${n} cards`);
  const on = await page.locator(".tks-cattabs a.is-on").textContent();
  check("category tabs highlight the current category", (on || "").includes("Protection"), on);
  await ctx.close();
}
{
  const { ctx, page } = await open("/news/");
  const tabs = await page.locator(".tks-cattabs a").count();
  check("news page shows the five category tabs", tabs === 5, `${tabs} tabs`);
  const tags = await page.locator(".tks-ncard .tks-ntag").count();
  check("news cards carry their category tag", tags === 9, `${tags} tags`);
  check("news page one shows nine stories with a pager",
    (await page.locator(".tks-ncard").count()) === 9 &&
    (await page.locator(".tks-pgn").count()) === 1);
  await ctx.close();
}
{
  const { ctx, page } = await open("/news/2/");
  const n = await page.locator(".tks-ncard").count();
  check("news page two holds the remaining stories", n === 7, `${n} cards`);
  check("news pager highlights the current page",
    (await page.locator(".tks-pgn .is-here").textContent()) === "2");
  await ctx.close();
}
{
  const { ctx, page } = await open("/category/prevention/2/");
  const n = await page.locator(".tks-ncard").count();
  check("category pages paginate too", n === 1, `${n} cards`);
  await ctx.close();
}

/* ---- contact form is a real Netlify form -------------------------------- */

{
  const { ctx, page } = await open("/contacts/");
  check("the contact form is Netlify-wired",
    (await page.locator('form[name="contact"][data-netlify="true"]').count()) === 1);
  await ctx.close();
}

/* ---- 404 ------------------------------------------------------------------ */

{
  const { ctx, page } = await open("/no-such-page/");
  check("unknown addresses get the 404 page",
    (await page.locator("h1").textContent()).includes("could not be found"));
  await ctx.close();
}

/* ---- phone ---------------------------------------------------------------- */

{
  const { ctx, page } = await open("/", {
    viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  await page.waitForTimeout(400);
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("360x800: no horizontal overflow", over <= 1, `${over}px`);
  await page.click("[data-drawer-open]");
  await page.waitForTimeout(250);
  check("360x800: the drawer opens", (await page.locator("#tks-drawer.is-open").count()) === 1);
  await ctx.close();
}

await browser.close();
server.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
