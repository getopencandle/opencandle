import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';

// When more than one source matches, the chip lists the sources so the user can pick one. The real chip function runs
// with controlled hooks; this is not a mounted GUI run. SYNTHETIC datasets only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];}};});
const {BarsPatternResolutionChip}=await import('../../src/ui/BarsPatternSource');
const {drawingEditor,patchDrawingEdit}=await import('../../src/chart/drawing-port');
const {sourceContextForDataset}=await import('../../src/chart/source-context');
const {LV_BARS_PATTERN}=await import('../../src/chart/lv-types/bars-pattern');
const {readBarsPattern}=await import('../../src/chart/lv-types/bars-pattern-data');
const {clearStagedBarsPatternRequests}=await import('../../src/chart/lv-types/bars-pattern-request');
const {intervalDatasetKey}=await import('../../src/domain/intervals');
const {DAY,D0,day,daily,dailyBars,dataset,minuteBars}=await import('../helpers/barspat-fixture');

const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const projection={width:600,height:400,xOf:(t:number)=>20+(t/1000-D0)/DAY*10,yOf:(p:number)=>300-p,pxToPoint:()=>({time:0,price:0}),paneIdAtY:()=>'price',
 barsInRange:(from:number,to:number)=>dailyBars(0,30).filter(bar=>bar.time*1000>=from&&bar.time*1000<=to).map(bar=>({...bar,time:bar.time*1000}))} as never;
function placed():SerializedDrawing{
 const draft=createDrawing(LV_BARS_PATTERN as never,{id:'pattern',paneId:'price',anchors:[{time:day(5)*1000,price:120},{time:day(9)*1000,price:120}]})!;
 draft.onPlaced(projection);return draft.serialize();
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;clearStagedBarsPatternRequests();});

describe('chip lists the sources when several match (BSR-5)',()=>{
 it('an ambiguous target shows the source select; choosing one applies in one edit; Use available range keeps the source',()=>{
  let record=placed();const d=daily(),bars=d.bars,context=sourceContextForDataset(d);
  const a=dataset('m-a','1m',minuteBars(5,15)),b=dataset('m-b','1m',minuteBars(5,15));
  const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true,changed:true};});
  const chart:any={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record)}),getSourceBars:()=>bars,getSourceContext:()=>context,updateDrawingEdit:update};
  const props={chart,id:'pattern',data:{datasets:[d,a,b]},onChange:vi.fn(),onMessage:vi.fn()};
  const render=()=>{hooks.cursor=0;return BarsPatternResolutionChip(props)!;};
  const resolution=()=>findAll(render(),node=>node.props['aria-label']==='Pattern interval')[0];
  const sources=()=>findAll(render(),node=>node.props['aria-label']==='Pattern source data')[0];
  render();expect(sources()).toBeUndefined();
  resolution().props.onChange({target:{value:'1m'}});
  expect(update).not.toHaveBeenCalled();
  const select=sources();expect(select).toBeDefined();
  const options=findAll(select,node=>node.type==='option').map(node=>[node.props.value,text(node)]);
  expect(options.slice(1).map(row=>row[0])).toEqual([intervalDatasetKey(a),intervalDatasetKey(b)].sort((x,y)=>options.findIndex(r=>r[0]===x)-options.findIndex(r=>r[0]===y)));
  expect(options.some(row=>/SYNTHETIC/.test(row[1]))).toBe(true);
  select.props.onChange({target:{value:intervalDatasetKey(b)}});
  expect(update).toHaveBeenCalledTimes(1);expect(props.onChange).toHaveBeenCalledTimes(1);
  const read=readBarsPattern(record.props);
  expect(read.state==='supported'&&read.member.source).toMatchObject({resolution:'1m',sourceKey:intervalDatasetKey(b)});
  expect(sources()).toBeUndefined();
 });
});
