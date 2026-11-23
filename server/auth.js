/* Tài khoản chủ của Sổ Cá Nhân: ID / SĐT + mật khẩu, khoá truy cập (passkey: vân tay, Face ID, Windows Hello).
   - Chưa tạo tài khoản: dữ liệu mở bằng SYNC_TOKEN như cũ. Tạo tài khoản cần SYNC_TOKEN (chứng minh là chủ).
   - Đã tạo tài khoản: dữ liệu CHỈ mở bằng phiên đăng nhập của từng thiết bị (thu hồi được). SYNC_TOKEN chỉ còn dùng
     để khôi phục khi quên mật khẩu (POST /auth/reset).
   - Mật khẩu băm scrypt; chỉ lưu mã băm của phiên; sai mật khẩu nhiều lần → khoá tạm theo IP.
   - ID, SĐT là thông tin riêng: không trả ra ở đường dẫn công khai. */
const crypto = require('crypto');
const WA = require('@simplewebauthn/server');

const SESSION_DAYS = 180, MAX_SESSIONS = 30;
const b64u = b => Buffer.from(b).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(String(pw).normalize('NFKC'), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
const normId = s => String(s || '').trim().toLowerCase();
function normPhone(s) {
  let p = String(s || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3); else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  return p.replace(/\D/g, '');
}
const validId = id => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(id);
const validPhone = p => /^0\d{9,10}$/.test(p);

function createAuth({ store, syncToken = process.env.SYNC_TOKEN || '', rpName = 'Sổ Cá Nhân' }) {
  let acc = null; try { acc = JSON.parse(store.get('auth')); } catch (e) { }
  const save = () => store.set('auth', JSON.stringify(acc));
  let onRevoke = () => { };
  const flows = new Map(); // mã luồng → { challenge, type, exp }
  const fails = new Map(); // ip → { n, until }
  let globalFails = [];

  // ---- Chống dò mật khẩu ----
  const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  function blocked(req) {
    const f = fails.get(ipOf(req)), now = Date.now(); globalFails = globalFails.filter(t => now - t < 3600e3);
    if (f && f.until > now) return Math.ceil((f.until - now) / 60000);
    if (globalFails.length > 100) return 10; // quá nhiều lần sai trên toàn hệ thống trong 1 giờ
    return 0;
  }
  function failed(req) {
    const ip = ipOf(req), f = fails.get(ip) || { n: 0, until: 0 }; f.n++; globalFails.push(Date.now());
    if (f.n >= 5) { f.until = Date.now() + 15 * 60000 * Math.pow(2, Math.min(f.n - 5, 4)); } // 15, 30, 60… phút
    fails.set(ip, f);
  }
  const succeeded = req => fails.delete(ipOf(req));

  // ---- Phiên đăng nhập ----
  function newSession(req, q, via) {
    const token = b64u(crypto.randomBytes(32)), sid = b64u(crypto.randomBytes(6)), now = Date.now();
    acc.sessions = acc.sessions || {};
    acc.sessions[sha(token)] = { sid, device: String(q.device || '').slice(0, 64), name: String(q.name || '').slice(0, 40), via, created: now, seen: now };
    const list = Object.entries(acc.sessions).sort((a, b) => b[1].seen - a[1].seen); // giữ tối đa 30 phiên mới nhất
    list.slice(MAX_SESSIONS).forEach(([k]) => delete acc.sessions[k]);
    save(); return token;
  }
  function sessionOf(header) {
    if (!acc || !/^Bearer /.test(header || '')) return null;
    const k = sha(String(header).slice(7)), s = acc.sessions && acc.sessions[k];
    if (!s) return null;
    if (Date.now() - s.seen > SESSION_DAYS * 864e5) { delete acc.sessions[k]; save(); return null; }
    if (Date.now() - s.seen > 600e3) { s.seen = Date.now(); save(); } // cập nhật "lần cuối" tối đa 10 phút/lần
    return { key: k, ...s };
  }
  // Dùng cho mọi đường dẫn dữ liệu (/sync, /events, /push, /admin…)
  function check(header) {
    if (!acc) return !!syncToken && eq(String(header || ''), 'Bearer ' + syncToken); // chưa có tài khoản: như cũ
    return !!sessionOf(header);
  }
  const info = () => ({ setup: !!acc, passkeys: acc ? (acc.passkeys || []).length : 0 });

  // ---- WebAuthn: tên miền & nguồn theo yêu cầu (hoặc biến RP_ID / RP_ORIGIN) ----
  function rp(req) {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const proto = String(req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
    return { rpID: process.env.RP_ID || host.replace(/:\d+$/, ''), origin: process.env.RP_ORIGIN || proto + '://' + host };
  }
  function newFlow(type, challenge) {
    const id = b64u(crypto.randomBytes(12)), now = Date.now();
    for (const [k, v] of flows) if (v.exp < now) flows.delete(k);
    flows.set(id, { type, challenge, exp: now + 5 * 60000 }); return id;
  }
  function takeFlow(id, type) { const f = flows.get(String(id || '')); flows.delete(String(id || '')); return f && f.type === type && f.exp > Date.now() ? f : null; }
  const me = s => ({ id: acc.id, phone: acc.phone || '', created: acc.created,
    passkeys: (acc.passkeys || []).map(p => ({ id: p.id.slice(0, 10), name: p.name, created: p.created, used: p.used || 0 })),
    sessions: Object.values(acc.sessions || {}).sort((a, b) => b.seen - a.seen).map(x => ({ sid: x.sid, name: x.name, via: x.via, created: x.created, seen: x.seen, current: s && x.sid === s.sid })) });

  function handle(req, res, sync) {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/auth/')) return false;
    const send = (c, o) => sync.send(res, c, o);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (url === '/auth/status' && req.method === 'GET') { send(200, info()); return true; }
    if (req.method !== 'POST' && url !== '/auth/me') { send(405, { error: 'method not allowed' }); return true; }
    const needSession = ['/auth/me', '/auth/passkey/register-options', '/auth/passkey/register', '/auth/passkey/delete', '/auth/profile', '/auth/password', '/auth/logout', '/auth/revoke'].includes(url);
    const s = needSession ? sessionOf(req.headers.authorization) : null;
    if (needSession && !s) { send(401, { error: acc ? 'Phiên đăng nhập đã hết hạn – hãy đăng nhập lại' : 'Chưa tạo tài khoản' }); return true; }
    if (url === '/auth/me') { send(200, me(s)); return true; }
    const isLogin = ['/auth/login', '/auth/reset', '/auth/setup', '/auth/passkey/login', '/auth/password', '/auth/profile'].includes(url);
    if (isLogin) { const m = blocked(req); if (m) { send(429, { error: `Sai quá nhiều lần – thử lại sau ${m} phút` }); return true; } }

    sync.readJson(req, res, async q => {
      try {
        if (url === '/auth/setup') {
          if (acc) return send(409, { error: 'Tài khoản chủ đã được tạo' });
          if (!syncToken) return send(503, { error: 'Máy chủ chưa đặt SYNC_TOKEN' });
          if (!eq(q.syncToken || '', syncToken)) { failed(req); return send(403, { error: 'Mã SYNC_TOKEN không đúng' }); }
          const id = normId(q.id), phone = normPhone(q.phone);
          if (!validId(id)) return send(400, { error: 'ID 3–32 ký tự: chữ thường không dấu, số, dấu . _ -' });
          if (q.phone && !validPhone(phone)) return send(400, { error: 'Số điện thoại không hợp lệ (VD 0912345678)' });
          if (String(q.password || '').length < 8) return send(400, { error: 'Mật khẩu tối thiểu 8 ký tự' });
          const salt = crypto.randomBytes(16);
          acc = { id, phone, pw: { salt: salt.toString('base64'), hash: (await scrypt(q.password, salt)).toString('base64') }, uid: b64u(crypto.randomBytes(16)), passkeys: [], sessions: {}, created: Date.now() };
          succeeded(req); const token = newSession(req, q, 'setup'); onRevoke('all');
          return send(200, { ok: true, token, account: me(sessionOf('Bearer ' + token)) });
        }
        if (url === '/auth/login' || url === '/auth/reset') {
          if (!acc) return send(404, { error: 'Chưa tạo tài khoản' });
          if (url === '/auth/reset') {
            if (!syncToken || !eq(q.syncToken || '', syncToken)) { failed(req); return send(403, { error: 'Mã SYNC_TOKEN không đúng' }); }
            if (String(q.password || '').length < 8) return send(400, { error: 'Mật khẩu tối thiểu 8 ký tự' });
            const salt = crypto.randomBytes(16); acc.pw = { salt: salt.toString('base64'), hash: (await scrypt(q.password, salt)).toString('base64') };
            acc.sessions = {}; onRevoke('all'); // đăng xuất mọi thiết bị
          } else {
            const l = String(q.login || '').trim(), ok = (normId(l) === acc.id || (acc.phone && normPhone(l) === acc.phone)) && eq((await scrypt(q.password || '', Buffer.from(acc.pw.salt, 'base64'))).toString('base64'), acc.pw.hash);
            if (!ok) { failed(req); return send(401, { error: 'Sai ID/SĐT hoặc mật khẩu' }); }
          }
          succeeded(req); const token = newSession(req, q, url === '/auth/reset' ? 'reset' : 'password');
          return send(200, { ok: true, token, account: me(sessionOf('Bearer ' + token)) });
        }
        if (url === '/auth/passkey/login-options') {
          if (!acc || !(acc.passkeys || []).length) return send(404, { error: 'Chưa có vân tay / khoá truy cập nào' });
          const { rpID } = rp(req);
          const options = await WA.generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: acc.passkeys.map(p => ({ id: p.id, transports: p.transports })) });
          return send(200, { flow: newFlow('login', options.challenge), options });
        }
        if (url === '/auth/passkey/login') {
          const f = takeFlow(q.flow, 'login'), r = q.response || {}, pk = acc && (acc.passkeys || []).find(p => p.id === r.id);
          if (!f || !pk) { failed(req); return send(400, { error: 'Xác thực không hợp lệ hoặc đã hết hạn' }); }
          const { rpID, origin } = rp(req);
          const v = await WA.verifyAuthenticationResponse({ response: r, expectedChallenge: f.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
            credential: { id: pk.id, publicKey: Buffer.from(pk.publicKey, 'base64url'), counter: pk.counter || 0, transports: pk.transports } }).catch(e => ({ verified: false, err: e.message }));
          if (!v.verified) { failed(req); return send(401, { error: 'Xác thực vân tay / khoá truy cập không thành công' }); }
          pk.counter = v.authenticationInfo.newCounter; pk.used = Date.now();
          succeeded(req); const token = newSession(req, q, 'passkey');
          return send(200, { ok: true, token, account: me(sessionOf('Bearer ' + token)) });
        }
        // ---- Các thao tác cần đã đăng nhập ----
        if (url === '/auth/passkey/register-options') {
          const { rpID } = rp(req);
          const options = await WA.generateRegistrationOptions({ rpName, rpID, userName: acc.id, userDisplayName: acc.id, userID: Buffer.from(acc.uid, 'base64url'), attestationType: 'none',
            excludeCredentials: (acc.passkeys || []).map(p => ({ id: p.id, transports: p.transports })),
            authenticatorSelection: { residentKey: 'preferred', userVerification: 'required', authenticatorAttachment: 'platform' } });
          return send(200, { flow: newFlow('register', options.challenge), options });
        }
        if (url === '/auth/passkey/register') {
          const f = takeFlow(q.flow, 'register'); if (!f) return send(400, { error: 'Yêu cầu đã hết hạn, thử lại' });
          const { rpID, origin } = rp(req);
          const v = await WA.verifyRegistrationResponse({ response: q.response, expectedChallenge: f.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(e => ({ verified: false, err: e.message }));
          if (!v.verified) return send(400, { error: 'Không đăng ký được: ' + (v.err || 'xác thực thất bại') });
          const c = v.registrationInfo.credential;
          acc.passkeys = (acc.passkeys || []).filter(p => p.id !== c.id);
          acc.passkeys.push({ id: c.id, publicKey: b64u(c.publicKey), counter: c.counter, transports: c.transports || q.response.response.transports || [], name: String(q.name || 'Thiết bị').slice(0, 40), created: Date.now() });
          save(); return send(200, { ok: true, account: me(s) });
        }
        if (url === '/auth/passkey/delete') { acc.passkeys = (acc.passkeys || []).filter(p => !p.id.startsWith(String(q.id || '-'))); save(); return send(200, { ok: true, account: me(s) }); }
        if (url === '/auth/password' || url === '/auth/profile') {
          const okPw = eq((await scrypt(q.current || '', Buffer.from(acc.pw.salt, 'base64'))).toString('base64'), acc.pw.hash);
          if (!okPw) { failed(req); return send(401, { error: 'Mật khẩu hiện tại không đúng' }); }
          succeeded(req);
          if (url === '/auth/password') {
            if (String(q.password || '').length < 8) return send(400, { error: 'Mật khẩu mới tối thiểu 8 ký tự' });
            const salt = crypto.randomBytes(16); acc.pw = { salt: salt.toString('base64'), hash: (await scrypt(q.password, salt)).toString('base64') };
            if (q.logoutOthers) { Object.keys(acc.sessions).forEach(k => { if (k !== s.key) delete acc.sessions[k]; }); onRevoke('others', s.device); }
          } else {
            const id = q.id != null ? normId(q.id) : acc.id, phone = q.phone != null ? normPhone(q.phone) : acc.phone;
            if (!validId(id)) return send(400, { error: 'ID 3–32 ký tự: chữ thường không dấu, số, dấu . _ -' });
            if (phone && !validPhone(phone)) return send(400, { error: 'Số điện thoại không hợp lệ (VD 0912345678)' });
            acc.id = id; acc.phone = phone;
          }
          save(); return send(200, { ok: true, account: me(s) });
        }
        if (url === '/auth/logout') { delete acc.sessions[s.key]; save(); onRevoke('device', s.device); return send(200, { ok: true }); }
        if (url === '/auth/revoke') {
          let n = 0; Object.entries(acc.sessions).forEach(([k, x]) => { if ((q.all && k !== s.key) || x.sid === q.sid) { delete acc.sessions[k]; n++; onRevoke('device', x.device); } });
          save(); return send(200, { ok: true, revoked: n, account: me(s) });
        }
        send(404, { error: 'not found' });
      } catch (e) { console.error('auth:', e); send(500, { error: 'Lỗi máy chủ' }); }
    });
    return true;
  }
  return { handle, check, info, setOnRevoke: fn => { onRevoke = fn; } };
}
module.exports = { createAuth, normPhone };
