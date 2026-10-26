const cms = require("../_lib/cms");

// POST { filename, contentType, data } where data is base64 (the admin page
// resizes images in the browser first, so bodies stay well under Vercel's 4.5 MB).
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!cms.requireAdmin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { filename, contentType, data } = req.body || {};
  if (!data || typeof data !== "string") return res.status(400).json({ error: "No image received." });
  const buffer = Buffer.from(data.replace(/^data:[^,]+,/, ""), "base64");
  if (buffer.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Image is too large (max 4 MB)." });

  try {
    const url = await cms.saveImage(filename, contentType, buffer);
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
