/**
 * Talitha Kum Kenya — self-hosted server.
 *
 *   TK_LOCAL_DIR=/srv/talithakum SESSION_SECRET=… node server/serve.mjs
 *
 * Everything Netlify was doing, in one Node process with no dependencies:
 *
 *   - serves the built site from site/dist/
 *   - applies the redirect rules site/build.mjs generates, so the old
 *     WordPress addresses and the WordPress-shaped /wp-json/ queries keep
 *     working exactly as they do on Netlify
 *   - mounts the admin API (netlify/functions/admin-api.mjs) at /api/admin/*
 *   - rebuilds the site after a publish, in seconds rather than a minute
 *
 * The admin function is written against the web Request/Response classes, so
 * it runs here unchanged; the adapter below is the only glue it needs. With
 * TK_LOCAL_DIR set it stores accounts in a file and writes content straight
 * to disk, so no GitHub token and no Netlify Blobs are involved.
 *
 * Put nginx (or Cloudflare) in front for TLS. This listens on localhost by
 * default for exactly that reason.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const REPO = process.env.TK_LOCAL_DIR || resolve(here, "..");
const DIST = join(REPO, "site", "dist");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";

/* The function reads this at import time, so it has to be set before the
   dynamic import below rather than after. */
process.env.TK_LOCAL_DIR = REPO;
if (!process.env.SESSION_SECRET && !process.env.TK_SECRET) {
  console.error("SESSION_SECRET is not set. Refusing to start: without it the\n" +
    "session cookie is signed with an empty key and anyone can forge an\n" +
    "administrator session.");
  process.exit(1);
}

const { default: adminApi } = await import("../netlify/functions/admin-api.mjs");

/* ---- redirects ----------------------------------------------------------- */

/* site/build.mjs writes dist/_redirects in Netlify's format. Parsing the file
   the build already produces keeps one source of truth: add a rule there and
   both Netlify and this server honour it, with no second list to forget. */
let rules = [];
async function loadRedirects() {
  const text = await readFile(join(DIST, "_redirects"), "utf8").catch(() => "");
  rules = text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((line) => {
      const parts = line.split(/\s+/);
      const status = Number(parts.pop());
      const to = parts.pop();
      const from = parts.shift();
      /* Anything left between the two is a query condition, e.g. the
         "categories=1001" that picks which posts file to answer with. */
      const when = parts.map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), p.slice(i + 1)];
      });
      return { from, to, status, when };
    })
    .filter((r) => r.from && r.to && r.status);
  console.log(`[serve] ${rules.length} redirect rules loaded`);
}

function matchRedirect(pathname, params) {
  for (const r of rules) {
    if (r.from !== pathname) continue;
    if (r.when.every(([k, v]) => params.get(k) === v)) return r;
  }
  return null;
}

/* ---- rebuilding after a publish ------------------------------------------ */

/* On Netlify a publish commits to GitHub and waits for a rebuild. Here the
   content is already on disk the moment the API returns, so the only thing
   left is to regenerate dist. Debounced, because publishing a gallery writes
   once but adding ten photos should still only build once. */
let buildTimer = null, building = false, buildAgain = false;

function scheduleRebuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(rebuild, 1500);
}

function rebuild() {
  if (building) { buildAgain = true; return; }
  building = true;
  const started = Date.now();
  const child = spawn(process.execPath, [join(REPO, "site", "build.mjs")], {
    cwd: REPO, stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (d) => { err += d; });
  child.on("close", async (code) => {
    building = false;
    if (code === 0) {
      await loadRedirects();
      console.log(`[serve] rebuilt in ${Date.now() - started}ms`);
      if (process.env.TK_GIT_PUSH === "1") pushContent();
    } else {
      /* A failed build leaves the previous dist in place, so the site stays up
         on the last good version rather than going blank. */
      console.error(`[serve] BUILD FAILED (exit ${code}) — site left on the previous version\n${err.trim()}`);
    }
    if (buildAgain) { buildAgain = false; scheduleRebuild(); }
  });
}

/* On Netlify every publish was a commit, which is what made "any earlier
   version can be restored" true. Writing to a server disk instead would quietly
   drop that, and leave the only copy of the content on one machine. Opt in with
   TK_GIT_PUSH=1 and a deploy key, and history and an off-site copy both survive
   the move. Best-effort on purpose: a push that fails must never take the site
   down or block the next publish. */
function pushContent() {
  const run = (args) => new Promise((done) => {
    const c = spawn("git", args, { cwd: REPO, stdio: ["ignore", "ignore", "pipe"] });
    let e = ""; c.stderr.on("data", (d) => { e += d; });
    c.on("close", (code) => done({ code, err: e.trim() }));
    c.on("error", (err) => done({ code: -1, err: err.message }));
  });
  (async () => {
    const add = await run(["add", "-A", "site/content", "site/static/uploads"]);
    if (add.code !== 0) return console.error("[serve] git add failed:", add.err);
    const commit = await run(["commit", "-m", "Content published from the admin panel"]);
    /* Nothing staged is the normal case when only captions moved around. */
    if (commit.code !== 0) return;
    const push = await run(["push"]);
    if (push.code !== 0) console.error("[serve] git push failed (content is committed locally):", push.err);
    else console.log("[serve] content pushed");
  })();
}

/* ---- static files -------------------------------------------------------- */

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".woff": "font/woff", ".woff2": "font/woff2",
};

function cacheFor(pathname) {
  /* Mirrors netlify.toml: uploads are effectively immutable because every
     replacement gets a new filename, pages must revalidate so a publish is
     visible at once. */
  if (pathname.startsWith("/uploads/")) return "public, max-age=604800";
  if (pathname.startsWith("/api/")) return "public, max-age=60";
  return "public, max-age=0, must-revalidate";
}

async function fileAt(p) {
  try { const s = await stat(p); return s.isFile() ? s : null; } catch { return null; }
}

async function sendFile(res, file, pathname, status = 200) {
  const s = await fileAt(file);
  if (!s) return null;
  res.writeHead(status, {
    "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": s.size,
    "cache-control": cacheFor(pathname),
    "x-content-type-options": "nosniff",
  });
  createReadStream(file).pipe(res);
  return true;
}

/* ---- the server ---------------------------------------------------------- */

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    /* -- admin API ------------------------------------------------------- */
    if (pathname.startsWith("/api/admin")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url.href, {
        method: req.method,
        headers: {
          "content-type": req.headers["content-type"] || "",
          cookie: req.headers.cookie || "",
          /* The function rate-limits by address; behind a proxy the socket is
             always localhost, so pass the real one through. */
          "x-forwarded-for": String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""),
        },
        body: chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined,
      });
      const response = await adminApi(request);
      const headers = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));

      /* Anything that changed content means dist is now stale. */
      if (response.ok && req.method !== "GET" && req.method !== "HEAD" &&
          /^\/api\/admin\/(content|upload)/.test(pathname)) {
        scheduleRebuild();
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain" });
      return res.end("Method not allowed");
    }

    /* -- redirects ------------------------------------------------------- */
    const rule = matchRedirect(pathname, url.searchParams);
    if (rule) {
      if (rule.status === 200) {
        /* A rewrite: answer this address with that file, URL unchanged. */
        const target = safeJoin(rule.to);
        if (target && await sendFile(res, target, rule.to)) return;
      } else {
        res.writeHead(rule.status, { location: rule.to });
        return res.end();
      }
    }

    /* -- static ---------------------------------------------------------- */
    const file = safeJoin(pathname);
    if (!file) { res.writeHead(403); return res.end("Forbidden"); }

    if (pathname.endsWith("/")) {
      if (await sendFile(res, join(file, "index.html"), pathname)) return;
    } else {
      if (await sendFile(res, file, pathname)) return;
      /* Pretty URLs: /news -> /news/, the way Netlify serves them, so a link
         without the trailing slash does not 404. */
      if (!extname(pathname) && await fileAt(join(file, "index.html"))) {
        res.writeHead(301, { location: pathname + "/" + url.search });
        return res.end();
      }
    }

    if (await sendFile(res, join(DIST, "404.html"), pathname, 404)) return;
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  } catch (e) {
    console.error("[serve]", e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("Server error");
  }
});

/* Keeps ../../ out of the served tree even if something upstream decodes it. */
function safeJoin(pathname) {
  const target = resolve(DIST, "." + pathname);
  return target === DIST || target.startsWith(DIST + sep) ? target : null;
}

await loadRedirects();
if (!(await fileAt(join(DIST, "index.html")))) {
  console.log("[serve] no build found — building once before listening");
  await new Promise((done) => {
    const c = spawn(process.execPath, [join(REPO, "site", "build.mjs")], { cwd: REPO, stdio: "inherit" });
    c.on("close", done);
  });
  await loadRedirects();
}

server.listen(PORT, HOST, () => {
  console.log(`[serve] Talitha Kum Kenya on http://${HOST}:${PORT}  (content: ${REPO})`);
});
