// Pointer-driven watchlist row reordering, replacing the native HTML5 drag ghost.
// The pressed row (or the moving block: a multi-selection, or a section heading with its rows) lifts and follows the
// pointer, the other rows slide apart with a short transition to open a gap, and an insertion line marks the drop slot.
// Near the list's top or bottom edge the list scrolls. Escape, pointer cancel or a lost capture puts everything back.
// The drop reports the row the block lands before (null: the end), so the existing move semantics are unchanged.
// Rows are moved with inline transforms only; React never sees the preview, and the transforms are cleared on every end path.
export const ROW_DRAG_SLOP=4,ROW_DRAG_EDGE=28,ROW_DRAG_MAX_SPEED=14;

export interface RowBox{id:string;top:number;height:number}
export interface RowDragPlan{before:string|null;gap:number;lineY:number;blockTop:number;offsets:Map<string,number>;changed:boolean}

/** Pure layout: rows (content coordinates, display order), the moving ids, and where the lifted block's top is now. */
export function planRowDrag(rows:readonly RowBox[],moving:ReadonlySet<string>,blockTop:number):RowDragPlan{
 const block=rows.filter(row=>moving.has(row.id)),rest=rows.filter(row=>!moving.has(row.id));
 const base=rows.length?rows[0]!.top:0,blockHeight=block.reduce((sum,row)=>sum+row.height,0),restHeight=rest.reduce((sum,row)=>sum+row.height,0);
 // A row sits above the gap once the block's top has passed its middle (in the layout without the block). The same rule
 // holds moving up (the block's top crosses it) and down (the block's bottom crosses it in the opened layout).
 const top=Math.max(base,Math.min(blockTop,base+restHeight));
 let gap=0,y=base;for(const row of rest){if(blockTop>=y+row.height/2){gap++;y+=row.height;}else break;}
 const offsets=new Map<string,number>();let cursor=base;
 rest.forEach((row,index)=>{if(index===gap)cursor+=blockHeight;offsets.set(row.id,cursor-row.top);cursor+=row.height;});
 let inner=top;for(const row of block){offsets.set(row.id,inner-row.top);inner+=row.height;}
 // Unchanged when the block was contiguous and the gap is where it started.
 const firstMoving=rows.findIndex(row=>moving.has(row.id)),startGap=rows.slice(0,Math.max(0,firstMoving)).filter(row=>!moving.has(row.id)).length;
 const contiguous=block.length>0&&rows.slice(firstMoving,firstMoving+block.length).every(row=>moving.has(row.id));
 return{before:gap<rest.length?rest[gap]!.id:null,gap,lineY:base+rest.slice(0,gap).reduce((sum,row)=>sum+row.height,0),blockTop:top,offsets,changed:!(contiguous&&gap===startGap)};
}

type RowElement=HTMLElement;
export interface RowDragOptions{
 /** The scrolling list element that holds the rows. */
 container:()=>HTMLElement|null;
 /** The row elements in display order, each with data-wl-row-id. */
 rows:(container:HTMLElement)=>RowElement[];
 /** Called once the pointer passes the slop: the drag is live. */
 start:(primary:string)=>void;
 /** Called with the drop slot; not called when the order would not change. */
 commit:(primary:string,before:string|null)=>void;
 /** Every end path (drop, cancel). */
 end:()=>void;
 /** Height of the sticky header, kept out of the top auto-scroll band. */
 headerHeight?:(container:HTMLElement)=>number;
}
interface Pending{primary:string;moving:string[];pointerId:number;startY:number;element:RowElement}
interface Live extends Pending{boxes:RowBox[];elements:Map<string,RowElement>;grab:number;clientY:number;frame:number;line:HTMLElement|null;plan:RowDragPlan|null;container:HTMLElement}

export function createRowDrag(options:RowDragOptions){
 let pending:Pending|null=null,live:Live|null=null,suppressClick=false;
 const raf=(fn:()=>void)=>typeof requestAnimationFrame==='function'?requestAnimationFrame(fn):0,caf=(id:number)=>{if(id&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(id);};
 const contentY=(drag:Live,clientY:number)=>clientY-drag.container.getBoundingClientRect().top+drag.container.scrollTop;
 function layout(drag:Live){
  const plan=planRowDrag(drag.boxes,new Set(drag.moving),contentY(drag,drag.clientY)-drag.grab);drag.plan=plan;
  for(const [id,element] of drag.elements){const offset=plan.offsets.get(id)??0;element.style.transform=offset?`translateY(${offset}px)`:'';}
  if(drag.line){drag.line.style.transform=`translateY(${plan.lineY-1}px)`;drag.line.hidden=!plan.changed;}
 }
 function onKey(event:KeyboardEvent){if(event.key==='Escape'&&live){event.preventDefault();event.stopPropagation();cancel();}}
 function tick(){
  const drag=live;if(!drag)return;drag.frame=0;const box=drag.container.getBoundingClientRect(),head=options.headerHeight?.(drag.container)??0;
  const fromTop=drag.clientY-(box.top+head),fromBottom=box.bottom-drag.clientY;let speed=0;
  if(fromTop<ROW_DRAG_EDGE)speed=-Math.ceil(ROW_DRAG_MAX_SPEED*Math.min(1,(ROW_DRAG_EDGE-fromTop)/ROW_DRAG_EDGE));
  else if(fromBottom<ROW_DRAG_EDGE)speed=Math.ceil(ROW_DRAG_MAX_SPEED*Math.min(1,(ROW_DRAG_EDGE-fromBottom)/ROW_DRAG_EDGE));
  if(speed){const before=drag.container.scrollTop;drag.container.scrollTop=before+speed;if(drag.container.scrollTop!==before)layout(drag);drag.frame=raf(tick);}
 }
 function begin(drag:Pending,clientY:number){
  const container=options.container();if(!container)return false;
  const elements=new Map<string,RowElement>(),boxes:RowBox[]=[],top=container.getBoundingClientRect().top-container.scrollTop;
  for(const element of options.rows(container)){const id=element.dataset.wlRowId;if(!id)continue;const rect=element.getBoundingClientRect();elements.set(id,element);boxes.push({id,top:rect.top-top,height:rect.height});}
  const moving=drag.moving.filter(id=>elements.has(id));if(!moving.includes(drag.primary))return false;
  const movingSet=new Set(moving),primaryBox=boxes.find(row=>row.id===drag.primary)!,above=boxes.filter(row=>movingSet.has(row.id)&&row.top<primaryBox.top).reduce((sum,row)=>sum+row.height,0);
  const line=typeof document!=='undefined'&&document.createElement?document.createElement('div'):null;
  if(line){line.className='wl-drop-line';line.setAttribute('aria-hidden','true');line.hidden=true;container.appendChild(line);}
  const grab=(clientY-top)-primaryBox.top+above;
  live={...drag,moving,boxes,elements,grab,clientY,frame:0,line,plan:null,container};
  container.classList.add('wl-dragging');for(const id of moving)elements.get(id)!.classList.add('wl-row-lifted');
  try{drag.element.setPointerCapture?.(drag.pointerId);}catch{/* Capture is a nicety; window listeners still end the drag. */}
  if(typeof window!=='undefined')window.addEventListener('keydown',onKey,true);
  options.start(drag.primary);layout(live);return true;
 }
 function teardown(animate:boolean){
  const drag=live;live=null;pending=null;if(!drag)return;caf(drag.frame);
  if(typeof window!=='undefined')window.removeEventListener('keydown',onKey,true);
  try{if(drag.element.hasPointerCapture?.(drag.pointerId))drag.element.releasePointerCapture(drag.pointerId);}catch{/* Already released. */}
  drag.line?.remove();
  const clear=()=>{for(const element of drag.elements.values()){element.style.transform='';element.classList.remove('wl-row-lifted');}drag.container.classList.remove('wl-dragging','wl-drag-settling');};
  if(animate&&typeof setTimeout==='function'){drag.container.classList.add('wl-drag-settling');for(const element of drag.elements.values()){element.classList.remove('wl-row-lifted');element.style.transform='';}setTimeout(clear,160);}else clear();
  options.end();
 }
 function cancel(){if(live){suppressClick=true;teardown(true);}else pending=null;}
 return{
  /** Pointer down on a row. `moving` lists the ids that travel with it, the pressed row included. */
  down(primary:string,moving:readonly string[],event:{pointerId:number;clientY:number;button:number;currentTarget:EventTarget|null}){
   if(event.button!==0||live)return;suppressClick=false;pending={primary,moving:[...moving],pointerId:event.pointerId,startY:event.clientY,element:event.currentTarget as RowElement};
  },
  move(event:{pointerId:number;clientY:number;preventDefault?:()=>void}){
   if(live){if(event.pointerId!==live.pointerId)return;event.preventDefault?.();live.clientY=event.clientY;layout(live);if(!live.frame)live.frame=raf(tick);return;}
   if(!pending||event.pointerId!==pending.pointerId||Math.abs(event.clientY-pending.startY)<ROW_DRAG_SLOP)return;
   const drag=pending;pending=null;if(begin(drag,event.clientY)){event.preventDefault?.();live!.clientY=event.clientY;layout(live!);live!.frame=raf(tick);}
  },
  up(event:{pointerId:number}){
   if(!live){if(pending&&event.pointerId===pending.pointerId)pending=null;return;}
   if(event.pointerId!==live.pointerId)return;const drag=live,plan=drag.plan;suppressClick=true;teardown(false);
   if(plan?.changed)options.commit(drag.primary,plan.before);
  },
  cancel,
  /** True once for the click that follows a drag, so it neither selects nor opens a chart. */
  takeClickSuppression(){const value=suppressClick;suppressClick=false;return value;},
  active(){return live!==null;},
  dispose(){if(live)teardown(false);pending=null;},
 };
}
export type RowDrag=ReturnType<typeof createRowDrag>;
