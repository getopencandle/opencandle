import {describe,it,expect} from 'vitest';
import {createDatasetRequestResolver,scriptRequestBase} from '../../src/ui/script-requests';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {sessionFixture} from '../fixtures/r41-session-fixture';
const request={id:'Synthetic history',symbol:null,interval:'1m'};
describe(' renderer session request source isolation',()=>{
 it('one resolver serves two sessions without changing the shared raw feed',()=>{
  const raw=sessionFixture(),resolver=createDatasetRequestResolver({datasets:[raw]}),regular=cellSessionDataset(raw,{session:'regular'}),extended=cellSessionDataset(raw,{session:'extended'});
  const rth=scriptRequestBase(sourceContextForDataset(regular),'candles'),eth=scriptRequestBase(sourceContextForDataset(extended),'candles');
  expect(resolver(request,rth).bars).toEqual(raw.bars.slice(1,3));expect(resolver(request,eth).bars).toStrictEqual(raw.bars);expect(resolver(request,rth).fixture).toBe(true);expect(raw.bars).toHaveLength(4);
  expect(Object.isFrozen(rth.source)).toBe(true);
 });
 it('regular workspace views do not truncate an explicitly extended request',()=>{
  const raw=sessionFixture(),extended=cellSessionDataset(raw,{session:'extended'}),resolver=createDatasetRequestResolver({datasets:[cellSessionDataset(raw,{session:'regular'})]});
  expect(resolver(request,scriptRequestBase(sourceContextForDataset(extended),'candles')).bars).toStrictEqual(raw.bars);
 });
 it('refuses missing source proof, changed session, provider, revision or synthetic status',()=>{
  const raw=sessionFixture(),regular=cellSessionDataset(raw,{session:'regular'}),base=scriptRequestBase(sourceContextForDataset(regular),'candles'),resolver=createDatasetRequestResolver({datasets:[raw]});
  expect(()=>resolver(request,{...base,source:undefined})).toThrow('changed');expect(()=>resolver(request,{...base,sessionOverride:'extended'})).toThrow('changed');
  for(const provenance of [{...raw.provenance,providerId:'other'},{...raw.provenance,revision:'changed'},{...raw.provenance,fixture:false}])expect(()=>createDatasetRequestResolver({datasets:[{...raw,provenance}]})(request,base)).toThrow('changed');
 });
 it('refuses duplicate base IDs instead of selecting an arbitrary session source',()=>{
  const raw=sessionFixture(),base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles');
  expect(()=>createDatasetRequestResolver({datasets:[raw,structuredClone(raw)]})(request,base)).toThrow('ambiguous');
 });
 it('own-symbol history does not use another provider with the requested interval',()=>{
  const raw=sessionFixture('GME','5m'),foreign={...sessionFixture(),provenance:{...sessionFixture().provenance,providerId:'other',datasetId:'other-minute'}},base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles');
  expect(()=>createDatasetRequestResolver({datasets:[raw,foreign],load:null})(request,base)).toThrow();
 });
 it('explicit chart ticker and exact instrument requests preserve the same provider as the null-symbol shorthand',()=>{
  const raw=sessionFixture('GME','5m'),foreign={...sessionFixture(),provenance:{...sessionFixture().provenance,providerId:'other',datasetId:'other-minute'}},base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles'),resolver=createDatasetRequestResolver({datasets:[raw,foreign],load:null});
  for(const symbol of ['GME','gme',raw.instrument.id])expect(()=>resolver({...request,symbol},base)).toThrow();
 });
 it('an explicit same-symbol late load cannot cross the chart provider even when its ticker and synthetic flag match',()=>{
  const seed=sessionFixture('GME','5m'),raw={...seed,provenance:{...seed.provenance,datasetId:'live:alpaca-iex:GME:5m'}},base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles'),foreign={...sessionFixture(),provenance:{...sessionFixture().provenance,providerId:'other',datasetId:'other-minute'}},resolver=createDatasetRequestResolver({datasets:[raw],load:()=>({state:'ready',message:null,dataset:foreign})});
  for(const symbol of ['GME',raw.instrument.id])expect(()=>resolver({...request,symbol},base)).toThrow('does not match');
 });
 it('a same-id finer history with changed currency, venue or instrument units cannot enter loaded or late requests',()=>{
  const raw=sessionFixture('GME','5m'),minute=sessionFixture(),base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles');
  const mutations=[{exchange:'OTHER'},{currency:'EUR'},{assetClass:'crypto' as const},{timezone:'UTC'},{tickSize:.05},{lotSize:100},{name:'Other instrument'}];
  for(const changed of mutations){const other={...minute,instrument:{...minute.instrument,...changed}};expect(()=>createDatasetRequestResolver({datasets:[raw,other],load:null})(request,base)).toThrow();expect(()=>createDatasetRequestResolver({datasets:[raw],load:()=>({state:'ready',message:null,dataset:other})})({...request,symbol:'GME'},base)).toThrow('does not match');}
 });
 it('a legacy imported null-symbol request with missing history refuses without opening any provider',()=>{
  const raw=sessionFixture('GME','5m');let loads=0;const resolver=createDatasetRequestResolver({datasets:[raw],load:()=>{loads++;return {state:'ready',message:null,dataset:sessionFixture()};}});
  expect(()=>resolver(request,{datasetId:raw.provenance.datasetId,resolution:raw.resolution})).toThrow();expect(loads).toBe(0);
 });
 it('loaded history is checked again before a previously loading answer can become usable',()=>{
  const raw={...sessionFixture('GME','5m'),provenance:{...sessionFixture('GME','5m').provenance,datasetId:'live:alpaca-iex:SYNTH:5m'}},base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles');
  let ready=false;const bad={...sessionFixture(),provenance:{...sessionFixture().provenance,fixture:false}},resolver=createDatasetRequestResolver({datasets:[raw],load:()=>ready?{state:'ready',message:null,dataset:bad}:{state:'loading',message:'SYNTHETIC history is loading.',dataset:null}});
  expect(()=>resolver(request,base)).toThrow('loading');ready=true;expect(()=>resolver(request,base)).toThrow('does not match');
 });
 it('equal-interval requests do not acquire an unrelated daily series or an unsupported session fallback',()=>{
  const raw=sessionFixture(),daily=sessionFixture('GME','1D'),base=scriptRequestBase(sourceContextForDataset(cellSessionDataset(raw,{session:'regular'})),'candles');
  expect(createDatasetRequestResolver({datasets:[raw,daily]})(request,base).bars).toHaveLength(2);
 });
});
