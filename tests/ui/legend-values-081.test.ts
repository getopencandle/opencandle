import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {indicatorLegendValues} from '../../src/chart/legend-pane-model';
import {buildDataWindow,formatIndicatorValue,type DataWindowIndicatorInput} from '../../src/ui/data-window-model';

// 0.8.1: the main legend (App.tsx legendRow) reads the value drawn at a bar exactly as the data window does: values[bar -
// offset], formatted by formatIndicatorValue with the instance precision and symbol tick size. SYNTHETIC values.
const T0=1767225600;
const bars:Bar[]=Array.from({length:10},(_,i)=>({time:T0+i*86400,open:1.1,high:1.2,low:1.0,close:1.1+i/1000,volume:1000}));
const series={symbol:'SYN',exchange:'LV',interval:'1D',description:'Synthetic',tickSize:0.00001};
/** The App.tsx legend read: displayed index (null = last bar) shifted by the offset, then the data window formatter. */
function legendText(values:readonly (number|null)[],row:{id:string;kind:string;offset?:number;presentation?:{precision?:DataWindowIndicatorInput['precision']}},at:number|null,tickSize:number):string[]{
 const port={values:()=>({series:[{id:'plot',values:values as unknown as ArrayLike<number>}]})};
 const offset=Number.isSafeInteger(row.offset)?row.offset as number:0,precision=row.presentation?.precision??'auto';
 const index=offset===0?at:(at??Math.max(0,...port.values().series.map(s=>s.values.length))-1)-offset;
 return indicatorLegendValues(port,row,index,()=>({color:'#000'}),value=>formatIndicatorValue(value,row.kind as never,precision,tickSize)).map(part=>part.text);
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
});
