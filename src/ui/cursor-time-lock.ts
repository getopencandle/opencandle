// "Lock vertical cursor line by time". The chart menu row keeps a vertical line at the clicked
// bar's time on that chart until the row (now "Unlock vertical cursor line") is chosen again or another time is locked. One
// lock per window, kept for the session only (never saved). The line is drawn by LockedTimeLine on the active chart.
// The line look and the one-lock rule are our own choice.
export interface CursorTimeLock{readonly cellId:string;readonly time:number}
export const CURSOR_LOCK_LABEL='Lock vertical cursor line by time',CURSOR_UNLOCK_LABEL='Unlock vertical cursor line';
export function createCursorTimeLockStore(){
 let value:CursorTimeLock|null=null;const listeners=new Set<()=>void>();
 const emit=()=>{for(const listener of [...listeners]){try{listener();}catch{/* a listener failure never blocks the others */}}};
 return{
  get:():CursorTimeLock|null=>value,
  lockedFor:(cellId:string)=>value!==null&&value.cellId===cellId,
  /** Locks `time` (Unix seconds) on `cellId`, or unlocks when that chart is already locked. Returns the new state. */
  toggle(cellId:string,time:number|null):CursorTimeLock|null{
   if(value&&value.cellId===cellId){value=null;emit();return null;}
   if(typeof time!=='number'||!Number.isFinite(time))throw new Error('Point at a bar to lock the vertical line.');
   value=Object.freeze({cellId,time});emit();return value;
  },
  clear(){if(value){value=null;emit();}},
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 };
}
export type CursorTimeLockStore=ReturnType<typeof createCursorTimeLockStore>;
export const cursorTimeLock:CursorTimeLockStore=createCursorTimeLockStore();
