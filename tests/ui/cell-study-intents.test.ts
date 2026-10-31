import {expect,it,vi} from 'vitest';
import {createCellStudyIntentQueue,createCellStudyInspectionStream,cellStudyInspectionTime,type CellStudyIntent} from '../../src/ui/cell-study-intents';

const intent=(guard=()=>{}):CellStudyIntent=>({target:{cellId:'synthetic-cell',controller:{} as any,input:{} as any,executionIdentity:'ordinary'},subject:{kind:'builtin',id:'synthetic-study',fingerprint:'synthetic-settings'},action:{kind:'visibility'},assertCellCurrent:guard});
it('waits for rendered acknowledgement and consumes before a reentrant native command',()=>{
 const queue=createCellStudyIntentQueue(),run=vi.fn(()=>expect(queue.drain(()=>true,()=>{throw Error('Repeated command');})).toBe('empty'));
 queue.enqueue(intent(),1,{},{});expect(queue.drain(()=>false,run)).toBe('waiting');expect(run).not.toHaveBeenCalled();
 expect(queue.drain(()=>true,run)).toBe('consumed');expect(run).toHaveBeenCalledOnce();expect(queue.peek()).toBeNull();
});
it('supersedes an unacknowledged cell command without mutating either native chart',()=>{
 const queue=createCellStudyIntentQueue(),a=intent(),b={...intent(),target:{...intent().target,cellId:'synthetic-peer'}};
 queue.enqueue(a,1,{},{});queue.enqueue(b,2,{},{});const run=vi.fn();queue.drain(entry=>entry.epoch===2,run);expect(run).toHaveBeenCalledExactlyOnceWith(b);
});
it('clears an invalid target before invoking the mutation',()=>{
 const queue=createCellStudyIntentQueue();let alive=true;const run=vi.fn();queue.enqueue(intent(()=>{if(!alive)throw Error('Retired source');}),1,{},{});alive=false;
 expect(()=>queue.drain(()=>true,run)).toThrow('Retired source');expect(queue.peek()).toBeNull();expect(run).not.toHaveBeenCalled();
});
it('rechecks ownership after acknowledgement, including synchronous source replacement',()=>{
 const queue=createCellStudyIntentQueue();let alive=true;const run=vi.fn();queue.enqueue(intent(()=>{if(!alive)throw Error('Replaced during acknowledgement');}),1,{},{});
 expect(()=>queue.drain(()=>{alive=false;return true;},run)).toThrow('Replaced');expect(run).not.toHaveBeenCalled();expect(queue.peek()).toBeNull();
});
it('does not erase a newer intent synchronously enqueued by the acknowledgement callback',()=>{
 const queue=createCellStudyIntentQueue(),a=intent(),b=intent(),run=vi.fn();queue.enqueue(a,1,{},{});
 expect(queue.drain(()=>{queue.enqueue(b,2,{},{});return true;},run)).toBe('empty');expect(run).not.toHaveBeenCalled();expect(queue.peek()?.intent).toBe(b);
});
it('does not replay an accepted command when its subsequent publication fails',()=>{
 const queue=createCellStudyIntentQueue(),run=vi.fn(()=>{throw Error('Accepted publication quarantined');});queue.enqueue(intent(),1,{},{});
 expect(()=>queue.drain(()=>true,run)).toThrow('quarantined');expect(queue.drain(()=>true,run)).toBe('empty');expect(run).toHaveBeenCalledOnce();
});
it('fans out only the exact cell/controller/time from the existing crosshair channel',()=>{
 const stream=createCellStudyInspectionStream(),a={},b={},readA=vi.fn(),readB=vi.fn(),off=stream.subscribe('a',readA);stream.subscribe('b',readB);
 stream.emit('a',a,100);stream.emit('b',b,220);expect(readA).toHaveBeenCalledExactlyOnceWith(a,100);expect(readB).toHaveBeenCalledExactlyOnceWith(b,220);
 off();stream.emit('a',a,300);expect(readA).toHaveBeenCalledOnce();stream.dispose();stream.emit('b',b,400);expect(readB).toHaveBeenCalledOnce();
});

const linkedLayout=(crosshair=true,group=1,maximizedCellId:string|null=null)=>({id:'synthetic-layout',cells:[{id:'a',group:1},{id:'b',group},{id:'c',group:2}],sync:{crosshair},maximizedCellId} as any);
function inspectionFixture(){const stream=createCellStudyInspectionStream(),current={a:true,b:true,c:true},charts={a:{},b:{},c:{}},owners={a:{},b:{},c:{}},history={a:[] as Array<number|null>,b:[] as Array<number|null>,c:[] as Array<number|null>},grids={a:[100,160,220].map(time=>({time})),b:[100,180,280].map(time=>({time})),c:[100,200,400].map(time=>({time}))};for(const id of ['a','b','c'] as const)stream.register(id,{chart:charts[id],owner:owners[id],isCurrent:()=>current[id],resolve:(time,ghost)=>cellStudyInspectionTime(grids[id],'candles',time,ghost,()=>current[id])},time=>history[id].push(time));stream.configure(linkedLayout());return{stream,current,charts,owners,history};}
it('snaps linked ghost time onto each own loaded grid and leaves unrelated groups at their own latest bar',()=>{
 const h=inspectionFixture();h.stream.emit('a',h.charts.a,190);expect(h.history.a.at(-1)).toBe(160);expect(h.history.b.at(-1)).toBe(180);expect(h.history.c.at(-1)).toBe(400);h.stream.emit('a',h.charts.a,null);expect(h.history.a.at(-1)).toBe(220);expect(h.history.b.at(-1)).toBe(280);
});
it('nonnull before-first and invalid times stay blank, while null resets own latest',()=>{
 const h=inspectionFixture();for(const time of [50,NaN,Infinity]){h.stream.emit('a',h.charts.a,time);expect(h.history.a.at(-1)).toBeNull();expect(h.history.b.at(-1)).toBeNull();}h.stream.emit('a',h.charts.a,null);expect(h.history.b.at(-1)).toBe(280);
});
it('sync, group, layout replacement, maximized and host visibility changes clear old ghosts',()=>{
 const h=inspectionFixture();h.stream.emit('a',h.charts.a,190);expect(h.history.b.at(-1)).toBe(180);for(const layout of [linkedLayout(false),linkedLayout(true,2),linkedLayout(true,1,'a')]){h.stream.configure(layout);h.stream.emit('a',h.charts.a,190);expect(h.history.b.at(-1)).toBe(280);}h.stream.configure(linkedLayout());h.stream.emit('a',h.charts.a,190);h.stream.configure(linkedLayout());expect(h.history.b.at(-1)).toBe(280);h.stream.emit('a',h.charts.a,190);h.stream.configure(linkedLayout(),false);expect(h.history.b.at(-1)).toBe(280);
});
it('source retirement cannot revive an observed stale ghost when the same endpoint later looks current',()=>{
 const h=inspectionFixture();h.stream.emit('a',h.charts.a,190);h.current.a=false;h.stream.refresh('b',h.owners.b);expect(h.history.b.at(-1)).toBe(280);h.current.a=true;h.stream.refresh('b',h.owners.b);expect(h.history.b.at(-1)).toBe(280);h.stream.emit('a',h.charts.a,190);expect(h.history.b.at(-1)).toBe(180);
});
it('cheap native viewport/source invalidation clears stationary target/source ghosts until a fresh event',()=>{
 const h=inspectionFixture();h.stream.emit('a',h.charts.a,190);h.stream.invalidate('b',h.owners.b);expect(h.history.b.at(-1)).toBe(280);h.stream.refresh('b',h.owners.b);expect(h.history.b.at(-1)).toBe(280);h.stream.emit('a',h.charts.a,190);expect(h.history.b.at(-1)).toBe(180);h.stream.invalidate('a',h.owners.a);expect(h.history.a.at(-1)).toBe(220);expect(h.history.b.at(-1)).toBe(280);
});
it('a new controller/owner at the same cell cannot inherit stale ghost authority or a late old controller event',()=>{
 const h=inspectionFixture();h.stream.emit('a',h.charts.a,190);const replacement={},owner={},values:Array<number|null>=[];h.stream.register('b',{chart:replacement,owner,isCurrent:()=>true,resolve:(time,ghost)=>cellStudyInspectionTime([{time:100},{time:200},{time:300}],'candles',time,ghost,()=>true)},time=>values.push(time));expect(values.at(-1)).toBe(300);h.stream.emit('a',h.charts.a,190);expect(values.at(-1)).toBe(100);h.stream.emit('b',h.charts.b,220);expect(values.at(-1)).toBe(100);
});
it('time resolution is logarithmic on an already owned large grid without a history copy',()=>{
 let indices=0;const raw=Array.from({length:100000},(_,time)=>({time})),bars=new Proxy(raw,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))indices++;return Reflect.get(target,key,receiver);}});expect(cellStudyInspectionTime(bars,'heikinashi',70000.5,true,()=>true)).toBe(70000);expect(indices).toBeLessThan(100);expect(cellStudyInspectionTime(raw,'candles',-1,true,()=>true)).toBeNull();expect(cellStudyInspectionTime(raw,'renko',70000,true,()=>true)).toBeNull();
});
it('a reentrant newer source event cannot be overwritten by an older target resolution',()=>{
 const h=inspectionFixture();let armed=false;const values:Array<number|null>=[];h.stream.register('b',{chart:h.charts.b,owner:{},isCurrent:()=>true,resolve(time,ghost){if(armed){armed=false;h.stream.emit('a',h.charts.a,200);}return cellStudyInspectionTime([{time:100},{time:180},{time:195},{time:280}],'candles',time,ghost,()=>true);}},time=>values.push(time));armed=true;h.stream.emit('a',h.charts.a,190);expect(values.at(-1)).toBe(195);h.stream.dispose();const count=values.length;h.stream.emit('a',h.charts.a,220);expect(values).toHaveLength(count);
});
