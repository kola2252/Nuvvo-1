/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "527aae8d10257b57f7e2c89d8aefdc66"
  }, {
    "url": "pwa-512x512.png",
    "revision": "c0b2d884059b7fe8c0c8ce59f3999371"
  }, {
    "url": "pwa-192x192.png",
    "revision": "2df7ba1a496b732e9ade48e1bc0f47fc"
  }, {
    "url": "nuvvo-logo.png",
    "revision": "6edb0c90159a775de1c0f72d1ce84e79"
  }, {
    "url": "index.html",
    "revision": "b5a3e56548faa3585dc8c71cee9d0b8a"
  }, {
    "url": "icon.svg",
    "revision": "df54dbf26b03d7a69aa355b6b3d70bd3"
  }, {
    "url": "favicon.png",
    "revision": "aad3622b6d55cde2f4dd8316076ad92b"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "cff22024542717948077f5673930568c"
  }, {
    "url": "assets/vendor-supabase-CzkH_J5w.js",
    "revision": null
  }, {
    "url": "assets/vendor-recharts-CePjGGHw.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-pbUBPwhF.js",
    "revision": null
  }, {
    "url": "assets/vendor-motion-DTROb1VG.js",
    "revision": null
  }, {
    "url": "assets/purify.es-Csrj9YNg.js",
    "revision": null
  }, {
    "url": "assets/payoutInvoiceGenerator-Dpe5SrK1.js",
    "revision": null
  }, {
    "url": "assets/orderInvoiceGenerator-DhuMrLRZ.js",
    "revision": null
  }, {
    "url": "assets/jspdf.es.min-BHEv8HAX.js",
    "revision": null
  }, {
    "url": "assets/index.es-D6gCsM-_.js",
    "revision": null
  }, {
    "url": "assets/index-DkXbqapy.js",
    "revision": null
  }, {
    "url": "assets/index-CeBskwAe.css",
    "revision": null
  }, {
    "url": "assets/html2canvas.esm-B0tyYwQk.js",
    "revision": null
  }, {
    "url": "assets/browser-CXCQpKXR.js",
    "revision": null
  }, {
    "url": "assets/TrackingScreen-DzrOFOvF.js",
    "revision": null
  }, {
    "url": "assets/SuperAdminPanel-ap2PoiwL.js",
    "revision": null
  }, {
    "url": "assets/PartnerScreen-P-lYcejO.js",
    "revision": null
  }, {
    "url": "assets/OrderHistoryScreen-ysB-pQpa.js",
    "revision": null
  }, {
    "url": "assets/FranchiseScreen-CbT-zrzB.js",
    "revision": null
  }, {
    "url": "assets/FoodDetails-CilmB6dw.js",
    "revision": null
  }, {
    "url": "assets/FavoritesScreen-I_48ObsS.js",
    "revision": null
  }, {
    "url": "assets/DeliveryOptionsScreen-Bq5JAxO2.js",
    "revision": null
  }, {
    "url": "assets/CartScreen-BZcqCH6I.js",
    "revision": null
  }, {
    "url": "assets/AdminPanel-ByjKRAO8.js",
    "revision": null
  }, {
    "url": "assets/AdminCatalogManager-B-qAi5Y4.js",
    "revision": null
  }, {
    "url": "assets/AccountScreen-DxGfMfgK.js",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-10-20_181745_1cab2153.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "cff22024542717948077f5673930568c"
  }, {
    "url": "favicon.png",
    "revision": "aad3622b6d55cde2f4dd8316076ad92b"
  }, {
    "url": "icon.svg",
    "revision": "df54dbf26b03d7a69aa355b6b3d70bd3"
  }, {
    "url": "pwa-192x192.png",
    "revision": "2df7ba1a496b732e9ade48e1bc0f47fc"
  }, {
    "url": "pwa-512x512.png",
    "revision": "c0b2d884059b7fe8c0c8ce59f3999371"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "527aae8d10257b57f7e2c89d8aefdc66"
  }, {
    "url": "manifest.webmanifest",
    "revision": "439bf809d7f52aa763f3e425691713ab"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/images\.unsplash\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "food-images-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-webfonts",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
