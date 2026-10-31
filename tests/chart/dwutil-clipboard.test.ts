import {describe,expect,it} from 'vitest';
import {createDrawingClipboard,PASTE_UNKNOWN_TYPE_MESSAGE} from '../../src/chart/drawing-clipboard';
import {freshDrawingUtility,defaultDrawingUtility} from '../../src/chart/drawing-utility-state';
const rows=[{id:'a',type:'trendline',anchors:[{time:1,price:2}],locked:true,lvSyncScope:'global'},{id:'b',type:'hline',anchors:[{time:3,price:4}]}];
describe(' clipboard (DD-13, DD-14, DD-25)',()=>{
 it('copy snapshots rows in memory and ignores later mutation',()=>{
  const c=createDrawingClipboard();expect(c.size()).toBe(0);expect(c.paste(()=>true)).toEqual({ok:false,message:'Nothing to paste.'});
  const src=structuredClone(rows);c.copy(src);src[0].anchors[0].price=999;expect(c.size()).toBe(2);
  const r=c.paste(()=>true,freshDrawingUtility());expect(r.ok).toBe(true);if(!r.ok)return;
  expect(r.rows.map(x=>x.type)).toEqual(['trendline','hline']);expect(r.rows[0].anchors).toEqual([{time:1,price:2}]);expect(r.rows[0].lvSyncScope).toBe('layout');expect(r.rows[1].lvSyncScope).toBe('layout');
 });
 it('fresh distinct ids on every paste',()=>{
  const c=createDrawingClipboard();c.copy(rows);const a=c.paste(()=>true),b=c.paste(()=>true);if(!a.ok||!b.ok)throw Error('x');
  const ids=[...a.rows,...b.rows].map(r=>r.id);expect(new Set(ids).size).toBe(4);expect(ids.some(id=>id==='a'||id==='b')).toBe(false);
 });
 it('toolbar sync off strips the stamp; absent utility strips it too',()=>{
  const c=createDrawingClipboard();c.copy(rows);const r=c.paste(()=>true,defaultDrawingUtility());if(!r.ok)throw Error('x');expect('lvSyncScope' in r.rows[0]).toBe(false);
  const n=c.paste(()=>true);if(!n.ok)throw Error('x');expect('lvSyncScope' in n.rows[0]).toBe(false);
 });
 it('unknown types are refused with the DD-14 text and nothing is pasted',()=>{
  const c=createDrawingClipboard();c.copy(rows);const r=c.paste(t=>t==='hline');expect(r).toEqual({ok:false,message:PASTE_UNKNOWN_TYPE_MESSAGE});
  expect(PASTE_UNKNOWN_TYPE_MESSAGE).toBe('Some copied drawings are not available in this chart and were not pasted.');
 });
 it('copy of nothing keeps the previous snapshot; limits',()=>{
  const c=createDrawingClipboard();c.copy(rows);expect(c.copy([])).toBe(false);expect(c.size()).toBe(2);
  expect(c.copy(Array.from({length:129},(_,i)=>({id:'x'+i,type:'hline'})))).toBe(false);expect(c.size()).toBe(2);c.clear();expect(c.size()).toBe(0);
 });
 it('injected id source',()=>{let n=0;const c=createDrawingClipboard({newId:()=>'n'+(++n)});c.copy(rows);const r=c.paste(()=>true);if(!r.ok)throw Error('x');expect(r.rows.map(x=>x.id)).toEqual(['n1','n2']);});
});
