export type DrawingSubscriber=()=>boolean|void;

/** A synchronous grid rejection is a publication failure, not a successful save. */
export function publishDrawingSubscribers(subscribers:ReadonlySet<DrawingSubscriber>):void{
 const failures:unknown[]=[];
 for(const callback of [...subscribers]){
  if(!subscribers.has(callback))continue;
  try{if(callback()===false)throw Error('Drawing changes were rejected by the workspace. Reopen the chart before editing again.');}
  catch(error){failures.push(error);}
 }
 if(failures.length)throw new AggregateError(failures,'Drawing changes could not finish publishing to the workspace.');
}
