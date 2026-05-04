// Monad Terminal Service Worker
const CACHE = 'mon-v5';
const STATIC = [
  '/mon/',
  '/mon/style.css',
  '/mon/img/icon.svg',
  '/mon/img/mon_logo.png',
  '/mon/js/config.js',
  '/mon/js/chart.js',
  '/mon/js/rpc.js',
  '/mon/js/price.js',
  '/mon/js/chat.js',
  '/mon/js/stickers.js',
  '/mon/js/wallet.js',
  '/mon/js/trading.js',
  '/mon/js/holders.js',
  '/mon/js/effects.js',
  '/mon/js/devpanel.js',
  '/mon/js/revenue.js',
  '/mon/js/sync.js',
  '/mon/js/chess.js',
  '/mon/js/chess-match.js',
  '/mon/js/main.js',
  '/mon/js/pricealert.js',
  '/mon/js/pnl.js',
  '/mon/js/tutorial.js',
];

const BYPASS = [
  'supabase.co',
  'rpc.monad.xyz',
  'monad.drpc.org',
  'thirdweb.com',
  'dexscreener.com',
  'blockvision.org',
  '/api/',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  if(BYPASS.some(p => url.includes(p))) return;
  if(e.request.method !== 'GET') return;

  if(e.request.headers.get('accept')?.includes('text/html')){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res.ok){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
