/* forms.js — form nhập giao dịch, các trang cài đặt, sự kiện, khởi động */
let LAYER = [];        // các lớp phủ đang mở (sheet / trang)
let F = null;          // trạng thái form đang sửa (data-f)
let TX = null;         // form giao dịch
let PAGE = null;       // trang cài đặt đang mở
const SCROLL = {};

function drawLayer() {
  document.querySelectorAll('#layer .sh-body').forEach((b) => { SCROLL[b.closest('.ov').dataset.id] = b.scrollTop; });
  $('#layer').innerHTML = LAYER.map((l) => l.build()).join('');
  document.querySelectorAll('#layer .sh-body').forEach((b) => { const s = SCROLL[b.closest('.ov').dataset.id]; if (s) b.scrollTop = s; });
}
function renderOverlays() { if (LAYER.length) drawLayer(); }
function openLayer(id, build) { LAYER = LAYER.filter((l) => l.id !== id); LAYER.push({ id, build }); delete SCROLL[id]; drawLayer(); }
function closeLayer(id) { LAYER = LAYER.filter((l) => l.id !== id); delete SCROLL[id]; drawLayer(); }
function topLayer() { return LAYER[LAYER.length - 1]; }

let toastT = null;
function toast(msg) {
  $('#toastbox').innerHTML = `<div class="toast">${esc(msg)}</div>`;
  clearTimeout(toastT); toastT = setTimeout(() => { $('#toastbox').innerHTML = ''; }, 2600);
}
function ask(msg, okLabel, fn, danger) {
  window._askFn = fn;
  openLayer('confirm', () => `<div class="ov" data-id="confirm" style="align-items:center"><div class="sheet" style="border-radius:18px;max-width:340px;margin:0 20px;padding:18px">
    <div style="font-size:16px;margin-bottom:16px;white-space:pre-line">${esc(msg)}</div>
    <div style="display:flex;gap:8px"><button class="btn sec" data-a="ask-no">Hủy</button><button class="btn ${danger ? 'danger' : ''}" data-a="ask-yes">${esc(okLabel || 'OK')}</button></div></div></div>`);
}

// ---------- tiện ích form ----------
const fld = (label, inner) => `<div class="field"><label>${label}</label>${inner}</div>`;
const inp = (k, o) => { o = o || {}; return `<input class="inp" data-f="${k}" value="${esc(F[k] === undefined || F[k] === null ? '' : F[k])}" ${o.type ? `type="${o.type}"` : ''} ${o.mode ? `inputmode="${o.mode}"` : ''} placeholder="${esc(o.ph || '')}" autocomplete="off" ${o.ro ? 'readonly' : ''}>`; };
const selF = (k, opts) => `<select class="inp" data-f="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(F[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const segF = (k, opts, cls) => `<div class="seg ${cls || ''}">${opts.map(([v, l, c]) => `<button data-a="fset" data-k="${k}" data-v="${esc(v)}" class="${String(F[k]) === String(v) ? 'on' : ''} ${c || ''}">${l}</button>`).join('')}</div>`;
function parseNum(v, cur) {
  let s = String(v === undefined || v === null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (cur === 'VND' && /^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}
const hhmm = () => { const d = new Date(); return CORE.pad(d.getHours()) + ':' + CORE.pad(d.getMinutes()); };
const sheet = (id, title, body, foot, o) => `<div class="ov" data-id="${id}" data-a="ovclose"><div class="sheet ${o && o.full ? 'full' : ''}">
  <div class="sh-head"><button class="hbtn" style="color:var(--text)" data-a="close" data-id="${id}">${ico('close')}</button><b>${title}</b><span style="width:38px;text-align:right">${(o && o.right) || ''}</span></div>
  <div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ''}</div></div>`;

// ================= GIAO DỊCH =================
function openTx(over) {
  const last = S.txns[S.txns.length - 1];
  const c0 = (last && S.cards.find((c) => c.name === last.card)) || S.cards[0];
  TX = Object.assign({ id: null, type: 'Chi', amount: '', cur: c0 ? c0.cur : 'AUD', card: c0 ? c0.name : '', desc: '', cat: '', catAuto: true, date: UI.tab === 'nk' && UI.sub === 'cal' ? UI.sel : CORE.today(), time: hhmm(), note: '', vndActual: '', balance: '', toCard: '', recv: '', recvCur: '', fee: '' }, over || {});
  F = TX; openLayer('tx', txSheet);
}
function editTx(id) {
  const t = S.txns.find((x) => x.id === id); if (!t) return;
  openTx({ id: t.id, type: t.type, amount: String(t.amount), cur: t.cur, card: t.card, desc: t.desc, cat: t.cat, catAuto: false, date: t.date, time: t.time, note: t.note, vndActual: t.vndActual || '', balance: t.balance === undefined ? '' : t.balance, link: t.link, rec: t.rec });
}
function freqCats(type) {
  const since = CORE.addDays(CORE.today(), -120), cnt = {};
  S.txns.forEach((t) => { if (t.type === type && t.date >= since && t.cat) cnt[t.cat] = (cnt[t.cat] || 0) + 1; });
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 7);
}
function catChips() {
  const isThu = TX.type === 'Thu';
  const groups = C_GROUPS().filter((g) => (g === 'THU NHẬP') === isThu);
  const chip = (c) => `<button class="chip sm ${TX.cat === c ? 'on' : ''}" data-a="txcat" data-c="${esc(c)}">${esc(c)}</button>`;
  const fq = freqCats(TX.type);
  let h = fq.length ? `<div class="cgroup">Hay dùng</div><div class="chips">${fq.map(chip).join('')}</div>` : '';
  groups.forEach((g) => { h += `<div class="cgroup">${g.toLowerCase()}</div><div class="chips">${S.cats.filter((c) => c.group === g).map((c) => chip(c.name)).join('')}</div>`; });
  return h;
}
const C_GROUPS = () => CORE.GROUPS.filter((g) => S.cats.some((c) => c.group === g));
function cardChips(key, selected) {
  const mk = (grp) => { const l = S.cards.filter((c) => c.group === grp); return l.length ? `<div class="cgroup">${grp === 'Úc' ? 'Ngân hàng / tiền mặt Úc' : 'Ngân hàng / tiền mặt Việt Nam'}</div><div class="chips">${l.map((c) => `<button class="chip ${selected === c.name ? 'on' : ''}" data-a="${key}" data-n="${esc(c.name)}">${esc(c.name)} <small style="color:inherit;opacity:.7">${c.cur}</small></button>`).join('')}</div>` : ''; };
  return mk('Úc') + mk('Việt Nam');
}
function curPills(k) { return `<div class="seg" style="width:130px;flex:none">${['AUD', 'VND'].map((c) => `<button data-a="fset" data-k="${k}" data-v="${c}" class="${F[k] === c ? 'on' : ''}">${c}</button>`).join('')}</div>`; }
function amtPreview() {
  const n = parseNum(TX.amount, TX.cur); if (!n) return '';
  const o = TX.cur === 'AUD' ? 'VND' : 'AUD', r = CTX.rate(TX.date);
  return '≈ ' + M(CORE.convert({ amount: n, cur: TX.cur }, o, r), o) + ' (1 AUD = ' + Math.round(r).toLocaleString('vi-VN') + ' ₫)';
}
function txSheet() {
  const T = TX, card = S.cards.find((c) => c.name === T.card);
  const isNew = !T.id;
  let body = `<div class="seg r" style="margin-bottom:12px">${[['Chi', 'Chi', 'chi'], ['Thu', 'Thu', 'thu'], ['Chuyển', 'Chuyển', '']].map(([v, l, c]) => `<button data-a="txtype" data-v="${v}" class="${T.type === v ? 'on ' + c : ''}">${l}</button>`).join('')}</div>`;
  if (T.type === 'Chuyển') {
    const to = S.cards.find((c) => c.name === T.toCard);
    const rc = T.recvCur || (to ? to.cur : T.cur);
    const est = (() => { const n = parseNum(T.amount, T.cur); if (!n || !to) return ''; if (rc === T.cur) return String(n); return String(Math.round(CORE.convert({ amount: n, cur: T.cur }, rc, CTX.rate(T.date)) * 100) / 100); })();
    body += fld('Từ thẻ / tiền mặt', cardChips('txcard', T.card)) + fld('Số tiền chuyển đi', `<div class="amt">${inp('amount', { mode: 'decimal', ph: '0' })}${curPills('cur')}</div><small id="prev">${amtPreview()}</small>`)
      + fld('Đến thẻ / tiền mặt', cardChips('txto', T.toCard))
      + fld('Số tiền nhận (để trống = tự quy đổi)', `<div class="amt">${inp('recv', { mode: 'decimal', ph: est })}${curPills('recvCur').replace(/data-v="(AUD|VND)" class="[^"]*"/g, (m, c) => `data-v="${c}" class="${rc === c ? 'on' : ''}"`)}</div>`)
      + fld('Phí chuyển (tùy chọn, ghi vào Phát sinh)', inp('fee', { mode: 'decimal', ph: '0' }))
      + `<div class="row2">${fld('Ngày', inp('date', { type: 'date' }))}${fld('Giờ', inp('time', { type: 'time' }))}</div>` + fld('Ghi chú', inp('note'))
      + `<small>Chuyển tiền / rút tiền mặt không tính vào thu hay chi, cả hai phía.</small>`;
  } else {
    body += fld('Số tiền', `<div class="amt">${inp('amount', { mode: 'decimal', ph: '0' })}${curPills('cur')}</div><small id="prev">${amtPreview()}</small>`)
      + fld('Thẻ / tài khoản', cardChips('txcard', T.card))
      + fld('Nội dung / cửa hàng', inp('desc', { ph: 'vd. Coles, Uber, Lương…' }))
      + fld('Danh mục', `<div id="cats">${catChips()}</div>`)
      + `<div class="row2">${fld('Ngày', inp('date', { type: 'date' }))}${fld('Giờ', inp('time', { type: 'time' }))}</div>`
      + fld('Ghi chú', inp('note'));
    if (card && (T.cur !== card.cur || card.group === 'Việt Nam' && T.cur === 'AUD')) body += fld('VND thực tế bị trừ (nếu biết)', inp('vndActual', { mode: 'numeric', ph: 'để trống = theo tỷ giá tháng' }));
    if (card && card.kind !== 'Tiền mặt') body += fld(card.kind === 'Credit' ? 'Hạn mức còn lại sau giao dịch (tùy chọn)' : 'Số dư sau giao dịch (tùy chọn)', inp('balance', { mode: 'decimal' }));
  }
  const foot = (isNew ? `<button class="btn sec" data-a="txsave" data-again="1">Lưu & thêm tiếp</button>` : (T.link ? '' : `<button class="btn danger" data-a="txdel">Xóa</button>`)) + `<button class="btn" data-a="txsave">${isNew ? 'Lưu' : 'Cập nhật'}</button>`;
  return sheet('tx', isNew ? 'Thêm giao dịch' : 'Sửa giao dịch', body, foot, { full: true, right: !isNew && T.link ? `<button class="hbtn" style="color:var(--chi)" data-a="txdel">${ico('trash', 20)}</button>` : '' });
}
function refreshCats() { const e = $('#cats'); if (e) e.innerHTML = catChips(); }
function refreshPrev() { const e = $('#prev'); if (e) e.textContent = amtPreview(); }
function autoCat() {
  if (TX.type === 'Chuyển' || !TX.catAuto) return;
  const m = CORE.matchRule(S.rules, TX.desc);
  if (m && S.cats.some((c) => c.name === m.cat)) { TX.cat = m.cat; refreshCats(); }
}
function saveTx(again) {
  const T = TX, amt = parseNum(T.amount, T.cur);
  if (!amt) return toast('Nhập số tiền');
  if (!T.card) return toast('Chọn thẻ / tài khoản');
  if (!T.date) return toast('Chọn ngày');
  if (T.type === 'Chuyển') {
    if (!T.toCard) return toast('Chọn thẻ nhận');
    if (T.toCard === T.card) return toast('Thẻ gửi và nhận phải khác nhau');
    const to = S.cards.find((c) => c.name === T.toCard), rc = T.recvCur || to.cur;
    const recv = parseNum(T.recv, rc) || (rc === T.cur ? amt : Math.round(CORE.convert({ amount: amt, cur: T.cur }, rc, CTX.rate(T.date)) * 100) / 100);
    const link = uid(), base = { date: T.date, time: T.time, note: T.note, link };
    S.txns.push(normTxn(Object.assign({}, base, { card: T.card, desc: 'Chuyển → ' + T.toCard, cat: CORE.CAT_TRANSFER_MONEY, type: 'Chi', amount: amt, cur: T.cur })));
    S.txns.push(normTxn(Object.assign({}, base, { card: T.toCard, desc: 'Chuyển từ ' + T.card, cat: CORE.CAT_TRANSFER_MONEY, type: 'Thu', amount: recv, cur: rc })));
    const fee = parseNum(T.fee, T.cur);
    if (fee) S.txns.push(normTxn(Object.assign({}, base, { card: T.card, desc: 'Phí chuyển', cat: CORE.CAT_FEE, type: 'Chi', amount: fee, cur: T.cur })));
  } else {
    if (!T.cat) return toast('Chọn danh mục');
    const obj = normTxn({ id: T.id, date: T.date, time: T.time, card: T.card, desc: T.desc, cat: T.cat, type: T.type, amount: amt, cur: T.cur, note: T.note, balance: T.balance, vndActual: parseNum(T.vndActual, 'VND') || 0, link: T.link, rec: T.rec });
    if (T.id) { const i = S.txns.findIndex((x) => x.id === T.id); if (i >= 0) { syncForget(S.txns[i]); S.txns[i] = obj; } } else S.txns.push(obj);
    if (S.settings.autoLearn && T.desc) {
      const m = CORE.matchRule(S.rules, T.desc), key = CORE.ruleKeyFrom(T.desc);
      if (!m && key.length >= 3) S.rules.push({ kw: key, cat: T.cat });
      else if (m && m.cat !== T.cat && CORE.norm(m.kw) === key) m.cat = T.cat;
    }
  }
  save();
  if (again) { const keep = { card: T.card, cur: T.cur, date: T.date, type: T.type }; closeLayer('tx'); render(); openTx(keep); toast('Đã lưu — nhập tiếp'); }
  else { closeLayer('tx'); UI.sel = T.date; if (T.date.slice(0, 7) !== UI.m && UI.tab !== 'st') UI.m = T.date.slice(0, 7); render(); toast('Đã lưu'); }
}
function delTx() {
  const t = S.txns.find((x) => x.id === TX.id); if (!t) return;
  const n = t.link ? S.txns.filter((x) => x.link === t.link).length : 1;
  ask(n > 1 ? 'Xóa giao dịch chuyển tiền này (' + n + ' dòng liên quan)?' : 'Xóa giao dịch này?', 'Xóa', () => {
    S.txns.filter((x) => t.link ? x.link === t.link : x.id === t.id).forEach(syncForget);
    S.txns = S.txns.filter((x) => t.link ? x.link !== t.link : x.id !== t.id); save(); closeLayer('tx'); render(); toast('Đã xóa');
  }, true);
}

// ================= BỘ LỌC / DANH SÁCH THEO DANH MỤC / CHI TIẾT THẺ =================
function filterSheet() {
  const body = `<div class="cgroup">Chỉ hiện các thẻ (bỏ trống = tất cả)</div><div class="chips">${S.cards.map((c) => `<button class="chip ${UI.fcards.includes(c.name) ? 'on' : ''}" data-a="fcard" data-n="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>`;
  return sheet('filter', 'Lọc theo thẻ', body, `<button class="btn sec" data-a="fclear">Bỏ lọc</button><button class="btn" data-a="close" data-id="filter">Xong</button>`);
}
function catListSheet() {
  const [from, to] = statPeriod(), type = UI.stat === 'thu' ? 'Thu' : 'Chi', c = PAGE.cat;
  const list = CORE.inRange(S.txns, from, to).filter((t) => t.type === type && (!c || t.cat === c) && (UI.scope === 'all' || CTX.group(t) === UI.scope) && CTX.catKind(t) !== 'transfer' && (type === 'Thu' || CTX.catKind(t) !== 'save')).sort(sortTx);
  return sheet('catlist', esc(c || 'Khác'), `<div class="card">${list.map(txRow).join('') || '<div class="empty">Trống</div>'}</div>`, null, { full: true });
}
function lineChart(vals, labels, cur) {
  const W = 320, H = 120, p = 22, mx = Math.max(1, ...vals), step = (W - 2 * p) / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => [p + i * step, H - 26 - (H - 56) * v / mx]);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><polyline fill="none" stroke="var(--brand)" stroke-width="2.5" points="${pts.map((x) => x.join(',')).join(' ')}"/>${pts.map((x, i) => `<circle cx="${x[0]}" cy="${x[1]}" r="3.5" fill="var(--card)" stroke="var(--brand)" stroke-width="2"/><text x="${x[0]}" y="${x[1] - 8}" font-size="9" text-anchor="middle" fill="var(--muted)">${vals[i] ? M(vals[i], cur, { compact: true, noSym: true }) : ''}</text><text x="${x[0]}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--muted)">${labels[i]}</text>`).join('')}</svg>`;
}
function cardViewSheet() {
  const c = S.cards.find((x) => x.name === PAGE.name); if (!c) return '';
  const months = []; for (let i = 7; i >= 0; i--) months.push(shiftMonth(UI.m, -i));
  const spend = (mk) => S.txns.filter((t) => t.card === c.name && t.type === 'Chi' && t.date.startsWith(mk)).reduce((s, t) => s + CORE.convert(t, c.cur, CTX.rate(t.date)), 0);
  const vals = months.map(spend);
  const tx = S.txns.filter((t) => t.card === c.name && t.date.startsWith(UI.m) && t.type === 'Chi');
  const B = CORE.catBreakdown(CTX, S.txns.filter((t) => t.card === c.name && t.date.startsWith(UI.m)), { type: 'Chi', scope: 'all', disp: c.cur, withSave: true });
  const info = cardInfo(c);
  const body = `<div class="card pad"><div class="kv"><span>Loại</span><b>${c.kind} · ${c.cur} · ${c.group === 'Úc' ? 'Úc' : 'Việt Nam'}</b></div>
    ${c.kind === 'Tiền mặt' || c.open ? `<div class="kv"><span>Số dư</span><b>${M(info.bal, c.cur)}</b></div>` : ''}
    ${info.lastBal ? `<div class="kv"><span>${c.kind === 'Credit' ? 'Hạn mức còn lại' : 'Số dư'} báo gần nhất (${fdm(info.lastBal.date)})</span><b>${M(info.lastBal.v, c.cur)}</b></div>` : ''}
    <div class="kv"><span>Chi ${MONTHS[+UI.m.slice(5) - 1]}</span><b class="chi">${M(vals[7], c.cur)} · ${tx.length} lần</b></div></div>
    <div class="sect">Chi theo tháng (${c.cur})</div><div class="card pad">${lineChart(vals, months.map((m) => +m.slice(5)), c.cur)}</div>
    <div class="sect">Danh mục ${MONTHS[+UI.m.slice(5) - 1]}</div><div class="card list">${B.list.map((x, i) => `<div class="li"><span class="badge" style="background:${PAL[i % PAL.length]}">${Math.round(x.pct * 100)}%</span><span class="sp">${esc(x.cat)}</span><b class="num">${M(x.value, c.cur)}</b></div>`).join('') || '<div class="empty" style="padding:16px">Chưa có chi tiêu.</div>'}</div>`;
  return sheet('cardview', esc(c.name), body, `<button class="btn sec" data-a="cardedit" data-n="${esc(c.name)}">Sửa thẻ</button><button class="btn" data-a="cardtx" data-n="${esc(c.name)}">Xem giao dịch</button>`, { full: true });
}

// ================= FORM: THẺ / ĐỊNH KỲ / NGÂN SÁCH / DANH MỤC / QUY TẮC / TỶ GIÁ =================
function openCardForm(name) {
  const c = S.cards.find((x) => x.name === name);
  F = c ? Object.assign({ _old: c.name }, c) : { _old: '', name: '', bank: '', kind: 'Debit', cur: 'AUD', group: 'Úc', keys: '', open: 0 };
  openLayer('cardform', cardFormSheet);
}
function cardFormSheet() {
  const body = fld('Tên thẻ / tài khoản', inp('name', { ph: 'vd. CommBank Debit' })) + fld('Ngân hàng', inp('bank'))
    + fld('Loại', segF('kind', [['Debit', 'Debit'], ['Credit', 'Credit'], ['Tiền mặt', 'Tiền mặt']]))
    + fld('Tiền tệ chính', segF('cur', [['AUD', 'AUD'], ['VND', 'VND']]))
    + fld('Nhóm (theo ngân hàng)', segF('group', [['Úc', 'Úc'], ['Việt Nam', 'Việt Nam']]))
    + fld('Số dư ban đầu (tùy chọn, ' + F.cur + ')', inp('open', { mode: 'decimal' }))
    + fld('Từ khóa nhận dạng trong tin nhắn (tùy chọn)', inp('keys', { ph: 'vd. 4 số cuối thẻ' }))
    + `<small>Nhóm Úc / Việt Nam quyết định giao dịch tính vào bên nào, dù giao dịch bằng AUD hay VND (ví dụ thẻ ACB quẹt ở Úc bằng AUD vẫn thuộc Việt Nam). Credit chỉ theo dõi, không trừ vào Còn lại.</small>`;
  return sheet('cardform', F._old ? 'Sửa thẻ' : 'Thêm thẻ', body, (F._old ? `<button class="btn danger" data-a="carddel">Xóa</button>` : '') + `<button class="btn" data-a="cardsave">Lưu</button>`);
}
function saveCard() {
  const name = (F.name || '').trim(); if (!name) return toast('Nhập tên thẻ');
  if (name !== F._old && S.cards.some((c) => c.name === name)) return toast('Tên thẻ đã có');
  const obj = { name, bank: F.bank || '', kind: F.kind, cur: F.cur, group: F.group, keys: F.keys || '', open: parseNum(F.open, F.cur) };
  if (F._old) {
    const i = S.cards.findIndex((c) => c.name === F._old); S.cards[i] = obj;
    if (F._old !== name) { S.txns.forEach((t) => { if (t.card === F._old) { syncForget(t); t.card = name; } }); S.recs.forEach((r) => { if (r.card === F._old) r.card = name; }); UI.fcards = UI.fcards.map((x) => x === F._old ? name : x); }
  } else S.cards.push(obj);
  save(); closeLayer('cardform'); closeLayer('cardview'); render(); toast('Đã lưu thẻ');
}
function delCard() {
  const n = S.txns.filter((t) => t.card === F._old).length;
  if (n) return toast('Thẻ đang có ' + n + ' giao dịch — không thể xóa');
  ask('Xóa thẻ "' + F._old + '"?', 'Xóa', () => { S.cards = S.cards.filter((c) => c.name !== F._old); save(); closeLayer('cardform'); closeLayer('cardview'); render(); }, true);
}

function openRecForm(id) {
  const r = S.recs.find((x) => x.id === id);
  F = r ? Object.assign({}, r, { amount: String(r.amount) }) : { id: '', name: '', type: 'Chi', amount: '', cur: 'AUD', card: S.cards[0] ? S.cards[0].name : '', cat: '', cycle: 'month', day: 1, start: CORE.today(), last: '', on: true };
  openLayer('recform', recFormSheet);
}
function recFormSheet() {
  const cats = S.cats.filter((c) => (F.type === 'Thu') === (c.group === 'THU NHẬP')).map((c) => [c.name, c.name]);
  if (!cats.some((c) => c[0] === F.cat)) F.cat = cats[0] ? cats[0][0] : '';
  const dayInput = F.cycle === 'week' ? selF('day', [[1, 'Thứ Hai'], [2, 'Thứ Ba'], [3, 'Thứ Tư'], [4, 'Thứ Năm'], [5, 'Thứ Sáu'], [6, 'Thứ Bảy'], [0, 'Chủ Nhật']]) : inp('day', { mode: 'numeric', ph: '1–31' });
  const body = fld('Tên (nội dung)', inp('name', { ph: 'vd. Netflix, tiền thuê nhà' })) + fld('Loại', segF('type', [['Chi', 'Chi'], ['Thu', 'Thu']]))
    + fld('Số tiền', `<div class="amt">${inp('amount', { mode: 'decimal' })}${curPills('cur')}</div>`)
    + fld('Thẻ', selF('card', S.cards.map((c) => [c.name, c.name]))) + fld('Danh mục', selF('cat', cats))
    + fld('Chu kỳ', segF('cycle', [['month', 'Hàng tháng'], ['week', 'Hàng tuần']])) + fld(F.cycle === 'week' ? 'Thứ' : 'Ngày trong tháng', dayInput)
    + fld('Bắt đầu từ ngày', inp('start', { type: 'date' }))
    + `<div class="kv"><span>Đã ghi gần nhất</span><b>${F.last || '—'}</b></div>`
    + `<button class="li" style="border-radius:12px;margin-top:10px" data-a="fset" data-k="on" data-v="${F.on ? '' : '1'}"><span class="sp"><b>Đang bật</b></span><span class="switch ${F.on ? 'on' : ''}"></span></button>`
    + `<small style="display:block;margin-top:8px">Mở app, các khoản đến hạn sẽ tự được ghi (kể cả những ngày app đóng). Dùng cho khoản tự trừ không có thông báo.</small>`;
  return sheet('recform', F.id ? 'Sửa định kỳ' : 'Thêm định kỳ', body, (F.id ? `<button class="btn danger" data-a="recdel">Xóa</button>` : '') + `<button class="btn" data-a="recsave">Lưu</button>`);
}
function saveRec() {
  if (!(F.name || '').trim()) return toast('Nhập tên'); const amt = parseNum(F.amount, F.cur); if (!amt) return toast('Nhập số tiền');
  const obj = { id: F.id || uid(), name: F.name.trim(), type: F.type, amount: amt, cur: F.cur, card: F.card, cat: F.cat, cycle: F.cycle, day: Number(F.day) || (F.cycle === 'week' ? 1 : 1), start: F.start, last: F.last || '', on: !!F.on };
  const i = S.recs.findIndex((r) => r.id === obj.id); if (i >= 0) S.recs[i] = obj; else S.recs.push(obj);
  const n = runRecurring(); save(); closeLayer('recform'); render(); toast(n ? 'Đã lưu · tự ghi ' + n + ' khoản đến hạn' : 'Đã lưu');
}

function openBudgetForm(id) {
  const b = S.budgets.find((x) => x.id === id);
  F = b ? Object.assign({}, b, { amount: String(b.amount) }) : { id: '', scope: 'Úc', cat: '*', amount: '' };
  openLayer('budgetform', budgetFormSheet);
}
function budgetFormSheet() {
  const cats = [['*', 'Tổng chi (cố định + biến đổi)']].concat(S.cats.filter((c) => c.group === 'CHI PHÍ CỐ ĐỊNH' || c.group === 'CHI PHÍ BIẾN ĐỔI').map((c) => [c.name, c.name]));
  const cur = F.scope === 'Việt Nam' ? 'VND' : 'AUD';
  return sheet('budgetform', F.id ? 'Sửa ngân sách' : 'Thêm ngân sách', fld('Bên', segF('scope', [['Úc', 'Úc (AUD)'], ['Việt Nam', 'Việt Nam (VND)']])) + fld('Danh mục', selF('cat', cats)) + fld('Hạn mức mỗi tháng (' + cur + ')', inp('amount', { mode: 'decimal' })),
    (F.id ? `<button class="btn danger" data-a="budgetdel">Xóa</button>` : '') + `<button class="btn" data-a="budgetsave">Lưu</button>`);
}
function saveBudget() {
  const amt = parseNum(F.amount, F.scope === 'Việt Nam' ? 'VND' : 'AUD'); if (!amt) return toast('Nhập hạn mức');
  const obj = { id: F.id || uid(), scope: F.scope, cat: F.cat, amount: amt };
  const i = S.budgets.findIndex((b) => b.id === obj.id); if (i >= 0) S.budgets[i] = obj; else S.budgets.push(obj);
  save(); closeLayer('budgetform'); render(); toast('Đã lưu ngân sách');
}

function openSimpleForm(id, init, builder) { F = init; openLayer(id, builder); }
const ruleForm = () => sheet('ruleform', 'Thêm quy tắc', fld('Từ khóa (có trong tên cửa hàng)', inp('kw', { ph: 'vd. COLES' })) + fld('Danh mục', selF('cat', S.cats.filter((c) => c.group !== 'THU NHẬP').map((c) => [c.name, c.name]))), `<button class="btn" data-a="rulesave">Lưu</button>`);
const catForm = () => sheet('catform', 'Thêm danh mục', fld('Nhóm', selF('group', C_GROUPS().map((g) => [g, g]))) + fld('Tên danh mục', inp('name')), `<button class="btn" data-a="catsave">Lưu</button>`);
const rateForm = () => sheet('rateform', 'Tỷ giá ' + monthLabel(F.m), fld('1 AUD = … VND (để trống để dùng tự động)', inp('v', { mode: 'decimal' })) + `<small>Nhập tay sẽ ghi đè tỷ giá tự động / từ Excel cho tháng này.</small>`, `<button class="btn" data-a="ratesave">Lưu</button>`);

// ================= TRANG CÀI ĐẶT =================
function pageSheet() {
  const p = PAGE.id;
  const back = (t, body, foot) => sheet('page', t, body, foot, { full: true });
  const li = (a, d, label, sub, right) => `<button class="li" data-a="${a}" data-id="${esc(d)}"><span class="sp"><b>${label}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</span>${right || `<span class="chev">${ico('right', 18)}</span>`}</button>`;
  if (p === 'rates') {
    const months = [...new Set(S.txns.map((t) => t.date.slice(0, 7)).concat([CORE.today().slice(0, 7)]))].sort().reverse();
    return back('Tỷ giá AUD → VND', `<div class="card pad"><div class="kv"><span>Tỷ giá hiện tại</span><b>1 AUD = ${Math.round(S.rateNow).toLocaleString('vi-VN')} ₫</b></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" data-a="ratefetch">Cập nhật tự động</button><input class="inp" id="ratenow" inputmode="decimal" placeholder="nhập tay" style="flex:1"><button class="btn sm sec" data-a="ratenowset">Đặt</button></div>
      <small style="display:block;margin-top:8px">Mỗi khoản được quy đổi theo tỷ giá của tháng giao dịch: nhập tay &gt; trung bình các lần cập nhật tự động trong tháng &gt; giá trị từ Excel &gt; tỷ giá hiện tại.</small></div>
      <div class="sect">Theo tháng</div><div class="card list">${months.map((m) => li('ratem', m, monthLabel(m), CORE.rateSource(S, m), `<b class="num">${Math.round(CTX.rate(m + '-15')).toLocaleString('vi-VN')}</b>`)).join('')}</div>`);
  }
  if (p === 'cards') return back('Thẻ & tài khoản', `<div class="card list">${S.cards.map((c) => li('cardedit', c.name, esc(c.name), `${esc(c.bank)} · ${c.kind} · ${c.cur} · ${c.group}`)).join('')}</div>`, `<button class="btn" data-a="cardnew">+ Thêm thẻ</button>`);
  if (p === 'cats') return back('Danh mục', C_GROUPS().map((g) => `<div class="sect">${g}</div><div class="card list">${S.cats.filter((c) => c.group === g).map((c) => { const used = S.txns.some((t) => t.cat === c.name); return `<div class="li"><span class="sp"><b>${esc(c.name)}</b><span class="sub">${esc(c.desc || '')}</span></span>${used ? '' : `<button class="btn sm danger" data-a="catdel" data-id="${esc(c.name)}">Xóa</button>`}</div>`; }).join('')}</div>`).join(''), `<button class="btn" data-a="catnew">+ Thêm danh mục</button>`);
  if (p === 'rules') return back('Quy tắc tự phân loại', `<small style="display:block;margin-bottom:8px">Từ khóa dài nhất khớp thắng (COSTCO RINGWOOD thắng COSTCO). App tự học thêm khi bạn lưu giao dịch.</small><div class="card list">${[...S.rules].sort((a, b) => a.kw.localeCompare(b.kw)).map((r) => `<div class="li"><span class="sp"><b>${esc(r.kw)}</b><span class="sub">→ ${esc(r.cat)}</span></span><button class="btn sm danger" data-a="ruledel" data-id="${esc(r.kw)}">Xóa</button></div>`).join('') || '<div class="empty">Chưa có quy tắc.</div>'}</div>`, `<button class="btn" data-a="rulenew">+ Thêm quy tắc</button>`);
  if (p === 'recs') return back('Giao dịch định kỳ', `<div class="card list">${S.recs.map((r) => li('recedit', r.id, esc(r.name) + (r.on ? '' : ' (tắt)'), `${r.type} ${M(r.amount, r.cur)} · ${r.cycle === 'week' ? CORE.DAY_FULL[r.day] : 'ngày ' + r.day + ' hàng tháng'} · ${esc(r.card)}`)).join('') || '<div class="empty">Chưa có khoản định kỳ.<br>Dùng cho khoản tự trừ không có thông báo (vd. bảo hiểm, tiền thuê nhà).</div>'}</div>`, `<button class="btn" data-a="recnew">+ Thêm định kỳ</button>`);
  if (p === 'budgets') return back('Ngân sách', `<div class="card list">${S.budgets.map((b) => li('budget', b.id, (b.cat === '*' ? 'Tổng chi' : esc(b.cat)) + ' · ' + b.scope, M(b.amount, b.scope === 'Việt Nam' ? 'VND' : 'AUD') + ' / tháng')).join('') || '<div class="empty">Chưa có ngân sách.</div>'}</div>`, `<button class="btn" data-a="budgetnew">+ Thêm ngân sách</button>`);
  if (p === 'data') {
    const lb = S.settings.lastBackup ? new Date(S.settings.lastBackup).toLocaleString('vi-VN') : 'chưa bao giờ';
    return back('Sao lưu & dữ liệu', `<div class="card pad"><div class="kv"><span>Giao dịch</span><b>${S.txns.length}</b></div><div class="kv"><span>Sao lưu gần nhất</span><b>${lb}</b></div>
      <small style="display:block;margin-top:6px">Dữ liệu nằm trong máy bạn (không gửi đi đâu). Hãy sao lưu định kỳ, nhất là trước khi xóa app khỏi màn hình hoặc đổi điện thoại.</small></div>
      <div class="card list"><button class="li" data-a="exportjson"><span class="sp"><b>Sao lưu toàn bộ (.json)</b><span class="sub">Lưu vào Tệp / AirDrop / email cho chính bạn</span></span></button>
      <button class="li" data-a="exportcsv"><span class="sp"><b>Xuất giao dịch (.csv)</b><span class="sub">Cùng cột với sheet GiaoDich, dán thẳng vào Google Sheets</span></span></button>
      <button class="li" data-a="copyjson"><span class="sp"><b>Sao chép bản sao lưu vào clipboard</b></span></button></div>
      <div class="sect">Nhập dữ liệu (gộp, bỏ giao dịch trùng)</div>
      <div class="card pad"><input type="file" id="file" accept=".json,.csv,application/json,text/csv" style="width:100%;margin-bottom:10px"><textarea id="paste" class="inp" rows="3" placeholder="…hoặc dán nội dung JSON / CSV vào đây"></textarea><button class="btn" style="margin-top:8px;width:100%" data-a="import">Nhập</button></div>
      <button class="btn danger" style="width:100%;margin-top:12px" data-a="wipe">Xóa toàn bộ dữ liệu</button>`);
  }
  if (p === 'sync') {
    const y = S.sync || {}, un = S.txns.filter((t) => !t.sy).length;
    const st = y.status ? `${esc(y.status)}${y.statusAt ? ' · ' + new Date(y.statusAt).toLocaleString('vi-VN') : ''}` : 'Chưa đồng bộ lần nào';
    return back('Đồng bộ Google Sheet', `<div class="card pad"><div class="kv"><span>Trạng thái</span><b style="text-align:right;max-width:65%">${st}</b></div><div class="kv"><span>Chờ gửi lên sheet</span><b>${un}</b></div>
      <small style="display:block;margin-top:6px">App kéo mọi dòng trong sheet GiaoDich (kể cả khoản Phím tắt ghi từ thông báo ngân hàng) và gửi giao dịch nhập tay lên cuối sheet. Chỉ thêm dòng mới; sửa/xóa trong app không đổi dòng đã có trong sheet.</small></div>
      <div class="sect">Kết nối</div><div class="card pad">
      <div class="field"><label>Địa chỉ ứng dụng web (Apps Script)</label><input class="inp" id="syurl" value="${esc(y.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <div class="field" style="margin-top:8px"><label>Mật khẩu (TOKEN trong Code.gs)</label><input class="inp" id="sytoken" value="${esc(y.token || '')}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <button class="btn" style="width:100%;margin-top:10px" data-a="sysave">Lưu & đồng bộ ngay</button></div>
      <div class="card list"><button class="li" data-a="sytoggle"><span class="sp"><b>Tự động đồng bộ</b><span class="sub">Khi mở app và sau mỗi lần lưu</span></span><span class="switch ${y.auto ? 'on' : ''}"></span></button>
      <button class="li" data-a="synow"><span class="sp"><b>Đồng bộ ngay</b></span></button></div>
      ${y.url ? '<button class="btn danger" style="width:100%;margin-top:12px" data-a="syoff">Ngắt kết nối</button>' : ''}`);
  }
  if (p === 'help') return back('Cài lên màn hình iPhone', `<div class="card pad" style="line-height:1.6"><b>iPhone (Safari):</b><br>1. Mở địa chỉ web của app bằng <b>Safari</b>.<br>2. Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên).<br>3. Chọn <b>Thêm vào Màn hình chính</b> → Thêm.<br>Mở từ biểu tượng mới: app chạy toàn màn hình, dùng được cả khi không có mạng.<br><br><b>Android (Chrome):</b> menu ⋮ → Cài đặt ứng dụng.<br><br><b>Mẹo nhập nhanh:</b> bấm + → gõ số tiền → chạm thẻ → gõ tên cửa hàng, danh mục tự điền theo quy tắc.</div>`);
  return '';
}
function openPage(id) { PAGE = { id }; openLayer('page', pageSheet); }

// ================= SỰ KIỆN =================
function act(a, el) {
  const v = el.dataset.v, d = el.dataset;
  switch (a) {
    case 'tab': UI.tab = v; render(); break;
    case 'sub': UI.sub = v; if (v === 'week' && !UI.wk) UI.wk = CORE.weekStart(CORE.today(), S.settings.weekStart); render(); break;
    case 'stat': UI.stat = v; render(); break;
    case 'scope': UI.scope = v; render(); break;
    case 'range': UI.range = v; render(); break;
    case 'disp': S.settings.disp = v; save(); render(); break;
    case 'wstart': S.settings.weekStart = +v; UI.wk = CORE.weekStart(UI.wk || CORE.today(), +v); save(); render(); break;
    case 'toggle': S.settings[v] = !S.settings[v]; save(); render(); break;
    case 'prev': case 'next': {
      const n = a === 'next' ? 1 : -1;
      if (UI.tab === 'nk' && UI.sub === 'week') UI.wk = CORE.addDays(UI.wk, 7 * n);
      else if ((UI.tab === 'nk' && UI.sub === 'month') || (UI.tab === 'st' && UI.range === 'year')) { UI.yr += n; UI.m = UI.yr + UI.m.slice(4); }
      else { UI.m = shiftMonth(UI.m, n); UI.yr = +UI.m.slice(0, 4); }
      render(); break;
    }
    case 'today': UI.m = CORE.today().slice(0, 7); UI.yr = +UI.m.slice(0, 4); UI.wk = CORE.weekStart(CORE.today(), S.settings.weekStart); UI.sel = CORE.today(); render(); break;
    case 'search': UI.searchOn = !UI.searchOn; if (!UI.searchOn) UI.q = ''; render(); if (UI.searchOn) { const q = $('#q'); q && q.focus(); } break;
    case 'filter': openLayer('filter', filterSheet); break;
    case 'fcard': { const i = UI.fcards.indexOf(d.n); if (i >= 0) UI.fcards.splice(i, 1); else UI.fcards.push(d.n); render(); break; }
    case 'fclear': UI.fcards = []; render(); break;
    case 'calday': UI.sel = d.d; render(); break;
    case 'openmonth': UI.m = d.m; UI.sub = 'day'; render(); $('#main').scrollTop = 0; break;
    case 'edit': editTx(d.id); break;
    case 'fab': openTx(); break;
    case 'txtype': TX.type = v; if (v === 'Chuyển') { TX.cat = ''; } else if (TX.cat) { const c = S.cats.find((x) => x.name === TX.cat); if (!c || (v === 'Thu') !== (c.group === 'THU NHẬP')) TX.cat = ''; } drawLayer(); break;
    case 'txcard': { TX.card = d.n; const c = S.cards.find((x) => x.name === d.n); if (c) TX.cur = c.cur; drawLayer(); break; }
    case 'txto': { TX.toCard = d.n; const c = S.cards.find((x) => x.name === d.n); if (c) TX.recvCur = c.cur; drawLayer(); break; }
    case 'txcat': TX.cat = d.c; TX.catAuto = false; refreshCats(); break;
    case 'txsave': saveTx(!!d.again); break;
    case 'txdel': delTx(); break;
    case 'fset': { F[d.k] = d.v === '' ? '' : (d.v === '1' ? true : d.v); if (d.v === '') F[d.k] = false; if (d.k === 'cur' || d.k === 'recvCur') { /* giữ nguyên */ } drawLayer(); break; }
    case 'catlist': PAGE = { id: 'catlist', cat: d.c }; openLayer('catlist', catListSheet); break;
    case 'cardview': PAGE = { id: 'cardview', name: d.n }; openLayer('cardview', cardViewSheet); break;
    case 'cardtx': UI.fcards = [d.n]; UI.tab = 'nk'; UI.sub = 'day'; LAYER = []; drawLayer(); render(); break;
    case 'cardnew': openCardForm(''); break;
    case 'cardedit': openCardForm(d.n || d.id); break;
    case 'cardsave': saveCard(); break;
    case 'carddel': delCard(); break;
    case 'recnew': openRecForm(''); break;
    case 'recedit': openRecForm(d.id); break;
    case 'recsave': saveRec(); break;
    case 'recdel': ask('Xóa khoản định kỳ này? (các giao dịch đã ghi vẫn giữ)', 'Xóa', () => { S.recs = S.recs.filter((r) => r.id !== F.id); save(); closeLayer('recform'); render(); }, true); break;
    case 'budget': openBudgetForm(d.id); break;
    case 'budgetnew': openBudgetForm(''); break;
    case 'budgetsave': saveBudget(); break;
    case 'budgetdel': S.budgets = S.budgets.filter((b) => b.id !== F.id); save(); closeLayer('budgetform'); render(); break;
    case 'rulenew': openSimpleForm('ruleform', { kw: '', cat: 'Ăn ngoài' }, ruleForm); break;
    case 'rulesave': { const kw = (F.kw || '').trim(); if (!kw) return toast('Nhập từ khóa'); S.rules = S.rules.filter((r) => r.kw.toUpperCase() !== kw.toUpperCase()); S.rules.push({ kw, cat: F.cat }); save(); closeLayer('ruleform'); render(); break; }
    case 'ruledel': S.rules = S.rules.filter((r) => r.kw !== d.id); save(); render(); break;
    case 'catnew': openSimpleForm('catform', { group: 'CHI PHÍ BIẾN ĐỔI', name: '' }, catForm); break;
    case 'catsave': { const n = (F.name || '').trim(); if (!n) return toast('Nhập tên'); if (S.cats.some((c) => c.name === n)) return toast('Đã có danh mục này'); S.cats.push({ group: F.group, name: n, desc: '' }); save(); closeLayer('catform'); render(); break; }
    case 'catdel': S.cats = S.cats.filter((c) => c.name !== d.id); save(); render(); break;
    case 'page': openPage(v); break;
    case 'sysave': { const url = ($('#syurl') || {}).value.trim(), tk = ($('#sytoken') || {}).value.trim(); if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) || !tk) return toast('Nhập địa chỉ …/exec và mật khẩu'); S.sync.url = url; S.sync.token = tk; saveNow(); toast('Đang đồng bộ…'); syncNow(true).then(() => drawLayer()); break; }
    case 'synow': if (!syCfg()) return toast('Chưa nhập địa chỉ và mật khẩu'); toast('Đang đồng bộ…'); syncNow(true).then(() => drawLayer()); break;
    case 'sytoggle': S.sync.auto = !S.sync.auto; save(); drawLayer(); break;
    case 'syoff': ask('Ngắt kết nối với Google Sheet? Giao dịch trong app vẫn giữ nguyên.', 'Ngắt', () => { S.sync.url = ''; S.sync.token = ''; S.sync.status = ''; S.txns.forEach((t) => { delete t.sy; }); S.sync.dead = []; save(); drawLayer(); render(); }, true); break;
    case 'ratefetch': toast('Đang lấy tỷ giá…'); fetchRate().then((r) => { toast(r ? '1 AUD = ' + Math.round(r).toLocaleString('vi-VN') + ' ₫' : 'Không lấy được (không có mạng?) — hãy nhập tay'); render(); }); break;
    case 'ratenowset': { const n = parseNum(($('#ratenow') || {}).value, 'VND'); if (n < 1000) return toast('Nhập tỷ giá hợp lệ'); S.rateNow = n; save(); render(); toast('Đã đặt'); break; }
    case 'ratem': openSimpleForm('rateform', { m: d.id, v: S.rates[d.id] || '' }, rateForm); break;
    case 'ratesave': { const n = parseNum(F.v, 'VND'); if (n > 0) S.rates[F.m] = n; else delete S.rates[F.m]; save(); closeLayer('rateform'); render(); break; }
    case 'exportjson': shareFile('chi-tieu-sao-luu-' + CORE.today() + '.json', 'application/json', exportJSON()).then((r) => { if (r !== 'cancel' && r !== 'fail') { S.settings.lastBackup = Date.now(); save(); render(); } toast(r === 'fail' ? 'Không lưu được — dùng "Sao chép"' : 'Đã xuất bản sao lưu'); }); break;
    case 'exportcsv': shareFile('giao-dich-' + CORE.today() + '.csv', 'text/csv', exportCSV()).then((r) => toast(r === 'fail' ? 'Không xuất được' : 'Đã xuất CSV')); break;
    case 'copyjson': copyText(exportJSON()).then((ok) => { if (ok) { S.settings.lastBackup = Date.now(); save(); render(); } toast(ok ? 'Đã sao chép — dán vào Ghi chú / email để cất' : 'Trình duyệt không cho sao chép'); }); break;
    case 'import': doImport(); break;
    case 'wipe': ask('Xóa TOÀN BỘ giao dịch, thẻ và cài đặt trên máy này? Không thể hoàn tác — hãy sao lưu trước.', 'Xóa hết', () => { S = defaultState(); saveNow(); LAYER = []; drawLayer(); render(); toast('Đã xóa'); }, true); break;
    case 'close': closeLayer(d.id); break;
    case 'ovclose': break;
    case 'ask-no': closeLayer('confirm'); break;
    case 'ask-yes': { const fn = window._askFn; closeLayer('confirm'); fn && fn(); break; }
  }
}
async function doImport() {
  try {
    const f = $('#file') && $('#file').files[0]; let text = ($('#paste') || {}).value || '';
    if (f) text = await f.text();
    if (!text.trim()) return toast('Chọn file hoặc dán nội dung');
    const r = text.trim().startsWith('{') ? importJSON(JSON.parse(text)) : importCSV(text);
    save(); render(); toast('Đã nhập ' + r.added + ' giao dịch' + (r.dup ? ' (bỏ ' + r.dup + ' trùng)' : ''));
  } catch (e) { toast('Lỗi: ' + e.message); }
}

document.addEventListener('click', (e) => {
  const ov = e.target.classList && e.target.classList.contains('ov') ? e.target : null;
  if (ov) { if (ov.dataset.id !== 'confirm') closeLayer(ov.dataset.id); return; }
  const el = e.target.closest('[data-a]'); if (!el || el.tagName === 'INPUT') return;
  act(el.dataset.a, el);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { UI.q = t.value; const pos = t.selectionStart; render(); const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } return; }
  if (!t.dataset || !t.dataset.f || !F) return;
  F[t.dataset.f] = t.value;
  if (F === TX) { if (t.dataset.f === 'desc') autoCat(); if (t.dataset.f === 'amount') refreshPrev(); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.a === 'pickmonth' && t.value) { UI.m = t.value; UI.yr = +t.value.slice(0, 4); render(); return; }
  if (t.dataset && t.dataset.f && F) { F[t.dataset.f] = t.value; if (F === TX && t.dataset.f === 'date') refreshPrev(); const top = topLayer(); if (top && (top.id === 'recform') && (t.dataset.f === 'cat' || t.dataset.f === 'card')) { /* không vẽ lại */ } }
});
$('#fab').addEventListener('click', () => act('fab', $('#fab')));

// ================= KHỞI ĐỘNG =================
function boot() {
  loadState();
  const n = runRecurring();
  UI.wk = CORE.weekStart(CORE.today(), S.settings.weekStart);
  render();
  if (n) toast('Đã tự ghi ' + n + ' khoản định kỳ');
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* bỏ qua */ }
  syncOnOpen();
  if (!S.rateLog[CORE.today()]) fetchRate().then((r) => { if (r) render(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { const k = runRecurring(); if (k) { render(); toast('Đã tự ghi ' + k + ' khoản định kỳ'); } syncOnOpen(); }
  });
}
boot();
