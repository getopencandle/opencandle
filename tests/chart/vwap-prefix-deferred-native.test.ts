import {expect,it} from 'vitest';
import {syntheticVwapRows,vwapIndicatorNativeHarness} from './vwap-indicator-native-harness';

it('late invalid private row admission becomes owned unavailable after native pending output',async()=>{
 const rows=syntheticVwapRows(129);(rows[128] as unknown as {close:unknown}).close='late-invalid';
 const h=await vwapIndicatorNativeHarness(rows);
 try{
  const id=h.port.add('vwap',{kernelVersion:2,source:'close'}),nativeId=h.port.list()[0].rendererId;
  expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);expect(()=>h.port.assertVwapReady()).toThrow(/pending/);
  await expect(h.port.waitForVwap()).resolves.toBeUndefined();
  h.port.assertVwapReady();expect(h.port.values(id).series).toEqual([]);
  expect(h.port.values(id).diagnostics.join(' ')).toMatch(/numeric data/);
  expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);
  expect(h.ports).toHaveLength(0);expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});
