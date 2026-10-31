import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import type {BarDataset} from '../../src/domain/types';
import {createMarketQueue} from '../../src/chart/market-queue';
import {cloneProfileInputBars} from '../../src/chart/profile-input-clone';
import {sourceContextForDataset,sourceContextForInput,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity,isLiveInputIdentity} from '../../src/chart/bar-input-identity';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {requireVolume} from '../../src/chart/contracts';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {profileSourceContext} from '../../src/chart/vp-visible-range-ltf';
import {nativeHost} from '../ui/indicator-real-port-harness';

/** Executes actual adapter init/context/write/apply/setter bodies plus the actual market queue and indicator port.
 * Only the native chart transport is controlled in memory. No DOM, Electron or product-interface evidence. */
export function profileAdapterHarness(primary:BarDataset){
 const root=process.env.LV_PROFILE_SOURCE_ROOT??'.',source=readFileSync(resolve(root,'src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n');
 const line=(needle:string)=>{const value=source.split('\n').find(row=>row.includes(needle));if(!value)throw Error('Review actual adapter line: '+needle);return value;};
 const start=source.indexOf('  const writeMarketInput='),end=source.indexOf('  let lastCrosshair:',start);if(start<0||end<0)throw Error('Review actual adapter write/apply/queue boundary');
 const init=line('let currentBars ='),frame=line('let currentSource:ChartSourceContext='),context=line('const indicators=createIndicatorPort('),writes=source.slice(start,end),set=line('    setBars:'),transaction=line('    setBarsWithRollback:');
 const nativeRows=primary.bars.map(bar=>({...bar,time:bar.time*1000})),host=nativeHost(nativeRows);let fail=false,port:ReturnType<typeof createIndicatorPort>|undefined;
 Object.assign(host.chart,{getVisibleRange:()=>null,setVisibleRange(){},setMarket:async({data}:{data:typeof nativeRows})=>{if(fail){fail=false;throw Error('SYNTHETIC native market failure');}nativeRows.splice(0,nativeRows.length,...data);port?.recompute();}});
 const code=`const {bars,sourceContext,chart,createMarketQueue,cloneProfileInputBars,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,createIndicatorPort,profileSourceContext}=injected;
 let requestedStyle='candles',disposed=false,marketUpdating=false,lastCrosshair=null,fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache(),vwapSourceEpoch={};
 const paneRegistry=undefined,claimNative=undefined,drawingUtilityState={},vwapPrefixSource=undefined,applicationVwapClient=()=>{throw Error('Unused synthetic VWAP client');};
 const sharedFeedRows=value=>value,indicatorContextWithOverlay=resolution=>({resolution}),sourceAxisBasis=()=>({assetClass:'crypto',timezone:'UTC'}),sourcePivotCalendar=()=>'utc',sourceExchangeTimeZone=()=>'UTC';
 const scripts={invalidateResults(){}},retireStatisticsSource=()=>{},retireVwapSource=()=>{},queueInlineRefresh=()=>{},reprojectDrawings=()=>{},publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=value=>value,toVelaBars=value=>value.map(bar=>({...bar,time:bar.time*1000})),EMPTY_MARKET_MESSAGE='SYNTHETIC empty history',restoreRejectedVwapInput=result=>result;
 ${init}\n${frame}
 const analysisPublication={captureOwner(){const source=currentSource,input=currentBars;return{isCurrent:()=>!disposed&&currentSource===source&&currentBars===input,quarantine(error){throw error;}};},assertMutable(){if(disposed)throw Error('SYNTHETIC disposed');}};
 ${context}\n${writes}
 return{port:indicators,controller:{${set}\n${transaction}},read:()=>({bars:currentBars,source:currentSource}),dispose(){disposed=true;indicators.dispose();}};`;
 const build=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))();
 const result=build({bars:primary.bars,sourceContext:sourceContextForDataset(primary),chart:host.chart,createMarketQueue,cloneProfileInputBars,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,createIndicatorPort,profileSourceContext});port=result.port;
 const id=port!.add('pvp',{period:'Month',valueAreaVolume:0});return{...result,id,profile:()=>port!.values(id).profiles![0],poc:()=>port!.values(id).series[0].values[0],failNext(){fail=true;}};
}
