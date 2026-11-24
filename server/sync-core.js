/* Lõi đồng bộ dùng chung cho server.js (gộp app + đồng bộ) và server/sync-server.js (chỉ đồng bộ).
   Giao thức (mọi đường dẫn cần Authorization: Bearer <SYNC_TOKEN>):
     POST /sync     body: { device, since, epoch, ops: [{ op:'put'|'del', col, id, data, ts }] }
                    trả:  { now, epoch, changes: [{ col, id, data, del, ts }] }  – các bản ghi thay đổi sau "since"
                          hoặc { reset: true, now, epoch } khi dữ liệu máy chủ đã bị xoá/tạo mới
                          → thiết bị đặt since = 0 và gửi lại toàn bộ dữ liệu trên máy.
     GET  /events   luồng SSE: "hello" khi kết nối, "change" ngay khi có dữ liệu mới (đồng bộ tức thời)
     GET  /admin/export   tải toàn bộ dữ liệu máy chủ (sao lưu trước khi chuyển region…)
   Xung đột: bản có thời điểm sửa (ts) mới hơn sẽ thắng (last-write-wins). */
const path = require('path'), crypto = require('crypto');
const { createFileStore } = require('./store');

function createSync({ file, store, token, allowOrigin = '*', allowNoToken = false, maxBody = 20e6, onChange = null, check = null }) {
  if (!store) store = createFileStore({ dir: path.dirname(file), files: { 'sync-db': file } });
  let db = null;
  try { db = JSON.parse(store.get('sync-db')); } catch (e) { }
  if (!db || typeof db !== 'object' || !db.docs) db = { seq: 0, docs: {} };
  if (!db.epoch) db.epoch = crypto.randomBytes(8).toString('hex'); // mã phiên dữ liệu: đổi khi dữ liệu máy chủ được tạo mới

  let saveT = null;
  const flush = () => { clearTimeout(saveT); saveT = null; store.set('sync-db', JSON.stringify(db)); };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(flush, 200); };
  flush(); // ghi ngay để giữ mã phiên

  const cors = !allowOrigin ? {} : { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  const send = (res, code, obj, extra) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...(extra || {}) }); res.end(JSON.stringify(obj)); };
  const tokenOk = h => {
    if (check) return check(h); // có tài khoản chủ: kiểm tra phiên đăng nhập (server/auth.js)
    if (!token) return allowNoToken;
    const a = Buffer.from(String(h || '')), b = Buffer.from('Bearer ' + token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  // Kiểm tra quyền chung cho mọi đường dẫn cần mã. Trả true nếu được phép; nếu không thì đã trả lỗi.
  function auth(req, res) {
    if (!token && !allowNoToken) { send(res, 503, { error: 'Máy chủ chưa đặt SYNC_TOKEN' }); return false; }
    if (!tokenOk(req.headers.authorization)) { send(res, 401, { error: check ? 'Chưa đăng nhập hoặc phiên đã hết hạn' : 'unauthorized' }); return false; }
    return true;
  }
  function readJson(req, res, cb) {
    let body = '', big = false;
    req.on('data', c => { if (big) return; body += c; if (body.length > maxBody) { big = true; send(res, 413, { error: 'Dữ liệu gửi lên quá lớn' }); req.destroy(); } });
    req.on('end', () => { if (big) return; let q; try { q = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { error: 'bad json' }); } cb(q); });
  }

  // ---- Đồng bộ tức thời: luồng sự kiện (SSE) ----
  const streams = new Set();
  const sse = (res, ev, data) => { try { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { } };
  function broadcast(ev, data) { for (const s of streams) sse(s.res, ev, data); }
  setInterval(() => { for (const s of streams) { try { s.res.write(': ping\n\n'); } catch (e) { } } }, 25000).unref(); // giữ kết nối qua proxy

  function handle(req, res) {
    const url = req.url.split('?')[0];
    if (url === '/health' && req.method === 'GET') { send(res, 200, { ok: true, seq: db.seq, docs: Object.keys(db.docs).length, sync: !!token || allowNoToken, live: streams.size }); return true; }
    if (url !== '/sync' && url !== '/events' && url !== '/admin/export') return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }

    if (url === '/events') {
      if (req.method !== 'GET') { send(res, 405, { error: 'method not allowed' }); return true; }
      if (!auth(req, res)) return true;
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', ...cors });
      res.write('retry: 3000\n\n');
      const s = { res, device: String((req.headers['x-device'] || '')).slice(0, 64) };
      streams.add(s); sse(res, 'hello', { seq: db.seq, epoch: db.epoch, live: streams.size });
      const bye = () => streams.delete(s); req.on('close', bye); res.on('error', bye);
      return true;
    }
    if (url === '/admin/export') {
      if (req.method !== 'GET') { send(res, 405, { error: 'method not allowed' }); return true; }
      if (!auth(req, res)) return true;
      flush();
      const name = 'so-ca-nhan-may-chu-' + new Date().toISOString().slice(0, 10) + '.json';
      send(res, 200, snapshot(), { 'Content-Disposition': `attachment; filename="${name}"` });
      return true;
    }
    // POST /sync
    if (req.method !== 'POST') { send(res, 405, { error: 'method not allowed' }); return true; }
    if (!auth(req, res)) return true;
    readJson(req, res, q => {
      const since = Number(q.since) || 0, device = String(q.device || '').slice(0, 64);
      // Thiết bị đang ở phiên dữ liệu khác, hoặc mốc vượt quá máy chủ → máy chủ đã bị xoá/tạo mới
      if ((q.epoch && q.epoch !== db.epoch) || since > db.seq) return send(res, 200, { reset: true, now: 0, epoch: db.epoch });
      const applied = [];
      for (const o of (Array.isArray(q.ops) ? q.ops : [])) {
        if (!o || !o.col || o.id == null) continue;
        const k = o.col + '/' + o.id, cur = db.docs[k], ts = Number(o.ts) || Date.now();
        if (cur && cur.ts > ts) continue; // bản trên máy chủ mới hơn
        if (cur && cur.ts === ts && !!cur.del === (o.op === 'del') && JSON.stringify(cur.data) === JSON.stringify(o.data)) continue; // gửi lại y hệt: bỏ qua
        db.seq++; db.docs[k] = o.op === 'del' ? { col: o.col, id: o.id, del: true, ts, seq: db.seq } : { col: o.col, id: o.id, data: o.data, ts, seq: db.seq };
        applied.push({ op: o.op === 'del' ? 'del' : 'put', col: o.col, id: o.id, ts, isNew: !cur || !!cur.del, data: o.op === 'del' ? null : o.data });
      }
      const changes = Object.values(db.docs).filter(d => d.seq > since).map(({ seq, ...d }) => d);
      if (applied.length) {
        save();
        broadcast('change', { seq: db.seq, device, n: applied.length }); // báo các thiết bị đang mở kéo về ngay
        if (onChange) { try { onChange({ device, applied }); } catch (e) { console.error('onChange:', e.message); } }
      }
      send(res, 200, { now: db.seq, epoch: db.epoch, changes });
    });
    return true;
  }
  function snapshot() {
    const data = {}; let n = 0;
    for (const d of Object.values(db.docs)) { if (d.del) continue; (data[d.col] = data[d.col] || {})[d.id] = d.data; n++; }
    return { app: 'so-ca-nhan', source: 'server', exportedAt: new Date().toISOString(), epoch: db.epoch, seq: db.seq, count: n, data };
  }
  // Toàn bộ bản ghi (chưa xoá) của 1 nhóm – dùng để tính số dư / luỹ kế cho thông báo
  const all = col => { const o = {}; for (const d of Object.values(db.docs)) if (d.col === col && !d.del) o[d.id] = d.data; return o; };
  const isLive = d => !!d && [...streams].some(s => s.device === d);
  // Ngắt kênh tức thời (thiết bị bị thu hồi / đăng xuất / đổi mật khẩu) – thiết bị sẽ phải xác thực lại
  const dropStreams = (mode, device) => { for (const s of [...streams]) if (mode === 'all' || (mode === 'device' && s.device === device) || (mode === 'others' && s.device !== device)) { try { s.res.end(); } catch (e) { } streams.delete(s); } };
  return { all, dropStreams, handle, flush, close: async () => { flush(); await store.flush(); }, store, auth, readJson, send, broadcast, snapshot, isLive, info: () => ({ seq: db.seq, docs: Object.keys(db.docs).length, epoch: db.epoch, live: streams.size }) };
}
module.exports = { createSync };
