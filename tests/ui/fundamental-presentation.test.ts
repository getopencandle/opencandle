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
  expect(calendarChartMarkers([],'SYN',bars,on).length).toBe(events.length);
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
