/** The floating drawing bar opens when a press
 * selects a drawing. The pinned renderer selects on `pointerdown`, the App renders the bar in the microtask after that
 * listener, and only then does the browser hit-test the same press's `mousedown`. A bar mounted under the pointer
 * therefore took the rest of the press: focus moved to its More button, so Delete (a chart key) was ignored, and a drag
 * started there never reached the drawing. A bar mounted while a primary press is held lets that press through
 * (pointer-events none) until the press ends; one task after the release, after its mouseup and click were dispatched, the
 * bar becomes interactive. The ref is a stable module function, so React runs it once per mount and never on re-render:
 * a press on the bar's own buttons is never made passive. */
export const PRESS_THROUGH_ATTR='data-lv-press-through';
interface PressListenerTarget{addEventListener(type:string,listener:(event:any)=>void,options?:boolean):void;removeEventListener(type:string,listener:(event:any)=>void,options?:boolean):void}
interface PressNode{style:{pointerEvents:string};setAttribute(name:string,value:string):void;removeAttribute(name:string):void}
interface PressDocument{querySelectorAll(selector:string):ArrayLike<PressNode>|Iterable<PressNode>}
export interface BarPressTracker{held():boolean;dispose():void}
let active:BarPressTracker|null=null;
/** Tracks the primary press on `target` (the window, capture phase, so it runs before the renderer's own listeners). */
export function installBarPressTracker(target:PressListenerTarget,doc:PressDocument,defer:(run:()=>void)=>void=run=>{setTimeout(run,0);}):BarPressTracker{
 active?.dispose();
 let pressed=false,disposed=false;
 const down=(event:{button?:number})=>{if(event?.button===undefined||event.button===0)pressed=true;};
 const release=()=>{if(!pressed)return;pressed=false;defer(()=>{if(pressed||disposed)return;for(const node of Array.from(doc.querySelectorAll('['+PRESS_THROUGH_ATTR+']') as ArrayLike<PressNode>)){node.style.pointerEvents='';node.removeAttribute(PRESS_THROUGH_ATTR);}});};
 const listeners:[string,(event:any)=>void][]=[['pointerdown',down],['pointerup',release],['pointercancel',release],['blur',release]];
 for(const [type,listener] of listeners)target.addEventListener(type,listener,true);
 const tracker:BarPressTracker={held:()=>pressed&&!disposed,dispose(){if(disposed)return;disposed=true;pressed=false;for(const [type,listener] of listeners)target.removeEventListener(type,listener,true);if(active===tracker)active=null;}};
 active=tracker;return tracker;
}
/** True while the primary press that may have opened a bar is still held. */
export function barPressHeld():boolean{return active?.held()??false;}
/** Ref for the bar root: a bar that mounts during a held press ignores the pointer until that press ends. */
export function markPressThrough(node:PressNode|null):void{
 if(!node||!barPressHeld())return;
 node.style.pointerEvents='none';node.setAttribute(PRESS_THROUGH_ATTR,'');
}
if(typeof window!=='undefined'&&typeof document!=='undefined'&&typeof window.addEventListener==='function')installBarPressTracker(window,document);
