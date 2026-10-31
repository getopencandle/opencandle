import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createWorkspaceChartHost,PARKED_CHART_TREES,type ChartTreeTransition} from '../../src/ui/workspace-chart-host';
import {createMultiChartState,type GridTreeInput,type MultiChartGridProps,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createWarmLayoutFeeds,leaveWarmLayout,warmFeedIds,nextWarmExpiry,forgetWarmLayout,forgetWarmLayouts,warmAlpacaSymbol,scheduleWarmSweep,stopWarmSweep,WARM_LAYOUT_TABS,WARM_FEED_IDLE_MS,WARM_ALPACA_SYMBOLS,WARM_ALPACA_RESERVE} from '../../src/ui/layout-tabs-warm';
import {createLayoutReplayStash,switchLayoutReplay,carriedReplayPaper} from '../../src/ui/layout-replay-stash';
import {createPaperAccount} from '../../src/domain/paper';
import {ALPACA_MAX_SYMBOLS} from '../../src/domain/alpaca-live';
import type {ReplaySession} from '../../src/domain/replay-session';

// A layout tab switch keeps live feeds warm, parks the left chart tree instead of
// disposing it, and carries the left tab's replay paper account. SYNTHETIC fixtures and mocked native leases only.
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const alpaca=(symbol:string,interval='5m')=>`live:alpaca-iex:${symbol}:${interval}`;

describe(' warm live feeds for recently left tabs',()=>{
 it('keeps the left tab\'s named feeds, forgets the entered tab, and is bounded to the most recent tabs',()=>{
  const warm=createWarmLayoutFeeds(),open=[alpaca('GME'),alpaca('SPY'),'live:coinbase:BTC-USD:1m'];
  leaveWarmLayout(warm,'A','B',open,id=>id!==alpaca('SPY'),0);
  expect([...warmFeedIds(warm,1,new Set())].sort()).toEqual([alpaca('GME'),'live:coinbase:BTC-USD:1m'].sort());
  leaveWarmLayout(warm,'B','A',[alpaca('SPY')],()=>true,2);
  expect([...warmFeedIds(warm,3,new Set())]).toEqual([alpaca('SPY')]);
  for(let i=0;i<WARM_LAYOUT_TABS+2;i++)leaveWarmLayout(warm,'L'+i,'X',[alpaca('S'+i)],()=>true,10+i);
  expect(warm.layouts.size).toBe(WARM_LAYOUT_TABS);
  leaveWarmLayout(warm,'Q','Q',[alpaca('QQQ')],()=>true,50);expect(warm.layouts.has('Q')).toBe(false);
  forgetWarmLayout(warm,'L'+(WARM_LAYOUT_TABS+1));expect(warm.layouts.size).toBe(WARM_LAYOUT_TABS-1);forgetWarmLayouts(warm);expect(warm.layouts.size).toBe(0);
 });
 it('closes on idle: a tab left longer than the idle time keeps nothing warm',()=>{
  const warm=createWarmLayoutFeeds();leaveWarmLayout(warm,'A','B',[alpaca('GME')],()=>true,1000);
  expect(nextWarmExpiry(warm,1000)).toBe(WARM_FEED_IDLE_MS);expect(warmFeedIds(warm,1000+WARM_FEED_IDLE_MS-1,new Set()).size).toBe(1);
  expect(warmFeedIds(warm,1000+WARM_FEED_IDLE_MS,new Set()).size).toBe(0);expect(nextWarmExpiry(warm,0)).toBeNull();
 });
 it('counts against the 30-symbol Alpaca cap: a symbol streamed anyway is free, new ones stop at the budget and the reserve',()=>{
  const warm=createWarmLayoutFeeds(),many=Array.from({length:WARM_ALPACA_SYMBOLS+3},(_,i)=>alpaca('W'+i));
  leaveWarmLayout(warm,'A','B',many,()=>true,0);
  expect(warmFeedIds(warm,1,new Set()).size).toBe(WARM_ALPACA_SYMBOLS);
  expect(warmFeedIds(warm,1,new Set(['W0','W1','W2'])).size).toBe(WARM_ALPACA_SYMBOLS+3);
  const busy=new Set(Array.from({length:ALPACA_MAX_SYMBOLS-WARM_ALPACA_RESERVE-2},(_,i)=>'B'+i));
  expect(warmFeedIds(warm,1,busy).size).toBe(2);expect(warmFeedIds(warm,1,busy,2).size).toBe(0);
  expect(warmAlpacaSymbol(alpaca('GME.WS'))).toBe('GME.WS');expect(warmAlpacaSymbol('live:coinbase:BTC-USD:1m')).toBeNull();
 });
 it('one idle timer per store',()=>{
  vi.useFakeTimers();try{const warm=createWarmLayoutFeeds(),sweep=vi.fn();leaveWarmLayout(warm,'A','B',[alpaca('GME')],()=>true,0);
   scheduleWarmSweep(warm,0,sweep);scheduleWarmSweep(warm,0,sweep);vi.advanceTimersByTime(WARM_FEED_IDLE_MS+60);expect(sweep).toHaveBeenCalledOnce();
   scheduleWarmSweep(warm,0,sweep);stopWarmSweep(warm);vi.advanceTimersByTime(WARM_FEED_IDLE_MS+60);expect(sweep).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();}
 });
});

describe(' replay paper account goes with the paused replay',()=>{
 const participants=[{cellId:'c1',instrumentId:'LV:GME',symbol:'GME',interval:'1D',datasetId:'import:gme',revision:'r1',chartType:'candles'}];
 const session=(runId:string)=>({schemaVersion:1,sessionId:'s1',generation:3,runId,phase:'active',scope:'current',activeCellId:'c1',participants,intervalChoice:'1D',interval:{} as never,clock:1234,playing:true,stepsPerSecond:2,remainderMilliseconds:0} as unknown as ReplaySession);
 it('carries the account to Continue, bound to the restored run, also through a second switch',()=>{
  const stash=createLayoutReplayStash(),account={...createPaperAccount({id:'replay-paper',mode:'replay-paper',runId:'run-3',name:'Replay virtual account',now:0}),cash:777};
  expect(switchLayoutReplay(stash,'A','B',session('run-3'),null,9,account).paused).toBe(true);
  const back=switchLayoutReplay(stash,'B','A',null,null,10);
  const again=switchLayoutReplay(stash,'A','B',null,back.restored,11),returned=switchLayoutReplay(stash,'B','A',null,null,12).restored;
  expect(again.restored).toBeNull();expect(returned).toBe(back.restored);
  const carried=carriedReplayPaper(returned,'replay-session:s1:1');expect(carried).toMatchObject({cash:777,runId:'replay-session:s1:1',mode:'replay-paper'});expect(account.runId).toBe('run-3');
 });
 it('carries nothing for another run\'s account, an ordinary account, or a record closed elsewhere',()=>{
  const stash=createLayoutReplayStash(),other=createPaperAccount({id:'replay-paper',mode:'replay-paper',runId:'run-other',now:0});
  switchLayoutReplay(stash,'A','B',session('run-3'),null,1,other);expect(carriedReplayPaper(switchLayoutReplay(stash,'B','A',null,null,2).restored,'x')).toBeNull();
  switchLayoutReplay(stash,'A','B',session('run-3'),null,3,createPaperAccount({now:0}));expect(carriedReplayPaper(switchLayoutReplay(stash,'B','A',null,null,4).restored,'x')).toBeNull();
  expect(carriedReplayPaper(null,'x')).toBeNull();
 });
});

// Host lifecycle with controlled native leases (as tests/ui/workspace-chart-host.test.ts). No DOM.
function tree(layoutId:string){
 const hold={isCurrent:vi.fn(()=>true),resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()};
 const lease={canonicalState:null as unknown as MultiChartState,activeController:{synthetic:layoutId} as any,isCurrent:vi.fn(()=>true),publish:vi.fn(()=>({publicationErrors:[] as string[]})),dispose:vi.fn()};
 const coordinator={suspend:vi.fn(()=>hold),waitUntilReady:vi.fn(async(next:GridTreeInput)=>{lease.canonicalState=next.state;return lease;})};
 return{hold,lease,coordinator};
}
function setup(){
 const dataset=fixtureDataset('GME',4),base=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const layout=(id:string):MultiChartState=>({...structuredClone(base),layout:{...structuredClone(base.layout),id}});
 const states:Record<string,MultiChartState>={A:layout('A'),B:layout('B'),C:layout('C'),D:layout('D')},trees:Record<string,ReturnType<typeof tree>>={A:tree('A'),B:tree('B'),C:tree('C'),D:tree('D')};
 let alive=true,props:MultiChartGridProps={state:states.A,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onTransactionReady:vi.fn()};
 const host=createWorkspaceChartHost({read:()=>props,changed:()=>{},alive:()=>alive});
 host.slots()[0].callbacks.onTransactionReady?.(trees.A.coordinator as any);
 const input=(state:MultiChartState):GridTreeInput=>({state,datasets:props.datasets,activeBars:props.activeBars!,activeDatasetId:props.activeDatasetId!,activeExecutionIdentity:'ordinary'});
 const request=(to:string,park=true):ChartTreeTransition=>({expected:input(props.state),next:input(states[to]),view:{appearance:defaultTheme.appearance},assertCurrent:()=>true,park,commitModel:(canonical,mark)=>{props={...props,state:canonical};mark();}});
 /** One switch: a new tree mounts (its coordinator arrives) unless a parked one is reused, which waits for a render. */
 const go=async(to:string,park=true)=>{
  const before=new Set(host.slots()),pending=host.controller.transition(request(to,park));await tick();
  const stage=host.slots().find(slot=>slot.mode==='staging')!;
  if(!before.has(stage))stage.callbacks.onTransactionReady?.(trees[to].coordinator as any);else host.rendered();
  const result=await pending;host.sync();return result;
 };
 return{host,trees,states,go,request,props:()=>props,unmount:()=>{alive=false;}};
}
describe(' hidden chart trees for recently left tabs',()=>{
 it('parks the left tree (no dispose) and reuses it on the way back without building its charts again',async()=>{
  const s=setup(),a=s.host.slots()[0];
  expect(await s.go('B')).toEqual({committed:true,cancelled:false,errors:[]});
  expect(a.mode).toBe('parked');expect(s.trees.A.hold.retire).not.toHaveBeenCalled();expect(s.trees.A.hold.dispose).not.toHaveBeenCalled();
  expect(s.host.parkedLayouts()).toEqual(['A']);expect(s.host.slots()).toHaveLength(2);
  expect(s.host.lastSwitch()).toMatchObject({reused:false,parked:1});
  const back=s.host.controller.transition(s.request('A'));
  await tick();
  // Reused: same slot, resumed, staging the new input, and readiness waits until React rendered that input.
  expect(s.host.slots()).toHaveLength(2);expect(a.mode).toBe('staging');expect(s.trees.A.hold.resume).toHaveBeenCalledOnce();expect(s.trees.A.coordinator.waitUntilReady).not.toHaveBeenCalled();
  s.host.rendered();await back;
 });
 it('round trip: A to B to A reuses A, parks B, and the switch timing says so',async()=>{
  const s=setup(),a=s.host.slots()[0];await s.go('B');const b=s.host.slots()[1];
  expect(await s.go('A')).toMatchObject({committed:true,errors:[]});
  expect(s.host.slots()).toHaveLength(2);expect(a.mode).toBe('active');expect(b.mode).toBe('parked');
  expect(s.trees.A.coordinator.waitUntilReady).toHaveBeenCalledOnce();expect(s.trees.A.lease.publish).toHaveBeenCalledOnce();
  expect(s.host.lastSwitch()).toMatchObject({reused:true,parked:1});expect(s.host.parkedLayouts()).toEqual(['B']);
  expect(s.props().onReady).toHaveBeenLastCalledWith(s.trees.A.lease.activeController);
 });
 it(`keeps at most ${PARKED_CHART_TREES} hidden trees and disposes the least recently left one`,async()=>{
  const s=setup();await s.go('B');await s.go('C');await s.go('D');
  expect(s.host.parkedLayouts()).toEqual(['B','C']);expect(s.trees.A.hold.retire).toHaveBeenCalledOnce();expect(s.trees.A.hold.dispose).toHaveBeenCalledOnce();
  expect(s.host.slots().filter(slot=>slot.mode==='parked')).toHaveLength(PARKED_CHART_TREES);
  s.host.forgetParked('B');expect(s.host.parkedLayouts()).toEqual(['C']);expect(s.trees.B.hold.dispose).toHaveBeenCalledOnce();
  s.host.controller.forgetParked!();expect(s.host.parkedLayouts()).toEqual([]);expect(s.host.slots()).toHaveLength(1);
 });
 it('a transition that is not a tab switch disposes the old tree as before, and drops a parked tree it cannot reuse',async()=>{
  const s=setup();await s.go('B');await s.go('C',false);
  expect(s.trees.B.hold.dispose).toHaveBeenCalledOnce();expect(s.host.parkedLayouts()).toEqual(['A']);
  const parkedA=s.trees.A;s.trees.A=tree('A');await s.go('A',false);expect(parkedA.hold.dispose).toHaveBeenCalledOnce();expect(parkedA.hold.resume).not.toHaveBeenCalled();expect(parkedA.coordinator.waitUntilReady).not.toHaveBeenCalled();expect(s.trees.A.coordinator.waitUntilReady).toHaveBeenCalledOnce();expect(s.host.parkedLayouts()).toEqual([]);
 });
 it('a parked tree that is no longer current is disposed and a new tree is built',async()=>{
  const s=setup(),a=s.host.slots()[0];await s.go('B');s.trees.A.hold.isCurrent.mockReturnValue(false);
  const fresh=tree('A');s.trees.A=fresh;await s.go('A');
  expect(a.mode).toBe('retired');expect(s.host.slots().some(slot=>slot===a)).toBe(false);expect(fresh.coordinator.waitUntilReady).toHaveBeenCalledOnce();
 });
});

describe(' App wiring (source checks)',()=>{
 const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
 it('keeps warm feeds open in the close sweep and counts them in the cap retry',()=>{
  expect(app).toContain("from './layout-tabs-warm'");
  expect(app).toMatch(/leaveWarmLayout\(warmFeeds\.current,leavingLayout,id,/);
  expect(app).toMatch(/const keep=warmFeedIds\(warm,now,demand,warm\.alerts\.waiting\)/);expect(app).toMatch(/useEffect\(\(\)=>\{sweepLiveFeeds\(workspace\.grid\);\},\[workspace\.grid\]\)/);
  expect(app).toContain('ALPACA_CAP_MESSAGE');
 });
 it('parks chart trees on a tab switch and forgets a deleted layout\'s tree and feeds',()=>{
  expect(app).toMatch(/park:leavingLayout!==id/);
  expect(app).toMatch(/forgetParked\?\.\(action\.id\)/);expect(app).toMatch(/forgetWarmLayout\(warmFeeds\.current,action\.id\)/);
 });
 it('carries the replay paper account and no longer says Chart Undo was cleared on delete',()=>{
  expect(app).toMatch(/switchLayoutReplay\(layoutReplays\.current,leavingLayout,id,replayLeft,replayRemembered,Date\.now\(\),paperLeft\)/);
  expect(app).toMatch(/carriedReplayPaper\(saved,next\.runId\)/);
  expect(app).not.toContain("'Saved layout deleted. Chart Undo was cleared.'");
  expect(app).toContain("'Saved layout deleted.'");
 });
});
