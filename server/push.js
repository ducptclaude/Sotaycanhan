/* Thông báo đẩy (Web Push) cho Sổ Cá Nhân.
   - Khoá VAPID: lấy từ biến VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, nếu không có thì tự tạo và lưu cạnh dữ liệu (Volume).
     Khoá đổi (VD mất Volume) → app tự đăng ký lại.
   - Khi một thiết bị THÊM dữ liệu mới, máy chủ gom trong vài giây rồi báo các thiết bị KHÁC (bỏ qua thiết bị đang mở app – đã nhận tức thời).
   Đường dẫn (cần mã SYNC_TOKEN): GET /push/key · POST /push/subscribe · POST /push/unsubscribe · POST /push/test */
const crypto = require('crypto');
let webpush = null; try { webpush = require('web-push'); } catch (e) { }

const LABELS = { txns: 'giao dịch', events: 'sự kiện', todos: 'việc cần làm', notes: 'ghi chú', journal: 'nhật ký', health: 'chỉ số sức khỏe', loans: 'khoản vay/nợ', savings: 'khoản tiết kiệm', assets: 'tài sản', accounts: 'tài khoản', goals: 'mục tiêu', contacts: 'liên hệ', meds: 'thuốc', courses: 'khóa học', books: 'sách', study: 'buổi học', cards: 'thẻ từ', habits: 'thói quen' };
const vnd = n => (Math.round(Number(n) || 0)).toLocaleString('vi-VN') + ' đ';

function createPush({ store, sync, subject = 'mailto:admin@localhost', isLive = () => false, quietMs = 6000 }) {
  let keys = null;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else { try { keys = JSON.parse(store.get('vapid')); } catch (e) { } }
  if (webpush && (!keys || !keys.publicKey)) { keys = webpush.generateVAPIDKeys(); store.set('vapid', JSON.stringify(keys)); }
  const enabled = !!(webpush && keys);
  if (enabled) webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  let subs = {}; try { subs = JSON.parse(store.get('push-subs')) || {}; } catch (e) { }
  const saveSubs = () => store.set('push-subs', JSON.stringify(subs));
  const keyOf = ep => crypto.createHash('sha256').update(String(ep)).digest('hex').slice(0, 24);
  const names = {}; Object.values(subs).forEach(s => { if (s.device) names[s.device] = s.name; });

  async function sendTo(list, payload) {
    if (!enabled) return { sent: 0, failed: 0 };
    let sent = 0, failed = 0, dirty = false;
    await Promise.all(list.map(async ([k, s]) => {
      try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 24 * 3600, urgency: payload.urgency || 'normal', topic: payload.topic }); sent++; s.lastOk = Date.now(); dirty = true; }
      catch (e) { failed++; if (e.statusCode === 404 || e.statusCode === 410) { delete subs[k]; dirty = true; } else console.warn('Gửi thông báo lỗi:', e.statusCode || e.message); }
    }));
    if (dirty) saveSubs();
    return { sent, failed };
  }
  // Gửi tới mọi thiết bị trừ `exceptDevice`; skipLive: bỏ qua thiết bị đang mở app (đã thấy dữ liệu ngay)
  function broadcast(payload, { exceptDevice = '', skipLive = false } = {}) {
    const list = Object.entries(subs).filter(([, s]) => s.device !== exceptDevice && !(skipLive && isLive(s.device)) && (!payload.kind || !s.prefs || s.prefs[payload.kind] !== false));
    return sendTo(list, payload);
  }

  // ---- Gom thay đổi để báo "vừa thêm thông tin" ----
  const pend = new Map(); // device nguồn → { counts, txSum, one, timer }
  function onChange({ device, applied }) {
    if (!enabled || !Object.keys(subs).length) return;
    const fresh = applied.filter(a => a.op === 'put' && a.isNew && a.ts > 1 && LABELS[a.col]); // chỉ dữ liệu MỚI, bỏ dữ liệu mẫu (ts = 1)
    if (!fresh.length) return;
    const p = pend.get(device) || { counts: {}, n: 0, last: null }; pend.set(device, p);
    fresh.forEach(a => { p.counts[a.col] = (p.counts[a.col] || 0) + 1; p.n++; p.last = a; });
    clearTimeout(p.timer); p.timer = setTimeout(() => flushPend(device), quietMs);
  }
  function describe(p) {
    if (p.n === 1 && p.last) {
      const d = p.last.data || {};
      if (p.last.col === 'txns') return ({ income: 'Thu ', expense: 'Chi ', transfer: 'Chuyển khoản ', loan_pay: 'Trả nợ ', asset_buy: 'Mua tài sản ', asset_sell: 'Bán tài sản ' }[d.type] || 'Giao dịch ') + vnd(d.amount) + (d.category ? ' · ' + d.category : '') + (d.note ? ' · ' + String(d.note).slice(0, 60) : '');
      const t = d.title || d.name || d.text || '';
      return 'Thêm ' + LABELS[p.last.col] + (t ? ': ' + String(t).slice(0, 80) : '');
    }
    return 'Thêm ' + Object.entries(p.counts).map(([c, n]) => n + ' ' + LABELS[c]).join(', ');
  }
  function flushPend(device) {
    const p = pend.get(device); pend.delete(device); if (!p) return;
    const from = names[device] ? ' · từ ' + names[device] : '';
    broadcast({ kind: 'data', title: '📥 Sổ Cá Nhân – dữ liệu mới', body: describe(p) + from, tag: 'scn-data', url: p.counts.txns ? './#lich-su-gd' : './#tong-quan', sync: true, topic: 'scn-data' }, { exceptDevice: device, skipLive: true })
      .catch(e => console.error('push:', e.message));
  }

  function handle(req, res) {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/push/')) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (!sync.auth(req, res)) return true;
    if (!enabled) { sync.send(res, 503, { error: 'Máy chủ chưa bật thông báo đẩy' }); return true; }
    if (url === '/push/key' && req.method === 'GET') { sync.send(res, 200, { publicKey: keys.publicKey }); return true; }
    if (req.method !== 'POST') { sync.send(res, 405, { error: 'method not allowed' }); return true; }
    sync.readJson(req, res, async q => {
      if (url === '/push/subscribe') {
        const sub = q.sub || {};
        if (!sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return sync.send(res, 400, { error: 'Đăng ký không hợp lệ' });
        const device = String(q.device || '').slice(0, 64), name = String(q.name || '').slice(0, 40);
        // mỗi thiết bị chỉ giữ 1 đăng ký mới nhất
        const oldPrefs = (Object.values(subs).find(x => x.device === device) || {}).prefs; // giữ tuỳ chọn khi đăng ký lại
        Object.keys(subs).forEach(k => { if (device && subs[k].device === device && subs[k].sub.endpoint !== sub.endpoint) delete subs[k]; });
        const k = keyOf(sub.endpoint);
        subs[k] = { sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, device, name, prefs: q.prefs || oldPrefs || {}, created: (subs[k] && subs[k].created) || Date.now() };
        if (device) names[device] = name; saveSubs();
        return sync.send(res, 200, { ok: true, devices: Object.keys(subs).length });
      }
      if (url === '/push/unsubscribe') {
        Object.keys(subs).forEach(k => { if ((q.endpoint && subs[k].sub.endpoint === q.endpoint) || (q.device && subs[k].device === q.device)) delete subs[k]; });
        saveSubs(); return sync.send(res, 200, { ok: true });
      }
      if (url === '/push/list') {
        return sync.send(res, 200, { devices: Object.values(subs).map(s => ({ device: s.device, name: s.name, created: s.created, lastOk: s.lastOk || 0, prefs: s.prefs || {} })) });
      }
      if (url === '/push/prefs') { // tuỳ chọn loại thông báo của 1 thiết bị: { data: true/false, backup: true/false }
        const p = q.prefs || {}, clean = {}; ['data', 'backup'].forEach(k => { if (typeof p[k] === 'boolean') clean[k] = p[k]; });
        let n = 0; Object.values(subs).forEach(s => { if (s.device === String(q.device || '')) { s.prefs = { ...(s.prefs || {}), ...clean }; n++; } });
        if (n) saveSubs(); return sync.send(res, 200, { ok: true, updated: n });
      }
      if (url === '/push/test') {
        const list = Object.entries(subs).filter(([, s]) => !q.device || s.device === q.device);
        const r = await sendTo(list, { kind: 'test', title: '🔔 Sổ Cá Nhân', body: 'Thông báo đã hoạt động trên thiết bị này.', tag: 'scn-test', url: './' });
        return sync.send(res, 200, { ok: true, ...r });
      }
      sync.send(res, 404, { error: 'not found' });
    });
    return true;
  }
  // Thiết bị bị thu hồi / đăng xuất → xoá đăng ký thông báo (máy bị mất không nhận nội dung nữa)
  function removeDevices(mode, device) {
    let n = 0; Object.keys(subs).forEach(k => { const d = subs[k].device; if ((mode === 'device' && d === device) || (mode === 'others' && d !== device) || mode === 'all') { delete subs[k]; n++; } });
    if (n) saveSubs(); return n;
  }
  return { handle, onChange, broadcast, enabled, removeDevices, info: () => ({ enabled, devices: Object.keys(subs).length }) };
}
module.exports = { createPush };
