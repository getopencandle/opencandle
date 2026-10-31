import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar,BarDataset} from '../../src/domain/types';
import {ALERT_MESSAGE_PLACEHOLDER_CATALOG,alertMessageHasPlaceholders,renderAlertMessage,renderNewAlertMessages,type AlertMessageValues} from '../../src/domain/alert-message';
import {alertDatasetWithPrefix,alertSourceId,validateAlertOperands,validateAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceLabel,type TechnicalScriptOutputs} from '../../src/domain/technical-alerts';
import {calculateIndicator} from '../../src/domain/indicators';
import {createLocalAlert,processAlertEvent,validateLocalAlerts,type AlertDefinition,type LocalAlert} from '../../src/domain/alerts';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
import {STRATEGY_FILL_OUTPUT_ID,freezeStrategyConfig,strategyFillAtEndpoint} from '../../src/domain/strategy-alert';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {createTechnicalScriptEvaluator} from '../../src/ui/script-alert-evaluator';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';
import {TechnicalAlertCatalog,scriptProposesOrders} from '../../src/ui/technical-alert-catalog';
import {scriptOutputs,scriptOutputEntry} from '../../src/ui/script-outputs';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Plot, syminfo and strategy placeholders, valued at the trigger bar. SYNTHETIC bars, scripts and
// instruments only; literal expected strings; the real restricted script worker for the end-to-end strategy case.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars:Bar[]=[10,12,9,14,15].map((close,index)=>({time:1_700_000_000+index*60,open:close,high:close+1,low:close-1,close,volume:1}));
const dataset:BarDataset={instrument:{id:'inst-synth',symbol:'SYN',name:'Synthetic Corp',exchange:'LV',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'} as BarDataset['instrument'],bars,resolution:'1m',
 provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:'synthetic:SYN:1m',fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
const values:AlertMessageValues={ticker:'SYN',exchange:'LV',interval:'1m',bar:{time:1_700_000_000,open:10,high:12,low:9,close:11,volume:5},triggeredAt:1_700_000_065,instrument:dataset.instrument,
 plots:[{id:'lvplot:fast',title:'fast',value:11.25},{id:'lvplot:slow',title:'slow',value:null},{id:'lvplot:band',title:'Upper band',value:-0.5}],
 fill:{action:'sell',contracts:3,price:14.5,orderId:'script-2',positionSize:-1,prevPositionSize:2,fills:1}};

describe('placeholder rendering',()=>{
 it('plot placeholders read the trigger-bar plot values by number and exact title; unavailable ones stay verbatim',()=>{
  expect(renderAlertMessage('{{plot_0}} {{plot_1}} {{plot_2}} {{plot_3}} {{plot_01}} {{plot("fast")}} {{plot("Upper band")}} {{plot("Fast")}} {{plot("slow")}} {{plot( "fast")}}',values))
   .toBe('11.25 {{plot_1}} -0.5 {{plot_3}} {{plot_01}} 11.25 -0.5 {{plot("Fast")}} {{plot("slow")}} {{plot( "fast")}}');
  // Without recorded plots every plot placeholder stays as typed (the contract for price alerts).
  expect(renderAlertMessage('{{plot_0}} {{plot("fast")}}',{...values,plots:null})).toBe('{{plot_0}} {{plot("fast")}}');
 });
 it('syminfo placeholders read the instrument record; a crypto pair supplies its base currency',()=>{
  expect(renderAlertMessage('{{syminfo.ticker}} {{syminfo.tickerid}} {{syminfo.prefix}} {{syminfo.description}} {{syminfo.currency}} {{syminfo.type}} {{syminfo.mintick}} {{syminfo.timezone}} {{syminfo.basecurrency}} {{syminfo.unknown}}',values))
   .toBe('SYN LV:SYN LV Synthetic Corp USD stock 0.01 America/New_York {{syminfo.basecurrency}} {{syminfo.unknown}}');
  const crypto={...dataset.instrument,symbol:'BTC-USD',assetClass:'crypto' as const};
  expect(renderAlertMessage('{{syminfo.basecurrency}}',{...values,instrument:crypto})).toBe('BTC');
  expect(renderAlertMessage('{{syminfo.basecurrency}}',{...values,instrument:{...crypto,symbol:'ETHUSD'}})).toBe('ETH');
  expect(renderAlertMessage('{{syminfo.basecurrency}}',{...values,instrument:{...crypto,symbol:'ETH-EUR'}})).toBe('{{syminfo.basecurrency}}');
  expect(renderAlertMessage('{{syminfo.currency}}',{...values,instrument:null})).toBe('{{syminfo.currency}}');
 });
 it('strategy placeholders read the fill on the trigger bar, and stay verbatim on other alerts',()=>{
  const template='{{strategy.order.action}} {{strategy.order.contracts}} @ {{strategy.order.price}} id={{strategy.order.id}} pos={{strategy.position_size}} {{strategy.market_position}} {{strategy.market_position_size}} prev={{strategy.prev_market_position}} {{strategy.prev_market_position_size}} {{strategy.order.comment}}';
  expect(renderAlertMessage(template,values)).toBe('sell 3 @ 14.5 id=script-2 pos=-1 short 1 prev=long 2 {{strategy.order.comment}}');
  expect(renderAlertMessage('{{strategy.market_position}}',{...values,fill:{...values.fill!,positionSize:0}})).toBe('flat');
  expect(renderAlertMessage('{{strategy.order.action}} {{strategy.position_size}}',{...values,fill:null})).toBe('{{strategy.order.action}} {{strategy.position_size}}');
 });
 it('a value is never rescanned, and the older placeholders are unchanged',()=>{
  // A quoted title cannot hold braces: the inner {{close}} is an ordinary placeholder of the template, rendered once.
  expect(renderAlertMessage('{{plot("{{close}}")}}{{plot_0}}',{...values,plots:[{id:'p',title:'{{close}}',value:1}]})).toBe('{{plot("11")}}1');
  expect(renderAlertMessage('{{strategy.order.id}}{{close}}',{...values,fill:{...values.fill!,orderId:'{{close}}'}})).toBe('{{close}}11');
  expect(renderAlertMessage('{{ticker}} {{close}} {{ close }} {{Close}}',values)).toBe('SYN 11 {{ close }} {{Close}}');
  expect(alertMessageHasPlaceholders('a {{plot("x")}}')).toBe(true);expect(alertMessageHasPlaceholders('a {{strategy.order.action}}')).toBe(true);expect(alertMessageHasPlaceholders('{{ x }}')).toBe(false);
  expect(alertMessageHasPlaceholders('{{plot_0}}')).toBe(true);expect(alertMessageHasPlaceholders('{{plot_0}}')).toBe(true);
 });
 it('the picker catalog lists every rendered placeholder once',()=>{
  const tokens=ALERT_MESSAGE_PLACEHOLDER_CATALOG.map(row=>row.token);
  expect(new Set(tokens).size).toBe(tokens.length);
  for(const token of ['{{ticker}}','{{close}}','{{timenow}}','{{plot_0}}','{{plot("Title")}}','{{syminfo.currency}}','{{strategy.order.action}}','{{strategy.order.contracts}}','{{strategy.order.price}}','{{strategy.position_size}}','{{strategy.market_position}}'])expect(tokens).toContain(token);
  const rendered=renderAlertMessage(tokens.join('|'),{...values,plots:[{id:'t',title:'Title',value:2}],instrument:{...dataset.instrument,symbol:'BTC-USD',assetClass:'crypto'}});
  expect(rendered.includes('{{')).toBe(false);
 });
});

describe('plot values travel with the technical sample',()=>{
 it('an indicator operand records every plot of its calculation at the endpoint, in plot order',async()=>{
  const source=captureIndicatorAlertSource({id:'SYNTHETIC volume',kind:'volume',inputs:{length:2},plots:{},offset:0,visible:true},'volume','standard','SYNTHETIC volume snapshot');
  const batch=await evaluateTechnicalAlertSources(bars,[source],'USD'),left=[...batch.results.values()][0].sample.operands!.left;
  const expected=calculateIndicator('volume',bars,source.inputs).series.map(plot=>({id:plot.id,title:plot.label,value:plot.values.at(-1)??null}));
  expect(expected.length).toBeGreaterThan(1);
  expect(left.plots).toEqual(expected);
  expect(()=>validateAlertOperands({left},false)).not.toThrow();
 });
 it('a script operand records the script plots at the endpoint; a price operand records none',async()=>{
  const script:AlertSourceSnapshot={kind:'script',instanceId:'binding-1',snapshotId:'snap-1',title:'Two lines',source:'({onBar(ctx){}})',inputs:{},output:'plot',outputId:'lvplot:slow',transformId:'standard'};
  const outputs:TechnicalScriptOutputs={plots:[{id:'lvplot:fast',values:bars.map(bar=>({time:bar.time,value:bar.close*2}))},{id:'lvplot:slow',values:bars.map((bar,index)=>({time:bar.time,value:index===4?null:bar.close}))}],conditions:[],alerts:[]};
  const batch=await evaluateTechnicalAlertSources(bars,[script,{kind:'price',field:'close',transformId:'standard'}],'USD',{evaluateScript:async()=>outputs});
  const [scriptRow,priceRow]=[...batch.results.values()];
  expect(scriptRow.sample.operands!.left.plots).toEqual([{id:'lvplot:fast',title:'fast',value:30},{id:'lvplot:slow',title:'slow',value:null}]);
  expect(priceRow.sample.operands!.left).not.toHaveProperty('plots');
 });
 it('malformed plot and fill records are refused',()=>{
  const left={value:1,unit:'u',basis:'b',label:'l'};
  for(const plots of [[{id:'a',title:'a',value:Infinity}],[{id:'',title:'a',value:1}],[{id:'a',title:'a',value:1,extra:1}],Array.from({length:65},(_,i)=>({id:'p'+i,title:'p'+i,value:i})),{}])expect(()=>validateAlertOperands({left:{...left,plots}},false)).toThrow();
  for(const fill of [{...values.fill,action:'hold'},{...values.fill,contracts:0},{...values.fill,price:-1},{...values.fill,fills:0},{...values.fill,extra:1},{action:'buy'}])expect(()=>validateAlertOperands({left:{...left,fill}},false)).toThrow();
  expect(()=>validateAlertOperands({left:{...left,fill:values.fill}},false)).not.toThrow();
 });
});

const strategyCode=`({onBar(ctx){ctx.plot('fast',ctx.bar.close);ctx.plot('slow',ctx.bar.close-1);if(ctx.bar.close===12)ctx.order('buy',2);if(ctx.bar.close===14)ctx.order('sell',2);}})`;
const fillSource=(strategy=freezeStrategyConfig(DEFAULT_STRATEGY_CONFIG,'standard')):Extract<AlertSourceSnapshot,{kind:'script'}>=>({kind:'script',instanceId:'binding-s',snapshotId:'snap-s',title:'Cross strategy',source:strategyCode,inputs:{},output:'fill',outputId:STRATEGY_FILL_OUTPUT_ID,transformId:'standard',strategy});

describe('strategy order-fill sources',()=>{
 it('freeze the Strategy tester properties for their own transform; other outputs cannot carry them',()=>{
  const source=fillSource();
  expect(()=>validateAlertSource(source)).not.toThrow();
  expect(alertSourceId(source)).toBe(JSON.stringify(['script','binding-s','snap-s','fill:order-fills']));
  expect(technicalSourceLabel(source)).toBe('Script Cross strategy: strategy order fills');
  expect(()=>validateAlertSource({...source,strategy:undefined})).toThrow();
  expect(()=>validateAlertSource({...source,transformId:'heikinashi'})).toThrow(/another chart transform/);
  expect(()=>validateAlertSource({...source,strategy:{...source.strategy!,initialCapital:-1}})).toThrow(/invalid/);
  expect(()=>validateAlertSource({...source,strategy:{...source.strategy!,secret:1} as never})).toThrow(/unsupported field/);
  expect(()=>validateAlertSource({...source,outputId:'other'})).toThrow();
  expect(()=>validateAlertSource({...source,output:'plot'})).toThrow();
  expect(freezeStrategyConfig(DEFAULT_STRATEGY_CONFIG,'heikinashi').chartType).toBe('heikin-ashi');
  expect(scriptProposesOrders(strategyCode)).toBe(true);expect(scriptProposesOrders('({onBar(ctx){ctx.plot("a",1);}})')).toBe(false);
 });
 it('read 1 with the fill on a bar where a virtual order filled, else 0 with no fill',()=>{
  const ids=bars.map((_,index)=>'bar-'+index),orders=[{sequence:1,side:'buy',quantity:2,event:{id:'bar-1',time:bars[1].time,revision:1},virtual:true},{sequence:2,side:'sell',quantity:2,event:{id:'bar-3',time:bars[3].time,revision:1},virtual:true}];
  const config=freezeStrategyConfig(DEFAULT_STRATEGY_CONFIG,'standard');
  const at=(end:number)=>strategyFillAtEndpoint({orders:orders.filter(order=>ids.indexOf(order.event.id)<end),bars:bars.slice(0,end),barIds:ids.slice(0,end),standardBars:bars.slice(0,end),config});
  // Market proposals fill on the next supplied bar open (closes 10,12,9,14,15; open equals close in this fixture).
  expect(at(2)).toEqual({fill:null,diagnostics:[]});
  expect(at(3)).toEqual({fill:{action:'buy',contracts:2,price:9,orderId:'script-1',positionSize:2,prevPositionSize:0,fills:1},diagnostics:[]});
  expect(at(4).fill).toBeNull();
  expect(at(5)).toEqual({fill:{action:'sell',contracts:2,price:15,orderId:'script-2',positionSize:0,prevPositionSize:2,fills:1},diagnostics:[]});
  expect(strategyFillAtEndpoint({orders:[{...orders[0],event:{id:'elsewhere',time:1,revision:1}}],bars,barIds:ids,standardBars:bars,config}).diagnostics[0]).toMatch(/not accepted/);
 });
 it('end to end on the real restricted worker: the notification message names the fill, the position and the plots of the trigger bar',async()=>{
  const jobs=new ScriptJobs(),bridge={executeScript:(value:any)=>jobs.run(value),cancel:async({requestId}:{requestId:string})=>({ok:true as const,value:{cancelled:jobs.cancel(requestId)}})} as any,queue=new ScriptJobQueue();
  const evaluator=createTechnicalScriptEvaluator({dataset,execute:input=>executeScriptOnBars({...input,bridge,queue})});
  try{
   const observer=new TechnicalAlertObserver(()=>'synthetic-session',()=>Promise.resolve()),selected=fillSource();
   const template='{{ticker}} {{strategy.order.action}} {{strategy.order.contracts}} @ {{strategy.order.price}} -> {{strategy.market_position}} {{strategy.position_size}} (was {{strategy.prev_market_position}}) fast={{plot_0}} slow={{plot("slow")}} close={{close}} {{syminfo.currency}}';
   let alerts:LocalAlert[]=[];const messages:string[]=[];
   for(let end=1;end<=bars.length;end++){
    const prefix=bars.slice(0,end),data=alertDatasetWithPrefix(dataset,prefix),view=await observer.observe({dataset:data,bars:prefix,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:selected,alerts,script:evaluator},1_800_000_000+end);
    expect(view.diagnostics).toEqual([]);
    const binding=view.selectedContext!.binding;
    if(!alerts.length){const definition:AlertDefinition={id:'alert-s',instrumentId:dataset.instrument.id,sourceId:alertSourceId(selected),name:'Strategy fills',message:template,condition:{kind:'greater',value:0},frequency:'once-per-bar',createdAt:1_700_000_000,expiresAt:null,mode:'ordinary',runId:'ordinary:snapshot:'+binding.sessionId,observationBinding:binding,conditionVersion:2};alerts=[createLocalAlert(definition)];}
    let next=alerts;for(const event of view.events)next=next.map(alert=>processAlertEvent(alert,event).alert);
    const rendered=renderNewAlertMessages(alerts,next,{dataset:data,bars:prefix});
    for(const alert of rendered)for(const item of alert.history.slice(alerts[0].history.length))messages.push(item.message);
    alerts=rendered;
   }
   expect(messages).toEqual(['SYN buy 2 @ 9 -> long 2 (was flat) fast=9 slow=8 close=9 USD','SYN sell 2 @ 15 -> flat 0 (was long) fast=15 slow=14 close=15 USD']);
   expect(alerts[0].definition.message).toBe(template);
   expect(validateLocalAlerts(alerts).ok).toBe(true);
  }finally{jobs.close();}
 },20000);
});

describe('the alert dialog offers strategy order fills for a chart strategy',()=>{
 it('a script that proposes orders adds a fill source frozen with the applied properties; without them it is disabled',()=>{
  const port={},chart={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:port} as any;
  const catalog=new TechnicalAlertCatalog((()=>{let n=0;return()=>'snapshot-'+(++n);})());
  scriptOutputs.publish(port,scriptOutputEntry({bindingId:'binding-s',title:'Cross strategy',source:strategyCode,result:{inputs:{},declarations:{inputs:[],requests:[]},conditions:[],alerts:[],plots:[{id:'lvplot:fast',title:'fast',color:'#ffffff',values:[]},{id:'lvplot:slow',title:'slow',color:'#ffffff',values:[]}]}}));
  try{
   const strategy={...DEFAULT_STRATEGY_CONFIG,initialCapital:5000};
   const rows=catalog.capture(chart,dataset,bars,[],{strategy}).filter(row=>row.id.startsWith('script:'));
   expect(rows.map(row=>row.label)).toEqual(['Script Cross strategy / fast','Script Cross strategy / slow','Script Cross strategy: strategy order fills']);
   const fill=rows[2];
   expect(fill).toMatchObject({id:'script:binding-s:fill',scriptSignal:true,strategyFill:true,plotTitles:['fast','slow']});
   expect(fill.source).toMatchObject({kind:'script',output:'fill',outputId:STRATEGY_FILL_OUTPUT_ID,transformId:'standard',strategy:{...strategy,chartType:'standard'}});
   expect(rows[0].plotTitles).toEqual(['fast','slow']);
   const disabled=catalog.capture(chart,dataset,bars,[]).find(row=>row.id==='script:binding-s:fill')!;
   expect(disabled.source).toBeNull();expect(disabled.disabledReason).toMatch(/Strategy tester properties/);
  }finally{scriptOutputs.clear(port);}
 });
});
