/* Service Worker – Sổ Cá Nhân
   - Lưu sẵn (precache) giao diện để mở được khi không có mạng
   - Trang & tài nguyên cùng nguồn: dùng bản trong bộ nhớ đệm ngay, cập nhật nền khi có mạng
   - Phông chữ Google: lưu lại sau lần tải đầu
   - Không can thiệp yêu cầu đồng bộ (POST) – dữ liệu do IndexedDB + hàng đợi đồng bộ đảm nhận */
const VERSION = 'scn-v1.0.0';
const SHELL = VERSION + '-shell', RUNTIME = VERSION + '-rt', FONTS = 'scn-fonts';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.registration.active ? null : self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== RUNTIME && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

function fromNetAndStore(req, cacheName) {
  return fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(cacheName).then(c => c.put(req, cp)); } return res; });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Phông chữ Google: cache-first
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fromNetAndStore(req, FONTS).catch(() => new Response('', { status: 504 }))));
    return;
  }
  if (url.origin !== location.origin) return; // máy chủ đồng bộ & nguồn khác: để trình duyệt tự xử lý
  if (url.pathname.endsWith('/sw.js')) return;
  // Mở trang: trả bản đã lưu ngay (chạy offline), đồng thời cập nhật nền
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { ignoreSearch: true }).then(hit => {
      const net = fromNetAndStore(new Request('./index.html', { cache: 'no-cache' }), SHELL).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return net.then(r => r || new Response('<h1>Không có kết nối</h1><p>Hãy mở ứng dụng một lần khi có mạng.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    }));
    return;
  }
  // Tài nguyên cùng nguồn: stale-while-revalidate
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fromNetAndStore(req, hit ? SHELL : RUNTIME).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return net.then(r => r || new Response('', { status: 504 }));
  }));
});
