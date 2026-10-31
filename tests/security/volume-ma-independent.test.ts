import {expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {assertIndicatorBatchBudget,type IndicatorBudgetItem,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import type {Bar} from '../../src/domain/types';

const bars=(values:number[]):Bar[]=>values.map((volume,i)=>({time:1700000000+i*60,open:10,high:12,low:9,close:11,volume}));

it('WMA agrees with an independent exact indexed-prefix-sum identity across window lengths',()=>{
 const values=Array.from({length:31},(_,i)=>(i*17+3)%29),input=bars(values),sum=[0n],indexed=[0n];for(let i=0;i<values.length;i++){sum.push(sum[i]+BigInt(values[i]));indexed.push(indexed[i]+BigInt(i)*BigInt(values[i]));}
 for(const length of [1,2,5,17,32]){
  const expected=values.map((_value,i)=>i+1<length?null:Number(indexed[i+1]-indexed[i+1-length]+BigInt(length-i)*(sum[i+1]-sum[i+1-length]))/(length*(length+1)/2));
  expect(calculateIndicator('volume',input,{length,maType:'WMA'}).series[1].values).toEqual(expected);
 }
});

it('an exactly20million-operation chart batch remains admitted and the next WMA instance rejects',()=>{
 const items:IndicatorBudgetItem[]=[...Array.from({length:439},()=>({kind:'ema' as const,inputs:{length:9,source:'close'}})),...Array.from({length:12},()=>({kind:'volume' as const,inputs:{length:1,maType:'WMA'}}))];
 // Unchanged EMA base avoids the newly charged SMA leg:439*44,000 +12*57,000;439*3,000 +12*6,000 slots.
 expect(assertIndicatorBatchBudget(items,1000)).toEqual({operations:20000000,numericSlots:1389000});expect(()=>assertIndicatorBatchBudget([...items,{kind:'volume',inputs:{length:1,maType:'WMA'}}],1000)).toThrow(/20057000\/20000000/);
});

it('frozen SMA, EMA and WMA remain distinct on a zero-containing prefix after the live type changes',async()=>{
 const input=bars([0,8,4,12,0]),row:IndicatorInstanceSettings={...factoryIndicatorDefault('volume'),id:'SYNTHETIC independent frozen Volume',kind:'volume',inputs:{length:3}},sources=['SMA','EMA','WMA'].map(maType=>captureIndicatorAlertSource({...row,inputs:{...row.inputs,maType}},'ma','standard','fixed independent snapshot'));
 const before=JSON.stringify(sources);row.inputs.maType='WMA';row.inputs.length=1;const result=await evaluateTechnicalAlertSources(input,sources,'USD');
 expect(sources.map(source=>result.results.get(technicalSourceKey(source))!.sample.value)).toEqual([16/3,4,14/3]);expect(JSON.stringify(sources)).toBe(before);expect(sources[0].inputs).toEqual({length:3});
});

it('invalid optional types and foreign-indicator use reject before touching any source row',()=>{
 let reads=0;const input=Array<Bar>(1);Object.defineProperty(input,'0',{enumerable:true,get(){reads++;throw Error('Unadmitted calculation read source');}});
 for(const maType of [undefined,null,'EMA ','ema',1]){const output=calculateIndicator('volume',input,{length:3,maType});expect(output.series).toEqual([]);expect(output.diagnostics).toHaveLength(1);}expect(calculateIndicator('ema',input,{length:3,maType:'SMA'}).series).toEqual([]);expect(reads).toBe(0);
});
