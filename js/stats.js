// Calendar and chart used on the Home and Stats tabs.
// Each mount() call creates its own calendar instance with its own visible month and selected day.
// Stats calendar exposes onMonthChange so app.js can filter summary cards to match.
const StatsView = (() => {
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEKS_IN_CHART = 8;

  const pad = n => String(n).padStart(2, '0');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keyOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const keyOfTs = ts => keyOf(new Date(ts));
  const sumSec = list => list.reduce((a, w) => a + (Number(w.durationSeconds) || 0), 0);
  const mins = sec => Math.round((Number(sec) || 0) / 60);
  const fmtDuration = sec => {
    const s = Math.round(Number(sec) || 0);
    return `${Math.floor(s / 60)} min ${pad(s % 60)} s`;
  };
  const inMonth = (ts, year, month) => {
    const d = new Date(ts);
    return d.getFullYear() === year && d.getMonth() === month;
  };

  let logs = [];
  const calendars = [];
  let chartEl = null;
  let exerciseEl = null;       // year breakdown
  let exerciseMonthEl = null;  // month breakdown
  let statsYear2 = new Date().getFullYear();
  let statsMonth2 = new Date().getMonth();

  function groupByDay() {
    const map = {};
    for (const w of logs) (map[keyOfTs(w.startedAt)] ||= []).push(w);
    return map;
  }

  // One calendar instance. Holds its own visible month and selected day.
  // opts.onMonthChange(year, month) is called whenever the user navigates months.
  function createCalendar(els, opts = {}) {
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();
    let selectedKey = null;

    function renderCalendar() {
      const byDay = groupByDay();
      const todayKey = keyOf(new Date());
      const first = new Date(viewYear, viewMonth, 1);
      const lead = (first.getDay() + 6) % 7;
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

      const monthLogs = logs.filter(w => inMonth(w.startedAt, viewYear, viewMonth));

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
      if (!els.detail) return;
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

    function refresh() {
      renderCalendar();
      renderDetail();
    }

    els.calendar.addEventListener('click', e => {
      const nav = e.target.closest('.cal-nav');
      if (nav) {
        const d = new Date(viewYear, viewMonth + Number(nav.dataset.step), 1);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        renderCalendar();
            if (opts.onMonthChange) opts.onMonthChange(viewYear, viewMonth);
        return;
      }
      const cell = e.target.closest('.cal-cell');
      if (cell) {
        selectedKey = selectedKey === cell.dataset.key ? null : cell.dataset.key;
        refresh();
      }
    });

    return { refresh };
  }

  function parseDetails(w) {
    if (Array.isArray(w.details)) return w.details;
    try { const v = JSON.parse(w.details || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }

  function buildExerciseAgg(subset) {
    const agg = {};
    for (const w of subset) {
      for (const d of parseDetails(w)) {
        const name = String(d.name || 'Unnamed');
        const a = (agg[name] ||= { name, seconds: 0, taps: 0, sessions: 0 });
        a.seconds += Number(d.seconds) || 0;
        a.taps += Number(d.taps) || 0;
        a.sessions++;
      }
    }
    return Object.values(agg).sort((a, b) => (b.seconds - a.seconds) || (b.taps - a.taps));
  }

  function renderExBars(el, rows, title) {
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<article class="glass chart-card"><div class="eyebrow">${title}</div><p class="cal-hint">No data yet for this period.</p></article>`;
      return;
    }
    const maxSec = Math.max(1, ...rows.map(r => r.seconds));
    const items = rows.map(r => {
      const pct = Math.round((r.seconds / maxSec) * 100);
      const value = r.seconds ? fmtDuration(r.seconds) : `${r.taps} taps`;
      return `<div class="ex-bar-row">
        <div class="ex-bar-label"><strong>${esc(r.name)}</strong><small>${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'}</small></div>
        <span class="ex-bar-value">${value}</span>
        <div class="ex-bar-track"><div class="ex-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    el.innerHTML = `<article class="glass chart-card"><div class="eyebrow">${title}</div><div class="ex-bars">${items}</div></article>`;
  }

  function renderExercises() {
    // Fix 6: month breakdown above, year breakdown below.
    const monthLogs = logs.filter(w => inMonth(w.startedAt, statsYear2, statsMonth2));
    const yearLogs = logs.filter(w => new Date(w.startedAt).getFullYear() === statsYear2);
    const mLabel = new Date(statsYear2, statsMonth2, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    renderExBars(exerciseMonthEl, buildExerciseAgg(monthLogs), `TIME PER EXERCISE · ${mLabel.toUpperCase()}`);
    renderExBars(exerciseEl, buildExerciseAgg(yearLogs), `TIME PER EXERCISE · ${statsYear2}`);
  }

  function weekStart(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function renderChart() {
    if (!chartEl) return;
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

    chartEl.innerHTML = `
      <article class="glass chart-card">
        <div class="eyebrow">MINUTES PER WEEK · LAST ${WEEKS_IN_CHART} WEEKS</div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Workout minutes per week">
          <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="rgba(255,255,255,.12)"/>
          ${bars}
        </svg>
      </article>`;
  }

  // elements: { calendar, detail?, chart?, exercises?, onMonthChange? }
  function mount(elements) {
    if (elements.calendar) calendars.push(createCalendar(elements, { onMonthChange: elements.onMonthChange }));
    if (elements.chart) chartEl = elements.chart;
    if (elements.exercises) exerciseEl = elements.exercises;
    if (elements.exercisesMonth) exerciseMonthEl = elements.exercisesMonth;
  }

  function render(newLogs) {
    logs = Array.isArray(newLogs) ? newLogs : [];
    calendars.forEach(c => c.refresh());
    renderChart();
    renderExercises();
  }

  // Sessions and minutes for a given month (defaults to current month).
  function monthSummary(newLogs, year, month) {
    const now = new Date();
    const y = year !== undefined ? year : now.getFullYear();
    const m = month !== undefined ? month : now.getMonth();
    const list = (newLogs || []).filter(w => inMonth(w.startedAt, y, m));
    return { count: list.length, minutes: mins(sumSec(list)) };
  }

  function setStatsMonth(year, month) {
    statsYear2 = year;
    statsMonth2 = month;
    renderExercises();
  }

  return { mount, render, monthSummary, setStatsMonth };
})();
