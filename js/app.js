/* MOVE app controller: tabs, timer screen, cloud sync, and screen wake lock. */
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    keepAwake();
    WorkoutEngine.catchUp(); // apply steps that ended while the phone was locked
  }
});
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

// A silent oscillator keeps the audio session active during a workout, so the page is less likely to be suspended
// when the screen locks. Released when the workout ends.
let keepAliveOsc = null;
function keepAudioAlive() {
  const c = getAudio();
  if (!c || keepAliveOsc) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    keepAliveOsc = o;
  } catch (err) {
    console.warn('MOVE keep-alive failed:', err.message);
  }
}
function releaseAudio() {
  try { keepAliveOsc?.stop(); } catch (_) {}
  keepAliveOsc = null;
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

// Shows a bar above the bottom menu while a routine is running and the timer screen is not open.
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

// Shows an exercise image from the sheet's Image_URL column. Hides the slot when there is no URL or the load fails.
function setImage(id, url) {
  const el = $(id);
  if (!url) { el.hidden = true; el.removeAttribute('src'); return; }
  el.onerror = () => { el.hidden = true; };
  if (el.getAttribute('src') !== url) el.src = url;
  el.hidden = false;
}

// Lock-screen controls (iOS and Android). Shows the exercise name and play/pause/skip.
let mediaHandlersSet = false;
function updateMediaSession(s) {
  if (!('mediaSession' in navigator)) return;
  const title = s.phase === 'rest' ? 'Rest' : (s.current?.name || 'MOVE');
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'MOVE', album: routineName });
    navigator.mediaSession.playbackState = s.paused ? 'paused' : 'playing';
    if (!mediaHandlersSet) {
      mediaHandlersSet = true;
      navigator.mediaSession.setActionHandler('play', () => { if (lastSnap?.paused) $('pauseBtn').click(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (lastSnap && !lastSnap.paused) $('pauseBtn').click(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => WorkoutEngine.skip());
    }
  } catch (_) { /* not supported on this browser */ }
}

function renderTimer(s) {
  lastSnap = s;
  refreshResumeBar();
  updateMediaSession(s);
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
  $('tapBtn').hidden = !counting;
  $('upNext').textContent = idle ? (s.current?.name || '') : (s.next?.name || 'Finish workout');

  const btn = $('pauseBtn');
  btn.textContent = idle ? 'START TIMER' : (done || stopped) ? 'DONE' : s.paused ? 'RESUME' : 'PAUSE';
  btn.disabled = done || stopped || counting;

  const pct = done ? 360 : counting ? (s.count / Math.max(1, s.target)) * 360 : (!idle && s.segSeconds) ? ((s.segSeconds - s.remaining) / s.segSeconds) * 360 : 0;
  $('timerRing').style.background = `conic-gradient(var(--green) ${pct}deg, rgba(255,255,255,.10) ${pct}deg)`;

  // Images: the main slot shows the movement in progress (the next one during rest).
  // The Up Next card shows the following movement, and only outside rest.
  const finished = done || stopped;
  setImage('currentImg', !finished && !idle ? (rest ? s.next?.image : s.current?.image) : (idle ? s.current?.image : ''));
  setImage('nextImg', !finished && !rest && !idle ? s.next?.image : '');

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
  keepAudioAlive();
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

/* ---------- Session summary (shown on the timer screen after a finished workout) ---------- */
function showSummary(record) {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const exercises = currentItems.length;
  const rounds = currentItems.reduce((sum, i) => sum + (i.reps > 0 ? i.reps : chosenReps), 0);
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
    details: data.details || [],
    syncStatus: 'pending'
  };
  await MoveDB.saveWorkout(record);
  releaseAudio();
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
  prefetchImages(routines);
  const first = Object.values(routines)[0];
  if (first) {
    const min = Math.round(WorkoutEngine.plannedSeconds(first.items, 1) / 60);
    $('featuredName').textContent = first.name;
    $('featuredMeta').textContent = `${first.items.length} exercises · about ${min} min at 1 rep each`;
  }
}

/* ---------- Offline exercise images ---------- */
// Fetches each exercise image once so the service worker stores it. Runs after routines load.
// Images are stored in the 'move-images-v1' cache, which the service worker trims to 80 entries.
function prefetchImages(routines) {
  if (!navigator.onLine || !('caches' in window)) return;
  const urls = new Set();
  for (const r of Object.values(routines || {})) {
    for (const item of r.items) if (item.image) urls.add(item.image);
  }
  urls.forEach(url => {
    fetch(url, { mode: 'no-cors' }).catch(() => { /* ignored: the image just won't be cached */ });
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

// Badge shows the streak while today has no workout. Notifications need permission and a time after REMINDER_HOUR.
// The app checks when it opens or refreshes. No background push is sent, because that needs a server.
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
    } catch (_) { /* badges are optional */ }
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
$('backHome').onclick = () => showView('workoutsView'); // leaves the workout running
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
  if (confirm('End this workout now? It will not be counted as completed.')) {
    WorkoutEngine.stop();
    showView('workoutsView');
    releaseAudio();
    toast('Workout ended');
  }
};
window.addEventListener('online', () => { setStatus('Online'); refreshData(); });
window.addEventListener('offline', () => setStatus('Offline'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });

/* ---------- Start ---------- */
RoutinesView.mount({ list: $('allRoutines'), detail: $('routineDetail') }, { onStart: startWorkout });
StatsView.mount({ calendar: $('homeCalendar'), detail: $('homeDayDetail') });
StatsView.mount({ calendar: $('statsCalendar'), detail: $('statsDayDetail'), chart: $('statsChart'), exercises: $('statsExercises') });
HistoryView.mount($('historyList'));

$('todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
setStatus(navigator.onLine ? 'Ready' : 'Offline');
keepAwake();
loadRoutines();
renderAll();   // show cached data immediately
refreshData(); // then sync with Google Sheets
