/**
 * Mobile regression suite for the publications block.
 *
 * 95% of readers are on a phone, so every check below runs across a device
 * matrix rather than a single viewport. It drives the *built* artefact
 * (test/harness.html, produced by make-fixtures.mjs from
 * elementor/publications-page.html) in a real browser against the stubbed
 * WordPress REST API, and asserts behaviour rather than implementation:
 * layout integrity, touch ergonomics, the in-page PDF reader and the admin
 * panel.
 *
 *   cd test && node make-fixtures.mjs && node mobile.mjs
 *
 * Screenshots land in test/shots/mobile-<device>*.png.
 * Exits non-zero if any check fails.
 */

import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------------- */
/* Tunables — thresholds live here so a failure message can quote them.    */
/* ---------------------------------------------------------------------- */

const MIN_TOUCH = 44;          // Apple/Google minimum touch target, CSS px
const MIN_INPUT_FONT = 16;     // below this iOS Safari zooms the page on focus
const MAX_READER_HEADER = 84;  // reader header must stay a slim bar, not a column
const MIN_PAGE_FILL = 0.85;    // rendered PDF page vs the reader's available width
const EDGE_SLOP = 1;           // sub-pixel tolerance on the right edge

/* Elements that are genuinely decorative and cannot be finger targets.
   Deliberately empty: reporting a small control is more useful to the lead
   than excusing it. Add a CSS selector plus a reason only when an element
   truly is not a tap target. */
const TOUCH_ALLOWLIST = [
  // { selector: ".tkpub-example", reason: "why it is not a tap target" },
];

/* ---------------------------------------------------------------------- */
/* Preflight                                                              */
/* ---------------------------------------------------------------------- */

for (const f of ["harness.html", "fixtures/sample-1.pdf", "vendor/pdf.min.js"]) {
  try {
    await stat(join(here, f));
  } catch {
    console.error(
      `\nMissing test/${f}.\n` +
      `The mobile suite runs against the built harness and real PDF fixtures.\n` +
      `Build them first:\n\n    cd ${here}\n    node make-fixtures.mjs\n`
    );
    process.exit(1);
  }
}
await mkdir(join(here, "shots"), { recursive: true });

/* ---------------------------------------------------------------------- */
/* Static server — Content-Type matters, or Chromium downloads the harness */
/* ---------------------------------------------------------------------- */

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

const PORT = Number(process.env.PORT || 4174);
await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}/`;

/* ---------------------------------------------------------------------- */
/* Device matrix                                                          */
/* ---------------------------------------------------------------------- */

/* The registry entries carry a real UA, DPR and touch flags; the viewports
   are overridden to the sizes we actually want to guarantee. */
const MATRIX = [
  {
    name: "320x568-small-phone",
    label: "320x568  smallest phone still in use",
    phone: true,
    opts: {
      ...devices["Galaxy S9+"],
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    },
  },
  {
    name: "360x800-android",
    label: "360x800  common Android",
    phone: true,
    opts: {
      ...devices["Pixel 7"],
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    },
  },
  {
    name: "390x844-iphone14",
    label: "390x844  iPhone 14",
    phone: true,
    opts: {
      ...devices["iPhone 14"],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    },
  },
  {
    name: "768x1024-tablet",
    label: "768x1024 portrait tablet",
    phone: false,
    opts: {
      ...devices["iPad Mini"],
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2, hasTouch: true,
    },
  },
];

/* ---------------------------------------------------------------------- */
/* Result bookkeeping                                                     */
/* ---------------------------------------------------------------------- */

const results = [];
let group = "";
const check = (name, ok, detail = "") => {
  results.push({ device: group, name, ok, detail });
  const tail = detail ? (ok ? `  (${detail})` : `  <- ${detail}`) : "";
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${tail}`);
};

/* ---------------------------------------------------------------------- */
/* Page-side helpers, injected before every document                      */
/* ---------------------------------------------------------------------- */

function injectHelpers() {
  window.__mt = {
    describe(el) {
      if (!el) return "(missing)";
      let s = el.tagName.toLowerCase();
      if (el.id) s += "#" + el.id;
      if (el.classList && el.classList.length) {
        s += "." + Array.from(el.classList).slice(0, 3).join(".");
      }
      for (const a of ["data-open", "data-close", "data-save", "data-view", "data-tab", "data-dl"]) {
        if (el.hasAttribute && el.hasAttribute(a)) s += "[" + a + "]";
      }
      const label = (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("placeholder"))) || "";
      const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36);
      const note = text || label;
      return note ? s + ' "' + note + '"' : s;
    },
    /* Rendered and not visually hidden. Screen-reader-only controls and the
       opacity:0 checkboxes behind their labels are not finger targets. */
    visible(el) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (parseFloat(cs.opacity) === 0) return false;
      if (el.closest && el.closest(".tkpub-sr")) return false;
      if (el.classList && el.classList.contains("tkpub-sr")) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    },
    /* True when an ancestor scrolls or clips horizontally, in which case an
       element past the right edge is intentional, not a layout bug. */
    clippedX(el) {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    },
    roots() {
      return Array.from(document.querySelectorAll(".tkpub"));
    },
    /* Every match for `sel` inside any .tkpub root, roots included. */
    all(sel) {
      const out = new Set();
      this.roots().forEach((r) => {
        if (r.matches(sel)) out.add(r);
        r.querySelectorAll(sel).forEach((e) => out.add(e));
      });
      return Array.from(out);
    },
    rect(el) {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    },
  };
}

/* ---------------------------------------------------------------------- */
/* Measurements                                                           */
/* ---------------------------------------------------------------------- */

const docOverflow = (page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

/* What is actually making the document wider than the screen. Unlike the
   check below this does NOT skip visually hidden elements — an opacity:0 or
   visibility:hidden box is still laid out and still widens the document. */
const widestOffenders = (page) => page.evaluate((slop) => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  window.__mt.all("*").forEach((el) => {
    if (getComputedStyle(el).display === "none") return;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + slop) return;
    if (window.__mt.clippedX(el)) return;
    out.push({ sel: window.__mt.describe(el), right: Math.round(r.right), width: Math.round(r.width) });
  });
  out.sort((a, b) => b.right - a.right);
  return out.slice(0, 5);
}, EDGE_SLOP);

async function checkNoDocOverflow(page, where) {
  const o = await docOverflow(page);
  const ok = o.over <= EDGE_SLOP;
  let blame = "";
  if (!ok) {
    const bad = await widestOffenders(page);
    blame = bad.length ? "; widest: " + bad.map((b) => `${b.sel} right=${b.right}`).join(" | ") : "";
  }
  check(
    `no horizontal page overflow — ${where}`,
    ok,
    `scrollWidth ${o.scrollWidth} vs clientWidth ${o.clientWidth} (+${o.over}px, expected <= +${EDGE_SLOP})${blame}`
  );
}

/* Elements poking past the right edge of the viewport. */
const overflowingElements = (page) => page.evaluate((slop) => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  window.__mt.all("*").forEach((el) => {
    if (!window.__mt.visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + slop) return;
    if (window.__mt.clippedX(el)) return;
    out.push({ sel: window.__mt.describe(el), right: Math.round(r.right), vw });
  });
  out.sort((a, b) => b.right - a.right);
  return out.slice(0, 6);
}, EDGE_SLOP);

async function checkNoElementOverflow(page, where) {
  const bad = await overflowingElements(page);
  check(
    `nothing sticks out past the right edge — ${where}`,
    bad.length === 0,
    bad.map((b) => `${b.sel} right=${b.right} > ${b.vw}`).join(" | ")
  );
}

/* Controls that must be fully reachable, not sliced off by the viewport. */
const measureAll = (page, selector, scope) => page.evaluate(({ selector, scope }) => {
  const root = scope ? document.querySelector(scope) : document;
  if (!root) return null;
  /* A control sitting in a rail the user can swipe sideways is reachable even
     though it is off-screen — that is the chip-rail pattern, not a bug. A
     control inside an overflow:hidden box, by contrast, really is unreachable. */
  const swipeable = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if ((ox === "auto" || ox === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  return Array.from(root.querySelectorAll(selector))
    .filter((el) => window.__mt.visible(el))
    .map((el) => ({
      sel: window.__mt.describe(el),
      ...window.__mt.rect(el),
      swipeable: swipeable(el),
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
    }));
}, { selector, scope });

async function checkWithinViewport(page, name, selector, { scope = null, vertical = false, expectAtLeast = 1 } = {}) {
  const found = await measureAll(page, selector, scope);
  if (!found || found.length < expectAtLeast) {
    check(name, false, `expected at least ${expectAtLeast} visible element(s) matching ${selector}${scope ? " inside " + scope : ""}, found ${found ? found.length : 0}`);
    return;
  }
  const railed = found.filter((r) => r.swipeable).length;
  const bad = found.filter((r) => !r.swipeable && (
    r.left < -EDGE_SLOP || r.right > r.vw + EDGE_SLOP ||
    (vertical && (r.top < -EDGE_SLOP || r.bottom > r.vh + EDGE_SLOP))
  ));
  check(
    name,
    bad.length === 0,
    bad.length
      ? bad.map((b) =>
          `${b.sel} at left=${Math.round(b.left)} right=${Math.round(b.right)}` +
          (vertical ? ` top=${Math.round(b.top)} bottom=${Math.round(b.bottom)}` : "") +
          ` but the viewport is ${b.vw}x${b.vh}`
        ).join(" | ")
      : `${found.length} checked` + (railed ? `, ${railed} reachable by swiping a horizontal rail` : "")
  );
}

/* Touch targets below MIN_TOUCH in either dimension. */
const smallTouchTargets = (page) => page.evaluate(({ min, allow }) => {
  const out = [];
  window.__mt.all('button, a, input, select, [role="button"]').forEach((el) => {
    if (!window.__mt.visible(el)) return;
    if (allow.some((a) => el.matches(a.selector))) return;
    const r = el.getBoundingClientRect();
    if (r.width >= min && r.height >= min) return;
    out.push({
      sel: window.__mt.describe(el),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      area: r.width * r.height,
    });
  });
  out.sort((a, b) => a.area - b.area);
  return out;
}, { min: MIN_TOUCH, allow: TOUCH_ALLOWLIST });

async function checkTouchTargets(page, where) {
  const bad = await smallTouchTargets(page);
  const worst = bad.slice(0, 8).map((b) => `${b.sel} is ${b.w}x${b.h}`).join(" | ");
  check(
    `every interactive element is at least ${MIN_TOUCH}x${MIN_TOUCH} — ${where}`,
    bad.length === 0,
    bad.length ? `${bad.length} undersized; worst: ${worst}` : ""
  );
}

/* Inputs below 16px make iOS Safari zoom the page when they take focus. */
const smallInputFonts = (page) => page.evaluate((min) => {
  const out = [];
  window.__mt.all("input, select, textarea").forEach((el) => {
    if (!window.__mt.visible(el)) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (!(fs < min)) return;
    out.push({ sel: window.__mt.describe(el), fontSize: Math.round(fs * 100) / 100 });
  });
  out.sort((a, b) => a.fontSize - b.fontSize);
  return out;
}, MIN_INPUT_FONT);

async function checkInputFonts(page, where) {
  const bad = await smallInputFonts(page);
  check(
    `no form control under ${MIN_INPUT_FONT}px (iOS focus zoom) — ${where}`,
    bad.length === 0,
    bad.length
      ? `${bad.length} too small; ` + bad.slice(0, 8).map((b) => `${b.sel} is ${b.fontSize}px, expected >= ${MIN_INPUT_FONT}px`).join(" | ")
      : ""
  );
}

const wait = (page, ms) => page.waitForTimeout(ms);

/* ---------------------------------------------------------------------- */
/* One device run                                                         */
/* ---------------------------------------------------------------------- */

async function runDevice(browser, device) {
  group = device.name;
  console.log(`\n=== ${device.label}  [${device.name}] ===`);

  const context = await browser.newContext({ ...device.opts, reducedMotion: "reduce" });
  await context.addInitScript(injectHelpers);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const from = (m.location() && m.location().url) || "";
    if (from.endsWith("/favicon.ico")) return;   // the harness has no favicon
    errors.push(m.text() + " (" + from + ")");
  });
  page.on("requestfailed", (r) => {
    if (!r.url().endsWith("/favicon.ico")) errors.push("requestfailed " + r.url());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(r.status() + " " + r.url());
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".tkpub-card", { timeout: 15000 });
  await wait(page, 250);

  /* ---- 1/2/3  listing layout ----------------------------------------- */

  await checkNoDocOverflow(page, "listing");
  await checkNoElementOverflow(page, "listing");

  await checkWithinViewport(page, "card action buttons are fully within the viewport",
    ".tkpub-card .tkpub-actions .tkpub-btn, .tkpub-card .tkpub-actions a, .tkpub-card .tkpub-actions button",
    { expectAtLeast: 2 });

  await checkWithinViewport(page, "toolbar controls are fully within the viewport",
    "#tkpub-search, .tkpub-select, .tkpub-views button, .tkpub-chip",
    { scope: ".tkpub-toolbar", expectAtLeast: 4 });

  /* ---- 4/5  touch ergonomics (phones only) --------------------------- */

  if (device.phone) {
    await checkTouchTargets(page, "listing");
    await checkInputFonts(page, "listing");
  }

  await page.screenshot({ path: join(here, "shots", `mobile-${device.name}.png`), fullPage: true });

  /* ---- 1  with filters applied --------------------------------------- */

  const typeChip = page.locator("#tkpub-type-facets .tkpub-chip").first();
  if (await typeChip.count()) {
    await typeChip.click();
    await wait(page, 300);
  }
  const themeChip = page.locator("#tkpub-theme-facets .tkpub-chip").first();
  if (await themeChip.count()) {
    await themeChip.click();
    await wait(page, 300);
  }
  await checkNoDocOverflow(page, "filters applied");
  await checkNoElementOverflow(page, "filters applied");

  const reset = page.locator("[data-reset]").first();
  if (await reset.count()) {
    await reset.click();
    await wait(page, 300);
  }

  /* ---- 1  list view --------------------------------------------------- */

  await page.click('[data-view="list"]');
  await wait(page, 350);
  await checkNoDocOverflow(page, "list view");
  await checkNoElementOverflow(page, "list view");
  await checkWithinViewport(page, "list-view card actions are fully within the viewport",
    ".tkpub-card .tkpub-actions .tkpub-btn, .tkpub-card .tkpub-actions a, .tkpub-card .tkpub-actions button",
    { expectAtLeast: 2 });
  await page.click('[data-view="grid"]');
  await wait(page, 300);

  /* ---- 6..12  the document reader ------------------------------------ */

  /* Park the page part-way down so a scroll leak behind the reader shows up.
     Read the offset AFTER scrolling the trigger into view: Playwright scrolls
     an element into view before clicking it, so a reading taken earlier is not
     where the page actually was when the reader opened. */
  await page.evaluate(() => window.scrollTo(0, 320));
  await wait(page, 150);
  const trigger = page.locator("#tkpub-grid .tkpub-card [data-open]").first();
  await trigger.scrollIntoViewIfNeeded();
  await wait(page, 150);
  const scrollYBefore = await page.evaluate(() => window.scrollY);

  await trigger.click();
  const opened = await page.waitForSelector("#tkpub-modal.is-open", { timeout: 10000 })
    .then(() => true).catch(() => false);
  check("tapping Read opens the reader", opened);

  if (opened) {
    await wait(page, 400);

    /* While the reader is open the page is pinned with position:fixed, so
       window.scrollY reads 0 by design — the offset lives in body.style.top.
       What actually matters to a reader is where the list is when they come
       back out, so assert that instead. It is checked again after close. */
    const pinned = await page.evaluate(() => ({
      y: window.scrollY,
      top: document.body.style.top,
      fixed: getComputedStyle(document.body).position === "fixed",
    }));
    check("the page behind the reader is pinned, not scrolled",
      pinned.fixed && pinned.top === `-${Math.round(scrollYBefore)}px`,
      `body position=${pinned.fixed ? "fixed" : "not fixed"} top=${pinned.top || "unset"}, ` +
      `expected top=-${Math.round(scrollYBefore)}px (scrollY reads ${Math.round(pinned.y)} while pinned)`);

    /* 6 — the reader owns the whole screen on a phone. */
    const panel = await page.evaluate(() => {
      const p = document.querySelector("#tkpub-modal .tkpub-modal-panel") ||
                document.querySelector("#tkpub-modal > *");
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return {
        w: r.width, h: r.height,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
      };
    });
    if (device.phone) {
      const wRatio = panel ? panel.w / panel.vw : 0;
      const hRatio = panel ? panel.h / panel.vh : 0;
      check("the reader fills the phone screen",
        !!panel && wRatio >= 0.98 && hRatio >= 0.95,
        panel
          ? `panel ${Math.round(panel.w)}x${Math.round(panel.h)} of ${panel.vw}x${panel.vh} ` +
            `= ${Math.round(wRatio * 100)}% wide / ${Math.round(hRatio * 100)}% tall, expected >= 98% / 95%`
          : "no reader panel found");
    }

    /* 7 — the title truncates on one line instead of building a tall column. */
    const head = await page.evaluate(() => {
      const modal = document.querySelector("#tkpub-modal");
      const title = modal && modal.querySelector("h2");
      const header = (modal && modal.querySelector(".tkpub-modal-bar, header")) ||
                     (title && title.parentElement && title.parentElement.parentElement);
      if (!header || !title) return null;
      const cs = getComputedStyle(title);
      let lh = parseFloat(cs.lineHeight);
      if (!isFinite(lh) || !lh) lh = parseFloat(cs.fontSize) * 1.4;
      return {
        headerHeight: header.getBoundingClientRect().height,
        titleScrollHeight: title.scrollHeight,
        titleClientHeight: title.clientHeight,
        lineHeight: lh,
        whiteSpace: cs.whiteSpace,
        textOverflow: cs.textOverflow,
        text: (title.textContent || "").trim().slice(0, 60),
      };
    });
    check("the reader header stays a slim bar",
      !!head && head.headerHeight <= MAX_READER_HEADER,
      head ? `header is ${Math.round(head.headerHeight)}px tall, expected <= ${MAX_READER_HEADER}px (title: "${head.text}")`
           : "no reader header found");
    check("the document title truncates to one line",
      !!head && head.titleScrollHeight <= head.lineHeight * 1.5 + 2,
      head ? `title scrollHeight ${head.titleScrollHeight}px, one line is ${Math.round(head.lineHeight)}px, ` +
             `allowed <= ${Math.round(head.lineHeight * 1.5 + 2)}px ` +
             `(white-space: ${head.whiteSpace}, text-overflow: ${head.textOverflow})`
           : "no reader title found");

    /* 8 — a real page renders. */
    let rendered = true;
    try {
      await page.waitForFunction(() => {
        const c = document.querySelector("#tkpub-modal canvas");
        return !!c && c.getBoundingClientRect().height > 200;
      }, null, { timeout: 15000 });
    } catch {
      rendered = false;
    }
    const stageText = rendered ? "" : await page.evaluate(() => {
      const s = document.querySelector("#tkpub-modal .tkpub-modal-stage, #tkpub-stage");
      return s ? (s.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140) : "no stage element";
    });
    check("a PDF page renders to a canvas within 15s", rendered,
      rendered ? "" : `no canvas taller than 200px appeared; the reader shows: "${stageText}"`);

    /* 9 — and it is legible, not a postage stamp ("51% zoom" bug). */
    const pageFill = await page.evaluate(() => {
      const c = document.querySelector("#tkpub-modal canvas");
      if (!c) return null;
      const stage = c.closest(".tkpub-modal-stage") || c.parentElement;
      const cs = getComputedStyle(stage);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const zoom = document.querySelector("#tkpub-modal .tkpub-zoomlevel");
      return {
        canvasWidth: c.getBoundingClientRect().width,
        stageWidth: stage.clientWidth,
        stageContentWidth: stage.clientWidth - padX,
        vw: document.documentElement.clientWidth,
        zoom: zoom ? (zoom.textContent || "").trim() : "n/a",
      };
    });
    if (pageFill) {
      const ratio = pageFill.canvasWidth / pageFill.stageWidth;
      check("the rendered page fills the reader at the default zoom",
        ratio >= MIN_PAGE_FILL,
        `page is ${Math.round(pageFill.canvasWidth)}px wide inside a ${pageFill.stageWidth}px reader ` +
        `= ${Math.round(ratio * 100)}%, expected >= ${Math.round(MIN_PAGE_FILL * 100)}% ` +
        `(content box ${Math.round(pageFill.stageContentWidth)}px, viewport ${pageFill.vw}px, zoom label ${pageFill.zoom})`);
    } else {
      check("the rendered page fills the reader at the default zoom", false,
        "no canvas to measure — see the canvas check above");
    }

    /* 1/2/3 — layout with the reader open. */
    await checkNoDocOverflow(page, "reader open");
    await checkNoElementOverflow(page, "reader open");
    await checkWithinViewport(page, "reader controls are fully within the viewport",
      "[data-prev], [data-next], [data-zoomin], [data-zoomout], [data-close], #tkpub-page-input",
      { scope: "#tkpub-modal", vertical: true, expectAtLeast: 3 });

    /* 11 — download and full screen, reported separately so the lead can see
       which one is missing rather than a bare count. */
    for (const [label, sel] of [["download", "[data-dl]"], ["full-screen", "[data-tab]"]]) {
      const state = await page.evaluate((sel) => {
        const els = Array.from(document.querySelectorAll("#tkpub-modal " + sel));
        if (!els.length) return { inDom: 0 };
        const shown = els.filter((e) => window.__mt.visible(e));
        const hiddenBy = els.map((e) => {
          const cs = getComputedStyle(e);
          return `display:${cs.display} visibility:${cs.visibility} opacity:${cs.opacity}`;
        });
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        return {
          inDom: els.length,
          shown: shown.length,
          hiddenBy,
          boxes: shown.map((e) => ({ sel: window.__mt.describe(e), ...window.__mt.rect(e) })),
          vw, vh,
        };
      }, sel);

      if (!state.inDom) {
        check(`the ${label} control is present and within the viewport`, false,
          `no ${sel} exists inside the reader at all`);
        continue;
      }
      if (!state.shown) {
        check(`the ${label} control is present and within the viewport`, false,
          `${state.inDom} ${sel} in the DOM but none rendered (${state.hiddenBy.join(" ; ")}) — ` +
          `it is hidden on this viewport, so the reader offers no ${label} control`);
        continue;
      }
      const off = state.boxes.filter((b) =>
        b.left < -EDGE_SLOP || b.right > state.vw + EDGE_SLOP ||
        b.top < -EDGE_SLOP || b.bottom > state.vh + EDGE_SLOP);
      check(`the ${label} control is present and within the viewport`, off.length === 0,
        off.length
          ? off.map((b) => `${b.sel} at left=${Math.round(b.left)} right=${Math.round(b.right)} ` +
              `top=${Math.round(b.top)} bottom=${Math.round(b.bottom)} but the viewport is ${state.vw}x${state.vh}`).join(" | ")
          : `${state.shown} visible`);
    }

    if (device.phone) await checkTouchTargets(page, "reader open");

    await page.screenshot({ path: join(here, "shots", `mobile-${device.name}-reader.png`) });

    /* 12 — scroll lock. */
    const lock = await page.evaluate(() => ({
      bodyClass: document.body.className,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyPosition: getComputedStyle(document.body).position,
    }));
    const lockedByClass = /lock|noscroll|no-scroll|modal-open|is-open/i.test(lock.bodyClass);
    const lockedByStyle = /hidden|clip/.test(lock.bodyOverflow) || /hidden|clip/.test(lock.htmlOverflow) ||
                          lock.bodyPosition === "fixed";
    check("the page behind the reader is scroll-locked",
      lockedByClass && lockedByStyle,
      `body class "${lock.bodyClass}" (lock class: ${lockedByClass ? "yes" : "no"}), ` +
      `body overflow ${lock.bodyOverflow}, html overflow ${lock.htmlOverflow} ` +
      `(effective lock: ${lockedByStyle ? "yes" : "no"})`);

    const stageBox = await page.locator("#tkpub-modal .tkpub-modal-stage, #tkpub-stage").first().boundingBox();
    if (stageBox) {
      await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
      await page.mouse.wheel(0, 900);
      await wait(page, 400);
      await page.mouse.wheel(0, 900);
      await wait(page, 400);
    }
    const after = await page.evaluate(() => {
      const s = document.querySelector("#tkpub-modal .tkpub-modal-stage, #tkpub-stage");
      return {
        scrollY: window.scrollY,
        stageScrollTop: s ? s.scrollTop : -1,
        stageScrollable: s ? s.scrollHeight > s.clientHeight : false,
      };
    });
    /* The page is pinned while the reader is open, so window.scrollY is 0
       throughout; what matters is that scrolling the stage does not move it. */
    check("scrolling inside the reader does not scroll the page behind it",
      Math.abs(after.scrollY - pinned.y) <= 1,
      `window.scrollY ${Math.round(pinned.y)} -> ${Math.round(after.scrollY)} (expected unchanged); ` +
      `the stage itself moved to scrollTop ${Math.round(after.stageScrollTop)} ` +
      `(scrollable: ${after.stageScrollable ? "yes" : "no"})`);

    /* 10 — close control, then Escape. */
    let clickErr = "";
    try {
      await page.locator("#tkpub-modal [data-close]").first().click({ timeout: 5000 });
    } catch (e) {
      clickErr = String(e.message || e).split("\n")[0];
      await page.locator("#tkpub-modal [data-close]").first().click({ timeout: 5000, force: true }).catch(() => {});
    }
    await wait(page, 350);
    const closed = (await page.locator("#tkpub-modal.is-open").count()) === 0;
    check("the close control is reachable and closes the reader", closed && !clickErr,
      clickErr ? `a normal tap on [data-close] failed: ${clickErr}` :
      (closed ? "" : "the reader stayed open after tapping close"));

    if (!closed) {
      await page.keyboard.press("Escape");
      await wait(page, 300);
    }

    /* Escape closes it too. */
    await page.locator("#tkpub-grid .tkpub-card [data-open]").first().click();
    const reopened = await page.waitForSelector("#tkpub-modal.is-open", { timeout: 10000 })
      .then(() => true).catch(() => false);
    if (reopened) {
      await wait(page, 400);
      await page.keyboard.press("Escape");
      await wait(page, 350);
      check("Escape closes the reader",
        (await page.locator("#tkpub-modal.is-open").count()) === 0);
      const unlock = await page.evaluate(() => ({
        bodyClass: document.body.className,
        overflow: getComputedStyle(document.body).overflow,
      }));
      const unlocked = !/lock|noscroll|no-scroll|modal-open/i.test(unlock.bodyClass) &&
                       !/hidden|clip/.test(unlock.overflow);
      check("the scroll lock is released when the reader closes", unlocked,
        `after closing, body class is "${unlock.bodyClass}" and body overflow is ${unlock.overflow}`);

      /* The one that readers actually feel: come back out of a document and
         the list is where you left it, not at the top. */
      const restored = await page.evaluate(() => window.scrollY);
      check("the reading position is restored when the reader closes",
        Math.abs(restored - scrollYBefore) <= 2,
        `window.scrollY was ${Math.round(scrollYBefore)} when the reader opened and ` +
        `${Math.round(restored)} after closing`);
    } else {
      check("Escape closes the reader", false, "the reader would not reopen");
    }
  } else {
    for (const skipped of [
      "the page behind the reader is pinned, not scrolled",
      "the reading position is restored when the reader closes",
      "the reader fills the phone screen",
      "the reader header stays a slim bar",
      "the document title truncates to one line",
      "a PDF page renders to a canvas within 15s",
      "the rendered page fills the reader at the default zoom",
      "reader controls are fully within the viewport",
      "the download control is present and within the viewport",
      "the full-screen control is present and within the viewport",
      "the page behind the reader is scroll-locked",
      "scrolling inside the reader does not scroll the page behind it",
      "the close control is reachable and closes the reader",
      "Escape closes the reader",
    ]) check(skipped, false, "the reader never opened — see the check above");
  }

  /* ---- 13  admin panel on a phone ------------------------------------ */

  await page.evaluate(() => window.scrollTo(0, 0));
  const adminVisible = await page.locator("#tkpub-admin.is-visible").count() === 1;
  check("the publishing panel is offered to a logged-in user", adminVisible);

  if (adminVisible) {
    await page.locator("#tkpub-admin [data-toggle]").first().click();
    await wait(page, 350);
    await checkNoDocOverflow(page, "admin panel open");

    await page.fill("#tkpub-user", "communications");
    await page.fill("#tkpub-pass", "abcd efgh ijkl mnop qrst uvwx");
    await page.click("#tkpub-login-form button[type=submit]");
    const formUp = await page.waitForSelector("#tkpub-form", { state: "visible", timeout: 10000 })
      .then(() => true).catch(() => false);
    check("signing in reveals the publishing form", formUp);

    if (formUp) {
      await wait(page, 300);
      await checkNoDocOverflow(page, "publishing form");
      await checkNoElementOverflow(page, "publishing form");
      if (device.phone) await checkInputFonts(page, "publishing form");

      /* The buttons live at the bottom of a long form, so scroll to them the
         way a user would before asking whether they are reachable — through
         every scrolling ancestor, not just the page. */
      await page.evaluate(() => {
        const b = document.querySelector('#tkpub-form [data-save="publish"]');
        if (b) b.scrollIntoView({ block: "center", inline: "nearest" });
      });
      await wait(page, 300);
      await page.locator('#tkpub-form [data-save="publish"]').first().scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 300);
      await checkWithinViewport(page, "Save draft and Publish are reachable within the viewport",
        '[data-save="draft"], [data-save="publish"]',
        { scope: "#tkpub-form", vertical: true, expectAtLeast: 2 });
      if (device.phone) await checkTouchTargets(page, "publishing form");

      await page.screenshot({ path: join(here, "shots", `mobile-${device.name}-admin.png`), fullPage: true });
    }
  }

  /* ---- console -------------------------------------------------------- */

  check("no uncaught JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await context.close();
}

/* ---------------------------------------------------------------------- */
/* Drive                                                                  */
/* ---------------------------------------------------------------------- */

/* This container ships a Chromium build that predates the npm playwright
   version, so point at it explicitly rather than downloading another. */
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

let fatal = null;
try {
  for (const device of MATRIX) {
    try {
      await runDevice(browser, device);
    } catch (e) {
      group = device.name;
      check("device run completed", false, String(e && e.message ? e.message : e).split("\n")[0]);
    }
  }
} catch (e) {
  fatal = e;
}

await browser.close();
server.close();

/* ---------------------------------------------------------------------- */
/* Summary                                                                */
/* ---------------------------------------------------------------------- */

const failed = results.filter((r) => !r.ok);

if (failed.length) {
  console.log("\n--- failures by device ---");
  for (const device of MATRIX) {
    const mine = failed.filter((r) => r.device === device.name);
    if (!mine.length) continue;
    console.log(`\n${device.label}  [${device.name}]  — ${mine.length} failing`);
    for (const r of mine) console.log(`  FAIL  ${r.name}${r.detail ? "\n        " + r.detail : ""}`);
  }
}

console.log("\n--- per device ---");
for (const device of MATRIX) {
  const mine = results.filter((r) => r.device === device.name);
  const ok = mine.filter((r) => r.ok).length;
  console.log(`  ${device.label.padEnd(38)} ${ok}/${mine.length}`);
}

console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (fatal) {
  console.error("\nsuite aborted: " + fatal.stack);
  process.exit(1);
}
process.exit(failed.length ? 1 : 0);
