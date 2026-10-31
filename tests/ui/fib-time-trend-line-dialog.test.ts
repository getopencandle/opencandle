import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {FIB_TIME_TREND_LINE_FIELD,FIB_TIME_TREND_LINE_PATHS as P} from '../../src/chart/lv-types/fib-time-trend-line';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Fib time trend line dialog component test: the actual DrawingDialog function runs with controlled hooks (same harness as
// tests/ui/drawing-dialog-fact-layout.test.ts); this is not a mounted GUI run. SYNTHETIC records.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.writes++;hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const find=(node:any,predicate:(node:any)=>boolean)=>findAll(node,predicate)[0]??null;
function fixture(props?:Record<string,unknown>){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 const anchors=[{time:bars[0].time*1000,price:100},{time:bars[1].time*1000,price:90},{time:bars[2].time*1000,price:120}];
 let record=createDrawing('trendfibtime',{id:'drawing',paneId:'price',anchors})!.serialize();
 if(props)record={...record,props};
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true};});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update};
 const dialogProps:any={chart,id:'drawing',ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(dialogProps);};
 const field=(path:string)=>find(render(),node=>node.props['data-property']===path);
 const legends=()=>findAll(render(),node=>node.type==='legend').map(node=>text(node));
 const submit=()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
 return{render,field,legends,submit,update,record:()=>record};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});

describe('Trend-based fib time: the Trend line row of the Style tab',()=>{
 it('draws the reference "Trend line" group first with its visible, color, width and style controls',()=>{
  const ui=fixture();expect(ui.legends()[0]).toBe('Trend line');
  for(const path of [P.enabled,P.color,P.width,P.style])expect(ui.field(path),path).not.toBeNull();
  expect(ui.field(P.enabled).props.checked).toBe(true);expect(ui.field(P.color).props.value).toBe('#808080');
  expect(ui.field(P.width).props.value).toBe('2');expect(ui.field(P.style).props.value).toBe('dashed');
 });
 it('Apply writes the edited trend line as one member of the record',()=>{
  const ui=fixture();
  ui.field(P.enabled).props.onChange({target:{checked:false}});ui.field(P.color).props.onChange({target:{value:'#2962FF'}});
  ui.field(P.width).props.onChange({target:{value:'3'}});ui.field(P.style).props.onChange({target:{value:'dotted'}});ui.submit();
  expect(ui.update).toHaveBeenCalledTimes(1);
  expect((ui.record().props as any)[FIB_TIME_TREND_LINE_FIELD]).toEqual({schemaVersion:1,enabled:false,color:'#2962FF',width:3,style:'dotted'});
 });
 it('a record with an unsupported member shows no trend line controls',()=>{
  const base=createDrawing('trendfibtime',{paneId:'price'})!.serialize().props!;
  const ui=fixture({...base,[FIB_TIME_TREND_LINE_FIELD]:{schemaVersion:9}});
  for(const path of [P.enabled,P.color,P.width,P.style])expect(ui.field(path),path).toBeNull();expect(ui.legends()).not.toContain('Trend line');
 });
});
