// A workspace Undo/Redo restores drawings through loadDrawings (native fromJSON), which
// publishes no drawing change (src/ui/ObjectTreePanel.tsx:128-130). The Object tree only sees it because the parent
// re-renders it. (App.tsx:1725 keepObjectTree + ObjectTreePanelWidget.tsx kept element) keeps the tree's
// props object and element while chart/dataset/indicators/scales are unchanged, so after Undo the tree is never re-rendered
// and keeps listing the drawings from before. SYNTHETIC values only.
// keepObjectTree is inline in App, so its body is mirrored here; the last test pins App.tsx so the mirror and the real deps
// cannot drift apart (the real dependency list must include the active cell's saved drawings).
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {stableProps,surfaceCaches} from '../../src/ui/surface-reuse';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps)};
});

const find=(node:any,type:any):any=>{if(Array.isArray(node)){for(const child of node){const found=find(child,type);if(found)return found;}return null;}if(!node?.props)return null;if(node.type===type)return node;return find(node.props.children,type);};

type Keep=(tree:any,cellDrawings:unknown)=>any;
// Verbatim body of App.tsx:1725 (r30), with surfaceProps = stableProps(surfaces.props, ...).
const r30Keep=(owner:object):Keep=>{const surfaces=surfaceCaches(owner);return (tree)=>{let scales:string|null=null;try{scales=JSON.stringify((tree.indicators??[]).map((row:any)=>tree.indicatorScale?.(row)??null));}catch{scales=null;}return stableProps(surfaces.props,'rail:object-tree',tree,[scales]);};};
// Proposed fix: the active cell's saved drawing document is a dependency too.
const fixedKeep=(owner:object):Keep=>{const surfaces=surfaceCaches(owner);return (tree,cellDrawings)=>{let scales:string|null=null;try{scales=JSON.stringify((tree.indicators??[]).map((row:any)=>tree.indicatorScale?.(row)??null));}catch{scales=null;}return stableProps(surfaces.props,'rail:object-tree',tree,[scales,cellDrawings]);};};

function scenario(keep:Keep){
 hooks.cells=[];
 // SYNTHETIC chart: one drawing before the Undo, none after; loadDrawings replaces the native objects and notifies nobody.
 let rows:any[]=[{id:'dw-1',type:'trendline'}],native:object[]=[{}];
 const chart={drawingManager:{list:()=>rows,state:()=>({groups:[]})},drawings:{all:()=>native},onDrawingsChanged:()=>()=>{},onDrawingSelection:()=>()=>{},drawingCatalog:()=>[],indicators:{}} as any;
 const dataset={instrument:{id:'SYNTH:X',symbol:'X',exchange:'SYNTH',name:'SYNTHETIC X'},resolution:'1D'} as any;
 const onDrawingsChanged=()=>{},setMessage=()=>{};
 // One App render: a fresh objectTree literal each time (as App builds it), the data window gets the bars.
 const app=(cellDrawings:unknown)=>{hooks.cursor=0;const objectTree=keep({chart,dataset,seriesVisible:true,indicators:[],onDrawingsChanged:()=>onDrawingsChanged(),onError:setMessage},cellDrawings);
  return find(ObjectTreeDataWindowWidget({tab:'object_tree',objectTree,dataWindow:{chart:null,dataset,bars:[]} as any}),ObjectTreePanel);};
 const savedBefore=[{id:'dw-1'}],before=app(savedBefore);
 // Ctrl+Z: App's history commit sets a new workspace (the active cell's drawings document changes) and the chart reloads
 // its drawings via loadDrawings; no onDrawingsChanged fires.
 rows=[];native=[];const savedAfter:unknown[]=[];
 const after=app(savedAfter);
 return {before,after};
}

it('documents the r30 bug: with only the scale dependency the Object tree element survives Ctrl+Z, so it never re-reads the drawings',()=>{
 const {before,after}=scenario(r30Keep({}));
 // r30: the same element is returned, React bails out, the tree keeps listing dw-1 (manager 0 vs tree 1, "Selected drawing
 // no longer exists" when a stale row is used). This is the failing behaviour the fix removes.
 expect(after).toBe(before);
});

it('with the active cell drawings as a dependency the tree element is rebuilt on Undo, and still kept across a plain re-render',()=>{
 const {before,after}=scenario(fixedKeep({}));
 expect(after).not.toBe(before);
 // a live-tick style re-render with the same saved drawings keeps the element (still holds)
 hooks.cells=[];const keep=fixedKeep({}),chart={drawingManager:{list:()=>[],state:()=>({groups:[]})},drawings:{all:()=>[]},onDrawingsChanged:()=>()=>{},onDrawingSelection:()=>()=>{},drawingCatalog:()=>[],indicators:{}} as any;
 const dataset={instrument:{id:'SYNTH:X',symbol:'X'},resolution:'1D'} as any,doc:unknown[]=[];
 const app=()=>{hooks.cursor=0;return find(ObjectTreeDataWindowWidget({tab:'object_tree',objectTree:keep({chart,dataset,indicators:[],onError:()=>{}},doc),dataWindow:{chart:null,dataset,bars:[]} as any}),ObjectTreePanel);};
 const a=app(),b=app();expect(b).toBe(a);
});

it('App.tsx keeps the Object tree with the active cell saved drawings as a dependency (pins the mirrored body above)',()=>{
 const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
 expect(app).toMatch(/const objectTreeDrawings=workspace\.grid\?\.cells\[workspace\.grid\.layout\.activeCellId\]\?\.drawings;/);
 expect(app).toMatch(/const keepObjectTree=[^\n]*surfaceProps\('rail:object-tree',tree,\[scales,objectTreeDrawings\]\)/);
});
