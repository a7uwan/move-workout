/* MOVE app controller: tabs, timer screen, cloud sync, pull-to-refresh, and screen wake lock. */
const $ = id => document.getElementById(id);

let chosenReps = 0;
let routineName = '';
let lastStep = -1;
let wakeLock = null;
let audioCtx = null;
let lastSnap = null;
let currentItems = [];

const DAY_MS = 86400000;

/* ---------- Navigation and feedback ---------- */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('selected', b.dataset.view === id));
  window.scrollTo(0, 0);
  refreshResumeBar();
}

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function setStatus(text) {
  $('connectionStatus').textContent = text;
}

/* ---------- Keep the screen awake ---------- */
async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    console.warn('MOVE wake lock unavailable:', err.message);
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    keepAwake();
    WorkoutEngine.catchUp();
  }
});
document.addEventListener('pointerdown', keepAwake);

/* ---------- Sound and speech (non-interrupting for background music) ---------- */
function getAudio() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  audioCtx ||= new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep() {
  try {
    const c = getAudio();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.2;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.15);
  } catch (err) {
    console.warn('MOVE beep failed:', err.message);
  }
}

// Note: We intentionally avoid navigator.mediaSession and continuous silent oscillators
// so Spotify / Apple Music / background audio is never paused or taken over.
function speak(message) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(message);
    u.lang = 'en-US';
    u.rate = 1.0;
    u.volume = 0.85;
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn('MOVE speech skipped:', err.message);
  }
}

function handleCue(type) {
  if (type === 'beep') beep();
  if (type === 'changeSide') speak('Change side');
}

/* ---------- Timer screen ---------- */
function refreshResumeBar() {
  const bar = $('resumeBar');
  if (!bar || !lastSnap) return;
  const running = lastSnap.phase !== 'done' && lastSnap.phase !== 'stopped';
  const onTimer = $('timerView').classList.contains('active');
  bar.hidden = !running || onTimer;
  if (!bar.hidden) {
    const name = lastSnap.phase === 'rest' ? 'Rest' : (lastSnap.current?.name || 'Workout');
    $('resumeText').textContent = `${name} · ${lastSnap.phase === 'count' ? `${lastSnap.count}/${lastSnap.target}` : mmss(lastSnap.remaining)}`;
  }
}
const mmss = sec => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function setImage(id, url) {
  const el = $(id);
  if (!url) { el.hidden = true; el.removeAttribute('src'); return; }
  el.onerror = () => { el.hidden = true; };
  if (el.getAttribute('src') !== url) el.src = url;
  el.hidden = false;
}

function renderTimer(s) {
  lastSnap = s;
  refreshResumeBar();
  const idle = s.phase === 'idle';
  const rest = s.phase === 'rest';
  const done = s.phase === 'done';
  const stopped = s.phase === 'stopped';

  $('timerStep').textContent = idle ? 'READY' : rest ? 'REST' : done ? 'COMPLETE' : stopped ? 'ENDED' : (s.label || 'EXERCISE').toUpperCase();
  $('sessionProgress').textContent = done
    ? `${s.total} of ${s.total} exercises done`
    : `Exercise ${Math.min(s.index + 1, s.total)} of ${s.total} · Rep ${s.rep} of ${s.reps}`;
  $('exerciseName').textContent = rest ? 'Take a breath' : done ? 'Workout complete' : (s.current?.name || '');
  $('exerciseSide').textContent = idle ? 'Tap START TIMER when ready' : rest ? `Next: ${s.next?.name || 'finish'}` : (s.label || '');
  const counting = s.phase === 'count';
  $('timerDisplay').textContent = counting ? `${s.count} / ${s.target}` : mmss(idle ? s.segSeconds : s.remaining);
  $('sessionElapsed').textContent = mmss(s.elapsedSeconds || 0);
  $('tapBtn').hidden = !counting;
  $('upNext').textContent = idle ? (s.current?.name || '') : (s.next?.name || 'Finish workout');

  const dock = $('floatingTimerDock');
  if (dock) dock.hidden = done || stopped;

  const btn = $('pauseBtn');
  btn.textContent = idle ? 'START TIMER' : (done || stopped) ? 'DONE' : s.paused ? 'RESUME' : 'PAUSE';
  btn.disabled = done || stopped || counting;

  const pct = done ? 360 : counting ? (s.count / Math.max(1, s.target)) * 360 : (!idle && s.segSeconds) ? ((s.segSeconds - s.remaining) / s.segSeconds) * 360 : 0;
  $('timerRing').style.background = `conic-gradient(var(--green) ${pct}deg, rgba(255,255,255,.10) ${pct}deg)`;

  const finished = done || stopped;
  setImage('currentImg', !finished && !idle ? (rest ? s.next?.image : s.current?.image) : (idle ? s.current?.image : ''));
  setImage('nextImg', !finished && !rest && !idle ? s.next?.image : '');

  if (!idle && !done && !stopped && s.stepIndex !== lastStep) {
    lastStep = s.stepIndex;
    if (rest) speak('Rest');
    else speak(s.label && s.label !== 'Timed hold' ? `${s.current.name}. ${s.label}` : s.current.name);
  }
  if (idle) lastStep = -1;
}

function startWorkout({ name, items, reps }) {
  getAudio();
  chosenReps = reps;
  currentItems = items;
  $('summaryCard').hidden = true;
  routineName = name;
  lastStep = -1;
  showView('timerView');
  WorkoutEngine.start(items, {
    reps,
    routineName: name,
    onUpdate: renderTimer,
    onFinish: finishWorkout,
    onCue: handleCue
  });
  speak('Get into position');
}

/* ---------- Session summary ---------- */
function showSummary(record) {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const exercises = currentItems.length;
  const rounds = currentItems.reduce((sum, i) => sum + (chosenReps > 0 ? chosenReps : (i.reps || 1)), 0);
  const tapped = currentItems.filter(i => i.side === 'Count').length;
  const sec = Math.round(record.durationSeconds);
  const time = sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} s`;
  $('summaryCard').innerHTML = `
    <div class="eyebrow">SESSION SUMMARY</div>
    <h3>${esc(record.routineName)}</h3>
    <div class="summary-grid">
      <div><strong>${time}</strong><small>Total time</small></div>
      <div><strong>${exercises}</strong><small>Exercises</small></div>
      <div><strong>${rounds}</strong><small>Rounds</small></div>
    </div>
    ${tapped ? `<p class="summary-note">${tapped} exercise${tapped > 1 ? 's were' : ' was'} tap-counted.</p>` : ''}
    <button class="primary-btn" id="summaryHistory">VIEW HISTORY <span>→</span></button>`;
  $('summaryCard').hidden = false;
}

/* ---------- Saving & deleting workouts ---------- */
async function finishWorkout(data) {
  const record = {
    id: crypto.randomUUID(),
    routineName,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    durationSeconds: Math.max(1, Math.round((data.endedAt - data.startedAt) / 1000)),
    reps: chosenReps,
    status: 'completed',
    details: data.details || [],
    syncStatus: 'pending'
  };
  await MoveDB.saveWorkout(record);
  speak('Workout complete. Well done.');
  showSummary(record);
  try {
    await MoveAPI.saveWorkout(record);
    await MoveDB.saveWorkout({ ...record, syncStatus: 'synced' });
    toast('Workout saved to Google Sheets');
  } catch (err) {
    console.warn('MOVE cloud sync pending:', err.message);
    toast('Saved on this device · cloud sync pending');
  }
  await refreshData();
}

async function handleDeleteWorkout(id) {
  await MoveDB.deleteWorkout(id);
  await renderAll();
  toast('Workout log deleted');
  if (navigator.onLine) {
    MoveAPI.deleteWorkout(id).catch(err => console.warn('MOVE cloud delete:', err.message));
  }
}

/* ---------- Sync: push pending, then pull from the sheet ---------- */
async function pushPending() {
  if (!navigator.onLine) return 0;
  const logs = await MoveDB.getWorkouts();
  const pending = logs.filter(x => x.syncStatus !== 'synced');
  let pushed = 0;
  for (const record of pending) {
    try {
      await MoveAPI.saveWorkout(record);
      await MoveDB.saveWorkout({ ...record, syncStatus: 'synced' });
      pushed++;
    } catch (err) {
      console.warn('MOVE pending sync failed:', err.message);
      break;
    }
  }
  return pushed;
}

async function pullCloud() {
  const res = await MoveAPI.getWorkouts();
  const deleted = MoveDB.getDeletedIds();
  for (const w of (res.workouts || [])) {
    if (!deleted.has(w.id)) {
      await MoveDB.saveWorkout({ ...w, syncStatus: 'synced' });
    }
  }
}

async function refreshData(showFeedback = false) {
  if (!navigator.onLine) {
    setStatus('Offline');
    await renderAll();
    if (showFeedback) toast('Offline · showing saved data');
    return;
  }
  setStatus('Syncing…');
  try {
    await pushPending();
    await pullCloud();
    setStatus('Synced');
    await loadRoutines();
    await renderAll();
    if (showFeedback) toast('Synced with Google Sheets');
  } catch (err) {
    console.warn('MOVE cloud load failed:', err.message);
    setStatus('Cloud unavailable');
    await renderAll();
    if (showFeedback) toast('Cloud sync failed');
  }
}

async function loadRoutines() {
  const routines = await RoutinesView.load();
  prefetchImages(routines);
  const first = Object.values(routines)[0];
  if (first) {
    const min = Math.round(WorkoutEngine.plannedSeconds(first.items, 1) / 60);
    $('featuredName').textContent = first.name;
    $('featuredMeta').textContent = `${first.items.length} exercises · about ${min} min at 1 rep each`;
  }
}

function prefetchImages(routines) {
  if (!navigator.onLine || !('caches' in window)) return;
  const urls = new Set();
  for (const r of Object.values(routines || {})) {
    for (const item of r.items) if (item.image) urls.add(item.image);
  }
  urls.forEach(url => {
    fetch(url, { mode: 'no-cors' }).catch(() => {});
  });
}

/* ---------- Summary boxes ---------- */
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d.getTime(); }
function startOfWeek(ts) { const d = new Date(startOfDay(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function sumSeconds(list) { return list.reduce((a, x) => a + (Number(x.durationSeconds) || 0), 0); }

function calcStreak(logs) {
  const days = new Set(logs.map(x => startOfDay(x.startedAt)));
  let cursor = startOfDay(Date.now());
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (days.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

function renderStats(logs) {
  const weekLogs = logs.filter(x => x.startedAt >= startOfWeek(Date.now()));
  const streak = calcStreak(logs);
  $('totalSessions').textContent = logs.length;
  $('totalMinutes').textContent = `${Math.round(sumSeconds(logs) / 60)} min`;
  $('weekMinutes').textContent = `${Math.round(sumSeconds(weekLogs) / 60)} min`;
  $('weeklySessions').textContent = `${weekLogs.length} ${weekLogs.length === 1 ? 'workout' : 'workouts'}`;
  $('streakValue').textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
}

function renderHomeMonth(logs) {
  const m = StatsView.monthSummary(logs);
  const now = new Date();
  $('monthLabel').textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
  $('monthWorkouts').textContent = `${m.count} ${m.count === 1 ? 'workout' : 'workouts'}`;
  $('monthCompleted').textContent = `${m.count} · ${m.minutes} min`;
}

/* ---------- Streak reminders and app badge ---------- */
const REMINDER_SENT_KEY = 'move-reminder-sent';
const REMINDER_HOUR = 18;

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function updateReminders(logs) {
  if (!('Notification' in window)) return;
  const today = dayKey(Date.now());
  const doneToday = logs.some(w => dayKey(w.startedAt) === today);
  const streak = calcStreak(logs);
  const atRisk = !doneToday && streak > 0;

  $('enableReminders').hidden = Notification.permission !== 'default';

  if ('setAppBadge' in navigator) {
    try {
      if (atRisk) await navigator.setAppBadge(streak);
      else await navigator.clearAppBadge();
    } catch (_) {}
  }

  if (!atRisk || Notification.permission !== 'granted' || new Date().getHours() < REMINDER_HOUR) return;
  if (localStorage.getItem(REMINDER_SENT_KEY) === today) return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;
  await reg.showNotification('MOVE', {
    body: `Keep your ${streak}-day streak. Today's workout is not done yet.`,
    icon: './assets/icons/apple-touch-icon.png',
    tag: 'move-streak'
  });
  localStorage.setItem(REMINDER_SENT_KEY, today);
}

async function renderAll() {
  const logs = await MoveDB.getWorkouts();
  renderStats(logs);
  renderHomeMonth(logs);
  StatsView.render(logs);
  HistoryView.render(logs);
  await updateReminders(logs);
}

/* ---------- Pull-to-refresh (rubber-band effect) ---------- */
function setupPullToRefresh() {
  const shell = $('appShell');
  const indicator = $('ptrIndicator');
  const label = $('ptrText');
  if (!shell || !indicator || !label) return;

  let startY = 0;
  let pulling = false;
  let distance = 0;
  const THRESHOLD = 85;

  window.addEventListener('touchstart', e => {
    if (window.scrollY <= 0 && e.touches.length === 1) {
      startY = e.touches[0].clientY;
      pulling = true;
      distance = 0;
      shell.style.transition = 'none';
    }
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!pulling) return;
    if (window.scrollY > 0) { pulling = false; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) {
      distance = 0;
      shell.style.transform = '';
      indicator.classList.remove('visible', 'ready');
      return;
    }
    distance = Math.min(140, Math.pow(dy, 0.82));
    shell.style.transform = `translateY(${distance}px)`;
    indicator.style.transform = `translate(-50%, ${Math.min(distance - 36, 24)}px)`;
    indicator.classList.add('visible');
    if (distance >= THRESHOLD) {
      indicator.classList.add('ready');
      label.textContent = '↻ Release to sync';
    } else {
      indicator.classList.remove('ready');
      label.textContent = '↓ Pull to sync';
    }
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    shell.style.transition = 'transform 0.28s cubic-bezier(.22,1,.36,1)';
    shell.style.transform = '';
    if (distance >= THRESHOLD) {
      label.textContent = 'Syncing…';
      await refreshData(true);
    }
    indicator.classList.remove('visible', 'ready');
    indicator.style.transform = '';
    distance = 0;
  });
}

/* ---------- Events ---------- */
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
  showView(b.dataset.view);
  refreshData();
}));
$('enableReminders').onclick = async () => {
  if (!('Notification' in window)) return;
  const result = await Notification.requestPermission();
  toast(result === 'granted' ? 'Streak reminders on' : 'Reminders not allowed');
  renderAll();
};
$('openWorkouts').onclick = () => showView('workoutsView');
$('startFeatured').onclick = () => showView('workoutsView');
$('backHome').onclick = () => showView('workoutsView');
$('resumeBtn').onclick = () => showView('timerView');
$('pauseBtn').onclick = () => {
  const s = WorkoutEngine.state();
  if (s.phase === 'idle') WorkoutEngine.startCurrent();
  else if (s.paused) WorkoutEngine.resume();
  else WorkoutEngine.pause();
};
$('skipBtn').onclick = () => WorkoutEngine.skip();
$('tapBtn').onclick = () => WorkoutEngine.tap();
$('summaryCard').addEventListener('click', e => {
  if (e.target.closest('#summaryHistory')) showView('historyView');
});
$('endBtn').onclick = () => {
  if (confirm('End workout now and save this session to your log?')) {
    WorkoutEngine.finishEarly();
  }
};
window.addEventListener('online', () => { setStatus('Online'); refreshData(); });
window.addEventListener('offline', () => setStatus('Offline'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });

/* ---------- Start ---------- */
RoutinesView.mount({ list: $('allRoutines'), detail: $('routineDetail') }, { onStart: startWorkout });
StatsView.mount({ calendar: $('homeCalendar'), detail: $('homeDayDetail') });
StatsView.mount({ calendar: $('statsCalendar'), detail: $('statsDayDetail'), chart: $('statsChart'), exercises: $('statsExercises') });
HistoryView.mount($('historyList'), { onDelete: handleDeleteWorkout });

$('todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
setStatus(navigator.onLine ? 'Ready' : 'Offline');
setupPullToRefresh();
keepAwake();
loadRoutines();
renderAll();
refreshData();
