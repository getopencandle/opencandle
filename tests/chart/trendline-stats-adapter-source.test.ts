import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {createTrendlineStatisticsSource} from '../../src/chart/trendline-stats-source';
import {createMarketQueue} from '../../src/chart/market-queue';
import {commitChartStyle} from '../../src/chart/style-transaction';
import {sourceContextForInput} from '../../src/chart/source-context';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import {validateChartOptions} from '../../src/chart/navigation';
import {requireVolume} from '../../src/chart/contracts';

/** Actual adapter bodies and source/queue helpers with controlled native sinks.
 * This proves mutation admission and rollback lifetime, not a window or rendering. */
function fixture(){
 const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const slice=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Review current statistics adapter source boundary: '+start);return source.slice(first,last);};
 const line=(start:string)=>slice(start,'\n');
 const epoch=slice('  let statsSourceEpoch:','  let retainedTypeSettings:');
 const writes=slice('  const writeMarketInput=','  let lastCrosshair:');
 const style=slice('  const applyRequestedStyle=','  const drawingSubscribers=');
 const marketMethods=slice('    setBars:','    setRange:');
 const options=slice('    applyChartOptions:','    pan:');
 const assembly=line('  if(rendererHolder.current)statsSource=');
 const annotation=line('  if(rendererHolder.current)trendlineAnnotation=');
 const rawConfig=line('    applyConfig:');
 // applyRendererConfig (inside the epoch slice) calls the module-level rendererPatchIsNoop; take the actual
 // helper block (plainRecord, sameConfigValue, rendererPatchIsNoop) that sits just above toVelaBars.
 const rendererPatch=slice('const plainRecord=','\nexport function toVelaBars(').replace('export function rendererPatchIsNoop(','function rendererPatchIsNoop(');
 const code=`const {createTrendlineStatisticsSource,createMarketQueue,commitChartStyle,sourceContextForInput,barInputIdentity,validateChartOptions,requireVolume}=injected;
 const bars=[1000,1060,1180].map(time=>({time,open:10,high:12,low:9,close:11,volume:5}));
 let currentBars=bars,currentSource={datasetId:'synthetic-stats-epoch',revision:'1',fixture:true,label:'Synthetic epoch fixture',inputIdentity:barInputIdentity(bars)},requestedStyle='candles',disposed=false,statsSource=null,marketUpdating=false,lastCrosshair=null,lastAppearance=null,failConfig=false,failMarket=false,failStudy=false,vwapSourceEpoch={},analysisUnavailable='';
 const callbacks={config:null,style:null,market:null};const scene={timezone:'UTC'};const recomputeLeases=[];
 const chart={renderer:{getConfig:()=>({chartTypes:{candles:{}}}),applyConfig:value=>{callbacks.config?.();if(failConfig)throw Error('SYNTHETIC config refusal');if(value.timeScale)scene.timezone=value.timeScale.timezone;},set:()=>{}},setMarket:async()=>{callbacks.market?.();if(failMarket){failMarket=false;throw Error('SYNTHETIC market failure');}}};
 let annotationHost,trendlineAnnotation;const installTrendlineAnnotation=(_r,_c,host)=>{annotationHost=host;return{};},unavailable=()=>{};
 const rendererHolder={current:{scene}},drawingCoordinateContext=()=>({timeCoordinatesAvailable:true}),scripts={invalidateResults(){}},queueInlineRefresh=()=>{},reprojectDrawings=()=>{},toVelaBars=value=>value;
 let fedDerivedKey=null;const derivedFeedKey=()=>null,velaFeed=value=>value,publishDerivedPayload=()=>{};
 const indicators={invalidateVwap(){},assertCapacity(){},recompute(){recomputeLeases.push(statsSource.capture());if(failStudy){failStudy=false;throw Error('SYNTHETIC calculation failure');}}};
 const APPEARANCE_LAYER='lv-test',PREVIOUS_CLOSE_STYLE='lv-previous',PREVIOUS_CLOSE_HA_STYLE='lv-ha',appearanceBoolean=()=>false;
 const chartTypes=()=>{callbacks.style?.();return[{id:'candles'},{id:'line'}];};
 ${rendererPatch}
 ${epoch}
 ${writes}
 ${style}
 ${annotation}
 ${assembly}
 const controller={${marketMethods}${options}${rawConfig}};
 return{controller,annotationOwner:()=>annotationHost.captureOwner(),source:()=>statsSource.capture(),callbacks,recomputeLeases,bars,read:()=>({bars:currentBars,source:currentSource,style:requestedStyle,timezone:scene.timezone}),failConfig:value=>{failConfig=value;},failMarket:()=>{failMarket=true;},failStudy:()=>{failStudy=true;},dispose:()=>{disposed=true;statsSource.dispose();}};`;
 return new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createTrendlineStatisticsSource,createMarketQueue,commitChartStyle,sourceContextForInput,barInputIdentity,validateChartOptions,requireVolume}) as any;
}

it('ordinary source reads and prepared-grid reads do not retire the current source',()=>{
 const f=fixture(),first=f.source(),grid=first.readGrid();expect(f.source()).toBe(first);expect(f.source().readGrid()).toBe(grid);first.assertCurrent();f.dispose();expect(()=>first.assertCurrent()).toThrow();
});
it('same and unavailable style attempts retire before extension callbacks',()=>{
 const f=fixture();try{for(const style of ['candles','unavailable-test-style']){const old=f.source();f.callbacks.style=()=>expect(()=>old.assertCurrent()).toThrow();f.controller.setStyle(style);expect(f.source().identity).not.toBe(old.identity);}}finally{f.dispose();}
});
it('failed style recomputation and rollback cannot revive either earlier source lease',()=>{
 const f=fixture();try{const old=f.source();f.failStudy();expect(()=>f.controller.setStyle('line')).toThrow('calculation failure');expect(f.read().style).toBe('candles');expect(()=>old.assertCurrent()).toThrow();expect(f.recomputeLeases).toHaveLength(2);expect(()=>f.recomputeLeases[0].assertCurrent()).toThrow();f.recomputeLeases[1].assertCurrent();}finally{f.dispose();}
});
it('timezone ABA and same-value raw config calls retire before native configuration',()=>{
 const f=fixture();try{const old=f.source();f.callbacks.config=()=>expect(()=>old.assertCurrent()).toThrow();f.controller.applyConfig({timeScale:{timezone:'America/Phoenix'}});f.controller.applyConfig({timeScale:{timezone:'UTC'}});expect(f.read().timezone).toBe('UTC');expect(()=>old.assertCurrent()).toThrow();const again=f.source();f.controller.applyConfig({timeScale:{timezone:'UTC'}});expect(()=>again.assertCurrent()).toThrow();}finally{f.dispose();}
});
it('native config failure and invalid options retire without fabricating successful settings',()=>{
 const f=fixture();try{const old=f.source();f.failConfig(true);expect(()=>f.controller.applyConfig({timeScale:{timezone:'America/Phoenix'}})).toThrow('config refusal');expect(f.read().timezone).toBe('UTC');expect(()=>old.assertCurrent()).toThrow();f.failConfig(false);const next=f.source();expect(()=>f.controller.applyChartOptions({source:'close',scale:'linear',invert:false,auto:true,timezone:'Not/A_Zone'})).toThrow();expect(()=>next.assertCurrent()).toThrow();expect(f.read().timezone).toBe('UTC');}finally{f.dispose();}
});
it('queued equal data and explicit rollback retire at admission, before async mutation',async()=>{
 const f=fixture();try{const old=f.source();const transaction=f.controller.setBarsWithRollback(f.bars);expect(()=>old.assertCurrent()).toThrow();expect(await transaction.result).toEqual({ok:true});const accepted=f.source(),acceptedGrid=accepted.readGrid();const result=transaction.rollback();expect(()=>accepted.assertCurrent()).toThrow();expect(await result).toEqual({ok:true});expect(f.source().readGrid()).not.toBe(acceptedGrid);const consumed=f.source();await expect(transaction.rollback()).rejects.toThrow('consumed');expect(()=>consumed.assertCurrent()).toThrow();}finally{f.dispose();}
});
it('failed market apply retires intermediate captures before restoring the previous data',async()=>{
 const f=fixture();try{const old=f.source(),during:any[]=[];f.callbacks.market=()=>during.push(f.source());f.failMarket();await expect(f.controller.setBars(f.bars.slice(0,2))).rejects.toThrow('market failure');expect(during).toHaveLength(2);expect(f.read().bars).toHaveLength(3);expect(()=>old.assertCurrent()).toThrow();expect(()=>during[0].assertCurrent()).toThrow();during[1].assertCurrent();}finally{f.dispose();}
});

// applyRendererConfig skips native applyConfig for a no-op patch (rendererPatchIsNoop), so the empty patch {} can no longer
// reach the failing native sink; the failed attempt uses a real patch and {} is kept as a same-value attempt that still retires.
it('actual annotation frame owner shares the source mutation epoch for failed and same-value attempts',()=>{
 const f=fixture();try{const original=f.annotationOwner();f.controller.setStyle('candles');expect(original).toThrow();const after=f.annotationOwner();f.failConfig(true);expect(()=>f.controller.applyConfig({timeScale:{timezone:'America/Phoenix'}})).toThrow('config refusal');expect(after).toThrow();const beforeNoop=f.annotationOwner();expect(f.controller.applyConfig({})).toBeUndefined();expect(beforeNoop).toThrow();const beforeInvalid=f.annotationOwner();f.controller.setStyle('unsupported');expect(beforeInvalid).toThrow();}finally{f.dispose();}
});
