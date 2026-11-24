/* Soạn nội dung thông báo "dữ liệu mới" kiểu tin nhắn biến động số dư ngân hàng.
   - Giao dịch: số tiền ±, số dư tài khoản sau giao dịch, luỹ kế danh mục trong tháng
   - Tiết kiệm / vay / tài sản / tài khoản: số tiền + tổng luỹ kế của loại đó
   - Mục khác (sự kiện, ghi chú, sức khoẻ…): tên / nội dung chính
   Số dư tính từ dữ liệu trên máy chủ, giống cách app tính (số dư ban đầu + các giao dịch đến hôm nay). */
const VN = 7 * 3600e3;
const vnd = n => (Math.round(Number(n) || 0)).toLocaleString('vi-VN') + ' đ';
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + vnd(Math.abs(n));
const todayVN = () => new Date(Date.now() + VN).toISOString().slice(0, 10);
const num = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }); // 5,2 · 70,5 (kiểu Việt Nam)
const ddmm = ds => ds ? ds.slice(8, 10) + '/' + ds.slice(5, 7) : '';
const PLUS = ['income', 'loan_in', 'save_back', 'asset_sell'], MINUS = ['expense', 'loan_pay', 'save_out', 'asset_buy'];
function effects(t) { // giống txEffects trong app
  const a = Number(t.amount) || 0;
  if (PLUS.includes(t.type)) return [[t.accountId, a]];
  if (MINUS.includes(t.type)) return [[t.accountId, -a]];
  if (t.type === 'transfer') return [[t.accountId, -a], [t.toAccountId, a]];
  return [];
}
const TX = { income: ['💰', 'Thu'], expense: ['💸', 'Chi'], transfer: ['🔁', 'Chuyển khoản'], loan_in: ['🏦', 'Nhận tiền vay'], loan_pay: ['🏦', 'Trả nợ'], save_out: ['🐷', 'Gửi tiết kiệm'], save_back: ['🐷', 'Tất toán tiết kiệm'], asset_buy: ['🏷️', 'Mua tài sản'], asset_sell: ['🏷️', 'Bán tài sản'] };
const HM = { weight: ['Cân nặng', 'kg'], sys: ['Huyết áp', ''], pulse: ['Nhịp tim', 'lần/phút'], sleep: ['Giấc ngủ', 'giờ'], steps: ['Bước chân', 'bước'], water: ['Nước', 'ml'] };
const OTHER = { events: ['📅', 'sự kiện'], todos: ['✅', 'việc cần làm'], notes: ['📝', 'ghi chú'], journal: ['📔', 'nhật ký'], contacts: ['👥', 'liên hệ'], meds: ['💊', 'thuốc'], courses: ['🎓', 'khóa học'], books: ['📚', 'sách'], study: ['📖', 'buổi học'], cards: ['🗂️', 'thẻ từ'], habits: ['🔁', 'thói quen'], goals: ['🎯', 'mục tiêu'] };
const titleOf = d => String(d.title || d.name || d.text || d.subject || d.front || d.note || d.content || '').replace(/\s+/g, ' ').trim().slice(0, 90);

// all(col) → { id: data } (đã bỏ bản ghi xoá)
function createFormatter(all) {
  const accName = id => ((all('accounts')[id] || {}).name) || '';
  // exclude: id giao dịch nhập SAU giao dịch đang báo (cùng đợt) → số dư đúng tại thời điểm giao dịch đó
  function accBalance(id, exclude) {
    const acc = all('accounts')[id]; if (!acc) return null;
    let b = Number(acc.opening) || 0; const td = todayVN(), tx = all('txns');
    for (const [k, t] of Object.entries(tx)) { if (!t || (t.date && t.date > td) || (exclude && exclude.has(k))) continue; for (const [a, v] of effects(t)) if (a === id) b += v; }
    return b;
  }
  function catMonth(t) { // luỹ kế danh mục trong tháng của giao dịch
    if (!t.category || !t.date || !['income', 'expense'].includes(t.type)) return null;
    const m = t.date.slice(0, 7); let s = 0, n = 0;
    for (const x of Object.values(all('txns'))) if (x && x.type === t.type && x.category === t.category && (x.date || '').slice(0, 7) === m) { s += Number(x.amount) || 0; n++; }
    return { m, s, n };
  }
  const totalSavings = () => Object.values(all('savings')).filter(s => s && s.status !== 'closed' && s.status !== 'done').reduce((a, s) => a + (Number(s.principal) || 0), 0);
  function totalDebt() {
    const paid = {}; for (const t of Object.values(all('txns'))) if (t && t.type === 'loan_pay' && t.loanId) paid[t.loanId] = (paid[t.loanId] || 0) + (Number(t.principal) || 0);
    let s = 0; for (const [id, l] of Object.entries(all('loans'))) if (l) s += Math.max(0, (Number(l.principal) || 0) - (paid[id] || 0));
    return s;
  }
  const totalAssets = () => Object.values(all('assets')).filter(a => a && a.status !== 'sold').reduce((s, a) => s + (Number(a.value) || 0), 0);
  const totalBalance = () => Object.keys(all('accounts')).reduce((s, id) => s + (accBalance(id) || 0), 0);

  // Một bản ghi → { title, body, money } ; showAmount=false → ẩn số tiền (tuỳ chọn riêng tư)
  function one(col, id, d, showAmount = true, later) {
    const amt = n => showAmount ? vnd(n) : '•••';
    const sAmt = n => showAmount ? sgn(n) : '•••';
    if (col === 'txns') {
      const [ic, lb] = TX[d.type] || ['💳', 'Giao dịch'], a = Number(d.amount) || 0;
      const sign = PLUS.includes(d.type) ? 1 : MINUS.includes(d.type) ? -1 : 0;
      const title = `${ic} ${lb} ${sign ? sAmt(sign * a) : amt(a)}${d.category ? ' · ' + d.category : ''}`;
      const L = [];
      if (d.type === 'transfer') {
        const b1 = accBalance(d.accountId, later), b2 = accBalance(d.toAccountId, later);
        L.push(`${accName(d.accountId) || 'TK nguồn'} → ${accName(d.toAccountId) || 'TK đích'}`);
        if (showAmount && b1 != null) L.push(`Số dư ${accName(d.accountId)}: ${vnd(b1)}`);
        if (showAmount && b2 != null) L.push(`Số dư ${accName(d.toAccountId)}: ${vnd(b2)}`);
      } else if (d.accountId) {
        const b = accBalance(d.accountId, later);
        L.push(`TK ${accName(d.accountId) || '—'}${b != null && showAmount ? ' · số dư ' + vnd(b) : ''}`);
      }
      const cm = catMonth(d); if (cm && showAmount) L.push(`Luỹ kế ${d.category} tháng ${cm.m.slice(5)}/${cm.m.slice(0, 4)}: ${vnd(cm.s)} (${cm.n} GD)`);
      if (d.type === 'loan_pay' && showAmount) L.push(`Tổng dư nợ còn lại: ${vnd(totalDebt())}`);
      L.push([d.note ? '“' + String(d.note).slice(0, 60) + '”' : '', d.date ? 'ngày ' + ddmm(d.date) : ''].filter(Boolean).join(' · '));
      return { title, body: L.filter(Boolean).join('\n'), money: true, url: './#lich-su-gd' };
    }
    if (col === 'savings') return { title: `🐷 Tiết kiệm mới ${amt(d.principal)}`, body: [`${d.name || ''}${d.bank ? ' · ' + d.bank : ''}${d.rate ? ' · ' + num(d.rate) + '%/năm' : ''}${d.term ? ' · ' + d.term + ' tháng' : ''}`, showAmount ? `Tổng tiết kiệm đang gửi: ${vnd(totalSavings())}` : ''].filter(Boolean).join('\n'), money: true, url: './#tiet-kiem' };
    if (col === 'loans') return { title: `🏦 Khoản vay/nợ mới ${amt(d.principal)}`, body: [`${d.name || ''}${d.lender ? ' · ' + d.lender : ''}${d.rate ? ' · ' + num(d.rate) + '%/năm' : ''}`, showAmount ? `Tổng dư nợ: ${vnd(totalDebt())}` : ''].filter(Boolean).join('\n'), money: true, url: './#vay-no' };
    if (col === 'assets') return { title: `🏷️ Tài sản mới ${amt(d.value)}`, body: [d.name || '', showAmount ? `Tổng giá trị tài sản: ${vnd(totalAssets())}` : ''].filter(Boolean).join('\n'), money: true, url: './#tai-san' };
    if (col === 'accounts') return { title: `🏦 Tài khoản mới: ${d.name || ''}`, body: showAmount ? `Số dư ban đầu ${vnd(d.opening)}\nTổng số dư mọi tài khoản: ${vnd(totalBalance())}` : '', money: true, url: './#tai-khoan' };
    if (col === 'health') {
      const parts = []; if (d.weight != null) parts.push(`Cân nặng ${num(d.weight)} kg`); if (d.sys != null) parts.push(`Huyết áp ${d.sys}/${d.dia}`); if (d.pulse != null) parts.push(`Nhịp tim ${d.pulse}`);
      if (d.sleep != null) parts.push(`Ngủ ${num(d.sleep)} giờ`); if (d.steps != null) parts.push(`${Number(d.steps).toLocaleString('vi-VN')} bước`); if (d.water != null) parts.push(`Nước ${d.water} ml`);
      return { title: '❤️ Chỉ số sức khỏe mới', body: [parts.join(' · '), d.date ? 'ngày ' + ddmm(d.date) : ''].filter(Boolean).join('\n'), url: './#suc-khoe' };
    }
    const [ic, lb] = OTHER[col] || ['📌', 'mục'], t = titleOf(d);
    const extra = col === 'events' && d.date ? (d.time ? d.time + ' ' : '') + ddmm(d.date) : col === 'study' && d.minutes ? d.minutes + ' phút' : '';
    return { title: `${ic} Thêm ${lb}${t ? ': ' + t : ''}`, body: extra, url: col === 'events' ? './#su-kien' : './' };
  }
  return { one, accBalance, totalSavings, totalDebt, totalAssets };
}
module.exports = { createFormatter, TX, OTHER };
