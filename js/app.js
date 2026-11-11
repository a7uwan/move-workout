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
const $ = id => document.getElementById(id);
let workoutStart=0, completed=false;
function showView(id){
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('selected',b.dataset.view===id));
}
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function renderRoutines(){
 const html=`<article class="glass routine-card"><div class="routine-symbol">✧</div><div><strong>Daily Mobility</strong><small>8 exercises · Approx. 8 minutes + transitions</small></div><button aria-label="Start routine" class="routine-start">›</button></article>`;
 $('routineList').innerHTML=html;$('allRoutines').innerHTML=html;
 document.querySelectorAll('.routine-start').forEach(b=>b.onclick=startWorkout);
}
function startWorkout(){
 workoutStart=Date.now();completed=false;showView('timerView');
 WorkoutEngine.start(defaultRoutine,{onUpdate:renderTimer,onFinish:finishWorkout});
}
function renderTimer(s){
 $('timerStep').textContent=s.phase==='ready'?'GET READY':s.phase==='rest'?'REST':'EXERCISE';
 $('sessionProgress').textContent=`Exercise ${Math.min(s.index+1,s.total)} of ${s.total}`;
 $('exerciseName').textContent=s.phase==='ready'?'Get into position':s.phase==='rest'?'Take a breath':s.current.name;
 $('exerciseSide').textContent=s.phase==='ready'?'Your workout starts shortly':s.phase==='rest'?'Prepare for the next movement':s.current.side;
 $('timerDisplay').textContent=`00:${String(s.remaining).padStart(2,'0')}`;
 $('upNext').textContent=s.phase==='rest'?(s.next?.name||'Finish workout'):(s.current?.name||'Starting');
 $('pauseBtn').textContent=s.paused?'RESUME':'PAUSE';
 const total=s.phase==='ready'?10:s.phase==='rest'?s.current.rest:s.current.duration;
 const pct=total?((total-s.remaining)/total)*360:0;
 $('timerRing').style.background=`conic-gradient(var(--green) ${pct}deg,rgba(255,255,255,.10) ${pct}deg)`;
 if(s.remaining<=3 && s.remaining>0 && !s.paused) beep();
}
function beep(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=660;g.gain.value=.035;o.start();o.stop(c.currentTime+.09);o.onended=()=>c.close();}catch(e){}}
async function finishWorkout(data){
 completed=true;
 const record={id:crypto.randomUUID(),routineName:'Daily Mobility',startedAt:data.startedAt,endedAt:data.endedAt,durationSeconds:Math.round((data.endedAt-data.startedAt)/1000),status:'completed',syncStatus:'pending'};
 await MoveDB.saveWorkout(record);toast('Workout saved on this device');renderStats();showView('historyView');
}
async function renderStats(){
 const logs=await MoveDB.getWorkouts(),mins=logs.reduce((a,x)=>a+Math.round(x.durationSeconds/60),0);
 $('totalSessions').textContent=logs.length;$('totalMinutes').textContent=`${mins} min`;$('weekMinutes').textContent=`${mins} min`;$('weeklySessions').textContent=`${logs.length} workouts`;
 $('streakValue').textContent=`${logs.length} ${logs.length===1?'day':'days'}`;
 $('historyList').innerHTML=logs.length?logs.map(x=>`<article class="glass history-item"><strong>${x.routineName}</strong><small>${new Date(x.startedAt).toLocaleString()} · ${Math.round(x.durationSeconds/60)} min</small></article>`).join(''):'<article class="glass history-item"><strong>No workouts yet</strong><small>Your completed sessions will appear here.</small></article>';
}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{showView(b.dataset.view);renderStats();}));
$('openWorkouts').onclick=()=>showView('workoutsView');$('startFeatured').onclick=startWorkout;
$('backHome').onclick=()=>{WorkoutEngine.stop();showView('homeView');};
$('pauseBtn').onclick=()=>{const s=WorkoutEngine.state();s.paused?WorkoutEngine.resume():WorkoutEngine.pause();};
$('skipBtn').onclick=()=>WorkoutEngine.skip();
$('endBtn').onclick=()=>{if(confirm('End this workout now? It will not be counted as completed.')){WorkoutEngine.stop();showView('homeView');toast('Workout ended');}};
$('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
renderRoutines();renderStats();
window.addEventListener('online',()=>$('connectionStatus').textContent='Online');
window.addEventListener('offline',()=>$('connectionStatus').textContent='Offline');
$('connectionStatus').textContent=navigator.onLine?'Ready':'Offline';
