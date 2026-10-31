/** Retire ownership before any external cleanup; teardown failures cannot revive old state. */
export function retireChart(actions:{retire:()=>void;ready:()=>void;dispose:()=>void;report:(message:string)=>void}){
 const errors:unknown[]=[];
 for(const action of [actions.retire,actions.ready,actions.dispose])try{action();}catch(error){errors.push(error);}
 if(errors.length)try{actions.report('The previous chart was retired, but its cleanup was incomplete. The current workspace remains committed; reopen the chart if output is unavailable. '+errors.map(String).join('; '));}catch{/* Reporting cannot prevent retirement. */}
 return errors;
}
export function attemptEveryCleanup(steps:Array<()=>void>,message:string){const errors:unknown[]=[];for(const step of steps)try{step();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,message);}
