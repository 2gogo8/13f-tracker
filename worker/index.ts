/// <reference lib="webworker" />

// Force NetworkOnly for auth and admin-sensitive routes.
// This listener is prepended to the generated service worker, so it runs
// before Workbox routing. The first respondWith() call wins, which means
// these routes are always fetched live from the network and never cached.
self.addEventListener("fetch", (event) => {
  const e = event as FetchEvent;
  const url = new URL(e.request.url);
  const pathname = url.pathname;

  // Routes that must NEVER be cached:
  const isAuthRoute =
    pathname.startsWith("/api/auth/") ||   // NextAuth session, callback, csrf, signout
    pathname === "/login" ||               // Login page
    pathname.startsWith("/experts") ||     // Auth-gated admin page
    pathname === "/api/admin/whoami";      // Admin identity check

  if (isAuthRoute) {
    e.respondWith(fetch(e.request));
  }
});
