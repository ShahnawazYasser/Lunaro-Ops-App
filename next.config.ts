import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows dev-server HMR requests from this LAN IP (e.g. testing on a
  // phone/another machine against `npm run dev` on the local network).
  // Dev-only — has no effect on production builds.
  allowedDevOrigins: ["10.133.131.21"],

  // The service worker script itself must never be long-cached by the
  // browser, or updates to its caching logic would never reach devices.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
