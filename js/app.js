/* MOVE app controller: tabs, timer screen, cloud sync, and screen wake lock. */
const $ = id => document.getElementById(id);

let chosenReps = 0;
let routineName = '';
let lastStep = -1;
let wakeLock = null;
let audioCtx = null;

const DAY_MS = 86400000;

/* ---------- Navigation and feedback ---------- */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('selected', b.dataset.view === id));
  window.scrollTo(0, 0);
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
// Requests a screen wake lock. Browsers release it when the page is hidden, so it is requested
// again on every return to the app. iOS Safari needs 16.4 or later and a user gesture.
async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    console.warn('MOVE wake lock unavailable:', err.message);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
document.addEventListener('pointerdown', keepAwake);

/* ---------- Sound and speech ---------- */
// The AudioContext is created or resumed on a user tap, because mobile browsers block audio before that.
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

function speak(message) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(message);
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// Receives cues from WorkoutEngine: 'beep' (3 seconds before the next exercise) and 'changeSide'.
function handleCue(type) {
  if (type === 'beep') beep();
  if (type === 'changeSide') speak('Change side');
}

/* ---------- Timer screen ---------- */
const mmss = sec => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function renderTimer(s) {
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
  $('timerDisplay').textContent = mmss(idle ? s.segSeconds : s.remaining);
  $('upNext').textContent = idle ? (s.current?.name || '') : (s.next?.name || 'Finish workout');

  const btn = $('pauseBtn');
  btn.textContent = idle ? 'START TIMER' : (done || stopped) ? 'DONE' : s.paused ? 'RESUME' : 'PAUSE';
  btn.disabled = done || stopped;

  const pct = done ? 360 : (!idle && s.segSeconds) ? ((s.segSeconds - s.remaining) / s.segSeconds) * 360 : 0;
  $('timerRing').style.background = `conic-gradient(var(--green) ${pct}deg, rgba(255,255,255,.10) ${pct}deg)`;

  // Announce each new movement or rest once, when its step starts.
  if (!idle && !done && !stopped && s.stepIndex !== lastStep) {
    lastStep = s.stepIndex;
    if (rest) speak('Rest');
    else speak(s.label && s.label !== 'Timed hold' ? `${s.current.name}. ${s.label}` : s.current.name);
  }
  if (idle) lastStep = -1;
}

// Called by RoutinesView with { name, items, reps } once the user taps START WORKOUT.
function startWorkout({ name, items, reps }) {
  getAudio();
  chosenReps = reps;
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

/* ---------- Saving a finished workout ---------- */
async function finishWorkout(data) {
  const record = {
    id: crypto.randomUUID(),
    routineName,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    durationSeconds: Math.round((data.endedAt - data.startedAt) / 1000),
    reps: chosenReps,
    status: 'completed',
    syncStatus: 'pending'
  };
  await MoveDB.saveWorkout(record);
  speak('Workout complete. Well done.');
  showView('historyView');
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
  for (const w of (res.workouts || [])) {
    await MoveDB.saveWorkout({ ...w, syncStatus: 'synced' });
  }
}

async function refreshData() {
  if (!navigator.onLine) {
    setStatus('Offline');
    await renderAll();
    return;
  }
  try {
    await pushPending();
    await pullCloud();
    setStatus('Synced');
  } catch (err) {
    console.warn('MOVE cloud load failed:', err.message);
    setStatus('Cloud unavailable');
  }
  await loadRoutines();
  await renderAll();
}

async function loadRoutines() {
  const routines = await RoutinesView.load();
  const first = Object.values(routines)[0];
  if (first) {
    const min = Math.round(WorkoutEngine.plannedSeconds(first.items, 1) / 60);
    $('featuredName').textContent = first.name;
    $('featuredMeta').textContent = `${first.items.length} exercises · about ${min} min at 1 rep each`;
  }
}

/* ---------- Summary boxes ---------- */
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d.getTime(); }
function startOfWeek(ts) { const d = new Date(startOfDay(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function sumSeconds(list) { return list.reduce((a, x) => a + (Number(x.durationSeconds) || 0), 0); }

function calcStreak(logs) {
  const days = new Set(logs.map(x => startOfDay(x.startedAt)));
  let cursor = startOfDay(Date.now());
  if (!days.has(cursor)) cursor = addDays(cursor, -1); // today may not be done yet
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

async function renderAll() {
  const logs = await MoveDB.getWorkouts();
  renderStats(logs);
  StatsView.render(logs);
  HistoryView.render(logs);
}

/* ---------- Events ---------- */
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
  showView(b.dataset.view);
  refreshData();
}));
$('openWorkouts').onclick = () => showView('workoutsView');
$('startFeatured').onclick = () => showView('workoutsView');
$('backHome').onclick = () => { WorkoutEngine.stop(); showView('workoutsView'); };
$('pauseBtn').onclick = () => {
  const s = WorkoutEngine.state();
  if (s.phase === 'idle') WorkoutEngine.startCurrent();
  else if (s.paused) WorkoutEngine.resume();
  else WorkoutEngine.pause();
};
$('skipBtn').onclick = () => WorkoutEngine.skip();
$('endBtn').onclick = () => {
  if (confirm('End this workout now? It will not be counted as completed.')) {
    WorkoutEngine.stop();
    showView('workoutsView');
    toast('Workout ended');
  }
};
window.addEventListener('online', () => { setStatus('Online'); refreshData(); });
window.addEventListener('offline', () => setStatus('Offline'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });

/* ---------- Start ---------- */
RoutinesView.mount({ list: $('allRoutines'), detail: $('routineDetail') }, { onStart: startWorkout });
StatsView.mount({ calendar: $('statsCalendar'), detail: $('statsDayDetail'), chart: $('statsChart') });
HistoryView.mount($('historyList'));

$('todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
setStatus(navigator.onLine ? 'Ready' : 'Offline');
keepAwake();
loadRoutines();
renderAll();   // show cached data immediately
refreshData(); // then sync with Google Sheets
