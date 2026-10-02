require("dotenv").config();
const express = require("express");
const cors = require("cors");

const publicRoutes = require("./routes/public");
const adminRoutes = require("./routes/admin");
const { init } = require("./db");
const { seedIfEmpty } = require("./db/seed");

const app = express();
const PORT = process.env.PORT || 4000;
// comma-separated list of allowed origins, e.g. "https://kltc.onrender.com,https://kltc-signup.org"
// CLIENT_HOST is set by render.yaml (via fromService) to the client's bare
// onrender.com subdomain; CLIENT_ORIGIN (a full URL) takes precedence if set.
const CLIENT_ORIGINS = (
  process.env.CLIENT_ORIGIN ||
  (process.env.CLIENT_HOST ? `https://${process.env.CLIENT_HOST}.onrender.com` : "http://localhost:5173")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.set("trust proxy", 1); // Render sits behind a proxy

// No cookies anywhere in this app — admin auth is a bearer token in the
// Authorization header (see middleware/adminAuth.js), specifically so it
// doesn't depend on same-origin or on Safari/iOS allowing a cross-site
// cookie. So CORS here doesn't need `credentials: true` either; it just
// needs to allow the client's origin to call a cross-origin API at all.
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin/non-browser requests (no Origin header) and any listed origin
      if (!origin || CLIENT_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

(async () => {
  await init(); // creates tables if they don't exist yet
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`KLTC signup server listening on http://localhost:${PORT}`);
  });
})().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
