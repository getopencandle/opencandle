import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';

// Audit 2026-10-19: App mounts ONE BarsPatternResolutionChip (no key) and only changes its `id` prop when another drawing is
// selected, so chip state must never carry a notice (message, Source data select, Use available range) from one pattern to
// another, or past a change of the pattern itself (undo/redo, dialog Apply). Real chip function with controlled hooks; not a
// mounted GUI run. SYNTHETIC datasets only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];}};});
const {BarsPatternResolutionChip}=await import('../../src/ui/BarsPatternSource');
const {drawingEditor,patchDrawingEdit}=await import('../../src/chart/drawing-port');
const {sourceContextForDataset}=await import('../../src/chart/source-context');
const {LV_BARS_PATTERN}=await import('../../src/chart/lv-types/bars-pattern');
const {clearStagedBarsPatternRequests}=await import('../../src/chart/lv-types/bars-pattern-request');
const {DAY,D0,day,daily,dailyBars,dataset,minuteBars}=await import('../helpers/barspat-fixture');

function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const projection={width:600,height:400,xOf:(t:number)=>20+(t/1000-D0)/DAY*10,yOf:(p:number)=>300-p,pxToPoint:()=>({time:0,price:0}),paneIdAtY:()=>'price',
 barsInRange:(from:number,to:number)=>dailyBars(0,30).filter(bar=>bar.time*1000>=from&&bar.time*1000<=to).map(bar=>({...bar,time:bar.time*1000}))} as never;
function placed(id:string,from=5,to=9):SerializedDrawing{
 const draft=createDrawing(LV_BARS_PATTERN as never,{id,paneId:'price',anchors:[{time:day(from)*1000,price:120},{time:day(to)*1000,price:120}]})!;
 draft.onPlaced(projection);return draft.serialize();
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;clearStagedBarsPatternRequests();});

describe('chip notice belongs to one pattern state (audit)',()=>{
 it('a notice raised on one pattern is not shown, and cannot be acted on, after another pattern is selected or the pattern changes',()=>{
  const records:Record<string,SerializedDrawing>={p1:placed('p1'),p2:placed('p2')};
  const d=daily(),bars=d.bars,context=sourceContextForDataset(d);
  const a=dataset('m-a','1m',minuteBars(5,15)),b=dataset('m-b','1m',minuteBars(5,15));
  const update=vi.fn((id:string,patch:any)=>{records[id]=patchDrawingEdit(records[id],bars,patch);return{accepted:true,changed:true};});
  const chart:any={getDrawingEditor:(id:string)=>({...drawingEditor(records[id],bars),recordFingerprint:JSON.stringify(records[id])}),getSourceBars:()=>bars,getSourceContext:()=>context,updateDrawingEdit:update};
  const props={chart,id:'p1',data:{datasets:[d,a,b]},onChange:vi.fn(),onMessage:vi.fn()};
  const render=()=>{hooks.cursor=0;return BarsPatternResolutionChip(props)!;};
  const alerts=()=>findAll(render(),node=>node.props.role==='alert');
  const sources=()=>findAll(render(),node=>node.props['aria-label']==='Pattern source data')[0];
  findAll(render(),node=>node.props['aria-label']==='Pattern interval')[0].props.onChange({target:{value:'1m'}});
  expect(alerts()).toHaveLength(1);expect(sources()).toBeDefined();
  // Same chip instance, another pattern selected (App changes only the id prop).
  props.id='p2';
  expect(alerts()).toHaveLength(0);expect(sources()).toBeUndefined();
  // Back on p1, unchanged: the notice is still relevant.
  props.id='p1';
  expect(alerts()).toHaveLength(1);
  // p1 changes elsewhere (dialog Apply or undo/redo replaced its payload): the old notice is dropped.
  records.p1=placed('p1',6,10);
  expect(alerts()).toHaveLength(0);expect(sources()).toBeUndefined();
  expect(update).not.toHaveBeenCalled();
 });
});
