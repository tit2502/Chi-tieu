/**
 * Chi tiêu AUD/VND – API cho app PWA.
 *
 * App gọi POST (text/plain, JSON) tới Web App này. Mỗi yêu cầu có:
 *   { app: 'chitieu', token: '<mã bí mật>', action: '...', ...tham số }
 * Yêu cầu không có app === 'chitieu' (ví dụ từ Apple Shortcuts) được chuyển
 * cho doPostLegacy_ (là doPost cũ của bạn, đã đổi tên).
 */

var TZ = 'Australia/Melbourne';
var S = {
  TXN: 'GiaoDich', CARD: 'DanhSachThe', CAT: 'DanhMuc', FX: 'TyGia',
  RULE: 'QuyTac', BUDGET: 'NganSach', TRIP: 'ChuyenDi', XFER: 'ChuyenTien',
  GOAL: 'MucTieu', CFG: 'CauHinh', OVERVIEW: 'TongQuan'
};
var TXN_FIRST_ROW = 3;
var TXN_COLS = 16; // A..P (A-M có sẵn, N tỷ giá, O chuyến đi, P nguồn)

/* ------------------------------------------------------------------ */
/* Điểm vào                                                            */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var req = parseAppRequest_(e);
  if (!req) {
    if (typeof doPostLegacy_ === 'function') return doPostLegacy_(e);
    return json_({ ok: false, error: 'Yêu cầu không hợp lệ' });
  }
  return json_(handleApi_(req));
}

function parseAppRequest_(e) {
  try {
    var body = e && e.postData && e.postData.contents;
    if (!body) return null;
    var obj = JSON.parse(body);
    return obj && obj.app === 'chitieu' ? obj : null;
  } catch (err) {
    return null;
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

var WRITE_ACTIONS_ = {
  addTxn: 1, updateTxn: 1, deleteTxn: 1, addTransfer: 1, setRule: 1, setBudget: 1,
  addTrip: 1, addGoal: 1, updateGoal: 1, deleteGoal: 1, setConfig: 1
};

function handleApi_(req) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) return { ok: false, error: 'Chưa tạo mã app. Chạy menu Chi tiêu > Cài đặt app.' };
  if (!safeEqual_(String(req.token || ''), expected)) return { ok: false, error: 'Sai mã app', code: 'AUTH' };

  var fn = ACTIONS_[req.action];
  if (!fn) return { ok: false, error: 'Không có hành động: ' + req.action };

  var lock = null;
  try {
    if (WRITE_ACTIONS_[req.action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(15000);
    }
    return { ok: true, data: fn(req) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

var ACTIONS_ = {
  ping: function () { return { time: new Date().toISOString() }; },
  bootstrap: apiBootstrap_,
  txns: apiTxns_,
  addTxn: apiAddTxn_,
  updateTxn: apiUpdateTxn_,
  deleteTxn: apiDeleteTxn_,
  addTransfer: apiAddTransfer_,
  transfers: apiTransfers_,
  setRule: apiSetRule_,
  setBudget: apiSetBudget_,
  addTrip: apiAddTrip_,
  addGoal: apiAddGoal_,
  updateGoal: apiUpdateGoal_,
  deleteGoal: apiDeleteGoal_,
  setConfig: apiSetConfig_
};

/* ------------------------------------------------------------------ */
/* Tiện ích bảng tính                                                  */
/* ------------------------------------------------------------------ */

function ss_() {
  var s = SpreadsheetApp.getActiveSpreadsheet();
  if (s) return s;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Không tìm thấy bảng tính (thiếu SHEET_ID)');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Thiếu tab "' + name + '". Chạy menu Chi tiêu > Nâng cấp sheet.');
  return sh;
}

function fmtDate_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function parseDate_(str) {
  return Utilities.parseDate(str, TZ, 'yyyy-MM-dd');
}

function toDateStr_(v) {
  if (v instanceof Date) return fmtDate_(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.substr(0, 10);
  return '';
}

function toTimeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  return v ? String(v) : '';
}

function num_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function stripAccents_(s) {
  return String(s || '').toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function readTable_(name, firstRow, cols) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < firstRow) return [];
  return sh.getRange(firstRow, 1, last - firstRow + 1, cols).getValues();
}

function getConfig_() {
  var cfg = {};
  var sh = ss_().getSheetByName(S.CFG);
  if (!sh || sh.getLastRow() < 2) return cfg;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0] !== '') cfg[String(r[0])] = r[1];
  });
  return cfg;
}

/* ------------------------------------------------------------------ */
/* Dữ liệu tham chiếu                                                  */
/* ------------------------------------------------------------------ */

function getCards_() {
  return readTable_(S.CARD, 2, 5).filter(function (r) { return r[0]; }).map(function (r) {
    var cur = String(r[3] || 'AUD').toUpperCase() === 'VND' ? 'VND' : 'AUD';
    return {
      name: String(r[0]), bank: String(r[1] || ''), kind: String(r[2] || ''),
      currency: cur, group: cur === 'VND' ? 'Việt Nam' : 'Úc'
    };
  });
}

function getCategories_() {
  return readTable_(S.CAT, 2, 4).filter(function (r) { return r[1]; }).map(function (r) {
    return { group: String(r[0]), name: String(r[1]), type: String(r[3]) };
  });
}

function getRates_() {
  var sh = sheet_(S.FX);
  var current = num_(sh.getRange('C5').getValue()) || num_(sh.getRange('C3').getValue()) || 17000;
  var monthly = sh.getRange('F9:F20').getValues().map(function (r) { return num_(r[0]) || current; });
  var year = new Date().getFullYear();
  try { year = num_(sheet_(S.OVERVIEW).getRange('C5').getValue()) || year; } catch (e) {}
  return { current: current, monthly: monthly, year: year };
}

function rateForDate_(dateStr, rates) {
  var y = +dateStr.substr(0, 4), m = +dateStr.substr(5, 2);
  return y === rates.year ? rates.monthly[m - 1] : rates.current;
}

function getRules_() {
  var sh = ss_().getSheetByName(S.RULE);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { keyword: String(r[0]), category: String(r[1]) }; });
}

function matchCategory_(desc, rules) {
  var d = stripAccents_(desc);
  var best = null;
  rules.forEach(function (r) {
    var k = stripAccents_(r.keyword);
    if (k && d.indexOf(k) >= 0 && (!best || k.length > best.k.length)) best = { k: k, c: r.category };
  });
  return best ? best.c : '';
}

function getTrips_() {
  var sh = ss_().getSheetByName(S.TRIP);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return r[0] && r[1] && r[2]; })
    .map(function (r) { return { name: String(r[0]), from: toDateStr_(r[1]), to: toDateStr_(r[2]) }; });
}

function tripFor_(dateStr, trips) {
  for (var i = 0; i < trips.length; i++) {
    if (dateStr >= trips[i].from && dateStr <= trips[i].to) return trips[i].name;
  }
  return '';
}

function getBudgets_() {
  var sh = ss_().getSheetByName(S.BUDGET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return r[0] && r[1] && num_(r[2]) > 0; })
    .map(function (r) { return { group: String(r[0]), category: String(r[1]), amount: num_(r[2]) }; });
}

function getGoals_() {
  var sh = ss_().getSheetByName(S.GOAL);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function (r, i) {
    return { row: i + 2, name: String(r[0]), target: num_(r[1]), currency: String(r[2] || 'AUD'), due: toDateStr_(r[3]), saved: num_(r[4]) };
  }).filter(function (g) { return g.name; });
}

/* ------------------------------------------------------------------ */
/* Giao dịch                                                           */
/* ------------------------------------------------------------------ */

function readTxns_(fromStr, toStr) {
  var rates = getRates_();
  var rows = readTable_(S.TXN, TXN_FIRST_ROW, TXN_COLS);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var date = toDateStr_(r[0]);
    if (!date || !r[8]) continue;
    if (fromStr && date < fromStr) continue;
    if (toStr && date > toStr) continue;
    var cur = String(r[9] || 'VND').toUpperCase() === 'AUD' ? 'AUD' : 'VND';
    var stored = num_(r[13]);
    out.push({
      row: TXN_FIRST_ROW + i,
      date: date, time: toTimeStr_(r[1]),
      card: String(r[4] || ''), desc: String(r[5] || ''), cat: String(r[6] || ''),
      type: String(r[7] || ''), amount: num_(r[8]), cur: cur,
      note: String(r[11] || ''), group: String(r[12] || ''),
      rate: stored > 0 ? stored : rateForDate_(date, rates),
      trip: String(r[14] || ''), src: String(r[15] || '')
    });
  }
  return out;
}

function apiTxns_(req) {
  var from = req.from || '0000-01-01', to = req.to || '9999-12-31';
  return { txns: readTxns_(from, to) };
}

function monthsAgoStr_(n) {
  var d = new Date();
  d.setMonth(d.getMonth() - n);
  return fmtDate_(d);
}

function apiBootstrap_() {
  var cards = getCards_();
  var cats = getCategories_();
  var rules = getRules_();
  var rates = getRates_();
  var today = fmtDate_(new Date());
  var recent = readTxns_(monthsAgoStr_(6).substr(0, 7) + '-01', '9999-12-31');
  var data = {
    today: today,
    cards: cards,
    categories: cats,
    rules: rules,
    rates: { current: rates.current, monthly: rates.monthly, year: rates.year },
    budgets: getBudgets_(),
    trips: getTrips_(),
    goals: getGoals_(),
    config: publicConfig_(getConfig_()),
    txns: recent,
    frequent: frequentTxns_(recent),
    stats: categoryStats_(recent),
    recurring: detectRecurring_(recent)
  };
  return data;
}

function publicConfig_(c) {
  return {
    acbStatementDay: num_(c.ACB_NGAY_SAO_KE) || 0,
    acbDueDay: num_(c.ACB_NGAY_DEN_HAN) || 0
  };
}

function toVnd_(t) { return t.cur === 'VND' ? t.amount : t.amount * t.rate; }

function frequentTxns_(txns) {
  var cutoff = monthsAgoStr_(3);
  var map = {};
  txns.forEach(function (t) {
    if (t.type !== 'Chi' || t.date < cutoff || !t.desc) return;
    var key = stripAccents_(t.desc) + '|' + t.card + '|' + t.cur;
    var o = map[key] || (map[key] = { desc: t.desc, card: t.card, cat: t.cat, cur: t.cur, n: 0, amounts: [] });
    o.n++; o.amounts.push(t.amount); o.cat = t.cat || o.cat;
  });
  return Object.keys(map).map(function (k) { return map[k]; })
    .filter(function (o) { return o.n >= 2; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 8)
    .map(function (o) {
      o.amounts.sort(function (a, b) { return a - b; });
      return { desc: o.desc, card: o.card, cat: o.cat, cur: o.cur, amount: o.amounts[Math.floor(o.amounts.length / 2)], n: o.n };
    });
}

function categoryStats_(txns) {
  var cutoff = monthsAgoStr_(4);
  var by = {};
  txns.forEach(function (t) {
    if (t.type !== 'Chi' || !t.cat || t.date < cutoff) return;
    (by[t.cat] = by[t.cat] || []).push(toVnd_(t));
  });
  var out = {};
  Object.keys(by).forEach(function (c) {
    var a = by[c].sort(function (x, y) { return x - y; });
    out[c] = { n: a.length, median: a[Math.floor(a.length / 2)] };
  });
  return out;
}

/** Khoản lặp lại: cùng nội dung xuất hiện >= 3 tháng khác nhau, số tiền gần nhau. */
function detectRecurring_(txns) {
  var by = {};
  txns.forEach(function (t) {
    if (t.type !== 'Chi' || !t.desc) return;
    var key = stripAccents_(t.desc).replace(/[^a-z0-9 ]/g, '').trim() + '|' + t.cur;
    (by[key] = by[key] || []).push(t);
  });
  var out = [];
  Object.keys(by).forEach(function (k) {
    var list = by[k].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var months = {};
    list.forEach(function (t) { months[t.date.substr(0, 7)] = t; });
    var ms = Object.keys(months).sort();
    if (ms.length < 3) return;
    var last3 = ms.slice(-3).map(function (m) { return months[m]; });
    var amts = last3.map(function (t) { return t.amount; });
    var mn = Math.min.apply(null, amts), mx = Math.max.apply(null, amts);
    if (mx > mn * 1.1) return;
    var lastT = last3[2];
    var day = +lastT.date.substr(8, 2);
    var y = +lastT.date.substr(0, 4), m = +lastT.date.substr(5, 2);
    m += 1; if (m > 12) { m = 1; y++; }
    var dim = new Date(y, m, 0).getDate();
    var next = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + Math.min(day, dim)).slice(-2);
    out.push({ desc: lastT.desc, amount: lastT.amount, cur: lastT.cur, card: lastT.card, nextDate: next });
  });
  return out.sort(function (a, b) { return a.nextDate < b.nextDate ? -1 : 1; });
}

function weekdayLabel_(d) {
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
}

function mondayOf_(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var wd = x.getDay(); // 0 = CN
  x.setDate(x.getDate() - (wd === 0 ? 6 : wd - 1));
  return x;
}

function appendTxnRow_(o) {
  var sh = sheet_(S.TXN);
  var dateStr = o.date || fmtDate_(new Date());
  var d = parseDate_(dateStr);
  var time = o.time || Utilities.formatDate(new Date(), TZ, 'HH:mm');
  var row = Math.max(sh.getLastRow() + 1, TXN_FIRST_ROW);
  var rates = getRates_();
  var rate = num_(o.rate) > 0 ? num_(o.rate) : rateForDate_(dateStr, rates);
  var values = [[
    d, time, weekdayLabel_(d), mondayOf_(d),
    o.card || '', o.desc || '', o.cat || '', o.type, o.amount, o.cur,
    '', o.note || '', o.group || '', rate, o.trip || '', o.src || 'app'
  ]];
  sh.getRange(row, 1, 1, TXN_COLS).setValues(values);
  sh.getRange(row, 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(row, 4).setNumberFormat('dd/MM/yyyy');
  sh.getRange(row, 9).setNumberFormat(o.cur === 'VND' ? '#,##0' : '#,##0.00');
  sh.getRange(row, 14).setNumberFormat('#,##0');
  return row;
}

function apiAddTxn_(req) {
  var amount = num_(req.amount);
  if (!(amount > 0)) throw new Error('Số tiền phải lớn hơn 0');
  var type = req.type === 'Thu' ? 'Thu' : 'Chi';
  var cur = String(req.currency).toUpperCase() === 'AUD' ? 'AUD' : 'VND';
  var cards = getCards_();
  var card = cards.filter(function (c) { return c.name === req.card; })[0];
  var group = card ? card.group : (cur === 'VND' ? 'Việt Nam' : 'Úc');
  var cat = req.category || matchCategory_(req.desc, getRules_());
  var dateStr = req.date || fmtDate_(new Date());
  var row = appendTxnRow_({
    date: dateStr, time: req.time, card: req.card, desc: req.desc, cat: cat,
    type: type, amount: amount, cur: cur, note: req.note, group: group,
    trip: tripFor_(dateStr, getTrips_()), src: 'app'
  });
  return { row: row, category: cat };
}

function apiUpdateTxn_(req) {
  var sh = sheet_(S.TXN);
  var row = +req.row;
  if (row < TXN_FIRST_ROW || row > sh.getLastRow()) throw new Error('Dòng không tồn tại');
  var v = sh.getRange(row, 1, 1, 9).getValues()[0];
  if (String(v[5]) !== String((req.old || {}).desc || '') || Math.abs(num_(v[8]) - num_((req.old || {}).amount)) > 0.001) {
    throw new Error('Dòng đã thay đổi, hãy tải lại rồi thử lại');
  }
  var amount = num_(req.amount);
  if (!(amount > 0)) throw new Error('Số tiền phải lớn hơn 0');
  var cur = String(req.currency).toUpperCase() === 'AUD' ? 'AUD' : 'VND';
  var type = req.type === 'Thu' ? 'Thu' : 'Chi';
  var card = getCards_().filter(function (c) { return c.name === req.card; })[0];
  var group = card ? card.group : (cur === 'VND' ? 'Việt Nam' : 'Úc');
  var dateStr = req.date || toDateStr_(v[0]);
  var d = parseDate_(dateStr);
  sh.getRange(row, 1).setValue(d);
  sh.getRange(row, 3).setValue(weekdayLabel_(d));
  sh.getRange(row, 4).setValue(mondayOf_(d));
  sh.getRange(row, 5, 1, 6).setValues([[req.card || '', req.desc || '', req.category || '', type, amount, cur]]);
  sh.getRange(row, 12, 1, 2).setValues([[req.note || '', group]]);
  sh.getRange(row, 15).setValue(tripFor_(dateStr, getTrips_()));
  sh.getRange(row, 9).setNumberFormat(cur === 'VND' ? '#,##0' : '#,##0.00');
  return { row: row };
}

function apiDeleteTxn_(req) {
  var sh = sheet_(S.TXN);
  var row = +req.row;
  if (row < TXN_FIRST_ROW || row > sh.getLastRow()) throw new Error('Dòng không tồn tại');
  var v = sh.getRange(row, 1, 1, 9).getValues()[0];
  // Kiểm tra dòng chưa bị lệch trước khi xóa
  if (String(v[5]) !== String(req.desc || '') || Math.abs(num_(v[8]) - num_(req.amount)) > 0.001) {
    throw new Error('Dòng đã thay đổi, hãy tải lại rồi thử lại');
  }
  sh.deleteRow(row);
  return { deleted: row };
}

/* ------------------------------------------------------------------ */
/* Chuyển tiền Úc → Việt Nam                                           */
/* ------------------------------------------------------------------ */

function apiAddTransfer_(req) {
  var aud = num_(req.aud), vnd = num_(req.vnd), fee = num_(req.fee);
  if (!(aud > 0) || !(vnd > 0)) throw new Error('Cần nhập số AUD gửi và số VND nhận');
  var dateStr = req.date || fmtDate_(new Date());
  var rates = getRates_();
  var market = num_(req.market) || rateForDate_(dateStr, rates);
  var effective = vnd / (aud + fee);
  var marketVnd = (aud + fee) * market;
  var lossVnd = marketVnd - vnd;
  var trips = getTrips_();
  var trip = tripFor_(dateStr, trips);

  var cards = getCards_();
  var from = cards.filter(function (c) { return c.name === req.fromCard; })[0];
  var to = cards.filter(function (c) { return c.name === req.toCard; })[0];
  var label = (req.provider ? req.provider + ': ' : '') + 'Chuyển tiền về Việt Nam';

  // Hai phía của lệnh chuyển (không tính vào thu/chi), cộng phí là chi phí phát sinh
  appendTxnRow_({ date: dateStr, card: req.fromCard, desc: label, cat: 'Chuyển tiền', type: 'Chi',
    amount: aud, cur: 'AUD', note: req.note, group: from ? from.group : 'Úc', trip: trip, src: 'app', rate: effective });
  appendTxnRow_({ date: dateStr, card: req.toCard, desc: label, cat: 'Chuyển tiền', type: 'Thu',
    amount: vnd, cur: 'VND', note: req.note, group: to ? to.group : 'Việt Nam', trip: trip, src: 'app', rate: effective });
  if (fee > 0) {
    appendTxnRow_({ date: dateStr, card: req.fromCard, desc: 'Phí chuyển tiền' + (req.provider ? ' ' + req.provider : ''),
      cat: 'Phát sinh', type: 'Chi', amount: fee, cur: 'AUD', group: from ? from.group : 'Úc', trip: trip, src: 'app', rate: effective });
  }

  var sh = sheet_(S.XFER);
  sh.appendRow([parseDate_(dateStr), req.provider || '', req.fromCard || '', req.toCard || '',
    aud, fee, vnd, effective, market, (effective - market) / market, req.note || '']);
  var r = sh.getLastRow();
  sh.getRange(r, 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(r, 7).setNumberFormat('#,##0');
  sh.getRange(r, 8).setNumberFormat('#,##0');
  sh.getRange(r, 9).setNumberFormat('#,##0');
  sh.getRange(r, 10).setNumberFormat('0.00%');
  return { effective: effective, market: market, lossVnd: lossVnd, lossAud: lossVnd / market };
}

function apiTransfers_() {
  var sh = ss_().getSheetByName(S.XFER);
  if (!sh || sh.getLastRow() < 2) return { transfers: [] };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  return {
    transfers: rows.filter(function (r) { return r[0]; }).map(function (r) {
      return { date: toDateStr_(r[0]), provider: String(r[1]), fromCard: String(r[2]), toCard: String(r[3]),
        aud: num_(r[4]), fee: num_(r[5]), vnd: num_(r[6]), effective: num_(r[7]), market: num_(r[8]),
        diff: num_(r[9]), note: String(r[10] || '') };
    }).reverse()
  };
}

/* ------------------------------------------------------------------ */
/* Quy tắc, ngân sách, chuyến đi, mục tiêu, cấu hình                    */
/* ------------------------------------------------------------------ */

function upsertByKeys_(sh, keys, values) {
  var last = sh.getLastRow();
  if (last >= 2) {
    var data = sh.getRange(2, 1, last - 1, keys.length).getValues();
    for (var i = 0; i < data.length; i++) {
      var same = true;
      for (var k = 0; k < keys.length; k++) {
        if (String(data[i][k]).toLowerCase() !== String(keys[k]).toLowerCase()) { same = false; break; }
      }
      if (same) { sh.getRange(i + 2, 1, 1, values.length).setValues([values]); return i + 2; }
    }
  }
  sh.appendRow(values);
  return sh.getLastRow();
}

function apiSetRule_(req) {
  var kw = String(req.keyword || '').trim();
  if (!kw || !req.category) throw new Error('Thiếu từ khóa hoặc danh mục');
  upsertByKeys_(sheet_(S.RULE), [kw], [kw, req.category]);
  return { keyword: kw, category: req.category };
}

function apiSetBudget_(req) {
  var amt = num_(req.amount);
  var sh = sheet_(S.BUDGET);
  if (amt <= 0) {
    // Số tiền 0 = xóa ngân sách
    var last = sh.getLastRow();
    for (var r = last; r >= 2; r--) {
      var v = sh.getRange(r, 1, 1, 2).getValues()[0];
      if (v[0] === req.group && v[1] === req.category) sh.deleteRow(r);
    }
    return { removed: true };
  }
  upsertByKeys_(sh, [req.group, req.category], [req.group, req.category, amt]);
  return { group: req.group, category: req.category, amount: amt };
}

function apiAddTrip_(req) {
  if (!req.name || !req.from || !req.to) throw new Error('Thiếu tên hoặc ngày');
  sheet_(S.TRIP).appendRow([req.name, parseDate_(req.from), parseDate_(req.to)]);
  var r = sheet_(S.TRIP).getLastRow();
  sheet_(S.TRIP).getRange(r, 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  return { ok: true };
}

function apiAddGoal_(req) {
  if (!req.name || !(num_(req.target) > 0)) throw new Error('Thiếu tên hoặc số tiền mục tiêu');
  var cur = String(req.currency).toUpperCase() === 'VND' ? 'VND' : 'AUD';
  var sh = sheet_(S.GOAL);
  sh.appendRow([req.name, num_(req.target), cur, req.due ? parseDate_(req.due) : '', num_(req.saved)]);
  var r = sh.getLastRow();
  sh.getRange(r, 4).setNumberFormat('dd/MM/yyyy');
  return { row: r };
}

function apiUpdateGoal_(req) {
  var sh = sheet_(S.GOAL);
  var row = +req.row;
  if (row < 2 || row > sh.getLastRow()) throw new Error('Không có mục tiêu này');
  sh.getRange(row, 5).setValue(num_(req.saved));
  return { row: row };
}

function apiDeleteGoal_(req) {
  var sh = sheet_(S.GOAL);
  var row = +req.row;
  if (row < 2 || row > sh.getLastRow()) throw new Error('Không có mục tiêu này');
  sh.deleteRow(row);
  return { deleted: row };
}

var ALLOWED_CONFIG_ = { ACB_NGAY_SAO_KE: 1, ACB_NGAY_DEN_HAN: 1 };

function apiSetConfig_(req) {
  if (!ALLOWED_CONFIG_[req.key]) throw new Error('Khóa cấu hình không hợp lệ');
  upsertByKeys_(sheet_(S.CFG), [req.key], [req.key, req.value]);
  return { key: req.key };
}
