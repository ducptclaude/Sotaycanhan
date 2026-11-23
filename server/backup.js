/* Sao lưu dữ liệu hằng tuần lên một NHÁNH RIÊNG trên GitHub – dạng chuỗi số hoá có thể kiểm tra sau này.
   - Mỗi tuần (mặc định Chủ nhật 20:00 giờ Việt Nam) máy chủ chụp toàn bộ dữ liệu, MÃ HOÁ (AES-256-GCM) rồi ghi vào nhánh
     `sao-luu-du-lieu` (nhánh mồ côi, tách khỏi code – Railway không triển khai nhánh này).
   - Kèm SHA-256 của dữ liệu gốc + "chuỗi băm" nối các tuần (chain = SHA-256(chain tuần trước + sha256 tuần này)):
     sửa / xoá / chèn bất kỳ bản sao lưu nào đều làm chuỗi sai → phát hiện được (xem server/kiem-tra-sao-luu.js).
   - Repo đang CÔNG KHAI → dữ liệu luôn được mã hoá. Khoá: BACKUP_KEY (nếu có), nếu không dùng SYNC_TOKEN.
   Biến môi trường: GITHUB_TOKEN (bắt buộc để bật) · GITHUB_REPO (mặc định ducptclaude/Sotaycanhan)
                    BACKUP_BRANCH (mặc định sao-luu-du-lieu) · BACKUP_KEY · BACKUP_WEEKDAY (0=CN…6=T7, mặc định 0) · BACKUP_HOUR (giờ VN, mặc định 20)
   Đường dẫn (cần mã SYNC_TOKEN): GET /admin/backup/status · POST /admin/backup/run */
const crypto = require('crypto');

const VN = 7 * 3600e3; // UTC+7
function isoWeek(ms) { // tuần ISO theo giờ VN → "2026-W48"
  const d = new Date(ms + VN), day = (d.getUTCDay() + 6) % 7;
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const y = th.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4));
  return y + '-W' + String(1 + Math.round(((th - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0');
}
// Mốc sao lưu gần nhất đã qua (thứ `wd`, `hour` giờ VN)
function lastSlot(now, wd, hour) {
  const v = new Date(now + VN); let t = Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), hour) - VN;
  const back = (v.getUTCDay() - wd + 7) % 7; t -= back * 864e5; if (t > now) t -= 7 * 864e5; return t;
}
function encrypt(plain, secret) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(plain), c.final()]);
  return { v: 1, alg: 'AES-256-GCM', kdf: 'scrypt-N16384-r8-p1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
function decrypt(env, secret) {
  const key = crypto.scryptSync(secret, Buffer.from(env.salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64')); d.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(env.ct, 'base64')), d.final()]);
}
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

function createBackup({ store, sync, push, token = process.env.GITHUB_TOKEN || '', repo = process.env.GITHUB_REPO || 'ducptclaude/Sotaycanhan',
  branch = process.env.BACKUP_BRANCH || 'sao-luu-du-lieu', secret = process.env.BACKUP_KEY || process.env.SYNC_TOKEN || '',
  weekday = Number(process.env.BACKUP_WEEKDAY || 0), hour = Number(process.env.BACKUP_HOUR || 20), api = process.env.GITHUB_API || 'https://api.github.com' }) {
  let st = {}; try { st = JSON.parse(store.get('backup-state')) || {}; } catch (e) { }
  const saveSt = () => store.set('backup-state', JSON.stringify(st));
  if (!st.remindAt && !st.lastAt) { st.remindAt = Date.now(); saveSt(); } // lần chạy đầu: không nhắc ngay, đợi mốc tuần kế tiếp
  const enabled = !!(token && secret);
  let running = null;

  async function gh(method, p, body) {
    const r = await fetch(api + '/repos/' + repo + p, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'so-ca-nhan-backup', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { }
    if (!r.ok) { const e = new Error('GitHub ' + r.status + ': ' + ((j && j.message) || txt.slice(0, 120))); e.status = r.status; throw e; }
    return j;
  }
  async function readFile(p) { // đọc tệp trên nhánh sao lưu (null nếu chưa có)
    try { const j = await gh('GET', '/contents/' + p + '?ref=' + encodeURIComponent(branch)); return Buffer.from(j.content || '', 'base64').toString('utf8'); }
    catch (e) { if (e.status === 404) return null; throw e; }
  }
  // Ghi nhiều tệp trong MỘT commit; tạo nhánh mồ côi nếu chưa có
  async function commitFiles(files, message) {
    let parent = null, baseTree = null;
    try { const ref = await gh('GET', '/git/ref/heads/' + branch); parent = ref.object.sha; baseTree = (await gh('GET', '/git/commits/' + parent)).tree.sha; }
    catch (e) { if (e.status !== 404 && e.status !== 409) throw e; }
    const tree = await gh('POST', '/git/trees', { ...(baseTree ? { base_tree: baseTree } : {}), tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) });
    const commit = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: parent ? [parent] : [] });
    if (parent) await gh('PATCH', '/git/refs/heads/' + branch, { sha: commit.sha, force: false });
    else await gh('POST', '/git/refs', { ref: 'refs/heads/' + branch, sha: commit.sha });
    return commit.sha;
  }

  async function run(reason = 'manual') {
    if (!enabled) throw new Error(!token ? 'Chưa đặt GITHUB_TOKEN trên máy chủ' : 'Chưa có khoá mã hoá (SYNC_TOKEN/BACKUP_KEY)');
    if (running) return running;
    running = (async () => {
      sync.flush();
      const snap = sync.snapshot(), now = Date.now(), week = isoWeek(now);
      const plain = Buffer.from(JSON.stringify(snap)), hash = sha256(plain);
      const idxRaw = await readFile('danh-muc.json'); const idx = idxRaw ? JSON.parse(idxRaw) : { app: 'so-ca-nhan', mo_ta: 'Danh mục sao lưu – mỗi dòng 1 tuần. chain = SHA-256(chain trước + sha256).', ban_sao: [] };
      const prev = idx.ban_sao.length ? idx.ban_sao[idx.ban_sao.length - 1] : null;
      const stt = (prev ? prev.stt : 0) + 1, chain = sha256((prev ? prev.chain : '') + hash);
      const file = 'sao-luu/' + week.slice(0, 4) + '/' + week + '-' + String(stt).padStart(4, '0') + '.json.enc';
      const keyId = sha256('scn-key:' + secret).slice(0, 12); // nhận diện khoá (không lộ khoá)
      const entry = { stt, tuan: week, luc: new Date(now).toISOString(), tep: file, so_muc: snap.count, seq: snap.seq, epoch: snap.epoch, sha256: hash, truoc: prev ? prev.chain : '', chain, khoa: keyId, ly_do: reason };
      idx.ban_sao.push(entry);
      const env = { ...encrypt(plain, secret), stt, tuan: week, sha256: hash, khoa: keyId };
      const files = [{ path: file, content: JSON.stringify(env) }, { path: 'danh-muc.json', content: JSON.stringify(idx, null, 1) }];
      if (!idxRaw) files.push({ path: 'README.md', content: '# Sao lưu Sổ Cá Nhân\n\nNhánh tự động – mỗi tuần một bản sao lưu **đã mã hoá** (AES-256-GCM).\n\n- `danh-muc.json`: danh sách bản sao, mã băm SHA-256 và chuỗi băm để kiểm tra toàn vẹn.\n- Giải mã / kiểm tra: `node server/kiem-tra-sao-luu.js` (xem hướng dẫn trong nhánh main).\n' });
      const commit = await commitFiles(files, `Sao lưu ${week} #${stt} · ${snap.count} mục · sha256 ${hash.slice(0, 12)}`);
      st = { lastAt: now, lastWeek: week, lastStt: stt, lastFile: file, lastCount: snap.count, lastHash: hash, lastChain: chain, lastCommit: commit, lastError: '', lastErrorAt: 0 }; saveSt();
      console.log('Đã sao lưu lên GitHub:', file, snap.count, 'mục');
      if (push) push.broadcast({ kind: 'backup', title: '🗄️ Đã sao lưu dữ liệu tuần', body: `${week} · ${snap.count.toLocaleString('vi-VN')} mục · đã mã hoá lên GitHub (nhánh ${branch})`, tag: 'scn-backup', url: './' }).catch(() => { });
      return { ...entry, commit };
    })().catch(e => {
      st.lastError = e.message; st.lastErrorAt = Date.now(); saveSt(); console.error('Sao lưu GitHub lỗi:', e.message);
      if (push) push.broadcast({ kind: 'backup', title: '⚠️ Sao lưu tuần chưa thành công', body: e.message.slice(0, 120) + ' – hãy tải tệp sao lưu thủ công.', tag: 'scn-backup', url: './' }).catch(() => { });
      throw e;
    }).finally(() => { running = null; });
    return running;
  }

  // Kiểm tra mỗi giờ: đã tới mốc tuần mà chưa sao lưu → chạy. Chưa cấu hình GitHub → gửi nhắc tải sao lưu thủ công.
  function tick() {
    const now = Date.now(), slot = lastSlot(now, weekday, hour);
    if (enabled) { if ((st.lastAt || 0) < slot && !(st.lastErrorAt > slot && now - st.lastErrorAt < 6 * 3600e3)) run('weekly').catch(() => { }); }
    else if (push && (st.remindAt || 0) < slot) {
      st.remindAt = now; saveSt();
      push.broadcast({ kind: 'backup', title: '🗄️ Nhắc sao lưu hằng tuần', body: 'Mở app → nút trạng thái → Tải tệp sao lưu (.json) để giữ bản sao dữ liệu.', tag: 'scn-backup', url: './' }).catch(() => { });
    }
  }
  setTimeout(tick, 30000).unref(); setInterval(tick, 3600e3).unref();

  function handle(req, res) {
    const url = req.url.split('?')[0];
    if (url !== '/admin/backup/status' && url !== '/admin/backup/run') return false;
    if (!sync.auth(req, res)) return true;
    const slot = lastSlot(Date.now(), weekday, hour);
    if (url === '/admin/backup/status') { sync.send(res, 200, { enabled, repo, branch, schedule: { weekday, hour, tz: 'Asia/Ho_Chi_Minh', next: new Date(slot + 7 * 864e5).toISOString() }, ...st }); return true; }
    if (req.method !== 'POST') { sync.send(res, 405, { error: 'method not allowed' }); return true; }
    run('manual').then(r => sync.send(res, 200, { ok: true, ...r })).catch(e => sync.send(res, 500, { error: e.message }));
    return true;
  }
  return { handle, run, enabled, info: () => ({ enabled, branch, lastAt: st.lastAt || 0 }) };
}
module.exports = { createBackup, encrypt, decrypt, sha256, isoWeek, lastSlot };
