// Timer engine. Builds a flat list of segments from the routine and the chosen reps.
// Segment types: exercise (timed), rest (timed), count (user taps each rep until the target).
// The engine plays no sound. It reports cues ('beep', 'changeSide', 'tap') to the app.
const WorkoutEngine = (() => {
  const SIDE_CUE_AT = 25;      // seconds into a 30s side when "CHANGE SIDE" is announced
  const BEEP_FROM = 3;         // beep for the last 3 seconds before the next movement

  let segs = [];
  let routine = [];
  let routineName = '';
  let segIdx = 0;
  let phase = 'idle';          // idle | exercise | rest | count | done | stopped
  let endAt = 0;
  let remaining = 0;
  let paused = true;
  let ticker = null;
  let startedAt = 0;
  let lastLeft = -1;
  let sideCued = false;
  let count = 0;
  let detailMap = {};
  let onUpdate = () => {};
  let onFinish = () => {};
  let onCue = () => {};

  // Side Count: each round waits for taps up to the target (Duration_s holds the target).
  // Side LR30: each round is Right 30s then Left 30s. Side None: one timed hold.
  // A rest follows each round, except the last round in the routine.
  function buildSegments(items, repsOverride) {
    const out = [];
    items.forEach((ex, i) => {
      const reps = Math.max(1, Number(repsOverride) || Number(ex.reps) || 1);
      for (let k = 1; k <= reps; k++) {
        const base = { ex: i, rep: k, reps };
        if (ex.side === 'Count') {
          out.push({ ...base, type: 'count', label: 'Tap each rep', seconds: 0, target: Math.max(1, Number(ex.target) || 100) });
        } else if (ex.side === 'LR30') {
          const half = Math.max(1, Math.round(ex.duration / 2));
          out.push({ ...base, type: 'exercise', label: 'Right 30s', seconds: half, changeSideAt: SIDE_CUE_AT });
          out.push({ ...base, type: 'exercise', label: 'Left 30s', seconds: half });
        } else {
          out.push({ ...base, type: 'exercise', label: ex.sideLabel || 'Timed hold', seconds: Math.max(1, ex.duration) });
        }
        if (ex.rest > 0) out.push({ ...base, type: 'rest', label: 'Rest', seconds: ex.rest });
      }
    });
    if (out.length && out[out.length - 1].type === 'rest') out.pop();
    return out;
  }

  // Total planned timed seconds. Count rounds add 0 because they have no fixed length.
  function plannedSeconds(items, repsOverride) {
    return buildSegments(items, repsOverride).reduce((sum, s) => sum + s.seconds, 0);
  }

  function snapshot() {
    const seg = segs[segIdx];
    const nextSeg = segs.slice(segIdx + 1).find(s => s.type !== 'rest');
    return {
      phase,
      index: seg ? seg.ex : 0,
      total: routine.length,
      rep: seg ? seg.rep : 0,
      reps: seg ? seg.reps : 0,
      label: seg ? seg.label : '',
      current: routine[seg ? seg.ex : 0] || null,
      next: nextSeg ? routine[nextSeg.ex] : null,
      remaining: phase === 'idle' ? (seg ? seg.seconds : 0) : (phase === 'done' || phase === 'stopped') ? 0 : remaining,
      segSeconds: seg ? seg.seconds : 0,
      count,
      target: seg && seg.target ? seg.target : 0,
      stepIndex: segIdx,
      stepTotal: segs.length,
      paused
    };
  }

  function notify() { onUpdate(snapshot()); }

  function begin(i) {
    segIdx = i;
    const seg = segs[i];
    phase = seg.type === 'rest' ? 'rest' : seg.type === 'count' ? 'count' : 'exercise';
    count = 0;
    remaining = seg.seconds;
    endAt = Date.now() + remaining * 1000;
    paused = false;
    sideCued = false;
    lastLeft = -1;
    notify();
  }

  function finish() {
    clearInterval(ticker);
    ticker = null;
    phase = 'done';
    paused = true;
    remaining = 0;
    notify();
    onFinish({ startedAt, endedAt: Date.now(), routineName, details: Object.values(detailMap) });
  }

  // Adds a finished segment to the per-exercise totals. Skipped segments are not counted.
  function markDone(seg) {
    if (seg.type === 'rest') return;
    const item = routine[seg.ex];
    const d = (detailMap[seg.ex] ||= { name: item ? item.name : '', seconds: 0, taps: 0 });
    if (seg.type === 'count') d.taps += count;
    else d.seconds += seg.seconds;
  }

  function advanceSeg() {
    if (segIdx + 1 >= segs.length) return finish();
    begin(segIdx + 1);
  }

  function ensureTicker() {
    if (!ticker) ticker = setInterval(tick, 200);
  }

  function tick() {
    if (paused || phase === 'idle' || phase === 'done' || phase === 'stopped' || phase === 'count') return;
    const seg = segs[segIdx];
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

    if (left !== lastLeft) {
      lastLeft = left;
      remaining = left;
      const next = segs[segIdx + 1];
      // No beep between the Right and Left halves of the same round.
      const newMovement = next && !(next.ex === seg.ex && next.rep === seg.rep);
      if (next && next.type !== 'rest' && newMovement && left >= 1 && left <= BEEP_FROM) {
        onCue('beep', { remaining: left });
      }
      if (seg.changeSideAt !== undefined && !sideCued && seg.seconds - left >= seg.changeSideAt) {
        sideCued = true;
        onCue('changeSide');
      }
      notify();
    }
    if (left <= 0) { markDone(seg); advanceSeg(); }
  }

  // Prepares the routine. Nothing runs until startCurrent() is called.
  function start(items, opts = {}) {
    clearInterval(ticker);
    ticker = null;
    routine = items;
    routineName = opts.routineName || 'Workout';
    detailMap = {};
    segs = buildSegments(items, opts.reps);
    segIdx = 0;
    phase = 'idle';
    count = 0;
    remaining = segs[0] ? segs[0].seconds : 0;
    paused = true;
    startedAt = Date.now();
    onUpdate = opts.onUpdate || (() => {});
    onFinish = opts.onFinish || (() => {});
    onCue = opts.onCue || (() => {});
    notify();
  }

  function startCurrent() {
    if (!segs.length) return;
    if (phase === 'idle') {
      startedAt = Date.now();
      begin(0);
      ensureTicker();
      return;
    }
    if (paused) resume();
  }

  function pause() {
    if (paused || (phase !== 'exercise' && phase !== 'rest')) return;
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    paused = true;
    notify();
  }

  function resume() {
    if (!paused || (phase !== 'exercise' && phase !== 'rest')) return;
    endAt = Date.now() + remaining * 1000;
    paused = false;
    lastLeft = -1;
    ensureTicker();
    notify();
  }

  // One tap = one rep. Reaching the target moves to the next round.
  function tap() {
    if (phase !== 'count') return;
    count++;
    onCue('tap', { count, target: segs[segIdx].target });
    if (count >= segs[segIdx].target) { markDone(segs[segIdx]); advanceSeg(); }
    else notify();
  }

  function skip() {
    if (phase === 'idle') return startCurrent();
    if (phase === 'exercise' || phase === 'rest' || phase === 'count') {
      ensureTicker();
      advanceSeg();
    }
  }

  function stop() {
    clearInterval(ticker);
    ticker = null;
    phase = 'stopped';
    paused = true;
    notify();
  }

  function state() { return snapshot(); }

  return { start, startCurrent, pause, resume, skip, stop, tap, state, plannedSeconds };
})();
