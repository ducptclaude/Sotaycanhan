/* Kiểm tra & giải mã bản sao lưu Sổ Cá Nhân trên nhánh GitHub `sao-luu-du-lieu`. Node.js ≥ 18, không cần cài thêm.
   Cách dùng (chạy trong thư mục repo):
     node server/kiem-tra-sao-luu.js                              → kiểm tra chuỗi băm của mọi bản sao (không cần mã)
     node server/kiem-tra-sao-luu.js --khoa-tep "<tệp chứa mã>"   → kiểm tra + giải mã thử từng bản, so SHA-256
     node server/kiem-tra-sao-luu.js --khoa-tep "<tệp>" --xuat 12 → giải mã bản số 12 ra tệp .json (khôi phục được trong app)
     node server/kiem-tra-sao-luu.js --khoa-tep "<tệp>" --xuat moi-nhat
   Tuỳ chọn: --thu-muc <thư mục nhánh đã clone> (đọc tại máy thay vì GitHub) · --repo owner/ten · --nhanh ten-nhanh
   Mã: SYNC_TOKEN (hoặc BACKUP_KEY nếu máy chủ có đặt) – lấy từ tệp (--khoa-tep) hoặc biến môi trường SAO_LUU_KHOA. */
const fs = require('fs'), path = require('path');
const { decrypt, sha256 } = require('./backup');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const repo = arg('--repo') || 'ducptclaude/Sotaycanhan', branch = arg('--nhanh') || 'sao-luu-du-lieu', dir = arg('--thu-muc');
const keyFile = arg('--khoa-tep'), exp = arg('--xuat');
const secret = keyFile ? fs.readFileSync(keyFile, 'utf8').trim() : (process.env.SAO_LUU_KHOA || '');

async function read(p) {
  if (dir) return fs.readFileSync(path.join(dir, p), 'utf8');
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${p}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Không đọc được ${p} (${r.status})`); return r.text();
}
(async () => {
  const idx = JSON.parse(await read('danh-muc.json')), list = idx.ban_sao || [];
  console.log(`Nhánh ${branch}: ${list.length} bản sao lưu`);
  let prev = '', ok = true;
  const keyId = secret ? sha256('scn-key:' + secret).slice(0, 12) : '';
  for (const e of list) {
    const calc = sha256(prev + e.sha256), chainOk = e.truoc === prev && e.chain === calc; // tự tính lại chuỗi – sửa 1 bản thì mọi bản sau cũng sai
    let dataOk = '', note = '';
    if (secret) {
      if (e.khoa && e.khoa !== keyId) { dataOk = '–'; note = '(mã không khớp – bản này dùng mã khác hoặc mã sai)'; }
      else { try { const env = JSON.parse(await read(e.tep)); const plain = decrypt(env, secret); dataOk = sha256(plain) === e.sha256 ? '✓' : '✗'; } catch (er) { dataOk = '✗'; note = '(' + er.message + ')'; } }
    }
    if (!chainOk || dataOk === '✗') ok = false;
    console.log(`#${String(e.stt).padStart(4)} ${e.tuan} ${e.luc.slice(0, 16).replace('T', ' ')} · ${String(e.so_muc).padStart(6)} mục · chuỗi ${chainOk ? '✓' : '✗ SAI'}${secret ? ' · dữ liệu ' + dataOk : ''} ${note}`);
    prev = calc;
  }
  console.log(ok ? '\nKẾT QUẢ: toàn vẹn – không có bản sao nào bị sửa, xoá hay chèn.' : '\nKẾT QUẢ: PHÁT HIỆN SAI LỆCH – xem các dòng ✗ ở trên.');
  if (exp && secret) {
    const e = exp === 'moi-nhat' ? list[list.length - 1] : list.find(x => String(x.stt) === String(exp));
    if (!e) throw new Error('Không có bản sao số ' + exp);
    const plain = decrypt(JSON.parse(await read(e.tep)), secret);
    if (sha256(plain) !== e.sha256) throw new Error('SHA-256 không khớp – không xuất');
    const out = `so-ca-nhan-sao-luu-${e.tuan}-${e.stt}.json`; fs.writeFileSync(out, JSON.stringify(JSON.parse(plain), null, 1));
    console.log(`Đã giải mã bản #${e.stt} → ${path.resolve(out)} (mở app → Khôi phục từ tệp)`);
  }
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('Lỗi:', e.message); process.exit(1); });
