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
 speak('Get into position');
}
function renderTimer(s){
 $('timerStep').textContent=s.phase==='idle'?'READY WHEN YOU ARE':s.phase==='rest'?'REST':s.phase==='done'?'COMPLETE':'EXERCISE';
 $('sessionProgress').textContent=`Exercise ${Math.min(s.index+1,s.total)} of ${s.total}`;
 $('exerciseName').textContent=s.phase==='idle'?'Get into position':s.phase==='rest'?'Take a breath':s.current?.name||'Workout complete';
 $('exerciseSide').textContent=s.phase==='idle'?'Get comfortable, then tap START TIMER':s.phase==='rest'?'Prepare for the next movement':(s.current?.side||'');
 $('timerDisplay').textContent=s.phase==='idle'?'00:00':`00:${String(s.remaining).padStart(2,'0')}`;
 $('upNext').textContent=s.phase==='idle'?s.current.name:(s.phase==='rest'?(s.next?.name||'Finish workout'):(s.next?.name||'Finish workout'));
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
let lastAnnouncement='';
function speak(message){
 if(!('speechSynthesis' in window)) return;
 window.speechSynthesis.cancel();
 const utterance=new SpeechSynthesisUtterance(message);utterance.lang='en-US';utterance.rate=0.92;
 window.speechSynthesis.speak(utterance);
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
$('pauseBtn').onclick=()=>{const s=WorkoutEngine.state();if(s.phase==='idle'){WorkoutEngine.startCurrent();}else if(s.paused){WorkoutEngine.resume();}else{WorkoutEngine.pause();}};
$('skipBtn').onclick=()=>WorkoutEngine.skip();
$('endBtn').onclick=()=>{if(confirm('End this workout now? It will not be counted as completed.')){WorkoutEngine.stop();showView('homeView');toast('Workout ended');}};
$('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
renderRoutines();renderStats();
window.addEventListener('online',()=>$('connectionStatus').textContent='Online');
window.addEventListener('offline',()=>$('connectionStatus').textContent='Offline');
$('connectionStatus').textContent=navigator.onLine?'Ready':'Offline';
