/* =====================================================================
   sw.js — der Service Worker. Er legt die App beim ersten Start vollständig
   in einen Cache, damit sie auch ohne Netz startet. Ohne ihn entscheidet
   allein der Browser-Cache darüber — im Funkloch kann die App dann leer
   bleiben, und das ausgerechnet morgens im Bad.

   Die Strategie ist bewusst die einfachste, die nicht kaputtgehen kann:
   **ein versionierter Satz, der komplett ausgetauscht wird.** Beim
   Installieren wird alles aus `ASSETS` frisch geholt; erst wenn das
   vollständig geklappt hat, übernimmt die neue Fassung und die alte wird
   weggeworfen. Ausgeliefert wird danach nur noch aus dem Cache. Dadurch
   passen Markup, CSS und Module immer zueinander — es kann nie ein neues
   index.html auf altes JavaScript treffen.

   ─────────────────────────────────────────────────────────────────────
   ZWEI DINGE BEIM VERÖFFENTLICHEN, SONST MERKT NIEMAND ETWAS VON DER
   ÄNDERUNG:

     1. `VERSION` hochzählen. Der Browser vergleicht diese Datei Byte für
        Byte; ohne neue Version installiert er nichts nach, und auf dem
        iPhone bleibt der alte Stand stehen.
     2. Neue Dateien in `ASSETS` eintragen. Was hier fehlt, ist offline
        nicht da. Die Installation bricht ab, wenn ein Eintrag nicht lädt —
        ein Tippfehler fällt dadurch sofort auf, statt still zu schaden.
   ───────────────────────────────────────────────────────────────────── */

const VERSION = 'zahnzeit-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/score.js',
  'js/today.js',
  'js/stats.js',
  'js/settings.js',
  'js/runner.js',
  'js/confetti.js',
  'js/model3d.js',
  'js/kai.js',
  'js/care.js',
  'js/ui.js',
  'three.module.min.js',
  'three.core.js',
  'zahn-2d.html',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png'
];

/* Jede Datei am Browser-Cache vorbei holen (`cache: 'reload'`). Sonst
   könnte beim ersten Einrichten ein Stand in den Offline-Satz wandern, den
   der Browser noch herumliegen hat — und der bliebe dann dauerhaft drin.
   Schlägt eine Datei fehl, scheitert die Installation als Ganzes und die
   bisherige Fassung bleibt in Betrieb; halbe Sätze gibt es nicht. */
async function precache(){
  const c = await caches.open(VERSION);
  await Promise.all(ASSETS.map(async url => {
    const res = await fetch(new Request(url, { cache: 'reload' }));
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    await c.put(url, res);
  }));
}

/* Nach dem Holen sofort übernehmen — auf ein freies Fenster zu warten
   hieße bei einer Homescreen-App womöglich tagelang warten. */
self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

/* Jede ältere Fassung wegräumen und die offenen Seiten übernehmen. */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      /* Was nachträglich dazukommt, wandert mit in den Cache — nur echte
         Antworten, keine Fehlerseiten und nichts von fremden Servern. */
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      /* Offline und nicht im Cache: Beim Aufrufen der Seite hilft das
         Gerüst weiter, alles andere muss scheitern dürfen. */
      if (req.mode === 'navigate'){
        const shell = await cache.match('./') || await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
