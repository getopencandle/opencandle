import {describe,expect,it} from 'vitest';
import {DEFAULT_PRICE_SCALE_SETTINGS,defaultPriceScaleSettings,validatePriceScaleSettings} from '../../src/chart/price-scale-state';
// the main price scale side is an optional settings field.
// Absent means right; 'right' is normalized away so default documents stay
// byte-identical. SYNTHETIC documents.
describe('price scale settings mainSide',()=>{
 it('accepts an absent key and keeps the default document unchanged',()=>{
  const doc=defaultPriceScaleSettings();
  expect(validatePriceScaleSettings(doc)).toEqual(doc);
  expect(Object.hasOwn(validatePriceScaleSettings(doc),'mainSide')).toBe(false);
  expect(Object.hasOwn(DEFAULT_PRICE_SCALE_SETTINGS,'mainSide')).toBe(false);
  expect(JSON.stringify(validatePriceScaleSettings(doc))).toBe(JSON.stringify(doc));
 });
 it("keeps 'left' and drops 'right'",()=>{
  const left=validatePriceScaleSettings({...defaultPriceScaleSettings(),mainSide:'left'});
  expect(left.mainSide).toBe('left');
  const right=validatePriceScaleSettings({...defaultPriceScaleSettings(),mainSide:'right'});
  expect(Object.hasOwn(right,'mainSide')).toBe(false);
  expect(JSON.stringify(right)).toBe(JSON.stringify(defaultPriceScaleSettings()));
 });
 it('rejects other sides and non-strings',()=>{
  for(const bad of ['center','LEFT','',null,1,true,{},['left']])expect(()=>validatePriceScaleSettings({...defaultPriceScaleSettings(),mainSide:bad}),JSON.stringify(bad)).toThrow(/side/);
  expect(()=>validatePriceScaleSettings({...defaultPriceScaleSettings(),mainSide:undefined})).toThrow();
 });
 it('placement stays a separate, unchanged setting',()=>{
  const left=validatePriceScaleSettings({...defaultPriceScaleSettings(),placement:'auto',mainSide:'left'});
  expect(left.placement).toBe('auto');
  expect(()=>validatePriceScaleSettings({...defaultPriceScaleSettings(),other:1})).toThrow(/unknown field/);
 });
});
