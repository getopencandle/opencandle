import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {DrawingToolDefaults,ToolDefaultsFacade} from '../../src/chart/drawing-tool-defaults';

type Subject=typeof import('../../src/chart/drawing-tool-defaults');
let api:Subject|null=null;
const releases:Array<()=>void>=[];
beforeEach(async()=>{
 // Real module isolation: an old-source failed constructor cannot return an off
 // function for its leaked private listener. Never fake its cleanup or carry
 // that namespace into another test case.
 vi.resetModules();api=await import('../../src/chart/drawing-tool-defaults');
});
afterEach(()=>{
 const subject=api;api=null;const errors:unknown[]=[];
 for(const off of releases.splice(0).reverse())try{off();}catch(error){errors.push(error);}
 try{subject?.loadSharedToolDefaults(undefined);}catch(error){errors.push(error);}
 vi.resetModules();if(errors.length)throw new AggregateError(errors,'Synthetic tool-default owner cleanup failed.');
});
function saved(color:string):DrawingToolDefaults{return{schemaVersion:1,tools:{trendline:{style:{color}}}};}
function facade(){
 let values:Record<string,unknown>={},reads=0,writes=0;
 const port:ToolDefaultsFacade={toolDefaults(){reads++;return structuredClone(values);},setToolDefaults(next){writes++;values=structuredClone(next);},resetToolDefaults(type){if(type)delete values[type];else values={};}};
 return{port,reads:()=>reads,writes:()=>writes,values:()=>structuredClone(values)};
}
function thrown(run:()=>unknown){let failed=false,value:unknown;try{run();}catch(error){failed=true;value=error;}return{failed,value};}

it('failed subscription acquisition preserves every thrown value and later shared publication never touches its failed facade',()=>{
 const subject=api!;
 for(const fault of [undefined,null,0,false,'',Error('SYNTHETIC subscription failed')]){
  const dead=facade();let acquisition=0;
  const result=thrown(()=>subject.connectToolDefaults(dead.port,()=>{acquisition++;throw fault;}));
  expect(result.failed).toBe(true);expect(result.value).toBe(fault);expect(acquisition).toBe(1);expect(dead.reads()).toBeGreaterThan(0);
  const reads=dead.reads(),writes=dead.writes();
  subject.loadSharedToolDefaults(saved('#'+String(acquisition+reads+writes).padStart(6,'0')));
  expect(dead.reads()).toBe(reads);expect(dead.writes()).toBe(writes);
  // Ensure the next iteration's publication is a real change as well.
  subject.loadSharedToolDefaults(undefined);
 }
});

it('a synchronous initial notification followed by acquisition failure leaves no shared listener',()=>{
 const subject=api!,dead=facade(),fault=Error('SYNTHETIC after notification');let notified=false;
 const result=thrown(()=>subject.connectToolDefaults(dead.port,callback=>{notified=true;callback({type:'trendline'});throw fault;}));
 expect(notified).toBe(true);expect(result.value).toBe(fault);const reads=dead.reads();
 subject.loadSharedToolDefaults(saved('#123456'));expect(dead.reads()).toBe(reads);expect(dead.writes()).toBe(0);
});

it('a failed owner cannot stop a second healthy chart from taking subsequent shared defaults',()=>{
 const subject=api!,dead=facade(),healthy=facade(),fault=Error('SYNTHETIC first chart');
 expect(thrown(()=>subject.connectToolDefaults(dead.port,()=>{throw fault;})).value).toBe(fault);
 const off=subject.connectToolDefaults(healthy.port,()=>()=>{});releases.push(off);const reads=dead.reads();
 subject.loadSharedToolDefaults(saved('#234567'));
 expect(healthy.values()).toEqual({trendline:{style:{color:'#234567'}}});expect(healthy.writes()).toBe(1);expect(dead.reads()).toBe(reads);
});

it('successful initial application and live notifications remain active until one idempotent disposer runs',()=>{
 const subject=api!,chart=facade();let notify:((event:{type?:string})=>void)|undefined,offs=0;
 subject.loadSharedToolDefaults(saved('#345678'));
 const off=subject.connectToolDefaults(chart.port,callback=>{notify=callback;return()=>{offs++;};});releases.push(off);
 expect(chart.values()).toEqual({trendline:{style:{color:'#345678'}}});expect(offs).toBe(0);
 chart.port.setToolDefaults({trendline:{style:{color:'#000000'}}});notify!({type:'trendline'});
 expect(chart.values()).toEqual({trendline:{style:{color:'#345678'}}});
 subject.loadSharedToolDefaults(saved('#456789'));expect(chart.values()).toEqual({trendline:{style:{color:'#456789'}}});
 off();off();expect(offs).toBe(1);const reads=chart.reads();subject.loadSharedToolDefaults(saved('#567890'));notify!({type:'trendline'});expect(chart.reads()).toBe(reads);
});

it('a throwing off callback observes retired membership before reentrant shared publication and cannot run twice',()=>{
 const subject=api!,retired=facade(),healthy=facade(),fault=0;let offs=0,readsAtOff=-1;
 const off=subject.connectToolDefaults(retired.port,()=>()=>{offs++;readsAtOff=retired.reads();subject.loadSharedToolDefaults(saved('#678901'));throw fault;});releases.push(off);
 releases.push(subject.connectToolDefaults(healthy.port,()=>()=>{}));
 const result=thrown(off);expect(result.failed).toBe(true);expect(result.value).toBe(fault);expect(retired.reads()).toBe(readsAtOff);
 expect(healthy.values()).toEqual({trendline:{style:{color:'#678901'}}});off();expect(offs).toBe(1);
});

it('an initial facade application failure keeps its original error and never registers a shared listener',()=>{
 const subject=api!,chart=facade(),fault=Error('SYNTHETIC initial apply');let fail=true,subscribed=0;
 const realRead=chart.port.toolDefaults;chart.port.toolDefaults=()=>{if(fail)throw fault;return realRead();};
 const result=thrown(()=>subject.connectToolDefaults(chart.port,()=>{subscribed++;return()=>{};}));
 expect(result.value).toBe(fault);expect(subscribed).toBe(0);fail=false;
 subject.loadSharedToolDefaults(saved('#789012'));expect(chart.reads()).toBe(0);expect(chart.writes()).toBe(0);
});
