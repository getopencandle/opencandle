// The cached indicator budget and settings validation return exactly what the uncached paths return,
// including after in-place mutation (settings objects are edited in place) and for every refused shape.
import {expect,it} from 'vitest';
import {performance} from 'node:perf_hooks';
import {assertIndicatorBatchBudget,clearIndicatorBudgetCache,indicatorDefaults,indicatorPlotIds,defaultIndicatorPresentation,indicatorEstimatedSlots,indicatorEstimatedWork,validateIndicatorSettings,INDICATOR_KINDS,INDICATOR_OUTPUT_LIMIT,INDICATOR_WORK_LIMIT,INDICATOR_MAX_INSTANCES,type IndicatorBudgetItem} from '../../src/chart/indicator-settings';

// Verbatim pre-lane batch budget (the oracle).
function referenceBudget(items:readonly IndicatorBudgetItem[],barCount:number):{operations:number;numericSlots:number}{
 if(!Array.isArray(items)||items.length>INDICATOR_MAX_INSTANCES)throw new Error('Invalid indicator budget collection.');let operations=0,numericSlots=0;
 for(const item of items){const slots=indicatorEstimatedSlots(item.kind,barCount,item.inputs,item.presentation,'render',item.plots,item.offset);numericSlots+=slots;const palette=item.kind==='volume'?item.presentation?.volumePalette:undefined;operations+=indicatorEstimatedWork(item.kind,barCount,item.inputs)+slots*4+(palette&&palette.mode!=='uniform'?barCount*4:0);if(numericSlots>INDICATOR_OUTPUT_LIMIT||operations>INDICATOR_WORK_LIMIT)throw new Error(`Indicator batch exceeds local limits (${numericSlots}/${INDICATOR_OUTPUT_LIMIT} numeric slots, ${operations}/${INDICATOR_WORK_LIMIT} estimated operations). Reduce history or instances.`);}
 return {operations,numericSlots};
}
const outcome=(run:()=>unknown)=>{try{return{ok:run()};}catch(error){return{error:String(error)};}};
const plotStyle=()=>({visible:true,color:'#2962ff',width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true});
const settingsOf=(kind:(typeof INDICATOR_KINDS)[number],id='i1'):any=>({id,kind,inputs:{...indicatorDefaults[kind]},plots:Object.fromEntries(indicatorPlotIds[kind].map(plot=>[plot,plotStyle()])),offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
const same=(items:any[],bars:number)=>{const reference=outcome(()=>referenceBudget(items,bars)),first=outcome(()=>assertIndicatorBatchBudget(items,bars)),second=outcome(()=>assertIndicatorBatchBudget(items,bars));expect(first).toEqual(reference);expect(second).toEqual(reference);};

it('matches the reference budget for every kind, bar count and in-place edit',()=>{
 clearIndicatorBudgetCache();
 for(const kind of INDICATOR_KINDS)for(const bars of [0,1,13,500,20000,100000,100001,-1,1.5,NaN])same([settingsOf(kind)],bars);
 const batch=['volume','sma','ema','rsi','macd','bb','stochastic','atr','obv'].map((kind,index)=>settingsOf(kind as any,'b'+index));
 for(const bars of [100,20000,20001,99999])same(batch,bars);
 // In-place edits change the content, so they never reuse an older estimate.
 const sma=batch[1];same(batch,20000);sma.inputs.length=200;same(batch,20000);sma.inputs.smoothingType='SMA+BB';same(batch,20000);sma.offset=40;same(batch,20000);
 sma.plots.sma.trackPrice=true;same(batch,20000);sma.presentation.fills.smoothing.visible=false;same(batch,20000);
 const volume=batch[0];volume.presentation.volumePalette={schemaVersion:1,mode:'open-close',upColor:'#26a69a',downColor:'#ef5350'};same(batch,20000);volume.presentation.volumePalette.mode='uniform';same(batch,20000);
 // Refused shapes keep their own error (not cached), also after a valid run of the same object.
 const edits:Array<(s:any)=>void>=[s=>{s.inputs.length=NaN;},s=>{s.inputs.length=null;},s=>{s.inputs.length=-0;},s=>{s.inputs.length=0;},s=>{s.inputs.length=Infinity;},s=>{s.inputs.length='9';},s=>{s.inputs.length=undefined;},s=>{delete s.inputs.length;},s=>{s.inputs.extra=1;},s=>{s.presentation.fills.smoothing.color='nope';},s=>{s.offset=1e6;},s=>{s.kind='nope';},s=>{s.presentation.guides={x:1};}];
 for(const edit of edits){const item=settingsOf('sma');same([item],100);edit(item);same([item],100);}
 // Shapes the key does not describe always take the full path.
 const getter=settingsOf('ema');Object.defineProperty(getter.inputs,'length',{get:()=>9,enumerable:true});same([getter],100);
 const symbol=settingsOf('ema');(symbol.inputs as any)[Symbol('x')]=1;same([symbol],100);
 const hidden=settingsOf('ema');Object.defineProperty(hidden.inputs,'length',{value:9,enumerable:false});same([hidden],100);
 const nullProto=settingsOf('ema');nullProto.inputs=Object.assign(Object.create(null),nullProto.inputs);same([nullProto],100);
 const inherited=Object.create({kind:'ema'});Object.assign(inherited,{inputs:{...indicatorDefaults.ema}});same([inherited],100);
 // Limits: the throw lands on the same item with the same totals.
 same(Array.from({length:60},(_,index)=>settingsOf('bb','l'+index)),100000);
 same([],100);same(Array.from({length:INDICATOR_MAX_INSTANCES+1},(_,index)=>settingsOf('sma','m'+index)),1);
});

it('cached settings validation refuses every in-place edit the full validation refuses',()=>{
 clearIndicatorBudgetCache();
 const valid=(value:unknown,snapshot?:boolean)=>outcome(()=>{validateIndicatorSettings(value,snapshot);return true;});
 for(const kind of INDICATOR_KINDS){const s=settingsOf(kind);expect(valid(s)).toEqual({ok:true});expect(valid(s)).toEqual({ok:true});expect(valid({...s,paneId:null},true)).toEqual({ok:true});expect(valid({...s,paneId:null})).toEqual({error:expect.stringContaining('Unsupported or missing indicator field')});}
 const edits:Array<(s:any)=>void>=[s=>{s.inputs.length=NaN;},s=>{s.inputs.length=null;},s=>{s.plots.sma.color='nope';},s=>{s.plots.sma.width=-0;},s=>{s.offset=-0.5;},s=>{s.visible=1;},s=>{s.id='';},s=>{s.extra=true;},s=>{s.plots.nope=s.plots.sma;},s=>{s.presentation.precision=17;}];
 for(const edit of edits){const s=settingsOf('sma');expect(valid(s)).toEqual({ok:true});edit(s);const cached=valid(s);clearIndicatorBudgetCache();expect(cached).toEqual(valid(s));expect(cached).not.toEqual({ok:true});}
 // An accessor is never keyed (or read): the full path refuses it every time, without reading the getter.
 const s=settingsOf('sma');let reads=0;Object.defineProperty(s.plots.sma,'color',{get:()=>{reads++;return '#ffffff';},enumerable:true});
 const first=valid(s),second=valid(s);expect(first).toEqual({error:expect.stringContaining('Invalid plot style')});expect(second).toEqual(first);expect(reads).toBe(0);
 // -0 and 0 are distinct keys; both are valid offsets.
 const zero=settingsOf('sma');zero.offset=-0;expect(valid(zero)).toEqual({ok:true});
});

// Timing is opt-in (LV_BENCH=1), as F5 asks for benchmarks.
it.skipIf(!process.env.LV_BENCH)('a live recalculation budget is much cheaper when nothing changed (relative)',()=>{
 const batch=['volume','sma','ema','rsi','macd'].map((kind,index)=>settingsOf(kind as any,'p'+index));
 const time=(run:()=>void)=>{for(let i=0;i<50;i++)run();const start=performance.now();for(let i=0;i<500;i++)run();return (performance.now()-start)/500*1000;};
 const referenceUs=time(()=>referenceBudget(batch,20000)),cachedUs=time(()=>assertIndicatorBatchBudget(batch,20000));
 const validateReferenceUs=time(()=>{clearIndicatorBudgetCache();for(const s of batch)validateIndicatorSettings(s);}),validateCachedUs=time(()=>{for(const s of batch)validateIndicatorSettings(s);});
 console.log(JSON.stringify({lane:'R28-PERF2',budget5ReferenceUs:+referenceUs.toFixed(1),budget5CachedUs:+cachedUs.toFixed(1),validate5ReferenceUs:+validateReferenceUs.toFixed(1),validate5CachedUs:+validateCachedUs.toFixed(1)}));
 expect(cachedUs).toBeLessThan(referenceUs/2);expect(validateCachedUs).toBeLessThan(validateReferenceUs/1.5);
});
