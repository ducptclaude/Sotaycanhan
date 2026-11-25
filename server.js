/* Sổ Cá Nhân – máy chủ GỘP: phục vụ ứng dụng (PWA) + đồng bộ dữ liệu trên CÙNG một địa chỉ.
   Node.js ≥ 18. Thư viện: pg (Postgres), web-push (thông báo đẩy). Dùng cho Railway / Render / Fly.io / VPS.
   Biến môi trường:
     PORT          cổng (Railway tự đặt)
     SYNC_TOKEN    mã truy cập đồng bộ – BẮT BUỘC, chưa đặt thì /sync báo lỗi 503 (app vẫn chạy bình thường)
     DATABASE_URL  (khuyên dùng) Postgres → dữ liệu bền vững qua mọi lần triển khai lại. Không có: lưu tệp (cần Volume)
     SYNC_FILE     tệp dữ liệu khi không dùng Postgres. Mặc định: <Volume>/data.json hoặc ./data/data.json
     GITHUB_TOKEN  bật sao lưu hằng tuần lên nhánh GitHub (xem server/backup.js)
   Đăng nhập: /auth/* (server/auth.js) – có tài khoản chủ thì dữ liệu chỉ mở bằng phiên đăng nhập.
   Đường dẫn: /  /index.html  /sw.js  /manifest.webmanifest  /icons/*  ·  POST /sync  ·  GET /events  ·  /push/*  ·  /admin/*  ·  GET /health */
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { createSync } = require('./server/sync-core');
const { openStore } = require('./server/store');
const { createPush } = require('./server/push');
const { createBackup } = require('./server/backup');
const { createAuth } = require('./server/auth');
const { openBioDB } = require('./server/bio-db');

const ROOT = __dirname, PORT = Number(process.env.PORT || 8080);
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || '';
const SYNC_FILE = process.env.SYNC_FILE || (VOLUME ? path.join(VOLUME, 'data.json') : path.join(ROOT, 'data', 'data.json'));
const ON_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
let sync = null, push = null, backup = null, store = null, auth = null;

// ---- Tệp tĩnh: CHỈ các tệp của ứng dụng (không lộ server/, data/, kiem-tra/…) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const PUBLIC = ['index.html', 'sw.js', 'manifest.webmanifest'];
try { fs.readdirSync(path.join(ROOT, 'icons')).forEach(f => PUBLIC.push('icons/' + f)); } catch (e) { }
try { fs.readdirSync(path.join(ROOT, 'assets')).filter(f => /\.(webp|png|jpg|svg|json)$/.test(f)).forEach(f => PUBLIC.push('assets/' + f)); } catch (e) { } // ảnh nền đăng nhập
const FILES = new Map(); // nạp sẵn vào bộ nhớ + nén gzip một lần
for (const rel of PUBLIC) {
  const ext = path.extname(rel), buf = fs.readFileSync(path.join(ROOT, rel));
  const text = /^text\/|json|javascript|svg/.test(TYPES[ext] || '');
  FILES.set('/' + rel, {
    type: TYPES[ext] || 'application/octet-stream', buf, gz: text ? zlib.gzipSync(buf, { level: 9 }) : null,
    etag: '"' + crypto.createHash('sha1').update(buf).digest('base64').slice(0, 16) + '"',
    // trang & service worker: luôn hỏi lại máy chủ (để có bản mới); biểu tượng: lưu 7 ngày
    cache: 'no-cache' /* icon/ảnh nền: luôn hỏi lại máy chủ (ETag → 304 nếu không đổi) để đổi logo là máy nhận ngay */
  });
}
// ---- Đọc ảnh biên lai (OCR) chạy TRÊN MÁY người dùng: phục vụ Tesseract.js + dữ liệu tiếng Việt từ node_modules ----
// Đường dẫn có số phiên bản → lưu đệm lâu dài; chỉ phục vụ đúng các tệp liệt kê dưới đây.
const OCR_VER = (() => { try { return require('tesseract.js/package.json').version; } catch (e) { return ''; } })();
if (OCR_VER) {
  const nm = p => path.join(ROOT, 'node_modules', p), V = '/vendor/ocr-' + OCR_VER + '/';
  const map = { 'tesseract.min.js': nm('tesseract.js/dist/tesseract.min.js'), 'worker.min.js': nm('tesseract.js/dist/worker.min.js'), 'lang/vie.traineddata.gz': nm('@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz') };
  for (const v of ['', 'simd-', 'relaxedsimd-']) for (const e of ['.wasm.js', '.js', '.wasm']) map['core/tesseract-core-' + v + 'lstm' + e] = nm('tesseract.js-core/tesseract-core-' + v + 'lstm' + e);
  for (const [rel, src] of Object.entries(map)) {
    let buf; try { buf = fs.readFileSync(src); } catch (e) { continue; }
    const js = rel.endsWith('.js'), wasm = rel.endsWith('.wasm');
    FILES.set(V + rel, { type: js ? 'text/javascript; charset=utf-8' : wasm ? 'application/wasm' : 'application/octet-stream', buf, gz: js || wasm ? zlib.gzipSync(buf, { level: 9 }) : null,
      etag: '"' + crypto.createHash('sha1').update(buf).digest('base64').slice(0, 16) + '"', cache: 'public, max-age=31536000, immutable' });
  }
}
const APP_VERSION = (() => { try { return require('./package.json').version; } catch (e) { return ''; } })();
// Header bảo mật: chống nhúng trang (clickjacking), bắt buộc HTTPS, tắt quyền không dùng tới
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  ...(process.env.RAILWAY_PUBLIC_DOMAIN ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}) };

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return false; }
  if (p === '/') p = '/index.html';
  const f = FILES.get(p); if (!f) return false;
  const h = { 'Content-Type': f.type, 'Cache-Control': f.cache, 'ETag': f.etag, 'Vary': 'Accept-Encoding', ...SEC };
  if (p === '/sw.js') h['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, h); res.end(); return true; }
  const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gz ? f.gz : f.buf; if (gz) h['Content-Encoding'] = 'gzip';
  h['Content-Length'] = body.length;
  res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

const server = http.createServer((req, res) => {
  try {
    if (auth.handle(req, res, sync)) return;
    // Tải / sao lưu TOÀN BỘ dữ liệu: thao tác nhạy cảm → cần vừa xác thực lại (sinh trắc hoặc mật khẩu)
    { const u = req.url.split('?')[0]; if ((u === '/admin/export' || u === '/admin/backup/run') && auth.check(req.headers.authorization) && !auth.stepUpOk(req.headers.authorization)) { sync.send(res, 403, { error: 'Cần xác thực lại bằng vân tay / Face ID hoặc mật khẩu', code: 'stepup' }); return; } }
    if (sync.handle(req, res)) return;
    if (push.handle(req, res)) return;
    if (backup.handle(req, res)) return;
    if (serveStatic(req, res)) return;
    if (req.method === 'POST' && req.url.split('?')[0] === '/share-target') { req.resume(); res.writeHead(303, { Location: '/#thu-chi', ...SEC }); res.end(); return; } // dự phòng khi Service Worker chưa chạy
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC }); res.end('Không tìm thấy');
  } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); }
});

(async () => {
  store = await openStore({ dir: path.dirname(SYNC_FILE), files: { 'sync-db': SYNC_FILE } });
  const bio = await openBioDB(store); // CSDL sinh trắc riêng (bảng scn_sinh_trac / tệp sinh-trac.json), tự tạo nếu chưa có
  auth = createAuth({ store, bio });
  sync = createSync({ store, token: process.env.SYNC_TOKEN || '', allowOrigin: process.env.ALLOW_ORIGIN || '', onChange: c => push && push.onChange(c), check: h => auth.check(h) });
  auth.setOnRevoke((mode, device) => { sync.dropStreams(mode, device); if (mode !== 'all' && push) push.removeDevices(mode, device); });
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN || '';
  push = createPush({ store, sync, isLive: d => sync.isLive(d), subject: process.env.PUSH_SUBJECT || (domain ? 'https://' + domain : 'mailto:so-ca-nhan@example.com') });
  backup = createBackup({ store, sync, push });
  const _h = sync.handle; // /health: thêm nơi lưu trữ để kiểm tra từ xa
  sync.handle = (req, res) => {
    if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
      // Công khai: chỉ "ok" + phiên bản (đủ cho Railway kiểm tra sống). Chi tiết chỉ khi đã đăng nhập.
      if (!auth.check(req.headers.authorization)) { sync.send(res, 200, { ok: true, ver: APP_VERSION }); return true; }
      const i = sync.info(); sync.send(res, 200, { ok: true, ver: APP_VERSION, seq: i.seq, docs: i.docs, sync: !!process.env.SYNC_TOKEN, storage: store.kind === 'postgres' ? 'postgres' : VOLUME ? 'volume' : 'tam-thoi', live: i.live, push: push.enabled, backup: backup.enabled, account: auth.info().setup }); return true;
    }
    return _h(req, res);
  };
  server.listen(PORT, () => {
    const i = sync.info();
    console.log(`Sổ Cá Nhân: cổng ${PORT} · ${FILES.size} tệp ứng dụng · lưu trữ: ${store.kind === 'postgres' ? 'Postgres' : SYNC_FILE} (${i.docs} bản ghi) · thông báo đẩy: ${push.enabled ? 'bật' : 'tắt'} · sao lưu GitHub: ${backup.enabled ? 'bật' : 'tắt'}`);
    if (!process.env.SYNC_TOKEN) console.warn('⚠ Chưa đặt SYNC_TOKEN → đồng bộ đang TẮT (app vẫn chạy). Hãy đặt biến SYNC_TOKEN.');
    if (ON_RAILWAY && store.kind !== 'postgres' && !VOLUME && !process.env.SYNC_FILE) console.warn('⚠ Không có Postgres (DATABASE_URL) hay Volume → dữ liệu đồng bộ bị xoá mỗi lần triển khai lại.');
  });
})().catch(e => { console.error('Không khởi động được:', e); process.exit(1); });

let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; setTimeout(() => process.exit(0), 5000).unref(); try { if (sync) await sync.close(); if (store) await store.close(); } catch (e) { } server.close(() => process.exit(0)); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
