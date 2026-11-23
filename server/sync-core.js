/* Lõi đồng bộ dùng chung cho server.js (gộp app + đồng bộ) và server/sync-server.js (chỉ đồng bộ).
   Giao thức: POST /sync  (Authorization: Bearer <token>)
     body: { device, since, epoch, ops: [{ op:'put'|'del', col, id, data, ts }] }
     trả:  { now, epoch, changes: [{ col, id, data, del, ts }] }   – các bản ghi thay đổi sau "since"
           hoặc { reset: true, now, epoch } khi dữ liệu máy chủ đã bị xoá/tạo mới
           → thiết bị đặt since = 0 và gửi lại toàn bộ dữ liệu trên máy.
   Xung đột: bản có thời điểm sửa (ts) mới hơn sẽ thắng (last-write-wins). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function createSync({ file, token, allowOrigin = '*', allowNoToken = false, maxBody = 20e6 }) {
  let db = null;
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
  if (!db || typeof db !== 'object' || !db.docs) db = { seq: 0, docs: {} };
  if (!db.epoch) db.epoch = crypto.randomBytes(8).toString('hex'); // mã phiên dữ liệu: đổi khi dữ liệu máy chủ được tạo mới
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (e) { }

  let saveT = null;
  const flush = () => { clearTimeout(saveT); saveT = null; try { fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); } catch (e) { console.error('Không ghi được dữ liệu đồng bộ:', e.message); } };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(flush, 200); };
  flush(); // ghi ngay để giữ mã phiên

  const cors = { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }); res.end(JSON.stringify(obj)); };
  const tokenOk = h => {
    if (!token) return allowNoToken;
    const a = Buffer.from(String(h || '')), b = Buffer.from('Bearer ' + token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  // Trả true nếu đã xử lý yêu cầu
  function handle(req, res) {
    const url = req.url.split('?')[0];
    if (url === '/health' && req.method === 'GET') { send(res, 200, { ok: true, seq: db.seq, docs: Object.keys(db.docs).length, sync: !!token || allowNoToken }); return true; }
    if (url !== '/sync') return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    if (req.method !== 'POST') { send(res, 405, { error: 'method not allowed' }); return true; }
    if (!token && !allowNoToken) { send(res, 503, { error: 'Máy chủ chưa đặt SYNC_TOKEN' }); return true; }
    if (!tokenOk(req.headers.authorization)) { send(res, 401, { error: 'unauthorized' }); return true; }
    let body = '', big = false;
    req.on('data', c => { if (big) return; body += c; if (body.length > maxBody) { big = true; send(res, 413, { error: 'Dữ liệu gửi lên quá lớn' }); req.destroy(); } });
    req.on('end', () => {
      if (big) return;
      let q; try { q = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { error: 'bad json' }); }
      const since = Number(q.since) || 0;
      // Thiết bị đang ở phiên dữ liệu khác, hoặc mốc vượt quá máy chủ → máy chủ đã bị xoá/tạo mới
      if ((q.epoch && q.epoch !== db.epoch) || since > db.seq) return send(res, 200, { reset: true, now: 0, epoch: db.epoch });
      for (const o of (Array.isArray(q.ops) ? q.ops : [])) {
        if (!o || !o.col || o.id == null) continue;
        const k = o.col + '/' + o.id, cur = db.docs[k], ts = Number(o.ts) || Date.now();
        if (cur && cur.ts > ts) continue; // bản trên máy chủ mới hơn
        db.seq++; db.docs[k] = o.op === 'del' ? { col: o.col, id: o.id, del: true, ts, seq: db.seq } : { col: o.col, id: o.id, data: o.data, ts, seq: db.seq };
      }
      const changes = Object.values(db.docs).filter(d => d.seq > since).map(({ seq, ...d }) => d);
      save(); send(res, 200, { now: db.seq, epoch: db.epoch, changes });
    });
    return true;
  }
  return { handle, flush, info: () => ({ seq: db.seq, docs: Object.keys(db.docs).length, epoch: db.epoch }) };
}
module.exports = { createSync };
