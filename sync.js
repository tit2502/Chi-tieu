/* Đồng bộ với Google Sheet (qua Apps Script). Chỉ THÊM dòng mới; app không bao giờ sửa/xóa dòng trong sheet. */
const SY = { busy: false, timer: null, lastTry: 0 };
const syR2 = (n) => Math.round(Number(n) * 100) / 100;
const syKey = (t) => [t.date, t.time || '', t.card, syR2(t.amount), t.cur, t.type].join('|');
function syCfg() { return S.sync && S.sync.url && S.sync.token ? S.sync : null; }
function syNote(msg) { if (S.sync) { S.sync.status = msg; S.sync.statusAt = Date.now(); } }

// ghi nhớ giao dịch đã đồng bộ nhưng bị sửa/xóa trong app → lần kéo sau không đưa dòng cũ trong sheet quay lại
function syncForget(t) {
  if (!t || !t.sy || !S.sync) return;
  S.sync.dead = S.sync.dead || [];
  S.sync.dead.push(syKey(t));
  delete t.sy;
}

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

function syApplyRemote(rows) {
  const dead = {}; (S.sync.dead || []).forEach((k) => { dead[k] = 1; });
  const pool = {};
  S.txns.forEach((t) => { (pool[syKey(t)] = pool[syKey(t)] || []).push(t); });
  let added = 0;
  rows.forEach((r) => {
    const t = normTxn({ date: r.date, time: r.time, card: r.card, desc: r.desc, cat: r.cat, type: r.type, amount: r.amount, cur: r.cur, note: r.note, balance: r.balance });
    if (!t.date || !t.amount) return;
    const k = syKey(t), list = pool[k];
    if (list && list.length) { list.shift().sy = 1; return; }       // đã có trong app → đánh dấu đã đồng bộ
    if (dead[k]) return;                                              // từng xóa/sửa trong app → bỏ qua
    if (t.card && !S.cards.some((c) => c.name === t.card)) {
      ensureCard(t.card, t.cur);
      const c = S.cards.find((x) => x.name === t.card);
      if (c) {
        if (/credit/i.test(r.kind)) c.kind = 'Credit'; else if (/mặt/i.test(r.kind)) c.kind = 'Tiền mặt'; else if (/debit/i.test(r.kind)) c.kind = 'Debit';
        if (r.group === 'Úc' || r.group === 'Việt Nam') c.group = r.group;
      }
    }
    if (t.cat && !S.cats.some((c) => c.name === t.cat)) S.cats.push({ group: t.type === 'Thu' ? 'THU NHẬP' : 'CHI PHÍ BIẾN ĐỔI', name: t.cat, desc: '' });
    t.sy = 1; S.txns.push(t); added++;
  });
  return added;
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
    const got = await syCall(cfg, null);
    const added = syApplyRemote(got.txns || []);
    const todo = S.txns.filter((t) => !t.sy);
    let pushed = 0;
    for (let i = 0; i < todo.length; i += 40) {
      const part = todo.slice(i, i + 40);
      const r = await syCall(cfg, { txns: part.map(syPayload) });
      part.forEach((t, j) => { if (r.results && r.results[j]) t.sy = 1; });
      pushed += r.added || 0;
    }
    cfg.last = Date.now();
    syNote('OK · kéo ' + added + ' · đẩy ' + pushed);
    saveNow();
    if (typeof render === 'function') render();
    if (manual && typeof toast === 'function') toast('Đã đồng bộ: nhận ' + added + ', gửi ' + pushed);
    return { added, pushed };
  } catch (e) {
    syNote('Lỗi: ' + (e && e.message || e));
    saveNow();
    if (manual && typeof toast === 'function') toast('Không đồng bộ được: ' + (e && e.message || e));
    if (typeof render === 'function') render();
    return null;
  } finally { SY.busy = false; }
}

// tự đồng bộ sau mỗi lần lưu (khi còn giao dịch chưa gửi)
function syncSoon() {
  const cfg = syCfg();
  if (!cfg || !cfg.auto || SY.busy || !S.txns.some((t) => !t.sy)) return;
  clearTimeout(SY.timer); SY.timer = setTimeout(() => syncNow(false), 4000);
}
function syncOnOpen() {
  const cfg = syCfg();
  if (cfg && cfg.auto && Date.now() - SY.lastTry > 60000) syncNow(false);
}
