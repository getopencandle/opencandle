// Drawing spec coverage (OpenCandle 0.8.1): every drawing tool in the catalog has a spec in
// tests/fixtures/drawing-spec/specs.ts, or an explicit, reasoned invariants-only exemption. A new tool without a spec fails here.
import {describe,expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DRAWING_TOOL_CATALOG} from '../../../src/ui/drawing-tool-catalog';
import {DRAWING_SPECS} from '../../fixtures/drawing-spec/specs';

const tools=DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(section=>section.leaves.flatMap(leaf=>leaf.target.kind==='tool'?[{id:leaf.id,type:leaf.target.type}]:[])));

describe('drawing spec coverage',()=>{
 it('the catalog arms 89 drawing tools',()=>{
  expect(tools).toHaveLength(89);
  expect(new Set(tools.map(t=>t.id)).size).toBe(tools.length);
 });
 it('every catalog drawing tool has a spec for its type',()=>{
  const missing=tools.filter(t=>!DRAWING_SPECS.some(s=>s.id===t.id&&s.type===t.type)).map(t=>`${t.id} (${t.type})`);
  expect(missing).toEqual([]);
 });
 it('every spec names a catalog tool and its armed type',()=>{
  const byId=new Map(tools.map(t=>[t.id,t.type]));
  expect(DRAWING_SPECS.filter(s=>byId.get(s.id)!==s.type).map(s=>`${s.id} (${s.type})`)).toEqual([]);
 });
 it('every spec cites its convention, and every exemption or skipped invariant says why',()=>{
  for(const s of DRAWING_SPECS){
   expect(s.source.trim().length,s.id).toBeGreaterThan(10);
   for(const reason of [s.invariantsOnly,s.noMirror,s.mirrorTextsVary,s.logTextsVary])if(reason!==undefined)expect(reason.trim().length,s.id).toBeGreaterThan(5);
   for(const [part,why] of Object.entries(s.fails??{}))expect(why,`${s.id} ${part}`).toMatch(/^SPEC-\d+: /);
  }
 });
 it('a full spec checks content: an exemption is the only spec without elements, levels, labels, texts, fills or geometry',()=>{
  const empty=DRAWING_SPECS.filter(s=>!s.invariantsOnly&&!s.segments?.length&&!s.levels?.length&&!s.labels?.length&&!s.exactTexts&&s.fills===undefined&&!s.custom).map(s=>s.id);
  expect(empty).toEqual([]);
 });
 it('the anchors fit each tool\'s anchor schema',()=>{
  for(const s of DRAWING_SPECS){
   const schema=(createDrawing(s.type as never,{paneId:'price'} as never) as any).anchorSchema();
   expect([schema.min,schema.max],s.id).toEqual([...s.anchorCount]);
   expect(s.anchors.length>=schema.min&&s.anchors.length<=schema.max,s.id).toBe(true);
  }
 });
 it('exemptions are few and listed: free-hand strokes and the chart-sourced bars pattern only',()=>{
  const full=new Set(DRAWING_SPECS.filter(s=>!s.invariantsOnly).map(s=>s.id));
  const exempt=tools.filter(t=>!full.has(t.id)).map(t=>t.type).sort();
  expect(exempt).toEqual(['freehand','highlighter','lvbarspattern']);
 });
});
