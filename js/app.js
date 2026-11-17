const defaultRoutine = [
 {name:'Piriformis Stretch (Supine)',duration:60,rest:10,side:'Right 30s · Left 30s'},
 {name:'Supine Spinal Twist',duration:60,rest:10,side:'Right 30s · Left 30s'},
 {name:'Single Leg Hamstring Stretch',duration:60,rest:10,side:'Right 30s · Left 30s'},
 {name:'Ankle on the Knee',duration:60,rest:10,side:'Right 30s · Left 30s'},
 {name:'Glute Bridge',duration:30,rest:10,side:'Timed set'},
 {name:'Hip Opener (Chair)',duration:60,rest:10,side:'Right 30s · Left 30s'},
 {name:'Hip Flexor Stretch',duration:60,rest:10,side:'Right 30s · Left 30s'},
 {name:'Dumbbell Bicep Curl',duration:60,rest:0,side:'Target: 100 reps (timer placeholder)'}
];
const DAY_MS = 86400000;
const $ = id => document.getElementById(id);
let workoutStart=0, completed=false, lastAnnouncement='';

function showView(id){
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('selected',b.dataset.view===id));
}
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function setStatus(text){$('connectionStatus').textContent=text;}
function escapeHtml(value){
 return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderRoutines(){
 const html=`<article class="glass routine-card"><div class="routine-symbol">✧</div><div><strong>Daily Mobility</strong><small>8 exercises · Approx. 8 minutes + transitions</small></div><button aria-label="Start routine" class="routine-start">›</button></article>`;
 $('routineList').innerHTML=html;$('allRoutines').innerHTML=html;
 document.querySelectorAll('.routine-start').forEach(b=>b.onclick=startWorkout);
}

function startWorkout(){
 workoutStart=Date.now();completed=false;showView('timerView');
 WorkoutEngine.start(defaultRoutine,{onUpdate:renderTimer,onFinish:finishWorkout});
 speak('Get into position');
}

function renderTimer(s){
 $('timerStep').textContent=s.phase==='idle'?'READY WHEN YOU ARE':s.phase==='rest'?'REST':s.phase==='done'?'COMPLETE':'EXERCISE';
 $('sessionProgress').textContent=`Exercise ${Math.min(s.index+1,s.total)} of ${s.total}`;
 $('exerciseName').textContent=s.phase==='idle'?'Get into position':s.phase==='rest'?'Take a breath':s.current?.name||'Workout complete';
 $('exerciseSide').textContent=s.phase==='idle'?'Get comfortable, then tap START TIMER':s.phase==='rest'?'Prepare for the next movement':(s.current?.side||'');
 $('timerDisplay').textContent=s.phase==='idle'?'00:00':`00:${String(s.remaining).padStart(2,'0')}`;
 $('upNext').textContent=s.phase==='idle'?s.current.name:(s.next?.name||'Finish workout');
 $('pauseBtn').textContent=s.phase==='idle'?'START TIMER':s.paused?'RESUME':'PAUSE';
 $('pauseBtn').disabled=s.phase==='done'||s.phase==='stopped';
 const total=s.phase==='rest'?s.current.rest:s.current.duration;
 const pct=(total && s.phase!=='idle')?((total-s.remaining)/total)*360:0;
 $('timerRing').style.background=`conic-gradient(var(--green) ${pct}deg,rgba(255,255,255,.10) ${pct}deg)`;
 if(s.remaining<=3 && s.remaining>0 && !s.paused) beep();
 const signature=`${s.phase}-${s.index}`;
 if(signature!==lastAnnouncement && (s.phase==='exercise'||s.phase==='rest')){lastAnnouncement=signature;speak(s.phase==='rest'?'Rest':s.current.name);}
 if(s.phase==='idle') lastAnnouncement='idle';
}

function speak(message){
 if(!('speechSynthesis' in window)) return;
 window.speechSynthesis.cancel();
 const utterance=new SpeechSynthesisUtterance(message);utterance.lang='en-US';utterance.rate=0.92;
 window.speechSynthesis.speak(utterance);
}

function beep(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=660;g.gain.value=.035;o.start();o.stop(c.currentTime+.09);o.onended=()=>c.close();}catch(e){}}

/* ---------- Saving a finished workout ---------- */
async function finishWorkout(data){
 completed=true;
 const record={id:crypto.randomUUID(),routineName:'Daily Mobility',startedAt:data.startedAt,endedAt:data.endedAt,durationSeconds:Math.round((data.endedAt-data.startedAt)/1000),status:'completed',syncStatus:'pending'};
 await MoveDB.saveWorkout(record);
 showView('historyView');
 try {
   await MoveAPI.saveWorkout(record);
   await MoveDB.saveWorkout({...record,syncStatus:'synced'});
   toast('Workout saved to Google Sheets');
 } catch (err) {
   console.warn('MOVE cloud sync pending:', err);
   toast('Saved on this device · cloud sync pending');
 }
 await refreshData();
}

/* ---------- Sync: push pending, then pull everything from the sheet ---------- */
async function pushPending(){
 if(!navigator.onLine) return 0;
 const logs=await MoveDB.getWorkouts();
 const pending=logs.filter(x=>x.syncStatus!=='synced');
 let pushed=0;
 for(const record of pending){
   try {
     await MoveAPI.saveWorkout(record);
     await MoveDB.saveWorkout({...record,syncStatus:'synced'});
     pushed++;
   } catch(err) {
     console.warn('MOVE pending sync failed:',err.message);
     break;
   }
 }
 return pushed;
}

async function pullCloud(){
 const res=await MoveAPI.getWorkouts();
 for(const w of (res.workouts||[])){
   await MoveDB.saveWorkout({...w,syncStatus:'synced'});
 }
}

async function refreshData(){
 if(!navigator.onLine){
   setStatus('Offline');
   await renderAll();
   return;
 }
 try {
   await pushPending();
   await pullCloud();
   setStatus('Synced');
 } catch(err) {
   console.warn('MOVE cloud load failed:',err.message);
   setStatus('Cloud unavailable');
 }
 await renderAll();
}

/* ---------- Summary and history ---------- */
function startOfDay(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime();}
function addDays(ts,n){const d=new Date(ts);d.setDate(d.getDate()+n);d.setHours(0,0,0,0);return d.getTime();}
function startOfWeek(ts){const d=new Date(startOfDay(ts));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime();}
function sumSeconds(list){return list.reduce((a,x)=>a+(Number(x.durationSeconds)||0),0);}

function calcStreak(logs){
 const days=new Set(logs.map(x=>startOfDay(x.startedAt)));
 let cursor=startOfDay(Date.now());
 if(!days.has(cursor)) cursor=addDays(cursor,-1); // today may not be done yet
 let streak=0;
 while(days.has(cursor)){streak++;cursor=addDays(cursor,-1);}
 return streak;
}

function renderStats(logs){
 const weekStart=startOfWeek(Date.now());
 const weekLogs=logs.filter(x=>x.startedAt>=weekStart);
 const streak=calcStreak(logs);
 $('totalSessions').textContent=logs.length;
 $('totalMinutes').textContent=`${Math.round(sumSeconds(logs)/60)} min`;
 $('weekMinutes').textContent=`${Math.round(sumSeconds(weekLogs)/60)} min`;
 $('weeklySessions').textContent=`${weekLogs.length} ${weekLogs.length===1?'workout':'workouts'}`;
 $('streakValue').textContent=`${streak} ${streak===1?'day':'days'}`;
}

function renderHistory(logs){
 $('historyList').innerHTML=logs.length
   ? logs.map(x=>`<article class="glass history-item"><strong>${escapeHtml(x.routineName)}</strong><small>${new Date(x.startedAt).toLocaleString()} · ${Math.round(x.durationSeconds/60)} min · ${x.syncStatus==='synced'?'Synced':'Pending'}</small></article>`).join('')
   : '<article class="glass history-item"><strong>No workouts yet</strong><small>Your completed sessions will appear here.</small></article>';
}

async function renderAll(){
 const logs=await MoveDB.getWorkouts();
 renderStats(logs);
 renderHistory(logs);
}

/* ---------- Events ---------- */
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{
 showView(b.dataset.view);
 refreshData();
}));
$('openWorkouts').onclick=()=>showView('workoutsView');
$('startFeatured').onclick=startWorkout;
$('backHome').onclick=()=>{WorkoutEngine.stop();showView('homeView');};
$('pauseBtn').onclick=()=>{const s=WorkoutEngine.state();if(s.phase==='idle'){WorkoutEngine.startCurrent();}else if(s.paused){WorkoutEngine.resume();}else{WorkoutEngine.pause();}};
$('skipBtn').onclick=()=>WorkoutEngine.skip();
$('endBtn').onclick=()=>{if(confirm('End this workout now? It will not be counted as completed.')){WorkoutEngine.stop();showView('homeView');toast('Workout ended');}};
window.addEventListener('online',()=>{setStatus('Online');refreshData();});
window.addEventListener('offline',()=>setStatus('Offline'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden) refreshData();});

/* ---------- Start ---------- */
$('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
renderRoutines();
setStatus(navigator.onLine?'Ready':'Offline');
renderAll();   // show cached data immediately
refreshData(); // then sync with Google Sheets
