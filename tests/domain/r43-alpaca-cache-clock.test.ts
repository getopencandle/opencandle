import {afterEach,expect,it} from 'vitest';
import {cacheClockFixture,cacheRow,futureMinuteRows,oldMinuteRows,T0,DAY,flush,type ClockMode} from '../fixtures/r43-cache-clock';
import {LIVE_CACHED_NOTE} from '../../src/domain/live-cache';
import {selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';

const fixtures:Array<ReturnType<typeof cacheClockFixture>>=[];
const make=(...args:Parameters<typeof cacheClockFixture>)=>{const fixture=cacheClockFixture(...args);fixtures.push(fixture);return fixture;};
afterEach(async()=>{for(const fixture of fixtures.splice(0))await fixture.close();selectAlpacaSyntheticStub(false);});

it.each(['paid','free'] as const)('a backwards %s market clock refuses at least five future cached bars before any initial publication',async plan=>{
 const rows=futureMinuteRows();expect(rows.filter(row=>row.time>T0).length).toBeGreaterThanOrEqual(5);
 const fixture=make(rows,{plan});await flush();
 expect(fixture.handle.dataset().bars).toEqual([]);expect(fixture.handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
 expect(fixture.snapshots.every(snapshot=>snapshot.times.length===0)).toBe(true);expect(fixture.calls.length).toBeGreaterThan(0);expect(fixture.calls[0].start).toBeLessThan(rows[0].time);
 fixture.releaseHistory();await flush();expect(fixture.handle.dataset().bars.length).toBeGreaterThan(0);expect(fixture.handle.dataset().bars.every(row=>row.time<=T0)).toBe(true);expect(fixture.handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
});
it.each(['paid','free'] as const)('offline %s relaunch cannot keep or transiently publish a future cached tail',async plan=>{
 const fixture=make(futureMinuteRows(),{plan,failure:true});await flush();fixture.releaseHistory();await flush();
 expect(fixture.handle.dataset().bars).toEqual([]);expect(fixture.handle.dataset().provenance.state).toBe('error');expect(fixture.handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
 expect(fixture.snapshots.every(snapshot=>snapshot.times.length===0&&!snapshot.cached)).toBe(true);
});
it('a cached current minute is refused even when its opening time is already in the past',async()=>{
 const fixture=make(oldMinuteRows().concat(cacheRow(T0)),{now:T0+30});await flush();
 expect(fixture.handle.dataset().bars).toEqual([]);expect(fixture.calls[0].start).toBeLessThan(T0-1800);
});
it.each(['1D','1W','1M'])('a cached open %s target bucket is refused using the writer\'s actual source-plan end',async resolution=>{
 const starts=resolution==='1D'?Array.from({length:8},(_,index)=>Date.UTC(2026,9,13+index,4)/1000):resolution==='1W'?Array.from({length:8},(_,index)=>Date.UTC(2026,9,19)/1000-(7-index)*7*DAY):Array.from({length:8},(_,index)=>Date.UTC(2026,2+index,1)/1000);
 expect(starts.at(-1)!).toBeLessThan(T0);const fixture=make(starts.map(cacheRow),{resolution,plan:'paid'});await flush();
 expect(fixture.handle.dataset().bars).toEqual([]);expect(fixture.snapshots.every(snapshot=>snapshot.times.length===0)).toBe(true);expect(fixture.calls[0].start).toBeLessThan(starts[0]);
});
it.each(['explicit','fixture-default','ordinary-default'] as ClockMode[])('valid old cache still publishes immediately and reuses the overlap with %s time',async mode=>{
 const now=mode==='ordinary-default'?Math.floor(Date.now()/1000):T0,rows=oldMinuteRows(now).map((row,index)=>index<5?{...row,volume:99}:row),fixture=make(rows,{mode,now});await flush();
 expect(fixture.handle.dataset().bars).toEqual(rows);expect(fixture.handle.dataset().provenance.notes).toContain(LIVE_CACHED_NOTE);expect(fixture.calls[0].start).toBe(rows[5].time);
 fixture.releaseHistory();await flush();expect(fixture.handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);expect(fixture.handle.dataset().bars[0].volume).toBe(99);expect(fixture.handle.dataset().bars[0].time).toBe(rows[0].time);
 // savedAt is deliberately the real receipt clock, potentially after the synthetic market epoch. It grants no future row.
 expect(fixture.bridge.discardBarCache).not.toHaveBeenCalled();
});
it('a backwards clock while the cache read is pending uses the current market time at publication',async()=>{
 const fixture=make(futureMinuteRows(),{now:T0+3600,holdRead:true});fixture.clock.now=T0;fixture.releaseRead();await flush();
 expect(fixture.handle.dataset().bars).toEqual([]);expect(fixture.snapshots.every(snapshot=>snapshot.times.length===0)).toBe(true);expect(fixture.calls[0].end).toBeLessThanOrEqual(T0);
});
it('a bar closing exactly at now remains eligible; a non-finite calendar end remains a cache miss',async()=>{
 const closed=oldMinuteRows().concat(cacheRow(T0-60)),accepted=make(closed,{plan:'paid'});await flush();expect(accepted.handle.dataset().bars).toEqual(closed);
 const invalid=make(Array.from({length:8},(_,index)=>cacheRow(Number.MAX_SAFE_INTEGER-700000+index*100000)),{resolution:'1M',plan:'paid'});await flush();
 expect(invalid.handle.dataset().bars).toEqual([]);expect(invalid.snapshots.every(snapshot=>snapshot.times.length===0)).toBe(true);
});
