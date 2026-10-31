/** Work that the first chart paint does not need runs in small slices when the renderer is idle.
 * Each step runs on its own (a throwing step is skipped); steps share one idle callback while it has time left.
 * Without requestIdleCallback (tests, other hosts) each step gets a zero-delay timer. The returned function cancels. */
type IdleDeadline={timeRemaining():number};
type IdleHost={requestIdleCallback?:(run:(deadline:IdleDeadline)=>void,options?:{timeout:number})=>number;cancelIdleCallback?:(handle:number)=>void};

export function runIdleSteps(steps:ReadonlyArray<()=>void>,done:()=>void,options:{timeout?:number;sliceMs?:number}={}):()=>void{
 const host=globalThis as IdleHost,timeout=options.timeout??2000,slice=options.sliceMs??6;
 let index=0,cancelled=false,idle:number|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const schedule=()=>{if(typeof host.requestIdleCallback==='function')idle=host.requestIdleCallback(run,{timeout});else timer=setTimeout(()=>run(null),0);};
 const run=(deadline:IdleDeadline|null)=>{
  idle=undefined;timer=undefined;if(cancelled)return;
  do{const step=steps[index++];try{step?.();}catch{/* one failed step leaves its answer out */}if(cancelled)return;}
  while(index<steps.length&&deadline!==null&&deadline.timeRemaining()>slice);
  if(index>=steps.length){done();return;}
  schedule();
 };
 if(steps.length)schedule();else done();
 return()=>{cancelled=true;if(idle!==undefined)host.cancelIdleCallback?.(idle);if(timer!==undefined)clearTimeout(timer);};
}
