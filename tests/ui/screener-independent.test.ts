import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {runScreener} from '../../src/domain/screener';
import {createScreenerSettings,resolveScreenerUniverse,restoreScreenerSettings,screenerDatasetKey} from '../../src/domain/screener-state';

it('keeps unresolved source obligations after source removal and does not bind another exchange implicitly',()=>{
 const data=fixtureDataset('UNRELATED',3),state=createScreenerSettings();
 state.universe.sourceChoices[data.instrument.id]=screenerDatasetKey(data);
 const missing=resolveScreenerUniverse([],state.universe);
 expect(missing.coverage).toMatchObject({inScope:1,selected:0,unresolved:1});
 const replacement=structuredClone(data);replacement.instrument.exchange='OTHER';
 expect(resolveScreenerUniverse([replacement],state.universe).datasets).toEqual([]);
});
it('refuses malformed inactive saved-screen settings without mutating the supplied object',()=>{
 const state=createScreenerSettings();state.screens.push({...structuredClone(state.screens[0]),id:'inactive',configuration:{...structuredClone(state.screens[0].configuration),sort:{columnId:'nonexistent',direction:'asc'}}});
 const before=JSON.stringify(state);expect(()=>restoreScreenerSettings(state)).toThrow();expect(JSON.stringify(state)).toBe(before);
});
it('does not produce a numeric result from duplicate or reversed history',()=>{
 const data=fixtureDataset('UNRELATED',3),columns=[{id:'last',metric:'last'},{id:'average',metric:'sma',parameters:{length:2}}];
 for(const bars of [[data.bars[0],data.bars[0]],[data.bars[1],data.bars[0]]]){
  const result=runScreener([{...data,bars}],columns);
  expect(result.rows[0]?.cells.last.state??'unavailable').not.toBe('available');
  expect(result.rows[0]?.cells.average.value??null).toBeNull();
 }
});
it('does not label mixed or unknown session volume as a regular-session relative-volume result',()=>{
 const data=fixtureDataset('UNRELATED',3);
 // Deliberate pin change: unknown-session DAILY bars now use the Symbol details daily basis, labelled as not regular-session.
 // All and extended sessions, and unknown-session intraday bars, stay unavailable.
 for(const [session,resolution] of [['all','1D'],['extended','1D'],['unknown','1h'],['unknown','5m']] as const){
  const result=runScreener([{...data,resolution,provenance:{...data.provenance,session}}],[{id:'rv',metric:'relativeVolume',parameters:{length:2}}]);
  expect(result.rows[0].cells.rv.state).toBe('unavailable');expect(result.rows[0].cells.rv.value).toBeNull();
 }
 const daily=runScreener([{...data,provenance:{...data.provenance,session:'unknown'}}],[{id:'rv',metric:'relativeVolume',parameters:{length:2}}]).rows[0].cells.rv;
 expect(daily.state).toBe('available');expect(daily.reason).toMatch(/Not a regular-session figure/);
});
