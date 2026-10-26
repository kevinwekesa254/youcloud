// Local preview of the whole site, including the blog and /admin, without Vercel:
//   ADMIN_PASSWORD=pick-one node tools/dev-server.js      → http://localhost:3000
// Mirrors the vercel.json rewrites and gives api/ handlers the req/res helpers
// Vercel provides (req.query, req.body, res.status/json/send). Without
// BLOB_READ_WRITE_TOKEN, posts and images are stored in .cms-data/.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;

// Optional .env.local with KEY=value lines (same file `vercel env pull` writes).
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch (e) {}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain", ".woff2": "font/woff2"
};

function rewrite(pathname) {
  if (pathname === "/blog") return "/api/blog";
  if (pathname === "/blog/feed.xml") return "/api/blog-feed?type=rss";
  let m = /^\/blog\/([^/]+)$/.exec(pathname);
  if (m) return "/api/blog?slug=" + m[1];
  if (pathname === "/blog-sitemap.xml") return "/api/blog-feed";
  if (pathname === "/admin" || pathname === "/admin/") return "/admin/index.html";
  return null;
}

function staticFile(pathname) {
  const file = path.join(ROOT, decodeURIComponent(pathname));
  if (!file.startsWith(ROOT)) return null;
  try {
    if (fs.statSync(file).isFile()) return file;
  } catch (e) {}
  return null;
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

async function runApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  if (name.startsWith("_")) return send(res, 404, "text/plain", "Not found");
  const file = path.join(ROOT, "api", name + ".js");
  if (!file.startsWith(path.join(ROOT, "api")) || !fs.existsSync(file)) return send(res, 404, "text/plain", "Not found");

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  req.query = Object.fromEntries(url.searchParams);
  req.body = raw;
  if ((req.headers["content-type"] || "").includes("application/json")) {
    try { req.body = JSON.parse(raw || "{}"); } catch (e) { return send(res, 400, "text/plain", "Bad JSON"); }
  }
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  res.send = (body) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(body); return res; };

  delete require.cache[require.resolve(file)];
  try {
    await require(file)(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, "text/plain", "Server error: " + e.message);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  const target = rewrite(url.pathname);
  if (target) {
    const t = new URL(target, url);
    for (const [k, v] of url.searchParams) if (!t.searchParams.has(k)) t.searchParams.set(k, v);
    url.pathname = t.pathname;
    url.search = t.search;
  }
  if (url.pathname.startsWith("/api/")) return runApi(req, res, url);
  if (url.pathname.startsWith("/cms-uploads/")) {
    const file = path.join(ROOT, ".cms-data", "uploads", path.basename(url.pathname));
    if (fs.existsSync(file)) return send(res, 200, TYPES[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
    return send(res, 404, "text/plain", "Not found");
  }
  const file = staticFile(url.pathname) || (url.pathname.startsWith("/admin") ? null : path.join(ROOT, "index.html"));
  if (!file) return send(res, 404, "text/plain", "Not found");
  send(res, 200, TYPES[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
}).listen(PORT, () => {
  console.log(`youcloud site on http://localhost:${PORT}  (blog: /blog, admin: /admin)`);
  if (!process.env.ADMIN_PASSWORD) console.log("Set ADMIN_PASSWORD to sign in to /admin.");
  console.log(process.env.BLOB_READ_WRITE_TOKEN ? "Storage: Vercel Blob" : "Storage: local .cms-data/");
});
