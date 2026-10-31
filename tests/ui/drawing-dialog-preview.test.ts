import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createDrawingPreview} from '../../src/chart/drawing-preview';
import {createDrawingVisibilityProjection} from '../../src/chart/drawing-visibility';
import {defaultTemplateValues,DEFAULT_TEMPLATE_ID} from '../../src/ui/drawing-dialog-model';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function fixture(){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 let record=createDrawing('trendline',{id:'line',paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120}],style:{lineColor:'#123456',lineWidth:4,lineStyle:'solid'}})!.serialize();
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true};});
 const previewDrawingEdit=vi.fn(),clearDrawingPreview=vi.fn();
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update,previewDrawingEdit,clearDrawingPreview,drawingManager:{state:()=>({templates:[]})}};
 const props:any={chart,id:'line',ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);};
 const field=(path:string)=>find(render(),node=>node.props?.['data-property']===path);
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label);
 const template=()=>find(render(),node=>node.type==='select'&&node.props['aria-label']==='Template');
 const submit=()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
 return{props,render,field,button,template,submit,update,previewDrawingEdit,clearDrawingPreview,record:()=>record};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

describe('drawing settings live preview (gap 21)',()=>{
 it('each draft change previews on the chart without saving',()=>{
  const ui=fixture();ui.render();
  ui.field('style.lineWidth').props.onChange({target:{value:'1'}});
  expect(ui.previewDrawingEdit).toHaveBeenLastCalledWith('line',{'style.lineWidth':1},undefined,undefined);
  expect(ui.update).not.toHaveBeenCalled();
 });
 it('Cancel clears the preview, saves nothing and closes',()=>{
  const ui=fixture();ui.render();const before=structuredClone(ui.record());
  ui.field('style.lineWidth').props.onChange({target:{value:'1'}});
  ui.button('Cancel').props.onClick();
  expect(ui.clearDrawingPreview).toHaveBeenCalledWith('line');expect(ui.update).not.toHaveBeenCalled();
  expect(ui.props.onClose).toHaveBeenCalled();expect(ui.record()).toEqual(before);
 });
 it('Apply clears the preview before committing the same values once',()=>{
  const ui=fixture();ui.render();
  ui.field('style.lineWidth').props.onChange({target:{value:'1'}});
  ui.submit();
  expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.update.mock.calls[0][1]).toEqual({'style.lineWidth':1});
  expect(ui.clearDrawingPreview.mock.invocationCallOrder[0]).toBeLessThan(ui.update.mock.invocationCallOrder[0]);
 });
 it('unmounting the dialog clears the preview',()=>{
  const ui=fixture();ui.render();
  for(const effect of hooks.effects){const cleanup=effect();if(typeof cleanup==='function')cleanup();}
  expect(ui.clearDrawingPreview).toHaveBeenCalledWith('line');
 });
 it('the Template list offers Default, which puts the factory settings in the draft and previews them',()=>{
  const ui=fixture();ui.render();
  expect(text(ui.template())).toContain('Default');
  ui.template().props.onChange({target:{value:DEFAULT_TEMPLATE_ID}});
  const factory=defaultTemplateValues('trendline')!;
  expect(factory['style.lineColor']).toBe('#2962FF');expect(factory['style.lineWidth']).toBe(2);
  expect(ui.field('style.lineWidth').props.value).toBe('2');
  expect(ui.previewDrawingEdit).toHaveBeenLastCalledWith('line',expect.objectContaining({'style.lineColor':'#2962FF','style.lineWidth':2}),undefined,undefined);
  ui.submit();expect(ui.record().style).toMatchObject({lineColor:'#2962FF',lineWidth:2});
 });
 it('Default keeps the drawing text, lock, visibility and a position side and prices',()=>{
  const values=defaultTemplateValues('trendline')!;
  for(const path of ['text.value','locked','visible'])expect(Object.hasOwn(values,path)).toBe(false);
  expect(values['style.extendLeft']).toBe(false);
  expect(defaultTemplateValues('no-such-tool')).toBeNull();
 });
});

describe('drawing preview on the renderer copy only',()=>{
 const record=()=>createDrawing('trendline',{id:'line',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:120}],style:{lineColor:'#123456',lineWidth:4,lineStyle:'solid'}})!.serialize() as unknown as Record<string,unknown>;
 it('the projection paints the preview, canonical rows never change, and clear restores the stored look',()=>{
  const canonical=[record()],pushed:Record<string,unknown>[][]=[];
  const preview=createDrawingPreview({read:()=>canonical,bars:()=>[],changed:()=>projection.refresh()});
  const projection=createDrawingVisibilityProjection({read:()=>canonical,resolution:()=>'1D',push:rows=>pushed.push(structuredClone(rows)),preview:row=>preview.apply(row)});
  projection.sync(structuredClone(canonical));
  expect((pushed.at(-1)![0].style as any).lineWidth).toBe(4);
  preview.show('line',{'style.lineWidth':1});
  expect((pushed.at(-1)![0].style as any).lineWidth).toBe(1);
  expect((canonical[0].style as any).lineWidth).toBe(4);
  expect(projection.canonicalNativeRows(structuredClone(canonical))[0]).toEqual(canonical[0]);
  preview.clear('line');
  expect((pushed.at(-1)![0].style as any).lineWidth).toBe(4);expect(preview.has('line')).toBe(false);
 });
 it('an invalid draft throws and keeps the previous preview',()=>{
  const canonical=[record()];let changes=0;
  const preview=createDrawingPreview({read:()=>canonical,bars:()=>[],changed:()=>{changes++;}});
  preview.show('line',{'style.lineWidth':1});expect(changes).toBe(1);
  expect(()=>preview.show('missing',{})).toThrow();
  expect(preview.apply(canonical[0]).style).toMatchObject({lineWidth:1});
 });
});
