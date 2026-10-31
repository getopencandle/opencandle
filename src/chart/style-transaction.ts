/** Keep calculation/render style paired; invalidation follows successful native application.
 * `check` refuses a style that cannot be drawn BEFORE anything native changes (it runs only for `next`,
 * never during the rollback), so a refused style rolls back to the prior, already-drawn style. Before this, a refused range
 * size reached the renderer as an empty feed, the chart went unavailable, and the next style change failed both ways
 * ("Chart style application failed and rollback was incomplete"). */
export function commitChartStyle(next:string,port:{read:()=>string;write:(style:string)=>void;check?:()=>void;apply:()=>void;recompute:()=>void;invalidate:()=>void}){
 const prior=port.read();try{port.write(next);port.check?.();port.apply();port.recompute();if(prior!==next)port.invalidate();}catch(error){port.write(prior);try{port.apply();port.recompute();}catch(rollback){throw new AggregateError([error,rollback],'Chart style application failed and rollback was incomplete');}throw error;}
}
