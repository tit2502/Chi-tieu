/* views.js — các màn hình chính: Nhật ký, Thống kê, Thẻ, Cài đặt */
const $ = (s, e) => (e || document).querySelector(s);
const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = (v, cur, o) => CORE.fmt(v, cur, o);
const disp = () => S.settings.disp;
const PAL = ['#ef6f63', '#f0975a', '#f4c95d', '#c7e05a', '#7cd37a', '#5fd1b6', '#62b8ea', '#6e8ff0', '#a58bea', '#e18bd0', '#b0a08c', '#8fa3ad'];
const GREY = '#b8bcc4';
const CARD_COL = ['#e2574c', '#3b82f6', '#1f9d73', '#d98a14', '#7c6ae6', '#0ea5b7', '#d946a8', '#6b7280'];
const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

const ICO = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 8h7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>'
};
const ico = (n, s) => `<svg width="${s || 22}" height="${s || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;

const now = new Date();
const UI = {
  tab: 'nk', sub: 'day',
  m: CORE.today().slice(0, 7), wk: null, yr: now.getFullYear(), sel: CORE.today(),
  q: '', searchOn: false, fcards: [],
  stat: 'chi', scope: 'all', range: 'month'
};
let CTX = null;

// ---------- lọc & kỳ ----------
function filtered() {
  const q = UI.q.trim().toLowerCase();
  return S.txns.filter((t) => {
    if (UI.fcards.length && !UI.fcards.includes(t.card)) return false;
    if (q && !(t.desc + ' ' + t.cat + ' ' + t.note + ' ' + t.card).toLowerCase().includes(q)) return false;
    return true;
  });
}
function period() {
  if (UI.sub === 'week') { const s = UI.wk || CORE.weekStart(CORE.today(), S.settings.weekStart); return { from: s, to: CORE.addDays(s, 6) }; }
  if (UI.sub === 'month') return { from: UI.yr + '-01-01', to: UI.yr + '-12-31' };
  return { from: UI.m + '-01', to: UI.m + '-31' };
}
const monthLabel = (mk) => MONTHS[+mk.slice(5) - 1] + ' / ' + mk.slice(0, 4);
function shiftMonth(mk, n) { let y = +mk.slice(0, 4), m = +mk.slice(5) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + CORE.pad(m + 1); }
const fdm = (s) => s.slice(8) + '/' + s.slice(5, 7);

function periodNav(kind) {
  let lbl, key;
  if (kind === 'week') { const p = period(); lbl = fdm(p.from) + ' – ' + fdm(p.to); key = 'week'; }
  else if (kind === 'year') { lbl = 'Năm ' + UI.yr; key = 'year'; }
  else { lbl = monthLabel(UI.m); key = 'month'; }
  const mid = kind === 'month'
    ? `<label class="lbl" style="position:relative;cursor:pointer">${lbl}<input type="month" value="${UI.m}" data-a="pickmonth" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></label>`
    : `<button class="lbl" data-a="today">${lbl}</button>`;
  return `<div class="nav"><button class="hbtn" data-a="prev" aria-label="Trước">${ico('left')}</button>${mid}
    <button class="hbtn" data-a="next" aria-label="Sau">${ico('right')}</button></div>`;
}
const dispPill = () => `<div class="pill"><button data-a="disp" data-v="AUD" class="${disp() === 'AUD' ? 'on' : ''}">AUD</button><button data-a="disp" data-v="VND" class="${disp() === 'VND' ? 'on' : ''}">VND</button></div>`;

// ---------- Nhật ký ----------
function headJournal(P) {
  const filterOn = UI.fcards.length > 0;
  const kind = UI.sub === 'week' ? 'week' : UI.sub === 'month' ? 'year' : 'month';
  const sm = CORE.summarize(CTX, P, disp());
  const d = disp();
  const vnChi = sm.vn.debit + sm.vn.cash;
  const sub = [['day', 'Ngày'], ['cal', 'Lịch'], ['week', 'Tuần'], ['month', 'Tháng']];
  return `<div class="hrow"><button class="hbtn" data-a="search">${ico('search')}</button><span class="htitle">Nhật ký</span>
      <button class="hbtn" data-a="filter">${ico('filter')}${filterOn ? '<span class="dot"></span>' : ''}</button></div>
    ${UI.searchOn ? `<div class="searchbar"><input id="q" placeholder="Tìm nội dung, danh mục, ghi chú…" value="${esc(UI.q)}" autocomplete="off"></div>` : ''}
    <div class="hrow">${periodNav(kind)}${dispPill()}</div>
    <div class="subtabs">${sub.map(([k, l]) => `<button data-a="sub" data-v="${k}" class="${UI.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="sum">
      <div class="sumrow"><span class="tag">ÚC</span><div><small>Thu nhập</small><b>${M(sm.uc.thu, d, { compact: true })}</b></div>
        <div><small>Chi phí</small><b>${M(sm.uc.chi + sm.uc.save, d, { compact: true })}</b></div>
        <div><small>Còn lại</small><b>${M(sm.uc.left, d, { compact: true })}</b></div></div>
      <div class="sumrow"><span class="tag">VN</span><div><small>Thu nhập</small><b>${M(sm.vn.thu, 'VND', { compact: true })}</b></div>
        <div><small>Debit + tiền mặt</small><b>${M(vnChi, 'VND', { compact: true })}</b></div>
        <div><small>Còn lại</small><b>${M(sm.vn.left, 'VND', { compact: true })}</b></div></div>
      ${sm.vn.credit || sm.uc.save ? `<div class="sumnote"><span>Credit VN (chỉ theo dõi): ${M(sm.vn.credit, 'VND', { compact: true })}</span>${sm.uc.save ? `<span>Tiết kiệm Úc: ${M(sm.uc.save, d, { compact: true })}</span>` : ''}</div>` : ''}
    </div>`;
}

function otherAmt(t) {
  const o = t.cur === 'AUD' ? 'VND' : 'AUD';
  return '≈ ' + M(CTX.conv(t, o), o, { compact: o === 'VND' && false });
}
function txRow(t) {
  const grp = CTX.group(t), kind = CTX.cardKind(t), ck = CTX.catKind(t);
  const cls = ck === 'transfer' ? 'muted' : (t.type === 'Thu' ? 'thu' : 'chi');
  const sign = t.type === 'Thu' ? '+' : '';
  const tags = `<span class="tg ${grp === 'Việt Nam' ? 'vn' : 'uc'}">${grp === 'Việt Nam' ? 'VN' : 'ÚC'}</span>${kind === 'Credit' ? ' <span class="tg cr">Credit</span>' : kind === 'Tiền mặt' ? ' <span class="tg cash">Tiền mặt</span>' : ''}`;
  const title = CORE.cleanDesc(t.desc) || t.cat || '(không có nội dung)';
  const subs = [t.card, t.time, t.note].filter(Boolean).join(' · ');
  return `<button class="tx" data-a="edit" data-id="${t.id}">
    <div class="c1">${esc(t.cat || '—')}<br>${tags}</div>
    <div class="c2"><b>${esc(title)}</b><small>${esc(subs)}</small></div>
    <div class="c3"><b class="${cls} num">${sign}${M(t.amount, t.cur)}</b><small>${otherAmt(t)}</small></div></button>`;
}
const sortTx = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));

function viewDay(P) {
  if (!P.length) return `<div class="empty">Chưa có giao dịch trong kỳ này.<br>Bấm nút + để thêm.</div>`;
  const byDay = {};
  P.forEach((t) => (byDay[t.date] = byDay[t.date] || []).push(t));
  return Object.keys(byDay).sort().reverse().map((d) => {
    const list = byDay[d].sort(sortTx), fl = CORE.flow(CTX, list, disp());
    return `<div class="card"><div class="dayh"><span class="dn">${+d.slice(8)}</span>
      <span class="dm">${d.slice(0, 4)}/${d.slice(5, 7)}<br><span class="wd">${CORE.dayShort(d)}</span></span><span class="sp"></span>
      <div class="ds">${fl.thu ? `<span class="thu">${M(fl.thu, disp(), { compact: true })}</span> ` : ''}<span class="chi">${M(fl.chi + fl.save, disp(), { compact: true })}</span></div></div>
      ${list.map(txRow).join('')}</div>`;
  }).join('');
}

function viewCal(P) {
  const ws = S.settings.weekStart;
  const first = UI.m + '-01';
  const start = CORE.weekStart(first, ws);
  const y = +UI.m.slice(0, 4), m = +UI.m.slice(5);
  const last = UI.m + '-' + CORE.daysInMonth(y, m);
  let cells = '', d = start;
  const wds = []; for (let i = 0; i < 7; i++) wds.push(CORE.dayShort(CORE.addDays(start, i)));
  const byDay = {}; P.forEach((t) => (byDay[t.date] = byDay[t.date] || []).push(t));
  const today = CORE.today();
  while (d <= last || CORE.weekday(d) !== ws) {
    const inM = d.slice(0, 7) === UI.m, list = byDay[d] || [], fl = CORE.flow(CTX, list, disp());
    cells += `<button class="d ${inM ? '' : 'out'} ${d === today ? 'today' : ''} ${d === UI.sel ? 'sel' : ''}" data-a="calday" data-d="${d}">
      <span class="n">${+d.slice(8)}</span><span class="v">${fl.thu ? `<span class="thu">${M(fl.thu, disp(), { compact: true, noSym: true })}</span><br>` : ''}${fl.chi + fl.save ? `<span class="chi">${M(fl.chi + fl.save, disp(), { compact: true, noSym: true })}</span>` : ''}</span></button>`;
    d = CORE.addDays(d, 1);
    if (d > last && CORE.weekday(d) === ws) break;
  }
  const sel = UI.sel.startsWith(UI.m) ? UI.sel : UI.m + '-01';
  const list = (byDay[sel] || []).sort(sortTx);
  const fl = CORE.flow(CTX, list, disp());
  return `<div class="cal">${wds.map((w) => `<div class="w">${w}</div>`).join('')}${cells}</div>
    <div class="sect">${CORE.DAY_FULL[CORE.weekday(sel)]} ${fdm(sel)} · Thu ${M(fl.thu, disp())} · Chi ${M(fl.chi + fl.save, disp())}</div>
    <div class="card">${list.length ? list.map(txRow).join('') : '<div class="empty" style="padding:20px">Không có giao dịch.</div>'}</div>`;
}

function viewWeek(P) {
  const s = period().from, d = disp();
  const W = CORE.weekTable(CTX, P, s, d);
  const t = W.total;
  const tile = (l, v, c, big) => `<div class="tile ${big ? 'big' : ''}"><small>${l}</small><b class="${c || ''} num">${v}</b></div>`;
  const vals = (arr, cur, f) => arr.map((x) => { const v = f(x); return `<td class="num">${Math.abs(v) < 0.005 ? '–' : M(v, cur, { noSym: true, compact: cur === 'VND' })}</td>`; }).join('');
  const days = W.days;
  const head = `<tr><th>Khoản mục</th>${days.map((x) => `<th>${CORE.dayShort(x.date)} ${fdm(x.date)}</th>`).join('')}<th>Cả tuần</th></tr>`;
  const row = (label, cur, f, tot, cls) => `<tr class="${cls || ''}"><td>${label}</td>${vals(days, cur, f)}<td class="num"><b>${M(tot, cur, { noSym: true, compact: cur === 'VND' }) }</b></td></tr>`;
  const chiDay = days.map((x) => { const f = CORE.flow(CTX, x.list, d); return f.chi + f.save; });
  const maxC = Math.max(1, ...chiDay);
  const usage = CORE.cardUsage(CTX, W.days.flatMap((x) => x.list), d);
  return `<div class="sect">Úc (${d})</div><div class="tiles">
      ${tile('Thu nhập', M(t.uc.thu, d, { compact: true }), 'thu')}${tile('Chi phí', M(t.uc.chi, d, { compact: true }), 'chi')}${tile('Tiết kiệm & đầu tư', M(t.uc.save, d, { compact: true }))}
      ${tile('Trong đó tiền mặt Úc', M(t.uc.cash, d), '', 0)}${tile('Còn lại Úc', M(t.uc.left, d), t.uc.left < 0 ? 'chi' : 'thu', 0)}${tile('Số giao dịch', W.count)}</div>
    <div class="sect">Việt Nam (VND)</div><div class="tiles">
      ${tile('Thu nhập', M(t.vn.thu, 'VND', { compact: true }), 'thu')}${tile('Chi thẻ Debit', M(t.vn.debit, 'VND', { compact: true }), 'chi')}${tile('Tiền mặt VN', M(t.vn.cash, 'VND', { compact: true }), 'chi')}
      ${tile('Credit tuần này (theo dõi, không trừ)', M(t.vn.credit, 'VND', { compact: true }))}${tile('Còn lại VN', M(t.vn.left, 'VND', { compact: true }), t.vn.left < 0 ? 'chi' : 'thu')}</div>
    <div class="sect">Tổng hợp theo ngày</div>
    <div class="card scrollx"><table class="tbl">${head}
      <tr class="hd"><td colspan="9">ÚC (${d})</td></tr>
      ${row('Thu nhập', d, (x) => x.sum.uc.thu, t.uc.thu)}${row('Chi phí', d, (x) => x.sum.uc.chi, t.uc.chi)}${row('Tiết kiệm & đầu tư', d, (x) => x.sum.uc.save, t.uc.save)}${row('Còn lại', d, (x) => x.sum.uc.left, t.uc.left, 'tot')}
      <tr class="hd"><td colspan="9">VIỆT NAM (VND)</td></tr>
      ${row('Thu nhập', 'VND', (x) => x.sum.vn.thu, t.vn.thu)}${row('Thẻ Debit', 'VND', (x) => x.sum.vn.debit, t.vn.debit)}${row('Credit (theo dõi)', 'VND', (x) => x.sum.vn.credit, t.vn.credit)}${row('Tiền mặt', 'VND', (x) => x.sum.vn.cash, t.vn.cash)}${row('Còn lại', 'VND', (x) => x.sum.vn.left, t.vn.left, 'tot')}
    </table></div>
    <div class="sect">Chi tiêu mỗi ngày (mọi thẻ, ${d})</div>
    <div class="card"><div class="bars">${days.map((x, i) => `<div><span>${chiDay[i] ? M(chiDay[i], d, { compact: true, noSym: true }) : ''}</span><i style="height:${Math.max(2, 62 * chiDay[i] / maxC)}px"></i><span>${CORE.dayShort(x.date)}</span></div>`).join('')}</div><div style="height:8px"></div></div>
    <div class="sect">Thẻ dùng trong tuần</div>
    <div class="card list">${usage.list.length ? usage.list.map((u) => `<div class="li"><span class="sp"><b>${esc(u.card)}</b></span><span>${u.count} lần</span><b class="num">${M(u.value, d)}</b></div>`).join('') : '<div class="empty" style="padding:16px">Chưa có chi tiêu.</div>'}</div>`;
}

function viewYear(P) {
  const y = UI.yr, d = disp(), cur = CORE.today().slice(0, 7);
  const out = [];
  for (let m = 12; m >= 1; m--) {
    const mk = y + '-' + CORE.pad(m);
    const list = P.filter((t) => t.date.startsWith(mk));
    if (!list.length && mk !== cur) continue;
    const sm = CORE.summarize(CTX, list, d), r = CTX.rate(mk + '-15');
    out.push(`<button class="card pad" style="width:100%;text-align:left" data-a="openmonth" data-m="${mk}">
      <div style="display:flex;justify-content:space-between"><b>${MONTHS[m - 1]}</b><small>1 AUD = ${Math.round(r).toLocaleString('vi-VN')} ₫ · ${list.length} giao dịch</small></div>
      <div class="kv"><span><span class="tg uc" style="color:#fff;font-size:10px;padding:0 5px;border-radius:4px">ÚC</span> Thu ${M(sm.uc.thu, d, { compact: true })} · Chi ${M(sm.uc.chi + sm.uc.save, d, { compact: true })}</span><b class="${sm.uc.left < 0 ? 'chi' : 'thu'}">${M(sm.uc.left, d, { compact: true })}</b></div>
      <div class="kv"><span><span class="tg vn" style="color:#fff;font-size:10px;padding:0 5px;border-radius:4px">VN</span> Debit+TM ${M(sm.vn.debit + sm.vn.cash, 'VND', { compact: true })} · Credit ${M(sm.vn.credit, 'VND', { compact: true })}</span><b>${M(sm.vn.left, 'VND', { compact: true })}</b></div></button>`);
  }
  return out.join('') || '<div class="empty">Chưa có dữ liệu năm này.</div>';
}

function renderJournal() {
  const all = filtered(), p = period();
  const P = CORE.inRange(all, p.from, p.to);
  $('#head').innerHTML = headJournal(P);
  const alerts = budgetAlerts();
  $('#main').innerHTML = alerts + (UI.sub === 'day' ? viewDay(P) : UI.sub === 'cal' ? viewCal(P) : UI.sub === 'week' ? viewWeek(P) : viewYear(P)) + backupBanner();
}
function budgetAlerts() {
  const mk = CORE.today().slice(0, 7);
  const st = CORE.budgetStatus(CTX, S.budgets, S.txns.filter((t) => t.date.startsWith(mk))).filter((b) => b.level !== 'ok');
  if (!st.length) return '';
  return `<div class="alert">${st.map((b) => `${b.level === 'over' ? '🔴' : '🟠'} Ngân sách <b>${b.cat === '*' ? 'tổng ' : esc(b.cat) + ' '}${b.scope}</b>: ${Math.round(b.pct * 100)}% (${M(b.used, b.cur, { compact: true })} / ${M(b.amount, b.cur, { compact: true })})`).join('<br>')}</div>`;
}
function backupBanner() {
  const days = (Date.now() - (S.settings.lastBackup || 0)) / 864e5;
  if (S.txns.length < 10 || days < 7) return '';
  return `<div class="alert" style="margin-top:10px">Đã ${S.settings.lastBackup ? Math.floor(days) + ' ngày' : 'lâu'} chưa sao lưu dữ liệu. <button data-a="page" data-v="data" style="text-decoration:underline;font-weight:700">Sao lưu ngay</button></div>`;
}

// ---------- Thống kê ----------
function pieSvg(items, size, center) {
  const R = size / 2, r = R * 0.58, cx = R, cy = R;
  const tot = items.reduce((s, x) => s + x.value, 0);
  if (!tot) return '';
  let a0 = -Math.PI / 2, paths = '';
  const pt = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  items.forEach((it) => {
    const frac = it.value / tot;
    if (frac >= 0.9999) { paths += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${it.color}" stroke-width="${R - r}"/>`; return; }
    const a1 = a0 + frac * 2 * Math.PI, large = frac > 0.5 ? 1 : 0;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
    paths += `<path d="M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${large} 0 ${x3} ${y3}Z" fill="${it.color}" stroke="var(--card)" stroke-width="1.5"/>`;
    if (frac >= 0.07) { const am = (a0 + a1) / 2, [lx, ly] = pt((R + r) / 2, am); paths += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${Math.round(frac * 100)}%</text>`; }
    a0 = a1;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}<foreignObject x="${cx - r + 6}" y="${cy - 22}" width="${2 * r - 12}" height="44"><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;line-height:1.2">${center}</div></foreignObject></svg>`;
}
function colorize(list, valKey) {
  const top = list.slice(0, 11), rest = list.slice(11);
  const out = top.map((x, i) => Object.assign({}, x, { color: PAL[i % PAL.length] }));
  if (rest.length) out.push({ cat: 'Khác', card: 'Khác', value: rest.reduce((s, x) => s + x.value, 0), count: rest.reduce((s, x) => s + x.count, 0), pct: rest.reduce((s, x) => s + x.pct, 0), color: GREY, rest: true });
  return out;
}
function statPeriod() {
  if (UI.range === 'year') return [UI.yr + '-01-01', UI.yr + '-12-31'];
  return [UI.m + '-01', UI.m + '-31'];
}
function headStats() {
  const modes = [['chi', 'Chi tiêu'], ['thu', 'Thu nhập'], ['card', 'Thẻ'], ['budget', 'Ngân sách']];
  const nav = UI.range === 'year' ? periodNav('year') : periodNav('month');
  return `<div class="hrow"><span class="htitle" style="margin-left:6px">Thống kê</span>${dispPill()}</div>
    <div class="hrow">${nav}<div class="pill"><button data-a="range" data-v="month" class="${UI.range === 'month' ? 'on' : ''}">Tháng</button><button data-a="range" data-v="year" class="${UI.range === 'year' ? 'on' : ''}">Năm</button></div></div>
    <div class="subtabs">${modes.map(([k, l]) => `<button data-a="stat" data-v="${k}" class="${UI.stat === k ? 'on' : ''}">${l}</button>`).join('')}</div><div style="height:8px"></div>`;
}
function scopeChips() {
  return `<div class="chips" style="margin-bottom:10px">${[['all', 'Tất cả'], ['Úc', 'Ngân hàng Úc'], ['Việt Nam', 'Ngân hàng Việt Nam']].map(([k, l]) => `<button class="chip sm ${UI.scope === k ? 'on' : ''}" data-a="scope" data-v="${k}">${l}</button>`).join('')}</div>`;
}
function trendBars(type) {
  const d = disp(), months = [];
  if (UI.range === 'year') for (let i = 1; i <= 12; i++) months.push(UI.yr + '-' + CORE.pad(i));
  else for (let i = 5; i >= 0; i--) months.push(shiftMonth(UI.m, -i));
  const vals = months.map((mk) => {
    const L = S.txns.filter((t) => t.date.startsWith(mk) && (UI.scope === 'all' || CTX.group(t) === UI.scope));
    return CORE.catBreakdown(CTX, L, { type, scope: 'all', disp: d }).total;
  });
  const mx = Math.max(1, ...vals);
  return `<div class="sect">${type === 'Chi' ? 'Chi tiêu' : 'Thu nhập'} theo tháng (${d})</div><div class="card"><div class="bars">${months.map((mk, i) => `<div><span>${vals[i] ? M(vals[i], d, { compact: true, noSym: true }) : ''}</span><i style="height:${Math.max(2, 62 * vals[i] / mx)}px;${mk === UI.m ? '' : 'opacity:.55'}"></i><span>${+mk.slice(5)}</span></div>`).join('')}</div><div style="height:8px"></div></div>`;
}
function renderStats() {
  $('#head').innerHTML = headStats();
  const [from, to] = statPeriod(), d = disp();
  const P = CORE.inRange(S.txns, from, to);
  let h = '';
  if (UI.stat === 'budget') h = viewBudget();
  else if (UI.stat === 'card') {
    const u = CORE.cardUsage(CTX, P, d), items = colorize(u.list.map((x) => Object.assign({}, x, { value: x.count, spend: x.value })), 'count');
    const un = (x) => u.list.find((y) => y.card === x.card);
    h = `<div class="card"><div class="pie">${items.length ? pieSvg(items, 220, `<b style="font-size:20px">${u.count}</b><br><small>lần dùng thẻ</small>`) : '<div class="empty">Chưa có dữ liệu.</div>'}</div>
      <div class="legend">${items.map((x) => { const src = un(x) || { value: x.spend || 0 }; return `<div class="row"><span class="badge" style="background:${x.color}">${Math.round((x.count / (u.count || 1)) * 100)}%</span><span class="nm">${esc(x.card)}<br><small>${x.count} lần</small></span><b class="num">${M(x.spend !== undefined ? x.spend : src.value, d)}</b></div>`; }).join('')}</div></div>
      <small style="display:block;padding:0 6px">Đếm mọi giao dịch Chi trên thẻ, kể cả chuyển ví / chuyển tiền.</small>`;
  } else {
    const type = UI.stat === 'thu' ? 'Thu' : 'Chi';
    const B = CORE.catBreakdown(CTX, P, { type, scope: UI.scope, disp: d });
    const items = colorize(B.list);
    const sv = type === 'Chi' ? CORE.catBreakdown(CTX, P, { type: 'Chi', scope: UI.scope, disp: d, withSave: true }).total - B.total : 0;
    h = scopeChips() + `<div class="card"><div class="pie">${items.length ? pieSvg(items, 230, `<small>${type === 'Chi' ? 'Tổng chi' : 'Tổng thu'}</small><br><b style="font-size:17px">${M(B.total, d, { compact: d === 'VND' })}</b>`) : '<div class="empty">Chưa có dữ liệu trong kỳ này.</div>'}</div>
      <div class="legend">${items.map((x) => `<button class="row" data-a="catlist" data-c="${esc(x.rest ? '' : x.cat)}"><span class="badge" style="background:${x.color}">${Math.round(x.pct * 100)}%</span><span class="nm">${esc(x.cat)}${x.count ? `<br><small>${x.count} giao dịch</small>` : ''}</span><b class="num">${M(x.value, d)}</b></button>`).join('')}</div></div>
      ${sv > 0.005 ? `<div class="card pad" style="display:flex;justify-content:space-between"><span>Tiết kiệm & đầu tư (không tính vào chi)</span><b>${M(sv, d)}</b></div>` : ''}
      ${trendBars(type)}
      <small style="display:block;padding:0 6px">Không gồm chuyển ví / chuyển tiền. Mọi khoản được quy đổi sang ${d} theo tỷ giá của tháng giao dịch.</small>`;
  }
  $('#main').innerHTML = h;
}
function viewBudget() {
  const mk = UI.range === 'year' ? CORE.today().slice(0, 7) : UI.m;
  const st = CORE.budgetStatus(CTX, S.budgets, S.txns.filter((t) => t.date.startsWith(mk)));
  return `<div class="sect">Ngân sách ${monthLabel(mk)}</div>` + (st.length ? st.map((b) => `<button class="card pad" style="width:100%;text-align:left" data-a="budget" data-id="${b.id}">
      <div style="display:flex;justify-content:space-between"><b>${b.cat === '*' ? 'Tổng chi' : esc(b.cat)} <span class="tg ${b.scope === 'Việt Nam' ? 'vn' : 'uc'}" style="color:#fff;font-size:10px;padding:0 5px;border-radius:4px">${b.scope === 'Việt Nam' ? 'VN' : 'ÚC'}</span></b><b class="num">${Math.round(b.pct * 100)}%</b></div>
      <div class="prog"><i class="${b.level}" style="width:${Math.min(100, b.pct * 100)}%"></i></div>
      <small>Đã chi ${M(b.used, b.cur)} / ${M(b.amount, b.cur)} · còn ${M(Math.max(0, b.amount - b.used), b.cur)}</small></button>`).join('') : '<div class="empty">Chưa đặt ngân sách nào.</div>')
    + `<button class="btn" style="display:block;width:100%" data-a="budget" data-id="">+ Thêm ngân sách</button>
    <small style="display:block;padding:8px 6px">Ngân sách Úc tính bằng AUD, Việt Nam bằng VND. Cảnh báo cam từ 80%, đỏ từ 100%. Không gồm tiết kiệm & chuyển tiền.</small>`;
}

// ---------- Thẻ ----------
function cardInfo(card) {
  const tx = S.txns.filter((t) => t.card === card.name);
  let bal = card.open || 0, lastBal = null;
  tx.forEach((t) => { const v = CORE.convert(t, card.cur, CTX.rate(t.date)); bal += t.type === 'Thu' ? v : -v; });
  tx.filter((t) => t.balance !== undefined).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).forEach((t) => { lastBal = { v: t.balance, date: t.date }; });
  return { bal, lastBal };
}
function cardColor(name) { const i = S.cards.findIndex((c) => c.name === name); return CARD_COL[(i < 0 ? 7 : i) % CARD_COL.length]; }
function cardRow(c) {
  const mk = UI.m, tx = S.txns.filter((t) => t.card === c.name && t.date.startsWith(mk) && t.type === 'Chi');
  const spend = tx.reduce((s, t) => s + CORE.convert(t, c.cur, CTX.rate(t.date)), 0);
  const info = cardInfo(c);
  let line2 = '';
  if (c.kind === 'Tiền mặt') line2 = `Số dư: <b>${M(info.bal, c.cur)}</b>`;
  else if (c.kind === 'Credit') line2 = info.lastBal ? `Hạn mức còn lại (${fdm(info.lastBal.date)}): <b>${M(info.lastBal.v, c.cur)}</b>` : '';
  else line2 = c.open ? `Số dư: <b>${M(info.bal, c.cur)}</b>` : (info.lastBal ? `Số dư báo (${fdm(info.lastBal.date)}): <b>${M(info.lastBal.v, c.cur)}</b>` : '');
  return `<button class="li" data-a="cardview" data-n="${esc(c.name)}"><span style="width:12px;height:36px;border-radius:6px;background:${cardColor(c.name)}"></span>
    <span class="sp"><b>${esc(c.name)}</b><span class="sub">${esc(c.bank)} · ${c.kind} · ${c.cur}</span>${line2 ? `<span class="sub">${line2}</span>` : ''}</span>
    <span style="text-align:right"><b class="chi num">${M(spend, c.cur)}</b><span class="sub">${tx.length} lần · ${MONTHS[+mk.slice(5) - 1]}</span></span></button>`;
}
function renderCards() {
  $('#head').innerHTML = `<div class="hrow"><span class="htitle" style="margin-left:6px">Thẻ & tài khoản</span><button class="hbtn" data-a="cardnew">${ico('plus')}</button></div>
    <div class="hrow">${periodNav('month')}<span></span></div><div style="height:6px"></div>`;
  const sect = (title, arr) => arr.length ? `<div class="sect">${title}</div><div class="card list">${arr.map(cardRow).join('')}</div>` : '';
  $('#main').innerHTML = sect('Ngân hàng Úc (AUD)', S.cards.filter((c) => c.group === 'Úc' && c.kind !== 'Tiền mặt'))
    + sect('Ngân hàng Việt Nam (VND)', S.cards.filter((c) => c.group === 'Việt Nam' && c.kind !== 'Tiền mặt'))
    + sect('Tiền mặt', S.cards.filter((c) => c.kind === 'Tiền mặt'))
    + `<small style="display:block;padding:8px 6px">Nhóm Úc / Việt Nam theo ngân hàng của thẻ, không theo tiền tệ giao dịch. Thẻ Credit chỉ theo dõi, không trừ vào "Còn lại". Rút tiền mặt: dùng + → Chuyển.</small>`;
}

// ---------- Cài đặt ----------
function renderSettings() {
  $('#head').innerHTML = `<div class="hrow"><span class="htitle" style="margin-left:6px">Cài đặt</span></div><div style="height:8px"></div>`;
  const li = (page, label, sub) => `<button class="li" data-a="page" data-v="${page}"><span class="sp"><b>${label}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</span><span class="chev">${ico('right', 18)}</span></button>`;
  const mk = CORE.today().slice(0, 7), r = CTX.rate(mk + '-15');
  $('#main').innerHTML = `<div class="card list">
      ${li('rates', 'Tỷ giá AUD → VND', '1 AUD = ' + Math.round(r).toLocaleString('vi-VN') + ' ₫ (' + CORE.rateSource(S, mk) + ')')}
      ${li('cards', 'Thẻ & tài khoản', S.cards.length + ' thẻ')}
      ${li('cats', 'Danh mục', S.cats.length + ' danh mục')}
      ${li('rules', 'Quy tắc tự phân loại', S.rules.length + ' từ khóa')}
      ${li('recs', 'Giao dịch định kỳ', S.recs.filter((x) => x.on).length + ' đang bật')}
      ${li('budgets', 'Ngân sách', S.budgets.length + ' mục')}</div>
    <div class="card list">
      <div class="li"><span class="sp"><b>Tiền tệ hiển thị</b><span class="sub">Phần Úc & tổng quy đổi</span></span><div class="pill" style="background:var(--chip)"><button data-a="disp" data-v="AUD" class="${disp() === 'AUD' ? 'on' : ''}" style="color:var(--text)">AUD</button><button data-a="disp" data-v="VND" class="${disp() === 'VND' ? 'on' : ''}" style="color:var(--text)">VND</button></div></div>
      <div class="li"><span class="sp"><b>Tuần bắt đầu từ</b><span class="sub">File Excel dùng Thứ Hai</span></span><div class="pill" style="background:var(--chip)"><button data-a="wstart" data-v="1" class="${S.settings.weekStart === 1 ? 'on' : ''}" style="color:var(--text)">Thứ Hai</button><button data-a="wstart" data-v="0" class="${S.settings.weekStart === 0 ? 'on' : ''}" style="color:var(--text)">Chủ Nhật</button></div></div>
      <button class="li" data-a="toggle" data-v="autoLearn"><span class="sp"><b>Tự học quy tắc</b><span class="sub">Nhớ danh mục cho lần nhập sau</span></span><span class="switch ${S.settings.autoLearn ? 'on' : ''}"></span></button></div>
    <div class="card list">${li('sync', 'Đồng bộ Google Sheet', S.sync && S.sync.url ? (S.sync.status || 'Đã kết nối') : 'Chưa kết nối')}${li('data', 'Sao lưu & dữ liệu', S.txns.length + ' giao dịch' + (storageOK ? '' : ' · ⚠ không lưu được trên trình duyệt này'))}${li('help', 'Cài lên màn hình iPhone', 'Hướng dẫn')}</div>`;
}

// ---------- tab bar & render ----------
function renderTabbar() {
  const T = [['nk', 'Nhật ký', 'book'], ['st', 'Thống kê', 'chart'], ['cards', 'Thẻ', 'card'], ['set', 'Cài đặt', 'gear']];
  $('#tabbar').innerHTML = T.map(([k, l, i]) => `<button data-a="tab" data-v="${k}" class="${UI.tab === k ? 'on' : ''}">${ico(i, 24)}<span>${l}</span></button>`).join('');
}
function render() {
  CTX = CORE.makeCtx(S);
  if (!UI.wk) UI.wk = CORE.weekStart(CORE.today(), S.settings.weekStart);
  const sc = $('#main').scrollTop;
  if (UI.tab === 'nk') renderJournal(); else if (UI.tab === 'st') renderStats(); else if (UI.tab === 'cards') renderCards(); else renderSettings();
  renderTabbar();
  $('#fab').style.display = UI.tab === 'set' ? 'none' : 'grid';
  $('#main').scrollTop = sc;
  if (typeof renderOverlays === 'function') renderOverlays();
}
