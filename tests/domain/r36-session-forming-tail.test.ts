import {describe,it,expect} from 'vitest';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {sessionDataset} from '../../src/chart/session-zones';
import {linkLiveSessionSource,rawLiveSessionSource,liveSessionSourceCurrent} from '../../src/domain/live-session-source';
import {completedBarsDataset,isFormingLiveDataset} from '../../src/domain/live-provider';
import {freezeLiveDataset,pinReplayDataset} from '../../src/domain/replay-live-snapshot';
import {replayChartFrame} from '../../src/domain/replay-session';
import type {Bar,BarDataset} from '../../src/domain/types';
const at=(text:string)=>Date.parse('2024-06-03T'+text+':00Z')/1000;
const bar=(time:number,close:number):Bar=>({time,open:close,high:close+1,low:close-1,close,volume:10});
function source(tailInside=false):BarDataset{return{instrument:{id:'SYNTHETIC:GME',symbol:'GME',name:'SYNTHETIC GME test',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',tickSize:.01,lotSize:1,timezone:'America/New_York'},resolution:'1m',bars:[bar(at('13:00'),10),bar(at('13:30'),20),bar(at('13:31'),21),bar(at(tailInside?'13:32':'20:00'),30)],provenance:{providerId:'alpaca-stub',providerName:'SYNTHETIC completion fixture',datasetId:'live:alpaca-stub:GME:1m',fixture:false,coverage:'SYNTHETIC tests only',asOf:0,delaySeconds:0,adjustment:'raw',session:'unknown',timezone:'America/New_York',state:'ready',license:'SYNTHETIC',revision:'synthetic-live-session',notes:[]}};}
describe(' exact raw forming-tail ownership across session views',()=>{
 it('registration, completion and freezing leave raw arrays, rows and metadata untouched',()=>{
  const raw=source(),before=JSON.stringify(raw),array=raw.bars,rows=[...raw.bars],regular=cellSessionDataset(raw,{session:'regular'});completedBarsDataset(regular);freezeLiveDataset(regular);
  expect(JSON.stringify(raw)).toBe(before);expect(raw.bars).toBe(array);expect(raw.bars.every((row,index)=>row===rows[index])).toBe(true);
 });
 it('ordinary regular, extended and unknown live sources retain the original last-forming-row rule',()=>{
  for(const session of ['regular','extended','unknown'] as const){const raw=source();raw.provenance.session=session;expect(isFormingLiveDataset(raw)).toBe(true);expect(completedBarsDataset(raw).bars).toEqual(raw.bars.slice(0,-1));}
 });
 it('a regular view with a postmarket raw forming tail keeps every retained regular closed row',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'}),extended=cellSessionDataset(raw,{session:'extended'});
  expect(regular.bars).toHaveLength(2);expect(rawLiveSessionSource(regular)).toBe(raw);expect(isFormingLiveDataset(regular)).toBe(false);expect(completedBarsDataset(regular)).toBe(regular);expect(isFormingLiveDataset(extended)).toBe(true);expect(completedBarsDataset(extended).bars).toHaveLength(3);
 });
 it('a regular view containing the actual raw forming row withholds precisely that row',()=>{
  const raw=source(true),regular=cellSessionDataset(raw,{session:'regular'});expect(regular.bars).toHaveLength(3);expect(isFormingLiveDataset(regular)).toBe(true);expect(completedBarsDataset(regular).bars.map(row=>row.close)).toEqual([20,21]);
 });
 it('freezes the exact raw source before filtering and replays the last closed regular row',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'}),frozen=freezeLiveDataset(regular)!;
  expect(frozen.bars).toEqual(raw.bars);expect(frozen.bars).not.toBe(raw.bars);expect(frozen.provenance.session).toBe('unknown');
  const frozenRegular=cellSessionDataset(frozen,{session:'regular'}),frozenExtended=cellSessionDataset(frozen,{session:'extended'}),clock=at('20:02');
  expect(replayChartFrame(frozenRegular,clock).bars.map(row=>row.close)).toEqual([20,21]);expect(replayChartFrame(frozenExtended,clock).bars.map(row=>row.close)).toEqual([10,20,21]);
 });
 it('frozen selection ignores a later live correction and new regular bar without leaking either',()=>{
  const raw=source(),frozen=freezeLiveDataset(raw)!,held={[raw.provenance.datasetId]:frozen};raw.bars[1].close=99;raw.bars[1].high=100;raw.bars.splice(3,0,bar(at('13:32'),77));
  const pinned=pinReplayDataset(raw,held),regular=cellSessionDataset(pinned,{session:'regular'});expect(pinned).toBe(frozen);expect(completedBarsDataset(regular).bars.map(row=>row.close)).toEqual([20,21]);expect(regular.bars.some(row=>row.close===77||row.close===99)).toBe(false);
 });
 it('a copied view receives no raw ownership proof and keeps conservative unknown behavior',()=>{
  const regular=cellSessionDataset(source(),{session:'regular'}),copy=structuredClone(regular);expect(rawLiveSessionSource(copy)).toBe(copy);expect(isFormingLiveDataset(copy)).toBe(true);expect(completedBarsDataset(copy).bars).toHaveLength(1);
 });
 it('a detached view array refuses instead of borrowing the registered raw tail',()=>{
  const regular=cellSessionDataset(source(),{session:'regular'});regular.bars=[...regular.bars];expect(()=>completedBarsDataset(regular)).toThrow('exact raw source');expect(()=>freezeLiveDataset(regular)).toThrow('exact raw source');
 });
 it('registered empty arrays and changed dataset IDs cannot bypass proof retirement',()=>{
  const empty=cellSessionDataset(source(),{session:'regular'});empty.bars=[];expect(()=>isFormingLiveDataset(empty)).toThrow('exact raw source');expect(()=>freezeLiveDataset(empty)).toThrow('exact raw source');
  const changed=cellSessionDataset(source(),{session:'regular'});changed.provenance.datasetId='local:copied';expect(()=>isFormingLiveDataset(changed)).toThrow('exact raw source');expect(()=>freezeLiveDataset(changed)).toThrow('exact raw source');
 });
 it('registered provenance and bars accessors are refused before any read or source relink',()=>{
  for(const owner of ['view','raw'])for(const field of ['provenance','bars'])for(const action of ['completion','freeze','source-link','view-link']){
   const raw=source(),view=cellSessionDataset(raw,{session:'regular'}),outsider=source(),target=owner==='view'?view:raw,value=field==='bars'?target.bars:target.provenance;let reads=0;Object.defineProperty(target,field,{get(){reads++;return value;},enumerable:true,configurable:true});
   expect(()=>action==='completion'?isFormingLiveDataset(view):action==='freeze'?freezeLiveDataset(view):action==='source-link'?linkLiveSessionSource(outsider,view):linkLiveSessionSource(view,raw)).toThrow('plain own data');expect(reads).toBe(0);
  }
 });
 it('unregistered nonlive sources keep same-object completion and the existing freeze refusal',()=>{
  const raw=source();raw.provenance.datasetId='local:synthetic';expect(rawLiveSessionSource(raw)).toBe(raw);expect(isFormingLiveDataset(raw)).toBe(false);expect(completedBarsDataset(raw)).toBe(raw);expect(()=>freezeLiveDataset(raw)).toThrow('Only a live chart');
 });
 it('matching copied metadata or rows never grant another raw object to a view',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'}),copied=structuredClone(raw);expect(()=>linkLiveSessionSource(regular,copied)).toThrow('exact raw source');
  expect(()=>linkLiveSessionSource(regular,{...raw,bars:raw.bars.map(row=>({...row}))})).toThrow('exact raw source');
  expect(()=>linkLiveSessionSource(regular,{...raw})).toThrow('exact raw source');expect(rawLiveSessionSource(regular)).toBe(raw);
  expect(()=>linkLiveSessionSource({...regular,provenance:{...regular.provenance,fixture:true}},raw)).toThrow('exact raw source');
 });
 it('a raw correction retires the old proof and a new owned cell view reads the corrected closed rows',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'});raw.bars[1].close=99;raw.bars[1].high=100;expect(()=>completedBarsDataset(regular)).toThrow('values changed');
  const refreshed=cellSessionDataset(raw,{session:'regular'});expect(refreshed).not.toBe(regular);expect(completedBarsDataset(refreshed).bars.map(row=>row.close)).toEqual([99,21]);
 });
 it('session switches keep the same exact raw source and preserve each completion boundary',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'}),extended=cellSessionDataset(regular,{session:'extended'}),again=cellSessionDataset(extended,{session:'regular'});
  expect(rawLiveSessionSource(extended)).toBe(raw);expect(extended.bars).toBe(raw.bars);expect(again).toBe(regular);expect(completedBarsDataset(again).bars).toHaveLength(2);expect(completedBarsDataset(extended).bars).toHaveLength(3);
 });
 it('a late forming tail retires prior selection and a fresh selection withholds only the actual new tail',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'});raw.bars.push(bar(at('20:01'),31));expect(()=>completedBarsDataset(regular)).toThrow('exact raw source');
  const next=cellSessionDataset(raw,{session:'regular'});expect(completedBarsDataset(next).bars.map(row=>row.close)).toEqual([20,21]);
  raw.bars.push(bar(Date.parse('2024-06-04T13:30:00Z')/1000,50));const inside=cellSessionDataset(raw,{session:'regular'});expect(inside.bars).toHaveLength(3);expect(completedBarsDataset(inside).bars.map(row=>row.close)).toEqual([20,21]);
  raw.bars.push(bar(Date.parse('2024-06-04T13:31:00Z')/1000,51));const after=cellSessionDataset(raw,{session:'regular'});expect(completedBarsDataset(after).bars.map(row=>row.close)).toEqual([20,21,50]);
 });
 it('legacy workspace session views retain completion and refresh after a raw correction',()=>{
  const raw=source(),regular=sessionDataset(raw,'regular');expect(isFormingLiveDataset(regular)).toBe(false);expect(completedBarsDataset(regular)).toBe(regular);
  raw.bars[1].close=88;raw.bars[1].high=89;expect(()=>completedBarsDataset(regular)).toThrow('values changed');const refreshed=sessionDataset(raw,'regular');expect(refreshed).not.toBe(regular);expect(completedBarsDataset(refreshed).bars[0].close).toBe(88);
 });
 it('mutated metadata and accessor rows retire proof without executing a newly attached getter',()=>{
  const raw=source(),regular=cellSessionDataset(raw,{session:'regular'});regular.instrument.currency='EUR';expect(()=>completedBarsDataset(regular)).toThrow('exact raw source');
  const another=source(),view=cellSessionDataset(another,{session:'regular'});let reads=0;Object.defineProperty(another.bars[1],'close',{get(){reads++;return 900;},enumerable:true,configurable:true});expect(()=>completedBarsDataset(view)).toThrow('plain own data');expect(reads).toBe(0);
 });
 it('measures bounded registration and cached proof verification for 100,000 synthetic rows',()=>{
  const raw=source();raw.bars=Array.from({length:100000},(_,index)=>bar(at('13:30')+index*60,20+index%11));
  const view={...raw,provenance:{...raw.provenance,session:'extended' as const}},before=process.memoryUsage(),start=performance.now();
  linkLiveSessionSource(view,raw);const registered=performance.now(),valid=liveSessionSourceCurrent(view),verified=performance.now(),after=process.memoryUsage();
  console.log('R36 live session ownership measurement '+JSON.stringify({syntheticRows:raw.bars.length,registrationMs:registered-start,cachedVerificationMs:verified-registered,heapUsedDeltaBytes:after.heapUsed-before.heapUsed,arrayBuffersDeltaBytes:after.arrayBuffers-before.arrayBuffers,proofNumericBytes:raw.bars.length*(6*8+4),proofRowReferences:raw.bars.length}));
  expect(valid).toBe(true);expect(rawLiveSessionSource(view)).toBe(raw);
 });
});
