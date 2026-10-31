import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset,SessionBasis} from '../../src/domain/types';
import {createLocalAlert,restoreLocalAlerts,type AlertCondition,type AlertDefinition} from '../../src/domain/alerts';
import {LIST_ALERT_LIMITS,createListAlert,evaluateListAlert,listAlertSessionEligibility,restoreListAlerts,setListAlertPaused,validateListAlerts,type ListAlert} from '../../src/domain/watchlist-alerts';
import {addWatchList,createWatchBook,referenceFromDataset,removeWatchRows,activeWatchList,deleteWatchList,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags} from '../../src/watchlists/membership';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {defaultTheme} from '../../src/ui/themes';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';

// SYNTHETIC bars only (hand-written closes). List alerts are local behavior: members join at their next completed bar,
// removed members stop at once, and Once only completes when every current member has triggered.
const T0=1767225600,DAY=86400;let serial=0;const id=()=>'m'+(++serial);
function source(symbol:string,closes:number[],options:{session?:SessionBasis;state?:BarDataset['provenance']['state'];exchange?:string}={}):BarDataset{
 const base=fixtureDataset(symbol,closes.length),exchange=options.exchange??'NYSE';
 return{...base,resolution:'1D',instrument:{...base.instrument,id:exchange+':'+symbol,exchange},provenance:{...base.provenance,providerId:'wl-test',providerName:'Synthetic test input',datasetId:'wl:'+exchange+':'+symbol,fixture:false,session:options.session??'regular',state:options.state??'ready'},bars:closes.map((close,index)=>({time:T0+index*DAY,open:close,high:close,low:close,close,volume:1}))};
}
const grow=(dataset:BarDataset,more:number[]):BarDataset=>({...dataset,bars:[...dataset.bars,...more.map((close,index)=>({time:dataset.bars.at(-1)!.time+(index+1)*DAY,open:close,high:close,low:close,close,volume:1}))]});
function bookOf(datasets:BarDataset[],listId='L'):WatchBook{const book=addWatchList(createWatchBook([]),listId,'Mine');return addWatchMembers(book,listId,datasets.map(referenceFromDataset),id).book;}
const spec=(overrides:Partial<Parameters<typeof createListAlert>[0]>={})=>({id:'la1',listId:'L',name:'Cross 10',message:'Level reached',condition:{kind:'crossing-up',value:10} as AlertCondition,frequency:'only-once' as const,session:'regular' as const,createdAt:T0,expiresAt:null,...overrides});
const memberOf=(alert:ListAlert,symbol:string)=>alert.members.find(row=>row.key==='NYSE:'+symbol)!;

describe('schema, caps and old-package safety (list alerts are a separate collection)',()=>{
 it('validateListAlerts accepts a created alert, rejects unknown keys and unsafe values, and caps the collection',()=>{
  const a=source('AAA',[9,9]),alert=createListAlert(spec(),[],bookOf([a]),[a]);
  const ok=validateListAlerts([alert]);expect(ok.ok).toBe(true);expect(JSON.stringify(restoreListAlerts(JSON.parse(JSON.stringify([alert]))))).toBe(JSON.stringify([alert]));
  expect(validateListAlerts([{...alert,extra:1}]).ok).toBe(false);expect(validateListAlerts([{...alert,condition:{kind:'position',position:{}}}]).ok).toBe(false);expect(validateListAlerts([{...alert,condition:{kind:'crossing',value:Number.NaN}}]).ok).toBe(false);
  expect(validateListAlerts([{...alert,session:'all'}]).ok).toBe(false);expect(validateListAlerts([{...alert,members:[{...alert.members[0],extra:true}]}]).ok).toBe(false);expect(validateListAlerts('x').ok).toBe(false);
  expect(validateListAlerts([alert,alert]).ok).toBe(false);
  const many=Array.from({length:LIST_ALERT_LIMITS.alerts+1},(_,i)=>({...alert,id:'x'+i}));expect(validateListAlerts(many.slice(0,LIST_ALERT_LIMITS.alerts)).ok).toBe(true);expect(validateListAlerts(many).ok).toBe(false);
  expect(validateListAlerts(JSON.parse('[{"__proto__":{"x":1}}]')).ok).toBe(false);
 });
 it('refuses creation past 500 members or 20 alerts with a message and creates nothing',()=>{
  const a=source('AAA',[9,9]);const big=Array.from({length:LIST_ALERT_LIMITS.members+1},(_,i)=>({symbol:'S'+i,exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}));
  const bigBook=addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',big,id).book;
  expect(()=>createListAlert(spec(),[],bigBook,[])).toThrow('at most 500 symbols');
  const existing=Array.from({length:LIST_ALERT_LIMITS.alerts},(_,i)=>createListAlert(spec({id:'e'+i}),[],bookOf([a]),[a]));
  expect(()=>createListAlert(spec({id:'extra'}),existing,bookOf([a]),[a])).toThrow('at most 20 list alerts');
  expect(()=>createListAlert(spec({id:'la1'}),existing.slice(0,1).map(row=>({...row,id:'la1'})),bookOf([a]),[a])).toThrow('already exists');
  expect(()=>createListAlert(spec({listId:'nope'}),[],bookOf([a]),[a])).toThrow(/list/i);
  expect(()=>createListAlert(spec({condition:{kind:'position'} as AlertCondition}),[],bookOf([a]),[a])).toThrow(/price, channel and moving/i);
 });
 it('old-package load: a workspace with listAlerts and watchBenchmarks restores through the pre-lane restoreWorkspace, and without them is unchanged',()=>{
  const a=source('AAA',[9,9]),alert=createListAlert(spec(),[],bookOf([a]),[a]);
  const legacyScreener={columns:[{id:'symbol',metric:'symbol'}],filters:[],sort:{columnId:'symbol',direction:'asc'}};
  const screenConfiguration={...legacyScreener,universe:{resolution:'1D',currency:'USD',assets:['stock','etf'],excludedInstrumentIds:[],sourceChoices:{}},filtersHidden:false,view:'table'};
  const modernScreener={...screenConfiguration,schemaVersion:2,name:'Loaded stocks and ETFs',activeScreenId:'local-default-screen',screens:[{id:'local-default-screen',name:'Loaded stocks and ETFs',configuration:structuredClone(screenConfiguration),revision:1,savedAt:0}],recentIds:['local-default-screen'],autosave:false};
  const original:any={version:1,symbol:'GME',chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,watchlist:['GME','SPY'],drawings:{version:1,drawings:[]},indicators:[],imports:[],sourceId:null,script:{id:'test',name:'Test',source:'({onBar(){}})',pane:'price'},chartOptions:{source:'close',scale:'linear',auto:true,invert:false,timezone:'UTC'},strategy:DEFAULT_STRATEGY_CONFIG,screener:modernScreener};
  const plain=restoreWorkspace(original,original),bytes=JSON.stringify(plain);
  const withKeys=restoreWorkspace({...original,listAlerts:[alert],watchBenchmarks:{schemaVersion:1,byList:{L:'wl:NYSE:SPY'}}},original) as any;
  expect(withKeys.listAlerts).toEqual([alert]);expect(withKeys.watchBenchmarks).toEqual({schemaVersion:1,byList:{L:'wl:NYSE:SPY'}});
  const {listAlerts,watchBenchmarks,...rest}=withKeys;expect(JSON.stringify(rest)).toBe(bytes);
  // The local alert validator never sees list alerts: an alert array saved before this lane round-trips byte-identically.
  const definition:AlertDefinition={id:'old',instrumentId:'NYSE:AAA',sourceId:'close',name:'Old',message:'',condition:{kind:'greater',value:5},frequency:'every-time',createdAt:T0,expiresAt:null,mode:'ordinary',runId:'ordinary:x'};
  const saved=[createLocalAlert(definition)],before=JSON.stringify(saved);expect(JSON.stringify(restoreLocalAlerts(JSON.parse(before)))).toBe(before);
 });
});

describe('membership during evaluation',()=>{
 it('joins at the next completed bar: the baseline bar never triggers, the next bar does (hand oracle 9 then 11 crosses 10)',()=>{
  const a=source('AAA',[12,9]);let alert=createListAlert(spec(),[],bookOf([a]),[a]);const book=bookOf([a]);
  expect(memberOf(alert,'AAA')).toMatchObject({status:'active',baselineTime:T0+DAY,lastValue:9,triggers:0});
  let result=evaluateListAlert(alert,book,[a]);expect(result.notifications).toEqual([]);expect(result.alert).toEqual(alert);
  const next=grow(a,[11]);result=evaluateListAlert(alert,book,[next]);expect(result.notifications).toHaveLength(1);expect(result.notifications[0]).toMatchObject({memberKey:'NYSE:AAA',value:11,at:T0+2*DAY,message:'Level reached'});
  expect(result.alert.status).toBe('completed');expect(result.alert.statusReason).toBe('Every symbol in the list has triggered');expect(memberOf(result.alert,'AAA').status).toBe('triggered');expect(alert.status).toBe('active');
  const again=evaluateListAlert(result.alert,book,[grow(next,[5,12])]);expect(again.notifications).toEqual([]);
 });
 it('a member added after creation becomes eligible from its next completed bar; a removed member stops at once',()=>{
  const a=source('AAA',[9,9]),b=source('BBB',[9,9]),book1=bookOf([a]);let alert=createListAlert(spec({frequency:'every-time'}),[],book1,[a,b]);
  const book2=addWatchMembers(book1,'L',[referenceFromDataset(b)],id).book;
  // BBB joins now with baseline bar 9; the same call must not trigger on its history even though 11 would cross
  const bGrown=grow(b,[11]);let r=evaluateListAlert(alert,book2,[a,bGrown]);expect(r.notifications).toEqual([]);expect(memberOf(r.alert,'BBB')).toMatchObject({status:'active',baselineTime:T0+2*DAY,lastTime:T0+2*DAY,lastValue:11});
  r=evaluateListAlert(r.alert,book2,[a,grow(bGrown,[8,12])]);expect(r.notifications.map(row=>row.memberKey)).toEqual(['NYSE:BBB']);expect(r.notifications[0].value).toBe(12);
  // removed: AAA leaves the list; its later crossing is ignored and its state is dropped
  const rowId=activeWatchList(book2).rows.find(row=>row.kind==='symbol'&&row.reference.symbol==='AAA')!.id,book3=removeWatchRows(book2,'L',[rowId]);
  const after=evaluateListAlert(r.alert,book3,[grow(a,[5,12]),grow(bGrown,[8,12])]);expect(after.notifications).toEqual([]);expect(after.alert.members.map(row=>row.key)).toEqual(['NYSE:BBB']);
 });
 it('Once only completes when every current member has triggered, and removing the last waiting member completes it',()=>{
  const a=source('AAA',[9,9]),b=source('BBB',[9,9]),book=bookOf([a,b]);const alert=createListAlert(spec(),[],book,[a,b]);
  const aUp=grow(a,[11]);const r=evaluateListAlert(alert,book,[aUp,b]);expect(r.alert.status).toBe('active');expect(memberOf(r.alert,'AAA').status).toBe('triggered');expect(memberOf(r.alert,'BBB').status).toBe('active');
  const bRow=activeWatchList(book).rows.find(row=>row.kind==='symbol'&&row.reference.symbol==='BBB')!.id,smaller=removeWatchRows(book,'L',[bRow]);
  const done=evaluateListAlert(r.alert,smaller,[aUp,b]);expect(done.alert.status).toBe('completed');expect(done.alert.statusReason).toBe('Every symbol in the list has triggered');
  const both=evaluateListAlert(r.alert,book,[aUp,grow(b,[12])]);expect(both.alert.status).toBe('completed');expect(both.notifications.map(row=>row.memberKey)).toEqual(['NYSE:BBB']);
 });
 it('a member removed and re-added starts fresh',()=>{
  const a=source('AAA',[9,9]),b=source('BBB',[9,9]),c=source('CCC',[9,9]),book=bookOf([a,b,c]),alert=createListAlert(spec(),[],book,[a,b,c]);
  const bUp=grow(b,[11]),first=evaluateListAlert(alert,book,[a,bUp,c]);expect(memberOf(first.alert,'BBB').status).toBe('triggered');expect(first.alert.status).toBe('active');
  const bRow=activeWatchList(book).rows.find(row=>row.kind==='symbol'&&row.reference.symbol==='BBB')!.id,without=removeWatchRows(book,'L',[bRow]),gone=evaluateListAlert(first.alert,without,[a,bUp,c]);expect(gone.alert.members.map(row=>row.key)).toEqual(['NYSE:AAA','NYSE:CCC']);
  const back=addWatchMembers(without,'L',[referenceFromDataset(b)],id).book,fresh=evaluateListAlert(gone.alert,back,[a,bUp,c]);
  expect(memberOf(fresh.alert,'BBB')).toMatchObject({status:'active',triggers:0,lastValue:11});expect(fresh.notifications).toEqual([]);
  const again=evaluateListAlert(fresh.alert,back,[a,grow(bUp,[8,12]),c]);expect(again.notifications.map(row=>row.value)).toEqual([12]);expect(memberOf(again.alert,'BBB').status).toBe('triggered');
 });
 it('every-time frequency keeps firing per member and independent members trigger independently',()=>{
  const a=source('AAA',[9,9]),b=source('BBB',[20,20]),book=bookOf([a,b]);const alert=createListAlert(spec({frequency:'every-time',condition:{kind:'greater',value:10}}),[],book,[a,b]);
  // BBB (20,20) is above 10 already: "greater" fires on each new bar for BBB only
  const r=evaluateListAlert(alert,book,[grow(a,[9]),grow(b,[21,22])]);expect(r.notifications.map(row=>row.memberKey)).toEqual(['NYSE:BBB','NYSE:BBB']);expect(memberOf(r.alert,'BBB').triggers).toBe(2);expect(memberOf(r.alert,'AAA').triggers).toBe(0);expect(r.alert.status).toBe('active');expect(r.alert.history).toHaveLength(2);
 });
 it('channel conditions are evaluated per member (entering 10 to 20)',()=>{
  const a=source('AAA',[5,5]),book=bookOf([a]);const alert=createListAlert(spec({condition:{kind:'entering',lower:10,upper:20}}),[],book,[a]);
  const r=evaluateListAlert(alert,book,[grow(a,[6,15])]);expect(r.notifications).toHaveLength(1);expect(r.notifications[0].value).toBe(15);
 });
 it('members without data wait with a reason and never trigger; they baseline when data arrives',()=>{
  const book=addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',[{symbol:'NOPE',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false},{symbol:'GONE',exchange:'NYSE',datasetId:'wl:NYSE:GONE',dailyDatasetId:null,synthetic:false}],id).book;
  const alert=createListAlert(spec(),[],book,[]);
  expect(memberOf(alert,'NOPE')).toMatchObject({status:'waiting-for-data',reason:'No exact source is bound to this symbol.'});expect(memberOf(alert,'GONE')).toMatchObject({status:'waiting-for-data',reason:'The bound source is not loaded.'});
  const stale=source('STALE',[1,2],{state:'stale'});const staleBook=bookOf([stale]);const staleAlert=createListAlert(spec(),[],staleBook,[stale]);expect(memberOf(staleAlert,'STALE')).toMatchObject({status:'waiting-for-data',reason:'The source data is not ready.'});
  const r=evaluateListAlert(staleAlert,staleBook,[{...stale,provenance:{...stale.provenance,state:'ready'}}]);expect(memberOf(r.alert,'STALE').status).toBe('active');expect(r.notifications).toEqual([]);
 });
 it('deleting the list stops the alert with the status reason; paused alerts do not evaluate and resume with a fresh baseline; expiry follows bar time',()=>{
  const a=source('AAA',[9,9]),book=bookOf([a]),alert=createListAlert(spec(),[],book,[a]);
  const gone=deleteWatchList(book,'L','fallback');const r=evaluateListAlert(alert,gone,[grow(a,[11])]);expect(r.alert.status).toBe('stopped');expect(r.alert.statusReason).toBe('The list was deleted');expect(r.notifications).toEqual([]);
  const paused=setListAlertPaused(alert,true),skipped=evaluateListAlert(paused,book,[grow(a,[11])]);expect(skipped.notifications).toEqual([]);expect(skipped.alert.status).toBe('paused');
  const resumed=setListAlertPaused(paused,false),back=evaluateListAlert(resumed,book,[grow(a,[11])]);expect(back.notifications).toEqual([]);expect(memberOf(back.alert,'AAA').lastValue).toBe(11);
  const limited=createListAlert(spec({expiresAt:T0+2*DAY}),[],book,[a]),late=evaluateListAlert(limited,book,[grow(a,[11])]);expect(late.alert.status).toBe('expired');expect(late.notifications).toEqual([]);
 });
 it('a flagged list is a valid target and keeps its identity',()=>{
  const a=source('AAA',[9,9]);let book=setWatchFlags(createWatchBook([]),[referenceFromDataset(a)],'blue');const alert=createListAlert(spec({listId:'flag:blue'}),[],book,[a]);
  const r=evaluateListAlert(alert,book,[grow(a,[11])]);expect(r.notifications).toHaveLength(1);expect(r.alert.listId).toBe('flag:blue');
  const none=evaluateListAlert(alert,setWatchFlags(book,[referenceFromDataset(a)],null),[grow(a,[11])]);expect(none.alert.status).toBe('active');expect(none.alert.members).toEqual([]);expect(none.notifications).toEqual([]);
 });
 it('evaluates exactly the bars it is given: the closed view is the caller\'s dataset, so a forming bar left out never counts',()=>{
  const a=source('AAA',[9,9]),book=bookOf([a]),alert=createListAlert(spec(),[],book,[a]),closed=a,chartView=grow(a,[11]);
  expect(evaluateListAlert(alert,book,[closed]).notifications).toEqual([]);expect(evaluateListAlert(alert,book,[chartView]).notifications).toHaveLength(1);
 });
 it('evaluates at most 500 members of a grown list and says so',()=>{
  const book=addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',[{symbol:'S0',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book,alert=createListAlert(spec(),[],book,[]);
  const big=addWatchMembers(book,'L',Array.from({length:LIST_ALERT_LIMITS.members+10},(_,i)=>({symbol:'T'+i,exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false})),id).book,r=evaluateListAlert(alert,big,[]);
  expect(r.alert.members).toHaveLength(LIST_ALERT_LIMITS.members);expect(r.diagnostics.join(' ')).toContain('first 500 symbols');
 });
});

describe('session setting (Regular default)',()=>{
 const cases:Array<[SessionBasis,'regular'|'extended',boolean]>=[['regular','regular',true],['all','regular',true],['extended','regular',false],['unknown','regular',false],['extended','extended',true],['all','extended',true],['regular','extended',false],['unknown','extended',false]];
 for(const [basis,session,eligible] of cases)it('source '+basis+' under '+session+(eligible?' evaluates':' waits'),()=>{
  const a=source('AAA',[9,9],{session:basis}),book=bookOf([a]),alert=createListAlert(spec({session}),[],book,[a]),reason=listAlertSessionEligibility(session,basis);
  expect(reason===null).toBe(eligible);
  if(eligible){expect(memberOf(alert,'AAA').status).toBe('active');expect(evaluateListAlert(alert,book,[grow(a,[11])]).notifications).toHaveLength(1);}
  else{expect(memberOf(alert,'AAA')).toMatchObject({status:'waiting-for-data',reason});const r=evaluateListAlert(alert,book,[grow(a,[11])]);expect(r.notifications).toEqual([]);expect(memberOf(r.alert,'AAA').status).toBe('waiting-for-data');}
 });
 it('wording of the session reasons',()=>{expect(listAlertSessionEligibility('regular','extended')).toBe('This source does not separate regular-session bars.');expect(listAlertSessionEligibility('regular','unknown')).toBe('This source does not separate regular-session bars.');expect(listAlertSessionEligibility('extended','regular')).toBe('This source does not declare extended-session bars.');});
});

import {evaluateListAlerts,listAlertFromForm,listAlertNotificationToLocal,listAlertSummary} from '../../src/domain/watchlist-alerts';
describe('dialog form, batch evaluation and manager summary',()=>{
 const form={listId:'L',name:' Cross ',message:'Hit',kind:'crossing-up',value:'10.5',lower:'',upper:'',frequency:'only-once',session:'regular',expires:''};
 it('parses the dialog fields and names what is wrong',()=>{
  expect(listAlertFromForm(form,'x',T0)).toEqual({id:'x',listId:'L',name:'Cross',message:'Hit',condition:{kind:'crossing-up',value:10.5},frequency:'only-once',session:'regular',createdAt:T0,expiresAt:null});
  expect(listAlertFromForm({...form,kind:'entering',lower:'5',upper:'15',expires:'2026-02-01T00:00'},'x',T0)).toMatchObject({condition:{kind:'entering',lower:5,upper:15},expiresAt:Date.UTC(2026,1,1)/1000});
  expect(()=>listAlertFromForm({...form,value:'abc'},'x',T0)).toThrow('Enter a number for the level');expect(()=>listAlertFromForm({...form,value:''},'x',T0)).toThrow('Enter a number');
  expect(()=>listAlertFromForm({...form,kind:'entering',lower:'20',upper:'5'},'x',T0)).toThrow(/channel/i);expect(()=>listAlertFromForm({...form,expires:'tomorrow'},'x',T0)).toThrow('YYYY-MM-DDTHH:mm');expect(()=>listAlertFromForm({...form,expires:'2025-01-01T00:00'},'x',T0)).toThrow('later than');
  expect(()=>listAlertFromForm({...form,kind:'position'},'x',T0)).toThrow('price, channel and moving');expect(()=>listAlertFromForm({...form,name:'  '},'x',T0)).toThrow();expect(()=>listAlertFromForm({...form,session:'all'},'x',T0)).toThrow('Regular or Extended');
 });
 it('evaluates a collection, returns the same array when nothing changed, and summarizes a row without internal ids',()=>{
  const a=source('AAA',[9,9]),book=bookOf([a]),alert=createListAlert(spec(),[],book,[a]),alerts=[alert];
  const quiet=evaluateListAlerts(alerts,book,[a]);expect(quiet.changed).toBe(false);expect(quiet.alerts).toBe(alerts);
  const loud=evaluateListAlerts(alerts,book,[grow(a,[11])]);expect(loud.changed).toBe(true);expect(loud.notifications).toHaveLength(1);expect(loud.alerts[0].status).toBe('completed');
  expect(listAlertSummary(alert,book)).toMatchObject({name:'Cross 10',listName:'Mine',total:1,active:1,waiting:0,triggered:0});
  expect(listAlertSummary(loud.alerts[0],book)).toMatchObject({triggered:1,status:'completed'});expect(listAlertSummary(alert,deleteWatchList(book,'L','fallback')).listName).toBe('Deleted list');
 });
});
it('maps a list alert notification to the shape the delivery pipeline takes, naming the symbol',()=>{
 const a=source('AAA',[9,9]),book=bookOf([a]),alert=createListAlert(spec(),[],book,[a]),note=evaluateListAlert(alert,book,[grow(a,[11])]).notifications[0],local=listAlertNotificationToLocal(note);
 expect(local).toMatchObject({alertId:'la1',name:'Cross 10 (NYSE:AAA)',message:'Level reached',value:11,at:T0+2*DAY,mode:'ordinary',runId:'ordinary:list:la1',local:true});
});

import {renameWatchList} from '../../src/watchlists/model';
it('renaming the list keeps its alert watching it (the alert holds the list identity, not its name)',()=>{
 const a=source('AAA',[9,9]),book=bookOf([a]),alert=createListAlert(spec(),[],book,[a]),renamed=renameWatchList(book,'L','Renamed');
 const r=evaluateListAlert(alert,renamed,[grow(a,[11])]);expect(r.notifications).toHaveLength(1);expect(r.alert.listId).toBe('L');expect(listAlertSummary(r.alert,renamed).listName).toBe('Renamed');
});

import {closedViewDataset,closedViewDatasets,registerFormingBarProbe} from '../../src/domain/watchlist-alerts';
describe('closed view contract (completed bars only)',()=>{
 const live=(closes:number[],asOf:number):BarDataset=>{const base=source('AAA',closes);return{...base,provenance:{...base.provenance,delaySeconds:0,asOf}};};
 it('strips a forming last bar from a zero-delay source and leaves finished or delayed sources alone',()=>{
  // three daily bars; as-of is inside the third bar, so it is still forming
  const forming=live([9,9,11],T0+2*DAY+3600),closed=closedViewDataset(forming);
  expect(closed.bars).toHaveLength(2);expect(closed.bars.at(-1)!.close).toBe(9);expect(forming.bars).toHaveLength(3);
  const finished=live([9,9,11],T0+3*DAY);expect(closedViewDataset(finished)).toBe(finished);
  const delayed={...forming,provenance:{...forming.provenance,delaySeconds:null}};expect(closedViewDataset(delayed)).toBe(delayed);
  const set=[finished,delayed];expect(closedViewDatasets(set)).toBe(set);expect(closedViewDatasets([forming,finished])[0].bars).toHaveLength(2);
 });
 it('evaluation never triggers on the forming bar, and fires once that bar completes',()=>{
  const a0=source('AAA',[9,9]),book=bookOf([a0]),alert=createListAlert(spec(),[],book,[a0]);
  const forming=live([9,9,11],T0+2*DAY+3600),early=evaluateListAlert(alert,book,[forming]);
  expect(early.notifications).toEqual([]);expect(memberOf(early.alert,'AAA').lastTime).toBe(T0+DAY);
  const done=live([9,9,11],T0+3*DAY),late=evaluateListAlert(early.alert,book,[done]);expect(late.notifications.map(row=>row.value)).toEqual([11]);
 });
 it('a live source can plug in its own exact probe, and removing it restores the default',()=>{
  const a=source('AAA',[9,9,11]),stop=registerFormingBarProbe(dataset=>dataset.provenance.datasetId===a.provenance.datasetId);
  try{expect(closedViewDataset(a).bars).toHaveLength(2);}finally{stop();}
  expect(closedViewDataset(a)).toBe(a);
 });
});
