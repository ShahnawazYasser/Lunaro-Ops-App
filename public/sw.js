// Lunaro Ops service worker — app shell caching ONLY.
//
// Scope, deliberately narrow:
//   - Cache-first for the immutable, content-hashed Next.js build output
//     (/_next/static/*) and the small set of static public assets (icons,
//     manifest, favicon) from PWA Part 1. These never change for a given
//     deployment, so cache-first is safe and makes repeat loads instant.
//   - Every other request (every /api/* route, every page navigation) is
//     left completely untouched — no interception, no caching, no offline
//     fallback. This app's data (attendance, revenue, reimbursements) must
//     always come from the network. Do not add caching for API routes or
//     HTML documents here, even if it looks like a natural next step.

const SHELL_CACHE = "lunaro-shell-v1";

const STATIC_SHELL_PATHS = new Set([
  "/manifest.json",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes — always hit the network, never cached.
  if (url.pathname.startsWith("/api/")) return;

  const isShellAsset =
    url.pathname.startsWith("/_next/static/") ||
    req.destination === "script" ||
    req.destination === "style" ||
    req.destination === "font" ||
    STATIC_SHELL_PATHS.has(url.pathname);

  // Anything that isn't a known shell asset (page navigations, etc.) is
  // left alone — no respondWith, so the browser handles it normally.
  if (!isShellAsset) return;

  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});
