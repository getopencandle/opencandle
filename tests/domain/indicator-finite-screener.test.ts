import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {runScreener,type ScreenerColumn} from '../../src/domain/screener';
import type {Bar,BarDataset} from '../../src/domain/types';

const dataset=(id:string,bars:Bar[]):BarDataset=>{
 const result=fixtureDataset(id,0);result.bars=bars;result.provenance.session='regular';return result;
};

it.each([
 {id:'average',metric:'averageVolume',parameters:{length:2}},
 {id:'relative',metric:'relativeVolume',parameters:{length:2}},
 {id:'sma',metric:'sma',parameters:{length:2}},
 {id:'atr',metric:'atr',parameters:{length:2,smoothing:'SMA'}},
 {id:'macd',metric:'macd',parameters:{fast:2,slow:3,signal:2,oscillatorType:'SMA',signalType:'SMA'}},
] satisfies ScreenerColumn[])('charges every shared SMA leg before any dataset row read: $metric',column=>{
 let reads=0;
 const rows=Array<Bar>(100000);Object.defineProperty(rows,'0',{get(){reads++;throw Error('SYNTHETIC preflight must precede row reads');}});
 const inputs=[dataset('SYNTHETIC-A',rows),dataset('SYNTHETIC-B',rows),dataset('SYNTHETIC-C',rows)];
 const result=runScreener(inputs,[column]);
 expect(reads).toBe(0);expect(result.rows).toEqual([]);expect(result.coverage.evaluated).toBe(0);
 expect(result.diagnostics.some(value=>value.code==='WORKLOAD_LIMIT')).toBe(true);
});

it.each(['averageVolume','relativeVolume','sma','ema','rsi','atr','macd'])('returns a per-dataset unavailable cell above shared indicator row bounds: %s',metric=>{
 let reads=0;const rows=Array<Bar>(100001);
 for(const index of [0,100000])Object.defineProperty(rows,String(index),{get(){reads++;throw Error('SYNTHETIC oversized unavailable dataset must not read rows');}});
 const result=runScreener([dataset('SYNTHETIC-OVERSIZED',rows)],[{id:'value',metric}]);
 expect(reads).toBe(0);expect(result.diagnostics).toEqual([]);expect(result.rows).toHaveLength(1);
 expect(result.rows[0].cells.value).toMatchObject({value:null,previous:null,state:'unavailable',asOf:null});
 expect(result.rows[0].cells.value.reason).toContain('100000');
});

it('retains the existing bounds for unrelated metrics on a longer valid dataset',()=>{
 const rows=Array.from({length:100001},(_,index)=>({time:1700000000+index,open:2,high:3,low:1,close:2,volume:4}));
 const result=runScreener([dataset('SYNTHETIC-PRICE',rows)],[{id:'last',metric:'last'},{id:'symbol',metric:'symbol'}]);
 expect(result.diagnostics).toEqual([]);expect(result.rows[0].cells.last).toMatchObject({state:'available',value:2});
 expect(result.rows[0].cells.symbol.value).toBe('SYNTHETIC-PRICE');
});

it('contains the direct SMA row-bound failure for an otherwise valid oversized average-volume dataset',()=>{
 const rows=Array.from({length:100001},(_,index)=>({time:1700000000+index,open:2,high:3,low:1,close:2,volume:4}));
 const result=runScreener([dataset('SYNTHETIC-VALID-OVERSIZED',rows)],[{id:'average',metric:'averageVolume'}]);
 expect(result.rows[0].cells.average).toMatchObject({state:'unavailable',value:null,previous:null,asOf:null});
 expect(result.rows[0].cells.average.reason).toContain('100000');
});

it('does not let an unavailable oversized average erase a valid smaller dataset',()=>{
 let reads=0;const tooLong=Array<Bar>(100001);Object.defineProperty(tooLong,'0',{get(){reads++;throw Error('No oversized calculation reads');}});
 const small=[2,4,6].map((value,index)=>({time:1700000000+index,open:value,high:value,low:value,close:value,volume:value}));
 const result=runScreener([dataset('SYNTHETIC-LARGE',tooLong),dataset('SYNTHETIC-SMALL',small)],[{id:'average',metric:'averageVolume',parameters:{length:2}}]);
 expect(reads).toBe(0);expect(result.diagnostics).toEqual([]);
 expect(result.rows.map(row=>row.cells.average.state)).toEqual(['unavailable','available']);
 expect(result.rows[1].cells.average.value).toBe(5);
});
