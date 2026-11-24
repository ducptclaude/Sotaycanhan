/* Kho lưu trữ khoá → chuỗi cho máy chủ Sổ Cá Nhân.
   - Có DATABASE_URL (VD Postgres trên Railway): lưu vào bảng scn_store – bền vững qua mọi lần triển khai lại.
   - Không có: lưu tệp trong thư mục dữ liệu (Volume nếu có; nếu không có Volume thì mất khi triển khai lại).
   Đọc: đồng bộ từ bộ nhớ (đã nạp sẵn khi khởi động). Ghi: gom lại rồi ghi nền; flush() chờ ghi xong. */
const fs = require('fs'), path = require('path');

function createFileStore({ dir, files = {} }) {
  const fileOf = k => files[k] || path.join(dir, k + '.json');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
  return {
    kind: 'file', dir,
    get(k) { try { return fs.readFileSync(fileOf(k), 'utf8'); } catch (e) { return null; } },
    set(k, v) { const f = fileOf(k); try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', v); fs.renameSync(f + '.tmp', f); } catch (e) { console.error('Không ghi được', f, e.message); } },
    async flush() { }, async close() { }
  };
}

async function createPgStore({ url, importFrom = null }) {
  const { Pool } = require('pg');
  const ssl = /sslmode=(require|verify)/.test(url) || process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false;
  const pool = new Pool({ connectionString: url, ssl, max: 3, idleTimeoutMillis: 30000 });
  pool.on('error', e => console.error('Postgres:', e.message));
  // Postgres có thể khởi động chậm hơn app (VD Railway triển khai lại cùng lúc) → thử lại ~40 giây
  for (let i = 1; ; i++) {
    try { await pool.query('CREATE TABLE IF NOT EXISTS scn_store (k text PRIMARY KEY, v text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'); break; }
    catch (e) { if (i >= 12) throw e; console.warn(`Chưa kết nối được Postgres (lần ${i}): ${e.message} – thử lại…`); await new Promise(r => setTimeout(r, Math.min(1000 * i, 5000))); }
  }
  const cache = new Map((await pool.query('SELECT k, v FROM scn_store')).rows.map(r => [r.k, r.v]));
  // Chuyển dữ liệu tệp cũ (nếu có) sang Postgres lần đầu
  if (importFrom) for (const k of Object.keys(importFrom.files || {})) {
    if (cache.has(k)) continue; const v = importFrom.get(k);
    if (v) { await pool.query('INSERT INTO scn_store (k, v) VALUES ($1, $2) ON CONFLICT (k) DO NOTHING', [k, v]); cache.set(k, v); console.log('Đã chuyển', k, 'từ tệp sang Postgres'); }
  }
  const dirty = new Set(); let timer = null, chain = Promise.resolve();
  const write = () => {
    timer = null; const keys = [...dirty]; dirty.clear(); if (!keys.length) return chain;
    chain = chain.then(async () => {
      for (const k of keys) {
        try { await pool.query('INSERT INTO scn_store (k, v, updated_at) VALUES ($1, $2, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()', [k, cache.get(k)]); }
        catch (e) { console.error('Ghi Postgres lỗi (' + k + '):', e.message); dirty.add(k); if (!timer) timer = setTimeout(write, 3000); } // thử lại sau
      }
    });
    return chain;
  };
  return {
    kind: 'postgres', pool,
    get(k) { return cache.has(k) ? cache.get(k) : null; },
    set(k, v) { cache.set(k, v); dirty.add(k); if (!timer) timer = setTimeout(write, 150); },
    async flush() { clearTimeout(timer); await write(); await chain; },
    async close() { await this.flush(); await pool.end(); }
  };
}

async function openStore({ dir, files = {} }) {
  const fileStore = createFileStore({ dir, files });
  if (process.env.DATABASE_URL) return createPgStore({ url: process.env.DATABASE_URL, importFrom: { files: { 'sync-db': 1, vapid: 1, 'push-subs': 1, 'backup-state': 1 }, get: k => fileStore.get(k) } });
  return fileStore;
}
module.exports = { openStore, createFileStore, createPgStore };
