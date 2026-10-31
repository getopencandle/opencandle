import {createReplay,setReplaySpeed,type ReplayState} from '../domain/replay';
import type {BarDataset} from '../domain/types';
import {projectGrid,sameWorkspace,type ChartWorkspace} from './workspace-grid';
import {drawingScopeBank,transitionDrawingScopeBasis} from './drawing-scopes';
type Grid=NonNullable<ChartWorkspace['grid']>;
/** Owner 2026-10-28, "the standard the user expects": a chart's symbol, interval and data source are navigation. */
function sourceOf(grid:Grid,id:string){const row=grid.layout.cells.find(item=>item.id===id),cell=grid.cells[id];return row&&cell?{symbol:row.symbol,interval:row.interval,datasetId:cell.datasetId}:null;}
function navigated(before:Grid,after:Grid,id:string):boolean{const a=sourceOf(before,id),b=sourceOf(after,id);return !!a&&!!b&&(a.symbol!==b.symbol||a.interval!==b.interval||a.datasetId!==b.datasetId);}
/** History restores only the opened chart grid. Current global and saved-library state wins. So does the current
 * navigation. A chart whose symbol, interval or source changed since the entry keeps its current source and time scale and
 * shows the restored drawings of that source (the restored archive holds every symbol's drawings as they were then). A cell
 * without declared drawing scopes (legacy) restores its stored source as before. */
export function historicalChartWorkspace<T extends ChartWorkspace>(current:T,historical:T):T{
 if(!current.grid||!historical.grid||current.grid.layout.id!==historical.grid.layout.id)throw new Error('Chart history belongs to a different layout.');
 const now=current.grid,grid=structuredClone(historical.grid);grid.layout.name=now.layout.name;
 for(const row of grid.layout.cells){
  if(!navigated(grid,now,row.id))continue;const prior=now.layout.cells.find(item=>item.id===row.id)!,live=now.cells[row.id],cell=grid.cells[row.id];
  const from=cell.drawingScopes?.activeBasis,to=live.drawingScopes?.activeBasis;if(!from||!to)continue;
  const moved={...transitionDrawingScopeBasis(cell,from,to),datasetId:live.datasetId};
  if(live.viewport)moved.viewport={...live.viewport};else delete moved.viewport;
  // The current frame belongs to the current source; it is kept only while the restored scale settings still describe it.
  const {auto:_restoredAuto,...restoredOptions}=moved.chartOptions,{auto:liveAuto,...liveOptions}=live.chartOptions;
  if(moved.style===live.style&&(moved.session??null)===(live.session??null)&&sameWorkspace({chartOptions:restoredOptions},{chartOptions:liveOptions})){if(live.frame)moved.frame=structuredClone(live.frame);else delete moved.frame;moved.chartOptions={...moved.chartOptions,auto:liveAuto};}
  else{delete moved.frame;moved.chartOptions={...moved.chartOptions,auto:true};}
  grid.cells[row.id]=moved;row.symbol=prior.symbol;row.interval=prior.interval;
 }
 return projectGrid(current,grid);
}
/** True when the restore kept the active chart on its current, navigated source (its replay is then the current one). */
export function historyKeepsActiveSource<T extends ChartWorkspace>(current:T,historical:T):boolean{
 const now=current.grid,then=historical.grid;if(!now||!then)return false;const id=then.layout.activeCellId,cell=then.cells[id];
 return navigated(then,now,id)&&!!cell?.drawingScopes&&!!now.cells[id]?.drawingScopes;
}
type Viewport={from:number;to:number};
const withoutViewports=(grid:ChartWorkspace['grid'])=>{if(!grid)return grid;const cells:Record<string,unknown>={};for(const [id,cell] of Object.entries(grid.cells)){const {viewport:_viewport,...rest}=cell;cells[id]=rest;}return {...grid,cells} as typeof grid;};
/** A chart that changed symbol, interval or source compares by its drawings for every source (not by which one is
 * shown), without the source fields and the frame/auto scale that navigation resets. */
function withoutNavigation(grid:Grid,ids:ReadonlySet<string>):Grid{
 if(!ids.size)return grid;const cells:Record<string,unknown>={...grid.cells};
 for(const id of ids){const {datasetId:_datasetId,frame:_frame,viewport:_viewport,drawings,drawingScopes:_scopes,chartOptions,...rest}=grid.cells[id];const {auto:_auto,...options}=chartOptions;
  let bank:unknown;try{bank=drawingScopeBank(grid.cells[id])??{legacy:drawings};}catch{bank={unreadable:grid.cells[id]};}
  cells[id]={...rest,chartOptions:options,drawingBank:bank};}
 return {...grid,cells,layout:{...grid.layout,cells:grid.layout.cells.map(row=>ids.has(row.id)?{...row,symbol:'',interval:''}:row)}} as Grid;
}
/** Scrolling and zooming are not undo steps (the reference never undoes the time scale).
 * Neither is a symbol, interval or source change. Undo and redo step through edits only. */
export function changedChartGrid<T extends ChartWorkspace>(before:T,after:T):boolean{
 const opening=before.grid,closing=withoutRecapturedFrames(before.grid,after.grid);
 if(!opening||!closing)return !sameWorkspace({grid:withoutViewports(opening)},{grid:withoutViewports(closing)});
 const ids=new Set(closing.layout.cells.map(row=>row.id).filter(id=>navigated(opening,closing,id)));
 return !sameWorkspace({grid:withoutViewports(withoutNavigation(opening,ids))},{grid:withoutViewports(withoutNavigation(closing,ids))});
}
/** A study change keeps a manual price range (auto stays off) and drops the unprovable saved frame; the grid then
 * recaptures the live frame. That recapture only re-records the state the user already has, so it is not an undo step. */
function withoutRecapturedFrames(before:ChartWorkspace['grid'],after:ChartWorkspace['grid']){if(!before||!after)return after;let cells:typeof after.cells|null=null;for(const [id,cell] of Object.entries(after.cells)){const prior=before.cells[id];if(!prior||prior.frame||prior.chartOptions?.auto!==false||!cell.frame)continue;cells??={...after.cells};const {frame:_frame,...rest}=cell;cells[id]=rest as typeof cell;}return cells?{...after,cells}:after;}
/** Undo and redo leave the time scale where the user has it. Every cell that shows the same
 * source (dataset, session, chart type, symbol and interval) before and after the restore keeps its current viewport, read
 * live for the cells in `live`; a cell whose source the restore changes takes the restored entry's viewport. */
export function keepCurrentViewports<T extends ChartWorkspace>(current:T,restored:T,live:Readonly<Record<string,Viewport|null|undefined>>={}):T{
 const now=current.grid,next=restored.grid;if(!now||!next)return restored;let cells:typeof next.cells|null=null;
 for(const row of next.layout.cells){
  const before=now.cells[row.id],after=next.cells[row.id],prior=now.layout.cells.find(item=>item.id===row.id);if(!before||!after||!prior)continue;
  if(before.datasetId!==after.datasetId||before.style!==after.style||(before.session??null)!==(after.session??null)||prior.symbol!==row.symbol||prior.interval!==row.interval)continue;
  const view=live[row.id]??before.viewport;const same=view?after.viewport&&after.viewport.from===view.from&&after.viewport.to===view.to:!after.viewport;if(same)continue;
  cells??={...next.cells};const cell={...after};if(view)cell.viewport={from:view.from,to:view.to};else delete cell.viewport;cells[row.id]=cell;
 }
 return cells?{...restored,grid:{...next,cells}}:restored;
}
export interface WorkspaceHistoryEntry<T> {workspace:T;replay:ReplayState|null}
/** Prepared before native mutation; commit performs only private state writes. */
export interface PreparedWorkspaceHistoryRecord {
 assertCurrent():void;
 commit():void;
}
export function restoredHistoryReplay<T>(entry:WorkspaceHistoryEntry<T>,dataset:BarDataset,makeId:()=>string):ReplayState|null{
 const saved=entry.replay;if(!saved)return null;
 if(saved.datasetId!==dataset.provenance.datasetId||saved.revision!==dataset.provenance.revision||saved.totalBars!==dataset.bars.length)throw new Error('Undo replay source is no longer available.');
 return setReplaySpeed(createReplay(dataset,saved.cursor,makeId()),saved.barsPerSecond);
}
/** Count serialized retained history, with shared immutable collection sizes cached. */
export function createWorkspaceHistory<T extends Record<string,unknown>>(limits={steps:100,bytes:64*1024*1024}){
 if(!Number.isSafeInteger(limits.steps)||limits.steps<1||!Number.isSafeInteger(limits.bytes)||limits.bytes<1)throw new Error('Invalid workspace history limits.');
 type Row={entry:WorkspaceHistoryEntry<T>;bytes:number};let past:Row[]=[],future:Row[]=[],dropped=0,generation=0n,moves=0;const sizes=new WeakMap<object,number>(),encoder=new TextEncoder();
 const bytes=(value:unknown):number=>{if(value&&typeof value==='object'){const old=sizes.get(value);if(old!==undefined)return old;const size=encoder.encode(JSON.stringify(value)).length;sizes.set(value,size);return size;}return encoder.encode(JSON.stringify(value)??'null').length;};
 const size=(entry:WorkspaceHistoryEntry<T>)=>29+bytes(entry.replay)+Object.entries(entry.workspace).reduce((sum,[key,value])=>sum+bytes(key)+1+bytes(value)+1,0);
 const row=(workspace:T,replay:ReplayState|null):Row=>{const entry={workspace,replay:replay?structuredClone(replay):null};return {entry,bytes:size(entry)};};
 const trim=()=>{let total=[...past,...future].reduce((sum,item)=>sum+item.bytes,0);while(past.length+future.length>limits.steps||total>limits.bytes){const removed=past.length?past.shift():future.shift();if(!removed)break;total-=removed.bytes;dropped++;}};
 return {
  prepareRecord(workspace:T,replay:ReplayState|null):PreparedWorkspaceHistoryRecord{
   const openingGeneration=generation,openingPast=past,openingFuture=future,openingDropped=dropped;
   let phase:'prepared'|'committed'|'retired'='prepared';
   const current=()=>{
    if(phase!=='prepared')throw Error('Prepared workspace history is consumed or retired.');
    if(generation!==openingGeneration||past!==openingPast||future!==openingFuture||dropped!==openingDropped){phase='retired';throw Error('Workspace history changed after preparation.');}
   };
   const next=row(workspace,replay);current();
   if(next.bytes>limits.bytes)throw Error('This change cannot retain its undo step within the local history limit.');
   const preparedPast=[...past,next],preparedFuture:Row[]=[];
   let total=preparedPast.reduce((sum,item)=>sum+item.bytes,0),preparedDropped=dropped;
   while(preparedPast.length>limits.steps||total>limits.bytes){const removed=preparedPast.shift()!;total-=removed.bytes;preparedDropped++;}
   current();
   const prepared:PreparedWorkspaceHistoryRecord=Object.freeze({
    assertCurrent(this:PreparedWorkspaceHistoryRecord){if(this!==prepared)throw Error('Foreign prepared workspace history receiver.');current();},
    commit(this:PreparedWorkspaceHistoryRecord){
     if(this!==prepared)throw Error('Foreign prepared workspace history receiver.');current();
     phase='committed';generation++;past=preparedPast;future=preparedFuture;dropped=preparedDropped;
    }
   });
   return prepared;
  },
  /** Marks the history before a dialog whose live preview records steps. settle() puts the history back as it was at the
   mark, plus one step back to the marked workspace when `changed` reports a net change. An Undo, Redo or clear since the
   mark keeps the history as it is. */
  mark(workspace:T,replay:ReplayState|null){
   const opening={past:[...past],future:[...future],dropped,moves},entry=row(workspace,replay);let open=true;
   return {settle(current:T,changed:(before:T,after:T)=>boolean):boolean{
    if(!open)return false;open=false;if(moves!==opening.moves)return false;
    generation++;past=[...opening.past];future=[...opening.future];dropped=opening.dropped;
    if(changed(workspace,current)){future=[];if(entry.bytes>limits.bytes){dropped+=past.length+1;past=[];}else{past.push(entry);trim();}}
    return true;
   }};
  },
  record(workspace:T,replay:ReplayState|null){generation++;const next=row(workspace,replay);future=[];if(next.bytes>limits.bytes){dropped+=past.length+1;past=[];return;}past.push(next);trim();},
  peekUndo:()=>past.at(-1)?.entry??null,
  peekRedo:()=>future.at(-1)?.entry??null,
  undo(workspace:T,replay:ReplayState|null){generation++;moves++;const previous=past.at(-1);if(!previous)return null;const next=row(workspace,replay);past.pop();future.push(next);trim();return previous.entry;},
  redo(workspace:T,replay:ReplayState|null){generation++;moves++;const next=future.at(-1);if(!next)return null;const previous=row(workspace,replay);future.pop();past.push(previous);trim();return next.entry;},
  clear(){generation++;moves++;past=[];future=[];dropped=0;},
  status:()=>({undo:past.length,redo:future.length,retainedBytes:[...past,...future].reduce((sum,item)=>sum+item.bytes,0),dropped,limits:{...limits}}),
 };
}
export type WorkspaceHistory<T extends Record<string,unknown>>=ReturnType<typeof createWorkspaceHistory<T>>;
/** A history session for a live-preview dialog: Cancel leaves Undo as it was before the dialog opened, Ok leaves one step
 for the net chart change. The session ends with the history it started on (a layout switch replaces it). */
export function openHistorySession<T extends ChartWorkspace&Record<string,unknown>>(ref:{current:WorkspaceHistory<T>},read:()=>{workspace:T;replay:ReplayState|null}){
 const owner=ref.current,opening=read(),mark=owner.mark(opening.workspace,opening.replay);
 return {settle(){if(ref.current!==owner)return false;return mark.settle(read().workspace,changedChartGrid);}};
}
