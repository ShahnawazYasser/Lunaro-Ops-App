import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Next.js injects inline bootstrap scripts, so
// script-src needs 'unsafe-inline' (no nonce setup). In `next dev` only,
// React Refresh also needs 'unsafe-eval' and the HMR websocket.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://ybovehabxjjomurhqnlm.supabase.co",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Allows dev-server HMR requests from other machines on the LAN (e.g.
  // testing on a phone). Comma-separated hosts in ALLOWED_DEV_ORIGINS;
  // dev-only, no effect on production builds.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker script itself must never be long-cached by the
      // browser, or updates to its caching logic would never reach devices.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
