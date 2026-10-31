import {describe,expect,it} from 'vitest';
import {calculateIndicator,indicatorCalculationWork,sma,type IndicatorId} from '../../src/domain/indicators';
import {assertIndicatorBatchBudget,type IndicatorBudgetItem} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources} from '../../src/domain/technical-alerts';
import type {Bar} from '../../src/domain/types';

const instance=(kind:IndicatorId,inputs:Record<string,unknown>={}):IndicatorBudgetItem=>{
 const saved=factoryIndicatorDefault(kind);return {kind,...saved,inputs:{...saved.inputs,...inputs}};
};

describe('finite-range arithmetic resource and caller contracts',()=>{
 it.each([
  ['volume',{},9600000,100000],['sma',{},9600000,100000],
  ['bb',{},21597720,74635],['bb',{basisType:'VWMA'},27997720,60247],
  ['stochastic',{},18799636,87720],['atr',{},3200000,100000],
  ['atr',{smoothing:'SMA'},9600000,100000],['macd',{},3200000,100000],
  ['macd',{oscillatorType:'SMA',signalType:'SMA'},22400000,76923],
  ['sma',{smoothingType:'SMA+BB',smoothingLength:14,smoothingMultiplier:2},25998908,61731],
  ['rsi',{smoothingType:'VWMA',smoothingLength:14,smoothingMultiplier:2},17600000,92592],
 ] as const)('%s counts its actual averages and factory native output', (kind,inputs,expectedWork,nativeMaximum)=>{
  const item=instance(kind,inputs);
  expect(indicatorCalculationWork(kind,100000,item.inputs)).toBe(expectedWork);
  expect(()=>assertIndicatorBatchBudget([item],nativeMaximum)).not.toThrow();
  if(nativeMaximum<100000)expect(()=>assertIndicatorBatchBudget([item],nativeMaximum+1)).toThrow(/estimated operations/);
 });

 it('includes renderer work and every instance even when the plots are hidden',()=>{
  const average=instance('sma'),volume=instance('volume');
  for(const style of Object.values(average.plots??{}))style.visible=false;
  expect(assertIndicatorBatchBudget([average],100000)).toEqual({operations:10800000,numericSlots:300000});
  expect(assertIndicatorBatchBudget([volume],100000)).toEqual({operations:12000000,numericSlots:600000});
  expect(()=>assertIndicatorBatchBudget([average,average],100000)).toThrow(/21600000\/20000000/);
  expect(()=>assertIndicatorBatchBudget([volume,volume],100000)).toThrow(/24000000\/20000000/);
  expect(assertIndicatorBatchBudget(Array.from({length:16},()=>average),500)).toEqual({operations:864000,numericSlots:24000});
 });

 it('rejects the calculator ceiling before reading any bar',()=>{
  let reads=0;const rows=Array<Bar>(92604);Object.defineProperty(rows,'0',{get(){reads++;throw Error('No bar read before budget rejection');}});
  const result=calculateIndicator('bb',rows,{length:20,multiplier:2,basisType:'SMA',source:'close'});
  expect(result.series).toEqual([]);expect(result.diagnostics[0]).toContain('20000184 estimated operations');expect(reads).toBe(0);
 });

 it('charges frozen SMA calculations before validating or materializing a batch',async()=>{
  let reads=0;const rows=Array<Bar>(100000);Object.defineProperty(rows,'0',{get(){reads++;throw Error('No frozen bar read before budget rejection');}});
  const sources=[1,2,3].map(length=>captureIndicatorAlertSource({id:'synthetic-sma-'+length,kind:'sma',...factoryIndicatorDefault('sma'),inputs:{length,source:'close'}},'sma','standard','synthetic-snapshot-'+length));
  await expect(evaluateTechnicalAlertSources(rows,sources,'USD')).rejects.toThrow(/estimated operations/);expect(reads).toBe(0);
 });

 it('enforces the public SMA row ceiling before indexed reads and keeps declared gaps',()=>{
  let reads=0;const values=Array<number|null>(100001);Object.defineProperty(values,'0',{get(){reads++;throw Error('No value read before row bound');}});
  expect(()=>sma(values,1)).toThrow(/100000/);expect(reads).toBe(0);
  expect(sma([null,NaN,Infinity,-Infinity,-0,1],1)).toEqual([null,null,null,null,0,1]);
  expect(sma([1,null,3,4,5],3)).toEqual([null,null,null,null,4]);
  expect(sma([1,2],3)).toEqual([null,null]);
 });

 it('keeps exact prefix agreement through cancellation, a third residual, gaps and recovery',()=>{
  const values=[Number.MAX_VALUE,1,Number.MIN_VALUE,-Number.MAX_VALUE,-1,Number.MIN_VALUE,null,2,4,6];
  for(const length of [1,2,3,5]){
   const full=sma(values,length);
   for(let count=0;count<=values.length;count++){
    let futureReads=0;const prefix=new Proxy(values.slice(0,count),{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key)&&Number(key)>=count){futureReads++;throw Error('Future input read');}return Reflect.get(target,key,receiver);}});
    expect(sma(prefix,length)).toEqual(full.slice(0,count));expect(futureReads).toBe(0);
   }
  }
 });
});
