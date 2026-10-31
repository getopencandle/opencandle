import {beforeEach,expect,it,vi,type Mock} from 'vitest';
import {all,dispatchDocument,focusDocument,invoke,ModelNode,mountControlledComponent,type ModelElement} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';

const viewport=vi.hoisted(()=>({ports:[] as Array<{begin:ReturnType<typeof vi.fn>;finish:ReturnType<typeof vi.fn>;changed:ReturnType<typeof vi.fn>;command:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}>}));
vi.mock('../../src/chart/viewport-state',async()=>{
 const actual=await vi.importActual<typeof import('../../src/chart/viewport-state')>('../../src/chart/viewport-state');
 return{...actual,createViewportCapture:()=>{const port={begin:vi.fn(),finish:vi.fn(),changed:vi.fn(),command:vi.fn(),stop:vi.fn()};viewport.ports.push(port);return port;}};
});
beforeEach(()=>{viewport.ports=[];});

// Actual private GridCell callbacks, refs and effects obtained from the real
// MultiChartGrid tree. Controlled hook/node/native ports are not DOM dispatch,
// canvas hit tests, native pointer capture, workspace commits or executable UI.
// The shared harness is imported before components to install its React mock.
//
// Raw event model (SYNTHETIC): every React-style wrapper carries its own raw
// native event object. While that event is being dispatched it reports DOM
// eventPhase 1 (capture at the React root container), 2 (target: the native
// canvas listener) or 3 (bubble at the React root container) with a non-null
// currentTarget. endDispatch() sets phase 0 / currentTarget null, as DOM dispatch
// does on completion. drain() is a microtask checkpoint only; it never ends a
// dispatch, so cases end dispatch explicitly before draining. This models the
// final pointer contract; it is not a browser ordering proof.
type Lease={assertCurrent:Mock<()=>void>;cancel:Mock<()=>void>;finish:Mock<()=>void>};
type RawEvent={eventPhase:number;currentTarget:unknown};
type GridEvent={pointerId:number;pointerType:string;isPrimary:boolean;button:number;buttons:number;altKey:boolean;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;target:unknown;currentTarget:unknown;nativeEvent:RawEvent;preventDefault:Mock<()=>void>;stopPropagation:Mock<()=>void>};
function setup(){
 const gme=fixtureDataset('GME',3),spy=fixtureDataset('SPY',3),datasets=[gme,spy];
 const state=createMultiChartState(gme,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 parent.dispose();
 const deferred:Array<()=>void>=[],listeners=new Map<string,Set<()=>void>>();
 const windowPort={addEventListener:vi.fn((type:string,listener:()=>void)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(listener);}),removeEventListener:vi.fn((type:string,listener:()=>void)=>{listeners.get(type)?.delete(listener);})};
 vi.stubGlobal('window',windowPort);vi.stubGlobal('queueMicrotask',(callback:()=>void)=>deferred.push(callback));
 const begin=vi.fn(()=>true),finish=vi.fn(),flush=vi.fn(),publish=vi.fn(()=>true);
 let mode:string|null='eraser',execution='ordinary',accepted={bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'};
 const leases:Lease[]=[];
 const acquire=(assertPointer:()=>void):Lease=>{assertPointer();const lease:Lease={assertCurrent:vi.fn<()=>void>(assertPointer),cancel:vi.fn<()=>void>(),finish:vi.fn<()=>void>()};leases.push(lease);return lease;};
 const native={
  getExecutionIdentity:vi.fn(()=>execution),getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>state.cells[id].chartOptions,applyChartOptions:()=>{},saveDrawings:()=>state.cells[id].drawings,loadDrawings:()=>{},
  indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},
  onDrawingsChanged:()=>()=>{},getViewport:()=>null,onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},
  isInputCurrent:(input:typeof accepted)=>input.bars===accepted.bars&&input.source.datasetId===accepted.source.datasetId&&input.style===accepted.style,
  drawings:{getMode:()=>mode},isDrawingChromeTarget:()=>false,
  beginDrawingEraseGesture:vi.fn(acquire),
 };
 let props:Record<string,any>={...cell.props,onCapture:publish,onReady:()=>{},onStatus:()=>{},onNonGesture:flush,onBeginGesture:begin,onFinishGesture:finish,port:{mount:()=>()=>{}}};
 const component=cell.type as (input:typeof props)=>unknown;
 const ui=mountControlledComponent(()=>component(props));
 const canvas=new ModelNode();canvas.tag='canvas';
 canvas.matches=selector=>selector==='.chart-canvas';
 const container=new ModelNode();container.tag='div';
 let root:ModelElement,node:ModelNode;
 const bind=(tree:unknown)=>{root=tree as ModelElement;node=ui.nodeFor(root);canvas.parent=node;canvas.isConnected=true;node.children.push(canvas);return root;};
 const render=()=>bind(ui.render()),settle=()=>bind(ui.settle());
 const ready=(chart:typeof native)=>{
  const panel=all(render(),value=>value.type===ChartPanel)[0];
  if(typeof panel?.props.onReady!=='function')throw Error('SYNTHETIC fixture requires the chart readiness callback');
  (panel.props.onReady as (chart:typeof native,input:typeof accepted,execution:string)=>void)(chart,accepted,'ordinary');settle();
 };
 settle();ready(native);
 const currentViewport=()=>viewport.ports.at(-1)!;
 const reset=()=>{begin.mockClear();finish.mockClear();flush.mockClear();publish.mockClear();native.beginDrawingEraseGesture.mockClear();for(const port of viewport.ports)for(const method of Object.values(port))method.mockClear();};reset();
 // Phase 1/3 run at the React root container, phase 2 at the native canvas listener.
 const at=(phase:number)=>phase===2?canvas:phase===1||phase===3?container:null;
 const raw=(phase=1):RawEvent=>({eventPhase:phase,currentTarget:at(phase)});
 const dispatching=(value:GridEvent)=>[1,2,3].includes(value.nativeEvent.eventPhase)&&value.nativeEvent.currentTarget!=null;
 // Advancing phase never revives a dispatch that has already ended.
 const phase=(value:GridEvent,next:1|2|3)=>{if(dispatching(value))Object.assign(value.nativeEvent,{eventPhase:next,currentTarget:at(next)});};
 const endDispatch=(...values:GridEvent[])=>{for(const value of values)Object.assign(value.nativeEvent,{eventPhase:0,currentTarget:null});};
 const redispatch=(value:GridEvent)=>{Object.assign(value.nativeEvent,{eventPhase:1,currentTarget:container});};
 const event=(extra:Partial<GridEvent>={}):GridEvent=>({pointerId:11,pointerType:'mouse',isPrimary:true,button:0,buttons:1,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,target:canvas,currentTarget:node,nativeEvent:extra.nativeEvent??raw(1),preventDefault:vi.fn<()=>void>(),stopPropagation:vi.fn<()=>void>(),...extra});
 const call=(name:string,value:GridEvent,tree:ModelElement=root)=>{phase(value,name.endsWith('Capture')&&name!=='onLostPointerCapture'?1:3);invoke(tree.props[name],value);};
 const drain=()=>{for(const work of deferred.splice(0))work();};
 const complete=(...values:GridEvent[])=>{endDispatch(...values);drain();};
 const down=()=>{const value=event();call('onPointerDownCapture',value);return value;};
 const messages=()=>all(render(),value=>value.props.className==='drawing-command-message');
 return{ui,native,leases,begin,finish,flush,publish,windowPort,currentViewport,event,call,down,drain,complete,endDispatch,redispatch,render,settle,reset,canvas,gme,spy,messages,
  atTarget:(value:GridEvent)=>phase(value,2),phase,pending:()=>deferred.length,reads:()=>native.getExecutionIdentity.mock.calls.length,
  get root(){return root;},get node(){return node;},get props(){return props;},setProps(patch:Record<string,unknown>){props={...props,...patch};},
  mode(value:string|null){mode=value;},execution(value:string){execution=value;},accept(value:typeof accepted){accepted=value;},
  switchSource(){
   props={...props,dataset:spy,bars:spy.bars,saved:transitionDrawingScope(props.saved,gme,spy)};render();
   accepted={bars:spy.bars,source:sourceContextForDataset(spy,spy.bars),style:'candles'};
   ready(native);
  },
  replaceChart(){const next={...native,beginDrawingEraseGesture:vi.fn(acquire)};ready(next);return next;},
  replaceRoot(){ui.nodes.set('root',new ModelNode());render();},
  emitWindow(type:string){for(const listener of [...listeners.get(type)??[]])listener();},
 };
}

it('capture arms eraser before the native port, flushes prior viewport once and never begins an eraser viewport frame',()=>{
 const h=setup(),down=h.down();expect(down.preventDefault).not.toHaveBeenCalled();expect(down.stopPropagation).not.toHaveBeenCalled();
 expect(h.native.beginDrawingEraseGesture).toHaveBeenCalledOnce();expect(h.flush).toHaveBeenCalledOnce();expect(h.currentViewport().finish).toHaveBeenCalledOnce();
 expect(h.begin).not.toHaveBeenCalled();expect(h.currentViewport().begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();
 h.atTarget(down);expect(()=>h.leases[0].assertCurrent()).not.toThrow();h.complete(down);expect(()=>h.leases[0].assertCurrent()).toThrow(/sample.*retired/);
 expect(h.publish).not.toHaveBeenCalled();
});

it('fresh move capture renews only its native event and repeated identity cannot renew or cancel the gesture',()=>{
 const h=setup(),down=h.down();h.complete(down);const move=h.event({button:-1});h.call('onPointerMoveCapture',move);
 expect(move.stopPropagation).not.toHaveBeenCalled();h.atTarget(move);expect(()=>h.leases[0].assertCurrent()).not.toThrow();h.complete(move);
 // The repeated identity is re-dispatched live, so only single-use identity can refuse it.
 h.redispatch(move);h.call('onPointerMoveCapture',move);expect(move.preventDefault).toHaveBeenCalledOnce();expect(move.stopPropagation).toHaveBeenCalledOnce();expect(h.leases[0].cancel).not.toHaveBeenCalled();
 expect(()=>h.leases[0].assertCurrent()).toThrow();h.endDispatch(move);const fresh=h.event({button:-1});h.call('onPointerMoveCapture',fresh);
 expect(fresh.stopPropagation).not.toHaveBeenCalled();expect(()=>h.leases[0].assertCurrent()).not.toThrow();expect(h.begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();
});

it('up capture keeps the sample current through native cleanup and matching bubble consumes it without finishing a frame',()=>{
 const h=setup(),down=h.down();h.complete(down);const up=h.event({buttons:0});h.reset();
 h.call('onPointerUpCapture',up);h.atTarget(up);expect(()=>h.leases[0].assertCurrent()).not.toThrow();
 const nativeCleanup=vi.fn();if(!up.stopPropagation.mock.calls.length)nativeCleanup();
 h.call('onPointerUp',up);expect(nativeCleanup).toHaveBeenCalledOnce();expect(h.leases[0].finish).toHaveBeenCalledOnce();expect(h.leases[0].cancel).not.toHaveBeenCalled();
 expect(h.currentViewport().finish).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(()=>h.leases[0].assertCurrent()).toThrow();h.complete(up);
});

it('a rejected release still reaches native cleanup and its bubble cannot finish a viewport frame',()=>{
 const h=setup(),down=h.down();h.complete(down);h.reset();const up=h.event({buttons:0,ctrlKey:true});
 h.call('onPointerUpCapture',up);const nativeCleanup=vi.fn();if(!up.stopPropagation.mock.calls.length)nativeCleanup();h.call('onPointerUp',up);
 expect(nativeCleanup).toHaveBeenCalledOnce();expect(up.preventDefault).not.toHaveBeenCalled();expect(up.stopPropagation).not.toHaveBeenCalled();
 expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(h.leases[0].finish).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 h.complete(up);expect(h.messages()).toHaveLength(1);
});

it('cancel capture retires eraser and the same cancel bubble never completes a viewport frame',()=>{
 const h=setup(),down=h.down();h.complete(down);h.reset();const cancel=h.event({buttons:0});
 h.call('onPointerCancelCapture',cancel);h.call('onPointerCancel',cancel);
 expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(h.leases[0].finish).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 expect(()=>h.leases[0].assertCurrent()).toThrow();h.complete(cancel);
});

it.each(['blur','hidden','lostCapture'] as const)('%s retires the erase gesture without manufacturing viewport history',reason=>{
 const h=setup(),down=h.down();h.complete(down);h.reset();
 if(reason==='blur')h.emitWindow('blur');else if(reason==='hidden'){Object.defineProperty(focusDocument,'hidden',{value:true,configurable:true});Object.defineProperty(focusDocument,'visibilityState',{value:'hidden',configurable:true});dispatchDocument('visibilitychange',{},false);}else h.call('onLostPointerCapture',h.event());
 expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(()=>h.leases[0].assertCurrent()).toThrow();expect(h.begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
});

it('ordinary primary capture and cancel retain the existing viewport begin/finish path',()=>{
 const h=setup();h.mode(null);const down=h.down();expect(down.stopPropagation).not.toHaveBeenCalled();expect(h.native.beginDrawingEraseGesture).not.toHaveBeenCalled();
 expect(h.begin).toHaveBeenCalledOnce();expect(h.currentViewport().begin).toHaveBeenCalledOnce();expect(h.flush).not.toHaveBeenCalled();h.complete(down);
 const cancel=h.event({buttons:0});h.call('onPointerCancelCapture',cancel);h.call('onPointerCancel',cancel);expect(h.currentViewport().finish).toHaveBeenCalledOnce();expect(h.finish).toHaveBeenCalledOnce();h.complete(cancel);
});

it.each(['inputLoading','staging','brokenMessage'] as const)('current %s refuses a new erase before native acquisition',field=>{
 const h=setup();h.setProps({[field]:field==='brokenMessage'?'SYNTHETIC chart unavailable':true});h.render();const down=h.down();
 expect(down.preventDefault).toHaveBeenCalledOnce();expect(down.stopPropagation).toHaveBeenCalledOnce();expect(h.native.beginDrawingEraseGesture).not.toHaveBeenCalled();expect(h.begin).not.toHaveBeenCalled();expect(h.publish).not.toHaveBeenCalled();
 // Non-vacuity control: the refusal belongs to the field, not to the live raw event fixture.
 expect(h.flush).not.toHaveBeenCalled();h.complete(down);h.setProps({[field]:field==='brokenMessage'?undefined:false});h.render();
 const admitted=h.down();expect(admitted.stopPropagation).not.toHaveBeenCalled();expect(h.native.beginDrawingEraseGesture).toHaveBeenCalledOnce();h.complete(admitted);
});

it('a new source render retires the held sample before effect cleanup or native source acceptance',()=>{
 const h=setup(),down=h.down();h.complete(down);h.setProps({dataset:h.spy,bars:h.spy.bars});h.render();const move=h.event({button:-1});h.call('onPointerMoveCapture',move);
 expect(move.preventDefault).toHaveBeenCalledOnce();expect(move.stopPropagation).toHaveBeenCalledOnce();expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(h.native.beginDrawingEraseGesture).toHaveBeenCalledOnce();expect(h.publish).not.toHaveBeenCalled();
});

it('a drawings-only prop revision preserves input ownership before effect reconciliation',()=>{
 const h=setup(),down=h.down();h.complete(down);h.setProps({saved:{...h.props.saved,drawings:{version:1,drawings:[]}}});h.render();
 const move=h.event({button:-1});h.call('onPointerMoveCapture',move);expect(move.stopPropagation).not.toHaveBeenCalled();h.atTarget(move);expect(()=>h.leases[0].assertCurrent()).not.toThrow();
 expect(h.leases[0].cancel).not.toHaveBeenCalled();expect(h.native.beginDrawingEraseGesture).toHaveBeenCalledOnce();expect(h.publish).not.toHaveBeenCalled();h.complete(move);
});

it.each(['execution','appearance','indicators'] as const)('%s replacement refuses the next sample even when drawings are unchanged',field=>{
 const h=setup(),down=h.down();h.complete(down);
 if(field==='execution')h.setProps({executionIdentity:'SYNTHETIC replay replacement'});
 else if(field==='appearance')h.setProps({appearance:{...h.props.appearance}});
 else h.setProps({saved:{...h.props.saved,indicators:[...h.props.saved.indicators]}});
 h.render();const move=h.event({button:-1});h.call('onPointerMoveCapture',move);
 expect(move.stopPropagation).toHaveBeenCalledOnce();expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(h.begin).not.toHaveBeenCalled();expect(h.publish).not.toHaveBeenCalled();
});

it('unmount retires the lease, removes blur registration, and retained move capture cannot revive it',()=>{
 const h=setup(),down=h.down();h.complete(down);const old=h.root,move=h.event({button:-1});h.ui.dispose();
 expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(h.windowPort.removeEventListener).toHaveBeenCalledWith('blur',expect.any(Function));
 h.call('onPointerMoveCapture',move,old);expect(h.leases[0].cancel).toHaveBeenCalledOnce();expect(()=>h.leases[0].assertCurrent()).toThrow();expect(h.native.beginDrawingEraseGesture).toHaveBeenCalledOnce();
});

it.each(['onPointerMoveCapture','onPointerUpCapture','onPointerCancelCapture','onLostPointerCapture'] as const)('retained %s from an older source cannot cancel or lend authority to the replacement gesture',callback=>{
 const h=setup(),first=h.down();h.complete(first);const old=h.root,stale=h.event({buttons:0});h.switchSource();const next=h.down();
 const replacement=h.leases[1];expect(replacement).toBeDefined();h.reset();h.call(callback,stale,old);
 if(callback==='onLostPointerCapture'){expect(stale.preventDefault).not.toHaveBeenCalled();expect(stale.stopPropagation).not.toHaveBeenCalled();}
 else{expect(stale.preventDefault).toHaveBeenCalledOnce();expect(stale.stopPropagation).toHaveBeenCalledOnce();}
 expect(replacement.cancel).not.toHaveBeenCalled();expect(replacement.finish).not.toHaveBeenCalled();expect(()=>replacement.assertCurrent()).not.toThrow();
 expect(h.begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 // Once the replacement press ends, the still-live stale event lends it no sample.
 h.complete(next);expect(()=>replacement.assertCurrent()).toThrow(/sample.*retired/);h.call(callback,stale,old);
 expect(()=>replacement.assertCurrent()).toThrow(/sample.*retired/);expect(replacement.cancel).not.toHaveBeenCalled();expect(replacement.finish).not.toHaveBeenCalled();h.complete(stale);
});

it('retained cancel from a detached Grid root cannot cancel the live replacement on the same source',()=>{
 const h=setup(),first=h.down();h.complete(first);const old=h.root,oldNode=h.node,stale=h.event({buttons:0});h.replaceRoot();
 expect(oldNode.isConnected).toBe(false);const next=h.down();const replacement=h.leases[1];h.reset();h.call('onPointerCancelCapture',stale,old);
 expect(stale.stopPropagation).toHaveBeenCalledOnce();expect(replacement.cancel).not.toHaveBeenCalled();expect(()=>replacement.assertCurrent()).not.toThrow();expect(h.finish).not.toHaveBeenCalled();h.complete(next,stale);
});

it('a different pointer cancellation cannot retire the current primary erase gesture or complete a viewport frame',()=>{
 const h=setup(),down=h.down();h.reset();const other=h.event({pointerId:22,buttons:0});h.call('onPointerCancelCapture',other);
 if(!other.stopPropagation.mock.calls.length)h.call('onPointerCancel',other);
 expect(h.leases[0].cancel).not.toHaveBeenCalled();expect(()=>h.leases[0].assertCurrent()).not.toThrow();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();h.complete(down,other);
});

it('an already consumed release is blocked before native delivery and cannot borrow a new live sample',()=>{
 const h=setup(),first=h.down();h.complete(first);const oldUp=h.event({buttons:0});h.call('onPointerUpCapture',oldUp);h.call('onPointerUp',oldUp);h.complete(oldUp);
 expect(h.leases[0].finish).toHaveBeenCalledOnce();const next=h.down();const replacement=h.leases[1];h.reset();h.redispatch(oldUp);h.call('onPointerUpCapture',oldUp);
 const nativeCleanup=vi.fn();if(!oldUp.stopPropagation.mock.calls.length)nativeCleanup();
 expect(oldUp.preventDefault).toHaveBeenCalledOnce();expect(oldUp.stopPropagation).toHaveBeenCalledOnce();expect(nativeCleanup).not.toHaveBeenCalled();
 expect(replacement.finish).not.toHaveBeenCalled();expect(replacement.cancel).not.toHaveBeenCalled();expect(()=>replacement.assertCurrent()).not.toThrow();expect(h.finish).not.toHaveBeenCalled();h.complete(next,oldUp);
});

// Final pointer contract additions.

it('an early microtask checkpoint between React capture and the native canvas listener keeps the live sample',()=>{
 const h=setup(),down=h.down(),lease=h.leases[0];expect(h.pending()).toBe(1);
 h.drain();expect(h.pending()).toBe(0);expect(()=>lease.assertCurrent()).not.toThrow();
 h.atTarget(down);expect(()=>lease.assertCurrent()).not.toThrow();h.phase(down,3);expect(()=>lease.assertCurrent()).not.toThrow();
 h.endDispatch(down);expect(()=>lease.assertCurrent()).toThrow(/sample.*retired/);expect(lease.cancel).not.toHaveBeenCalled();
 const move=h.event({button:-1});h.call('onPointerMoveCapture',move);h.drain();h.atTarget(move);
 expect(move.stopPropagation).not.toHaveBeenCalled();expect(()=>lease.assertCurrent()).not.toThrow();h.complete(move);expect(()=>lease.assertCurrent()).toThrow(/sample.*retired/);
 const up=h.event({buttons:0});h.reset();h.call('onPointerUpCapture',up);h.drain();h.atTarget(up);expect(()=>lease.assertCurrent()).not.toThrow();h.call('onPointerUp',up);
 expect(lease.finish).toHaveBeenCalledOnce();expect(lease.cancel).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();h.complete(up);
});

it('phase zero refuses immediately after dispatch ends, before its queued cleanup runs, without retiring the gesture',()=>{
 const h=setup(),stalePress=h.event();h.endDispatch(stalePress);h.call('onPointerDownCapture',stalePress);
 expect(stalePress.preventDefault).toHaveBeenCalledOnce();expect(stalePress.stopPropagation).toHaveBeenCalledOnce();expect(h.leases).toHaveLength(0);expect(h.flush).not.toHaveBeenCalled();expect(h.begin).not.toHaveBeenCalled();expect(h.pending()).toBe(0);
 const down=h.down(),lease=h.leases[0];h.atTarget(down);expect(()=>lease.assertCurrent()).not.toThrow();
 h.endDispatch(down);expect(h.pending()).toBe(1);expect(()=>lease.assertCurrent()).toThrow(/sample.*retired/);expect(lease.cancel).not.toHaveBeenCalled();
 const lateMove=h.event({button:-1});h.endDispatch(lateMove);h.call('onPointerMoveCapture',lateMove);
 expect(lateMove.preventDefault).toHaveBeenCalledOnce();expect(lateMove.stopPropagation).toHaveBeenCalledOnce();expect(lease.cancel).not.toHaveBeenCalled();expect(()=>lease.assertCurrent()).toThrow();expect(h.pending()).toBe(1);
 h.reset();const up=h.event({buttons:0});h.call('onPointerUpCapture',up);expect(()=>lease.assertCurrent()).not.toThrow();h.endDispatch(up);expect(h.pending()).toBe(2);expect(()=>lease.assertCurrent()).toThrow(/sample.*retired/);
 h.call('onPointerUp',up);expect(lease.finish).not.toHaveBeenCalled();expect(lease.cancel).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 h.drain();expect(()=>lease.assertCurrent()).toThrow();
 const move=h.event({button:-1});h.call('onPointerMoveCapture',move);expect(move.stopPropagation).not.toHaveBeenCalled();expect(()=>lease.assertCurrent()).not.toThrow();h.complete(move);
 const release=h.event({buttons:0});h.call('onPointerUpCapture',release);h.call('onPointerUp',release);expect(lease.finish).toHaveBeenCalledOnce();expect(lease.cancel).not.toHaveBeenCalled();h.complete(release);
});

it.each(['source','chart','root'] as const)('a retained handler from the old %s is refused by the Grid guard before the bridge sees its live raw event',basis=>{
 const h=setup(),first=h.down();h.complete(first);const old=h.root,oldNode=h.node;
 if(basis==='source')h.switchSource();else if(basis==='chart')h.replaceChart();else h.replaceRoot();
 if(basis==='root')expect(oldNode.isConnected).toBe(false);else expect(h.node).toBe(oldNode);
 const next=h.down();expect(h.leases).toHaveLength(2);const replacement=h.leases[1];h.complete(next);expect(()=>replacement.assertCurrent()).toThrow(/sample.*retired/);h.reset();const reads=h.reads();
 const stale={down:h.event({currentTarget:oldNode}),move:h.event({button:-1,currentTarget:oldNode}),up:h.event({buttons:0,currentTarget:oldNode}),cancel:h.event({buttons:0,currentTarget:oldNode})},lost=h.event({currentTarget:oldNode});
 h.call('onPointerDownCapture',stale.down,old);h.call('onPointerMoveCapture',stale.move,old);h.call('onPointerUpCapture',stale.up,old);h.call('onPointerCancelCapture',stale.cancel,old);h.call('onLostPointerCapture',lost,old);
 for(const value of Object.values(stale)){expect(value.preventDefault).toHaveBeenCalledOnce();expect(value.stopPropagation).toHaveBeenCalledOnce();}
 expect(lost.preventDefault).not.toHaveBeenCalled();expect(lost.stopPropagation).not.toHaveBeenCalled();
 expect(h.reads()).toBe(reads);expect(h.leases).toHaveLength(2);expect(h.flush).not.toHaveBeenCalled();expect(h.begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.publish).not.toHaveBeenCalled();
 expect(h.currentViewport().begin).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 expect(replacement.cancel).not.toHaveBeenCalled();expect(replacement.finish).not.toHaveBeenCalled();expect(()=>replacement.assertCurrent()).toThrow(/sample.*retired/);
 // The Grid refused before the bridge consumed the raw identity: the current handler still admits it.
 const current=h.event({button:-1,nativeEvent:stale.move.nativeEvent});h.call('onPointerMoveCapture',current);
 expect(current.stopPropagation).not.toHaveBeenCalled();expect(()=>replacement.assertCurrent()).not.toThrow();h.complete(current,...Object.values(stale),lost);
});

it.each([
 ['onPointerCancelCapture','foreign pointer'],['onPointerCancelCapture','ended raw event'],['onPointerCancelCapture','consumed raw event'],
 ['onLostPointerCapture','foreign pointer'],['onLostPointerCapture','ended raw event'],['onLostPointerCapture','consumed raw event'],
] as const)('%s with a %s has no effect on the current erase gesture',(channel,defect)=>{
 const h=setup(),down=h.down(),lease=h.leases[0];h.complete(down);const move=h.event({button:-1});h.call('onPointerMoveCapture',move);expect(()=>lease.assertCurrent()).not.toThrow();h.reset();const reads=h.reads();
 const cancel=defect==='foreign pointer'?h.event({pointerId:22,buttons:0}):defect==='ended raw event'?h.event({buttons:0}):h.event({buttons:0,nativeEvent:down.nativeEvent});
 // A stored pointer ID is insufficient: the consumed press identity is re-dispatched live with the current ID.
 if(defect==='ended raw event')h.endDispatch(cancel);else if(defect==='consumed raw event')h.redispatch(cancel);
 h.call(channel,cancel);if(channel==='onPointerCancelCapture'&&!cancel.stopPropagation.mock.calls.length)h.call('onPointerCancel',cancel);expect(h.reads()).toBe(reads);
 if(channel==='onPointerCancelCapture'){expect(cancel.preventDefault).toHaveBeenCalledOnce();expect(cancel.stopPropagation).toHaveBeenCalledOnce();}
 else{expect(cancel.preventDefault).not.toHaveBeenCalled();expect(cancel.stopPropagation).not.toHaveBeenCalled();}
 expect(lease.cancel).not.toHaveBeenCalled();expect(lease.finish).not.toHaveBeenCalled();expect(()=>lease.assertCurrent()).not.toThrow();
 expect(h.flush).not.toHaveBeenCalled();expect(h.begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 h.complete(move,cancel);expect(()=>lease.assertCurrent()).toThrow(/sample.*retired/);
 const fresh=h.event({button:-1});h.call('onPointerMoveCapture',fresh);expect(()=>lease.assertCurrent()).not.toThrow();h.complete(fresh);
 const exact=h.event({buttons:0});h.call(channel,exact);expect(lease.cancel).toHaveBeenCalledOnce();expect(()=>lease.assertCurrent()).toThrow();h.complete(exact);
});

it.each(['ended','re-dispatched'] as const)('a consumed pointer-up replay (%s) has no host, flush or cancel effect on a newer gesture',state=>{
 const h=setup(),first=h.down();h.complete(first);const oldUp=h.event({buttons:0});h.call('onPointerUpCapture',oldUp);h.call('onPointerUp',oldUp);expect(h.leases[0].finish).toHaveBeenCalledOnce();h.complete(oldUp);
 const next=h.down(),replacement=h.leases[1];h.complete(next);const move=h.event({button:-1});h.call('onPointerMoveCapture',move);expect(()=>replacement.assertCurrent()).not.toThrow();
 h.reset();const reads=h.reads();if(state==='re-dispatched')h.redispatch(oldUp);
 const handlers=['onPointerUpCapture','onPointerUp','onPointerMoveCapture','onPointerCancelCapture','onPointerCancel','onLostPointerCapture','onPointerDownCapture'] as const;
 const replays=handlers.map(name=>{const wrapper=h.event({buttons:0,nativeEvent:oldUp.nativeEvent});h.call(name,wrapper);return[name,wrapper] as const;});
 for(const [name,wrapper] of replays){
  const refused=name==='onPointerUpCapture'||name==='onPointerMoveCapture'||name==='onPointerCancelCapture'||name==='onPointerDownCapture';
  expect(wrapper.preventDefault,name).toHaveBeenCalledTimes(refused?1:0);expect(wrapper.stopPropagation,name).toHaveBeenCalledTimes(refused?1:0);
 }
 expect(h.reads()).toBe(reads);expect(h.leases).toHaveLength(2);expect(h.native.beginDrawingEraseGesture).not.toHaveBeenCalled();
 expect(h.flush).not.toHaveBeenCalled();expect(h.begin).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.publish).not.toHaveBeenCalled();
 expect(h.currentViewport().begin).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();
 expect(replacement.cancel).not.toHaveBeenCalled();expect(replacement.finish).not.toHaveBeenCalled();expect(()=>replacement.assertCurrent()).not.toThrow();expect(h.messages()).toHaveLength(0);
 h.complete(move,oldUp);const release=h.event({buttons:0});h.call('onPointerUpCapture',release);h.call('onPointerUp',release);
 expect(replacement.finish).toHaveBeenCalledOnce();expect(replacement.cancel).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();expect(h.currentViewport().finish).not.toHaveBeenCalled();h.complete(release);
});
