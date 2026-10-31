import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {commandCanvas} from './chart-paint-harness';
// These exercise the ACTUAL NativeRenderer transformed by the same original
// Vite extension as production. No class-body extraction or replacement mapper.
// Unmounted constructor has no DOM subscriptions; scheduling boundaries below
// are explicitly synthetic. Coordinates confer no numerical/source permission.
const ms=Date.parse;
const initial=['2017-03-28T04:00:00Z','2017-03-29T04:00:00Z','2017-03-30T04:00:00Z','2017-03-31T04:00:00Z'].map(ms);
function own(){const native=new NativeRenderer(),coords=(native as any).coords;coords.setBars(initial);coords.setSize(800,200,1);const capture=()=>native.lvCaptureTimeFrame(4,initial[3]);return{native,coords,capture,install:(labels:Float64Array=new Float64Array([ms('2017-04-03T04:00:00Z')]))=>native.lvSetFutureTimeSpine(capture(),labels)};}
it('the real transformed native mapper places April1 at tail+1/3 in both directions',()=>{
 const h=own(),lease=h.install();try{expect(h.coords.barCount).toBe(4);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBeCloseTo(3+1/3,14);expect(h.coords.logicalToTime(3+1/3)).toBe(ms('2017-04-01T04:00:00Z'));expect(lease.qualifiedThrough).toBe(ms('2017-04-03T04:00:00Z'));expect(lease.isCurrent()).toBe(true);}finally{lease.dispose();}
});
it('loaded coordinates stay original and absent/disposed mapping uses original median extrapolation',()=>{
 const h=own(),before=initial.map((time:number)=>h.coords.timeToLogical(time));expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBe(4);const lease=h.install();
 expect(initial.map((time:number)=>h.coords.timeToLogical(time))).toEqual(before);lease.dispose();expect(lease.isCurrent()).toBe(false);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBe(4);
});
it('an actual append clears the virtual grid and preserves the same loaded April1 geometry',()=>{
 const h=own(),lease=h.install(),before=h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'));h.coords.appendBar(ms('2017-04-03T04:00:00Z'));
 expect(lease.isCurrent()).toBe(false);expect(h.coords.barCount).toBe(5);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBe(before);lease.dispose();
});
it('even identical setBars invalidates A and late A disposal cannot clear replacement B',()=>{
 const h=own(),a=h.install();h.coords.setBars([...initial]);expect(a.isCurrent()).toBe(false);const b=h.install();try{a.dispose();expect(b.isCurrent()).toBe(true);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBeCloseTo(3+1/3,14);}finally{b.dispose();}
});
it('input copying observes a snapshot and malformed replacements preserve the valid installation',()=>{
 const h=own(),input=new Float64Array([ms('2017-04-03T04:00:00Z')]),a=h.install(input);try{
  input[0]=ms('2017-04-04T04:00:00Z');expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBeCloseTo(3+1/3,14);
  for(const value of [new Float64Array(0),new Float64Array([NaN]),new Float64Array([initial[3]]),new Float64Array([initial[3]+1,initial[3]+1]),new Float64Array(63)])expect(()=>h.install(value)).toThrow();
  expect(a.isCurrent()).toBe(true);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBeCloseTo(3+1/3,14);
 }finally{a.dispose();}
});
it('proxy and wrong-brand inputs reject without source property traps',()=>{
 const h=own(),a=h.install();let traps=0;const input=new Proxy(new Float64Array([initial[3]+1]),{get(){traps++;throw Error('No input get');},getPrototypeOf(){traps++;throw Error('No prototype trap');},ownKeys(){traps++;throw Error('No keys trap');}});
 try{for(const value of [input,new DataView(new ArrayBuffer(8)),new Uint8Array(8),[initial[3]+1]])expect(()=>h.install(value as unknown as Float64Array)).toThrow();expect(traps).toBe(0);expect(a.isCurrent()).toBe(true);}finally{a.dispose();}
});
it('shared resizable and detached backing cannot enter the owned native mapping',()=>{
 const h=own(),a=h.install(),shared=new Float64Array(new SharedArrayBuffer(8)),resizable=Reflect.construct(ArrayBuffer,[8,{maxByteLength:16}]) as ArrayBuffer,detached=new Float64Array(1);shared[0]=initial[3]+1;
 structuredClone(detached.buffer,{transfer:[detached.buffer]});
 try{for(const value of [shared,new Float64Array(resizable),detached])expect(()=>h.install(value)).toThrow();expect(a.isCurrent()).toBe(true);}finally{a.dispose();}
});
it('native scheduling failure leaves previous valid mapping owned and unchanged',()=>{
 const h=own(),a=h.install(),fault=Error('SYNTHETIC native scheduling failure');(h.native as any).scheduler={invalidate(){throw fault;}};
 try{expect(()=>h.install()).toThrow(fault);expect(a.isCurrent()).toBe(true);}finally{(h.native as any).scheduler=null;a.dispose();}
});
it('nested B scheduling publication cannot be overwritten by the outer A call',()=>{
 const h=own(),old=h.install(),nested={lease:null as ReturnType<typeof h.install>|null};let armed=true;(h.native as any).scheduler={invalidate(){if(armed){armed=false;nested.lease=h.install();}}};
 try{expect(()=>h.install()).toThrow(/changed/);expect(nested.lease).not.toBeNull();expect(nested.lease!.isCurrent()).toBe(true);old.dispose();expect(nested.lease!.isCurrent()).toBe(true);}finally{(h.native as any).scheduler=null;nested.lease?.dispose();old.dispose();}
});
it('continuation is continuous and monotone but receipt qualification ends at the last certified label',()=>{
 const h=own(),a=h.install();try{const end=ms('2017-04-03T04:00:00Z');expect(h.coords.logicalToTime(4)).toBe(end);expect(h.coords.logicalToTime(5)).toBe(ms('2017-04-04T04:00:00Z'));expect(h.coords.timeToLogical(ms('2017-04-04T04:00:00Z'))).toBe(5);expect(a.qualifiedThrough).toBe(end);}finally{a.dispose();}
});
it('a foreign receiver cannot execute caller accessors or borrow native membership',()=>{
 const method=function(this:NativeRenderer,count:number,tail:number,labels:Float64Array){const frame=NativeRenderer.prototype.lvCaptureTimeFrame.call(this,count,tail);return NativeRenderer.prototype.lvSetFutureTimeSpine.call(this,frame,labels);};let reads=0;const fake=new Proxy({},{get(){reads++;throw Error('No receiver getter');}});
 expect(()=>method.call(fake as NativeRenderer,4,initial[3],new Float64Array([initial[3]+1]))).toThrow(/unavailable/);expect(reads).toBe(0);
});
it('the original native box painter consumes the shared future mapper with literal width20/3 in both price directions',()=>{
 const h=own(),lease=h.install(),native=h.native as any,coords=h.coords;coords.setViewport({barSpacing:20,rightOffset:2});
 const box={id:'lv-synthetic-future-calendar',paneId:'price',overlay:true,xloc:'bar_time',left:initial[3],right:ms('2017-04-01T04:00:00Z'),top:200,bottom:100,extend:'none',bgColor:'#123456',borderColor:'#345678',borderWidth:1,borderStyle:'solid',text:'SYNTHETIC',textColor:'#ffffff',textSize:'small',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false};
 try{for(const invert of [false,true]){const recording=commandCanvas(),painter=native.indicatorSlices.drawScene,scale={min:0,max:300,log:false,invert},bounds={top:0,height:200};
  painter.setDeps({timeToLogical:(time:number)=>coords.timeToLogical(time),barAt:()=>null,theme:native.theme});painter.setSet({boxes:[box],lines:[],labels:[],polylines:[],linefills:[]});
  painter.drawBoxes(recording.ctx,800,200,(logical:number)=>coords.logicalToX(logical),(price:number)=>coords.priceToY(price,scale,bounds));
  const rect=recording.commands.find(command=>command.op==='strokeRect')!;expect(rect).toBeDefined();expect(rect.values[0]).toBe(760);expect(Number(rect.values[2])).toBeCloseTo(20/3,10);expect(Number(rect.values[3])).toBeCloseTo(200/3,10);
 }}finally{lease.dispose();}
});
it('future descriptive time mapping never changes the native loaded-only crosshair callback gate',()=>{
 const h=own(),native=h.native as any,lease=h.install(),events:any[]=[];native.scheduler={invalidate(){}};h.coords.setViewport({barSpacing:20,rightOffset:2});const off=h.native.onCrosshairMove(event=>events.push(event));
 try{const futureX=h.coords.logicalToX(4);native.handlePointerMove(futureX,50);expect(events).toHaveLength(1);expect(events[0].time).toBeNull();expect(events[0].ohlc).toBeNull();expect([...events[0].values]).toEqual([]);expect(h.coords.logicalToTime(4)).toBe(ms('2017-04-03T04:00:00Z'));}finally{off();native.scheduler=null;lease.dispose();}
});
it('an actually captured old frame cannot reinstall after an identical coordinate-grid replacement',()=>{
 const h=own(),frame=h.capture(),labels=new Float64Array([ms('2017-04-03T04:00:00Z')]),a=h.native.lvSetFutureTimeSpine(frame,labels);
 h.coords.setBars([...initial]);expect(a.isCurrent()).toBe(false);expect(()=>h.native.lvSetFutureTimeSpine(frame,labels)).toThrow(/retired|changed/);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBe(4);
 const b=h.install();try{a.dispose();expect(b.isCurrent()).toBe(true);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBeCloseTo(3+1/3,14);}finally{b.dispose();}
});
it('foreign real frames and proxy/copied empty keys cannot borrow another actual renderer epoch',()=>{
 const h=own(),other=own(),frame=other.capture(),labels=new Float64Array([ms('2017-04-03T04:00:00Z')]),a=h.install();let traps=0;const proxy=new Proxy(frame,{get(){traps++;throw Error('No frame getter');},getPrototypeOf(){traps++;throw Error('No frame prototype');},ownKeys(){traps++;throw Error('No frame keys');}});
 try{expect(Reflect.ownKeys(frame)).toEqual([]);for(const value of [frame,proxy,{...frame},Object.freeze({})])expect(()=>h.native.lvSetFutureTimeSpine(value,labels)).toThrow(/foreign|retired|changed/);expect(traps).toBe(0);expect(a.isCurrent()).toBe(true);}finally{a.dispose();}
});
it('legacy setBars slice reentry cannot capture or install a frame during the actual write',()=>{
 const h=own(),frame=h.capture(),a=h.install(),labels=new Float64Array([ms('2017-04-03T04:00:00Z')]),input=[...initial];let captureFailed=false,installFailed=false,calls=0;
 Object.defineProperty(input,'slice',{value(){calls++;try{h.capture();}catch{captureFailed=true;}try{h.native.lvSetFutureTimeSpine(frame,labels);}catch{installFailed=true;}expect(a.isCurrent()).toBe(false);return [...initial];}});
 h.coords.setBars(input);expect(calls).toBe(1);expect(captureFailed).toBe(true);expect(installFailed).toBe(true);expect(a.isCurrent()).toBe(false);expect(h.coords.barCount).toBe(4);expect(h.coords.timeToLogical(ms('2017-04-01T04:00:00Z'))).toBe(4);
 const b=h.install();try{expect(b.isCurrent()).toBe(true);a.dispose();expect(b.isCurrent()).toBe(true);}finally{b.dispose();}
});
it('actual destroy retires captured owned coordinates even when the mutable legacy coords alias points at B',()=>{
 const h=own(),other=own(),a=h.install(),b=other.install(),native=h.native as any;
 // Only the unmounted GPU backend is a controlled sink. All original native
 // destroy/scene/coordinate/handle logic runs; B is another real constructor.
 native.backend={destroy(){}};native.coords=other.coords;
 try{expect(()=>h.capture()).toThrow(/owner changed/);expect(()=>h.native.destroy()).not.toThrow();expect(a.isCurrent()).toBe(false);expect(b.isCurrent()).toBe(true);a.dispose();expect(b.isCurrent()).toBe(true);expect(()=>h.capture()).toThrow(/unavailable/);}finally{b.dispose();}
});
it('capture returns one canonical opaque key until an actual time-grid reset rather than viewport or size change',()=>{
 const h=own(),a=h.capture();expect(h.capture()).toBe(a);h.coords.setSize(640,180,1);h.coords.setViewport({barSpacing:30,rightOffset:1});expect(h.capture()).toBe(a);
 h.coords.setBars([...initial]);const b=h.capture();expect(b).not.toBe(a);expect(h.capture()).toBe(b);expect(Reflect.ownKeys(a)).toEqual([]);expect(Reflect.ownKeys(b)).toEqual([]);
});
it('alias eligibility loss does not pretend a retained copy detached and disposal proves release even if repaint throws',()=>{
 const h=own(),other=own(),a=h.install(),native=h.native as any,fault=Error('SYNTHETIC repaint after detachment');native.coords=other.coords;native.scheduler={invalidate(){throw fault;}};
 try{expect(a.isCurrent()).toBe(false);expect(a.isDetached()).toBe(false);expect(()=>a.dispose()).toThrow(fault);expect(a.isDetached()).toBe(true);expect(a.isCurrent()).toBe(false);}finally{native.scheduler=null;native.coords=h.coords;a.dispose();}
});
