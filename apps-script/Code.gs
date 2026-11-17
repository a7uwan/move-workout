// MOVE Google Apps Script API — JSONP enabled for the GitHub Pages PWA.
// IMPORTANT: Copy your existing SHEET_ID and API_TOKEN values into these constants.
const SHEET_ID = 'https://script.google.com/macros/s/AKfycbyI40V2UwZHqzF2N9MI6ArCZE7qpCJLw7aGGSnR72DCsZWpXCWk6EfY10VpC8odSVy3/exec';
const API_TOKEN = '3167436';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== API_TOKEN) return respond_({ok:false,error:'Unauthorized'}, p.callback);

  const action = p.action || 'ping';
  if (action === 'ping') return respond_({ok:true,app:'MOVE API'}, p.callback);
  if (action === 'routines') return respond_({ok:true,routines:readRows_('Routines')}, p.callback);

  if (action === 'saveWorkout') {
    try {
      const log = {
        id: p.log_id,
        routineName: p.routine_name,
        startedAt: p.start_time,
        endedAt: p.end_time,
        durationSeconds: p.duration_seconds,
        status: p.status || 'completed'
      };
      if (!log.id || !log.routineName || !log.startedAt || !log.endedAt) {
        throw new Error('Missing required workout fields');
      }
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
            new Date(Number(log.startedAt)),
            new Date(Number(log.endedAt)),
            Number(log.durationSeconds),
            log.status
          ]);
        }
      } finally {
        lock.releaseLock();
      }
      return respond_({ok:true,id:log.id}, p.callback);
    } catch (err) {
      return respond_({ok:false,error:String(err)}, p.callback);
    }
  }
  return respond_({ok:false,error:'Unknown action'}, p.callback);
}

// The PWA uses doGet JSONP requests. Keep doPost for future non-browser integrations.
function doPost(e) {
  return json_({ok:false,error:'This PWA version uses GET/JSONP. Use doGet actions.'});
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
