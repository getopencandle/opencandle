import {describe,expect,it} from 'vitest';
import {effectiveIndicatorVisible,indicatorHideOverlay} from '../../src/chart/indicator-hide-overlay';
import {defaultDrawingUtility} from '../../src/chart/drawing-utility-state';
describe(' indicator hide overlay (DD-9)',()=>{
 it('truth table: stored AND NOT overlay',()=>{
  expect(effectiveIndicatorVisible(true,false)).toBe(true);expect(effectiveIndicatorVisible(true,true)).toBe(false);
  expect(effectiveIndicatorVisible(false,false)).toBe(false);expect(effectiveIndicatorVisible(false,true)).toBe(false);
 });
 it('overlay derives from the indicator half of the utility state only',()=>{
  const u=defaultDrawingUtility();expect(indicatorHideOverlay(u)).toBe(false);expect(indicatorHideOverlay({...u,drawingsHidden:true})).toBe(false);expect(indicatorHideOverlay({...u,indicatorsHidden:true})).toBe(true);expect(indicatorHideOverlay(undefined)).toBe(false);
 });
});
