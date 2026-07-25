/**
 * Drives the built videos page in a real browser against a stubbed WordPress
 * REST API.
 *
 *   node videos.mjs        (from the test/ directory)
 *
 * Builds its own harness — there is nothing to prepare first. External image
 * and player hosts are blocked at the network layer, which is both how the
 * sandbox behaves anyway and a useful assertion in itself: the page must be
 * usable when YouTube is unreachable.
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const built = await readFile(join(here, "..", "elementor", "videos-page.html"), "utf8");

/* ---- fixtures ---------------------------------------------------------- */

const SAMPLES = [
  { t: "Ending Human Trafficking Begins With You", ty: "Awareness Video", th: ["Prevention", "Advocacy"],
    u: "https://www.youtube.com/watch?v=CeH4o97KKPM", dur: "4:53", f: true,
    s: "An introduction to the work of Talitha Kum Kenya and the four Ps." },
  { t: "Know the Signs: Recruitment on Social Media", ty: "Training", th: ["Prevention", "Digital Safety"],
    u: "https://youtu.be/nfmBw6rmO7U?si=NcGUYAF", dur: "12:04",
    s: "A facilitator walks through the recruitment patterns targeting students." },
  { t: "Bakhita Day Reflection", ty: "Prayer & Reflection", th: ["Prayer", "Youth & Schools"],
    u: "https://www.youtube.com/shorts/abc123XYZ_9", dur: "1:20",
    s: "A short reflection for 8 February." },
  { t: "Border Sensitisation at Taveta", ty: "Event Highlights", th: ["Protection", "Partnership"],
    u: "https://vimeo.com/123456789", dur: "6:41",
    s: "Highlights from the border police sessions." },
  { t: "A Partner Speaks", ty: "Interview", th: ["Partnership"],
    u: "https://example.org/some/other/video", s: "Hosted elsewhere, opens on the original site." },
];

const enc = (s) => s.replace(/&/g, "&amp;");

const posts = SAMPLES.map((s, i) => {
  const d = new Date(Date.UTC(2026, 6 - i, 10 + i));
  return {
    id: 200 + i,
    slug: s.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48),
    status: "publish",
    date: d.toISOString(),
    title: { rendered: s.t },
    excerpt: { rendered: `<p>${s.s}</p>` },
    content: {
      rendered: `<!--TKVID:${JSON.stringify({
        url: s.u, dur: s.dur || "", featured: !!s.f, date: d.toISOString().slice(0, 10),
      })}-->\n<p>${s.s}</p>`,
    },
    _embedded: {
      "wp:term": [
        /* WordPress returns term names already HTML-encoded, so the stub does
           too — "Prayer &amp; Reflection". Encoding them here is what proves
           the page decodes once instead of escaping twice. */
        [{ id: 1, taxonomy: "category", name: "Videos", slug: "videos", parent: 0 },
         { id: 20 + i, taxonomy: "category", name: enc(s.ty), slug: s.ty.toLowerCase().replace(/\W+/g, "-"), parent: 1 }],
        s.th.map((t, j) => ({ id: 300 + j, taxonomy: "post_tag", name: enc(t), slug: t.toLowerCase().replace(/\W+/g, "-") })),
      ],
    },
  };
});

const stub = `
window.__V = ${JSON.stringify(posts)};
window.__CALLS = [];
window.fetch = function (url, opts) {
  var u = String(url);
  window.__CALLS.push({ url: u, method: (opts && opts.method) || "GET",
                        headers: (opts && opts.headers) || {} });
  var body = [], status = 200;
  if (u.indexOf("/categories") > -1) body = [{ id: 1, name: "Videos", slug: "videos", parent: 0 }];
  else if (u.indexOf("/users/me") > -1) body = { id: 4, name: "Sr. Comms", capabilities: { edit_posts: true, publish_posts: true } };
  else if (u.indexOf("/posts") > -1) body = window.__V;
  else if (u.indexOf("/tags") > -1) body = [];
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: status, headers: { "Content-Type": "application/json" } }));
};
`;

await mkdir(join(here, "shots"), { recursive: true });
await writeFile(join(here, "videos-harness.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Videos harness</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f4f2}
.w{max-width:1120px;margin:0 auto;padding:24px 16px 60px}</style>
<script>${stub}</script></head>
<body class="logged-in"><div class="w">${built}</div></body></html>`, "utf8");

/* ---- server ------------------------------------------------------------ */

const server = createServer(async (req, res) => {
  try {
    const b = await readFile(join(here, "videos-harness.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(4176, r));
const base = "http://127.0.0.1:4176/";

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
  /* Thumbnails and players live on hosts this sandbox cannot reach. Block
     them explicitly so the run is deterministic, and so every assertion
     below is really "works even with YouTube unreachable". */
  const asked = [];
  await page.route(/ytimg\.com|youtube|vimeo|googlevideo/, (r) => {
    asked.push(r.request().url());
    r.abort();
  });
  return { ctx, page, asked };
}

/* ---- desktop ----------------------------------------------------------- */

{
  const { ctx, page, asked } = await newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkvid-card", { timeout: 10000 });

  check("cards render", (await page.locator(".tkvid-card").count()) === 5,
    `${await page.locator(".tkvid-card").count()} cards`);
  check("featured video is promoted", (await page.locator(".tkvid-featured .tkvid-card").count()) === 1);

  /* The whole point of the page: nothing from YouTube until you press play. */
  const framesBefore = await page.locator("iframe").count();
  check("no player iframe exists before play", framesBefore === 0, `${framesBefore} iframes`);

  /* Thumbnails: derived from the link, sharpest size first, and the card
     walks down the sizes as each one fails. Every request is blocked here,
     so this also proves the walk terminates rather than looping. */
  await page.waitForTimeout(400);
  const shots = asked.filter((u) => u.includes("/vi/CeH4o97KKPM/"));
  check("YouTube thumbnail derived from the link, not uploaded", shots.length > 0, `${shots.length}`);
  check("sharpest frame asked for first", /maxresdefault/.test(shots[0] || ""), shots[0] || "none");
  check("walks down to a smaller size when one is missing",
    ["hq720", "sddefault", "hqdefault"].every((s) => shots.some((u) => u.includes(s))),
    shots.map((u) => u.split("/").pop()).join(" > "));

  /* Nothing may be left broken when every size fails — and a Vimeo link has
     no free thumbnail at all, so the coloured cover carries both cases. */
  const covers = await page.locator(".tkvid-card .tkvid-fallback").count();
  check("every card keeps a cover when YouTube is unreachable", covers === 5, `${covers}`);
  const leftovers = await page.locator(".tkvid-card img").count();
  check("no broken image is left in the page", leftovers === 0, `${leftovers} images`);

  /* Term names are decoded once, not escaped twice: "Youth &AMP; Schools"
     was the visible symptom on the live page. */
  const tagText = (await page.locator(".tkvid-tag").allTextContents()).join(" | ");
  check("an ampersand in a tag reads as one", tagText.includes("Youth & Schools"), tagText);
  const chipText = (await page.locator(".tkvid-chip").allTextContents()).join(" | ");
  check("an ampersand in a type chip reads as one",
    /Prayer & Reflection/.test(chipText) && !/&amp;|&AMP;/i.test(chipText), chipText);

  const chips = await page.locator(".tkvid-chip").count();
  check("type chips built from the data", chips === 6, `${chips} chips (All + 5 types)`);

  await page.click('.tkvid-chip[data-type="Training"]');
  await page.waitForTimeout(200);
  check("type filter works", (await page.locator(".tkvid-card").count()) === 1);
  await page.click('.tkvid-chip[data-type=""]');
  await page.waitForTimeout(200);

  await page.fill("#tkvid-search", "bakhita");
  await page.waitForTimeout(320);
  check("search works", (await page.locator(".tkvid-card").count()) === 1);
  await page.fill("#tkvid-search", "");
  await page.waitForTimeout(320);

  /* Play */
  await page.locator(".tkvid-card .tkvid-thumb").first().click();
  await page.waitForSelector("#tkvid-modal.is-open", { timeout: 5000 });
  const frames = await page.locator("#tkvid-frame iframe").count();
  check("pressing play creates exactly one iframe", frames === 1, `${frames}`);

  const embed = await page.locator("#tkvid-frame iframe").getAttribute("src");
  check("player uses the privacy-preserving nocookie host",
    /youtube-nocookie\.com\/embed\/CeH4o97KKPM/.test(embed || ""), embed || "none");
  check("player autoplays and plays inline on iOS",
    /autoplay=1/.test(embed || "") && /playsinline=1/.test(embed || ""), embed || "");
  check("deep link written to the URL", page.url().includes("video="), page.url());
  check("page behind the player is pinned",
    await page.evaluate(() => getComputedStyle(document.body).position === "fixed"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Escape closes the player", (await page.locator("#tkvid-modal.is-open").count()) === 0);
  check("closing unloads the player entirely",
    (await page.locator("#tkvid-frame iframe").count()) === 0);
  check("deep link removed on close", !page.url().includes("video="));

  /* A link we cannot embed must say so rather than showing a black box. */
  const popup = page.waitForEvent("popup", { timeout: 4000 }).catch(() => null);
  await page.locator(".tkvid-card").last().locator(".tkvid-thumb").click();
  const opened = await popup;
  check("an unembeddable link opens on the original site instead", !!opened,
    "no new tab was opened");
  if (opened) await opened.close();
  check("no player opened for the unembeddable link",
    (await page.locator("#tkvid-modal.is-open").count()) === 0);

  await page.screenshot({ path: join(here, "shots", "videos-desktop.png"), fullPage: true });
  check("no uncaught JavaScript errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

/* ---- thumbnails that do load -------------------------------------------
   Everything above runs with YouTube unreachable. This block serves a real
   1280x720 frame for maxresdefault and a 404 for every other size, which is
   exactly what YouTube does, and measures what the reader actually sees.  */

const frame = await (async () => {
  const c = await browser.newContext();
  const p = await c.newPage();
  const url = await p.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = 1280; cv.height = 720;
    const x = cv.getContext("2d");
    x.fillStyle = "#134a8e"; x.fillRect(0, 0, 1280, 720);
    x.fillStyle = "#f7d14f"; x.beginPath(); x.arc(640, 360, 220, 0, 7); x.fill();
    return cv.toDataURL("image/jpeg", 0.7);
  });
  await c.close();
  return Buffer.from(url.split(",")[1], "base64");
})();

for (const [label, opts] of [
  ["desktop", { viewport: { width: 1280, height: 900 } }],
  ["360x800", { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.route(/ytimg\.com/, (r) => /maxresdefault/.test(r.request().url())
    ? r.fulfill({ status: 200, contentType: "image/jpeg", body: frame })
    : r.fulfill({ status: 404, contentType: "text/plain", body: "" }));
  await page.route(/youtube|vimeo|googlevideo/, (r) => r.abort());

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkvid-grid .tkvid-card .tkvid-thumb img.is-on", { timeout: 10000 });
  await page.waitForTimeout(500);   // let the quarter-second fade finish

  const shot = await page.evaluate(() => {
    const img = document.querySelector(".tkvid-grid .tkvid-card .tkvid-thumb img.is-on");
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { w: r.width, h: r.height, nat: img.naturalWidth, op: getComputedStyle(img).opacity };
  });
  check(`${label}: the frame is visible once it decodes`, shot && shot.op === "1",
    shot ? `opacity ${shot.op}` : "no image");
  check(`${label}: the 1280x720 frame is the one served`, shot && shot.nat === 1280,
    shot ? `${shot.nat}px` : "none");
  check(`${label}: the thumbnail is 16:9, not letterboxed 4:3`,
    shot && Math.abs(shot.w / shot.h - 16 / 9) < 0.02,
    shot ? `${Math.round(shot.w)}x${Math.round(shot.h)}` : "none");

  /* Bigger is the whole request. On a phone the card runs the full width of
     the column; on desktop three per row rather than four. */
  const floor = label === "desktop" ? 300 : 320;
  check(`${label}: the thumbnail is at least ${floor}px wide`, shot && shot.w >= floor,
    shot ? `${Math.round(shot.w)}px` : "none");

  const feat = await page.evaluate(() => {
    const n = document.querySelector(".tkvid-featured .tkvid-thumb");
    return n ? n.getBoundingClientRect().width : 0;
  });
  check(`${label}: the lead video gets the widest frame on the page`,
    feat >= (shot ? shot.w : 0), `${Math.round(feat)} vs ${shot ? Math.round(shot.w) : 0}`);

  /* Retina: at 3x the phone still gets more source pixels than it paints. */
  if (label !== "desktop") {
    check("360x800: the frame still out-resolves a 3x screen",
      shot && shot.nat >= shot.w * 3, shot ? `${shot.nat} vs ${Math.round(shot.w * 3)}` : "none");
  }

  await page.screenshot({ path: join(here, "shots", `videos-thumbs-${label.replace(/\s+/g, "")}.png`), fullPage: label === "desktop" });
  await ctx.close();
}

/* ---- phone -------------------------------------------------------------- */

for (const [label, dev] of [["360x800", null], ["iPhone 14", "iPhone 14"]]) {
  const { ctx, page } = dev ? await newPage(dev) : await (async () => {
    const c = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await c.newPage();
    await p.route(/ytimg\.com|youtube|vimeo|googlevideo/, (r) => r.abort());
    return { ctx: c, page: p };
  })();

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkvid-card", { timeout: 10000 });

  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: no horizontal overflow`, over <= 1, `${over}px`);

  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.tkvid button, .tkvid a, .tkvid input, .tkvid select').forEach((n) => {
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
    document.querySelectorAll(".tkvid input, .tkvid select, .tkvid textarea").forEach((n) => {
      if (!n.offsetParent) return;
      const fs = parseFloat(getComputedStyle(n).fontSize);
      if (fs < 16) out.push(`${n.id || n.tagName} ${fs}px`);
    });
    return out;
  });
  check(`${label}: form controls are at least 16px (no iOS zoom)`, fonts.length === 0, fonts.join(" | "));

  await page.locator(".tkvid-card .tkvid-thumb").first().click();
  await page.waitForSelector("#tkvid-modal.is-open", { timeout: 5000 });
  const box = await page.locator("#tkvid-frame").boundingBox();
  const vw = await page.evaluate(() => window.innerWidth);
  check(`${label}: the video fills the phone width`, box && box.width >= vw * 0.95,
    box ? `${Math.round(box.width)} of ${vw}` : "no frame");
  const closeBox = await page.locator(".tkvid-x").boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  check(`${label}: the close button is on screen`, closeBox && closeBox.y + closeBox.height <= vh + 1,
    closeBox ? `bottom ${Math.round(closeBox.y + closeBox.height)} vs ${vh}` : "not found");
  await page.screenshot({ path: join(here, "shots", `videos-${label.replace(/\s+/g, "")}.png`) });
  await ctx.close();
}

/* ---- staff panel -------------------------------------------------------- */

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route(/ytimg\.com|youtube|vimeo|googlevideo/, (r) => r.abort());
  await page.addInitScript(() => { window.tkpubNonce = "vid-nonce"; });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tkvid-card", { timeout: 10000 });

  check("panel is drawn for a logged-in user",
    (await page.locator("#tkvid-admin.is-visible").count()) === 1);
  await page.waitForSelector("#tkvid-form", { state: "attached", timeout: 8000 });
  check("the nonce signs the panel in without a password",
    await page.evaluate(() => document.querySelector("#tkvid-auth").hidden));

  await page.click("[data-toggle]");
  await page.waitForTimeout(250);

  /* Validation: an empty form must not post anything. */
  const before = await page.evaluate(() => window.__CALLS.filter((c) => c.method === "POST").length);
  await page.click('#tkvid-form [data-save="publish"]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__CALLS.filter((c) => c.method === "POST").length);
  check("an empty form is rejected before anything is posted", after === before, `${before} -> ${after}`);
  check("the missing fields are marked",
    (await page.locator("#tkvid-form .tkvid-err:not([hidden])").count()) >= 3);

  /* The paste preview is the feature that stops a wrong link going live. */
  await page.fill("#tkvid-url", "https://youtu.be/nfmBw6rmO7U?si=xyz");
  await page.waitForTimeout(250);
  const prev = await page.locator("#tkvid-prev").innerText();
  check("pasting a link previews the video immediately", /YouTube/i.test(prev), prev.slice(0, 60));

  await page.fill("#tkvid-url", "https://example.org/not/a/known/host");
  await page.waitForTimeout(250);
  const prev2 = await page.locator("#tkvid-prev").innerText();
  check("an unembeddable link says so before publishing",
    /open on the original site/i.test(prev2), prev2.slice(0, 80));

  await page.fill("#tkvid-url", "https://www.youtube.com/watch?v=CeH4o97KKPM");
  await page.fill("#tkvid-t", "Test video");
  await page.selectOption("#tkvid-ty", "Training");
  await page.click('#tkvid-th input[value="Prevention"] + span');
  await page.waitForTimeout(150);
  await page.click('#tkvid-form [data-save="draft"]');
  await page.waitForTimeout(700);

  const posted = await page.evaluate(() =>
    window.__CALLS.filter((c) => c.method === "POST" && /\/posts/.test(c.url)).length);
  check("a complete form posts the video", posted === 1, `${posted} posts`);
  const nonced = await page.evaluate(() =>
    window.__CALLS.filter((c) => c.headers && c.headers["X-WP-Nonce"] === "vid-nonce").length);
  check("writes carry the REST nonce", nonced > 0, `${nonced} calls`);

  await page.screenshot({ path: join(here, "shots", "videos-panel.png"), fullPage: true });
  await ctx.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
