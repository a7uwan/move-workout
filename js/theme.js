// MOVE Dark / Light mode toggle — persists in localStorage.
const ThemePicker = (() => {
  const KEY = 'move-theme';

  function applyMode(mode) {
    document.documentElement.dataset.theme = mode;
    // Clear any inline background from the old multi-theme picker.
    document.body.style.background = '';
    document.body.style.backgroundAttachment = '';
    // Update toggle button icon if present.
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = mode === 'light' ? '☀️' : '🌙';
    // Keep chips in sync if drawer is ever opened.
    document.querySelectorAll('.theme-chip').forEach(c =>
      c.classList.toggle('selected', c.dataset.theme === mode));
  }

  function init() {
    const saved = localStorage.getItem(KEY) || 'dark';
    applyMode(saved);

    // Build a minimal two-option grid inside the existing drawer.
    const grid = document.getElementById('themeGrid');
    if (grid) {
      grid.innerHTML = `
        <button class="theme-chip${saved === 'dark' ? ' selected' : ''}" data-theme="dark">
          <span class="theme-swatch theme-swatch-dark"></span>
          <small>Dark</small>
        </button>
        <button class="theme-chip${saved === 'light' ? ' selected' : ''}" data-theme="light">
          <span class="theme-swatch theme-swatch-light"></span>
          <small>Light</small>
        </button>`;
      grid.style.gridTemplateColumns = 'repeat(2,1fr)';
      grid.addEventListener('click', e => {
        const chip = e.target.closest('.theme-chip');
        if (!chip) return;
        const mode = chip.dataset.theme;
        localStorage.setItem(KEY, mode);
        applyMode(mode);
        // Close drawer.
        const drawer = document.getElementById('themeDrawer');
        if (drawer) drawer.hidden = true;
      });
    }

    const btn = document.getElementById('themeBtn');
    const drawer = document.getElementById('themeDrawer');
    const close = document.getElementById('themeClose');
    if (btn) btn.onclick = () => {
      // Simple toggle on button tap — no need to open drawer.
      const current = localStorage.getItem(KEY) || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      applyMode(next);
    };
    if (close) close.onclick = () => { if (drawer) drawer.hidden = true; };
    if (drawer) drawer.addEventListener('click', e => { if (e.target === drawer) drawer.hidden = true; });
  }

  return { init };
})();
