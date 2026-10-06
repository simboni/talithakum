/**
 * Check a running server before the domain is pointed at it.
 *
 *   node deploy/verify.mjs 203.0.113.10        # by address, pre-DNS
 *   node deploy/verify.mjs https://talithakumraht.org
 *
 * Given a bare address it sends the real Host header, so the server answers
 * exactly as it will once DNS moves — no hosts-file editing needed.
 *
 * This is the gate: everything here must pass before you change a DNS record.
 */

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node deploy/verify.mjs <server-ip|url>");
  process.exit(2);
}

const DOMAIN = process.env.TK_DOMAIN || "talithakumraht.org";
const isUrl = /^https?:\/\//.test(arg);
const base = isUrl ? arg.replace(/\/$/, "") : `http://${arg}`;
const headers = isUrl ? {} : { host: DOMAIN };

let passed = 0, failed = 0;
const ok = (n, good, extra) => {
  if (good) { passed++; console.log(`  ok  ${n}`); }
  else { failed++; console.log(`FAIL  ${n}${extra ? ` — ${extra}` : ""}`); }
};

async function get(path, opts = {}) {
  try {
    const r = await fetch(base + path, { headers, redirect: "manual", ...opts });
    return { status: r.status, headers: r.headers, body: await r.text() };
  } catch (e) {
    return { status: 0, headers: new Headers(), body: "", error: e.message };
  }
}

console.log(`\nChecking ${base}${isUrl ? "" : `  (as ${DOMAIN})`}\n`);

const home = await get("/");
ok("the homepage answers", home.status === 200, home.error || `HTTP ${home.status}`);
if (home.status !== 200) {
  console.log("\nNothing else can pass while the homepage is down.");
  console.log("On the server:  systemctl status talithakum && journalctl -u talithakum -n 50\n");
  process.exit(1);
}

ok("it is the Talitha Kum site", /Talitha Kum/i.test(home.body));

for (const [path, what] of [
  ["/news/", "News"], ["/our-team/", "Our Team"], ["/publications/", "Publications"],
  ["/videos/", "Videos"], ["/gallery/", "Gallery"], ["/donate/", "Donate"],
]) {
  const r = await get(path);
  ok(`${what} loads`, r.status === 200, `HTTP ${r.status}`);
}

/* Photographs are the thing most likely to be missing after a move, and the
   thing nobody notices until the client does. */
const img = (home.body.match(/\/uploads\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)/) || [])[0];
if (img) {
  const r = await get(img, { method: "HEAD" });
  ok("photographs are served", r.status === 200, `${img} → HTTP ${r.status}`);
  ok("photographs keep their long cache",
    (r.headers.get("cache-control") || "").includes("604800"), r.headers.get("cache-control"));
} else {
  ok("found a photograph on the homepage to check", false, "no /uploads/ image in the HTML");
}

{
  const r = await get("/blog-grid/");
  ok("old WordPress links still redirect",
    r.status === 301 && r.headers.get("location") === "/news/",
    `HTTP ${r.status} → ${r.headers.get("location")}`);
}

{
  /* The team, videos and publications pages fetch these at runtime. If they
     404 those pages render empty with no error anyone would see. */
  const r = await get("/wp-json/wp/v2/posts?per_page=3");
  ok("the WordPress-shaped API answers", r.status === 200 && r.body.trim().startsWith("["), `HTTP ${r.status}`);
}

{
  const r = await get("/admin/");
  ok("the admin panel is served", r.status === 200);
}

{
  const r = await get("/api/admin/status");
  let d = {};
  try { d = JSON.parse(r.body); } catch { /* reported below */ }
  ok("the admin API answers", r.status === 200, `HTTP ${r.status} ${r.body.slice(0, 120)}`);
  if (r.status === 200) {
    ok("sign-in is configured", !d.error, d.error || "");
    console.log(d.setup
      ? "      (no account yet — claim it at /admin as soon as the domain resolves)"
      : "      (an account already exists)");
  }
}

{
  const r = await get("/nothing-here-at-all/");
  ok("unknown addresses get the 404 page", r.status === 404, `HTTP ${r.status}`);
}

if (isUrl && base.startsWith("https://")) {
  const r = await get("/", { redirect: "manual" });
  ok("HTTPS is serving", r.status === 200 || r.status === 301, `HTTP ${r.status}`);
}

console.log(`\n${passed}/${passed + failed} checks passed\n`);
if (failed) {
  console.log("Do not point DNS at this server until these pass.\n");
  process.exit(1);
}
console.log("Safe to point the A records for @ and www at this server.\n");
