import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent} from '../helpers/alert-dialog-harness';
import {PaneIndicatorLayer} from '../../src/ui/PaneIndicatorLayer';

// Controlled effect/DOM notification model around the actual positioning layer.
// The original native geometry reader and layout math perform every projection.
// This is not a browser MutationObserver, native SDK or painted-pixel assertion.
let frames:Map<number,FrameRequestCallback>,sequence:number,observers:OwnedObserver[],failure:'none'|'constructor'|'observe';
const mounted:Array<{dispose():void}>=[];
class OwnedObserver{
 readonly observe=vi.fn((_target:Node,options:MutationObserverInit)=>{this.options=options;if(failure==='observe')throw Error('Synthetic observer acquisition failed');});
 readonly disconnect=vi.fn();options:MutationObserverInit={};
 constructor(readonly callback:MutationCallback){if(failure==='constructor')throw Error('Synthetic observer constructor failed');observers.push(this);}
 // Model browser delivery only for the actual recorded observation options.
 emit(type:'childList'|'attributes'|'characterData',attributeName:string|null=null){if(type==='childList'&&!this.options.childList||type==='characterData'&&!this.options.characterData||type==='attributes'&&(!this.options.attributes||this.options.attributeFilter&&!this.options.attributeFilter.includes(attributeName??'')))return;this.callback([{type,attributeName}] as MutationRecord[],this as unknown as MutationObserver);}
 retained(){this.callback([{type:'childList'}] as MutationRecord[],this as unknown as MutationObserver);}
}
beforeEach(()=>{frames=new Map();sequence=0;observers=[];failure='none';vi.stubGlobal('MutationObserver',OwnedObserver);vi.stubGlobal('ResizeObserver',undefined);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{for(const ui of mounted.splice(0).reverse())ui.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});
function flush(){const batch=[...frames.values()];frames.clear();for(const callback of batch)callback(0);}
function style(){const values=new Map<string,string>();return{getPropertyValue:(name:string)=>values.get(name)??'',setProperty:vi.fn((name:string,value:string)=>values.set(name,value)),removeProperty:vi.fn((name:string)=>values.delete(name))};}
function setup(){
 const box=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height}),row=(paneId:string)=>({dataset:{legendPane:paneId},style:style(),getBoundingClientRect:()=>box(236,172,418,40)}),price=row('price'),lines={style:style()},heading={getBoundingClientRect:()=>box(256,144,400,24)},attributes=new Map<string,string>();let rows=[price];
 const workspace={style:style(),getBoundingClientRect:()=>box(0,0,960,640),querySelector:(selector:string)=>selector===':scope>.chart-heading'?heading:null,getAttribute:(name:string)=>attributes.get(name)??null,setAttribute:(name:string,value:string)=>attributes.set(name,value),removeAttribute:(name:string)=>attributes.delete(name)};
 const element={parentElement:workspace,getBoundingClientRect:()=>box(20,40,900,580),querySelectorAll:(selector:string)=>selector===':scope>.lv-legend-pane'?rows:[],querySelector:(selector:string)=>selector===':scope>.lv-pane-legend-separators'?lines:selector==='.lv-legend-price-scroll'?price:null};
 const plot={getBoundingClientRect:()=>box(220,140,500,450),addEventListener:vi.fn(),removeEventListener:vi.fn()},renderer={plot,input:{el:{getBoundingClientRect:()=>box(250,140,430,420)}},coords:{width:430,height:420},scene:{orderedPanes:vi.fn(()=>[{id:'price',bounds:{top:0,height:280}},{id:'study',bounds:{top:280,height:140}}])}},viewport=new Set<()=>void>(),indicators=new Set<()=>void>();
 const chart:any={nativeRenderer:vi.fn(()=>renderer),onViewportChanged:(fn:()=>void)=>{viewport.add(fn);return()=>viewport.delete(fn);},indicators:{subscribe:(fn:()=>void)=>{indicators.add(fn);return()=>indicators.delete(fn);}}};
 let current=true;const props={chart,ownerKey:'SYNTHETIC A',host:{current:element as unknown as HTMLDivElement},isCurrent:()=>current,onPriceBottom:vi.fn()};
 const ui=mountControlledComponent(()=>PaneIndicatorLayer(props));mounted.push(ui);
 // The layer intentionally has a no-dependency layout effect. Commit one effect
 // batch like React instead of asking the generic state-settler for no effects.
 const commit=()=>{ui.render();for(const effect of ui.owner.pending.splice(0))effect();};
 return{ui,props,commit,chart,renderer,viewport,indicators,workspace,element,price,addStudy(){const study=row('study');rows=[...rows,study];return study;},setCurrent(value:boolean){current=value;}};
}
it('child-only row commits acquire the existing actual native pane geometry without a parent render',()=>{
 const h=setup();h.commit();flush();const observer=observers[0],study=h.addStudy(),before=h.chart.nativeRenderer.mock.calls.length;expect(study.style.getPropertyValue('top')).toBe('');observer.emit('childList');expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);expect(frames.size).toBe(1);flush();expect(study.style.getPropertyValue('top')).toBe('386px');expect(study.style.getPropertyValue('left')).toBe('236px');expect(study.style.getPropertyValue('max-height')).toBe('128px');expect(h.renderer.scene.orderedPanes).toHaveBeenCalled();study.dataset.legendPane='price';observer.emit('attributes','data-legend-pane');flush();expect(study.style.getPropertyValue('top')).toBe('132px');
});
it('structural notifications coalesce and the actual observer options exclude style and scalar text loops',()=>{
 const h=setup();h.commit();flush();const observer=observers[0],before=h.chart.nativeRenderer.mock.calls.length;expect(observer.observe).toHaveBeenCalledExactlyOnceWith(h.element,{childList:true,subtree:true,attributes:true,attributeFilter:['data-legend-pane']});for(let index=0;index<1000;index++)observer.emit('childList');expect(frames.size).toBe(1);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);flush();expect(frames.size).toBe(0);observer.emit('attributes','style');observer.emit('characterData');expect(frames.size).toBe(0);
});
it('replacement owners disconnect their observer and retained callbacks cannot read or overwrite the new owner',()=>{
 const h=setup();h.commit();flush();const stale=observers[0];h.props.ownerKey='SYNTHETIC B';h.commit();flush();const next=observers[1],before=h.chart.nativeRenderer.mock.calls.length;expect(stale.disconnect).toHaveBeenCalledOnce();stale.retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);h.props.ownerKey='SYNTHETIC A';h.commit();flush();stale.retained();next.retained();expect(frames.size).toBe(0);expect(stale.disconnect).toHaveBeenCalledOnce();expect(next.disconnect).toHaveBeenCalledOnce();
});
it('a retired source or replaced host refuses retained notifications before native reads',()=>{
 const h=setup();h.commit();flush();const observer=observers[0],before=h.chart.nativeRenderer.mock.calls.length;h.setCurrent(false);observer.retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);h.setCurrent(true);h.props.host.current={}as HTMLDivElement;observer.retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);
});
it('unmount cancels the owned frame, disconnects subscriptions and observer, and restores only its styles',()=>{
 const h=setup();h.commit();flush();const observer=observers[0];expect(h.price.style.getPropertyValue('top')).toBe('132px');h.price.style.setProperty('left','SYNTHETIC foreign owner');observer.emit('childList');expect(frames.size).toBe(1);h.ui.dispose();expect(frames.size).toBe(0);expect(observer.disconnect).toHaveBeenCalledOnce();expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);expect(h.price.style.getPropertyValue('top')).toBe('');expect(h.price.style.getPropertyValue('left')).toBe('SYNTHETIC foreign owner');const before=h.chart.nativeRenderer.mock.calls.length;observer.retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);
});
it('normal non-DOM consumers keep existing scheduling when MutationObserver is unavailable',()=>{
 vi.stubGlobal('MutationObserver',undefined);const h=setup();expect(()=>h.commit()).not.toThrow();flush();expect(observers).toHaveLength(0);expect(h.price.style.getPropertyValue('top')).toBe('132px');expect(h.viewport.size).toBe(1);h.ui.dispose();expect(h.viewport.size).toBe(0);
});
it('observer constructor failure retires acquisition before subscriptions or geometry work',()=>{
 failure='constructor';const h=setup();expect(()=>h.commit()).toThrow('Synthetic observer constructor failed');expect(frames.size).toBe(0);expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);expect(h.renderer.scene.orderedPanes).not.toHaveBeenCalled();expect(h.workspace.getAttribute('data-pane-legend-ready')).toBeNull();
});
it('observer observe failure disconnects the acquired observer and its retained callback stays retired',()=>{
 failure='observe';const h=setup();expect(()=>h.commit()).toThrow('Synthetic observer acquisition failed');const observer=observers[0],before=h.chart.nativeRenderer.mock.calls.length;expect(observer.disconnect).toHaveBeenCalledOnce();expect(frames.size).toBe(0);expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);observer.retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);expect(h.renderer.scene.orderedPanes).not.toHaveBeenCalled();
});
it('a later indicator subscription failure retires queued work and releases the already-acquired viewport and observer',()=>{
 const h=setup(),cause=Error('Synthetic later subscription failed'),release=vi.fn();let retained:()=>void=()=>{};
 h.chart.onViewportChanged=vi.fn((callback:()=>void)=>{retained=callback;h.viewport.add(callback);callback();return()=>{release();h.viewport.delete(callback);};});h.chart.indicators.subscribe=vi.fn(()=>{throw cause;});
 expect(()=>h.commit()).toThrow(cause);const observer=observers[0],before=h.chart.nativeRenderer.mock.calls.length;expect(release).toHaveBeenCalledOnce();expect(observer.disconnect).toHaveBeenCalledOnce();expect(frames.size).toBe(0);expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);observer.retained();retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);expect(h.renderer.scene.orderedPanes).not.toHaveBeenCalled();
});
it('a later resize observation failure disconnects both observers and releases registered subscriptions and plot listeners',()=>{
 const cause=Error('Synthetic later resize observation failed'),disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{observe(){throw cause;}disconnect=disconnect;});const h=setup();expect(()=>h.commit()).toThrow(cause);const observer=observers[0],before=h.chart.nativeRenderer.mock.calls.length;expect(observer.disconnect).toHaveBeenCalledOnce();expect(disconnect).toHaveBeenCalledOnce();expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);expect(h.renderer.plot.removeEventListener.mock.calls.map(args=>args[0])).toEqual(['lostpointercapture','pointerup','pointermove']);expect(frames.size).toBe(0);observer.retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);expect(h.renderer.scene.orderedPanes).not.toHaveBeenCalled();
});
it('a later window registration failure releases earlier window and plot listeners without leaving a live mutation observer',()=>{
 const cause=Error('Synthetic later window registration failed'),remove=vi.fn();vi.stubGlobal('window',{addEventListener:vi.fn((name:string)=>{if(name==='scroll')throw cause;}),removeEventListener:remove});const h=setup();expect(()=>h.commit()).toThrow(cause);expect(observers[0].disconnect).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledExactlyOnceWith('resize',expect.any(Function));expect(h.renderer.plot.removeEventListener).toHaveBeenCalledTimes(3);expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);expect(frames.size).toBe(0);const before=h.chart.nativeRenderer.mock.calls.length;observers[0].retained();expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);expect(frames.size).toBe(0);
});
it('a final frame scheduling failure rolls back every acquired listener, subscription and observer',()=>{
 const cause=Error('Synthetic initial frame request failed');vi.stubGlobal('requestAnimationFrame',vi.fn(()=>{throw cause;}));const h=setup();expect(()=>h.commit()).toThrow(cause);expect(observers[0].disconnect).toHaveBeenCalledOnce();expect(h.viewport.size).toBe(0);expect(h.indicators.size).toBe(0);expect(h.renderer.plot.removeEventListener).toHaveBeenCalledTimes(3);expect(window.removeEventListener).toHaveBeenCalledTimes(2);expect(frames.size).toBe(0);const before=h.chart.nativeRenderer.mock.calls.length;observers[0].retained();expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);
});
it('setup rollback attempts every acquired release and aggregates cleanup failures while preserving the original cause',()=>{
 const h=setup(),cause=Error('Synthetic later setup failed'),cleanup=Error('Synthetic acquired release failed'),release=vi.fn(()=>{throw cleanup;});h.chart.onViewportChanged=vi.fn(()=>release);h.chart.indicators.subscribe=vi.fn(()=>{throw cause;});let caught:unknown;try{h.commit();}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual([cause,cleanup]);expect(release).toHaveBeenCalledOnce();expect(observers[0].disconnect).toHaveBeenCalledOnce();expect(frames.size).toBe(0);const before=h.chart.nativeRenderer.mock.calls.length;observers[0].retained();expect(frames.size).toBe(0);expect(h.chart.nativeRenderer).toHaveBeenCalledTimes(before);expect(h.renderer.scene.orderedPanes).not.toHaveBeenCalled();
});
it('FLOWFIX-B #3: a host that mounts while its owner is transiently not current (Undo restore) retries setup and positions the rows',()=>{
 const h=setup();h.setCurrent(false);h.commit();expect(h.price.style.getPropertyValue('top')).toBe('');expect(observers).toHaveLength(0);expect(frames.size).toBe(1);
 flush();h.commit();expect(observers).toHaveLength(0);expect(frames.size).toBe(1);// still held: keeps retrying, acquires nothing
 h.setCurrent(true);flush();h.commit();flush();expect(observers).toHaveLength(1);expect(h.price.style.getPropertyValue('top')).toBe('132px');
 h.ui.dispose();expect(frames.size).toBe(0);
});
it('PERF3: text-only row updates and unchanged pointer or viewport frames skip the forced-layout geometry reads; real changes still re-measure',()=>{
 const h=setup();h.commit();flush();const observer=observers[0],reads=vi.spyOn(h.element,'getBoundingClientRect');
 // A crosshair readout replaces only text nodes inside a legend row: no frame is requested.
 observer.callback([{type:'childList',addedNodes:[{nodeType:3}],removedNodes:[{nodeType:3}]}] as unknown as MutationRecord[],observer as unknown as MutationObserver);expect(frames.size).toBe(0);
 // A pointer move or viewport change with the same native pane geometry paints nothing and reads no layout.
 const move=h.renderer.plot.addEventListener.mock.calls.find((call:unknown[])=>call[0]==='pointermove')![1] as ()=>void;move();expect(frames.size).toBe(1);flush();
 for(const fn of h.viewport)fn();flush();expect(reads).not.toHaveBeenCalled();
 // A pane divider drag moves the native pane bounds: the same pointer path re-measures and repositions.
 const study=h.addStudy();observer.emit('childList');flush();expect(study.style.getPropertyValue('top')).toBe('386px');reads.mockClear();
 h.renderer.scene.orderedPanes.mockReturnValue([{id:'price',bounds:{top:0,height:300}},{id:'study',bounds:{top:300,height:120}}]);move();flush();
 expect(reads).toHaveBeenCalled();expect(study.style.getPropertyValue('top')).toBe('406px');
 // An element added inside a row (not just text) still counts as structure.
 observer.callback([{type:'childList',addedNodes:[{nodeType:1}],removedNodes:[]}] as unknown as MutationRecord[],observer as unknown as MutationObserver);expect(frames.size).toBe(1);
});
