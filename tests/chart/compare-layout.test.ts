import { it,expect } from 'vitest';
import {compareAligned} from '../../src/chart/compare-port';
import {createLayoutSnapshot} from '../../src/chart/layout-port';
const bars=(rows:[number,number][])=>rows.map(([time,close])=>({time,open:close,high:close,low:close,close,volume:0}));
it('comparison alignment leaves missing timestamps unavailable and never takes a future observation',()=>{
  const primary=bars([[1,100],[2,101],[3,102],[4,103]]),comparison=bars([[1,10],[3,15],[4,20]]);
  expect(compareAligned(primary,comparison,'percent')).toEqual([{time:1,value:0},{time:2,value:null},{time:3,value:50},{time:4,value:100}]);
  expect(compareAligned(primary,comparison,'indexed',3)).toEqual([{time:1,value:100*10/15},{time:2,value:null},{time:3,value:100},{time:4,value:100*20/15}]);
});
it('layout cells have stable unique identities and support the maximum16 charts',()=>{
  const ids=Array.from({length:16},(_,i)=>`cell-${i}`),layout=createLayoutSnapshot(16,{id:'layout-local',cellIds:ids});
  expect(layout.cells.map(cell=>cell.id)).toEqual(ids);expect(layout.activeCellId).toBe('cell-0');expect(layout.maximizedCellId).toBeNull();
  expect(()=>createLayoutSnapshot(17)).toThrow();expect(()=>createLayoutSnapshot(2,{cellIds:['same','same']})).toThrow();
});
