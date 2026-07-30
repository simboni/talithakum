/**
 * Talitha Kum Kenya — admin API.
 *
 * One serverless function behind /api/admin/*. It gives the custom admin
 * panel (site/admin/) everything it needs:
 *
 *   - email + password sign-in with HttpOnly session cookies
 *   - user accounts with roles (admin / editor) and per-section privileges,
 *     stored in Netlify Blobs — no external database, no GitHub accounts
 *   - content reads and writes for the JSON files in site/content/; in
 *     production each publish is committed to the repository with a machine
 *     token (GITHUB_TOKEN), which triggers the normal Netlify rebuild
 *   - image and PDF uploads into site/static/uploads/
 *
 * Environment (set in the Netlify dashboard):
 *   SESSION_SECRET  long random string that signs session cookies
 *   GITHUB_TOKEN    fine-grained PAT, Contents read/write on the repo
 *   GITHUB_REPO     e.g. "simboni/talithakum"
 *   GITHUB_BRANCH   the deployed branch
 *
 * For local tests, TK_LOCAL_DIR points at a working copy of the repository;
 * users and content are then plain files under it and Blobs is never loaded.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const LOCAL = process.env.TK_LOCAL_DIR || "";
const SECRET = process.env.SESSION_SECRET || process.env.TK_SECRET || (LOCAL ? "local-test-secret" : "");
const SESSION_DAYS = 7;

const SECTIONS = ["news", "publications", "videos", "team", "gallery"];
const TYPES = {
  news: { dir: "site/content/news" },
  publications: { dir: "site/content/publications" },
  videos: { dir: "site/content/videos" },
  team: { dir: "site/content/team" },
  gallery: { file: "site/content/gallery.json" },
};
const UPLOADS = "site/static/uploads";
const UPLOAD_TYPES = { jpg: 1, jpeg: 1, png: 1, webp: 1, gif: 1, pdf: 1 };

/* ---- storage: users + rate limits (Netlify Blobs, or a file locally) ---- */

async function userStore() {
  if (LOCAL) {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = join(LOCAL, ".tk-admin-users.json");
    return {
      async get() { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } },
      async set(v) { await writeFile(f, JSON.stringify(v, null, 2)); },
    };
  }
  const { getStore } = await import("@netlify/blobs");
  const store = getStore("tk-admin");
  return {
    async get() { return (await store.get("users", { type: "json" })) || null; },
    async set(v) { await store.setJSON("users", v); },
  };
}

/* naive rolling rate limit: max 8 failed logins per address per 15 minutes */
const attempts = new Map();
function tooManyTries(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, list);
  return list.length >= 8;
}
function noteTry(key) { attempts.set(key, [...(attempts.get(key) || []), Date.now()]); }

/* ---- passwords + session tokens ----------------------------------------- */

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
function checkPassword(password, stored) {
  if (!stored || !stored.salt || !stored.hash) return false;
  const got = scryptSync(password, stored.salt, 64);
  const want = Buffer.from(stored.hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

const b64u = (s) => Buffer.from(s).toString("base64url");
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const want = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.x > Date.now() ? p : null;
  } catch { return null; }
}
function sessionCookie(value, maxAge) {
  const secure = LOCAL ? "" : " Secure;";
  return `tk_session=${value}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function cookieToken(req) {
  const m = /(?:^|;\s*)tk_session=([^;]+)/.exec(req.headers.get("cookie") || "");
  return m ? m[1] : null;
}

/* ---- content: local files, or the GitHub contents API -------------------- */

/* The env vars can override these, but the defaults match this deployment,
   so the panel publishes correctly with only GITHUB_TOKEN configured. */
const REPO = process.env.GITHUB_REPO || "simboni/talithakum";
const BRANCH = process.env.GITHUB_BRANCH || process.env.HEAD || process.env.BRANCH || "claude/talithakum-repo-sug8lg";

async function gh(path, init = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token && init.method && init.method !== "GET") {
    throw new Error("publishing is not configured — add GITHUB_TOKEN in Netlify (Site configuration → Environment variables), then redeploy");
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      accept: "application/vnd.github+json",
      "user-agent": "tk-admin",
      ...(init.headers || {}),
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function contentFS() {
  const { readFile, writeFile, readdir, unlink, mkdir } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  return {
    async list(dir) {
      const files = (await readdir(join(LOCAL, dir)).catch(() => [])).filter((f) => f.endsWith(".json"));
      return Promise.all(files.map(async (f) => ({
        slug: f.replace(/\.json$/, ""),
        data: JSON.parse(await readFile(join(LOCAL, dir, f), "utf8")),
      })));
    },
    async read(path) { try { return await readFile(join(LOCAL, path), "utf8"); } catch { return null; } },
    async write(path, content) {
      await mkdir(dirname(join(LOCAL, path)), { recursive: true });
      await writeFile(join(LOCAL, path), content);
    },
    async writeBinary(path, buf) { return this.write(path, buf); },
    async remove(path) { await unlink(join(LOCAL, path)).catch(() => {}); },
  };
}

function contentGit(user) {
  const why = (verb, path) => `Admin panel: ${verb} ${path} (${user ? user.email : "system"})`;
  return {
    async list(dir) {
      const entries = (await gh(`contents/${dir}?ref=${BRANCH}`)) || [];
      const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
      return Promise.all(files.map(async (e) => {
        const r = await fetch(e.download_url);
        return { slug: e.name.replace(/\.json$/, ""), data: await r.json() };
      }));
    },
    async read(path) {
      const f = await gh(`contents/${path}?ref=${BRANCH}`);
      return f ? Buffer.from(f.content, "base64").toString() : null;
    },
    async write(path, content) {
      const existing = await gh(`contents/${path}?ref=${BRANCH}`);
      await gh(`contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: why(existing ? "update" : "create", path),
          content: Buffer.from(content).toString("base64"),
          branch: BRANCH,
          ...(existing ? { sha: existing.sha } : {}),
        }),
      });
    },
    async writeBinary(path, buf) {
      const existing = await gh(`contents/${path}?ref=${BRANCH}`);
      await gh(`contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: why("upload", path),
          content: buf.toString("base64"),
          branch: BRANCH,
          ...(existing ? { sha: existing.sha } : {}),
        }),
      });
    },
    async remove(path) {
      const existing = await gh(`contents/${path}?ref=${BRANCH}`);
      if (!existing) return;
      await gh(`contents/${path}`, {
        method: "DELETE",
        body: JSON.stringify({ message: why("delete", path), sha: existing.sha, branch: BRANCH }),
      });
    },
  };
}

const content = (user) => (LOCAL ? contentFS() : contentGit(user));

/* ---- helpers -------------------------------------------------------------- */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const bad = (msg, status = 400) => json({ error: msg }, status);

const slugify = (s) => String(s).toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";

/* existing slugs come back through URLs — sanitize but never shorten them */
const safeSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "item";

function publicUser(u) {
  return { email: u.email, name: u.name, role: u.role, sections: u.role === "admin" ? SECTIONS : (u.sections || []) };
}
function canEdit(u, type) {
  return u.role === "admin" || (u.sections || []).includes(type);
}

/* ---- the router ----------------------------------------------------------- */

export default async function handler(req) {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  const store = await userStore();
  const users = (await store.get()) || {};
  const hasUsers = Object.keys(users).length > 0;

  const token = verify(cookieToken(req));
  const me = token && users[token.e] ? users[token.e] : null;

  try {
    /* -- session ---------------------------------------------------------- */

    if (seg[0] === "status" && method === "GET") {
      return json({ setup: !hasUsers, user: me ? publicUser(me) : null });
    }

    if (seg[0] === "setup" && method === "POST") {
      if (hasUsers) return bad("Already set up", 403);
      const { name, email, password } = await req.json();
      if (!name || !email || !password || password.length < 8) {
        return bad("Name, email and a password of at least 8 characters are required");
      }
      const key = String(email).toLowerCase().trim();
      users[key] = { email: key, name: String(name).trim(), role: "admin", sections: SECTIONS, pass: hashPassword(password), created: new Date().toISOString() };
      await store.set(users);
      const t = sign({ e: key, x: Date.now() + SESSION_DAYS * 864e5 });
      return json({ user: publicUser(users[key]) }, 200, { "set-cookie": sessionCookie(t, SESSION_DAYS * 86400) });
    }

    if (seg[0] === "login" && method === "POST") {
      const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "?";
      if (tooManyTries(ip)) return bad("Too many attempts — wait fifteen minutes and try again", 429);
      const { email, password } = await req.json();
      const u = users[String(email || "").toLowerCase().trim()];
      if (!u || !checkPassword(String(password || ""), u.pass)) {
        noteTry(ip);
        return bad("Wrong email or password", 401);
      }
      const t = sign({ e: u.email, x: Date.now() + SESSION_DAYS * 864e5 });
      return json({ user: publicUser(u) }, 200, { "set-cookie": sessionCookie(t, SESSION_DAYS * 86400) });
    }

    if (seg[0] === "logout" && method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": sessionCookie("gone", 0) });
    }

    /* -- everything below needs a signed-in user -------------------------- */

    if (!me) return bad("Sign in first", 401);

    if (seg[0] === "me" && method === "GET") return json({ user: publicUser(me) });

    if (seg[0] === "password" && method === "POST") {
      const { current, next } = await req.json();
      if (!checkPassword(String(current || ""), me.pass)) return bad("Current password is wrong", 403);
      if (!next || next.length < 8) return bad("New password must be at least 8 characters");
      users[me.email].pass = hashPassword(next);
      await store.set(users);
      return json({ ok: true });
    }

    /* -- user management (admins only) ------------------------------------ */

    if (seg[0] === "users") {
      if (me.role !== "admin") return bad("Admins only", 403);

      if (method === "GET") {
        return json({ users: Object.values(users).map(publicUser) });
      }
      if (method === "POST") {
        const { email, name, password, role, sections } = await req.json();
        const key = String(email || "").toLowerCase().trim();
        if (!key || !key.includes("@")) return bad("A valid email is required");
        const existing = users[key];
        if (!existing && (!password || password.length < 8)) return bad("New users need a password of at least 8 characters");
        if (existing && existing.email === me.email && role && role !== "admin") return bad("You cannot demote yourself");
        users[key] = {
          ...(existing || { created: new Date().toISOString() }),
          email: key,
          name: String(name || (existing ? existing.name : "") || key).trim(),
          role: role === "admin" ? "admin" : "editor",
          sections: (Array.isArray(sections) ? sections : []).filter((s) => SECTIONS.includes(s)),
          pass: password ? hashPassword(password) : existing.pass,
        };
        await store.set(users);
        return json({ user: publicUser(users[key]) });
      }
      if (method === "DELETE" && seg[1]) {
        const key = decodeURIComponent(seg[1]).toLowerCase();
        if (key === me.email) return bad("You cannot delete yourself");
        if (!users[key]) return bad("No such user", 404);
        delete users[key];
        await store.set(users);
        return json({ ok: true });
      }
    }

    /* -- uploads ----------------------------------------------------------- */

    if (seg[0] === "upload" && method === "POST") {
      const { name, data } = await req.json();
      const ext = String(name || "").split(".").pop().toLowerCase();
      if (!UPLOAD_TYPES[ext]) return bad("Only images and PDFs can be uploaded");
      const base = slugify(String(name).replace(/\.[^.]+$/, ""));
      const path = `${UPLOADS}/${base}.${ext === "jpeg" ? "jpg" : ext}`;
      const buf = Buffer.from(String(data), "base64");
      if (!buf.length) return bad("Empty file");
      if (buf.length > 4.5 * 1024 * 1024) return bad("Files bigger than about 4 MB cannot go through the panel — email it to the site maintainer instead");
      await (await content(me)).writeBinary(path, buf);
      return json({ path: `/uploads/${path.split("/").pop()}` });
    }

    /* -- content ------------------------------------------------------------ */

    if (seg[0] === "content" && seg[1] && TYPES[seg[1]]) {
      const type = seg[1];
      const t = TYPES[type];
      if (!canEdit(me, type)) return bad("You do not have access to this section", 403);
      const c = await content(me);

      if (t.file) { /* gallery: one document */
        if (method === "GET") {
          const raw = await c.read(t.file);
          return json({ data: raw ? JSON.parse(raw) : { photos: [] } });
        }
        if (method === "PUT") {
          const { data } = await req.json();
          if (!data || !Array.isArray(data.photos)) return bad("Bad gallery data");
          const photos = data.photos
            .filter((p) => p && p.image)
            .map((p) => ({ image: String(p.image), caption: String(p.caption || "") }));
          await c.write(t.file, JSON.stringify({ photos }, null, 2) + "\n");
          return json({ ok: true });
        }
      } else {
        if (method === "GET" && !seg[2]) {
          const items = await c.list(t.dir);
          return json({ items });
        }
        if (method === "GET" && seg[2]) {
          const raw = await c.read(`${t.dir}/${safeSlug(seg[2])}.json`);
          return raw ? json({ data: JSON.parse(raw) }) : bad("Not found", 404);
        }
        if (method === "PUT" && seg[2]) {
          const { data } = await req.json();
          if (!data || typeof data !== "object") return bad("Bad data");
          await c.write(`${t.dir}/${safeSlug(seg[2])}.json`, JSON.stringify(data, null, 2) + "\n");
          return json({ ok: true });
        }
        if (method === "DELETE" && seg[2]) {
          await c.remove(`${t.dir}/${safeSlug(seg[2])}.json`);
          return json({ ok: true });
        }
      }
    }

    return bad("No such endpoint", 404);
  } catch (e) {
    return json({ error: `Something went wrong: ${e.message}` }, 500);
  }
}

export const config = { path: "/api/admin/*" };
