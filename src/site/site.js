/* ==========================================================================
   Talitha Kum Kenya — site chrome + homepage behaviour, one small file.
   No libraries, nothing loads from a CDN. Everything degrades: with scripts
   blocked the pages are still complete, only quieter.
   ========================================================================== */

(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ---- sticky header shadow ------------------------------------------- */

  var head = $("#tks-head");
  if (head) {
    var onScroll = function () { head.classList.toggle("is-stuck", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- mega menus -------------------------------------------------------
     Click-driven, not hover-driven: hover menus are unusable on touch
     screens and flicker on imprecise pointers. One open at a time; Escape
     and any outside click close it.                                        */

  var megas = $$("[data-mega]");
  function closeMegas(except) {
    megas.forEach(function (b) { if (b !== except) b.setAttribute("aria-expanded", "false"); });
  }
  megas.forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var open = btn.getAttribute("aria-expanded") === "true";
      closeMegas(btn);
      btn.setAttribute("aria-expanded", String(!open));
    });
  });
  document.addEventListener("click", function () { closeMegas(); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { closeMegas(); closeDrawer(); }
  });

  /* ---- mobile drawer ---------------------------------------------------- */

  var drawer = $("#tks-drawer");
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    document.body.classList.remove("tks-locked");
  }
  $$("[data-drawer-open]").forEach(function (b) {
    b.addEventListener("click", function () {
      drawer.classList.add("is-open");
      document.body.classList.add("tks-locked");
      var x = $("[data-drawer-close].tks-x", drawer);
      if (x) x.focus();
    });
  });
  $$("[data-drawer-close]").forEach(function (b) {
    b.addEventListener("click", closeDrawer);
  });
  $$(".tks-dgroup").forEach(function (b) {
    b.addEventListener("click", function () {
      b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"));
    });
  });

  /* ---- scroll reveal ----------------------------------------------------- */

  var revealed = $$("[data-reveal]");
  if (revealed.length && "IntersectionObserver" in window &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    revealed.forEach(function (n) { io.observe(n); });
  } else {
    revealed.forEach(function (n) { n.classList.add("is-in"); });
  }

  /* ---- impact counters ---------------------------------------------------
     Count up once, when the block scrolls into view. The real number is in
     the markup, so with scripts off nothing is lost.                        */

  var nums = $$("[data-count]");
  if (nums.length) {
    var fmt = function (n) { return n.toLocaleString("en-KE"); };
    var run = function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      var suffix = el.getAttribute("data-suffix") || "";
      if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
        el.textContent = fmt(target) + suffix;
        return;
      }
      var t0 = null, dur = 1400;
      var step = function (t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        k = 1 - Math.pow(1 - k, 3);                       // ease-out
        el.textContent = fmt(Math.round(target * k)) + suffix;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ("IntersectionObserver" in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { run(e.target); cio.unobserve(e.target); }
        });
      }, { threshold: 0.4 });
      nums.forEach(function (n) { cio.observe(n); });
    } else {
      nums.forEach(run);
    }
  }

  /* ---- latest news, straight from WordPress ------------------------------
     Three most recent posts that are NOT publications, videos or team
     entries. If anything fails the section removes itself — the homepage
     never shows an error to a visitor.                                      */

  var newsHost = $("#tks-news");
  if (newsHost) {
    var REST = "/wp-json/wp/v2/";
    var esc = function (s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };
    var plain = function (html) {
      var d = document.createElement("div");
      d.innerHTML = String(html || "");
      return (d.textContent || "").replace(/\s+/g, " ").trim();
    };
    fetch(REST + "categories?slug=publications,videos,team&per_page=10", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (cats) {
        var skip = (cats || []).map(function (c) { return c.id; }).join(",");
        return fetch(REST + "posts?per_page=3&_embed=1" + (skip ? "&categories_exclude=" + skip : ""),
          { credentials: "same-origin" });
      })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (posts) {
        if (!posts || !posts.length) throw 0;
        newsHost.innerHTML = posts.map(function (p) {
          var img = "";
          try { img = p._embedded["wp:featuredmedia"][0].media_details.sizes.medium_large.source_url; }
          catch (e) { try { img = p._embedded["wp:featuredmedia"][0].source_url; } catch (e2) {} }
          var d = new Date(p.date);
          return '<a class="tks-ncard" href="' + esc(p.link) + '">' +
            '<span class="tks-nimg">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : "") + "</span>" +
            '<span class="tks-nbody">' +
              "<time>" + d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) + "</time>" +
              "<h3>" + esc(plain(p.title && p.title.rendered)) + "</h3>" +
              "<p>" + esc(plain(p.excerpt && p.excerpt.rendered)) + "</p>" +
              '<span class="tks-plink">Read the story <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>' +
            "</span></a>";
        }).join("");
      })
      .catch(function () {
        var sec = newsHost.closest(".tks-sec");
        if (sec) sec.remove();
      });
  }

  /* ---- partners marquee: duplicate once for the seamless loop ------------ */

  var marq = $(".tks-marq");
  if (marq) marq.innerHTML += marq.innerHTML;
})();
