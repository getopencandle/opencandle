// Switch and hover render work. Renderer-free stand-ins with SYNTHETIC bars; not executable UI evidence.
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {describe,expect,it} from 'vitest';
import {getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext} from '@luxalgo/vela';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createAppUpdateBatch} from '../../src/ui/app-update-batch';
import {CATALOG_INDICATORS,catalogDefinition} from '../../src/domain/indicator-catalog';
import {calculationBarsForStyle,derivedCalculationOptions} from '../../src/chart/adapter';

const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');

function syntheticChart(){
 const full=Array.from({length:60},(_,i)=>({time:(1700000000+i*60)*1000,open:10+i%4,high:12+i%5,low:9+i%3*0.1,close:10.5+i%6*0.3,volume:100+i}));
 let sequence=0;const live=new Map<string,{model:NativeIndicator;pane:string}>();
 const chart={
  panes:{list:()=>[...new Set(['price',...[...live.values()].map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.pane===id).map(([id])=>({id}))}))},
  addNativeIndicator(type:string){
   const descriptor=getNativeIndicator(type)!,id=`renderer-${++sequence}`,model=descriptor.create();const row={model,pane:descriptor.paneHint==='price'?'price':`pane-${sequence}`};live.set(id,row);
   const inputs=descriptor.defaultInputs();let visible=true;
   const handle={id,title:descriptor.title,setInputs:(values:any)=>model.setInputs(values),setVisible:(value:boolean)=>{visible=value;value?model.resume():model.suspend();},get visible(){return visible;},moveTo:()=>{},remove:()=>{live.delete(id);}};
   model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>full,emit:()=>{},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,inputs);
   return handle;
  },
 };
 return chart as unknown as Vela;
}

describe('PERF4 indicator port peekValues (legend hover reads)',()=>{
 it('returns one deeply frozen copy equal to values(), shared while the result is unchanged; values() stays a detached mutable copy',()=>{
  const port=createIndicatorPort(syntheticChart()),id=port.add('sma',{length:5,source:'close'} as never);
  const copy=port.values(id),peek=port.peekValues(id);
  expect(copy.series.length).toBeGreaterThan(0);expect(copy.series[0].values.length).toBe(60);
  expect(peek).toEqual(copy);expect(port.peekValues(id)).toBe(peek);
  expect(Object.isFrozen(peek)).toBe(true);expect(Object.isFrozen(peek.series)).toBe(true);expect(Object.isFrozen(peek.series[0])).toBe(true);expect(Object.isFrozen(peek.series[0].values)).toBe(true);
  expect(()=>{(peek.series[0].values as (number|null)[])[59]=999;}).toThrow();
  const last=copy.series[0].values[59];(copy.series[0].values as (number|null)[])[59]=999;
  expect(port.values(id).series[0].values[59]).toBe(last);expect(port.peekValues(id).series[0].values[59]).toBe(last);
  port.update(id,{inputs:{length:7,source:'close'}} as never);
  const next=port.peekValues(id);expect(next).not.toBe(peek);expect(next).toEqual(port.values(id));
  expect(()=>port.peekValues('missing')).toThrow(/Unknown indicator instance/);
  port.dispose();
 });
 it('the App legend reads peekValues (falling back to values) instead of a per-frame deep copy',()=>{
  expect(app).toContain('legendPort=chart?{values:(id:string)=>({series:(chart.indicators.peekValues?.(id)??chart.indicators.values(id)).series');
 });
});

describe('PERF4 App update batch',()=>{
 it('runs queued jobs once, together, newest job per key, in first-queued order; cancel drops a pending job',()=>{
  const posted:Array<()=>void>=[],batch=createAppUpdateBatch(run=>posted.push(run)),log:string[]=[];
  batch.queue('a',()=>log.push('a1'));batch.queue('b',()=>log.push('b'));batch.queue('a',()=>log.push('a2'));
  expect(posted).toHaveLength(1);expect(log).toEqual([]);expect(batch.pending('a')).toBe(true);
  posted[0]();expect(log).toEqual(['a2','b']);expect(batch.pending('a')).toBe(false);
  batch.queue('c',()=>log.push('c'));batch.cancel('c');expect(posted).toHaveLength(2);posted[1]();expect(log).toEqual(['a2','b']);
  batch.queue('d',()=>log.push('d'));batch.flush();expect(log).toEqual(['a2','b','d']);posted[2]();expect(log).toEqual(['a2','b','d']);
 });
 it('a failing job does not stop the others and is rethrown',()=>{
  const posted:Array<()=>void>=[],batch=createAppUpdateBatch(run=>posted.push(run)),log:string[]=[];
  batch.queue('x',()=>{throw Error('boom');});batch.queue('y',()=>log.push('y'));
  expect(()=>posted[0]()).toThrow('boom');expect(log).toEqual(['y']);
 });
 it('the default schedule posts a task (not a microtask)',async()=>{
  const batch=createAppUpdateBatch(),log:string[]=[];batch.queue('k',()=>log.push('job'));
  await Promise.resolve();await Promise.resolve();expect(log).toEqual([]);
  await new Promise(resolve=>setTimeout(resolve,20));expect(log).toEqual(['job']);
 });
 it('App routes the repeated switch callbacks through the batch and skips unchanged writes',()=>{
  expect(app).toContain("appUpdateBatch(current).queue('inspection',()=>setInspectionEpoch(value=>value+1));return;}");
  expect(app).toContain("const notified=()=>{if(owns())appUpdateBatch(current).queue('indicator-views',()=>{if(owns())setIndicatorViews(chart.indicators.list());});};refresh();const off=chart.indicators.subscribe(notified);return()=>{off();appUpdateBatch(current).cancel('indicator-views');};},[chart,gridEpoch]);");
  expect(app).toContain("const refresh=()=>{if(owns()){appUpdateBatch(current).cancel('indicator-views');setIndicatorViews(chart.indicators.list());}};");
  expect(app.match(/setSymbolInput\(/g)).toHaveLength(2);// takeSymbol and showSymbol only, both record the written value
  expect(app).toContain("if(written.has('alert-plan')&&sameBackgroundPlan(written.get('alert-plan'),plan))return;written.set('alert-plan',plan);setAlertPlan(plan);");
 });
});

describe('PERF4 catalogDefinition index',()=>{
 it('returns the same row as a linear find for every catalog id and undefined for unknown ids',()=>{
  for(const row of CATALOG_INDICATORS)expect(catalogDefinition(row.id)).toBe(CATALOG_INDICATORS.find(item=>item.id===row.id));
  expect(catalogDefinition('no-such-indicator')).toBeUndefined();
 });
});

describe('CRASH-DIAG-1028 calculationBars memo (applied by PERF4)',()=>{
 const bars=Array.from({length:10},(_,i)=>({time:1700000000+i*86400,open:10+i,high:11+i,low:9+i,close:10.5+i,volume:100}));
 it('calculationBarsForStyle still throws for Renko on 10 bars, and the actual App memo body returns no calculation bars instead',()=>{
  const options=derivedCalculationOptions('renko',undefined,0.01,true);
  expect(()=>calculationBarsForStyle(bars as never,'renko',options)).toThrow();
  const start=app.indexOf(' const calculationBars=useMemo(()=>{try{'),end=app.indexOf('\n',start);expect(start).toBeGreaterThan(0);
  const line=app.slice(start,end).trim(),deps=',[bars,workspace.chartStyle,workspace.chartTypeSettings,dataset,replay]);';
  expect(line.endsWith(deps)).toBe(true);
  const body='function memo(){return ('+line.slice('const calculationBars=useMemo('.length,line.length-deps.length)+')();}';
  const run=Function('calculationBarsForStyle','derivedCalculationOptions','isLiveDatasetId','bars','workspace','dataset','replay',stripTypeScriptTypes(body,{mode:'transform'})+';return memo();');
  const result=run(calculationBarsForStyle,derivedCalculationOptions,()=>false,bars,{chartStyle:'renko',chartTypeSettings:{}},{instrument:{tickSize:0.01},provenance:{datasetId:'synthetic:GME:1D'}},{cursor:5});
  expect(result).toEqual([]);
 });
});

describe('RI2-C-1028 notes over the screener (applied by PERF4)',()=>{
 it('opening notes from the open screener keeps the screener and stacks a notes dialog bound to that screener authority',()=>{
  expect(app).toContain("const overScreener=dialog==='screener'?dialogAuthority.current:undefined;setNoteRequest({id:crypto.randomUUID(),market,noteId,startNew,...(overScreener?{overScreener}:{})});if(!overScreener)setDialog('notes');return true;}");
  const screener=app.indexOf("dialog==='screener'&&<ScreenerDialog "),over=app.indexOf("{reuse('dialog:notes-over-screener',dialog==='screener'&&noteRequest?.overScreener===renderedDialogAuthority&&<NotesDialog ");
  expect(screener).toBeGreaterThan(0);expect(over).toBeGreaterThan(screener);// rendered after the screener, so it is on top
  expect(app.slice(over,app.indexOf('\n',over))).toContain('onClose={()=>setNoteRequest(null)}/>,dialogDeps)}');// closes only the notes layer
 });
});
