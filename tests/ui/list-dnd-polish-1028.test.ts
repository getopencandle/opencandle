import {describe,expect,it} from 'vitest';
import {planRowDrag,type RowBox} from '../../src/ui/watchlist-row-drag';

// The pure layout behind the watchlist pointer reorder. Five 30 px rows from y=28.
const rows:RowBox[]=['a','b','c','d','e'].map((id,index)=>({id,top:28+index*30,height:30}));
describe('planRowDrag',()=>{
 it('keeps the order until the block passes half a row, then opens the gap below the passed row',()=>{
  const still=planRowDrag(rows,new Set(['b']),58+14);expect(still.changed).toBe(false);expect(still.before).toBe('c');
  const down=planRowDrag(rows,new Set(['b']),58+15);expect(down.changed).toBe(true);expect(down.before).toBe('d');
  // c slides up into b's slot, the lifted row sits in the gap, d and e stay.
  expect(down.offsets.get('c')).toBe(-30);expect(down.offsets.get('d')).toBe(0);expect(down.offsets.get('b')).toBe(15);expect(down.lineY).toBe(88);
 });
 it('moving up opens the gap above the passed row and the end slot drops before null',()=>{
  expect(planRowDrag(rows,new Set(['d']),40).before).toBe('a');
  const end=planRowDrag(rows,new Set(['a']),400);expect(end.before).toBeNull();expect(end.blockTop).toBe(148);expect(end.lineY).toBe(148);
 });
 it('a block (heading with its rows) moves as one, stacked in display order',()=>{
  const plan=planRowDrag(rows,new Set(['a','b']),28+30+15);
  expect(plan.before).toBe('e');expect(plan.offsets.get('a')).toBe(45);expect(plan.offsets.get('b')).toBe(45);expect(plan.offsets.get('c')).toBe(-60);
 });
 it('a scattered selection always counts as a change (it gathers the rows)',()=>{
  expect(planRowDrag(rows,new Set(['a','c']),28).changed).toBe(true);
 });
});
