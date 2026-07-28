/* ==========================================================================
   Talitha Kum Kenya — Team (public page + staff panel, one file)

   The lightest of the three pages. A person is a name, a role, a group and
   a photograph, so there is no document engine, no player and no third-party
   code of any kind: one request for the group, one for the people, done.

   Data model mirrors the other two pages, so staff learn one system:

     Parent category   team              (create it in WordPress)
       child category  = the group       (Board, Staff, ...)
       everything else = a machine-readable comment in the post content:
                         <!--TKTEAM:{"role":"Board Vice Chair","photo":"…"}-->

     Post title   = the person's name
     Post excerpt = the short biography, if there is one

   Access is the WordPress session and nothing else. The panel is drawn only
   for logged-in users and signs itself in with the REST nonce printed by
   plugin/tkpub-nonce-snippet.php — no password is asked for or stored here.
   WordPress re-checks capabilities on the server for every write, so the
   front end is convenience, not security.
   ========================================================================== */

(function () {
  "use strict";

  /* ---- config: edit this block, nothing else ------------------------- */

  var CONFIG = {
    restRoot: "/wp-json/",
    parentCategory: "team",
    /* The order here is the order the sections appear in. Anything else
       staff create in WordPress is appended alphabetically. */
    groups: ["Board", "Staff"],
    /* Suggestions only — the field accepts anything typed into it. */
    roles: [
      "Chairperson", "Vice Chair", "Treasurer", "Secretary", "Board Member",
      "National Coordinator", "Programme Officer", "Project Officer",
      "Finance Officer", "Communications Officer", "Administrator",
      "Counsellor", "Social Worker", "Field Officer", "Volunteer"
    ],

    /* ---- the board, built into the page ------------------------------
       So the page is not empty on the day it goes up. These are shown
       ONLY while nothing has been published under the team category —
       publish one real person in the panel and this list disappears by
       itself. Nothing here is a WordPress post, so nothing here can be
       edited or deleted from the panel.

       The photo links point at the media library. A link that is not
       there yet simply shows the person's initials instead, so the page
       is never broken by a missing file. */
    media: "https://talithakumraht.org/wp-content/uploads/2026/07/",
    seed: [
      { name: "Sr. Mercy Mwayi", role: "Executive Director", order: 5,
        photo: "sr-mercy-mwayi-director.jpg" },
      { name: "Sr. Joyce Nyagucha", role: "Board Vice Chair", order: 20,
        photo: "sr-joyce-nyagucha-board-vice-chair.jpg" },
      { name: "Sr. Mary Gitau", role: "Board Treasurer", order: 30,
        photo: "sr-mary-gitau-board-treasurer.jpg" },
      { name: "Sr. Catherine Mutindi", role: "Board Member", order: 50,
        photo: "sr-catherine-mutindi-board-member.jpg" },
      { name: "Sr. Matilda Baabuo", role: "Board Member", order: 50,
        photo: "sr-matilda-baabuo-board-member.jpg" },
      { name: "Sr. Pasilisa Namikoye", role: "Board Member", order: 50,
        photo: "sr-pasilisa-namikoye-board-member.jpg" },
      { name: "Bro. Bernard Juma", role: "Board Member", order: 50,
        photo: "bro-bernard-juma-board-member.jpg" },
      { name: "Bildad Keke", role: "Board Member", order: 50,
        photo: "bildadrd-keke-board-member.jpg" }
    ]
  };

  if (typeof window.tkpubRestRoot === "string" && window.tkpubRestRoot) {
    CONFIG.restRoot = window.tkpubRestRoot;
  }

  /* ---- helpers -------------------------------------------------------- */

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function plain(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  /* "Sr. Joyce Nyagucha" -> "JN". Titles are dropped so the monogram is the
     person's initials, not an S for every sister on the board. */
  var TITLES = /^(sr|sister|br|brother|fr|father|rev|mons|msgr|dr|prof|mr|mrs|ms|hon)\.?$/i;
  function initials(name) {
    var parts = String(name || "").split(/\s+/).filter(function (w) {
      return w && !TITLES.test(w.replace(/[^A-Za-z.]/g, ""));
    });
    if (!parts.length) parts = String(name || "").split(/\s+/).filter(Boolean);
    var out = (parts[0] || "").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "");
    return out.toUpperCase() || "?";
  }

  var GRADS = [["#F74F22", "#B32E0B"], ["#FFAC00", "#C97F00"], ["#FB8518", "#C4490D"],
               ["#3A3A3A", "#151515"], ["#E0623A", "#9C2F10"]];
  function gradFor(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
    return GRADS[h % GRADS.length];
  }

  var I = {
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>'
  };

  function toast(msg, kind) {
    var host = $(".tkteam-toasts");
    if (!host) return;
    var t = document.createElement("div");
    t.className = "tkteam-toast" + (kind ? " is-" + kind : "");
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "err" ? 6000 : 3500);
  }

  /* ---- portraits -------------------------------------------------------
     The monogram is always drawn and the photograph fades in on top of it,
     so a slow connection shows a finished card rather than a grey hole, and
     a broken link degrades to the monogram instead of a torn-image icon.
     Bound once, in capture phase: img load and error do not bubble.       */

  function portraits() {
    function handle(e, failed) {
      var img = e.target;
      if (!img || img.tagName !== "IMG" || img.className.indexOf("tkteam-img") < 0) return;
      if (failed) { if (img.parentNode) img.parentNode.removeChild(img); return; }
      img.classList.add("is-on");
    }
    document.addEventListener("load", function (e) { handle(e, false); }, true);
    document.addEventListener("error", function (e) { handle(e, true); }, true);
  }

  function photoMarkup(p, cls) {
    var g = gradFor(p.name || p.slug || "x");
    return '<span class="' + (cls || "tkteam-ph") + '">' +
      '<span class="tkteam-mono" style="--t-c1:' + g[0] + ';--t-c2:' + g[1] + '">' +
        esc(initials(p.name)) + "</span>" +
      (p.photo ? '<img class="tkteam-img" src="' + esc(p.photo) + '" alt="' + esc(p.name) +
        '" loading="lazy" decoding="async">' : "") +
      "</span>";
  }

  /* ---- REST ----------------------------------------------------------- */

  function restUrl(path, params) {
    var base = CONFIG.restRoot.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
    var qs = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") return;
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return base + (qs.length ? "?" + qs.join("&") : "");
  }

  function getJSON(path, params, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    return fetch(restUrl(path, params), opts).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          var e = new Error((body && body.message) || ("Request failed (" + res.status + ")"));
          e.status = res.status;
          throw e;
        }
        return body;
      }, function () {
        if (!res.ok) throw new Error("Request failed (" + res.status + ")");
        return null;
      });
    });
  }

  /* ---- state ---------------------------------------------------------- */

  var PAYLOAD = /<!--\s*TKTEAM:(\{[\s\S]*?\})\s*-->/;
  var state = { all: [], group: "", parentId: null };
  var el = {};

  function normalise(item) {
    var data = {};
    var m = PAYLOAD.exec((item.content && item.content.rendered) || "");
    if (m) { try { data = JSON.parse(m[1]); } catch (e) { data = {}; } }

    var terms = [];
    ((item._embedded && item._embedded["wp:term"]) || []).forEach(function (g) {
      if (Array.isArray(g)) terms = terms.concat(g);
    });

    /* Term names arrive HTML-encoded, so they go through plain() like the
       title does — otherwise an ampersand is escaped twice. */
    var group = "";
    terms.forEach(function (t) {
      if (t.taxonomy === "category" && t.parent === state.parentId) group = plain(t.name);
    });

    return {
      id: item.id,
      slug: item.slug,
      status: item.status,
      name: plain(item.title && item.title.rendered),
      role: data.role || "",
      group: group || CONFIG.groups[0],
      photo: data.photo || "",
      order: typeof data.order === "number" ? data.order : 50,
      bio: plain(item.excerpt && item.excerpt.rendered)
    };
  }

  /* ---- rendering ------------------------------------------------------ */

  function groupRank(name) {
    var i = CONFIG.groups.indexOf(name);
    return i < 0 ? CONFIG.groups.length : i;
  }

  function byOrder(a, b) {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  }

  function cardMarkup(p) {
    var tag = p.bio ? "button" : "div";
    return "<" + tag + ' class="tkteam-card"' +
      (p.bio ? ' type="button" data-person="' + esc(p.slug) + '"' : "") + ">" +
      photoMarkup(p) +
      '<div class="tkteam-body">' +
        '<p class="tkteam-name">' + esc(p.name) + "</p>" +
        (p.role ? '<p class="tkteam-role">' + esc(p.role) + "</p>" : "") +
        (p.bio ? '<span class="tkteam-more">Read more ' + I.read + "</span>" : "") +
      "</div></" + tag + ">";
  }

  function paint() {
    var shown = state.all.filter(function (p) { return !state.group || p.group === state.group; });

    /* One section per group, in the order CONFIG lists them. */
    var groups = [];
    shown.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
    groups.sort(function (a, b) {
      var d = groupRank(a) - groupRank(b);
      return d || a.localeCompare(b);
    });

    el.groups.innerHTML = groups.map(function (g) {
      var people = shown.filter(function (p) { return p.group === g; }).sort(byOrder);
      return '<section class="tkteam-group">' +
        '<div class="tkteam-gh"><h2>' + esc(g) + "</h2><span>" + people.length +
          (people.length === 1 ? " person" : " people") + "</span></div>" +
        '<div class="tkteam-grid">' + people.map(cardMarkup).join("") + "</div></section>";
    }).join("");

    el.empty.innerHTML = shown.length ? "" :
      '<div class="tkteam-state"><h3>' +
      (state.group ? "Nobody in that group yet" : "No one has been added yet") + "</h3><p>" +
      (state.group ? "Choose All to see everybody." :
        "Team members appear here as soon as they are published.") + "</p></div>";

    el.live.textContent = shown.length + (shown.length === 1 ? " person" : " people");

    /* The filter is built from what is published, and hides itself entirely
       while everyone is in the same group. */
    var counts = {}, order = [];
    state.all.forEach(function (p) {
      if (!counts[p.group]) { counts[p.group] = 0; order.push(p.group); }
      counts[p.group]++;
    });
    order.sort(function (a, b) {
      var d = groupRank(a) - groupRank(b);
      return d || a.localeCompare(b);
    });
    el.chips.innerHTML = order.length < 2 ? "" :
      '<button type="button" class="tkteam-chip" data-group="" aria-pressed="' + (!state.group) +
        '">Everyone<b>' + state.all.length + "</b></button>" +
      order.map(function (g) {
        return '<button type="button" class="tkteam-chip" data-group="' + esc(g) + '" aria-pressed="' +
          (state.group === g) + '">' + esc(g) + "<b>" + counts[g] + "</b></button>";
      }).join("");
  }

  /* ---- profile -------------------------------------------------------- */

  var sheetScroll = 0;

  function open(slug, push) {
    var p = state.all.filter(function (x) { return x.slug === slug; })[0];
    if (!p || !p.bio) return;

    sheetScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    $("#tkteam-sheet").innerHTML =
      photoMarkup(p) +
      '<div class="tkteam-sbody">' +
        '<button type="button" class="tkteam-x" data-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        "</button>" +
        "<h2>" + esc(p.name) + "</h2>" +
        (p.role ? '<p class="tkteam-srole">' + esc(p.role) + "</p>" : "") +
        '<span class="tkteam-sgroup">' + esc(p.group) + "</span>" +
        '<p class="tkteam-sbio">' + esc(p.bio) + "</p>" +
      "</div>";

    el.modal.classList.add("is-open");
    document.body.classList.add("tkteam-locked");
    document.body.style.top = "-" + sheetScroll + "px";
    $(".tkteam-x", el.modal).focus();

    if (push !== false) {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("person", p.slug);
        history.pushState({ p: p.slug }, "", u.toString());
      } catch (e) { /* old browser: the deep link just does not update */ }
    }
  }

  function close(pop) {
    if (!el.modal.classList.contains("is-open")) return;
    el.modal.classList.remove("is-open");
    $("#tkteam-sheet").innerHTML = "";
    document.body.classList.remove("tkteam-locked");
    document.body.style.top = "";
    window.scrollTo(0, sheetScroll);
    if (!pop) {
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has("person")) {
          u.searchParams.delete("person");
          history.pushState({}, "", u.toString());
        }
      } catch (e) { /* no-op */ }
    }
  }

  /* ---- events --------------------------------------------------------- */

  function wire() {
    el.root.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-person],[data-group]");
      if (!t) return;
      if (t.hasAttribute("data-person")) open(t.getAttribute("data-person"));
      else { state.group = t.getAttribute("data-group"); paint(); }
    });

    el.modal.addEventListener("click", function (ev) {
      if (ev.target === el.modal || ev.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && el.modal.classList.contains("is-open")) close();
    });
    window.addEventListener("popstate", function () {
      var slug = new URLSearchParams(window.location.search).get("person");
      if (slug) open(slug, false); else close(true);
    });
  }

  /* ---- boot ----------------------------------------------------------- */

  function load() {
    return getJSON("wp/v2/categories", { slug: CONFIG.parentCategory, per_page: 1 })
      .then(function (cats) {
        if (!cats.length) {
          throw new Error('No category named "' + CONFIG.parentCategory +
            '" was found. Create it in WordPress under Posts → Categories, then reload.');
        }
        state.parentId = cats[0].id;
        return getJSON("wp/v2/posts", {
          categories: state.parentId, per_page: 100, _embed: 1, orderby: "date", order: "asc"
        });
      })
      .then(function (items) {
        state.all = items.map(normalise).filter(function (p) { return p.name; });
        state.seeded = false;
        if (!state.all.length) { state.all = seedPeople(); state.seeded = state.all.length > 0; }
      });
  }

  /* The built-in board, shaped exactly like a person read from WordPress so
     nothing downstream has to know the difference. */
  function seedPeople() {
    return (CONFIG.seed || []).map(function (s, i) {
      return {
        id: 0, slug: "seed-" + i, status: "publish", seed: true,
        name: s.name, role: s.role || "",
        group: s.group || CONFIG.groups[0],
        photo: s.photo ? (/^https?:/i.test(s.photo) ? s.photo : CONFIG.media + s.photo) : "",
        order: typeof s.order === "number" ? s.order : 50,
        bio: s.bio || ""
      };
    });
  }

  function boot() {
    el.root = $(".tkteam");
    if (!el.root) return;
    el.chips = $("#tkteam-chips");
    el.groups = $("#tkteam-groups");
    el.empty = $("#tkteam-empty");
    el.live = $("#tkteam-live");
    el.modal = $("#tkteam-modal");

    el.groups.innerHTML = '<div class="tkteam-grid">' + new Array(6).join(
      '<div class="tkteam-skel"><i></i><span style="width:70%"></span><span style="width:45%"></span></div>') +
      "</div>";
    portraits();
    wire();

    load().then(function () {
      paint();
      var slug = new URLSearchParams(window.location.search).get("person");
      if (slug) open(slug, false);
      admin();
    }).catch(function (err) {
      /* Even a missing category leaves the page looking finished: the
         built-in board stands in, and the panel reports the real problem
         to whoever can fix it. */
      el.groups.innerHTML = "";
      state.all = seedPeople();
      state.seeded = state.all.length > 0;
      state.error = err.message || "Something went wrong.";
      if (state.seeded) paint();
      else {
        el.empty.innerHTML = '<div class="tkteam-state"><h3>The team could not be loaded</h3><p>' +
          esc(state.error) + "</p></div>";
      }
      admin();
    });
  }

  /* ======================================================================
     Staff panel
     ====================================================================== */

  /* Sign-in is the WordPress session and nothing else. No password is asked
     for or stored here: the browser already holds the login cookie, and the
     nonce printed by plugin/tkpub-nonce-snippet.php is what lets the REST
     API trust it. WordPress re-checks capabilities on every write. */
  var auth = { nonce: null, user: null };

  function authHeaders(extra) {
    var h = Object.assign({}, extra || {});
    if (auth.nonce) h["X-WP-Nonce"] = auth.nonce;
    return h;
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = authHeaders(opts.headers);
    return getJSON(path, opts.params, opts);
  }

  var termCache = {};
  function ensureGroup(name) {
    name = String(name || "").trim();
    if (!name) return Promise.resolve(null);
    var key = name.toLowerCase();
    if (termCache[key]) return Promise.resolve(termCache[key]);

    return api("wp/v2/categories", { params: { search: name, per_page: 100, hide_empty: false } })
      .then(function (list) {
        var hit = (list || []).filter(function (t) {
          return t.name.toLowerCase() === key && t.parent === state.parentId;
        })[0];
        if (hit) return hit.id;
        /* A group must sit under the team category or the page will not
           find people filed only under it. */
        return api("wp/v2/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name, parent: state.parentId })
        }).then(function (t) { return t.id; });
      })
      .then(function (id) { if (id) termCache[key] = id; return id; });
  }

  /* The photograph goes into the ordinary WordPress media library, so it can
     be reused and is deleted the ordinary way. The medium-large copy is
     preferred over the original: a phone photograph is often 4 MB. */
  function upload(file) {
    var fd = new FormData();
    fd.append("file", file, file.name);
    return fetch(restUrl("wp/v2/media"), {
      method: "POST", credentials: "same-origin", headers: authHeaders(), body: fd
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.message) || "The photo could not be uploaded.");
        var sizes = (body.media_details && body.media_details.sizes) || {};
        var pick = sizes.medium_large || sizes.large || sizes.medium;
        return (pick && pick.source_url) || body.source_url;
      });
    });
  }

  /* Shown only when the session cannot be used — almost always because the
     nonce snippet is not installed. There is nothing for staff to type. */
  function loginMarkup() {
    return '<div class="tkteam-callout"><b>Not able to publish from here yet.</b> ' +
      "This panel uses your WordPress login, so there is no password to enter. " +
      "It needs the site to print a REST nonce, which the <b>TK Publications " +
      "nonce snippet</b> plugin does.</div>" +
      '<p class="tkteam-hint" style="max-width:52ch">If the plugin is installed and you ' +
      "still see this, sign out of WordPress and back in — the nonce expires with " +
      "the session. In the meantime you can add people from " +
      "<b>Posts &rarr; Add New</b> in the WordPress admin.</p>";
  }

  function formMarkup() {
    return '<form id="tkteam-form" novalidate>' +
      (state.seeded ? '<div class="tkteam-callout"><b>The board on the page is built into it.</b> ' +
        "Nobody has been published yet, so the page is showing the seven names written " +
        "into the code. The moment you publish one real person here, that built-in list " +
        "disappears and only what you publish is shown &mdash; so publish all of them, " +
        "not some.</div>" : "") +
      '<div class="tkteam-note"><b>Before you publish.</b> Use a photograph the person has ' +
        "agreed may appear on a public website, and the name and title they want shown. " +
        "Staff working directly with survivors may prefer a first name and a role only.</div>" +

      '<div class="tkteam-f"><label for="tkteam-n">Full name</label>' +
        '<input type="text" id="tkteam-n" maxlength="120" placeholder="Sr. Joyce Nyagucha" required>' +
        '<p class="tkteam-err" data-e="tkteam-n" hidden></p></div>' +

      '<div class="tkteam-two">' +
        '<div class="tkteam-f"><label for="tkteam-r">Designation</label>' +
          '<input type="text" id="tkteam-r" list="tkteam-roles" maxlength="80" ' +
            'placeholder="Board Vice Chair" required>' +
          '<datalist id="tkteam-roles">' +
            CONFIG.roles.map(function (r) { return '<option value="' + esc(r) + '"></option>'; }).join("") +
          "</datalist>" +
          '<p class="tkteam-err" data-e="tkteam-r" hidden></p></div>' +
        '<div class="tkteam-f"><label for="tkteam-g">Group</label>' +
          '<select id="tkteam-g" required>' +
          CONFIG.groups.map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + "</option>"; }).join("") +
          "</select>" +
          '<span class="tkteam-hint">Each group becomes a section on the page.</span></div>' +
      "</div>" +

      '<div class="tkteam-f"><span class="lbl">Photograph</span>' +
        '<div class="tkteam-pick">' +
          '<span class="tkteam-drop" id="tkteam-drop">' +
            '<span class="tkteam-mono" id="tkteam-mono">?</span></span>' +
          "<div>" +
            '<input type="file" class="tkteam-file" id="tkteam-file" accept="image/*">' +
            '<button type="button" class="tkteam-up" data-pick>' + I.up + " Choose a photo</button>" +
            '<input type="url" id="tkteam-photo" placeholder="or paste a link from the media library" ' +
              'style="margin-top:9px">' +
            '<span class="tkteam-hint">Portrait orientation works best. Optional &mdash; without ' +
              "one the card shows the person's initials.</span>" +
            '<p class="tkteam-err" data-e="tkteam-photo" hidden></p>' +
          "</div>" +
        "</div></div>" +

      '<div class="tkteam-f"><label for="tkteam-b">Short biography</label>' +
        '<textarea id="tkteam-b" maxlength="600"></textarea>' +
        '<span class="tkteam-hint">Optional. Two or three sentences. Only people with a ' +
          "biography are clickable on the page.</span></div>" +

      '<div class="tkteam-f" style="max-width:220px"><label for="tkteam-o">Display order</label>' +
        '<input type="number" id="tkteam-o" value="50" min="1" max="999" step="1">' +
        '<span class="tkteam-hint">Lower comes first. Chair 10, vice chair 20, ' +
          "members 50.</span></div>" +

      '<div class="tkteam-foot">' +
        '<button type="button" class="tkteam-btn tkteam-g" data-save="draft">Save draft</button>' +
        '<button type="submit" class="tkteam-btn tkteam-p" data-save="publish">Publish</button>' +
      "</div></form>";
  }

  function panelMarkup() {
    return '<div class="tkteam-abar"><span>' + I.lock + "</span>" +
        '<div><h2>Team panel</h2><p id="tkteam-asub">Staff only — visitors never see this.</p></div>' +
        '<div class="tkteam-aact" id="tkteam-aact"></div></div>' +
      '<div class="tkteam-abody">' +
        '<div id="tkteam-auth">' + loginMarkup() + "</div>" +
        '<div id="tkteam-main" hidden>' +
          '<div class="tkteam-tabs" role="tablist">' +
            '<button type="button" role="tab" data-tab="new" aria-selected="true">Add a person</button>' +
            '<button type="button" role="tab" data-tab="manage" aria-selected="false">Manage</button>' +
          "</div>" +
          '<div data-panel="new">' + formMarkup() + "</div>" +
          '<div data-panel="manage" hidden><div class="tkteam-rows" id="tkteam-rows"></div></div>' +
        "</div></div>";
  }

  function err(id, msg) {
    var i = $("#" + id); if (i) i.classList.add("tkteam-bad");
    var p = $('[data-e="' + id + '"]'); if (p) { p.textContent = msg; p.hidden = false; }
  }
  function clearErr(id) {
    var i = $("#" + id); if (i) i.classList.remove("tkteam-bad");
    var p = $('[data-e="' + id + '"]'); if (p) p.hidden = true;
  }

  function drawDrop() {
    var url = $("#tkteam-photo").value.trim();
    var drop = $("#tkteam-drop");
    var old = $("img", drop);
    if (old) drop.removeChild(old);
    var g = gradFor($("#tkteam-n").value || "x");
    var mono = $("#tkteam-mono");
    mono.textContent = initials($("#tkteam-n").value) || "?";
    mono.style.setProperty("--t-c1", g[0]);
    mono.style.setProperty("--t-c2", g[1]);
    if (!url) return;
    var img = new Image();
    img.className = "tkteam-img is-on";
    img.alt = "";
    img.src = url;
    drop.appendChild(img);
  }

  function save(status) {
    ["tkteam-n", "tkteam-r"].forEach(clearErr);

    var d = {
      name: $("#tkteam-n").value.trim(),
      role: $("#tkteam-r").value.trim(),
      group: $("#tkteam-g").value,
      photo: $("#tkteam-photo").value.trim(),
      bio: $("#tkteam-b").value.trim(),
      order: parseInt($("#tkteam-o").value, 10) || 50
    };

    var bad = null;
    if (!d.name) { err("tkteam-n", "A name is required."); bad = bad || "tkteam-n"; }
    if (!d.role) { err("tkteam-r", "Give the designation, e.g. Board Member."); bad = bad || "tkteam-r"; }
    if (bad) { var n = $("#" + bad); if (n && n.focus) n.focus(); return; }

    $$("#tkteam-form [data-save]").forEach(function (b) { b.disabled = true; });

    ensureGroup(d.group).then(function (gid) {
      var payload = { role: d.role, photo: d.photo, order: d.order };
      return api("wp/v2/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: d.name,
          excerpt: d.bio,
          status: status,
          categories: [state.parentId, gid].filter(Boolean),
          content: "<!--TKTEAM:" + JSON.stringify(payload) + "-->\n<p>" + esc(d.bio) + "</p>"
        })
      });
    }).then(function () {
      toast(status === "publish" ? "Published. They are on the page now." : "Draft saved.", "ok");
      $("#tkteam-form").reset();
      drawDrop();
      return load().then(paint).then(rows);
    }).catch(function (e) {
      toast(e.message || "Could not save this person.", "err");
    }).then(function () {
      $$("#tkteam-form [data-save]").forEach(function (b) { b.disabled = false; });
    });
  }

  function rows() {
    var host = $("#tkteam-rows");
    if (!host) return;
    host.innerHTML = '<p class="tkteam-hint">Loading…</p>';
    api("wp/v2/posts", { params: {
      categories: state.parentId, per_page: 100, status: "publish,draft,pending",
      orderby: "date", order: "asc", _embed: 1
    } }).then(function (items) {
      if (!items.length) {
        host.innerHTML = '<p class="tkteam-hint">Nobody has been published yet. The board ' +
          "on the page is the built-in list.</p>";
        return;
      }
      host.innerHTML = items.map(normalise).sort(byOrder).map(function (p) {
        return '<div class="tkteam-row">' +
          photoMarkup(p, "tkteam-rowimg") +
          "<div><b>" + esc(p.name) + "</b><small>" + esc([p.role, p.group].filter(Boolean).join(" · ")) +
            "</small></div>" +
          '<span class="tkteam-st is-' + esc(p.status) + '">' + esc(p.status) + "</span>" +
          '<button type="button" class="tkteam-del" data-del="' + p.id +
            '" aria-label="Move to trash">' + I.trash + "</button></div>";
      }).join("");
    }).catch(function (e) {
      host.innerHTML = '<p class="tkteam-err">' + esc(e.message) + "</p>";
    });
  }

  function verify() {
    return api("wp/v2/users/me", { params: { context: "edit" } }).then(function (me) {
      var c = me.capabilities || {};
      if (!c.edit_posts && !c.publish_posts) throw new Error("That account cannot publish.");
      auth.user = { name: me.name };
      return me;
    });
  }

  function signedIn() {
    $("#tkteam-auth").hidden = true;
    $("#tkteam-main").hidden = false;
    $("#tkteam-asub").textContent = state.error
      ? state.error : "Signed in with your WordPress session.";
    var host = $("#tkteam-admin");
    $("#tkteam-aact").innerHTML =
      '<span class="tkteam-who">' + esc(auth.user.name) + "</span>" +
      '<button type="button" class="tkteam-btn tkteam-p tkteam-sm" data-toggle>' +
      (host.classList.contains("is-open") ? "Close panel" : "Open panel") + "</button>";
    drawDrop();
    rows();
  }

  function signedOut() {
    $("#tkteam-auth").hidden = false;
    $("#tkteam-main").hidden = true;
    var host = $("#tkteam-admin");
    $("#tkteam-aact").innerHTML =
      '<button type="button" class="tkteam-btn tkteam-p tkteam-sm" data-toggle>' +
      (host.classList.contains("is-open") ? "Close panel" : "Open panel") + "</button>";
  }

  function admin() {
    var host = $("#tkteam-admin");
    if (!host) return;
    if (!document.body.classList.contains("logged-in") && !host.hasAttribute("data-force-admin")) return;

    host.classList.add("is-visible");
    host.innerHTML = panelMarkup();

    auth.nonce = (typeof window.tkpubNonce === "string" && window.tkpubNonce) ||
      (window.wpApiSettings && window.wpApiSettings.nonce) || null;
    if (auth.nonce) verify().then(signedIn, function () { auth.nonce = null; signedOut(); });
    else signedOut();

    host.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (ev.target.id === "tkteam-form") save("publish");
    });

    host.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-toggle],[data-tab],[data-save],[data-del],[data-pick]");
      if (!t) return;
      if (t.hasAttribute("data-toggle")) {
        host.classList.toggle("is-open");
        t.textContent = host.classList.contains("is-open") ? "Close panel" : "Open panel";
      } else if (t.hasAttribute("data-tab")) {
        var tab = t.getAttribute("data-tab");
        $$("[data-tab]", host).forEach(function (b) { b.setAttribute("aria-selected", String(b === t)); });
        $$("[data-panel]", host).forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
        if (tab === "manage") rows();
      } else if (t.hasAttribute("data-pick")) {
        $("#tkteam-file").click();
      } else if (t.getAttribute("data-save") === "draft") {
        save("draft");
      } else if (t.hasAttribute("data-del")) {
        if (!window.confirm("Move this person to the trash?\n\nThey disappear from the page " +
          "immediately and can be restored from WordPress for 30 days.")) return;
        api("wp/v2/posts/" + t.getAttribute("data-del"), { method: "DELETE" })
          .then(function () { toast("Moved to the trash.", "ok"); rows(); return load().then(paint); })
          .catch(function (e) { toast(e.message, "err"); });
      }
    });

    /* Upload straight from a phone: staff photograph people at meetings and
       add them there and then. */
    host.addEventListener("change", function (ev) {
      if (ev.target.id !== "tkteam-file") return;
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      clearErr("tkteam-photo");
      var btn = $("[data-pick]");
      btn.disabled = true;
      btn.textContent = "Uploading…";
      upload(file).then(function (url) {
        $("#tkteam-photo").value = url;
        drawDrop();
        toast("Photo uploaded.", "ok");
      }).catch(function (e) {
        err("tkteam-photo", e.message || "The photo could not be uploaded.");
      }).then(function () {
        btn.disabled = false;
        btn.innerHTML = I.up + " Choose a photo";
        ev.target.value = "";
      });
    });

    /* The card preview tracks the name and the link as they are typed, so a
       wrong link shows up here rather than as a broken card after publishing. */
    host.addEventListener("input", function (ev) {
      if (ev.target.id === "tkteam-photo" || ev.target.id === "tkteam-n") {
        if (ev.target.id === "tkteam-n") clearErr("tkteam-n");
        drawDrop();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
