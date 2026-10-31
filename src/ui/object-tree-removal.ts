/** Indicator port members a multi-selection removal uses (ChartController['indicators']). */
export interface ObjectTreeRemovalPort {
 beginExternalTransaction():{release(publishChanges:boolean):void};
 remove(id:string):void;
}
/** Removes an Object tree multi-selection (indicators and drawings) as ONE workspace publication, so one undo
 * step restores all of it. Indicator notifications are held (the port's external transaction) while each indicator is
 * removed. The drawing removal, when there is one, then publishes a single capture that carries both the drawings and
 * the indicators; releasing the hold publishes the indicator change when there is no drawing removal (and is a no-op
 * capture otherwise). Accepted removals always publish, even when a later removal fails.
 * `confirm` (the host's saved==native capture verification) runs after that publication whenever an
 * indicator removal was attempted, also when a later removal, the drawing removal or the publication failed, so a
 * partial acceptance is confirmed or quarantined, never left unverified. It receives the accepted indicator ids. */
export function removeObjectsAsOneStep(port:ObjectTreeRemovalPort,indicatorIds:readonly string[],removeDrawings?:()=>void,confirm?:(acceptedIndicatorIds:readonly string[])=>void):void{
 const hold=port.beginExternalTransaction(),accepted:string[]=[],failures:unknown[]=[];let attempted=false;
 try{for(const id of indicatorIds){attempted=true;port.remove(id);accepted.push(id);}removeDrawings?.();}catch(error){failures.push(error);}
 try{hold.release(true);}catch(error){failures.push(error);}
 if(attempted&&confirm)try{confirm(accepted);}catch(error){failures.push(error);}
 if(failures.length===1)throw failures[0];
 if(failures.length)throw new AggregateError(failures,'Object tree removal and its workspace publication failed.');
}
