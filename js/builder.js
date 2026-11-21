// In-app Routine Builder. Saves routines to localStorage under BUILDER_KEY.
// Built routines are merged with sheet routines in RoutinesView.
// Each routine: { name, items[] }
// Each item: { order, name, duration, rest, side, sideLabel, target, reps, image, notes }
const RoutineBuilder = (() => {
  const BUILDER_KEY = 'move-custom-routines';
  const SIDE_OPTIONS = [
    { value: 'None',  label: 'Timed hold' },
    { value: 'LR30',  label: 'Right 30s · Left 30s' },
    { value: 'Count', label: 'Tap count (reps)' }
  ];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Storage ---------- */
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(BUILDER_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveAll(map) {
    localStorage.setItem(BUILDER_KEY, JSON.stringify(map));
  }
  function getRoutine(name) { return loadAll()[name] || null; }
  function saveRoutine(r) {
    const map = loadAll();
    map[r.name] = r;
    saveAll(map);
  }
  function deleteRoutine(name) {
    const map = loadAll();
    delete map[name];
    saveAll(map);
    // Sync deletion to the sheet (fire-and-forget).
    if (typeof MoveAPI !== 'undefined') {
      MoveAPI.deleteRoutine(name).catch(() => {});
    }
  }
  // Returns all custom routines in the same shape as RoutinesView expects.
  function allRoutines() { return loadAll(); }

  /* ---------- State ---------- */
  let el = null;
  let onRoutinesSaved = () => {};
  let editingName = null;   // null = new routine
  let items = [];           // exercise rows being edited

  /* ---------- Render ---------- */
  function sideLabel(side) {
    return SIDE_OPTIONS.find(o => o.value === side)?.label || 'Timed hold';
  }

  function renderList() {
    const map = loadAll();
    const names = Object.keys(map);
    const listHtml = names.length
      ? names.map(n => `
          <article class="glass routine-card builder-entry" data-name="${esc(n)}">
            <div class="routine-symbol">✦</div>
            <div><strong>${esc(n)}</strong><small>${map[n].items.length} exercises · custom</small></div>
            <div class="builder-actions">
              <button class="text-btn builder-edit" data-name="${esc(n)}">Edit</button>
              <button class="text-btn builder-del" data-name="${esc(n)}" style="color:#ff8080">✕</button>
            </div>
          </article>`).join('')
      : '<p class="cal-hint">No custom routines yet. Tap <strong>+ New routine</strong> below.</p>';

    el.innerHTML = `
      <div class="section-heading" style="margin-top:14px">
        <h3>Custom routines</h3>
        <button class="text-btn" id="builderNew">+ New routine</button>
      </div>
      <div id="builderList">${listHtml}</div>
      <div id="builderForm" hidden></div>`;

    el.querySelector('#builderNew').onclick = () => openForm(null);
    el.querySelectorAll('.builder-edit').forEach(b =>
      b.onclick = () => openForm(b.dataset.name));
    el.querySelectorAll('.builder-del').forEach(b =>
      b.onclick = () => {
        if (!confirm(`Delete "${b.dataset.name}"?`)) return;
        deleteRoutine(b.dataset.name);
        onRoutinesSaved();
        renderList();
      });
  }

  function openForm(name) {
    editingName = name;
    const r = name ? getRoutine(name) : null;
    items = r ? r.items.map(i => ({ ...i })) : [];
    renderForm();
    el.querySelector('#builderForm').hidden = false;
    el.querySelector('#builderForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderForm() {
    const form = el.querySelector('#builderForm');
    const nameVal = editingName || '';

    const rowsHtml = items.map((ex, idx) => `
      <article class="glass ex-row builder-row" data-idx="${idx}">
        <div class="ex-thumb ex-thumb-empty">${idx + 1}</div>
        <div class="ex-info" style="flex:1">
          <input class="builder-input" data-field="name" data-idx="${idx}" placeholder="Exercise name" value="${esc(ex.name)}" style="width:100%">
          <div class="builder-row-meta">
            <select class="builder-select" data-field="side" data-idx="${idx}">
              ${SIDE_OPTIONS.map(o => `<option value="${o.value}"${ex.side===o.value?' selected':''}>${o.label}</option>`).join('')}
            </select>
            <input class="builder-input builder-num" data-field="duration" data-idx="${idx}" type="number" min="1" max="3600" placeholder="Sec" value="${ex.duration||30}" title="Duration (s)">
            <input class="builder-input builder-num" data-field="rest" data-idx="${idx}" type="number" min="0" max="300" placeholder="Rest" value="${ex.rest||0}" title="Rest (s)">
          </div>
          <input class="builder-input" data-field="image" data-idx="${idx}" placeholder="Image / GIF URL (optional)" value="${esc(ex.image||'')}" style="width:100%;margin-top:6px">
          <input class="builder-input" data-field="notes" data-idx="${idx}" placeholder="Notes (optional)" value="${esc(ex.notes||'')}" style="width:100%;margin-top:6px">
        </div>
        <div class="builder-row-btns">
          ${idx > 0 ? `<button class="text-btn builder-up" data-idx="${idx}">↑</button>` : ''}
          ${idx < items.length - 1 ? `<button class="text-btn builder-dn" data-idx="${idx}">↓</button>` : ''}
          <button class="text-btn builder-rm" data-idx="${idx}" style="color:#ff8080">✕</button>
        </div>
      </article>`).join('');

    form.innerHTML = `
      <article class="glass rep-picker" style="margin-top:16px">
        <div class="eyebrow">${editingName ? 'EDIT ROUTINE' : 'NEW ROUTINE'}</div>
        <input class="builder-input builder-name-input" id="builderNameInput" placeholder="Routine name" value="${esc(nameVal)}" style="width:100%;margin:12px 0 16px">
        <div id="builderRows">${rowsHtml}</div>
        <button class="secondary-btn" id="builderAddEx" style="width:100%;margin-top:12px;padding:12px">+ Add exercise</button>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="primary-btn" id="builderSave" style="flex:1;margin-top:0">SAVE ROUTINE</button>
          <button class="secondary-btn" id="builderCancel" style="flex:0 0 80px;padding:14px 8px">Cancel</button>
        </div>
      </article>`;

    bindFormEvents(form);
  }

  function bindFormEvents(form) {
    // Live field edits.
    form.querySelectorAll('.builder-input, .builder-select').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.idx);
        const field = inp.dataset.field;
        if (isNaN(idx) || !field) return;
        let val = inp.value;
        if (field === 'duration' || field === 'rest') val = Math.max(0, Number(val) || 0);
        items[idx][field] = val;
        if (field === 'side') items[idx].sideLabel = sideLabel(val);
      });
    });

    form.querySelector('#builderAddEx').onclick = () => {
      items.push({ order: items.length + 1, name: '', duration: 30, rest: 0, side: 'None', sideLabel: 'Timed hold', target: 100, reps: 0, image: '', notes: '' });
      renderForm();
    };

    form.querySelectorAll('.builder-up').forEach(b =>
      b.onclick = () => { const i = Number(b.dataset.idx); [items[i-1],items[i]] = [items[i],items[i-1]]; renderForm(); });
    form.querySelectorAll('.builder-dn').forEach(b =>
      b.onclick = () => { const i = Number(b.dataset.idx); [items[i],items[i+1]] = [items[i+1],items[i]]; renderForm(); });
    form.querySelectorAll('.builder-rm').forEach(b =>
      b.onclick = () => { items.splice(Number(b.dataset.idx), 1); renderForm(); });

    form.querySelector('#builderCancel').onclick = () => {
      form.hidden = true;
      editingName = null;
      items = [];
    };

    form.querySelector('#builderSave').onclick = () => {
      const nameInput = form.querySelector('#builderNameInput');
      const name = nameInput.value.trim();
      const t = typeof toast === 'function' ? toast : m => alert(m);
      if (!name) { nameInput.focus(); t('Enter a routine name.'); return; }
      if (!items.length) { t('Add at least one exercise.'); return; }
      const invalid = items.find(i => !i.name.trim());
      if (invalid) { t('All exercises need a name.'); return; }
      // If renaming, delete the old key.
      if (editingName && editingName !== name) deleteRoutine(editingName);
      const routine = {
        name,
        items: items.map((ex, idx) => ({
          ...ex,
          order: idx + 1,
          name: ex.name.trim(),
          duration: Math.max(1, Number(ex.duration) || 30),
          rest: Math.max(0, Number(ex.rest) || 0),
          target: ex.side === 'Count' ? Math.max(1, Number(ex.duration) || 100) : 100,
          sideLabel: sideLabel(ex.side)
        }))
      };
      // Rename: delete old name from sheet first.
      if (editingName && editingName !== name && typeof MoveAPI !== 'undefined') {
        MoveAPI.deleteRoutine(editingName).catch(() => {});
      }
      saveRoutine(routine);
      editingName = null;
      items = [];
      form.hidden = true;
      onRoutinesSaved();
      renderList();
      if (typeof toast === 'function') toast(`"${name}" saved.`);
      // Sync new/updated routine to the sheet (fire-and-forget).
      if (typeof MoveAPI !== 'undefined') {
        const sheetRows = routine.items.map(ex => ({
          Order: ex.order, Exercise: ex.name,
          Duration_s: ex.duration, Rest_s: ex.rest,
          Side: ex.side, Reps: ex.reps,
          Image_URL: ex.image || '', Notes: ex.notes || ''
        }));
        MoveAPI.saveRoutineRows(routine.name, sheetRows)
          .then(() => { if (typeof toast === 'function') toast(`"${name}" synced to sheet.`); })
          .catch(() => { if (typeof toast === 'function') toast(`"${name}" saved locally · sheet sync pending.`); });
      }
    };
  }

  function mount(container, handlers = {}) {
    el = container;
    onRoutinesSaved = handlers.onRoutinesSaved || (() => {});
    renderList();
  }

  return { mount, allRoutines, renderList };
})();
