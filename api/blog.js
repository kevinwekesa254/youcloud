// Server-rendered blog: /blog (list) and /blog/<slug> (article), so search
// engines get full HTML, titles, descriptions and structured data.
// vercel.json rewrites /blog → /api/blog and /blog/:slug → /api/blog?slug=:slug.

const cms = require("./_lib/cms");
const { SITE_URL, escapeHtml: esc } = cms;

const PER_PAGE = 9;
const ORG_ID = "https://www.youcloudpay.com/#organization";

module.exports = async (req, res) => {
  const q = req.query || {};
  try {
    if (q.preview) return await renderPreview(req, res, String(q.preview));
    if (q.slug) return await renderPost(res, String(q.slug));
    return await renderList(res, q);
  } catch (e) {
    console.error(e);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).send(page({
      title: "Blog | youcloud", description: "", canonical: SITE_URL + "/blog", noindex: true,
      body: `<section class="wrap empty"><h1>Something went wrong</h1><p>The blog could not be loaded. Please try again in a minute.</p></section>`
    }));
  }
};

// ── List ────────────────────────────────────────────────────────────────

async function renderList(res, q) {
  const all = await cms.getPublishedPosts();
  const categories = [...new Set(all.map(p => p.category).filter(Boolean))].sort();
  const category = q.category && categories.find(c => cms.slugify(c) === cms.slugify(q.category));
  const posts = category ? all.filter(p => p.category === category) : all;
  const pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const n = Math.min(pages, Math.max(1, parseInt(q.page, 10) || 1));
  const shown = posts.slice((n - 1) * PER_PAGE, n * PER_PAGE);

  const qs = (extra) => {
    const p = new URLSearchParams();
    if (category) p.set("category", cms.slugify(category));
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return "/blog" + (s ? "?" + s : "");
  };

  const lead = n === 1 && !category && shown.length ? shown[0] : null;
  const grid = lead ? shown.slice(1) : shown;

  const body = `
<section class="wrap hero">
  <span class="pill"><i></i>YOUCLOUD BLOG</span>
  <div class="hero-grid">
    <h1>Insights for <em>growing merchants.</em></h1>
    <p class="lede">Guides, product news and stories from shops, restaurants and enterprises that run on youcloud.</p>
  </div>
  ${categories.length ? `<nav class="chips" aria-label="Categories">
    <a class="chip${category ? "" : " on"}" href="/blog">All</a>
    ${categories.map(c => `<a class="chip${c === category ? " on" : ""}" href="/blog?category=${encodeURIComponent(cms.slugify(c))}">${esc(c)}</a>`).join("")}
  </nav>` : ""}
</section>
<section class="wrap">
  ${!posts.length ? `<div class="empty"><h2>No articles yet</h2><p>New articles are on the way. Check back soon.</p></div>` : ""}
  ${lead ? `<a class="lead" href="/blog/${esc(lead.slug)}">
    <div class="lead-img">${img(lead, "eager")}</div>
    <div class="lead-txt">
      ${lead.category ? `<span class="cat">${esc(lead.category)}</span>` : ""}
      <h2>${esc(lead.title)}</h2>
      <p>${esc(excerpt(lead, 220))}</p>
      <div class="meta">${meta(lead)}</div>
      <span class="more">Read article <span aria-hidden="true">→</span></span>
    </div>
  </a>` : ""}
  ${grid.length ? `<div class="grid">${grid.map(card).join("")}</div>` : ""}
  ${pages > 1 ? `<nav class="pager" aria-label="Pages">
    ${n > 1 ? `<a href="${qs({ page: n > 2 ? String(n - 1) : "" })}">← Newer</a>` : "<span></span>"}
    <span>Page ${n} of ${pages}</span>
    ${n < pages ? `<a href="${qs({ page: String(n + 1) })}">Older →</a>` : "<span></span>"}
  </nav>` : ""}
</section>
${cta()}`;

  const title = category ? `${category} | youcloud Blog` : "Blog | youcloud: POS, payments & merchant growth";
  const description = category
    ? `Articles about ${category} from youcloud: guides and stories for growing merchants.`
    : "Guides, product news and merchant stories from youcloud: POS, payments, QR commerce and embedded finance for SMB and enterprise merchants.";
  const canonical = SITE_URL + qs({ page: n > 1 ? String(n) : "" });
  const ld = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": SITE_URL + "/blog#blog",
    name: "youcloud Blog",
    url: SITE_URL + "/blog",
    description,
    publisher: { "@id": ORG_ID },
    blogPost: shown.map(p => ({ "@type": "BlogPosting", headline: p.title, url: `${SITE_URL}/blog/${p.slug}`, datePublished: p.publishedAt }))
  };

  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
  return res.status(200).send(page({ title, description, canonical, body, ld, ogType: "website" }));
}

// ── Article ─────────────────────────────────────────────────────────────

async function renderPost(res, slug, opts = {}) {
  let post = opts.post;
  let all = opts.all;
  if (!post) {
    all = await cms.getPublishedPosts();
    post = all.find(p => p.slug === slug);
  }
  if (!post) {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30");
    return res.status(404).send(page({
      title: "Article not found | youcloud Blog", description: "", canonical: SITE_URL + "/blog", noindex: true,
      body: `<section class="wrap empty"><h1>We couldn't find that article</h1><p>It may have moved or been unpublished.</p><p><a class="btn" href="/blog">Browse all articles</a></p></section>`
    }));
  }

  const url = `${SITE_URL}/blog/${post.slug}`;
  const related = all.filter(p => p.id !== post.id)
    .sort((a, b) => (b.category === post.category) - (a.category === post.category))
    .slice(0, 3);
  const share = encodeURIComponent(url);
  const shareTitle = encodeURIComponent(post.title);

  const body = `
${opts.preview ? `<div class="preview-bar">Preview: this is how the article will look. ${post.status === "published" ? "It is published." : "It is a draft and not public yet."}</div>` : ""}
<article class="wrap post">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/blog">Blog</a>${post.category ? `<span>/</span><a href="/blog?category=${encodeURIComponent(cms.slugify(post.category))}">${esc(post.category)}</a>` : ""}</nav>
  <header class="post-head">
    ${post.category ? `<span class="cat">${esc(post.category)}</span>` : ""}
    <h1>${esc(post.title)}</h1>
    ${post.excerpt ? `<p class="lede">${esc(post.excerpt)}</p>` : ""}
    <div class="meta">${meta(post)}</div>
  </header>
  ${post.featuredImage ? `<figure class="post-img">${img(post, "eager")}</figure>` : ""}
  <div class="prose">${post.content || ""}</div>
  <div class="share">
    <span>Share</span>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
    <a href="https://twitter.com/intent/tweet?url=${share}&text=${shareTitle}" target="_blank" rel="noopener noreferrer">X</a>
    <a href="https://wa.me/?text=${shareTitle}%20${share}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
    <button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText('${url}').then(()=>{this.textContent='Copied'})">Copy link</button>
  </div>
</article>
${cta()}
${related.length ? `<section class="wrap related"><h2>Keep reading</h2><div class="grid">${related.map(card).join("")}</div></section>` : ""}`;

  const description = post.metaDescription || excerpt(post, 155);
  const image = post.featuredImage ? absolute(post.featuredImage) : SITE_URL + "/img/hero-store-1200.jpg";
  const ld = [{
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    image: [image],
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: post.author ? { "@type": "Person", name: post.author } : { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category || undefined,
    keywords: post.focusKeyphrase || undefined,
    wordCount: words(post.content)
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL + "/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: SITE_URL + "/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: url }
    ]
  }];

  res.setHeader("Cache-Control", opts.preview ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
  return res.status(200).send(page({
    title: post.seoTitle || `${post.title} | youcloud Blog`,
    description, canonical: url, body, ld, image, ogType: "article",
    noindex: !!opts.preview, published: post.publishedAt, modified: post.updatedAt
  }));
}

// Drafts can be previewed by a signed-in admin: /api/blog?preview=<post id>
async function renderPreview(req, res, id) {
  if (!cms.isAdmin(req)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).send(page({
      title: "Preview | youcloud Blog", description: "", canonical: SITE_URL + "/blog", noindex: true,
      body: `<section class="wrap empty"><h1>Sign in to preview</h1><p><a class="btn" href="/admin">Go to the admin</a></p></section>`
    }));
  }
  const posts = await cms.getAllPosts();
  const post = posts.find(p => p.id === id);
  return renderPost(res, "", { post, all: await cms.getPublishedPosts(), preview: true });
}

// ── Pieces ──────────────────────────────────────────────────────────────

function card(p) {
  return `<a class="card" href="/blog/${esc(p.slug)}">
    <div class="card-img">${img(p, "lazy")}</div>
    <div class="card-txt">
      ${p.category ? `<span class="cat">${esc(p.category)}</span>` : ""}
      <h3>${esc(p.title)}</h3>
      <p>${esc(excerpt(p, 140))}</p>
      <div class="meta">${meta(p)}</div>
    </div>
  </a>`;
}

function img(p, loading) {
  if (!p.featuredImage) return `<div class="ph" aria-hidden="true"><img src="/img/logomark.png" alt="" /></div>`;
  return `<img src="${esc(p.featuredImage)}" alt="${esc(p.featuredAlt || p.title)}" loading="${loading}" decoding="async" />`;
}

function meta(p) {
  const d = new Date(p.publishedAt);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const mins = Math.max(1, Math.round(words(p.content) / 220));
  return `${p.author ? `<span>${esc(p.author)}</span><b>·</b>` : ""}<time datetime="${esc(p.publishedAt)}">${date}</time><b>·</b><span>${mins} min read</span>`;
}

function excerpt(p, max) {
  const t = p.excerpt || cms.stripTags(p.content);
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
}

function words(html) {
  const t = cms.stripTags(html);
  return t ? t.split(/\s+/).length : 0;
}

function absolute(u) {
  return /^https?:/.test(u) ? u : SITE_URL + (u.startsWith("/") ? u : "/" + u);
}

function cta() {
  return `<section class="wrap"><div class="cta">
    <div><h2>See youcloud running in your business.</h2><p>POS, payments, stock and your books on one shared ledger. Live in under an hour.</p></div>
    <a class="btn" href="/contact">Book a demo</a>
  </div></section>`;
}

// ── Site chrome ─────────────────────────────────────────────────────────
// Mirrors the header and footer of the main site (youcloud.dc.html: NAV,
// PRODUCTS, FOOTER, footerArcIcons, SOCIAL_LINKS) so /blog looks the same as
// every other page. Keep the two in step when either changes.

const NAV = [
  ["/", "Home"], ["products", "Products"], ["/addons", "Add-ons"],
  ["/solutions", "Solutions"], ["/pricing", "Pricing"], ["/partners", "Partners"], ["/about", "About"]
];

const PRODUCTS = [
  ["/youshop", "youShop", "Retail POS · inventory · CRM"],
  ["/youresto", "youResto", "Restaurant POS · KDS · delivery"],
  ["/youqr", "youQR", "Scan-to-order · loyalty"],
  ["/youpay", "youPay", "Cards · wallets · QR · SoundBox"]
];

const SOL = "/solutions";
const FOOTER = [
  ["Solutions", [["Digital Café", SOL], ["FMCG Distribution", SOL], ["Taxi and Fleet", SOL], ["Production Enterprise", SOL], ["Micro-merchant", SOL], ["Multi-brand Chain", SOL], ["Cloud Kitchen", SOL]]],
  ["Company", [["About", "/about"], ["Markets", "/solutions"], ["Pricing", "/pricing"], ["Partners • ICPs", "/partners"], ["Blog", "/blog"], ["Contact", "/contact"]]],
  ["Products", [["youShop", "/youshop"], ["youPay", "/youpay"], ["youResto", "/youresto"], ["youQR", "/youqr"]]],
  ["Enterprise", [["youPay Enterprise", "/youpay-ent"], ["youShop Enterprise", "/youshop-ent"], ["youResto Enterprise", "/youresto-ent"], ["Book a demo", "/contact"]]],
  ["Trust", [["PCI L1 Certified"], ["99.99% Uptime SLA"], ["EMVCo Compliant"], ["GDPR & PSD2 Ready"]]],
  ["Legal", [["Terms of Use", "/terms"], ["Privacy Policy", "/privacy"], ["Cookies", "/cookies"]]]
];

const ARC = [
  ["youPay", "/img/ic-pay.png", "/youpay", "5%", 108, 60, 26],
  ["youResto", "/img/ic-resto.png", "/youresto", "28%", 44, 64, 28],
  ["Home", "/img/logomark.png?v=2", "/", "50%", 0, 84, 34],
  ["youShop", "/img/ic-shop.png", "/youshop", "72%", 44, 64, 28],
  ["youQR", "/img/ic-qr.png", "/youqr", "95%", 108, 60, 26]
];

const INSTA = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></svg>`;
const SOCIALS = [
  ["LinkedIn", "https://www.linkedin.com/company/youcloudpaytech", "in"],
  ["Instagram", "https://www.instagram.com/youcloudpay/", INSTA],
  ["Facebook", "https://www.facebook.com/YouCloudPay/", "f"]
];

function header() {
  const menu = PRODUCTS.map(([href, name, desc]) => `<a href="${href}"><b>${name}</b><span>${desc}</span></a>`).join("");
  return `<header class="top">
  <div class="top-in">
    <div class="top-l"><a href="/" class="logo"><img src="/img/logo.png?v=2" alt="youcloud" /></a></div>
    <nav class="nav" aria-label="Main">
      ${NAV.map(([href, label]) => href === "products"
        ? `<div class="nav-dd"><button type="button" aria-haspopup="true">${label} <span class="caret">▾</span></button><div class="dd"><div class="dd-in">${menu}</div></div></div>`
        : `<a href="${href}">${label}</a>`).join("")}
    </nav>
    <div class="top-r">
      <a class="btn-ghost" href="/contact">Contact us</a>
      <a class="btn" href="/contact">Book a demo</a>
      <button type="button" class="burger" aria-label="Menu" aria-expanded="false">☰</button>
    </div>
  </div>
  <div class="mnav">
    ${NAV.map(([href, label]) => href === "products"
      ? `<span class="mnav-h">${label}</span>${PRODUCTS.map(([h, name]) => `<a class="sub" href="${h}">${name}</a>`).join("")}`
      : `<a href="${href}">${label}</a>`).join("")}
    <div class="mnav-btns"><a class="btn-ghost" href="/contact">Contact us</a><a class="btn" href="/contact">Book a demo</a></div>
  </div>
</header>`;
}

function footer() {
  const arc = ARC.map(([name, icon, href, left, top, size, iconSize]) =>
    `<a href="${href}" title="${name}" class="arc-i${name === "Home" ? " arc-home" : ""}" style="left:${left};top:${top}px;width:${size}px;height:${size}px"><img loading="lazy" decoding="async" src="${icon}" alt="${name}" style="width:${iconSize}px;height:${iconSize}px" /></a>`).join("");
  const cols = FOOTER.map(([title, links]) => `<div>
        <div class="fcol-t">${title}</div>
        <ul>${links.map(([label, href]) => `<li>${href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`}</li>`).join("")}</ul>
        <div class="socials">${title === "Legal" ? SOCIALS.map(([t, href, glyph]) => `<a href="${href}" title="${t}" aria-label="${t}" target="_blank" rel="noopener noreferrer">${glyph}</a>`).join("") : ""}</div>
      </div>`).join("");
  return `<footer class="foot">
  <div class="foot-in">
    <div class="foot-top">
      <div class="arc">
        <svg viewBox="0 0 720 170" preserveAspectRatio="none" aria-hidden="true"><path d="M 40 150 Q 360 -10 680 150" fill="none" stroke="#F7D3D6" stroke-width="2" /></svg>
        ${arc}
      </div>
      <img class="foot-logo" loading="lazy" decoding="async" src="/img/logo.png?v=2" alt="youcloud" />
      <p>The operating layer for SMB and enterprise merchants. One licence, four products, unlimited merchants — live in 9+ markets.</p>
      <div class="foot-btns"><a class="btn" href="/contact">Book a demo</a><a class="btn-out" href="/youshop">See product</a></div>
    </div>
    <div class="foot-rule"></div>
    <div class="fcols">${cols}</div>
    <div class="copy">© ${new Date().getFullYear()} youcloud Paytech • DIFC Dubai • All rights reserved.</div>
  </div>
</footer>`;
}

const JS = `(function(){var h=document.querySelector(".top"),b=h&&h.querySelector(".burger");if(!b)return;
b.addEventListener("click",function(){var o=h.classList.toggle("open");b.textContent=o?"✕":"☰";b.setAttribute("aria-expanded",o)});
var s=function(){h.classList.toggle("scrolled",window.scrollY>8)};window.addEventListener("scroll",s,{passive:true});s()})();`;

function page({ title, description, canonical, body, ld, image, ogType = "website", noindex, published, modified }) {
  const og = image || SITE_URL + "/img/hero-store-1200.jpg";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<link rel="canonical" href="${esc(canonical)}">
${noindex ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`}
<meta property="og:site_name" content="youcloud">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ""}
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
${published ? `<meta property="article:published_time" content="${esc(published)}">` : ""}
${modified ? `<meta property="article:modified_time" content="${esc(modified)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
${description ? `<meta name="twitter:description" content="${esc(description)}">` : ""}
<meta name="twitter:image" content="${esc(og)}">
<link rel="icon" href="/img/logomark.png">
<link rel="alternate" type="application/rss+xml" title="youcloud Blog" href="/blog/feed.xml">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PSHP5TKH');</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-X55S79585D"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-X55S79585D');</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PSHP5TKH" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
${header()}
<main>${body}</main>
${footer()}
<script>${JS}</script>
</body>
</html>`;
}

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{--coral:#F96167;--coral-d:#e84f56;--navy:#0B1D3A;--ink:#3D4759;--muted:#6C7689;--line:#EEE9EA;--soft:#FEF3F4}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--ink);font-family:Carlito,Calibri,"Segoe UI",system-ui,sans-serif;font-size:17px;line-height:1.65}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
h1,h2,h3,h4{color:var(--navy);line-height:1.15;margin:0;letter-spacing:-.01em}
.wrap{max-width:1220px;margin:0 auto;padding:0 30px}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 28px;border-radius:999px;background:var(--coral);color:#fff;font-weight:700;font-size:16px;border:none;cursor:pointer;white-space:nowrap;transition:background .2s}
.btn:hover{background:var(--coral-d)}
.pill{display:inline-flex;align-items:center;gap:12px;padding:9px 18px 9px 15px;border-radius:999px;background:rgba(249,97,103,.16);color:#B8434C;font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;letter-spacing:.14em;font-weight:700;text-transform:uppercase}
.pill i{width:6px;height:6px;margin-right:11px;border-radius:50%;background:currentColor;box-shadow:11px 0 0 currentColor}
.hero{padding-top:40px;padding-bottom:22px}
.hero-grid{margin-top:18px;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px 56px;align-items:end}
.hero h1{font-size:clamp(34px,4.4vw,54px)}
.hero h1 em,.lede em{color:var(--coral);font-style:normal}
.lede{margin:0;font-size:18px;color:var(--muted)}
.chips{margin-top:24px;display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:7px 16px;border-radius:999px;border:1px solid var(--line);font-size:14.5px;color:var(--navy);background:#fff}
.chip:hover{border-color:var(--coral);color:var(--coral)}
.chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.cat{display:inline-block;padding:4px 11px;border-radius:999px;background:var(--soft);color:#C9343E;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:14px;color:var(--muted)}
.meta b{font-weight:400;opacity:.6}
.lead{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:36px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:24px;margin-bottom:22px;transition:box-shadow .25s,transform .25s}
.lead:hover,.card:hover{box-shadow:0 22px 44px -22px rgba(11,29,58,.28);transform:translateY(-3px)}
.lead-img,.card-img{border-radius:16px;overflow:hidden;aspect-ratio:16/9;background:var(--soft)}
.lead-img img,.card-img img{width:100%;height:100%;object-fit:cover}
.lead-txt{padding:8px 18px 8px 0}
.lead h2{margin:12px 0 10px;font-size:clamp(24px,2.6vw,34px)}
.lead p{margin:0 0 14px;color:var(--muted)}
.more{display:inline-block;margin-top:14px;color:var(--coral);font-weight:700}
.ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#FEF3F4,#F7EEF0)}
.ph img{width:56px;opacity:.5}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.card{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:20px;padding:12px;transition:box-shadow .25s,transform .25s}
.card-txt{padding:14px 8px 8px;display:flex;flex-direction:column;gap:8px;flex:1}
.card h3{font-size:21px}
.card p{margin:0;color:var(--muted);font-size:15.5px;flex:1}
.pager{display:flex;justify-content:space-between;align-items:center;margin-top:28px;font-size:15px;color:var(--muted)}
.pager a{color:var(--coral);font-weight:700}
.empty{padding:50px 0;text-align:center}
.empty h1,.empty h2{font-size:30px;margin-bottom:8px}
.empty p{color:var(--muted)}
.cta{margin:44px 0 0;padding:34px 40px;border-radius:24px;background:radial-gradient(520px 260px at 90% 0%,rgba(249,97,103,.28),transparent 70%),var(--navy);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:24px}
.cta h2{color:#fff;font-size:clamp(24px,2.6vw,32px)}
.cta p{margin:8px 0 0;color:rgba(255,255,255,.72)}
.related{margin-top:44px}
.related h2{font-size:28px;margin-bottom:18px}
.post{padding-top:26px}
.crumbs{display:flex;flex-wrap:wrap;gap:8px;font-size:14px;color:var(--muted)}
.crumbs a:hover{color:var(--coral)}
.post-head{max-width:820px;margin:22px auto 0;text-align:center}
.post-head h1{margin:14px 0 12px;font-size:clamp(32px,4.4vw,52px)}
.post-head .lede{margin-bottom:14px}
.post-head .meta{justify-content:center}
.post-img{margin:26px auto 0;max-width:1060px;border-radius:24px;overflow:hidden}
.post-img img{width:100%;max-height:560px;object-fit:cover}
.prose{max-width:740px;margin:30px auto 0;font-size:18.5px;line-height:1.75;color:#2E3748;overflow-wrap:break-word}
.prose>*:first-child{margin-top:0}
.prose p{margin:0 0 1.1em}
.prose h2{font-size:30px;margin:1.6em 0 .55em}
.prose h3{font-size:24px;margin:1.4em 0 .5em}
.prose h4{font-size:20px;margin:1.3em 0 .4em}
.prose a{color:var(--coral);text-decoration:underline;text-underline-offset:3px}
.prose ul,.prose ol{padding-left:1.4em;margin:0 0 1.1em}
.prose li{margin:.3em 0}
.prose blockquote{margin:1.4em 0;padding:6px 0 6px 22px;border-left:4px solid var(--coral);color:var(--navy);font-size:21px;font-style:italic}
.prose img{border-radius:16px;margin:1.4em auto;height:auto}
.prose pre{background:var(--navy);color:#fff;padding:18px 20px;border-radius:14px;overflow:auto;font-size:14.5px}
.prose code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
.prose iframe{width:100%;aspect-ratio:16/9;height:auto;border:0;border-radius:16px;margin:1.4em 0}
.prose .ql-align-center{text-align:center}.prose .ql-align-right{text-align:right}.prose .ql-align-justify{text-align:justify}
.prose .ql-indent-1{padding-left:2em}.prose .ql-indent-2{padding-left:4em}
.share{max-width:740px;margin:30px auto 0;padding-top:18px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14.5px}
.share span{font-weight:700;color:var(--navy);margin-right:4px}
.share a,.share button{padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;font:inherit;color:var(--navy);cursor:pointer}
.share a:hover,.share button:hover{border-color:var(--coral);color:var(--coral)}
.preview-bar{position:sticky;top:75px;z-index:40;background:#FFF4D6;color:#7A5300;text-align:center;font-size:14.5px;padding:8px 16px;border-bottom:1px solid #F3DFA2}
.top{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.45);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(244,241,242,.6);line-height:normal;transition:background .25s ease,box-shadow .25s ease}
.top.scrolled{background:rgba(255,255,255,.62);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 12px 30px rgba(11,29,58,.08)}
.top-in{max-width:1280px;margin:0 auto;padding:14px 30px;display:flex;align-items:center;gap:18px}
.top-l{flex:1 1 0;min-width:0;display:flex;align-items:center}
.logo img{height:30px;width:auto}
.nav{display:flex;align-items:center;justify-content:center;gap:2px;flex-shrink:0}
.nav>a,.nav-dd>button{background:none;border:0;font:inherit;cursor:pointer;display:flex;align-items:center;gap:5px;padding:8px 11px;font-size:15px;white-space:nowrap;color:var(--navy);border-bottom:2px solid transparent;transition:color .2s ease}
.nav>a:hover,.nav-dd>button:hover{color:var(--coral)}
.caret{font-size:11px;opacity:.7}
.nav-dd{position:relative}
.dd{display:none;position:absolute;top:100%;left:50%;margin-left:-136px;padding-top:8px;width:272px;z-index:60}
.nav-dd:hover .dd,.nav-dd:focus-within .dd{display:block}
.dd-in{background:#fff;border:1px solid #F1EDEE;border-radius:14px;box-shadow:0 18px 40px rgba(11,29,58,.10);padding:8px}
.dd a{display:flex;flex-direction:column;gap:1px;padding:9px 12px;border-radius:9px;line-height:1.35}
.dd a:hover{background:var(--soft)}
.dd b{font-size:15px;color:var(--navy)}
.dd span{font-size:13px;color:#8A93A8}
.top-r{flex:1 1 0;display:flex;align-items:center;justify-content:flex-end;gap:12px}
.top-r .btn{padding:12px 30px}
.btn-ghost{display:inline-flex;align-items:center;justify-content:center;padding:12px 22px;border-radius:999px;border:1px solid #E1E6F2;color:var(--navy);font-size:16px;font-weight:700;white-space:nowrap;transition:background .2s ease,border-color .2s ease}
.btn-ghost:hover{background:#F7F8FB;border-color:#C9D2E8}
.btn-out{display:inline-flex;align-items:center;justify-content:center;padding:13px 30px;border-radius:999px;border:1px solid var(--coral);background:#fff;color:var(--coral);font-size:16px;font-weight:700;white-space:nowrap;transition:background .2s}
.btn-out:hover{background:var(--soft)}
.burger{display:none;width:46px;height:46px;border-radius:12px;border:1px solid #EFE9EA;background:#fff;color:var(--navy);font-size:20px;line-height:1;cursor:pointer;align-items:center;justify-content:center}
.mnav{display:none;border-top:1px solid #F4F1F2;background:#fff;padding:12px 30px 22px;max-height:78vh;overflow-y:auto}
.mnav>a,.mnav-h{display:block;padding:15px 2px;font-size:18px;font-weight:700;color:var(--navy);border-bottom:1px solid #F6F3F4}
.mnav>a.sub{padding:12px 2px 12px 16px;font-size:16px;font-weight:400;color:#4A5878;border-bottom-color:#F9F7F8}
.mnav-btns{margin-top:20px;display:flex;gap:10px}
.mnav-btns a{flex:1;padding:15px;font-size:17px}
.foot{margin-top:50px;padding:42px 30px 36px;background:#fff;line-height:normal}
.foot-in{max-width:1280px;margin:0 auto}
.foot-top{display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px}
.arc{position:relative;width:100%;max-width:720px;height:170px;margin-bottom:6px}
.arc svg{position:absolute;inset:0;width:100%;height:100%}
.arc-i{position:absolute;transform:translateX(-50%);border-radius:50%;background:#fff;box-shadow:0 8px 20px rgba(11,29,58,.08);display:flex;align-items:center;justify-content:center;transition:transform .3s cubic-bezier(.2,.7,.3,1.4),box-shadow .3s ease}
.arc-home{background:radial-gradient(circle,#FCEEEF 0%,#FBDEE0 70%);box-shadow:0 0 40px rgba(249,97,103,.35),0 10px 24px rgba(11,29,58,.12)}
.arc-i:hover{transform:translateX(-50%) translateY(-8px) scale(1.08);box-shadow:0 16px 34px rgba(249,97,103,.32)}
.foot-logo{height:44px;width:auto;margin:-34px auto 0}
.foot-top p{max-width:520px;margin:0 auto;font-size:16px;line-height:1.6;color:#4A5878}
.foot-btns{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
.foot-btns .btn{padding:13px 30px}
.foot-rule{height:1px;background:var(--line);margin:36px 0 28px}
.fcols{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:32px}
.fcol-t{font-size:17px;font-weight:700;color:var(--navy)}
.fcols ul{margin:18px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:13px}
.fcols li{font-size:16px;color:var(--muted)}
.fcols li a:hover{color:var(--coral)}
.socials{margin-top:20px;display:flex;gap:10px}
.socials a{width:36px;height:36px;border-radius:50%;background:var(--navy);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:15px;transition:transform .25s ease,background .25s ease}
.socials a:hover{background:var(--coral);transform:translateY(-3px)}
.copy{margin-top:28px;padding-top:32px;border-top:1px solid var(--line);text-align:center;font-size:15px;color:#8A93A8}
@media (max-width:959px){.nav,.top-r .btn,.top-r .btn-ghost{display:none}.burger{display:flex}.top.open .mnav{display:block}}
@media (max-width:760px){.foot{padding-left:18px;padding-right:18px}}
@media (max-width:480px){.foot{padding-left:14px;padding-right:14px}}
@media (max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lead{grid-template-columns:1fr;gap:6px}.lead-txt{padding:8px}.hero-grid{grid-template-columns:1fr}}
@media (max-width:640px){.wrap{padding:0 16px}.grid{grid-template-columns:1fr}.hero{padding-top:28px}.cta{flex-direction:column;align-items:flex-start;padding:26px 22px}.prose{font-size:17.5px}.prose h2{font-size:25px}.prose h3{font-size:21px}}
`;
