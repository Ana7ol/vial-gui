/*! Based on coi-serviceworker by Guido Zuidhof and contributors, MIT License. */
if (typeof window === "undefined") {
  self.addEventListener("install", function () {
    self.skipWaiting();
  });

  self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
  });

  self.addEventListener("fetch", function (event) {
    var request = event.request;
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
      return;
    }

    event.respondWith(fetch(request).then(function (response) {
      if (response.status === 0) {
        return response;
      }

      var headers = new Headers(response.headers);
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
    }));
  });
} else if (!window.crossOriginIsolated && window.isSecureContext && navigator.serviceWorker) {
  navigator.serviceWorker.register(document.currentScript.src).then(function (registration) {
    if (registration.active && !navigator.serviceWorker.controller) {
      window.location.reload();
      return;
    }

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      window.location.reload();
    }, { once: true });
  });
}
