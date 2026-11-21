// Workout tab: routines loaded from the Routines sheet, exercise preview, and the rep picker.
// Sheet format, one row per exercise:
//   Routine | Order | Exercise | Duration_s | Rest_s | Side | Reps | Image_URL | Notes
// Side: LR30 (Right 30s / Left 30s, Duration_s is the total for both sides) or None (timed hold).
// Reps in the sheet is the default. The rep picker on this tab overrides it for the session.
const RoutinesView = (() => {
  const CACHE_KEY = 'move-routines-cache';
  const REP_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
  const fmtTime = sec => {
    const s = Math.round(Number(sec) || 0);
    const totalMin = Math.floor(s / 60);
    const r = s % 60;
    if (!totalMin) return `${r} s`;
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60), m = totalMin % 60;
      return m ? `${h}h ${m}m ${r}s` : `${h}h ${r}s`;
    }
    return r ? `${totalMin} min ${r} s` : `${totalMin} min`;
  };

  let routines = {};        // name -> { name, items }
  let els = {};
  let onStart = () => {};
  let selectedName = null;
  let selectedReps = 0;

  // Groups sheet rows by Routine and sorts each group by Order.
  function normalize(rows) {
    const groups = {};
    for (const r of rows) {
      const name = String(r.Routine || '').trim();
      const exercise = String(r.Exercise || '').trim();
      if (!name || !exercise) continue;
      const rawSide = String(r.Side || 'None').trim().toUpperCase();
      // Parse LR<N> dynamically: LR30, LR40, LR45, etc. Each side = N seconds.
      const lrMatch = rawSide.match(/^LR(\d+)$/);
      const side = lrMatch ? 'LR' : rawSide === 'COUNT' ? 'Count' : 'None';
      const lrN = lrMatch ? Math.max(1, parseInt(lrMatch[1], 10)) : 30;
      // For LR sides: total duration = 2×N regardless of Duration_s column.
      const duration = side === 'LR'
        ? lrN * 2
        : Math.max(1, Number(r.Duration_s) || 30);
      const item = {
        order: Number(r.Order) || 0,
        name: exercise,
        duration,
        lrN,
        rest: Math.max(0, Number(r.Rest_s) || 0),
        side,
        sideLabel: side === 'LR' ? `Right ${lrN}s · Left ${lrN}s` : side === 'Count' ? 'Tap each rep' : 'Timed hold',
        target: Math.max(1, Number(r.Duration_s) || 100),
        reps: Number(r.Reps) > 0 ? Math.round(Number(r.Reps)) : 0, // 0 = use the rep picker
        image: safeUrl(r.Image_URL),
        notes: String(r.Notes || '').trim()
      };
      (groups[name] ||= []).push(item);
    }
    const out = {};
    for (const name of Object.keys(groups)) {
      out[name] = { name, items: groups[name].sort((a, b) => a.order - b.order) };
    }
    return out;
  }

  function renderList() {
    const names = Object.keys(routines);
    els.list.innerHTML = names.length
      ? names.map(n => {
          const r = routines[n];
          const oneRep = fmtTime(WorkoutEngine.plannedSeconds(r.items, 1));
          return `<article class="glass routine-card" data-name="${esc(n)}">
            <div class="routine-symbol">✧</div>
            <div><strong>${esc(n)}</strong><small>${r.items.length} exercises · ${oneRep} at 1 rep each</small></div>
            <button class="routine-start" aria-label="Open ${esc(n)}">›</button>
          </article>`;
        }).join('')
      : '<article class="glass history-item"><strong>No routines found</strong><small>Add rows to the Routines sheet, then refresh.</small></article>';
  }

  function renderDetail() {
    const r = routines[selectedName];
    if (!r) { els.detail.innerHTML = ''; return; }

    const lrCount = r.items.filter(i => i.side === 'LR30').length;
    const timedCount = r.items.length - lrCount;

    const rows = r.items.map((ex, i) => `
      <article class="glass ex-row">
        ${ex.image
          ? `<img class="ex-thumb" src="${esc(ex.image)}" alt="" loading="lazy">`
          : `<div class="ex-thumb ex-thumb-empty">${i + 1}</div>`}
        <div class="ex-info">
          <strong>${i + 1}. ${esc(ex.name)}</strong>
          <small>${esc(ex.sideLabel)} · ${ex.side === 'Count' ? `${ex.target} reps` : fmtTime(ex.duration)} · rest ${ex.rest} s${ex.reps ? ` · ${ex.reps} rounds` : ' · picker rounds'}</small>
          ${ex.notes ? `<small class="ex-notes">${esc(ex.notes)}</small>` : ''}
        </div>
      </article>`).join('');

    const chips = REP_CHOICES.map(n =>
      `<button class="rep-chip${n === selectedReps ? ' selected' : ''}" data-reps="${n}">${n}</button>`).join('');

    const total = selectedReps
      ? `Estimated total: ${fmtTime(WorkoutEngine.plannedSeconds(r.items, selectedReps))}`
      : 'Choose reps to see the estimated total.';

    els.detail.innerHTML = `
      <article class="glass routine-summary">
        <div class="eyebrow">ROUTINE</div>
        <h3>${esc(r.name)}</h3>
        <p>${r.items.length} exercises · ${lrCount} with right/left sides · ${timedCount} timed holds</p>
      </article>
      <div class="section-heading"><h3>Exercises</h3></div>
      <div class="ex-list">${rows}</div>
      <article class="glass rep-picker">
        <div class="eyebrow">REPS PER EXERCISE</div>
        <div class="rep-grid">${chips}</div>
        <p class="rep-note">Each exercise repeats this many times before the next one starts.</p>
        <p class="rep-total">${total}</p>
        <button class="primary-btn" id="routineStart" ${selectedReps ? '' : 'disabled'}>START WORKOUT <span>→</span></button>
        ${selectedReps ? '' : '<p class="rep-hint">Select the number of reps to enable START WORKOUT.</p>'}
      </article>`;
  }

  function setRows(rows) {
    routines = normalize(rows || []);
    if (selectedName && !routines[selectedName]) { selectedName = null; selectedReps = 0; }
    if (!els.list) return;
    renderList();
    renderDetail();
  }

  // Loads routines from the sheet. Falls back to the last good copy on this device when offline.
  async function load() {
    let rows;
    try {
      const res = await MoveAPI.getRoutines();
      rows = res.routines || [];
      localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (err) {
      console.warn('MOVE routines load failed, using cache:', err.message);
      try { rows = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch (_) { rows = []; }
    }
    setRows(rows);
    return routines;
  }

  // onStart receives { name, items, reps } once the user has picked reps and tapped START WORKOUT.
  function mount(elements, handlers = {}) {
    els = elements;
    onStart = handlers.onStart || (() => {});

    els.list.addEventListener('click', e => {
      const card = e.target.closest('[data-name]');
      if (!card) return;
      selectedName = card.dataset.name;
      selectedReps = 0;
      renderDetail();
      els.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    els.detail.addEventListener('click', e => {
      const chip = e.target.closest('.rep-chip');
      if (chip) {
        selectedReps = Number(chip.dataset.reps);
        // Fix 3: always update chip highlight + recalculate estimated total.
        els.detail.querySelectorAll('.rep-chip').forEach(c =>
          c.classList.toggle('selected', Number(c.dataset.reps) === selectedReps));
        const r = routines[selectedName];
        // Always recalculate, whether or not the element already existed.
        let totalEl = els.detail.querySelector('.rep-total');
        if (!totalEl) {
          // First click: insert the total paragraph before the start button.
          const startBtn = els.detail.querySelector('#routineStart');
          if (startBtn) {
            totalEl = document.createElement('p');
            totalEl.className = 'rep-total';
            startBtn.parentNode.insertBefore(totalEl, startBtn);
          }
        }
        if (r && totalEl) totalEl.textContent = `Estimated total: ${fmtTime(WorkoutEngine.plannedSeconds(r.items, selectedReps))}`;
        const startBtn = els.detail.querySelector('#routineStart');
        const hintEl = els.detail.querySelector('.rep-hint');
        if (startBtn) startBtn.disabled = false;
        if (hintEl) hintEl.remove();
        return;
      }
      if (e.target.closest('#routineStart') && selectedReps) {
        const r = routines[selectedName];
        if (r) {
          // Rep picker value overrides sheet Reps for every exercise in this session.
          const items = r.items.map(ex => ({ ...ex, reps: 0 }));
          onStart({ name: r.name, items, reps: selectedReps });
        }
      }
    });
  }

  // Merges additional rows (from the in-app builder) without re-fetching from the sheet.
  function mergeCustomRows(rows) {
    const extra = normalize(rows);
    Object.assign(routines, extra);
    if (!els.list) return;
    renderList();
    renderDetail();
  }

  return { mount, load, setRows, mergeCustomRows };
})();
