import {describe,it,expect} from 'vitest';
import {cellSessionDataset,cellSessionBars,cellSessionRefusal,rawCellSessionDataset} from '../../src/chart/cell-session';
import {sourceContextForDataset,sameChartSourceBasis} from '../../src/chart/source-context';
import {stampLiveLineage,liveLineageOf,sameBarsInput} from '../../src/chart/bar-input-identity';
import {sessionDataset} from '../../src/chart/session-zones';
import {alertDatasetWithPrefix,alertDatasetKey} from '../../src/domain/alert-observation';
import {sessionFixture} from '../fixtures/r41-session-fixture';

describe(' exact per-chart trading sessions on synthetic history',()=>{
 it('keeps GME extended and SPY regular history separate with unchanged raw provider identity',()=>{
  const gme=sessionFixture(),spy=sessionFixture('SPY'),before=JSON.stringify([gme,spy]),eth=cellSessionDataset(gme,{session:'extended'}),rth=cellSessionDataset(spy,{session:'regular'});
  expect(eth.bars).toBe(gme.bars);expect(rth.bars.map(row=>row.time)).toEqual(spy.bars.slice(1,3).map(row=>row.time));
  for(const data of [eth,rth]){const raw=rawCellSessionDataset(data);for(const key of ['providerId','datasetId','revision','fixture','providerName','coverage'] as const)expect(data.provenance[key]).toBe(raw.provenance[key]);}
  expect(JSON.stringify([gme,spy])).toBe(before);
 });
 it('supports the existing Alpaca intraday unknown-session metadata without changing raw provenance or reaching a provider',()=>{
  for(const providerId of ['alpaca-iex','alpaca-sip-delayed','alpaca-stub']){
   const seed=sessionFixture(),raw={...seed,provenance:{...seed.provenance,providerId,session:'unknown' as const,providerName:'SYNTHETIC Alpaca-shaped fixture'}},regular=cellSessionDataset(raw,{session:'regular'}),extended=cellSessionDataset(raw,{session:'extended'});
   expect(regular.bars).toHaveLength(2);expect(extended.bars).toBe(raw.bars);expect(raw.provenance.session).toBe('unknown');expect(regular.provenance.providerId).toBe(providerId);expect(regular.provenance.fixture).toBe(true);expect(rawCellSessionDataset(regular)).toBe(raw);
  }
 });
 it('two charts on the same dataset have distinct exact portable session bases',()=>{
  const raw=sessionFixture(),regular=cellSessionDataset(raw,{session:'regular'}),extended=cellSessionDataset(raw,{session:'extended'});
  expect(sameChartSourceBasis(sourceContextForDataset(regular),sourceContextForDataset(extended),true)).toBe(false);expect(alertDatasetKey(regular,2)).not.toBe(alertDatasetKey(extended,2));
  expect(cellSessionDataset(raw,{session:'regular'})).toBe(regular);expect(rawCellSessionDataset(regular)).toBe(raw);
 });
 it('unwraps the legacy workspace view so explicit extended can recover all raw bars',()=>{
  const raw=sessionFixture(),legacy=sessionDataset(raw,'regular');expect(legacy.bars).toHaveLength(2);
  expect(cellSessionDataset(legacy,{session:'extended'}).bars).toBe(raw.bars);expect(cellSessionDataset(legacy,{})).toBe(legacy);
 });
 it('explicit regular hours never substitutes off-session bars when the result is empty',()=>{
  const seed=sessionFixture(),raw={...seed,bars:[seed.bars[0],seed.bars[3]]};expect(cellSessionDataset(raw,{session:'regular'}).bars).toEqual([]);expect(raw.bars).toHaveLength(2);
 });
 it('refuses daily, unknown session coverage and unavailable extended hours without inventing data',()=>{
  const seed=sessionFixture();expect(cellSessionRefusal({...seed,resolution:'1D'},'regular')).toContain('intraday');
  expect(cellSessionRefusal({...seed,provenance:{...seed.provenance,session:'unknown'}},'regular')).toContain('does not declare');
  expect(cellSessionRefusal({...seed,provenance:{...seed.provenance,session:'regular'}},'extended')).toContain('unavailable');
  expect(()=>cellSessionDataset(seed,{session:'bogus' as any})).toThrow('Invalid');expect(cellSessionDataset({...seed,resolution:'1D'},{}).resolution).toBe('1D');
 });
 it('maintains sibling live lineage when every initial bar is regular and later bars include postmarket',()=>{
  const seed=sessionFixture(),raw={...seed,bars:seed.bars.slice(1,3)},key='live:alpaca-iex:SYNTH:1m|synthetic-subscription';stampLiveLineage(raw.bars,key,1);
  const before=cellSessionDataset(raw,{session:'regular'});expect(before.bars).not.toBe(raw.bars);expect(liveLineageOf(before.bars)).toEqual({key:key+'|rth',seq:1});
  raw.bars.push(seed.bars[3]);stampLiveLineage(raw.bars,key,2);const after=cellSessionDataset(raw,{session:'regular'});
  expect(after.bars).toHaveLength(2);expect(after).not.toBe(before);expect(sameBarsInput(before.bars,after.bars)).toBe(true);expect(liveLineageOf(after.bars)?.seq).toBe(2);expect(raw.bars).toHaveLength(3);
 });
 it('keeps accepted prepared arrays and rebuilds only a fresh raw live snapshot',()=>{
  const raw=sessionFixture(),rth=cellSessionDataset(raw,{session:'regular'});expect(cellSessionBars(rth,rth.bars,{session:'regular'})).toBe(rth.bars);
  expect(cellSessionBars(rth,raw.bars,{session:'regular'})).toBe(rth.bars);
 });
 it('alert prefix metadata retains semantic source identity without persisting renderer-only routing fields',()=>{
  const regular=cellSessionDataset(sessionFixture(),{session:'regular'}),source=sourceContextForDataset(regular),prefix=alertDatasetWithPrefix(regular,regular.bars.slice(0,1));
  expect(source.sessionOverride).toBe('regular');expect(sourceContextForDataset(prefix).sessionOverride).toBeUndefined();expect(sameChartSourceBasis(source,sourceContextForDataset(prefix),true)).toBe(true);
  expect(JSON.stringify(prefix)).not.toContain('sessionOverride');expect(prefix.provenance.session).toBe('regular');
 });
});
