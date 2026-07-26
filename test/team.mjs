/**
 * Drives the built team page in a real browser against a stubbed WordPress
 * REST API.
 *
 *   node team.mjs        (from the test/ directory)
 *
 * Builds its own harness. Portrait URLs point at a host this sandbox cannot
 * reach; most of the run leaves them blocked, which doubles as an assertion
 * that the page is complete without them. One block serves real portraits
 * and measures what a visitor actually sees.
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const built = await readFile(join(here, "..", "elementor", "team-page.html"), "utf8");

/* ---- fixtures ----------------------------------------------------------
   The board is the one the client actually published, so the ordering and
   the honorifics in the monograms are exercised on real shapes.          */

const PHOTO = "https://talithakumraht.org/wp-content/uploads/2026/07/";

const SAMPLES = [
  { n: "Sr. Joyce Nyagucha", r: "Board Vice Chair", g: "Board", o: 20,
    p: "Sr-Joyce-Nyagucha-Board-Vice-Chair.jpeg",
    b: "Vice chair of the board and a long-standing voice for survivor care across the network." },
  { n: "Sr. Mary Gitau", r: "Board Treasurer", g: "Board", o: 30, p: "Sr-Mary-Gitau-Board-treasurer.jpeg" },
  { n: "Bro. Bernard Juma", r: "Board Member", g: "Board", o: 50, p: "Bro-Bernard-Juma-Board-member.jpeg" },
  { n: "Sr. Catherine Mutindi", r: "Board Member", g: "Board", o: 50,
    p: "Sr-Catherine-Mutindi-Board-Member.jpeg",
    b: "Works with children in mining communities and brings that experience to the board." },
  { n: "Bildad Keke", r: "Board Member", g: "Board", o: 50, p: "Bildadrd-Keke-board-member.jpeg" },
  { n: "Grace Wanjiru", r: "National Coordinator", g: "Staff", o: 10, p: "" },
  { n: "Peter Otieno", r: "Programme Officer", g: "Staff", o: 50, p: "" },
];

const enc = (s) => s.replace(/&/g, "&amp;");

const posts = SAMPLES.map((s, i) => ({
  id: 500 + i,
  slug: s.n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  status: "publish",
  date: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
  title: { rendered: s.n },
  excerpt: { rendered: s.b ? `<p>${s.b}</p>` : "" },
  content: {
    rendered: `<!--TKTEAM:${JSON.stringify({
      role: s.r, photo: s.p ? PHOTO + s.p : "", order: s.o,
    })}-->\n<p>${s.b || ""}</p>`,
  },
  _embedded: {
    /* WordPress returns term names already HTML-encoded. */
    "wp:term": [[
      { id: 1, taxonomy: "category", name: "Team", slug: "team", parent: 0 },
      { id: 60 + (s.g === "Board" ? 0 : 1), taxonomy: "category", name: enc(s.g),
        slug: s.g.toLowerCase(), parent: 1 },
    ]],
  },
}));

const stub = `
window.__T = ${JSON.stringify(posts)};
window.__CALLS = [];
window.fetch = function (url, opts) {
  var u = String(url);
  window.__CALLS.push({ url: u, method: (opts && opts.method) || "GET",
                        headers: (opts && opts.headers) || {} });
  var body = [];
  if (u.indexOf("/categories") > -1) body = [{ id: 1, name: "Team", slug: "team", parent: 0 }];
  else if (u.indexOf("/users/me") > -1) body = { id: 4, name: "Sr. Comms", capabilities: { edit_posts: true, publish_posts: true } };
  else if (u.indexOf("/media") > -1) body = { source_url: "${PHOTO}uploaded.jpeg",
    media_details: { sizes: { medium_large: { source_url: "${PHOTO}uploaded-768x1024.jpeg" } } } };
  else if (u.indexOf("/posts") > -1) body = window.__T;
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" } }));
};
`;

await mkdir(join(here, "shots"), { recursive: true });
await writeFile(join(here, "team-harness.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Team harness</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f4f2}
.w{max-width:1120px;margin:0 auto;padding:24px 16px 60px}</style>
<script>${stub}</script></head>
<body class="logged-in"><div class="w">${built}</div></body></html>`, "utf8");

/* ---- server ------------------------------------------------------------ */

const server = createServer(async (req, res) => {
  try {
    const b = await readFile(join(here, "team-harness.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(4177, r));
const base = "http://127.0.0.1:4177/";

/* ---- harness ----------------------------------------------------------- */

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  <- " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function newPage(deviceName) {
  const ctx = await browser.newContext(
    deviceName ? { ...devices[deviceName] } : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/talithakumraht\.org/, (r) => r.abort());
  return { ctx, page };
}


/* ---- desktop ----------------------------------------------------------- */

{
  const { ctx, page } = await newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkteam-card", { timeout: 10000 });

  const cards = await page.locator(".tkteam-card").count();
  check("everybody is on the page", cards === 7, `${cards} cards`);

  const heads = await page.locator(".tkteam-gh h2").allTextContents();
  check("one section per group, board first", heads.join("|") === "Board|Staff", heads.join("|"));

  const counts = await page.locator(".tkteam-gh span").allTextContents();
  check("each section counts its own people", counts.join("|") === "5 people|2 people", counts.join("|"));

  /* Display order is the whole point of the field: chair, vice chair,
     treasurer, then members. */
  const board = await page.locator(".tkteam-group").first().locator(".tkteam-role").allTextContents();
  check("display order is respected",
    board[0] === "Board Vice Chair" && board[1] === "Board Treasurer", board.slice(0, 3).join(" | "));

  /* An honorific is not an initial. */
  const monos = await page.locator(".tkteam-grid .tkteam-mono").allTextContents();
  check("monogram uses the name, not the honorific", monos[0] === "JN", monos.slice(0, 3).join(" "));
  check("everyone has a monogram behind the portrait", monos.length === 7, `${monos.length}`);

  /* With the photo host unreachable, nothing may be left broken. */
  await page.waitForTimeout(400);
  const imgs = await page.locator(".tkteam-grid img").count();
  check("no broken portrait is left in the page", imgs === 0, `${imgs} images`);

  const chips = await page.locator(".tkteam-chip").allTextContents();
  check("group filter built from the data", chips.join("|") === "Everyone7|Board5|Staff2", chips.join("|"));

  await page.click('.tkteam-chip[data-group="Staff"]');
  await page.waitForTimeout(150);
  check("group filter works", (await page.locator(".tkteam-card").count()) === 2);
  await page.click('.tkteam-chip[data-group=""]');
  await page.waitForTimeout(150);

  /* Only people with a biography are clickable — no dead taps. */
  const buttons = await page.locator("button.tkteam-card").count();
  check("only people with a biography are clickable", buttons === 2, `${buttons} clickable`);

  await page.locator("button.tkteam-card").first().click();
  await page.waitForSelector("#tkteam-modal.is-open", { timeout: 5000 });
  check("the profile opens", (await page.locator(".tkteam-sbody h2").textContent()) === "Sr. Joyce Nyagucha");
  check("the profile carries the group", (await page.locator(".tkteam-sgroup").textContent()) === "Board");
  check("deep link written to the URL", page.url().includes("person=sr-joyce-nyagucha"), page.url());
  check("page behind the profile is pinned",
    await page.evaluate(() => getComputedStyle(document.body).position === "fixed"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Escape closes the profile", (await page.locator("#tkteam-modal.is-open").count()) === 0);
  check("deep link removed on close", !page.url().includes("person="), page.url());

  await page.screenshot({ path: join(here, "shots", "team-desktop.png"), fullPage: true });
  check("no uncaught JavaScript errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

/* ---- portraits that do load --------------------------------------------
   Everything above runs with the photo host unreachable. This serves the
   real cropped portraits and measures what a visitor actually sees.      */

const portrait = await readFile(join(here, "..", "assets", "team", "sr-joyce-nyagucha-board-vice-chair.jpg"));

for (const [label, opts] of [
  ["desktop", { viewport: { width: 1280, height: 900 } }],
  ["360x800", { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.route(/talithakumraht\.org/, (r) =>
    r.fulfill({ status: 200, contentType: "image/jpeg", body: portrait }));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkteam-grid img.is-on", { timeout: 10000 });
  await page.waitForTimeout(450);

  const shot = await page.evaluate(() => {
    const img = document.querySelector(".tkteam-grid img.is-on");
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { w: r.width, h: r.height, nat: img.naturalWidth, op: getComputedStyle(img).opacity };
  });
  check(`${label}: the portrait is visible once it decodes`, shot && shot.op === "1",
    shot ? `opacity ${shot.op}` : "no image");
  check(`${label}: the portrait is 4:5, never squashed`,
    shot && Math.abs(shot.w / shot.h - 0.8) < 0.02,
    shot ? `${Math.round(shot.w)}x${Math.round(shot.h)}` : "none");
  const floor = label === "desktop" ? 200 : 150;
  check(`${label}: the portrait is at least ${floor}px wide`, shot && shot.w >= floor,
    shot ? `${Math.round(shot.w)}px` : "none");

  if (label !== "desktop") {
    const cols = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".tkteam-grid")[0].children];
      const top = cards[0].getBoundingClientRect().top;
      return cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).length;
    });
    check("360x800: two portraits to a row on a phone", cols === 2, `${cols} per row`);
  }

  await page.screenshot({ path: join(here, "shots", `team-${label.replace(/\s+/g, "")}.png`),
    fullPage: label === "desktop" });
  await ctx.close();
}

/* ---- phone -------------------------------------------------------------- */

for (const [label, dev] of [["360x800", null], ["iPhone 14", "iPhone 14"]]) {
  const { ctx, page } = dev ? await newPage(dev) : await (async () => {
    const c = await browser.newContext({ viewport: { width: 360, height: 800 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await c.newPage();
    await p.route(/talithakumraht\.org/, (r) => r.abort());
    return { ctx: c, page: p };
  })();

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkteam-card", { timeout: 10000 });

  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: no horizontal overflow`, over <= 1, `${over}px`);

  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".tkteam button, .tkteam a, .tkteam input, .tkteam select").forEach((n) => {
      if (!n.offsetParent && getComputedStyle(n).position !== "fixed") return;
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.width >= 44 && r.height >= 44) return;
      out.push(`${n.tagName.toLowerCase()}.${(n.className || "").toString().split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  check(`${label}: every control is at least 44x44`, small.length === 0, small.slice(0, 4).join(" | "));

  const fonts = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".tkteam input, .tkteam select, .tkteam textarea").forEach((n) => {
      if (!n.offsetParent) return;
      const fs = parseFloat(getComputedStyle(n).fontSize);
      if (fs < 16) out.push(`${n.id || n.tagName} ${fs}px`);
    });
    return out;
  });
  check(`${label}: form controls are at least 16px (no iOS zoom)`, fonts.length === 0, fonts.join(" | "));

  await page.locator("button.tkteam-card").first().click();
  await page.waitForSelector("#tkteam-modal.is-open", { timeout: 5000 });
  const box = await page.locator(".tkteam-sheet").boundingBox();
  const vw = await page.evaluate(() => window.innerWidth);
  check(`${label}: the profile fills the phone width`, box && box.width >= vw * 0.98,
    box ? `${Math.round(box.width)} of ${vw}` : "no sheet");
  const x = await page.locator(".tkteam-x").boundingBox();
  check(`${label}: the close button is on screen`, x && x.y >= 0 && x.x + x.width <= vw + 1,
    x ? `${Math.round(x.x)},${Math.round(x.y)}` : "not found");

  await page.screenshot({ path: join(here, "shots", `team-phone-${label.replace(/\s+/g, "")}.png`) });
  await ctx.close();
}

/* ---- staff panel -------------------------------------------------------- */

{
  const { ctx, page } = await newPage();
  await page.addInitScript(() => { window.tkpubNonce = "test-nonce-123"; });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkteam-admin.is-visible", { timeout: 10000 });

  check("panel is drawn for a logged-in user",
    (await page.locator(".tkteam-abar h2").textContent()) === "Team panel");
  await page.waitForTimeout(300);
  check("the nonce signs the panel in without a password",
    (await page.locator("#tkteam-asub").textContent()).includes("WordPress session"));

  await page.click("[data-toggle]");
  await page.waitForTimeout(150);

  await page.click('#tkteam-form [data-save="publish"]');
  await page.waitForTimeout(200);
  const posted = await page.evaluate(() =>
    window.__CALLS.filter((c) => c.method === "POST" && c.url.includes("/posts")).length);
  check("an empty form is rejected before anything is posted", posted === 0, `${posted} posts`);
  check("the missing fields are marked", (await page.locator(".tkteam-bad").count()) >= 2);

  /* The card preview follows the name as it is typed. */
  await page.fill("#tkteam-n", "Sr. Pasilisa Namikoye");
  await page.waitForTimeout(150);
  check("the preview shows the monogram as the name is typed",
    (await page.locator("#tkteam-mono").textContent()) === "PN",
    await page.locator("#tkteam-mono").textContent());

  /* Uploading a photo fills the link field from the media library. */
  await page.setInputFiles("#tkteam-file", {
    name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait,
  });
  await page.waitForTimeout(400);
  const photo = await page.inputValue("#tkteam-photo");
  check("an uploaded photo fills the link from the media library",
    photo.includes("uploaded-768x1024"), photo || "empty");

  await page.fill("#tkteam-r", "Board Member");
  await page.fill("#tkteam-b", "A short biography.");
  await page.fill("#tkteam-o", "40");
  await page.click('#tkteam-form [data-save="publish"]');
  await page.waitForTimeout(400);

  const post = await page.evaluate(() =>
    window.__CALLS.filter((c) => c.method === "POST" && c.url.includes("/posts")).pop());
  check("a complete form posts the person", !!post, "nothing was posted");
  check("writes carry the REST nonce",
    !!post && post.headers["X-WP-Nonce"] === "test-nonce-123", JSON.stringify(post && post.headers));

  check("the manage list shows everyone with their role",
    (await page.locator("#tkteam-rows .tkteam-row").count()) === 7,
    `${await page.locator("#tkteam-rows .tkteam-row").count()} rows`);

  await page.screenshot({ path: join(here, "shots", "team-panel.png"), fullPage: true });
  await ctx.close();
}

/* ---- done --------------------------------------------------------------- */

await browser.close();
server.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
