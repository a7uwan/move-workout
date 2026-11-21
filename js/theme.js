// MOVE Theme Picker — persists choice in localStorage, applies on load.
const ThemePicker = (() => {
  const KEY = 'move-theme';
  const THEMES = [
    { id: 'default',  label: 'Midnight',  bg: 'linear-gradient(135deg,#0d1b2a 0%,#1b2f45 48%,#12363a 100%)',  orbs: 'rgba(125,211,252,.35),rgba(110,231,183,.28),rgba(167,139,250,.22)' },
    { id: 'ocean',    label: 'Ocean',     bg: 'linear-gradient(135deg,#0a1628 0%,#0d2b4e 50%,#0a2235 100%)',   orbs: 'rgba(56,189,248,.4),rgba(14,165,233,.3),rgba(99,102,241,.2)' },
    { id: 'forest',   label: 'Forest',    bg: 'linear-gradient(135deg,#0a1a0d 0%,#0f2d14 50%,#0d2318 100%)',   orbs: 'rgba(74,222,128,.35),rgba(34,197,94,.28),rgba(16,185,129,.2)' },
    { id: 'sunset',   label: 'Sunset',    bg: 'linear-gradient(135deg,#1a0a0f 0%,#2d1215 50%,#1a0d10 100%)',   orbs: 'rgba(251,146,60,.35),rgba(239,68,68,.28),rgba(217,70,239,.22)' },
    { id: 'violet',   label: 'Violet',    bg: 'linear-gradient(135deg,#0f0a1e 0%,#1e1245 50%,#160d35 100%)',   orbs: 'rgba(167,139,250,.4),rgba(139,92,246,.3),rgba(99,102,241,.25)' },
    { id: 'rose',     label: 'Rose',      bg: 'linear-gradient(135deg,#1a0a14 0%,#2d1526 50%,#1a0d1a 100%)',   orbs: 'rgba(251,113,133,.35),rgba(244,63,94,.28),rgba(217,70,239,.2)' },
  ];

  function applyTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    // Build the CSS body background and orbs.
    const orbCols = t.orbs.split(',').map(c => c.trim());
    document.body.style.background = [
      `radial-gradient(circle at 12% 8%,${orbCols[0]} 0,transparent 36%)`,
      `radial-gradient(circle at 92% 46%,${orbCols[1]} 0,transparent 34%)`,
      `radial-gradient(circle at 40% 96%,${orbCols[2]} 0,transparent 38%)`,
      t.bg
    ].join(',');
    document.body.style.backgroundAttachment = 'fixed';
    document.documentElement.dataset.theme = id;
    // Highlight selected chip.
    document.querySelectorAll('.theme-chip').forEach(c =>
      c.classList.toggle('selected', c.dataset.theme === id));
  }

  function init() {
    const saved = localStorage.getItem(KEY) || 'default';
    applyTheme(saved);

    const grid = document.getElementById('themeGrid');
    if (!grid) return;
    grid.innerHTML = THEMES.map(t => `
      <button class="theme-chip${t.id === saved ? ' selected' : ''}" data-theme="${t.id}">
        <span class="theme-swatch" style="background:${t.bg}"></span>
        <small>${t.label}</small>
      </button>`).join('');

    grid.addEventListener('click', e => {
      const chip = e.target.closest('.theme-chip');
      if (!chip) return;
      const id = chip.dataset.theme;
      localStorage.setItem(KEY, id);
      applyTheme(id);
    });

    const btn = document.getElementById('themeBtn');
    const drawer = document.getElementById('themeDrawer');
    const close = document.getElementById('themeClose');
    if (btn) btn.onclick = () => { drawer.hidden = false; };
    if (close) close.onclick = () => { drawer.hidden = true; };
    if (drawer) drawer.addEventListener('click', e => { if (e.target === drawer) drawer.hidden = true; });
  }

  return { init };
})();
