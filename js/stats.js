// Stats tab: monthly workout calendar, day detail list, and a weekly minutes chart.
// Usage from app.js:
//   StatsView.mount({ calendar: $('statsCalendar'), detail: $('statsDayDetail'), chart: $('statsChart') });
//   StatsView.render(logs);   // logs = array of workout records from MoveDB
const StatsView = (() => {
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEKS_IN_CHART = 8;

  const pad = n => String(n).padStart(2, '0');
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keyOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const keyOfTs = ts => keyOf(new Date(ts));
  const sumSec = list => list.reduce((a, w) => a + (Number(w.durationSeconds) || 0), 0);
  const mins = sec => Math.round((Number(sec) || 0) / 60);
  const fmtDuration = sec => {
    const s = Math.round(Number(sec) || 0);
    return `${Math.floor(s / 60)} min ${pad(s % 60)} s`;
  };

  let logs = [];
  let els = {};
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedKey = null;

  function groupByDay() {
    const map = {};
    for (const w of logs) (map[keyOfTs(w.startedAt)] ||= []).push(w);
    return map;
  }

  function renderCalendar() {
    const byDay = groupByDay();
    const todayKey = keyOf(new Date());
    const first = new Date(viewYear, viewMonth, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
      const count = (byDay[key] || []).length;
      const cls = ['cal-cell'];
      if (count) cls.push('cal-has');
      if (key === todayKey) cls.push('cal-today');
      if (key === selectedKey) cls.push('cal-selected');
      const label = `${key}: ${count} workout${count === 1 ? '' : 's'}`;
      cells += `<button class="${cls.join(' ')}" data-key="${key}" aria-label="${label}">${d}${count > 1 ? `<i>${count}</i>` : ''}</button>`;
    }

    const monthLogs = logs.filter(w => {
      const d = new Date(w.startedAt);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    });

    els.calendar.innerHTML = `
      <article class="glass calendar-card">
        <div class="cal-head">
          <button class="cal-nav" data-step="-1" aria-label="Previous month">‹</button>
          <div class="cal-title"><strong>${title}</strong><small>${monthLogs.length} sessions · ${mins(sumSec(monthLogs))} min</small></div>
          <button class="cal-nav" data-step="1" aria-label="Next month">›</button>
        </div>
        <div class="cal-grid cal-dow">${DOW.map(x => `<span>${x}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </article>`;
  }

  function renderDetail() {
    if (!selectedKey) {
      els.detail.innerHTML = '<p class="cal-hint">Tap a date in the calendar to see that day\'s sessions.</p>';
      return;
    }
    const [y, m, d] = selectedKey.split('-').map(Number);
    const title = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const list = (groupByDay()[selectedKey] || []).slice().sort((a, b) => a.startedAt - b.startedAt);
    const items = list.length
      ? list.map(w => `<article class="glass history-item"><strong>${esc(w.routineName)}</strong><small>${new Date(w.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${fmtDuration(w.durationSeconds)}</small></article>`).join('')
      : '<article class="glass history-item"><strong>No workouts</strong><small>Nothing recorded on this day.</small></article>';
    els.detail.innerHTML = `<div class="section-heading"><h3>${title}</h3></div>${items}`;
  }

  function weekStart(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function renderChart() {
    const thisWeek = weekStart(new Date());
    const buckets = [];
    for (let i = WEEKS_IN_CHART - 1; i >= 0; i--) {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const inWeek = logs.filter(w => w.startedAt >= start.getTime() && w.startedAt < end.getTime());
      buckets.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, minutes: mins(sumSec(inWeek)), count: inWeek.length });
    }

    const W = 320, H = 190, base = 150, top = 20;
    const slot = W / WEEKS_IN_CHART, barW = 22;
    const max = Math.max(1, ...buckets.map(b => b.minutes));
    const bars = buckets.map((b, i) => {
      const h = Math.round((b.minutes / max) * (base - top));
      const x = i * slot + (slot - barW) / 2;
      const value = b.minutes ? `<text class="bar-val" x="${x + barW / 2}" y="${base - h - 5}" text-anchor="middle">${b.minutes}</text>` : '';
      return `<rect class="bar" x="${x}" y="${base - h}" width="${barW}" height="${h}" rx="5"><title>${b.label}: ${b.count} sessions, ${b.minutes} min</title></rect>${value}<text x="${x + barW / 2}" y="${H - 10}" text-anchor="middle">${b.label}</text>`;
    }).join('');

    els.chart.innerHTML = `
      <article class="glass chart-card">
        <div class="eyebrow">MINUTES PER WEEK · LAST ${WEEKS_IN_CHART} WEEKS</div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Workout minutes per week">
          <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="rgba(255,255,255,.12)"/>
          ${bars}
        </svg>
      </article>`;
  }

  function render(newLogs) {
    logs = Array.isArray(newLogs) ? newLogs : [];
    if (!els.calendar) return;
    renderCalendar();
    renderDetail();
    renderChart();
  }

  function mount(elements) {
    els = elements;
    els.calendar.addEventListener('click', e => {
      const nav = e.target.closest('.cal-nav');
      if (nav) {
        const d = new Date(viewYear, viewMonth + Number(nav.dataset.step), 1);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        renderCalendar();
        return;
      }
      const cell = e.target.closest('.cal-cell');
      if (cell) {
        // Tapping the selected date again clears the selection.
        selectedKey = selectedKey === cell.dataset.key ? null : cell.dataset.key;
        renderCalendar();
        renderDetail();
      }
    });
  }

  return { mount, render };
})();
