/** A drawing change made on the chart while the routine background autosave holds it is published after the
 * hold instead of being dropped.
 *
 * The save holds the chart for its write (App.tsx persistLayoutCandidate -> grid-tree-coordinator suspend -> adapter.ts
 * suspendTree -> tree-suspension.ts). A native gesture made meanwhile (dragging a drawing or one of its anchors, inline text
 * editing of a Text or Callout drawing) changes the chart at once, before any LV code can queue it. Its publication was held
 * (adapter notifyDrawings marks drawingDirty inside the hold) and then dropped: the hold ends with release(publish=false),
 * which clears drawingDirty, so the workspace never recorded the change (no undo step, not saved, gone after relaunch).
 *
 * The hold now remembers that a drawing publication was held back and tells its listeners each time one is (the grid
 * forwards this to App, which queues ONE publication per chart behind the write, in press order with the held keys and
 * queued edits). When that entry runs, flush() publishes the chart's drawings through the ordinary path, so the change
 * becomes its own workspace change and undo step and the next autosave writes it. Any ordinary publication made first
 * carries every held change too, so flush() then has nothing to do.
 *
 * Pure: the publication and liveness are ports, so the policy is testable alone.
 */
export interface HeldDrawingPublicationPort {
 /** The ordinary drawing publication (adapter notifyDrawings). */
 publish():void;
 /** False once the chart is disposed: nothing is remembered or published for it. */
 live():boolean;
 /** A listener failure; it never stops the other listeners or the hold. */
 report(error:unknown):void;
}
export interface HeldDrawingPublication {
 /** A routine background hold starts (tree suspension). release(dirty): the hold ends; dirty means a drawing change was
  * still held at that moment (it is remembered as if held just now). */
 hold():{release(dirty:boolean):void};
 /** A drawing publication was held back. Inside a routine hold it is remembered and the listeners are told. */
 held():void;
 /** An ordinary drawing publication went out. It carries every held change, so nothing stays pending. */
 published():void;
 pending():boolean;
 subscribe(listener:()=>void):()=>void;
 /** Publishes a remembered change once no routine hold is open. true: it was published; false: nothing to publish. */
 flush():boolean;
}
export function createHeldDrawingPublication(port:HeldDrawingPublicationPort):HeldDrawingPublication{
 let holds=0,pending=false;const listeners=new Set<()=>void>();
 const held=()=>{
  if(!holds||!port.live())return;
  pending=true;
  for(const listener of [...listeners])try{listener();}catch(error){try{port.report(error);}catch{/* A failing report cannot stop the hold. */}}
 };
 return Object.freeze({
  hold(){
   holds++;let released=false;
   return{release(dirty:boolean){if(released)return;released=true;try{if(dirty)held();}finally{holds--;}}};
  },
  held,
  published(){pending=false;},
  pending:()=>pending,
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  flush(){
   if(!pending||holds||!port.live())return false;
   pending=false;port.publish();return true;
  },
 });
}
