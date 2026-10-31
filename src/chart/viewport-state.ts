import {validateViewport} from './inspection';
import type {LayoutSnapshot} from './layout-port';
export interface ViewportRange {from:number;to:number}
export function linkedViewportIds(layout:LayoutSnapshot,sourceId:string){const source=layout.cells.find(row=>row.id===sourceId);if(!source)throw new Error('Unknown viewport source cell');return layout.cells.filter(row=>row.id===sourceId||(layout.sync.time||layout.sync.dateRange)&&row.group===source.group).map(row=>row.id);}
/** A gesture commits only a viewport that differs from the one it opened on (the first begin of a
 * coalesced run). A plain press re-applies the same viewport natively (vela onDown -> applyViewport), which marks the capture
 * dirty without any user change; committing it recorded an invisible undo step once the frame gesture was settled early.
 * User intent gates persistence: autoscale, first paint, resize and restoration alone create no command. */
export function createViewportCapture(options:{read:()=>ViewportRange|null;commit:(range:ViewportRange)=>void;schedule?:(fn:()=>void)=>ReturnType<typeof setTimeout>;cancel?:(id:ReturnType<typeof setTimeout>)=>void}){
 const schedule=options.schedule??(fn=>setTimeout(fn,150)),cancel=options.cancel??clearTimeout;let gesture=false,dirty=false,opening:ViewportRange|null=null,timer:ReturnType<typeof setTimeout>|null=null,disposed=false;
 const capture=()=>{const range=options.read();if(range){validateViewport(range);options.commit({...range});}};
 const stopTimer=()=>{if(timer!==null){cancel(timer);timer=null;}};
 return {begin(){if(disposed)return;stopTimer();if(!gesture){const range=options.read();opening=range?{from:range.from,to:range.to}:null;}gesture=true;},changed(){if(!disposed&&gesture)dirty=true;},finish(){if(disposed)return;stopTimer();timer=schedule(()=>{timer=null;gesture=false;const start=opening;opening=null;if(dirty){dirty=false;const range=options.read();if(start&&range&&range.from===start.from&&range.to===start.to)return;capture();}});},command(){if(disposed)return;stopTimer();gesture=false;dirty=false;opening=null;capture();},stop(){disposed=true;stopTimer();gesture=false;dirty=false;opening=null;}};
}
