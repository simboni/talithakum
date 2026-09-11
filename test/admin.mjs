/**
 * End-to-end test of the custom admin panel.
 *
 * Runs the real serverless function (netlify/functions/admin-api.mjs) in
 * local mode against a throwaway copy of site/content/, serves the real
 * /admin page next to it, and drives the whole thing with a browser:
 * first-run setup, publishing, privileges, uploads, user management.
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

/* ---- throwaway working copy --------------------------------------------- */

const work = await mkdtemp(join(tmpdir(), "tk-admin-"));
await cp(join(repo, "site/content"), join(work, "site/content"), { recursive: true });
await cp(join(repo, "site/static/uploads"), join(work, "site/static/uploads"), { recursive: true });
process.env.TK_LOCAL_DIR = work;

const { default: handler } = await import("../netlify/functions/admin-api.mjs");

/* ---- bridge server: function + static admin page ------------------------- */

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

/* ---- checks --------------------------------------------------------------- */

let passed = 0, failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ""}`); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.route(/fonts\.googleapis|gstatic/, (r) => r.abort());
/* Registered up front, not just before the delete test: the panel now also
   confirms before navigating away from unsaved edits, and Playwright dismisses
   dialogs by default, which would silently block that navigation. */
page.on("dialog", (d) => d.accept());

/* -- first-run setup ------------------------------------------------------- */

await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#af");
check("first run shows the setup screen", (await page.locator("h1").textContent()).includes("first account"));
await page.fill('[name="name"]', "Peter Misiati");
await page.fill('[name="email"]', "peter@example.org");
await page.fill('[name="password"]', "long-password-1");
await page.click("#af button");
await page.waitForSelector(".side");
check("setup signs the admin straight in", (await page.locator(".side .who b").textContent()) === "Peter Misiati");
check("admin sees every section plus Users",
  (await page.locator("[data-nav='users']").count()) === 1 &&
  (await page.locator("[data-nav='team']").count()) === 1);

/* -- team list is ordered like the site ------------------------------------ */

await page.click("[data-nav='team']");
await page.waitForSelector(".row");
check("team list is ordered by display order",
  (await page.locator(".row .name").first().textContent()) === "Sr. Mercy Mwayi");

/* -- publish a story ------------------------------------------------------- */

await page.click("[data-nav='news']");
await page.waitForSelector("#newbtn");
await page.click("#newbtn");
await page.waitForSelector("#ef");
await page.fill('[data-f="title"]', "Test Story From The Panel");
await page.fill('[data-f="date"]', "2026-07-28");
await page.selectOption('[data-f="category"]', "Prevention");
await page.fill('[data-f="summary"]', "A story published by the automated test.");
await page.fill('[data-f="body"]', "It worked.\n\n**Bold** even.");
await page.click("#ef button[type=submit]");
await page.waitForSelector(".toast.show");
const storyFile = join(work, "site/content/news/test-story-from-the-panel.json");
await page.waitForTimeout(300);
check("publishing writes the story file", existsSync(storyFile));
if (existsSync(storyFile)) {
  const story = JSON.parse(await readFile(storyFile, "utf8"));
  check("the story has the right fields", story.title === "Test Story From The Panel" && story.category === "Prevention" && story.body.includes("**Bold**"));
  check("publishing pins the public web address", story.slug === "test-story-from-the-panel", story.slug);
}

/* -- a second story with a colliding headline must not replace the first --- */

await page.click("[data-nav='news']");
await page.waitForSelector("#newbtn");
await page.click("#newbtn");
await page.waitForSelector("#ef");
await page.fill('[data-f="title"]', "Test Story From The Panel");
await page.fill('[data-f="date"]', "2026-07-29");
await page.fill('[data-f="summary"]', "A different story that happens to share a headline.");
await page.fill('[data-f="body"]', "Should be refused.");
await page.click("#ef button[type=submit]");
await page.waitForSelector("#eerr.show, .toast.show");
await page.waitForTimeout(400);
const afterCollision = JSON.parse(await readFile(storyFile, "utf8"));
check("a colliding headline does not overwrite the earlier story",
  afterCollision.summary === "A story published by the automated test.", afterCollision.summary);

/* -- renaming a headline must not move the page -------------------------- */

await page.click("[data-nav='news']");
await page.waitForSelector(".row");
await page.click(".row");
await page.waitForSelector("#ef");
await page.fill('[data-f="title"]', "Test Story From The Panel (corrected)");
await page.click("#ef button[type=submit]");
await page.waitForSelector(".toast.show");
await page.waitForTimeout(400);
const renamed = JSON.parse(await readFile(storyFile, "utf8"));
check("correcting a headline keeps the web address it was shared at",
  renamed.title.endsWith("(corrected)") && renamed.slug === "test-story-from-the-panel", renamed.slug);

/* -- publishing confirms in place, rather than a toast you can miss ------- */

check("publishing shows a confirmation that stays on screen",
  (await page.locator(".done").count()) === 1 &&
  (await page.locator(".done").textContent()).includes("live on the website"));
check("the confirmation links to the published page",
  (await page.locator('.done a[href^="/news/"]').count()) === 1);
await page.click("#donelist");
await page.waitForSelector(".row");
check("the row it returns to is marked as just published",
  (await page.locator(".row.is-new").count()) === 1);

/* -- image upload ---------------------------------------------------------- */

await page.waitForSelector(".row");
await page.click(".row"); /* newest by date = our story */
await page.waitForSelector("#ef");
check("editing reopens the story", (await page.locator('[data-f="title"]').inputValue()) === "Test Story From The Panel (corrected)");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await writeFile(join(work, "probe.png"), png);
await page.setInputFiles('[data-pick="image"] input[type=file]', join(work, "probe.png"));
await page.waitForFunction(() => document.querySelector('[data-pick="image"] [data-f]').value.startsWith("/uploads/"));
/* The stored name carries a content hash, so assert on where the panel says
   the file went rather than on a name we predict. */
const uploaded = await page.inputValue('[data-pick="image"] [data-f]');
check("image upload lands in /uploads/",
  /^\/uploads\/probe-[0-9a-f]{8}\.png$/.test(uploaded) &&
  existsSync(join(work, "site/static/uploads", uploaded.split("/").pop())), uploaded);

/* Same file, same name, different bytes: the second upload must not land on
   top of the first, or an already-published story silently changes photo. */
const png2 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
await writeFile(join(work, "probe.png"), png2);
await page.setInputFiles('[data-pick="image"] input[type=file]', join(work, "probe.png"));
await page.waitForFunction((first) => {
  const v = document.querySelector('[data-pick="image"] [data-f]').value;
  return v.startsWith("/uploads/") && v !== first;
}, uploaded);
const uploaded2 = await page.inputValue('[data-pick="image"] [data-f]');
check("a same-named upload does not overwrite the first",
  uploaded2 !== uploaded && existsSync(join(work, "site/static/uploads", uploaded.split("/").pop())),
  `${uploaded} then ${uploaded2}`);
await page.click("#ef button[type=submit]");
await page.waitForSelector(".toast.show");

/* -- gallery manager ------------------------------------------------------- */

await page.click("[data-nav='gallery']");
await page.waitForSelector(".gitem");
const before = await page.locator(".gitem").count();
/* Drive this from the real file so trimming the gallery does not fail a test */
const galleryCount = JSON.parse(readFileSync(join(work, "site/content/gallery.json"), "utf8")).photos.length;
check("gallery loads the existing photos", before === galleryCount, `${before} of ${galleryCount}`);

/* The grid styles were there all along but the container was never given the
   class, so every photo took a full-width row and eight of them made a page
   seven thousand pixels tall. Nothing else in this file would have noticed. */
const galGrid = await page.evaluate(() => {
  const g = document.getElementById("gal");
  const cs = getComputedStyle(g);
  return { display: cs.display, columns: cs.gridTemplateColumns.split(" ").length };
});
check("the gallery lays photos out as a grid", galGrid.display === "grid", galGrid.display);
check("the gallery shows several photos per row", galGrid.columns >= 3, `${galGrid.columns} column(s)`);

await page.fill('[data-cap="0"]', "Captioned by the test");
await page.click("#savegal");
await page.waitForSelector(".toast.show");
await page.waitForTimeout(300);
const gal = JSON.parse(await readFile(join(work, "site/content/gallery.json"), "utf8"));
check("gallery publish saves captions", gal.photos[0].caption === "Captioned by the test");

/* -- users and privileges -------------------------------------------------- */

await page.click("[data-nav='users']");
await page.waitForSelector("#adduser");

/* The lockout nobody is warned about: only an administrator can reset a
   password, so a lone administrator who forgets theirs shuts everyone out
   until the accounts are cleared by hand. */
await page.waitForSelector("#ulist .row");
check("a lone administrator is warned about the lockout risk",
  (await page.locator("#ulist .statusbar").count()) === 1 &&
  (await page.locator("#ulist .statusbar").textContent()).includes("only administrator"));

await page.click("#adduser");
await page.waitForSelector("#uf");
await page.fill('#uf [name="name"]', "Sr. Editor");
await page.fill('#uf [name="email"]', "editor@example.org");
await page.fill('#uf [name="password"]', "editor-pass-99");
/* limit them to News + Gallery */
for (const sec of ["publications", "videos", "team"]) {
  await page.uncheck(`#usecs input[value="${sec}"]`);
}
await page.click("#uf button[type=submit]");
await page.waitForFunction(() => document.querySelectorAll("#ulist .row").length === 2);
check("new user appears in the list", true);

/* The other half of that warning: a second editor is not a second key, but a
   second administrator is, and then the notice must get out of the way. */
await page.click("#adduser");
await page.waitForSelector("#uf");
await page.fill('#uf [name="name"]', "Second Admin");
await page.fill('#uf [name="email"]', "second@example.org");
await page.fill('#uf [name="password"]', "second-pass-99");
await page.selectOption('#uf [name="role"]', "admin");
await page.click("#uf button[type=submit]");
await page.waitForFunction(() => document.querySelectorAll("#ulist .row").length === 3);
check("the lockout warning clears once there are two administrators",
  (await page.locator("#ulist .statusbar").count()) === 0);

/* put it back the way the rest of the file expects */
await page.click('#ulist .row[data-u="second@example.org"]');
await page.waitForSelector("#udel");
await page.click("#udel");
await page.waitForFunction(() => document.querySelectorAll("#ulist .row").length === 2);
check("the warning returns when the second administrator is removed",
  (await page.locator("#ulist .statusbar").count()) === 1);

await page.click("#logout");
await page.waitForSelector("#af");

/* wrong password is refused */
await page.fill('[name="email"]', "editor@example.org");
await page.fill('[name="password"]', "not-the-password");
await page.click("#af button");
await page.waitForSelector("#aerr.show");
check("wrong password is refused", (await page.locator("#aerr").textContent()).includes("Wrong"));

await page.fill('[name="password"]', "editor-pass-99");
await page.click("#af button");
await page.waitForSelector(".side");
check("editor signs in", (await page.locator(".side .who b").textContent()) === "Sr. Editor");
check("editor sees only their sections",
  (await page.locator("[data-nav='news']").count()) === 1 &&
  (await page.locator("[data-nav='gallery']").count()) === 1 &&
  (await page.locator("[data-nav='team']").count()) === 0 &&
  (await page.locator("[data-nav='users']").count()) === 0);

const forbidden = await page.evaluate(() =>
  fetch("/api/admin/content/team", { credentials: "same-origin" }).then((r) => r.status));
check("the API refuses sections outside their privileges", forbidden === 403);

/* -- delete the test story -------------------------------------------------- */

await page.click("[data-nav='news']");
await page.waitForSelector(".row");
await page.click(".row");
await page.waitForSelector("#delbtn");
await page.click("#delbtn");
await page.waitForSelector(".toast.show");
await page.waitForTimeout(300);
check("editors can delete within their sections", !existsSync(storyFile));

/* -- refuses to run unconfigured ------------------------------------------- */

/* An unset SESSION_SECRET did not stop anything: the session cookie was still
   signed, with an empty key that anyone can reproduce, so a forged cookie was
   a valid administrator. A fresh import picks the env up again. */
{
  const savedLocal = process.env.TK_LOCAL_DIR;
  const savedSecret = process.env.SESSION_SECRET;
  process.env.TK_LOCAL_DIR = "";
  delete process.env.SESSION_SECRET;
  delete process.env.TK_SECRET;
  const { default: unconfigured } = await import("../netlify/functions/admin-api.mjs?no-secret");
  /* Without the guard this reaches the Blobs client and throws, which would
     end the run on an error about storage rather than about the secret. */
  let status = 0, error = "";
  try {
    const res = await unconfigured(new Request("http://example.org/api/admin/status"));
    status = res.status;
    error = (await res.json().catch(() => ({}))).error || "";
  } catch (e) {
    error = `threw instead of refusing: ${e.message}`;
  }
  check("the API refuses to serve without SESSION_SECRET",
    status === 503 && /SESSION_SECRET/.test(error), `${status} ${error}`);
  process.env.TK_LOCAL_DIR = savedLocal;
  if (savedSecret) process.env.SESSION_SECRET = savedSecret;
}

await browser.close();
server.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
