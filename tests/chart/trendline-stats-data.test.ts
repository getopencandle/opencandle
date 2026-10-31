import {expect,it} from 'vitest';
import type {SerializedDrawing} from '@luxalgo/vela';
import {readTrendlineStats,validateTrendlineStatsSettings,patchTrendlineStats,TRENDLINE_STATS_DEFAULTS} from '../../src/chart/trendline-stats-data';
const record=()=>({id:'stats-synthetic',type:'trendline',paneId:'price',anchors:[{time:0,price:100},{time:1000,price:125}],style:{color:'#00ff00',width:2},text:{value:'retained'},props:{future:{nested:['retained',1]},someNativeOption:true}} as unknown as SerializedDrawing);

it('legacy defaults remain absent and a semantic no-op returns the exact drawing',()=>{
 const row=record();expect(readTrendlineStats(row.props)).toEqual({state:'legacy',settings:TRENDLINE_STATS_DEFAULTS});expect(patchTrendlineStats(row,TRENDLINE_STATS_DEFAULTS)).toBe(row);expect(Object.hasOwn(row.props!,'lvTrendlineStats')).toBe(false);
 expect(readTrendlineStats(undefined).state).toBe('legacy');expect(Object.isFrozen(TRENDLINE_STATS_DEFAULTS)).toBe(true);
});

it('whole-member changes are detached and preserve unrelated native/future data and subsequent no-op identity',()=>{
 const row=record(),next=patchTrendlineStats(row,{...TRENDLINE_STATS_DEFAULTS,priceRange:true,alwaysShow:true,position:'below'});expect(next).not.toBe(row);expect(next.anchors).toEqual(row.anchors);expect(next.anchors).not.toBe(row.anchors);expect(next.text).toEqual(row.text);
 const state=readTrendlineStats(next.props);expect(state.state).toBe('supported');if(state.state!=='supported')throw Error('unsupported');expect(state.settings).toEqual({...TRENDLINE_STATS_DEFAULTS,priceRange:true,alwaysShow:true,position:'below'});expect(state.member).toBe(next.props!.lvTrendlineStats);expect(Object.isFrozen(state.settings)).toBe(true);
 expect(patchTrendlineStats(next,state.settings)).toBe(next);(row.props!.future as any).nested[0]='changed';expect((next.props!.future as any).nested[0]).toBe('retained');
 const off=patchTrendlineStats(next,TRENDLINE_STATS_DEFAULTS);expect(readTrendlineStats(off.props).state).toBe('supported');expect((off.props!.lvTrendlineStats as any).priceRange).toBe(false);
});

it('explicit malformed or unknown member remains opaque and cannot be silently overwritten',()=>{
 for(const member of [undefined,null,{...TRENDLINE_STATS_DEFAULTS,schemaVersion:2},{...TRENDLINE_STATS_DEFAULTS,future:1},{...TRENDLINE_STATS_DEFAULTS,alwaysShow:0},{...TRENDLINE_STATS_DEFAULTS,position:'sideways'}]){
  const row=record();row.props!.lvTrendlineStats=member;expect(readTrendlineStats(row.props).state).toBe('unavailable');expect(()=>patchTrendlineStats(row,{...TRENDLINE_STATS_DEFAULTS,priceRange:true})).toThrow();expect(row.props!.lvTrendlineStats).toBe(member);
 }
 for(const key of Object.keys(TRENDLINE_STATS_DEFAULTS)){const member:any={...TRENDLINE_STATS_DEFAULTS};delete member[key];expect(()=>validateTrendlineStatsSettings(member)).toThrow();}
 expect(()=>patchTrendlineStats({...record(),type:'ray'},TRENDLINE_STATS_DEFAULTS)).toThrow('only for Trendline');
});

it('known data boundary rejects accessor/hidden/symbol/custom fields without calling hooks',()=>{
 let calls=0;const getter={...TRENDLINE_STATS_DEFAULTS};Object.defineProperty(getter,'priceRange',{get(){calls++;return true;}});expect(()=>validateTrendlineStatsSettings(getter)).toThrow();
 const hidden={...TRENDLINE_STATS_DEFAULTS};Object.defineProperty(hidden,'priceRange',{enumerable:false});expect(()=>validateTrendlineStatsSettings(hidden)).toThrow();
 expect(()=>validateTrendlineStatsSettings({...TRENDLINE_STATS_DEFAULTS,[Symbol('extra')]:true})).toThrow();expect(()=>validateTrendlineStatsSettings(Object.assign(Object.create({}),TRENDLINE_STATS_DEFAULTS))).toThrow();
 const props={get lvTrendlineStats(){calls++;return TRENDLINE_STATS_DEFAULTS;}};expect(readTrendlineStats(props).state).toBe('unavailable');
 const row=record();Object.defineProperty(row.props!,'extra',{enumerable:true,get(){calls++;return 1;}});expect(()=>patchTrendlineStats(row,{...TRENDLINE_STATS_DEFAULTS,priceRange:true})).toThrow('accessors');
 const hook=record();hook.props!.toJSON=()=>{calls++;return{};};expect(()=>patchTrendlineStats(hook,{...TRENDLINE_STATS_DEFAULTS,priceRange:true})).toThrow();expect(calls).toBe(0);
});

it('plain local JSON round trips retain optional tuple and bounded record patches reject before cloning',()=>{
 const row=patchTrendlineStats(record(),{...TRENDLINE_STATS_DEFAULTS,percentChange:true,barsRange:true,dateTimeRange:true}),saved=JSON.parse(JSON.stringify(row));expect(readTrendlineStats(saved.props)).toEqual(readTrendlineStats(row.props));
 const large=record();large.props!.future='x'.repeat(1024*1024);expect(()=>patchTrendlineStats(large,{...TRENDLINE_STATS_DEFAULTS,priceRange:true})).toThrow('local data bound');expect(Object.hasOwn(large.props!,'lvTrendlineStats')).toBe(false);
});
