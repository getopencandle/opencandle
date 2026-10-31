import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

// The added input types (color, source, timeframe, symbol, session, time, price) through the real
// restricted worker. SYNTHETIC bars and scripts only.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars=[{id:'synthetic-r40-in-0',revision:1,time:1_700_000_000,open:10,high:12,low:8,close:11,volume:100}];
async function run(inputs:string,extra:Record<string,unknown>={},body='ctx.state.v = {}; for (const id of Object.keys(this.inputs)) ctx.state.v[id] = ctx.input(id);'){
 const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-r40-inputs',source:`({ inputs: ${inputs}, onBar(ctx) { ${body} } })`,bars,...extra});}finally{jobs.close();}
}
const all=`{
 tint: { type: 'color', default: '#2962ffcc', title: 'Line color' },
 src: { type: 'source', default: 'hlc3' },
 pick: { type: 'source', default: 'close', options: ['close', 'hl2'] },
 tf: { type: 'timeframe', default: '' },
 other: { type: 'symbol', default: 'SPY' },
 hours: { type: 'session', default: '0930-1600:23456' },
 start: { type: 'time', default: 1700000000, min: 1600000000 },
 level: { type: 'price', default: 101.25, min: 0, step: 0.25 },
}`;

describe(' input types',()=>{
 it('declares every new type with its default and catalog row',async()=>{
  const result=await run(all);
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.state.state.v).toEqual({tint:'#2962ffcc',src:'hlc3',pick:'close',tf:'',other:'SPY',hours:'0930-1600:23456',start:1700000000,level:101.25});
  const rows=Object.fromEntries(result.value.declarations.inputs.map((row:any)=>[row.id,row]));
  expect(rows.tint).toEqual({id:'tint',type:'color',title:'Line color',default:'#2962ffcc',min:null,max:null,step:null,options:null});
  // A source input lists the price sources (or the script's own subset), so Settings shows a list.
  expect(rows.src.options).toEqual(['open','high','low','close','hl2','hlc3','ohlc4','hlcc4']);
  expect(rows.pick.options).toEqual(['close','hl2']);
  expect(rows.start).toMatchObject({type:'time',min:1600000000,max:null});expect(rows.level).toMatchObject({type:'price',min:0,step:0.25});
 });
 it('a source input value feeds ctx.ta.source',async()=>{
  const result=await run(`{ src: { type: 'source', default: 'hl2' } }`,{},`ctx.plot('s', ctx.ta.source(ctx.input('src')));`);
  expect(result.ok,result.error?.message).toBe(true);expect(result.value.plots[0].values[0].value).toBe(10);
  const saved=await run(`{ src: { type: 'source', default: 'hl2' } }`,{inputs:{src:'high'}},`ctx.plot('s', ctx.ta.source(ctx.input('src')));`);
  expect(saved.value.plots[0].values[0].value).toBe(12);
 });
 it('saved values are used when they fit the declaration',async()=>{
  const result=await run(all,{inputs:{tint:'#00ff00',src:'ohlc4',tf:'60',other:'NASDAQ:AAPL',hours:'24x7',start:1700000060,level:99.5}});
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.state.state.v).toMatchObject({tint:'#00ff00',src:'ohlc4',tf:'60',other:'NASDAQ:AAPL',hours:'24x7',start:1700000060,level:99.5});
 });
 it('saved values that do not fit are refused with the reset hint',async()=>{
  for(const [name,value] of [['tint','red'],['tint','#12345'],['src','volume'],['pick','open'],['tf','1 D'],['other','bad symbol'],['hours','0930-2500'],['hours','0930-1600:118'],['start',1500000000],['start',1700000000.5],['level',-1]] as const){
   const result=await run(all,{inputs:{[name]:value}});expect(result.ok,name+' '+value).toBe(false);expect(result.error.message,name).toContain('no longer fits');
  }
 });
 it('declarations that do not fit their type are refused',async()=>{
  for(const spec of [`{ c: { type: 'color', default: 'blue' } }`,`{ s: { type: 'source', default: 'vwap' } }`,`{ s: { type: 'source', default: 'close', options: ['close', 'typical'] } }`,`{ t: { type: 'timeframe', default: 'one hour' } }`,
   `{ y: { type: 'symbol', default: 'A B' } }`,`{ h: { type: 'session', default: '9:30-16:00' } }`,`{ h: { type: 'session', default: '0930-1600,1700-1800,1900-1930,2000-2010,2100-2110,2200-2210,2300-2310,0000-0010,0100-0110' } }`,
   `{ t: { type: 'time', default: 'today' } }`,`{ t: { type: 'time', default: -5 } }`,`{ p: { type: 'price', default: 1, max: 0 } }`,`{ c: { type: 'color', default: '#ffffff', min: 1 } }`,`{ c: { type: 'color', default: '#ffffff', options: ['#ffffff'] } }`,`{ x: { type: 'textarea', default: '' } }`]){
   const result=await run(spec);expect(result.ok,spec).toBe(false);
  }
 });
 it('sessions accept several ranges, overnight ranges and day lists',async()=>{
  const result=await run(`{ a: { type: 'session', default: '0930-1200,1300-1600' }, b: { type: 'session', default: '1800-0200:1234567' }, c: { type: 'session', default: '0000-2400:7' } }`);
  expect(result.ok,result.error?.message).toBe(true);expect(result.value.state.state.v).toEqual({a:'0930-1200,1300-1600',b:'1800-0200:1234567',c:'0000-2400:7'});
 });
});
