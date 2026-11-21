// MOVE Google Apps Script API: JSONP for the GitHub Pages PWA.
// Set the three constants below before saving. Use long random values, not the old token.
// Generate one with: openssl rand -hex 24
const SHEET_ID = '1kW5nZ0M4GPHT9RY2sx0e-lUlJhqJ-H-VGeiLxJAN5DQ';
const READ_TOKEN = '9c0abb273fdc999f3d3e9d4cddd8f547e40738b4dbb3a004';   // allows reading Routines and WorkoutLogs
const WRITE_TOKEN = 'bc9212475e5e4a02a85752bf0b1017d36ff5936c3a556912'; // allows adding a workout row only

const LIMITS = {
  maxDetailsChars: 4000,
  maxNameChars: 120,
  maxDurationSeconds: 6 * 3600,
  maxReps: 1000
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'ping';
  const callback = p.callback;

  if (action === 'ping') return respond_({ok:true, app:'MOVE API'}, callback);

  if (action === 'saveWorkout') {
    if (!safeEqual_(p.token, WRITE_TOKEN)) return respond_({ok:false,error:'Unauthorized'}, callback);
    return saveWorkout_(p, callback);
  }

  if (action === 'deleteWorkout') {
    if (!safeEqual_(p.token, WRITE_TOKEN)) return respond_({ok:false,error:'Unauthorized'}, callback);
    return deleteWorkout_(p, callback);
  }

  if (action === 'saveRoutineRows') {
    if (!safeEqual_(p.token, WRITE_TOKEN)) return respond_({ok:false,error:'Unauthorized'}, callback);
    return saveRoutineRows_(p, callback);
  }

  if (action === 'deleteRoutine') {
    if (!safeEqual_(p.token, WRITE_TOKEN)) return respond_({ok:false,error:'Unauthorized'}, callback);
    return deleteRoutineRows_(p, callback);
  }

  if (!safeEqual_(p.token, READ_TOKEN)) return respond_({ok:false,error:'Unauthorized'}, callback);
  if (action === 'routines') return respond_({ok:true, routines:readRows_('Routines')}, callback);
  if (action === 'workouts') return respond_({ok:true, workouts:readWorkouts_()}, callback);

  return respond_({ok:false,error:'Unknown action'}, callback);
}

function saveWorkout_(p, callback) {
  try {
    const log = {
      id: String(p.log_id || ''),
      routineName: String(p.routine_name || '').slice(0, LIMITS.maxNameChars),
      startedAt: Number(p.start_time),
      endedAt: Number(p.end_time),
      durationSeconds: Number(p.duration_seconds),
      status: String(p.status || 'completed').slice(0, 20),
      reps: Number(p.reps) || 0,
      details: String(p.details || '[]')
    };

    // Input checks. Anything outside these ranges is rejected before it reaches the sheet.
    if (!/^[A-Za-z0-9-]{8,64}$/.test(log.id)) throw new Error('Invalid log_id');
    if (!log.routineName) throw new Error('Missing routine_name');
    if (!(log.startedAt > 0) || !(log.endedAt >= log.startedAt)) throw new Error('Invalid start or end time');
    if (!(log.durationSeconds >= 0 && log.durationSeconds <= LIMITS.maxDurationSeconds)) throw new Error('Invalid duration');
    if (!(log.reps >= 0 && log.reps <= LIMITS.maxReps)) throw new Error('Invalid reps');
    if (log.details.length > LIMITS.maxDetailsChars) throw new Error('details too large');
    try { JSON.parse(log.details); } catch (_) { throw new Error('details must be JSON'); }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('WorkoutLogs');
    if (!sheet) throw new Error('WorkoutLogs tab not found');

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const lastRow = sheet.getLastRow();
      const existingIds = lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat()
        : [];
      // Prevent duplicate rows if a device retries a pending sync.
      if (!existingIds.includes(log.id)) {
        sheet.appendRow([
          log.id,
          log.routineName,
          new Date(log.startedAt),
          new Date(log.endedAt),
          log.durationSeconds,
          log.status,
          log.reps,
          log.details
        ]);
      }
    } finally {
      lock.releaseLock();
    }
    return respond_({ok:true, id:log.id}, callback);
  } catch (err) {
    return respond_({ok:false, error:String(err)}, callback);
  }
}

// Saves or replaces all rows for one routine. Rows are JSON-encoded in p.rows.
function saveRoutineRows_(p, callback) {
  try {
    const routineName = String(p.routine_name || '').slice(0, 120);
    if (!routineName) throw new Error('Missing routine_name');
    let rows;
    try { rows = JSON.parse(p.rows || '[]'); } catch (_) { throw new Error('rows must be JSON'); }
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('rows is empty');
    if (rows.length > 50) throw new Error('Too many rows (max 50)');

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('Routines');
    if (!sheet) {
      sheet = ss.insertSheet('Routines');
      sheet.appendRow(['Routine','Order','Exercise','Duration_s','Rest_s','Side','Reps','Image_URL','Notes']);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // Delete existing rows for this routine.
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
        for (let i = data.length - 1; i >= 0; i--) {
          if (String(data[i]) === routineName) sheet.deleteRow(i + 2);
        }
      }
      // Append new rows.
      rows.forEach(r => sheet.appendRow([
        routineName,
        Number(r.Order) || 0,
        String(r.Exercise || '').slice(0, 120),
        Number(r.Duration_s) || 30,
        Number(r.Rest_s) || 0,
        String(r.Side || 'None').slice(0, 10),
        Number(r.Reps) || 0,
        String(r.Image_URL || '').slice(0, 500),
        String(r.Notes || '').slice(0, 300)
      ]));
    } finally {
      lock.releaseLock();
    }
    return respond_({ok:true, routine: routineName, count: rows.length}, callback);
  } catch (err) {
    return respond_({ok:false, error:String(err)}, callback);
  }
}

// Deletes all rows for one routine from the Routines sheet.
function deleteRoutineRows_(p, callback) {
  try {
    const routineName = String(p.routine_name || '').slice(0, 120);
    if (!routineName) throw new Error('Missing routine_name');
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Routines');
    if (!sheet || sheet.getLastRow() < 2) return respond_({ok:true, deleted:0}, callback);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let deleted = 0;
    try {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
      for (let i = data.length - 1; i >= 0; i--) {
        if (String(data[i]) === routineName) { sheet.deleteRow(i + 2); deleted++; }
      }
    } finally {
      lock.releaseLock();
    }
    return respond_({ok:true, deleted}, callback);
  } catch (err) {
    return respond_({ok:false, error:String(err)}, callback);
  }
}

function deleteWorkout_(p, callback) {
  try {
    const id = String(p.log_id || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new Error('Invalid log_id');
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('WorkoutLogs');
    if (!sheet) throw new Error('WorkoutLogs tab not found');
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return respond_({ok:true,deleted:false}, callback);
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      const rowIdx = ids.indexOf(id);
      if (rowIdx >= 0) sheet.deleteRow(rowIdx + 2);
      return respond_({ok:true, deleted: rowIdx >= 0}, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond_({ok:false, error:String(err)}, callback);
  }
}

// The PWA uses doGet JSONP requests. doPost is disabled.
function doPost(e) {
  return json_({ok:false, error:'Use doGet actions.'});
}

function readRows_(tabName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(row => row.some(value => value !== '')).map(row => {
    const item = {};
    headers.forEach((header, index) => item[header] = row[index]);
    return item;
  });
}

// Returns WorkoutLogs as normalized objects, with times in epoch milliseconds.
// details is a JSON string of per-exercise totals, parsed on the device.
function readWorkouts_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('WorkoutLogs');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  return rows.filter(r => r[0] !== '').map(r => ({
    id: String(r[0]),
    routineName: String(r[1]),
    startedAt: new Date(r[2]).getTime(),
    endedAt: new Date(r[3]).getTime(),
    durationSeconds: Number(r[4]) || 0,
    status: String(r[5] || 'completed'),
    reps: Number(r[6]) || 0,
    details: String(r[7] || '[]')
  }));
}

// Compares tokens without stopping at the first mismatched character.
function safeEqual_(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function respond_(data, callback) {
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(data);
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
