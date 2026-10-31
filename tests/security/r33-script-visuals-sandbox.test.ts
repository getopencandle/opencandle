import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

// ADDED checks for ctx.barcolor, the drawing objects (ctx.label, ctx.line, ctx.box, ctx.table) and
// ctx.log inside the unchanged restricted worker. Every case drives the real QuickJS worker through
// electron/script-jobs.cjs. SYNTHETIC fixture bars only. No existing security assertion is edited.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const {LIMITS}=require('../../electron/script-runtime.cjs');
import {scriptExamples} from '../../src/ui/ScriptPanel';
const bars=Array.from({length:40},(_,index)=>{const close=10+Math.sin(index/3)*2;return{id:'synthetic-r33-vis-'+index,revision:1,time:3600*(10+index),open:close-0.25,high:close+1,low:close-1,close,volume:5};});
async function run(source:string,input=bars,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'r33-visuals',source,bars:input,...extra});}finally{jobs.close();}}

describe('bar colors, drawing objects and logs stay inside the restricted worker',{timeout:60000},()=>{
 it('keeps every runtime limit exactly as the security contract states it',()=>{
  expect(LIMITS).toEqual({sourceBytes:65536,bars:5000,memoryBytes:16*1024*1024,stackBytes:256*1024,outputBytes:512*1024,computeMilliseconds:1000,inputs:32,requests:4,conditions:32});
 });
 it('barcolor gives one validated row per bar, the last call on a bar winning, and null leaves the bar alone',async()=>{
  const result=await run(`({onBar(ctx){ctx.barcolor(ctx.index%2?'#00ff00':null);if(ctx.index===3)ctx.barcolor('#ff000080');}})`);
  expect(result.ok,result.error?.message).toBe(true);
  const rows=result.value.objects.barcolors;expect(rows).toHaveLength(20);expect(rows[1]).toEqual({time:bars[3].time,color:'#ff000080'});
  expect(rows.every((row:any,index:number)=>index===0||row.time>rows[index-1].time)).toBe(true);
  const bad=await run(`({onBar(ctx){ctx.barcolor('red');}})`);expect(bad.ok).toBe(false);expect(bad.error.message).toContain('ctx.barcolor color must be #RRGGBB or #RRGGBBAA');
 });
 it('labels, lines and boxes follow create, update and delete, with the oldest deleted past the budget',async()=>{
  const result=await run(`({objectLimits:{labels:5},onBar(ctx){
   const id=ctx.label.new({text:'L'+ctx.index,style:'label_up',color:null});ctx.state.last=id;
   if(ctx.index===0){ctx.state.line=ctx.line.new({x1:0,y1:9,x2:1,y2:10,style:'arrowboth',width:3});ctx.state.box=ctx.box.new({left:0,right:2,top:12,bottom:8,text:'B',bgColor:null});ctx.state.gone=ctx.label.new({text:'gone'});ctx.label.delete(ctx.state.gone);}
   else ctx.line.set(ctx.state.line,{x2:ctx.index,y2:ctx.bar.close});
   if(ctx.index===1){ctx.state.deleted=[ctx.label.set(ctx.state.gone,{text:'x'}),ctx.label.get(ctx.state.gone)];ctx.state.got=ctx.line.get(ctx.state.line);}
   if(ctx.index===30)ctx.box.delete(ctx.state.box);ctx.state.all=ctx.label.all().length;}})`);
  expect(result.ok,result.error?.message).toBe(true);const value=result.value,objects=value.objects;
  expect(objects.base).toEqual({index:0,time:bars[0].time});
  expect(objects.labels.map((row:any)=>row.text)).toEqual(['L35','L36','L37','L38','L39']);
  expect(objects.labels[0]).toMatchObject({xloc:'index',x:35,yloc:'price',style:'label_up',color:null,textColor:'#ffffff',size:'normal'});
  expect(objects.lines).toEqual([expect.objectContaining({xloc:'index',x1:0,y1:9,x2:39,y2:bars[39].close,style:'arrowboth',width:3,extend:'none'})]);
  expect(objects.boxes).toEqual([]);
  expect(value.state.state.deleted).toEqual([false,null]);expect(value.state.state.got).toMatchObject({x1:0,y1:9,x2:1,y2:bars[1].close,style:'arrowboth'});expect(value.state.state.all).toBe(5);
 });
 it('tables hold bounded cells, and clear and delete work',async()=>{
  const result=await run(`({onBar(ctx){if(ctx.index===0){ctx.state.t=ctx.table.new({position:'bottom_left',columns:3,rows:2,frameColor:'#112233',frameWidth:1});ctx.state.u=ctx.table.new();}
   ctx.table.cell(ctx.state.t,ctx.index%3,ctx.index%2,{text:'c'+ctx.index,bgColor:'#00000080'});if(ctx.index===39){ctx.table.clear(ctx.state.u);ctx.table.delete(ctx.state.u);}}})`);
  expect(result.ok,result.error?.message).toBe(true);const tables=result.value.objects.tables;
  expect(tables).toHaveLength(1);expect(tables[0]).toMatchObject({position:'bottom_left',columns:3,rows:2,frameColor:'#112233',frameWidth:1,bgColor:null});
  expect(tables[0].cells).toHaveLength(6);expect(tables[0].cells.find((cell:any)=>cell.column===0&&cell.row===1).text).toBe('c39');
  const outside=await run(`({onBar(ctx){const t=ctx.table.new({columns:2,rows:2});ctx.table.cell(t,2,0,{text:'x'});}})`);expect(outside.ok).toBe(false);expect(outside.error.message).toContain('column must be an integer from 0 to 1');
  const tooMany=await run(`({onBar(ctx){if(ctx.index)return;for(let i=0;i<9;i++){const t=ctx.table.new({columns:20,rows:50});for(let r=0;r<50;r++)for(let c=0;c<20;c++)ctx.table.cell(t,c,r,{text:'x'});}}})`);
  expect(tooMany.ok).toBe(false);expect(tooMany.error.message).toContain('at most 500 filled cells');
 });
 it('refuses bad ids, ids from an earlier run, mixed kinds, far-future x and unsupported options',async()=>{
  const cases:Array<[string,string]>=[
   ["ctx.label.set(12345,{text:'x'})",'there is no label with id 12345'],
   ["const id=ctx.line.new();ctx.label.set(id,{})",'is a line, not a label'],
   ["ctx.label.new({x:ctx.index+501})",'at most 500 bars ahead'],
   ["ctx.label.new({x:1.5})",'must be a bar index'],
   ["ctx.label.new({xloc:'time',x:Infinity})",'finite time in seconds'],
   ["ctx.label.new({colour:'#ffffff'})",'unsupported field'],
   ["ctx.label.new({text:'x'.repeat(501)})",'at most 500 characters'],
   ["ctx.line.new({width:11})",'width must be an integer from 1 to 10'],
   ["ctx.box.new({borderStyle:'wavy'})",'borderStyle must be one of'],
   ["for(let i=0;i<1001;i++)ctx.line.new()",'at most 1000 drawing objects per bar'],
  ];
  for(const [code,message] of cases){const result=await run(`({onBar(ctx){${code};}})`,bars.slice(0,2));expect(result.ok,code).toBe(false);expect(result.error.message,code).toContain(message);}
  const budget=await run(`({objectLimits:{labels:501},onBar(ctx){}})`,bars.slice(0,2));expect(budget.ok).toBe(false);expect(budget.error.message).toContain('objectLimits.labels must be an integer from 1 to 500');
  // A continued snapshot does not keep objects: an id kept in ctx.state from the earlier run is refused explicitly.
  const source=`({onBar(ctx){if(ctx.index===0)ctx.state.id=ctx.label.new({text:'first'});else ctx.label.set(ctx.state.id,{text:'later'});}})`;
  const first=await run(source,bars.slice(0,3));expect(first.ok,first.error?.message).toBe(true);
  const next=await run(source,bars.slice(3,5),{snapshot:first.value.state});expect(next.ok).toBe(false);expect(next.error.message).toContain('was created before this run');
 });
 it('logs are capped at 1,000 kept rows, count against the output budget and keep bar time and index',async()=>{
  const result=await run(`({onBar(ctx){ctx.log.info('close',ctx.bar.close,true,null);if(ctx.index===2)ctx.log.warn('warn');if(ctx.index===3)ctx.log.error('x'.repeat(2000));}})`);
  expect(result.ok,result.error?.message).toBe(true);const logs=result.value.logs;
  expect(logs.dropped).toBe(0);expect(logs.entries).toHaveLength(42);expect(logs.entries[0]).toEqual({time:bars[0].time,index:0,level:'info',message:'close '+bars[0].close+' true null'});
  expect(logs.entries.find((row:any)=>row.level==='warn')).toEqual({time:bars[2].time,index:2,level:'warn',message:'warn'});
  expect(logs.entries.find((row:any)=>row.level==='error').message).toHaveLength(1000);
  const capped=await run(`({onBar(ctx){for(let i=0;i<30;i++)ctx.log.info('n',i);}})`);expect(capped.ok,capped.error?.message).toBe(true);expect(capped.value.logs.entries).toHaveLength(1000);expect(capped.value.logs.dropped).toBe(200);
  // 9,960 plot points plus 80 kept log rows overflow the unchanged 10,000-output count.
  const budget=await run(`({onBar(ctx){for(let i=0;i<249;i++)ctx.plot('p'+i,1);ctx.log.info('x');ctx.log.info('y');}})`);expect(budget.ok).toBe(false);expect(budget.error.message).toContain('Output count limit exceeded');
  const objects=await run(`({message(){},onBar(ctx){ctx.log.info({toString(){return 'leak';}});}})`,bars.slice(0,1));expect(objects.ok).toBe(false);expect(objects.error.message).toContain('ctx.log messages take text');
 });
 it('the shipped example draws bar colours, a label per new high, one line, one box and a table, and logs',async()=>{
  const rising=bars.map((bar,index)=>{const close=10+index*0.2+Math.sin(index)*0.5;return{...bar,open:close-0.1,high:close+0.5,low:close-0.5,close};});
  const result=await run(scriptExamples['Bar colors with objects and logs'],rising);expect(result.ok,result.error?.message).toBe(true);const objects=result.value.objects;
  expect(objects.barcolors.length).toBeGreaterThan(0);expect(objects.labels.length).toBeGreaterThan(0);expect(objects.labels.length).toBeLessThanOrEqual(20);
  expect(objects.lines).toHaveLength(1);expect(objects.boxes).toHaveLength(1);expect(objects.boxes[0]).toMatchObject({left:30,right:39});
  expect(objects.tables).toHaveLength(1);expect(objects.tables[0].cells).toHaveLength(4);
  expect(result.value.logs.entries[0]).toMatchObject({level:'warn',index:0});expect(result.value.logs.entries.some((row:any)=>row.message.startsWith('New 20-bar high'))).toBe(true);
 });
 it('a provisional run returns no objects or logs, and init cannot draw or log',async()=>{
  const source=`({onBar(ctx){ctx.barcolor('#00ff00');ctx.label.new();ctx.log.info('x');}})`;
  const provisional=await run(source,bars.slice(0,3),{provisional:true});expect(provisional.ok,provisional.error?.message).toBe(true);
  expect(provisional.value.objects).toEqual({base:null,barcolors:[],labels:[],lines:[],boxes:[],tables:[],linefills:[],polylines:[]});expect(provisional.value.logs).toEqual({entries:[],dropped:0});
  for(const code of ["ctx.label.new()","ctx.log.info('x')","ctx.barcolor('#00ff00')","ctx.table.new()"]){const result=await run(`({init(ctx){${code};},onBar(){}})`,bars.slice(0,2));expect(result.ok,code).toBe(false);expect(result.error.message,code).toContain('init may initialize state only');}
 });
 it('the new members cannot reach the Function constructor or engine-private stores, and guest tampering changes nothing',async()=>{
  for(const escape of ["ctx.label.new.constructor('return 1')()","Object.getPrototypeOf(ctx.log.info).constructor('return 1')()","ctx.table.cell.constructor('return 1')()"]){const result=await run(`({onBar(ctx){ctx.state.escape=${escape};}})`,bars.slice(0,1));expect(result.ok,escape).toBe(false);}
  const probe=await run(`({onBar(ctx){ctx.state.seen=[typeof objLive,typeof objById,typeof logsOut,typeof objectsOut,typeof lvObjects,Object.isFrozen(ctx.label),Object.isFrozen(ctx.table),Object.isFrozen(ctx.log),Object.isFrozen(ctx.label.all())];try{ctx.label.extra=1;}catch{}ctx.state.extra=typeof ctx.label.extra;}})`,bars.slice(0,1));
  expect(probe.ok,probe.error?.message).toBe(true);expect(probe.value.state.state.seen).toEqual(['undefined','undefined','undefined','undefined','undefined',true,true,true,true]);expect(probe.value.state.state.extra).toBe('undefined');
  const body=`ctx.barcolor(ctx.index%3?'#123456':null);const id=ctx.label.new({text:'t'+ctx.index});ctx.label.set(id,{y:ctx.bar.high});ctx.line.new({x2:ctx.index,y2:ctx.bar.low});if(ctx.index===5){const t=ctx.table.new({columns:2,rows:2});ctx.table.cell(t,1,1,{text:'x'});}ctx.log.info('i',ctx.index);`;
  const clean=await run(`({onBar(ctx){${body}}})`);
  const tampered=await run(`({init(){Object.create=()=>({});Object.defineProperty=()=>{};Object.getOwnPropertyDescriptor=()=>undefined;String.prototype.slice=()=>'';Math.min=()=>0;Set.prototype.has=()=>true;Reflect.apply=()=>0;},onBar(ctx){${body}}})`);
  expect(clean.ok,clean.error?.message).toBe(true);expect(tampered.ok,tampered.error?.message).toBe(true);
  expect(tampered.value.objects).toEqual(clean.value.objects);expect(tampered.value.logs).toEqual(clean.value.logs);
 });
});
