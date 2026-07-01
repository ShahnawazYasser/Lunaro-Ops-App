"use client";

import { useEffect } from "react";

// Registered only in production — running it in dev would cache
// fast-changing dev-server chunks and fight with hot reload.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app works fully without the service worker,
      // it just loses the fast-repeat-load benefit.
    });
  }, []);

  return null;
}
