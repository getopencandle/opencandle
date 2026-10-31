import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar,BarDataset} from '../../src/domain/types';
import {alertDatasetWithPrefix,alertSourceId,validateAlertOperands,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,type TechnicalScriptOutputs} from '../../src/domain/technical-alerts';
import {createLocalAlert,processAlertEvent,type AlertDefinition} from '../../src/domain/alerts';
import {alertNotificationBody} from '../../src/domain/alert-delivery';
import {SCRIPT_ALERT_MESSAGE_LIMIT,sanitizeScriptAlertMessage,withScriptAlertMessage} from '../../src/domain/script-alert-message';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {createTechnicalScriptEvaluator} from '../../src/ui/script-alert-evaluator';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';

// (follow-up): the dynamic ctx.alert(name, message) text reaches the notification, sanitized and
// length-capped. SYNTHETIC bars and scripts; the real restricted worker for the end-to-end case.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars:Bar[]=[10,12,9,14,15].map((close,index)=>({time:1_700_000_000+index*60,open:close,high:close+1,low:close-1,close,volume:1}));
const dataset:BarDataset={instrument:{id:'inst-synth',symbol:'SYN',name:'Synthetic',exchange:'LV',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'} as BarDataset['instrument'],bars,resolution:'1m',
 provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:'synthetic:SYN:1m',fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
const code=`({onBar(ctx){if(ctx.bar.close>11)ctx.alert('breakout','Close '+ctx.bar.close+' above 11\\u202e\\n{{close}}');}})`;
const source=(outputId='breakout'):AlertSourceSnapshot=>({kind:'script',instanceId:'binding-1',snapshotId:'snap-1',title:'Breakout',source:code,inputs:{},output:'alert',outputId,transformId:'standard'});

describe('sanitizing the dynamic message',()=>{
 it('drops control and bidi characters, folds whitespace, neutralizes placeholders and caps the length',()=>{
  expect(sanitizeScriptAlertMessage('  Close\r\n 15\tup\u0007 ')).toBe('Close 15 up');
  expect(sanitizeScriptAlertMessage('a\u202eb\u2066c\u200bd')).toBe('a b c d');
  expect(sanitizeScriptAlertMessage('at {{close}}')).toBe('at { {close} }');
  for(const empty of ['',' \n\t',null,undefined,42,{}])expect(sanitizeScriptAlertMessage(empty)).toBeNull();
  const long=sanitizeScriptAlertMessage('x'.repeat(1000))!;
  expect(long).toHaveLength(SCRIPT_ALERT_MESSAGE_LIMIT);expect(long.endsWith('\u2026')).toBe(true);expect(SCRIPT_ALERT_MESSAGE_LIMIT).toBe(200);
 });
 it('the notification message keeps the alert message and adds the script text on its own line',()=>{
  expect(withScriptAlertMessage('Breakout',' Close 15 ')).toBe('Breakout\nClose 15');
  expect(withScriptAlertMessage('','Close 15')).toBe('Close 15');
  expect(withScriptAlertMessage('Breakout',null)).toBe('Breakout');
  expect(withScriptAlertMessage('m'.repeat(3999),'Close 15')).toHaveLength(4000);
 });
 it('an operand may carry a short message; anything else is refused',()=>{
  const left={value:1,unit:'script signal (1 true, 0 false)',basis:'b',label:'l'};
  expect(()=>validateAlertOperands({left:{...left,message:'Close 15'}},false)).not.toThrow();
  expect(()=>validateAlertOperands({left},false)).not.toThrow();
  for(const message of ['',42,'x'.repeat(SCRIPT_ALERT_MESSAGE_LIMIT+1)])expect(()=>validateAlertOperands({left:{...left,message}},false)).toThrow();
 });
});

describe('the endpoint ctx.alert message travels with the sample',()=>{
 const outputs:TechnicalScriptOutputs={plots:[],conditions:[],alerts:[{name:'breakout',message:'old',event:{time:bars[3].time}},{name:'breakout',message:'Close\n15',event:{time:bars[4].time}},{name:'other',message:'not this one',event:{time:bars[4].time}}]};
 const run=(prefix:Bar[],sources:AlertSourceSnapshot[])=>evaluateTechnicalAlertSources(prefix,sources,'USD',{evaluateScript:async()=>outputs});
 it('a ctx.alert that fired on the endpoint bar carries its sanitized message; other names and plots carry none',async()=>{
  const batch=await run(bars,[source('breakout'),source('never')]),rows=[...batch.results.values()];
  expect(rows[0].sample.value).toBe(1);expect(rows[0].sample.operands!.left.message).toBe('Close 15');
  expect(rows[1].sample.value).toBe(0);expect(rows[1].sample.operands!.left).not.toHaveProperty('message');
 });
 it('a ctx.alert that fired earlier but not on the endpoint carries no message',async()=>{
  const outputsEarly:TechnicalScriptOutputs={plots:[],conditions:[],alerts:[{name:'breakout',message:'Close 14',event:{time:bars[3].time}}]};
  const batch=await evaluateTechnicalAlertSources(bars,[source()],'USD',{evaluateScript:async()=>outputsEarly});
  const row=[...batch.results.values()][0];expect(row.sample.value).toBe(0);expect(row.sample.operands!.left).not.toHaveProperty('message');
 });
});

describe('end to end on the real restricted worker',()=>{
 it('the notification and its desktop body show the ctx.alert text, sanitized, after the alert message',async()=>{
  const jobs=new ScriptJobs(),bridge={executeScript:(value:any)=>jobs.run(value),cancel:async({requestId}:{requestId:string})=>({ok:true as const,value:{cancelled:jobs.cancel(requestId)}})} as any,queue=new ScriptJobQueue();
  const evaluator=createTechnicalScriptEvaluator({dataset,execute:input=>executeScriptOnBars({...input,bridge,queue})});
  try{
   const observer=new TechnicalAlertObserver(()=>'synthetic-session',()=>Promise.resolve()),selected=source();
   let alert:ReturnType<typeof createLocalAlert>|null=null;const messages:string[]=[];let body='';
   for(let end=1;end<=bars.length;end++){
    const prefix=bars.slice(0,end),view=await observer.observe({dataset:alertDatasetWithPrefix(dataset,prefix),bars:prefix,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:selected,alerts:alert?[alert]:[],script:evaluator},1_800_000_000+end);
    expect(view.diagnostics).toEqual([]);
    const binding=view.selectedContext!.binding;
    if(!alert){const definition:AlertDefinition={id:'alert-1',instrumentId:dataset.instrument.id,sourceId:alertSourceId(selected),name:'Breakout',message:'Script breakout',condition:{kind:'crossing-up',value:0.5},frequency:'every-time',createdAt:1_700_000_000,expiresAt:null,mode:'ordinary',runId:'ordinary:snapshot:'+binding.sessionId,observationBinding:binding,conditionVersion:2};alert=createLocalAlert(definition);}
    for(const event of view.events){const result=processAlertEvent(alert!,event);alert=result.alert;if(result.notification){messages.push(result.notification.message);body=alertNotificationBody({notification:result.notification} as any);}}
   }
   // closes 10,12,9,14,15: ctx.alert fires on bars 2, 4 and 5; crossing up fires on bars 2 and 4.
   expect(messages).toEqual(['Script breakout\nClose 12 above 11 { {close} }','Script breakout\nClose 14 above 11 { {close} }']);
   expect(body.startsWith('Script breakout\nClose 14 above 11 { {close} }\nValue 1 at ')).toBe(true);
  }finally{jobs.close();}
 },20000);
});
