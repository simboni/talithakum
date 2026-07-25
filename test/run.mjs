/**
 * Drives the built Elementor block in a real browser against a stubbed
 * WordPress REST API, asserts the behaviour, and writes screenshots.
 *
 *   node test/run.mjs
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".pdf": "application/pdf", ".png": "image/png", ".json": "application/json",
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split("?")[0]);
  if (path === "/") path = "/harness.html";
  try {
    const body = await readFile(join(here, path));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((r) => server.listen(4173, r));
const base = "http://127.0.0.1:4173/";

/* This container ships a Chromium build that predates the npm playwright
   version, so point at it explicitly rather than downloading another. */
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  <- " + detail : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const from = (m.location() && m.location().url) || "";
  if (from.endsWith("/favicon.ico")) return;   // the harness has no favicon
  errors.push(m.text() + " (" + from + ")");
});
/* The browser asks for a favicon the harness does not have — that is the
   harness's gap, not the page's, so it is not counted as an error. */
page.on("requestfailed", (r) => errors.push("requestfailed " + r.url()));
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) {
    errors.push(r.status() + " " + r.url());
  }
});

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".tkpub-card", { timeout: 10000 });

/* ---- public page ------------------------------------------------------ */

const cardCount = await page.locator("#tkpub-grid .tkpub-card").count();
check("cards render", cardCount > 0, `got ${cardCount}`);

const countText = await page.locator("#tkpub-count").innerText();
check("result count shows all 10", countText.includes("10"), countText);

check("featured hero present", await page.locator(".tkpub-featured").count() === 1);

const typeChips = await page.locator("#tkpub-type-facets .tkpub-chip").count();
check("type facets built from data", typeChips >= 6, `${typeChips} chips`);

await page.screenshot({ path: join(here, "shots", "01-grid.png"), fullPage: true });

/* search */
await page.fill("#tkpub-search", "bakhita");
await page.waitForTimeout(400);
const searched = await page.locator("#tkpub-grid .tkpub-card, .tkpub-featured").count();
const searchedCount = await page.locator("#tkpub-count").innerText();
check("search narrows results", searchedCount.trim().startsWith("1"), searchedCount);
check("featured hides while filtering", await page.locator(".tkpub-featured").count() === 0);

await page.fill("#tkpub-search", "");
await page.waitForTimeout(400);

/* type facet */
await page.click('#tkpub-type-facets .tkpub-chip[data-type="Policy Brief"]');
await page.waitForTimeout(250);
const briefs = await page.locator("#tkpub-grid .tkpub-card").count();
check("type filter works", briefs === 2, `${briefs} policy briefs`);

/* theme facet stacks with type */
await page.click('#tkpub-theme-facets .tkpub-chip[data-theme="Survivor Care"]');
await page.waitForTimeout(250);
check("filters combine", (await page.locator("#tkpub-grid .tkpub-card").count()) === 1);

await page.screenshot({ path: join(here, "shots", "02-filtered.png"), fullPage: true });

await page.click("[data-reset]");
await page.waitForTimeout(250);
check("reset restores everything", (await page.locator("#tkpub-count").innerText()).includes("10"));

/* list view */
await page.click('[data-view="list"]');
await page.waitForTimeout(200);
check("list view toggles", await page.locator("#tkpub-grid.is-list").count() === 1);
await page.screenshot({ path: join(here, "shots", "03-list.png"), fullPage: true });
await page.click('[data-view="grid"]');

/* ---- PDF reader ------------------------------------------------------- */

await page.locator("#tkpub-grid .tkpub-card [data-open]").first().click();
await page.waitForSelector("#tkpub-modal.is-open");
await page.waitForSelector("#tkpub-stage canvas", { timeout: 15000 });
await page.waitForTimeout(900);

const canvasBox = await page.locator("#tkpub-stage canvas").boundingBox();
check("pdf.js renders a page to canvas", canvasBox && canvasBox.height > 200,
  canvasBox ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}` : "no canvas");

const pageCountLabel = await page.locator(".tkpub-pagecount").innerText();
check("page count read from the PDF", /\/\s*\d+/.test(pageCountLabel), pageCountLabel);

check("deep link written to the URL", page.url().includes("publication="), page.url());

await page.screenshot({ path: join(here, "shots", "04-reader.png") });

await page.click("[data-next]");
await page.waitForTimeout(700);
check("next page advances", (await page.inputValue("#tkpub-page-input")) === "2",
  await page.inputValue("#tkpub-page-input"));

await page.click("[data-zoomin]");
await page.waitForTimeout(600);
const zoom = await page.locator(".tkpub-zoomlevel").innerText();
check("zoom control works", parseInt(zoom, 10) > 0, zoom);

await page.keyboard.press("Escape");
await page.waitForTimeout(250);
check("escape closes the reader", await page.locator("#tkpub-modal.is-open").count() === 0);
check("deep link removed on close", !page.url().includes("publication="));

/* deep link on load */
const deep = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await deep.goto(base + "?publication=" + (await page.evaluate(() => window.__TKPUB_FIXTURE__[3].slug)));
await deep.waitForSelector("#tkpub-modal.is-open", { timeout: 10000 });
check("shared deep link opens the reader on load", true);
await deep.close();

/* ---- admin panel ------------------------------------------------------ */

check("admin panel visible for a logged-in body class",
  await page.locator("#tkpub-admin.is-visible").count() === 1);

await page.click("[data-toggle]");
await page.waitForTimeout(200);
check("panel opens", await page.locator("#tkpub-admin.is-open").count() === 1);
check("sign-in required before the form appears",
  await page.locator("#tkpub-admin-main").isHidden());
await page.screenshot({ path: join(here, "shots", "05-admin-login.png"), fullPage: true });

await page.fill("#tkpub-user", "communications");
await page.fill("#tkpub-pass", "abcd efgh ijkl mnop qrst uvwx");
await page.click("#tkpub-login-form button[type=submit]");
await page.waitForSelector("#tkpub-form", { timeout: 8000 });
check("sign in reveals the publishing form", true);

const themeBoxes = await page.locator("#tkpub-f-themes input").count();
check("theme checkboxes present", themeBoxes === 12, `${themeBoxes}`);

/* validation */
await page.click('#tkpub-form [data-save="publish"]');
await page.waitForTimeout(250);
const shownErrors = await page.locator("#tkpub-form .tkpub-err:not([hidden])").count();
check("empty form is rejected with field errors", shownErrors >= 4, `${shownErrors} errors`);

await page.fill("#tkpub-f-title", "County Advocacy Toolkit 2026");
await page.fill("#tkpub-f-summary",
  "A practical toolkit for member congregations engaging county governments on anti-trafficking " +
  "commitments, with sample letters, meeting agendas and a one-page brief for county officials.");
await page.selectOption("#tkpub-f-type", "Policy Brief");
/* The checkbox itself is visually hidden — a user clicks the label, so does this. */
await page.click('#tkpub-f-themes input[value="Advocacy"] + span');
await page.click('#tkpub-f-themes input[value="Partnership"] + span');
check("clicking a theme label ticks its checkbox",
  await page.isChecked('#tkpub-f-themes input[value="Advocacy"]'));
await page.fill("#tkpub-f-keywords", "county governments, Nairobi, advocacy");
await page.waitForTimeout(150);

const words = await page.locator("#tkpub-summary-count").innerText();
check("summary word counter runs", /\d+ words/.test(words), words);

await page.setInputFiles("#tkpub-pdf-input", join(here, "fixtures", "sample-3.pdf"));
await page.waitForTimeout(1800);
const fileNote = await page.locator("#tkpub-pdf-chosen [data-file-note]").innerText();
check("page count read from the chosen PDF before upload", /pages/.test(fileNote), fileNote);

await page.screenshot({ path: join(here, "shots", "06-admin-form.png"), fullPage: true });

await page.click('[data-tab="manage"]');
await page.waitForTimeout(600);
check("manage tab lists existing publications",
  (await page.locator("#tkpub-manage .tkpub-row").count()) > 0);
await page.screenshot({ path: join(here, "shots", "07-admin-manage.png"), fullPage: true });

/* ---- mobile ----------------------------------------------------------- */

const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mob.goto(base, { waitUntil: "networkidle" });
await mob.waitForSelector(".tkpub-card");
const overflow = await mob.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow on mobile", overflow <= 1, `${overflow}px`);
await mob.screenshot({ path: join(here, "shots", "08-mobile.png"), fullPage: true });
await mob.close();

/* ---- console ---------------------------------------------------------- */

check("no uncaught JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
