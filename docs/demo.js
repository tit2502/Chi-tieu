/* Chế độ demo: dữ liệu mẫu trong bộ nhớ, mô phỏng API của Apps Script để thử giao diện. */
(function () {
  'use strict';
  var L = window.Lib;

  var CATS = [
    ['THU NHẬP', 'Lương', 'Thu'], ['THU NHẬP', 'Kinh doanh', 'Thu'], ['THU NHẬP', 'Thời vụ', 'Thu'],
    ['THU NHẬP', 'Freelance', 'Thu'], ['THU NHẬP', 'Thu nhập đầu tư', 'Thu'], ['THU NHẬP', 'Thu nhập khác', 'Thu'],
    ['CHI PHÍ CỐ ĐỊNH', 'Thuê nhà', 'Chi'], ['CHI PHÍ CỐ ĐỊNH', 'Điện', 'Chi'], ['CHI PHÍ CỐ ĐỊNH', 'Nước', 'Chi'],
    ['CHI PHÍ CỐ ĐỊNH', 'Internet', 'Chi'], ['CHI PHÍ CỐ ĐỊNH', 'Giải trí', 'Chi'], ['CHI PHÍ CỐ ĐỊNH', 'Đăng ký', 'Chi'],
    ['CHI PHÍ CỐ ĐỊNH', 'Gửi xe', 'Chi'], ['CHI PHÍ CỐ ĐỊNH', 'Bảo hiểm', 'Chi'], ['CHI PHÍ CỐ ĐỊNH', 'Trả nợ', 'Chi'],
    ['CHI PHÍ CỐ ĐỊNH', 'Học phí', 'Chi'],
    ['CHI PHÍ BIẾN ĐỔI', 'Ăn tại nhà', 'Chi'], ['CHI PHÍ BIẾN ĐỔI', 'Ăn ngoài', 'Chi'], ['CHI PHÍ BIẾN ĐỔI', 'Đi lại', 'Chi'],
    ['CHI PHÍ BIẾN ĐỔI', 'Sức khỏe', 'Chi'], ['CHI PHÍ BIẾN ĐỔI', 'Chăm sóc cá nhân', 'Chi'], ['CHI PHÍ BIẾN ĐỔI', 'Sở thích', 'Chi'],
    ['CHI PHÍ BIẾN ĐỔI', 'Mua sắm', 'Chi'], ['CHI PHÍ BIẾN ĐỔI', 'Quà tặng', 'Chi'], ['CHI PHÍ BIẾN ĐỔI', 'Gia đình', 'Chi'],
    ['CHI PHÍ BIẾN ĐỔI', 'Phát sinh', 'Chi'],
    ['TIẾT KIỆM & ĐẦU TƯ', 'Quỹ khẩn cấp', 'Chi'], ['TIẾT KIỆM & ĐẦU TƯ', 'Tiết kiệm ngắn hạn', 'Chi'],
    ['TIẾT KIỆM & ĐẦU TƯ', 'Tiết kiệm dài hạn', 'Chi'], ['TIẾT KIỆM & ĐẦU TƯ', 'Đầu tư', 'Chi'],
    ['TIẾT KIỆM & ĐẦU TƯ', 'Mục tiêu khác', 'Chi'],
    ['KHÔNG TÍNH VÀO THU/CHI', 'Chuyển ví', 'Cả hai'], ['KHÔNG TÍNH VÀO THU/CHI', 'Chuyển tiền', 'Cả hai']
  ].map(function (r) { return { group: r[0], name: r[1], type: r[2] }; });

  var RULES = [
    ['woolworths', 'Ăn tại nhà'], ['coles', 'Ăn tại nhà'], ['coffee', 'Ăn ngoài'], ['cà phê', 'Ăn ngoài'],
    ['phở', 'Ăn ngoài'], ['uber', 'Đi lại'], ['grab', 'Đi lại'], ['myki', 'Đi lại'], ['netflix', 'Giải trí'],
    ['spotify', 'Giải trí'], ['chatgpt', 'Đăng ký'], ['shopee', 'Mua sắm'], ['lương', 'Lương']
  ].map(function (r) { return { keyword: r[0], category: r[1] }; });

  var db = null;
  var RATE = 16900;

  function build() {
    var today = L.ymd(new Date());
    var cards = [
      { name: 'CommBank', bank: 'CommBank', kind: 'Thẻ / tài khoản', currency: 'AUD', group: 'Úc' },
      { name: 'ACB Credit', bank: 'ACB', kind: 'Thẻ tín dụng', currency: 'VND', group: 'Việt Nam' },
      { name: 'Thẻ VN 1', bank: 'Ngân hàng Việt Nam', kind: 'Thẻ / tài khoản', currency: 'VND', group: 'Việt Nam' }
    ];
    var txns = [], row = 3, seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    function add(date, card, desc, cat, type, amount, cur, trip) {
      var c = cards.filter(function (x) { return x.name === card; })[0];
      txns.push({ row: row++, date: date, time: '12:00', card: card, desc: desc, cat: cat, type: type, amount: amount,
        cur: cur, note: '', group: c.group, rate: RATE + Math.round((rnd() - 0.5) * 200), trip: trip || '', src: 'app' });
    }
    var months = 6;
    for (var m = months; m >= 0; m--) {
      var key = L.shiftMonth(today.substr(0, 7), -m);
      var last = m === 0 ? +today.substr(8, 2) : L.daysInMonth(+key.substr(0, 4), +key.substr(5, 2));
      function d(day) { return key + '-' + (day < 10 ? '0' : '') + Math.min(day, last); }
      if (last >= 1) add(d(1), 'CommBank', 'Lương', 'Lương', 'Thu', 6200, 'AUD');
      if (last >= 2) add(d(2), 'CommBank', 'Tiền thuê nhà', 'Thuê nhà', 'Chi', 1850, 'AUD');
      if (last >= 5) add(d(5), 'CommBank', 'Netflix', 'Giải trí', 'Chi', 18.99, 'AUD');
      if (last >= 6) add(d(6), 'CommBank', 'ChatGPT', 'Đăng ký', 'Chi', 30, 'AUD');
      if (last >= 8) add(d(8), 'CommBank', 'Chuyển tiền về Việt Nam', 'Chuyển tiền', 'Chi', 1000, 'AUD');
      if (last >= 8) add(d(8), 'Thẻ VN 1', 'Chuyển tiền về Việt Nam', 'Chuyển tiền', 'Thu', 16300000, 'VND');
      for (var day = 1; day <= last; day++) {
        if (rnd() < 0.55) add(d(day), 'CommBank', 'Woolworths', 'Ăn tại nhà', 'Chi', Math.round((25 + rnd() * 70) * 100) / 100, 'AUD');
        if (rnd() < 0.5) add(d(day), 'CommBank', 'Coffee', 'Ăn ngoài', 'Chi', Math.round((4.5 + rnd() * 20) * 100) / 100, 'AUD');
        if (rnd() < 0.18) add(d(day), 'CommBank', 'Uber', 'Đi lại', 'Chi', Math.round((12 + rnd() * 25) * 100) / 100, 'AUD');
        if (rnd() < 0.25) add(d(day), 'ACB Credit', 'Phở', 'Ăn ngoài', 'Chi', 45000 + Math.round(rnd() * 8) * 5000, 'VND');
        if (rnd() < 0.1) add(d(day), 'ACB Credit', 'Shopee', 'Mua sắm', 'Chi', 120000 + Math.round(rnd() * 20) * 10000, 'VND');
      }
    }
    return {
      cards: cards, categories: CATS, rules: RULES, txns: txns, nextRow: row,
      budgets: [
        { group: 'Úc', category: 'Ăn tại nhà', amount: 950 }, { group: 'Úc', category: 'Ăn ngoài', amount: 450 },
        { group: 'Úc', category: 'Đi lại', amount: 260 }, { group: 'Úc', category: 'Thuê nhà', amount: 1850 },
        { group: 'Việt Nam', category: 'Ăn ngoài', amount: 1500000 }, { group: 'Việt Nam', category: 'Mua sắm', amount: 1000000 }
      ],
      trips: [{ name: 'Về Việt Nam (đám cưới anh trai)', from: '2027-02-07', to: '2027-02-21' }],
      goals: [{ row: 2, name: 'Quỹ chuyến về Việt Nam', target: 4000, currency: 'AUD', due: '2027-02-01', saved: 1650 }],
      transfers: [
        { date: L.addDays(today, -40), provider: 'Wise', fromCard: 'CommBank', toCard: 'Thẻ VN 1', aud: 1000, fee: 6.4, vnd: 16420000, effective: 16313, market: 16800, diff: -0.029, note: '' },
        { date: L.addDays(today, -12), provider: 'Remitly', fromCard: 'CommBank', toCard: 'Thẻ VN 1', aud: 1000, fee: 0, vnd: 16300000, effective: 16300, market: 16900, diff: -0.0355, note: '' }
      ],
      config: { acbStatementDay: 25, acbDueDay: 12 },
      goalRow: 3
    };
  }

  function rateFor(dateStr) { return RATE; }

  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }

  function bootstrap() {
    var today = L.ymd(new Date());
    var stats = {};
    var by = {};
    db.txns.forEach(function (t) {
      if (t.type !== 'Chi' || !t.cat) return;
      (by[t.cat] = by[t.cat] || []).push(t.cur === 'VND' ? t.amount : t.amount * t.rate);
    });
    Object.keys(by).forEach(function (c) { stats[c] = { n: by[c].length, median: median(by[c]) }; });
    var freq = {};
    db.txns.forEach(function (t) {
      if (t.type !== 'Chi') return;
      var k = t.desc + '|' + t.card;
      var o = freq[k] || (freq[k] = { desc: t.desc, card: t.card, cat: t.cat, cur: t.cur, n: 0, a: [] });
      o.n++; o.a.push(t.amount);
    });
    var frequent = Object.keys(freq).map(function (k) { return freq[k]; }).filter(function (o) { return o.n >= 2; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 8).map(function (o) {
        return { desc: o.desc, card: o.card, cat: o.cat, cur: o.cur, amount: median(o.a), n: o.n };
      });
    var nextNf = L.addDays(today, 3);
    return {
      today: today, cards: db.cards, categories: db.categories, rules: db.rules,
      rates: { current: RATE, monthly: [], year: 0 }, budgets: db.budgets, trips: db.trips, goals: db.goals,
      config: db.config, txns: JSON.parse(JSON.stringify(db.txns)), frequent: frequent, stats: stats,
      recurring: [{ desc: 'Netflix', amount: 18.99, cur: 'AUD', card: 'CommBank', nextDate: nextNf }]
    };
  }

  function handle(action, req) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(run(action, req)); } catch (e) { reject(e); }
      }, 120);
    });
  }

  function run(action, req) {
    if (!db) db = build();
    var today = L.ymd(new Date());
    switch (action) {
      case 'bootstrap': return bootstrap();
      case 'ping': return { time: new Date().toISOString() };
      case 'addTxn': {
        var card = db.cards.filter(function (c) { return c.name === req.card; })[0];
        var cat = req.category || L.matchCategory(req.desc, db.rules);
        db.txns.push({ row: db.nextRow++, date: req.date || today, time: '12:00', card: req.card, desc: req.desc, cat: cat,
          type: req.type, amount: req.amount, cur: req.currency, note: '', group: card ? card.group : 'Úc',
          rate: RATE, trip: '', src: 'app' });
        return { row: db.nextRow - 1, category: cat };
      }
      case 'txns': return { txns: JSON.parse(JSON.stringify(db.txns)) };
      case 'updateTxn': {
        var cd = db.cards.filter(function (c) { return c.name === req.card; })[0];
        db.txns.forEach(function (t) {
          if (t.row === req.row) {
            t.card = req.card; t.desc = req.desc; t.cat = req.category; t.type = req.type; t.amount = Number(req.amount);
            t.cur = req.currency; t.date = req.date || t.date; t.note = req.note || ''; t.group = cd ? cd.group : t.group;
          }
        });
        return { row: req.row };
      }
      case 'deleteTxn':
        db.txns = db.txns.filter(function (t) { return t.row !== req.row; });
        return { deleted: req.row };
      case 'setRule':
        db.rules = db.rules.filter(function (r) { return r.keyword.toLowerCase() !== String(req.keyword).toLowerCase(); });
        db.rules.push({ keyword: req.keyword, category: req.category });
        return {};
      case 'setBudget':
        db.budgets = db.budgets.filter(function (b) { return !(b.group === req.group && b.category === req.category); });
        if (req.amount > 0) db.budgets.push({ group: req.group, category: req.category, amount: Number(req.amount) });
        return {};
      case 'addTrip': db.trips.push({ name: req.name, from: req.from, to: req.to }); return {};
      case 'addGoal':
        db.goals.push({ row: db.goalRow++, name: req.name, target: Number(req.target), currency: req.currency, due: req.due || '', saved: Number(req.saved) || 0 });
        return {};
      case 'updateGoal':
        db.goals.forEach(function (g) { if (g.row === req.row) g.saved = Number(req.saved); });
        return {};
      case 'deleteGoal': db.goals = db.goals.filter(function (g) { return g.row !== req.row; }); return {};
      case 'setConfig':
        if (req.key === 'ACB_NGAY_SAO_KE') db.config.acbStatementDay = Number(req.value) || 0;
        if (req.key === 'ACB_NGAY_DEN_HAN') db.config.acbDueDay = Number(req.value) || 0;
        return {};
      case 'transfers': return { transfers: db.transfers.slice().reverse() };
      case 'addTransfer': {
        var c = L.transferCalc(req.aud, req.fee, req.vnd, req.market || RATE);
        db.transfers.push({ date: req.date || today, provider: req.provider || '', fromCard: req.fromCard, toCard: req.toCard,
          aud: Number(req.aud), fee: Number(req.fee) || 0, vnd: Number(req.vnd), effective: c.effective, market: req.market || RATE, diff: c.diffPct, note: req.note || '' });
        return { effective: c.effective, market: req.market || RATE, lossVnd: c.lossVnd, lossAud: c.lossAud };
      }
      default: throw new Error('Demo chưa hỗ trợ: ' + action);
    }
  }

  window.Demo = { handle: handle, reset: function () { db = null; } };
})();
