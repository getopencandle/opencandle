import {describe,expect,it} from 'vitest';
import {legendMoreMenu,pinToScaleLabel} from '../../src/chart/legend-model';
import {CHART_SETTINGS_REASONS} from '../../src/chart/chart-settings-bindings';

// wording that names the main price scale side.
// the recorded facts "Pin to scale (now right)": a shared indicator rides the main scale, so the
// wording follows its side. SYNTHETIC contexts.
describe('main price scale side wording',()=>{
 it('Pin to scale reads "now left" for a shared indicator while the main scale is left; other placements are unchanged',()=>{
  expect(pinToScaleLabel('shared')).toBe('Pin to scale (now right)');
  expect(pinToScaleLabel('shared','right')).toBe('Pin to scale (now right)');
  expect(pinToScaleLabel('shared','left')).toBe('Pin to scale (now left)');
  expect(pinToScaleLabel('own','left')).toBe('Pin to scale (now its own scale)');
  expect(pinToScaleLabel(null,'left')).toBe('Pin to scale');
  const row=(mainScaleSide?:'left'|'right')=>legendMoreMenu('indicator',{surface:'legend',title:'SYN',value:null,hidden:false,favorite:false,scalePlacement:'shared',...(mainScaleSide?{mainScaleSide}:{})}).find(item=>item.kind==='item'&&item.id==='pinToScale');
  expect(row()).toMatchObject({label:'Pin to scale (now right)'});expect(row('left')).toMatchObject({label:'Pin to scale (now left)'});
 });
 it('the Scales placement reason no longer says scales are right only',()=>{
  expect(CHART_SETTINGS_REASONS.placement).toBe('Saved with the chart. OpenCandle does not stack scales by this setting yet; use Move scale to left on the price scale.');
 });
});
