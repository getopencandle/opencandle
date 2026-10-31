/**
 * One Text placement is one workspace change and one undo step.
 *
 * vela places an inline-editable drawing (Text, Callout) in two native notifications: `drawing:created` with the
 * initial label, then, after its inline editor closes, `drawing:edited` with the typed text (or `drawing:removed` when
 * an empty Text label is dropped). LV history records one step per drawings notification, so the placement became two
 * steps. This hold absorbs the notifications of that one placement and releases them as a single publication.
 *
 * One placement = one step, consistent with every other LV drawing tool.
 *
 * Pure: native editor state, the notification hold and timers are ports, so the policy is testable alone.
 */
export interface TextPlacementHoldPort {
 /** True while the native inline text editor is open on this drawing id. */
 editing(id:string):boolean;
 /** Starts holding drawing notifications (the adapter's drawing batch). */
 hold():void;
 /** Ends the hold. publish=true publishes the held notifications once; false only lifts the hold (disposal). */
 release(publish:boolean):void;
 schedule(callback:()=>void,ms:number):unknown;
 cancel(handle:unknown):void;
}
/** vela's inline-editable drawing types (TextLabel and Callout subclasses). 'lvanchoredtext' extends TextLabel, so vela opens the same inline editor for it. */
export const TEXT_PLACEMENT_INLINE_TYPES:ReadonlySet<string>=new Set(['text','callout','lvanchoredtext']);
/** vela opens the inline editor in a 0 ms timeout after the create; a placement whose editor has not opened by then
 * (an off-pane anchor, a programmatic add) is released as an ordinary single create. */
export const TEXT_PLACEMENT_EDITOR_GRACE_MS=50;
/** An editor closed with its text unchanged emits nothing; the open editor is re-checked at this interval. */
export const TEXT_PLACEMENT_EDITOR_POLL_MS=100;

export interface TextPlacementHold {
 /** A native create. idle=false (another drawing publication or reconciliation hold is open) never starts a hold. */
 created(id:string,type:string|undefined,idle:boolean):void;
 /** Before a native edit or removal is processed: a change to ANOTHER drawing ends the hold first (its own step). */
 beforeChange(id:string):void;
 /** After a native edit is processed: the edit that arrives once the editor has closed completes the placement. */
 edited(id:string):void;
 /** After a native removal is processed: removing the held drawing (an empty label dropped) completes it. */
 removed(id:string):void;
 active():boolean;
 dispose():void;
}

export function createTextPlacementHold(port:TextPlacementHoldPort,inlineTypes:ReadonlySet<string>=TEXT_PLACEMENT_INLINE_TYPES):TextPlacementHold{
 let pending:{id:string;timer:unknown}|null=null,disposed=false;
 const end=(publish:boolean)=>{
  const prior=pending;if(!prior)return;pending=null;
  try{port.cancel(prior.timer);}finally{port.release(publish);}
 };
 const editing=(id:string)=>{try{return port.editing(id);}catch{return false;}};
 const watch=(id:string)=>{
  if(!pending||pending.id!==id)return;
  if(editing(id))pending.timer=port.schedule(()=>watch(id),TEXT_PLACEMENT_EDITOR_POLL_MS);
  else end(true);
 };
 return Object.freeze({
  created(id:string,type:string|undefined,idle:boolean){
   if(disposed)return;
   if(pending)end(true);
   if(!idle||type===undefined||!inlineTypes.has(type))return;
   port.hold();pending={id,timer:null};
   pending.timer=port.schedule(()=>watch(id),TEXT_PLACEMENT_EDITOR_GRACE_MS);
  },
  beforeChange(id:string){if(pending&&pending.id!==id)end(true);},
  edited(id:string){if(pending?.id===id&&!editing(id))end(true);},
  removed(id:string){if(pending?.id===id)end(true);},
  active:()=>pending!==null,
  dispose(){disposed=true;end(false);},
 });
}
