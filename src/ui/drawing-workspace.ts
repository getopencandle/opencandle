import type {DrawingDuplicateWorkspaceHost,PreparedDrawingDuplicateWorkspace} from '../chart/drawing-duplicate-publication';
import type {ChartController} from '../chart/adapter';
import type {MultiChartGridProps,MultiChartState} from './MultiChartGrid';
import type {GridCellReadiness} from '../chart/grid-tree-coordinator';
import {exactGridDataset} from '../chart/grid-analysis-coordinator';
import {chartInputCommitted} from '../chart/input-visibility';
import {sourceContextForDataset} from '../chart/source-context';
import {validateCellDrawingScopes,drawingScopeBasis,drawingScopeKey} from './drawing-scopes';
import {drawingSyncScope,linkedDrawingChange,planLinkedDrawingAction,type LinkedDrawingKind,type LinkedDrawingPlan} from '../chart/drawing-linked-plan';
import {measureWorkspaceJSON} from './workspace-json';

/** Captured before IDs are allocated. Preparation does not publish a model. */
export interface GridDrawingWorkspaceCommand {
 assertCurrent():void;
 prepare(next:MultiChartState):PreparedDrawingDuplicateWorkspace;
}
export interface DrawingWorkspaceCallbacks {
 onCaptureDrawingWorkspace?:(expected:MultiChartState)=>GridDrawingWorkspaceCommand;
 onDrawingHistory?:(direction:'undo'|'redo',expected:MultiChartState)=>void;
 drawingHistoryStatus?:()=>{canUndo:boolean;canRedo:boolean};
}

/** DWUTIL spec 3.7: the Grid's linked route. forward loads one mounted same-scope peer's prepared
 * document into its native chart without publishing a separate workspace change (the Grid suppresses
 * that peer's own capture while forwarding); quarantine hides/disables cells whose native state may be
 * an unpublished intermediate; unavailable reports a quarantined or unopenable peer. */
export interface LinkedDrawingWorkspacePort {
 forward(cellId:string,drawings:Record<string,unknown>):void;
 quarantine(cellIds:string[],message:string):void;
 unavailable(cellId:string):boolean;
}
export type GridDrawingCommandPurpose='duplicate'|'erase'|'clone'|'paste'|'remove';
const LINKED_RECOVERY='Synchronized drawings did not finish updating. Reopen the chart to restore the saved workspace.';

/** Exact mounted-cell ownership, independent of React painting. */
export function createGridDrawingWorkspaceHost(id:string,chart:ChartController,port:{
 read():MultiChartGridProps;
 alive():boolean;
 blocked():boolean;
 controller(id:string):ChartController|undefined;
 readiness(id:string):GridCellReadiness|undefined;
 accept(state:MultiChartState):void;
 /** Publishes a FINISHED chart gesture still inside its coalescing window, before a command reads the workspace.
  * A gesture whose pointer is still held is left open, so blocked() keeps refusing it. */
 settle?():void;
 /** DWUTIL spec 3.7: absent means only canonical-only (unmounted) peers can be changed together. */
 linked?:LinkedDrawingWorkspacePort;
}):DrawingDuplicateWorkspaceHost {
 const available=()=>{
  const now=port.read();
  if(!port.alive()||port.blocked()||now.staging||port.controller(id)!==chart||!now.state.cells[id])throw Error('This drawing workspace is unavailable or has been replaced.');
  return now;
 };
 return Object.freeze({
  capture(purpose:GridDrawingCommandPurpose='duplicate'){
   port.settle?.();const opening=available(),status=port.readiness(id),cell=opening.state.cells[id],data=exactGridDataset(opening.state,id,opening.datasets);
   const bars=id===opening.state.layout.activeCellId?opening.activeBars??data.bars:data.bars;
   const execution=id===opening.state.layout.activeCellId?opening.activeExecutionIdentity??'ordinary':'ordinary';
   const input={bars,source:sourceContextForDataset(data,bars),style:cell.style};
   let expected=opening.state,retired=false,prepared=false;
   const kind:LinkedDrawingKind=purpose==='duplicate'?'clone':purpose;
   const scopeKey=(cellId:string)=>drawingScopeKey(drawingScopeBasis(exactGridDataset(expected,cellId,opening.datasets)));
   /** null when the change touches no scoped drawing: the single-chart route is unchanged. */
   const linkedPlan=(candidate:Record<string,unknown>):LinkedDrawingPlan|null=>{
    // Malformed origin documents keep their existing validation path below; nothing scoped, nothing linked.
    let change:ReturnType<typeof linkedDrawingChange>;try{change=linkedDrawingChange(cell.drawings,candidate);}catch{return null;}
    const opening=new Map((cell.drawings.drawings as Record<string,unknown>[]).map(row=>[row.id,row]));
    if(!change.removeIds.some(target=>drawingSyncScope(opening.get(target))!==null)&&!change.addRows.some(row=>drawingSyncScope(row)!==null))return null;
    const plan=planLinkedDrawingAction({kind,originId:id,layout:expected.layout,cells:expected.cells,scopeKey,targetIds:change.removeIds,addRows:change.addRows,originChanged:change.originChanged,
     mounted:cellId=>!!port.controller(cellId),
     available:cellId=>{
      if(port.linked?.unavailable(cellId))return false;if(!port.controller(cellId))return true;
      // A mounted peer needs the forwarding route and a settled, error-free chart.
      const status=port.readiness(cellId);return!!port.linked&&!!status?.settled&&!status.error;
     }});
    return plan.peers.length?plan:null;
   };
   const current=()=>{
    if(retired)throw Error('This drawing workspace command is retired.');
    try{
     const now=available();
     if(now.state!==expected||now.datasets!==opening.datasets||now.activeBars!==opening.activeBars||now.activeDatasetId!==opening.activeDatasetId||now.activeExecutionIdentity!==opening.activeExecutionIdentity||now.onCaptureDrawingWorkspace!==opening.onCaptureDrawingWorkspace||port.readiness(id)!==status||!status?.settled||status.error||!chartInputCommitted(status.input,input)||chart.getExecutionIdentity()!==execution||!chart.isInputCurrent(input))throw Error(purpose==='erase'?'This chart is still loading, or its input or workspace changed. Wait for it to finish loading before erasing.':'The exact chart input or workspace changed during drawing duplication.');
    }catch(error){retired=true;throw error;}
   };
   current();
   // DWUTIL spec 3.7/3.8: the former linked refusal is retired for erase and duplicate. A change to a
   // scoped drawing prepares one candidate per same-scope cell inside this one workspace candidate.
   const upstream=opening.onCaptureDrawingWorkspace?.(expected);
   if(!upstream)throw Error('The prepared workspace drawing route is unavailable.');
   const assertCurrent=()=>{current();upstream.assertCurrent();current();};
   assertCurrent();
   return Object.freeze({assertCurrent,prepare(candidate:Readonly<Record<string,unknown>>){
    assertCurrent();if(prepared)throw Error('This drawing workspace command is already prepared.');prepared=true;
    measureWorkspaceJSON({drawings:candidate});
    const copied=structuredClone(candidate),cells:typeof expected.cells={...expected.cells,[id]:{...cell,drawings:copied}};
    const plan=linkedPlan(copied);
    for(const peer of plan?.peers??[])cells[peer.cellId]={...expected.cells[peer.cellId],drawings:structuredClone(peer.drawings)};
    const next={...expected,cells};
    validateCellDrawingScopes(next.cells[id],data);
    for(const peer of plan?.peers??[])validateCellDrawingScopes(next.cells[peer.cellId],exactGridDataset(expected,peer.cellId,opening.datasets));
    measureWorkspaceJSON({grid:next});assertCurrent();
    const pending=upstream.prepare(next);assertCurrent();
    let phase:'prepared'|'publishing'|'accepted'|'retired'='prepared',acknowledged=false;
    const receipt:PreparedDrawingDuplicateWorkspace=Object.freeze({
     assertCurrent(){if(this!==receipt||phase==='retired')throw Error('The prepared drawing workspace is retired.');assertCurrent();pending.assertCurrent();assertCurrent();},
     publish(mark:()=>void){
      if(this!==receipt||phase!=='prepared')throw Error('This drawing workspace publication is consumed.');receipt.assertCurrent();phase='publishing';
      // Failure before forwarding changes nothing. After the first peer is forwarded, a failure leaves
      // an unpublished native intermediate: the origin and every mounted peer are quarantined and the
      // authoritative saved workspace is kept (the eraser recovery model).
      const natives=(plan?.peers??[]).filter(peer=>peer.mode==='native');let forwarding=false;
      try{
       for(const peer of natives){forwarding=true;port.linked!.forward(peer.cellId,structuredClone(peer.drawings));}
       if(natives.length)receipt.assertCurrent();
       const result=pending.publish(()=>{
        if(phase!=='publishing'||acknowledged)throw Error('Drawing workspace acknowledgement is retired or repeated.');
        acknowledged=true;expected=next;port.accept(next);mark();
       });
       if(result!==undefined||!acknowledged)throw Error('Drawing workspace publication did not acknowledge synchronously.');
       phase='accepted';receipt.assertCurrent();
      }catch(error){
       if(forwarding&&!acknowledged)try{port.linked!.quarantine([id,...natives.map(peer=>peer.cellId)],LINKED_RECOVERY);}catch{/* Quarantine failure cannot replace the original cause. */}
       throw error;
      }finally{if(phase==='publishing')phase=acknowledged?'accepted':'retired';}
     }
    });return receipt;
   }});
  },
  history(direction:'undo'|'redo',assertActionOwner:()=>void){
   port.settle?.();const opening=available(),callback=opening.onDrawingHistory;
   if(!callback)throw Error('Workspace undo and redo are unavailable.');assertActionOwner();
   if(available().state!==opening.state)throw Error('Workspace history changed before dispatch.');
   callback(direction,opening.state);
  },
  historyStatus(){port.settle?.();const now=available();return now.drawingHistoryStatus?.()??{canUndo:false,canRedo:false};}
 });
}
