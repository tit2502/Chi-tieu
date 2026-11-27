/* store.js — dữ liệu, lưu trữ, nhập/xuất, tỷ giá, giao dịch định kỳ */
const KEY = 'qlct.v1';

const DEFAULT_CATS = [
  ['THU NHẬP', 'Lương', 'Lương chính'], ['THU NHẬP', 'Kinh doanh', 'Kinh doanh'], ['THU NHẬP', 'Thời vụ', 'Làm thời vụ'],
  ['THU NHẬP', 'Freelance', 'Freelance'], ['THU NHẬP', 'Thu nhập đầu tư', 'Cổ tức, lãi tiết kiệm, tiền cho thuê nhà'],
  ['THU NHẬP', 'Thu nhập khác', 'Thu nhập khác'],
  ['CHI PHÍ CỐ ĐỊNH', 'Thuê nhà', 'Tiền thuê nhà / trả góp'], ['CHI PHÍ CỐ ĐỊNH', 'Điện', 'Điện'], ['CHI PHÍ CỐ ĐỊNH', 'Nước', 'Nước'],
  ['CHI PHÍ CỐ ĐỊNH', 'Internet', 'Internet'], ['CHI PHÍ CỐ ĐỊNH', 'Giải trí', 'Netflix, Spotify, YouTube…'],
  ['CHI PHÍ CỐ ĐỊNH', 'Đăng ký', 'Gói đăng ký (ChatGPT, Gemini…)'], ['CHI PHÍ CỐ ĐỊNH', 'Gửi xe', 'Gửi xe, vé xe tháng'],
  ['CHI PHÍ CỐ ĐỊNH', 'Bảo hiểm', 'Bảo hiểm'], ['CHI PHÍ CỐ ĐỊNH', 'Trả nợ', 'Trả nợ vay'], ['CHI PHÍ CỐ ĐỊNH', 'Học phí', 'Học phí / khóa học'],
  ['CHI PHÍ BIẾN ĐỔI', 'Ăn tại nhà', 'Ăn uống tại gia'], ['CHI PHÍ BIẾN ĐỔI', 'Ăn ngoài', 'Ăn ngoài / cafe'],
  ['CHI PHÍ BIẾN ĐỔI', 'Đi lại', 'Xăng xe / taxi'], ['CHI PHÍ BIẾN ĐỔI', 'Sức khỏe', 'Khám bệnh, thuốc men'],
  ['CHI PHÍ BIẾN ĐỔI', 'Chăm sóc cá nhân', 'Cắt tóc, mỹ phẩm…'], ['CHI PHÍ BIẾN ĐỔI', 'Sở thích', 'Thể dục, gym, yoga…'],
  ['CHI PHÍ BIẾN ĐỔI', 'Mua sắm', 'Mua sắm'], ['CHI PHÍ BIẾN ĐỔI', 'Quà tặng', 'Quà tặng / hiếu hỉ'],
  ['CHI PHÍ BIẾN ĐỔI', 'Gia đình', 'Chi cho gia đình / con cái'], ['CHI PHÍ BIẾN ĐỔI', 'Phát sinh', 'Chi phí phát sinh khác'],
  ['TIẾT KIỆM & ĐẦU TƯ', 'Quỹ khẩn cấp', 'Quỹ dự phòng khẩn cấp'], ['TIẾT KIỆM & ĐẦU TƯ', 'Tiết kiệm ngắn hạn', 'Tiết kiệm ngắn hạn'],
  ['TIẾT KIỆM & ĐẦU TƯ', 'Tiết kiệm dài hạn', 'Tiết kiệm dài hạn'], ['TIẾT KIỆM & ĐẦU TƯ', 'Đầu tư', 'Chứng khoán, quỹ, crypto…'],
  ['TIẾT KIỆM & ĐẦU TƯ', 'Mục tiêu khác', 'Mục tiêu tài chính khác'],
  ['KHÔNG TÍNH VÀO THU/CHI', 'Chuyển ví', 'Nạp ví (ShopeePay, MoMo…)'],
  ['KHÔNG TÍNH VÀO THU/CHI', 'Chuyển tiền', 'Chuyển giữa tài khoản AUD ↔ VND, rút tiền mặt']
].map(([group, name, desc]) => ({ group, name, desc }));

function defaultState() {
  return {
    v: 1,
    settings: { disp: 'AUD', weekStart: 1, autoLearn: true, lastBackup: 0 },
    cards: [
      { name: 'Thẻ Úc', bank: 'Ngân hàng Úc', kind: 'Debit', cur: 'AUD', group: 'Úc', keys: '', open: 0 },
      { name: 'Thẻ Việt Nam', bank: 'Ngân hàng Việt Nam', kind: 'Debit', cur: 'VND', group: 'Việt Nam', keys: '', open: 0 },
      { name: 'Tiền mặt Úc', bank: 'Tiền mặt', kind: 'Tiền mặt', cur: 'AUD', group: 'Úc', keys: '', open: 0 },
      { name: 'Tiền mặt Việt Nam', bank: 'Tiền mặt', kind: 'Tiền mặt', cur: 'VND', group: 'Việt Nam', keys: '', open: 0 }
    ],
    cats: JSON.parse(JSON.stringify(DEFAULT_CATS)),
    rules: [], rates: {}, rateBase: {}, rateLog: {}, rateNow: 18400,
    txns: [], recs: [], budgets: [],
    sync: { url: '', token: '', auto: true, last: 0, status: '', statusAt: 0, dead: [] }
  };
}

let S = defaultState();
let saveTimer = null;
let storageOK = true;

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      S = Object.assign(defaultState(), j);
      S.settings = Object.assign(defaultState().settings, j.settings || {});
      S.sync = Object.assign(defaultState().sync, j.sync || {});
    }
  } catch (e) { storageOK = false; }
}
function saveNow() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOK = true; } catch (e) { storageOK = false; }
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 150); if (typeof syncSoon === 'function') syncSoon(); }
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- chuẩn hoá giao dịch ----------
function normTxn(x) {
  const t = {
    id: x.id || uid(), date: String(x.date).slice(0, 10), time: x.time || '', card: x.card || '',
    desc: x.desc || '', cat: x.cat || '', type: x.type === 'Thu' ? 'Thu' : 'Chi',
    amount: Number(x.amount) || 0, cur: x.cur === 'AUD' ? 'AUD' : 'VND', note: x.note || ''
  };
  if (x.balance !== undefined && x.balance !== null && x.balance !== '') t.balance = Number(x.balance);
  if (x.vndActual > 0) t.vndActual = Number(x.vndActual);
  if (x.link) t.link = x.link;
  if (x.rec) t.rec = true;
  if (x.sy) t.sy = 1;
  return t;
}
const txnKey = (t) => [t.date, t.time, t.card, t.amount, t.cur, t.type, t.desc].join('|');

function ensureCard(name, cur) {
  if (!name || S.cards.some((c) => c.name === name)) return;
  S.cards.push({ name, bank: '', kind: 'Debit', cur: cur || 'AUD', group: cur === 'VND' ? 'Việt Nam' : 'Úc', keys: '', open: 0 });
}

// ---------- nhập dữ liệu (gộp, bỏ trùng) ----------
function importJSON(j) {
  if (!j || !Array.isArray(j.txns)) throw new Error('File không đúng định dạng');
  let added = 0, dup = 0;
  if (!S.txns.length && j.cards && j.cards.length) S.cards = [];   // app mới: dùng đúng thẻ trong file
  (j.cards || []).forEach((c) => { if (!S.cards.some((x) => x.name === c.name)) S.cards.push(Object.assign({ open: 0 }, c)); });
  (j.categories || j.cats || []).forEach((c) => { if (!S.cats.some((x) => x.name === c.name)) S.cats.push({ group: c.group, name: c.name, desc: c.desc || '' }); });
  (j.rules || []).forEach((r) => { if (!S.rules.some((x) => x.kw.toUpperCase() === r.kw.toUpperCase())) S.rules.push({ kw: r.kw, cat: r.cat }); });
  if (j.format === 'quanlychitieu-v2') {   // bản sao lưu đầy đủ từ chính app
    Object.assign(S.rateBase, j.rateBase || {}); Object.assign(S.rates, j.rates || {}); Object.assign(S.rateLog, j.rateLog || {});
    if (j.rateNow) S.rateNow = j.rateNow;
  } else {                                  // dữ liệu lấy từ file Excel: tỷ giá trung bình tháng
    Object.assign(S.rateBase, j.rates || {});
    if (j.rateNow && (!S.rateNow || S.rateNow === 18400)) S.rateNow = j.rateNow;
  }
  (j.recs || []).forEach((r) => { if (!S.recs.some((x) => x.name === r.name && x.cycle === r.cycle && x.day === r.day)) S.recs.push(Object.assign({ id: uid() }, r)); });
  (j.budgets || []).forEach((b) => { if (!S.budgets.some((x) => x.scope === b.scope && x.cat === b.cat)) S.budgets.push(Object.assign({ id: uid() }, b)); });
  const seen = new Set(S.txns.map(txnKey));
  for (const x of j.txns) {
    const t = normTxn(x);
    if (!t.date || !t.amount) continue;
    if (seen.has(txnKey(t))) { dup++; continue; }
    ensureCard(t.card, t.cur);
    S.txns.push(t); seen.add(txnKey(t)); added++;
  }
  save();
  return { added, dup };
}

// ---------- CSV (cùng thứ tự cột với sheet GiaoDich) ----------
const CSV_HEAD = ['Ngày', 'Giờ', 'Thứ', 'Tuần (từ thứ Hai)', 'Thẻ / Tài khoản', 'Nội dung', 'Danh mục', 'Loại', 'Số tiền', 'Tiền tệ', 'Số dư', 'Ghi chú', 'Nhóm', 'Loại thẻ'];
function csvCell(v) { v = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCSV() {
  const ctx = CORE.makeCtx(S);
  const rows = [CSV_HEAD];
  [...S.txns].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).forEach((t) => {
    rows.push([t.date, t.time, CORE.DAY_FULL[CORE.weekday(t.date)], CORE.weekStart(t.date, 1), t.card, t.desc, t.cat, t.type,
      t.amount, t.cur, t.balance === undefined ? '' : t.balance, t.note, ctx.group(t), ctx.cardKind(t)]);
  });
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV trống');
  const h = rows[0].map((x) => x.trim());
  const ix = (name) => h.findIndex((x) => x.toLowerCase().startsWith(name.toLowerCase()));
  const I = { date: ix('Ngày'), time: ix('Giờ'), card: ix('Thẻ'), desc: ix('Nội dung'), cat: ix('Danh mục'), type: ix('Loại'), amount: ix('Số tiền'), cur: ix('Tiền tệ'), bal: ix('Số dư'), note: ix('Ghi chú') };
  if (I.date < 0 || I.amount < 0) throw new Error('Không thấy cột Ngày / Số tiền');
  // cột "Loại" xuất hiện hai lần (Loại, Loại thẻ): lấy cột đầu
  const txns = [];
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]; if (!c[I.date]) continue;
    let d = c[I.date].trim();
    const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) d = m[3] + '-' + CORE.pad(+m[2]) + '-' + CORE.pad(+m[1]);
    txns.push({ date: d, time: (c[I.time] || '').slice(0, 5), card: c[I.card], desc: c[I.desc], cat: c[I.cat], type: c[I.type], amount: String(c[I.amount]).replace(/[, ]/g, ''), cur: c[I.cur] || 'VND', balance: c[I.bal], note: c[I.note] });
  }
  return importJSON({ format: 'quanlychitieu-v1', txns });
}

function exportJSON() { return JSON.stringify(Object.assign({ format: 'quanlychitieu-v2', exported: new Date().toISOString() }, S, { manualRates: S.rates, sync: undefined }), null, 1); }

// ---------- tỷ giá tự động ----------
async function fetchRate() {
  const urls = ['https://open.er-api.com/v6/latest/AUD', 'https://api.exchangerate-api.com/v4/latest/AUD'];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      const j = await r.json();
      const v = j && j.rates && Number(j.rates.VND);
      if (v > 1000) {
        S.rateNow = v; S.rateLog[CORE.today()] = v;
        const keys = Object.keys(S.rateLog).sort(); while (keys.length > 400) delete S.rateLog[keys.shift()];
        save(); return v;
      }
    } catch (e) { /* thử nguồn tiếp theo */ }
  }
  return null;
}

// ---------- giao dịch định kỳ ----------
function runRecurring() {
  const today = CORE.today(); let n = 0;
  S.recs.forEach((r) => {
    const dates = CORE.dueDates(r, today);
    dates.forEach((d) => {
      ensureCard(r.card, r.cur);
      S.txns.push(normTxn({ date: d, time: '', card: r.card, desc: r.name, cat: r.cat, type: r.type, amount: r.amount, cur: r.cur, note: 'Định kỳ', rec: true }));
      n++;
    });
    if (dates.length) r.last = dates[dates.length - 1];
  });
  if (n) save();
  return n;
}

// ---------- chia sẻ / lưu file ----------
async function shareFile(name, mime, text) {
  try {
    const f = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return 'share'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); return 'download';
  } catch (e) { return 'fail'; }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}
