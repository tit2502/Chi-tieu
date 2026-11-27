(function () {
  'use strict';
  var L = window.Lib;
  var $ = function (s) { return document.querySelector(s); };

  /* ------------------------------------------------------------------ */
  /* Trạng thái và lưu trữ cục bộ                                        */
  /* ------------------------------------------------------------------ */

  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('ct.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('ct.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('ct.' + k); } catch (e) {} }
  };

  var state = {
    cfg: LS.get('cfg', null),          // { url, token } hoặc { demo: true }
    data: null,
    tab: LS.get('tab', 'today'),
    disp: LS.get('disp', 'AUD'),
    month: null,
    today: L.ymd(new Date()),
    q: { card: LS.get('lastCard', ''), type: 'Chi', text: '', cat: '', date: '', note: '' },
    transfers: null,
    all: null,
    f: { q: '', month: '', card: '', type: '', cat: '', limit: 50 },
    tripSel: ''
  };
  state.month = L.monthKey(state.today);

  var D = function () { return state.data; };
  var $view = $('#view');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rateFor(dateStr) {
    var r = D().rates;
    if (r.year && r.monthly && r.monthly.length === 12 && +dateStr.substr(0, 4) === r.year) return r.monthly[+dateStr.substr(5, 2) - 1] || r.current;
    return r.current;
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */

  function setSync(s) { var e = $('#sync'); e.className = 'sync' + (s ? ' ' + s : ''); }

  function api(action, payload) {
    if (state.cfg && state.cfg.demo) return window.Demo.handle(action, payload || {});
    var body = Object.assign({ app: 'chitieu', token: state.cfg.token, action: action }, payload || {});
    return fetch(state.cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (!j.ok) { var e = new Error(j.error || 'Lỗi không rõ'); e.code = j.code; e.server = true; throw e; }
        return j.data;
      });
  }

  function refresh(quiet) {
    setSync('busy');
    return api('bootstrap').then(function (data) {
      state.data = data;
      state.all = null;
      state.today = L.ymd(new Date());
      if (!(state.cfg && state.cfg.demo)) LS.set('cache', data);
      setSync('');
      render();
      return data;
    }).catch(function (e) {
      setSync('err');
      if (!quiet) toast(e.code === 'AUTH' ? 'Sai mã app. Vào Thêm > Kết nối để nhập lại.' : 'Không tải được: ' + e.message);
      throw e;
    });
  }

  /* Hàng đợi khi mất mạng */
  function queue() { return LS.get('pending', []); }
  function flushQueue() {
    var q = queue();
    if (!q.length || (state.cfg && state.cfg.demo)) return Promise.resolve();
    var item = q[0];
    return api(item.action, item.payload).then(function () {
      var rest = queue(); rest.shift(); LS.set('pending', rest);
      return flushQueue();
    }).catch(function (e) {
      if (e.server) { var rest = queue(); rest.shift(); LS.set('pending', rest); toast('Một giao dịch chờ bị từ chối: ' + e.message); return flushQueue(); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tiện ích giao diện                                                  */
  /* ------------------------------------------------------------------ */

  var toastTimer = null;
  function toast(msg, actionLabel, actionFn) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button id="toast-act">' + esc(actionLabel) + '</button>' : '');
    t.className = 'show';
    if (actionLabel) $('#toast-act').onclick = function () { t.className = ''; actionFn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, actionLabel ? 9000 : 3500);
  }

  function closeModal() { $('#modal-root').innerHTML = ''; }
  function openModal(html) {
    $('#modal-root').innerHTML = '<div class="back" data-act="modal-back"><div class="sheet">' + html + '</div></div>';
  }

  function money(amount, cur) { return L.fmtMoney(amount, cur); }
  function shortDate(s) { return s.substr(8, 2) + '/' + s.substr(5, 2); }

  function otherCur(c) { return c === 'AUD' ? 'VND' : 'AUD'; }

  function cardByName(n) { return (D().cards || []).filter(function (c) { return c.name === n; })[0]; }

  /* ------------------------------------------------------------------ */
  /* Màn hình chào / kết nối                                             */
  /* ------------------------------------------------------------------ */

  function viewWelcome() {
    return '<div class="welcome"><h1>Chi tiêu AUD / VND</h1>' +
      '<p class="muted">Nhập địa chỉ Web App của Apps Script và mã app (có được sau khi chạy <b>caiDatApp</b>). Chỉ cần làm một lần trên mỗi điện thoại.</p>' +
      '<div class="card"><label>Địa chỉ Web App (kết thúc bằng /exec)</label><input id="w-url" placeholder="https://script.google.com/macros/s/.../exec" autocapitalize="off" autocorrect="off">' +
      '<label>Mã app</label><input id="w-token" placeholder="32 ký tự" autocapitalize="off" autocorrect="off">' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="connect">Kết nối</button>' +
      '<button class="btn" data-act="demo">Dùng thử bản demo</button></div></div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình HÔM NAY                                                    */
  /* ------------------------------------------------------------------ */

  function allowanceCards() {
    var d = D(), html = '', any = false;
    ['Úc', 'Việt Nam'].forEach(function (g) {
      var a = L.dailyAllowance({ group: g, today: state.today, txns: d.txns, categories: d.categories, budgets: d.budgets });
      if (!a) return;
      any = true;
      var neg = a.left < 0;
      html += '<div class="card hero"><div class="label">Còn được tiêu hôm nay · ' + esc(g) + '</div>' +
        '<div class="big' + (neg ? ' neg' : '') + '">' + money(a.left, a.cur) + '</div>' +
        '<div class="sub">Hôm nay được ' + money(Math.max(a.allowance, 0), a.cur) + ' · đã tiêu ' + money(a.spentToday, a.cur) +
        '<br>Tháng này còn ' + money(a.monthLeft, a.cur) + ' / ' + money(a.total, a.cur) + ' (' + a.daysLeft + ' ngày, tính từ cả hôm nay)</div></div>';
    });
    if (!any) {
      html = '<div class="card hero"><div class="label">Còn được tiêu hôm nay</div><div class="sub">Đặt ngân sách cho các danh mục <b>Chi phí biến đổi</b> (ăn uống, đi lại...) ở tab Ngân sách là app sẽ tính số này.</div></div>';
    }
    return html;
  }

  function alertsHtml() {
    var d = D(), out = '';
    (d.recurring || []).forEach(function (r) {
      var days = L.daysBetween(state.today, r.nextDate);
      if (days >= 0 && days <= 7) {
        out += '<div class="alert info">Sắp tới: <b>' + esc(r.desc) + '</b> khoảng ' + money(r.amount, r.cur) + ' vào ' + shortDate(r.nextDate) +
          (days === 0 ? ' (hôm nay)' : ' (còn ' + days + ' ngày)') + '</div>';
      }
    });
    var acb = (d.cards || []).filter(function (c) { return /acb/i.test(c.bank + ' ' + c.name) && /tín dụng|credit/i.test(c.kind + ' ' + c.name); })[0];
    if (acb && d.config) {
      var due = L.nextDayOfMonth(state.today, d.config.acbDueDay), st = L.nextDayOfMonth(state.today, d.config.acbStatementDay);
      var cyc = L.cycleSpend(d.txns, acb.name, d.config.acbStatementDay, state.today);
      var parts = [];
      if (st && L.daysBetween(state.today, st) <= 5) parts.push('sao kê ' + shortDate(st));
      if (due && L.daysBetween(state.today, due) <= 5) parts.push('đến hạn thanh toán ' + shortDate(due));
      if (parts.length) out += '<div class="alert">Thẻ ' + esc(acb.name) + ': ' + parts.join(', ') +
        (cyc ? '. Chi từ kỳ sao kê trước: <b>' + money(cyc.total, 'VND') + '</b>' : '') + '</div>';
    }
    return out;
  }

  function categoryOptions(type, selected) {
    var d = D(), groups = {}, order = [];
    d.categories.forEach(function (c) {
      var isIncome = c.group === 'THU NHẬP';
      if (type === 'Thu' ? !(isIncome || c.group === L.NO_COUNT_GROUP) : isIncome) return;
      if (!groups[c.group]) { groups[c.group] = []; order.push(c.group); }
      groups[c.group].push(c.name);
    });
    var h = '<option value="">(tự động)</option>';
    order.forEach(function (g) {
      h += '<optgroup label="' + esc(g) + '">' + groups[g].map(function (n) {
        return '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>';
      }).join('') + '</optgroup>';
    });
    return h;
  }

  function txnItem(t) {
    var cls = t.type === 'Thu' ? 'in' : 'out';
    var sign = t.type === 'Thu' ? '+' : '-';
    var alt = otherCur(t.cur);
    return '<div class="item" data-act="txn" data-row="' + t.row + '"><div class="main"><div class="t">' + esc(t.desc || t.cat || '(không tên)') + '</div>' +
      '<div class="s">' + esc(t.cat || 'Chưa phân loại') + ' · ' + esc(t.card || '?') + ' · ' + shortDate(t.date) + (t.time ? ' ' + esc(t.time) : '') + '</div></div>' +
      '<div class="amt ' + cls + '">' + sign + money(t.amount, t.cur) + '<small>≈ ' + money(L.convert(t.amount, t.cur, alt, t.rate), alt) + '</small></div></div>';
  }

  function entryCard() {
    var d = D(), q = state.q;
    if (!q.card || !cardByName(q.card)) q.card = d.cards[0] ? d.cards[0].name : '';
    return '<div class="card"><h3>Ghi giao dịch</h3>' +
      '<input id="q-text" placeholder="phở 65k · coffee 5.5 · grab 1tr2" autocomplete="off" enterkeyhint="done" value="' + esc(q.text) + '">' +
      '<div class="chips" id="q-cards">' + d.cards.map(function (c) {
        return '<button class="chip' + (c.name === q.card ? ' on' : '') + '" data-act="pick-card" data-v="' + esc(c.name) + '">' + esc(c.name) + ' <small>' + c.currency + '</small></button>';
      }).join('') + '</div>' +
      '<div class="row"><div class="seg" id="q-type"><button class="' + (q.type === 'Chi' ? 'on' : '') + '" data-act="pick-type" data-v="Chi">Chi</button>' +
      '<button class="' + (q.type === 'Thu' ? 'on' : '') + '" data-act="pick-type" data-v="Thu">Thu</button></div>' +
      '<select id="q-cat">' + categoryOptions(q.type, q.cat) + '</select></div>' +
      '<input id="q-note" placeholder="Ghi chú (tùy chọn)" style="margin-top:8px" value="' + esc(q.note) + '">' +
      '<div class="preview" id="q-preview"></div>' +
      '<div class="row"><input type="date" id="q-date" value="' + esc(q.date || state.today) + '"><button class="btn primary fixed" id="q-save" data-act="save-txn">Lưu</button></div></div>';
  }

  function viewToday() {
    var d = D();
    var h = allowanceCards() + alertsHtml() + entryCard();

    var fr = (d.frequent || []);
    if (fr.length) {
      h += '<div class="card"><h3>Hay dùng</h3><div class="chips">' + fr.map(function (f, i) {
        return '<button class="chip" data-act="freq" data-i="' + i + '">' + esc(f.desc) + ' · ' + L.fmtCompact(f.amount, f.cur) + '</button>';
      }).join('') + '</div></div>';
    }

    var todays = d.txns.filter(function (t) { return t.date === state.today; }).reverse();
    h += '<div class="card"><h3>Hôm nay</h3>' + (todays.length ? '<div class="list">' + todays.map(txnItem).join('') + '</div>' : '<div class="empty">Chưa có giao dịch nào hôm nay.</div>') + '</div>';

    var recent = d.txns.filter(function (t) { return t.date < state.today; }).slice(-8).reverse();
    if (recent.length) h += '<div class="card"><h3>Gần đây</h3><div class="list">' + recent.map(txnItem).join('') + '</div></div>';
    return h;
  }

  function updatePreview() {
    var el = $('#q-preview'); if (!el) return;
    var q = state.q, card = cardByName(q.card);
    if (!card) { el.textContent = ''; return; }
    var p = L.parseQuick(q.text, card.currency);
    if (!q.text.trim()) { el.innerHTML = 'Gõ nội dung và số tiền, ví dụ <b>phở 65k</b> hoặc <b>coffee 5.5</b>.'; return; }
    if (p.amount == null) { el.innerHTML = 'Chưa thấy số tiền.'; return; }
    var cat = q.cat || L.matchCategory(p.desc, D().rules);
    el.innerHTML = '<b>' + money(p.amount, p.currency) + '</b> · ' + esc(p.desc || '(không nội dung)') + ' · ' +
      (cat ? esc(cat) + (q.cat ? '' : ' (tự động)') : '<span style="color:var(--warn)">chưa có danh mục</span>') + ' · ' + esc(card.name) +
      (p.currency !== card.currency ? ' <span style="color:var(--warn)">(khác tiền của thẻ)</span>' : '');
  }

  function saveTxn() {
    var q = state.q, card = cardByName(q.card);
    if (!card) return toast('Chưa chọn thẻ');
    var p = L.parseQuick(q.text, card.currency);
    if (!(p.amount > 0)) return toast('Chưa thấy số tiền hợp lệ');
    var cat = q.cat || L.matchCategory(p.desc, D().rules);
    var date = ($('#q-date') && $('#q-date').value) || state.today;
    var payload = { card: card.name, desc: p.desc || cat || (q.type === 'Thu' ? 'Thu nhập' : 'Chi tiêu'), category: cat, type: q.type, amount: p.amount, currency: p.currency, date: date, note: state.q.note };
    var manualCat = q.cat && L.matchCategory(p.desc, D().rules) !== q.cat && p.desc;

    var unusual = q.type === 'Chi' && L.isUnusual(p.amount, p.currency, rateFor(date), cat, D().stats);

    var local = { row: null, date: date, time: '', card: card.name, desc: payload.desc, cat: cat, type: q.type, amount: p.amount,
      cur: p.currency, note: state.q.note, group: card.group, rate: rateFor(date), trip: '', src: 'app' };
    D().txns.push(local);
    LS.set('lastCard', card.name);
    state.q.text = ''; state.q.cat = ''; state.q.date = ''; state.q.note = '';
    render();
    setSync('busy');

    api('addTxn', payload).then(function () {
      toast('Đã lưu ' + money(p.amount, p.currency) + (unusual ? ' · cao hơn thường lệ cho danh mục ' + cat : ''),
        manualCat ? 'Nhớ "' + p.desc + '"' : null,
        function () { api('setRule', { keyword: p.desc, category: cat }).then(function () { toast('Đã nhớ quy tắc'); return refresh(true); }); });
      return refresh(true);
    }).catch(function (e) {
      if (e.server) { setSync('err'); toast('Lỗi: ' + e.message); refresh(true).catch(function () {}); return; }
      var qd = queue(); qd.push({ action: 'addTxn', payload: payload }); LS.set('pending', qd);
      setSync('err'); toast('Chưa có mạng: đã lưu tạm trên điện thoại, sẽ gửi sau');
    });
  }

  function openTxn(row) {
    var t = allTxns().filter(function (x) { return String(x.row) === String(row); })[0];
    if (!t) return;
    var alt = otherCur(t.cur);
    openModal('<h2>' + esc(t.desc || t.cat) + '</h2>' +
      '<div class="muted small">' + esc(t.date) + (t.time ? ' ' + esc(t.time) : '') + ' · ' + esc(t.card) + ' · ' + esc(t.cat || 'Chưa phân loại') + '</div>' +
      '<p style="font-size:24px;font-weight:800;margin:10px 0 2px">' + (t.type === 'Thu' ? '+' : '-') + money(t.amount, t.cur) + '</p>' +
      '<div class="muted small">≈ ' + money(L.convert(t.amount, t.cur, alt, t.rate), alt) + ' theo tỷ giá lúc ghi 1 AUD = ' + Math.round(t.rate).toLocaleString('vi-VN') + '₫' +
      (t.trip ? '<br>Chuyến đi: ' + esc(t.trip) : '') + (t.note ? '<br>Ghi chú: ' + esc(t.note) : '') + '</div>' +
      '<div class="row" style="margin-top:14px"><button class="btn" data-act="edit-txn" data-row="' + t.row + '">Sửa</button><button class="btn danger" data-act="del-txn" data-row="' + t.row + '">Xóa</button><button class="btn" data-act="close">Đóng</button></div>');
  }

  function deleteTxn(row) {
    var t = allTxns().filter(function (x) { return String(x.row) === String(row); })[0];
    if (!t || !t.row) return;
    closeModal(); setSync('busy');
    api('deleteTxn', { row: t.row, desc: t.desc, amount: t.amount }).then(function () { toast('Đã xóa'); return refresh(true); })
      .catch(function (e) { setSync('err'); toast('Không xóa được: ' + e.message); });
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình GIAO DỊCH (toàn bộ, cũ và mới)                             */
  /* ------------------------------------------------------------------ */

  function allTxns() { return state.all || D().txns; }

  function loadAll() {
    if (state.loadingAll) return;
    state.loadingAll = true;
    api('txns', {}).then(function (r) {
      state.all = r.txns; state.loadingAll = false;
      if (state.tab === 'txns') render();
    }).catch(function () { state.loadingAll = false; });
  }

  function viewTxns() {
    if (state.all === null) loadAll();
    var d = D(), f = state.f, months = {};
    allTxns().forEach(function (t) { months[t.date.substr(0, 7)] = 1; });
    var mk = Object.keys(months).sort().reverse();
    function opts(list, sel, all) {
      return '<option value="">' + all + '</option>' + list.map(function (x) {
        return '<option value="' + esc(x[0]) + '"' + (x[0] === sel ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
      }).join('');
    }
    var h = entryCard();
    h += '<div class="card"><h3>Tất cả giao dịch' + (state.all === null ? ' · đang tải…' : '') + '</h3>' +
      '<input id="f-q" placeholder="Tìm theo nội dung, ghi chú, thẻ, danh mục…" value="' + esc(f.q) + '">' +
      '<div class="row" style="margin-top:8px"><select data-change="f-month">' + opts(mk.map(function (m) { return [m, m.substr(5, 2) + '/' + m.substr(0, 4)]; }), f.month, 'Mọi tháng') + '</select>' +
      '<select data-change="f-type">' + opts([['Chi', 'Chi'], ['Thu', 'Thu']], f.type, 'Thu và chi') + '</select></div>' +
      '<div class="row" style="margin-top:8px"><select data-change="f-card">' + opts(d.cards.map(function (c) { return [c.name, c.name]; }), f.card, 'Mọi thẻ') + '</select>' +
      '<select data-change="f-cat">' + opts(d.categories.map(function (c) { return [c.name, c.name]; }), f.cat, 'Mọi danh mục') + '</select></div>' +
      '<div class="row" style="margin-top:8px;align-items:center"><div id="tx-sum" class="muted small"></div>' +
      '<div class="seg fixed" style="width:104px"><button class="' + (state.disp === 'AUD' ? 'on' : '') + '" data-act="disp-tx" data-v="AUD">AUD</button><button class="' + (state.disp === 'VND' ? 'on' : '') + '" data-act="disp-tx" data-v="VND">VND</button></div></div>' +
      '<div id="tx-list" class="list" style="margin-top:6px"></div></div>';
    return h;
  }

  function filteredTxns() {
    var f = state.f, qn = L.stripAccents(f.q).trim();
    return allTxns().filter(function (t) {
      return (!f.month || t.date.substr(0, 7) === f.month) && (!f.card || t.card === f.card) &&
        (!f.type || t.type === f.type) && (!f.cat || t.cat === f.cat) &&
        (!qn || L.stripAccents([t.desc, t.note, t.card, t.cat].join(' ')).indexOf(qn) >= 0);
    }).sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : ((b.row || 1e9) - (a.row || 1e9));
    });
  }

  var WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  function drawTxnList() {
    var el = $('#tx-list'); if (!el) return;
    var list = filteredTxns(), gm = L.categoryGroupMap(D().categories), cur = state.disp, inT = 0, outT = 0;
    list.forEach(function (t) {
      var k = L.kindOf(t, gm);
      if (k === 'in') inT += L.tIn(t, cur); else if (k === 'out') outT += L.tIn(t, cur);
    });
    $('#tx-sum').innerHTML = '<b>' + list.length + '</b> giao dịch<br>Thu ' + money(inT, cur) + ' · Chi ' + money(outT, cur);
    if (!list.length) { el.innerHTML = '<div class="empty">Không có giao dịch phù hợp.</div>'; return; }
    var visible = list.slice(0, state.f.limit), html = '', day = '', dayOut = {};
    visible.forEach(function (t) { if (L.kindOf(t, gm) === 'out') dayOut[t.date] = (dayOut[t.date] || 0) + L.tIn(t, cur); });
    visible.forEach(function (t) {
      if (t.date !== day) {
        day = t.date;
        html += '<div class="item" style="background:var(--bg);margin:10px -14px 0;padding:6px 14px"><div class="main"><b>' + WD[L.parseYmd(day).getDay()] + ' ' + shortDate(day) + '/' + day.substr(0, 4) + '</b></div>' +
          '<div class="muted small">' + (dayOut[day] ? 'Chi ' + money(dayOut[day], cur) : '') + '</div></div>';
      }
      html += txnItem(t);
    });
    if (list.length > visible.length) html += '<button class="btn" style="width:100%;margin-top:10px" data-act="more-tx">Hiện thêm (' + (list.length - visible.length) + ' còn lại)</button>';
    el.innerHTML = html;
  }

  function editTxnModal(row) {
    var t = allTxns().filter(function (x) { return String(x.row) === String(row); })[0];
    if (!t) return;
    if (!t.row) { closeModal(); return toast('Giao dịch này chưa đồng bộ, hãy đợi vài giây rồi thử lại'); }
    var d = D();
    function sel(id, list, cur) {
      return '<select id="' + id + '">' + list.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
    }
    var catOpts = '<option value="">(không có)</option>' + d.categories.map(function (c) {
      return '<option' + (c.name === t.cat ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    openModal('<h2>Sửa giao dịch</h2><label>Nội dung</label><input id="e-desc" value="' + esc(t.desc) + '">' +
      '<div class="row"><div><label>Số tiền</label><input id="e-amt" inputmode="decimal" value="' + t.amount + '"></div><div><label>Tiền tệ</label>' + sel('e-cur', ['AUD', 'VND'], t.cur) + '</div></div>' +
      '<div class="row"><div><label>Thẻ</label>' + sel('e-card', d.cards.map(function (c) { return c.name; }), t.card) + '</div><div><label>Loại</label>' + sel('e-type', ['Chi', 'Thu'], t.type) + '</div></div>' +
      '<label>Danh mục</label><select id="e-cat">' + catOpts + '</select>' +
      '<label>Ngày</label><input id="e-date" type="date" value="' + esc(t.date) + '"><label>Ghi chú</label><input id="e-note" value="' + esc(t.note) + '">' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="save-edit" data-row="' + t.row + '">Lưu</button><button class="btn" data-act="close">Hủy</button></div>');
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình NGÂN SÁCH                                                  */
  /* ------------------------------------------------------------------ */

  function viewBudget() {
    var d = D(), mk = L.monthKey(state.today), h = '';
    h += '<div class="card"><div class="muted small">Tháng ' + mk.substr(5, 2) + '/' + mk.substr(0, 4) + '. Nhóm Úc tính bằng AUD, nhóm Việt Nam tính bằng VND (khoản khác tiền được quy đổi theo tỷ giá lúc ghi). Số "còn được tiêu hôm nay" chỉ dựa trên các danh mục <b>Chi phí biến đổi</b>.</div></div>';
    ['Úc', 'Việt Nam'].forEach(function (g) {
      var cur = L.groupCur(g), spent = L.spentByCategory(d.txns, g, mk, d.categories);
      var list = d.budgets.filter(function (b) { return b.group === g; }).sort(function (a, b) { return a.category < b.category ? -1 : 1; });
      var tot = list.reduce(function (s, b) { return s + b.amount; }, 0);
      var totSpent = list.reduce(function (s, b) { return s + (spent[b.category] || 0); }, 0);
      h += '<div class="card"><h3>' + esc(g) + ' · ' + cur + '</h3>';
      if (list.length) h += '<div class="muted small" style="margin-bottom:6px">Tổng: ' + money(totSpent, cur) + ' / ' + money(tot, cur) + '</div>';
      h += list.map(function (b) {
        var s = spent[b.category] || 0, pct = Math.min(100, s / b.amount * 100);
        var cls = s > b.amount ? 'over' : (s > b.amount * 0.8 ? 'warn' : '');
        return '<div class="bud" data-act="edit-budget" data-g="' + esc(g) + '" data-c="' + esc(b.category) + '"><div class="top"><b>' + esc(b.category) + '</b>' +
          '<span>' + money(s, cur) + ' / ' + money(b.amount, cur) + '</span></div><div class="bar"><i class="' + cls + '" style="width:' + pct + '%"></i></div>' +
          '<div class="muted small">' + (s > b.amount ? 'Vượt ' + money(s - b.amount, cur) : 'Còn ' + money(b.amount - s, cur)) + '</div></div>';
      }).join('') || '<div class="empty">Chưa có ngân sách cho nhóm này.</div>';
      h += '<button class="btn small" style="margin-top:10px" data-act="add-budget" data-g="' + esc(g) + '">+ Thêm ngân sách</button></div>';
    });
    return h;
  }

  function budgetModal(g, cat) {
    var d = D(), cur = L.groupCur(g), existing = d.budgets.filter(function (b) { return b.group === g && b.category === cat; })[0];
    var opts = d.categories.filter(function (c) { return c.group !== 'THU NHẬP' && c.group !== L.NO_COUNT_GROUP; }).map(function (c) {
      return '<option' + (c.name === cat ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    openModal('<h2>Ngân sách ' + esc(g) + '</h2><label>Danh mục</label><select id="b-cat">' + opts + '</select>' +
      '<label>Số tiền mỗi tháng (' + cur + ') — để 0 hoặc trống để xóa</label><input id="b-amt" inputmode="decimal" value="' + (existing ? existing.amount : '') + '">' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="save-budget" data-g="' + esc(g) + '">Lưu</button><button class="btn" data-act="close">Hủy</button></div>');
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình BÁO CÁO                                                    */
  /* ------------------------------------------------------------------ */

  var PALETTE = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777', '#64748b'];

  function donut(items, cur) {
    var total = items.reduce(function (s, i) { return s + i.amount; }, 0);
    if (!(total > 0)) return '<div class="empty">Chưa có dữ liệu.</div>';
    var R = 42, C = 2 * Math.PI * R, off = 0, svg = '<svg viewBox="0 0 120 120" width="140" height="140" style="flex:0 0 auto"><g transform="rotate(-90 60 60)">';
    items.forEach(function (it, i) {
      var len = it.amount / total * C;
      svg += '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + PALETTE[i % PALETTE.length] + '" stroke-width="22" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '"/>';
      off += len;
    });
    svg += '</g></svg>';
    var legend = '<div class="legend" style="flex:1">' + items.map(function (it, i) {
      return '<div><i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' + esc(it.name) + (it.count ? ' <span class="muted small">×' + it.count + '</span>' : '') +
        '<span class="v">' + Math.round(it.amount / total * 100) + '%</span></div>';
    }).join('') + '</div>';
    return '<div class="row" style="align-items:flex-start;gap:14px">' + svg + legend + '</div>';
  }

  function barsChart(tr, cur) {
    var max = Math.max.apply(null, tr.map(function (t) { return Math.max(t.expense, t.income); }).concat([1]));
    var w = 300, h = 120, bw = 18, gap = (w - tr.length * bw * 2) / (tr.length + 1), x = gap, svg = '<svg viewBox="0 0 ' + w + ' ' + (h + 20) + '" width="100%">';
    tr.forEach(function (t) {
      var hi = t.income / max * h, he = t.expense / max * h;
      svg += '<rect x="' + x + '" y="' + (h - hi) + '" width="' + bw + '" height="' + hi + '" rx="3" fill="#15803d" opacity=".75"/>';
      svg += '<rect x="' + (x + bw + 2) + '" y="' + (h - he) + '" width="' + bw + '" height="' + he + '" rx="3" fill="#b91c1c" opacity=".8"/>';
      svg += '<text x="' + (x + bw) + '" y="' + (h + 13) + '" text-anchor="middle">' + t.month.substr(5, 2) + '/' + t.month.substr(2, 2) + '</text>';
      x += bw * 2 + gap;
    });
    return svg + '</svg><div class="muted small"><span style="color:#15803d">■</span> Thu &nbsp; <span style="color:#b91c1c">■</span> Chi (đơn vị ' + cur + ', không tính chuyển tiền và tiết kiệm)</div>';
  }

  function viewReport() {
    var d = D(), cur = state.disp, mk = state.month;
    var rep = L.monthReport(d.txns, mk, cur, d.categories);
    var prev = L.monthReport(d.txns, L.shiftMonth(mk, -1), cur, d.categories);
    var h = '<div class="nav"><button class="btn small" data-act="month" data-v="-1">‹</button><div class="mid">Tháng ' + mk.substr(5, 2) + '/' + mk.substr(0, 4) + '</div>' +
      '<button class="btn small" data-act="month" data-v="1">›</button>' +
      '<div class="seg" style="width:110px"><button class="' + (cur === 'AUD' ? 'on' : '') + '" data-act="disp" data-v="AUD">AUD</button><button class="' + (cur === 'VND' ? 'on' : '') + '" data-act="disp" data-v="VND">VND</button></div></div>';

    h += '<div class="card"><div class="kpis">' +
      '<div class="kpi"><div class="v" style="color:var(--in)">' + L.fmtCompact(rep.income, cur) + '</div><div class="k">Thu</div></div>' +
      '<div class="kpi"><div class="v" style="color:var(--out)">' + L.fmtCompact(rep.expense, cur) + '</div><div class="k">Chi</div></div>' +
      '<div class="kpi"><div class="v">' + L.fmtCompact(rep.left, cur) + '</div><div class="k">Còn lại</div></div></div>' +
      (rep.saving ? '<div class="muted small" style="margin-top:8px">Tiết kiệm và đầu tư: ' + money(rep.saving, cur) + '</div>' : '') +
      (prev.expense ? '<div class="small" style="margin-top:6px">So với tháng trước: Chi ' + deltaHtml(rep.expense, prev.expense) + '</div>' : '') + '</div>';

    if (mk === L.monthKey(state.today)) {
      var w = L.weekSummary(d.txns, state.today, cur, d.categories);
      h += '<div class="card"><h3>Tuần này (' + shortDate(w.start) + '–' + shortDate(w.end) + ')</h3>Chi <b>' + money(w.total, cur) + '</b>' +
        (w.prev ? ' · tuần trước ' + money(w.prev, cur) + ' (' + deltaHtml(w.total, w.prev) + ')' : '') +
        (w.top ? '<div class="muted small">Nhiều nhất: ' + esc(w.top.name) + ' ' + money(w.top.amount, cur) + '</div>' : '') + '</div>';
    }

    var cats = L.sortedEntries(rep.byCat);
    h += '<div class="card"><h3>Theo danh mục</h3>' + (cats.length ? '<div class="list">' + cats.map(function (c) {
      var p = prev.byCat[c.name];
      return '<div class="item"><div class="main"><div class="t">' + esc(c.name) + '</div><div class="bar"><i style="width:' + Math.round(c.amount / cats[0].amount * 100) + '%"></i></div></div>' +
        '<div class="amt">' + money(c.amount, cur) + '<small>' + (p ? deltaHtml(c.amount, p) : 'mới') + '</small></div></div>';
    }).join('') + '</div>' : '<div class="empty">Chưa có chi tiêu trong tháng này.</div>') + '</div>';

    var cards = L.sortedEntries(rep.byCard).map(function (e) { return { name: e.name, amount: e.amount, count: e.raw.count }; });
    h += '<div class="card"><h3>Thẻ đã dùng</h3>' + donut(cards, cur) + '</div>';

    var tr = L.trend(d.txns, L.monthKey(state.today), 6, cur, d.categories);
    h += '<div class="card"><h3>6 tháng gần nhất</h3>' + barsChart(tr, cur) + '</div>';

    var tops = L.sortedEntries(rep.byMerchant).slice(0, 10);
    h += '<div class="card"><h3>Chi nhiều nhất ở đâu</h3>' + (tops.length ? '<div class="list">' + tops.map(function (m) {
      return '<div class="item"><div class="main"><div class="t">' + esc(m.raw.name) + '</div><div class="s">' + m.raw.count + ' lần</div></div><div class="amt">' + money(m.amount, cur) + '</div></div>';
    }).join('') + '</div>' : '<div class="empty">Chưa có dữ liệu.</div>') + '</div>';

    if (d.trips.length) {
      var sel = state.tripSel || d.trips[0].name, tp = L.tripReport(d.txns, sel, cur, d.categories);
      var te = L.sortedEntries(tp.byCat);
      h += '<div class="card"><h3>Chuyến đi</h3><select data-change="trip">' + d.trips.map(function (t) {
        return '<option' + (t.name === sel ? ' selected' : '') + '>' + esc(t.name) + '</option>';
      }).join('') + '</select>' +
        '<div style="margin-top:10px">Tổng chi: <b>' + money(tp.total, cur) + '</b></div>' +
        (te.length ? '<div class="legend">' + te.map(function (e) { return '<div>' + esc(e.name) + '<span class="v">' + money(e.amount, cur) + '</span></div>'; }).join('') + '</div>' : '<div class="muted small">Chưa có giao dịch nào được gắn chuyến này (tự gắn theo ngày của chuyến).</div>') + '</div>';
    }
    return h;
  }

  function deltaHtml(now, before) {
    if (!before) return '';
    var p = Math.round((now - before) / before * 100);
    return '<span class="delta ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '%</span>';
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình CHUYỂN TIỀN                                                */
  /* ------------------------------------------------------------------ */

  function viewTransfer() {
    var d = D();
    var audCards = d.cards.filter(function (c) { return c.currency === 'AUD'; });
    var vndCards = d.cards.filter(function (c) { return c.currency === 'VND'; });
    var provs = ['Wise', 'Remitly', 'CommBank', 'Western Union', 'Ria'];
    (state.transfers || []).forEach(function (t) { if (t.provider && provs.indexOf(t.provider) < 0) provs.push(t.provider); });
    var h = '<div class="card"><h3>Chuyển tiền Úc → Việt Nam</h3>' +
      '<label>Nơi chuyển</label><input id="t-prov" list="prov-list" placeholder="Wise, Remitly...">' +
      '<datalist id="prov-list">' + provs.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>' +
      '<div class="row"><div><label>Từ thẻ</label><select id="t-from">' + audCards.map(function (c) { return '<option>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Đến thẻ</label><select id="t-to">' + vndCards.map(function (c) { return '<option>' + esc(c.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row"><div><label>AUD gửi</label><input id="t-aud" inputmode="decimal" placeholder="1000"></div>' +
      '<div><label>Phí (AUD)</label><input id="t-fee" inputmode="decimal" placeholder="0"></div></div>' +
      '<label>VND người nhận được</label><input id="t-vnd" inputmode="numeric" placeholder="16.300.000">' +
      '<div class="row"><div><label>Tỷ giá thị trường</label><input id="t-mkt" inputmode="decimal" value="' + Math.round(d.rates.current) + '"></div>' +
      '<div><label>Ngày</label><input id="t-date" type="date" value="' + state.today + '"></div></div>' +
      '<div class="preview" id="t-calc">Nhập số AUD gửi và VND nhận để xem tỷ giá thực tế.</div>' +
      '<button class="btn primary" style="width:100%" data-act="save-transfer">Lưu chuyển tiền</button>' +
      '<div class="muted small" style="margin-top:8px">Lưu sẽ ghi 2 dòng vào GiaoDich (loại Chuyển tiền, không tính vào thu/chi) cộng dòng phí nếu có.</div></div>';

    if (state.transfers && state.transfers.length) {
      var ps = L.providerStats(state.transfers);
      h += '<div class="card"><h3>So sánh nơi chuyển</h3><div class="list">' + ps.map(function (p) {
        return '<div class="item"><div class="main"><div class="t">' + esc(p.provider) + '</div><div class="s">' + p.n + ' lần</div></div>' +
          '<div class="amt">' + Math.round(p.avgRate).toLocaleString('vi-VN') + '₫/AUD<small>' + (p.avgDiff * 100).toFixed(2) + '% so với thị trường</small></div></div>';
      }).join('') + '</div></div>';
      h += '<div class="card"><h3>Lịch sử</h3><div class="list">' + state.transfers.slice(0, 15).map(function (t) {
        return '<div class="item"><div class="main"><div class="t">' + esc(t.provider || 'Chuyển tiền') + ' · ' + money(t.aud, 'AUD') + '</div><div class="s">' + shortDate(t.date) + ' · phí ' + money(t.fee, 'AUD') + '</div></div>' +
          '<div class="amt">' + money(t.vnd, 'VND') + '<small>' + Math.round(t.effective).toLocaleString('vi-VN') + '₫/AUD</small></div></div>';
      }).join('') + '</div></div>';
    } else if (state.transfers) {
      h += '<div class="card"><div class="empty">Chưa có lần chuyển tiền nào.</div></div>';
    }
    return h;
  }

  function numVal(id) { var el = $(id); return el ? L.parseNumber((el.value || '').replace(/\s/g, '')) || 0 : 0; }

  function updateTransferCalc() {
    var el = $('#t-calc'); if (!el) return;
    var c = L.transferCalc(numVal('#t-aud'), numVal('#t-fee'), numVal('#t-vnd'), numVal('#t-mkt'));
    if (!c) { el.textContent = 'Nhập số AUD gửi và VND nhận để xem tỷ giá thực tế.'; return; }
    el.innerHTML = 'Tỷ giá thực tế: <b>' + Math.round(c.effective).toLocaleString('vi-VN') + '₫ / AUD</b> (đã tính phí)<br>' +
      (c.lossVnd >= 0 ? 'Thấp hơn thị trường <b style="color:var(--out)">' + money(c.lossVnd, 'VND') + '</b> (≈ ' + money(c.lossAud, 'AUD') + ', ' + Math.abs(c.diffPct * 100).toFixed(2) + '%)'
        : 'Cao hơn thị trường <b style="color:var(--in)">' + money(-c.lossVnd, 'VND') + '</b>');
  }

  function saveTransfer() {
    var aud = numVal('#t-aud'), vnd = numVal('#t-vnd');
    if (!(aud > 0) || !(vnd > 0)) return toast('Cần nhập AUD gửi và VND nhận');
    var payload = { provider: $('#t-prov').value.trim(), fromCard: $('#t-from').value, toCard: $('#t-to').value, aud: aud, fee: numVal('#t-fee'),
      vnd: vnd, market: numVal('#t-mkt'), date: $('#t-date').value || state.today };
    setSync('busy');
    api('addTransfer', payload).then(function (r) {
      toast('Đã lưu. Tỷ giá thực tế ' + Math.round(r.effective).toLocaleString('vi-VN') + '₫/AUD');
      state.transfers = null;
      return refresh(true).then(loadTransfers);
    }).catch(function (e) { setSync('err'); toast(e.server ? 'Lỗi: ' + e.message : 'Cần có mạng để lưu chuyển tiền'); });
  }

  function loadTransfers() {
    return api('transfers').then(function (r) { state.transfers = r.transfers; if (state.tab === 'transfer') render(); }).catch(function () {});
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình THÊM                                                       */
  /* ------------------------------------------------------------------ */

  function viewMore() {
    var d = D(), h = '';
    h += '<div class="card"><h3>Mục tiêu tiết kiệm</h3>' + (d.goals.length ? d.goals.map(function (g) {
      var pct = Math.min(100, g.saved / g.target * 100);
      return '<div class="bud" data-act="edit-goal" data-row="' + g.row + '"><div class="top"><b>' + esc(g.name) + '</b><span>' + money(g.saved, g.currency) + ' / ' + money(g.target, g.currency) + '</span></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="muted small">' + Math.round(pct) + '%' + (g.due ? ' · hạn ' + g.due.substr(8, 2) + '/' + g.due.substr(5, 2) + '/' + g.due.substr(0, 4) : '') + goalPace(g) + '</div></div>';
    }).join('') : '<div class="empty">Chưa có mục tiêu nào.</div>') + '<button class="btn small" style="margin-top:10px" data-act="add-goal">+ Thêm mục tiêu</button></div>';

    h += '<div class="card"><h3>Chuyến đi</h3>' + (d.trips.length ? '<div class="list">' + d.trips.map(function (t) {
      return '<div class="item"><div class="main"><div class="t">' + esc(t.name) + '</div><div class="s">' + t.from + ' → ' + t.to + '</div></div></div>';
    }).join('') + '</div>' : '<div class="empty">Chưa có chuyến đi.</div>') +
      '<div class="muted small">Giao dịch trong khoảng ngày của chuyến sẽ tự được gắn nhãn chuyến đi.</div><button class="btn small" style="margin-top:10px" data-act="add-trip">+ Thêm chuyến đi</button></div>';

    h += '<div class="card"><h3>Quy tắc tự phân loại</h3><div class="muted small">Có ' + d.rules.length + ' quy tắc. Khi gõ nội dung chứa từ khóa, danh mục được chọn tự động. Sửa hàng loạt ở tab QuyTac trong Google Sheet.</div>' +
      '<button class="btn small" style="margin-top:10px" data-act="add-rule">+ Thêm quy tắc</button></div>';

    h += '<div class="card"><h3>Thẻ ACB</h3><div class="muted small">Nhập ngày sao kê và ngày đến hạn hằng tháng để app nhắc trước 5 ngày.</div>' +
      '<div class="row"><div><label>Ngày sao kê</label><input id="c-st" inputmode="numeric" value="' + (d.config.acbStatementDay || '') + '"></div>' +
      '<div><label>Ngày đến hạn</label><input id="c-due" inputmode="numeric" value="' + (d.config.acbDueDay || '') + '"></div></div>' +
      '<button class="btn small" style="margin-top:10px" data-act="save-acb">Lưu</button></div>';

    var hasPin = !!LS.get('pin', null);
    h += '<div class="card"><h3>Bảo mật và kết nối</h3><div class="row"><button class="btn" data-act="set-pin">' + (hasPin ? 'Đổi / tắt mã PIN' : 'Đặt mã PIN khóa app') + '</button>' +
      '<button class="btn danger" data-act="disconnect">' + (state.cfg.demo ? 'Thoát demo' : 'Ngắt kết nối') + '</button></div>' +
      (queue().length ? '<div class="alert" style="margin-top:10px">Có ' + queue().length + ' giao dịch đang chờ gửi. <button class="btn small" data-act="flush">Gửi ngay</button></div>' : '') +
      '<div class="muted small" style="margin-top:10px">Phiên bản app 1.0 · ' + (state.cfg.demo ? 'đang xem dữ liệu demo' : 'đã kết nối với Google Sheet của bạn') + '</div></div>';
    return h;
  }

  function goalPace(g) {
    if (!g.due || g.saved >= g.target) return '';
    var days = L.daysBetween(state.today, g.due);
    if (days <= 0) return ' · đã quá hạn';
    var perMonth = (g.target - g.saved) / Math.max(days / 30.4, 0.5);
    return ' · cần để dành ' + money(perMonth, g.currency) + '/tháng';
  }

  /* ------------------------------------------------------------------ */
  /* Khóa PIN                                                            */
  /* ------------------------------------------------------------------ */

  function sha(s) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve('plain:' + s);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('ct1:' + s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }

  function showLock() {
    if (!LS.get('pin', null)) return;
    var el = $('#lock'); el.hidden = false;
    el.innerHTML = '<div style="font-weight:700;font-size:18px">Nhập mã PIN</div><input id="lock-pin" inputmode="numeric" type="password" maxlength="8" autocomplete="off"><div id="lock-msg" class="muted small"></div>';
    setTimeout(function () { var i = $('#lock-pin'); if (i) i.focus(); }, 50);
  }

  function tryUnlock(v) {
    sha(v).then(function (hash) {
      if (hash === LS.get('pin', null)) { $('#lock').hidden = true; $('#lock').innerHTML = ''; }
      else if (v.length >= 4) { $('#lock-msg').textContent = 'Sai mã PIN'; }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Vẽ và điều hướng                                                    */
  /* ------------------------------------------------------------------ */

  var TITLES = { today: 'Hôm nay', txns: 'Giao dịch', budget: 'Ngân sách', report: 'Báo cáo', transfer: 'Chuyển tiền', more: 'Thêm' };

  function render() {
    var tabs = $('#tabs');
    if (!state.cfg) { tabs.style.display = 'none'; $view.innerHTML = viewWelcome(); $('#title').textContent = 'Chi tiêu'; return; }
    tabs.style.display = '';
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === state.tab); });
    $('#title').textContent = TITLES[state.tab] + (state.cfg.demo ? ' · demo' : '');
    if (!state.data) { $view.innerHTML = '<div class="empty">Đang tải dữ liệu…</div>'; return; }
    var fn = { today: viewToday, txns: viewTxns, budget: viewBudget, report: viewReport, transfer: viewTransfer, more: viewMore }[state.tab];
    $view.innerHTML = fn();
    if (state.tab === 'today' || state.tab === 'txns') updatePreview();
    if (state.tab === 'txns') drawTxnList();
    if (state.tab === 'transfer' && state.transfers === null) loadTransfers();
  }

  function setTab(t) { state.tab = t; LS.set('tab', t); render(); window.scrollTo(0, 0); }

  /* ------------------------------------------------------------------ */
  /* Sự kiện                                                             */
  /* ------------------------------------------------------------------ */

  function fieldModal(title, fields, submitAct, extra) {
    openModal('<h2>' + esc(title) + '</h2>' + fields + '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="' + submitAct + '"' + (extra || '') + '>Lưu</button><button class="btn" data-act="close">Hủy</button></div>');
  }

  var ACTIONS = {
    tab: function (el) { setTab(el.getAttribute('data-v')); },
    refresh: function () { flushQueue().then(function () { return refresh(); }).catch(function () {}); },
    close: closeModal,
    'modal-back': function (el, ev) { if (ev.target === el) closeModal(); },
    connect: function () {
      var url = $('#w-url').value.trim(), token = $('#w-token').value.trim();
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('Địa chỉ phải bắt đầu bằng https://script.google.com và kết thúc bằng /exec');
      if (token.length < 8) return toast('Nhập mã app');
      state.cfg = { url: url, token: token }; LS.set('cfg', state.cfg);
      render(); refresh().catch(function () {});
    },
    demo: function () { state.cfg = { demo: true }; LS.set('cfg', state.cfg); window.Demo.reset(); render(); refresh().catch(function () {}); },
    disconnect: function () {
      if (!confirm(state.cfg.demo ? 'Thoát bản demo?' : 'Ngắt kết nối? Dữ liệu trong Google Sheet vẫn được giữ nguyên.')) return;
      LS.del('cfg'); LS.del('cache'); state.cfg = null; state.data = null; render();
    },
    'pick-card': function (el) {
      state.q.card = el.getAttribute('data-v');
      Array.prototype.forEach.call(document.querySelectorAll('#q-cards .chip'), function (c) { c.classList.toggle('on', c === el); });
      updatePreview();
    },
    'pick-type': function (el) {
      state.q.type = el.getAttribute('data-v'); state.q.cat = '';
      Array.prototype.forEach.call(document.querySelectorAll('#q-type button'), function (b) { b.classList.toggle('on', b === el); });
      $('#q-cat').innerHTML = categoryOptions(state.q.type, ''); updatePreview();
    },
    'save-txn': saveTxn,
    freq: function (el) {
      var f = D().frequent[+el.getAttribute('data-i')];
      state.q.card = f.card; state.q.type = 'Chi'; state.q.cat = f.cat || '';
      var sym = f.cur === 'AUD' ? '$' : '';
      state.q.text = f.desc + ' ' + sym + f.amount + (f.cur === 'VND' ? 'vnd' : '');
      render(); $('#q-text').focus();
    },
    txn: function (el) { openTxn(el.getAttribute('data-row')); },
    'edit-txn': function (el) { editTxnModal(el.getAttribute('data-row')); },
    'more-tx': function () { state.f.limit += 50; drawTxnList(); },
    'disp-tx': function (el) { state.disp = el.getAttribute('data-v'); LS.set('disp', state.disp); render(); },
    'save-edit': function (el) {
      var row = +el.getAttribute('data-row');
      var t = allTxns().filter(function (x) { return x.row === row; })[0];
      if (!t) return;
      var amt = L.parseNumber(($('#e-amt').value || '').replace(/\s/g, ''));
      if (!(amt > 0)) return toast('Số tiền không hợp lệ');
      var p = { row: row, old: { desc: t.desc, amount: t.amount }, desc: $('#e-desc').value.trim(), amount: amt, currency: $('#e-cur').value,
        card: $('#e-card').value, type: $('#e-type').value, category: $('#e-cat').value, date: $('#e-date').value || t.date, note: $('#e-note').value.trim() };
      closeModal(); setSync('busy');
      api('updateTxn', p).then(function () { toast('Đã sửa'); return refresh(true); })
        .catch(function (e) { setSync('err'); toast(e.server ? 'Không sửa được: ' + e.message : 'Cần có mạng để sửa'); });
    },
    'del-txn': function (el) { deleteTxn(el.getAttribute('data-row')); },
    'add-budget': function (el) { budgetModal(el.getAttribute('data-g'), ''); },
    'edit-budget': function (el) { budgetModal(el.getAttribute('data-g'), el.getAttribute('data-c')); },
    'save-budget': function (el) {
      var amt = L.parseNumber(($('#b-amt').value || '0').replace(/\s/g, '')) || 0;
      var p = { group: el.getAttribute('data-g'), category: $('#b-cat').value, amount: amt };
      closeModal(); setSync('busy');
      api('setBudget', p).then(function () { return refresh(true); }).catch(function (e) { setSync('err'); toast('Lỗi: ' + e.message); });
    },
    month: function (el) { state.month = L.shiftMonth(state.month, +el.getAttribute('data-v')); render(); },
    disp: function (el) { state.disp = el.getAttribute('data-v'); LS.set('disp', state.disp); render(); },
    'save-transfer': saveTransfer,
    flush: function () { flushQueue().then(function () { return refresh(true); }).then(function () { toast('Đã gửi'); }).catch(function () {}); },
    'add-goal': function () {
      fieldModal('Mục tiêu mới', '<label>Tên</label><input id="g-name"><div class="row"><div><label>Số tiền cần</label><input id="g-target" inputmode="decimal"></div>' +
        '<div><label>Tiền tệ</label><select id="g-cur"><option>AUD</option><option>VND</option></select></div></div>' +
        '<div class="row"><div><label>Hạn (tùy chọn)</label><input id="g-due" type="date"></div><div><label>Đã có</label><input id="g-saved" inputmode="decimal" value="0"></div></div>', 'save-goal');
    },
    'save-goal': function () {
      var p = { name: $('#g-name').value.trim(), target: L.parseNumber($('#g-target').value) || 0, currency: $('#g-cur').value, due: $('#g-due').value, saved: L.parseNumber($('#g-saved').value) || 0 };
      if (!p.name || !(p.target > 0)) return toast('Cần tên và số tiền mục tiêu');
      closeModal(); setSync('busy');
      api('addGoal', p).then(function () { return refresh(true); }).catch(function (e) { setSync('err'); toast('Lỗi: ' + e.message); });
    },
    'edit-goal': function (el) {
      var g = D().goals.filter(function (x) { return String(x.row) === el.getAttribute('data-row'); })[0];
      if (!g) return;
      openModal('<h2>' + esc(g.name) + '</h2><label>Số tiền đã có (' + g.currency + ')</label><input id="g-saved" inputmode="decimal" value="' + g.saved + '">' +
        '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="update-goal" data-row="' + g.row + '">Cập nhật</button>' +
        '<button class="btn danger" data-act="delete-goal" data-row="' + g.row + '">Xóa</button><button class="btn" data-act="close">Đóng</button></div>');
    },
    'update-goal': function (el) {
      var row = +el.getAttribute('data-row'), saved = L.parseNumber($('#g-saved').value) || 0;
      closeModal(); api('updateGoal', { row: row, saved: saved }).then(function () { return refresh(true); }).catch(function (e) { toast('Lỗi: ' + e.message); });
    },
    'delete-goal': function (el) {
      if (!confirm('Xóa mục tiêu này?')) return;
      var row = +el.getAttribute('data-row'); closeModal();
      api('deleteGoal', { row: row }).then(function () { return refresh(true); }).catch(function (e) { toast('Lỗi: ' + e.message); });
    },
    'add-trip': function () {
      fieldModal('Chuyến đi mới', '<label>Tên</label><input id="tr-name"><div class="row"><div><label>Từ ngày</label><input id="tr-from" type="date"></div><div><label>Đến ngày</label><input id="tr-to" type="date"></div></div>', 'save-trip');
    },
    'save-trip': function () {
      var p = { name: $('#tr-name').value.trim(), from: $('#tr-from').value, to: $('#tr-to').value };
      if (!p.name || !p.from || !p.to) return toast('Cần tên và ngày');
      closeModal(); api('addTrip', p).then(function () { return refresh(true); }).catch(function (e) { toast('Lỗi: ' + e.message); });
    },
    'add-rule': function () {
      var opts = D().categories.map(function (c) { return '<option>' + esc(c.name) + '</option>'; }).join('');
      fieldModal('Quy tắc mới', '<label>Nội dung chứa từ khóa</label><input id="r-kw" placeholder="vd: woolworths"><label>Thì xếp vào danh mục</label><select id="r-cat">' + opts + '</select>', 'save-rule');
    },
    'save-rule': function () {
      var p = { keyword: $('#r-kw').value.trim(), category: $('#r-cat').value };
      if (!p.keyword) return toast('Nhập từ khóa');
      closeModal(); api('setRule', p).then(function () { return refresh(true); }).then(function () { toast('Đã lưu quy tắc'); }).catch(function (e) { toast('Lỗi: ' + e.message); });
    },
    'save-acb': function () {
      var st = $('#c-st').value.trim(), due = $('#c-due').value.trim();
      Promise.all([api('setConfig', { key: 'ACB_NGAY_SAO_KE', value: st }), api('setConfig', { key: 'ACB_NGAY_DEN_HAN', value: due })])
        .then(function () { toast('Đã lưu'); return refresh(true); }).catch(function (e) { toast('Lỗi: ' + e.message); });
    },
    'set-pin': function () {
      fieldModal('Mã PIN khóa app', '<div class="muted small">4–8 chữ số, lưu trên điện thoại này. Để trống rồi Lưu để tắt khóa. App tự khóa khi bạn rời đi hơn 1 phút.</div><label>PIN mới</label><input id="pin-new" inputmode="numeric" type="password" maxlength="8">', 'save-pin');
    },
    'save-pin': function () {
      var v = $('#pin-new').value.trim();
      if (!v) { LS.del('pin'); closeModal(); render(); return toast('Đã tắt khóa'); }
      if (!/^\d{4,8}$/.test(v)) return toast('PIN gồm 4–8 chữ số');
      sha(v).then(function (h) { LS.set('pin', h); closeModal(); render(); toast('Đã đặt PIN'); });
    }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var fn = ACTIONS[el.getAttribute('data-act')];
    if (fn) fn(el, ev);
  });

  document.addEventListener('input', function (ev) {
    var id = ev.target.id;
    if (id === 'q-text') { state.q.text = ev.target.value; updatePreview(); }
    else if (id === 'q-date') { state.q.date = ev.target.value; }
    else if (id === 'q-note') { state.q.note = ev.target.value; }
    else if (id === 'f-q') { state.f.q = ev.target.value; state.f.limit = 50; drawTxnList(); }
    else if (id === 't-aud' || id === 't-fee' || id === 't-vnd' || id === 't-mkt') updateTransferCalc();
    else if (id === 'lock-pin') tryUnlock(ev.target.value);
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'q-cat') { state.q.cat = ev.target.value; updatePreview(); }
    else if (ev.target.getAttribute && ev.target.getAttribute('data-change') === 'trip') { state.tripSel = ev.target.value; render(); }
    else if (ev.target.getAttribute && /^f-/.test(ev.target.getAttribute('data-change') || '')) {
      state.f[ev.target.getAttribute('data-change').substr(2)] = ev.target.value; state.f.limit = 50; drawTxnList();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.id === 'q-text') { ev.preventDefault(); saveTxn(); }
  });

  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (LS.get('pin', null) && Date.now() - hiddenAt > 60000) showLock();
    if (state.cfg && state.data) {
      state.today = L.ymd(new Date());
      flushQueue().then(function () { return refresh(true); }).catch(function () {});
    }
  });
  window.addEventListener('online', function () { flushQueue().then(function () { return refresh(true); }).catch(function () {}); });

  /* ------------------------------------------------------------------ */
  /* Khởi động                                                           */
  /* ------------------------------------------------------------------ */

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});

  showLock();
  if (state.cfg) {
    var cached = state.cfg.demo ? null : LS.get('cache', null);
    if (cached) state.data = cached;
    render();
    flushQueue().then(function () { return refresh(!!cached); }).catch(function () {});
  } else {
    render();
  }
})();
