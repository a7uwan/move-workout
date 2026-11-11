// MOVE Google Apps Script API — starter backend.
// 1) Create a Google Sheet with tabs: Routines, Exercises, RoutineDetails, WorkoutLogs.
// 2) Set SHEET_ID below.
// 3) Deploy as Web App. Do not treat a token embedded in public frontend code as secure.
const SHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
const API_TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_TOKEN';

function doGet(e) {
  if (!authorized_(e)) return json_({ok:false,error:'Unauthorized'});
  const action = (e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') return json_({ok:true,app:'MOVE API'});
  if (action === 'routines') return json_({ok:true,routines:readRows_('Routines')});
  return json_({ok:false,error:'Unknown action'});
}

function doPost(e) {
  if (!authorized_(e)) return json_({ok:false,error:'Unauthorized'});
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (body.action !== 'saveWorkout') return json_({ok:false,error:'Unknown action'});
    const log = body.log || {};
    if (!log.id || !log.routineName || !log.startedAt) throw new Error('Missing required fields');
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('WorkoutLogs');
    if (!sheet) throw new Error('WorkoutLogs tab not found');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const ids = sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().flat() : [];
      if (!ids.includes(log.id)) sheet.appendRow([log.id,log.routineName,new Date(log.startedAt),new Date(log.endedAt),log.durationSeconds,log.status || 'completed']);
    } finally { lock.releaseLock(); }
    return json_({ok:true,id:log.id});
  } catch(err) { return json_({ok:false,error:String(err)}); }
}

function authorized_(e) {
  return !!(e && e.parameter && e.parameter.token === API_TOKEN);
}
function readRows_(tabName) {
  const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if(!sheet || sheet.getLastRow()<2) return [];
  const values=sheet.getDataRange().getValues(), headers=values.shift();
  return values.filter(r=>r.some(v=>v!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
