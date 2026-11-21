/* MOVE app controller: tabs, timer screen, cloud sync, and screen wake lock. */
const $ = id => document.getElementById(id);

let chosenReps = 0;
let routineName = '';
let lastStep = -1;
let sessionStartTs = 0;
let elapsedTicker = null;
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

// Keep-alive: a silent AudioContext buffer source replays every 25 s to prevent the browser
// suspending the page. We use a zero-gain GainNode so it makes no sound and does NOT take
// the system audio focus away from Spotify or any other external player.
let keepAliveTimer = null;
function keepAudioAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    try {
      const c = getAudio();
      if (!c) return;
      const buf = c.createBuffer(1, 1, c.sampleRate);
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = 0;        // truly silent: no audio focus stolen
      src.buffer = buf;
      src.connect(g);
      g.connect(c.destination);
      src.start();
    } catch (_) {}
  }, 25000);
}
function releaseAudio() {
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
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

// Lower-pitched beep for rest countdown — distinct from the exercise-start beep.
function restBeep() {
  try {
    const c = getAudio();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = 440;   // lower pitch = rest ending
    g.gain.value = 0.18;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.12);
  } catch (err) {
    console.warn('MOVE rest beep failed:', err.message);
  }
}

// Receives cues from WorkoutEngine.
function handleCue(type, data) {
  if (type === 'beep') beep();
  if (type === 'changeSide') speak('Change side');
  if (type === 'restCountdown') {
    restBeep();
    // Speak only on 3 so it doesn't clash with beep; the lower-pitched beep covers 2 and 1.
    if (data && data.remaining === 3) speak('3');
    if (data && data.remaining === 2) speak('2');
    if (data && data.remaining === 1) speak('1');
  }
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

// Detects media type and shows the right element: img, video, or YouTube iframe.
// Hides the whole wrap when there is nothing to show.
function setMedia(url) {
  const wrap = $('currentMediaWrap');
  const img = $('currentImg');
  const vid = $('currentVideo');
  const frame = $('currentIframe');
  if (!url) { wrap.hidden = true; img.hidden = vid.hidden = frame.hidden = true; return; }
  const u = url.trim();
  const ytMatch = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([A-Za-z0-9_-]{11})/);
  if (ytMatch) {
    img.hidden = true; vid.hidden = true; frame.hidden = false;
    const src = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}&controls=0`;
    if (frame.src !== src) frame.src = src;
    wrap.hidden = false; return;
  }
  if (/\.gif$/i.test(u) || /\.mp4$|\.webm$|\.mov$/i.test(u)) {
    img.hidden = true; frame.hidden = true; vid.hidden = false;
    if (vid.getAttribute('src') !== u) { vid.src = u; vid.load(); }
    wrap.hidden = false; return;
  }
  // Default: static image.
  frame.hidden = true; vid.hidden = true; img.hidden = false;
  img.onerror = () => { wrap.hidden = true; };
  if (img.getAttribute('src') !== u) img.src = u;
  wrap.hidden = false;
}

function setNextImg(url) {
  const el = $('nextImg');
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

  const pct = done ? 100 : counting ? Math.round((s.count / Math.max(1, s.target)) * 100) : (!idle && s.segSeconds) ? Math.round(((s.segSeconds - s.remaining) / s.segSeconds) * 100) : 0;
  const bar = $('timerBarFill');
  if (bar) bar.style.width = pct + '%';

  // Media: show image/gif/video/youtube for the current exercise.
  const finished = done || stopped;
  setMedia(!finished ? (rest ? s.next?.image : s.current?.image) : '');
  setNextImg(!finished && !rest && !idle ? s.next?.image : '');

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
  sessionStartTs = Date.now();
  clearInterval(elapsedTicker);
  elapsedTicker = setInterval(() => {
    const el = $('sessionElapsed');
    if (el) el.textContent = mmss(Math.floor((Date.now() - sessionStartTs) / 1000));
  }, 1000);
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
  clearInterval(elapsedTicker);
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

const DELETED_IDS_KEY = 'move-deleted-ids';
function getDeletedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]')); } catch (_) { return new Set(); }
}
function markDeleted(id) {
  const s = getDeletedIds(); s.add(id);
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...s]));
}

async function pullCloud() {
  const res = await MoveAPI.getWorkouts();
  const deleted = getDeletedIds();
  for (const w of (res.workouts || [])) {
    // Fix 4: skip IDs the user deleted locally so they never reappear.
    if (deleted.has(w.id)) continue;
    await MoveDB.saveWorkout({ ...w, syncStatus: 'synced' });
  }
}

function workoutActive() {
  const s = WorkoutEngine.state();
  return s.phase !== 'idle' && s.phase !== 'done' && s.phase !== 'stopped';
}

async function refreshData() {
  if (!navigator.onLine) {
    setStatus('Offline');
    await renderAll();
    return;
  }
  try {
    await pushPending();
    // Fix 3: never pull cloud or reload routines while a workout is running.
    if (!workoutActive()) {
      await pullCloud();
      await loadRoutines();
    }
    setStatus('Synced');
  } catch (err) {
    console.warn('MOVE cloud load failed:', err.message);
    setStatus('Cloud unavailable');
  }
  await renderAll();
}

async function loadRoutines() {
  const routines = await RoutinesView.load();
  // Merge custom routines from the builder (already normalised, inject as sheet-format rows).
  const custom = RoutineBuilder.allRoutines();
  const customRows = Object.values(custom).flatMap(r =>
    r.items.map(i => ({
      Routine: r.name, Order: i.order, Exercise: i.name,
      Duration_s: i.duration, Rest_s: i.rest, Side: i.side,
      Reps: i.reps, Image_URL: i.image, Notes: i.notes
    }))
  );
  if (customRows.length) RoutinesView.mergeCustomRows(customRows);
  prefetchImages({ ...routines, ...custom });
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

let statsYear = new Date().getFullYear();
let statsMonth = new Date().getMonth();

function renderStats(logs) {
  const weekLogs = logs.filter(x => x.startedAt >= startOfWeek(Date.now()));
  const streak = calcStreak(logs);
  // Top summary cards filter to the month currently shown in the Stats calendar.
  const m = StatsView.monthSummary(logs, statsYear, statsMonth);
  const mLabel = new Date(statsYear, statsMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $('totalSessions').textContent = m.count;
  $('totalSessions').closest('article').querySelector('small').textContent = `Workouts in ${mLabel}`;
  $('totalMinutes').textContent = `${m.minutes} min`;
  $('totalMinutes').closest('article').querySelector('small').textContent = `Minutes in ${mLabel}`;
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
$('endBtn').onclick = async () => {
  if (confirm('End workout and save it as a completed session?')) {
    clearInterval(elapsedTicker);
    WorkoutEngine.stop();
    releaseAudio();
    const now = Date.now();
    const record = {
      id: crypto.randomUUID(),
      routineName,
      startedAt: sessionStartTs || now,
      endedAt: now,
      durationSeconds: Math.round((now - (sessionStartTs || now)) / 1000),
      reps: chosenReps,
      status: 'completed',
      details: [],
      syncStatus: 'pending'
    };
    await MoveDB.saveWorkout(record);
    showSummary(record);
    try {
      await MoveAPI.saveWorkout(record);
      await MoveDB.saveWorkout({ ...record, syncStatus: 'synced' });
      toast('Workout saved to Google Sheets');
    } catch (err) {
      toast('Saved on this device · cloud sync pending');
    }
    await refreshData();
  }
};
/* ---------- Pull-to-refresh ---------- */
(function () {
  let startY = 0, pulling = false;
  const THRESHOLD = 72;
  const indicator = document.createElement('div');
  indicator.id = 'pullIndicator';
  indicator.textContent = '↓ Pull to refresh';
  document.querySelector('.app-shell').prepend(indicator);

  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      const pct = Math.min(dy / THRESHOLD, 1);
      indicator.style.opacity = pct;
      indicator.style.transform = `translateY(${Math.min(dy * 0.4, 32)}px)`;
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    indicator.style.opacity = '0';
    indicator.style.transform = '';
    if (dy >= THRESHOLD) {
      indicator.textContent = '↻ Syncing…';
      indicator.style.opacity = '1';
      refreshData().then(() => {
        indicator.textContent = '↓ Pull to refresh';
        indicator.style.opacity = '0';
      });
    }
  }, { passive: true });
}());

window.addEventListener('online', () => { setStatus('Online'); refreshData(); });
window.addEventListener('offline', () => setStatus('Offline'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });

/* ---------- Start ---------- */
RoutinesView.mount({ list: $('allRoutines'), detail: $('routineDetail') }, { onStart: startWorkout });
StatsView.mount({ calendar: $('homeCalendar'), detail: $('homeDayDetail') });
StatsView.mount({
  calendar: $('statsCalendar'),
  detail: $('statsDayDetail'),
  chart: $('statsChart'),
  exercises: $('statsExercises'),
  exercisesMonth: $('statsExercisesMonth'),
  onMonthChange: async (year, month) => {
    statsYear = year;
    statsMonth = month;
    StatsView.setStatsMonth(year, month);
    const logs = await MoveDB.getWorkouts();
    renderStats(logs);
  }
});
HistoryView.mount($('historyList'), { onDelete: renderAll });
RoutineBuilder.mount($('builderContainer'), { onRoutinesSaved: loadRoutines });

$('todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
setStatus(navigator.onLine ? 'Ready' : 'Offline');
keepAwake();
loadRoutines();
renderAll();   // show cached data immediately
refreshData(); // then sync with Google Sheets
