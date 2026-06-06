(function () {
  var cleanupKey = "animeclub-sw-cleanup-20260606-css-csp";

  function markCleaned() {
    try {
      window.sessionStorage.setItem(cleanupKey, "1");
    } catch (error) {
      // Storage can be unavailable in private modes; cleanup should still run.
    }
  }

  function wasCleaned() {
    try {
      return window.sessionStorage.getItem(cleanupKey) === "1";
    } catch (error) {
      return false;
    }
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  var alreadyCleaned = wasCleaned();

  navigator.serviceWorker.getRegistrations()
    .then(function (registrations) {
      if (!registrations.length) {
        return false;
      }

      markCleaned();

      var unregisters = registrations.map(function (registration) {
        return registration.unregister();
      });

      var cacheCleanup = "caches" in window
        ? window.caches.keys().then(function (cacheNames) {
          return Promise.all(cacheNames.map(function (cacheName) {
            return window.caches.delete(cacheName);
          }));
        })
        : Promise.resolve();

      return Promise.all(unregisters.concat([cacheCleanup])).then(function () {
        return true;
      });
    })
    .then(function (didClean) {
      if (didClean && !alreadyCleaned) {
        window.location.reload();
      }
    })
    .catch(function () {
      // A cleanup failure must never block the application boot.
    });
})();
