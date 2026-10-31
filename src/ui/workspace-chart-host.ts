import type {CellStudyIntent} from './cell-study-intents';
import type {ChartController} from '../chart/adapter';
import type {ScriptBindingExecution} from './script-binding-runtime';
import type {GridTreeInput,GridSuspensionLease,GridStagingLease,MultiChartGridProps,MultiChartState,MultiChartTransactionCoordinator} from './MultiChartGrid';
import {createStructuralWorkspaceTransaction,type StructuralWorkspaceResult} from './structural-workspace-transaction';
import type {ChartContextActions,RootChartMenuAction} from '../chart/context-menu';

type NativeCoordinator=MultiChartTransactionCoordinator&{
 suspend:(expected:GridTreeInput)=>GridSuspensionLease;
 waitUntilReady:(expected:GridTreeInput,signal:AbortSignal)=>Promise<GridStagingLease>;
};
type View=Pick<MultiChartGridProps,'studyFavorites'|'drawingPreferences'|'appearance'|'contextActions'|'chartSettings'|'onOpenSettings'|'drawingSyncOn'|'onDrawingSyncChange'|'zoomArmed'|'zoomTimeAt'|'zoomBarInterval'|'zoomRange'|'zoomCancel'|'newChartTimezone'|'replayCellBars'>;
export interface ChartTreeTransition {
 expected:GridTreeInput;next:GridTreeInput;view:View;
 assertCurrent:()=>boolean;
 commitModel:(canonicalState:MultiChartState,markCommitted:()=>void)=>void;
 /** A layout tab switch. The tree being left is kept mounted and hidden (parked) instead of disposed, and a
  * parked tree of the layout being opened is reused instead of building its charts again. */
 park?:boolean;
}
/** At most this many hidden chart trees stay mounted, least recently left disposed first. */
export const PARKED_CHART_TREES=2;
/** How the last committed transition was staged, for packaged timing checks (data attributes on the host). */
export interface ChartTreeSwitchTiming {milliseconds:number;reused:boolean;parked:number}
export interface WorkspaceChartHostController {
 transition:(request:ChartTreeTransition)=>Promise<StructuralWorkspaceResult>;
 cancel:(reason?:string)=>void;
 /** Dispose the parked tree of one layout (deleted), or every parked tree. */
 forgetParked?:(layoutId?:string)=>void;
}
export interface ChartTreeSlot {
 /** parked: a left layout's tree, hidden and still suspended (hold), until reused or disposed. */
 id:number;studyEpoch:object;mode:'active'|'held'|'staging'|'retired'|'quarantined'|'parked';hold?:GridSuspensionLease|null;pendingRender?:boolean;input:GridTreeInput;view:View;
 coordinator:NativeCoordinator|null;controller:ChartController|null;lease:GridStagingLease|null;
 error:string;awaitingProps:MultiChartState|null;results:Map<string,{value:ScriptBindingExecution;cellId:string}>;
 callbacks:Pick<MultiChartGridProps,'onStudyIntent'|'onChange'|'onRequestResize'|'onReady'|'onActiveCell'|'onCellCrosshair'|'onTransactionReady'|'onDrawingPreferencesChange'|'onScriptResult'|'contextActions'|'onCaptureDrawingWorkspace'|'onDrawingHistory'|'drawingHistoryStatus'>;
 waiters:Set<()=>void>;
}
function input(props:MultiChartGridProps):GridTreeInput{
 if(!props.activeBars||!props.activeDatasetId)throw new Error('The chart host requires an explicit active dataset and bars.');
 return{state:props.state,datasets:props.datasets,activeBars:props.activeBars,activeDatasetId:props.activeDatasetId,activeExecutionIdentity:props.activeExecutionIdentity??'ordinary'};
}
function same(a:GridTreeInput,b:GridTreeInput){return a.state===b.state&&a.datasets===b.datasets&&a.activeBars===b.activeBars&&a.activeDatasetId===b.activeDatasetId&&a.activeExecutionIdentity===b.activeExecutionIdentity;}
function view(props:View):View{return{studyFavorites:props.studyFavorites,drawingPreferences:props.drawingPreferences,appearance:props.appearance,contextActions:props.contextActions?{...props.contextActions}:undefined,chartSettings:props.chartSettings,onOpenSettings:props.onOpenSettings,drawingSyncOn:props.drawingSyncOn,onDrawingSyncChange:props.onDrawingSyncChange,zoomArmed:props.zoomArmed,zoomTimeAt:props.zoomTimeAt,zoomBarInterval:props.zoomBarInterval,zoomRange:props.zoomRange,zoomCancel:props.zoomCancel,newChartTimezone:props.newChartTimezone,replayCellBars:props.replayCellBars};}
function failures(errors:unknown[],message:string):never{if(errors.length===1)throw errors[0];throw new AggregateError(errors,message);}
function attemptAll(actions:Array<()=>void>,message:string){const errors:unknown[]=[];for(const action of actions)try{action();}catch(error){errors.push(error);}if(errors.length)failures(errors,message);}
/** Callback ownership is synchronous. React painting is deliberately separate
 * from native readiness and cannot authorize publication by itself. */
export function createWorkspaceChartHost(port:{read:()=>MultiChartGridProps;changed:()=>void;alive:()=>boolean}){
 const engine=createStructuralWorkspaceTransaction();let sequence=0,slots:ChartTreeSlot[]=[],active:ChartTreeSlot;
 const owns=(slot:ChartTreeSlot)=>port.alive()&&active===slot&&slot.mode==='active';
 const forwards=(slot:ChartTreeSlot)=>owns(slot)&&slot.awaitingProps===null;
 const synchronizeActions=(slot:ChartTreeSlot)=>{
  const keys=Object.keys(slot.view.contextActions??{});
  if(keys.join('|')===Object.keys(slot.callbacks.contextActions??{}).join('|'))return;
  slot.callbacks.contextActions=Object.fromEntries(keys.map(name=>[name,async(...args:Parameters<NonNullable<ChartContextActions[RootChartMenuAction]>>)=>{
   let released=false;const release=()=>{if(released)return;released=true;args[1].release();};
   try{const callback=port.read().contextActions?.[name as RootChartMenuAction];if(!forwards(slot)||!callback){release();return false;}return await callback(...args);}catch(cause){const errors=[cause];try{release();}catch(cleanup){errors.push(cleanup);}failures(errors,'Chart action and release failed.');}
  }])) as ChartContextActions;
 };
 const remove=(slot:ChartTreeSlot)=>{slot.studyEpoch={};slot.mode='retired';slot.results.clear();slots=slots.filter(row=>row!==slot);port.changed();};
 const quarantine=(slot:ChartTreeSlot,message:string)=>{active=slot;slot.studyEpoch={};slot.mode='quarantined';slot.error=message;slot.results.clear();attemptAll([port.changed,()=>port.read().onTransactionReady?.(null),()=>port.read().onReady(null)],'Committed chart recovery publication was incomplete.');};
 const create=(treeInput:GridTreeInput,view:View,mode:ChartTreeSlot['mode']):ChartTreeSlot=>{
  const slot:ChartTreeSlot={id:++sequence,studyEpoch:{},mode,input:treeInput,view,coordinator:null,controller:null,lease:null,error:'',awaitingProps:null,results:new Map(),callbacks:{} as ChartTreeSlot['callbacks'],waiters:new Set()};
  slot.callbacks={
   onStudyIntent:(intent:CellStudyIntent)=>{
    if(!forwards(slot))return false;const epoch=slot.studyEpoch;
    const assertTreeCurrent=()=>{if(!forwards(slot)||slot.studyEpoch!==epoch)throw Error('This study control belongs to a previous chart tree.');intent.assertTreeCurrent?.();};
    assertTreeCurrent();return port.read().onStudyIntent?.({...intent,assertTreeCurrent})===true;
   },
   onCaptureDrawingWorkspace:expectedGrid=>{
    if(!forwards(slot)||slot.input.state!==expectedGrid)throw Error('The drawing chart tree has been retired or is not settled.');
    let expectedInput=slot.input,retired=false,prepared=false;
    const assertOwner=()=>{if(retired||!owns(slot)||slot.input!==expectedInput){retired=true;throw Error('The exact drawing chart tree input has been replaced.');}};
    const upstream=port.read().onCaptureDrawingWorkspace?.(expectedGrid);
    if(!upstream)throw Error('The prepared drawing workspace is unavailable.');
    const assertCurrent=()=>{assertOwner();upstream.assertCurrent();assertOwner();};assertCurrent();
    return Object.freeze({assertCurrent,prepare(next:MultiChartState){
     assertCurrent();if(prepared)throw Error('This chart tree drawing command is already prepared.');prepared=true;
     const pending=upstream.prepare(next);assertCurrent();
     let phase:'prepared'|'publishing'|'accepted'|'retired'='prepared',acknowledged=false;
     const preparedInput={...expectedInput,state:next};
     const receipt=Object.freeze({
      assertCurrent(){if(this!==receipt||phase==='retired')throw Error('Prepared chart tree drawing publication is retired.');assertCurrent();pending.assertCurrent();assertCurrent();},
      publish(mark:()=>void){
       if(this!==receipt||phase!=='prepared')throw Error('This chart tree drawing publication was already consumed.');receipt.assertCurrent();phase='publishing';
       try{
        const result=pending.publish(()=>{
         if(phase!=='publishing'||acknowledged)throw Error('Chart tree drawing acknowledgement is late or repeated.');
         acknowledged=true;expectedInput=preparedInput;slot.input=preparedInput;slot.awaitingProps=next;mark();
        });
        if(result!==undefined||!acknowledged)throw Error('Chart tree drawing publication did not acknowledge synchronously.');
        phase='accepted';receipt.assertCurrent();
       }finally{if(phase==='publishing')phase=acknowledged?'accepted':'retired';}
      }
     });return receipt;
    }});
   },
   onDrawingHistory:(direction,expected)=>{
    if(!forwards(slot)||slot.input.state!==expected)throw Error('The history chart tree was replaced or is not settled.');
    const callback=port.read().onDrawingHistory;if(!callback)throw Error('Workspace history is unavailable.');callback(direction,expected);
   },
   drawingHistoryStatus:()=>forwards(slot)?port.read().drawingHistoryStatus?.()??{canUndo:false,canRedo:false}:{canUndo:false,canRedo:false},
   onChange:(...args)=>forwards(slot)?port.read().onChange(...args):false,
   onRequestResize:async(expected,next)=>forwards(slot)&&slot.input.state===expected?await port.read().onRequestResize?.(expected,next)??false:false,
   onReady:controller=>{if(slot.mode==='retired')return;slot.controller=controller;if(forwards(slot))port.read().onReady(controller);},
   onActiveCell:(...args)=>{if(forwards(slot))port.read().onActiveCell(...args);},
   onCellCrosshair:(...args)=>{if(forwards(slot))port.read().onCellCrosshair?.(...args);},
   onTransactionReady:coordinator=>{if(slot.mode==='retired')return;slot.coordinator=coordinator as NativeCoordinator|null;for(const notify of [...slot.waiters])notify();if(forwards(slot))port.read().onTransactionReady?.(coordinator);},
   onDrawingPreferencesChange:value=>forwards(slot)?port.read().onDrawingPreferencesChange?.(value):false,
   onScriptResult:(value,cellId)=>{if(slot.mode==='retired'||slot.mode==='quarantined')return;if(forwards(slot)){port.read().onScriptResult?.(value,cellId);return;}if(slot.input.state.cells[cellId]?.scriptBindings?.some(binding=>binding.id===value.bindingId))slot.results.set(JSON.stringify([cellId,value.bindingId]),{value,cellId});},
  };
  synchronizeActions(slot);return slot;
 };
 active=create(input(port.read()),view(port.read()),'active');slots=[active];
 const waitCoordinator=(slot:ChartTreeSlot,signal:AbortSignal)=>new Promise<NativeCoordinator>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>|undefined,settled=false;
  const finish=(error?:Error)=>{if(settled)return;settled=true;slot.waiters.delete(check);signal.removeEventListener('abort',cancel);if(timer)clearTimeout(timer);error?reject(error):resolve(slot.coordinator!);};
  const cancel=()=>finish(new Error('Chart tree mounting was cancelled.'));
  const check=()=>{if(signal.aborted||!port.alive()||!slots.includes(slot)||slot.mode!=='staging'){cancel();return;}if(slot.coordinator&&!slot.pendingRender)finish();};
  slot.waiters.add(check);signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish(new Error('Chart tree did not establish its native coordinator within 30 seconds.')),30000);check();
 });
 // Parked trees by layout id, least recently left first.
 const parked=new Map<string,ChartTreeSlot>();let timing:ChartTreeSwitchTiming|null=null;
 const discard=(slot:ChartTreeSlot)=>{const hold=slot.hold;slot.hold=null;attemptAll([()=>hold?.retire(),()=>hold?.dispose(),()=>remove(slot)],'Parked chart tree disposal was incomplete.');};
 const forgetParked=(layoutId?:string)=>{const rows=layoutId===undefined?[...parked.values()]:[parked.get(layoutId)].filter((row):row is ChartTreeSlot=>!!row);for(const slot of rows){parked.delete(slot.input.state.layout.id);discard(slot);}};
 const park=(slot:ChartTreeSlot,hold:GridSuspensionLease)=>{
  const layoutId=slot.input.state.layout.id,prior=parked.get(layoutId);if(prior&&prior!==slot){parked.delete(layoutId);discard(prior);}
  slot.studyEpoch={};slot.mode='parked';slot.hold=hold;slot.results.clear();parked.delete(layoutId);parked.set(layoutId,slot);
  while(parked.size>PARKED_CHART_TREES){const [id,oldest]=parked.entries().next().value!;parked.delete(id);discard(oldest);}
  port.changed();
 };
 /** A parked tree of the layout being opened, resumed so it can take the next input as a staging tree; null when there is
  * none or it cannot resume (then it is disposed and a new tree is built, as before). */
 const unpark=(request:ChartTreeTransition):ChartTreeSlot|null=>{
  const layoutId=request.next.state.layout.id,slot=parked.get(layoutId);if(!slot)return null;parked.delete(layoutId);
  if(!request.park||layoutId===request.expected.state.layout.id||!slots.includes(slot)){discard(slot);return null;}
  const hold=slot.hold;slot.hold=null;
  try{if(!hold||!hold.isCurrent())throw new Error('The parked chart tree is no longer current.');hold.resume();}catch{attemptAll([()=>hold?.retire(),()=>hold?.dispose(),()=>remove(slot)],'Parked chart tree disposal was incomplete.');return null;}
  slot.studyEpoch={};slot.mode='staging';slot.input=request.next;slot.view=view(request.view);slot.lease=null;slot.awaitingProps=null;slot.error='';slot.results.clear();slot.pendingRender=true;synchronizeActions(slot);
  return slot;
 };
 const controller:WorkspaceChartHostController={cancel:reason=>engine.cancel(reason),forgetParked,async transition(request){
  const old=active;if(engine.busy())throw new Error('A chart tree replacement is already active.');
  if(!owns(old)||!same(old.input,request.expected))throw new Error('The current chart tree no longer matches the requested input.');
  let staged:ChartTreeSlot|null=null,oldHold:GridSuspensionLease|null=null,parking=false,reused=false;const started=Date.now();
  const keepOld=!!request.park&&request.next.state.layout.id!==request.expected.state.layout.id;
  return engine.run({
   assertCurrent:()=>port.alive()&&active===old&&same(old.input,request.expected)&&request.assertCurrent(),
   acquireOldHold:()=>{
    if(typeof old.coordinator?.suspend!=='function')throw new Error('The current chart tree cannot be safely suspended.');
    old.studyEpoch={};old.mode='held';
    try{oldHold=old.coordinator.suspend(request.expected);port.changed();}catch(error){
     const errors:unknown[]=[error];let recovered=true;
     if(oldHold)try{oldHold.resume();}catch(cleanup){recovered=false;errors.push(cleanup);for(const finish of [oldHold.retire,oldHold.dispose])try{finish();}catch(failure){errors.push(failure);}}
     if(recovered){old.mode='active';try{port.changed();}catch(cleanup){errors.push(cleanup);}}
     else try{quarantine(old,'The original chart tree could not resume after failed staging.');}catch(cleanup){errors.push(cleanup);}
     failures(errors,'Chart tree suspension and recovery were incomplete.');
    }
    return{isCurrent:()=>port.alive()&&slots.includes(old)&&old.mode==='held'&&oldHold!.isCurrent(),
     resume:()=>{oldHold!.resume();old.mode='active';port.changed();},
     retire:()=>{
      // A tab switch parks the tree it leaves: still suspended (no publication, no market writes), hidden.
      if(keepOld&&oldHold!.isCurrent()){parking=true;old.studyEpoch={};old.mode='parked';old.results.clear();attemptAll([()=>{if(active===old)port.read().onTransactionReady?.(null);},()=>{if(active===old)port.read().onReady(null);}],'Old chart tree retirement was incomplete.');return;}
      old.studyEpoch={};old.mode='retired';old.results.clear();attemptAll([()=>oldHold!.retire(),()=>{if(active===old)port.read().onTransactionReady?.(null);},()=>{if(active===old)port.read().onReady(null);}], 'Old chart tree retirement was incomplete.');},
     dispose:()=>{if(parking){parking=false;park(old,oldHold!);return;}attemptAll([()=>oldHold!.dispose(),()=>remove(old)],'Old chart tree disposal was incomplete.');},
    };
   },
   createStage:()=>{
    const reuse=unpark(request);reused=!!reuse;
    staged=reuse??create(request.next,view(request.view),'staging');const stage=staged;if(!reuse)slots=[...slots,stage];
    try{port.changed();}catch(error){stage.studyEpoch={};stage.mode='retired';stage.results.clear();slots=slots.filter(row=>row!==stage);staged=null;const errors=[error];try{port.changed();}catch(cleanup){errors.push(cleanup);}failures(errors,'Chart staging allocation and cleanup were incomplete.');}
    const current=()=>port.alive()&&slots.includes(stage)&&stage.mode==='staging'&&same(stage.input,request.next)&&(!stage.lease||stage.lease.isCurrent());
    return{isCurrent:current,
     ready:async signal=>{const coordinator=await waitCoordinator(stage,signal);if(typeof coordinator.waitUntilReady!=='function')throw new Error('The staged chart tree cannot establish native readiness.');const lease=await coordinator.waitUntilReady(request.next,signal);if(signal.aborted||!current()){lease.dispose();throw new Error('The staged chart tree retired before native readiness.');}stage.lease=lease;},
     publish:()=>{
      if(!current()||!stage.lease)throw new Error('The staged chart tree lost native readiness.');
      stage.input={...stage.input,state:stage.lease.canonicalState};stage.awaitingProps=stage.input.state;active=stage;stage.mode='active';
      const publication=stage.lease.publish();if(publication.publicationErrors.length)throw new Error(publication.publicationErrors.join(' '));
      port.read().onTransactionReady?.(stage.coordinator);port.read().onReady(stage.lease.activeController);port.changed();
      timing={milliseconds:Date.now()-started,reused,parked:0};
     },
     quarantine:message=>quarantine(stage,message),
     cancel:()=>{stage.studyEpoch={};stage.mode='retired';stage.results.clear();},
     dispose:()=>attemptAll([()=>stage.lease?.dispose(),()=>remove(stage)],'Staged chart tree disposal was incomplete.'),
    };
   },
   commitModel:mark=>{if(!staged?.lease)throw new Error('A ready staged tree is required before model acceptance.');request.commitModel(staged.lease.canonicalState,mark);},
  });
 }};
 return{
  controller,slots:()=>slots,
  /** React rendered the slots (a reused tree now holds its new input), and the last switch timing. */
  rendered(){for(const slot of slots.filter(row=>row.pendingRender)){slot.pendingRender=false;for(const notify of [...slot.waiters])notify();}},
  lastSwitch:():ChartTreeSwitchTiming|null=>timing?{...timing,parked:parked.size}:null,parkedLayouts:()=>[...parked.keys()],forgetParked,
  sync(){if(!owns(active))return;const props=port.read();if(active.awaitingProps&&props.state!==active.awaitingProps)return;active.awaitingProps=null;active.input=input(props);active.view=view(props);synchronizeActions(active);},
  flushResults(){if(!forwards(active))return;const cached=[...active.results.values()];active.results.clear();for(const row of cached)port.read().onScriptResult?.(row.value,row.cellId);},
  cancel:controller.cancel,
 };
}
