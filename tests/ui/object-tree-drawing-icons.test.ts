import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {DRAWING_TOOL_CATALOG,drawingTypeIconId} from '../../src/ui/drawing-tool-catalog';
import {DRAWING_TOOL_ICON,LV_ICONS} from '../../src/ui/icons';

// Object tree rows of OpenCandle drawing types (lvshortposition, lvpitchfan, lvsticker, ...) showed the
// generic clone glyph because the icon registry lists native types only. The row now falls back to its catalog icon.
describe('object tree drawing icons',()=>{
 const types=[...new Set(DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(part=>part.leaves.flatMap(leaf=>leaf.target.kind==='tool'?[leaf.target.type]:[]))))];
 it('every type the drawing toolbar can place resolves to a registered LV icon',()=>{
  expect(types.length).toBeGreaterThan(80);
  for(const type of types){const id=DRAWING_TOOL_ICON[type]??drawingTypeIconId(type);expect(id,type).toBeDefined();expect(LV_ICONS[id as keyof typeof LV_ICONS],type).toBeDefined();}
 });
 it('OpenCandle types take the icon of the row that arms them; unknown types stay unmapped',()=>{
  expect(DRAWING_TOOL_ICON.lvshortposition).toBeUndefined();
  expect(drawingTypeIconId('lvshortposition')).toBe('short-position');expect(drawingTypeIconId('lvpitchfan')).toBe('pitchfan');
  expect(drawingTypeIconId('lvelliotttriangle')).toBe('elliott-triangle');expect(drawingTypeIconId('lvsticker')).toBe('sticker');
  expect(drawingTypeIconId('no-such-type')).toBeUndefined();
 });
 it('the object tree row uses the registry icon first and the catalog icon as the fallback',()=>{
  expect(readFileSync('src/ui/ObjectTreePanel.tsx','utf8')).toContain("(DRAWING_TOOL_ICON[node.drawingType??'']??drawingTypeIconId(node.drawingType??''))");
 });
});
