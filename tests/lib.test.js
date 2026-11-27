const assert = require('assert');
const L = require('../docs/lib.js');
const q = (t, c) => L.parseQuick(t, c);
let n = 0; const ok = (a, b) => { assert.deepStrictEqual(a, b); n++; };

ok(q('phở 65k', 'AUD'), { desc: 'phở', amount: 65000, currency: 'VND', explicitCurrency: true });
ok(q('grab 1tr2', 'AUD').amount, 1200000);
ok(q('grab 1tr2', 'AUD').currency, 'VND');
ok(q('cơm 1k5', 'AUD').amount, 1500);
ok(q('coffee 5.5', 'AUD').amount, 5.5);
ok(q('coffee 5.5', 'AUD').currency, 'AUD');
ok(q('coffee 5.5', 'VND').currency, 'VND');
ok(q('woolworths $48.30', 'VND').currency, 'AUD');
ok(q('woolworths $48.30', 'VND').amount, 48.3);
ok(q('lương 3.000 aud', 'VND').amount, 3000);
ok(q('lương 3.000 aud', 'VND').currency, 'AUD');
ok(q('tiền điện 250.000đ', 'AUD').amount, 250000);
ok(q('tiền điện 250.000đ', 'AUD').desc, 'tiền điện');
ok(q('65 k phở bò', 'AUD').amount, 65000);
ok(q('65 k phở bò', 'AUD').desc, 'phở bò');
ok(q('1,200.50', 'AUD').amount, 1200.5);
ok(q('chỉ chữ', 'AUD').amount, null);
ok(q('12', 'AUD').amount, 12);
ok(q('1.5tr tiền nhà', 'AUD').amount, 1500000);

const rules = [{ keyword: 'woolworths', category: 'Ăn tại nhà' }, { keyword: 'cà phê', category: 'Ăn ngoài' }, { keyword: 'coffee', category: 'Ăn ngoài' }];
ok(L.matchCategory('WOOLWORTHS Richmond', rules), 'Ăn tại nhà');
ok(L.matchCategory('ca phe sua', rules), 'Ăn ngoài');
ok(L.matchCategory('random', rules), '');

ok(L.fmtMoney(65000, 'VND').replace(/\s/g, ''), '65.000₫');
ok(L.fmtMoney(5.5, 'AUD'), '$5.50');
ok(L.fmtCompact(1200000, 'VND'), '1.2tr');

const cats = [
  { group: 'THU NHẬP', name: 'Lương', type: 'Thu' },
  { group: 'CHI PHÍ BIẾN ĐỔI', name: 'Ăn ngoài', type: 'Chi' },
  { group: 'CHI PHÍ BIẾN ĐỔI', name: 'Đi lại', type: 'Chi' },
  { group: 'CHI PHÍ CỐ ĐỊNH', name: 'Thuê nhà', type: 'Chi' },
  { group: 'TIẾT KIỆM & ĐẦU TƯ', name: 'Đầu tư', type: 'Chi' },
  { group: 'KHÔNG TÍNH VÀO THU/CHI', name: 'Chuyển tiền', type: 'Cả hai' }
];
const T = (date, cat, type, amount, cur, group, extra) => Object.assign({ date, cat, type, amount, cur, group, rate: 17000, card: 'CommBank', desc: cat }, extra || {});
const txns = [
  T('2026-11-01', 'Lương', 'Thu', 5000, 'AUD', 'Úc'),
  T('2026-11-02', 'Thuê nhà', 'Chi', 1500, 'AUD', 'Úc'),
  T('2026-11-03', 'Ăn ngoài', 'Chi', 100, 'AUD', 'Úc'),
  T('2026-11-10', 'Đi lại', 'Chi', 60, 'AUD', 'Úc'),
  T('2026-11-12', 'Ăn ngoài', 'Chi', 25, 'AUD', 'Úc'),
  T('2026-11-12', 'Chuyển tiền', 'Chi', 1000, 'AUD', 'Úc'),
  T('2026-11-12', 'Đầu tư', 'Chi', 300, 'AUD', 'Úc'),
  T('2026-11-12', 'Ăn ngoài', 'Chi', 85000, 'VND', 'Việt Nam', { card: 'ACB Credit' })
];
const rep = L.monthReport(txns, '2026-11', 'AUD', cats);
ok(rep.income, 5000);
ok(Math.round(rep.expense * 100) / 100, 1500 + 100 + 60 + 25 + 5);
ok(rep.saving, 300);
ok(Math.round(rep.left), Math.round(5000 - rep.expense - 300));

// Còn được tiêu hôm nay: ngân sách biến đổi Úc = 400 AUD, hôm nay 12/11 (19 ngày còn lại gồm hôm nay)
const budgets = [{ group: 'Úc', category: 'Ăn ngoài', amount: 250 }, { group: 'Úc', category: 'Đi lại', amount: 150 }, { group: 'Úc', category: 'Thuê nhà', amount: 1500 }];
const da = L.dailyAllowance({ group: 'Úc', today: '2026-11-12', txns, categories: cats, budgets });
ok(da.total, 400);
ok(da.spentBefore, 160);
ok(da.spentToday, 25);
ok(da.daysLeft, 19);
ok(Math.round(da.allowance * 100) / 100, Math.round((240 / 19) * 100) / 100);
ok(Math.round(da.left * 100) / 100, Math.round((240 / 19 - 25) * 100) / 100);
ok(L.dailyAllowance({ group: 'Việt Nam', today: '2026-11-12', txns, categories: cats, budgets }), null);

const tc = L.transferCalc(1000, 5, 16500000, 17000);
ok(Math.round(tc.effective), 16418);
ok(Math.round(tc.lossVnd), 17085000 - 16500000);
ok(L.transferCalc(0, 0, 0, 17000), null);

ok(L.mondayOf('2026-11-29'), '2026-11-23');
ok(L.mondayOf('2026-11-27'), '2026-11-23');
ok(L.shiftMonth('2026-01', -1), '2025-12');
ok(L.shiftMonth('2026-11', 3), '2027-02');
ok(L.nextDayOfMonth('2026-11-27', 5), '2026-12-05');
ok(L.nextDayOfMonth('2026-11-27', 31), '2026-11-30');
ok(L.cycleSpend([{ card: 'ACB Credit', date: '2026-11-12', type: 'Chi', amount: 85000 }, { card: 'ACB Credit', date: '2026-10-20', type: 'Chi', amount: 500 }], 'ACB Credit', 25, '2026-11-27').total, 0);
ok(L.cycleSpend([{ card: 'ACB Credit', date: '2026-11-26', type: 'Chi', amount: 85000 }], 'ACB Credit', 25, '2026-11-27').total, 85000);
ok(L.isUnusual(300, 'AUD', 17000, 'Ăn ngoài', { 'Ăn ngoài': { n: 10, median: 300000 } }), true);
ok(L.isUnusual(10, 'AUD', 17000, 'Ăn ngoài', { 'Ăn ngoài': { n: 10, median: 300000 } }), false);
console.log('OK', n, 'kiểm tra');
