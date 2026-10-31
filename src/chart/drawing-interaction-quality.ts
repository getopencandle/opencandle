/**
 * Shift behaviour of the pinned native drawing interaction.
 *
 * The native press handler reads Shift over a drawing as "toggle it in the selection" and returns before it looks for a
 * handle, so Shift held at the press can never start a constrained drag, and a body drag ignores Shift altogether. These
 * wrappers keep the native bodies and only change what Shift means:
 *  - Shift + press on a drawing grabs it as a normal press. Released without moving, it still toggles the selection.
 *  - Ctrl/Cmd presses, the marquee and the eraser are untouched.
 *
 * Shift is an axis lock, held before or after the drag starts.
 *  - While Shift is down the drag is locked to the axis it has moved further along since the press (ties: horizontal).
 *    Horizontal keeps the price exactly, vertical keeps the time exactly. The axis is re-picked only while the drag is
 *    under AXIS_PICK_PX from its origin, so it does not flip-flop. Releasing Shift frees the drag; pressing it again
 *    re-picks from the drag so far. A Shift key press or release with the pointer still re-applies the last move.
 *  - Handle drag (every tool): the dragged anchor keeps its press-time price (horizontal) or time (vertical). This
 *    replaces the native 45 degree endpoint lock of the line tools (owner request wins). The magnet still runs, resolved
 *    on the locked row or column, and only the free axis takes its result.
 *  - Body drag: the move stays on one axis (the locked axis has no pixel delta, so no time or price drift).
 *  - Placement of the second point (click-move-click and drag-place): line tools keep the native 45 degree
 *    angle lock (ANGLE_LOCK_PLACEMENT_TYPES); every other click-placed tool (fib, rectangle, channel...) axis-locks to the
 *    first point. Third and later points are not locked.
 *
 * Drag placement. A click-placed tool (trendline, ray, extended line,
 * rectangle, fib and every other multi-point tool) remembers where the press that started it landed. Released more than
 * DRAG_PLACE_PX away, the release places the next point exactly as a click there would (the native press body runs with the
 * last move's magnet mode and Shift lock), so a press-drag-release draws a two-point tool in one gesture. A press
 * released in place keeps click-move-click: the ghost follows the cursor until the next click. Thresholds.
 */
/** A placing press released farther than this (CSS px) from where it landed places the next point. */
export const DRAG_PLACE_PX=4;
/** The Shift axis is re-picked only while the drag is shorter than this (CSS px). */
export const AXIS_PICK_PX=6;
/** The pinned native ANGLE_SNAP_TYPES: these keep the 45 degree Shift lock while their second point is placed. */
export const ANGLE_LOCK_PLACEMENT_TYPES:ReadonlySet<string>=new Set(['trendline','ray','extendedline','infoline','trendangle','arrow']);
type Point={time:number;price:number;[key:string]:unknown};
type PressedState={kind:'pressed';id:string;handle:number;px:number;py:number;moved:boolean;mod?:boolean;orig?:Point[];[key:string]:unknown};
type InteractionState={kind:string;[key:string]:unknown};
type Projector={xOf(time:number):number;yOf(price:number,paneId?:string):number|null|undefined};
export interface NativeDrawingInteraction{
 state:InteractionState;
 deps:{activeTool:()=>unknown;emit:(intent:Record<string,unknown>)=>void;changed:()=>void;projector?:()=>Projector;[key:string]:unknown};
 hitAt(x:number,y:number):unknown;
 down(x:number,y:number,mode?:string,shift?:boolean,mod?:boolean):void;
 move(x:number,y:number,mode?:string,shift?:boolean):void;
 up(x:number,y:number):void;
}
type Down=NativeDrawingInteraction['down'];type Move=NativeDrawingInteraction['move'];type Up=NativeDrawingInteraction['up'];
type Draft={type:string;paneId:string;anchors:Point[];placementMode():unknown};
const pressed=(state:InteractionState):state is PressedState=>state.kind==='pressed';
/** A placement in progress whose points are placed by clicks (not a drag-placed or freehand tool). */
const clickPlacing=(state:InteractionState)=>{if(state.kind!=='placing')return false;const draft=state.draft as {placementMode?:()=>unknown}|undefined;return typeof draft?.placementMode==='function'&&draft.placementMode()==='click';};

export type Axis='x'|'y';
/** 'x' (horizontal: time moves, price held) when the drag has moved at least as far across as up or down, else 'y'. */
export function pickAxis(dx:number,dy:number):Axis{return Math.abs(dx)>=Math.abs(dy)?'x':'y';}
/** The pointer constrained to one axis from the press (default: the one it has moved further along; ties horizontal). */
export function constrainBodyDrag(px:number,py:number,x:number,y:number,axis:Axis=pickAxis(x-px,y-py)):{x:number;y:number}{
 return axis==='x'?{x,y:py}:{x:px,y};
}
/** A sticky Shift axis: null while Shift is up, picked from the drag so far, re-picked only under AXIS_PICK_PX. */
export function createAxisLock(){
 let axis:Axis|null=null;
 return{
  at(shift:boolean,dx:number,dy:number):Axis|null{
   if(!shift){axis=null;return null;}
   if(axis==null||Math.hypot(dx,dy)<AXIS_PICK_PX)axis=pickAxis(dx,dy);
   return axis;
  },
  reset(){axis=null;},
 };
}
type Lock={axis:Axis;anchor:Point};
type Resolver={resolve:(x:number,y:number,paneId:string,mode:string)=>Point;snapAt:unknown};
/** Runs `body` with the native resolve() locked: the magnet resolves on the locked row or column and the locked
 *  coordinate is the anchor's exact value. Only an own `resolve` slot is used, restored afterwards. */
function withLock(interaction:NativeDrawingInteraction,lock:Lock,body:()=>void){
 const target=interaction as unknown as Resolver;
 const previous=Object.getOwnPropertyDescriptor(target,'resolve'),native=target.resolve;
 Object.defineProperty(target,'resolve',{configurable:true,writable:true,enumerable:false,value(this:Resolver,x:number,y:number,paneId:string,mode:string){
  const proj=interaction.deps.projector?.();
  if(proj){
   if(lock.axis==='y'){const ax=proj.xOf(lock.anchor.time);if(Number.isFinite(ax))x=ax;}
   else{const ay=proj.yOf(lock.anchor.price,paneId);if(ay!=null&&Number.isFinite(ay))y=ay;}
  }
  const point=Reflect.apply(native,this,[x,y,paneId,mode]) as Point;
  const out=lock.axis==='x'?{...point,price:lock.anchor.price}:{...point,time:lock.anchor.time};
  const snap=this.snapAt as {point:Point}|null;
  if(snap)this.snapAt={...snap,point:out};
  return out;
 }});
 try{body();}
 finally{if(previous)Object.defineProperty(target,'resolve',previous);else Reflect.deleteProperty(target,'resolve');}
}

/** Wrappers for down/move/up of one native interaction. Each delegates to the original native body. `shiftKey` re-applies
 *  the last move when Shift goes down or up with the pointer still (the router feeds it from the keyboard). */
export function createDrawingInteractionQuality(interaction:NativeDrawingInteraction,original:{down:Down;move:Move;up:Up}=interaction){
 const down=original.down,move=original.move,up=original.up;
 // The press whose Shift was deferred: a click toggles selection, a drag moves or reshapes the drawing.
 let shiftPress:PressedState|null=null;
 // The press that started a click placement, and the last move's magnet mode and Shift state.
 let placePress:{x:number;y:number;state:InteractionState}|null=null,lastMove={mode:'off',shift:false};
 // The axis of the current drag and of the placement's second point, and the last pointer move.
 const dragAxis=createAxisLock(),placeAxis=createAxisLock();
 let lastPointer:{x:number;y:number;mode:string;shift:boolean}|null=null;
 /** The axis lock of a click placement's second point, or null (Shift up, line tool, other points). */
 const placingLock=(self:NativeDrawingInteraction,x:number,y:number,shift:boolean):Lock|null=>{
  const state=self.state;
  if(!clickPlacing(state))return null;
  const draft=state.draft as Draft,proj=self.deps.projector?.();
  if(!shift||draft.anchors.length!==1||ANGLE_LOCK_PLACEMENT_TYPES.has(draft.type)||!proj){placeAxis.reset();return null;}
  const anchor=draft.anchors[0],ax=proj.xOf(anchor.time),ay=proj.yOf(anchor.price,draft.paneId);
  if(!Number.isFinite(ax)||ay==null||!Number.isFinite(ay))return null;
  return{axis:placeAxis.at(true,x-ax,y-ay)!,anchor};
 };
 /** A placing press: the native body, axis-locked when the second point is being placed with Shift. */
 const placeDown=(self:NativeDrawingInteraction,x:number,y:number,mode:string,shift:boolean,mod:boolean)=>{
  const lock=placingLock(self,x,y,shift);
  if(lock)withLock(self,lock,()=>Reflect.apply(down,self,[x,y,mode,false,mod]));
  else Reflect.apply(down,self,[x,y,mode,shift,mod]);
  if(!clickPlacing(self.state)||(self.state.draft as Draft).anchors.length!==1)placeAxis.reset();
 };
 const quality={
  down(this:NativeDrawingInteraction,x:number,y:number,mode='off',shift=false,mod=false){
   shiftPress=null;placePress=null;lastPointer=null;dragAxis.reset();
   if(shift&&!mod&&this.state.kind==='idle'&&this.deps.activeTool()==null&&this.hitAt(x,y)){
    Reflect.apply(down,this,[x,y,mode,false,false]);
    if(pressed(this.state))shiftPress=this.state;
    return;
   }
   const before=this.state.kind;
   if(before==='placing')placeDown(this,x,y,mode,shift,mod);
   else{placeAxis.reset();Reflect.apply(down,this,[x,y,mode,shift,mod]);}
   lastMove={mode,shift};
   if(before!=='placing'&&clickPlacing(this.state))placePress={x,y,state:this.state};
  },
  move(this:NativeDrawingInteraction,x:number,y:number,mode='off',shift=false){
   const state=this.state;
   lastPointer={x,y,mode,shift};
   if(state.kind==='placing')lastMove={mode,shift};
   if(pressed(state)){
    const axis=dragAxis.at(shift,x-state.px,y-state.py);
    if(axis&&state.handle<0){const at=constrainBodyDrag(state.px,state.py,x,y,axis);Reflect.apply(move,this,[at.x,at.y,mode,false]);return;}
    const anchor=axis?state.orig?.[state.handle]:undefined;
    if(axis&&anchor){withLock(this,{axis,anchor},()=>Reflect.apply(move,this,[x,y,mode,false]));return;}
    Reflect.apply(move,this,[x,y,mode,shift]);
    return;
   }
   const lock=placingLock(this,x,y,shift);
   if(lock){withLock(this,lock,()=>Reflect.apply(move,this,[x,y,mode,false]));return;}
   Reflect.apply(move,this,[x,y,mode,shift]);
  },
  up(this:NativeDrawingInteraction,x:number,y:number){
   const start=placePress;placePress=null;lastPointer=null;dragAxis.reset();
   if(start&&this.state===start.state&&clickPlacing(this.state)&&Math.hypot(x-start.x,y-start.y)>DRAG_PLACE_PX){
    placeDown(this,x,y,lastMove.mode,lastMove.shift,false);
    return;
   }
   const state=this.state,deferred=shiftPress;shiftPress=null;
   if(deferred&&state===deferred&&!state.moved){
    this.state={kind:'idle'};
    this.deps.emit({kind:'select',ids:[state.id],additive:true});
    this.deps.changed();
    return;
   }
   Reflect.apply(up,this,[x,y]);
  },
  /** Shift went down or up: re-apply the last pointer move of a live drag or placement with the new Shift state. */
  shiftKey(this:NativeDrawingInteraction,shift:boolean):boolean{
   const last=lastPointer,state=this.state;
   if(!last||last.shift===shift)return false;
   if(!(pressed(state)&&state.moved)&&!clickPlacing(state))return false;
   quality.move.call(this,last.x,last.y,last.mode,shift);
   return true;
  },
 };
 return quality;
}
export type DrawingInteractionQuality=ReturnType<typeof createDrawingInteractionQuality>;
export const DRAWING_INTERACTION_QUALITY_KEYS=Object.freeze(['down','move','up'] as const);
