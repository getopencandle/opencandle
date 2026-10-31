import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createComparisonPort} from '../../src/chart/compare-port';
import {createNativeCaptureAuthority,type NativeCaptureState} from '../../src/chart/native-capture-authority';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

const caught=(action:()=>unknown):unknown=>{try{action();return undefined;}catch(error){return error;}};
function captureHost(controller:object){
 const dataset=fixtureDataset('GME',1),desired={bars:dataset.bars,source:sourceContextForDataset(dataset),style:'candles'},configuration={};
 const state:NativeCaptureState<object>={controller,desired,accepted:desired,configuration,acceptedConfiguration:configuration,executionIdentity:'ordinary',applying:false,loading:false,settled:true};
 const authority=createNativeCaptureAuthority(controller,state,()=>state,()=>true);let attempts=0;
 return {authority,reject:(stage:()=>unknown)=>authority.publish(stage,()=>{attempts++;return false;}),attempts:()=>attempts};
}

it.each(['indicator','comparison'] as const)('an accepted %s Add reports explicit grid rejection without undoing or duplicating the accepted native model',async kind=>{
 const native=await nativeCoreHarness(),indicators=createIndicatorPort(native.chart,undefined,undefined,undefined,native.bridge.claim),comparisons=createComparisonPort(native.chart,native.bridge.claim),host=captureHost(native.chart);
 try{
  const port=kind==='indicator'?indicators:comparisons;port.subscribe(()=>host.reject(()=>port.list()));
  const error=caught(()=>kind==='indicator'?indicators.add('sma',{length:1}):comparisons.add(fixtureDataset('SPY',1)));
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});
  expect(port.list()).toHaveLength(1);expect(host.attempts()).toBe(1);
  const row=port.list()[0];expect(native.native.scene.indicators.has(row.rendererId)).toBe(true);
 }finally{indicators.dispose();comparisons.dispose();native.dispose();}
});

it.each(['indicator','comparison'] as const)('accepted %s updates attempt all observers once and retain native accepted state after publication failure',async kind=>{
 const native=await nativeCoreHarness(),indicators=createIndicatorPort(native.chart,undefined,undefined,undefined,native.bridge.claim),comparisons=createComparisonPort(native.chart,native.bridge.claim);
 try{
  const id=kind==='indicator'?indicators.add('sma',{length:1}):comparisons.add(fixtureDataset('SPY',1)),port=kind==='indicator'?indicators:comparisons,calls:string[]=[];
  port.subscribe(()=>{calls.push('throw');throw Error('Literal first observer failure');});
  port.subscribe(()=>{calls.push('false');return false;});
  port.subscribe(()=>{calls.push('last');});
  const error=caught(()=>kind==='indicator'?indicators.update(id,{offset:1}):comparisons.update(id,{color:'#123456',width:4}));
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(calls).toEqual(['throw','false','last']);
  if(kind==='indicator')expect(indicators.list()[0].offset).toBe(1);
  else{expect(comparisons.list()[0]).toMatchObject({color:'#123456',width:4});expect(native.native.scene.indicators.get(port.list()[0].rendererId).series[0].style).toMatchObject({color:'#123456',width:4});}
 }finally{indicators.dispose();comparisons.dispose();native.dispose();}
});

it('comparison restore suppresses intermediate and cancelled rollback notifications and publishes accepted replacement once',async()=>{
 const native=await nativeCoreHarness(),port=createComparisonPort(native.chart,native.bridge.claim);
 try{
  port.add(fixtureDataset('SPY',1),{id:'old'});const snapshots:string[][]=[];port.subscribe(()=>{snapshots.push(port.list().map(row=>row.id));return false;});
  const settings=port.list().map(({rendererId,...row})=>({...row,id:'replacement',color:'#abcdef'}));
  const error=caught(()=>port.restore(settings));
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(snapshots).toEqual([['replacement']]);expect(port.list().map(row=>row.id)).toEqual(['replacement']);
 }finally{port.dispose();native.dispose();}
});
