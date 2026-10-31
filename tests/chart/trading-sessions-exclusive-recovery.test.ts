import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {createMarketQueue} from '../../src/chart/market-queue';
import {createAnalysisTransactionEngine} from '../../src/chart/analysis-transaction';
import {createConfigurationEditor} from '../../src/chart/configuration-edit';
import {createTradingSessionPaneRefresh,type TradingSessionPaneTarget} from '../../src/chart/adapter';

/** Select the actual adapter wiring, rather than a test-only completion wrapper. */
function actualExclusive(kind:'analysis'|'configuration',marketQueue:ReturnType<typeof createMarketQueue>,queueSessionPaneRefresh:()=>void){
 const source=readFileSync(resolve(process.env.LV_SESSION_INVERT_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8');
 const start=source.indexOf('  const '+(kind==='analysis'?'engine':'configurationEditor')+'=');if(start<0)throw Error('Missing actual adapter transaction port');
 const selected=/exclusive:([^,]+),/.exec(source.slice(start,start+1500))?.[1];
 if(selected==='marketQueue.exclusive')return marketQueue.exclusive;
 if(selected!=='sessionPaneExclusive')throw Error('Unexpected adapter exclusive wiring');
 const definition=source.split(/\r?\n/).find(line=>line.includes('const sessionPaneExclusive:'));if(!definition)throw Error('Missing actual adapter completion wrapper');
 return Function('marketQueue','queueSessionPaneRefresh',stripTypeScriptTypes(definition)+';return sessionPaneExclusive;')(marketQueue,queueSessionPaneRefresh) as typeof marketQueue.exclusive;
}
for(const kind of ['analysis','configuration'] as const)it(`actual ${kind} recovery retries session labels after the real market queue finishes`,async()=>{
 const marketQueue=createMarketQueue({read:()=>({bars:[],source:{datasetId:'SYNTHETIC-recovery',revision:'1',fixture:true,label:'Synthetic recovery fixture'}}),write(){},apply:async()=>{},disposed:()=>false});
 let analysisPending=0,inverted=false;const instanceOwner={},nativeIncarnation={},updates:boolean[]=[],reported:unknown[]=[];
 const target=():TradingSessionPaneTarget=>{const captured=inverted;return{id:'SYNTHETIC-session',instanceOwner,nativeId:'SYNTHETIC-native',nativeIncarnation,paneId:'price',inverted:captured,assertCurrent(){if(captured!==inverted)throw Error('Synthetic orientation changed');}};};
 const refresh=createTradingSessionPaneRefresh({captureOwner:()=>({isCurrent:()=>true}),busy:()=>analysisPending>0||marketQueue.isPending(),targets:()=>[target()],target,refresh(){updates.push(inverted);return target();},defer:queueMicrotask,report:error=>reported.push(error)});
 const drain=async()=>{for(let turn=0;turn<12;turn++)await Promise.resolve();};
 try{
  refresh.request();await drain();refresh.assertSettled();expect(updates).toEqual([false]);
  const shared={exclusive:actualExclusive(kind,marketQueue,refresh.request),validate(){},capture:()=>({synthetic:true}),hold:()=>({release(){}}),pending(active:boolean){analysisPending+=active?1:-1;if(!active)refresh.request();},broken(message:string){throw Error(message);},restore:async()=>{inverted=true;refresh.request();}};
  const engine=kind==='analysis'?createAnalysisTransactionEngine({...shared,noOp:()=>false,apply:async()=>{throw Error('Synthetic apply failed');},scripts:()=>({pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}):createConfigurationEditor({...shared,apply(){throw Error('Synthetic apply failed');}});
  await expect(engine.prepare(null)).rejects.toThrow('Synthetic apply failed');await drain();
  expect(marketQueue.isPending()).toBe(false);expect(analysisPending).toBe(0);expect(reported).toEqual([]);
  expect(updates).toEqual([false,true]);expect(()=>refresh.assertSettled()).not.toThrow();
 }finally{refresh.dispose();}
});
