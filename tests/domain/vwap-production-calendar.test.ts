import {expect,it} from 'vitest';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import type {VwapAnchor,VwapCalculationSettings} from '../../src/vwap/types';

const settings=(patch:Partial<VwapCalculationSettings>={}):VwapCalculationSettings=>({kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC',transform:'standard',bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3,...patch});
const seconds=(text:string)=>Date.parse(text)/1000;
function calculate(input:number[][],patch:Partial<VwapCalculationSettings>={}){const result=calculateVwapWorkerMessage({v:1,type:'calculate',job:'calendar-literal',rows:input.length,settings:settings(patch),buffer:new Float64Array(input.flat()).buffer}),values=new Float64Array(result.values),mask=new Uint8Array(result.mask);return Array.from({length:input.length},(_,index)=>mask[index]?values[index]:null);}
const cases:Array<[VwapAnchor,string,string,string]>=[
 ['Session','2024-01-02T10:00:00Z','2024-01-02T23:59:59Z','2024-01-03T00:00:00Z'],
 ['Week','2024-01-01T00:00:00Z','2024-01-07T23:59:59Z','2024-01-08T00:00:00Z'],
 ['Month','2024-01-01T00:00:00Z','2024-01-31T23:59:59Z','2024-02-01T00:00:00Z'],
 ['Quarter','2024-01-01T00:00:00Z','2024-03-31T23:59:59Z','2024-04-01T00:00:00Z'],
 ['Year','2024-01-01T00:00:00Z','2024-12-31T23:59:59Z','2025-01-01T00:00:00Z'],
 ['Decade','2020-01-01T00:00:00Z','2029-12-31T23:59:59Z','2030-01-01T00:00:00Z'],
 ['Century','2000-01-01T00:00:00Z','2099-12-31T23:59:59Z','2100-01-01T00:00:00Z']
];
for(const [anchor,...dates] of cases)it(`uses the declared ${anchor} calendar reset with no exchange-session inference`,()=>{
 const rows=dates.map((date,index)=>[seconds(date),...Array(4).fill((index+1)*10),1]);expect(calculate(rows,{anchor})).toEqual([10,15,30]);
 for(let count=1;count<=rows.length;count++)expect(calculate(rows.slice(0,count),{anchor})).toEqual([10,15,30].slice(0,count));
});

it('uses the declared zone through DST and supports early-year Monday anchors without the Date.UTC 1900 offset',()=>{
 const ny=['2024-03-10T04:59:59Z','2024-03-10T05:00:00Z','2024-03-10T07:00:00Z'].map((date,index)=>[seconds(date),...Array(4).fill((index+1)*10),1]);
 expect(calculate(ny,{anchor:'Session',timezone:'America/New_York'})).toEqual([10,20,25]);
 const early=['0001-01-01T00:00:00Z','0001-01-07T23:59:59Z','0001-01-08T00:00:00Z'].map((date,index)=>[seconds(date),...Array(4).fill((index+1)*10),1]);expect(calculate(early,{anchor:'Week'})).toEqual([10,15,30]);
});

it('uses the original nonuniform Heikin Ashi recurrence before the exact selected-source average',()=>{
 const rows=[[1000,4,10,2,8,1],[1001,8,14,6,12,1]];
 for(const [source,expected] of Object.entries({open:[6,6],high:[10,12],low:[2,4],close:[6,8],hl2:[6,8],hlc3:[6,8],ohlc4:[6,7.5]}))expect(calculate(rows,{transform:'heikin-ashi',source:source as VwapCalculationSettings['source']})).toEqual(expected);
});

it('keeps wire null separate from negative underflow zero and from an exact zero cancellation',()=>{
 const tiny=Number.MIN_VALUE,huge=Number.MAX_VALUE,values=calculate([[1000,-tiny,-tiny,-tiny,-tiny,0],[1001,-tiny,-tiny,-tiny,-tiny,1],[1002,0,0,0,0,huge]]);
 expect(values[0]).toBeNull();expect(values[1]).toBe(-tiny);expect(Object.is(values[2],-0)).toBe(true);
 expect(Object.is(calculate([[1000,-tiny,-tiny,-tiny,-tiny,1],[1001,tiny,tiny,tiny,tiny,1]])[1],0)).toBe(true);
});
