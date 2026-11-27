/* Logic thuần (không đụng DOM) – dùng được cả trong trình duyệt lẫn Node để kiểm thử. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NO_COUNT_GROUP = 'KHÔNG TÍNH VÀO THU/CHI';
  var SAVING_GROUP = 'TIẾT KIỆM & ĐẦU TƯ';
  var VARIABLE_GROUP = 'CHI PHÍ BIẾN ĐỔI';

  /* ---------------- Văn bản ---------------- */

  function stripAccents(s) {
    return String(s || '').toLowerCase().replace(/đ/g, 'd')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ---------------- Phân tích số tiền ---------------- */

  function parseNumber(str) {
    var s = String(str);
    var hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
    if (hasDot && hasComma) {
      var dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
      var thou = dec === '.' ? ',' : '.';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      s = s.replace(/[.,]/g, '');
    } else {
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  var UNIT_RE = /^(k|ng|ngan|nghin|nghìn|tr|trieu|triệu|aud|vnd|đ|d|\$)$/i;

  /** Một token như "65k", "1tr2", "$5.5", "5.5aud", "250.000đ" → {value, cur} hoặc null */
  function parseAmountToken(tok) {
    var m = /^(\$)?(\d[\d.,]*)(k|ng|ngan|nghin|nghìn|tr|trieu|triệu|aud|vnd|đ|d|\$)?(\d+)?$/i.exec(tok);
    if (!m) return null;
    var unit = (m[3] || '').toLowerCase();
    var base = parseNumber(m[2]);
    if (base === null) return null;
    if (m[4] && !/^(k|ng|ngan|nghin|nghìn|tr|trieu|triệu)$/.test(unit)) return null;
    var cur = null, value = base;
    if (m[1] || unit === '$' || unit === 'aud') cur = 'AUD';
    if (unit === 'vnd' || unit === 'đ' || unit === 'd') cur = 'VND';
    if (/^(k|ng|ngan|nghin|nghìn)$/.test(unit)) {
      cur = 'VND'; value = base * 1000;
      if (m[4]) value += parseInt(m[4], 10) * Math.pow(10, 3 - m[4].length);
    } else if (/^(tr|trieu|triệu)$/.test(unit)) {
      cur = 'VND'; value = base * 1e6;
      if (m[4]) value += parseInt(m[4], 10) * Math.pow(10, 6 - m[4].length);
    }
    return { value: value, cur: cur };
  }

  /**
   * "phở 65k" → {desc:'phở', amount:65000, currency:'VND'}
   * "coffee 5.5" → dùng defaultCur (tiền của thẻ đang chọn)
   * "grab 1tr2", "woolworths $48.3", "lương 3.000 aud"
   */
  function parseQuick(text, defaultCur) {
    var tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
    var found = -1, amt = null, usedNext = false;
    for (var i = tokens.length - 1; i >= 0; i--) {
      var a = parseAmountToken(tokens[i]);
      if (a) { amt = a; found = i; break; }
    }
    if (!amt) return { desc: tokens.join(' '), amount: null, currency: defaultCur || 'AUD' };
    // đơn vị đứng riêng ngay sau số: "65 k", "5 aud"
    if (found + 1 < tokens.length && UNIT_RE.test(tokens[found + 1]) && /^\d[\d.,]*$/.test(tokens[found])) {
      var merged = parseAmountToken(tokens[found] + tokens[found + 1]);
      if (merged) { amt = merged; usedNext = true; }
    }
    var rest = tokens.filter(function (_, idx) { return idx !== found && !(usedNext && idx === found + 1); });
    return {
      desc: rest.join(' '),
      amount: amt.value,
      currency: amt.cur || defaultCur || 'AUD',
      explicitCurrency: !!amt.cur
    };
  }

  /* ---------------- Tự phân loại ---------------- */

  function matchCategory(desc, rules) {
    var d = stripAccents(desc), best = null;
    (rules || []).forEach(function (r) {
      var k = stripAccents(r.keyword).trim();
      if (k && d.indexOf(k) >= 0 && (!best || k.length > best.k.length)) best = { k: k, c: r.category };
    });
    return best ? best.c : '';
  }

  /* ---------------- Tiền tệ ---------------- */

  function convert(amount, from, to, rate) {
    if (from === to) return amount;
    return from === 'AUD' ? amount * rate : amount / rate;
  }

  function fmtMoney(amount, cur, opts) {
    opts = opts || {};
    var n = Number(amount) || 0;
    if (cur === 'VND') {
      var s = Math.round(Math.abs(n)).toLocaleString('vi-VN');
      return (n < 0 ? '-' : '') + s + '₫';
    }
    var d = opts.noCents || Math.abs(n) >= 10000 ? 0 : 2;
    var t = Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (n < 0 ? '-' : '') + '$' + t;
  }

  function fmtCompact(amount, cur) {
    var n = Math.abs(amount);
    if (cur === 'VND') {
      if (n >= 1e6) return (amount < 0 ? '-' : '') + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'tr';
      if (n >= 1e3) return (amount < 0 ? '-' : '') + Math.round(n / 1e3) + 'k';
      return String(Math.round(amount));
    }
    return fmtMoney(amount, 'AUD', { noCents: n >= 100 });
  }

  /* ---------------- Ngày ---------------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { return new Date(+s.substr(0, 4), +s.substr(5, 2) - 1, +s.substr(8, 2)); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function monthKey(s) { return s.substr(0, 7); }
  function shiftMonth(key, delta) {
    var y = +key.substr(0, 4), m = +key.substr(5, 2) - 1 + delta;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }
  function mondayOf(s) {
    var d = parseYmd(s), wd = d.getDay();
    d.setDate(d.getDate() - (wd === 0 ? 6 : wd - 1));
    return ymd(d);
  }

  /* ---------------- Phân loại giao dịch cho báo cáo ---------------- */

  function categoryGroupMap(categories) {
    var m = {};
    (categories || []).forEach(function (c) { m[c.name] = c.group; });
    return m;
  }

  /** 'in' | 'out' | 'saving' | 'ignore' */
  function kindOf(t, groupMap) {
    var g = groupMap[t.cat];
    if (g === NO_COUNT_GROUP) return 'ignore';
    if (t.type === 'Thu') return 'in';
    if (g === SAVING_GROUP) return 'saving';
    return 'out';
  }

  function inMonth(t, key) { return t.date.substr(0, 7) === key; }

  function tIn(t, cur) { return convert(t.amount, t.cur, cur, t.rate); }

  /* ---------------- Ngân sách và "còn được tiêu hôm nay" ---------------- */

  function groupCur(group) { return group === 'Việt Nam' ? 'VND' : 'AUD'; }

  function spentByCategory(txns, groupName, monthK, categories, untilDateExclusive) {
    var gm = categoryGroupMap(categories), cur = groupCur(groupName), out = {};
    txns.forEach(function (t) {
      if (t.group !== groupName || !inMonth(t, monthK)) return;
      if (untilDateExclusive && t.date >= untilDateExclusive) return;
      if (kindOf(t, gm) !== 'out') return;
      out[t.cat] = (out[t.cat] || 0) + tIn(t, cur);
    });
    return out;
  }

  function dailyAllowance(opts) {
    var groupName = opts.group, today = opts.today, cur = groupCur(groupName);
    var gm = categoryGroupMap(opts.categories);
    var variable = (opts.budgets || []).filter(function (b) {
      return b.group === groupName && gm[b.category] === VARIABLE_GROUP;
    });
    if (!variable.length) return null;
    var total = variable.reduce(function (s, b) { return s + b.amount; }, 0);
    var mk = monthKey(today);
    var y = +today.substr(0, 4), m = +today.substr(5, 2), d = +today.substr(8, 2);
    var daysLeft = daysInMonth(y, m) - d + 1;
    var cats = {};
    variable.forEach(function (b) { cats[b.category] = 1; });
    var before = 0, todaySpent = 0;
    opts.txns.forEach(function (t) {
      if (t.group !== groupName || !inMonth(t, mk) || t.type !== 'Chi' || !cats[t.cat]) return;
      var v = tIn(t, cur);
      if (t.date < today) before += v; else if (t.date === today) todaySpent += v;
    });
    var allowance = (total - before) / daysLeft;
    return { cur: cur, total: total, spentBefore: before, spentToday: todaySpent, daysLeft: daysLeft,
      allowance: allowance, left: allowance - todaySpent, monthLeft: total - before - todaySpent };
  }

  /* ---------------- Báo cáo ---------------- */

  function monthReport(txns, monthK, cur, categories) {
    var gm = categoryGroupMap(categories);
    var r = { income: 0, expense: 0, saving: 0, byCat: {}, byCard: {}, byMerchant: {} };
    txns.forEach(function (t) {
      if (!inMonth(t, monthK)) return;
      var k = kindOf(t, gm), v = tIn(t, cur);
      if (k === 'in') r.income += v;
      else if (k === 'saving') r.saving += v;
      else if (k === 'out') {
        r.expense += v;
        var c = t.cat || 'Chưa phân loại';
        r.byCat[c] = (r.byCat[c] || 0) + v;
        var card = t.card || 'Khác / chưa rõ thẻ';
        var o = r.byCard[card] || (r.byCard[card] = { amount: 0, count: 0 });
        o.amount += v; o.count++;
        var key = stripAccents(t.desc).replace(/[^a-z0-9 ]/g, '').trim() || '(không tên)';
        var mm = r.byMerchant[key] || (r.byMerchant[key] = { name: t.desc || '(không tên)', amount: 0, count: 0 });
        mm.amount += v; mm.count++;
      }
    });
    r.left = r.income - r.expense - r.saving;
    return r;
  }

  function sortedEntries(obj) {
    return Object.keys(obj).map(function (k) { return { name: k, amount: typeof obj[k] === 'number' ? obj[k] : obj[k].amount, raw: obj[k] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  function trend(txns, endMonthKey, nMonths, cur, categories) {
    var out = [];
    for (var i = nMonths - 1; i >= 0; i--) {
      var k = shiftMonth(endMonthKey, -i);
      var r = monthReport(txns, k, cur, categories);
      out.push({ month: k, expense: r.expense, income: r.income });
    }
    return out;
  }

  function weekSummary(txns, today, cur, categories) {
    var gm = categoryGroupMap(categories);
    var start = mondayOf(today), end = addDays(start, 6);
    var prevStart = addDays(start, -7), prevEnd = addDays(start, -1);
    function sum(a, b) {
      var s = 0, byCat = {};
      txns.forEach(function (t) {
        if (t.date < a || t.date > b || kindOf(t, gm) !== 'out') return;
        var v = tIn(t, cur); s += v; byCat[t.cat || 'Chưa phân loại'] = (byCat[t.cat || 'Chưa phân loại'] || 0) + v;
      });
      return { total: s, byCat: byCat };
    }
    var a = sum(start, end), b = sum(prevStart, prevEnd);
    var top = sortedEntries(a.byCat)[0] || null;
    return { start: start, end: end, total: a.total, prev: b.total, top: top };
  }

  function tripReport(txns, tripName, cur, categories) {
    var gm = categoryGroupMap(categories), total = 0, byCat = {};
    txns.forEach(function (t) {
      if (t.trip !== tripName || kindOf(t, gm) !== 'out') return;
      var v = tIn(t, cur); total += v; byCat[t.cat || 'Chưa phân loại'] = (byCat[t.cat || 'Chưa phân loại'] || 0) + v;
    });
    return { total: total, byCat: byCat };
  }

  /* ---------------- Chuyển tiền ---------------- */

  function transferCalc(aud, fee, vnd, market) {
    var cost = (aud || 0) + (fee || 0);
    if (!(cost > 0) || !(vnd > 0)) return null;
    var effective = vnd / cost, marketVnd = cost * market, lossVnd = marketVnd - vnd;
    return { effective: effective, marketVnd: marketVnd, lossVnd: lossVnd,
      lossAud: market > 0 ? lossVnd / market : 0, diffPct: market > 0 ? (effective - market) / market : 0 };
  }

  function providerStats(transfers) {
    var by = {};
    transfers.forEach(function (t) {
      var k = t.provider || '(không ghi)';
      var o = by[k] || (by[k] = { provider: k, n: 0, aud: 0, vnd: 0, diff: 0 });
      o.n++; o.aud += t.aud + t.fee; o.vnd += t.vnd; o.diff += t.diff;
    });
    return Object.keys(by).map(function (k) {
      var o = by[k]; return { provider: k, n: o.n, avgRate: o.vnd / o.aud, avgDiff: o.diff / o.n };
    }).sort(function (a, b) { return b.avgRate - a.avgRate; });
  }

  /* ---------------- Cảnh báo ---------------- */

  function isUnusual(amount, cur, rate, category, stats) {
    var s = stats && stats[category];
    if (!s || s.n < 5) return false;
    var vnd = cur === 'VND' ? amount : amount * rate;
    return vnd > s.median * 3 && vnd > 200000;
  }

  /** Chi trên thẻ từ sau ngày sao kê gần nhất. */
  function cycleSpend(txns, cardName, statementDay, today) {
    if (!statementDay) return null;
    var y = +today.substr(0, 4), m = +today.substr(5, 2), d = +today.substr(8, 2);
    var sm = d > statementDay ? m : m - 1, sy = y;
    if (sm < 1) { sm = 12; sy--; }
    var sd = Math.min(statementDay, daysInMonth(sy, sm));
    var last = sy + '-' + pad(sm) + '-' + pad(sd);
    var total = 0;
    txns.forEach(function (t) {
      if (t.card === cardName && t.date > last && t.type === 'Chi') total += t.amount;
    });
    return { since: last, total: total };
  }

  function nextDayOfMonth(today, day) {
    if (!day) return null;
    var y = +today.substr(0, 4), m = +today.substr(5, 2), d = +today.substr(8, 2);
    if (day < d) { m++; if (m > 12) { m = 1; y++; } }
    return y + '-' + pad(m) + '-' + pad(Math.min(day, daysInMonth(y, m)));
  }

  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }

  return {
    stripAccents: stripAccents, parseNumber: parseNumber, parseAmountToken: parseAmountToken,
    parseQuick: parseQuick, matchCategory: matchCategory, convert: convert,
    fmtMoney: fmtMoney, fmtCompact: fmtCompact, ymd: ymd, parseYmd: parseYmd, addDays: addDays,
    daysInMonth: daysInMonth, monthKey: monthKey, shiftMonth: shiftMonth, mondayOf: mondayOf,
    categoryGroupMap: categoryGroupMap, kindOf: kindOf, groupCur: groupCur, tIn: tIn,
    spentByCategory: spentByCategory, dailyAllowance: dailyAllowance, monthReport: monthReport,
    sortedEntries: sortedEntries, trend: trend, weekSummary: weekSummary, tripReport: tripReport,
    transferCalc: transferCalc, providerStats: providerStats, isUnusual: isUnusual,
    cycleSpend: cycleSpend, nextDayOfMonth: nextDayOfMonth, daysBetween: daysBetween,
    VARIABLE_GROUP: VARIABLE_GROUP, SAVING_GROUP: SAVING_GROUP, NO_COUNT_GROUP: NO_COUNT_GROUP
  };
});
