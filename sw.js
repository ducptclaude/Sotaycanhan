/* Service Worker – Sổ Cá Nhân
   - Lưu sẵn (precache) giao diện để mở được khi không có mạng
   - Trang & tài nguyên cùng nguồn: dùng bản trong bộ nhớ đệm ngay, cập nhật nền khi có mạng
   - Phông chữ Google: lưu lại sau lần tải đầu
   - ĐỒNG BỘ QUA MÁY CHỦ (chạy cả khi đã đóng app):
       • Background Sync  (tag 'scn-sync')     : có mạng lại → tự gửi hàng đợi thay đổi lên máy chủ
       • Periodic Sync    (tag 'scn-periodic') : định kỳ kéo dữ liệu mới từ máy chủ (app đã cài, Chrome/Android)
       • Tin nhắn từ trang ({type:'scn-sync'}) : trang bàn giao việc đồng bộ khi bị ẩn/đóng
     Dùng chung IndexedDB 'so-ca-nhan' với trang (docs / outbox / meta) và cùng giao thức POST /sync.
     Khoá 'scn-sync' (Web Locks) đảm bảo trang và Service Worker không đồng bộ cùng lúc. */
const VERSION = 'scn-v1.14.0';
const SHELL = VERSION + '-shell', RUNTIME = VERSION + '-rt', FONTS = 'scn-fonts', OCR = 'scn-ocr', SHARE = 'scn-share';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png?v=1.14.0', './icons/icon-512.png?v=1.14.0', './icons/maskable-192.png?v=1.14.0', './icons/maskable-512.png?v=1.14.0', './icons/apple-touch-icon.png?v=1.14.0', './icons/favicon-32.png?v=1.14.0', './assets/dang-nhap-dien-thoai.webp', './assets/dang-nhap-web.webp', './assets/i18n-en.json']; // ảnh nền đăng nhập: hiện cả khi mất mạng

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.registration.active ? null : self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== RUNTIME && k !== FONTS && k !== OCR && k !== SHARE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNetAndStore(req, cacheName) {
  return fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(cacheName).then(c => c.put(req, cp)); } return res; });
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // Ảnh chia sẻ từ app khác (VD app ngân hàng → Chia sẻ → Sổ Cá Nhân, Android): giữ ảnh rồi mở form thêm giao dịch
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try { const fd = await req.formData(), f = fd.getAll('image').find(x => x && x.size); if (f) await (await caches.open(SHARE)).put('./share-latest', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } })); } catch (er) { }
      return Response.redirect('./#thu-chi&nhan-anh', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // Phông chữ Google: cache-first
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fromNetAndStore(req, FONTS).catch(() => new Response('', { status: 504 }))));
    return;
  }
  if (url.origin !== location.origin) return; // máy chủ đồng bộ & nguồn khác: để trình duyệt tự xử lý
  // Bộ đọc ảnh (Tesseract + tiếng Việt, ~2,6 MB): lưu đệm riêng, giữ qua các lần cập nhật app → tải 1 lần, dùng offline
  if (url.pathname.includes('/vendor/ocr-')) {
    e.respondWith(caches.match(req, { cacheName: OCR }).then(hit => hit || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(OCR).then(c => c.put(req, cp)); } return res; })));
    return;
  }
  if (url.pathname.endsWith('/sw.js')) return;
  if (/^\/(sync|events|health|admin|push|auth)(\/|$)/.test(url.pathname)) return; // API máy chủ: luôn đi thẳng, không lưu đệm (luồng /events không bao giờ kết thúc)
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
  e.respondWith(caches.match(req, { ignoreSearch: !/[?&]v=/.test(url.search) }).then(hit => { // có ?v= (icon theo phiên bản) → phải khớp đúng phiên bản
    const net = fromNetAndStore(req, hit ? SHELL : RUNTIME).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return net.then(r => r || new Response('', { status: 504 }));
  }));
});

// ================= ĐỒNG BỘ QUA MÁY CHỦ =================
const DB_NAME = 'so-ca-nhan', DB_VER = 1, SYNC_TAG = 'scn-sync', PERIODIC_TAG = 'scn-periodic', LOCK = 'scn-sync';
const BATCH = 500, MAX_ROUNDS = 50, TIMEOUT = 20000;
// Phải khớp với COLS trong index.html – bản ghi thuộc nhóm lạ sẽ bị bỏ qua (giống trang)
const COLS = new Set(['accounts', 'txns', 'loans', 'savings', 'settings', 'health', 'events', 'todos', 'goals', 'assets', 'cards', 'study', 'habits', 'journal', 'notes', 'contacts', 'meds', 'courses', 'books']);

class SyncError extends Error { constructor(msg, retry) { super(msg); this.retry = retry; } }

function dbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; ['docs', 'meta', 'files'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
  });
}
function dbTx(db, stores, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode); let out;
    try { out = fn(t); } catch (e) { try { t.abort(); } catch (_) { } rej(e); return; }
    t.oncomplete = () => res(out && typeof out === 'object' && 'readyState' in out ? out.result : out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
  });
}
const dbGet = (db, store, key) => dbTx(db, [store], 'readonly', t => t.objectStore(store).get(key));
const dbCount = (db, store) => dbTx(db, [store], 'readonly', t => t.objectStore(store).count());
function dbFirst(db, store, limit) { // lấy tối đa `limit` mục đầu hàng đợi, kèm khoá
  return new Promise((res, rej) => {
    const out = [], t = db.transaction([store], 'readonly'), c = t.objectStore(store).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur && out.length < limit) { out.push([cur.key, cur.value]); cur.continue(); } };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
  });
}

async function postSync(cfg, body) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), TIMEOUT);
  let r;
  try {
    r = await fetch(String(cfg.url).replace(/\/+$/, '') + '/sync', {
      method: 'POST', signal: ctl.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}) },
      body: JSON.stringify(body)
    });
  } catch (e) { throw new SyncError(e && e.name === 'AbortError' ? 'Hết thời gian chờ máy chủ' : 'Không kết nối được máy chủ đồng bộ', true); }
  finally { clearTimeout(to); }
  if (r.status === 401 || r.status === 403) throw new SyncError('Sai mã truy cập (token)', false);
  if (!r.ok) { let m = ''; try { m = (await r.json()).error || ''; } catch (e) { } throw new SyncError(/[À-ỹ]/.test(m) ? m : 'Máy chủ báo lỗi ' + r.status, r.status >= 500 || r.status === 429); }
  try { return await r.json(); } catch (e) { throw new SyncError('Máy chủ trả dữ liệu không hợp lệ', false); }
}

// Ghi thay đổi từ máy chủ vào docs (bản có ts mới hơn hoặc bằng thì thắng – giống trang),
// xoá các mục đã gửi khỏi hàng đợi, lưu mốc đồng bộ. Tất cả trong 1 giao dịch.
function applyChanges(db, res, maxKey) {
  let changed = 0;
  return dbTx(db, ['docs', 'outbox', 'meta'], 'readwrite', t => {
    const ds = t.objectStore('docs');
    (res.changes || []).forEach(ch => {
      if (!ch || !COLS.has(ch.col) || ch.id == null) return;
      const k = ch.col + '/' + ch.id, g = ds.get(k);
      g.onsuccess = () => {
        const cur = g.result;
        if (!cur || (Number(ch.ts) || 0) >= (Number(cur.ts) || 0)) {
          ds.put(ch.del ? { col: ch.col, id: ch.id, del: true, ts: ch.ts } : { col: ch.col, id: ch.id, data: ch.data, ts: ch.ts }, k);
          changed++;
        }
      };
    });
    if (maxKey != null) t.objectStore('outbox').delete(IDBKeyRange.upperBound(maxKey));
    t.objectStore('meta').put(res.now || 0, 'lastSync');
    t.objectStore('meta').put(Date.now(), 'lastSyncAt');
    if (res.epoch) t.objectStore('meta').put(res.epoch, 'epoch');
  }).then(() => changed);
}
// Máy chủ báo dữ liệu đã bị xoá/tạo mới (reset): đưa TOÀN BỘ dữ liệu trên máy (kể cả mục đã xoá) vào hàng đợi để gửi lại
function requeueAll(db, epoch) {
  return dbTx(db, ['docs', 'outbox', 'meta'], 'readwrite', t => {
    const ob = t.objectStore('outbox'), c = t.objectStore('docs').openCursor();
    c.onsuccess = () => { const cur = c.result; if (!cur) return; const v = cur.value; if (v && COLS.has(v.col)) ob.add({ op: v.del ? 'del' : 'put', col: v.col, id: v.id, data: v.del ? null : v.data, ts: v.ts }); cur.continue(); };
    t.objectStore('meta').put(0, 'lastSync'); t.objectStore('meta').put(epoch || '', 'epoch');
  });
}

async function doSync(reason) {
  const db = await dbOpen();
  try {
    const cfg = (await dbGet(db, 'meta', 'sync')) || {};
    if (!cfg.url) return { skipped: true };
    const device = (await dbGet(db, 'meta', 'device')) || 'sw';
    let since = (await dbGet(db, 'meta', 'lastSync')) || 0, epoch = (await dbGet(db, 'meta', 'epoch')) || '', changed = 0, sent = 0, resets = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const box = await dbFirst(db, 'outbox', BATCH);
      const ops = box.map(([, v]) => v), maxKey = box.length ? box[box.length - 1][0] : null;
      const res = await postSync(cfg, { device, since, epoch, ops });
      if (res.reset) {
        if (resets++) throw new SyncError('Máy chủ liên tục yêu cầu đồng bộ lại', false);
        await requeueAll(db, res.epoch); since = 0; epoch = res.epoch || ''; continue;
      }
      changed += await applyChanges(db, res, maxKey);
      since = res.now || 0; sent += ops.length;
      if (box.length < BATCH) break; // hết hàng đợi
    }
    const pending = await dbCount(db, 'outbox');
    await notify({ type: 'scn-synced', reason, changed, sent, pending, lastSync: since, at: Date.now() });
    return { changed, sent, pending };
  } finally { db.close(); }
}

let running = null;
function swSync(reason) {
  if (running) return running; // gộp các yêu cầu trùng trong cùng Service Worker
  const run = () => doSync(reason);
  running = (self.navigator && navigator.locks && navigator.locks.request ? navigator.locks.request(LOCK, run) : run())
    .finally(() => { running = null; });
  return running;
}
async function notify(msg) {
  try { (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).forEach(c => c.postMessage(msg)); } catch (e) { }
}
const reportErr = (reason, err) => notify({ type: 'scn-sync-error', reason, msg: (err && err.message) || 'Lỗi đồng bộ' });

// Background Sync: trình duyệt gọi khi có mạng (kể cả app đã đóng). Ném lỗi "thử lại được" để trình duyệt tự thử lại sau.
self.addEventListener('sync', e => {
  if (e.tag !== SYNC_TAG) return;
  e.waitUntil(swSync('background').catch(err => { reportErr('background', err); if (err && err.retry !== false && !e.lastChance) throw err; }));
});
// Periodic Background Sync: kéo dữ liệu mới định kỳ (chỉ Chrome/Edge, app đã cài)
self.addEventListener('periodicsync', e => {
  if (e.tag !== PERIODIC_TAG) return;
  e.waitUntil(swSync('periodic').catch(err => reportErr('periodic', err)));
});
// Tin nhắn từ trang
self.addEventListener('message', e => {
  if (e.data === 'skip') { self.skipWaiting(); return; }
  if (e.data && e.data.type === 'scn-sync') e.waitUntil(swSync('message').catch(err => reportErr('message', err)));
});

// ================= THÔNG BÁO ĐẨY =================
// Máy chủ gửi khi thiết bị khác thêm dữ liệu / sao lưu tuần. Nếu có sync:true → kéo dữ liệu mới về nền luôn.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const show = self.registration.showNotification(d.title || 'Sổ Cá Nhân', {
    body: d.body || '', icon: './icons/icon-192.png?v=1.14.0', badge: './icons/favicon-32.png?v=1.14.0', tag: d.tag || 'scn', renotify: true,
    data: { url: d.url || './', kind: d.kind || '' }, lang: 'vi'
  });
  e.waitUntil(Promise.all([show, d.sync ? swSync('push').catch(err => reportErr('push', err)) : null]));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href, hash = new URL(url).hash;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'scn-open', hash }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
