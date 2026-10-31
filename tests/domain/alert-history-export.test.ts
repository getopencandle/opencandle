// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import {expect, it} from 'vitest';
import {alertHistoryCsv, alertHistoryCsvCell, ALERT_HISTORY_EXPORT_BYTES} from '../../src/domain/alert-history-export';
import {createLocalAlert, processAlertEvent, validateLocalAlerts, type AlertNotification, type LocalAlert} from '../../src/domain/alerts';
import {alertObservationContext, createAlertObservationSession, observeAlertSnapshot, validateAlertObservation, type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';
import {captureIndicatorAlertSource, evaluateTechnicalAlertSources, technicalSourceKey} from '../../src/domain/technical-alerts';

const now=1791979200;
function alert():LocalAlert{return createLocalAlert({id:'SYNTHETIC saved',instrumentId:'SYNTHETIC:GME',sourceId:'close',name:'current name',message:'current message',createdAt:now,expiresAt:null,mode:'ordinary',runId:'ordinary',condition:{kind:'greater',value:10},frequency:'every-time'});}
function event(changes:Partial<AlertNotification>={}):AlertNotification{return{id:'SYNTHETIC event',alertId:'SYNTHETIC saved',name:'name at trigger',message:'message at trigger',value:-2.5,at:now,barId:'SYNTHETIC bar',sequence:1,mode:'ordinary',runId:'ordinary',local:true,...changes};}
// Independent CSV reader for asserting full escaping/record structure, not a
// serialization helper under test. Files are never written by these tests.
function records(csv:string):string[][]{
  const rows:string[][]=[],row:string[]=[];let cell='',quoted=false;
  for(let i=csv.charCodeAt(0)===0xfeff?1:0;i<csv.length;i++){
    const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&c===','){row.push(cell);cell='';}
    else if(!quoted&&c==='\r'&&csv[i+1]==='\n'){row.push(cell);rows.push([...row]);row.length=0;cell='';i++;}
    else cell+=c;
  }
  expect(quoted).toBe(false);expect(cell).toBe('');return rows;
}
function objects(csv:string){const [headers,...rows]=records(csv);return rows.map(row=>{expect(row.length).toBe(headers.length);return Object.fromEntries(headers.map((key,i)=>[key,row[i]]));});}

it.each(['=1+1',' +SUM(A1)','\t-3','\r@abc','\nhello','\uFEFF=1'])('escapes spreadsheet-like text %j while retaining its bytes',text=>{expect(alertHistoryCsvCell(text)).toBe('"\''+text+'"');});
it('keeps negative numbers numeric and escapes literal quotes, commas and multiline text',()=>{
  expect(alertHistoryCsvCell(-2.5)).toBe('-2.5');expect(alertHistoryCsvCell(null)).toBe('');
  expect(alertHistoryCsvCell('a,"b"\n🟢')).toBe('"a,""b""\n🟢"');
  expect(alertHistoryCsvCell('ordinary text')).toBe('"ordinary text"');
  expect(()=>alertHistoryCsvCell(Infinity)).toThrow('invalid number');expect(()=>alertHistoryCsvCell({} as any)).toThrow('unsupported');
});
it('exports header-only empty history, UTF-8 BOM and explicit stable header names',()=>{
  const csv=alertHistoryCsv([alert()]);expect(csv.charCodeAt(0)).toBe(0xfeff);expect(records(csv)).toHaveLength(1);
  expect(records(csv)[0].slice(0,10)).toEqual(['notification_id','alert_id','observed_at_unix_seconds','sequence','alert_name_at_trigger','message_at_trigger','value','bar_id','mode','run_id']);
  expect(records(csv)[0]).toHaveLength(35);expect(csv.endsWith('\r\n')).toBe(true);
});
it('exports trigger-time metadata and honest legacy unknowns without reading current definitions',()=>{
  const row=alert();row.history=[event({message:'literal,"quoted"\nsecond line 🟢'})];
  Object.defineProperty(row,'definition',{get(){throw Error('Current definition must not supply history fields');}});
  const [result]=objects(alertHistoryCsv([row]));expect(result).toMatchObject({notification_id:'SYNTHETIC event',alert_name_at_trigger:'name at trigger',message_at_trigger:'literal,"quoted"\nsecond line 🟢',value:'-2.5',observed_at_unix_seconds:String(now),local:'true',observation_kind:'legacy-unknown',synthetic_fixture:'unknown',source_time_unix_seconds:'',source_available_at:'unknown',source_kind:'unknown',dataset_key:'',observation_semantics_version:'1'});
});
it('sorts descending local observation/sequence with saved input order for exact ties',()=>{
  const a=alert(),b=alert();a.history=[event({id:'older',at:now-1}),event({id:'equal-A',sequence:2})];b.history=[event({id:'newer',at:now+1}),event({id:'equal-B',sequence:2}),event({id:'lower-sequence'})];
  const before=JSON.stringify([a,b]);expect(objects(alertHistoryCsv([a,b])).map(row=>row.notification_id)).toEqual(['newer','equal-A','equal-B','lower-sequence','older']);expect(JSON.stringify([a,b])).toBe(before);
});
it.each(['ordinary','replay'] as const)('preserves actual %s version 1 synthetic snapshot provenance',mode=>{
  const dataset=fixtureDataset('GME',1);dataset.bars=[{time:1704153600,open:11,high:12,low:10,close:11,volume:100}];
  const session=createAlertObservationSession(dataset,{sessionId:'SYNTHETIC session',mode,startedAt:now,...mode==='replay'?{replayRunId:'SYNTHETIC replay'}:{}});
  if(mode==='replay')for(const replayRunId of [undefined,'SYNTHETIC different replay']){const refused=observeAlertSnapshot(session,{dataset,observedAt:now,replayRunId});expect(refused.event).toBeNull();expect(refused.diagnostics).toEqual(['Replay seek/run mismatch. Start a new isolated alert session.']);}
  const context=alertObservationContext(session,dataset),observed=observeAlertSnapshot(session,{dataset,observedAt:now,...mode==='replay'?{replayRunId:'SYNTHETIC replay',barIndex:0}:{}});expect(observed.diagnostics).toEqual([]);expect(observed.event).not.toBeNull();
  const local=createLocalAlert({...alert().definition,instrumentId:context.instrumentId,sourceId:context.sourceId,mode,runId:context.runId,observationBinding:context.binding});
  const triggered=processAlertEvent(local,observed.event!).alert;expect(triggered.history).toHaveLength(1);
  const [row]=objects(alertHistoryCsv([triggered]));expect(row).toMatchObject({mode,synthetic_fixture:'true',source_time_unix_seconds:'1704153600',source_available_at:'unknown',observed_at_unix_seconds:String(now),value:'11',source_kind:'price',source_session_id:'SYNTHETIC session'});
  expect(row.dataset_key).toBe(context.binding.datasetKey);expect(row.run_id).toBe(context.runId);expect(row.observation_kind).toBe(mode==='replay'?'replay-snapshot':'synthetic-fixture');
});
it('exports an admitted version 2 comparison with a calculated zero operand and its literal signed result',async()=>{
  const dataset=fixtureDataset('GME',1);dataset.bars=[{time:0,open:11,high:12,low:10,close:11,volume:0}];
  const volume=captureIndicatorAlertSource({id:'SYNTHETIC volume',kind:'volume',inputs:{length:1},plots:{},offset:0,visible:true},'volume','standard','SYNTHETIC volume snapshot');
  // Mixed-unit comparisons are explicitly supported. Supplied volume 0 minus
  // supplied close 11 is -11; these literal expectations do not use the CSV
  // serializer or comparison evaluator to derive their expected values.
  const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'SYNTHETIC zero-volume comparison',left:volume,right:{kind:'price',field:'close',transformId:'standard'}};
  const batch=await evaluateTechnicalAlertSources(dataset.bars,[source],dataset.instrument.currency);
  expect(batch.cancelled).toBe(false);const sample=batch.results.get(technicalSourceKey(source))!.sample;
  expect(sample.value).toBe(-11);expect(sample.operands).toMatchObject({left:{value:0},right:{value:11}});
  const session=createAlertObservationSession(dataset,{version:2,chartId:'SYNTHETIC comparison chart',sessionId:'SYNTHETIC comparison session',mode:'ordinary',startedAt:now,source});
  const context=alertObservationContext(session,dataset),observed=observeAlertSnapshot(session,{dataset,observedAt:now,sample});
  expect(observed.event).not.toBeNull();
  const local=createLocalAlert({...alert().definition,instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,conditionVersion:2,condition:{kind:'less',value:0}});
  const triggered=processAlertEvent(local,observed.event!).alert;expect(triggered.history).toHaveLength(1);
  const notification=triggered.history[0];expect(notification.value).toBe(-11);
  expect(notification.observation).toMatchObject({schemaVersion:2,sourceTime:0,informationStartTime:0,operands:{left:{value:0,unit:'source volume units'},right:{value:11,unit:'USD'}}});
  expect(()=>validateAlertObservation(notification.observation)).not.toThrow();
  const admitted=validateLocalAlerts([triggered]);expect(admitted.ok).toBe(true);expect(admitted.errors).toEqual([]);expect(admitted.alerts).toHaveLength(1);
  const [row]=objects(alertHistoryCsv(admitted.alerts!));
  expect(row).toMatchObject({
    value:'-11',observation_semantics_version:'2',observation_kind:'synthetic-fixture',synthetic_fixture:'true',source_kind:'comparison',
    source_time_unix_seconds:'0',information_start_unix_seconds:'0',information_end_unix_seconds:'0',source_available_at:'unknown',
    left_value:'0',left_unit:'source volume units',left_basis:'Supplied standard OHLC',left_label:'VOLUME / volume (standard)',
    right_value:'11',right_unit:'USD',right_basis:'Supplied standard OHLC',right_label:'CLOSE (standard)',
    source_session_id:'SYNTHETIC comparison session',chart_id:'SYNTHETIC comparison chart',replay_run_id:'',
  });
});
it('bounds history/alert counts before flattening oversized collections',()=>{
  const row=alert();row.history=new Array(100001);expect(()=>alertHistoryCsv([row])).toThrow('100000');expect(()=>alertHistoryCsv(new Array(10001))).toThrow('saved alert limit');expect(()=>alertHistoryCsv(null as any)).toThrow('saved alert limit');
});
it.each([{at:-1},{sequence:0.1},{local:false},{mode:'live'},{name:'x'.repeat(201)},{message:'x'.repeat(4001)},{value:NaN},{value:'12'}])('rejects invalid selected export metadata %j',change=>{
  const row=alert();row.history=[event(change as any)];expect(()=>alertHistoryCsv([row])).toThrow();
});
it('enforces the rolling UTF-8 bound without generating a retained file',()=>{
  expect(ALERT_HISTORY_EXPORT_BYTES).toBe(20971520);const row=alert(),message='🟢'.repeat(2000);
  row.history=Array.from({length:3000},(_,index)=>event({id:'SYNTHETIC-'+index,message}));
  expect(()=>alertHistoryCsv([row])).toThrow('20 MiB');expect(row.history).toHaveLength(3000);
});
