/* Máy chủ CHỈ đồng bộ cho Sổ Cá Nhân – Node.js ≥ 18, không cần cài thư viện.
   (Muốn vừa phục vụ app vừa đồng bộ trên cùng một địa chỉ: dùng server.js ở thư mục gốc.)
   Chạy:  SYNC_TOKEN=ma-bi-mat PORT=8787 node sync-server.js
   Dữ liệu lưu trong data.json cạnh tệp này (đổi bằng SYNC_FILE). Giao thức: xem sync-core.js */
const http = require('http'), path = require('path');
const { createSync } = require('./sync-core');
const TOKEN = process.env.SYNC_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);
const sync = createSync({
  file: process.env.SYNC_FILE || path.join(__dirname, 'data.json'),
  token: TOKEN, allowOrigin: process.env.ALLOW_ORIGIN || '*',
  allowNoToken: !TOKEN // chạy riêng trên máy: cho dùng thử không token
});
const server = http.createServer((req, res) => {
  if (!sync.handle(req, res)) { res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"error":"not found"}'); }
});
server.listen(PORT, () => console.log('Sổ Cá Nhân sync server: http://localhost:' + PORT + (TOKEN ? ' (có token)' : ' (KHÔNG có token – chỉ dùng thử)')));
const stop = async () => { await sync.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
