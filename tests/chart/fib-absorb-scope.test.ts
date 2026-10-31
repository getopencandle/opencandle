import {afterEach,expect,it,vi} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';

// The F1 commit-lag absorb (withhold LV presentation for a frame when the saved
// record lags the native store by just-committed geometry) must not accept more than a
// commit lag. SYNTHETIC rows; actual native interaction/store/renderer bodies.

type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
function record(){const row=fibBaselineRecord();row.props={...row.props,lvFibBackground:{schemaVersion:1,opacity:40}};return row;}
const commands=(f:Harness)=>[f.top,...f.slices].flatMap(row=>row.commands);
function attempt(f:Harness){for(const row of [f.top,...f.slices])row.commands.length=0;let error:unknown;try{f.render();f.drain();}catch(caught){error=caught;}
 return{error:error===undefined?undefined:String(error),baseline:JSON.stringify(f.baseline.diagnostics()),quarantined:f.diagnostics.some(message=>message.includes('Trendline annotation painting failed')),strokes:commands(f).filter(command=>command.op==='stroke').length,fills:commands(f).filter(command=>command.op==='fillRect').length};}
let clock=1_000_000;
function useClock(){clock=1_000_000;vi.spyOn(performance,'now').mockImplementation(()=>clock);}
afterEach(()=>{vi.restoreAllMocks();});

it('P1 a persistent anchor-only divergence with no commit is absorbed inside the commit window, then withheld without quarantine (FIB-SETTINGS-1029)',async()=>{
 useClock();const f=await fibBaselineHarness();try{
  f.sync([record()]);f.drain();
  const other=record();other.anchors=[{time:1000000,price:150},{time:1240000,price:250}] as any;f.document.load({version:1,drawings:[other]});
  const first=attempt(f);
  expect(first.error).toBeUndefined();expect(first.fills).toBe(0);expect(first.baseline).toContain('differs from its canonical record');
  clock+=5000;
  const later=attempt(f);
  expect(later.error).toBeUndefined();expect(later.quarantined).toBe(false);expect(later.fills).toBe(0);expect(later.baseline).toContain('differs from its canonical record');
 }finally{f.cleanup();}
});

it('P2 a saved record with a different anchor topology (3 vs 2 anchors) is refused, not absorbed: withheld without quarantine (FIB-SETTINGS-1029)',async()=>{
 useClock();const f=await fibBaselineHarness();try{
  f.sync([record()]);f.drain();
  const other=record();other.anchors=[...(other.anchors as any),{time:1300000,price:300}];f.document.load({version:1,drawings:[other]});
  const result=attempt(f);
  expect(result.error).toBeUndefined();expect(result.quarantined).toBe(false);expect(result.fills).toBe(0);expect(result.baseline).toContain('differs from its canonical record');
 }finally{f.cleanup();}
});

it('P3 a saved record failing validation (non-finite anchor) is refused, not absorbed',async()=>{
 useClock();const f=await fibBaselineHarness();try{
  f.sync([record()]);f.drain();
  const other=record();other.anchors=[{time:1000000,price:NaN,SYNTHETIC:'x'},{time:1240000,price:200}] as any;f.document.load({version:1,drawings:[other]});
  const result=attempt(f);
  expect(result.error).toMatch(/finite/);expect(result.quarantined).toBe(true);
 }finally{f.cleanup();}
});

it('identical anchors with any other canonical mismatch (locked flag) are refused, not absorbed: withheld without quarantine (FIB-SETTINGS-1029)',async()=>{
 useClock();const f=await fibBaselineHarness();try{
  f.sync([record()]);f.drain();
  const other=record();(other as any).locked=true;f.document.load({version:1,drawings:[other]});
  const result=attempt(f);
  expect(result.error).toBeUndefined();expect(result.quarantined).toBe(false);expect(result.fills).toBe(0);expect(result.baseline).toContain('differs from its canonical record');
 }finally{f.cleanup();}
});

it('a fresh divergence (new native anchors) opens a fresh window; resolution clears it',async()=>{
 useClock();const f=await fibBaselineHarness();try{
  f.sync([record()]);f.drain();
  const other=record();other.anchors=[{time:1000000,price:150},{time:1240000,price:250}] as any;f.document.load({version:1,drawings:[other]});
  expect(attempt(f).error).toBeUndefined();
  // The record follows: the divergence resolves and the presentation returns.
  f.document.load({version:1,drawings:f.core.controller.store.serialize().drawings});
  const settled=attempt(f);expect(settled.error).toBeUndefined();expect(settled.fills).toBeGreaterThan(0);expect(f.baseline.diagnostics()).toEqual([]);
  // Much later a new lag is again absorbed for its own commit window.
  clock+=60_000;f.document.load({version:1,drawings:[other]});
  expect(attempt(f).error).toBeUndefined();
 }finally{f.cleanup();}
});
