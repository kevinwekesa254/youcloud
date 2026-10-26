// SEO and readability checks for the blog editor, modelled on Yoast SEO.
// Each check returns { label, status: "good" | "ok" | "bad", text }.
// Scores: good = 9, ok = 5, bad = 0, averaged and scaled to 0–100.
// Good needs 75+ and no red check; 45+ is OK; anything lower Needs improvement.

window.SEO = (function () {
  "use strict";

  var STOP = ["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by", "with", "your", "you", "is", "are", "how", "what", "why"];

  var TRANSITIONS = ["accordingly", "additionally", "afterwards", "also", "although", "as a result", "because", "besides", "but", "consequently", "conversely", "equally", "especially", "eventually", "finally", "first", "firstly", "for example", "for instance", "furthermore", "hence", "however", "in addition", "in contrast", "in fact", "in other words", "in short", "indeed", "instead", "lastly", "likewise", "meanwhile", "moreover", "namely", "nevertheless", "next", "nonetheless", "notably", "on the other hand", "otherwise", "overall", "second", "secondly", "similarly", "since", "so", "specifically", "still", "subsequently", "such as", "then", "therefore", "third", "thus", "to summarise", "to summarize", "ultimately", "unlike", "whereas", "while", "yet"];

  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function parse(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return d;
  }

  function textOf(html) {
    return (parse(html).textContent || "").replace(/\s+/g, " ").trim();
  }

  function norm(s) {
    return " " + String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9À-ɏ]+/g, " ").trim() + " ";
  }

  function wordsOf(s) {
    var n = norm(s).trim();
    return n ? n.split(" ") : [];
  }

  // Keyphrase words that carry meaning (stop words ignored), e.g. "pos for restaurants" → pos, restaurants.
  function kpWords(kp) {
    var w = wordsOf(kp);
    var content = w.filter(function (x) { return STOP.indexOf(x) < 0; });
    return content.length ? content : w;
  }

  function wordForms(w) {
    if (w.length <= 3) return [w, w + "s"];
    var stem = /(ss|us|is)$/.test(w) ? w : w.replace(/(ies|es|s)$/, "");
    return [w, stem, stem + "s", stem + "es", stem + "y", stem.replace(/y$/, "ies")];
  }

  function hasWord(text, w) {
    var t = norm(text);
    return wordForms(w).some(function (f) { return f && t.indexOf(" " + f + " ") >= 0; });
  }

  // True when every meaningful keyphrase word appears in the text.
  function hasKp(text, kp) {
    var w = kpWords(kp);
    return w.length > 0 && w.every(function (x) { return hasWord(text, x); });
  }

  function exactCount(text, kp) {
    var t = norm(text), k = norm(kp).trim();
    if (!k) return 0;
    var n = 0, i = 0;
    while ((i = t.indexOf(" " + k, i)) >= 0) { n++; i += k.length; }
    // also count simple plural of the last word
    var kp2 = k.replace(/(\w+)$/, function (m) { return m.endsWith("s") ? m.slice(0, -1) : m + "s"; });
    i = 0;
    while (kp2 !== k && (i = t.indexOf(" " + kp2 + " ", i)) >= 0) { n++; i += kp2.length; }
    return n;
  }

  function sentencesOf(text) {
    return String(text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/).map(function (s) { return s.trim(); }).filter(function (s) { return wordsOf(s).length > 0; });
  }

  function syllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    var m = word.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  var canvas = null;
  function textWidth(s, font) {
    canvas = canvas || document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    ctx.font = font;
    return ctx.measureText(s).width;
  }

  function truncatePx(s, px, font) {
    if (textWidth(s, font) <= px) return s;
    var out = s;
    while (out.length && textWidth(out + " ...", font) > px) out = out.slice(0, -1);
    return out.replace(/\s+\S*$/, "") + " ...";
  }

  function score(checks) {
    var pts = { good: 9, ok: 5, bad: 0 };
    if (!checks.length) return 0;
    var sum = checks.reduce(function (a, c) { return a + pts[c.status]; }, 0);
    return Math.round(sum / checks.length / 9 * 100);
  }

  function rating(s, checks) {
    var anyBad = checks.some(function (x) { return x.status === "bad"; });
    return s >= 75 && !anyBad ? "good" : s >= 45 ? "ok" : "bad";
  }

  function c(label, status, text) { return { label: label, status: status, text: text }; }

  function analyse(post, others) {
    var dom = parse(post.content);
    var text = (dom.textContent || "").replace(/\s+/g, " ").trim();
    var words = wordsOf(text);
    var wc = words.length;
    var kp = (post.focusKeyphrase || "").trim();
    var seoTitle = post.seoTitle || (post.title ? post.title + " | youcloud Blog" : "");
    var meta = post.metaDescription || "";
    var paras = Array.prototype.map.call(dom.querySelectorAll("p, li"), function (p) { return p.textContent.trim(); }).filter(Boolean);
    var heads = Array.prototype.map.call(dom.querySelectorAll("h2, h3, h4"), function (h) { return h.textContent.trim(); }).filter(Boolean);
    var imgs = dom.querySelectorAll("img");
    var alts = Array.prototype.map.call(imgs, function (i) { return i.getAttribute("alt") || ""; });
    if (post.featuredImage) alts.push(post.featuredAlt || "");
    var links = Array.prototype.map.call(dom.querySelectorAll("a[href]"), function (a) { return a.getAttribute("href"); });
    var internal = links.filter(function (h) { return /^\/|^#|youcloudpay\.com|youcloud\.ae/.test(h); }).length;
    var outbound = links.length - internal;

    // ── SEO ──
    var seo = [];
    if (!kp) {
      seo.push(c("Focus keyphrase", "bad", "Set a focus keyphrase to get a full SEO analysis."));
    } else {
      var kpw = wordsOf(kp).length;
      seo.push(kpw > 4 ? c("Keyphrase length", "ok", "The keyphrase is " + kpw + " words. Shorter phrases (1–4 words) are easier to rank for.") : c("Keyphrase length", "good", "Good length."));

      var titleNorm = norm(seoTitle);
      if (titleNorm.indexOf(norm(kp)) >= 0 || hasKp(seoTitle, kp)) {
        var begins = titleNorm.trim().indexOf(norm(kp).trim()) === 0;
        seo.push(begins ? c("Keyphrase in SEO title", "good", "The keyphrase starts the SEO title. Well done.") : c("Keyphrase in SEO title", "ok", "The keyphrase is in the SEO title. Moving it to the start can help."));
      } else seo.push(c("Keyphrase in SEO title", "bad", "Put the keyphrase in the SEO title (or the article title), ideally at the start."));

      seo.push(hasKp(meta, kp) ? c("Keyphrase in meta description", "good", "The meta description mentions the keyphrase.") : c("Keyphrase in meta description", "bad", meta ? "Mention the keyphrase in the meta description." : "Write a meta description that includes the keyphrase."));

      var slug = (post.slug || slugify(post.title)).replace(/-/g, " ");
      seo.push(hasKp(slug, kp) ? c("Keyphrase in link", "good", "The keyphrase is in the article link.") : c("Keyphrase in link", "ok", "Use the keyphrase in the article link (slug)."));

      var intro = paras[0] || "";
      seo.push(hasKp(intro, kp) ? c("Keyphrase in introduction", "good", "The first paragraph mentions the keyphrase.") : c("Keyphrase in introduction", "bad", "Mention the keyphrase in the first paragraph so readers and Google know the topic straight away."));

      if (wc >= 100) {
        var n = exactCount(text, kp);
        var density = n * kpw / wc * 100;
        var d = density.toFixed(1);
        if (density < 0.5) seo.push(c("Keyphrase density", n ? "ok" : "bad", "The keyphrase appears " + n + " time" + (n === 1 ? "" : "s") + " (" + d + "%). Aim for 0.5–3%: use it a few more times."));
        else if (density > 3) seo.push(c("Keyphrase density", "bad", "The keyphrase appears " + n + " times (" + d + "%). That's more than 3%; it can read as keyword stuffing."));
        else seo.push(c("Keyphrase density", "good", "The keyphrase appears " + n + " times (" + d + "%). Great."));
      }

      if (heads.length) {
        var hk = heads.filter(function (h) { return hasKp(h, kp); }).length;
        var share = hk / heads.length;
        seo.push(hk === 0 ? c("Keyphrase in subheadings", "ok", "Use the keyphrase (or a close variant) in at least one subheading.")
          : share > 0.75 && heads.length > 2 ? c("Keyphrase in subheadings", "ok", hk + " of " + heads.length + " subheadings use the keyphrase. Vary them a little.")
          : c("Keyphrase in subheadings", "good", hk + " of " + heads.length + " subheadings use the keyphrase."));
      }

      if (alts.length) {
        var ak = alts.filter(function (a) { return hasKp(a, kp); }).length;
        seo.push(ak ? c("Keyphrase in image alt text", "good", ak + " image description" + (ak === 1 ? "" : "s") + " include the keyphrase.") : c("Keyphrase in image alt text", "ok", "Describe at least one image using the keyphrase."));
      }

      var dup = (others || []).filter(function (o) { return norm(o.kp) === norm(kp); });
      seo.push(dup.length ? c("Previously used keyphrase", "bad", "“" + dup[0].title + "” already targets this keyphrase. Pick a different one so the articles don't compete.") : c("Previously used keyphrase", "good", "You haven't used this keyphrase before."));
    }

    var tlen = seoTitle.length, tpx = seoTitle ? textWidth(seoTitle, "20px arial") : 0;
    if (!seoTitle) seo.push(c("SEO title width", "bad", "Add a title."));
    else if (tpx > 600) seo.push(c("SEO title width", "ok", "The SEO title is too wide (" + tlen + " characters) and will be cut off in Google. Keep it under about 60 characters."));
    else if (tlen < 30) seo.push(c("SEO title width", "ok", "The SEO title is short (" + tlen + " characters). Use the space to add detail."));
    else seo.push(c("SEO title width", "good", "Good length."));

    var ml = meta.length;
    if (!ml) seo.push(c("Meta description length", "bad", "No meta description: Google will pick text from the page instead."));
    else if (ml < 120) seo.push(c("Meta description length", "ok", "The meta description is " + ml + " characters. Aim for 120–156."));
    else if (ml > 156) seo.push(c("Meta description length", "ok", "The meta description is " + ml + " characters and will be cut off. Keep it to 156."));
    else seo.push(c("Meta description length", "good", "Good length."));

    if (wc < 200) seo.push(c("Text length", "bad", "The text has " + wc + " words. Write at least 300 words."));
    else if (wc < 300) seo.push(c("Text length", "ok", "The text has " + wc + " words. A little more (300+) is recommended."));
    else seo.push(c("Text length", "good", "The text has " + wc + " words. Good job."));

    seo.push(internal ? c("Internal links", "good", "Links to other youcloud pages: " + internal + ".") : c("Internal links", "ok", "Link to another youcloud page or article (e.g. a product or pricing page)."));
    seo.push(outbound ? c("Outbound links", "good", "Links to other websites: " + outbound + ".") : c("Outbound links", "ok", "Add a link to a trustworthy outside source where it helps the reader."));
    seo.push(imgs.length || post.featuredImage ? c("Images", "good", "The article has images.") : c("Images", "ok", "Add at least one image."));

    // ── Readability ──
    var read = [];
    if (wc < 50) {
      read.push(c("Not enough text", "bad", "Write at least 50 words to get a readability analysis."));
    } else {
      var sents = sentencesOf(paras.join(". ").replace(/\.\.\s/g, ". ") || text);
      if (!sents.length) sents = [text];
      var syl = words.reduce(function (a, w) { return a + syllables(w); }, 0);
      var flesch = Math.round(206.835 - 1.015 * (wc / sents.length) - 84.6 * (syl / wc));
      flesch = Math.max(0, Math.min(100, flesch));
      read.push(flesch >= 60 ? c("Flesch reading ease", "good", "Scores " + flesch + ": easy to read.")
        : flesch >= 50 ? c("Flesch reading ease", "ok", "Scores " + flesch + ": fairly difficult. Use shorter sentences and simpler words.")
        : c("Flesch reading ease", "bad", "Scores " + flesch + ": difficult to read. Use shorter sentences and simpler words."));

      var longS = sents.filter(function (s) { return wordsOf(s).length > 20; }).length;
      var pctLong = Math.round(longS / sents.length * 100);
      read.push(pctLong <= 25 ? c("Sentence length", "good", "Most sentences are short.")
        : pctLong <= 30 ? c("Sentence length", "ok", pctLong + "% of sentences are over 20 words. Keep it under 25%.")
        : c("Sentence length", "bad", pctLong + "% of sentences are over 20 words. Split some up (aim for under 25%)."));

      var longest = paras.reduce(function (a, p) { return Math.max(a, wordsOf(p).length); }, 0);
      read.push(longest <= 150 ? c("Paragraph length", "good", "No paragraph is too long.")
        : longest <= 200 ? c("Paragraph length", "ok", "One paragraph has " + longest + " words. Keep paragraphs under 150.")
        : c("Paragraph length", "bad", "One paragraph has " + longest + " words. Break it up (under 150 words each)."));

      if (wc > 300) {
        if (!heads.length) read.push(c("Subheading distribution", "bad", "Add subheadings (Heading 2 / Heading 3) to break up the text."));
        else {
          // words between headings
          var sections = [], cur = 0;
          Array.prototype.forEach.call(dom.children, function (el) {
            if (/^H[2-4]$/.test(el.tagName)) { sections.push(cur); cur = 0; } else cur += wordsOf(el.textContent).length;
          });
          sections.push(cur);
          var maxSec = Math.max.apply(null, sections);
          read.push(maxSec <= 300 ? c("Subheading distribution", "good", "Subheadings are well spread out.")
            : maxSec <= 350 ? c("Subheading distribution", "ok", "One section runs " + maxSec + " words without a subheading. Add one.")
            : c("Subheading distribution", "bad", "One section runs " + maxSec + " words without a subheading. Add subheadings every 300 words or so."));
        }
      }

      var passive = sents.filter(function (s) { return /\b(am|is|are|was|were|be|been|being|get|gets|got)\s+(\w+ly\s+)?\w+(ed|en)\b/i.test(s); }).length;
      var pctPassive = Math.round(passive / sents.length * 100);
      read.push(pctPassive <= 10 ? c("Passive voice", "good", "You use enough active voice.")
        : pctPassive <= 15 ? c("Passive voice", "ok", pctPassive + "% of sentences use passive voice. Aim for 10% or less.")
        : c("Passive voice", "bad", pctPassive + "% of sentences use passive voice. Rewrite some actively (aim for 10% or less)."));

      var trans = sents.filter(function (s) { var n = norm(s); return TRANSITIONS.some(function (t) { return n.indexOf(" " + t + " ") >= 0; }); }).length;
      var pctTrans = Math.round(trans / sents.length * 100);
      read.push(pctTrans >= 30 ? c("Transition words", "good", pctTrans + "% of sentences use transition words.")
        : pctTrans >= 20 ? c("Transition words", "ok", pctTrans + "% of sentences use transition words (e.g. however, because, for example). Aim for 30%.")
        : c("Transition words", "bad", "Only " + pctTrans + "% of sentences use transition words (e.g. however, because, for example). Aim for 30%."));

      var run = 1, worst = 1;
      for (var i = 1; i < sents.length; i++) {
        var a = wordsOf(sents[i - 1])[0], b = wordsOf(sents[i])[0];
        run = a && a === b ? run + 1 : 1;
        worst = Math.max(worst, run);
      }
      read.push(worst >= 3 ? c("Consecutive sentences", "bad", worst + " sentences in a row start with the same word. Mix it up.") : c("Consecutive sentences", "good", "Sentence openings are varied."));
    }

    var seoScore = score(seo), readScore = score(read);
    return {
      words: wc,
      seo: { checks: seo, score: seoScore, rating: rating(seoScore, seo) },
      read: { checks: read, score: readScore, rating: rating(readScore, read) }
    };
  }

  return { analyse: analyse, slugify: slugify, textOf: textOf, textWidth: textWidth, truncatePx: truncatePx };
})();
