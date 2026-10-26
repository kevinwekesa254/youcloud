const crypto = require("crypto");
const cms = require("../_lib/cms");

const TEXT_FIELDS = {
  title: 200, excerpt: 400, seoTitle: 120, metaDescription: 320, focusKeyphrase: 120,
  featuredImage: 600, featuredAlt: 200, author: 80, category: 60
};

// GET → { posts }   POST { post } → { post, posts }   DELETE ?id= → { posts }
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!cms.requireAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ posts: await cms.getAllPosts() });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      const posts = (await cms.getAllPosts()).filter(p => p.id !== id);
      await cms.savePosts(posts);
      return res.status(200).json({ posts });
    }

    if (req.method === "POST") {
      const input = (req.body && req.body.post) || {};
      const posts = await cms.getAllPosts();
      const existing = posts.find(p => p.id === input.id);
      const now = new Date().toISOString();

      const post = { id: existing ? existing.id : crypto.randomUUID() };
      for (const [k, max] of Object.entries(TEXT_FIELDS)) post[k] = String(input[k] || "").trim().slice(0, max);
      if (!post.title) return res.status(400).json({ error: "Give the post a title." });

      post.content = cms.sanitizeHtml(input.content);
      post.status = input.status === "published" ? "published" : "draft";
      const date = new Date(input.publishedAt || (existing && existing.publishedAt) || now);
      post.publishedAt = isNaN(date) ? now : date.toISOString();
      post.createdAt = existing ? existing.createdAt : now;
      post.updatedAt = now;
      post.seoScore = Number(input.seoScore) || 0;
      post.readabilityScore = Number(input.readabilityScore) || 0;

      // Unique slug: add -2, -3 ... if another post already uses it.
      let base = cms.slugify(input.slug || post.title) || "post";
      let slug = base;
      for (let n = 2; posts.some(p => p.slug === slug && p.id !== post.id); n++) slug = `${base}-${n}`;
      post.slug = slug;

      const next = existing ? posts.map(p => (p.id === post.id ? post : p)) : [post, ...posts];
      await cms.savePosts(next);
      return res.status(200).json({ post, posts: next });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    const hint = cms.USE_BLOB ? "" : " (no Blob store connected; saving locally)";
    return res.status(500).json({ error: "Could not save: " + e.message + hint });
  }
};
