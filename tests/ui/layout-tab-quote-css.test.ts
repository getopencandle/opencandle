import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const css=readFileSync('src/ui/layout-tabs.css','utf8');
const rule=(selector:string)=>css.split('\n').find(line=>line.startsWith(selector))??'';
const num=(text:string,prop:string)=>Number(new RegExp(prop+':([0-9]+)px').exec(text)?.[1]);

describe('layout tab quote widths',()=>{
 it('never truncates the price or the change',()=>{
  const fixed=rule('.lv-layout-tab-price,.lv-layout-tab-change');
  expect(fixed).toContain('flex:none');expect(fixed).not.toContain('ellipsis');
  expect(rule('.lv-layout-tab-symbol{flex')).toContain('text-overflow:ellipsis');
 });
 it('fits 1, 3 and 6 quote tabs at 1280 px before anything truncates',()=>{
  const tab=rule('.lv-layout-tab{position');const min=num(tab,'min-width'),max=num(tab,'max-width');
  // Every tab keeps its own width (no tab squeezes the others); the row scrolls instead.
  expect(tab).toContain('flex:none');expect(min).toBe(150);expect(max).toBe(300);expect(css).not.toContain('.lv-layout-tab:has(');
  expect(rule('.lv-layout-tabs-list{')).toContain('overflow:auto hidden');
  expect(min).toBeGreaterThanOrEqual(150);
  // Window chrome left for the strip: new-tab button, Wick button and padding.
  for(const count of [1,3,6])expect(count*min).toBeLessThanOrEqual(1280-120);
  expect(max).toBeGreaterThan(min);
 });
});
