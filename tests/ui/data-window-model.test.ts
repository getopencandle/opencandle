import {describe,expect,it} from 'vitest';
import {DATA_WINDOW_EMPTY,buildDataWindow,formatChange,formatDataWindowDate,formatDataWindowTime,formatIndicatorValue,formatPrice,formatVolume,lastDayChange,seriesSectionTitle,tickDecimals,type DataWindowInput} from '../../src/ui/data-window-model';

// SYNTHETIC fixture: five daily bars, 2026-07-01..05 UTC. Every expected string below is a literal
// worked by hand from these numbers (no formatter output is reused as an oracle).
const day=86400,start=1782864000;
const bars=[
 {time:start,open:9.5,high:10.5,low:9,close:10,volume:1000},
 {time:start+day,open:10,high:11.25,low:9.75,close:11,volume:2000},
 {time:start+2*day,open:11,high:12.5,low:10.5,close:12,volume:1500000},
 {time:start+3*day,open:12,high:13.75,low:11.5,close:13,volume:2500000},
 {time:start+4*day,open:13,high:14.5,low:12.75,close:12.5,volume:39760000},
];
// SMA(3) of close by hand: [null,null,11,12,12.5].
const sma=[null,null,11,12,12.5];
const series={symbol:'SYNTH',exchange:'LOCAL',interval:'1D',description:'SYNTHETIC fixture',tickSize:0.01};
const input=(index:number|null,extra:Partial<DataWindowInput>={}):DataWindowInput=>({series,bars,index,timezone:'UTC',indicators:[{id:'sma-1',kind:'sma',visible:true,offset:0,precision:'auto',plots:[{id:'sma',label:'SMA',color:'#41b6c4',dataWindow:true,values:sma}]}],...extra});
const rows=(view:ReturnType<typeof buildDataWindow>,key:string)=>Object.fromEntries(view.sections.find(section=>section.key===key)!.rows.map(row=>[row.label,row.value]));

describe('formatters',()=>{
 it('derives symbol precision from the tick size',()=>{expect([tickDecimals(0.01),tickDecimals(0.25),tickDecimals(1),tickDecimals(0.0001),tickDecimals(0.5)]).toEqual([2,2,0,4,1]);});
 it('formats prices at symbol precision without digit grouping',()=>{expect(formatPrice(123.456,0.01)).toBe('123.46');expect(formatPrice(1234567.5,0.01)).toBe('1234567.50');expect(formatPrice(-0.001,0.01)).toBe('0.00');expect(formatPrice(NaN,0.01)).toBe(DATA_WINDOW_EMPTY);});
 it('abbreviates volume with K/M/B',()=>{expect([formatVolume(523),formatVolume(1000),formatVolume(1234),formatVolume(39760000),formatVolume(2.5e9),formatVolume(12.5)]).toEqual(['523','1.00 K','1.23 K','39.76 M','2.50 B','12.50']);});
 it('formats change as abs (pct%)',()=>{expect(formatChange(13,12,0.01)).toBe('+1.00 (+8.33%)');expect(formatChange(12.5,13,0.01)).toBe('-0.50 (-3.85%)');expect(formatChange(5,5,0.01)).toBe('0.00 (0.00%)');expect(formatChange(1,undefined,0.01)).toBe(DATA_WINDOW_EMPTY);});
 it('formats the date row as Ddd DD Mon \'YY in the chart time zone',()=>{expect(formatDataWindowDate(start+3*day,'UTC')).toBe("Sat 04 Jul '26");expect(formatDataWindowDate(1783089000,'UTC')).toBe("Fri 03 Jul '26");expect(formatDataWindowDate(start,'America/Phoenix')).toBe("Tue 30 Jun '26");expect(formatDataWindowTime(1783089000,'UTC')).toBe('14:30');expect(formatDataWindowTime(1783089000,'America/Phoenix')).toBe('07:30');});
 it('uses the legend formatter for explicit precision and LV auto rules otherwise',()=>{expect(formatIndicatorValue(12.3456,'sma',3,0.01)).toBe('12.346');expect(formatIndicatorValue(1234.5,'sma',1,0.01)).toBe('1,234.5');expect(formatIndicatorValue(12.3456,'sma','auto',0.01)).toBe('12.35');expect(formatIndicatorValue(55.5551,'rsi','auto',1)).toBe('55.56');expect(formatIndicatorValue(2500000,'volume','auto',0.01)).toBe('2.50 M');expect(formatIndicatorValue(null,'sma','auto',0.01)).toBe(DATA_WINDOW_EMPTY);});
 it('section title follows {symbol} · {interval} · {exchange}',()=>{expect(seriesSectionTitle(series)).toBe('SYNTH · 1D · LOCAL');});
});

describe('crosshair bar to values',()=>{
 it('hovered bar 3 maps every reference row in order',()=>{
  const view=buildDataWindow(input(3));
  expect(view.hovered).toBe(true);expect(view.index).toBe(3);
  expect(view.date).toEqual([{key:'date',label:'Date',value:"Sat 04 Jul '26"}]);
  expect(view.sections.map(section=>section.title)).toEqual(['SYNTH · 1D · LOCAL','SMA']);
  expect(view.sections[0].rows.map(row=>row.label)).toEqual(['Open','High','Low','Close','Change','Vol','Last day change']);
  expect(rows(view,'series')).toEqual({Open:'12.00',High:'13.75',Low:'11.50',Close:'13.00',Change:'+1.00 (+8.33%)',Vol:'2.50 M','Last day change':'-0.50 (-3.85%)'});
  expect(rows(view,'study:sma-1')).toEqual({SMA:'12.00'});
  expect(view.sections[1].rows[0].color).toBe('#41b6c4');expect(view.sections[1].tooltip).toBe('Simple Moving Average');
 });
 it('no crosshair (or an index off the series) shows the last bar',()=>{
  for(const index of [null,-1,5,2.5]){const view=buildDataWindow(input(index));expect(view.hovered).toBe(false);expect(view.index).toBe(4);expect(view.date[0].value).toBe("Sun 05 Jul '26");expect(rows(view,'series')).toEqual({Open:'13.00',High:'14.50',Low:'12.75',Close:'12.50',Change:'-0.50 (-3.85%)',Vol:'39.76 M','Last day change':'-0.50 (-3.85%)'});expect(rows(view,'study:sma-1')).toEqual({SMA:'12.50'});}
 });
 it('warm-up and first-bar values are empty, not zero',()=>{const view=buildDataWindow(input(0));expect(rows(view,'series').Change).toBe(DATA_WINDOW_EMPTY);expect(rows(view,'series').Vol).toBe('1.00 K');expect(rows(view,'study:sma-1')).toEqual({SMA:DATA_WINDOW_EMPTY});});
 it('a plot offset shows the shifted value at the hovered bar',()=>{const view=buildDataWindow(input(4,{indicators:[{id:'sma-1',kind:'sma',visible:true,offset:2,precision:'auto',plots:[{id:'sma',label:'SMA',color:'#41b6c4',dataWindow:true,values:sma}]}]}));expect(rows(view,'study:sma-1')).toEqual({SMA:'11.00'});});
 it('plots with data window visibility off have no row; hidden sections keep only the header',()=>{
  const view=buildDataWindow(input(3,{indicators:[{id:'sma-1',kind:'sma',visible:false,offset:0,precision:2,plots:[{id:'sma',label:'SMA',color:'#41b6c4',dataWindow:true,values:sma},{id:'smooth',label:'Smoothing',color:'#ffb74d',dataWindow:false,values:sma}]}],hidden:new Set(['series'])}));
  expect(view.sections[0]).toMatchObject({key:'series',hidden:true,rows:[]});expect(view.sections[1]).toMatchObject({visible:false,hidden:false});expect(rows(view,'study:sma-1')).toEqual({SMA:'12.00'});
 });
 it('intraday charts add a Time row; last day change uses the previous calendar day',()=>{
  const hour=3600,base=1783036800,intraday=[{time:base+20*hour,open:1,high:1,low:1,close:100,volume:1},{time:base+23*hour,open:1,high:1,low:1,close:101,volume:1},{time:base+day+hour,open:1,high:1,low:1,close:103,volume:1},{time:base+day+2*hour,open:1,high:1,low:1,close:104.04,volume:1}];
  const view=buildDataWindow({series:{...series,interval:'60m'},bars:intraday,index:2,timezone:'UTC',indicators:[]});
  expect(view.date).toEqual([{key:'date',label:'Date',value:"Sat 04 Jul '26"},{key:'time',label:'Time',value:'01:00'}]);
  expect(rows(view,'series')['Last day change']).toBe('+3.04 (+3.01%)');
  expect(lastDayChange(intraday,'60m','America/Phoenix',0.01)).toBe(DATA_WINDOW_EMPTY);
  expect(lastDayChange(bars,'1W','UTC',0.01)).toBe(DATA_WINDOW_EMPTY);
 });
});
