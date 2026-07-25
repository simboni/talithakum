/* ==========================================================================
   Talitha Kum RAHT Kenya — Publications repository (public front-end)

   Reads publications from the WordPress REST API and renders a filterable
   archive with an in-page PDF viewer. No build step, no dependencies.

   Two data modes, switched with one flag in TKPUB.config.mode:

   'posts'  Zero back-end work. Publications are ordinary WordPress posts
            filed under a parent category (default slug: "publications").
            Document type  = child category of that parent
            Themes/keywords= post tags
            Everything else (PDF URL, page count, language, ...) lives in a
            machine-readable comment the admin panel writes into the post:
              <!--TKPUB:{"pdf":"...","pages":24,"lang":"en", ...}-->

   'cpt'    Requires plugin/talithakum-publications.php. Clean custom post
            type with real taxonomies and meta fields.

   The rendering code is identical either way — normalise() flattens both
   shapes into the same publication object.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Configuration — edit this block, nothing else                       */
  /* ------------------------------------------------------------------ */

  var CONFIG = {
    mode: "posts",                    // 'posts' | 'cpt'
    restRoot: "/wp-json/",
    parentCategory: "publications",   // posts-mode: parent category slug
    perPage: 9,                       // cards shown before "Load more"
    maxFetch: 500,                    // safety ceiling on total items pulled
    defaultView: "grid",              // 'grid' | 'list'
    defaultSort: "newest",
    // Set to null to disable the in-page renderer and always use the
    // browser's own PDF viewer in an iframe.
    pdfjs: {
      lib: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      worker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
    },
    languages: { en: "English", sw: "Kiswahili", fr: "French" },
    org: "Talitha Kum Kenya"
  };

  /* If plugin/tkpub-nonce-snippet.php is installed it also tells us the real
     REST root, which matters on sites where a security plugin or unusual
     permalinks have moved it away from /wp-json/. */
  if (typeof window.tkpubRestRoot === "string" && window.tkpubRestRoot) {
    CONFIG.restRoot = window.tkpubRestRoot;
  }

  /* ------------------------------------------------------------------ */
  /* Tiny helpers                                                        */
  /* ------------------------------------------------------------------ */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Strips HTML that WordPress returns in rendered fields. */
  function plain(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  function clip(str, n) {
    str = String(str || "");
    return str.length <= n ? str : str.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
  }

  function bytes(n) {
    n = Number(n) || 0;
    if (!n) return "";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  }

  function prettyDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* Publications without a designed cover get a generated one. The gradients
     are drawn from the site's own palette rather than the whole colour wheel,
     so a shelf of generated covers still looks like one organisation.
     Deterministic: a given title always lands on the same gradient. */
  var COVER_GRADIENTS = [
    ["#F74F22", "#B32E0B"],   // primary
    ["#FFAC00", "#E07A00"],   // secondary
    ["#FB8518", "#C4490D"],   // the theme's blend of the two
    ["#3A3A3A", "#151515"],   // heading grey, for the sober documents
    ["#E8622A", "#8C2A08"],
    ["#FFC24D", "#F0850A"]
  ];

  function gradientFor(seed) {
    var h = 0, i;
    for (i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
    return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
  }

  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5A2 2 0 0 1 4 4h5a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2Z"/><path d="M22 5.5A2 2 0 0 0 20 4h-5a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22Z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.2 6.6.9-4.8 4.7 1.2 6.7L12 17.3 6.1 20.5l1.2-6.7L2.5 9.1l6.6-.9Z"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 13h6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M11 8.5v5M8.5 11h5M20 20l-3.5-3.5"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M8.5 11h5M20 20l-3.5-3.5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5.5 5.5L20 7"/></svg>'
  };

  /* ------------------------------------------------------------------ */
  /* REST plumbing                                                       */
  /* ------------------------------------------------------------------ */

  function restUrl(path, params) {
    var base = CONFIG.restRoot.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
    var qs = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") return;
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return base + (qs.length ? (base.indexOf("?") > -1 ? "&" : "?") + qs.join("&") : "");
  }

  function getJSON(path, params) {
    return fetch(restUrl(path, params), { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) {
        return res.json().then(
          function (body) { throw new Error(body && body.message ? body.message : "HTTP " + res.status); },
          function () { throw new Error("HTTP " + res.status); }
        );
      }
      return res.json().then(function (data) {
        return { data: data, totalPages: Number(res.headers.get("X-WP-TotalPages") || 1) };
      });
    });
  }

  /* Pulls every page of a collection, up to CONFIG.maxFetch items. */
  function getAll(path, params) {
    var out = [];
    function page(n) {
      var p = Object.assign({}, params, { per_page: 100, page: n });
      return getJSON(path, p).then(function (r) {
        out = out.concat(r.data);
        if (n < r.totalPages && out.length < CONFIG.maxFetch) return page(n + 1);
        return out;
      });
    }
    return page(1);
  }

  /* ------------------------------------------------------------------ */
  /* Normalising both data modes into one publication shape              */
  /* ------------------------------------------------------------------ */

  var PAYLOAD_RE = /<!--\s*TKPUB:(\{[\s\S]*?\})\s*-->/;

  function readPayload(rendered) {
    var m = PAYLOAD_RE.exec(String(rendered || ""));
    if (!m) return {};
    try { return JSON.parse(m[1]); } catch (e) { return {}; }
  }

  function stripPayload(rendered) {
    return String(rendered || "").replace(PAYLOAD_RE, "");
  }

  function embeddedTerms(item) {
    var groups = (item._embedded && item._embedded["wp:term"]) || [];
    var all = [];
    groups.forEach(function (g) { if (Array.isArray(g)) all = all.concat(g); });
    return all;
  }

  function embeddedCover(item) {
    var m = item._embedded && item._embedded["wp:featuredmedia"];
    if (!m || !m[0] || m[0].code) return { url: "", alt: "" };
    var media = m[0];
    var sizes = media.media_details && media.media_details.sizes;
    var pick = sizes && (sizes.medium_large || sizes.large || sizes.medium);
    return { url: (pick && pick.source_url) || media.source_url || "", alt: media.alt_text || "" };
  }

  function normalise(item, ctx) {
    var pub;

    if (CONFIG.mode === "cpt" && item.tk) {
      /* Plugin mode — the REST field does the work for us. */
      pub = {
        id: item.id,
        slug: item.slug,
        status: item.status,
        title: plain(item.title && item.title.rendered),
        summary: plain(item.excerpt && item.excerpt.rendered),
        date: item.date,
        link: item.link,
        pdf: item.tk.pdf_url || "",
        pages: Number(item.tk.pdf_pages) || 0,
        size: Number(item.tk.pdf_size) || 0,
        cover: item.tk.cover_url || "",
        coverAlt: item.tk.cover_alt || "",
        lang: item.tk.language || "en",
        issuer: item.tk.issuer || CONFIG.org,
        featured: !!item.tk.featured,
        downloads: Number(item.tk.downloads) || 0,
        type: (item.tk.type && item.tk.type[0]) ? item.tk.type[0].name : "Publication",
        typeSlug: (item.tk.type && item.tk.type[0]) ? item.tk.type[0].slug : "",
        themes: (item.tk.themes || []).map(function (t) { return t.name; }),
        keywords: (item.tk.keywords || []).map(function (t) { return t.name; })
      };
    } else {
      /* Posts mode — read the embedded payload and the category tree. */
      var data = readPayload(item.content && item.content.rendered);
      var terms = embeddedTerms(item);
      var cover = embeddedCover(item);

      var typeTerm = null, themes = [];
      terms.forEach(function (t) {
        if (t.taxonomy === "category") {
          if (t.parent === ctx.parentId) typeTerm = typeTerm || t;
        } else if (t.taxonomy === "post_tag") {
          themes.push(t.name);
        }
      });

      var summary = plain(item.excerpt && item.excerpt.rendered);
      if (!summary) summary = clip(plain(stripPayload(item.content && item.content.rendered)), 220);

      pub = {
        id: item.id,
        slug: item.slug,
        status: item.status,
        title: plain(item.title && item.title.rendered),
        summary: summary,
        date: data.date || item.date,
        link: item.link,
        pdf: data.pdf || "",
        pages: Number(data.pages) || 0,
        size: Number(data.size) || 0,
        cover: cover.url || data.cover || "",
        coverAlt: cover.alt || "",
        lang: data.lang || "en",
        issuer: data.issuer || CONFIG.org,
        featured: !!data.featured,
        downloads: Number(data.downloads) || 0,
        type: typeTerm ? typeTerm.name : "Publication",
        typeSlug: typeTerm ? typeTerm.slug : "",
        themes: themes.slice(0, 3),
        keywords: themes
      };
    }

    pub.year = String(new Date(pub.date).getFullYear() || "");
    pub.langLabel = CONFIG.languages[pub.lang] || pub.lang;
    /* Pre-built haystack so search stays fast on every keystroke. */
    pub.haystack = [pub.title, pub.summary, pub.type, pub.issuer, pub.keywords.join(" ")]
      .join(" ").toLowerCase();
    return pub;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  var state = {
    all: [],
    filtered: [],
    parentId: null,
    q: "",
    type: "",
    themes: [],
    year: "",
    lang: "",
    sort: CONFIG.defaultSort,
    view: CONFIG.defaultView,
    shown: CONFIG.perPage
  };

  var el = {};

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function coverMarkup(pub, showBadge) {
    if (pub.cover) {
      return '<div class="tkpub-cover">' +
        '<img src="' + esc(pub.cover) + '" alt="' + esc(pub.coverAlt || ("Cover of " + pub.title)) + '" loading="lazy">' +
        (showBadge && pub.pages ? '<span class="tkpub-cover-badge">' + pub.pages + ' pp</span>' : "") +
        "</div>";
    }
    var g = gradientFor(pub.title || pub.slug || "x");
    return '<div class="tkpub-cover" style="--tk-c1:' + g[0] + ';--tk-c2:' + g[1] + '">' +
      '<div class="tkpub-cover-fallback" aria-hidden="true">' +
        '<span class="tkpub-cf-type">' + esc(pub.type) + "</span>" +
        '<span class="tkpub-cf-title">' + esc(clip(pub.title, 72)) + "</span>" +
        '<span class="tkpub-cf-mark">' + esc(CONFIG.org) + "</span>" +
      "</div>" +
      (showBadge && pub.pages ? '<span class="tkpub-cover-badge">' + pub.pages + ' pp</span>' : "") +
      "</div>";
  }

  function metaMarkup(pub) {
    var bits = [];
    bits.push("<span>" + ICON.cal + esc(prettyDate(pub.date)) + "</span>");
    if (pub.pages) bits.push("<span>" + ICON.page + pub.pages + " pages</span>");
    if (pub.size) bits.push("<span>" + ICON.down + esc(bytes(pub.size)) + "</span>");
    if (pub.lang && pub.lang !== "en") bits.push("<span>" + ICON.globe + esc(pub.langLabel) + "</span>");
    return '<div class="tkpub-meta">' + bits.join("") + "</div>";
  }

  function actionsMarkup(pub, small) {
    var sz = small ? " tkpub-btn-sm" : "";
    if (!pub.pdf) {
      return '<div class="tkpub-actions">' +
        '<a class="tkpub-btn tkpub-btn-ghost' + sz + '" href="' + esc(pub.link) + '">' + ICON.external + "Read online</a></div>";
    }
    return '<div class="tkpub-actions">' +
      '<button type="button" class="tkpub-btn tkpub-btn-primary' + sz + '" data-open="' + esc(pub.slug) + '">' +
        ICON.read + "Read</button>" +
      '<a class="tkpub-btn tkpub-btn-ghost' + sz + '" href="' + esc(pub.pdf) + '" download data-download="' + pub.id + '">' +
        ICON.down + "Download</a>" +
      "</div>";
  }

  function cardMarkup(pub) {
    return '<article class="tkpub-card">' +
      coverMarkup(pub, true) +
      '<div class="tkpub-card-body">' +
        '<p class="tkpub-type">' + esc(pub.type) + "</p>" +
        "<h3>" + esc(pub.title) + "</h3>" +
        '<p class="tkpub-summary">' + esc(pub.summary) + "</p>" +
        metaMarkup(pub) +
        (pub.themes.length
          ? '<div class="tkpub-tags">' + pub.themes.map(function (t) {
              return '<button type="button" class="tkpub-tag" data-theme="' + esc(t) + '">' + esc(t) + "</button>";
            }).join("") + "</div>"
          : "") +
      "</div>" +
      actionsMarkup(pub) +
      "</article>";
  }

  function featuredMarkup(pub) {
    return '<section class="tkpub-featured">' +
      coverMarkup(pub, false) +
      '<div class="tkpub-featured-body">' +
        '<span class="tkpub-flag">' + ICON.star + "Latest release</span>" +
        "<h3>" + esc(pub.title) + "</h3>" +
        "<p>" + esc(clip(pub.summary, 260)) + "</p>" +
        metaMarkup(pub) +
        actionsMarkup(pub) +
      "</div>" +
      "</section>";
  }

  function skeletons(n) {
    var one = '<div class="tkpub-skeleton"><div class="tkpub-sk-box"></div>' +
      '<div class="tkpub-sk-line" style="width:35%"></div>' +
      '<div class="tkpub-sk-line" style="width:92%"></div>' +
      '<div class="tkpub-sk-line" style="width:70%"></div></div>';
    return new Array(n + 1).join(one);
  }

  function stateBlock(icon, title, body, action, isError) {
    return '<div class="tkpub-state' + (isError ? " is-error" : "") + '">' + icon +
      "<h3>" + esc(title) + "</h3><p>" + esc(body) + "</p>" + (action || "") + "</div>";
  }

  /* ------------------------------------------------------------------ */
  /* Facets                                                              */
  /* ------------------------------------------------------------------ */

  function countBy(list, keyFn) {
    var map = {};
    list.forEach(function (p) {
      var keys = keyFn(p);
      (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
        if (!k) return;
        map[k] = (map[k] || 0) + 1;
      });
    });
    return map;
  }

  function renderFacets() {
    var types = countBy(state.all, function (p) { return p.type; });
    var themes = countBy(state.all, function (p) { return p.themes; });

    var typeHtml = ['<span class="tkpub-facet-label">Type</span>',
      '<button type="button" class="tkpub-chip" data-type="" aria-pressed="' + (!state.type) + '">All</button>'];
    Object.keys(types).sort().forEach(function (t) {
      typeHtml.push('<button type="button" class="tkpub-chip" data-type="' + esc(t) + '" aria-pressed="' +
        (state.type === t) + '">' + esc(t) + '<span class="tkpub-chip-count">' + types[t] + "</span></button>");
    });
    el.typeFacets.innerHTML = typeHtml.join("");

    var themeKeys = Object.keys(themes).sort(function (a, b) { return themes[b] - themes[a] || a.localeCompare(b); });
    var themeHtml = ['<span class="tkpub-facet-label">Theme</span>'];
    themeKeys.forEach(function (t) {
      themeHtml.push('<button type="button" class="tkpub-chip" data-theme="' + esc(t) + '" aria-pressed="' +
        (state.themes.indexOf(t) > -1) + '">' + esc(t) + '<span class="tkpub-chip-count">' + themes[t] + "</span></button>");
    });
    if (hasFilters()) {
      themeHtml.push('<button type="button" class="tkpub-reset" data-reset>Clear all filters</button>');
    }
    el.themeFacets.innerHTML = themeKeys.length > 1 ? themeHtml.join("") : (hasFilters()
      ? '<button type="button" class="tkpub-reset" data-reset>Clear all filters</button>' : "");

    /* Year + language selects */
    var years = Object.keys(countBy(state.all, function (p) { return p.year; }))
      .sort().reverse();
    el.year.innerHTML = '<option value="">All years</option>' + years.map(function (y) {
      return '<option value="' + esc(y) + '"' + (state.year === y ? " selected" : "") + ">" + esc(y) + "</option>";
    }).join("");

    var langs = Object.keys(countBy(state.all, function (p) { return p.lang; }));
    if (langs.length > 1) {
      el.lang.hidden = false;
      el.lang.innerHTML = '<option value="">All languages</option>' + langs.map(function (l) {
        return '<option value="' + esc(l) + '"' + (state.lang === l ? " selected" : "") + ">" +
          esc(CONFIG.languages[l] || l) + "</option>";
      }).join("");
    } else {
      el.lang.hidden = true;
    }
  }

  function hasFilters() {
    return !!(state.q || state.type || state.themes.length || state.year || state.lang);
  }

  /* ------------------------------------------------------------------ */
  /* Filter + paint                                                      */
  /* ------------------------------------------------------------------ */

  function applyFilters() {
    var q = state.q.toLowerCase().trim();
    var terms = q ? q.split(/\s+/) : [];

    state.filtered = state.all.filter(function (p) {
      if (state.type && p.type !== state.type) return false;
      if (state.year && p.year !== state.year) return false;
      if (state.lang && p.lang !== state.lang) return false;
      if (state.themes.length) {
        var ok = state.themes.every(function (t) { return p.keywords.indexOf(t) > -1; });
        if (!ok) return false;
      }
      /* Every word must appear somewhere — narrows sensibly as you type. */
      return terms.every(function (t) { return p.haystack.indexOf(t) > -1; });
    });

    var dir = state.sort === "oldest" ? 1 : -1;
    state.filtered.sort(function (a, b) {
      if (state.sort === "az") return a.title.localeCompare(b.title);
      if (state.sort === "za") return b.title.localeCompare(a.title);
      return (new Date(a.date) - new Date(b.date)) * dir;
    });

    state.shown = CONFIG.perPage;
    paint();
  }

  function paint() {
    var list = state.filtered;

    /* The newest publication gets the hero treatment, but only on an
       unfiltered, newest-first view — otherwise it is just noise. */
    var showFeatured = !hasFilters() && state.sort === "newest" && list.length > 2;
    var featured = null, rest = list;
    if (showFeatured) {
      featured = list.filter(function (p) { return p.featured; })[0] || list[0];
      rest = list.filter(function (p) { return p !== featured; });
    }

    el.featured.innerHTML = featured ? featuredMarkup(featured) : "";

    if (!list.length) {
      el.grid.className = "tkpub-grid";
      el.grid.innerHTML = "";
      el.empty.innerHTML = stateBlock(
        ICON.empty,
        hasFilters() ? "No publications match those filters" : "No publications yet",
        hasFilters()
          ? "Try removing a filter or searching for a broader term."
          : "New documents are added regularly. Please check back soon.",
        hasFilters() ? '<button type="button" class="tkpub-btn tkpub-btn-ghost" data-reset>Clear all filters</button>' : ""
      );
      el.more.innerHTML = "";
    } else {
      el.empty.innerHTML = "";
      el.grid.className = "tkpub-grid" + (state.view === "list" ? " is-list" : "");
      var slice = rest.slice(0, state.shown);
      el.grid.innerHTML = slice.map(cardMarkup).join("");
      var remaining = rest.length - slice.length;
      el.more.innerHTML = remaining > 0
        ? '<button type="button" class="tkpub-btn tkpub-btn-ghost" data-more>Load ' +
          Math.min(remaining, CONFIG.perPage) + " more of " + remaining + "</button>"
        : "";
    }

    var n = list.length;
    el.count.innerHTML = "<strong>" + n + "</strong> publication" + (n === 1 ? "" : "s") +
      (hasFilters() ? " matching your filters" : "");
    el.live.textContent = n + " publication" + (n === 1 ? "" : "s") + " found";

    renderFacets();
  }

  /* ------------------------------------------------------------------ */
  /* PDF viewer                                                          */
  /* ------------------------------------------------------------------ */

  /* The reader is a continuous vertical scroll of rendered pages, not a
     one-page-at-a-time flipbook. On a phone — which is where nearly all of
     these documents are read — scrolling is the gesture people already have,
     and it removes the need to hit a small "next" target between every page.

     Pages are rendered lazily and unrendered again once they are well out of
     view, so a 48-page annual report does not hold 48 canvases in memory on a
     mid-range Android. */
  var viewer = {
    pub: null,
    doc: null,
    pages: [],        // { shell, canvas, w, h, rendered, task }
    current: 1,
    fit: 1,           // scale at which a page fills the stage width
    zoom: 1,          // user multiplier on top of fit
    lastFocus: null,
    token: 0,
    io: null,
    scrollRaf: 0
  };

  var MAX_ZOOM = 4;
  var MIN_ZOOM = 0.5;
  /* How many pages either side of the viewport stay rendered. */
  var KEEP = 2;

  var pdfjsPromise = null;

  function loadPdfJs() {
    if (!CONFIG.pdfjs) return Promise.reject(new Error("disabled"));
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = CONFIG.pdfjs.lib;
      s.onload = function () {
        var lib = window.pdfjsLib;
        if (!lib) return reject(new Error("pdf.js did not initialise"));
        lib.GlobalWorkerOptions.workerSrc = CONFIG.pdfjs.worker;
        resolve(lib);
      };
      s.onerror = function () { reject(new Error("pdf.js could not be loaded")); };
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  }

  function openViewer(slug, pushUrl) {
    var pub = state.all.filter(function (p) { return p.slug === slug; })[0];
    if (!pub || !pub.pdf) return;

    viewer.pub = pub;
    viewer.current = 1;
    viewer.zoom = 1;
    viewer.doc = null;
    viewer.pages = [];
    viewer.token++;
    viewer.lastFocus = document.activeElement;

    $(".tkpub-modal-titles h2", el.modal).textContent = pub.title;
    /* Kept to one short line: on a phone this sits under a truncated title
       and anything longer pushes the reading area down the screen. */
    $(".tkpub-modal-titles p", el.modal).textContent =
      [pub.type, pub.pages ? pub.pages + " pages" : "", bytes(pub.size)]
        .filter(Boolean).join("  ·  ");

    $$("[data-dl]", el.modal).forEach(function (a) {
      a.href = pub.pdf;
      a.setAttribute("data-download", pub.id);
    });
    $("[data-tab]", el.modal).href = pub.pdf;

    /* Remember where the page was, so closing the reader puts the reader
       back exactly where they were in the list. iOS in particular will
       otherwise jump to the top when the body is unlocked. */
    viewer.pageScroll = window.pageYOffset || document.documentElement.scrollTop || 0;

    el.modal.classList.add("is-open");
    document.body.classList.add("tkpub-locked");
    document.body.style.top = "-" + viewer.pageScroll + "px";
    $(".tkpub-icbtn.is-close", el.modal).focus();

    if (pushUrl !== false) {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("publication", pub.slug);
        history.pushState({ tkpub: pub.slug }, "", u.toString());
      } catch (e) { /* older browsers — deep links simply do not update */ }
    }

    renderStage();
  }

  function closeViewer(popState) {
    if (!el.modal.classList.contains("is-open")) return;
    el.modal.classList.remove("is-open");
    document.body.classList.remove("tkpub-locked");
    document.body.style.top = "";
    window.scrollTo(0, viewer.pageScroll || 0);

    viewer.token++;
    teardownPages();
    viewer.doc = null;
    el.stage.innerHTML = "";
    if (viewer.lastFocus && viewer.lastFocus.focus) viewer.lastFocus.focus();

    if (!popState) {
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has("publication")) {
          u.searchParams.delete("publication");
          history.pushState({}, "", u.toString());
        }
      } catch (e) { /* no-op */ }
    }
  }

  function stageMessage(html) {
    el.stage.className = "tkpub-modal-stage";
    el.stage.innerHTML = '<div class="tkpub-viewer-msg">' + html + "</div>";
  }

  /* Browsers that refuse to render a PDF in an iframe (most mobile ones)
     get an explicit escape hatch rather than a blank grey box. */
  function fallbackFrame(reason) {
    var pub = viewer.pub;
    var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setControls(false);

    if (mobile) {
      stageMessage(
        "<h3>Open this document</h3>" +
        "<p>" + esc(reason || "Your browser cannot display PDFs inside a page.") +
        " You can still read or save it in one tap.</p>" +
        '<a class="tkpub-btn tkpub-btn-primary" href="' + esc(pub.pdf) + '" target="_blank" rel="noopener">' +
          ICON.external + "Open the PDF</a>"
      );
      return;
    }
    el.stage.className = "tkpub-modal-stage is-frame";
    el.stage.innerHTML = '<iframe src="' + esc(pub.pdf) + '#view=FitH" title="' +
      esc(pub.title) + '" loading="lazy"></iframe>';
  }

  function setControls(on, total) {
    el.modal.classList.toggle("has-controls", !!on);
    if (on && total) {
      $(".tkpub-pagecount", el.modal).textContent = "/ " + total;
      $(".tkpub-pager input", el.modal).max = String(total);
    }
  }

  /* Cancel in-flight renders and drop canvases. Called on close and on
     reopen; without it a fast close/open leaves orphaned render tasks
     writing into detached canvases. */
  function teardownPages() {
    if (viewer.io) { viewer.io.disconnect(); viewer.io = null; }
    viewer.pages.forEach(function (p) {
      if (p.task && p.task.cancel) { try { p.task.cancel(); } catch (e) { /* already done */ } }
      p.task = null;
      p.rendered = false;
    });
    viewer.pages = [];
  }

  function renderStage() {
    var pub = viewer.pub;
    var token = viewer.token;

    stageMessage('<div class="tkpub-spinner"></div><p>Loading document…</p>');
    setControls(false);

    /* Optional escape hatch: set CONFIG.renderer to a function and it takes
       over the viewer body completely. Used by the offline design preview,
       and there if you ever want to self-host a different PDF engine. */
    if (typeof CONFIG.renderer === "function") {
      CONFIG.renderer({ stage: el.stage, modal: el.modal, pub: pub, setPager: setControls });
      return;
    }

    loadPdfJs()
      .then(function (lib) {
        if (token !== viewer.token) return null;
        return lib.getDocument({ url: pub.pdf, withCredentials: false }).promise;
      })
      .then(function (doc) {
        if (!doc || token !== viewer.token) return;
        viewer.doc = doc;
        return buildPages(doc);
      })
      .catch(function (err) {
        if (token !== viewer.token) return;
        /* A cross-origin PDF, a blocked CDN or an old browser all land here. */
        fallbackFrame(err && err.message === "disabled"
          ? "" : "The in-page reader could not start.");
      });
  }

  /* ---- building the scroll ------------------------------------------- */

  /* Every page gets a correctly-proportioned placeholder up front, so the
     scrollbar is honest from the first frame and the document does not jump
     around as pages finish rendering. */
  function buildPages(doc) {
    var token = viewer.token;

    return doc.getPage(1).then(function (first) {
      if (token !== viewer.token) return;

      var base = first.getViewport({ scale: 1 });
      viewer.fit = fitScale(base.width);

      el.stage.className = "tkpub-modal-stage is-doc";
      el.stage.innerHTML = '<div class="tkpub-pages"></div>';
      var wrap = $(".tkpub-pages", el.stage);

      viewer.pages = [];
      for (var i = 1; i <= doc.numPages; i++) {
        var shell = document.createElement("div");
        shell.className = "tkpub-pg";
        shell.setAttribute("data-page", i);
        /* Assume uniform page size until proven otherwise — true of every
           document these are, and it avoids N getPage() calls up front. */
        shell.style.aspectRatio = base.width + " / " + base.height;
        var canvas = document.createElement("canvas");
        shell.appendChild(canvas);
        wrap.appendChild(shell);
        viewer.pages.push({ shell: shell, canvas: canvas, rendered: false, task: null });
      }

      applyZoom();
      setControls(true, doc.numPages);
      $(".tkpub-pager input", el.modal).value = "1";

      observePages();
      bindStageGestures();
      updateCurrentPage();
    });
  }

  function stageWidth() {
    /* 1px of slack stops a rounding error from producing a horizontal
       scrollbar at exactly fit width. */
    var pad = parseFloat(getComputedStyle(el.stage).paddingLeft) || 0;
    return Math.max(el.stage.clientWidth - pad * 2 - 1, 200);
  }

  function fitScale(pdfWidth) {
    return stageWidth() / pdfWidth;
  }

  /* Sets the CSS size of every page shell from fit x zoom. Canvases are
     re-rendered separately; this is the cheap part that must feel instant. */
  function applyZoom() {
    var w = stageWidth() * viewer.zoom;
    viewer.pages.forEach(function (p) { p.shell.style.width = w + "px"; });
    el.stage.classList.toggle("is-zoomed", viewer.zoom > 1.02);
    if (el.zoomLevel) el.zoomLevel.textContent = Math.round(viewer.zoom * 100) + "%";
  }

  function observePages() {
    if (viewer.io) viewer.io.disconnect();
    /* A generous margin means a page is already rendering by the time it
       scrolls into view, so fast scrolling does not show blank sheets. */
    viewer.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var idx = Number(e.target.getAttribute("data-page")) - 1;
        if (e.isIntersecting) renderPageAt(idx);
      });
    }, { root: el.stage, rootMargin: "150% 0px" });

    viewer.pages.forEach(function (p) { viewer.io.observe(p.shell); });
  }

  function renderPageAt(idx) {
    var p = viewer.pages[idx];
    if (!p || p.rendered || p.task || !viewer.doc) return;

    var token = viewer.token;
    var wanted = viewer.zoom;

    p.task = viewer.doc.getPage(idx + 1).then(function (page) {
      if (token !== viewer.token) return;

      /* Cap the backing store on very high-DPR phones: a 3x canvas of an A4
         page at 4x zoom is 40 megapixels and will be dropped by the browser. */
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var css = p.shell.clientWidth;
      var base = page.getViewport({ scale: 1 });
      var scale = (css / base.width) * dpr;
      var vp = page.getViewport({ scale: scale });

      var canvas = p.canvas;
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";

      var task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
      p.renderTask = task;
      return task.promise.then(function () {
        if (token !== viewer.token) return;
        p.rendered = true;
        p.zoomAt = wanted;
        p.shell.classList.add("is-ready");
      });
    }).catch(function () {
      /* A single failed page should not take the whole document down. */
    }).then(function () {
      p.task = null;
      p.renderTask = null;
    });
  }

  /* Drop canvases well outside the viewport so long documents stay light. */
  function pruneFarPages() {
    var cur = viewer.current - 1;
    viewer.pages.forEach(function (p, i) {
      if (Math.abs(i - cur) <= KEEP || !p.rendered) return;
      p.canvas.width = 0;
      p.canvas.height = 0;
      p.rendered = false;
      p.shell.classList.remove("is-ready");
    });
  }

  /* ---- zoom ----------------------------------------------------------- */

  function setZoom(next, focusX, focusY) {
    if (!viewer.doc) return;
    next = Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM);
    if (Math.abs(next - viewer.zoom) < 0.005) return;

    /* Keep whatever the reader was looking at under their finger. */
    var stage = el.stage;
    var cx = focusX === undefined ? stage.clientWidth / 2 : focusX;
    var cy = focusY === undefined ? stage.clientHeight / 2 : focusY;
    var ratio = next / viewer.zoom;
    var sx = (stage.scrollLeft + cx) * ratio - cx;
    var sy = (stage.scrollTop + cy) * ratio - cy;

    viewer.zoom = next;
    applyZoom();
    stage.scrollLeft = sx;
    stage.scrollTop = sy;

    /* Re-render what is on screen at the new resolution. */
    viewer.pages.forEach(function (p) {
      if (p.rendered && Math.abs((p.zoomAt || 1) - next) > 0.01) {
        p.rendered = false;
        p.shell.classList.remove("is-ready");
      }
    });
    renderAround();
  }

  function renderAround() {
    var cur = viewer.current - 1;
    for (var i = Math.max(0, cur - 1); i <= Math.min(viewer.pages.length - 1, cur + 1); i++) {
      renderPageAt(i);
    }
  }

  function zoomBy(step) {
    setZoom(viewer.zoom + step);
  }

  /* ---- navigation ----------------------------------------------------- */

  function gotoPage(n) {
    if (!viewer.doc) return;
    n = Math.min(Math.max(1, n | 0), viewer.pages.length);
    var p = viewer.pages[n - 1];
    if (!p) return;
    el.stage.scrollTop = p.shell.offsetTop - 12;
    viewer.current = n;
    syncPager();
  }

  function updateCurrentPage() {
    var mid = el.stage.scrollTop + el.stage.clientHeight * 0.35;
    var found = 1;
    for (var i = 0; i < viewer.pages.length; i++) {
      if (viewer.pages[i].shell.offsetTop <= mid) found = i + 1; else break;
    }
    if (found !== viewer.current) {
      viewer.current = found;
      syncPager();
      pruneFarPages();
    }
  }

  function syncPager() {
    var input = $(".tkpub-pager input", el.modal);
    if (input && document.activeElement !== input) input.value = String(viewer.current);
    var prev = $("[data-prev]", el.modal), next = $("[data-next]", el.modal);
    if (prev) prev.disabled = viewer.current <= 1;
    if (next) next.disabled = viewer.current >= viewer.pages.length;
  }

  /* ---- touch: pinch to zoom, double tap ------------------------------- */

  function bindStageGestures() {
    if (el.stage.__tkbound) return;
    el.stage.__tkbound = true;

    el.stage.addEventListener("scroll", function () {
      if (viewer.scrollRaf) return;
      viewer.scrollRaf = requestAnimationFrame(function () {
        viewer.scrollRaf = 0;
        updateCurrentPage();
      });
    }, { passive: true });

    var pinch = null;

    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    el.stage.addEventListener("touchstart", function (ev) {
      if (ev.touches.length !== 2 || !viewer.doc) return;
      var r = el.stage.getBoundingClientRect();
      pinch = {
        d: dist(ev.touches),
        zoom: viewer.zoom,
        x: (ev.touches[0].clientX + ev.touches[1].clientX) / 2 - r.left,
        y: (ev.touches[0].clientY + ev.touches[1].clientY) / 2 - r.top
      };
    }, { passive: true });

    el.stage.addEventListener("touchmove", function (ev) {
      if (!pinch || ev.touches.length !== 2) return;
      ev.preventDefault();   // stop the browser zooming the whole page instead
      var k = dist(ev.touches) / pinch.d;
      setZoom(pinch.zoom * k, pinch.x, pinch.y);
    }, { passive: false });

    el.stage.addEventListener("touchend", function (ev) {
      if (pinch && ev.touches.length < 2) pinch = null;
    }, { passive: true });

    /* Double tap toggles between fitting the width and a comfortable
       reading zoom — the gesture people already use on photos and maps. */
    var lastTap = 0;
    el.stage.addEventListener("touchend", function (ev) {
      if (ev.touches.length || !viewer.doc) return;
      var now = Date.now();
      if (now - lastTap < 300) {
        var r = el.stage.getBoundingClientRect();
        var t = ev.changedTouches[0];
        setZoom(viewer.zoom > 1.2 ? 1 : 2, t.clientX - r.left, t.clientY - r.top);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }, { passive: true });

    /* Ctrl/⌘ + wheel is the desktop equivalent. */
    el.stage.addEventListener("wheel", function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      var r = el.stage.getBoundingClientRect();
      setZoom(viewer.zoom * (ev.deltaY < 0 ? 1.1 : 0.9), ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Download counting (plugin mode only — silently skipped otherwise)   */
  /* ------------------------------------------------------------------ */

  function countDownload(id) {
    if (CONFIG.mode !== "cpt" || !id) return;
    fetch(restUrl("talithakum/v1/publications/" + id + "/download"), {
      method: "POST", credentials: "same-origin"
    }).catch(function () { /* a failed counter must never break a download */ });
  }

  /* ------------------------------------------------------------------ */
  /* Toasts — shared with the admin panel                                */
  /* ------------------------------------------------------------------ */

  function toast(message, kind) {
    var host = $(".tkpub-toasts") || (function () {
      var d = document.createElement("div");
      d.className = "tkpub-toasts";
      d.setAttribute("role", "status");
      d.setAttribute("aria-live", "polite");
      document.body.appendChild(d);
      return d;
    })();
    var t = document.createElement("div");
    t.className = "tkpub-toast" + (kind ? " is-" + kind : "");
    t.innerHTML = (kind === "err" ? ICON.warn : ICON.check) + "<span>" + esc(message) + "</span>";
    host.appendChild(t);
    setTimeout(function () {
      t.style.opacity = "0";
      t.style.transition = "opacity .25s";
      setTimeout(function () { t.remove(); }, 260);
    }, kind === "err" ? 6000 : 3600);
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function wire() {
    /* Search */
    var onSearch = debounce(function () {
      state.q = el.search.value;
      el.search.parentNode.classList.toggle("is-filled", !!state.q);
      applyFilters();
    }, 180);
    el.search.addEventListener("input", onSearch);
    $(".tkpub-search-clear").addEventListener("click", function () {
      el.search.value = "";
      state.q = "";
      el.search.parentNode.classList.remove("is-filled");
      el.search.focus();
      applyFilters();
    });

    el.sort.addEventListener("change", function () { state.sort = this.value; applyFilters(); });
    el.year.addEventListener("change", function () { state.year = this.value; applyFilters(); });
    el.lang.addEventListener("change", function () { state.lang = this.value; applyFilters(); });

    $$("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.view = btn.getAttribute("data-view");
        $$("[data-view]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        try { localStorage.setItem("tkpub:view", state.view); } catch (e) { /* private mode */ }
        paint();
      });
    });

    /* One delegated listener for everything inside the results area. */
    el.root.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-type],[data-theme],[data-reset],[data-more],[data-open],[data-download]");
      if (!t || !el.root.contains(t)) return;

      if (t.hasAttribute("data-open")) {
        ev.preventDefault();
        openViewer(t.getAttribute("data-open"));
      } else if (t.hasAttribute("data-download")) {
        countDownload(Number(t.getAttribute("data-download")));
      } else if (t.hasAttribute("data-type")) {
        state.type = t.getAttribute("data-type");
        applyFilters();
      } else if (t.hasAttribute("data-theme")) {
        var theme = t.getAttribute("data-theme");
        var i = state.themes.indexOf(theme);
        if (i > -1) state.themes.splice(i, 1); else state.themes.push(theme);
        applyFilters();
      } else if (t.hasAttribute("data-reset")) {
        state.q = ""; state.type = ""; state.themes = []; state.year = ""; state.lang = "";
        el.search.value = "";
        el.search.parentNode.classList.remove("is-filled");
        applyFilters();
      } else if (t.hasAttribute("data-more")) {
        state.shown += CONFIG.perPage;
        paint();
        /* Keep the keyboard user roughly where they were. */
        var cards = $$(".tkpub-card", el.grid);
        var next = cards[state.shown - CONFIG.perPage];
        if (next) next.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    /* Viewer controls */
    el.modal.addEventListener("click", function (ev) {
      if (ev.target === el.modal) return closeViewer();
      var t = ev.target.closest("button, a");
      if (!t) return;
      if (t.hasAttribute("data-close")) closeViewer();
      else if (t.hasAttribute("data-prev")) gotoPage(viewer.current - 1);
      else if (t.hasAttribute("data-next")) gotoPage(viewer.current + 1);
      else if (t.hasAttribute("data-zoomin")) zoomBy(0.25);
      else if (t.hasAttribute("data-zoomout")) zoomBy(-0.25);
      else if (t.hasAttribute("data-dl")) countDownload(Number(t.getAttribute("data-download")));
      else if (t.hasAttribute("data-copy")) {
        var url = window.location.href;
        (navigator.clipboard
          ? navigator.clipboard.writeText(url)
          : Promise.reject()
        ).then(
          function () { toast("Link copied to your clipboard", "ok"); },
          function () { window.prompt("Copy this link:", url); }
        );
      }
    });

    $(".tkpub-pager input", el.modal).addEventListener("change", function () {
      gotoPage(parseInt(this.value, 10) || 1);
    });

    document.addEventListener("keydown", function (ev) {
      if (!el.modal.classList.contains("is-open")) return;
      if (ev.key === "Escape") return closeViewer();
      if (ev.target.tagName === "INPUT") return;
      if (ev.key === "ArrowRight" || ev.key === "PageDown") { ev.preventDefault(); gotoPage(viewer.current + 1); }
      if (ev.key === "ArrowLeft" || ev.key === "PageUp") { ev.preventDefault(); gotoPage(viewer.current - 1); }
      if (ev.key === "+" || ev.key === "=") zoomBy(0.25);
      if (ev.key === "-") zoomBy(-0.25);
      if (ev.key === "Tab") trapFocus(ev);
    });

    /* Re-fit the page when the window changes size. */
    window.addEventListener("resize", debounce(function () {
      if (!viewer.doc) return;
      /* Re-fit to the new width, keeping the reader on the same page. */
      var was = viewer.current;
      applyZoom();
      viewer.pages.forEach(function (p) { p.rendered = false; p.shell.classList.remove("is-ready"); });
      gotoPage(was);
      renderAround();
    }, 220));

    /* Back button closes the viewer instead of leaving the page. */
    window.addEventListener("popstate", function () {
      var slug = new URLSearchParams(window.location.search).get("publication");
      if (slug) openViewer(slug, false); else closeViewer(true);
    });
  }

  function trapFocus(ev) {
    var focusables = $$(
      'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
      el.modal
    ).filter(function (n) { return n.offsetParent !== null; });
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function fetchPublications() {
    if (CONFIG.mode === "cpt") {
      return getAll("wp/v2/publications", { _embed: 1, orderby: "date", order: "desc" });
    }
    /* posts-mode needs the parent category resolved first so we can both
       scope the query and tell "type" categories apart from other ones. */
    return getJSON("wp/v2/categories", { slug: CONFIG.parentCategory, per_page: 1 })
      .then(function (r) {
        if (!r.data.length) {
          throw new Error(
            'No category named "' + CONFIG.parentCategory + '" was found. Create it in ' +
            "WordPress under Posts → Categories, then reload this page."
          );
        }
        state.parentId = r.data[0].id;
        /* Include children so a post filed under "Annual Report" is found. */
        return getAll("wp/v2/posts", {
          categories: state.parentId,
          _embed: 1, orderby: "date", order: "desc"
        });
      });
  }

  function boot() {
    el.root = $(".tkpub");
    if (!el.root) return;

    el.search = $("#tkpub-search");
    el.sort = $("#tkpub-sort");
    el.year = $("#tkpub-year");
    el.lang = $("#tkpub-lang");
    el.typeFacets = $("#tkpub-type-facets");
    el.themeFacets = $("#tkpub-theme-facets");
    el.featured = $("#tkpub-featured");
    el.grid = $("#tkpub-grid");
    el.empty = $("#tkpub-empty");
    el.more = $("#tkpub-more");
    el.count = $("#tkpub-count");
    el.live = $("#tkpub-live");
    el.modal = $("#tkpub-modal");
    el.stage = $("#tkpub-stage");
    el.zoomLevel = $(".tkpub-zoomlevel", el.modal);

    try {
      var savedView = localStorage.getItem("tkpub:view");
      if (savedView) state.view = savedView;
    } catch (e) { /* private mode */ }
    $$("[data-view]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view));
    });

    el.grid.innerHTML = skeletons(6);
    wire();

    fetchPublications()
      .then(function (items) {
        state.all = items
          .map(function (i) { return normalise(i, { parentId: state.parentId }); })
          .filter(function (p) { return p.title; });
        applyFilters();

        /* Honour a shared deep link once the data is in. */
        var slug = new URLSearchParams(window.location.search).get("publication");
        if (slug) openViewer(slug, false);

        document.dispatchEvent(new CustomEvent("tkpub:ready", { detail: { count: state.all.length } }));
      })
      .catch(function (err) {
        el.grid.innerHTML = "";
        el.empty.innerHTML = stateBlock(
          ICON.warn,
          "The publications could not be loaded",
          (err && err.message) || "Something went wrong reaching the site.",
          '<button type="button" class="tkpub-btn tkpub-btn-ghost" onclick="location.reload()">Try again</button>',
          true
        );
      });
  }

  /* Exposed so the admin panel can reuse the plumbing and refresh the list
     after publishing, without a page reload. */
  window.TKPUB = {
    config: CONFIG,
    icons: ICON,
    esc: esc,
    bytes: bytes,
    prettyDate: prettyDate,
    restUrl: restUrl,
    toast: toast,
    loadPdfJs: loadPdfJs,
    reload: function () {
      return fetchPublications().then(function (items) {
        state.all = items
          .map(function (i) { return normalise(i, { parentId: state.parentId }); })
          .filter(function (p) { return p.title; });
        applyFilters();
      });
    },
    get parentId() { return state.parentId; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
