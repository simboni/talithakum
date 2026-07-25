/* ==========================================================================
   Talitha Kum Kenya — Videos (public page + staff panel, one file)

   Kept small on purpose. A video is a link, so nothing here uploads files,
   renders documents or loads a third-party player on page view. What you get
   is a thumbnail; the YouTube or Vimeo iframe is created only when someone
   presses play. On a phone on mobile data that is the difference between a
   page that opens and one that does not.

   Data model mirrors the publications page, so staff learn one system:

     Parent category   videos            (create it in WordPress)
       child category  = the video type  (Awareness Video, Testimony, ...)
       tags            = themes + keywords
       everything else = a machine-readable comment in the post content:
                         <!--TKVID:{"url":"...","id":"...","dur":"4:32"}-->

   Access works exactly as it does on the publications page: the panel is
   drawn only for logged-in users, signs itself in with the REST nonce when
   plugin/tkpub-nonce-snippet.php is installed, and falls back to an
   Application Password otherwise. WordPress re-checks capabilities on the
   server for every write, so the front end is convenience, not security.
   ========================================================================== */

(function () {
  "use strict";

  /* ---- config: edit this block, nothing else ------------------------- */

  var CONFIG = {
    restRoot: "/wp-json/",
    parentCategory: "videos",
    org: "Talitha Kum Kenya",
    types: [
      "Awareness Video", "Testimony", "Training", "Event Highlights",
      "Interview", "Prayer & Reflection", "Documentary", "Public Service Announcement"
    ],
    themes: [
      "Prevention", "Protection", "Partnership", "Prayer",
      "Child Trafficking", "Labour Exploitation", "Safe Migration", "Survivor Care",
      "Digital Safety", "Youth & Schools", "Advocacy", "Faith Formation"
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
  function niceDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }

  var GRADS = [["#F74F22", "#B32E0B"], ["#FFAC00", "#E07A00"], ["#FB8518", "#C4490D"], ["#3A3A3A", "#151515"]];
  function gradFor(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
    return GRADS[h % GRADS.length];
  }

  var I = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>'
  };

  function toast(msg, kind) {
    var host = $(".tkvid-toasts");
    if (!host) return;
    var t = document.createElement("div");
    t.className = "tkvid-toast" + (kind ? " is-" + kind : "");
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "err" ? 6000 : 3500);
  }

  /* ---- video links ----------------------------------------------------
     Recognises the shapes people actually paste: a share link, a browser
     URL, a Shorts link, an embed. Anything unrecognised still publishes —
     it just opens on the original site instead of playing in the page.     */

  var YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
  var VM = /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{6,})/;

  function parseVideo(url) {
    url = String(url || "").trim();
    if (!url) return null;

    var m = YT.exec(url);
    if (m) {
      return {
        provider: "youtube", id: m[1],
        /* nocookie: no tracking cookie is set unless the visitor plays it. */
        embed: "https://www.youtube-nocookie.com/embed/" + m[1] + "?autoplay=1&rel=0&playsinline=1&modestbranding=1",
        watch: "https://www.youtube.com/watch?v=" + m[1],
        thumb: "https://i.ytimg.com/vi/" + m[1] + "/hqdefault.jpg"
      };
    }
    m = VM.exec(url);
    if (m) {
      return {
        provider: "vimeo", id: m[1],
        embed: "https://player.vimeo.com/video/" + m[1] + "?autoplay=1",
        watch: "https://vimeo.com/" + m[1],
        thumb: ""   // Vimeo needs an API call for this; the card draws a cover instead
      };
    }
    if (!/^https?:\/\//i.test(url)) return null;
    return { provider: "link", id: "", embed: "", watch: url, thumb: "" };
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

  var PAYLOAD = /<!--\s*TKVID:(\{[\s\S]*?\})\s*-->/;
  var state = { all: [], shown: [], q: "", type: "", parentId: null };
  var el = {};

  function normalise(item) {
    var data = {};
    var m = PAYLOAD.exec((item.content && item.content.rendered) || "");
    if (m) { try { data = JSON.parse(m[1]); } catch (e) { data = {}; } }

    var terms = [];
    ((item._embedded && item._embedded["wp:term"]) || []).forEach(function (g) {
      if (Array.isArray(g)) terms = terms.concat(g);
    });

    var type = "Video", themes = [];
    terms.forEach(function (t) {
      if (t.taxonomy === "category" && t.parent === state.parentId) type = t.name;
      else if (t.taxonomy === "post_tag") themes.push(t.name);
    });

    var v = parseVideo(data.url || "") || { provider: "link", embed: "", watch: data.url || "", thumb: "" };
    var summary = plain(item.excerpt && item.excerpt.rendered);

    return {
      id: item.id,
      slug: item.slug,
      status: item.status,
      title: plain(item.title && item.title.rendered),
      summary: summary,
      date: data.date || item.date,
      type: type,
      themes: themes.slice(0, 3),
      keywords: themes,
      url: data.url || "",
      dur: data.dur || "",
      featured: !!data.featured,
      provider: v.provider,
      embed: v.embed,
      watch: v.watch,
      thumb: v.thumb,
      hay: [item.title && item.title.rendered, summary, type, themes.join(" ")].join(" ").toLowerCase()
    };
  }

  /* ---- rendering ------------------------------------------------------ */

  function thumbMarkup(v) {
    var g = gradFor(v.title || v.slug || "x");
    var inner = v.thumb
      ? '<img src="' + esc(v.thumb) + '" alt="" loading="lazy" width="480" height="270">'
      : '<span class="tkvid-fallback" style="--v-c1:' + g[0] + ';--v-c2:' + g[1] + '"></span>';
    return '<button type="button" class="tkvid-thumb" data-play="' + esc(v.slug) + '" ' +
      'aria-label="Play: ' + esc(v.title) + '">' + inner +
      '<span class="tkvid-play">' + I.play + "</span>" +
      (v.dur ? '<span class="tkvid-dur">' + esc(v.dur) + "</span>" : "") +
      "</button>";
  }

  function cardMarkup(v, featured) {
    return '<article class="tkvid-card">' + thumbMarkup(v) +
      '<div class="tkvid-body">' +
        (featured ? '<span class="tkvid-flag">Latest</span>' : "") +
        '<p class="tkvid-type">' + esc(v.type) + "</p>" +
        "<h3>" + esc(v.title) + "</h3>" +
        (v.summary ? '<p class="tkvid-sum">' + esc(v.summary) + "</p>" : "") +
        '<div class="tkvid-meta"><span>' + I.cal + " " + esc(niceDate(v.date)) + "</span>" +
          (v.provider === "link" ? "<span>Opens on the original site</span>" : "") + "</div>" +
        (v.themes.length ? '<div class="tkvid-tags">' + v.themes.map(function (t) {
          return '<button type="button" class="tkvid-tag" data-tag="' + esc(t) + '">' + esc(t) + "</button>";
        }).join("") + "</div>" : "") +
      "</div></article>";
  }

  function paint() {
    var q = state.q.toLowerCase().trim();
    var words = q ? q.split(/\s+/) : [];

    state.shown = state.all.filter(function (v) {
      if (state.type && v.type !== state.type) return false;
      return words.every(function (w) { return v.hay.indexOf(w) > -1; });
    });

    var filtered = !!(state.q || state.type);
    var list = state.shown, feat = null;
    if (!filtered && list.length > 2) {
      feat = list.filter(function (v) { return v.featured; })[0] || list[0];
      list = list.filter(function (v) { return v !== feat; });
    }

    el.featured.innerHTML = feat ? cardMarkup(feat, true) : "";
    el.grid.innerHTML = list.map(function (v) { return cardMarkup(v); }).join("");

    el.empty.innerHTML = state.shown.length ? "" :
      '<div class="tkvid-state"><h3>' +
      (filtered ? "No videos match that" : "No videos yet") + "</h3><p>" +
      (filtered ? "Try a broader word, or choose All." : "New videos are added regularly.") +
      "</p></div>";

    var n = state.shown.length;
    el.count.innerHTML = "<strong>" + n + "</strong> video" + (n === 1 ? "" : "s") +
      (filtered ? " matching" : "");
    el.live.textContent = n + " video" + (n === 1 ? "" : "s");

    /* Chips are built from what is actually published, not a fixed list. */
    var counts = {};
    state.all.forEach(function (v) { counts[v.type] = (counts[v.type] || 0) + 1; });
    el.chips.innerHTML =
      '<button type="button" class="tkvid-chip" data-type="" aria-pressed="' + (!state.type) + '">All</button>' +
      Object.keys(counts).sort().map(function (t) {
        return '<button type="button" class="tkvid-chip" data-type="' + esc(t) + '" aria-pressed="' +
          (state.type === t) + '">' + esc(t) + "<b>" + counts[t] + "</b></button>";
      }).join("");
  }

  /* ---- player --------------------------------------------------------- */

  var playerScroll = 0;

  function play(slug, push) {
    var v = state.all.filter(function (x) { return x.slug === slug; })[0];
    if (!v) return;

    /* Unrecognised links are honest about it rather than showing a blank box. */
    if (!v.embed) { window.open(v.watch, "_blank", "noopener"); return; }

    playerScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    $("#tkvid-ptitle").textContent = v.title;
    $("#tkvid-pmeta").textContent = [v.type, niceDate(v.date), v.dur].filter(Boolean).join("  ·  ");
    $("#tkvid-pout").href = v.watch;
    /* The iframe is created here and nowhere else — this is the only moment
       any third-party code enters the page. */
    $("#tkvid-frame").innerHTML =
      '<iframe src="' + esc(v.embed) + '" title="' + esc(v.title) + '" allowfullscreen ' +
      'allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" ' +
      'referrerpolicy="strict-origin-when-cross-origin"></iframe>';

    el.modal.classList.add("is-open");
    document.body.classList.add("tkvid-locked");
    document.body.style.top = "-" + playerScroll + "px";
    $(".tkvid-x", el.modal).focus();

    if (push !== false) {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("video", v.slug);
        history.pushState({ v: v.slug }, "", u.toString());
      } catch (e) { /* old browser: the deep link just does not update */ }
    }
  }

  function stop(pop) {
    if (!el.modal.classList.contains("is-open")) return;
    el.modal.classList.remove("is-open");
    /* Emptying the frame stops playback and unloads the player entirely. */
    $("#tkvid-frame").innerHTML = "";
    document.body.classList.remove("tkvid-locked");
    document.body.style.top = "";
    window.scrollTo(0, playerScroll);
    if (!pop) {
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has("video")) {
          u.searchParams.delete("video");
          history.pushState({}, "", u.toString());
        }
      } catch (e) { /* no-op */ }
    }
  }

  /* ---- events --------------------------------------------------------- */

  function wire() {
    el.search.addEventListener("input", debounce(function () {
      state.q = el.search.value;
      paint();
    }, 180));

    el.root.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-play],[data-type],[data-tag]");
      if (!t) return;
      if (t.hasAttribute("data-play")) play(t.getAttribute("data-play"));
      else if (t.hasAttribute("data-type")) { state.type = t.getAttribute("data-type"); paint(); }
      else if (t.hasAttribute("data-tag")) { state.q = t.getAttribute("data-tag"); el.search.value = state.q; paint(); }
    });

    el.modal.addEventListener("click", function (ev) {
      if (ev.target === el.modal || ev.target.closest("[data-close]")) stop();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && el.modal.classList.contains("is-open")) stop();
    });
    window.addEventListener("popstate", function () {
      var slug = new URLSearchParams(window.location.search).get("video");
      if (slug) play(slug, false); else stop(true);
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
          categories: state.parentId, per_page: 100, _embed: 1, orderby: "date", order: "desc"
        });
      })
      .then(function (items) {
        state.all = items.map(normalise).filter(function (v) { return v.title; });
      });
  }

  function boot() {
    el.root = $(".tkvid");
    if (!el.root) return;
    el.search = $("#tkvid-search");
    el.chips = $("#tkvid-chips");
    el.grid = $("#tkvid-grid");
    el.featured = $("#tkvid-featured");
    el.empty = $("#tkvid-empty");
    el.count = $("#tkvid-count");
    el.live = $("#tkvid-live");
    el.modal = $("#tkvid-modal");

    el.grid.innerHTML = new Array(7).join(
      '<div class="tkvid-skel"><i></i><span style="width:40%"></span><span style="width:85%"></span></div>');
    wire();

    load().then(function () {
      paint();
      var slug = new URLSearchParams(window.location.search).get("video");
      if (slug) play(slug, false);
      admin();
    }).catch(function (err) {
      el.grid.innerHTML = "";
      el.empty.innerHTML = '<div class="tkvid-state"><h3>The videos could not be loaded</h3><p>' +
        esc(err.message || "Something went wrong.") + "</p></div>";
      admin();
    });
  }

  /* ======================================================================
     Staff panel
     ====================================================================== */

  var auth = { header: null, nonce: null, user: null };

  function authHeaders(extra) {
    var h = Object.assign({}, extra || {});
    if (auth.header) h.Authorization = auth.header;
    else if (auth.nonce) h["X-WP-Nonce"] = auth.nonce;
    return h;
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = authHeaders(opts.headers);
    return getJSON(path, opts.params, opts);
  }
  function usingCookie() { return !!auth.nonce && !auth.header; }

  var termCache = {};
  function ensureTerm(kind, name) {
    name = String(name || "").trim();
    if (!name) return Promise.resolve(null);
    var path = kind === "type" ? "wp/v2/categories" : "wp/v2/tags";
    var key = path + "|" + name.toLowerCase();
    if (termCache[key]) return Promise.resolve(termCache[key]);

    return api(path, { params: { search: name, per_page: 100, hide_empty: false } })
      .then(function (list) {
        var hit = (list || []).filter(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })[0];
        if (hit) return hit.id;
        var body = { name: name };
        /* A type must sit under the videos category or the page will not
           find posts filed only under it. */
        if (kind === "type" && state.parentId) body.parent = state.parentId;
        return api(path, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        }).then(function (t) { return t.id; });
      })
      .then(function (id) { if (id) termCache[key] = id; return id; });
  }

  function loginMarkup() {
    return '<div class="tkvid-callout"><b>Signing in.</b> If the site prints a REST nonce ' +
      "you are signed in automatically. Otherwise use your WordPress username and an " +
      "Application Password from Users → Profile.</div>" +
      '<form id="tkvid-login" novalidate style="max-width:440px">' +
        '<div class="tkvid-f"><label for="tkvid-u">WordPress username</label>' +
          '<input type="text" id="tkvid-u" autocomplete="username" required></div>' +
        '<div class="tkvid-f"><label for="tkvid-pw">Application Password</label>' +
          '<input type="password" id="tkvid-pw" autocomplete="current-password" ' +
            'placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" required>' +
          '<span class="tkvid-hint">Spaces are removed automatically.</span></div>' +
        '<p class="tkvid-err" id="tkvid-lerr" hidden></p>' +
        '<button type="submit" class="tkvid-btn tkvid-p">Sign in</button>' +
      "</form>";
  }

  function formMarkup() {
    return '<form id="tkvid-form" novalidate>' +
      '<div class="tkvid-note"><b>Before you publish.</b> If anyone in the video could be ' +
        "identified as a survivor, or is a child, written consent must be on file. If you are " +
        "not sure, save it as a draft and ask the coordinator.</div>" +

      '<div class="tkvid-f"><label for="tkvid-url">Video link</label>' +
        '<input type="url" id="tkvid-url" placeholder="https://www.youtube.com/watch?v=..." required>' +
        '<span class="tkvid-hint">Paste the YouTube or Vimeo link. Share links, Shorts and ' +
          "browser URLs all work.</span>" +
        '<p class="tkvid-err" data-e="tkvid-url" hidden></p>' +
        '<div id="tkvid-prev"></div></div>' +

      '<div class="tkvid-f"><label for="tkvid-t">Title</label>' +
        '<input type="text" id="tkvid-t" maxlength="150" required>' +
        '<p class="tkvid-err" data-e="tkvid-t" hidden></p></div>' +

      '<div class="tkvid-f"><label for="tkvid-s">Short description</label>' +
        '<textarea id="tkvid-s" maxlength="400"></textarea>' +
        '<span class="tkvid-hint">One or two sentences. What is it, and who is it for?</span></div>' +

      '<div class="tkvid-two">' +
        '<div class="tkvid-f"><label for="tkvid-ty">Type</label>' +
          '<select id="tkvid-ty" required><option value="">Choose a type…</option>' +
          CONFIG.types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("") +
          "</select><p class=\"tkvid-err\" data-e=\"tkvid-ty\" hidden></p></div>" +
        '<div class="tkvid-f"><label for="tkvid-d">Date</label>' +
          '<input type="date" id="tkvid-d" required></div>' +
      "</div>" +

      '<div class="tkvid-f"><span class="lbl">Themes</span>' +
        '<div class="tkvid-checks" id="tkvid-th">' +
        CONFIG.themes.map(function (t) {
          return '<label class="tkvid-check"><input type="checkbox" value="' + esc(t) + '"><span>' + esc(t) + "</span></label>";
        }).join("") + "</div>" +
        '<span class="tkvid-hint">One to three. The first four are the four Ps.</span>' +
        '<p class="tkvid-err" data-e="tkvid-th" hidden></p></div>' +

      '<div class="tkvid-two">' +
        '<div class="tkvid-f"><label for="tkvid-k">Keywords</label>' +
          '<input type="text" id="tkvid-k" placeholder="Nairobi, schools, Bakhita Day">' +
          '<span class="tkvid-hint">Comma separated.</span></div>' +
        '<div class="tkvid-f"><label for="tkvid-du">Length</label>' +
          '<input type="text" id="tkvid-du" placeholder="4:32">' +
          '<span class="tkvid-hint">Optional. Shown on the thumbnail.</span></div>' +
      "</div>" +

      '<div class="tkvid-f"><label class="tkvid-switch"><input type="checkbox" id="tkvid-fe">' +
        '<span class="tkvid-track"></span><span>Feature this at the top</span></label></div>' +

      '<div class="tkvid-foot">' +
        '<button type="button" class="tkvid-btn tkvid-g" data-save="draft">Save draft</button>' +
        '<button type="submit" class="tkvid-btn tkvid-p" data-save="publish">Publish</button>' +
      "</div></form>";
  }

  function panelMarkup() {
    return '<div class="tkvid-abar"><span>' + I.lock + "</span>" +
        '<div><h2>Video panel</h2><p id="tkvid-asub">Staff only — visitors never see this.</p></div>' +
        '<div class="tkvid-aact" id="tkvid-aact"></div></div>' +
      '<div class="tkvid-abody">' +
        '<div id="tkvid-auth">' + loginMarkup() + "</div>" +
        '<div id="tkvid-main" hidden>' +
          '<div class="tkvid-tabs" role="tablist">' +
            '<button type="button" role="tab" data-tab="new" aria-selected="true">Add a video</button>' +
            '<button type="button" role="tab" data-tab="manage" aria-selected="false">Manage</button>' +
          "</div>" +
          '<div data-panel="new">' + formMarkup() + "</div>" +
          '<div data-panel="manage" hidden><div class="tkvid-rows" id="tkvid-rows"></div></div>' +
        "</div></div>";
  }

  function err(id, msg) {
    var i = $("#" + id); if (i) i.classList.add("tkvid-bad");
    var p = $('[data-e="' + id + '"]'); if (p) { p.textContent = msg; p.hidden = false; }
  }
  function clearErr(id) {
    var i = $("#" + id); if (i) i.classList.remove("tkvid-bad");
    var p = $('[data-e="' + id + '"]'); if (p) p.hidden = true;
  }

  function save(status) {
    ["tkvid-url", "tkvid-t", "tkvid-ty", "tkvid-th"].forEach(clearErr);

    var url = $("#tkvid-url").value.trim();
    var v = parseVideo(url);
    var d = {
      title: $("#tkvid-t").value.trim(),
      summary: $("#tkvid-s").value.trim(),
      type: $("#tkvid-ty").value,
      date: $("#tkvid-d").value,
      themes: $$("#tkvid-th input:checked").map(function (i) { return i.value; }),
      keywords: $("#tkvid-k").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      dur: $("#tkvid-du").value.trim(),
      featured: $("#tkvid-fe").checked
    };

    var bad = null;
    if (!v) { err("tkvid-url", "Paste a valid video link."); bad = bad || "tkvid-url"; }
    if (!d.title) { err("tkvid-t", "A title is required."); bad = bad || "tkvid-t"; }
    if (!d.type) { err("tkvid-ty", "Choose a type."); bad = bad || "tkvid-ty"; }
    if (!d.themes.length) { err("tkvid-th", "Pick at least one theme."); bad = bad || "tkvid-th"; }
    if (d.themes.length > 3) { err("tkvid-th", "Three at most."); bad = bad || "tkvid-th"; }
    if (bad) { var n = $("#" + bad); if (n && n.focus) n.focus(); return; }

    $$("#tkvid-form [data-save]").forEach(function (b) { b.disabled = true; });

    Promise.all([
      ensureTerm("type", d.type),
      Promise.all(d.themes.concat(d.keywords).map(function (t) { return ensureTerm("tag", t); }))
    ]).then(function (r) {
      var payload = { url: url, id: v.id, provider: v.provider, dur: d.dur,
        featured: d.featured, date: d.date };
      var body = {
        title: d.title,
        excerpt: d.summary,
        status: status,
        date: d.date + "T09:00:00",
        categories: [state.parentId, r[0]].filter(Boolean),
        tags: r[1].filter(Boolean),
        content: "<!--TKVID:" + JSON.stringify(payload) + "-->\n<p>" + esc(d.summary) + "</p>\n" +
          '<p><a href="' + esc(v.watch) + '" target="_blank" rel="noopener">Watch the video</a></p>'
      };
      return api("wp/v2/posts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
    }).then(function () {
      toast(status === "publish" ? "Published. It is on the page now." : "Draft saved.", "ok");
      $("#tkvid-form").reset();
      $("#tkvid-prev").innerHTML = "";
      $("#tkvid-d").value = new Date().toISOString().slice(0, 10);
      return load().then(paint).then(rows);
    }).catch(function (e) {
      toast(e.message || "Could not save the video.", "err");
    }).then(function () {
      $$("#tkvid-form [data-save]").forEach(function (b) { b.disabled = false; });
    });
  }

  function rows() {
    var host = $("#tkvid-rows");
    if (!host) return;
    host.innerHTML = '<p class="tkvid-hint">Loading…</p>';
    api("wp/v2/posts", { params: {
      categories: state.parentId, per_page: 50, status: "publish,draft,pending",
      orderby: "date", order: "desc", _embed: 1
    } }).then(function (items) {
      if (!items.length) { host.innerHTML = '<p class="tkvid-hint">No videos yet.</p>'; return; }
      host.innerHTML = items.map(function (p) {
        var v = normalise(p);
        return '<div class="tkvid-row">' +
          (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="" loading="lazy">' :
            '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E" alt="">') +
          "<div><b>" + esc(v.title) + "</b><small>" + esc(niceDate(v.date)) + "</small></div>" +
          '<span class="tkvid-st is-' + esc(p.status) + '">' + esc(p.status) + "</span>" +
          '<button type="button" class="tkvid-del" data-del="' + p.id +
            '" aria-label="Move to trash">' + I.trash + "</button></div>";
      }).join("");
    }).catch(function (e) {
      host.innerHTML = '<p class="tkvid-err">' + esc(e.message) + "</p>";
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
    $("#tkvid-auth").hidden = true;
    $("#tkvid-main").hidden = false;
    $("#tkvid-asub").textContent = usingCookie()
      ? "Signed in with your WordPress session." : "Add a video, classify it, publish it.";
    var host = $("#tkvid-admin");
    $("#tkvid-aact").innerHTML =
      '<span class="tkvid-who">' + esc(auth.user.name) + "</span>" +
      '<button type="button" class="tkvid-btn tkvid-p tkvid-sm" data-toggle>' +
      (host.classList.contains("is-open") ? "Close panel" : "Open panel") + "</button>";
    $("#tkvid-d").value = new Date().toISOString().slice(0, 10);
    rows();
  }

  function signedOut() {
    $("#tkvid-auth").hidden = false;
    $("#tkvid-main").hidden = true;
    var host = $("#tkvid-admin");
    $("#tkvid-aact").innerHTML =
      '<button type="button" class="tkvid-btn tkvid-p tkvid-sm" data-toggle>' +
      (host.classList.contains("is-open") ? "Close panel" : "Open panel") + "</button>";
  }

  function admin() {
    var host = $("#tkvid-admin");
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
      if (ev.target.id === "tkvid-form") return save("publish");
      if (ev.target.id !== "tkvid-login") return;

      var e = $("#tkvid-lerr");
      e.hidden = true;
      auth.header = "Basic " + btoa($("#tkvid-u").value.trim() + ":" + $("#tkvid-pw").value.replace(/\s+/g, ""));
      verify().then(signedIn, function (x) {
        auth.header = null;
        e.textContent = x.status === 401
          ? "That username or Application Password was not accepted." : (x.message || "Sign in failed.");
        e.hidden = false;
      });
    });

    host.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-toggle],[data-tab],[data-save],[data-del]");
      if (!t) return;
      if (t.hasAttribute("data-toggle")) {
        host.classList.toggle("is-open");
        t.textContent = host.classList.contains("is-open") ? "Close panel" : "Open panel";
      } else if (t.hasAttribute("data-tab")) {
        var tab = t.getAttribute("data-tab");
        $$("[data-tab]", host).forEach(function (b) { b.setAttribute("aria-selected", String(b === t)); });
        $$("[data-panel]", host).forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
        if (tab === "manage") rows();
      } else if (t.getAttribute("data-save") === "draft") {
        save("draft");
      } else if (t.hasAttribute("data-del")) {
        if (!window.confirm("Move this video to the trash?\n\nIt disappears from the page immediately " +
          "and can be restored from WordPress for 30 days.")) return;
        api("wp/v2/posts/" + t.getAttribute("data-del"), { method: "DELETE" })
          .then(function () { toast("Moved to the trash.", "ok"); rows(); return load().then(paint); })
          .catch(function (e) { toast(e.message, "err"); });
      }
    });

    /* Live thumbnail as soon as a link is pasted: a wrong URL shows up here
       rather than as a blank card after publishing. */
    host.addEventListener("input", function (ev) {
      if (ev.target.id !== "tkvid-url") return;
      clearErr("tkvid-url");
      var v = parseVideo(ev.target.value);
      var box = $("#tkvid-prev");
      if (!v) { box.innerHTML = ""; return; }
      box.innerHTML = '<div class="tkvid-prev" style="margin-top:8px">' +
        (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="">' : "") +
        "<div><b>" + (v.provider === "link" ? "Link recognised" : v.provider === "youtube" ? "YouTube" : "Vimeo") +
        "</b><span>" + (v.embed ? "Will play here on the page." :
          "Will open on the original site — it cannot be embedded.") + "</span></div></div>";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
