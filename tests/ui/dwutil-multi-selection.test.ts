import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {BulkColorMenu,MultiSelectionBar} from '../../src/ui/multi-selection-bar';
import {planSelectionDisplacement} from '../../src/ui/multi-selection-model';
import {bulkPropertyBar} from '../../src/chart/drawing-template-batch';
import {dwRecord} from './dwutil-object-harness';

// Part B: the multi-selection bar and Displacement.
// SYNTHETIC values; server markup and pure planner only, no DOM or packaged claim.
const bars=Array.from({length:50},(_,index)=>({time:1000+index*60,open:1,high:2,low:1,close:1,volume:1}));
const anchor=(bar:number|null,price:number,editableTime=true)=>({timeSeconds:1000+(bar??0)*60,price,barNumber:bar,editableTime,editablePrice:true});
const chart=(rows:Record<string,unknown>[])=>({bulkPropertyBar:(selected:Record<string,unknown>[])=>bulkPropertyBar(selected as never),drawingManager:{},getDrawingEditor:()=>({anchors:[]}),getSourceBars:()=>bars}) as never;

describe('multi-selection bar',()=>{
 const rows=[dwRecord('a',100),dwRecord('b',110),dwRecord('c',120,'hline')] as unknown as Record<string,unknown>[];
 it('renders the Selected drawings toolbar with the shared property buttons and Settings for two or more drawings',()=>{
  const html=renderToStaticMarkup(createElement(MultiSelectionBar,{chart:chart(rows),ids:['a','b','c'],rows,onChanged:()=>{},onMessage:()=>{}}));
  expect(html).toContain('role="toolbar"');expect(html).toContain('aria-label="Selected drawings"');
  for(const title of ['Line tool colors','Line tool widths','Style'])expect(html).toContain('aria-label="'+title+'"');expect(html).toContain('>Settings<');
 });
 it('renders nothing for fewer than two drawings',()=>{
  expect(renderToStaticMarkup(createElement(MultiSelectionBar,{chart:chart(rows),ids:['a'],rows,onChanged:()=>{},onMessage:()=>{}}))).toBe('');
 });
 it('App shows the single edit bar only for one drawing and wires the multi bar from the selection ids',()=>{
  const source=readFileSync('src/ui/App.tsx','utf8');
  expect(source).toContain('<MultiSelectionBar ');/* The single edit bar also needs its drawing to exist and be visible. */expect(source).toMatch(/selectedDrawingIds\.length<2&&drawings\.some\(x=>x\.id===selectedDrawing&&x\.visible!==false\)&&<DrawingEditBar/);
  expect(source).toMatch(/setSelectedDrawingIds\(ids\)/);
 });
});
describe('bulk color menu',()=>{
 it('reuses the shared ColorControl popup trigger inside a menu with an applying menuitem',()=>{
  const html=renderToStaticMarkup(createElement(BulkColorMenu,{title:'Line tool colors',fieldKey:'style.lineColor',onPick:()=>true}));
  expect(html).toContain('role="menu"');expect(html).toContain('aria-label="Line tool colors"');
  expect(html).toContain('data-color-field="style.lineColor"');expect(html).toContain('Choose Line tool colors color');expect(html).toContain('role="menuitem"');
  expect(readFileSync('src/ui/multi-selection-bar.tsx','utf8')).not.toMatch(/LV_COLOR_PRESETS\.map/);
 });
});
describe('Displacement plan',()=>{
 it('shifts bars and price for every movable drawing and keeps time when the bar axis is empty',()=>{
  const plan=planSelectionDisplacement([{id:'a',anchors:[anchor(10,100),anchor(20,110)]},{id:'b',anchors:[anchor(5,50)]}],'+5','*2',bars);
  expect(plan.ok&&plan.moves).toEqual([{id:'a',anchors:[{time:(1000+15*60)*1000,price:200},{time:(1000+25*60)*1000,price:220}]},{id:'b',anchors:[{time:(1000+10*60)*1000,price:100}]}]);
  const keep=planSelectionDisplacement([{id:'a',anchors:[anchor(10,100)]}],'','+1',bars);
  expect(keep.ok&&keep.moves[0].anchors[0]).toEqual({time:(1000+600)*1000,price:101});
 });
 it('leaves out drawings without a bar coordinate and refuses when none can move',()=>{
  const some=planSelectionDisplacement([{id:'a',anchors:[anchor(1,10)]},{id:'t',anchors:[anchor(null,10,false)]}],'+1','',bars);
  expect(some.ok&&some.excluded).toEqual(['t']);
  const none=planSelectionDisplacement([{id:'t',anchors:[anchor(null,10,false)]}],'+1','',bars);
  expect(none.ok).toBe(false);
 });
 it('refuses the whole batch with the range message, and an empty form is a no-op',()=>{
  const out=planSelectionDisplacement([{id:'a',anchors:[anchor(1,10)]}],'-60000','',bars);
  expect(out).toMatchObject({ok:false,message:'Some drawings would move outside the allowed range.'});
  expect(planSelectionDisplacement([{id:'a',anchors:[anchor(1,10)]}],'','',bars)).toMatchObject({ok:true,noop:true,moves:[]});
  expect(planSelectionDisplacement([{id:'a',anchors:[anchor(1,10)]}],'abc','',bars).ok).toBe(false);
 });
});
