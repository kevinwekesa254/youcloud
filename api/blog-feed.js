// /blog-sitemap.xml (sitemap of published articles) and /blog/feed.xml (RSS),
// both rewritten here by vercel.json; ?type=rss selects the feed.

const cms = require("./_lib/cms");
const { SITE_URL, escapeHtml: esc } = cms;

module.exports = async (req, res) => {
  const posts = await cms.getPublishedPosts();
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");

  if ((req.query || {}).type === "rss") {
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>youcloud Blog</title>
  <link>${SITE_URL}/blog</link>
  <description>Guides, product news and merchant stories from youcloud.</description>
  <language>en</language>
  <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
${posts.slice(0, 30).map(p => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE_URL}/blog/${esc(p.slug)}</link>
    <guid isPermaLink="true">${SITE_URL}/blog/${esc(p.slug)}</guid>
    <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
    ${p.category ? `<category>${esc(p.category)}</category>` : ""}
    <description>${esc(p.metaDescription || p.excerpt || cms.stripTags(p.content).slice(0, 300))}</description>
  </item>`).join("\n")}
</channel>
</rss>`);
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  const latest = posts[0] ? (posts[0].updatedAt || posts[0].publishedAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/blog</loc><lastmod>${latest}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>
${posts.map(p => `  <url><loc>${SITE_URL}/blog/${esc(p.slug)}</loc><lastmod>${(p.updatedAt || p.publishedAt).slice(0, 10)}</lastmod><priority>0.6</priority></url>`).join("\n")}
</urlset>`);
};
