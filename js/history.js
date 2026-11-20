// History tab: completed sessions grouped by month. Each month header shows its session count
// and total minutes. Each session shows its duration as a pill, a delete pill button, and a bar.
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

  function mount(container, opts = {}) {
    el = container;
    if (opts.onDelete) onDelete = opts.onDelete;
    if (el) {
      el.addEventListener('click', e => {
        const btn = e.target.closest('.del-pill');
        if (!btn) return;
        const id = btn.dataset.id;
        if (id && confirm('Delete this workout log?')) onDelete(id);
      });
    }
  }

  function render(logs) {
    if (!el) return;
    if (!logs || !logs.length) {
      el.innerHTML = '<article class="glass history-item"><strong>No workouts yet</strong><small>Your completed sessions will appear here.</small></article>';
      return;
    }

    const groups = {};
    for (const w of logs) (groups[monthKey(w.startedAt)] ||= []).push(w);
    const longest = Math.max(1, ...logs.map(w => Number(w.durationSeconds) || 0));
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
        const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const reps = w.reps ? ` · ${w.reps} reps each` : '';
        const sync = w.syncStatus === 'synced' ? '' : ' · pending sync';
        return `<article class="glass hist-session">
          <div class="hist-top">
            <div><strong>${esc(w.routineName)}</strong><small>${date} · ${time}${reps}${sync}</small></div>
            <div class="hist-pills">
              <span class="dur-pill">${fmtDuration(sec)}</span>
              <button type="button" class="del-pill" data-id="${esc(w.id)}" aria-label="Delete log">Delete</button>
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
