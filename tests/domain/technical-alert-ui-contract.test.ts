import {expect,it} from 'vitest';
import {TechnicalAlertCatalog,requireTechnicalChart,TechnicalChartWaitError,retainContinuityAfterTechnicalFailure} from '../../src/ui/technical-alert-catalog';
import {assertAlertDraftCurrent,assertAlertContextCurrent,buildAlertDefinition,rearmAlertForObservation,type AlertDraft} from '../../src/ui/AlertDialog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {captureDrawingBoundary,evaluateDrawingBoundary} from '../../src/chart/drawing-alert-geometry';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createLocalAlert,processAlertEvent,editLocalAlert,processLocalAlertBatch,validateLocalAlerts} from '../../src/domain/alerts';
import {technicalSourceKey,evaluateTechnicalAlertSources} from '../../src/domain/technical-alerts';
import {createAlertObservationSession,alertObservationContext,alertDatasetKey,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import type {ChartController} from '../../src/chart/adapter';
import type {IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
const day=1704153600,now=1791936000;
function host(){const dataset=fixtureDataset('GME',500);dataset.bars=[9,9,9].map((value,index)=>({time:day+[0,1,100][index]*86400,open:value,high:value+1,low:value-1,close:value,volume:100}));let bars=dataset.bars,style='candles',source=sourceContextForDataset(dataset,bars),reads=0;const indicators:IndicatorSnapshot[]=[{id:'s',kind:'sma',inputs:{length:2,source:'close'},plots:{},visible:true,offset:0,paneId:'price'}],drawings:Array<Record<string,unknown>>=[];
 const controller={getSourceContext:()=>source,getStyle:()=>style,getDataWindow:()=>{reads++;return{pending:false,source,series:{count:bars.length,firstTime:bars[0]?.time??null,lastTime:bars.at(-1)?.time??null,style}};},indicators:{serialize:()=>structuredClone(indicators)},saveDrawings:()=>({version:1,drawings:structuredClone(drawings)}),getChartOptions:()=>({scale:'linear'})} as unknown as ChartController;
 return{dataset,controller,indicators,drawings,reads:()=>reads,replaceBars(next:typeof bars){bars=next;dataset.bars=next;source=sourceContextForDataset(dataset,bars);},setStyle(next:string){style=next;}};
}
const draft:AlertDraft={name:'Captured test',message:'local',kind:'crossing-up',value:'10',lower:'8',upper:'12',amount:'1',bars:'1',percent:false,frequency:'every-time',expirationEnabled:false,expiresAt:''};

it('rejects a cloned but uncommitted prefix before reading indicator or renderer data',()=>{const state=host();expect(()=>requireTechnicalChart(state.controller,state.dataset,[...state.dataset.bars])).toThrow('information prefix');expect(state.reads()).toBe(0);expect(requireTechnicalChart(state.controller,state.dataset,state.dataset.bars)).toBe(state.controller);});

it('preserves a routine commit wait but clears continuity for missing or failed chart analysis',async()=>{
 const state=host();let error:unknown;try{requireTechnicalChart(state.controller,state.dataset,[...state.dataset.bars]);}catch(value){error=value;}
 expect(error).toBeInstanceOf(TechnicalChartWaitError);expect(retainContinuityAfterTechnicalFailure(error,false)).toBe(true);expect(retainContinuityAfterTechnicalFailure(error,true)).toBe(false);
 try{requireTechnicalChart(null,state.dataset,state.dataset.bars);}catch(value){error=value;}expect(retainContinuityAfterTechnicalFailure(error,false)).toBe(false);
 const failed={...state.controller,getAnalysisUnavailable:()=> 'literal native recovery failure'} as ChartController;
 try{requireTechnicalChart(failed,state.dataset,state.dataset.bars);}catch(value){error=value;}expect(String(error)).toContain('native recovery failure');expect(retainContinuityAfterTechnicalFailure(error,false)).toBe(false);expect(state.reads()).toBe(0);
 const engine=new TechnicalAlertObserver(()=> 'classification-session',()=>Promise.resolve()),input={dataset:state.dataset,bars:state.dataset.bars,chartId:'chart',replay:null,assumeReplayCompletion:false,selectedSource:{kind:'price' as const,field:'close' as const,transformId:'standard' as const},alerts:[] as ReturnType<typeof createLocalAlert>[]},first=await engine.observe(input,now),context=first.selectedContext!;
 let alert=createLocalAlert(buildAlertDefinition(draft,{id:'classification',instrumentId:context.instrumentId,now,mode:context.mode,runId:context.runId,sourceId:context.sourceId,observationBinding:context.binding}));alert=processAlertEvent(alert,first.selectedEvent!).alert;
 engine.invalidate();const appended=[...state.dataset.bars,{...state.dataset.bars[2],time:state.dataset.bars[2].time+86400,open:11,high:12,low:10,close:11}],next=await engine.observe({...input,bars:appended,alerts:[alert]},now+1);
 expect(next.selectedEvent?.observation?.continuity).toBe('gap');expect(processAlertEvent(alert,next.selectedEvent!).notification).toBeNull();
});

it('keeps a settings capture stable across offset/visibility edits and replaces it on changed numerical inputs',()=>{const state=host();let id=0;const catalog=new TechnicalAlertCatalog(()=>String(++id)),read=()=>catalog.capture(state.controller,state.dataset,state.dataset.bars,[]).find(row=>row.id==='indicator:s:sma')!.source!;
 const first=read();state.indicators[0].offset=100;state.indicators[0].visible=false;expect(read()).toEqual(first);state.indicators[0].inputs.length=3;expect(technicalSourceKey(read())).not.toBe(technicalSourceKey(first));
});

it('catalogues disabled smoothing plots explicitly and keeps decoration edits out of frozen numerical identities',()=>{
 const state=host();let id=0;const catalog=new TechnicalAlertCatalog(()=>String(++id)),read=()=>catalog.capture(state.controller,state.dataset,state.dataset.bars,[]);const original=read().find(row=>row.id==='indicator:s:sma')!.source!;
 expect(read().find(row=>row.id==='indicator:s:smooth')).toMatchObject({source:null,disabledReason:expect.stringMatching(/disabled/)});
 state.indicators[0].presentation=defaultIndicatorPresentation('sma');state.indicators[0].presentation.fills.smoothing!.opacity=66;expect(read().find(row=>row.id==='indicator:s:sma')!.source).toEqual(original);
 state.indicators[0].inputs={...state.indicators[0].inputs,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:3};const enabled=read().find(row=>row.id==='indicator:s:smoothUpper')!.source!;expect(enabled).toMatchObject({kind:'indicator',plotId:'smoothUpper',inputs:{smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:3}});const key=technicalSourceKey(enabled);state.indicators[0].presentation.fills.smoothing!.visible=false;state.indicators[0].offset=-3;expect(technicalSourceKey(read().find(row=>row.id==='indicator:s:smoothUpper')!.source!)).toBe(key);
});

it('rejects stale edits/deletes and source recaptures while retaining an explicit legacy rearm history',()=>{const state=host(),session=createAlertObservationSession(state.dataset,{sessionId:'new',mode:'ordinary',startedAt:now,version:2,chartId:'chart'}),context=alertObservationContext(session,state.dataset),definition=buildAlertDefinition(draft,{id:'test',instrumentId:context.instrumentId,now,mode:context.mode,runId:context.runId,sourceId:context.sourceId,observationBinding:context.binding}),alert=createLocalAlert(definition);
 expect(definition.conditionVersion).toBe(2);expect(assertAlertDraftCurrent([alert],'test',1)).toBe(alert);expect(()=>assertAlertDraftCurrent([editLocalAlert(alert,{name:'Changed'},now+1)],'test',1)).toThrow('settings changed');expect(()=>assertAlertContextCurrent({...context.binding,chartId:'other'},context)).toThrow('source');
 const legacySession=createAlertObservationSession(state.dataset,{sessionId:'old',mode:'ordinary',startedAt:now}),legacyContext=alertObservationContext(legacySession,state.dataset),legacy=createLocalAlert({...definition,conditionVersion:1,runId:legacyContext.runId,observationBinding:legacyContext.binding});
 const rearmed=rearmAlertForObservation(legacy,context,now+1,'new-alert');expect(rearmed.definition.conditionVersion).toBe(2);expect(legacy.definition.observationBinding?.schemaVersion).toBe(1);expect(legacy.history).toEqual([]);
});

it('captures irregular-time lines in logical spacing and keeps identity stable on append or color changes',async()=>{
 const state=host();state.drawings.push({id:'line',type:'trendline',paneId:'price',anchors:[{time:state.dataset.bars[0].time*1000,price:10},{time:state.dataset.bars[2].time*1000,price:14}],style:{extendRight:true,lineColor:'#fff'}});
 const capture=captureDrawingBoundary(state.drawings[0],state.dataset.bars,{source:sourceContextForDataset(state.dataset),style:'candles',scale:'linear'});expect(capture.ok).toBe(true);if(!capture.ok)return;expect(evaluateDrawingBoundary(capture.snapshot,1)).toEqual({ok:true,boundaryPrice:12});
 let id=0;const catalog=new TechnicalAlertCatalog(()=>String(++id)),read=()=>catalog.capture(state.controller,state.dataset,state.dataset.bars,[]).find(row=>row.id==='drawing:line')!.source!;
 const first=read();(state.drawings[0].style as Record<string,unknown>).lineColor='#000';expect(read()).toEqual(first);
 state.replaceBars([...state.dataset.bars,{...state.dataset.bars[2],time:day+101*86400,close:17,open:17,high:18,low:16}]);expect(read()).toEqual(first);
 const calculated=await evaluateTechnicalAlertSources(state.dataset.bars,[first],'USD',{sourceBasis:alertDatasetKey(state.dataset,2),sourceRevision:state.dataset.provenance.revision});expect(calculated.results.get(technicalSourceKey(first))!.sample.operands).toMatchObject({left:{value:17},right:{value:16}});
});

it('makes changed drawing time grids unavailable and rejects requested log capture',async()=>{
 const state=host(),record={id:'ray',type:'ray',paneId:'price',anchors:[{time:state.dataset.bars[0].time*1000,price:10},{time:state.dataset.bars[2].time*1000,price:14}]};
 expect(captureDrawingBoundary(record,state.dataset.bars,{source:sourceContextForDataset(state.dataset),style:'candles',scale:'logarithmic'}).ok).toBe(false);
 const captured=captureDrawingBoundary(record,state.dataset.bars,{source:sourceContextForDataset(state.dataset),style:'candles',scale:'linear'});if(!captured.ok)throw new Error(captured.diagnostics.join());
 const source:AlertSourceSnapshot={kind:'drawing-boundary',instanceId:'ray',snapshotId:'ray',geometry:captured.snapshot,mutationPolicy:'frozen'},bars=[state.dataset.bars[0],{...state.dataset.bars[1],time:day+43200},...state.dataset.bars.slice(1)];
 const result=await evaluateTechnicalAlertSources(bars,[source],'USD',{sourceBasis:alertDatasetKey(state.dataset,2),sourceRevision:'1'});expect(result.results.get(technicalSourceKey(source))?.sample.value).toBeNull();expect(result.results.get(technicalSourceKey(source))?.diagnostics.join()).toContain('grid changed');
});

it('pauses an over-budget publication without pruning a valid previous notification history',async()=>{
 const state=host(),engine=new TechnicalAlertObserver(()=> 'session',()=>Promise.resolve()),view=await engine.observe({dataset:state.dataset,bars:state.dataset.bars,chartId:'chart',replay:null,assumeReplayCompletion:false,selectedSource:{kind:'price',field:'close',transformId:'standard'},alerts:[]},now);
 const context=view.selectedContext!;
 const collection=Array.from({length:900},(_,index)=>createLocalAlert(buildAlertDefinition({...draft,message:'\u20ac'.repeat(4000),kind:'greater',value:'0'},{id:'a'+index,instrumentId:context.instrumentId,now,mode:context.mode,runId:context.runId,sourceId:context.sourceId,observationBinding:context.binding})));
 collection[0]=processAlertEvent(collection[0],view.selectedEvent!).alert;
 expect(validateLocalAlerts(collection).ok).toBe(true);const originalHistory=structuredClone(collection[0].history);
 const result=processLocalAlertBatch(collection,[{...view.selectedEvent!,sequence:2,time:now+1,availableAt:now+1,observation:{...view.selectedEvent!.observation!,observedAt:now+1}}],now+1);
 expect(result.alerts.every(item=>item.status==='paused')).toBe(true);expect(result.alerts[0].history).toEqual(originalHistory);expect(result.alerts.slice(1).every(item=>item.history.length===0)).toBe(true);expect(result.diagnostics.join(' ')).toContain('History is unchanged');
 expect(validateLocalAlerts(result.alerts).ok).toBe(true);
});
