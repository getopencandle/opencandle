import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {all,focusDocument,mountControlledComponent,text,type ModelNode} from '../helpers/alert-dialog-harness';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {buildContextPriceRequestData} from '../../src/ui/context-price-request';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createLocalAlert,type LocalAlert} from '../../src/domain/alerts';
import {sourceContextForDataset} from '../../src/chart/source-context';

// BE-8 (a routine background autosave must not pause or
// disable the alert panel. During the write App's storage lock still refuses every alert write (unchanged guard), so the
// panel keeps its confirmed observation, its controls and focus, and defers its own evaluation publication (an expiry or
// crossing found by the 1 s tick) to right after the write instead of publishing into the lock and failing.
// Actual WorkspaceAlerts (catalog, observer, interval tick) feeding the actual AlertDialog and Modal under the shared
// controlled hook and node model; Chromium's focus fixup is applied explicitly and MutationObserver delivery is driven by
// the test. No browser DOM, focus engine, GUI or package claim.
const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
const intervals:Array<()=>void>=[];
beforeEach(()=>{observers.length=0;intervals.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.stubGlobal('setInterval',(callback:()=>void)=>{intervals.push(callback);return intervals.length;});vi.stubGlobal('clearInterval',()=>{});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
// The shared harness restores mocks, unstubs globals and disposes components after each case.
afterEach(()=>{vi.useRealTimers();});

function setup(){
 let clock=1791979200;vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 const dataset=fixtureDataset('GME',1);dataset.bars=[{time:1704153600,open:9,high:10,low:8,close:9,volume:100}];
 // App's acceptAlerts: refused while any storage mutation holds the lock (the routine autosave included).
 const lock={saving:false};
 const props:any={open:true,onClose:vi.fn(),alerts:[] as LocalAlert[],dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,enabled:true,suspended:false,backgroundSave:false,assertContextCurrent:vi.fn(),onContextComplete:vi.fn()};
 props.onAlertsChange=vi.fn((next:LocalAlert[],base:LocalAlert[])=>{if(lock.saving||base!==props.alerts)return false;props.alerts=next;return true;});
 props.chart={getSourceContext:()=>sourceContextForDataset(dataset,props.bars),getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:props.bars.length,firstTime:props.bars[0]?.time??null,lastTime:props.bars.at(-1)?.time??null,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({drawings:[]}),indicators:{serialize:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{}};
 let child:AlertDialogProps|null=null;
 const view=mountControlledComponent(()=>{const element=WorkspaceAlerts(props) as unknown as {props:AlertDialogProps};child=element.props;return AlertDialog(element.props);});
 /** React commit model: render, run the effects it scheduled, repeat until a pass writes no state. (WorkspaceAlerts passes
  fresh arrays, so an effect keyed on them reruns every render without writing; real React re-renders only on a write.) */
 const pump=()=>{for(let pass=0;pass<16;pass++){const writes=view.owner.writes;view.render();for(const effect of view.owner.pending.splice(0))effect();if(view.owner.writes===writes)return;}throw Error('Synthetic state kept changing');};
 /** A commit: Chromium moves focus off a control that became disabled, then observers run and the async tick settles. */
 const settle=async()=>{for(let pass=0;pass<8;pass++){pump();const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();await vi.advanceTimersByTimeAsync(0);for(let i=0;i<10;i++)await Promise.resolve();}pump();};
 const control=(name:string)=>view.nodeFor(view.find(node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name)));
 const submit=()=>(view.find(node=>node.type==='form').props.onSubmit as (event:{preventDefault():void})=>void)({preventDefault(){}});
 const tick=()=>{const run=intervals.at(-1);if(!run)throw Error('Missing the actual WorkspaceAlerts interval');run();};
 return{props,lock,view,settle,control,submit,tick,child:()=>child!,advance:(seconds:number)=>{clock+=seconds;},clock:()=>clock,dataset};
}
const isActive=(node:ModelNode)=>focusDocument.activeElement===node;

it('BE-8: during a routine autosave the contextual draft stays interactive, focus stays on "Create local alert" and the tick defers its publication',async()=>{
 const ui=setup();await ui.settle();
 const context=ui.child().context;expect(context,JSON.stringify(ui.child().diagnostics)).toBeTruthy();
 // A saved alert that expires two seconds from now: the 1 s tick has an expiry to publish while the write is in flight.
 const expiring=createLocalAlert({id:'synthetic-expiring',name:'Synthetic expiring',message:'Synthetic only',instrumentId:context!.instrumentId,sourceId:context!.sourceId,runId:context!.runId,mode:context!.mode,observationBinding:context!.binding,conditionVersion:2,condition:{kind:'greater',value:1000},frequency:'every-time',createdAt:ui.clock(),expiresAt:ui.clock()+2});
 expect(ui.child().onAlertsChange([expiring],ui.props.alerts)).toBe(true);ui.child().onRequestObservation?.('after-save');await ui.settle();
 // The chart context menu opens the clicked-price draft.
 ui.props.contextRequest=buildContextPriceRequestData({id:'synthetic-click',action:'price-alert',price:9.5,instrument:ui.dataset.instrument,chartId:'synthetic-chart',sourceKey:'supplied-synthetic-source',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:null});
 await ui.settle();
 const create=ui.control('Create'),cancel=ui.control('Cancel');
 expect(create.disabled,JSON.stringify(ui.child().diagnostics)).toBe(false);create.focus();
 const publications=ui.props.onAlertsChange.mock.calls.length;
 // App commits a change and its routine autosave starts writing: the storage lock is held, the panel is not suspended.
 ui.lock.saving=true;ui.props.backgroundSave=true;await ui.settle();
 expect(create.disabled).toBe(false);expect(isActive(create)).toBe(true);
 ui.advance(3);ui.tick();await ui.settle();
 // Probe (BE-8 follow-through): with the panel no longer suspended, the tick used to publish the expiry into the lock,
 // fail ('Alert expiration could not be saved'), drop its observation and disable Create; now it waits for the write.
 expect(ui.props.onAlertsChange.mock.calls.length,'no publication attempted into the storage lock').toBe(publications);
 expect(ui.child().context).toBeTruthy();
 expect(create.disabled).toBe(false);
 expect(isActive(create),'focus stays put').toBe(true);expect(isActive(cancel)).toBe(false);
 expect(ui.child().diagnostics?.join(' ')).not.toMatch(/paused|could not be saved/);
 expect(ui.props.alerts[0].status).toBe('active');
 const fields=all(ui.view.find(node=>node.type==='form'),node=>node.type==='input'||node.type==='select'||node.type==='textarea');
 expect(fields.length).toBeGreaterThan(0);expect(fields.filter(node=>node.props.disabled),'draft fields stay editable').toEqual([]);
 // Submitting inside the write window itself meets App's unchanged storage lock: refused, draft and focus retained.
 ui.submit();await ui.settle();
 expect(ui.view.text()).toContain('The alert change was rejected. Saved alerts and this draft were retained.');
 expect(ui.props.alerts).toHaveLength(1);expect(ui.props.onContextComplete).not.toHaveBeenCalled();
 expect(create.disabled).toBe(false);expect(isActive(create)).toBe(true);
 const refused=ui.props.onAlertsChange.mock.calls.length;expect(refused,'only the user submit reached the lock').toBe(publications+1);
 // The write ends: the deferred evaluation runs as an ordinary evaluation tick (its pending state may briefly gate Create,
 // as every evaluation does; the dialog focus fallback parks focus on the dialog and returns it) and publishes the expiry.
 ui.lock.saving=false;ui.props.backgroundSave=false;await ui.settle();await vi.advanceTimersByTimeAsync(60);await ui.settle();
 expect(ui.props.onAlertsChange.mock.calls.length).toBe(refused+1);
 expect(ui.props.alerts[0].status).toBe('expired');
 expect(create.disabled).toBe(false);expect(isActive(create)).toBe(true);expect(isActive(cancel)).toBe(false);
 expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.props.onContextComplete).not.toHaveBeenCalled();
 // The same draft now saves.
 ui.submit();await ui.settle();
 expect(ui.props.alerts).toHaveLength(2);expect(ui.props.onContextComplete).toHaveBeenCalledWith(ui.props.contextRequest,'saved');
});

it('BE-8: a blocking workspace operation (suspended) still pauses evaluation and withdraws the context, as before',async()=>{
 const ui=setup();await ui.settle();expect(ui.child().context).toBeTruthy();
 ui.props.suspended=true;await ui.settle();
 expect(ui.child().context).toBeNull();expect(ui.child().diagnostics?.join(' ')).toMatch(/paused while the workspace updates/);
 expect(ui.child().onAlertsChange(ui.props.alerts,ui.props.alerts)).toBe(false);
 ui.props.suspended=false;await ui.settle();expect(ui.child().context).toBeTruthy();
});

it('BFF-R1: a tick in the gap between the storage lock and the backgroundSave render defers instead of publishing',async()=>{
 // App takes the lock synchronously (beginStorageMutation) and only then schedules the render that sets
 // backgroundSave. The panel reads the lock itself through isStorageLocked, so a tick landing in that gap waits.
 const ui=setup();ui.props.isStorageLocked=()=>ui.lock.saving;await ui.settle();
 const context=ui.child().context;expect(context,JSON.stringify(ui.child().diagnostics)).toBeTruthy();
 const expiring=createLocalAlert({id:'synthetic-gap-expiring',name:'Synthetic gap expiring',message:'Synthetic only',instrumentId:context!.instrumentId,sourceId:context!.sourceId,runId:context!.runId,mode:context!.mode,observationBinding:context!.binding,conditionVersion:2,condition:{kind:'greater',value:1000},frequency:'every-time',createdAt:ui.clock(),expiresAt:ui.clock()+2});
 expect(ui.child().onAlertsChange([expiring],ui.props.alerts)).toBe(true);ui.child().onRequestObservation?.('after-save');await ui.settle();
 const publications=ui.props.onAlertsChange.mock.calls.length;
 // The lock is held; the backgroundSave render has not arrived yet.
 ui.lock.saving=true;expect(ui.props.backgroundSave).toBe(false);
 ui.advance(3);ui.tick();await ui.settle();
 expect(ui.props.onAlertsChange.mock.calls.length,'no publication attempted into the storage lock').toBe(publications);
 expect(ui.child().context,'the observation is kept').toBeTruthy();
 expect(ui.child().diagnostics?.join(' ')).not.toMatch(/could not be saved/);
 expect(ui.props.alerts[0].status).toBe('active');
 // The write ends before any backgroundSave render (both landed in one batch): the next tick publishes the expiry.
 ui.lock.saving=false;ui.tick();await ui.settle();
 expect(ui.props.onAlertsChange.mock.calls.length).toBe(publications+1);
 expect(ui.props.alerts[0].status).toBe('expired');
 expect(ui.child().diagnostics?.join(' ')).not.toMatch(/could not be saved/);
});
