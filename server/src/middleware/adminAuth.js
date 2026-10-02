const crypto = require("crypto");

// Admin auth is a bearer token in the Authorization header, NOT a cookie.
// This app's client and API live on two different onrender.com subdomains
// (different "sites" to a browser), and cookies between different sites are
// exactly what Safari/iOS blocks by default via Intelligent Tracking
// Prevention — that's what made admin login unreliable on iPhone. A token
// read from a plain request header has no such restriction in any browser,
// so this sidesteps the problem entirely rather than depending on getting
// same-origin proxying/cookie flags exactly right.
//
// The token itself is stateless (HMAC-signed "<expiry>.<signature>"), not a
// lookup key into server-side storage — so, like the cookie-session swap
// that preceded this, there's nothing for a Render free-tier cold-start
// restart to lose. The client stores it in localStorage and sends it as
// `Authorization: Bearer <token>`.

const TOKEN_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours, same lifetime as the old session cookie

function secret() {
  return process.env.SESSION_SECRET || "change-me-in-.env";
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password || "", expected);
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function createAdminToken() {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [kind, expiresStr, signature] = parts;
  const payload = `${kind}.${expiresStr}`;
  const expected = sign(payload);
  if (!timingSafeEqual(signature, expected)) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return kind === "admin";
}

function getBearerToken(req) {
  const header = req.headers["authorization"] || "";
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

function requireAdmin(req, res, next) {
  if (verifyAdminToken(getBearerToken(req))) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

module.exports = { checkPassword, createAdminToken, verifyAdminToken, getBearerToken, requireAdmin };
