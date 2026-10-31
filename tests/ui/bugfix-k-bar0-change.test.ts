import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import * as model from '../../src/ui/data-window-model';

// Chart header change at the first bar agrees with the data window: at bar 0 the chart header read "+0.00 (0.00%)"
// while the Data window showed the empty glyph. Root cause src/ui/App.tsx:754: headerPrevious falls back to headerBar
// itself (`calculationBars[index-1]??headerBar`), so bar 0 is compared with itself. SYNTHETIC values; not executable UI evidence.
const header=(model as Record<string,unknown>).chartHeaderChange as undefined|((current:{close:number}|null|undefined,previous:{close:number}|null|undefined)=>{text:string;positive:boolean|null});

describe('chart header change agrees with the Data window',()=>{
 it('bar 0 (no previous bar) shows the empty glyph, like the Data window Change',()=>{
  expect(typeof header).toBe('function');
  expect(header!({close:23.64},undefined)).toEqual({text:model.DATA_WINDOW_EMPTY,positive:null});
  expect(model.formatChange(23.64,undefined,0.01)).toBe(model.DATA_WINDOW_EMPTY);
 });
 it('a real previous bar keeps the header format "+abs (pct%)" and sign',()=>{
  expect(header!({close:11},{close:10})).toEqual({text:'+1.00 (10.00%)',positive:true});
  expect(header!({close:9.5},{close:10})).toEqual({text:'-0.50 (-5.00%)',positive:false});
  expect(header!({close:10},{close:10})).toEqual({text:'+0.00 (0.00%)',positive:true});
 });
 it('a zero previous close keeps the change and shows the empty glyph for the percent (Data window policy)',()=>{
  expect(header!({close:1},{close:0}).text).toBe('+1.00 ('+model.DATA_WINDOW_EMPTY+')');
 });
 // PENDING ROOT WIRING (src/ui/App.tsx is reserved): passes once the App diff is applied.
 // Un-skip it in that commit.
 it('App renders the header change through chartHeaderChange with no self-comparison fallback',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).not.toMatch(/\?\?headerBar,headerChange=/);
  expect(app).toMatch(/chartHeaderChange\(/);
 });
});
