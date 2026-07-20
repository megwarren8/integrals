/*
 * Service worker for the Integrals student book.
 * Ported 2026-07-16 from the probmat engine (load-speed plan Phase 2).
 *
 * THIS FILE IS A TEMPLATE, NOT THE DEPLOYED ARTIFACT. publish_public.js
 * replaces the BOOK_HASH marker below with the SHA-256 (first 16 hex chars)
 * of the freshly built book, the same value the chat worker stamps into its
 * ETag, then writes the stamped copy to the public repo root as sw.js.
 *
 * What it does: on install, pre-cache the book at "/" into a cache named
 * after the current build's hash; on activate, delete every older book
 * cache; on fetch, serve the book navigation cache-first so a repeat visit
 * costs ~0 bytes and the live URL works offline after one successful visit.
 *
 * Freshness comes from the update cycle itself: every deploy changes the
 * stamped hash, so this file's bytes change, the browser installs the new
 * worker in the background and pre-caches the new book.
 *
 * Update takeover (added 2026-07-20): self.skipWaiting() below fires on
 * install so a newly installed worker does not wait for every open tab of
 * the OLD worker to close first, and self.clients.claim() on activate hands
 * this tab to the new worker right away instead of waiting for the next
 * full navigation. Neither of those changes what is already rendered in
 * this tab's memory, so book.src.html listens for the resulting
 * "controllerchange" event and shows an explicit "Updated, refresh to see
 * the latest" toast rather than reloading anything on its own; a reader
 * mid-scroll is never yanked out from under themselves. A first-ever visit
 * (no prior controller) never shows that toast. This replaces the old
 * "no skipWaiting on purpose, new build takes over on the next visit"
 * design: that one-visit lag was silent and had no user-visible signal, so
 * a reader with a long-lived tab open (or a browser that deferred checking
 * for updates) could sit on stale content indefinitely with no way to know.
 *
 * Deliberately never touched: anything under /api/ (the AI TA chat must
 * always hit the network), cross-origin requests (including the TA status
 * check against integrals-ta-settings.megan-warren.com), and non-GET methods.
 * Every branch falls back to a plain fetch, so a SW failure can only ever
 * degrade to today's behavior, never below it.
 *
 * This file never runs on file:// (service workers do not exist there) and
 * is not part of the built book; the book renders fully with zero network
 * whether or not this worker ever installs.
 */
var BOOK_HASH = "a3dbd3c9bbb3751b";
var CACHE_NAME = "book-" + BOOK_HASH;
var BOOK_PATHS = ["/", "/index.html", "/Integrals.html"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(function (cache) {
        /* cache.add fetches "/" through the network (and through the chat
           worker, so the stored copy carries the matching ETag). If this
           fetch fails, install fails and the old worker plus plain network
           behavior stay in charge; nothing breaks. */
        return cache.add("/");
      }),
      self.skipWaiting()
    ])
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      caches.keys().then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k.indexOf("book-") === 0 && k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return;
  /* Only the book document itself is served cache-first. Everything else
     (og-image, robots.txt, anything future) falls through untouched to the
     network, exactly as if this worker did not exist. */
  if (BOOK_PATHS.indexOf(url.pathname) < 0) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match("/").then(function (hit) {
        return hit || fetch(request);
      });
    }).catch(function () {
      return fetch(request);
    })
  );
});
