// Applies the edits made in /admin → Pages on top of the built-in copy:
// SEO title and description, text swaps and image swaps inside each page's <main>.
// Edits are keyed by the original text or image path, so if the built-in copy
// changes later an old edit simply stops matching and the new copy shows.
//
// Loaded in <head> on every page. With ?yc-preview=1 (the admin's preview frame)
// nothing is fetched: the admin pushes unsaved edits in through window.ycContent.

(function () {
  "use strict";
  var PREVIEW = /[?&]yc-preview=1\b/.test(location.search);
  var data = { pages: {} };
  var orig = new WeakMap(); // node → { text } or { src, srcset, alt }, plus what we set ("applied")
  var touched = [];         // nodes changed for the current page, reverted when edits no longer apply
  var has = Object.prototype.hasOwnProperty;

  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  function pageId() { return location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase() || "home"; }

  function current() { return data.pages[pageId()] || null; }

  // Text nodes inside <main> that hold words (not just whitespace).
  function textNodes(root) {
    var out = [];
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || p.nodeName === "SCRIPT" || p.nodeName === "STYLE") return NodeFilter.FILTER_REJECT;
        return norm(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }

  function originalText(n) {
    var o = orig.get(n);
    // React re-rendered this node with new text since we changed it: that is the new original.
    if (o && n.nodeValue !== o.applied) { orig.delete(n); o = null; }
    return o ? o.text : n.nodeValue;
  }

  function applyText(n, p) {
    var base = originalText(n);
    var key = norm(base);
    var to = p && p.text && has.call(p.text, key) ? p.text[key] : "";
    if (to) {
      var val = base.match(/^\s*/)[0] + to + base.match(/\s*$/)[0];
      if (n.nodeValue !== val) n.nodeValue = val;
      orig.set(n, { text: base, applied: val });
      touched.push(n);
    } else if (orig.has(n)) {
      n.nodeValue = base;
      orig.delete(n);
    }
  }

  function originalImg(img) {
    var o = orig.get(img);
    if (o && img.getAttribute("src") !== o.applied) { orig.delete(img); o = null; }
    return o || { src: img.getAttribute("src"), srcset: img.getAttribute("srcset"), alt: img.getAttribute("alt") };
  }

  function applyImg(img, p) {
    var base = originalImg(img);
    if (!base.src || base.src.indexOf("data:") === 0) return;
    var ov = p && p.images && has.call(p.images, base.src) ? p.images[base.src] : null;
    if (ov && (ov.src || ov.alt)) {
      var src = ov.src || base.src;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      // A responsive srcset would keep showing the old picture.
      if (ov.src && img.hasAttribute("srcset")) img.removeAttribute("srcset");
      var alt = ov.alt || base.alt || "";
      if (img.getAttribute("alt") !== alt) img.setAttribute("alt", alt);
      base.applied = src;
      orig.set(img, base);
      touched.push(img);
    } else if (orig.has(img)) {
      restoreImg(img, base);
    }
  }

  function restoreImg(img, base) {
    img.setAttribute("src", base.src);
    if (base.srcset) img.setAttribute("srcset", base.srcset);
    if (base.alt == null) img.removeAttribute("alt"); else img.setAttribute("alt", base.alt);
    orig.delete(img);
  }

  function setMeta(sel, val) {
    var el = document.querySelector(sel);
    if (el && el.getAttribute("content") !== val) el.setAttribute("content", val);
  }

  // The site's own syncSeo() sets the built-in title on every route change and then
  // calls refresh(), so only overrides need setting here.
  function applySeo(p) {
    var s = (p && p.seo) || {};
    if (s.title && document.title !== s.title) document.title = s.title;
    if (s.title) { setMeta('meta[property="og:title"]', s.title); setMeta('meta[name="twitter:title"]', s.title); }
    if (s.description) {
      setMeta('meta[name="description"]', s.description);
      setMeta('meta[property="og:description"]', s.description);
      setMeta('meta[name="twitter:description"]', s.description);
    }
  }

  function apply() {
    var p = current();
    var main = document.querySelector("main");
    var before = touched;
    touched = [];
    if (main && (p || before.length)) {
      textNodes(main).forEach(function (n) { applyText(n, p); });
      main.querySelectorAll("img").forEach(function (img) { applyImg(img, p); });
    }
    // Put back anything changed earlier that is no longer covered (e.g. an edit removed in preview).
    before.forEach(function (n) {
      if (touched.indexOf(n) >= 0 || !orig.has(n)) return;
      if (n.nodeType === 3) { n.nodeValue = orig.get(n).text; orig.delete(n); } else restoreImg(n, orig.get(n));
    });
    applySeo(p);
  }

  // Re-apply whenever the page renders new content (route changes, React updates).
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; apply(); });
  }
  new MutationObserver(function () { if (current() || touched.length) schedule(); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // ── For the admin preview ──────────────────────────────────────────────

  var BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,button,a,label,td,th,figcaption,blockquote,dt,dd";
  // Prices stay with the web team, so text with an amount in it is not offered for editing.
  var PRICE = /[$€£₹]\s?\d|\b(AED|USD)\s?\d|\d\s?(AED|USD)\b|\/\s?mo\b/i;

  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function blockOf(n) {
    var el = n.nodeType === 3 ? n.parentNode : n;
    return (el.closest && el.closest(BLOCKS)) || el;
  }

  // Everything editable on the current page, in reading order and with original values:
  // { groups: [{ tag, items: [key, ...] }], images: [{ src, alt }], title, description }
  function collect() {
    var main = document.querySelector("main");
    var groups = [], seen = {}, imgs = [], seenImg = {};
    if (main) {
      var last = null;
      textNodes(main).forEach(function (n) {
        var key = norm(originalText(n));
        if (key.length < 2 || seen[key] || PRICE.test(key) || !visible(n.parentNode)) return;
        seen[key] = true;
        var b = blockOf(n);
        if (!last || last.el !== b) { last = { el: b, tag: b.tagName.toLowerCase(), items: [] }; groups.push(last); }
        last.items.push(key);
      });
      main.querySelectorAll("img").forEach(function (img) {
        var o = originalImg(img);
        if (!o.src || o.src.indexOf("data:") === 0 || seenImg[o.src]) return;
        seenImg[o.src] = true;
        imgs.push({ src: o.src, alt: o.alt || "" });
      });
    }
    return {
      groups: groups.map(function (g) { return { tag: g.tag, items: g.items }; }),
      images: imgs
    };
  }

  // Finds the element showing a text key or image path, for scrolling to it.
  function find(kind, key) {
    var main = document.querySelector("main");
    if (!main) return null;
    if (kind === "img") {
      var all = main.querySelectorAll("img");
      for (var i = 0; i < all.length; i++) if (originalImg(all[i]).src === key && visible(all[i])) return all[i];
      return null;
    }
    var nodes = textNodes(main);
    for (var j = 0; j < nodes.length; j++) if (norm(originalText(nodes[j])) === key && visible(nodes[j].parentNode)) return blockOf(nodes[j]);
    return null;
  }

  function flash(el) {
    if (!el) return;
    // Scroll this window only; scrollIntoView would also scroll the admin page around the frame.
    var r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - (window.innerHeight - r.height) / 2, behavior: "smooth" });
    el.classList.add("yc-edit-flash");
    setTimeout(function () { el.classList.remove("yc-edit-flash"); }, 1400);
  }

  function setupPreview() {
    var css = document.createElement("style");
    css.textContent =
      "main .yc-edit-hover{outline:2px dashed #F96167!important;outline-offset:3px;cursor:pointer!important}" +
      "main .yc-edit-flash{outline:3px solid #F96167!important;outline-offset:4px;transition:outline-color .3s}";
    document.head.appendChild(css);
    var hovered = null;
    function target(e) {
      var main = document.querySelector("main");
      var t = e.target;
      if (!main || !main.contains(t)) return null;
      if (t.tagName === "IMG") return { el: t, kind: "img", key: originalImg(t).src };
      var el = t.closest(BLOCKS) || t;
      var n = textNodes(el)[0];
      return n ? { el: el, kind: "text", key: norm(originalText(n)) } : null;
    }
    document.addEventListener("mouseover", function (e) {
      var t = target(e);
      if (hovered) hovered.classList.remove("yc-edit-hover");
      hovered = t ? t.el : null;
      if (hovered) hovered.classList.add("yc-edit-hover");
    });
    // In the preview, clicks pick something to edit instead of following links.
    document.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var t = target(e);
      if (t && window.parent && window.parent.ycPick) window.parent.ycPick(t.kind, t.key);
    }, true);
  }

  window.ycContent = {
    refresh: apply,
    preview: function (pageData) {
      data = { pages: {} };
      if (pageData) data.pages[pageId()] = pageData;
      apply();
    },
    collect: collect,
    show: function (kind, key) { flash(find(kind, key)); }
  };

  if (PREVIEW) {
    if (document.head) setupPreview(); else document.addEventListener("DOMContentLoaded", setupPreview);
    return;
  }

  fetch("/api/site-content")
    .then(function (r) { return r.ok ? r.json() : { pages: {} }; })
    .then(function (d) { data = { pages: (d && d.pages) || {} }; if (current()) apply(); })
    .catch(function () {});
})();
