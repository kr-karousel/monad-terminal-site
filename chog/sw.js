// CHOG Terminal Service Worker
const CACHE = 'chog-v5';
const STATIC = [
  '/chog/',
  '/chog/style.css',
  '/chog/img/icon.svg',
  '/chog/js/config.js',
  '/chog/js/chart.js',
  '/chog/js/rpc.js',
  '/chog/js/price.js',
  '/chog/js/chat.js',
  '/chog/js/stickers.js',
  '/chog/js/wallet.js',
  '/chog/js/trading.js',
  '/chog/js/holders.js',
  '/chog/js/effects.js',
  '/chog/js/devpanel.js',
  '/chog/js/revenue.js',
  '/chog/js/sync.js',
  '/chog/js/chess.js',
  '/chog/js/chess-match.js',
  '/chog/js/main.js',
  '/chog/js/pricealert.js',
  '/chog/js/pnl.js',
  '/chog/js/tutorial.js',
];

// 캐시 대상이 아닌 요청 패턴 (API, RPC, Supabase 등)
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

  // API/실시간 요청은 무조건 네트워크 통과
  if(BYPASS.some(p => url.includes(p))) return;
  // POST 요청은 통과
  if(e.request.method !== 'GET') return;

  // HTML: 네트워크 우선 → 실패 시 캐시 (업데이트 바로 반영)
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

  // 정적 자산: 캐시 우선 → 없으면 네트워크 후 캐시 저장
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
