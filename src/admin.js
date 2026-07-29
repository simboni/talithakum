/* ==========================================================================
   Talitha Kum Kenya — Publications repository (admin panel)

   A front-end publishing form for staff, so nobody has to learn the
   WordPress admin to put a document online.

   HOW ACCESS IS CONTROLLED — read this before changing anything
   -------------------------------------------------------------
   1. The panel is only *drawn* when WordPress has marked the visitor as
      logged in (it puts a `logged-in` class on <body>). This is cosmetic:
      it stops the panel appearing for the public, nothing more.
   2. It then signs the user in one of two ways:

      a) THE WORDPRESS SESSION THEY ALREADY HAVE. If a REST nonce is present
         on the page, the panel uses the login cookie and skips the form
         entirely. WordPress requires that nonce on any cookie-authenticated
         write — it is what stops another site from making a logged-in
         admin's browser publish things — and only the server can mint one.
         See plugin/tkpub-nonce-snippet.php for the ten lines that print it.

      b) AN APPLICATION PASSWORD, if no nonce is available. Users → Profile →
         Application Passwords. This always works, needs nothing on the
         server, and stays as the fallback.

      Either way the panel refuses to open unless the account can publish.
   3. The real security is WordPress itself. Every write below goes through
      the REST API, which independently re-checks the user's capabilities on
      the server. A visitor who forges the body class, edits this file in
      their browser, or calls the API directly still gets a 401.

   Application Password credentials are held in sessionStorage and disappear
   when the tab closes, unless the user ticks "stay signed in on this device".
   Nothing is stored at all in the cookie case — there is nothing to store.
   ========================================================================== */

(function () {
  "use strict";

  var TK = window.TKPUB;
  if (!TK) return;

  var CONFIG = TK.config;
  var esc = TK.esc, toast = TK.toast, bytes = TK.bytes;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var STORE_KEY = "tkpub:auth";

  /* Defaults offered in the form. They are created in WordPress on first use,
     so the site starts with a clean, consistent vocabulary instead of whatever
     each contributor happens to type. See docs/taxonomy.md. */
  var TYPES = [
    "Annual Report", "Research & Data", "Policy Brief", "Newsletter",
    "Training Manual", "Awareness Material", "Prayer & Reflection",
    "Press Release", "Conference Paper"
  ];
  var THEMES = [
    "Prevention", "Protection", "Partnership", "Prayer",
    "Child Trafficking", "Labour Exploitation", "Safe Migration", "Survivor Care",
    "Digital Safety", "Youth & Schools", "Advocacy", "Faith Formation"
  ];

  var MAX_PDF = 25 * 1024 * 1024;   // refuse before upload rather than after
  var MAX_IMG = 3 * 1024 * 1024;

  /* ------------------------------------------------------------------ */
  /* Auth                                                                */
  /* ------------------------------------------------------------------ */

  var auth = { header: null, nonce: null, user: null, remember: false };

  /* A REST nonce, if the site prints one. Checked in order:
       tkpubNonce      — set by plugin/tkpub-nonce-snippet.php (or the plugin)
       wpApiSettings   — printed automatically when anything on the page
                         enqueues wp-api-request / wp-api-fetch
     Absent on most front ends, which is why the snippet exists. */
  function findNonce() {
    if (typeof window.tkpubNonce === "string" && window.tkpubNonce) return window.tkpubNonce;
    if (window.wpApiSettings && window.wpApiSettings.nonce) return window.wpApiSettings.nonce;
    return null;
  }

  function usingCookie() { return !!auth.nonce && !auth.header; }

  function loadAuth() {
    var raw = null;
    try { raw = sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY); }
    catch (e) { return; }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.header) auth = parsed;
    } catch (e) { /* corrupt entry — ignore it */ }
  }

  function saveAuth() {
    var raw = JSON.stringify(auth);
    try {
      if (auth.remember) localStorage.setItem(STORE_KEY, raw);
      else sessionStorage.setItem(STORE_KEY, raw);
    } catch (e) { /* private browsing — the session simply will not persist */ }
  }

  function clearAuth() {
    auth = { header: null, nonce: null, user: null, remember: false };
    try {
      sessionStorage.removeItem(STORE_KEY);
      localStorage.removeItem(STORE_KEY);
    } catch (e) { /* no-op */ }
  }

  /* An Application Password wins if one was entered; otherwise the login
     cookie is used and the nonce proves the request came from this page. */
  function authHeaders(extra) {
    var h = Object.assign({}, extra || {});
    if (auth.header) h.Authorization = auth.header;
    else if (auth.nonce) h["X-WP-Nonce"] = auth.nonce;
    return h;
  }

  /* Application Passwords are shown with spaces for readability; the API
     wants them without. Strip them so a pasted password just works. */
  function basic(user, pass) {
    return "Basic " + btoa(user.trim() + ":" + pass.replace(/\s+/g, ""));
  }

  function api(path, options) {
    options = options || {};
    options.headers = authHeaders(options.headers);
    options.credentials = "same-origin";
    return fetch(TK.restUrl(path, options.params), options).then(function (res) {
      return res.json().then(
        function (body) {
          if (!res.ok) {
            var err = new Error((body && body.message) || ("Request failed (" + res.status + ")"));
            err.status = res.status;
            err.body = body;
            throw err;
          }
          return body;
        },
        function () {
          if (!res.ok) throw new Error("Request failed (" + res.status + ")");
          return null;
        }
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* Uploads — XHR, because fetch() cannot report progress               */
  /* ------------------------------------------------------------------ */

  function upload(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", TK.restUrl("wp/v2/media"), true);
      xhr.withCredentials = true;
      if (auth.header) xhr.setRequestHeader("Authorization", auth.header);
      else if (auth.nonce) xhr.setRequestHeader("X-WP-Nonce", auth.nonce);
      xhr.setRequestHeader("Content-Disposition",
        'attachment; filename="' + file.name.replace(/["\\]/g, "") + '"');
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
      };
      xhr.onload = function () {
        var body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) { /* non-JSON error page */ }
        if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body);
        reject(new Error(
          (body && body.message) ||
          (xhr.status === 413
            ? "The server rejected the file as too large. Ask your host to raise the upload limit."
            : "Upload failed (" + xhr.status + ")")
        ));
      };
      xhr.onerror = function () { reject(new Error("Upload failed — check your connection.")); };
      xhr.send(file);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Terms — find an existing one or create it                           */
  /* ------------------------------------------------------------------ */

  var termCache = {};

  function taxonomyPath(kind) {
    if (CONFIG.mode === "cpt") {
      return kind === "type" ? "wp/v2/publication-types"
        : kind === "theme" ? "wp/v2/publication-themes"
        : "wp/v2/tags";
    }
    return kind === "type" ? "wp/v2/categories" : "wp/v2/tags";
  }

  function ensureTerm(kind, name) {
    name = String(name || "").trim();
    if (!name) return Promise.resolve(null);

    var path = taxonomyPath(kind);
    var cacheKey = path + "|" + name.toLowerCase();
    if (termCache[cacheKey]) return Promise.resolve(termCache[cacheKey]);

    return api(path, { params: { search: name, per_page: 100, hide_empty: false } })
      .then(function (list) {
        var hit = (list || []).filter(function (t) {
          return t.name.toLowerCase() === name.toLowerCase();
        })[0];
        if (hit) return hit.id;

        var payload = { name: name };
        /* In posts-mode the document type must be filed *under* the
           publications category, or the public page will not see it. */
        if (kind === "type" && CONFIG.mode === "posts" && TK.parentId) {
          payload.parent = TK.parentId;
        }
        return api(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (t) { return t.id; });
      })
      .then(function (id) {
        if (id) termCache[cacheKey] = id;
        return id;
      });
  }

  function ensureTerms(kind, names) {
    return Promise.all(names.map(function (n) { return ensureTerm(kind, n); }))
      .then(function (ids) { return ids.filter(Boolean); });
  }

  /* ------------------------------------------------------------------ */
  /* Markup                                                              */
  /* ------------------------------------------------------------------ */

  var ICON = TK.icons;
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  var ICON_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 15h6"/></svg>';
  var ICON_IMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-2 4 3"/></svg>';
  var ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V8"/><path d="m7.5 12 4.5-4.5 4.5 4.5"/><path d="M4 4h16"/></svg>';
  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';

  function loginMarkup() {
    return '<div class="tkpub-login">' +
      '<div class="tkpub-callout">' +
        "<b>First time here?</b> You need an Application Password — it is separate from the " +
        "password you use to log in, and it can be revoked on its own. " +
        "(Staff can skip this step entirely once the site prints a REST nonce — " +
        "see tkpub-nonce-snippet.php.)" +
        "<ol>" +
          "<li>Open <b>Users → Profile</b> in the WordPress dashboard.</li>" +
          "<li>Scroll to <b>Application Passwords</b>.</li>" +
          '<li>Type a name such as "Publications page" and press <b>Add New</b>.</li>' +
          "<li>Copy the password it shows you and paste it below. You will not see it again.</li>" +
        "</ol>" +
      "</div>" +
      '<form id="tkpub-login-form" novalidate>' +
        '<div class="tkpub-field">' +
          '<label for="tkpub-user">WordPress username <span class="tkpub-req">*</span></label>' +
          '<input type="text" id="tkpub-user" autocomplete="username" required>' +
        "</div>" +
        '<div class="tkpub-field">' +
          '<label for="tkpub-pass">Application Password <span class="tkpub-req">*</span></label>' +
          '<input type="password" id="tkpub-pass" autocomplete="current-password" ' +
            'placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" required>' +
          '<span class="tkpub-hint">Spaces are fine — they are removed automatically.</span>' +
        "</div>" +
        '<div class="tkpub-field">' +
          '<label class="tkpub-switch"><input type="checkbox" id="tkpub-remember">' +
            '<span class="tkpub-track"></span>' +
            '<span class="tkpub-hint">Stay signed in on this device</span></label>' +
          '<span class="tkpub-hint">Leave this off on a shared or public computer — ' +
            "otherwise you are signed out when you close the tab.</span>" +
        "</div>" +
        '<p class="tkpub-err" id="tkpub-login-err" hidden></p>' +
        '<button type="submit" class="tkpub-btn tkpub-btn-primary">' + ICON_LOCK + "Sign in</button>" +
      "</form>" +
      "</div>";
  }

  /* `groupLabel` is for fields whose control is not a single input (a set of
     checkboxes, a drop zone) — a <label for> pointing at a <div> is invalid. */
  function field(id, label, control, hint, full, groupLabel) {
    return '<div class="tkpub-field' + (full ? " is-full" : "") + '">' +
      (groupLabel
        ? '<span class="tkpub-fieldlabel">' + label + "</span>"
        : '<label for="' + id + '">' + label + "</label>") + control +
      (hint ? '<span class="tkpub-hint">' + hint + "</span>" : "") +
      '<p class="tkpub-err" data-err-for="' + id + '" hidden></p>' +
      "</div>";
  }

  function formMarkup() {
    var req = ' <span class="tkpub-req" title="Required">*</span>';

    return '<form id="tkpub-form" novalidate>' +
      '<input type="hidden" id="tkpub-edit-id" value="">' +
      '<div class="tkpub-form-grid">' +

        field("tkpub-f-title", "Title" + req,
          '<input type="text" id="tkpub-f-title" maxlength="160" required>',
          "Say what the document is, not just what it is called internally.", true) +

        field("tkpub-f-summary", "Summary" + req,
          '<textarea id="tkpub-f-summary" maxlength="600" required></textarea>' +
          '<div class="tkpub-counter" id="tkpub-summary-count">0 words</div>',
          "Aim for 40–60 words: what it covers, who it is for, what it concludes.", true) +

        field("tkpub-f-type", "Document type" + req,
          '<select id="tkpub-f-type" class="tkpub-select" style="width:100%" required>' +
            '<option value="">Choose a type…</option>' +
            TYPES.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("") +
          "</select>",
          "Exactly one — the shape of the document.") +

        field("tkpub-f-date", "Publication date" + req,
          '<input type="date" id="tkpub-f-date" required>',
          "Drives ordering and the year filter.") +

        field("tkpub-f-themes", "Themes" + req,
          '<div class="tkpub-checks" id="tkpub-f-themes">' +
            THEMES.map(function (t) {
              return '<label class="tkpub-check"><input type="checkbox" value="' + esc(t) +
                '"><span>' + esc(t) + "</span></label>";
            }).join("") +
          "</div>",
          "One to three. The first four are the network's four Ps.", true, true) +

        field("tkpub-f-keywords", "Keywords",
          '<input type="text" id="tkpub-f-keywords" placeholder="Nairobi, Bakhita Day, county governments">',
          "Comma separated. Specifics: places, partners, target groups.", true) +

        field("tkpub-f-issuer", "Issuing body",
          '<input type="text" id="tkpub-f-issuer" value="' + esc(CONFIG.org) + '">',
          "Who published it — useful for joint documents.") +

        field("tkpub-f-lang", "Language",
          '<select id="tkpub-f-lang" class="tkpub-select" style="width:100%">' +
            Object.keys(CONFIG.languages).map(function (k) {
              return '<option value="' + esc(k) + '">' + esc(CONFIG.languages[k]) + "</option>";
            }).join("") +
          "</select>") +

        field("tkpub-pdf-drop", "PDF file" + req,
          '<div class="tkpub-drop" id="tkpub-pdf-drop" tabindex="0" role="button" ' +
            'aria-controls="tkpub-pdf-input">' + ICON_UP +
            "<p><b>Choose a PDF</b> or drop it here</p>" +
            "<small>Up to " + Math.round(MAX_PDF / 1048576) + " MB. Page count is read automatically.</small>" +
            '<input type="file" id="tkpub-pdf-input" accept="application/pdf,.pdf">' +
          "</div>" +
          '<div id="tkpub-pdf-chosen"></div>', "", true, true) +

        field("tkpub-cover-drop", "Cover image",
          '<div class="tkpub-drop" id="tkpub-cover-drop" tabindex="0" role="button" ' +
            'aria-controls="tkpub-cover-input">' + ICON_IMG +
            "<p><b>Choose a cover</b> or drop it here</p>" +
            "<small>Portrait, about 1200×1600. Optional — a branded cover is generated if you skip it.</small>" +
            '<input type="file" id="tkpub-cover-input" accept="image/*">' +
          "</div>" +
          '<div id="tkpub-cover-chosen"></div>', "", true, true) +

        field("tkpub-f-alt", "Cover description (alt text)",
          '<input type="text" id="tkpub-f-alt" maxlength="180">',
          "Describe the cover for people using a screen reader.", true) +

        '<div class="tkpub-field is-full">' +
          '<label class="tkpub-switch"><input type="checkbox" id="tkpub-f-featured">' +
            '<span class="tkpub-track"></span>' +
            "<span>Feature this at the top of the page</span></label>" +
          '<span class="tkpub-hint">Use sparingly — the newest featured item wins.</span>' +
        "</div>" +

      "</div>" +

      '<div id="tkpub-upload-progress" hidden>' +
        '<div class="tkpub-progress"><i></i></div>' +
        '<div class="tkpub-hint" id="tkpub-upload-label">Preparing…</div>' +
      "</div>" +

      /* The guidance sits above the buttons rather than beside them: on a
         phone the button row is a sticky bar, and a sticky bar is no place
         for a sentence people actually need to read. */
      '<p class="tkpub-hint tkpub-form-note">Save as a draft first and check how it looks on ' +
        "the page before you publish. Drafts are only visible to signed-in staff.</p>" +

      '<div class="tkpub-form-foot">' +
        '<button type="button" class="tkpub-btn tkpub-btn-ghost" data-save="draft">Save draft</button>' +
        '<button type="submit" class="tkpub-btn tkpub-btn-primary" data-save="publish">' +
          ICON.check + "Publish</button>" +
      "</div>" +
      "</form>";
  }

  function panelMarkup() {
    return '<div class="tkpub-admin-bar">' +
        '<span class="tkpub-admin-ico">' + ICON_LOCK + "</span>" +
        "<div><h2>Publishing panel</h2>" +
        '<p id="tkpub-admin-sub">Staff only — visitors never see this.</p></div>' +
        '<div class="tkpub-admin-actions" id="tkpub-admin-actions"></div>' +
      "</div>" +
      '<div class="tkpub-admin-body">' +
        '<div id="tkpub-admin-auth">' + loginMarkup() + "</div>" +
        '<div id="tkpub-admin-main" hidden>' +
          '<div class="tkpub-tabs" role="tablist">' +
            '<button type="button" role="tab" data-tab="new" aria-selected="true">Add a publication</button>' +
            '<button type="button" role="tab" data-tab="manage" aria-selected="false">Manage</button>' +
          "</div>" +
          '<div data-panel="new">' + formMarkup() + "</div>" +
          '<div data-panel="manage" hidden><div class="tkpub-manage" id="tkpub-manage"></div></div>' +
        "</div>" +
      "</div>";
  }

  /* ------------------------------------------------------------------ */
  /* File selection                                                      */
  /* ------------------------------------------------------------------ */

  var chosen = { pdf: null, pdfPages: 0, cover: null };

  function chosenFileMarkup(file, kind, previewUrl) {
    return '<div class="tkpub-file">' +
      (previewUrl
        ? '<img src="' + esc(previewUrl) + '" alt="">'
        : '<span class="tkpub-file-ico' + (kind === "cover" ? " is-img" : "") + '">' +
            (kind === "cover" ? ICON_IMG : ICON_PDF) + "</span>") +
      '<div class="tkpub-file-body"><b>' + esc(file.name) + "</b>" +
        '<span data-file-note>' + esc(bytes(file.size)) + "</span></div>" +
      '<button type="button" class="tkpub-icbtn" data-clear="' + kind + '" ' +
        'aria-label="Remove ' + esc(file.name) + '">' + ICON.close + "</button>" +
      "</div>";
  }

  /* Reads the page count straight out of the file before uploading, so the
     card can show "24 pages" without anyone typing it. */
  function readPageCount(file) {
    if (!CONFIG.pdfjs || !file.arrayBuffer) return Promise.resolve(0);
    return TK.loadPdfJs()
      .then(function (lib) {
        return file.arrayBuffer().then(function (buf) {
          return lib.getDocument({ data: new Uint8Array(buf) }).promise;
        });
      })
      .then(function (doc) { return doc.numPages; })
      .catch(function () { return 0; });   // never block publishing over this
  }

  function wireDrop(dropId, inputId, kind) {
    var drop = $("#" + dropId), input = $("#" + inputId);
    if (!drop || !input) return;

    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.click(); }
    });
    ["dragenter", "dragover"].forEach(function (e) {
      drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("is-drag"); });
    });
    ["dragleave", "drop"].forEach(function (e) {
      drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("is-drag"); });
    });
    drop.addEventListener("drop", function (ev) {
      if (ev.dataTransfer.files && ev.dataTransfer.files[0]) accept(ev.dataTransfer.files[0]);
    });
    input.addEventListener("change", function () { if (input.files[0]) accept(input.files[0]); });

    function accept(file) {
      if (kind === "pdf") {
        if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
          return toast("That is not a PDF file.", "err");
        }
        if (file.size > MAX_PDF) {
          return toast("That PDF is " + bytes(file.size) + ". The limit is " +
            Math.round(MAX_PDF / 1048576) + " MB — try compressing it.", "err");
        }
        chosen.pdf = file;
        chosen.pdfPages = 0;
        $("#tkpub-pdf-chosen").innerHTML = chosenFileMarkup(file, "pdf");
        clearError("tkpub-pdf-drop");
        readPageCount(file).then(function (pages) {
          chosen.pdfPages = pages;
          var note = $("#tkpub-pdf-chosen [data-file-note]");
          if (note && pages) note.textContent = bytes(file.size) + " · " + pages + " pages";
        });
      } else {
        if (!/^image\//.test(file.type)) return toast("Choose an image file for the cover.", "err");
        if (file.size > MAX_IMG) {
          return toast("That image is " + bytes(file.size) + ". Keep covers under " +
            Math.round(MAX_IMG / 1048576) + " MB.", "err");
        }
        chosen.cover = file;
        var url = URL.createObjectURL(file);
        $("#tkpub-cover-chosen").innerHTML = chosenFileMarkup(file, "cover", url);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */

  function showError(id, message) {
    var input = $("#" + id);
    if (input) input.classList.add("tkpub-invalid");
    var p = $('[data-err-for="' + id + '"]');
    if (p) { p.textContent = message; p.hidden = false; }
  }

  function clearError(id) {
    var input = $("#" + id);
    if (input) input.classList.remove("tkpub-invalid");
    var p = $('[data-err-for="' + id + '"]');
    if (p) p.hidden = true;
  }

  function collect() {
    ["tkpub-f-title", "tkpub-f-summary", "tkpub-f-type", "tkpub-f-date", "tkpub-f-themes", "tkpub-pdf-drop"]
      .forEach(clearError);

    var data = {
      id: $("#tkpub-edit-id").value,
      title: $("#tkpub-f-title").value.trim(),
      summary: $("#tkpub-f-summary").value.trim(),
      type: $("#tkpub-f-type").value,
      date: $("#tkpub-f-date").value,
      themes: $$("#tkpub-f-themes input:checked").map(function (i) { return i.value; }),
      keywords: $("#tkpub-f-keywords").value.split(",")
        .map(function (s) { return s.trim(); }).filter(Boolean),
      issuer: $("#tkpub-f-issuer").value.trim(),
      lang: $("#tkpub-f-lang").value,
      alt: $("#tkpub-f-alt").value.trim(),
      featured: $("#tkpub-f-featured").checked
    };

    var bad = null;
    if (!data.title) { showError("tkpub-f-title", "A title is required."); bad = bad || "tkpub-f-title"; }
    if (!data.summary) { showError("tkpub-f-summary", "Write a short summary."); bad = bad || "tkpub-f-summary"; }
    if (!data.type) { showError("tkpub-f-type", "Choose a document type."); bad = bad || "tkpub-f-type"; }
    if (!data.date) { showError("tkpub-f-date", "Set the publication date."); bad = bad || "tkpub-f-date"; }
    if (!data.themes.length) { showError("tkpub-f-themes", "Pick at least one theme."); bad = bad || "tkpub-f-themes"; }
    if (data.themes.length > 3) { showError("tkpub-f-themes", "Three themes at most — the rest belong in keywords."); bad = bad || "tkpub-f-themes"; }
    if (!chosen.pdf && !data.id) { showError("tkpub-pdf-drop", "Attach the PDF."); bad = bad || "tkpub-pdf-drop"; }

    if (bad) {
      var node = $("#" + bad);
      if (node && node.scrollIntoView) node.scrollIntoView({ block: "center", behavior: "smooth" });
      if (node && node.focus) node.focus({ preventScroll: true });
      return null;
    }
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Saving                                                              */
  /* ------------------------------------------------------------------ */

  function progress(fraction, label) {
    var wrap = $("#tkpub-upload-progress");
    wrap.hidden = false;
    $("#tkpub-upload-progress i").style.width = Math.round(fraction * 100) + "%";
    $("#tkpub-upload-label").textContent = label;
  }

  function hideProgress() { $("#tkpub-upload-progress").hidden = true; }

  function buildContent(data, media) {
    var payload = {
      v: 1,
      pdf: media.pdfUrl,
      pdfId: media.pdfId || 0,
      pages: media.pages || 0,
      size: media.size || 0,
      lang: data.lang,
      issuer: data.issuer,
      featured: !!data.featured,
      date: data.date
    };
    /* The comment is the machine-readable record the page reads back.
       Everything after it is the human-readable fallback for anyone who
       opens the post directly or reads it in a feed. */
    return "<!--TKPUB:" + JSON.stringify(payload) + "-->\n" +
      "<p>" + esc(data.summary) + "</p>\n" +
      '<p><a href="' + esc(media.pdfUrl) + '" target="_blank" rel="noopener">' +
        "Download the PDF" + (media.size ? " (" + bytes(media.size) + ")" : "") + "</a></p>";
  }

  function save(status) {
    var data = collect();
    if (!data) return;

    $$("#tkpub-form [data-save]").forEach(function (b) { b.disabled = true; });

    var media = { pdfUrl: "", pdfId: 0, coverId: 0, pages: chosen.pdfPages, size: 0 };

    var step = Promise.resolve();

    if (chosen.pdf) {
      media.size = chosen.pdf.size;
      step = step.then(function () {
        progress(0, "Uploading the PDF…");
        return upload(chosen.pdf, function (f) {
          progress(f * 0.7, "Uploading the PDF… " + Math.round(f * 100) + "%");
        }).then(function (att) {
          media.pdfId = att.id;
          media.pdfUrl = att.source_url;
        });
      });
    }

    if (chosen.cover) {
      step = step.then(function () {
        progress(0.72, "Uploading the cover…");
        return upload(chosen.cover, function (f) {
          progress(0.72 + f * 0.15, "Uploading the cover… " + Math.round(f * 100) + "%");
        }).then(function (att) {
          media.coverId = att.id;
          if (data.alt) {
            /* Alt text lives on the attachment, so it follows the image
               wherever it is used later. */
            return api("wp/v2/media/" + att.id, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ alt_text: data.alt })
            }).catch(function () { /* not fatal */ });
          }
        });
      });
    }

    step
      .then(function () {
        progress(0.9, "Filing it under the right type and themes…");
        return Promise.all([
          ensureTerm("type", data.type),
          ensureTerms("theme", data.themes),
          ensureTerms("keyword", data.keywords)
        ]);
      })
      .then(function (terms) {
        progress(0.96, status === "publish" ? "Publishing…" : "Saving the draft…");

        var typeId = terms[0], themeIds = terms[1], keywordIds = terms[2];
        var body = {
          title: data.title,
          excerpt: data.summary,
          status: status
        };
        /* WordPress schedules, rather than publishes, anything stamped in
           the future — and a publication is usually dated ahead of the day
           it is put up. Stamping the post with that date made it disappear
           from the page while this panel reported success. Publishing now
           leaves the stamp to WordPress; the date staff chose still shows
           on the card, because it travels in the payload and that is what
           the page reads. A draft keeps the chosen date: nothing depends
           on it until it is published. */
        if (status !== "publish") body.date = data.date + "T09:00:00";
        if (media.coverId) body.featured_media = media.coverId;

        if (CONFIG.mode === "cpt") {
          body.content = "<p>" + esc(data.summary) + "</p>";
          body["publication-types"] = typeId ? [typeId] : [];
          body["publication-themes"] = themeIds;
          body.tags = keywordIds;
          body.meta = {
            tk_pdf_url: media.pdfUrl,
            tk_pdf_id: media.pdfId,
            tk_pdf_pages: media.pages || 0,
            tk_pdf_size: media.size || 0,
            tk_language: data.lang,
            tk_issuer: data.issuer,
            tk_featured: !!data.featured
          };
        } else {
          body.content = buildContent(data, media);
          /* Both the parent and the type category, so the public query
             (which filters on the parent) always finds it. */
          body.categories = [TK.parentId, typeId].filter(Boolean);
          body.tags = themeIds.concat(keywordIds);
        }

        var path = CONFIG.mode === "cpt" ? "wp/v2/publications" : "wp/v2/posts";
        if (data.id) path += "/" + data.id;

        return api(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      })
      .then(function (saved) {
        progress(1, "Done");
        hideProgress();
        /* Report what WordPress actually did, not what was asked for. */
        var real = (saved && saved.status) || status;
        toast(real === "publish" ? "Published. It is live on this page now."
          : real === "future" ? "Scheduled by WordPress, so it is not on the page yet. "
            + "Open it in Posts and publish it immediately."
          : "Draft saved. Only signed-in staff can see it.",
          real === "future" ? "err" : "ok");
        resetForm();
        return TK.reload();
      })
      .then(function () { loadManageList(); })
      .catch(function (err) {
        hideProgress();
        toast(err.message || "Could not save the publication.", "err");
      })
      .then(function () {
        $$("#tkpub-form [data-save]").forEach(function (b) { b.disabled = false; });
      });
  }

  function resetForm() {
    var form = $("#tkpub-form");
    if (!form) return;
    form.reset();
    $("#tkpub-edit-id").value = "";
    $("#tkpub-f-issuer").value = CONFIG.org;
    $("#tkpub-f-date").value = new Date().toISOString().slice(0, 10);
    $("#tkpub-pdf-chosen").innerHTML = "";
    $("#tkpub-cover-chosen").innerHTML = "";
    chosen = { pdf: null, pdfPages: 0, cover: null };
    $("#tkpub-summary-count").textContent = "0 words";
    $("#tkpub-summary-count").className = "tkpub-counter";
    $$("#tkpub-form [data-save]").forEach(function (b) {
      if (b.getAttribute("data-save") === "publish") {
        b.innerHTML = ICON.check + "Publish";
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Manage tab                                                          */
  /* ------------------------------------------------------------------ */

  function loadManageList() {
    var host = $("#tkpub-manage");
    if (!host) return;
    host.innerHTML = '<p class="tkpub-hint">Loading…</p>';

    var path = CONFIG.mode === "cpt" ? "wp/v2/publications" : "wp/v2/posts";
    var params = { per_page: 50, orderby: "date", order: "desc", status: "publish,draft,pending" };
    if (CONFIG.mode === "posts") params.categories = TK.parentId;

    api(path, { params: params })
      .then(function (items) {
        if (!items.length) {
          host.innerHTML = '<p class="tkpub-hint">Nothing here yet. Add your first publication.</p>';
          return;
        }
        host.innerHTML = items.map(function (p) {
          var title = p.title && p.title.rendered ? p.title.rendered : "(untitled)";
          return '<div class="tkpub-row" data-id="' + p.id + '">' +
            '<span class="tkpub-file-ico">' + ICON_PDF + "</span>" +
            '<div class="tkpub-row-body"><b>' + title + "</b>" +
              "<span>" + esc(TK.prettyDate(p.date)) + "</span></div>" +
            '<span class="tkpub-status is-' + esc(p.status) + '">' + esc(p.status) + "</span>" +
            '<span class="tkpub-row-tools">' +
              '<a class="tkpub-icbtn" href="/wp-admin/post.php?post=' + p.id +
                '&action=edit" title="Open in the WordPress editor">' + ICON_EDIT + "</a>" +
              '<button type="button" class="tkpub-icbtn is-close" data-del="' + p.id +
                '" title="Move to trash">' + ICON_TRASH + "</button>" +
            "</span>" +
          "</div>";
        }).join("");
      })
      .catch(function (err) {
        host.innerHTML = '<p class="tkpub-err">' + esc(err.message) + "</p>";
      });
  }

  function trash(id, rowTitle) {
    if (!window.confirm(
      "Move “" + rowTitle + "” to the trash?\n\n" +
      "It disappears from the public page immediately. You can restore it " +
      "from the WordPress dashboard for 30 days."
    )) return;

    var path = (CONFIG.mode === "cpt" ? "wp/v2/publications/" : "wp/v2/posts/") + id;
    api(path, { method: "DELETE" })
      .then(function () {
        toast("Moved to the trash.", "ok");
        loadManageList();
        return TK.reload();
      })
      .catch(function (err) { toast(err.message, "err"); });
  }

  /* ------------------------------------------------------------------ */
  /* Sign in / out                                                       */
  /* ------------------------------------------------------------------ */

  /* The toggle button label has to follow the panel, not the sign-in step —
     signing in through the cookie happens while the panel is still closed. */
  function toggleLabel() {
    var host = $("#tkpub-admin");
    return host && host.classList.contains("is-open") ? "Close panel" : "Open panel";
  }

  function renderSignedIn() {
    $("#tkpub-admin-auth").hidden = true;
    $("#tkpub-admin-main").hidden = false;
    $("#tkpub-admin-sub").textContent = usingCookie()
      ? "Signed in with your WordPress session. Add a document, classify it, publish it."
      : "Add a document, classify it, publish it.";
    $("#tkpub-admin-actions").innerHTML =
      '<span class="tkpub-who">Signed in as <b>' + esc(auth.user.name) + "</b></span>" +
      /* Nothing to sign out of in cookie mode — that is the WordPress
         session itself, and logging people out of the site from here
         would be a surprise. */
      (usingCookie() ? ""
        : '<button type="button" class="tkpub-btn tkpub-btn-ghost tkpub-btn-sm" data-signout>Sign out</button>') +
      '<button type="button" class="tkpub-btn tkpub-btn-primary tkpub-btn-sm" data-toggle>' +
        toggleLabel() + "</button>";
    resetForm();
    loadManageList();
  }

  function renderSignedOut() {
    $("#tkpub-admin-auth").hidden = false;
    $("#tkpub-admin-main").hidden = true;
    $("#tkpub-admin-sub").textContent = "Staff only — visitors never see this.";
    $("#tkpub-admin-actions").innerHTML =
      '<button type="button" class="tkpub-btn tkpub-btn-primary tkpub-btn-sm" data-toggle>' +
        ICON_LOCK + toggleLabel() + "</button>";
  }

  /* Prefer the session the user already has; fall back to the form. */
  function useCookieOrForm() {
    auth.nonce = findNonce();
    renderSignedOut();
    if (!auth.nonce) return;
    verify().then(renderSignedIn, function () {
      /* Stale nonce, or an account that cannot publish. */
      auth.nonce = null;
      renderSignedOut();
    });
  }

  function verify() {
    return api("wp/v2/users/me", { params: { context: "edit" } }).then(function (me) {
      var caps = me.capabilities || {};
      if (!caps.edit_posts && !caps.publish_posts) {
        throw new Error("That account cannot publish. Ask an administrator for an Editor role.");
      }
      auth.user = { id: me.id, name: me.name, caps: caps };
      return me;
    });
  }

  function signIn(ev) {
    ev.preventDefault();
    var user = $("#tkpub-user").value;
    var pass = $("#tkpub-pass").value;
    var err = $("#tkpub-login-err");
    err.hidden = true;

    if (!user || !pass) {
      err.textContent = "Enter both your username and an Application Password.";
      err.hidden = false;
      return;
    }

    var btn = $("#tkpub-login-form button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Checking…";

    auth.header = basic(user, pass);
    auth.remember = $("#tkpub-remember").checked;

    verify()
      .then(function () {
        saveAuth();
        toast("Signed in.", "ok");
        renderSignedIn();
      })
      .catch(function (e) {
        auth.header = null;
        err.textContent = e.status === 401
          ? "That username or Application Password was not accepted."
          : (e.message || "Sign in failed.");
        err.hidden = false;
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = ICON_LOCK + "Sign in";
      });
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    var host = $("#tkpub-admin");
    if (!host) return;

    /* Cosmetic gate — WordPress adds `logged-in` to <body> for signed-in
       users. Anyone else never sees the panel; the API is what actually
       stops them. `data-force-admin` is there for the preview page. */
    var loggedIn = document.body.classList.contains("logged-in") ||
      host.hasAttribute("data-force-admin");
    if (!loggedIn) return;

    host.classList.add("is-visible");
    host.innerHTML = panelMarkup();

    loadAuth();
    if (auth.header) {
      /* A stored credential may have been revoked since — check, do not trust. */
      verify().then(renderSignedIn, function () { clearAuth(); useCookieOrForm(); });
    } else {
      useCookieOrForm();
    }

    host.addEventListener("submit", function (ev) {
      if (ev.target.id === "tkpub-login-form") return signIn(ev);
      if (ev.target.id === "tkpub-form") { ev.preventDefault(); save("publish"); }
    });

    host.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-toggle],[data-signout],[data-tab],[data-save],[data-clear],[data-del]");
      if (!t) return;

      if (t.hasAttribute("data-toggle")) {
        host.classList.toggle("is-open");
        t.textContent = host.classList.contains("is-open") ? "Close panel" : "Open panel";
        if (!host.classList.contains("is-open") && !auth.user) renderSignedOut();
      } else if (t.hasAttribute("data-signout")) {
        clearAuth();
        useCookieOrForm();
        toast("Signed out.", "ok");
      } else if (t.hasAttribute("data-tab")) {
        var tab = t.getAttribute("data-tab");
        $$("[data-tab]", host).forEach(function (b) {
          b.setAttribute("aria-selected", String(b === t));
        });
        $$("[data-panel]", host).forEach(function (p) {
          p.hidden = p.getAttribute("data-panel") !== tab;
        });
        if (tab === "manage") loadManageList();
      } else if (t.hasAttribute("data-save") && t.getAttribute("data-save") === "draft") {
        save("draft");
      } else if (t.hasAttribute("data-clear")) {
        var kind = t.getAttribute("data-clear");
        chosen[kind] = null;
        if (kind === "pdf") chosen.pdfPages = 0;
        $("#tkpub-" + kind + "-chosen").innerHTML = "";
      } else if (t.hasAttribute("data-del")) {
        var row = t.closest(".tkpub-row");
        trash(t.getAttribute("data-del"), row ? row.querySelector("b").textContent : "this publication");
      }
    });

    /* Clear a field's error the moment it is fixed, rather than leaving it
       shouting red until the next submit. */
    function clearOnFix(ev) {
      var t = ev.target;
      if (t.id && t.classList.contains("tkpub-invalid")) clearError(t.id);
      if (t.type === "checkbox" && t.closest("#tkpub-f-themes")) clearError("tkpub-f-themes");
    }
    host.addEventListener("input", clearOnFix);
    host.addEventListener("change", clearOnFix);

    /* Live word count — the summary length matters more than most fields. */
    host.addEventListener("input", function (ev) {
      if (ev.target.id !== "tkpub-f-summary") return;
      var words = ev.target.value.trim().split(/\s+/).filter(Boolean).length;
      var counter = $("#tkpub-summary-count");
      counter.textContent = words + (words === 1 ? " word" : " words") +
        (words && (words < 25 || words > 80) ? " — aim for 40 to 60" : "");
      counter.className = "tkpub-counter" + (words > 80 ? " is-over" : "");
    });

    wireDrop("tkpub-pdf-drop", "tkpub-pdf-input", "pdf");
    wireDrop("tkpub-cover-drop", "tkpub-cover-input", "cover");
    resetForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
