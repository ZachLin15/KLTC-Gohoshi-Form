require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");

const publicRoutes = require("./routes/public");
const adminRoutes = require("./routes/admin");
const { init } = require("./db");
const { seedIfEmpty } = require("./db/seed");

const app = express();
const PORT = process.env.PORT || 4000;
const IS_PROD = process.env.NODE_ENV === "production";
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

app.set("trust proxy", 1); // Render sits behind a proxy; needed for secure cookies

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin/non-browser requests (no Origin header) and any listed origin
      if (!origin || CLIENT_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    name: "kltc.sid",
    secret: process.env.SESSION_SECRET || "change-me-in-.env",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // cross-domain cookies (client and server on different Render URLs) require
      // SameSite=None + Secure in production; localhost dev keeps the simpler "lax"
      sameSite: IS_PROD ? "none" : "lax",
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

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
