import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorScaleSides,readIndicatorScalePlacement,setIndicatorScalePlacement,INDICATOR_SCALE_PLACEMENT_MENU} from '../../src/chart/indicator-scale';
import type {IndicatorId} from '../../src/domain/indicators';
import {isPatternIndicator} from '../../src/domain/indicators-ext/patterns-catalog';

// Indicator scale placement left and no scale through the installed @luxalgo/vela 0.8.4 renderer with
// LV-VELA-SCALE-PLACEMENT-1 (COMPAT-5: setIndicatorPane lvScalePlacement, lvIndicatorScalePlacement) and the pinned
// core (tests/chart/native-core-harness.ts). SYNTHETIC bars. Values come from the real indicator port. No GUI claim.
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1+(i%3)*0.2,low:close-1-(i%2)*0.3,close,volume:100+(i*13)%50};});
async function core(){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;return {t,port,close(){port.dispose();t.dispose();}};}
const add=(port:any,kind:IndicatorId)=>{const factory=factoryIndicatorDefault(kind);return port.add(kind,factory.inputs,factory) as string;};
const nativeOf=(port:any,id:string)=>port.list().find((row:any)=>row.id===id).rendererId as string;

// The 56 pattern kinds share one definition shape and one presentation path; a pinned core per kind for all of
// them exhausts the 4 GB worker heap (the harness retains about 34 MB per case), so four representatives stand in for them.
const PATTERN_SAMPLE=new Set(['cdlall','cdlengulfingbull','chpall','chpdoubletop']);
// 123 kinds exhausted the 4 GB worker heap, so the per-kind cases are split across two files by index parity (this file: odd).
it.each([...INDICATOR_KINDS].filter(kind=>!isPatternIndicator(kind)||PATTERN_SAMPLE.has(kind)).filter((_,i)=>i%2===1))('SCALE_PLACEMENT %s: left scale and no scale on the patched renderer; values unchanged; back to own and shared',async kind=>{
 const a=await core();try{
  const id=add(a.port,kind),nativeId=nativeOf(a.port,id),before=a.port.values(id),renderer=a.t.native;
  expect(indicatorScaleSides(a.t.chart)).toEqual({left:true,none:true});
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('shared');
  setIndicatorScalePlacement(a.t.chart,nativeId,'left');
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('left');expect(renderer.lvIndicatorScalePlacement(nativeId)).toBe('left');
  expect(renderer.scene.indicators.get(nativeId).ownScale).toBe(true);expect(renderer.lvLeftScaleWidth()).toBeGreaterThan(0);
  expect(a.port.values(id)).toEqual(before);
  setIndicatorScalePlacement(a.t.chart,nativeId,'none');
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('none');expect(renderer.lvLeftScaleWidth()).toBe(0);
  expect(renderer.scene.ownScaleIndicatorsForPane(renderer.scene.indicators.get(nativeId).paneId).some((m:any)=>m.id===nativeId),'no right column').toBe(false);
  expect(a.port.values(id)).toEqual(before);
  setIndicatorScalePlacement(a.t.chart,nativeId,'own');expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('own');expect(renderer.lvIndicatorScalePlacement(nativeId)).toBeNull();
  setIndicatorScalePlacement(a.t.chart,nativeId,'left');setIndicatorScalePlacement(a.t.chart,nativeId,'shared');
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('shared');expect(renderer.lvIndicatorScalePlacement(nativeId)).toBeNull();expect(renderer.lvLeftScaleWidth()).toBe(0);
  expect(()=>setIndicatorScalePlacement(a.t.chart,nativeId,'top' as never)).toThrow(/shared, own, left or none/);expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('shared');
 }finally{a.close();}
});

