import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {STARTUP_QUIET_MS,createFundamentalsService,type SecCachedValue,type SecDataBridge,type SecEnvelope,type SecKind,type SecRefresh} from '../../src/fundamentals/fundamentals-service';
import {FUNDAMENTALS_TEXT,fundamentalsChartGate,fundamentalsCompany,fundamentalsLookup,setFundamentalsLoader,type FundamentalsChartFacts} from '../../src/domain/fundamentals-source';
import {demoDataMode,setDemoDataMode} from '../../src/domain/demo-mode';
import {indicatorInstanceLabels,indicatorInstanceTitle} from '../../src/ui/indicator-dialog-model';
import {buildDataWindow,formatIndicatorValue} from '../../src/ui/data-window-model';
import {calculateIndicator} from '../../src/domain/indicators';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {FUNDAMENTALS_PRESETS,FUNDAMENTALS_TABS,selectorCategoryOf,selectorView} from '../../src/domain/indicator-selector-catalog';
import {OFF_SCALE,fundamentalValueFormat} from '../../src/domain/indicators-ext/fundamentals-catalog';
import {indicatorLegendArguments,indicatorLegendTitle} from '../../src/chart/indicator-display';
import {legendMoreMenu} from '../../src/chart/legend-model';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {PIT_TEXT} from '../../src/fundamentals/pit-metrics';
import {loadedCikStore} from '../../src/fundamentals/preferences';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {CIK,ENTITY,dailyBars,flatYears,syntheticCompany,type RawCompany} from '../fixtures/fundamentals/pit-company';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';

// All company data, tickers and bars are SYNTHETIC (invented entity, CIK and numbers). The SEC bridge is a stand-in that
// records every call: "network" means any refresh mode other than cache-only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);

const CIK10=String(CIK).padStart(10,'0'),SYMBOL='SYNW';
const envelope=(cik:string|null,data:Record<string,unknown>):SecEnvelope=>({schemaVersion:1,cik,entityName:ENTITY,data,provenance:{retrievedAt:'2026-11-02T12:00:00.000Z',sourceUrl:'https://example.invalid',sha256:'0'.repeat(64)}});
const tickers=(rows:{cik:number;ticker:string}[])=>Object.fromEntries(rows.map((row,i)=>[String(i),{cik_str:row.cik,ticker:row.ticker,title:ENTITY}]));
function submissions(entityType:string,forms:string[]){
 const accn=forms.map((_,i)=>'0009990001-24-'+String(i+1).padStart(6,'0'));
 return {cik:String(CIK),name:ENTITY,entityType,filings:{recent:{accessionNumber:accn,filingDate:forms.map(()=>'2024-02-20'),form:forms,primaryDocument:forms.map(()=>'doc.htm'),acceptanceDateTime:forms.map(()=>'2024-02-20T16:30:00.000Z')},files:[]}};
}
interface Remote {tickers?:Record<string,unknown>;submissions?:Record<string,unknown>;companyfacts?:RawCompany;error?:{code:string;message:string};identity?:boolean}
/** The main process stand-in: `disk` is the saved cache, `remote` what SEC would answer. */
function fakeBridge(remote:Remote,disk:Partial<Record<SecKind,Record<string,unknown>>>={}){
 const calls:{kind:SecKind;refresh:SecRefresh}[]=[],saved=new Map<SecKind,SecEnvelope>();
 for(const [kind,data] of Object.entries(disk))saved.set(kind as SecKind,envelope(kind==='tickers'?null:CIK10,data as Record<string,unknown>));
 const bridge:SecDataBridge={
  async loadSecData({kind,refresh}){
   calls.push({kind,refresh});
   const served=(error:SecCachedValue['refreshError']):{ok:true;value:SecCachedValue}=>({ok:true,value:{envelope:saved.get(kind)??null,cachedAt:saved.has(kind)?'2026-11-01T12:00:00.000Z':null,fromCache:true,refreshError:error,resumeAt:error?.code==='RATE_LIMITED'?'2026-11-02T14:32:00.000Z':null}});
   if(refresh==='cache-only')return served(null);
   if(remote.error)return served(remote.error);
   const data=remote[kind] as Record<string,unknown>|undefined;if(!data)return served({code:'SEC_HTTP_ERROR',message:'Not found.'});
   saved.set(kind,envelope(kind==='tickers'?null:CIK10,data));return {ok:true,value:{envelope:saved.get(kind)!,cachedAt:'2026-11-02T12:00:00.000Z',fromCache:false,refreshError:null,resumeAt:null}};
  },
  async getSecIdentity(){return {ok:true,value:{set:remote.identity!==false,value:remote.identity===false?'':'Jane Doe jane@example.com'}};},
 };
 return {bridge,calls,network:()=>calls.filter(call=>call.refresh!=='cache-only')};
}
const facts=(patch:Partial<FundamentalsChartFacts>={}):FundamentalsChartFacts=>({symbol:SYMBOL,exchange:'NASDAQ',assetClass:'stock',currency:'USD',adjustment:'split-adjusted',synthetic:false,instrument:'synthetic:SYNW',...patch});
const market={exchange:'NASDAQ',symbol:SYMBOL,synthetic:false};
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const operating=()=>({tickers:tickers([{cik:CIK,ticker:SYMBOL}]),submissions:submissions('operating',['10-K','10-Q']),companyfacts:syntheticCompany(flatYears([2021,2022,2023]))});
function service(bridge:SecDataBridge|null,options:{daily?:boolean;now?:()=>number}={}){
 return createFundamentalsService({bridge,links:()=>[],documents:()=>[],cikMap:()=>null,dailyEnabled:()=>options.daily!==false,now:options.now,notify:()=>{}});
}
const bars=dailyBars('2022-01-03','2023-06-30',100).map(bar=>({time:bar.time,open:bar.open,high:bar.close,low:bar.close,close:bar.close,volume:1000,date:bar.date}));
const at=(values:readonly unknown[],date:string)=>values[bars.findIndex(bar=>bar.date===date)];

describe('company fundamentals: network rule',()=>{
 it('a restored chart reads saved copies only, and nothing is requested without the user',async()=>{
  const sec=fakeBridge(operating()),fs=service(sec.bridge);
  expect(fs.company(facts()).state).toBe('loading');await settle();
  expect(sec.network()).toEqual([]);expect(sec.calls.map(call=>call.kind)).toEqual(['tickers']);
  expect(fs.company(facts()).reason).toBe(FUNDAMENTALS_TEXT.notCached(SYMBOL));
  fs.daily([market]);await settle();expect(sec.network()).toEqual([]);// never activated in this session
 });
 it('asset classes without filings send nothing and say why',()=>{
  const lookup=vi.fn();setFundamentalsLoader({company:lookup});
  try{
   expect(fundamentalsCompany(facts({assetClass:'crypto'})).reason).toBe('Fundamentals come from SEC company filings and do not apply to crypto symbols.');
   expect(fundamentalsCompany(facts({assetClass:'index'})).reason).toBe(FUNDAMENTALS_TEXT.index);
   expect(fundamentalsCompany(facts({assetClass:'etf'})).reason).toBe(FUNDAMENTALS_TEXT.fund);
   expect(lookup).not.toHaveBeenCalled();
  }finally{setFundamentalsLoader(null);}
 });
 it('adding the indicator loads tickers, then submissions, then companyfacts; then at most one refresh per New York day',async()=>{
  let now=Date.parse('2026-11-02T15:00:00Z');const sec=fakeBridge(operating()),fs=service(sec.bridge,{now:()=>now});
  fs.activate(market);await settle();
  expect(sec.network().map(call=>call.kind+':'+call.refresh)).toEqual(['tickers:if-stale','submissions:if-stale','companyfacts:if-stale']);
  expect(fs.company(facts()).state).toBe('ready');expect(fs.company(facts()).company?.entityName).toBe(ENTITY);
  fs.daily([market]);fs.daily([market]);await settle();expect(sec.network()).toHaveLength(3);
  now+=86400000;fs.daily([market]);fs.daily([market]);await settle();
  expect(sec.network().slice(3).map(call=>call.kind+':'+call.refresh)).toEqual(['submissions:if-stale','companyfacts:if-stale']);
 });
 it('the daily setting turns the daily refresh off',async()=>{
  let now=Date.parse('2026-11-02T15:00:00Z');const sec=fakeBridge(operating()),fs=service(sec.bridge,{daily:false,now:()=>now});
  fs.activate(market);await settle();const first=sec.network().length;
  now+=86400000;fs.daily([market]);await settle();expect(sec.network()).toHaveLength(first);
 });
 it('a fund costs one small request: companyfacts is never fetched',async()=>{
  const sec=fakeBridge({...operating(),submissions:submissions('other',['N-CSR','485BPOS'])}),fs=service(sec.bridge);
  fs.activate(market);await settle();
  expect(sec.network().map(call=>call.kind)).toEqual(['tickers','submissions']);
  expect(fs.company(facts()).reason).toBe('ETFs and funds have no company earnings to chart.');
 });
 it('IFRS filers get a plain reason with their form',async()=>{
  const sec=fakeBridge({...operating(),submissions:submissions('operating',['20-F','6-K'])}),fs=service(sec.bridge);
  fs.activate(market);await settle();
  expect(fs.company(facts()).reason).toBe(ENTITY+' reports under IFRS (form 20-F). This version reads US GAAP filings only.');
 });
 it('without the SEC contact nothing is requested, even when the user adds the indicator',async()=>{
  const sec=fakeBridge({...operating(),identity:false}),fs=service(sec.bridge);
  fs.activate(market);fs.refresh(market);await settle();
  expect(sec.network()).toEqual([]);
  expect(fs.company(facts()).reason).toBe('Add your SEC contact in this indicator\'s settings to load company data.');
 });
 it('unknown symbols, paused requests, blocked runs and offline reads say why',async()=>{
  const check=async(remote:Remote,reason:string)=>{const fs=service(fakeBridge(remote).bridge);fs.activate(market);await settle();expect(fs.company(facts()).reason).toBe(reason);};
  await check({...operating(),tickers:tickers([{cik:CIK,ticker:'OTHER'}])},'No SEC company is known for SYNW. Check the symbol, or import a ticker file in Fundamentals.');
  const resume=new Date('2026-11-02T14:32:00.000Z'),two=(n:number)=>String(n).padStart(2,'0');
  await check({error:{code:'RATE_LIMITED',message:'x'}},'SEC paused requests. Try again after '+two(resume.getHours())+':'+two(resume.getMinutes())+'.');
  await check({error:{code:'SEC_DISABLED_RUN',message:'x'}},'SEC requests are off in demo and automated runs.');
  await check({error:{code:'SEC_OFFLINE',message:'x'}},'OpenCandle could not reach SEC. Nothing is cached for this company yet.');
  const demo=service(fakeBridge(operating()).bridge);demo.company(facts({synthetic:true}));await settle();
  expect(demo.company(facts({synthetic:true})).reason).toBe('Demo charts have no company filings. Link the demo company in Fundamentals to try this.');
 });
 it('two tickers for one company mark it multi-class, so market value is left empty',async()=>{
  const sec=fakeBridge({...operating(),tickers:tickers([{cik:CIK,ticker:SYMBOL},{cik:CIK,ticker:'SYNW-B'}])}),fs=service(sec.bridge);
  fs.activate(market);await settle();
  setFundamentalsLoader(fs.loader);
  try{
   const result=calculateIndicator('fundamental',bars,{metric:'mcap'},{resolution:'1D',fundamentals:fundamentalsLookup(facts())});
   expect(result.series[0].values.every(value=>value===null)).toBe(true);
   expect(at(result.fundamentals!.gapNotes,'2022-06-01')).toBe(PIT_TEXT.multiClass(ENTITY,[SYMBOL,'SYNW-B']));
  }finally{setFundamentalsLoader(null);}
 });
});

describe('company fundamentals: calculation',()=>{
 afterEach(()=>setFundamentalsLoader(null));
 it('never throws without a service: empty plots with a reason, also in the off-chart export',()=>{
  for(const kind of ['fundamental','pebands'] as const){
   const result=calculateIndicator(kind,bars,{},{resolution:'1D'});
   expect(result.series.length).toBeGreaterThan(0);expect(result.series.every(series=>series.values.every(value=>value===null))).toBe(true);
   expect(result.diagnostics).toEqual([FUNDAMENTALS_TEXT.noService]);expect(result.fundamentals?.reason).toBe(FUNDAMENTALS_TEXT.noService);
  }
 });
 it('P/E steps forward from each filing and is empty exactly where TTM EPS is not positive, with the note',async()=>{
  const raw=syntheticCompany({...flatYears([2021]),2022:[0,1,2,3].map(i=>({revenue:1000,netIncome:i===0?-300:100,eps:i===0?-3:1,ocf:150,capex:50,dilutedShares:100}))});
  const sec=fakeBridge({...operating(),companyfacts:raw}),fs=service(sec.bridge);fs.activate(market);await settle();setFundamentalsLoader(fs.loader);
  const result=calculateIndicator('fundamental',bars,{metric:'pe'},{resolution:'1D',fundamentals:fundamentalsLookup(facts())}),values=result.series[0].values,info=result.fundamentals!;
  expect(at(values,'2022-02-18')).toBeNull();// FY2021 not yet public
  expect(at(values,'2022-03-01')).toBe(25);// 100 / TTM EPS 4
  expect(at(values,'2022-06-01')).toBeNull();// TTM EPS 1+1+1-3 = 0
  expect(at(info.gapNotes,'2022-06-01')).toBe(PIT_TEXT.epsNotPositive('0'));
  // The stamp of a valued bar names the filing behind it.
  const stamp=info.fundamentalStamps.table[at(Array.from(info.fundamentalStamps.index),'2022-03-01') as number];
  expect(stamp).toMatchObject({end:'2021-12-31',filed:'2022-02-20',form:'10-K',method:'computed'});
  expect(at(info.gapNotes,'2022-02-18')).toMatch(/TTM needs four quarters in a row/);// the earlier window misses a quarter
 });
 it('recalculates from saved copies when company data arrives (a loading lookup first)',async()=>{
  const sec=fakeBridge(operating(),{tickers:tickers([{cik:CIK,ticker:SYMBOL}]),submissions:submissions('operating',['10-K']),companyfacts:syntheticCompany(flatYears([2021,2022])) as unknown as Record<string,unknown>}),fs=service(sec.bridge);setFundamentalsLoader(fs.loader);
  const lookup=fundamentalsLookup(facts()),first=calculateIndicator('fundamental',bars,{metric:'revenue',period:'quarterly'},{resolution:'1D',fundamentals:lookup});
  expect(first.fundamentals).toMatchObject({state:'loading',reason:FUNDAMENTALS_TEXT.loading(SYMBOL)});
  await settle();expect(sec.network()).toEqual([]);
  const second=calculateIndicator('fundamental',bars,{metric:'revenue',period:'quarterly'},{resolution:'1D',fundamentals:lookup});
  expect(at(second.series[0].values,'2022-06-01')).toBe(1000);
 });
});

describe('company fundamentals: chart surfaces',()=>{
 beforeEach(()=>{scopes.clear();});
 it('legend reads "P/E TTM", "Revenue Q YoY %" and "P/E bands 5y", never "Fund"',()=>{
  const row=(inputs:Record<string,unknown>)=>[indicatorLegendTitle('fundamental',inputs,'Fundamental'),...indicatorLegendArguments('fundamental',inputs)].join(' ');
  expect(row({metric:'pe',period:'quarterly',display:'yoy',revisions:'first'})).toBe('P/E TTM');
  expect(row({metric:'revenue',period:'quarterly',display:'yoy',revisions:'first'})).toBe('Revenue Q YoY %');
  expect(row({metric:'eps',period:'annual',display:'value',revisions:'latest'})).toBe('EPS FY latest filed');
  expect(indicatorLegendArguments('pebands',{mode:'own',lookback:5})).toEqual(['5y']);
  expect(indicatorLegendArguments('pebands',{mode:'multiples',multiple1:15,multiple2:20,multiple3:25})).toEqual(['15','20','25']);
  expect(fundamentalValueFormat('fundamental',{metric:'revenue'})).toEqual({suffix:'',compact:true});
  expect(fundamentalValueFormat('fundamental',{metric:'pe'})).toEqual({suffix:'x',compact:false});
  expect(fundamentalValueFormat('fundamental',{metric:'gross_margin'}).suffix).toBe('%');
 });
 it('Refresh company data is in the More menu only where the host connects it',()=>{
  const labels=(refresh:boolean)=>legendMoreMenu('indicator',{surface:'legend',title:'P/E',value:null,hidden:false,favorite:false,routes:{refresh}}).flatMap(row=>row.kind==='item'?[row.label]:[]);
  expect(labels(true)).toContain('Refresh company data');expect(labels(false)).not.toContain('Refresh company data');
 });
 it('both kinds stay out of Technicals and out of alerts',()=>{
  for(const kind of ['fundamental','pebands']){
   expect(INDICATOR_KINDS).toContain(kind);expect(selectorCategoryOf({id:kind})).toBe('fundamentals');
   expect(indicatorAlertBlock(kind)).toMatch(/cannot be alerted on\.$/);
  }
  const shown=selectorView({indicators:INDICATOR_KINDS.map(id=>({id,name:id,acronym:id})),scripts:[]},{item:'built-ins',tab:'indicators',query:''}).entries.map(row=>row.id);
  expect(shown).not.toContain('fundamental');expect(shown).not.toContain('pebands');
 });
 it('every Fundamentals row adds its preset pane (no dialog)',()=>{
  const open=vi.fn(),added=vi.fn(),ui=dialog();Object.assign(ui.props,{onOpenMetric:open,onFundamentalsAdded:added});
  find(ui.render(),(node:any)=>node.props?.['data-qa']==='indicator-sidebar-item-fundamentals').props.onClick();
  const expected:string[]=[];
  for(const tab of FUNDAMENTALS_TABS.filter(row=>row.id!=='forecasts')){
   find(ui.render(),(node:any)=>node.props?.role==='tab'&&text(node)===tab.label).props.onClick();
   const rows=FUNDAMENTALS_PRESETS[tab.id as Exclude<typeof tab.id,'forecasts'>];
   expect(findAll(ui.render(),(node:any)=>node.props?.['data-selector-entry']).map((node:any)=>node.props['data-selector-entry'])).toEqual(rows.map(row=>row.id));
   for(const row of rows){find(ui.render(),(node:any)=>node.props?.['data-selector-entry']===row.id).props.onClick();expected.push(row.id);}
  }
  expect(open).not.toHaveBeenCalled();expect(added).toHaveBeenCalledTimes(expected.length);
  const list=ui.port.list() as any[];
  expect(list.map(row=>row.kind==='pebands'?'pebands':'fundamental:'+row.inputs.metric)).toEqual(expected);
  const revenue=list.find(row=>row.inputs.metric==='revenue'),pe=list.find(row=>row.inputs.metric==='pe'),bands=list.find(row=>row.kind==='pebands');
  expect(revenue.plots.value.kind).toBe('step');expect(pe.plots.value.kind).toBe('line');
  expect(pe.inputs).toMatchObject({metric:'pe',period:'ttm',display:'value',revisions:'first'});
  expect(bands.plots.median).toMatchObject({lineStyle:'dotted',width:1,priceScale:true});expect(bands.plots.upper).toMatchObject({lineStyle:'dotted',priceScale:false});
 });
 it('settings show the metric text, keep the stable key, and fix Period for ratios',()=>{
  const ui=dialog({seed:['fundamental'],initialSelected:0});
  const period=ui.sField('Period'),metric=ui.sField('Metric');
  expect(period.props.disabled).toBe(true);expect(period.props.title).toBe('Ratios always use TTM');
  expect(metric.props.value).toBe('pe');expect(text(metric)).toContain('P/E');expect(text(metric)).toContain('Earnings yield %');
  ui.sEdit('Metric','revenue');expect(ui.sField('Period').props.disabled).toBe(false);
 });
});

describe('company fundamentals: restored charts and remembered companies',()=>{
 const disk=()=>({tickers:tickers([{cik:CIK,ticker:SYMBOL}]),submissions:submissions('operating',['10-K','10-Q']),companyfacts:syntheticCompany(flatYears([2021,2022,2023])) as unknown as Record<string,unknown>});
 const memoryStorage=(initial:string[]=[])=>{const data=new Map<string,string>([['lv.fundamentals.loaded-ciks.v1',JSON.stringify(initial)]]);return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},data};};
 function restored(options:{remembered?:boolean;daily?:boolean;identity?:boolean}={}){
  let now=Date.parse('2026-11-02T15:00:00Z');const start=now;
  const sec=fakeBridge({...operating(),...(options.identity===false?{identity:false}:{})},disk()),storage=memoryStorage(options.remembered===false?[]:[CIK10]);
  const fs=createFundamentalsService({bridge:sec.bridge,links:()=>[],documents:()=>[],cikMap:()=>null,dailyEnabled:()=>options.daily!==false,loadedCiks:loadedCikStore(storage),now:()=>now,notify:()=>{}});
  return {sec,fs,storage,at:(ms:number)=>{now=start+ms;}};
 }
 const kinds=(sec:ReturnType<typeof fakeBridge>)=>sec.network().map(call=>call.kind+':'+call.refresh);
 it('a restored chart sends nothing in its first 60 seconds, then one refresh per company per New York day',async()=>{
  const r=restored();r.fs.company(facts());await settle();expect(r.fs.company(facts()).state).toBe('ready');
  for(const ms of [0,10000,59000]){r.at(ms);r.fs.daily([market]);await settle();}
  expect(r.sec.network()).toEqual([]);
  r.at(STARTUP_QUIET_MS);r.fs.daily([market]);r.fs.daily([market]);await settle();
  expect(kinds(r.sec)).toEqual(['submissions:if-stale','companyfacts:if-stale']);
  r.at(STARTUP_QUIET_MS+3600000);r.fs.daily([market]);await settle();expect(r.sec.network()).toHaveLength(2);
  r.at(86400000+STARTUP_QUIET_MS);r.fs.daily([market]);await settle();expect(r.sec.network()).toHaveLength(4);
 });
 it('the user touching the chart ends the startup wait early',async()=>{
  const r=restored();r.fs.company(facts());await settle();
  r.at(5000);r.fs.interact(market);r.fs.daily([market]);await settle();
  expect(kinds(r.sec)).toEqual(['submissions:if-stale','companyfacts:if-stale']);
 });
 it('never for a company the user has not loaded, with the daily setting off, or without the SEC contact',async()=>{
  for(const options of [{remembered:false},{daily:false},{identity:false}]){
   const r=restored(options);r.fs.company(facts());await settle();r.at(STARTUP_QUIET_MS*2);r.fs.interact(market);r.fs.daily([market]);await settle();
   expect(r.sec.network(),JSON.stringify(options)).toEqual([]);
  }
 });
 it('loading a company remembers it on this PC (not in any workspace)',async()=>{
  const r=restored({remembered:false});r.fs.activate(market);await settle();
  expect(JSON.parse(r.storage.data.get('lv.fundamentals.loaded-ciks.v1')!)).toEqual([CIK10]);
  expect(loadedCikStore(r.storage).has(CIK10)).toBe(true);
 });
 it('restoring the factory default keeps the bands dotted with only the median on the price scale',()=>{
  const plots=factoryIndicatorDefault('pebands').plots;
  expect(plots.median).toMatchObject({lineStyle:'dotted',width:1,priceScale:true});
  for(const id of ['upper','lower','m1','m2','m3','graham'])expect(plots[id],id).toMatchObject({lineStyle:'dotted',width:1,priceScale:false});
  expect(defaultPlotStyle('sma','sma',0)).toMatchObject({lineStyle:'solid',priceScale:true});
 });
});

describe('company fundamentals: names, units and the off-scale rule',()=>{
 const demoBefore=demoDataMode();
 afterEach(()=>{setFundamentalsLoader(null);setDemoDataMode(demoBefore);});
 it('instances are named by the legend title everywhere, never by the stored keys',()=>{
  const rows=[{id:'a',kind:'fundamental' as const,inputs:{metric:'pe',period:'ttm',display:'value',revisions:'first'}},{id:'b',kind:'pebands' as const,inputs:{mode:'own',lookback:5,bands:'percentile',multiple1:15}},{id:'c',kind:'fundamental' as const,inputs:{metric:'mcap',period:'ttm',display:'value',revisions:'first'}},{id:'d',kind:'fundamental' as const,inputs:{metric:'revenue',period:'quarterly',display:'yoy',revisions:'first'}}];
  const labels=indicatorInstanceLabels(rows as never);
  expect([...labels.values()]).toEqual(['P/E TTM','P/E bands 5y','Market cap','Revenue Q YoY %']);
  for(const row of rows)expect(indicatorInstanceTitle(row.kind,row.inputs)).toBe(labels.get(row.id));
  const two=[{time:1,open:1,high:1,low:1,close:1,volume:1},{time:2,open:1,high:1,low:1,close:1,volume:1}];
  const view=buildDataWindow({series:{symbol:'X',exchange:'E',interval:'1D',description:'d',tickSize:0.01},bars:two,index:1,timezone:'UTC',indicators:[
   {id:'r',kind:'fundamental',inputs:{metric:'revenue',period:'ttm'},visible:true,offset:0,precision:'auto',plots:[{id:'value',label:'Value',color:'#fff',dataWindow:true,values:[null,466823000000]}]},
   {id:'p',kind:'fundamental',inputs:{metric:'pe'},visible:true,offset:0,precision:'auto',plots:[{id:'value',label:'Value',color:'#fff',dataWindow:true,values:[null,28.4123]}]},
  ]});
  expect(view.sections.filter(section=>section.kind==='study').map(section=>[section.title,section.rows[0].value])).toEqual([['Revenue TTM','466.82B'],['P/E TTM','28.41x']]);
 });
 it('values read in compact units with their suffix, and point-in-time values are never TTM',()=>{
  const value=(inputs:Record<string,unknown>,v:number,precision:'auto'|number='auto')=>formatIndicatorValue(v,'fundamental',precision,0.01,'value',inputs);
  expect(value({metric:'revenue'},466823000000)).toBe('466.82B');
  expect(value({metric:'mcap'},5029592324660.64)).toBe('5.03T');
  expect(value({metric:'shares'},15204137000)).toBe('15.20B');
  expect(value({metric:'fcf'},-2500)).toBe('-2.50K');
  expect(value({metric:'fcfy'},2.7189)).toBe('2.72%');
  expect(value({metric:'revenue',display:'yoy'},6.071)).toBe('6.07%');
  expect(value({metric:'pe'},39.571,1)).toBe('39.6x');
  expect(value({metric:'eps'},8.71)).toBe('8.71');
  const args=(inputs:Record<string,unknown>)=>indicatorLegendArguments('fundamental',inputs);
  expect(args({metric:'mcap',period:'ttm'})).toEqual([]);expect(args({metric:'pb'})).toEqual([]);
  expect(args({metric:'shares',period:'ttm'})).toEqual([]);expect(args({metric:'shares',period:'quarterly'})).toEqual([]);
  expect(args({metric:'shares',period:'annual'})).toEqual(['FY']);expect(args({metric:'current_ratio',period:'annual',revisions:'latest'})).toEqual(['FY','latest filed']);
  expect(args({metric:'pe'})).toEqual(['TTM']);expect(args({metric:'dy'})).toEqual(['TTM']);
 });
 it('an example crypto chart gets the crypto reason before the demo company check',()=>{
  setDemoDataMode('example');
  const btc=facts({symbol:'BTC',exchange:'SYNTHETIC',assetClass:'stock',synthetic:true});
  expect(fundamentalsChartGate(btc)).toBe(FUNDAMENTALS_TEXT.assetClass('crypto'));
  expect(fundamentalsCompany(btc).reason).toBe(FUNDAMENTALS_TEXT.assetClass('crypto'));
  expect(fundamentalsChartGate(facts({symbol:'AAPL',exchange:'SYNTHETIC',assetClass:'stock',synthetic:true}))).toBeNull();
  expect(fundamentalsChartGate(facts({assetClass:'forex'}))).toBe(FUNDAMENTALS_TEXT.assetClass('forex'));
  expect(fundamentalsChartGate(facts({assetClass:'index'}))).toBe(FUNDAMENTALS_TEXT.index);
 });
 it('own-history bands far from the close are left empty with the Off scale note, as multiples are',async()=>{
  // P/E 25 (close 100, TTM EPS 4) until April 2023, then the close triples. By the last bar the median and lower bands
  // (P/E 25, about 100) are below half the close and the upper band (P/E 75, about 300) stays.
  const priced=dailyBars('2022-01-03','2023-12-29',date=>date<'2023-04-01'?100:300).map(bar=>({time:bar.time,open:bar.open,high:bar.close,low:bar.close,close:bar.close,volume:1000,date:bar.date}));
  const sec=fakeBridge(operating()),fs=service(sec.bridge);fs.activate(market);await settle();setFundamentalsLoader(fs.loader);
  const result=calculateIndicator('pebands',priced,{mode:'own',lookback:5,bands:'percentile'},{resolution:'1D',fundamentals:fundamentalsLookup(facts())});
  const plot=(id:string)=>result.series.find(series=>series.id===id)!.values,index=priced.length-1,inside=priced.findIndex(bar=>bar.date==='2023-03-15');
  for(let i=0;i<priced.length;i++)for(const id of ['median','upper','lower']){const v=plot(id)[i];if(v!==null){expect(v,id+' '+priced[i].date).toBeGreaterThanOrEqual(priced[i].close*0.5);expect(v).toBeLessThanOrEqual(priced[i].close*2);}}
  expect(plot('median')[index]).toBeNull();expect(plot('lower')[index]).toBeNull();expect(plot('upper')[index]).not.toBeNull();
  expect(result.fundamentals!.gapNotes[index]).toBe(OFF_SCALE);
  expect(plot('median')[inside]).toBeCloseTo(100,6);expect(result.fundamentals!.gapNotes[inside]).toBeNull();
 });
});
