(() => {
  if (window.__ccg) { window.__ccg.show(); return; }

  const KEY = 'ccg-transcript-v1';
  const entries = [];            // { speaker, text, t:Date }
  const seen = new WeakMap();    // caption text element -> entry
  let paused = false;
  let lastSave = 0;

  // ---------- caption discovery ----------
  const TEXT_SEL = '[data-tid="closed-caption-text"]';
  const ITEM_SEL = '.fui-ChatMessageCompact, .ui-chat__item, [role="listitem"], [data-tid="closed-caption-message"]';
  const AUTHOR_SEL = '[data-tid="author"], .ui-chat__message__author, [data-tid="closed-caption-author"]';

  function docs() {
    const list = [document];
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentDocument) list.push(f.contentDocument); } catch (e) { /* cross-origin */ }
    }
    return list;
  }

  const clean = s => (s || '').replace(/\s+/g, ' ').trim();

  function scan() {
    if (paused) return;
    let changed = false, found = 0;
    for (const d of docs()) {
      for (const tn of d.querySelectorAll(TEXT_SEL)) {
        found++;
        const text = clean(tn.textContent);
        if (!text) continue;
        const item = tn.closest(ITEM_SEL) || tn.parentElement;
        const au = item && item.querySelector(AUTHOR_SEL);
        const speaker = clean(au && au.textContent) || 'Unknown';

        let e = seen.get(tn);
        if (!e) {
          // Teams sometimes re-renders a caption as a new element: merge with a recent match
          for (let i = entries.length - 1; i >= Math.max(0, entries.length - 8); i--) {
            const c = entries[i];
            if (c.speaker === speaker && (c.text === text || text.startsWith(c.text) || c.text.startsWith(text))) { e = c; break; }
          }
          if (!e) { e = { speaker, text, t: new Date() }; entries.push(e); changed = true; }
          seen.set(tn, e);
        }
        if (text !== e.text) {
          const stem = e.text.slice(0, Math.min(12, e.text.length));
          if (text.startsWith(stem)) { e.text = text; changed = true; }           // caption grew or got corrected
          else { e = { speaker, text, t: new Date() }; entries.push(e); seen.set(tn, e); changed = true; } // element reused
        }
        if (speaker !== 'Unknown' && e.speaker !== speaker) { e.speaker = speaker; changed = true; }
      }
    }
    captionsVisible = found > 0;
    if (changed) { render(); save(); } else if (captionsVisible !== lastVisible) render();
    lastVisible = captionsVisible;
  }
  let captionsVisible = false, lastVisible = null;

  // ---------- output ----------
  const hhmm = t => String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');

  function transcript() {
    const blocks = [];
    for (const e of entries) {
      const last = blocks[blocks.length - 1];
      if (last && last.speaker === e.speaker) last.lines.push(e.text);
      else blocks.push({ speaker: e.speaker, t: e.t, lines: [e.text] });
    }
    const first = entries[0] ? entries[0].t : new Date();
    const head = 'Teams call transcript (live captions) – ' + first.toLocaleDateString() + ' ' + hhmm(first) + '\n\n';
    return head + blocks.map(b => '[' + hhmm(b.t) + '] ' + b.speaker + ': ' + b.lines.join(' ')).join('\n\n') + '\n';
  }

  function save(force) {
    const now = Date.now();
    if (!force && now - lastSave < 3000) return;
    lastSave = now;
    try { localStorage.setItem(KEY, JSON.stringify({ at: now, entries: entries.map(e => [e.speaker, e.text, e.t.getTime()]) })); } catch (e) {}
  }

  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.entries && s.entries.length && Date.now() - s.at < 24 * 3600e3) return s;
    } catch (e) {}
    return null;
  }

  async function copy() {
    const txt = transcript();
    try { await navigator.clipboard.writeText(txt); flash('Copied ' + entries.length + ' lines'); return; } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    flash(ok ? 'Copied ' + entries.length + ' lines' : 'Copy blocked – use Download');
  }

  function download() {
    const blob = new Blob([transcript()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    const d = entries[0] ? entries[0].t : new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'teams-transcript-' + d.toISOString().slice(0, 10) + '-' + hhmm(d).replace(':', '') + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- panel (DOM APIs only: Teams enforces Trusted Types) ----------
  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    Object.assign(n.style, css || {});
    if (text != null) n.textContent = text;
    return n;
  };
  const btnCss = { font: '600 12px/1 system-ui,sans-serif', padding: '8px 10px', border: '1px solid #4a4f63', borderRadius: '6px', background: '#2a2e3d', color: '#f3f3f6', cursor: 'pointer' };
  const btn = (label, fn, primary) => {
    const b = el('button', Object.assign({}, btnCss, primary ? { background: '#f2c94c', color: '#1b1d27', borderColor: '#f2c94c' } : {}), label);
    b.addEventListener('click', fn);
    return b;
  };

  const panel = el('div', { position: 'fixed', right: '16px', bottom: '88px', zIndex: '2147483647', width: '270px', background: '#1b1d27', color: '#f3f3f6', border: '1px solid #3a3e52', borderRadius: '10px', boxShadow: '0 8px 28px rgba(0,0,0,.45)', font: '13px/1.4 system-ui,sans-serif', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' });
  const top = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', userSelect: 'none', touchAction: 'none', margin: '-12px -12px 0', padding: '12px 12px 4px' });
  top.title = 'Drag to move';
  const title = el('div', { fontWeight: '700' }, 'Caption Grabber');
  const close = el('button', { background: 'none', border: 'none', color: '#a8abbb', fontSize: '18px', cursor: 'pointer', lineHeight: '1' }, '×');
  close.title = 'Hide panel (keeps recording – click the bookmark to show again)';
  close.addEventListener('click', () => { panel.style.display = 'none'; });
  top.append(title, close);

  const status = el('div', { fontSize: '12px', color: '#c9cbd6' });
  const last = el('div', { fontSize: '12px', color: '#f2c94c', background: '#11131a', borderRadius: '6px', padding: '6px 8px', minHeight: '18px', maxHeight: '54px', overflow: 'hidden' });
  const row1 = el('div', { display: 'flex', gap: '6px' });
  const row2 = el('div', { display: 'flex', gap: '6px', flexWrap: 'wrap' });
  const copyB = btn('Copy transcript', copy, true); copyB.style.flex = '1';
  const dlB = btn('Download .txt', download);
  const pauseB = btn('Pause', () => { paused = !paused; pauseB.textContent = paused ? 'Resume' : 'Pause'; render(); });
  const clearArm = { on: false };
  const clearB = btn('Clear', () => {
    if (!clearArm.on) { clearArm.on = true; clearB.textContent = 'Click again to clear'; setTimeout(() => { clearArm.on = false; clearB.textContent = 'Clear'; }, 3000); return; }
    entries.length = 0; clearArm.on = false; clearB.textContent = 'Clear'; save(true); render();
  });
  row1.append(copyB, dlB);
  row2.append(pauseB, clearB);

  const saved = loadSaved();
  let restoreB = null;
  if (saved) {
    restoreB = btn('Restore earlier (' + saved.entries.length + ')', () => {
      const old = saved.entries.map(([speaker, text, t]) => ({ speaker, text, t: new Date(t) }));
      entries.unshift(...old);
      restoreB.remove(); render(); save(true);
    });
    row2.append(restoreB);
  }

  const toast = el('div', { fontSize: '12px', color: '#7ee2a8', minHeight: '0' });
  panel.append(top, status, last, row1, row2, toast);
  document.body.appendChild(panel);

  // ---------- drag by the title bar; position remembered per browser ----------
  const POS_KEY = 'ccg-pos-v1';
  function place(x, y) {
    const w = panel.offsetWidth, h = panel.offsetHeight;
    x = Math.min(Math.max(0, x), window.innerWidth - w);
    y = Math.min(Math.max(0, y), window.innerHeight - h);
    Object.assign(panel.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    return { x, y };
  }
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p) place(p.x, p.y); } catch (e) {}
  let drag = null;
  top.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || ev.target === close) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, id: ev.pointerId };
    top.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  top.addEventListener('pointermove', ev => {
    if (drag && ev.pointerId === drag.id) drag.pos = place(ev.clientX - drag.dx, ev.clientY - drag.dy);
  });
  const endDrag = ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (drag.pos) { try { localStorage.setItem(POS_KEY, JSON.stringify(drag.pos)); } catch (e) {} }
    drag = null;
  };
  top.addEventListener('pointerup', endDrag);
  top.addEventListener('pointercancel', endDrag);
  // keep it on screen when the window shrinks
  window.addEventListener('resize', () => { if (panel.style.left) place(panel.offsetLeft, panel.offsetTop); });

  let toastTimer;
  function flash(msg) { toast.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.textContent = ''; }, 3000); }

  function render() {
    const n = entries.length;
    if (paused) status.textContent = '⏸ Paused · ' + n + ' lines';
    else if (!captionsVisible) status.textContent = '⚠ No captions on screen. Turn on: More (…) → Language and speech → Show live captions · ' + n + ' lines';
    else status.textContent = '● Capturing · ' + n + ' lines';
    const e = entries[n - 1];
    last.textContent = e ? e.speaker + ': ' + e.text : 'Waiting for the first caption…';
  }

  // MutationObserver fires even when the tab is in the background (timers get throttled)
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  const iv = setInterval(scan, 1000);
  window.addEventListener('beforeunload', () => save(true));

  window.__ccg = { show: () => { panel.style.display = 'flex'; }, entries, transcript, stop: () => { mo.disconnect(); clearInterval(iv); } };
  scan(); render();
})();
