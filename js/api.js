// MOVE API client. JSONP avoids browser CORS preflight for Apps Script ContentService.
// Each action uses its own token: saveWorkout uses WRITE_TOKEN, everything else uses READ_TOKEN.
const MoveAPI = (() => {
  const WRITE_ACTIONS = new Set(['saveWorkout', 'deleteWorkout', 'saveRoutineRows', 'deleteRoutine']);

  function isPlaceholder(v) {
    return !v || String(v).includes('PASTE_');
  }

  function request(params) {
    return new Promise((resolve, reject) => {
      const cfg = window.MOVE_CONFIG || {};
      const token = WRITE_ACTIONS.has(params.action) ? cfg.WRITE_TOKEN : cfg.READ_TOKEN;
      if (!cfg.API_URL || isPlaceholder(cfg.API_URL) || isPlaceholder(token)) {
        reject(new Error('Configure js/config.js first.'));
        return;
      }
      const callbackName = 'moveCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('MOVE API timed out. Check the URL and deployment.'));
      }, 15000);
      window[callbackName] = data => {
        cleanup();
        if (!data || data.ok !== true) reject(new Error(data?.error || 'MOVE API request failed.'));
        else resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('Could not load MOVE API response. Check deployment access and URL.'));
      };
      const query = new URLSearchParams({
        ...params,
        token,
        callback: callbackName
      });
      script.src = cfg.API_URL + (cfg.API_URL.includes('?') ? '&' : '?') + query.toString();
      document.head.appendChild(script);
    });
  }

  return {
    ping: () => request({action: 'ping'}),
    getRoutines: () => request({action: 'routines'}),
    getWorkouts: () => request({action: 'workouts'}),
    saveRoutineRows: (routineName, rows) => request({
      action: 'saveRoutineRows',
      routine_name: routineName,
      rows: JSON.stringify(rows)
    }),
    deleteRoutine: routineName => request({
      action: 'deleteRoutine',
      routine_name: routineName
    }),
    deleteWorkout: id => request({
      action: 'deleteWorkout',
      log_id: String(id)
    }),
    saveWorkout: record => request({
      action: 'saveWorkout',
      log_id: record.id,
      routine_name: record.routineName,
      start_time: String(record.startedAt),
      end_time: String(record.endedAt),
      duration_seconds: String(record.durationSeconds),
      status: record.status || 'completed',
      reps: String(record.reps || 0),
      details: JSON.stringify(record.details || [])
    })
  };
})();
