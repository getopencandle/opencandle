import {afterEach,beforeEach,expect,it,vi,type Mock} from 'vitest';
import {all,invoke,ModelNode,mountControlledComponent,type ModelElement} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

// LIVE-FREEZE hazard 3: GridCell refused a pointerup/pointercancel (stopPropagation)
// and skipped its lostpointercapture rescue whenever the cell no longer owned grid input, for example when the chart
// re-readied mid-drag on a live update. vela's canvas then never saw the release and kept its drag flag set, panning on
// later hovers. Every release path of the open drag now ends it (vela gets one pointercancel), even when the release
// itself is refused, and a window-level pointerup/pointercancel safety net ends a drag whose release reached no cell
// handler. SYNTHETIC fixtures; actual private GridCell under the shared controlled hook/node model, not DOM dispatch.
const viewport=vi.hoisted(()=>({ports:[] as Array<{begin:Mock;finish:Mock;changed:Mock;command:Mock;stop:Mock}>}));
vi.mock('../../src/chart/viewport-state',async()=>{
 const actual=await vi.importActual<typeof import('../../src/chart/viewport-state')>('../../src/chart/viewport-state');
 return{...actual,createViewportCapture:()=>{const port={begin:vi.fn(),finish:vi.fn(),changed:vi.fn(),command:vi.fn(),stop:vi.fn()};viewport.ports.push(port);return port;}};
});
class SyntheticPointerEvent{type:string;pointerId:number;pointerType:string;bubbles:boolean;constructor(type:string,init:{pointerId:number;pointerType:string;bubbles?:boolean}){this.type=type;this.pointerId=init.pointerId;this.pointerType=init.pointerType;this.bubbles=!!init.bubbles;}}
beforeEach(()=>{viewport.ports=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});vi.stubGlobal('PointerEvent',SyntheticPointerEvent);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

function setup(){
 const gme=fixtureDataset('GME',3),datasets=[gme];
 const state=createMultiChartState(gme,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 parent.dispose();
 const listeners=new Map<string,Set<(event?:unknown)=>void>>();
 vi.stubGlobal('window',{addEventListener:vi.fn((type:string,listener:(event?:unknown)=>void)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(listener);}),removeEventListener:vi.fn((type:string,listener:(event?:unknown)=>void)=>{listeners.get(type)?.delete(listener);})});
 const deferred:Array<()=>void>=[];vi.stubGlobal('queueMicrotask',(callback:()=>void)=>deferred.push(callback));
 const begin=vi.fn(()=>true),finish=vi.fn(),interrupt=vi.fn();
 const accepted={bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'};
 const native={
  getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>state.cells[id].chartOptions,applyChartOptions:()=>{},saveDrawings:()=>state.cells[id].drawings,loadDrawings:()=>{},
  indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},
  onDrawingsChanged:()=>()=>{},getViewport:()=>null,onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},
  isInputCurrent:(input:typeof accepted)=>input.bars===accepted.bars&&input.style===accepted.style,
  drawings:{getMode:()=>null},isDrawingChromeTarget:()=>false,
  beginDrawingEraseGesture:vi.fn(()=>({assertCurrent:vi.fn(),cancel:vi.fn(),finish:vi.fn()})),
 };
 const props:Record<string,any>={...cell.props,onCapture:vi.fn(()=>true),onReady:()=>{},onStatus:()=>{},onNonGesture:vi.fn(),onBeginGesture:begin,onFinishGesture:finish,onInterruptGesture:interrupt,port:{mount:()=>()=>{}}};
 const component=cell.type as (input:typeof props)=>unknown;
 const ui=mountControlledComponent(()=>component(props));
 const canvas=new ModelNode();canvas.tag='canvas';
 let root:ModelElement,node:ModelNode;
 const bind=(tree:unknown)=>{root=tree as ModelElement;node=ui.nodeFor(root);canvas.parent=node;canvas.isConnected=true;node.children.push(canvas);return root;};
 const render=()=>bind(ui.render()),settle=()=>bind(ui.settle());
 settle();
 const panel=()=>all(render(),value=>value.type===ChartPanel)[0];
 (panel().props.onReady as (chart:typeof native,input:typeof accepted,execution:string)=>void)(native,accepted,'ordinary');settle();
 const dispatched:SyntheticPointerEvent[]=[];
 const target={dispatchEvent:vi.fn((event:SyntheticPointerEvent)=>{dispatched.push(event);return true;})};
 const event=(extra:Record<string,unknown>={})=>({pointerId:11,pointerType:'mouse',isPrimary:true,button:0,buttons:1,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,target,currentTarget:node,nativeEvent:{eventPhase:3,currentTarget:node},preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});
 const call=(name:string,value:ReturnType<typeof event>)=>{invoke(root.props[name],value);};
 const drain=()=>{for(const work of deferred.splice(0))work();};
 const down=(extra:Record<string,unknown>={})=>{const value=event(extra);call('onPointerDownCapture',value);drain();return value;};
 /** A live re-ready mid-drag: the cell's chart owner changes, so the still-mounted handlers no longer own grid input. */
 const reReady=()=>{(panel().props.onReady as (chart:unknown,input:typeof accepted,execution:string)=>void)({...native},accepted,'ordinary');};
 const emitWindow=(type:string,value?:unknown)=>{for(const listener of [...listeners.get(type)??[]])listener(value);};
 return{begin,finish,interrupt,dispatched,event,call,down,reReady,emitWindow,listeners};
}

it.each([['pointerup','onPointerUpCapture'],['pointercancel','onPointerCancelCapture']] as const)('LIVE-FREEZE 3: a %s refused because ownership changed mid-drag still releases vela\'s drag once',(_kind,handler)=>{
 const h=setup();h.down();expect(h.begin).toHaveBeenCalledOnce();
 h.reReady();
 const release=h.event({buttons:0});h.call(handler,release);
 expect(release.stopPropagation,'the stale release itself is still refused').toHaveBeenCalled();
 // Probe: before the fix nothing ended the drag here; vela never saw a release and kept panning.
 expect(h.interrupt).toHaveBeenCalledOnce();
 expect(h.dispatched).toHaveLength(1);expect(h.dispatched[0]).toMatchObject({type:'pointercancel',pointerId:11,bubbles:true});
 h.call('onLostPointerCapture',h.event());h.emitWindow('blur');vi.runAllTimers();
 expect(h.interrupt,'released once').toHaveBeenCalledOnce();expect(h.dispatched).toHaveLength(1);
});

it('LIVE-FREEZE 3: lostpointercapture after ownership changed mid-drag releases the drag (the rescue is no longer skipped)',()=>{
 const h=setup();h.down();h.reReady();
 h.call('onLostPointerCapture',h.event({buttons:0}));
 expect(h.interrupt).toHaveBeenCalledOnce();expect(h.dispatched).toHaveLength(1);
});

it('LIVE-FREEZE 3: window blur after ownership changed mid-drag releases the drag',()=>{
 const h=setup();h.down();h.reReady();h.emitWindow('blur');
 expect(h.interrupt).toHaveBeenCalledOnce();expect(h.dispatched).toHaveLength(1);
});

it('LIVE-FREEZE 3: a pointerup that never reached the cell (propagation stopped elsewhere) is caught by the window safety net',()=>{
 const h=setup();h.down();
 expect(h.listeners.get('pointerup')?.size,'window pointerup net registered').toBe(1);
 h.emitWindow('pointerup',{pointerId:11});
 expect(h.interrupt,'it waits for the cell handlers of the same dispatch').not.toHaveBeenCalled();
 vi.runAllTimers();
 expect(h.interrupt).toHaveBeenCalledOnce();expect(h.dispatched).toHaveLength(1);
 // Also pointercancel.
 h.down();h.emitWindow('pointercancel',{pointerId:11});vi.runAllTimers();expect(h.interrupt).toHaveBeenCalledTimes(2);
});

it('LIVE-FREEZE 3: the safety net never ends a drag that was released normally, another pointer, or a newer drag',()=>{
 const h=setup();
 h.down();h.emitWindow('pointerup',{pointerId:11});h.call('onPointerUp',h.event({buttons:0}));vi.runAllTimers();
 expect(h.finish).toHaveBeenCalledOnce();expect(h.interrupt).not.toHaveBeenCalled();expect(h.dispatched).toHaveLength(0);
 h.down();h.emitWindow('pointerup',{pointerId:12});vi.runAllTimers();expect(h.interrupt,'another pointer').not.toHaveBeenCalled();
 h.call('onPointerUp',h.event({buttons:0}));
 h.down();h.emitWindow('pointerup',{pointerId:11});h.call('onPointerUp',h.event({buttons:0}));h.down();vi.runAllTimers();
 expect(h.interrupt,'a newer drag with the same pointer id is not ended by the old release').not.toHaveBeenCalled();
});
