import {describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildDataWindow,DATA_WINDOW_EMPTY,fundamentalsRows,type DataWindowInput} from '../../src/ui/data-window-model';
import {chartSourceCsv} from '../../src/ui/chart-source-export';
import {csvRows} from '../../src/domain/data';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {syntheticStatementFacts} from '../fundamentals/fixtures/synthetic-statements';
import {calendarChartMarkers,calendarMarkerSettings,type CalendarMarkerSettings} from '../../src/domain/calendar-chart-markers';
import {loadSecEarningsEvents,secEarningsEvents,secEarningsLines,secFilingRows} from '../../src/domain/sec-earnings-markers';
import {restoreCalendarDocument} from '../../src/domain/calendar';
import {liveDataOf,restoreLiveData} from '../../src/ui/live-workspace';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import type {PitStamp} from '../../src/fundamentals/pit-types';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const stamp=(over:Partial<PitStamp>={}):PitStamp=>({start:'2024-08-01',end:'2024-10-31',filed:'2024-12-05',accession:'0000009999-24-000005',form:'10-Q',tag:'us-gaap:EarningsPerShareDiluted',method:'sum-4q',retrievedAt:'2026-10-15T08:00:00Z',availableAt:1733400000,note:null,...over});

describe('data window filing rows',()=>{
 it('lists period end, filed, form, method and retrieved for the bar under the cursor',()=>{
  const rows=fundamentalsRows({fundamentalStamps:{table:[stamp()],index:Int32Array.from([-1,0])},gapNotes:[null,null]},1);
  expect(rows.map(row=>[row.label,row.value])).toEqual([['Period end','2024-10-31'],['Filed','2024-12-05'],['Form','10-Q'],['Method','Sum of last 4 quarters'],['Retrieved','2026-10-15']]);
 });
 it('shows the empty glyph and the gap note where a bar has no value',()=>{
  const rows=fundamentalsRows({fundamentalStamps:{table:[stamp()],index:Int32Array.from([-1,0])},gapNotes:['TTM EPS -0.42; P/E not meaningful',null]},0);
  expect(rows.slice(0,5).every(row=>row.value===DATA_WINDOW_EMPTY)).toBe(true);
  expect(rows.at(-1)).toMatchObject({label:'Note',value:'TTM EPS -0.42; P/E not meaningful'});
 });
 it('adds the rows to fundamental studies only',()=>{
  const bars=[{time:1,open:1,high:2,low:1,close:2,volume:1},{time:2,open:2,high:3,low:2,close:3,volume:1}];
  const plain={id:'a',kind:'sma' as const,visible:true,offset:0,precision:'auto' as const,plots:[{id:'v',label:'SMA',color:'#fff',dataWindow:true,values:[1,2]}]};
  const input:DataWindowInput={series:{symbol:'X',exchange:'E',interval:'1D',description:'d',tickSize:0.01},bars,index:1,timezone:'UTC',indicators:[plain,{...plain,id:'b',kind:'fundamental' as never,fundamentals:{fundamentalStamps:{table:[stamp()],index:Int32Array.from([0,0])},gapNotes:[null,null]}}]};
  const view=buildDataWindow(input);
  expect(view.sections.find(section=>section.id==='a')!.rows.map(row=>row.key)).toEqual(['v']);
  expect(view.sections.find(section=>section.id==='b')!.rows.map(row=>row.key)).toEqual(['v','fund-end','fund-filed','fund-form','fund-method','fund-retrieved']);
 });
});

describe('chart data CSV text cells',()=>{
 it('writes provenance strings quoted and leaves gaps empty',()=>{
  const data=fixtureDataset('SPY',3);data.bars=[{time:10,open:1,high:2,low:1,close:2,volume:1},{time:20,open:2,high:3,low:2,close:3,volume:1}];
  const csv=chartSourceCsv({bars:data.bars,source:sourceContextForDataset(data),style:'candles'},'ordinary',[
   {label:'Fundamental period_end',points:[{time:10,value:null},{time:20,value:'2024-10-31'}]},
   {label:'Fundamental method',points:[{time:10,value:null},{time:20,value:'=Sum of last 4 quarters'}]},
   {label:'Fundamental value',points:[{time:10,value:1.5},{time:20,value:null}]},
  ]);
  const rows=csvRows(csv),header=rows[0];
  expect(rows[1][header.indexOf('Fundamental period_end')]).toBe('');expect(rows[2][header.indexOf('Fundamental period_end')]).toBe('2024-10-31');
  expect(rows[2][header.indexOf('Fundamental method')]).toBe("'=Sum of last 4 quarters");
  expect(rows[1][header.indexOf('Fundamental value')]).toBe('1.5');
 });
});

describe('SEC earnings badges',()=>{
 const facts=normalizeCompanyFacts(syntheticStatementFacts());
 const filings=[
  {accession:'0000009999-24-000010',form:'8-K',filed:'2024-11-20',items:'2.02,9.01'},
  {accession:'0000009999-24-000011',form:'8-K',filed:'2024-05-30',items:'7.01'},
  {accession:'0000009999-24-000005',form:'10-Q',filed:'2024-12-05',items:null},
  {accession:'0000009999-24-000003',form:'10-Q',filed:'2024-06-05',items:null},
 ];
 const day=86400,start=Date.UTC(2024,3,1,14,30)/1000,bars=Array.from({length:300},(_,i)=>({time:start+i*day,open:10,high:11,low:9,close:10,volume:1}));
 it('uses the 8-K with Item 2.02 when present, else the 10-Q filing date',()=>{
  const events=secEarningsEvents(facts,'syn',filings);
  const q3=events.find(row=>row.end==='2024-10-31')!,q1=events.find(row=>row.end==='2024-04-30')!;
  expect(q3).toMatchObject({id:`sec:${facts.cik}:SYN:2024-10-31`,date:'2024-11-20',form:'8-K',accession:'0000009999-24-000010',eps:0.3,revenue:320});
  expect(q1).toMatchObject({date:'2024-06-05',form:'10-Q',accession:'0000009999-24-000003'});
 });
 it('writes the tooltip as Label: value lines',()=>{
  const q3=secEarningsEvents(facts,'SYN',filings).find(row=>row.end==='2024-10-31')!;
  expect(secEarningsLines({...q3,revenueYoyPercent:4.94})).toEqual(['Earnings','Quarter ended: 2024-10-31','Diluted EPS: 0.30','Revenue: 320.00 (YoY +4.9%)','Date: 2024-11-20 (8-K)','Source: SEC filing']);
 });
 it('replaces the calendar entry with the same id and opens the filing',()=>{
  const events=secEarningsEvents(facts,'SYN',filings),q3=events.find(row=>row.end==='2024-10-31')!;
  const document=restoreCalendarDocument({schemaVersion:1,id:'auto:sec-reported-earnings',events:[{id:q3.id,revision:1,kind:'earnings',title:'SYN reported quarter ended 2024-10-31',description:'x',date:'2024-12-05',time:null,timezone:null,timing:'date-only',symbol:'SYN',country:'US',status:'released',publishedAt:1733356800,fiscalPeriod:'Quarter ended 2024-10-31',values:{}},
   {id:'user-1',revision:1,kind:'earnings',title:'SYN user entry',description:'x',date:'2024-07-01',time:null,timezone:null,timing:'date-only',symbol:'SYN',country:'US',status:'released',publishedAt:1719792000,fiscalPeriod:null,values:{}}],
   provenance:{kind:'local-import',fixture:false,importedAt:1,sourceUrl:null,label:'SEC reported quarters (saved company facts)',license:'x'}});
  const settings:CalendarMarkerSettings={earnings:true,dividends:false,splits:false,ipos:false,secEarnings:events};
  const markers=calendarChartMarkers([document],'SYN',bars,settings);
  expect(markers.filter(row=>row.entries[0].eventId===q3.id)).toHaveLength(1);
  const sec=markers.find(row=>row.entries[0].eventId===q3.id)!;
  expect(sec.entries[0].filing).toEqual({cik:facts.cik,accession:'0000009999-24-000010'});expect(sec.hint).toBe('Click to open on sec.gov.');
  expect(markers.some(row=>row.entries[0].eventId==='user-1')).toBe(true);
  const none=calendarChartMarkers([document],'SYN',bars,{...settings,earnings:false});expect(none).toEqual([]);
 });
 it('follows the earnings toggle through the shared settings builder',()=>{
  const events=secEarningsEvents(facts,'SYN',filings);
  const on=calendarMarkerSettings({earnings:{visible:true},dividends:false,splits:false},false,undefined,events);
  // One badge per event dated within the bars (the FY2024 fourth quarter is filed after the last bar).
  const last=new Date(bars.at(-1)!.time*1000).toISOString().slice(0,10),shown=events.filter(row=>row.date<=last);
  expect(shown.length).toBeGreaterThan(0);expect(shown.length).toBeLessThan(events.length);
  expect(calendarChartMarkers([],'SYN',bars,on).length).toBe(shown.length);
  expect(calendarChartMarkers([],'SYN',bars,calendarMarkerSettings({earnings:{visible:false},dividends:false,splits:false},false,undefined,events))).toEqual([]);
 });
 it('reads submissions columns and loads from saved copies only',async()=>{
  const data={filings:{recent:{accessionNumber:['0000009999-24-000010','bad'],form:['8-K','8-K'],filingDate:['2024-11-20','nope'],items:['2.02,9.01','']}}};
  expect(secFilingRows(data)).toEqual([{accession:'0000009999-24-000010',form:'8-K',filed:'2024-11-20',items:'2.02,9.01'}]);
  const loadSecData=vi.fn(async(input:{kind:string;refresh:string})=>({ok:true as const,value:{envelope:{data:(input.kind==='companyfacts'?syntheticStatementFacts():data) as Record<string,unknown>}}}));
  const events=await loadSecEarningsEvents({loadSecData} as never,'0000009999','SYN');
  expect(events.length).toBeGreaterThan(0);expect(loadSecData.mock.calls.every(call=>call[0].refresh==='cache-only')).toBe(true);
  expect(await loadSecEarningsEvents(null,'0000009999','SYN')).toEqual([]);
 });
});

describe('daily SEC refresh setting',()=>{
 it('is on unless saved as false, and survives restore',()=>{
  expect(liveDataOf({liveData:{coinbase:false,alpacaSymbols:[]}}).secDaily).toBeUndefined();
  expect(liveDataOf({liveData:{coinbase:false,alpacaSymbols:[],secDaily:false}}).secDaily).toBe(false);
  expect(restoreLiveData({coinbase:false,alpacaSymbols:[],secDaily:false}).secDaily).toBe(false);
  expect(()=>restoreLiveData({coinbase:false,alpacaSymbols:[],secDaily:true})).toThrow();
 });
 it('shows the checkbox in the Data sources page and reflects the choice',()=>{
  const live={coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge:null,alpacaPlan:'free' as const,onAlpacaPlanChange:vi.fn()};
  const storage={directory:'C:\\Users\\Someone\\data',onExport:vi.fn(),onReset:vi.fn(),onResetDone:vi.fn()};
  const render=(daily:boolean)=>renderToStaticMarkup(React.createElement(DataSourcesPanel,{live,storage,saved:{bridge:null,settings:{coinbase:false,alpacaSymbols:[]},onImport:vi.fn()},sec:{daily,onDailyChange:vi.fn()}}));
  expect(render(true)).toMatch(/Refresh SEC company data daily/);expect(render(true)).toMatch(/type="checkbox"[^>]*checked/);expect(render(false)).not.toMatch(/type="checkbox"[^>]*checked=""[^>]*\/> Refresh SEC/);
 });
});

describe('SEC earnings badges for a fiscal fourth quarter',()=>{
 // SYNTHETIC company: fiscal year 2023-10-01..2024-09-28. Q1-Q3 come from 10-Qs; Q4 exists only inside the 10-K.
 const Q1={start:'2023-10-01',end:'2023-12-30'},Q2={start:'2023-12-31',end:'2024-03-30'},Q3={start:'2024-03-31',end:'2024-06-29'},M9={start:'2023-10-01',end:'2024-06-29'},FY={start:'2023-10-01',end:'2024-09-28'};
 const qA={filed:'2024-02-02',form:'10-Q',accn:'0000008888-24-000001'},qB={filed:'2024-05-03',form:'10-Q',accn:'0000008888-24-000002'},qC={filed:'2024-08-02',form:'10-Q',accn:'0000008888-24-000003'},k={filed:'2024-11-01',form:'10-K',accn:'0000008888-24-000004'};
 const raw={cik:8888,entityName:'Synthetic Fiscal Q4 Co (SYNTHETIC)',facts:{'us-gaap':{
  RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[{...Q1,val:1200,...qA},{...Q2,val:900,...qB},{...Q3,val:850,...qC},{...M9,val:2950,...qC},{...FY,val:3900,...k}]}},
  EarningsPerShareDiluted:{units:{'USD/shares':[{...Q1,val:2.1,...qA},{...Q2,val:1.5,...qB},{...Q3,val:1.4,...qC},{...M9,val:5,...qC},{...FY,val:6.1,...k}]}},
 }}};
 const facts=normalizeCompanyFacts(raw);
 const announcements=[{accession:'0000008888-24-000010',form:'8-K',filed:'2024-08-01',items:'2.02,9.01'},{accession:'0000008888-24-000011',form:'8-K',filed:'2024-10-31',items:'2.02,9.01'}];
 const periodic=[qA,qB,qC,k].map(row=>({accession:row.accn,form:row.form,filed:row.filed,items:null}));
 it('adds the 10-K quarter, dated by the Item 2.02 8-K after the year end, valued full year less nine months',()=>{
  const events=secEarningsEvents(facts,'syq',[...periodic,...announcements]);
  expect(events.map(row=>row.end)).toEqual(['2023-12-30','2024-03-30','2024-06-29','2024-09-28']);
  expect(new Set(events.map(row=>row.id)).size).toBe(events.length);
  const q4=events.find(row=>row.end==='2024-09-28')!;
  expect(q4).toMatchObject({id:`sec:${facts.cik}:SYQ:2024-09-28`,date:'2024-10-31',form:'8-K',accession:'0000008888-24-000011',eps:1.1,revenue:950,epsCurrency:'USD/shares'});
  expect(events.find(row=>row.end==='2024-06-29')).toMatchObject({date:'2024-08-01',form:'8-K'});
  expect(secEarningsLines(q4)).toContain('Date: 2024-10-31 (8-K)');
 });
 it('falls back to the 10-K filing date without an earnings 8-K',()=>{
  const q4=secEarningsEvents(facts,'SYQ',periodic).find(row=>row.end==='2024-09-28')!;
  expect(q4).toMatchObject({date:'2024-11-01',form:'10-K',accession:'0000008888-24-000004',eps:1.1,revenue:950});
 });
 it('leaves the values empty when no nine-month total was filed by the 10-K',()=>{
  const late=normalizeCompanyFacts({...raw,facts:{'us-gaap':{
   RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[{...Q1,val:1200,...qA},{...M9,val:2950,filed:'2024-12-01',form:'10-Q',accn:'0000008888-24-000020'},{...FY,val:3900,...k}]}},
  }}});
  const q4=secEarningsEvents(late,'SYQ',periodic).find(row=>row.end==='2024-09-28')!;
  expect(q4).toMatchObject({date:'2024-11-01',form:'10-K',revenue:null,eps:null});
 });
});

describe('Unavailable reason contrast',()=>{
 const read=(name:string)=>readFileSync(resolve('src/ui',name),'utf8');
 const luminance=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*r+0.7152*g+0.0722*b;};
 const contrast=(a:string,b:string)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
 const blend=(fg:string,bg:string,alpha:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(fg.slice(i,i+2),16)*alpha+parseInt(bg.slice(i,i+2),16)*(1-alpha)).toString(16).padStart(2,'0')).join('');
 it('uses the legend text token, readable on light and dark chart backgrounds',()=>{
  const rule=/\.lv-status-unavailable\{([^}]*)\}/.exec(read('indicator-legend.css'))![1];
  expect(rule).toContain('color:var(--lv-status-unavailable-text,var(--lv-text-primary))');expect(rule).toContain('opacity:var(--lv-status-unavailable-opacity,.6)');
  const light=/\[data-chart-surface=light\][^{]*\{([^}]*)\}/.exec(read('components.css'))![1];
  const token=(name:string)=>new RegExp('--'+name+':([^;}]+)').exec(light)![1];
  expect(token('lv-status-unavailable-text')).toBe('var(--lv-text-secondary)');expect(token('lv-status-unavailable-opacity')).toBe('1');
  expect(contrast(token('lv-text-secondary'),'#ffffff')).toBeGreaterThanOrEqual(4.5);
  const darkText=/--lv-text-primary:(#[0-9a-f]{6})/.exec(read('styles.css'))![1];
  for(const background of ['#232734','#0f0f0f'])expect(contrast(blend(darkText,background,0.6),background)).toBeGreaterThanOrEqual(4.5);
 });
});
