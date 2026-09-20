/* ==========================================================================
   PDF Çilingiri - Offline-First Service Worker
   GitHub Pages: https://vezirayzos.github.io/pdf-cilingiri-pwa/sw.js
   ========================================================================== */

const CACHE_NAME = "pdf-cilingiri-v5";

const ASSETS_TO_CACHE = [
  "https://pdfcilingiri.blogspot.com/",
  "https://pdfcilingiri2.blogspot.com/",
  "https://pdfcilingiri.blogspot.com/?m=1",
  "https://pdfcilingiri2.blogspot.com/?m=1",
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhLm4CTTS-1LIxqglkmlfnaoJwTTjhi4qctJjEhr434B8F3nvwoXvhNZbZyY9IbudP7Be8fIURWfCB6-1aPUxtwChupK07kH2utMK4pogj6Xo7Cx-hoE2c9t6NsGVhpId1tIc_qSGsyrDzaoOyurwb6zxf9tfm7Cq0tofU_A3qaFyRhJy3-Y7ReAuEy76gP/s192/site-icon.png",
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhLm4CTTS-1LIxqglkmlfnaoJwTTjhi4qctJjEhr434B8F3nvwoXvhNZbZyY9IbudP7Be8fIURWfCB6-1aPUxtwChupK07kH2utMK4pogj6Xo7Cx-hoE2c9t6NsGVhpId1tIc_qSGsyrDzaoOyurwb6zxf9tfm7Cq0tofU_A3qaFyRhJy3-Y7ReAuEy76gP/s512/site-icon.png",
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhLm4CTTS-1LIxqglkmlfnaoJwTTjhi4qctJjEhr434B8F3nvwoXvhNZbZyY9IbudP7Be8fIURWfCB6-1aPUxtwChupK07kH2utMK4pogj6Xo7Cx-hoE2c9t6NsGVhpId1tIc_qSGsyrDzaoOyurwb6zxf9tfm7Cq0tofU_A3qaFyRhJy3-Y7ReAuEy76gP/s32/site-icon.png",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"
];

// 1. Kurulum: Tüm çekirdek varlıkları ve Blogger App-Shell sayfalarını önbelleğe al
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { mode: "no-cors" })
            .then((res) => { if (res) return cache.put(url, res); })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Aktivasyon: Eski sürüm önbellekleri sil ve kontrolü derhal devral
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// 3. İstek Yakalama (Fetch): Çevrimdışı Kalkanı ve Dinamik Önbellek
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = req.url;

  // A. Sayfa Açılışları (HTML Navigasyon) - Tam Çevrimdışı Koruması
  if (req.mode === "navigate" || (req.headers.get("accept") && req.headers.get("accept").includes("text/html"))) {
    e.respondWith(
      fetch(req)
        .then((netRes) => {
          if (netRes && netRes.ok) {
            const copy = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return netRes;
        })
        .catch(async () => {
          // Önce tam eşleşme ara (arama parametrelerini yoksayarak: ?m=1 vs.)
          const exact = await caches.match(req, { ignoreSearch: true });
          if (exact) return exact;

          // Kayıtlı App-Shell sayfalarını tara
          const shellCandidates = [
            "https://pdfcilingiri.blogspot.com/",
            "https://pdfcilingiri2.blogspot.com/",
            "https://pdfcilingiri.blogspot.com/?m=1",
            "https://pdfcilingiri2.blogspot.com/?m=1"
          ];
          for (const sUrl of shellCandidates) {
            const hit = await caches.match(sUrl, { ignoreSearch: true });
            if (hit) return hit;
          }

          // Önbellekteki herhangi bir Blogger HTML yanıtını bul
          const cache = await caches.open(CACHE_NAME);
          const requests = await cache.keys();
          for (const r of requests) {
            if (r.url.includes("blogspot.com")) {
              const match = await cache.match(r);
              if (match) return match;
            }
          }

          return new Response("Çevrimdışı moddasınız. Lütfen internet varken sayfayı bir kez açın.", {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        })
    );
    return;
  }

  // B. Statik Dosyalar, CDN Paketleri ve İkonlar (Stale-While-Revalidate + Cache-First)
  const isCacheable = url.includes("cdnjs.cloudflare.com") ||
                      url.includes("cdn.jsdelivr.net") ||
                      url.includes("blogger.googleusercontent.com") ||
                      url.includes("docs.opencv.org");

  if (isCacheable) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const fetchPromise = fetch(req)
          .then((netRes) => {
            if (netRes && (netRes.ok || netRes.type === "opaque")) {
              const copy = netRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return netRes;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // C. Standart İstekler
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) =>
      cached || fetch(req).catch(() => caches.match("https://pdfcilingiri.blogspot.com/", { ignoreSearch: true }))
    )
  );
});
