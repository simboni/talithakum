/**
 * Packages the plugin as a zip that WordPress will accept from
 * Plugins -> Add New -> Upload Plugin.
 *
 *   node build-plugin-zip.mjs
 *
 * Output: dist/talithakum-publications.zip
 *
 * WordPress requires the archive to contain a single top-level folder whose
 * name matches the plugin slug, with the main PHP file inside it — a bare
 * .php file at the root of the zip is rejected.
 */

import { mkdir, copyFile, writeFile, rm, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const SLUG = "talithakum-publications";

const staging = join(root, "dist", "_staging");
const folder = join(staging, SLUG);

await rm(join(root, "dist"), { recursive: true, force: true });
await mkdir(folder, { recursive: true });

await copyFile(join(root, "plugin", `${SLUG}.php`), join(folder, `${SLUG}.php`));

/* WordPress reads readme.txt for the plugin's detail screen. */
await writeFile(join(folder, "readme.txt"), `=== Talitha Kum Publications ===
Contributors: talithakumkenya
Tags: publications, documents, pdf, library, rest-api
Requires at least: 5.9
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Back end for the Talitha Kum Kenya publications library: a Publications post
type, type and theme taxonomies, document metadata, and a download counter.

== Description ==

This plugin is optional. The publications page works without it, storing
documents as ordinary posts under a "Publications" category.

Installing it moves publications into their own post type instead, so they
never appear in the blog, the main feed or site search alongside news posts.

It adds:

* A **Publications** post type, kept out of the blog entirely
* **Publication Types** (Annual Report, Policy Brief, Newsletter and so on)
* **Publication Themes** (Prevention, Protection, Partnership, Prayer, plus
  topical themes)
* Document fields: PDF file, page count, file size, language, issuing body,
  featured flag
* A download counter, rate limited so it cannot be inflated
* Default terms, created for you on activation

== Installation ==

1. Dashboard > Plugins > Add New > Upload Plugin.
2. Choose talithakum-publications.zip and click Install Now.
3. Activate.
4. Edit the Publications page and change \`mode: "posts"\` to \`mode: "cpt"\`
   near the top of the pasted code, then update the page.

Existing publications stay where they are — posts filed under the
Publications category are not moved automatically. Add new documents through
the publishing panel as usual.

== Frequently Asked Questions ==

= Do I need this plugin? =

No. Start without it. Install it when you want publications kept completely
separate from blog posts.

= What happens if I deactivate it? =

Your documents are not deleted, but they stop appearing until you either
reactivate the plugin or switch the page back to \`mode: "posts"\`.

== Changelog ==

= 1.0.0 =
* First release.
`, "utf8");

await mkdir(join(root, "dist"), { recursive: true });
await run("zip", ["-r", "-q", "-X", join(root, "dist", `${SLUG}.zip`), SLUG], { cwd: staging });
await rm(staging, { recursive: true, force: true });

const { size } = await readFile(join(root, "dist", `${SLUG}.zip`)).then((b) => ({ size: b.length }));
console.log(`built dist/${SLUG}.zip  ${(size / 1024).toFixed(1)} KB`);
