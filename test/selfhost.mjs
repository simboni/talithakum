/**
 * End-to-end test of the self-hosted server (server/serve.mjs).
 *
 * Starts the real server against a throwaway copy of the repository and
 * checks the things Netlify was doing for us: serving the built site, the
 * redirect rules, the WordPress-shaped API shims, cache headers, the admin
 * API, and — the part that has no Netlify equivalent — rebuilding the site
 * after a publish.
 */

import { spawn } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

let passed = 0, failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ""}`); }
}

/* ---- a throwaway copy of the repository --------------------------------- */

const work = await mkdtemp(join(tmpdir(), "tk-selfhost-"));
for (const d of ["site/content", "site/static", "site/admin", "src", "assets", "netlify"]) {
  await cp(join(repo, d), join(work, d), { recursive: true }).catch(() => {});
}
await cp(join(repo, "site/build.mjs"), join(work, "site/build.mjs"));
await cp(join(repo, "server"), join(work, "server"), { recursive: true });

/* ---- start it ------------------------------------------------------------ */

const PORT = 8400 + Math.floor(Math.random() * 400);
const child = spawn(process.execPath, [join(work, "server/serve.mjs")], {
  env: { ...process.env, TK_LOCAL_DIR: work, SESSION_SECRET: "test-secret-for-the-self-host-suite", PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });

const base = `http://127.0.0.1:${PORT}`;
async function waitUp(ms = 90000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(base + "/"); if (r.ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
const up = await waitUp();
check("the server builds the site and starts", up, log.slice(-600));

if (!up) { child.kill(); console.log(`\n${passed}/${passed + failed} checks passed`); process.exit(1); }

/* ---- the public site ----------------------------------------------------- */

{
  const r = await fetch(base + "/");
  const html = await r.text();
  check("the homepage is served", r.ok && /Talitha Kum/i.test(html));
  check("html revalidates so a publish shows at once",
    /must-revalidate/.test(r.headers.get("cache-control") || ""), r.headers.get("cache-control"));
}

{
  const r = await fetch(base + "/news/");
  check("inner pages are served", r.ok && /news/i.test(await r.text()));
}

{
  /* Netlify serves /news and /news/ alike; a bare link should not 404. */
  const r = await fetch(base + "/news", { redirect: "manual" });
  check("a missing trailing slash redirects rather than 404s",
    r.status === 301 && r.headers.get("location") === "/news/", `${r.status} ${r.headers.get("location")}`);
}

{
  const r = await fetch(base + "/nothing-here/");
  check("an unknown address gets the 404 page", r.status === 404 && /html/i.test(r.headers.get("content-type") || ""));
}

{
  const r = await fetch(base + "/../netlify/functions/admin-api.mjs");
  check("the served tree cannot be escaped", r.status === 404 || r.status === 403, String(r.status));
}

/* ---- the rules the build generates --------------------------------------- */

{
  /* Links shared over the years still point at the WordPress addresses. */
  const r = await fetch(base + "/blog-grid/", { redirect: "manual" });
  check("old WordPress addresses still redirect",
    r.status === 301 && r.headers.get("location") === "/news/", `${r.status} ${r.headers.get("location")}`);
}

{
  /* The team/videos/publications pages still make WordPress-shaped queries;
     these rewrites are what answers them, and they depend on the query
     string, not just the path. */
  const r = await fetch(base + "/wp-json/wp/v2/posts?per_page=3");
  const body = await r.text();
  check("the WordPress-shaped API answers", r.ok && body.trim().startsWith("["), `${r.status} ${body.slice(0, 80)}`);
}

{
  const r = await fetch(base + "/wp-json/wp/v2/posts?per_page=99");
  check("a query the rules do not cover is not silently rewritten", r.status === 404, String(r.status));
}

/* ---- uploads ------------------------------------------------------------- */

{
  const r = await fetch(base + "/uploads/gallery-2026-08-01.jpg");
  check("uploads are served", r.ok && (r.headers.get("content-type") || "").includes("image/jpeg"));
  check("uploads keep their long cache",
    (r.headers.get("cache-control") || "").includes("604800"), r.headers.get("cache-control"));
}

/* ---- the admin panel ----------------------------------------------------- */

{
  const r = await fetch(base + "/admin/");
  check("the admin panel is served", r.ok && /admin/i.test(await r.text()));
}

{
  const r = await fetch(base + "/api/admin/status");
  const d = await r.json();
  check("the admin API answers, with no GitHub token anywhere", r.ok && d.setup === true, JSON.stringify(d));
}

/* ---- publishing rebuilds the site ---------------------------------------- */

/* This is the part Netlify did and a plain static host does not: the whole
   point of the move is that a publish still reaches the public pages. */
let cookie = "";
{
  const r = await fetch(base + "/api/admin/setup", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Peter Misiati", email: "peter@example.org", password: "long-password-1" }),
  });
  cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  check("the first account can be created", r.ok && cookie.startsWith("tk_session="));
}

{
  const headline = "Published From The Self Hosted Server";
  const r = await fetch(base + "/api/admin/content/news/published-from-the-self-hosted-server", {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ create: true, data: {
      title: headline, date: "2026-09-15", category: "Prevention",
      summary: "A story published by the self-host test.", body: "It worked.",
    } }),
  });
  check("publishing is accepted", r.ok, String(r.status));

  const file = join(work, "site/content/news/published-from-the-self-hosted-server.json");
  const saved = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  check("the story is written straight to disk", saved.title === headline);

  /* The rebuild is debounced, so give it room — it should still be seconds,
     not the minute a Netlify deploy takes. */
  const until = Date.now() + 60000;
  let live = false, tookMs = 0;
  while (Date.now() < until) {
    const page = await fetch(base + "/news/").then((x) => x.text()).catch(() => "");
    if (page.includes(headline)) { live = true; tookMs = Date.now(); break; }
    await new Promise((x) => setTimeout(x, 500));
  }
  check("the published story appears on the public site", live, log.slice(-500));
  if (live) console.log(`      (rebuild finished; story live on /news/)`);
  void tookMs;
}

/* ---- an uploaded photograph is visible at once --------------------------- */

/* Uploads are written to site/static/uploads, but the site is served from
   site/dist. Serving only from dist meant an uploaded photograph 404'd at its
   own URL until the next rebuild copied it across — and for ever if that
   rebuild failed. */
{
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await fetch(base + "/api/admin/upload", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "straight-away.png", data: png }),
  });
  const d = await r.json().catch(() => ({}));
  check("an upload is accepted", r.ok && typeof d.path === "string", JSON.stringify(d));

  if (d.path) {
    /* No waiting, no rebuild: ask for it immediately. */
    const img = await fetch(base + d.path);
    check("an uploaded photograph is served at once, before any rebuild",
      img.ok && (img.headers.get("content-type") || "").includes("image/png"),
      `${img.status} ${img.headers.get("content-type")}`);
  }
}

/* ---- a broken build does not take the site down -------------------------- */

/* build.mjs clears its output directory before writing, so building straight
   over the live site meant a failure part-way left no pages at all. */
{
  const livePage = await fetch(base + "/news/").then((x) => x.text());
  const buildFile = join(work, "site/build.mjs");
  const good = await readFile(buildFile, "utf8");
  await writeFile(buildFile, good + "\nthrow new Error('deliberate test failure');\n");

  await fetch(base + "/api/admin/content/news/break-the-build", {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ create: true, data: {
      title: "Break The Build", date: "2026-09-15", category: "Prevention",
      summary: "x", body: "x",
    } }),
  });
  await new Promise((r) => setTimeout(r, 15000));

  const after = await fetch(base + "/news/");
  const afterBody = await after.text();
  check("the site survives a failed rebuild",
    after.ok && afterBody.length > 0 && afterBody === livePage,
    `HTTP ${after.status}, ${afterBody.length} bytes`);
  check("and the failure is reported in the log", /BUILD FAILED/.test(log), log.slice(-300));

  await writeFile(buildFile, good);
}

/* ---- the contact form ---------------------------------------------------- */

/* The form was built for Netlify Forms. Off Netlify the POST hit the static
   handler and got 405, so every enquiry from the contact page was lost. */
{
  const body = new URLSearchParams({
    name: "Jane Wanjiku", contact: "jane@example.org",
    message: "Please call me about a training session.", website: "",
  });
  const r = await fetch(base + "/api/contact", {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  check("the contact form is accepted and thanks the sender",
    r.status === 303 && r.headers.get("location") === "/thanks/", `${r.status} ${r.headers.get("location")}`);

  const dir = join(work, "enquiries");
  const saved = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"));
  check("the enquiry is stored", saved.length === 1, `${saved.length} files`);
  if (saved.length) {
    const d = JSON.parse(await readFile(join(dir, saved[0]), "utf8"));
    check("with everything the sender typed",
      d.name === "Jane Wanjiku" && d.contact === "jane@example.org" && /training session/.test(d.message),
      JSON.stringify(d));
  }

  /* An enquiry to this organisation may carry a disclosure from a survivor.
     It must not sit anywhere that gets published or committed. */
  check("and nowhere that is published or committed",
    !existsSync(join(work, "site/content/enquiries")) &&
    !existsSync(join(work, "site/static/enquiries")) &&
    !existsSync(join(work, "site/dist/enquiries")));

  const bot = await fetch(base + "/api/contact", {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "Bot", contact: "b@b.b", message: "spam", website: "filled" }).toString(),
  });
  const afterBot = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"));
  check("a bot filling the honeypot is dropped without being told",
    bot.status === 303 && afterBot.length === 1, `${bot.status}, ${afterBot.length} stored`);

  const empty = await fetch(base + "/api/contact", {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "", contact: "", message: "" }).toString(),
  });
  check("an empty message is refused", empty.status === 400, String(empty.status));

  /* And staff can actually read it. */
  const listed = await fetch(base + "/api/admin/enquiries", { headers: { cookie } });
  const ld = await listed.json().catch(() => ({}));
  check("the panel can read the enquiries",
    listed.ok && Array.isArray(ld.items) && ld.items.length === 1 && ld.items[0].name === "Jane Wanjiku",
    JSON.stringify(ld).slice(0, 160));

  const anon = await fetch(base + "/api/admin/enquiries");
  check("but not without signing in", anon.status === 401, String(anon.status));
}

child.kill();
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
