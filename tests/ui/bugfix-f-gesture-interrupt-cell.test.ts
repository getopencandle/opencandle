import {beforeEach,expect,it,vi,type Mock} from 'vitest';
import {all,dispatchDocument,focusDocument,invoke,ModelNode,mountControlledComponent,type ModelElement} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

// BE-3 (GridCell finished a frame gesture only on pointerup
// (button 0, non-chrome target) and pointercancel. A drag interrupted without pointercancel (window blur, the window
// hidden, pointer capture lost without an up) left the gesture open, so the gesture-gated autosave kept deferring until
// the next chart interaction. The cell now reports such an interruption as the end of ITS open pointer gesture (owner:
// this cell, this pointer); the grid checks that it still owns the open gesture (tests/ui/bugfix-f-gesture-interrupt-
// grid.test.ts). Actual private GridCell callbacks, refs and effects from the real MultiChartGrid tree under the shared
// controlled hook/node model; native ports are controlled. Not DOM dispatch, native pointer capture or executable UI.
const viewport=vi.hoisted(()=>({ports:[] as Array<{begin:Mock;finish:Mock;changed:Mock;command:Mock;stop:Mock}>}));
vi.mock('../../src/chart/viewport-state',async()=>{
 const actual=await vi.importActual<typeof import('../../src/chart/viewport-state')>('../../src/chart/viewport-state');
 return{...actual,createViewportCapture:()=>{const port={begin:vi.fn(),finish:vi.fn(),changed:vi.fn(),command:vi.fn(),stop:vi.fn()};viewport.ports.push(port);return port;}};
});
beforeEach(()=>{viewport.ports=[];});

function setup(){
 const gme=fixtureDataset('GME',3),datasets=[gme];
 const state=createMultiChartState(gme,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 parent.dispose();
 const listeners=new Map<string,Set<()=>void>>();
 vi.stubGlobal('window',{addEventListener:vi.fn((type:string,listener:()=>void)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(listener);}),removeEventListener:vi.fn((type:string,listener:()=>void)=>{listeners.get(type)?.delete(listener);})});
 const deferred:Array<()=>void>=[];vi.stubGlobal('queueMicrotask',(callback:()=>void)=>deferred.push(callback));
 const begin=vi.fn(()=>true),finish=vi.fn(),interrupt=vi.fn(),flush=vi.fn();
 let mode:string|null=null;const accepted={bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'};
 const native={
  getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>state.cells[id].chartOptions,applyChartOptions:()=>{},saveDrawings:()=>state.cells[id].drawings,loadDrawings:()=>{},
  indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},
  onDrawingsChanged:()=>()=>{},getViewport:()=>null,onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},
  isInputCurrent:(input:typeof accepted)=>input.bars===accepted.bars&&input.style===accepted.style,
  drawings:{getMode:()=>mode},isDrawingChromeTarget:()=>false,
  beginDrawingEraseGesture:vi.fn(()=>({assertCurrent:vi.fn(),cancel:vi.fn(),finish:vi.fn()})),
 };
 const props:Record<string,any>={...cell.props,onCapture:vi.fn(()=>true),onReady:()=>{},onStatus:()=>{},onNonGesture:flush,onBeginGesture:begin,onFinishGesture:finish,onInterruptGesture:interrupt,port:{mount:()=>()=>{}}};
 const component=cell.type as (input:typeof props)=>unknown;
 const ui=mountControlledComponent(()=>component(props));
 const canvas=new ModelNode();canvas.tag='canvas';canvas.matches=selector=>selector==='.chart-canvas';
 let root:ModelElement,node:ModelNode;
 const bind=(tree:unknown)=>{root=tree as ModelElement;node=ui.nodeFor(root);canvas.parent=node;canvas.isConnected=true;node.children.push(canvas);return root;};
 const render=()=>bind(ui.render()),settle=()=>bind(ui.settle());
 settle();
 const panel=all(render(),value=>value.type===ChartPanel)[0];
 (panel.props.onReady as (chart:typeof native,input:typeof accepted,execution:string)=>void)(native,accepted,'ordinary');settle();
 const event=(extra:Record<string,unknown>={})=>({pointerId:11,pointerType:'mouse',isPrimary:true,button:0,buttons:1,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,target:canvas,currentTarget:node,nativeEvent:{eventPhase:3,currentTarget:node},preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});
 const call=(name:string,value:ReturnType<typeof event>)=>{invoke(root.props[name],value);};
 const drain=()=>{for(const work of deferred.splice(0))work();};
 const down=(extra:Record<string,unknown>={})=>{const value=event(extra);call('onPointerDownCapture',value);drain();return value;};
 const hide=()=>{Object.defineProperty(focusDocument,'visibilityState',{value:'hidden',configurable:true});dispatchDocument('visibilitychange',{},false);};
 const emitWindow=(type:string)=>{for(const listener of [...listeners.get(type)??[]])listener();};
 const capture=()=>viewport.ports.at(-1)!;
 return{begin,finish,interrupt,native,event,call,down,hide,emitWindow,capture,mode(value:string|null){mode=value;},get node(){return node;}};
}

it.each(['blur','hidden','lostCapture'] as const)('BE-3: %s during an open frame drag ends that gesture (viewport committed, grid told once)',reason=>{
 const h=setup(),down=h.down();
 expect(h.begin).toHaveBeenCalledOnce();expect(down.preventDefault).not.toHaveBeenCalled();expect(h.capture().begin).toHaveBeenCalledOnce();
 if(reason==='blur')h.emitWindow('blur');else if(reason==='hidden')h.hide();else h.call('onLostPointerCapture',h.event({buttons:1}));
 // Probe: nothing used to end the frame gesture here; gestureActive() stayed true and the autosave kept deferring.
 expect(h.interrupt).toHaveBeenCalledOnce();expect(h.capture().finish).toHaveBeenCalledOnce();
 expect(h.finish,'the release path is not faked').not.toHaveBeenCalled();
 // Ended once: a repeated interruption of the same (already ended) gesture is not reported again.
 h.emitWindow('blur');h.call('onLostPointerCapture',h.event());expect(h.interrupt).toHaveBeenCalledOnce();
});

it('BE-3: owner checks: another pointer, another element, or no open drag never ends a gesture',()=>{
 const h=setup();
 h.emitWindow('blur');h.hide();expect(h.interrupt).not.toHaveBeenCalled();// nothing open
 h.down({pointerId:11});
 h.call('onLostPointerCapture',h.event({pointerId:12}));expect(h.interrupt,'a different pointer').not.toHaveBeenCalled();
 h.call('onLostPointerCapture',h.event({currentTarget:new ModelNode()}));expect(h.interrupt,'not this cell').not.toHaveBeenCalled();
 h.call('onLostPointerCapture',h.event({pointerId:11}));expect(h.interrupt).toHaveBeenCalledOnce();
});

it('BE-3: a normal release or cancel ends the gesture as before; the implicit lostpointercapture after it is not a second end',()=>{
 const h=setup();
 h.down();h.call('onPointerUp',h.event({buttons:0}));expect(h.finish).toHaveBeenCalledOnce();
 h.call('onLostPointerCapture',h.event());h.emitWindow('blur');expect(h.interrupt).not.toHaveBeenCalled();
 h.down();h.call('onPointerCancel',h.event({buttons:0}));expect(h.finish).toHaveBeenCalledTimes(2);
 h.call('onLostPointerCapture',h.event());h.hide();expect(h.interrupt).not.toHaveBeenCalled();
});

it('BE-3: a refused begin is still closed by an interruption (the grid clears its blocked marker), like its release would',()=>{
 const h=setup();h.begin.mockReturnValueOnce(false);
 const down=h.down();expect(down.preventDefault).toHaveBeenCalledOnce();expect(h.capture().begin).not.toHaveBeenCalled();
 h.emitWindow('blur');expect(h.interrupt).toHaveBeenCalledOnce();
});

it('BE-3: an eraser drag keeps its own blur cancellation and reports no frame gesture end',()=>{
 const h=setup();h.mode('eraser');h.down();
 expect(h.native.beginDrawingEraseGesture).toHaveBeenCalledOnce();expect(h.begin).not.toHaveBeenCalled();
 h.emitWindow('blur');expect(h.interrupt).not.toHaveBeenCalled();expect(h.finish).not.toHaveBeenCalled();
});

// Item 7b: vela's input controller keeps panning while its own
// `dragging` flag is set and ignores e.buttons; it ends a drag only on pointerup or pointercancel. An interruption that
// closed OUR frame gesture (blur, hidden window, lost capture) left vela dragging, so the chart kept moving after the
// saved frame was closed. The cell now dispatches one pointercancel for that pointer on the element that received the
// pointerdown (vela's canvas), and ignores that synthetic cancel itself.
class SyntheticPointerEvent{type:string;pointerId:number;pointerType:string;bubbles:boolean;constructor(type:string,init:{pointerId:number;pointerType:string;bubbles?:boolean}){this.type=type;this.pointerId=init.pointerId;this.pointerType=init.pointerType;this.bubbles=!!init.bubbles;}}
it.each(['blur','hidden','lostCapture'] as const)('BF-G7b: %s mid-drag cancels the native drag once, on the pointerdown target',reason=>{
 vi.stubGlobal('PointerEvent',SyntheticPointerEvent);
 const h=setup(),dispatched:SyntheticPointerEvent[]=[];
 const target={dispatchEvent:vi.fn((event:SyntheticPointerEvent)=>{dispatched.push(event);return true;})};
 h.down({target,pointerId:21,pointerType:'pen'});
 if(reason==='blur')h.emitWindow('blur');else if(reason==='hidden')h.hide();else h.call('onLostPointerCapture',h.event({pointerId:21,target}));
 expect(h.interrupt).toHaveBeenCalledOnce();
 expect(dispatched).toHaveLength(1);
 expect(dispatched[0]).toMatchObject({type:'pointercancel',pointerId:21,pointerType:'pen',bubbles:true});
 // The synthetic cancel reaching our own handlers is not a second (release) end of the gesture.
 h.call('onPointerCancelCapture',h.event({pointerId:21,target,nativeEvent:dispatched[0]}));
 h.call('onPointerCancel',h.event({pointerId:21,target,nativeEvent:dispatched[0]}));
 expect(h.finish).not.toHaveBeenCalled();
 // Idempotent: the gesture is already ended, so a second interruption dispatches nothing.
 h.emitWindow('blur');h.hide();expect(dispatched).toHaveLength(1);
 vi.unstubAllGlobals();
});
it('BF-G7b: a normal release dispatches no synthetic cancel, and a later blur stays silent',()=>{
 vi.stubGlobal('PointerEvent',SyntheticPointerEvent);
 const h=setup(),target={dispatchEvent:vi.fn()};
 h.down({target});h.call('onPointerUp',h.event({buttons:0,target}));h.emitWindow('blur');
 expect(target.dispatchEvent).not.toHaveBeenCalled();expect(h.finish).toHaveBeenCalledOnce();
 vi.unstubAllGlobals();
});

// React registers its root wheel listeners as passive, so preventDefault in
// onWheelCapture only logged "Unable to preventDefault inside passive event listener" (11 warnings in the flow). The
// refusal itself is stopPropagation (the wheel never reaches vela's canvas); that is kept, the no-op preventDefault is gone.
it('FREEZE-A: a refused wheel stops at the cell without a passive-listener preventDefault; an accepted wheel is untouched',()=>{
 const h=setup();h.begin.mockReturnValueOnce(false);
 const refused=h.event({deltaY:120});h.call('onWheelCapture',refused);
 expect(refused.stopPropagation).toHaveBeenCalledOnce();expect(refused.preventDefault).not.toHaveBeenCalled();
 const accepted=h.event({deltaY:120});h.call('onWheelCapture',accepted);
 expect(accepted.stopPropagation).not.toHaveBeenCalled();expect(accepted.preventDefault).not.toHaveBeenCalled();expect(h.finish).toHaveBeenCalledOnce();
});
