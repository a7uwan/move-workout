// History tab: completed sessions grouped by month, with delete button on each entry.
const HistoryView = (() => {
  let el = null;
  let onDelete = () => {};

  const pad = n => String(n).padStart(2, '0');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthKey = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const fmtDuration = sec => {
    const s = Math.round(Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (!m) return `${r} s`;
    return r ? `${m} min ${pad(r)} s` : `${m} min`;
  };

  function mount(container, handlers = {}) {
    el = container;
    onDelete = handlers.onDelete || (() => {});
    el.addEventListener('click', async e => {
      const btn = e.target.closest('.del-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm('Remove this session from history?')) return;
      await MoveDB.deleteWorkout(id);
      // Fix 4: mark deleted locally AND remove from the sheet so it never reappears.
      if (typeof markDeleted === 'function') markDeleted(id);
      try { await MoveAPI.deleteWorkout(id); } catch (_) {}
      onDelete();
    });
  }

  function render(logs, filterYear) {
    if (!el) return;
    // Apply year filter if provided.
    const filtered = filterYear
      ? (logs || []).filter(w => new Date(w.startedAt).getFullYear() === Number(filterYear))
      : (logs || []);
    if (!filtered.length) {
      el.innerHTML = '<article class="glass history-item"><strong>No workouts yet</strong><small>Your completed sessions will appear here.</small></article>';
      return;
    }
    const logs2 = filtered; // alias for readability

    const groups = {};
    for (const w of logs2) (groups[monthKey(w.startedAt)] ||= []).push(w);
    const longest = Math.max(1, ...logs2.map(w => Number(w.durationSeconds) || 0));
    const monthKeys = Object.keys(groups).sort().reverse();

    el.innerHTML = monthKeys.map(key => {
      const list = groups[key].slice().sort((a, b) => b.startedAt - a.startedAt);
      const totalSec = list.reduce((a, w) => a + (Number(w.durationSeconds) || 0), 0);
      const [y, m] = key.split('-').map(Number);
      const title = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const count = list.length;

      const items = list.map(w => {
        const sec = Number(w.durationSeconds) || 0;
        const pct = Math.max(4, Math.round((sec / longest) * 100));
        const when = new Date(w.startedAt);
        const date = when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
        const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
        const reps = w.reps ? ` · ${w.reps} reps` : '';
        const sync = w.syncStatus === 'synced' ? '' : ' · pending sync';
        return `<article class="glass hist-session">
          <div class="hist-top">
            <div>
              <strong>${esc(w.routineName)}</strong>
              <small class="hist-meta"><span class="hist-time">${time}</span> · ${date} · ${fmtDuration(sec)}${reps}${sync}</small>
            </div>
            <div class="hist-top-right">
              <span class="dur-pill">${fmtDuration(sec)}</span>
              <button class="del-btn" data-id="${esc(w.id)}" aria-label="Delete this session">✕</button>
            </div>
          </div>
          <div class="dur-track"><div class="dur-fill" style="width:${pct}%"></div></div>
        </article>`;
      }).join('');

      return `<section class="hist-month">
        <div class="hist-month-head">
          <div><strong>${title}</strong><small>${count} ${count === 1 ? 'session' : 'sessions'} · ${Math.round(totalSec / 60)} min total</small></div>
        </div>
        ${items}
      </section>`;
    }).join('');
  }

  return { mount, render };
})();
