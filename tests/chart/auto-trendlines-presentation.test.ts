import {expect,it} from 'vitest';
import {calculateAutoTrendlines} from '../../src/domain/indicators-ext/auto-trendlines';
import {AUTO_TREND_POLICY,AutoTrendMeter,validateAutoTrendScene,type AutoTrendScene,type AutoTrendResult} from '../../src/domain/indicators-ext/auto-trendlines-scene';
import {presentAutoTrendlines,type AutoTrendPresentationOptions} from '../../src/chart/auto-trendlines-presentation';
import {syntheticTrendBars} from '../domain/auto-trendlines-fixture';
const options:AutoTrendPresentationOptions={instanceId:'SYNTHETIC:instance',paneId:'price',supportColor:'#219653',resistanceColor:'#eb5757',width:2,lineStyle:'solid'};
const detected=()=>calculateAutoTrendlines(syntheticTrendBars(),{sourceKey:'SYNTHETIC:source',lineSize:'Small',barsToBreakout:3,showPivots:true});
function manual(edit:Partial<AutoTrendScene['lines'][number]>={}):AutoTrendResult {
 const from={index:20,time:1200,price:90,actualSize:20,confirmedAt:25},to={index:80,time:90000,price:95,actualSize:30,confirmedAt:85},slope=5/60,line={key:'small:support:20:80',family:'small' as const,side:'support' as const,from,to,slope,touchWidth:1,touches:2,endIndex:139,endPrice:90+slope*119,breakoutIndex:null,extended:true,...edit};
 return{status:'ready',scene:{schemaVersion:1,policy:AUTO_TREND_POLICY,sourceKey:'SYNTHETIC:manual',fromIndex:0,asOfIndex:139,asOfTime:100000,lines:[line],pivots:[]},usage:{operations:1000,numericSlots:100,peakNumericSlots:100}};
}
it('native payload uses absolute logical indices across an irregular timestamp gap and original instance-scoped ids',()=>{
 const result=manual(),drawn=presentAutoTrendlines(result,options);expect(drawn.status).toBe('ready');if(drawn.status!=='ready')throw Error(drawn.diagnostic);const to=(result as unknown as {scene:{lines:{to:{index:number;price:number}}[]}}).scene.lines[0].to;// An unbroken extension is a ray through both pivots, so its projection never feeds the autoscale (lane VI).
 expect(drawn.lines[0]).toMatchObject({xloc:'bar_index',x1:20,x2:to.index,y1:90,y2:to.price,extend:'right',paneId:'price',color:options.supportColor});expect(to.price).toBeCloseTo(90+5/60*(to.index-20),9);const second=presentAutoTrendlines(result,{...options,instanceId:'SYNTHETIC:another'});expect(second.lines[0].id).not.toBe(drawn.lines[0].id);expect(drawn.sourceKey).toBe('SYNTHETIC:manual');expect(drawn.asOfIndex).toBe(139);expect(Object.isFrozen(drawn.lines[0])).toBe(true);
});
it('a confirmed breakout is finite and an ineligible extension draws only its exact base',()=>{
 const breakout=manual({endIndex:100,endPrice:90+5/60*80,breakoutIndex:100}),finite=presentAutoTrendlines(breakout,options);expect(finite.lines[0]).toMatchObject({x2:100,extend:'none'});
 const base=manual({endIndex:139,extended:false,to:{index:40,time:2400,price:95,actualSize:30,confirmedAt:45},slope:5/20,endPrice:90+5/20*119,key:'small:support:20:40'}),baseOnly=presentAutoTrendlines(base,options);expect(baseOnly.status).toBe('ready');expect(baseOnly.lines[0]).toMatchObject({x2:40,y2:95,extend:'none'});
});
it('actual detector scenes validate and native markers are original readable confirmed-pivot labels',()=>{
 const result=detected();expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);validateAutoTrendScene(result.scene,new AutoTrendMeter());const drawn=presentAutoTrendlines(result,options);expect(drawn.status).toBe('ready');expect(drawn.lines.length).toBeGreaterThan(0);expect(drawn.labels.length).toBeGreaterThan(0);expect(drawn.labels.every(row=>row.xloc==='bar_index'&&row.tooltip?.includes('pivot confirmed after'))).toBe(true);expect(drawn.labels.every(row=>!row.tooltip?.includes('SYNTHETIC:instance'))).toBe(true);
});
it('native geometry construction and copying consume the same receipt and refuse atomically',()=>{
 const result=detected(),ordinary=presentAutoTrendlines(result,options);expect(ordinary.status).toBe('ready');const exact=presentAutoTrendlines(result,options,{operations:ordinary.usage.operations,numericSlots:ordinary.usage.peakNumericSlots});expect(exact.status).toBe('ready');for(const limits of [{operations:ordinary.usage.operations-1},{numericSlots:ordinary.usage.peakNumericSlots-1}]){const denied=presentAutoTrendlines(result,options,limits);expect(denied.status).toBe('unavailable');expect(denied.lines).toEqual([]);expect(denied.labels).toEqual([]);}
});
it('forged or stale-looking scene metadata and unsupported native fields cannot produce partial geometry',()=>{
 const result=manual();if(result.status!=='ready')throw Error();for(const edit of [{policy:'other'},{asOfIndex:84},{sourceKey:''},{fromIndex:1},{lines:[{...result.scene.lines[0],to:{...result.scene.lines[0].to,actualSize:999}}]},{lines:[{...result.scene.lines[0],slope:NaN}]},{lines:[{...result.scene.lines[0],extended:false}]},{lines:[result.scene.lines[0],result.scene.lines[0]]}]){const drawn=presentAutoTrendlines({...result,scene:{...result.scene,...edit}} as AutoTrendResult,options);expect(drawn.status).toBe('unavailable');expect(drawn.lines).toEqual([]);}const missing=presentAutoTrendlines({...result,usage:{operations:0,numericSlots:0,peakNumericSlots:0}},options);expect(missing.status).toBe('unavailable');expect(presentAutoTrendlines(result,{...options,width:0}).status).toBe('unavailable');
});
it('scene validation rejects hidden/accessor fields without reading them',()=>{
 const result=manual();if(result.status!=='ready')throw Error();const accessor={...result.scene};Object.defineProperty(accessor,'sourceKey',{enumerable:true,get(){throw Error('SYNTHETIC accessor was read');}});const drawn=presentAutoTrendlines({...result,scene:accessor},options);expect(drawn.status).toBe('unavailable');if(drawn.status==='unavailable')expect(drawn.diagnostic).toContain('unsupported fields');const sparse={...result.scene,lines:new Array(2)};expect(presentAutoTrendlines({...result,scene:sparse},options).status).toBe('unavailable');
});
it.each(['usage','status','scene','diagnostic'] as const)('outer envelope refuses a result %s getter without executing it',field=>{
 const good=manual();if(good.status!=='ready')throw Error();const forged:Record<string,unknown>=field==='diagnostic'?{status:'unavailable',scene:null,diagnostic:'SYNTHETIC unavailable',usage:good.usage}:{...good};let calls=0;
 Object.defineProperty(forged,field,{enumerable:true,get(){calls++;return field==='usage'?good.usage:field==='status'?'ready':field==='scene'?good.scene:'SYNTHETIC unavailable';}});
 const drawn=presentAutoTrendlines(forged,options);expect(calls).toBe(0);expect(drawn.status).toBe('unavailable');expect(drawn.lines).toEqual([]);expect(drawn.labels).toEqual([]);
});
it.each(['operations','numericSlots','peakNumericSlots'] as const)('outer envelope refuses a usage %s getter without executing it',field=>{
 const good=manual();if(good.status!=='ready')throw Error();let calls=0;const usage={...good.usage};Object.defineProperty(usage,field,{enumerable:true,get(){calls++;return good.usage[field];}});
 const drawn=presentAutoTrendlines({...good,usage},options);expect(calls).toBe(0);expect(drawn.status).toBe('unavailable');expect(drawn.lines).toEqual([]);expect(drawn.labels).toEqual([]);
});
it('outer envelope refuses hidden or inherited metadata without accepting the scene',()=>{
 const good=manual();if(good.status!=='ready')throw Error();const hidden={...good};Object.defineProperty(hidden,'extra',{value:'SYNTHETIC hidden'});const inherited=Object.create({status:'ready'});Object.assign(inherited,{scene:good.scene,usage:good.usage});
 for(const forged of [hidden,inherited,{...good,extra:'SYNTHETIC extra'}]){const drawn=presentAutoTrendlines(forged,options);expect(drawn.status).toBe('unavailable');expect(drawn.lines).toEqual([]);}
});
it('outer envelope validates the complete usage shape and charges preflight without raising either ceiling',()=>{
 const good=manual();if(good.status!=='ready')throw Error();const hidden={...good.usage};Object.defineProperty(hidden,'extra',{value:1});const array=Object.assign([],{...good.usage});
 for(const usage of [hidden,array,{...good.usage,extra:1},{...good.usage,operations:1.5},{...good.usage,operations:12000001},{...good.usage,peakNumericSlots:200001},{...good.usage,numericSlots:101}]){const drawn=presentAutoTrendlines({...good,usage},options);expect(drawn.status).toBe('unavailable');expect(drawn.lines).toEqual([]);expect(drawn.usage.operations).toBeLessThanOrEqual(12000000);expect(drawn.usage.peakNumericSlots).toBeLessThanOrEqual(200000);}
 const drawn=presentAutoTrendlines(good,options);expect(drawn.status).toBe('ready');expect(drawn.usage.operations).toBeGreaterThan(good.usage.operations);expect(drawn.usage.numericSlots).toBeGreaterThan(good.usage.numericSlots);
 const exact=presentAutoTrendlines(good,options,{operations:drawn.usage.operations,numericSlots:drawn.usage.peakNumericSlots});expect(exact.status).toBe('ready');expect(presentAutoTrendlines(good,options,{operations:drawn.usage.operations-1}).status).toBe('unavailable');
});
