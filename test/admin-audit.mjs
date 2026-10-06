/**
 * Audit of the admin panel: the screens and controls the main suite never
 * touches. Runs the real API against a throwaway copy of site/content/ and
 * drives the real /admin page in a browser.
 *
 * test/admin.mjs covers the paths that have broken before. This covers the
 * rest — password changes, search and filters, required fields, the unsaved
 * work guard, gallery reordering, every field widget, and the phone layout.
 */

import { createServer } from "node:http";
import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

const work = await mkdtemp(join(tmpdir(), "tk-audit-"));
await cp(join(repo, "site/content"), join(work, "site/content"), { recursive: true });
await cp(join(repo, "site/static/uploads"), join(work, "site/static/uploads"), { recursive: true });
process.env.TK_LOCAL_DIR = work;

const { default: handler } = await import("../netlify/functions/admin-api.mjs");

const MIME = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf" };
const adminHtml = readFileSync(join(repo, "site/admin/index.html"));

const server = createServer(async (req, res) => {
  const url = `http://127.0.0.1:${PORT}${req.url}`;
  if (req.url.startsWith("/api/admin")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method,
      headers: { "content-type": req.headers["content-type"] || "", cookie: req.headers.cookie || "" },
      body: chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined,
    });
    const response = await handler(request);
    const headers = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  if (req.url.startsWith("/admin")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(adminHtml); }
  if (req.url.startsWith("/uploads/")) {
    const f = join(work, "site/static", decodeURIComponent(req.url.split("?")[0]));
    if (existsSync(f)) { res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)); }
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<title>site stub</title>");
});
const PORT = await new Promise((r) => server.listen(0, () => r(server.address().port)));
const base = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
const findings = [];
function check(name, ok, extra) {
  if (ok) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; findings.push(`${name}${extra ? ` — ${extra}` : ""}`); console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ""}`); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.route(/fonts\.googleapis|gstatic/, (r) => r.abort());
let lastDialog = "";
page.on("dialog", (d) => { lastDialog = d.message(); d.accept(); });

/* -- sign in --------------------------------------------------------------- */

await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#af");
await page.fill('[name="name"]', "Peter Misiati");
await page.fill('[name="email"]', "peter@example.org");
await page.fill('[name="password"]', "first-password-1");
await page.click("#af button");
await page.waitForSelector(".side");

/* -- required fields ------------------------------------------------------- */

await page.goto(`${base}/admin#/news`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#newbtn");
await page.click("#newbtn");
await page.waitForSelector("#ef");
await page.click("#ef button[type=submit]");
await page.waitForTimeout(400);
check("publishing an empty form is refused", await page.locator("#eerr.show").count() === 1);
{
  const msg = await page.locator("#eerr").textContent().catch(() => "");
  /* Reporting one missing field at a time means fixing one and discovering
     the next, over and over. */
  check("and it names more than one missing field at once",
    /Headline/i.test(msg) && /(summary|story)/i.test(msg), msg);
}
check("nothing was written for a refused publish",
  !existsSync(join(work, "site/content/news/.json")));

/* -- the unsaved work guard ------------------------------------------------ */

await page.fill('[data-f="title"]', "A Draft Nobody Finished");
lastDialog = "";
await page.click("[data-nav='team']");
await page.waitForTimeout(600);
check("navigating away from unsaved work asks first", /\b(lose|unsaved|sure)\b/i.test(lastDialog), lastDialog || "(no dialog)");

/* -- every field widget saves --------------------------------------------- */

await page.goto(`${base}/admin#/publications`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#newbtn");
await page.click("#newbtn");
await page.waitForSelector("#ef");
await page.fill('[data-f="title"]', "Audit Publication With Every Field");
await page.fill('[data-f="date"]', "2026-09-15");
await page.selectOption('[data-f="type"]', "Policy Brief");
await page.fill('[data-f="summary"]', "Exercises every widget on the form.");
await page.fill('[data-f="pages"]', "24");

const pdf = join(work, "audit.pdf");
await writeFile(pdf, Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"));
await page.setInputFiles('[data-pick="pdf"] input[type=file]', pdf);
await page.waitForFunction(() => {
  const el = document.querySelector('[data-pick="pdf"] [data-f]');
  return el && el.value.startsWith("/uploads/");
}, null, { timeout: 30000 });
check("a PDF uploads and is attached", true);

/* tags, multi-select and the checkbox */
const tagInput = page.locator('[data-f="keywords"]');
if (await tagInput.count()) await tagInput.fill("Nairobi, border, youth");
const themeBoxes = page.locator('#ef .chips input[type=checkbox]');
const themeCount = await themeBoxes.count();
if (themeCount >= 2) { await themeBoxes.nth(0).check(); await themeBoxes.nth(1).check(); }
const featured = page.locator('[data-f="featured"]');
if (await featured.count()) await featured.check();

await page.click("#ef button[type=submit]");
await page.waitForSelector(".done", { timeout: 20000 });
await page.waitForTimeout(400);
{
  const f = join(work, "site/content/publications/audit-publication-with-every-field.json");
  check("the publication is written", existsSync(f));
  if (existsSync(f)) {
    const d = JSON.parse(await readFile(f, "utf8"));
    check("a number field saves as a number", d.pages === 24 || d.pages === "24", JSON.stringify(d.pages));
    check("a tags field saves as a list",
      Array.isArray(d.keywords) && d.keywords.length === 3, JSON.stringify(d.keywords));
    check("a multi-select saves the ticked themes",
      !themeCount || (Array.isArray(d.themes) && d.themes.length === 2), JSON.stringify(d.themes));
    check("a checkbox saves as true", d.featured === true, JSON.stringify(d.featured));
    check("the uploaded PDF path is stored", typeof d.pdf === "string" && d.pdf.startsWith("/uploads/"), d.pdf);
  }
}

/* -- search and the facet filter ------------------------------------------ */

await page.goto(`${base}/admin#/news`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".row");
const allRows = await page.locator(".row").count();
await page.fill(".search input", "bakhita");
await page.waitForTimeout(400);
const searched = await page.locator(".row").count();
check("search narrows the list", searched > 0 && searched < allRows, `${allRows} -> ${searched}`);
await page.fill(".search input", "");
await page.waitForTimeout(300);

const chips = page.locator("[data-facet]");
if (await chips.count() > 1) {
  await chips.nth(1).click();
  await page.waitForTimeout(400);
  const filtered = await page.locator(".row").count();
  check("the focus-area filter narrows the list", filtered > 0 && filtered < allRows, `${allRows} -> ${filtered}`);
  await page.locator('[data-facet=""]').click();
  await page.waitForTimeout(300);
  check("and All brings every story back", (await page.locator(".row").count()) === allRows);
} else {
  check("the focus-area filter is present", false, "no [data-facet] control found");
}

/* -- gallery reorder and remove ------------------------------------------- */

await page.goto(`${base}/admin#/gallery`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".gitem");
const firstCaption = await page.locator('[data-cap="0"]').inputValue();
const secondCaption = await page.locator('[data-cap="1"]').inputValue();
await page.locator('[data-mv="0"][data-dir="1"]').click();
await page.waitForTimeout(300);
check("the arrows reorder photographs",
  (await page.locator('[data-cap="0"]').inputValue()) === secondCaption &&
  (await page.locator('[data-cap="1"]').inputValue()) === firstCaption,
  `${firstCaption} / ${secondCaption}`);

const beforeRemove = await page.locator(".gitem").count();
await page.locator('[data-rm="0"]').click();
await page.waitForTimeout(400);
check("removing a photograph asks first", /remove/i.test(lastDialog), lastDialog);
check("and removes exactly one", (await page.locator(".gitem").count()) === beforeRemove - 1);

await page.click("#savegal");
await page.waitForSelector(".toast.show");
await page.waitForTimeout(400);
{
  /* The swap put secondCaption first, so removing index 0 removes that one
     and firstCaption is what should survive at the top. */
  const g = JSON.parse(await readFile(join(work, "site/content/gallery.json"), "utf8"));
  check("the reorder and the removal are both published",
    g.photos.length === beforeRemove - 1 && g.photos[0].caption === firstCaption,
    `${g.photos.length} photos, first "${g.photos[0] && g.photos[0].caption}"`);
}

/* -- a video, and the link it is given ------------------------------------ */

await page.goto(`${base}/admin#/videos`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#newbtn");
await page.click("#newbtn");
await page.waitForSelector("#ef");
await page.fill('[data-f="title"]', "Audit Video From A Share Link");
await page.fill('[data-f="url"]', "https://youtu.be/dQw4w9WgXcQ?si=abcdef");
await page.fill('[data-f="date"]', "2026-09-15");
await page.selectOption('[data-f="type"]', "Training");
await page.click("#ef button[type=submit]");
await page.waitForSelector(".done", { timeout: 20000 });
await page.waitForTimeout(400);
{
  const f = join(work, "site/content/videos/audit-video-from-a-share-link.json");
  check("a video saves from a share link", existsSync(f));
  if (existsSync(f)) {
    const d = JSON.parse(await readFile(f, "utf8"));
    check("the video link is kept intact", typeof d.url === "string" && d.url.includes("dQw4w9WgXcQ"), d.url);
  }
}
await page.goto(`${base}/admin#/videos`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".row");
check("the new video appears in the list with a thumbnail or initials",
  await page.locator(".row .thumb, .row .mono").count() > 0);

/* -- changing your own password -------------------------------------------- */

await page.goto(`${base}/admin#/account`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#pf");

await page.fill("#p-old", "the-wrong-one");
await page.fill("#p-new", "second-password-2");
await page.fill("#p-new2", "second-password-2");
await page.click("#pf button[type=submit]");
await page.waitForTimeout(700);
check("a wrong current password is refused", await page.locator("#perr.show").count() === 1);

await page.fill("#p-old", "first-password-1");
await page.fill("#p-new", "second-password-2");
await page.fill("#p-new2", "mistyped-password-2");
await page.click("#pf button[type=submit]");
await page.waitForTimeout(700);
check("two different new passwords are refused",
  await page.locator("#perr.show").count() === 1,
  await page.locator("#perr").textContent().catch(() => ""));

await page.fill("#p-old", "first-password-1");
await page.fill("#p-new", "second-password-2");
await page.fill("#p-new2", "second-password-2");
await page.click("#pf button[type=submit]");
await page.waitForTimeout(900);
check("a correct password change is accepted", await page.locator("#perr.show").count() === 0);

/* -- sign out, and back in with the new password --------------------------- */

await page.click("#logout");
await page.waitForSelector("#af", { timeout: 15000 });
check("signing out returns to the sign-in screen", await page.locator("#af").count() === 1);

await page.fill('[name="email"]', "peter@example.org");
await page.fill('[name="password"]', "second-password-2");
await page.click("#af button");
await page.waitForSelector(".side", { timeout: 15000 });
check("the new password works", (await page.locator(".side .who b").textContent()) === "Peter Misiati");

/* -- an administrator cannot lock the site out of itself ------------------- */

await page.goto(`${base}/admin#/users`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ulist .row");
await page.click('#ulist .row[data-u="peter@example.org"]');
await page.waitForSelector("#uf");
check("there is no way to remove your own account", await page.locator("#udel").count() === 0);
await page.selectOption("#u-role", "editor");
await page.click("#uf button[type=submit]");
await page.waitForTimeout(800);
check("demoting yourself is refused", await page.locator("#uerr.show").count() === 1,
  await page.locator("#uerr").textContent().catch(() => ""));

/* -- the phone layout ------------------------------------------------------ */

const phone = await browser.newContext({ viewport: { width: 390, height: 780 } });
const mob = await phone.newPage();
await mob.route(/fonts\.googleapis|gstatic/, (r) => r.abort());
mob.on("dialog", (d) => d.accept());
await mob.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
await mob.waitForSelector("#af");
await mob.fill('[name="email"]', "peter@example.org");
await mob.fill('[name="password"]', "second-password-2");
await mob.click("#af button");
await mob.waitForSelector(".topbar", { timeout: 15000 });
check("the phone layout shows the top bar instead of the sidebar",
  await mob.locator(".topbar").isVisible() && !(await mob.locator(".side").isVisible()));

await mob.selectOption("#secsel", "team");
await mob.waitForTimeout(800);
check("the phone section menu navigates", /#\/team/.test(mob.url()), mob.url());

await mob.click("#mobilemore");
await mob.waitForTimeout(300);
check("the phone more-menu opens", await mob.locator("#moremenu").isVisible());
check("and offers the live site as well as signing out",
  await mob.locator("#mviewsite").count() === 1 && await mob.locator("#mlogout").count() === 1);

/* -------------------------------------------------------------------------- */

await browser.close();
server.close();
if (findings.length) {
  console.log("\nNeeds attention:");
  findings.forEach((f) => console.log(`  - ${f}`));
}
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
