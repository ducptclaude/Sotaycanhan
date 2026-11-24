/* CƠ SỞ DỮ LIỆU SINH TRẮC (vân tay / Face ID / Windows Hello) – ĐỘC LẬP với dữ liệu tài khoản & dữ liệu sổ.
   - Postgres: bảng riêng scn_sinh_trac (tự tạo nếu chưa có). Không có Postgres: tệp riêng sinh-trac.json.
   - Chỉ lưu KHOÁ CÔNG KHAI của cảm biến trên từng thiết bị (chuẩn WebAuthn). Dữ liệu vân tay / khuôn mặt KHÔNG bao giờ
     rời khỏi chip bảo mật của thiết bị – máy chủ không lưu và không thể lưu.
   - Mỗi bản ghi gắn với 1 thiết bị: loại khoá (singleDevice = chỉ nằm trên máy đó / multiDevice = khoá đồng bộ đám mây),
     trạng thái sao lưu, AAGUID (mã loại bộ xác thực), số đếm chữ ký (phát hiện khoá bị sao chép),
     bindHash = SHA-256 của MÃ GẮN MÁY (bí mật ngẫu nhiên chỉ lưu trên máy đã đăng ký) – khoá đồng bộ sang máy khác vẫn không dùng được. */
const fs = require('fs'), path = require('path');

async function openBioDB(store) {
  const cache = new Map(); // id → bản ghi
  let save;
  if (store.kind === 'postgres' && store.pool) {
    const pool = store.pool;
    await pool.query(`CREATE TABLE IF NOT EXISTS scn_sinh_trac (
      cred_id     text PRIMARY KEY,
      public_key  text NOT NULL,
      counter     bigint NOT NULL DEFAULT 0,
      transports  text NOT NULL DEFAULT '[]',
      device      text NOT NULL DEFAULT '',
      name        text NOT NULL DEFAULT '',
      device_type text NOT NULL DEFAULT '',
      backed_up   boolean NOT NULL DEFAULT false,
      aaguid      text NOT NULL DEFAULT '',
      created_at  timestamptz NOT NULL DEFAULT now(),
      used_at     timestamptz
    )`);
    await pool.query(`ALTER TABLE scn_sinh_trac ADD COLUMN IF NOT EXISTS bind_hash text NOT NULL DEFAULT ''`); // băm mã gắn máy (bản 1.12)
    for (const r of (await pool.query('SELECT * FROM scn_sinh_trac')).rows) cache.set(r.cred_id, fromRow(r));
    let chain = Promise.resolve();
    save = (op, rec) => { chain = chain.then(async () => {
      try {
        if (op === 'del') await pool.query('DELETE FROM scn_sinh_trac WHERE cred_id = $1', [rec.id]);
        else await pool.query(`INSERT INTO scn_sinh_trac (cred_id, public_key, counter, transports, device, name, device_type, backed_up, aaguid, created_at, used_at, bind_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10/1000.0),$11,$12)
          ON CONFLICT (cred_id) DO UPDATE SET counter = EXCLUDED.counter, name = EXCLUDED.name, device_type = EXCLUDED.device_type, backed_up = EXCLUDED.backed_up, used_at = EXCLUDED.used_at, bind_hash = EXCLUDED.bind_hash`,
          [rec.id, rec.publicKey, rec.counter || 0, JSON.stringify(rec.transports || []), rec.device || '', rec.name || '', rec.deviceType || '', !!rec.backedUp, rec.aaguid || '', rec.created || Date.now(), rec.used ? new Date(rec.used) : null, rec.bindHash || '']);
      } catch (e) { console.error('Ghi CSDL sinh trắc lỗi:', e.message); }
    }); return chain; };
  } else {
    const file = path.join(store.dir || '.', 'sinh-trac.json');
    try { for (const r of JSON.parse(fs.readFileSync(file, 'utf8'))) cache.set(r.id, r); } catch (e) { }
    save = () => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify([...cache.values()])); fs.renameSync(file + '.tmp', file); } catch (e) { console.error('Ghi tệp sinh trắc lỗi:', e.message); } return Promise.resolve(); };
  }
  function fromRow(r) { let tr = []; try { tr = JSON.parse(r.transports || '[]'); } catch (e) { } return { id: r.cred_id, publicKey: r.public_key, counter: Number(r.counter) || 0, transports: tr, device: r.device, name: r.name, deviceType: r.device_type, backedUp: !!r.backed_up, aaguid: r.aaguid, created: new Date(r.created_at).getTime(), used: r.used_at ? new Date(r.used_at).getTime() : 0, bindHash: r.bind_hash || '' }; }
  return {
    kind: store.kind === 'postgres' ? 'postgres:scn_sinh_trac' : 'file:sinh-trac.json',
    all: () => [...cache.values()],
    get: id => cache.get(id) || null,
    count: () => cache.size,
    put(rec) { cache.set(rec.id, rec); return save('put', rec); },
    update(id, patch) { const r = cache.get(id); if (!r) return; Object.assign(r, patch); return save('put', r); },
    remove(id) { const r = cache.get(id); if (!r) return; cache.delete(id); return save('del', r); },
    removeWhere(fn) { for (const r of [...cache.values()]) if (fn(r)) { cache.delete(r.id); save('del', r); } },
  };
}
module.exports = { openBioDB };
