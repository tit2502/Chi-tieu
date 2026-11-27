/**
 * CỔNG ĐỒNG BỘ giữa app "Chi tiêu AUD · VND" và sheet GiaoDich của bạn.
 * - App kéo (đọc) các giao dịch trong sheet, gồm cả khoản tự ghi từ thông báo ngân hàng.
 * - App đẩy giao dịch nhập tay lên cuối sheet; sửa/xóa trong app được áp dụng đúng dòng đó (khớp ngày, giờ, thẻ, số tiền, tiền tệ, loại).
 * - Tìm cột theo TÊN tiêu đề (Ngày, Giờ, Thẻ / Tài khoản, Nội dung…), nên không phụ thuộc vị trí cột.
 *
 * DÙNG: tạo dự án Apps Script MỚI (script.google.com → Dự án mới), dán file này vào,
 * sửa 2 dòng CT_TOKEN và CT_SHEET_ID bên dưới, rồi Triển khai → Ứng dụng web
 * (Thực thi với tư cách: Tôi · Người có quyền truy cập: Bất kỳ ai).
 */
const CT_TOKEN = 'hoan2502';
const CT_SHEET_ID = 'DAN-ID-GOOGLE-SHEET-VAO-DAY';   // đoạn giữa /d/ và /edit trong địa chỉ sheet
const CT_SHEET_NAME = 'GiaoDich';

const DAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.token !== CT_TOKEN) return out_({ ok: false, error: 'Sai token' });
    if (p.action === 'ping') return out_({ ok: true, sheet: CT_SHEET_NAME });
    const sh = SpreadsheetApp.openById(CT_SHEET_ID).getSheetByName(CT_SHEET_NAME);
    if (!sh) return out_({ ok: false, error: 'Không thấy sheet tên "' + CT_SHEET_NAME + '"' });
    const L = layout_(sh);
    return out_({ ok: true, txns: readRows_(sh, L, p.from || '') });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents);
    if (body.token !== CT_TOKEN) return out_({ ok: false, error: 'Sai token' });
    const sh = SpreadsheetApp.openById(CT_SHEET_ID).getSheetByName(CT_SHEET_NAME);
    if (!sh) return out_({ ok: false, error: 'Không thấy sheet tên "' + CT_SHEET_NAME + '"' });
    const L = layout_(sh);
    const stats = { updated: 0, deleted: 0 };
    const upRes = [], delRes = [];
    // 1) SỬA tại chỗ các dòng đã có (khớp theo khóa cũ)
    const ups = body.ups || [];
    if (ups.length) {
      const used = {};
      const rows = readRows_(sh, L, '');
      ups.forEach(function (u) {
        const hit = rows.filter(function (r) { return !used[r.row] && key_(r) === u.old; })[0];
        if (!hit) { upRes.push('missing'); return; }
        used[hit.row] = 1; writeCells_(sh, L, hit.row, [u.txn]); upRes.push('updated'); stats.updated++;
      });
    }
    // 2) XÓA dòng (mỗi khóa xóa đúng 1 dòng, xóa từ dưới lên để không lệch số dòng)
    const dels = body.dels || [];
    if (dels.length) {
      const rows2 = readRows_(sh, L, ''), take = [], used2 = {};
      dels.forEach(function (k) {
        const hit = rows2.filter(function (r) { return !used2[r.row] && key_(r) === k; })[0];
        if (!hit) { delRes.push('missing'); return; }
        used2[hit.row] = 1; take.push(hit.row); delRes.push('deleted'); stats.deleted++;
      });
      take.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    }
    const list = body.txns || [];
    // đếm các dòng đã có (cùng ngày, giờ, thẻ, số tiền, tiền tệ, loại) để không ghi trùng
    const have = {};
    readRows_(sh, L, '').forEach(function (t) { const k = key_(t); have[k] = (have[k] || 0) + 1; });
    const results = [], fresh = [];
    list.forEach(function (t) {
      const k = key_(t);
      if (have[k] > 0) { have[k]--; results.push('dup'); }
      else { fresh.push(t); results.push('added'); }
    });
    if (fresh.length) writeRows_(sh, L, fresh);
    return out_({ ok: true, results: results, added: fresh.length, upRes: upRes, delRes: delRes, updated: stats.updated, deleted: stats.deleted });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* bỏ qua */ }
  }
}

// ---------- cấu trúc sheet ----------
function layout_(sh) {
  const nCols = Math.max(sh.getLastColumn(), 14);
  const top = sh.getRange(1, 1, Math.min(8, Math.max(sh.getLastRow(), 3)), nCols).getDisplayValues();
  for (let r = 0; r < top.length; r++) {
    const h = top[r].map(function (s) { return String(s).replace(/\s+/g, ' ').trim().toLowerCase(); });
    if (h.indexOf('ngày') >= 0 && h.indexOf('số tiền') >= 0) {
      const col = {};
      h.forEach(function (name, i) {
        if (name === 'ngày') col.date = i;
        else if (name === 'giờ') col.time = i;
        else if (name === 'thứ') col.dow = i;
        else if (name.indexOf('tuần') === 0) col.week = i;
        else if (name.indexOf('thẻ') === 0 && name !== 'thẻ loại') col.card = i;
        else if (name === 'nội dung') col.desc = i;
        else if (name === 'danh mục') col.cat = i;
        else if (name === 'loại') col.type = i;
        else if (name === 'số tiền') col.amount = i;
        else if (name === 'tiền tệ') col.cur = i;
        else if (name === 'số dư') col.balance = i;
        else if (name === 'ghi chú') col.note = i;
        else if (name === 'nhóm') col.group = i;
        else if (name === 'loại thẻ') col.kind = i;
      });
      ['date', 'card', 'desc', 'cat', 'type', 'amount', 'cur'].forEach(function (k) {
        if (col[k] === undefined) throw new Error('Không thấy cột "' + k + '" trong dòng tiêu đề');
      });
      return { headerRow: r + 1, col: col, nCols: nCols };
    }
  }
  throw new Error('Không tìm thấy dòng tiêu đề có "Ngày" và "Số tiền" trong 8 dòng đầu');
}

function lastDataRow_(sh, L) {
  const first = L.headerRow + 1, max = sh.getMaxRows();
  if (max < first) return L.headerRow;
  const v = sh.getRange(first, L.col.date + 1, max - L.headerRow, 1).getValues();
  let last = L.headerRow;
  for (let i = 0; i < v.length; i++) if (v[i][0] !== '' && v[i][0] !== null) last = first + i;
  return last;
}

// ---------- đọc ----------
function num_(v) {
  if (typeof v === 'number') return v;
  let s = String(v === null || v === undefined ? '' : v).replace(/\s/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function isoDate_(disp, raw, tz) {
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(disp);
  if (m) return m[3] + '-' + pad_(+m[2]) + '-' + pad_(+m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(disp);
  if (m) return m[0];
  if (raw instanceof Date) return Utilities.formatDate(raw, tz, 'yyyy-MM-dd');
  return '';
}
function hhmm_(disp) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(disp || ''));
  return m ? pad_(+m[1]) + ':' + m[2] : '';
}
function readRows_(sh, L, from) {
  const last = lastDataRow_(sh, L);
  if (last <= L.headerRow) return [];
  const n = last - L.headerRow, c = L.col;
  const rng = sh.getRange(L.headerRow + 1, 1, n, L.nCols);
  const vals = rng.getValues(), disp = rng.getDisplayValues();
  const tz = sh.getParent().getSpreadsheetTimeZone();
  const get = function (row, k) { return c[k] === undefined ? '' : row[c[k]]; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = isoDate_(String(disp[i][c.date]), vals[i][c.date], tz);
    const amount = num_(vals[i][c.amount]);
    if (!date || amount === null) continue;
    if (from && date < from) continue;
    const bal = c.balance === undefined ? null : num_(vals[i][c.balance]);
    out.push({
      date: date,
      time: c.time === undefined ? '' : hhmm_(disp[i][c.time]),
      card: String(get(vals[i], 'card')).trim(),
      desc: String(get(vals[i], 'desc')),
      cat: String(get(vals[i], 'cat')).trim(),
      row: L.headerRow + 1 + i,
      type: String(get(vals[i], 'type')).trim() === 'Thu' ? 'Thu' : 'Chi',
      amount: amount,
      cur: String(get(vals[i], 'cur')).trim() === 'AUD' ? 'AUD' : 'VND',
      balance: bal,
      note: String(get(vals[i], 'note')),
      group: String(get(vals[i], 'group')).trim(),
      kind: String(get(vals[i], 'kind')).trim()
    });
  }
  return out;
}
function key_(t) {
  return [t.date, t.time || '', t.card, Math.round(Number(t.amount) * 100) / 100, t.cur, t.type].join('|');
}

// ---------- ghi (chỉ thêm vào cuối) ----------
function mondayOf_(iso) {
  const p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.getUTCFullYear() + '-' + pad_(d.getUTCMonth() + 1) + '-' + pad_(d.getUTCDate());
}
function colVals_(L, list) {
  const c = L.col, out = {};
  const put = function (k, f) { if (c[k] !== undefined) out[k] = list.map(function (t) { return [f(t)]; }); };
  put('date', function (t) { return t.date; });                        // chuỗi ISO: Sheets tự nhận là ngày
  put('time', function (t) { return t.time ? t.time + ':00' : ''; });
  put('dow', function (t) { const p = t.date.split('-').map(Number); return DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; });
  put('week', function (t) { return mondayOf_(t.date); });
  put('card', function (t) { return t.card; });
  put('desc', function (t) { return t.desc || ''; });
  put('cat', function (t) { return t.cat || ''; });
  put('type', function (t) { return t.type; });
  put('amount', function (t) { return Number(t.amount); });
  put('cur', function (t) { return t.cur; });
  put('balance', function (t) { return t.balance === null || t.balance === undefined || t.balance === '' ? '' : Number(t.balance); });
  put('note', function (t) { return t.note || ''; });
  put('group', function (t) { return t.group || ''; });
  put('kind', function (t) { return t.kind || ''; });
  return out;
}
function writeCells_(sh, L, row, list) {
  const cv = colVals_(L, list);
  Object.keys(cv).forEach(function (k) { sh.getRange(row, L.col[k] + 1, list.length, 1).setValues(cv[k]); });
}
function writeRows_(sh, L, list) {
  const start = lastDataRow_(sh, L) + 1, n = list.length;
  const need = start + n - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  writeCells_(sh, L, start, list);
}

/** Chạy hàm này MỘT LẦN trong trình soạn thảo để cấp quyền và kiểm tra cấu hình. */
function kiemTra() {
  const sh = SpreadsheetApp.openById(CT_SHEET_ID).getSheetByName(CT_SHEET_NAME);
  const L = layout_(sh);
  Logger.log('Dòng tiêu đề: ' + L.headerRow + ' · cột: ' + JSON.stringify(L.col));
  Logger.log('Số giao dịch đọc được: ' + readRows_(sh, L, '').length);
}
