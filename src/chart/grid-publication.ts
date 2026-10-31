/** Publication is accepted only by an explicit true; a retired tree's undefined is rejection. */
export function publishGridState<State>(port:{previous:State;next:State;notify:(next:State)=>boolean|void;accepted:(next:State)=>void;rejected:(message:string)=>void}):boolean{
 try{if(port.notify(port.next)!==true)throw Error('Workspace rejected this chart change. The saved configuration was retained.');port.accepted(port.next);return true;}catch(error){try{port.rejected(String(error));}catch{/* A diagnostic failure cannot turn rejection into acceptance. */}return false;}
}
