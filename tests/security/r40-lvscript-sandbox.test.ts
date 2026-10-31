import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{ScriptJobs}=require('../../electron/script-jobs.cjs');
// Added security checks. Synthetic bars and virtual fill only; existing assertions remain untouched.
const bars=Array.from({length:8},(_,i)=>({id:'synthetic-r40-security-'+i,revision:1,time:1000+i*60,open:10+i,high:12+i,low:9+i,close:11+i,volume:100+i}));
async function run(source:string,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-r40-security',source,bars,...extra});}finally{jobs.close();}}
const calls=["alma('a',1,3)","dema('a',1,3)","tema('a',1,3)","swma('a',1)","linreg('a',1,3)","vwap('a',1)","wpr('a',3)","cmo('a',1,3)","tsi('a',1,2,3)","percentrank('a',1,3)","cog('a',1,3)","median('a',1,3)","dev('a',1,3)","range('a',1,3)","percentile_nearest_rank('a',1,3,50)","percentile_linear_interpolation('a',1,3,50)","max('a',1)","min('a',1)","bbw('a',1,3)","kcw('a',1,3,2)","sar('a',0.02,0.02,0.2)","supertrend('a',1,3)","accdist('a')","pvt('a')","source('close')"];
describe(' LVScript additions preserve worker isolation',{timeout:60000},()=>{
 it('every new TA method refuses access from a retained onBar context during onFill',async()=>{
  const fill={bar:1,ordinal:0,name:'Synthetic',kind:'order',leg:null,side:'buy',quantity:1,price:11,high:12,low:10,close:11,position:1,averagePrice:11,openTrades:1};
  const result=await run(`({init(ctx){this.full=ctx;},onBar(ctx){},onFill(ctx){let flags='';${calls.map(call=>`try{this.full.ta.${call};flags+='x';}catch(error){flags+=String(error.message).startsWith('Inside onFill only')?'b':'o';}`).join('')}ctx.order('buy',1,{id:flags});}})`,{engine:{positions:bars.map(()=>null),fills:[fill]}});
  expect(result.ok,result.error?.message).toBe(true);expect(result.value.orders[0].options.id).toBe('b'.repeat(calls.length));expect(result.value.state.ta).toEqual({});
 });
 it('captures exponent, ceiling and character access before the guest can replace them',async()=>{
  const body=`ctx.plot('a',ctx.ta.alma('a',ctx.bar.close,3));ctx.plot('p',ctx.ta.percentile_nearest_rank('p',ctx.bar.close,3,50));ctx.plot('m',ctx.ta.median('m',ctx.bar.close,3));ctx.state.frozen=Object.isFrozen(ctx.ta);ctx.state.ctor=typeof ctx.ta.alma.constructor;`;
  const clean=await run(`({onBar(ctx){${body}}})`),tampered=await run(`(Math.exp=()=>0,Math.ceil=()=>0,Array.prototype.sort=()=>[],String.prototype.charCodeAt=()=>0,{inputs:{t:{type:'color',default:'#112233'}},onBar(ctx){${body}}})`);
  expect(clean.ok,clean.error?.message).toBe(true);expect(tampered.ok,tampered.error?.message).toBe(true);expect(tampered.value.plots).toEqual(clean.value.plots);expect(tampered.value.state.state).toMatchObject({frozen:true,ctor:'undefined'});
 });
 it('interrupts repeated heavy median work under the existing compute budget',async()=>{
  const started=Date.now(),result=await run(`({onBar(ctx){for(let i=0;;i++)ctx.ta.median('m'+i,1,5000);}})`);
  expect(result.ok).toBe(false);expect(result.error.message).toMatch(/interrupt|budget|time|memory/i);expect(Date.now()-started).toBeLessThan(10000);
 });
 it('the host refuses catalogs with defaults of the wrong type and inconsistent bounds',()=>{
  const filename=require.resolve('../../electron/script-runtime.cjs'),code=readFileSync(filename,'utf8'),module={exports:{} as any};
  // Expose a private host validator in an in-memory test module. The source file is never changed.
  Function('require','module','exports',code+';module.exports.checkCatalog=scriptCatalog;')(createRequire(filename),module,module.exports);
  const row={id:'synthetic',type:'int',title:'Synthetic',default:1,min:null,max:null,step:null,options:null};
  for(const bad of [{...row,default:true},{...row,type:'source',default:'volume'},{...row,type:'color',default:'red'},{...row,type:'time',default:0.5},{...row,type:'session',default:'0930-2500'},{...row,type:'bool',default:true,min:0},{...row,min:2},{...row,options:['x']}])expect(()=>module.exports.checkCatalog({inputs:[bad],requests:[],conditions:[]})).toThrow(/catalog/);
  expect(module.exports.checkCatalog({inputs:[{...row,type:'price',default:1.25}],requests:[],conditions:[]}).inputs[0].default).toBe(1.25);
 });
 it('overflow never commits a non-finite accumulator',async()=>{
  const result=await run(`({onBar(ctx){ctx.ta.vwap('v',1e308);}})`);expect(result.ok).toBe(false);expect(result.error.message).toMatch(/overflow/);expect(result.value).toBeUndefined();
 });
});
