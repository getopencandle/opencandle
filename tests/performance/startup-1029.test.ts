import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as lazy from '../../src/ui/lazy-surfaces';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {ListAlertDialog} from '../../src/ui/ListAlertDialog';

// Closed dialogs load as their own chunks, the interval menu probes are prewarmed, range picks render as transitions.
describe('lazy-surfaces',()=>{
 it('under Vitest every export is the eager component, so App-render tests keep their type lookups',()=>{
  expect(lazy.SymbolSearchDialog).toBe(SymbolSearchDialog);expect(lazy.IndicatorDialog).toBe(IndicatorDialog);expect(lazy.ListAlertDialog).toBe(ListAlertDialog);
 });
 it('a lazy surface renders nothing until its chunk is here, then renders the same element at once',async()=>{
  const Real=({text}:{text:string})=>React.createElement('b',null,text);
  const load=vi.fn(async()=>Real as React.ComponentType<any>);
  const Surface=lazy.lazySurface(load);
  expect(load).not.toHaveBeenCalled();
  await Surface.prefetch();await Surface.prefetch();expect(load).toHaveBeenCalledTimes(1);
  expect(renderToStaticMarkup(React.createElement(Surface,{text:'shown'}))).toBe('<b>shown</b>');
 });
 it('prefetch is a no-op under Vitest',()=>{const stop=lazy.prefetchLazySurfaces();expect(typeof stop).toBe('function');stop();});
 it('App imports the lazy dialogs and mounts the prefetch and the interval prewarm after the first chart',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8'),names=[...readFileSync('src/ui/lazy-surfaces.tsx','utf8').matchAll(/^export const (\w+):/gm)].map(m=>m[1]);
  expect(names.length).toBe(24);
  for(const name of names)expect(app).not.toMatch(new RegExp(`import \{[^}]*\b${name}\b[^}]*\} from '\./(?!lazy-surfaces)`));
  expect(app).toContain("<LazySurfacesPrefetch/><IntervalMenuPrewarm datasets={intervalUniverse} current={chartIdentity} state={workspace.intervals}/></StartupDeferred>");
 });
});

describe('range picks and range buttons',()=>{
 it('commit as transitions with the same acceptance result, and the range-button probes do not clone',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain("let accepted=false;startTransition(()=>{accepted=commit({chartStyle:'range'");
  expect(app).toContain('startTransition(()=>{applied=!!applyInterval(switched.dataset,current.current.intervals,switched.result);});if(!applied)pendingRange.current=null;');
  expect(app.split('resolveIntervalSwitch(intervalUniverse,chartIdentity,id,current.current.intervals.policy,true).ok').length-1).toBe(2);
 });
});

describe('IntervalMenuPrewarm',()=>{
 it('probes every non-current, non-range menu row once per source, in idle steps, with the probe flag',async()=>{
  vi.resetModules();
  const calls:string[]=[];
  vi.doMock('../../src/domain/interval-switch',async()=>{const actual=await vi.importActual<any>('../../src/domain/interval-switch');return{...actual,resolveIntervalSwitch:(d:any,c:any,id:string,p:any,probe:boolean)=>{calls.push(id+(probe?':probe':''));return actual.resolveIntervalSwitch(d,c,id,p,probe);}};});
  const effects:Array<()=>unknown>=[];
  vi.doMock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useEffect:(fn:()=>unknown)=>{effects.push(fn);}};});
  const {IntervalMenuPrewarm}=await import('../../src/ui/IntervalMenu');
  const {fixtureDataset}=await import('../../src/domain/fixtures');
  const {createIntervalMenuState,intervalMenuEntries,restoreIntervalMenuState}=await import('../../src/domain/intervals');
  const current=fixtureDataset('GME'),state=createIntervalMenuState();
  IntervalMenuPrewarm({datasets:[current],current,state});expect(effects.length).toBe(1);effects.splice(0)[0]();
  const expected=intervalMenuEntries(restoreIntervalMenuState(state)).map(spec=>spec.id).filter(id=>id!=='1D'&&!/R$/.test(id));
  await vi.waitFor(()=>expect(calls.length).toBe(expected.length));
  expect(calls).toEqual(expected.map(id=>id+':probe'));
  IntervalMenuPrewarm({datasets:[current],current,state});effects.splice(0)[0]();
  await new Promise(resolve=>setTimeout(resolve,20));expect(calls.length).toBe(expected.length);
  vi.doUnmock('react');vi.doUnmock('../../src/domain/interval-switch');vi.resetModules();
 });
});
