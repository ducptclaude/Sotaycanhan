/* Máy chủ đồng bộ mẫu cho Sổ Cá Nhân – Node.js ≥ 18, không cần cài thư viện.
   Chạy:  SYNC_TOKEN=ma-bi-mat PORT=8787 node sync-server.js
   Dữ liệu lưu trong data.json cạnh tệp này.
   Giao thức: POST /sync  (Authorization: Bearer <token>)
     body: { device, since, ops: [{ op:'put'|'del', col, id, data, ts }] }
     trả:  { now, changes: [{ col, id, data, del, ts }] }   – các bản ghi thay đổi sau "since"
   Xung đột: bản có thời điểm sửa (ts) mới hơn sẽ thắng (last-write-wins). */
const http = require('http'), fs = require('fs'), path = require('path');
const FILE = process.env.SYNC_FILE || path.join(__dirname, 'data.json');
const TOKEN = process.env.SYNC_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);
let db = { seq: 0, docs: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { }
let saveT = null; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFileSync(FILE + '.tmp', JSON.stringify(db)) || fs.renameSync(FILE + '.tmp', FILE), 200); };
const cors = { 'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Max-Age': '86400' };
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, seq: db.seq, docs: Object.keys(db.docs).length });
  if (req.method !== 'POST' || !req.url.startsWith('/sync')) return send(404, { error: 'not found' });
  if (TOKEN && req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { error: 'unauthorized' });
  let body = ''; req.on('data', c => { body += c; if (body.length > 20e6) req.destroy(); });
  req.on('end', () => {
    let q; try { q = JSON.parse(body || '{}'); } catch (e) { return send(400, { error: 'bad json' }); }
    const since = Number(q.since) || 0;
    for (const o of (q.ops || [])) {
      if (!o || !o.col || !o.id) continue;
      const k = o.col + '/' + o.id, cur = db.docs[k], ts = Number(o.ts) || Date.now();
      if (cur && cur.ts > ts) continue; // bản trên máy chủ mới hơn
      db.seq++; db.docs[k] = o.op === 'del' ? { col: o.col, id: o.id, del: true, ts, seq: db.seq } : { col: o.col, id: o.id, data: o.data, ts, seq: db.seq };
    }
    const changes = Object.values(db.docs).filter(d => d.seq > since).map(({ seq, ...d }) => d);
    save(); send(200, { now: db.seq, changes });
  });
}).listen(PORT, () => console.log('Sổ Cá Nhân sync server: http://localhost:' + PORT + (TOKEN ? ' (có token)' : ' (KHÔNG có token – chỉ dùng thử)')));
