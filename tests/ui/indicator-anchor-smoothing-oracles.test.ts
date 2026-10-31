import {beforeEach,expect,it,vi} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {makeHarness,valuesOf} from './indicator-real-port-harness';

// L1 lane evidence: literal, hand-computed oracles (independent of production arithmetic) for the
// VWAP calendar anchors and the four ATR smoothing choices, checked on the domain calculator AND
// through the actual settings handler on the real indicator port. No DOM/focus/GUI/reference claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

/** Flat synthetic bars: open=high=low=close=price, so hlc3 is exactly the price. */
const flat=(rows:[string,number,number][])=>rows.map(([iso,price,volume])=>({time:Date.parse(iso),open:price,high:price,low:price,close:price,volume}));
// Each case: VWAP = sum(price*volume)/sum(volume) since the last anchor boundary, hand-computed.
const anchors:{anchor:string;timezone?:string;rows:[string,number,number][];literal:(number|null)[];note:string}[]=[
 {anchor:'Session',rows:[['2024-03-04T14:00:00Z',10,1],['2024-03-04T20:00:00Z',20,3],['2024-03-05T14:00:00Z',30,2],['2024-03-05T15:00:00Z',12,2]],literal:[10,17.5,30,21],note:'(10*1+20*3)/4=17.5; new UTC date resets; (30*2+12*2)/4=21'},
 {anchor:'Session',timezone:'America/New_York',rows:[['2024-03-04T15:00:00Z',10,1],['2024-03-05T03:00:00Z',20,1],['2024-03-05T15:00:00Z',40,1]],literal:[10,15,40],note:'03:00Z is still March 4 in New York, so it accumulates: (10+20)/2=15; March 5 resets'},
 {anchor:'Session',rows:[['2024-03-04T14:00:00Z',10,0],['2024-03-04T15:00:00Z',20,2],['2024-03-05T14:00:00Z',30,0]],literal:[null,20,null],note:'zero cumulative volume is unavailable (null), never zero'},
 {anchor:'Month',rows:[['2024-01-31T12:00:00Z',10,1],['2024-01-31T18:00:00Z',16,2],['2024-02-01T00:00:00Z',40,1],['2024-02-29T23:00:00Z',10,3]],literal:[10,14,40,17.5],note:'(10+32)/3=14; February resets; leap day (40+30)/4=17.5'},
 {anchor:'Quarter',rows:[['2024-03-31T23:59:00Z',10,1],['2024-04-01T00:00:00Z',20,1],['2024-06-30T12:00:00Z',50,3],['2024-07-01T00:00:00Z',8,1]],literal:[10,20,42.5,8],note:'Q2 resets; (20+150)/4=42.5; Q3 resets'},
 {anchor:'Year',rows:[['2023-12-31T23:00:00Z',10,2],['2024-01-01T00:00:00Z',30,1],['2024-12-31T23:00:00Z',60,1],['2025-01-01T01:00:00Z',5,4]],literal:[10,30,45,5],note:'2024 resets; (30+60)/2=45; 2025 resets'},
 {anchor:'Decade',rows:[['2019-12-31T12:00:00Z',10,1],['2020-01-01T00:00:00Z',20,1],['2029-06-01T00:00:00Z',50,1],['2030-01-01T00:00:00Z',7,1]],literal:[10,20,35,7],note:'LV decade = floor(year/10): 2020-2029; (20+50)/2=35'},
 {anchor:'Century',rows:[['1999-12-31T23:00:00Z',10,1],['2000-01-01T00:00:00Z',20,1],['2050-01-01T00:00:00Z',40,3],['2100-01-01T00:00:00Z',9,1]],literal:[10,20,35,9],note:'LV century = floor(year/100): 2000-2099; (20+120)/4=35'},
];
it.each(anchors)('VWAP anchor $anchor ($note)',({anchor,timezone,rows,literal})=>{
 const bars=flat(rows),domain=bars.map(bar=>({...bar,time:bar.time/1000})),inputs={anchor,timezone:timezone??'UTC',source:'hlc3'};
 expect(calculateIndicator('vwap',domain,inputs).series.find(series=>series.id==='vwap')!.values).toEqual(literal);
 // Through the actual Anchor period editor on the real port: start from a different anchor and Apply this one.
 const ui=dialog({seed:['vwap'],initialSelected:0,bars}),[id]=ui.ids;
 if(timezone)ui.sEdit('Calendar anchor time zone',timezone);
 ui.sEdit('Anchor period',anchor==='Century'?'Year':'Century');ui.sSubmit();const other=valuesOf(ui.port,id)[0].values;
 ui.sEdit('Anchor period',anchor);ui.sSubmit();expect(ui.port.list()[0].inputs).toMatchObject(inputs);
 expect(valuesOf(ui.port,id).find(series=>series.id==='vwap')!.values).toEqual(literal);if(literal.length>3)expect(other).not.toEqual(literal);
});

// True range for these bars, hand-computed: [2,3,2,5,4]
//  b0 H10 L8      -> 10-8=2 (first bar: high-low)
//  b1 H12 L9  C0=9  -> max(3,|12-9|,|9-9|)=3
//  b2 H11 L9  C1=11 -> max(2,|11-11|,|9-11|)=2
//  b3 H15 L11 C2=10 -> max(4,|15-10|,|11-10|)=5
//  b4 H16 L12 C3=14 -> max(4,|16-14|,|12-14|)=4
const atrBars=[[10,8,9],[12,9,11],[11,9,10],[15,11,14],[16,12,13]].map(([high,low,close],i)=>({time:Date.UTC(2024,0,2+i),open:close,high,low,close,volume:100}));
const atrLiteral:Record<'SMA'|'RMA'|'EMA'|'WMA',(number|null)[]>={
 SMA:[null,null,7/3,10/3,11/3],// (2+3+2)/3, (3+2+5)/3, (2+5+4)/3
 RMA:[null,null,7/3,29/9,94/27],// SMA seed 7/3, then (2*prev+TR)/3
 EMA:[2,2.5,2.25,3.625,3.8125],// alpha=2/(3+1)=0.5, LV first-value seed
 WMA:[null,null,7/3,11/3,4],// (1*2+2*3+3*2)/6, (1*3+2*2+3*5)/6, (1*2+2*5+3*4)/6
};
it.each(Object.keys(atrLiteral) as ('SMA'|'RMA'|'EMA'|'WMA')[])('ATR smoothing %s matches the hand-computed recurrence on the domain and through the Smoothing editor',smoothing=>{
 const near=(actual:(number|null)[])=>{expect(actual.map(value=>value===null)).toEqual(atrLiteral[smoothing].map(value=>value===null));actual.forEach((value,i)=>{if(value!==null)expect(value).toBeCloseTo(atrLiteral[smoothing][i]!,12);});};
 near(calculateIndicator('atr',atrBars.map(bar=>({...bar,time:bar.time/1000})),{length:3,smoothing}).series[0].values);
 const ui=dialog({seed:['atr'],initialSelected:0,bars:atrBars}),[id]=ui.ids;ui.sEdit('Length','3');ui.sEdit('Smoothing',smoothing);ui.sSubmit();
 expect(ui.port.list()[0].inputs).toMatchObject({length:3,smoothing});near(valuesOf(ui.port,id)[0].values);
 for(const other of Object.keys(atrLiteral).filter(value=>value!==smoothing))expect(valuesOf(ui.port,id)[0].values).not.toEqual(atrLiteral[other as 'SMA']);
});
