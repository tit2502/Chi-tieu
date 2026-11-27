/* core.js — quy tắc tính tiền, học từ file Excel QuanLyChiTieu (TheoNgay / TinhToan / DanhMuc / TyGia).
   Không đụng tới giao diện; chạy được cả trong trình duyệt lẫn Node để kiểm tra. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const C = {};

  // Nhóm danh mục (sheet DanhMuc) -> loại
  const KIND = {
    'THU NHẬP': 'thu',
    'CHI PHÍ CỐ ĐỊNH': 'fixed',
    'CHI PHÍ BIẾN ĐỔI': 'var',
    'TIẾT KIỆM & ĐẦU TƯ': 'save',
    'KHÔNG TÍNH VÀO THU/CHI': 'transfer'
  };
  C.KIND = KIND;
  C.GROUPS = Object.keys(KIND);
  C.CAT_TRANSFER_MONEY = 'Chuyển tiền';
  C.CAT_TRANSFER_WALLET = 'Chuyển ví';
  C.CAT_FEE = 'Phát sinh';
  const DAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const DAY_FULL = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  C.DAY_FULL = DAY_FULL;

  // ---------- ngày (chuỗi YYYY-MM-DD, không phụ thuộc múi giờ) ----------
  const pad = (n) => (n < 10 ? '0' : '') + n;
  C.pad = pad;
  C.toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  C.fmtDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  C.addDays = (s, n) => { const d = C.toDate(s); d.setDate(d.getDate() + n); return C.fmtDate(d); };
  C.today = () => C.fmtDate(new Date());
  C.weekday = (s) => C.toDate(s).getDay(); // 0 = CN
  C.dayShort = (s) => DAY_VN[C.weekday(s)];
  C.weekStart = (s, startDay) => { // startDay: 1 = Thứ Hai, 0 = Chủ Nhật
    const wd = C.weekday(s);
    const back = (wd - startDay + 7) % 7;
    return C.addDays(s, -back);
  };
  C.monthKey = (s) => s.slice(0, 7);
  C.daysInMonth = (y, m) => new Date(y, m, 0).getDate();

  // ---------- tỷ giá AUD -> VND (theo tháng giao dịch) ----------
  // Ưu tiên: nhập tay (rates) > trung bình các lần cập nhật tự động trong tháng (rateLog) > giá trị nhập từ Excel (rateBase) > tỷ giá hiện tại
  C.rateFor = function (state, dateStr) {
    const m = dateStr.slice(0, 7);
    if (state.rates && state.rates[m] > 0) return state.rates[m];
    if (state.rateLog) {
      let s = 0, n = 0;
      for (const k in state.rateLog) if (k.startsWith(m)) { s += state.rateLog[k]; n++; }
      if (n) return s / n;
    }
    if (state.rateBase && state.rateBase[m] > 0) return state.rateBase[m];
    return state.rateNow > 0 ? state.rateNow : 18400;
  };
  C.rateSource = function (state, m) {
    if (state.rates && state.rates[m] > 0) return 'tay';
    if (state.rateLog) for (const k in state.rateLog) if (k.startsWith(m)) return 'tự động';
    if (state.rateBase && state.rateBase[m] > 0) return 'Excel';
    return 'hiện tại';
  };

  C.convert = function (t, to, rate) {
    if (t.cur === to) return t.amount;
    if (to === 'VND') return (t.vndActual > 0 && t.cur === 'AUD') ? t.vndActual : t.amount * rate;
    return t.amount / rate; // VND -> AUD
  };

  // ---------- ngữ cảnh tra cứu ----------
  C.makeCtx = function (state) {
    const cardMap = {}; state.cards.forEach((c) => { cardMap[c.name] = c; });
    const kindMap = {}; state.cats.forEach((c) => { kindMap[c.name] = KIND[c.group] || 'unknown'; });
    const ctx = { state, cardMap, kindMap };
    ctx.rate = (d) => C.rateFor(state, d);
    // Nhóm (Úc / Việt Nam) theo NGÂN HÀNG của thẻ, không theo tiền tệ giao dịch. Thẻ lạ: theo tiền tệ giao dịch.
    ctx.group = (t) => { const c = cardMap[t.card]; return c ? c.group : (t.cur === 'VND' ? 'Việt Nam' : 'Úc'); };
    ctx.cardKind = (t) => { const c = cardMap[t.card]; return c ? c.kind : ''; };
    ctx.catKind = (t) => kindMap[t.cat] || 'unknown';
    ctx.conv = (t, to) => C.convert(t, to, ctx.rate(t.date));
    return ctx;
  };

  // ---------- tổng hợp (giống TheoNgay) ----------
  // Úc  : Còn lại = Thu − Chi − Tiết kiệm (tiền mặt Úc đã nằm trong Chi)
  // VN  : Còn lại = Thu − Debit − Tiền mặt (Credit chỉ theo dõi, không trừ)
  // Chuyển ví / Chuyển tiền không tính vào thu hay chi (riêng bên Việt Nam, Chuyển ví vẫn tính vào chi theo công thức gốc)
  C.summarize = function (ctx, txns, disp) {
    const r = {
      uc: { thu: 0, chi: 0, save: 0, cash: 0, left: 0 },
      vn: { thu: 0, thuAUD: 0, debit: 0, credit: 0, cash: 0, left: 0 },
      count: txns.length
    };
    for (const t of txns) {
      const grp = ctx.group(t), ck = ctx.catKind(t), kind = ctx.cardKind(t);
      const transfer = ck === 'transfer';
      if (grp !== 'Việt Nam') {
        const v = ctx.conv(t, disp);
        if (t.type === 'Thu') { if (!transfer) r.uc.thu += v; }
        else if (t.type === 'Chi') {
          if (ck === 'save') r.uc.save += v;
          else if (!transfer) { r.uc.chi += v; if (kind === 'Tiền mặt') r.uc.cash += v; }
        }
      } else {
        if (t.type === 'Thu') {
          if (!transfer) { r.vn.thu += ctx.conv(t, 'VND'); r.vn.thuAUD += ctx.conv(t, 'AUD'); }
        } else if (t.type === 'Chi' && t.cat !== C.CAT_TRANSFER_MONEY) {
          const v = ctx.conv(t, 'VND');
          if (kind === 'Debit') r.vn.debit += v;
          else if (kind === 'Credit') r.vn.credit += v;
          else if (kind === 'Tiền mặt') r.vn.cash += v;
        }
      }
    }
    r.uc.left = r.uc.thu - r.uc.chi - r.uc.save;
    r.vn.left = r.vn.thu - r.vn.debit - r.vn.cash;
    return r;
  };

  C.inRange = (txns, from, to) => txns.filter((t) => t.date >= from && t.date <= to);

  C.weekTable = function (ctx, txns, start, disp) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = C.addDays(start, i);
      const list = txns.filter((t) => t.date === d);
      days.push({ date: d, list, sum: C.summarize(ctx, list, disp) });
    }
    const all = C.inRange(txns, start, C.addDays(start, 6));
    return { start, end: C.addDays(start, 6), days, total: C.summarize(ctx, all, disp), count: all.length };
  };

  // Tổng quát (mọi thẻ, quy đổi về 1 loại tiền) — dùng cho tiêu đề ngày, lịch, thống kê
  C.flow = function (ctx, txns, disp) {
    let thu = 0, chi = 0, save = 0;
    for (const t of txns) {
      const ck = ctx.catKind(t);
      if (ck === 'transfer') continue;
      const v = ctx.conv(t, disp);
      if (t.type === 'Thu') thu += v;
      else if (t.type === 'Chi') { if (ck === 'save') save += v; else chi += v; }
    }
    return { thu, chi, save, net: thu - chi - save };
  };

  C.catBreakdown = function (ctx, txns, o) {
    const map = {};
    for (const t of txns) {
      if (t.type !== o.type) continue;
      const ck = ctx.catKind(t);
      if (ck === 'transfer') continue;
      if (o.type === 'Chi' && ck === 'save' && !o.withSave) continue;
      if (o.scope && o.scope !== 'all' && ctx.group(t) !== o.scope) continue;
      const k = t.cat || 'Chưa phân loại';
      if (!map[k]) map[k] = { cat: k, value: 0, count: 0 };
      map[k].value += ctx.conv(t, o.disp); map[k].count++;
    }
    const list = Object.values(map).sort((a, b) => b.value - a.value);
    const total = list.reduce((s, x) => s + x.value, 0);
    list.forEach((x) => { x.pct = total ? x.value / total : 0; });
    return { list, total };
  };

  // Số lần dùng thẻ + chi tiêu theo thẻ: mọi giao dịch Chi trên thẻ (kể cả chuyển ví / chuyển tiền)
  C.cardUsage = function (ctx, txns, disp) {
    const map = {};
    for (const t of txns) {
      if (t.type !== 'Chi') continue;
      const k = t.card || 'Khác / chưa rõ thẻ';
      if (!map[k]) map[k] = { card: k, value: 0, count: 0 };
      map[k].value += ctx.conv(t, disp); map[k].count++;
    }
    const list = Object.values(map).sort((a, b) => b.count - a.count || b.value - a.value);
    const n = list.reduce((s, x) => s + x.count, 0), v = list.reduce((s, x) => s + x.value, 0);
    list.forEach((x) => { x.pctCount = n ? x.count / n : 0; x.pct = v ? x.value / v : 0; });
    return { list, count: n, total: v };
  };

  // ---------- ngân sách ----------
  // budget: {scope:'Úc'|'Việt Nam', cat:'*'|tên danh mục, amount} — đơn vị: Úc = AUD, Việt Nam = VND
  C.budgetStatus = function (ctx, budgets, txns) {
    return budgets.map((b) => {
      const cur = b.scope === 'Việt Nam' ? 'VND' : 'AUD';
      let used = 0;
      for (const t of txns) {
        if (t.type !== 'Chi') continue;
        const ck = ctx.catKind(t);
        if (ck === 'transfer' || ck === 'save') continue;
        if (ctx.group(t) !== b.scope) continue;
        if (b.cat !== '*' && t.cat !== b.cat) continue;
        used += ctx.conv(t, cur);
      }
      const pct = b.amount > 0 ? used / b.amount : 0;
      return { ...b, cur, used, pct, level: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok' };
    });
  };

  // ---------- quy tắc từ khóa (QuyTac) ----------
  const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9À-Ỹ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  C.norm = norm;
  C.cleanDesc = (s) => (s || '').replace(/\.?\s*So far this month.*$/i, '').replace(/\s+/g, ' ').trim();
  // Từ khóa dài nhất khớp thắng (vd. COSTCO RINGWOOD thắng COSTCO)
  C.matchRule = function (rules, desc) {
    const d = norm(C.cleanDesc(desc));
    if (!d) return null;
    let best = null;
    for (const r of rules) {
      const k = norm(r.kw);
      if (k && d.includes(k) && (!best || k.length > norm(best.kw).length)) best = r;
    }
    return best;
  };
  C.ruleKeyFrom = function (desc) {
    let s = C.cleanDesc(desc).split(/[,(\-]/)[0];
    s = norm(s);
    return s.slice(0, 24).trim();
  };

  // ---------- giao dịch định kỳ (DinhKy) ----------
  const WD_NAMES = { 'chủ nhật': 0, 'thứ hai': 1, 'thứ ba': 2, 'thứ tư': 3, 'thứ năm': 4, 'thứ sáu': 5, 'thứ bảy': 6 };
  C.WD_NAMES = WD_NAMES;
  // rec: {name,type,amount,cur,card,cat,cycle:'month'|'week',day:1-31|0-6,start,last,on}
  C.dueDates = function (rec, today, cap) {
    if (!rec.on) return [];
    cap = cap || 62;
    let from = rec.last ? C.addDays(rec.last, 1) : (rec.start || today);
    if (rec.start && from < rec.start) from = rec.start;
    const out = [];
    let d = from, guard = 0;
    while (d <= today && guard++ < 800 && out.length < cap) {
      const dt = C.toDate(d);
      if (rec.cycle === 'week') { if (dt.getDay() === Number(rec.day)) out.push(d); }
      else {
        const dim = C.daysInMonth(dt.getFullYear(), dt.getMonth() + 1);
        if (dt.getDate() === Math.min(Number(rec.day), dim)) out.push(d);
      }
      d = C.addDays(d, 1);
    }
    return out;
  };

  // ---------- định dạng tiền ----------
  C.fmt = function (v, cur, opt) {
    opt = opt || {};
    const neg = v < 0; const a = Math.abs(v);
    let s;
    if (cur === 'VND') {
      if (opt.compact && a >= 1e6) s = (a / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: a >= 1e7 ? 1 : 2 }) + 'tr';
      else if (opt.compact && a >= 1e4) s = (a / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'k';
      else s = Math.round(a).toLocaleString('vi-VN');
      s += opt.noSym ? '' : ' ₫';
    } else {
      if (opt.compact && a >= 1e4) s = (a / 1e3).toLocaleString('en-AU', { maximumFractionDigits: 1 }) + 'k';
      else if (opt.compact && a >= 100) s = Math.round(a).toLocaleString('en-AU');
      else s = a.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      s = (opt.noSym ? '' : '$') + s;
    }
    return (neg ? '−' : '') + s;
  };

  return C;
});
