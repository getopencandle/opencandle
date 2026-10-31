import {describe,expect,it,vi} from 'vitest';
import {chartEventLines,chartEventMarkers,chartEventSymbol,createChartEventsLoader,dividendAmountLabel,eventBarTime,eventDateLabel,markerOffset,newYorkDate,type CorporateActionEvent} from '../../src/domain/chart-events';
import {ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';

// Placement, grouping and tooltip text of split and dividend markers. SYNTHETIC events and bars only.
const nyMidnight=(date:string)=>{const at=Date.parse(date+'T04:00:00Z')/1000;return newYorkDate(at)===date?at:at+3600;};
const days=(from:string,count:number)=>{const out:{time:number}[]=[];let ms=Date.parse(from+'T12:00:00Z');while(out.length<count){const d=new Date(ms);if(d.getUTCDay()%6)out.push({time:nyMidnight(d.toISOString().slice(0,10))});ms+=86400000;}return out;};
const dividend=(exDate:string,amount=0.24):CorporateActionEvent=>({id:'SYNTHETIC-D-'+exDate,kind:'cash-dividend',symbol:'GME',exDate,recordDate:exDate,payableDate:'2025-07-01',processDate:exDate,amount,currency:'USD',special:false,foreign:false});
const split=(exDate:string,newRate=2,oldRate=1,kind:'forward-split'|'reverse-split'='forward-split'):CorporateActionEvent=>({id:'SYNTHETIC-S-'+exDate,kind,symbol:'GME',exDate,recordDate:null,payableDate:null,processDate:exDate,oldRate,newRate});
const ALL={dividends:true,splits:true};

describe('eventBarTime',()=>{
 it('daily bars: the bar of the ex-date; dates before the first bar, after the last or without a bar are not placed',()=>{
  const bars=days('2025-06-09',10); // Mon 2025-06-09 .. Fri 2025-06-20
  expect(eventBarTime('2025-06-16',bars)).toBe(nyMidnight('2025-06-16'));
  expect(eventBarTime('2025-06-09',bars)).toBe(bars[0].time);
  expect(eventBarTime('2025-06-06',bars)).toBeNull();
  expect(eventBarTime('2025-06-25',bars)).toBeNull();
  const gap=bars.filter(bar=>newYorkDate(bar.time)!=='2025-06-12');
  expect(eventBarTime('2025-06-12',gap)).toBeNull();
 });
 it('intraday bars: the first bar of the ex-date; weekly bars: the week that holds it',()=>{
  const open=Date.parse('2025-06-16T13:30:00Z')/1000,five=Array.from({length:200},(_,i)=>({time:open-86400+i*300}));
  const first=five.find(bar=>newYorkDate(bar.time)==='2025-06-16')!;
  expect(eventBarTime('2025-06-16',five)).toBe(first.time);
  const weeks=[0,1,2,3].map(i=>({time:nyMidnight('2025-06-02')+i*7*86400}));
  expect(eventBarTime('2025-06-18',weeks)).toBe(weeks[2].time);
  expect(eventBarTime('2025-06-27',weeks)).toBe(weeks[3].time);
  expect(eventBarTime('2025-07-20',weeks)).toBeNull();
 });
});

describe('markers and tooltip text',()=>{
 it('Dividends and Splits settings filter by type; one marker per type and bar, side by side',()=>{
  const bars=days('2025-06-09',10),events=[dividend('2025-06-16'),split('2025-06-16'),dividend('2025-06-18')];
  const markers=chartEventMarkers(events,bars,ALL);
  expect(markers.map(m=>[m.type,m.letter,newYorkDate(m.barTime)])).toEqual([['dividend','D','2025-06-16'],['split','S','2025-06-16'],['dividend','D','2025-06-18']]);
  expect(markerOffset(markers,0)).toBeLessThan(0);expect(markerOffset(markers,1)).toBeGreaterThan(0);expect(markerOffset(markers,2)).toBe(0);
  expect(chartEventMarkers(events,bars,{dividends:false,splits:true}).map(m=>m.type)).toEqual(['split']);
  expect(chartEventMarkers(events,bars,{dividends:true,splits:false}).map(m=>m.type)).toEqual(['dividend','dividend']);
  expect(chartEventMarkers(events,bars,{dividends:false,splits:false})).toEqual([]);
 });
 it('tooltip: type, ratio or amount, ex-date and the other dates; a stub run says SYNTHETIC',()=>{
  expect(chartEventLines(split('2025-06-16'))).toEqual(['Split','Ratio: 2 for 1','Ex-date: Jun 16, 2025']);
  expect(chartEventLines(split('2024-09-16',1,5,'reverse-split'))[0]).toBe('Reverse split');
  expect(chartEventLines(split('2024-09-16',1,5,'reverse-split'))[1]).toBe('Ratio: 1 for 5');
  expect(chartEventLines(dividend('2025-06-16',0.1525))).toEqual(['Dividend','Amount: 0.1525 USD','Ex-date: Jun 16, 2025','Record date: Jun 16, 2025','Payment date: Jul 1, 2025']);
  const synthetic=chartEventLines(dividend('2025-06-16'),true);
  expect(synthetic[0]).toBe('SYNTHETIC Dividend');expect(synthetic.at(-1)).toMatch(/not market data/);
  const marker=chartEventMarkers([dividend('2025-06-16')],days('2025-06-09',10),ALL,true)[0];
  expect(marker.label).toMatch(/^SYNTHETIC Dividend\. Amount: 0\.24 USD\. Ex-date: Jun 16, 2025/);
  expect(eventDateLabel('2025-01-02')).toBe('Jan 2, 2025');expect(dividendAmountLabel(0.5)).toBe('0.50 USD');
 });
});

describe('source and loader',()=>{
 it('only Alpaca stock charts ask for events (live, delayed history or the stub)',()=>{
  expect(chartEventSymbol('alpaca-iex','GME')).toBe('GME');
  expect(chartEventSymbol(ALPACA_SIP_PROVIDER_ID,'BRK.B')).toBe('BRK.B');
  expect(chartEventSymbol('coinbase-public','BTC-USD')).toBeNull();
  expect(chartEventSymbol('local-import','GME')).toBeNull();
  selectAlpacaSyntheticStub(true);
  try{expect(chartEventSymbol(ALPACA_STUB_PROVIDER_ID,'GME')).toBe('GME');expect(chartEventSymbol('alpaca-iex','GME')).toBeNull();}
  finally{selectAlpacaSyntheticStub(false);}
 });
 it('loads one symbol once (data-only request), forgets failures, and reports a missing bridge',async()=>{
  const value={schemaVersion:1,symbol:'GME',events:[],retrievedAt:'',cached:false,stale:false,synthetic:true,provenance:{provider:'x',kind:'owner-key',source:'corporate-actions',license:''}} as const;
  const fetchAlpacaCorporateActions=vi.fn(async(input:{requestId:string;symbol:string})=>input.symbol==='BAD'?{ok:false as const,error:{code:'X',message:'no'}}:{ok:true as const,value:{...value,events:[]}});
  const load=createChartEventsLoader(()=>({fetchAlpacaCorporateActions}));
  await Promise.all([load('GME'),load('GME')]);await load('BAD');await load('BAD');
  expect(fetchAlpacaCorporateActions.mock.calls.map(call=>call[0].symbol)).toEqual(['GME','BAD','BAD']);
  expect(Object.keys(fetchAlpacaCorporateActions.mock.calls[0][0]).sort()).toEqual(['requestId','symbol']);
  expect(await createChartEventsLoader(()=>undefined)('GME')).toMatchObject({ok:false,error:{code:'UNAVAILABLE'}});
 });
});
