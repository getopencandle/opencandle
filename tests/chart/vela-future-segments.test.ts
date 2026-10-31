import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
// Actual canonical native class, transformed by the maintained source recipe.
// No extracted mapper, copied SDK, replacement coordinate class or price proof.
const ms=Date.parse,tail=ms('2023-03-31T19:30:00Z'),next=ms('2023-04-03T13:30:00Z');
function own(){const native=new NativeRenderer(),coords=(native as any).coords;coords.setBars([tail-3600000,tail]);return{native,coords,frame:()=>native.lvCaptureTimeFrame(2,tail),install:(times=new Float64Array([next]),offsets=new Float64Array([1]))=>native.lvSetFutureTimeSegments(native.lvCaptureTimeFrame(2,tail),times,offsets)};}
it('actual native time and logical mappings interpolate a weekend month edge in both directions',()=>{
 const h=own(),lease=h.install();try{const boundary=ms('2023-04-01T04:00:00Z');expect(h.coords.timeToLogical(boundary)).toBeCloseTo(1+17/132,14);expect(h.coords.logicalToTime(1+17/132)).toBe(boundary);expect(lease.qualifiedThrough).toBe(next);expect(h.coords.barCount).toBe(2);}finally{lease.dispose();}
});
it('multiple logical hourly slots fit between two sparse anchors without changing loaded coordinates',()=>{
 const h=own(),lease=h.install(new Float64Array([next,next+6*3600000]),new Float64Array([1,7]));try{expect(h.coords.timeToLogical(tail)).toBe(1);expect(h.coords.timeToLogical(next+2*3600000)).toBe(4);expect(h.coords.logicalToTime(4)).toBe(next+2*3600000);expect(h.coords.timeToLogical(next+7*3600000)).toBe(9);}finally{lease.dispose();}
});
it('native copies both inputs once; malformed pair replacement leaves A intact',()=>{
 const h=own(),times=new Float64Array([next]),offsets=new Float64Array([1]),a=h.install(times,offsets);try{times[0]++;offsets[0]=2;expect(h.coords.timeToLogical(next)).toBe(2);for(const pair of [[new Float64Array(0),new Float64Array(0)],[new Float64Array([next]),new Float64Array([0])],[new Float64Array([next]),new Float64Array([1,2])],[new Float64Array([next,next+1]),new Float64Array([2,1])],[new Float64Array(374),new Float64Array(374)]])expect(()=>h.install(pair[0],pair[1])).toThrow();expect(a.isCurrent()).toBe(true);}finally{a.dispose();}
});
it('proxy frame/input and copied keys cannot execute traps or borrow native ownership',()=>{
 const h=own(),a=h.install();let traps=0;const proxy=new Proxy(new Float64Array([1]),{get(){traps++;throw Error('No trap');},getPrototypeOf(){traps++;throw Error('No trap');}});try{expect(()=>h.install(new Float64Array([next]),proxy)).toThrow();expect(()=>h.native.lvSetFutureTimeSegments({...h.frame()},new Float64Array([next]),new Float64Array([1]))).toThrow();expect(traps).toBe(0);expect(a.isCurrent()).toBe(true);}finally{a.dispose();}
});
it('same-grid replacement retires A and old dispose cannot clear B or its offset copy',()=>{
 const h=own(),a=h.install(),frame=h.frame();h.coords.setBars([tail-3600000,tail]);expect(a.isCurrent()).toBe(false);expect(()=>h.native.lvSetFutureTimeSegments(frame,new Float64Array([next]),new Float64Array([1]))).toThrow();const b=h.install();try{a.dispose();expect(b.isCurrent()).toBe(true);expect(h.coords.timeToLogical(next)).toBe(2);}finally{b.dispose();}
});
it('switching between old daily labels and new offset mode keeps exact token retirement',()=>{
 const h=own(),a=h.install(new Float64Array([next]),new Float64Array([7])),b=h.native.lvSetFutureTimeSpine(h.frame(),new Float64Array([next]));try{expect(a.isCurrent()).toBe(false);a.dispose();expect(b.isCurrent()).toBe(true);expect(h.coords.timeToLogical(next)).toBe(2);}finally{b.dispose();}
});
it('scheduler reentry preserves B and rejects late outer A before copying or swapping',()=>{
 const h=own();let first=true,b:ReturnType<typeof h.install>|null=null;(h.native as any).scheduler={invalidate(){if(first){first=false;b=h.install(new Float64Array([next]),new Float64Array([7]));}}};try{expect(()=>h.install()).toThrow(/changed/);expect(b!.isCurrent()).toBe(true);expect(h.coords.timeToLogical(next)).toBe(8);}finally{(h.native as any).scheduler=null;(b as ReturnType<typeof h.install>|null)?.dispose();}
});
