import {describe,expect,it} from 'vitest';
import {WatchlistCompositionPie,pieCoverage,pieSlices} from '../../src/ui/WatchlistCompositionPie';
import type {AdvancedComposition} from '../../src/watchlists/advanced';

// Pure geometry and wording; SYNTHETIC counts. The slices describe equal weight per distinct market.
const segment=(label:string,count:number,total:number):AdvancedComposition=>({label,count,total,percent:count/total*100});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
describe('type pie',()=>{
 it('slices sweep exactly 360 degrees in total, in order, with hand-computed angles',()=>{
  const slices=pieSlices([segment('etf',1,4),segment('stock',2,4),segment('Unknown',1,4)]);
  expect(slices.map(slice=>[slice.label,slice.startAngle,slice.endAngle])).toEqual([['etf',0,90],['stock',90,270],['Unknown',270,360]]);
  expect(Math.abs(slices.reduce((sum,slice)=>sum+(slice.endAngle-slice.startAngle),0)-360)).toBeLessThan(1e-9);
  const thirds=pieSlices([segment('a',1,3),segment('b',1,3),segment('c',1,3)]);expect(Math.abs(thirds.reduce((sum,slice)=>sum+(slice.endAngle-slice.startAngle),0)-360)).toBeLessThan(1e-9);
  expect(slices[2].color).toBe('var(--lv-text-disabled)');expect(slices[0].color).toMatch(/^var\(--lv-/);expect(slices.every(slice=>slice.path.startsWith('M '))).toBe(true);
 });
 it('a single slice is a full circle path and an empty list has no slices',()=>{
  const [only]=pieSlices([segment('stock',3,3)]);expect(only.endAngle-only.startAngle).toBe(360);expect(only.path.match(/A /g)).toHaveLength(2);expect(pieSlices([])).toEqual([]);
 });
 it('states the coverage denominator with an Unknown slice counted as unclassified',()=>{
  expect(pieCoverage([segment('stock',3,4),segment('Unknown',1,4)])).toBe('3 of 4 symbols classified');expect(pieCoverage([segment('stock',2,2)])).toBe('2 of 2 symbols classified');expect(pieCoverage([])).toBe('0 of 0 symbols classified');
  const rendered=WatchlistCompositionPie({title:'Type',segments:[segment('stock',3,4),segment('Unknown',1,4)]});expect(text(rendered)).toContain('3 of 4 symbols classified');expect(text(rendered)).toContain('Unknown: 1 (25.0%)');
 });
 it('contains no em dash', ()=>{expect(text(WatchlistCompositionPie({title:'Type',segments:[segment('stock',1,1)]}))).not.toMatch(new RegExp(String.fromCharCode(0x2014)));});
});
