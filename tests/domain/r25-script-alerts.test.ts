import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar,BarDataset} from '../../src/domain/types';
import {alertDatasetWithPrefix,alertSourceId,validateAlertSource,validateTechnicalAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalSourceLabel,type TechnicalScriptOutputs} from '../../src/domain/technical-alerts';
import {createLocalAlert,processAlertEvent,type AlertDefinition} from '../../src/domain/alerts';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {createTechnicalScriptEvaluator} from '../../src/ui/script-alert-evaluator';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';
import {scriptOutputs,scriptOutputEntry} from '../../src/ui/script-outputs';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Script alert conditions through the existing alert source, observer and alert lifecycle. SYNTHETIC data.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars:Bar[]=[10,12,9,14,15].map((close,index)=>({time:1_700_000_000+index*60,open:close,high:close+1,low:close-1,close,volume:1}));
const dataset:BarDataset={instrument:{id:'inst-synth',symbol:'SYN',name:'Synthetic',exchange:'LV',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'} as BarDataset['instrument'],bars,resolution:'1m',
 provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:'synthetic:SYN:1m',fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
const code=`({inputs:{level:{type:'float',default:11}},onBar(ctx){const up=ctx.bar.close>ctx.input('level');ctx.alertcondition('Above level',up,'Close above the level');if(up)ctx.alert('breakout','Close '+ctx.bar.close);ctx.plot('Close',ctx.bar.close);}})`;
const script=(output:'condition'|'alert'|'plot',outputId:string,inputs:Record<string,number>={level:11}):AlertSourceSnapshot=>({kind:'script',instanceId:'binding-1',snapshotId:'snap-1',title:'Breakout',source:code,inputs,output,outputId,transformId:'standard'});
function realEvaluator(){
 const jobs=new ScriptJobs(),bridge={executeScript:(value:any)=>jobs.run(value),cancel:async({requestId}:{requestId:string})=>({ok:true as const,value:{cancelled:jobs.cancel(requestId)}})} as any,queue=new ScriptJobQueue();
 return{jobs,evaluator:createTechnicalScriptEvaluator({dataset,execute:input=>executeScriptOnBars({...input,bridge,queue})})};
}

describe(' script alert source contract',()=>{
 it('accepts a frozen script source and refuses malformed or oversize ones',()=>{
  const source=script('condition','Above level');
  expect(()=>validateTechnicalAlertSource(source)).not.toThrow();
  expect(alertSourceId(source)).toBe(JSON.stringify(['script','binding-1','snap-1','condition:Above level']));
  expect(technicalSourceLabel(source)).toBe('Script Breakout: condition "Above level"');
  expect(()=>validateAlertSource({...source,output:'orders'})).toThrow('Invalid script alert source');
  expect(()=>validateAlertSource({...source,source:'x'.repeat(65537)})).toThrow('Invalid script alert source');
  expect(()=>validateAlertSource({...source,extra:1})).toThrow();
  expect(()=>validateAlertSource({...source,inputs:{level:{nested:1}}})).toThrow();
 });
});

describe(' script alert evaluation',()=>{
 it('reads condition, ctx.alert and plot outputs at the prefix endpoint from one script run',async()=>{
  let runs=0;const outputs:TechnicalScriptOutputs={plots:[{id:'lvplot:Close',values:bars.map(row=>({time:row.time,value:row.close}))}],conditions:[{title:'Above level',values:bars.map((row,index)=>({time:row.time,value:index===4?1:0}))}],alerts:[{name:'breakout',event:{time:bars[4].time}}]};
  const batch=await evaluateTechnicalAlertSources(bars,[script('condition','Above level'),script('alert','breakout'),script('alert','never'),script('plot','lvplot:Close')],'USD',{evaluateScript:async request=>{runs++;expect(request.bars).toHaveLength(5);expect(request.inputs).toEqual({level:11});return outputs;}});
  const values=[...batch.results.values()].map(row=>row.sample.value);
  expect(values).toEqual([1,1,0,15]);expect(runs).toBe(1);
 });
 it('without the owned evaluator the batch fails closed, and an over-limit prefix reads unavailable',async()=>{
  await expect(evaluateTechnicalAlertSources(bars,[script('condition','Above level')],'USD')).rejects.toThrow('owned script evaluator');
  const long=Array.from({length:5001},(_,index)=>({time:1_700_000_000+index*60,open:10,high:11,low:9,close:10,volume:1}));
  const batch=await evaluateTechnicalAlertSources(long,[script('condition','Above level')],'USD',{evaluateScript:async()=>{throw new Error('must not run');}});
  const row=[...batch.results.values()][0];expect(row.sample.value).toBeNull();expect(row.diagnostics[0]).toContain('5000-bar script limit');
 });
 it('the real restricted worker drives an alert on a script condition: it fires on the first bar the condition is true',async()=>{
  const {jobs,evaluator}=realEvaluator();
  try{
   const observer=new TechnicalAlertObserver(()=>'synthetic-session',()=>Promise.resolve()),source=script('condition','Above level');
   let alert:ReturnType<typeof createLocalAlert>|null=null;const fired:number[]=[];
   for(let end=1;end<=bars.length;end++){
    const prefix=bars.slice(0,end),view=await observer.observe({dataset:alertDatasetWithPrefix(dataset,prefix),bars:prefix,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:alert?[alert]:[],script:evaluator},1_800_000_000+end);
    expect(view.diagnostics).toEqual([]);
    const binding=view.selectedContext!.binding;
    if(!alert){const definition:AlertDefinition={id:'alert-1',instrumentId:dataset.instrument.id,sourceId:alertSourceId(source),name:'Breakout',message:'Above level',condition:{kind:'crossing-up',value:0.5},frequency:'every-time',createdAt:1_700_000_000,expiresAt:null,mode:'ordinary',runId:'ordinary:snapshot:'+binding.sessionId,observationBinding:binding,conditionVersion:2};alert=createLocalAlert(definition);}
    for(const event of view.events){const result=processAlertEvent(alert!,event);alert=result.alert;if(result.notification)fired.push(end);}
   }
   // closes 10,12,9,14,15 against level 11: true on bars 2, 4 and 5; crossing up fires on bars 2 and 4 only.
   expect(fired).toEqual([2,4]);
  }finally{jobs.close();}
 },20000);
 it('frozen inputs travel with the alert: the same source with another level is a different calculation',async()=>{
  const {jobs,evaluator}=realEvaluator();
  try{
   const batch=await evaluateTechnicalAlertSources(bars,[script('condition','Above level',{level:11}),script('condition','Above level',{level:20})],'USD',{evaluateScript:request=>evaluator.evaluate(request)});
   expect([...batch.results.values()].map(row=>row.sample.value)).toEqual([1,0]);
  }finally{jobs.close();}
 },20000);
});

describe(' alert dialog sources come from the chart scripts',()=>{
 it('each script instance offers its conditions, ctx.alert names and plots, frozen with its inputs',()=>{
  const port={},chart={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:port} as any;
  const catalog=new TechnicalAlertCatalog((()=>{let n=0;return()=>'snapshot-'+(++n);})());
  const empty=catalog.capture(chart,dataset,bars,[]).find(row=>row.id==='unavailable-script')!;
  expect(empty.source).toBeNull();expect(empty.disabledReason).toContain('Add a script to this chart');
  scriptOutputs.publish(port,scriptOutputEntry({bindingId:'binding-1',title:'Breakout',source:code,result:{inputs:{level:11},declarations:{inputs:[],requests:[]},conditions:[{id:'lvcond:Above level',title:'Above level',message:'m',values:[]}],alerts:[{name:'breakout'}],plots:[{id:'lvplot:Close',title:'Close',color:'#ffffff',values:[]}]}}));
  try{
   const rows=catalog.capture(chart,dataset,bars,[]).filter(row=>row.id.startsWith('script:'));
   expect(rows.map(row=>row.label)).toEqual(['Script Breakout: condition "Above level"','Script Breakout: any ctx.alert "breakout"','Script Breakout / Close']);
   expect(rows.map(row=>row.scriptSignal??false)).toEqual([true,true,false]);
   expect(rows[0].source).toMatchObject({kind:'script',source:code,inputs:{level:11},output:'condition',outputId:'Above level',transformId:'standard'});
  }finally{scriptOutputs.clear(port);}
 });
});
