import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {indicatorLegendTexts} from '../../src/chart/legend-pane-model';
import {buildDataWindow,indicatorPlotTextAt,type DataWindowIndicatorInput} from '../../src/ui/data-window-model';

// 0.8.1: the main legend (App.tsx legendRow) and the data window read a plot through one function, indicatorPlotTextAt:
// values[bar - offset], formatted with the instance precision and symbol tick size. SYNTHETIC values.
const T0=1767225600;
const bars:Bar[]=Array.from({length:10},(_,i)=>({time:T0+i*86400,open:1.1,high:1.2,low:1.0,close:1.1+i/1000,volume:1000}));
const series={symbol:'SYN',exchange:'LV',interval:'1D',description:'Synthetic',tickSize:0.00001};
/** The App.tsx legend read, as wired there. */
function legendText(values:readonly (number|null)[],row:{id:string;kind:string;offset?:number;presentation?:{precision?:DataWindowIndicatorInput['precision']}},at:number|null,tickSize:number):string[]{
 const port={values:()=>({series:[{id:'plot',values:values as unknown as ArrayLike<number>}]})};
 const reading={kind:row.kind as never,offset:row.offset,precision:row.presentation?.precision??'auto'};
 return indicatorLegendTexts(port,row,at,()=>({color:'#000'}),(plotValues,bar)=>indicatorPlotTextAt(plotValues,bar,reading,tickSize)).map(part=>part.text);
}
function windowText(values:readonly (number|null)[],study:Omit<DataWindowIndicatorInput,'plots'>,at:number|null,tickSize=series.tickSize):string{
 const view=buildDataWindow({series:{...series,tickSize},bars,index:at,timezone:'UTC',indicators:[{...study,plots:[{id:'plot',label:'Plot',color:'#000',dataWindow:true,values}]}]});
 return view.sections.find(section=>section.kind==='study')!.rows[0].value;
}

describe('legend values match the data window (SYNTHETIC)',()=>{
 const sma=Array.from({length:10},(_,i)=>i<2?null:1.123456789+i/100);
 it('SMA with offset 3 and precision 5: same text at every bar and at the last bar',()=>{
  const row={id:'sma-1',kind:'sma',offset:3,presentation:{precision:5 as const}};
  for(const at of [null,0,2,4,5,9]){
   expect(legendText(sma,row,at,series.tickSize),String(at)).toEqual([windowText(sma,{id:'sma-1',kind:'sma',visible:true,offset:3,precision:5},at)]);
  }
  // At bar 7 the drawn value is values[4] = 1.16346 (5 decimals), not values[7] with toFixed(2).
  expect(legendText(sma,row,7,series.tickSize)).toEqual(['1.16346']);
 });
 it('a volume-scale value formats like the data window',()=>{
  const volume=Array.from({length:10},(_,i)=>1234567+i);
  const row={id:'vol-1',kind:'volume'};
  expect(legendText(volume,row,5,0.01)).toEqual([windowText(volume,{id:'vol-1',kind:'volume',visible:true,offset:0,precision:'auto'},5,0.01)]);
  expect(legendText(volume,row,5,0.01)[0]).not.toBe('1234572.00');
 });
 it('the shared reader shifts by the offset and shows the empty glyph outside the series',()=>{
  const reading={kind:'sma' as never,offset:3,precision:5 as const};
  expect(indicatorPlotTextAt(sma,2,reading,series.tickSize)).toBe('∅');
  expect(indicatorPlotTextAt(sma,null,reading,series.tickSize)).toBe(indicatorPlotTextAt(sma,9,reading,series.tickSize));
 });
});
