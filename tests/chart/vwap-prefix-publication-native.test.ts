import {expect,it} from 'vitest';
import {syntheticVwapRows,vwapIndicatorNativeHarness} from './vwap-indicator-native-harness';

it('a failed calculation lease stays retired while an already captured metadata lease can prove only the unchanged source',async()=>{
 const rows=syntheticVwapRows(129);(rows[128] as unknown as {close:unknown}).close='SYNTHETIC invalid';const h=await vwapIndicatorNativeHarness(rows);try{const publication=h.prefix.capture(),calculation=h.prefix.capture();expect(publication).not.toBe(calculation);await expect(calculation.prepare(new AbortController().signal)).rejects.toThrow('numeric data');expect(()=>calculation.assertCurrent()).toThrow('retired');expect(()=>calculation.readRows(0,1)).toThrow('retired');expect(()=>publication.assertCurrent()).not.toThrow();expect(()=>publication.readRows(0,1)).toThrow('not complete');h.retire();expect(()=>publication.assertCurrent()).toThrow();}finally{h.dispose();}
});
it('source retirement during deferred bad-row preparation rejects readiness instead of publishing old unavailable state',async()=>{
 const rows=syntheticVwapRows(129);(rows[128] as unknown as {close:unknown}).close='SYNTHETIC invalid';const h=await vwapIndicatorNativeHarness(rows);try{const id=h.port.add('vwap',{kernelVersion:2,source:'close'});h.retire();await expect(h.port.waitForVwap()).rejects.toThrow();expect(()=>h.port.assertVwapReady()).toThrow();expect(h.port.values(id).series).toEqual([]);expect(h.quarantines).toEqual([]);}finally{h.dispose();}
});
it('replacement during deferred invalid preparation retains only the newer successful native result',async()=>{
 const rows=syntheticVwapRows(129);(rows[128] as unknown as {close:unknown}).close='SYNTHETIC invalid';const h=await vwapIndicatorNativeHarness(rows);try{const id=h.port.add('vwap',{kernelVersion:2,source:'close'});h.replace(syntheticVwapRows(3));await h.finish();h.port.assertVwapReady();const view=h.port.list()[0];expect(view.informationBars).toBe(3);expect(h.port.values(id).series[0].values).toHaveLength(3);expect(h.port.values(id).diagnostics).toEqual([]);expect(h.quarantines).toEqual([]);}finally{h.dispose();}
});
