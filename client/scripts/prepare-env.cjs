// Render's render.yaml sets API_HOST (via `fromService`) to the API
// service's bare onrender.com subdomain, e.g. "kltc-signup-api". This turns
// that into a full URL and writes it to .env.production, which Vite loads
// automatically during `vite build` — no shell string interpolation needed
// (Render's dockerCommand/buildCommand don't reliably support that).
const fs = require("fs");
const path = require("path");

const apiHost = process.env.API_HOST;

if (apiHost) {
  const url = `https://${apiHost}.onrender.com/api`;
  fs.writeFileSync(path.join(__dirname, "..", ".env.production"), `VITE_API_URL=${url}\n`);
  console.log(`Wrote .env.production with VITE_API_URL=${url}`);
} else {
  console.log("API_HOST not set — skipping .env.production (local/dev build).");
}
