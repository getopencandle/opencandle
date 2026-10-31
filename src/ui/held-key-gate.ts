/** Workspace keyboard commands pressed while a storage hold is active are never dropped silently.
 * During the routine background autosave they are queued and run once the hold ends, in order. Before EACH queued key the
 * hold state is read again: a key queued behind one that opened its own transaction (a queued Ctrl+Z starts a
 * history transaction) waits for that hold to end, and is refused visibly if it does not end in time. Each key also
 * re-checks the owner captured at the press: the App's capture covers the active chart, the grid generation and the
 * workspace's chart grid, so a chart edit made during the save refuses the queued key visibly instead of applying
 * it to a newer state. During a blocking transaction keys are refused visibly, except Escape (disarm), which stays silent
 * as it was before. Same class as the detached indicator change (App afterStorageWrite + runDetachedIndicatorChange). */
export type HeldKeyCommand=
 {kind:'undo'}|{kind:'redo'}|{kind:'disarm'}|{kind:'layouts'}|
 {kind:'arm';tool:'trendline'|'fibretracement'|'box'}|
 /** Ctrl+Alt+H toggles the current hide mode; Ctrl+C / Ctrl+V copy and paste drawings. Ctrl+X cuts
  * them (it was neither held nor routed during the save, so the press did nothing). */
 {kind:'hide-toggle'}|{kind:'copy'}|{kind:'paste'}|{kind:'cut'}|
 {kind:'place';tool:'hline'|'hray'|'vline'|'crossline'}|
 /** Bar Replay Shift+ArrowDown / Shift+ArrowRight / Shift+ArrowLeft. App builds it from replayShortcut (heldKeyCommand does not), with the session run the key was pressed for. */
 {kind:'replay';action:'toggle-play'|'step'|'step-back';runId:string};
export interface HeldKeyEvent {key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean}
/** The App keyboard commands (App.tsx keydown handler) a hold could swallow. Ctrl+S keeps its own route. */
export function heldKeyCommand(e:HeldKeyEvent):HeldKeyCommand|null{
 const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
 if(mod&&e.altKey&&!e.shiftKey)return key==='h'?{kind:'hide-toggle'}:null;
 if(mod&&!e.altKey){if(key==='z')return e.shiftKey?{kind:'redo'}:{kind:'undo'};if(key==='y')return{kind:'redo'};if(!e.shiftKey&&key==='c')return{kind:'copy'};if(!e.shiftKey&&key==='v')return{kind:'paste'};if(!e.shiftKey&&key==='x')return{kind:'cut'};return null;}
 if(e.altKey&&!mod){
  if(!e.shiftKey&&key==='t')return{kind:'arm',tool:'trendline'};
  if(!e.shiftKey&&key==='f')return{kind:'arm',tool:'fibretracement'};
  if(e.shiftKey&&key==='r')return{kind:'arm',tool:'box'};
  if(!e.shiftKey&&(key==='h'||key==='j'||key==='v'||key==='c'))return{kind:'place',tool:({h:'hline',j:'hray',v:'vline',c:'crossline'} as const)[key]};
  return null;
 }
 if(mod||e.altKey)return null;
 if(e.key==='Escape')return{kind:'disarm'};
 if(e.key==='.')return{kind:'layouts'};
 return null;
}
/** Ctrl+Alt+H, Ctrl+C and Ctrl+V never act while text is being edited. */
export const DRAWING_UTILITY_KEY_EDITING='input,textarea,select,[contenteditable="true"],[contenteditable=""]';
export function drawingUtilityKeyIgnored(event:{isComposing?:boolean;target:{closest?:(selector:string)=>unknown}|null}):boolean{
 return event.isComposing===true||!!event.target?.closest?.(DRAWING_UTILITY_KEY_EDITING);
}
export const HELD_KEY_BLOCKING='The chart is busy. Press the key again in a moment.';
export const HELD_KEY_PLACE='The workspace is saving. Press the key again to place at the crosshair.';
export const HELD_KEY_STALE='The chart changed while the workspace was saving. The key pressed during the save was not applied.';
export const HELD_KEY_FULL='Too many keys were pressed during the save. Press the key again afterward.';
export const HELD_KEY_TIMEOUT='The chart took too long. The keys pressed during the save were not applied.';
type HoldState='idle'|'background'|'blocking';
/** One queued drawing edit. run() checks its own owner and targets and reports its own refusal. */
export interface HeldEdit {run:()=>void}
export function createHeldKeyGate(port:{state:()=>HoldState;afterWrite:(run:()=>void)=>()=>void;capture:()=>()=>boolean;run:(command:HeldKeyCommand)=>void;report:(message:string)=>void;limit?:number;
 /** Waits out a blocking hold that has no storage-write waiter list (history, layout, template). Defaults to setTimeout. */
 retry?:(run:()=>void)=>void;retryMs?:number;maxWaitMs?:number;now?:()=>number}){
 const limit=port.limit??16,retryMs=port.retryMs??50,maxWaitMs=port.maxWaitMs??10000,now=port.now??(()=>Date.now());
 const retry=port.retry??(run=>{setTimeout(run,retryMs);});
 // The queue also holds drawing edits made during the hold (HeldEdit), so keys and edits run in press order.
 type Entry={command:HeldKeyCommand;current:()=>boolean}|{edit:HeldEdit};
 const queue:Entry[]=[];let waiting=false,draining=false,blockedSince:number|null=null;
 const refuseAll=(message:string)=>{const dropped=queue.splice(0);if(dropped.length)port.report(message);};
 function wait(state:HoldState){
  if(waiting)return;waiting=true;
  if(state==='background'){blockedSince=null;port.afterWrite(()=>{waiting=false;drain();});return;}
  if(blockedSince===null)blockedSince=now();
  if(now()-blockedSince>maxWaitMs){waiting=false;blockedSince=null;refuseAll(HELD_KEY_TIMEOUT);return;}
  retry(()=>{waiting=false;drain();});
 }
 /** through: runs the queue up to and including that entry (its own storage-write waiter); absent: the whole queue. */
 function drain(through?:Entry){
  if(through&&!queue.includes(through))return;
  draining=true;try{drainQueue(through);}finally{draining=false;}
 }
 function drainQueue(through?:Entry){
  while(queue.length){
   const state=port.state();if(state!=='idle'){wait(state);return;}
   blockedSince=null;const next=queue.shift()!;
   if('edit' in next){try{next.edit.run();}catch(error){port.report(String(error));}}
   else if(!next.current())port.report(HELD_KEY_STALE);
   else try{port.run(next.command);}catch(error){port.report(String(error));}
   if(next===through)return;
  }
 }
 /** During the background write each entry gets its own storage-write waiter, so it keeps its place among the
  * other work waiting there (App's indicator changes) and its waiter runs the queue up to it. */
 function enqueue(entry:Entry,state:HoldState){
  queue.push(entry);
  if(state==='idle')drain();else if(state==='background'){blockedSince=null;port.afterWrite(()=>drain(entry));}else wait(state);
 }
 return{
  /** true: the gate took the key (queued or refused visibly); the caller must stop handling it. false: no hold, handle it now. */
  accept(command:HeldKeyCommand):boolean{
   const state=port.state();if(state==='idle'&&!queue.length)return false;
   if(state==='blocking'&&!queue.length){if(command.kind!=='disarm')port.report(HELD_KEY_BLOCKING);return true;}
   // Crosshair placement depends on the pointer position at the press, which a deferred run cannot reproduce.
   if(command.kind==='place'){port.report(HELD_KEY_PLACE);return true;}
   if(queue.filter(row=>'command' in row).length>=limit){port.report(HELD_KEY_FULL);return true;}
   enqueue({command,current:port.capture()},state);
   return true;
  },
  /** A drawing edit made while the routine background autosave holds the chart (which refuses the edit or
   * leaves it unpublished). It waits in this queue, after the keys and edits made before it, and runs once the hold ends;
   * the edit re-checks its own chart and targets and reports its own refusal. false: no hold and nothing queued, so the
   * caller runs it now; also false for a blocking hold with nothing queued (the caller refuses it as before). */
  defer(edit:HeldEdit):boolean{
   // An edit made by an entry that is running from this queue (a held Ctrl+Alt+H runs the utility toggle) runs at once:
   // everything queued before it has already run, so queueing it again would only move it behind later entries.
   const state=port.state();if(state==='idle'&&draining)return false;if(!queue.length&&state!=='background')return false;
   enqueue({edit},state);
   return true;
  },
  pending:()=>queue.length,
 };
}
