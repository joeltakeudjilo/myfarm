const CACHE = "suivi-bandes-v2";
const COQUILLE = [
    "/", "/index.html", "/manifest.webmanifest",
    "/pwa-192x192.png", "/pwa-512x512.png", "/favicon.svg",
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(COQUILLE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys()
            .then((cles) =>
                Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    // Firebase et Google passent par leur propre SDK : on n'y touche pas
    if (url.origin !== self.location.origin) return;

    // Ouverture de l'app : on sert tout de suite la copie locale,
    // et on la met à jour en arrière-plan si le réseau répond
    if (req.mode === "navigate") {
        e.respondWith(
            caches.match("/index.html").then((copie) => {
                const reseau = fetch(req)
                    .then((res) => {
                        if (res.ok) {
                            const c = res.clone();
                            caches.open(CACHE).then((cache) => cache.put("/index.html", c));
                        }
                        return res;
                    })
                    .catch(() => copie);
                return copie || reseau;
            })
        );
        return;
    }

    // Fichiers de l'app : copie locale d'abord, sinon réseau puis mise en cache
    e.respondWith(
        caches.match(req).then(
            (trouve) =>
                trouve ||
                fetch(req).then((res) => {
                    if (res.ok) {
                        const c = res.clone();
                        caches.open(CACHE).then((cache) => cache.put(req, c));
                    }
                    return res;
                })
        )
    );
});