import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {calculateWatchAdvanced,createWatchAdvancedState,prepareWatchAdvancedInput} from '../../src/watchlists/advanced';
import type {WatchList} from '../../src/watchlists/model';

it('measures 1,000 explicitly synthetic sources with 500 bars each and retains all memberships',()=>{
 const sources=Array.from({length:1000},(_,index)=>{const value=fixtureDataset('S'+index,0);value.instrument={...value.instrument,id:'BENCH:S'+index,exchange:'BENCH'};value.provenance={...value.provenance,providerId:'lv-synthetic-benchmark',datasetId:'benchmark:'+index,session:'regular' as const,coverage:'500 synthetic chronological daily rows'};value.bars=Array.from({length:500},(_,bar)=>({time:1704153600+bar*86400,open:10+bar/100,high:11+bar/100,low:9+bar/100,close:10+bar/100,volume:100}));return value;});
 const list:WatchList={id:'benchmark',name:'Explicit synthetic workload',favorite:false,sort:null,rows:sources.map((source,index)=>({id:'member'+index,kind:'symbol',reference:{exchange:'BENCH',symbol:source.instrument.symbol,synthetic:true,datasetId:source.provenance.datasetId,dailyDatasetId:null}}))},state=createWatchAdvancedState();state.settings.summary='mean';
 const heapBefore=process.memoryUsage().heapUsed,started=performance.now(),prepared=prepareWatchAdvancedInput({list,datasets:sources,settings:state.settings,data:state.data,now:1800000000}),preparedAt=performance.now(),result=calculateWatchAdvanced(prepared),finished=performance.now();
 console.log('WADV_SYNTHETIC_WORKLOAD '+JSON.stringify({sources:1000,barsPerSource:500,totalBars:500000,prepareMs:preparedAt-started,calculateMs:finished-preparedAt,totalMs:finished-started,heapDeltaMiB:(process.memoryUsage().heapUsed-heapBefore)/1048576,work:result.work,thread:'synchronous model; no renderer or native GUI',targetMs:10000}));
 expect(result.membershipRows).toBe(1000);expect(result.rows).toHaveLength(1000);expect(result.unresolved).toBe(0);expect(result.rows.every(row=>row.cells.last.value===14.99)).toBe(true);expect(result.summaries.find(row=>row.column==='last')?.value).toBeCloseTo(14.99,8);expect(finished-started).toBeLessThan(10000);
},20000);
