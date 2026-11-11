// Timer engine uses wall-clock timestamps so delayed UI updates don't accumulate drift.
const WorkoutEngine = (() => {
  let routine=[], index=0, phase='ready', endAt=0, remaining=10, ticker=null, paused=false, startedAt=0, onUpdate=()=>{}, onFinish=()=>{};
  const current=()=>routine[index];
  const next=()=>routine[index+1];
  function snapshot(){
    const left=paused?remaining:Math.max(0,Math.ceil((endAt-Date.now())/1000));
    return {phase,index,total:routine.length,current:current(),next:next(),remaining:left,paused};
  }
  function tick(){
    if(!paused){remaining=Math.max(0,Math.ceil((endAt-Date.now())/1000));onUpdate(snapshot());if(remaining<=0)advance();}
  }
  function start(items,callbacks={}){
    routine=items;index=0;phase='ready';remaining=10;paused=false;startedAt=Date.now();onUpdate=callbacks.onUpdate||(()=>{});onFinish=callbacks.onFinish||(()=>{});
    beginPhase('ready',10);clearInterval(ticker);ticker=setInterval(tick,200);
  }
  function beginPhase(which,seconds){
    phase=which;remaining=Math.max(1,seconds);endAt=Date.now()+remaining*1000;paused=false;onUpdate(snapshot());
  }
  function advance(){
    if(phase==='ready'){beginPhase('exercise',current().duration);return;}
    if(phase==='exercise' && current().rest>0){beginPhase('rest',current().rest);return;}
    index++;
    if(index>=routine.length){clearInterval(ticker);phase='done';onFinish({startedAt,endedAt:Date.now(),routineName:'Daily Mobility'});return;}
    beginPhase('exercise',current().duration);
  }
  function pause(){if(!paused){remaining=Math.max(0,Math.ceil((endAt-Date.now())/1000));paused=true;onUpdate(snapshot());}}
  function resume(){if(paused){endAt=Date.now()+remaining*1000;paused=false;onUpdate(snapshot());}}
  function skip(){advance();}
  function stop(){clearInterval(ticker);phase='stopped';onUpdate(snapshot());}
  function state(){return snapshot();}
  return {start,pause,resume,skip,stop,state};
})();
