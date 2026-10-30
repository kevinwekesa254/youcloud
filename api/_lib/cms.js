// Blog storage, admin sessions and HTML sanitising shared by the api/ functions.
//
// Posts live in Vercel Blob once a store is connected to the project: newer
// connections set BLOB_STORE_ID and authenticate through Vercel's OIDC token,
// older ones set BLOB_READ_WRITE_TOKEN. Without either, e.g. on a laptop running
// tools/dev-server.js, everything is kept in .cms-data/ instead.
//
// Two files are written on every save:
//   cms/posts-<random>.json   every post, drafts included. The random suffix keeps
//                              drafts unguessable; the admin finds it with list().
//   cms/public/posts.json     published posts only, read by the public blog pages
//                              at a fixed URL so page views cost no Blob operations.
//
// Page edits made in /admin → Pages (SEO titles, text and image swaps on the main
// site) are kept the same way: cms/site-<random>.json for the admin, and
// cms/public/site.json for /api/site-content, which the site reads on load.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SITE_URL = (process.env.SITE_URL || "https://www.youcloudpay.com").replace(/\/$/, "");
// Connecting a store may add a prefix to the variable (e.g. YOUCLOUD_BLOB_READ_WRITE_TOKEN).
const TOKEN_ENV = Object.keys(process.env).find(k => k === "BLOB_READ_WRITE_TOKEN") ||
  Object.keys(process.env).find(k => /BLOB_READ_WRITE_TOKEN$/.test(k));
const TOKEN = TOKEN_ENV ? process.env[TOKEN_ENV] : "";
const STORE_ID = process.env.BLOB_STORE_ID || "";
const USE_BLOB = !!(TOKEN || STORE_ID);
const LOCAL_DIR = path.join(__dirname, "..", "..", ".cms-data");
const PUBLIC_PATH = "cms/public/posts.json";
const PRIVATE_PREFIX = "cms/posts-";
const SITE_PUBLIC_PATH = "cms/public/site.json";
const SITE_PREFIX = "cms/site-";

function blob() {
  return require("@vercel/blob");
}

// The public URL of a fixed pathname in the connected store. Public blobs are
// served from https://<storeId>.public.blob.vercel-storage.com/<pathname>; the
// id comes from BLOB_STORE_ID (store_<id>) or the token (vercel_blob_rw_<id>_...).
function publicBlobUrl(pathname) {
  const m = /^vercel_blob_rw_([^_]+)_/.exec(TOKEN);
  const id = m ? m[1] : STORE_ID.replace(/^store_/, "");
  return id ? `https://${id.toLowerCase()}.public.blob.vercel-storage.com/${pathname}` : null;
}

// Passed to every Blob call: the token when there is one, otherwise nothing, so
// the library falls back to OIDC with BLOB_STORE_ID.
function auth(extra) {
  return TOKEN ? { ...extra, token: TOKEN } : extra;
}

function readLocal(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCAL_DIR, name), "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeLocal(name, data) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, name), JSON.stringify(data, null, 2));
}

// ── Posts ───────────────────────────────────────────────────────────────

async function getAllPosts() {
  if (!USE_BLOB) return readLocal("posts.json", []);
  const { list } = blob();
  const { blobs } = await list(auth({ prefix: PRIVATE_PREFIX }));
  if (!blobs.length) return [];
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const r = await fetch(blobs[0].url, { cache: "no-store" });
  if (!r.ok) throw new Error("Could not read posts (" + r.status + ")");
  return r.json();
}

function publishedOnly(posts) {
  const now = Date.now();
  return posts
    .filter(p => p.status === "published" && new Date(p.publishedAt).getTime() <= now)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function savePosts(posts) {
  // Scheduled posts are included so they appear once their date passes;
  // publishedOnly() filters them again at read time.
  const pub = posts.filter(p => p.status === "published");
  if (!USE_BLOB) {
    writeLocal("posts.json", posts);
    writeLocal("public-posts.json", pub);
    cache = null;
    return;
  }
  const { put, list, del } = blob();
  const saved = await put(PRIVATE_PREFIX.replace(/-$/, "") + ".json", JSON.stringify(posts), auth({
    access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 60
  }));
  await put(PUBLIC_PATH, JSON.stringify(pub), auth({
    access: "public", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json", cacheControlMaxAge: 60
  }));
  const { blobs } = await list(auth({ prefix: PRIVATE_PREFIX }));
  const old = blobs.filter(b => b.url !== saved.url).map(b => b.url);
  if (old.length) await del(old, auth({}));
  cache = null;
}

// Published posts for the public pages, kept in memory for 30s per instance.
let cache = null;
async function getPublishedPosts() {
  if (cache && Date.now() - cache.at < 30000) return publishedOnly(cache.posts);
  let posts;
  if (!USE_BLOB) {
    posts = readLocal("public-posts.json", []);
  } else {
    let url = publicBlobUrl(PUBLIC_PATH);
    let r = url ? await fetch(url) : null;
    if (!r || !r.ok) {
      // Fall back to looking the file up if the URL could not be derived.
      const { list } = blob();
      const { blobs } = await list(auth({ prefix: PUBLIC_PATH }));
      if (!blobs.length) return [];
      r = await fetch(blobs[0].url);
      if (!r.ok) return [];
    }
    posts = await r.json();
  }
  cache = { at: Date.now(), posts };
  return publishedOnly(posts);
}

// ── Page edits ──────────────────────────────────────────────────────────

const EMPTY_SITE = () => ({ pages: {} });

// Latest saved page edits, for the admin. Each save has a new URL, so this is never stale.
async function getSiteContent() {
  if (!USE_BLOB) return readLocal("site.json", EMPTY_SITE());
  const { list } = blob();
  const { blobs } = await list(auth({ prefix: SITE_PREFIX }));
  if (!blobs.length) return EMPTY_SITE();
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const r = await fetch(blobs[0].url, { cache: "no-store" });
  if (!r.ok) throw new Error("Could not read page edits (" + r.status + ")");
  return r.json();
}

async function saveSiteContent(content) {
  if (!USE_BLOB) {
    writeLocal("site.json", content);
    siteCache = null;
    return;
  }
  const { put, list, del } = blob();
  const body = JSON.stringify(content);
  const saved = await put(SITE_PREFIX.replace(/-$/, "") + ".json", body, auth({
    access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 60
  }));
  await put(SITE_PUBLIC_PATH, body, auth({
    access: "public", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json", cacheControlMaxAge: 60
  }));
  const { blobs } = await list(auth({ prefix: SITE_PREFIX }));
  const old = blobs.filter(b => b.url !== saved.url).map(b => b.url);
  if (old.length) await del(old, auth({}));
  siteCache = null;
}

// Page edits for the public site, kept in memory for 15s per instance. The query
// string skips the Blob CDN's own cache so a save shows up within seconds.
let siteCache = null;
async function getPublicSiteContent() {
  if (siteCache && Date.now() - siteCache.at < 15000) return siteCache.content;
  let content = EMPTY_SITE();
  if (!USE_BLOB) {
    content = readLocal("site.json", content);
  } else {
    const url = publicBlobUrl(SITE_PUBLIC_PATH);
    const r = url ? await fetch(url + "?t=" + Date.now()) : null;
    if (r && r.ok) content = await r.json();
    else if (!url) content = await getSiteContent();
  }
  siteCache = { at: Date.now(), content };
  return content;
}

// ── Images ──────────────────────────────────────────────────────────────

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function saveImage(filename, contentType, buffer, folder) {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw new Error("Only JPG, PNG, WebP or GIF images can be uploaded.");
  const base = slugify(String(filename || "image").replace(/\.[a-z0-9]+$/i, "")) || "image";
  if (!USE_BLOB) {
    const name = `${base}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.mkdirSync(path.join(LOCAL_DIR, "uploads"), { recursive: true });
    fs.writeFileSync(path.join(LOCAL_DIR, "uploads", name), buffer);
    return "/cms-uploads/" + name;
  }
  const { put } = blob();
  const r = await put(`${folder === "pages" ? "pages" : "blog"}/${base}.${ext}`, buffer, auth({ access: "public", addRandomSuffix: true, contentType }));
  return r.url;
}

// ── Admin session ───────────────────────────────────────────────────────

const COOKIE = "yc_admin";
const SESSION_DAYS = 7;

// Signing key: ADMIN_SESSION_SECRET if set, otherwise derived from the password,
// so changing ADMIN_PASSWORD also signs everyone out.
function secret() {
  return process.env.ADMIN_SESSION_SECRET ||
    crypto.createHash("sha256").update("yc-cms:" + (process.env.ADMIN_PASSWORD || "")).digest("hex");
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && typeof pw === "string" && safeEqual(pw, real);
}

function sessionCookie(req) {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  const secure = isLocal(req) ? "" : " Secure;";
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const [exp, sig] = readCookie(req, COOKIE).split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}

function isLocal(req) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "");
}

// Rejects cross-site form posts: state-changing requests must come from this host.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

function requireAdmin(req, res) {
  if (!process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server." });
    return false;
  }
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Please sign in again." });
    return false;
  }
  if (req.method !== "GET" && !sameOrigin(req)) {
    res.status(403).json({ error: "Cross-site request blocked." });
    return false;
  }
  return true;
}

// ── Content helpers ─────────────────────────────────────────────────────

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const ALLOWED_TAGS = new Set([
  "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
  "blockquote", "pre", "code", "img", "span", "sub", "sup", "iframe", "figure", "figcaption", "hr"
]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "target", "rel", "class", "style", "width", "height", "allowfullscreen", "frameborder"]);
const VIDEO_HOSTS = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//;

// Keeps the markup the editor produces and drops everything else: scripts,
// event handlers, javascript: links and iframes other than YouTube/Vimeo.
function sanitizeHtml(html) {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|object|embed|form|textarea|select|button|svg|math)[\s\S]*?<\/\1\s*>/gi, "");
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name, attrs) => {
    name = name.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (tag.startsWith("</")) return `</${name}>`;
    const kept = [];
    attrs.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g, (m, an, av) => {
      an = an.toLowerCase();
      if (!ALLOWED_ATTRS.has(an)) return "";
      let v = av === undefined ? "" : av.replace(/^["']|["']$/g, "");
      if (an === "href" || an === "src") {
        const t = v.trim().toLowerCase();
        if (!/^(https?:|mailto:|tel:|\/|#)/.test(t)) return "";
        if (name === "iframe" && an === "src" && !VIDEO_HOSTS.test(v.trim())) return "";
      }
      if (an === "style") {
        if (/expression|url\s*\(|javascript:/i.test(v)) return "";
        // Only the editor's colour and alignment styles.
        v = v.split(";").filter(d => /^\s*(color|background-color|text-align)\s*:/i.test(d)).join(";");
        if (!v) return "";
      }
      kept.push(`${an}="${v.replace(/"/g, "&quot;")}"`);
      return "";
    });
    if (name === "iframe" && !kept.some(a => a.startsWith("src="))) return "";
    if (name === "a" && kept.some(a => a.startsWith('target="_blank"')) && !kept.some(a => a.startsWith("rel="))) {
      kept.push('rel="noopener noreferrer"');
    }
    return `<${name}${kept.length ? " " + kept.join(" ") : ""}>`;
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

module.exports = {
  SITE_URL, USE_BLOB,
  getAllPosts, getPublishedPosts, savePosts, saveImage,
  getSiteContent, saveSiteContent, getPublicSiteContent,
  checkPassword, sessionCookie, clearCookie, isAdmin, requireAdmin, sameOrigin,
  slugify, sanitizeHtml, escapeHtml, stripTags
};
