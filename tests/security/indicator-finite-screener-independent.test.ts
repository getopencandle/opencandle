import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {runScreener,type ScreenerColumn} from '../../src/domain/screener';
import type {Bar} from '../../src/domain/types';

it.each([
 {parameters:{oscillatorType:'SMA',signalType:'EMA'},count:2,length:80000},
 {parameters:{oscillatorType:'EMA',signalType:'SMA'},count:3,length:100000},
])('charges separately selected MACD SMA legs before reading rows: $parameters',({parameters,count,length})=>{
 let reads=0;const rows=Array<Bar>(length);
 Object.defineProperty(rows,'0',{get(){reads++;throw Error('SYNTHETIC forbidden preflight read');}});
 const datasets=Array.from({length:count},(_,index)=>({...fixtureDataset(`SYNTHETIC-${index}`,0),bars:rows}));
 const result=runScreener(datasets,[{id:'macd',metric:'macd',parameters}]);
 expect(reads).toBe(0);expect(result.coverage.evaluated).toBe(0);
 expect(result.diagnostics.some(value=>value.code==='WORKLOAD_LIMIT')).toBe(true);
});

it('retains the existing ATR WMA length-dependent work gate',()=>{
 let reads=0;const rows=Array<Bar>(100000);
 Object.defineProperty(rows,'0',{get(){reads++;throw Error('SYNTHETIC forbidden WMA read');}});
 const result=runScreener([{...fixtureDataset('SYNTHETIC-WMA',0),bars:rows}],[{id:'atr',metric:'atr',parameters:{length:100000,smoothing:'WMA'}}]);
 expect(reads).toBe(0);expect(result.coverage.evaluated).toBe(0);
 expect(result.diagnostics.some(value=>value.code==='WORKLOAD_LIMIT')).toBe(true);
});

it('keeps an oversized shared metric predicate unknown without reading its rows',()=>{
 let reads=0;const rows=Array<Bar>(100001);
 Object.defineProperty(rows,'0',{get(){reads++;throw Error('SYNTHETIC forbidden oversized read');}});
 const data={...fixtureDataset('SYNTHETIC-UNKNOWN',0),bars:rows};
 const result=runScreener([data],[{id:'average',metric:'averageVolume'}],[{id:'positive',columnId:'average',operator:'gt',value:0,active:true}]);
 expect(reads).toBe(0);expect(result.diagnostics).toEqual([]);expect(result.rows).toEqual([]);
 expect(result.unknownRows[0].cells.average).toMatchObject({state:'unavailable',value:null,previous:null,asOf:null});
 expect(result.coverage).toMatchObject({evaluated:1,matched:0,excluded:0,unavailablePredicate:1});
});

it('preserves a simultaneous ordinary price metric while withholding an oversized shared calculation',()=>{
 const bars=Array.from({length:100001},(_,index)=>({time:1700000000+index,open:2,high:3,low:1,close:2,volume:4}));
 const data={...fixtureDataset('SYNTHETIC-MIXED',0),bars};data.provenance.session='regular';
 const columns:ScreenerColumn[]=[{id:'last',metric:'last'},{id:'average',metric:'averageVolume'}];
 const result=runScreener([data],columns);
 expect(result.diagnostics).toEqual([]);expect(result.rows[0].cells.last).toMatchObject({state:'available',value:2,asOf:1700100000});
 expect(result.rows[0].cells.average).toMatchObject({state:'unavailable',value:null,previous:null,asOf:null});
});
