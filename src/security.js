const {
  randomBytes,
  timingSafeEqual,
  createHmac,
  createHash,
} = require("node:crypto");
const token = () => randomBytes(32).toString("hex");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) =>
  createHmac("sha256", key).update(value).digest("hex");
function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim().split("="))
      .filter((x) => x.length === 2),
  );
}
// TLS may terminate at a reverse proxy before proxy/IP trust is configured.
// Match the browser authority, never arbitrary forwarding headers; CSRF is still mandatory.
function allowedOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
      return false;
    if (req.secure && url.protocol !== "https:") return false;
    return url.host === new URL(`${url.protocol}//${req.get("host")}`).host;
  } catch {
    return false;
  }
}
function secureRequest(req) {
  return (
    req.secure ||
    (allowedOrigin(req) && Boolean(req.get("origin")?.startsWith("https://")))
  );
}
function safeHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
  });
  next();
}
function errors(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error("Request failed:", err.code || err.name);
  res.status(status).json({
    error: status >= 500 ? "服务器暂时无法完成操作，请稍后重试。" : err.message,
  });
}
function problem(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
module.exports = {
  allowedOrigin,
  secureRequest,
  token,
  digest,
  hmac,
  equal,
  cookies,
  safeHeaders,
  errors,
  problem,
};
