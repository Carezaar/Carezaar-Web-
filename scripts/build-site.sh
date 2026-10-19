#!/bin/bash
# Builds the combined site: the landing page at "/" and the web app at its own
# paths (/intro, /sign-in, /sign-up/:role, /main/...), served from app.html.
# Output: ./site-dist (local only; the public preview was revoked on 2026-09-27)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HERE"
LANDING="$HERE/website"
OUT="$HERE/site-dist"

# Share-image URLs stay relative until the site has its real public domain.
(cd "$APP" && npm run build)

rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$APP/dist/." "$OUT/"
rm -f "$OUT/_redirects"                      # Netlify rule; Vercel uses vercel.json below
mv "$OUT/index.html" "$OUT/app.html"         # the app's shell
for f in index.html styles.css main.js vendor; do
  if [ -e "$OUT/$f" ]; then echo "name clash: $f exists in the app build" >&2; exit 1; fi
  cp -R "$LANDING/$f" "$OUT/"
done

# Minify the landing's own script and stylesheet (the vendored GSAP files are minified).
"$APP/node_modules/.bin/esbuild" "$OUT/main.js" --minify --target=es2020 --allow-overwrite --outfile="$OUT/main.js" --log-level=warning
"$APP/node_modules/.bin/esbuild" "$OUT/styles.css" --minify --allow-overwrite --outfile="$OUT/styles.css" --log-level=warning

# Keep vendor sources intact while removing debug logging from shipped copies.
# Pure-call removal preserves argument side effects and leaves warnings/errors.
node - "$OUT/vendor" "$APP" <<'NODE'
const fs = require("fs"), path = require("path");
const { transformSync } = require(path.join(process.argv[3], "node_modules/esbuild"));
for (const name of fs.readdirSync(process.argv[2]).filter((name) => name.endsWith(".js"))) {
  const file = path.join(process.argv[2], name);
  const { code } = transformSync(fs.readFileSync(file, "utf8"), {
    minify: true, target: "es2020", legalComments: "inline",
    pure: ["console.log", "console.debug", "console.info"],
  });
  fs.writeFileSync(file, code);
}
NODE

# On the combined site the landing gets the app ready while the visitor reads:
# prefetch the app's code, and (when idle) warm its lookup-table cache via assets/warm.js.
[ -f "$OUT/assets/warm.js" ] || { echo "assets/warm.js missing from the app build" >&2; exit 1; }
node - "$OUT" <<'NODE'
const fs = require("fs"), path = require("path");
const out = process.argv[2];
const app = fs.readFileSync(path.join(out, "app.html"), "utf8");
const files = [...app.matchAll(/(?:src|href)="(\/assets\/index-[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
if (!files.length) throw new Error("no app entry assets found in app.html");
const links = files.map((f) => `  <link rel="prefetch" href="${f}" as="${f.endsWith(".css") ? "style" : "script"}" />`).join("\n");
const warm = `  <script>
    // Warm the app's lookup tables while the visitor reads (skipped on Save-Data).
    (function () {
      if (navigator.connection && navigator.connection.saveData) return;
      var go = function () { var s = document.createElement("script"); s.type = "module"; s.src = "/assets/warm.js"; document.head.appendChild(s); };
      "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 2500);
    })();
  </script>`;
const file = path.join(out, "index.html");
let html = fs.readFileSync(file, "utf8");
html = html.replace("</head>", `${links}\n</head>`).replace("</body>", `${warm}\n</body>`);
fs.writeFileSync(file, html);
console.log("landing: prefetch", files.join(", "), "+ cache warm-up");
NODE

# "/" is the landing page; every other path without a file extension is an app route.
# Vercel config: routing, caching and security headers. The CSP allows the landing's two
# inline scripts by hash, so the hashes are computed from the finished pages.
node - "$OUT" "$APP" <<'NODE'
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const out = process.argv[2];
const hashes = new Set();
for (const page of ["index.html", "app.html"]) {
  const html = fs.readFileSync(path.join(out, page), "utf8");
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) hashes.add(`'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
}
// Match Vite's .env/production precedence without allowing arbitrary CSP text.
import(require("url").pathToFileURL(path.join(process.argv[3], "node_modules/vite/dist/node/index.js")).href).then(({ loadEnv }) => {
const legalEnv = { ...loadEnv("production", process.argv[3], "VITE_"), ...process.env };
const legalOrigins = new Set();
for (const key of ["VITE_CAREZAAR_TERMS_OF_USE_URL", "VITE_CAREZAAR_PRIVACY_POLICY_URL"]) {
  const raw = legalEnv[key]?.trim();
  if (!raw) continue;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${key} must use HTTPS without credentials`);
  legalOrigins.add(url.origin);
}
const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' blob: https://new.carezaar.com ${[...legalOrigins].join(" ")}`.trim(),
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const security = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()" },
];
const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
const config = {
  cleanUrls: false,
  rewrites: [
    // Profile photos, proxied so the app can read the current photo and send it again on save.
    { source: "/uploads/:path*", destination: "https://new.carezaar.com/uploads/:path*" },
    { source: "/((?!assets/|app-assets/|scenes/|vendor/)[^.]+)", destination: "/app.html" },
  ],
  headers: [
    { source: "/(.*)", headers: security },
    // Vite's content-hashed chunks never change; other /assets files keep default caching.
    { source: "/assets/(index|LocationPicker|baseDataLoader)-(.*)", headers: immutable },
    { source: "/(app.html|index.html|main.js|styles.css)", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
  ],
};
fs.writeFileSync(path.join(out, "vercel.json"), JSON.stringify(config, null, 2) + "\n");
console.log(`vercel.json: CSP with ${hashes.size} inline-script hash(es)`);
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
NODE
echo "built $OUT"
