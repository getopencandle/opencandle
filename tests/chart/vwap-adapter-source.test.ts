import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {createOwnedVwapPrefixSource} from '../../src/chart/vwap-prefix-source';
import {createMarketQueue} from '../../src/chart/market-queue';
import {commitChartStyle} from '../../src/chart/style-transaction';
import {sourceContextForInput} from '../../src/chart/source-context';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import {requireVolume} from '../../src/chart/contracts';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';

// Current adapter bodies, actual input queue and owned prefix; controlled native
// calls. This is source/lifecycle evidence, not a mounted native window.
function fixture(){
 const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const section=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Adapter body boundary changed: '+start);return source.slice(first,last);};
 const line=(start:string)=>section(start,'\n');
 const code=`const {createOwnedVwapPrefixSource,createMarketQueue,commitChartStyle,sourceContextForInput,barInputIdentity,requireVolume,createCalculationBarCache}=injected;
 const bars=[1000,1060,1180].map(time=>({time,open:10,high:12,low:9,close:11,volume:5}));
 let currentBars=structuredClone(bars),currentSource={datasetId:'synthetic-vwap',revision:'1',fixture:true,label:'Synthetic VWAP fixture',inputIdentity:barInputIdentity(bars)},requestedStyle='candles',disposed=false,vwapPrefixSource=null,marketUpdating=false,analysisPending=0,analysisUnavailable='',lastCrosshair=null,failMarket=false,failStudy=false,failClear=false;
 ${line('  let vwapSourceEpoch:')}
 const failures=[],captures=[],events=[],callbacks={style:null,market:null};let host;
 const chart={renderer:{applyConfig(){}},setMarket:async()=>{events.push('market');callbacks.market?.();if(failMarket){failMarket=false;throw Error('Synthetic market refusal');}indicators.recompute();}};
 const unavailable=message=>{failures.push(message);analysisUnavailable=message;};
 const createIndicatorPort=(...args)=>{host=args[7];return{invalidateVwap(){events.push('retire');if(failClear)throw Error('Synthetic clear refusal');},assertCapacity(){},waitForVwap:async()=>{},recompute(){events.push('compute');if(failStudy){failStudy=false;throw Error('Synthetic study refusal');}captures.push(host.capture());}};};
 const paneRegistry={},claimNative=undefined,calculationBarsForStyle=value=>value,applicationVwapClient=()=>{throw Error('No worker requested by this controlled source test');};
 ${line('  const analysisPublication:')}
 ${line('  const indicators=createIndicatorPort')}
 ${section('  let statsSourceEpoch:','  let retainedTypeSettings:')}
 ${line('  vwapPrefixSource=createOwnedVwapPrefixSource')}
 const scripts={invalidateResults(){}},queueInlineRefresh=()=>{},reprojectDrawings=()=>{},toVelaBars=value=>value;
 let fedDerivedKey=null;const derivedFeedKey=()=>null,velaFeed=value=>value,publishDerivedPayload=()=>{};
 ${section('  const writeMarketInput=','  let lastCrosshair:')}
 const chartTypes=()=>{callbacks.style?.();return[{id:'candles'},{id:'line'},{id:'heikinashi'}];},applyRequestedStyle=()=>{},waitPlacement=async()=>{};
 const calculationBars=createCalculationBarCache();
 const controller={${line('    getSourceBars:')}${line('    getCalculationBars:')}${section('    waitForAnalysisPlacement:','    prepareAnalysisSnapshot:')}${section('    setBars:','    setRange:')}isInputCurrent:input=>!disposed&&!analysisUnavailable&&!marketQueue.isPending()&&currentSource.inputIdentity===barInputIdentity(input.bars)&&currentSource.datasetId===input.source.datasetId&&requestedStyle===input.style};
 return{controller,analysisPublication,captures,events,callbacks,failures,bars,input:()=>({bars,source:currentSource,style:requestedStyle}),capture:()=>host.capture(),read:()=>({bars:currentBars,source:currentSource,style:requestedStyle,execution:currentExecutionIdentity}),failMarket:()=>failMarket=true,failStudy:()=>failStudy=true,failClear:()=>failClear=true,dispose:()=>{disposed=true;vwapPrefixSource.dispose();}};
 `;
 return new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createOwnedVwapPrefixSource,createMarketQueue,commitChartStyle,sourceContextForInput,barInputIdentity,requireVolume,createCalculationBarCache}) as any;
}
it('actual host captures its detached current input and preserves raw HA rows',async()=>{
 const f=fixture(),prefix=f.capture();await prefix.prepare(new AbortController().signal);expect(Object.isFrozen(f.bars)).toBe(false);expect(Object.isFrozen(f.read().bars)).toBe(true);f.controller.setStyle('heikinashi');expect(()=>prefix.assertCurrent()).toThrow();const next=f.capture();expect(next.transform).toBe('heikin-ashi');await next.prepare(new AbortController().signal);expect(next.readRows(0,1)[0]).toMatchObject({open:10,close:11});
});
it('same and invalid style attempts retire before extension callbacks and recompute current input',()=>{
 const f=fixture();for(const style of ['candles','unsupported']){const prefix=f.capture();f.callbacks.style=()=>expect(()=>prefix.assertCurrent()).toThrow();f.controller.setStyle(style);expect(()=>prefix.assertCurrent()).toThrow();f.captures.at(-1).assertCurrent();}
});
it('equal source admission and explicit rollback invalidate previous capabilities immediately',async()=>{
 const f=fixture(),old=f.capture(),transaction=f.controller.setBarsWithRollback(f.bars);expect(()=>old.assertCurrent()).toThrow();expect(await transaction.result).toEqual({ok:true});const accepted=f.capture(),rollback=transaction.rollback();expect(()=>accepted.assertCurrent()).toThrow();expect(await rollback).toEqual({ok:true});f.capture().assertCurrent();
});
it('failed market and failed style restoration cannot revive intermediate prefix handles',async()=>{
 const f=fixture(),during:any[]=[];f.callbacks.market=()=>during.push(f.capture());f.failMarket();await expect(f.controller.setBars(f.bars.slice(0,2))).rejects.toThrow('market refusal');expect(during).toHaveLength(2);expect(()=>during[0].assertCurrent()).toThrow();during[1].assertCurrent();const before=f.capture();f.failStudy();expect(()=>f.controller.setStyle('line')).toThrow('study refusal');expect(f.read().style).toBe('candles');expect(()=>before.assertCurrent()).toThrow();f.capture().assertCurrent();
});
it('same-prefix replay run replaces the execution owner and old quarantine cannot reach it',()=>{
 const f=fixture(),prefix=f.capture(),owner=f.analysisPublication.captureOwner();f.controller.setExecutionIdentity('replay:1');expect(()=>prefix.assertCurrent()).toThrow();expect(owner.isCurrent()).toBe(false);owner.quarantine(Error('Old failure'));expect(f.failures).toEqual([]);expect(f.controller.getExecutionIdentity()).toBe('replay:1');f.controller.setExecutionIdentity('ordinary');expect(()=>prefix.assertCurrent()).toThrow();f.capture().assertCurrent();
});
it('reaffirming the same execution identity preserves prepared current input without another calculation',()=>{
 const f=fixture(),prefix=f.capture();f.controller.setExecutionIdentity('ordinary');prefix.assertCurrent();expect(f.events).toEqual([]);f.controller.setExecutionIdentity('replay:1');const replay=f.capture(),events=f.events.length;f.controller.setExecutionIdentity('replay:1');replay.assertCurrent();expect(f.events).toHaveLength(events);
});
it('external alert capture checks both expected input and execution before issuing a capability',()=>{
 const f=fixture(),input=f.input();expect(f.controller.captureVwapPrefix(input,'ordinary').rows).toBe(3);f.controller.setExecutionIdentity('replay:2');expect(()=>f.controller.captureVwapPrefix(input,'ordinary')).toThrow('execution');expect(f.controller.captureVwapPrefix(input,'replay:2').executionIdentity).toBe('replay:2');expect(()=>f.controller.captureVwapPrefix({...input,bars:[...f.bars]},'replay:2')).toThrow('input');
});
it('retirement cleanup failure still invalidates the epoch and quarantines the current source',()=>{
 const f=fixture(),prefix=f.capture();f.failClear();expect(()=>f.controller.setStyle('line')).toThrow('clear refusal');expect(()=>prefix.assertCurrent()).toThrow();expect(f.failures).toHaveLength(1);expect(()=>f.capture()).toThrow();expect(f.read().style).toBe('candles');
});

it('deferred preparation uses private input despite later writes to original and public getter copies',async()=>{
 const f=fixture(),prefix=f.capture(),sourceCopy=f.controller.getSourceBars(),calculationCopy=f.controller.getCalculationBars();
 expect(Object.isFrozen(f.bars)).toBe(false);expect(Object.isFrozen(sourceCopy)).toBe(false);expect(Object.isFrozen(calculationCopy)).toBe(false);
 f.bars[0].close=99;sourceCopy[1].volume=999;calculationCopy[2].open=888;
 const packed=new Float64Array(await prefix.prepare(new AbortController().signal));
 expect(packed[4]).toBe(11);expect(packed[11]).toBe(5);expect(packed[13]).toBe(10);
 expect(prefix.readRows(0,3).map((row:any)=>[row.open,row.close,row.volume])).toEqual([[10,11,5],[10,11,5],[10,11,5]]);
 sourceCopy[0].open=100;expect(prefix.readRows(0,1)[0].open).toBe(10);
});
it('deferred preparation cannot complete an admitted handle after a supported input attempt retires it',async()=>{
 const f=fixture(),prefix=f.capture(),replacement=f.controller.setBars(f.bars.slice());
 await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow();await replacement;
 const next=f.capture();await next.prepare(new AbortController().signal);expect(next.readRows(0,3)).toHaveLength(3);
});
