// Timer engine uses wall-clock timestamps to avoid countdown drift.
const WorkoutEngine = (() => {
  let routine=[], index=0, phase='idle', endAt=0, remaining=0, ticker=null, paused=false, startedAt=0, onUpdate=()=>{}, onFinish=()=>{};
  const current=()=>routine[index];
  const next=()=>routine[index+1];
  function snapshot(){
    const left=(phase==='idle'||phase==='done'||phase==='stopped')?0:(paused?remaining:Math.max(0,Math.ceil((endAt-Date.now())/1000)));
    return {phase,index,total:routine.length,current:current(),next:next(),remaining:left,paused};
  }
  function tick(){
    if(!paused && phase!=='idle'){remaining=Math.max(0,Math.ceil((endAt-Date.now())/1000));onUpdate(snapshot());if(remaining<=0)advance();}
  }
  function start(items,callbacks={}){
    routine=items;index=0;phase='idle';remaining=0;paused=true;startedAt=Date.now();onUpdate=callbacks.onUpdate||(()=>{});onFinish=callbacks.onFinish||(()=>{});
    clearInterval(ticker);ticker=null;onUpdate(snapshot());
  }
  function startCurrent(){
    if(phase!=='idle' && !(phase==='exercise'&&paused)) return;
    if(phase==='idle'){phase='exercise';}else{phase='exercise';}
    beginPhase('exercise',current().duration);
    if(!ticker) ticker=setInterval(tick,200);
  }
  function beginPhase(which,seconds){
    phase=which;remaining=Math.max(1,seconds);endAt=Date.now()+remaining*1000;paused=false;onUpdate(snapshot());
  }
  function advance(){
    if(phase==='exercise' && current().rest>0){beginPhase('rest',current().rest);return;}
    index++;
    if(index>=routine.length){clearInterval(ticker);ticker=null;phase='done';paused=false;onFinish({startedAt,endedAt:Date.now(),routineName:'Daily Mobility'});return;}
    beginPhase('exercise',current().duration);
  }
  function pause(){if(!paused && phase==='exercise'){remaining=Math.max(0,Math.ceil((endAt-Date.now())/1000));paused=true;onUpdate(snapshot());}}
  function resume(){if(paused && phase==='exercise'){endAt=Date.now()+remaining*1000;paused=false;onUpdate(snapshot());}}
  function skip(){if(phase==='idle'){startCurrent();return;} if(phase==='exercise'||phase==='rest')advance();}
  function stop(){clearInterval(ticker);ticker=null;phase='stopped';paused=true;onUpdate(snapshot());}
  function state(){return snapshot();}
  return {start,startCurrent,pause,resume,skip,stop,state};
})();
