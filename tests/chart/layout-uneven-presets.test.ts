import {describe,expect,it} from 'vitest';
import {createLayoutSnapshot,LV_LAYOUTS,type LayoutPreset} from '../../src/chart/layout-port';
import {equalTracks,validateLayoutTracks} from '../../src/chart/layout-tracks';
// Uneven layout presets. Each `areas` grid is a rectangle of the preset's columns x rows, names
// exactly `count` areas, and every area is one filled rectangle (a valid CSS grid-template-areas value).
const uneven=(LV_LAYOUTS as readonly LayoutPreset[]).filter(row=>row.areas);
function rectangles(areas:readonly (readonly string[])[]){
 const names=[...new Set(areas.flat())];
 return names.every(name=>{const cells:[number,number][]=[];areas.forEach((row,r)=>row.forEach((value,c)=>{if(value===name)cells.push([r,c]);}));const rs=cells.map(x=>x[0]),cs=cells.map(x=>x[1]);const h=Math.max(...rs)-Math.min(...rs)+1,w=Math.max(...cs)-Math.min(...cs)+1;return h*w===cells.length;});
}
describe('uneven layout presets',()=>{
 // The the reference app uneven arrangements, in picker order (grouped by chart count).
 it('adds the uneven arrangements: 1 large + 2 small, 1 large + 3 small, 2 small + 1 wide and the additions',()=>{
  expect(uneven.map(row=>[row.id,row.label,row.count])).toEqual([['one-plus-two','1 large, 2 small',3],['two-plus-one-right','2 small, 1 large',3],['two-plus-one','2 small, 1 wide',3],['one-plus-two-below','1 wide, 2 small',3],['one-plus-three','1 large, 3 small',4],['one-plus-three-below','1 wide, 3 small',4],['one-plus-four','1 large, 4 small',5],['two-plus-three','2 above 3',5],['one-plus-four-below','1 wide, 4 small',5]]);
 });
 it('every areas grid matches its columns, rows and count, and every area is a rectangle',()=>{
  for(const row of uneven){
   const areas=row.areas!;expect(areas).toHaveLength(row.rows);for(const line of areas)expect(line).toHaveLength(row.columns);
   expect(new Set(areas.flat()).size).toBe(row.count);expect(rectangles(areas),row.id).toBe(true);
  }
 });
 it('ids stay unique, snapshots build and equal tracks validate for the new presets',()=>{
  expect(new Set(LV_LAYOUTS.map(row=>row.id)).size).toBe(LV_LAYOUTS.length);
  for(const row of uneven){expect(createLayoutSnapshot(row.count).cells).toHaveLength(row.count);const tracks=equalTracks(row.id);expect(()=>validateLayoutTracks(tracks,row.id)).not.toThrow();}
 });
 it('the even presets carry no areas (saved grids paint as before)',()=>{
  expect((LV_LAYOUTS as readonly LayoutPreset[]).filter(row=>!row.areas).map(row=>row.id)).toEqual(['single','two-columns','two-rows','three-columns','three-rows','four','four-columns','four-rows','five-columns','six','six-columns','six-tall','seven-columns','eight','eight-columns','eight-tall','ten','twelve','fourteen','sixteen']);
 });
});
