import {describe,expect,it} from 'vitest';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';
import {allLeaves,groupDefaultLeaf,leafIsActive,leafState,mainButtonName} from '../../src/ui/drawing-toolbar-model';
import {CURSOR_KINDS,CURSOR_PATCH_ABSENT,CURSOR_ROW_KIND} from '../../src/chart/cursor-kind';

// (root drop-in, needs the proposed catalog / toolbar model diffs): the Cursors group rows target a cursor kind.
// Pure model checks over the real catalog; no DOM, renderer or GUI claim.
const leaves=allLeaves(DRAWING_TOOL_CATALOG),leaf=(id:string)=>leaves.find(row=>row.leaf.id===id)!.leaf;
const cursorGroup=DRAWING_TOOL_CATALOG.find(group=>group.id==='cursors')!;

describe('cursor kinds in the toolbar model ',()=>{
 it('the four cursor rows target cursor kinds; Cross keeps the plain cursor target',()=>{
  expect(leaf('DW.CURSOR.CROSS').target).toEqual({kind:'cursor'});
  for(const id of ['DW.CURSOR.DOT','DW.CURSOR.ARROW_CURSOR'])expect(leaf(id).target).toEqual({kind:'cursor',cursor:CURSOR_ROW_KIND[id]});
  // Demonstration targets its cursor kind and carries the Alt hint (it was unavailable until direction F-11 / F-6).
  expect(leaf('DW.CURSOR.DEMONSTRATION').target).toEqual({kind:'cursor',cursor:'demonstration'});expect(String(leaf('DW.CURSOR.DEMONSTRATION').note??'')).toContain('Hold Alt for temporary drawing.');
 });
 it('Dot and Arrow stay unavailable (with the plain reason) until the host connects cursor kinds',()=>{
  for(const id of ['DW.CURSOR.DOT','DW.CURSOR.ARROW_CURSOR','DW.CURSOR.DEMONSTRATION']){
   expect(leafState(leaf(id),{modes:true})).toEqual({state:'unavailable',reason:CURSOR_PATCH_ABSENT});
   expect(leafState(leaf(id),{modes:true,cursorKinds:[]})).toMatchObject({state:'unavailable'});
   expect(leafState(leaf(id),{modes:true,cursorKinds:CURSOR_KINDS})).toEqual({state:'available'});
  }
  expect(leafState(leaf('DW.CURSOR.CROSS'),{modes:false})).toEqual({state:'available'});
  expect(leafState(leaf('DW.CURSOR.DOT'),{modes:true,cursorKinds:['arrow']})).toMatchObject({state:'unavailable'});
 });
 it('only the row of the chosen kind is active, and only while no tool or mode is armed',()=>{
  for(const [id,kind] of Object.entries(CURSOR_ROW_KIND).filter(([id])=>id!=='DW.CURSOR.DEMONSTRATION')){
   for(const chosen of CURSOR_KINDS)expect(leafIsActive(leaf(id),null,null,chosen),id+' '+chosen).toBe(kind===chosen);
   expect(leafIsActive(leaf(id),'trendline',null,kind)).toBe(false);expect(leafIsActive(leaf(id),null,'eraser',kind)).toBe(false);
  }
  // The default (no cursor argument) is Cross, as before.
  expect(leafIsActive(leaf('DW.CURSOR.CROSS'),null,null)).toBe(true);expect(leafIsActive(leaf('DW.CURSOR.DOT'),null,null)).toBe(false);
 });
 it('the group button names the chosen kind: "Cursor" for Cross, the row label otherwise',()=>{
  expect(mainButtonName(leaf('DW.CURSOR.CROSS'))).toBe('Cursor');
  expect(mainButtonName(leaf('DW.CURSOR.DOT'))).toBe('Dot');expect(mainButtonName(leaf('DW.CURSOR.ARROW_CURSOR'))).toBe('Arrow');
  const context={modes:true,cursorKinds:CURSOR_KINDS};
  expect(groupDefaultLeaf(cursorGroup,'DW.CURSOR.ARROW_CURSOR',context)!.id).toBe('DW.CURSOR.ARROW_CURSOR');
  expect(groupDefaultLeaf(cursorGroup,'DW.CURSOR.ARROW_CURSOR',{modes:true})!.id).toBe('DW.CURSOR.CROSS');
 });
 it('user-visible catalog wording has no internal ids or em dashes',()=>{
  for(const id of Object.keys(CURSOR_ROW_KIND)){const row=leaf(id);expect(`${row.label} ${row.note??''}`).not.toMatch(/lv[a-z]|DW\.|LineTool|COMPAT|\u2014/);}
 });
});
