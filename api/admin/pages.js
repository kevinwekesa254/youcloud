const cms = require("../_lib/cms");

// Edits to the main site's pages, made in /admin → Pages and applied in the
// browser by /site-content.js. Per page:
//   seo     { title, description }       replaces the page's built-in title and meta description
//   text    { "original text": "new" }   swaps matching text inside the page's <main>
//   images  { "img/x.jpg": { src, alt } } swaps an image and/or its alt text
//
// GET → { content }   POST { page, data } → { content } (empty data clears the page)

const MAX_ITEMS = 400;
const MAX_TEXT = 2000;
const clean = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
// Uploaded images (Blob URLs), local uploads in dev, or the site's own img/ files.
const SAFE_SRC = /^(https:\/\/[^\s"'<>()]+|\/[^\s"'<>()]*|img\/[^\s"'<>()]+)$/;

function cleanPage(input) {
  const out = {};
  const seo = input.seo || {};
  const title = clean(seo.title, 120), description = clean(seo.description, 320);
  if (title || description) out.seo = { title, description };

  const text = {};
  for (const [from, to] of Object.entries(input.text || {}).slice(0, MAX_ITEMS)) {
    const k = clean(from, MAX_TEXT), v = clean(to, MAX_TEXT);
    if (k && v && k !== v) text[k] = v;
  }
  if (Object.keys(text).length) out.text = text;

  const images = {};
  for (const [from, ov] of Object.entries(input.images || {}).slice(0, MAX_ITEMS)) {
    const k = clean(from, 600);
    const src = clean(ov && ov.src, 600), alt = clean(ov && ov.alt, 200);
    if (!k || (src && !SAFE_SRC.test(src))) continue;
    if (src || alt) images[k] = { src, alt };
  }
  if (Object.keys(images).length) out.images = images;
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!cms.requireAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ content: await cms.getSiteContent() });
    }

    if (req.method === "POST") {
      const page = String((req.body && req.body.page) || "");
      if (!/^[a-z0-9-]{1,40}$/.test(page)) return res.status(400).json({ error: "Unknown page." });
      const content = await cms.getSiteContent();
      content.pages = content.pages || {};
      const data = cleanPage((req.body && req.body.data) || {});
      if (Object.keys(data).length) content.pages[page] = { ...data, updatedAt: new Date().toISOString() };
      else delete content.pages[page];
      content.updatedAt = new Date().toISOString();
      await cms.saveSiteContent(content);
      return res.status(200).json({ content });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    const hint = cms.USE_BLOB ? "" : " (no Blob store connected; saving locally)";
    return res.status(500).json({ error: "Could not save: " + e.message + hint });
  }
};
