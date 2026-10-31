import {describe,expect,it} from 'vitest';
import {DRAWING_BAR_POSITION_KEY,clearBarPosition,readBarPosition,writeBarPosition} from '../../src/ui/drawing-edit-bar-position';
const memory=()=>{const map=new Map<string,string>();return{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);},map};};
describe('L2b floating drawing toolbar place',()=>{
 it('clearBarPosition forgets a remembered place',()=>{
  const s=memory();writeBarPosition(s,{left:12,top:34});expect(readBarPosition(s)).toEqual({left:12,top:34});
  clearBarPosition(s);expect(readBarPosition(s)).toBeNull();expect(s.map.has(DRAWING_BAR_POSITION_KEY)).toBe(false);
 });
 it('clearBarPosition tolerates missing or throwing storage',()=>{
  expect(()=>clearBarPosition(null)).not.toThrow();
  expect(()=>clearBarPosition({getItem:()=>null,setItem:()=>{},removeItem:()=>{throw Error('blocked');}})).not.toThrow();
 });
});
