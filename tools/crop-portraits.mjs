/**
 * Turns the board's photographed passport prints into web portraits.
 *
 *   node tools/crop-portraits.mjs
 *
 * The originals are small printed photographs taped to a wall or lying on a
 * desk, shot with a phone: the print is a fraction of the frame and most of
 * them are on their side. This rotates each one upright, finds the face and
 * frames a head-and-shoulders 4:5 portrait around it.
 *
 * The face is found by colour rather than by any model: skin in these prints
 * is strongly orange, while the paper, the desk and the print's own border
 * are not. Everything happens in Chromium, so there is no image library to
 * install and the result is reproducible on any machine with the browser
 * Playwright already ships.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "assets", "team-src");
const outDir = join(root, "assets", "team");

/* Rotation in degrees, positive clockwise, matched on part of the filename.
   Nearly every print was photographed on its side with the head to the
   right, which -90 puts upright.
   Automatic framing gets most of them right; zoom and nudge are the
   per-print corrections, judged from tools/contact-sheet. zoom multiplies
   the frame (below 1 is tighter), dx and dy shift it in frame widths.      */
const TUNE = {
  "bildad":    { rot: -90 },
  "bernard":   { rot: -90, zoom: 0.94 },
  "catherine": { rot: -90, zoom: 0.96 },
  "joyce":     { rot: -90, zoom: 0.74, dy: -0.03 },
  "mary gitau": { rot: -90 },
  "matilda":   { rot: -90 },
  "pasilisa":  { rot: -90, zoom: 0.62, dy: -0.04 },
  "whatsapp":  { rot: -90, zoom: 0.96 },
};
const tuneFor = (name) => {
  const hit = Object.keys(TUNE).find((k) => name.toLowerCase().includes(k));
  const t = hit ? TUNE[hit] : {};
  return { rot: t.rot || 0, zoom: t.zoom || 1, dx: t.dx || 0, dy: t.dy || 0 };
};

const files = (await readdir(srcDir))
  .filter((f) => /\.(jpe?g|png)$/i.test(f) && !f.startsWith("._"))
  .sort();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
await mkdir(outDir, { recursive: true });

const report = [];

for (const file of files) {
  const raw = await readFile(join(srcDir, file));
  const out = await page.evaluate(async ([src, tune]) => {
    const degrees = tune.rot;
    const im = new Image();
    im.src = src;
    await im.decode();

    /* Step one: upright. Everything after this works in one orientation. */
    const swap = Math.abs(degrees) === 90 || Math.abs(degrees) === 270;
    const RW = swap ? im.height : im.width;
    const RH = swap ? im.width : im.height;
    const rc = document.createElement("canvas");
    rc.width = RW; rc.height = RH;
    const rx = rc.getContext("2d");
    rx.translate(RW / 2, RH / 2);
    rx.rotate((degrees * Math.PI) / 180);
    rx.drawImage(im, -im.width / 2, -im.height / 2);

    /* Step two: find the face on a small copy. */
    const W = 200, H = Math.max(1, Math.round((W / RW) * RH));
    const s = document.createElement("canvas");
    s.width = W; s.height = H;
    const sx = s.getContext("2d", { willReadFrequently: true });
    sx.drawImage(rc, 0, 0, W, H);
    const px = sx.getImageData(0, 0, W, H).data;

    /* Skin in these prints: warm, red dominant, never grey. Paper, the desk
       and blue or green photo borders all fail at least one of these. */
    const mask = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      mask[p] = (r > 70 && r > g + 14 && g >= b - 6 && r - b > 28 && r - b < 190) ? 1 : 0;
    }
    /* Erode once so a warm speck on the paper cannot become a face. */
    const clean = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        clean[p] = mask[p] && mask[p - 1] && mask[p + 1] && mask[p - W] && mask[p + W] ? 1 : 0;
      }
    }

    const rows = new Int32Array(H), cols = new Int32Array(W);
    let total = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (clean[y * W + x]) { rows[y]++; cols[x]++; total++; }
    }
    const span = (prof, n) => {
      let peak = 0, at = 0;
      for (let i = 0; i < n; i++) if (prof[i] > peak) { peak = prof[i]; at = i; }
      const cut = Math.max(1, peak * 0.22);
      let a = at, b = at;
      while (a > 0 && prof[a - 1] >= cut) a--;
      while (b < n - 1 && prof[b + 1] >= cut) b++;
      return [a, b + 1];
    };

    let fx0, fx1, fy0, fy1, found = total > W * H * 0.004;
    if (found) {
      [fx0, fx1] = span(cols, W);
      [fy0, fy1] = span(rows, H);
    } else {                                  // nothing convincing: centre it
      fx0 = W * 0.35; fx1 = W * 0.65; fy0 = H * 0.3; fy1 = H * 0.55;
    }

    /* Step three: frame the portrait around the face. A passport print is
       head and shoulders already, so 2.7 face-widths of frame lands close to
       what a photographer would have chosen, and the eyes end up on the
       upper third rather than dead centre. */
    const scale = RW / W;
    const fw = (fx1 - fx0) * scale, fh = (fy1 - fy0) * scale;
    const fcx = (fx0 + fx1) / 2 * scale, fcy = (fy0 + fy1) / 2 * scale;

    let cw = Math.max(fw * 2.7, fh * 2.2) * tune.zoom;
    let ch = cw * 1.25;
    let cx = fcx - cw / 2 + cw * tune.dx;
    let cy = fcy - ch * 0.40 + ch * tune.dy;

    /* Stay inside the photograph rather than pulling in desk or wall. */
    if (cw > RW) { ch *= RW / cw; cw = RW; }
    if (ch > RH) { cw *= RH / ch; ch = RH; }
    cx = Math.max(0, Math.min(RW - cw, cx));
    cy = Math.max(0, Math.min(RH - ch, cy));

    const TW = 720, TH = 900;                 // 4:5
    const f = document.createElement("canvas");
    f.width = TW; f.height = TH;
    const fxc = f.getContext("2d");
    fxc.imageSmoothingQuality = "high";
    fxc.drawImage(rc, cx, cy, cw, ch, 0, 0, TW, TH);

    /* What the detector saw, for the contact sheet. */
    const d = document.createElement("canvas");
    d.width = W; d.height = H;
    const dx = d.getContext("2d");
    dx.drawImage(s, 0, 0);
    dx.strokeStyle = "#00ff88"; dx.lineWidth = 1.5;
    dx.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    dx.strokeStyle = "#ffcc00";
    dx.strokeRect(cx / scale, cy / scale, cw / scale, ch / scale);

    return {
      debug: d.toDataURL("image/jpeg", 0.7),
      url: f.toDataURL("image/jpeg", 0.86),
      found,
      face: [Math.round(fx0 / W * 100), Math.round(fy0 / H * 100),
             Math.round(fx1 / W * 100), Math.round(fy1 / H * 100)],
    };
  }, [`data:image/jpeg;base64,${raw.toString("base64")}`, tuneFor(file)]);

  const name = basename(file, extname(file))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .replace(/-+(board|member|vice|chair|treasurer)/g, "-$1");
  const buf = Buffer.from(out.url.split(",")[1], "base64");
  await writeFile(join(outDir, `${name}.jpg`), buf);
  report.push({ file, name, rot: tuneFor(file).rot, zoom: tuneFor(file).zoom, face: out.found, kb: (buf.length / 1024).toFixed(0), debug: out.debug });
}

/* A contact sheet, so the crops can be judged all at once. */
const sheet = report.map((r) =>
  `<figure><img src="${r.debug}" class="d"><img src="team/${r.name}.jpg">` +
  `<figcaption>${r.file}<br>rot ${r.rot} · zoom ${r.zoom}</figcaption></figure>`).join("");
await writeFile(join(root, "assets", "contact-sheet.html"),
  `<!doctype html><meta charset="utf-8"><style>
   body{margin:0;background:#222;color:#eee;font:13px system-ui;display:flex;flex-wrap:wrap;gap:10px;padding:10px}
   figure{margin:0;width:200px}img{width:200px;display:block;border-radius:6px}
   img.d{margin-bottom:4px;opacity:.95}
   figcaption{padding-top:5px;font-size:11px;line-height:1.3}</style>${sheet}`, "utf8");

await browser.close();
console.table(report.map(({ debug, ...r }) => r));
console.log("contact sheet: assets/contact-sheet.html");
