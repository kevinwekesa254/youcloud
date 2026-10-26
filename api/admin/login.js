const cms = require("../_lib/cms");

// POST { password } → sets the session cookie. GET → { signedIn }.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ signedIn: cms.isAdmin(req), storage: cms.USE_BLOB ? "blob" : "local", blobVar: cms.TOKEN_ENV || null, blobNames: Object.keys(process.env).filter(k => /blob/i.test(k)) });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!cms.sameOrigin(req)) return res.status(403).json({ error: "Cross-site request blocked." });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server." });

  const password = req.body && req.body.password;
  if (!cms.checkPassword(password)) {
    // Slow down password guessing.
    await new Promise(r => setTimeout(r, 900));
    return res.status(401).json({ error: "That password is not right." });
  }
  res.setHeader("Set-Cookie", cms.sessionCookie(req));
  return res.status(200).json({ signedIn: true });
};
