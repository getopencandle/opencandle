import {describe,expect,it} from 'vitest';
import {createLayoutSnapshot,LV_LAYOUTS,type LayoutPreset} from '../../src/chart/layout-port';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {equalTracks,validateLayoutTracks} from '../../src/chart/layout-tracks';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';

// The the reference app multi-chart layout catalog. SYNTHETIC fixture dataset only.
const rows=LV_LAYOUTS as readonly LayoutPreset[];
const by=new Map(rows.map(row=>[row.id,row]));
const geometry=(id:string)=>{const row=by.get(id);return row?[row.columns,row.rows,row.count,row.areas?row.areas.map(line=>line.join('')).join('/'):null]:null;};

describe('the reference app layout catalog',()=>{
 it('offers every chart count the reference app offers: 1 to 8, 10, 12, 14 and 16',()=>{
  expect([...new Set(rows.map(row=>row.count))]).toEqual([1,2,3,4,5,6,7,8,10,12,14,16]);
 });
 it('has the the reference app arrangements for each count, with these geometries',()=>{
  const expected:Record<string,unknown[]>={
   // 3 charts: 3h, 3v, 3s, 3r, 2-1, 1-2
   'three-columns':[3,1,3,null],'three-rows':[1,3,3,null],'one-plus-two':[2,2,3,'ab/ac'],'two-plus-one-right':[2,2,3,'ab/cb'],'two-plus-one':[2,2,3,'ab/cc'],'one-plus-two-below':[2,2,3,'aa/bc'],
   // 4 charts: 4, 4h, 4v, 4s, 1-3
   four:[2,2,4,null],'four-columns':[4,1,4,null],'four-rows':[1,4,4,null],'one-plus-three':[2,3,4,'ab/ac/ad'],'one-plus-three-below':[3,2,4,'aaa/bcd'],
   // 5 charts: 5h, 5s, 2-3, 1-4
   'five-columns':[5,1,5,null],'one-plus-four':[2,4,5,'ab/ac/ad/ae'],'two-plus-three':[6,2,5,'aaabbb/ccddee'],'one-plus-four-below':[4,2,5,'aaaa/bcde'],
   // 6, 7 and 8 charts: 6, 6h, 6c, 7h, 8, 8h, 8c
   six:[3,2,6,null],'six-columns':[6,1,6,null],'six-tall':[2,3,6,null],'seven-columns':[7,1,7,null],eight:[4,2,8,null],'eight-columns':[8,1,8,null],'eight-tall':[2,4,8,null],
   ten:[5,2,10,null],twelve:[4,3,12,null],fourteen:[7,2,14,null],sixteen:[4,4,16,null],
  };
  for(const [id,value] of Object.entries(expected))expect(geometry(id),id).toEqual(value);
 });
 it('keeps every preset a saved workspace may name, with its geometry unchanged',()=>{
  const saved:Record<string,unknown[]>={single:[1,1,1,null],'two-columns':[2,1,2,null],'two-rows':[1,2,2,null],'three-columns':[3,1,3,null],'three-rows':[1,3,3,null],four:[2,2,4,null],six:[3,2,6,null],eight:[4,2,8,null],ten:[5,2,10,null],twelve:[4,3,12,null],sixteen:[4,4,16,null],'one-plus-two':[2,2,3,'ab/ac'],'one-plus-three':[2,3,4,'ab/ac/ad'],'two-plus-one':[2,2,3,'ab/cc']};
  for(const [id,value] of Object.entries(saved))expect(geometry(id),id).toEqual(value);
 });
 it('lists presets grouped by chart count, single chart first, with unique ids and labels',()=>{
  const counts=rows.map(row=>row.count);expect(counts).toEqual([...counts].sort((a,b)=>a-b));expect(rows[0].id).toBe('single');
  expect(new Set(rows.map(row=>row.id)).size).toBe(rows.length);expect(new Set(rows.map(row=>row.label)).size).toBe(rows.length);
  for(const row of rows)expect(row.label,row.id).not.toMatch(/[–—]|-/);
 });
 it('every even grid fills its tracks and every uneven area is one rectangle',()=>{
  for(const row of rows){
   if(!row.areas){expect(row.columns*row.rows,row.id).toBe(row.count);continue;}
   expect(row.areas).toHaveLength(row.rows);for(const line of row.areas)expect(line).toHaveLength(row.columns);
   const names=[...new Set(row.areas.flat())];expect(names,row.id).toHaveLength(row.count);
   for(const name of names){const cells:[number,number][]=[];row.areas.forEach((line,r)=>line.forEach((value,c)=>{if(value===name)cells.push([r,c]);}));
    const h=Math.max(...cells.map(x=>x[0]))-Math.min(...cells.map(x=>x[0]))+1,w=Math.max(...cells.map(x=>x[1]))-Math.min(...cells.map(x=>x[1]))+1;expect(h*w,row.id+' '+name).toBe(cells.length);}
  }
 });
 it('every preset builds a snapshot, equal tracks and a resized grid with that many charts',()=>{
  const initial=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance,themeId:defaultTheme.id});
  for(const row of rows){
   expect(createLayoutSnapshot(row.count).cells).toHaveLength(row.count);expect(()=>validateLayoutTracks(equalTracks(row.id),row.id)).not.toThrow();
   const grid=resizeMultiChartState(initial,row.id);expect(grid.presetId).toBe(row.id);expect(grid.layout.cells).toHaveLength(row.count);expect(Object.keys(grid.cells)).toHaveLength(row.count);
  }
 });
});
