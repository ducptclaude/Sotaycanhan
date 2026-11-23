/* Sổ Cá Nhân – máy chủ GỘP: phục vụ ứng dụng (PWA) + đồng bộ dữ liệu trên CÙNG một địa chỉ.
   Node.js ≥ 18, không cần cài thư viện. Dùng cho Railway / Render / Fly.io / VPS.
   Biến môi trường:
     PORT         cổng (Railway tự đặt)
     SYNC_TOKEN   mã truy cập đồng bộ – BẮT BUỘC, chưa đặt thì /sync báo lỗi 503 (app vẫn chạy bình thường)
     SYNC_FILE    tệp lưu dữ liệu đồng bộ. Mặc định: <Volume Railway>/data.json nếu có Volume, ngược lại ./data/data.json
   Đường dẫn: /  /index.html  /sw.js  /manifest.webmanifest  /icons/*   ·   POST /sync   ·   GET /health */
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { createSync } = require('./server/sync-core');

const ROOT = __dirname, PORT = Number(process.env.PORT || 8080);
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || '';
const SYNC_FILE = process.env.SYNC_FILE || (VOLUME ? path.join(VOLUME, 'data.json') : path.join(ROOT, 'data', 'data.json'));
const ON_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const sync = createSync({ file: SYNC_FILE, token: process.env.SYNC_TOKEN || '', allowOrigin: process.env.ALLOW_ORIGIN || '*' });

// ---- Tệp tĩnh: CHỈ các tệp của ứng dụng (không lộ server/, data/, kiem-tra/…) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const PUBLIC = ['index.html', 'sw.js', 'manifest.webmanifest'];
try { fs.readdirSync(path.join(ROOT, 'icons')).forEach(f => PUBLIC.push('icons/' + f)); } catch (e) { }
const FILES = new Map(); // nạp sẵn vào bộ nhớ + nén gzip một lần
for (const rel of PUBLIC) {
  const ext = path.extname(rel), buf = fs.readFileSync(path.join(ROOT, rel));
  const text = /^text\/|json|javascript|svg/.test(TYPES[ext] || '');
  FILES.set('/' + rel, {
    type: TYPES[ext] || 'application/octet-stream', buf, gz: text ? zlib.gzipSync(buf, { level: 9 }) : null,
    etag: '"' + crypto.createHash('sha1').update(buf).digest('base64').slice(0, 16) + '"',
    // trang & service worker: luôn hỏi lại máy chủ (để có bản mới); biểu tượng: lưu 7 ngày
    cache: rel.startsWith('icons/') ? 'public, max-age=604800' : 'no-cache'
  });
}
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };

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
    if (sync.handle(req, res)) return;
    if (serveStatic(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC }); res.end('Không tìm thấy');
  } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); }
});
server.listen(PORT, () => {
  const i = sync.info();
  console.log(`Sổ Cá Nhân: cổng ${PORT} · ${FILES.size} tệp ứng dụng · dữ liệu đồng bộ: ${SYNC_FILE} (${i.docs} bản ghi)`);
  if (!process.env.SYNC_TOKEN) console.warn('⚠ Chưa đặt SYNC_TOKEN → đồng bộ đang TẮT (app vẫn chạy). Hãy đặt biến SYNC_TOKEN.');
  if (ON_RAILWAY && !VOLUME && !process.env.SYNC_FILE) console.warn('⚠ Chưa gắn Volume trên Railway → dữ liệu đồng bộ bị xoá mỗi lần triển khai lại. Thiết bị sẽ tự gửi lại, nhưng nên gắn Volume.');
});
const stop = () => { sync.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
