import type {BarDataset} from '../domain/types';
import type {ChartController} from './adapter';
import {sourceContextForDataset} from './source-context';
import {attemptEveryCleanup} from './chart-retirement';
import {drawingSyncScope} from './drawing-linked-plan';
export interface LayoutCell {id:string;symbol:string;interval:string;group:string}
export interface LayoutSync {symbol:boolean;interval:boolean;crosshair:boolean;time:boolean;dateRange:boolean;drawings:boolean}
export interface LayoutSnapshot {schemaVersion:1;id:string;name:string;activeCellId:string;maximizedCellId:string|null;cells:LayoutCell[];sync:LayoutSync}
export type LayoutDatasetResolver=(symbol:string,interval:string)=>BarDataset|Promise<BarDataset>;
// The multi-chart layout catalog, grouped by chart count in picker order (the layout menu shows one
// row per count). Existing ids and geometries are unchanged, so every saved grid restores as before. The ids are
// s, 2h, 2v, 3h, 3v, 3s, 3r, 2-1, 1-2, 4, 4h, 4v, 4s, 1-3, 5h, 5s, 2-3, 1-4, 6, 6h, 6c, 7h, 8, 8h, 8c, then 10, 12, 14, 16.
// Uneven arrangements. `areas` names one CSS grid area per cell, in cell order (first
// appearance); MultiChartGrid reads it for gridTemplateAreas and each cell's gridArea, tracks stay per column and per row.
export const LV_LAYOUTS=[
 {id:'single',label:'1 chart',columns:1,rows:1,count:1},
 {id:'two-columns',label:'2 columns',columns:2,rows:1,count:2},{id:'two-rows',label:'2 rows',columns:1,rows:2,count:2},
 {id:'three-columns',label:'3 columns',columns:3,rows:1,count:3},{id:'three-rows',label:'3 rows',columns:1,rows:3,count:3},
 {id:'one-plus-two',label:'1 large, 2 small',columns:2,rows:2,count:3,areas:[['a','b'],['a','c']]},
 {id:'two-plus-one-right',label:'2 small, 1 large',columns:2,rows:2,count:3,areas:[['a','b'],['c','b']]},
 {id:'two-plus-one',label:'2 small, 1 wide',columns:2,rows:2,count:3,areas:[['a','b'],['c','c']]},
 {id:'one-plus-two-below',label:'1 wide, 2 small',columns:2,rows:2,count:3,areas:[['a','a'],['b','c']]},
 {id:'four',label:'4 charts',columns:2,rows:2,count:4},{id:'four-columns',label:'4 columns',columns:4,rows:1,count:4},{id:'four-rows',label:'4 rows',columns:1,rows:4,count:4},
 {id:'one-plus-three',label:'1 large, 3 small',columns:2,rows:3,count:4,areas:[['a','b'],['a','c'],['a','d']]},
 {id:'one-plus-three-below',label:'1 wide, 3 small',columns:3,rows:2,count:4,areas:[['a','a','a'],['b','c','d']]},
 {id:'five-columns',label:'5 columns',columns:5,rows:1,count:5},
 {id:'one-plus-four',label:'1 large, 4 small',columns:2,rows:4,count:5,areas:[['a','b'],['a','c'],['a','d'],['a','e']]},
 {id:'two-plus-three',label:'2 above 3',columns:6,rows:2,count:5,areas:[['a','a','a','b','b','b'],['c','c','d','d','e','e']]},
 {id:'one-plus-four-below',label:'1 wide, 4 small',columns:4,rows:2,count:5,areas:[['a','a','a','a'],['b','c','d','e']]},
 {id:'six',label:'6 charts',columns:3,rows:2,count:6},{id:'six-columns',label:'6 columns',columns:6,rows:1,count:6},{id:'six-tall',label:'6 charts, 2 columns',columns:2,rows:3,count:6},
 {id:'seven-columns',label:'7 columns',columns:7,rows:1,count:7},
 {id:'eight',label:'8 charts',columns:4,rows:2,count:8},{id:'eight-columns',label:'8 columns',columns:8,rows:1,count:8},{id:'eight-tall',label:'8 charts, 2 columns',columns:2,rows:4,count:8},
 {id:'ten',label:'10 charts',columns:5,rows:2,count:10},{id:'twelve',label:'12 charts',columns:4,rows:3,count:12},{id:'fourteen',label:'14 charts',columns:7,rows:2,count:14},{id:'sixteen',label:'16 charts',columns:4,rows:4,count:16}] as const;
/** One layout choice; `areas` (rows of area names) is present only on the uneven arrangements. */
export type LayoutPreset={readonly id:string;readonly label:string;readonly columns:number;readonly rows:number;readonly count:number;readonly areas?:readonly (readonly string[])[]};
export function createLayoutSnapshot(count:number,options:{id?:string;name?:string;symbol?:string;interval?:string;cellIds?:string[]}={}):LayoutSnapshot{
  if(!Number.isSafeInteger(count)||count<1||count>16)throw new Error('Local layouts support 1 to 16 charts');
  const cells=Array.from({length:count},(_,index)=>({id:options.cellIds?.[index]??crypto.randomUUID(),symbol:options.symbol??'GME',interval:options.interval??'1D',group:'default'}));
  if(new Set(cells.map(cell=>cell.id)).size!==count)throw new Error('Layout cell IDs must be unique');
  return {schemaVersion:1,id:options.id??crypto.randomUUID(),name:options.name??'Local layout',activeCellId:cells[0].id,maximizedCellId:null,cells,sync:{symbol:false,interval:false,crosshair:false,time:false,dateRange:false,drawings:false}};
  // No sync default is recorded, so these off values are
  // Drawings sync for a new workspace is decided by DrawingUtility.syncOn (freshDrawingUtility: on, from
  // drawOnAllCharts true, mode Layout), which overrides this flag.
}
export interface LayoutPortOptions {
 /** The active drawingScopeKey of a cell (symbol, source and adjustment basis). Without
  * it, peers fall back to the same symbol string. A throw or null keeps that cell out of replication. */
 scopeKey?:(cellId:string)=>string|null;
}
type DrawingRow=Record<string,unknown>;
const isRecord=(value:unknown):value is DrawingRow=>!!value&&typeof value==='object'&&!Array.isArray(value);
const replicated=(row:DrawingRow)=>drawingSyncScope(row)!==null&&row.paneId==='price';
/** DWUTIL spec 3.7: a peer mirrors the source's scoped price-pane rows (in place, in its own order;
 * new ones appended) and keeps every unscoped row. A scoped row the source no longer has leaves the
 * peer with its group membership. Returns null when nothing changes or the peer is not a plain
 * document; a malformed manager is retained untouched (no replication into it). */
export function replicateScopedDrawings(source:DrawingRow,target:DrawingRow):DrawingRow|null{
 if(!Array.isArray(source.drawings)||!Array.isArray(target.drawings))return null;
 const shared=new Map<unknown,DrawingRow>();for(const row of source.drawings)if(isRecord(row)&&replicated(row))shared.set(row.id,row);
 const placed=new Set<unknown>(),dropped=new Set<string>(),rows:unknown[]=[];
 for(const row of target.drawings){if(!isRecord(row)||!replicated(row)){rows.push(row);continue;}const next=shared.get(row.id);if(next){rows.push(structuredClone(next));placed.add(row.id);}else dropped.add(String(row.id));}
 for(const [id,row] of shared)if(!placed.has(id))rows.push(structuredClone(row));
 let next:DrawingRow={...target,drawings:rows};
 if(dropped.size&&Object.hasOwn(target,'lvDrawingManager')){
  const manager=target.lvDrawingManager;
  if(!isRecord(manager)||manager.schemaVersion!==1||!Array.isArray(manager.groups)||!manager.groups.every(group=>isRecord(group)&&Array.isArray(group.memberIds)))return null;
  next={...next,lvDrawingManager:{...manager,groups:(manager.groups as DrawingRow[]).map(group=>(group.memberIds as unknown[]).some(id=>dropped.has(id as string))?{...group,memberIds:(group.memberIds as unknown[]).filter(id=>!dropped.has(id as string))}:group)}};
 }
 return JSON.stringify(next)===JSON.stringify(target)?null:next;
}
/** drawingUtility.syncOn is the only sync authority once it exists. A saved
 * workspace without it migrates from its layout switch (root Q5: only new workspaces default on). */
export function resolveDrawingSyncOn(layout:Pick<LayoutSnapshot,'sync'>,drawingUtility:{syncOn:boolean}|undefined):boolean{
 if(drawingUtility!==undefined){if(typeof drawingUtility?.syncOn!=='boolean')throw Error('Invalid drawing sync state.');return drawingUtility.syncOn;}
 return layout.sync?.drawings===true;
}
/** layout.sync.drawings is written on save as a mirror of syncOn. */
export function mirrorLayoutDrawingSync(layout:LayoutSnapshot,syncOn:boolean):LayoutSnapshot{
 if(typeof syncOn!=='boolean')throw Error('Invalid drawing sync state.');const next=structuredClone(layout);next.sync={...next.sync,drawings:syncOn};return next;
}
/** Opening a layout-library entry ignores its stored drawings switch once drawingUtility
 * exists; the opened layout carries the mirror. Before migration the entry's switch is the input. */
export function openLayoutLibraryEntry(entry:LayoutSnapshot,drawingUtility:{syncOn:boolean}|undefined):{layout:LayoutSnapshot;syncOn:boolean}{
 const syncOn=resolveDrawingSyncOn(entry,drawingUtility);return{layout:mirrorLayoutDrawingSync(entry,syncOn),syncOn};
}
export function createLayoutPort(initial:LayoutSnapshot,options:LayoutPortOptions={}){
  if(initial.schemaVersion!==1||!initial.id||!Array.isArray(initial.cells)||!initial.cells.length||initial.cells.length>16||new Set(initial.cells.map(cell=>cell.id)).size!==initial.cells.length||initial.cells.some(cell=>!cell.id||!cell.symbol||!cell.interval||typeof cell.group!=='string')||!initial.cells.some(cell=>cell.id===initial.activeCellId)||initial.maximizedCellId!==null&&!initial.cells.some(cell=>cell.id===initial.maximizedCellId))throw new Error('Invalid layout snapshot');
  const syncKeys=['symbol','interval','crosshair','time','dateRange','drawings'];if(Object.keys(initial.sync).some(key=>!syncKeys.includes(key))||syncKeys.some(key=>typeof initial.sync[key as keyof LayoutSync]!=='boolean'))throw new Error('Invalid layout sync settings');
  let state=structuredClone(initial);const mounted=new Map<string,{controller:ChartController;dispose:()=>void}>();const subscribers=new Set<()=>void>();let syncing=false,analysisDepth=0,disposed=false,replicating=0;
  let pending=Promise.resolve();const enqueue=<T,>(fn:()=>Promise<T>):Promise<T>=>{const next=pending.then(fn);pending=next.then(()=>{},()=>{});return next;};
  const changed=()=>{if(!disposed)for(const fn of subscribers)fn();};const scopeOf=(cell:LayoutCell):string|null=>{if(!options.scopeKey)return 'symbol:'+cell.symbol;try{return options.scopeKey(cell.id)??null;}catch{return null;}};const targets=(id:string)=>state.cells.filter(cell=>cell.id!==id&&cell.group===state.cells.find(source=>source.id===id)?.group);
  const guarded=(fn:()=>void)=>{if(syncing||analysisDepth)return;syncing=true;try{fn();}finally{syncing=false;}};
  // The cells showing each source's ghost crosshair. A ghost is cleared when the cursor leaves the source,
  // crosshair sync turns off, the source chart retires or the layout owner is retired, so no stale ghost stays on screen.
  const ghosts=new Map<string,Set<string>>();
  const clearGhost=(cellId:string)=>{try{mounted.get(cellId)?.controller.chart.renderer.setExternalCrosshair(null);}catch(error){console.error('A synchronized crosshair could not be cleared: '+String(error));}};
  const clearGhosts=(sourceId?:string)=>{for(const [source,shown] of [...ghosts]){if(sourceId!==undefined&&source!==sourceId)continue;ghosts.delete(source);for(const cellId of shown)clearGhost(cellId);}};
  /** Time keeps each target span and aligns its right edge; Date range copies the boundaries and wins. */
  const applyRange=(other:ChartController,range:{from:number;to:number},sync:LayoutSync):boolean=>{
    if(sync.dateRange){other.chart.setVisibleRange(range);return true;}
    if(sync.time){const previous=other.chart.getVisibleRange();if(previous){other.chart.setVisibleRange({from:range.to-(previous.to-previous.from),to:range.to});return true;}}
    return false;
  };
  const applyDatasets=async(updates:Array<{cell:LayoutCell;next:BarDataset}>)=>{
    const applied:Array<ReturnType<ChartController['setBarsWithRollback']>['rollback']>=[];
    try{for(const {cell,next} of updates){const controller=mounted.get(cell.id)?.controller;if(controller){const transaction=controller.setBarsWithRollback(next.bars,sourceContextForDataset(next));const outcome=await transaction.result;if(!outcome.ok)throw new Error(outcome.diagnostic.message);applied.push(transaction.rollback);}}}
    catch(error){const failures:unknown[]=[];for(const restore of applied.reverse())try{const restored=await restore();if(!restored.ok)failures.push(restored.diagnostic.message);}catch(failure){failures.push(failure);}if(failures.length)throw new AggregateError([error,...failures],'Layout update failed and renderer rollback was incomplete; metadata was preserved.');throw error;}
    for(const {cell,next} of updates){cell.symbol=next.instrument.symbol;cell.interval=next.resolution;}changed();
  };
  const port={
    beginAnalysisTransaction(){analysisDepth++;let released=false;return{release(){if(released)throw new Error('Layout analysis hold already released');released=true;analysisDepth--;}};},
    policies:['Sync preferences default off as explicit OpenCandle policy; exact reference defaults/layout geometries remain unresolved.','Date-range sync copies absolute visible boundaries. Time sync preserves each target span while aligning its right edge.','Crosshair shares price only for matching symbols; other symbols align time with their own price. Drawing sync replicates price-pane drawings stamped with a sync scope to every chart in the layout with the same drawing scope; unstamped drawings stay local. Secondary-pane identities remain unresolved.'],
    snapshot:()=>structuredClone(state),
    /** True while a scoped-drawing replication loads a peer chart: the Grid folds that peer into the origin's capture. */
    replicatingDrawings:()=>replicating>0,
    restoreMetadata(snapshot:LayoutSnapshot){if(JSON.stringify(state.cells)!==JSON.stringify(snapshot.cells)||state.id!==snapshot.id)throw new Error('Source layout recovery requires a native transaction');analysisDepth++;try{state={...state,sync:structuredClone(snapshot.sync),activeCellId:snapshot.activeCellId,maximizedCellId:snapshot.maximizedCellId};for(const entry of mounted.values())entry.controller.resize();}finally{analysisDepth--;}} ,
    subscribe(fn:()=>void){subscribers.add(fn);return ()=>subscribers.delete(fn);},
    mount(id:string,controller:ChartController){
      if(disposed)throw new Error('Layout owner was retired');if(!state.cells.some(cell=>cell.id===id))throw new Error('Unknown layout cell');const previous=mounted.get(id);mounted.delete(id);previous?.dispose();
      const owned=(fn:()=>void)=>{if(!disposed&&mounted.get(id)?.controller===controller)guarded(fn);};
      const registrations=[()=>controller.chart.on('viewport:changed',()=>owned(()=>{
        const range=controller.chart.getVisibleRange();if(!range)return;for(const target of targets(id)){const other=mounted.get(target.id)?.controller;if(!other)continue;applyRange(other,range,state.sync);}
      })),()=>controller.chart.renderer.onCrosshairMove(event=>owned(()=>{if(!state.sync.crosshair||event.time===null){clearGhosts(id);return;}const source=state.cells.find(cell=>cell.id===id)!,shown=new Set<string>();
        // A study-pane cursor value is not a price, so only its time is shared.
        for(const target of targets(id)){const other=mounted.get(target.id)?.controller;if(!other)continue;other.chart.renderer.setExternalCrosshair(event.time,target.symbol===source.symbol&&event.paneKind!=='study'?event.price:undefined);shown.add(target.id);}
        for(const cellId of ghosts.get(id)??[])if(!shown.has(cellId))clearGhost(cellId);if(shown.size)ghosts.set(id,shown);else ghosts.delete(id);})),()=>controller.onDrawingsChanged(()=>owned(()=>{
        // DWUTIL spec 3.7: only rows stamped lvSyncScope replicate, to every mounted cell with the same
        // drawing scope key, replacing the old whole-set same-group fanout. The stamp, not
        // the layout switch, is the authority: sync is about new drawings.
        const source=state.cells.find(cell=>cell.id===id)!,key=scopeOf(source);if(key===null)return;
        const document=controller.saveDrawings() as DrawingRow;for(const target of state.cells){if(target.id===id||scopeOf(target)!==key)continue;const other=mounted.get(target.id)?.controller;if(!other)continue;
          const next=replicateScopedDrawings(document,other.saveDrawings() as DrawingRow);if(next){replicating++;try{other.loadDrawings(next);}finally{replicating--;}}
        }
      }))];
      const off:Array<()=>void>=[];try{for(const subscribe of registrations)off.push(subscribe());}catch(error){try{attemptEveryCleanup(off,'Partial layout subscription cleanup was incomplete');}catch(cleanup){throw new AggregateError([error,cleanup],'Layout subscription setup and cleanup failed');}throw error;}
      let retired=false;const dispose=()=>{if(retired)return;retired=true;clearGhosts(id);attemptEveryCleanup(off,'Layout chart subscription cleanup was incomplete');};mounted.set(id,{controller,dispose});return ()=>{if(mounted.get(id)?.controller===controller)mounted.delete(id);dispose();};
    },
    focus(id:string){if(!state.cells.some(cell=>cell.id===id))throw new Error('Unknown cell');state.activeCellId=id;changed();},
    maximize(id:string|null){if(id!==null&&!state.cells.some(cell=>cell.id===id))throw new Error('Unknown cell');state.maximizedCellId=id;for(const entry of mounted.values())entry.controller.resize();changed();},
    /** `notify:false` changes the switch without publishing; the caller publishes the layout with its own cells. */
    sync(patch:Partial<LayoutSync>,options:{notify?:boolean}={}){if(Object.keys(patch).some(key=>!syncKeys.includes(key)))throw new Error('Unknown sync setting');for(const value of Object.values(patch))if(typeof value!=='boolean')throw new Error('Sync switches must be boolean');state.sync={...state.sync,...patch};if(!state.sync.crosshair)clearGhosts();if(options.notify!==false)changed();},
    /** Turning Time or Date range on brings the source's linked charts to it at once (held: nothing echoes).
     * Returns the cells whose visible range was set, for the caller to persist. */
    alignViewports(id:string,sync:LayoutSync=state.sync):string[]{
      if(!state.cells.some(cell=>cell.id===id))throw new Error('Unknown cell');const range=mounted.get(id)?.controller.chart.getVisibleRange();if(!range||!sync.time&&!sync.dateRange)return [];
      const moved:string[]=[];analysisDepth++;try{for(const target of targets(id)){const other=mounted.get(target.id)?.controller;if(other&&applyRange(other,range,sync))moved.push(target.id);}}finally{analysisDepth--;}return moved;
    },
    setDataset(id:string,dataset:BarDataset,scope:'active'|'linked'|'all'='linked',resolve?:LayoutDatasetResolver){return enqueue(async()=>{
      if(!state.cells.some(cell=>cell.id===id))throw new Error('Unknown cell');const ids=scope==='all'?state.cells.map(cell=>cell.id):scope==='linked'&&state.sync.symbol?[id,...targets(id).map(cell=>cell.id)]:[id];
      const updates=await Promise.all(ids.map(async cellId=>{
        const cell=state.cells.find(row=>row.id===cellId)!,interval=cellId===id||state.sync.interval?dataset.resolution:cell.interval;
        const next=interval===dataset.resolution?dataset:resolve?await resolve(dataset.instrument.symbol,interval):null;
        if(!next||next.instrument.symbol!==dataset.instrument.symbol||next.resolution!==interval)throw new Error(`No declared ${interval} dataset for ${dataset.instrument.symbol}; interval preservation requires a resolver.`);
        return {cell,next};
      }));
      await applyDatasets(updates);
    });},
    setInterval(id:string,interval:string,resolve:LayoutDatasetResolver){return enqueue(async()=>{
      if(!state.cells.some(cell=>cell.id===id))throw new Error('Unknown cell');const cells=state.sync.interval?[state.cells.find(cell=>cell.id===id)!,...targets(id)]:[state.cells.find(cell=>cell.id===id)!];
      const datasets=await Promise.all(cells.map(cell=>resolve(cell.symbol,interval)));
      for(let index=0;index<cells.length;index++){if(datasets[index].instrument.symbol!==cells[index].symbol||datasets[index].resolution!==interval)throw new Error('Resolver returned a mismatched symbol or interval');}
      await applyDatasets(cells.map((cell,index)=>({cell,next:datasets[index]})));
    });},
    watchlistDoubleClick:(id:string,dataset:BarDataset,resolve?:LayoutDatasetResolver)=>port.setDataset(id,dataset,'all',resolve),
    dispose(){if(disposed)return;clearGhosts();disposed=true;const entries=[...mounted.values()];mounted.clear();subscribers.clear();attemptEveryCleanup(entries.map(entry=>entry.dispose),'Layout owner cleanup was incomplete');},
  };return port;
}
