/* KHO CHALLENGE WebAuthn (passkey / vân tay / Face ID)
   - Mỗi challenge: dùng MỘT lần, hết hạn sau CHALLENGE_TTL_SEC (mặc định 300 giây = 5 phút), gắn với loại thao tác
     (register / login / unlock) và với phiên đăng nhập (sid) khi thao tác cần đã đăng nhập.
   - Postgres: bảng scn_challenge (tự tạo) → bền qua khởi động lại & dùng chung khi chạy nhiều phiên bản máy chủ.
     Lấy ra bằng DELETE … RETURNING = "lấy và xoá" trong MỘT câu lệnh (nguyên tử) → chống dùng lại (replay).
   - Không có Postgres (chạy thử / lưu tệp): giữ trong bộ nhớ tiến trình.
   - Không ghi challenge ra log. */
const TTL = () => Math.max(1, Number(process.env.CHALLENGE_TTL_SEC) || 300) * 1000;

async function openChallengeStore(store) {
  if (store && store.kind === 'postgres' && store.pool) {
    const pool = store.pool;
    await pool.query(`CREATE TABLE IF NOT EXISTS scn_challenge (
      id        text PRIMARY KEY,
      type      text NOT NULL,
      challenge text NOT NULL,
      sid       text NOT NULL DEFAULT '',
      exp       timestamptz NOT NULL
    )`);
    let last = 0;
    return {
      kind: 'postgres:scn_challenge',
      async put(id, rec) {
        const now = Date.now();
        if (now - last > 60000) { last = now; pool.query('DELETE FROM scn_challenge WHERE exp < now()').catch(() => { }); } // dọn challenge hết hạn
        await pool.query('INSERT INTO scn_challenge (id, type, challenge, sid, exp) VALUES ($1,$2,$3,$4,to_timestamp($5/1000.0))', [id, rec.type, rec.challenge, rec.sid || '', now + TTL()]);
      },
      async take(id) { // nguyên tử: lấy & xoá cùng lúc – hai yêu cầu đồng thời chỉ một bên nhận được
        const r = await pool.query('DELETE FROM scn_challenge WHERE id = $1 RETURNING type, challenge, sid, exp', [String(id || '')]);
        const x = r.rows[0]; return x ? { type: x.type, challenge: x.challenge, sid: x.sid, exp: new Date(x.exp).getTime() } : null;
      },
    };
  }
  const m = new Map();
  return {
    kind: 'memory',
    async put(id, rec) {
      const now = Date.now(); for (const [k, v] of m) if (v.exp < now) m.delete(k);
      if (m.size > 500) m.delete(m.keys().next().value); // chặn làm đầy bộ nhớ
      m.set(id, { ...rec, exp: now + TTL() });
    },
    async take(id) { const k = String(id || ''), v = m.get(k); m.delete(k); return v || null; },
  };
}
module.exports = { openChallengeStore };
