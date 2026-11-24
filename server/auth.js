/* Tài khoản chủ của Sổ Cá Nhân: ID / SĐT + mật khẩu, sinh trắc thiết bị (vân tay, Face ID, Windows Hello – khoá gắn chặt thiết bị, CSDL riêng).
   - Chưa tạo tài khoản: dữ liệu mở bằng SYNC_TOKEN như cũ. Tạo tài khoản cần SYNC_TOKEN (chứng minh là chủ).
   - Đã tạo tài khoản: dữ liệu CHỈ mở bằng phiên đăng nhập của từng thiết bị (thu hồi được). SYNC_TOKEN chỉ còn dùng
     để khôi phục khi quên mật khẩu (POST /auth/reset).
   - Mật khẩu băm scrypt; chỉ lưu mã băm của phiên; sai mật khẩu nhiều lần → khoá tạm theo IP.
   - ID, SĐT là thông tin riêng: không trả ra ở đường dẫn công khai. */
const crypto = require('crypto');
const WA = require('@simplewebauthn/server');

const SESSION_DAYS = 180, MAX_SESSIONS = 30;
// AAGUID (mã loại bộ xác thực, nằm trong dữ liệu đăng ký WebAuthn) → nhận diện nơi giữ khoá.
// synced: trình quản lý passkey ĐỒNG BỘ đám mây → chặn thêm một lớp (ngoài cờ sao lưu BE/BS).
const AAGUID = {
  '08987058-cadc-4b81-b6e1-30de50dcbe96': { name: 'Windows Hello', synced: false }, '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { name: 'Windows Hello', synced: false },
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { name: 'Windows Hello', synced: false }, 'adce0002-35bc-c60a-648b-0b25f1f05503': { name: 'Chrome trên Mac (Touch ID)', synced: false },
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': { name: 'Google Password Manager', synced: true }, 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': { name: 'iCloud Keychain', synced: true },
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': { name: 'iCloud Keychain (quản lý)', synced: true }, 'bada5566-a7aa-401f-bd96-45619a55120d': { name: '1Password', synced: true },
  'd548826e-79b4-db40-a3d8-11116f7e8349': { name: 'Bitwarden', synced: true }, '531126d6-e717-415c-9320-3d9aa6981239': { name: 'Dashlane', synced: true },
};
const aaguidInfo = g => AAGUID[String(g || '').toLowerCase()] || null;
// Xác thực lại cho thao tác nhạy cảm (như app ngân hàng yêu cầu sinh trắc khi chuyển khoản lớn): hiệu lực STEPUP_SEC giây (mặc định 5 phút)
const STEP_MS = Number(process.env.STEPUP_SEC || 300) * 1000;
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

function createAuth({ store, bio, syncToken = process.env.SYNC_TOKEN || '', rpName = 'Sổ Cá Nhân' }) {
  // Chính sách sinh trắc (bản 1.12): iPhone (iCloud Keychain) & Android (Google Password Manager) LUÔN tạo khoá đồng bộ cho web →
  // mặc định CHẤP NHẬN khoá đồng bộ nhưng BẮT BUỘC GẮN MÁY: mỗi khoá kèm 1 mã gắn máy bí mật (256 bit, chỉ lưu trên máy đã đăng ký,
  // máy chủ giữ SHA-256). Máy khác dù nhận được khoá đồng bộ cũng không có mã → bị từ chối. BIO_DEVICE_ONLY=1: quay lại chỉ nhận khoá 1 thiết bị.
  const ALLOW_SYNCED = process.env.BIO_DEVICE_ONLY !== '1';
  const bindH = v => crypto.createHash('sha256').update(String(v || '')).digest('base64url');
  const validBind = v => /^[A-Za-z0-9_-]{43}$/.test(String(v || ''));
  const bindOk = (pk, v) => pk.bindHash ? validBind(v) && eq(bindH(v), pk.bindHash) : !(pk.deviceType === 'multiDevice' || pk.backedUp); // khoá cũ 1 thiết bị (chưa có mã) vẫn dùng được
  let acc = null; try { acc = JSON.parse(store.get('auth')); } catch (e) { }
  const save = () => store.set('auth', JSON.stringify(acc));
  // Chuyển khoá cũ (bản ≤ 1.8, lưu chung hồ sơ) sang CSDL sinh trắc riêng – đánh dấu 'chưa rõ loại' để kiểm lại khi dùng
  if (acc && (acc.passkeys || []).length) { acc.passkeys.forEach(p => bio.put({ ...p, device: p.device || '', deviceType: 'unknown', backedUp: false })); delete acc.passkeys; save(); }
  let onRevoke = () => { };
  const flows = new Map(); // mã luồng → { challenge, type, exp }
  const fails = new Map(); // ip → { n, until }
  let globalFails = [], acctFails = [], acctUntil = 0;

  // ---- Chống dò mật khẩu ----
  // Phần ĐẦU X-Forwarded-For do người gửi tự đặt được → lấy phần CUỐI (do proxy Railway thêm vào)
  const ipOf = req => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean); return x.length ? x[x.length - 1] : String(req.socket.remoteAddress || ''); };
  // pwOnly: chỉ áp dụng khoá theo TÀI KHOẢN cho đăng nhập bằng mật khẩu (vân tay không dò được nên vẫn cho dùng)
  function blocked(req, pwOnly) {
    const f = fails.get(ipOf(req)), now = Date.now(); globalFails = globalFails.filter(t => now - t < 3600e3); acctFails = acctFails.filter(t => now - t < 15 * 60000);
    if (f && f.until > now) return Math.ceil((f.until - now) / 60000);
    if (pwOnly && acctUntil > now) return Math.ceil((acctUntil - now) / 60000); // khoá theo tài khoản: chống dò bằng nhiều địa chỉ IP
    if (globalFails.length > 100) return 10; // quá nhiều lần sai trên toàn hệ thống trong 1 giờ
    return 0;
  }
  let acctLocks = 0;
  function failed(req) {
    const ip = ipOf(req), f = fails.get(ip) || { n: 0, until: 0 }; f.n++; globalFails.push(Date.now()); acctFails.push(Date.now());
    if (acctFails.length >= 10) { acctLocks++; acctUntil = Date.now() + 15 * 60000 * Math.pow(2, Math.min(acctLocks - 1, 4)); acctFails = []; } // 10 lần sai / 15 phút (mọi IP) → khoá mật khẩu
    if (f.n >= 5) { f.until = Date.now() + 15 * 60000 * Math.pow(2, Math.min(f.n - 5, 4)); } // 15, 30, 60… phút
    fails.set(ip, f);
  }
  const succeeded = req => { fails.delete(ipOf(req)); acctFails = []; };

  // ---- Phiên đăng nhập ----
  function newSession(req, q, via) {
    const token = b64u(crypto.randomBytes(32)), sid = b64u(crypto.randomBytes(6)), now = Date.now();
    acc.sessions = acc.sessions || {};
    acc.sessions[sha(token)] = { sid, device: String(q.device || '').slice(0, 64), name: String(q.name || '').slice(0, 40), via, created: now, seen: now, stepUp: now }; // vừa đăng nhập = vừa xác thực
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
  const info = () => ({ setup: !!acc, passkeys: acc ? bio.count() : 0 });
  const markStep = s => { if (s && acc.sessions[s.key]) { acc.sessions[s.key].stepUp = Date.now(); save(); } };
  const stepFresh = s => !!(s && acc && acc.sessions[s.key] && Date.now() - (acc.sessions[s.key].stepUp || 0) < STEP_MS);
  // Dùng cho đường dẫn ngoài auth (VD /admin/export): chưa có tài khoản thì không áp dụng
  function stepUpOk(header) { if (!acc) return true; return stepFresh(sessionOf(header)); }

  // ---- WebAuthn: tên miền & nguồn theo yêu cầu (hoặc biến RP_ID / RP_ORIGIN) ----
  function rp(req) {
    // Cố định theo RP_ID / tên miền Railway; chỉ khi chạy thử cục bộ mới lấy theo Host (không tin X-Forwarded-Host)
    const pub = process.env.RAILWAY_PUBLIC_DOMAIN || '';
    if (process.env.RP_ID || pub) { const id = process.env.RP_ID || pub; return { rpID: id, origin: process.env.RP_ORIGIN || 'https://' + id }; }
    const host = String(req.headers.host || 'localhost').trim(), local = /^(localhost|127\.)/.test(host);
    return { rpID: host.replace(/:\d+$/, ''), origin: (local ? 'http' : 'https') + '://' + host };
  }
  function newFlow(type, challenge) {
    const id = b64u(crypto.randomBytes(12)), now = Date.now();
    for (const [k, v] of flows) if (v.exp < now) flows.delete(k);
    if (flows.size > 500) flows.delete(flows.keys().next().value); // chặn làm đầy bộ nhớ
    flows.set(id, { type, challenge, exp: now + 5 * 60000 }); return id;
  }
  function takeFlow(id, type) { const f = flows.get(String(id || '')); flows.delete(String(id || '')); return f && f.type === type && f.exp > Date.now() ? f : null; }
  const me = s => ({ id: acc.id, phone: acc.phone || '', created: acc.created,
    passkeys: bio.all().map(p => ({ id: p.id.slice(0, 10), name: p.name, created: p.created, used: p.used || 0, deviceType: p.deviceType, bound: !!p.bindHash, mine: !!(s && p.device === s.device), provider: (aaguidInfo(p.aaguid) || {}).name || '' })),
    stepUpLeft: s && acc.sessions[s.key] ? Math.max(0, Math.round((STEP_MS - (Date.now() - (acc.sessions[s.key].stepUp || 0))) / 1000)) : 0,
    bioDb: bio.kind, bioPolicy: ALLOW_SYNCED ? 'synced-bound' : 'device-only',
    sessions: Object.values(acc.sessions || {}).sort((a, b) => b.seen - a.seen).map(x => ({ sid: x.sid, name: x.name, via: x.via, created: x.created, seen: x.seen, current: s && x.sid === s.sid, device: x.device })) });

  function handle(req, res, sync) {
    const url = req.url.split('?')[0].replace('/auth/passkey/', '/auth/bio/');
    if (!url.startsWith('/auth/')) return false;
    const send = (c, o) => sync.send(res, c, o);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (url === '/auth/status' && req.method === 'GET') { send(200, info()); return true; }
    if (req.method !== 'POST' && url !== '/auth/me') { send(405, { error: 'method not allowed' }); return true; }
    const needSession = ['/auth/stepup', '/auth/me', '/auth/bio/register-options', '/auth/bio/register', '/auth/bio/delete', '/auth/profile', '/auth/password', '/auth/logout', '/auth/revoke'].includes(url);
    const s = needSession || url.startsWith('/auth/bio/unlock') ? sessionOf(req.headers.authorization) : null;
    if (needSession && !s) { send(401, { error: acc ? 'Phiên đăng nhập đã hết hạn – hãy đăng nhập lại' : 'Chưa tạo tài khoản' }); return true; }
    if (url === '/auth/me') { send(200, me(s)); return true; }
    const isLogin = ['/auth/login', '/auth/reset', '/auth/setup', '/auth/bio/login', '/auth/bio/unlock', '/auth/password', '/auth/profile', '/auth/stepup'].includes(url);
    // Thao tác nhạy cảm: thêm / xoá sinh trắc, thu hồi thiết bị → phải vừa xác thực lại (sinh trắc hoặc mật khẩu) trong STEPUP_SEC
    if (['/auth/bio/register-options', '/auth/bio/delete', '/auth/revoke'].includes(url) && !stepFresh(s)) { send(403, { error: 'Cần xác thực lại bằng vân tay / Face ID hoặc mật khẩu', code: 'stepup' }); return true; }
    if (isLogin) { const m = blocked(req, url !== '/auth/bio/login' && url !== '/auth/bio/unlock'); if (m) { send(429, { error: `Sai quá nhiều lần – thử lại sau ${m} phút` }); return true; } }

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
          acc = { id, phone, pw: { salt: salt.toString('base64'), hash: (await scrypt(q.password, salt)).toString('base64') }, uid: b64u(crypto.randomBytes(16)), sessions: {}, created: Date.now() };
          succeeded(req); const token = newSession(req, q, 'setup'); onRevoke('all');
          return send(200, { ok: true, token, account: me(sessionOf('Bearer ' + token)) });
        }
        if (url === '/auth/login' || url === '/auth/reset') {
          if (!acc) return send(404, { error: 'Chưa tạo tài khoản' });
          if (url === '/auth/reset') {
            if (!syncToken || !eq(q.syncToken || '', syncToken)) { failed(req); return send(403, { error: 'Mã SYNC_TOKEN không đúng' }); }
            if (String(q.password || '').length < 8) return send(400, { error: 'Mật khẩu tối thiểu 8 ký tự' });
            const salt = crypto.randomBytes(16); acc.pw = { salt: salt.toString('base64'), hash: (await scrypt(q.password, salt)).toString('base64') };
            acc.sessions = {}; onRevoke('others', String(q.device || '')); // đăng xuất mọi thiết bị khác (kèm tắt thông báo)
          } else {
            const l = String(q.login || '').trim(), who = normId(l) === acc.id || (acc.phone && normPhone(l) === acc.phone);
            const pwOk = eq((await scrypt(q.password || '', Buffer.from(acc.pw.salt, 'base64'))).toString('base64'), acc.pw.hash); // luôn băm – không lộ ID đúng/sai qua thời gian
            const ok = who && pwOk;
            if (!ok) { failed(req); return send(401, { error: 'Sai ID/SĐT hoặc mật khẩu' }); }
          }
          succeeded(req); const token = newSession(req, q, url === '/auth/reset' ? 'reset' : 'password');
          return send(200, { ok: true, token, account: me(sessionOf('Bearer ' + token)) });
        }
        // ===== SINH TRẮC THIẾT BỊ (vân tay / Face ID / Windows Hello) – CSDL riêng (server/bio-db.js), khoá GẮN MÁY bằng mã bí mật =====
        if (url === '/auth/bio/login-options' || url === '/auth/bio/unlock-options') {
          const unlock = url === '/auth/bio/unlock-options';
          if (unlock && !s) return send(401, { error: 'Chưa đăng nhập' });
          const list = bio.all().filter(p => !unlock || p.device === s.device); // mở khoá: chỉ khoá của CHÍNH thiết bị này
          if (!acc || !list.length) return send(404, { error: unlock ? 'Máy này chưa bật vân tay / Face ID' : 'Chưa có thiết bị nào bật vân tay / Face ID' });
          const { rpID } = rp(req);
          const options = await WA.generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: 60000, allowCredentials: list.map(p => ({ id: p.id, transports: p.transports })) });
          return send(200, { flow: newFlow(unlock ? 'unlock' : 'login', options.challenge), options });
        }
        if (url === '/auth/bio/login' || url === '/auth/bio/unlock') {
          const unlock = url === '/auth/bio/unlock';
          if (unlock && !s) return send(401, { error: 'Chưa đăng nhập' });
          const f = takeFlow(q.flow, unlock ? 'unlock' : 'login'), r = q.response || {}, pk = acc && bio.get(r.id);
          if (!f || !pk || (unlock && pk.device !== s.device)) { failed(req); return send(400, { error: 'Xác thực không hợp lệ, đã hết hạn hoặc vân tay đã bị xoá khỏi tài khoản' }); }
          if (!bindOk(pk, q.bind)) { failed(req); return send(403, { error: 'Khoá sinh trắc này được bật trên máy khác (khoá đồng bộ iCloud / Google) – chỉ dùng được trên đúng máy đã bật. Hãy đăng nhập bằng mật khẩu rồi bật vân tay / Face ID cho máy này.', code: 'bind' }); }
          const { rpID, origin } = rp(req);
          const v = await WA.verifyAuthenticationResponse({ response: r, expectedChallenge: f.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
            credential: { id: pk.id, publicKey: Buffer.from(pk.publicKey, 'base64url'), counter: pk.counter || 0, transports: pk.transports } }).catch(e => ({ verified: false, err: e.message }));
          if (!v.verified) { failed(req); return send(401, { error: /counter/i.test(v.err || '') ? 'Phát hiện khoá sinh trắc bị sao chép – đã chặn' : 'Xác thực vân tay / Face ID không thành công' }); }
          const ai = v.authenticationInfo;
          if (!ALLOW_SYNCED && (ai.credentialDeviceType === 'multiDevice' || ai.credentialBackedUp)) { // khoá đã bị sao lưu / đồng bộ lên đám mây kể từ khi đăng ký
            bio.update(pk.id, { deviceType: ai.credentialDeviceType, backedUp: ai.credentialBackedUp });
            failed(req); return send(403, { error: 'Khoá sinh trắc của thiết bị này đã bị đồng bộ lên đám mây – theo chính sách an toàn không chấp nhận. Hãy dùng mật khẩu, rồi xoá & bật lại vân tay.' });
          }
          bio.update(pk.id, { counter: ai.newCounter, used: Date.now() });
          succeeded(req);
          if (unlock) { markStep(s); return send(200, { ok: true, stepUpSec: STEP_MS / 1000 }); } // mở khoá bằng sinh trắc = xác thực lại
          const token = newSession(req, q, 'bio');
          return send(200, { ok: true, token, account: me(sessionOf('Bearer ' + token)) });
        }
        // ---- Các thao tác cần đã đăng nhập ----
        if (url === '/auth/bio/register-options') {
          const { rpID } = rp(req);
          const options = await WA.generateRegistrationOptions({ rpName, rpID,
            userName: 'so-ca-nhan', userDisplayName: 'Sổ Cá Nhân', userID: crypto.randomBytes(16), // KHÔNG cá nhân hoá: không ID/SĐT/tên trong khoá
            attestationType: 'none', timeout: 60000, preferredAuthenticatorType: 'localDevice', extensions: { credProps: true },
            supportedAlgorithmIDs: [-7, -257, -8], // ES256 trước (phổ biến trên vân tay / Face ID / Windows Hello), rồi RS256, Ed25519
            excludeCredentials: bio.all().filter(p => p.device === s.device).map(p => ({ id: p.id, transports: p.transports })), // chỉ khoá của CHÍNH máy này (máy cùng iCloud/Google đã có bản sao khoá của máy khác vẫn bật được khoá riêng)
            // platform: cảm biến GẮN TRONG máy (không dùng khoá rời / điện thoại khác) · discouraged: KHÔNG tạo passkey lưu trong
            // trình quản lý mật khẩu (iCloud Keychain / Google) · required: bắt buộc xác thực sinh trắc / khoá màn hình của thiết bị
            authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'discouraged', requireResidentKey: false, userVerification: 'required' } });
          return send(200, { flow: newFlow('register', options.challenge), options, policy: ALLOW_SYNCED ? 'synced-bound' : 'device-only' });
        }
        if (url === '/auth/bio/register') {
          const f = takeFlow(q.flow, 'register'); if (!f) return send(400, { error: 'Yêu cầu đã hết hạn, thử lại' });
          const { rpID, origin } = rp(req);
          const v = await WA.verifyRegistrationResponse({ response: q.response, expectedChallenge: f.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(e => ({ verified: false, err: e.message }));
          if (!v.verified) return send(400, { error: 'Không đăng ký được: ' + (v.err || 'xác thực thất bại') });
          const ri = v.registrationInfo, c = ri.credential;
          const prov = aaguidInfo(ri.aaguid);
          if (ALLOW_SYNCED && !validBind(q.bind)) return send(400, { error: 'Thiếu mã gắn máy – hãy tải lại app (bản mới) rồi bật lại' });
          if (!ALLOW_SYNCED && prov && prov.synced) return send(422, { error: `Khoá được tạo trong ${prov.name} (trình quản lý passkey đồng bộ đám mây) – theo chính sách an toàn không chấp nhận. Máy này hãy mở bằng mật khẩu.`, code: 'synced' });
          if (!ALLOW_SYNCED && (ri.credentialDeviceType === 'multiDevice' || ri.credentialBackedUp)) // khoá đồng bộ đám mây (passkey) → từ chối
            return send(422, { error: 'Thiết bị / trình duyệt này chỉ tạo được khoá ĐỒNG BỘ đám mây (passkey iCloud / Google) – theo chính sách an toàn không chấp nhận. Máy này hãy mở bằng mật khẩu.', code: 'synced' });
          await bio.put({ id: c.id, publicKey: b64u(c.publicKey), counter: c.counter, transports: c.transports || (q.response.response || {}).transports || [], device: s.device, name: String(q.name || 'Thiết bị').slice(0, 40),
            deviceType: ri.credentialDeviceType, backedUp: ri.credentialBackedUp, aaguid: ri.aaguid || '', created: Date.now(), used: 0, bindHash: validBind(q.bind) ? bindH(q.bind) : '' });
          return send(200, { ok: true, deviceType: ri.credentialDeviceType, provider: prov ? prov.name : '', account: me(s) });
        }
        if (url === '/auth/bio/delete') { const pre = String(q.id || '-'); bio.removeWhere(p => p.id.startsWith(pre)); return send(200, { ok: true, account: me(s) }); }
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
          markStep(s); save(); return send(200, { ok: true, account: me(s) }); // đã nhập đúng mật khẩu hiện tại = xác thực lại
        }
        if (url === '/auth/stepup') {
          const okPw = eq((await scrypt(q.password || '', Buffer.from(acc.pw.salt, 'base64'))).toString('base64'), acc.pw.hash);
          if (!okPw) { failed(req); return send(401, { error: 'Mật khẩu không đúng' }); }
          succeeded(req); markStep(s); return send(200, { ok: true, stepUpSec: STEP_MS / 1000 });
        }
        if (url === '/auth/logout') { delete acc.sessions[s.key]; save(); onRevoke('logout', s.device); return send(200, { ok: true }); } // tự đăng xuất: GIỮ đăng ký sinh trắc của máy
        if (url === '/auth/revoke') {
          let n = 0; Object.entries(acc.sessions).forEach(([k, x]) => { if ((q.all && k !== s.key) || x.sid === q.sid) { delete acc.sessions[k]; n++; onRevoke('device', x.device); } });
          save(); return send(200, { ok: true, revoked: n, account: me(s) });
        }
        send(404, { error: 'not found' });
      } catch (e) { console.error('auth:', e); send(500, { error: 'Lỗi máy chủ' }); }
    });
    return true;
  }
  return { handle, check, info, stepUpOk, setOnRevoke: fn => { onRevoke = (mode, device) => { if (mode === 'device' && device) bio.removeWhere(p => p.device === device); else if (mode === 'others') bio.removeWhere(p => p.device !== device); fn(mode === 'logout' ? 'device' : mode, device); }; /* bị thu hồi / đặt lại MK → xoá sinh trắc máy đó */ } };
}
module.exports = { createAuth, normPhone, aaguidInfo }; // aaguidInfo: dùng cho kiểm thử
