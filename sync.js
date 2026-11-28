/* Đồng bộ HAI CHIỀU với Google Sheet (qua Apps Script), nhận dòng theo mã ID.
   - Mỗi giao dịch có sid (mã dòng trong sheet) và sh (dấu vân tay nội dung ở lần đồng bộ gần nhất).
   - Sheet đổi (app không đổi) → app cập nhật theo sheet. App đổi (sheet không đổi) → gửi lên sheet.
   - Cả hai cùng đổi → bản trong app thắng. Xóa ở đâu thì xóa ở cả hai nơi. */
const SY = { busy: false, timer: null, lastTry: 0 };
const syR2 = (n) => Math.round(Number(n) * 100) / 100;
const syKey = (t) => [t.date, t.time || '', t.card, syR2(t.amount), t.cur, t.type].join('|');   // chỉ để nhận diện dòng cũ chưa có ID
const syHash = (t) => JSON.stringify([t.date, t.time || '', t.card || '', (t.desc || '').trim(), t.cat || '', t.type, syR2(t.amount), t.cur, (t.note || '').trim(),
  t.balance === undefined || t.balance === null || t.balance === '' ? '' : syR2(t.balance)]);
function syCfg() { return S.sync && S.sync.url && S.sync.token ? S.sync : null; }
function syNote(msg) { if (S.sync) { S.sync.status = msg; S.sync.statusAt = Date.now(); } }
const syPending = (t) => !t.sid || t.sh !== syHash(t);
function syNewId() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// hook từ form
function syEdited(old, nu) { if (old) { nu.sid = old.sid; nu.sh = old.sh; } }
function syDelete(t) { if (t && t.sid && S.sync) { (S.sync.dels = S.sync.dels || []).push(t.sid); } }
function syMark() { /* đổi tên thẻ: nội dung đổi nên tự được gửi lại, không cần làm gì */ }

async function syCall(cfg, body) {
  const u = cfg.url.trim();
  let res;
  if (!body) res = await fetch(u + (u.includes('?') ? '&' : '?') + 'action=list&token=' + encodeURIComponent(cfg.token.trim()));
  else res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: cfg.token.trim() }, body)) });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch (e) { throw new Error('Địa chỉ không phải cổng Apps Script (hoặc chưa triển khai "Bất kỳ ai")'); }
  if (!j.ok) throw new Error(j.error || 'Lỗi không rõ');
  return j;
}

function syFromRemote(r) {
  return normTxn({ date: r.date, time: r.time, card: r.card, desc: r.desc, cat: r.cat, type: r.type, amount: r.amount, cur: r.cur, note: r.note, balance: r.balance });
}
function syEnsureRefs(t, r) {
  if (t.card && !S.cards.some((c) => c.name === t.card)) {
    ensureCard(t.card, t.cur);
    const c = S.cards.find((x) => x.name === t.card);
    if (c && r) {
      if (/credit/i.test(r.kind)) c.kind = 'Credit'; else if (/mặt/i.test(r.kind)) c.kind = 'Tiền mặt'; else if (/debit/i.test(r.kind)) c.kind = 'Debit';
      if (r.group === 'Úc' || r.group === 'Việt Nam') c.group = r.group;
    }
  }
  if (t.cat && !S.cats.some((c) => c.name === t.cat)) S.cats.push({ group: t.type === 'Thu' ? 'THU NHẬP' : 'CHI PHÍ BIẾN ĐỔI', name: t.cat, desc: '' });
}

// So khớp sheet ↔ app. Trả về số dòng nhận/sửa/xóa trong app.
function syReconcile(rows) {
  const byId = {}; rows.forEach((r) => { byId[r.id] = r; });
  const stats = { added: 0, changed: 0, removed: 0 };
  // 1) dòng cũ trong app chưa có sid: nhận diện theo nội dung (di chuyển từ bản cũ / dữ liệu nhập từ Excel)
  const pool = {};
  rows.forEach((r) => { if (!S.txns.some((t) => t.sid === r.id)) { const k = syKey(syFromRemote(r)); (pool[k] = pool[k] || []).push(r); } });
  S.txns.forEach((t) => {
    if (t.sid) return;
    const list = pool[syKey(t)];
    if (list && list.length) { const r = list.shift(); t.sid = r.id; t.sh = syHash(syFromRemote(r)); }
  });
  // 2) từng giao dịch đã có sid
  const gone = [];
  S.txns.forEach((t) => {
    if (!t.sid) return;
    const r = byId[t.sid];
    if (!r) { if (t.sh === syHash(t)) gone.push(t); else t.sh = ''; return; }   // sheet đã xóa dòng: app không đổi → xóa; app có đổi → gửi lại
    const nu = syFromRemote(r), rh = syHash(nu), lh = syHash(t);
    if (lh === t.sh && rh !== t.sh) {                                         // chỉ sheet đổi → theo sheet
      ['date', 'time', 'card', 'desc', 'cat', 'type', 'amount', 'cur', 'note', 'balance'].forEach((k) => { if (nu[k] !== undefined) t[k] = nu[k]; else delete t[k]; });
      syEnsureRefs(t, r); t.sh = rh; stats.changed++;
    } else if (lh !== t.sh && rh === t.sh) { /* chỉ app đổi → sẽ gửi lên */ }
    else if (lh !== t.sh && rh !== t.sh) { t.sh = rh; }                          // cả hai đổi → app thắng (gửi lên đè sheet)
  });
  if (gone.length) { S.txns = S.txns.filter((t) => gone.indexOf(t) < 0); stats.removed = gone.length; }
  // 3) dòng mới trong sheet
  const have = {}; S.txns.forEach((t) => { if (t.sid) have[t.sid] = 1; });
  const dels = {}; (S.sync.dels || []).forEach((i) => { dels[i] = 1; });
  rows.forEach((r) => {
    if (have[r.id] || dels[r.id]) return;
    const t = syFromRemote(r);
    if (!t.date || !t.amount) return;
    syEnsureRefs(t, r); t.sid = r.id; t.sh = syHash(t); S.txns.push(t); stats.added++;
  });
  return stats;
}

function syPayload(t) {
  const c = S.cards.find((x) => x.name === t.card);
  return { date: t.date, time: t.time || '', card: t.card, desc: t.desc, cat: t.cat, type: t.type, amount: t.amount, cur: t.cur,
    balance: t.balance === undefined ? null : t.balance, note: t.note || '', group: c ? c.group : '', kind: c ? c.kind : '' };
}

async function syncNow(manual) {
  const cfg = syCfg(); if (!cfg || SY.busy) return null;
  SY.busy = true; SY.lastTry = Date.now();
  try {
    let deleted = 0, updated = 0, pushed = 0;
    // 1) xóa trên sheet những dòng đã xóa trong app
    const dels = (cfg.dels || []).slice();
    if (dels.length) {
      const r0 = await syCall(cfg, { dels });
      cfg.dels = cfg.dels.slice(dels.length); deleted = r0.deleted || 0; saveNow();
    }
    // 2) kéo và so khớp
    const got = await syCall(cfg, null);
    const st = syReconcile(got.txns || []);
    // 3) gửi các thay đổi / dòng mới trong app
    const todo = S.txns.filter(syPending);
    todo.forEach((t) => { if (!t.sid) t.sid = syNewId(); });
    saveNow();                                                  // lưu sid trước khi gửi: lỡ mất mạng, lần sau gửi lại cùng mã, không nhân đôi
    for (let i = 0; i < todo.length; i += 40) {
      const part = todo.slice(i, i + 40), sent = part.map(syHash);
      const r = await syCall(cfg, { puts: part.map((t) => ({ id: t.sid, txn: syPayload(t) })) });
      part.forEach((t, j) => { t.sh = sent[j]; });
      pushed += r.added || 0; updated += r.updated || 0;
    }
    cfg.last = Date.now();
    syNote('OK · nhận ' + st.added + (st.changed ? ' · cập nhật ' + st.changed : '') + (st.removed ? ' · xóa ' + st.removed : '') + ' · gửi ' + pushed + (updated ? ' · sửa ' + updated : '') + (deleted ? ' · xóa trên sheet ' + deleted : ''));
    saveNow();
    if (typeof render === 'function') render();
    const res = { added: st.added, changed: st.changed, removed: st.removed, pushed, updated, deleted };
    if (manual && typeof toast === 'function') toast('Đã đồng bộ: nhận ' + st.added + ', sửa theo sheet ' + st.changed + ', gửi ' + pushed + ', sửa sheet ' + updated + ', xóa ' + deleted);
    return res;
  } catch (e) {
    syNote('Lỗi: ' + (e && e.message || e));
    saveNow();
    if (manual && typeof toast === 'function') toast('Không đồng bộ được: ' + (e && e.message || e));
    if (typeof render === 'function') render();
    return null;
  } finally { SY.busy = false; }
}

// tự đồng bộ sau mỗi lần lưu (khi còn thay đổi chưa gửi)
function syncSoon() {
  const cfg = syCfg();
  if (!cfg || !cfg.auto || SY.busy || !(S.txns.some(syPending) || (cfg.dels || []).length)) return;
  clearTimeout(SY.timer); SY.timer = setTimeout(() => syncNow(false), 4000);
}
function syncOnOpen() {
  const cfg = syCfg();
  if (cfg && cfg.auto && Date.now() - SY.lastTry > 60000) syncNow(false);
}
