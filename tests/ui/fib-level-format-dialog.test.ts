import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {Modal} from '../../src/ui/Modal';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Controlled component handlers only. These do not establish DOM focus,
// native window input, glyph appearance or packaged interaction evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return{...actual,useState:(initial:any)=>{
  const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;
  return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];
 },useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};
});
const words=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(words).join(''):node?.props?words(node.props.children):'';
function find(node:any,predicate:(value:any)=>boolean):any{
 if(Array.isArray(node)){for(const child of node){const value=find(child,predicate);if(value)return value;}}
 else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;
}
function fixture(format?:unknown,present=false){
 const data=fixtureDataset('GME',4),source=sourceContextForDataset(data);
 let record=createDrawing('fibretracement',{id:'SYNTHETIC format dialog',paneId:'price',anchors:[{time:data.bars[0].time*1000,price:100},{time:data.bars[2].time*1000,price:200}]})!.serialize();
 delete record.props!.lvFibLevelFormat;if(present)record.props!.lvFibLevelFormat=format;
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{const next=patchDrawingEdit(record,data.bars,patch,coordinates,offset),changed=next!==record;record=next;return{accepted:true,changed};});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,data.bars),recordFingerprint:JSON.stringify(record),sourceResolution:data.resolution}),getSourceBars:()=>data.bars,getSourceContext:()=>source,updateDrawingEdit:update};
 const props:any={chart,id:record.id,ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);};
 const field=(path:string)=>find(render(),node=>node.props['data-property']===path);
 const button=(label:string)=>find(render(),node=>node.type==='button'&&words(node)===label);
 const form=()=>find(render(),node=>node.type==='form');
 return{props,source,record:()=>record,update,render,field,button,form};
}
const submit=(form:any,composing=false)=>form.props.onSubmit({preventDefault(){},nativeEvent:{isComposing:composing}});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});

it('stages the format while labels are hidden, applies one property and reopens the accepted choice',()=>{
 const ui=fixture();ui.record().props!.showRatios=false;
 const select=ui.field('lvFibLevelFormat');expect(select.type).toBe('select');expect(select.props.value).toBe('coefficient');
 select.props.onChange({target:{value:'percent'}});expect(ui.update).not.toHaveBeenCalled();expect(ui.record().props!.lvFibLevelFormat).toBeUndefined();
 submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.update.mock.calls[0][1]).toEqual({lvFibLevelFormat:'percent'});
 expect(ui.record().props!.showRatios).toBe(false);expect(ui.record().props!.lvFibLevelFormat).toBe('percent');
 ui.props.ownerToken={};expect(ui.field('lvFibLevelFormat').props.value).toBe('percent');
});

it.each(['Cancel','Escape'])('%s discards the format and retires retained submit callbacks',action=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.field('lvFibLevelFormat').props.onChange({target:{value:'percent'}});const form=ui.form();
 if(action==='Cancel')ui.button('Cancel').props.onClick();else find(ui.render(),(node:any)=>node.type===Modal).props.onClose();
 submit(form);expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toStrictEqual(before);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});

it('Reset restores the opening explicit format and invalidates the earlier changed submission',()=>{
 const ui=fixture('percent',true);ui.field('lvFibLevelFormat').props.onChange({target:{value:'coefficient'}});const stale=ui.form();
 ui.button('Reset').props.onClick();expect(ui.field('lvFibLevelFormat').props.value).toBe('percent');submit(stale);expect(ui.update).not.toHaveBeenCalled();
 submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.props.onChange).not.toHaveBeenCalled();
});

it('rejects an invalid draft without saving, retains correction controls and recovers',()=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.field('lvFibLevelFormat').props.onChange({target:{value:'future-format'}});submit(ui.form());
 expect(ui.record()).toStrictEqual(before);expect(ui.props.onClose).not.toHaveBeenCalled();expect(words(ui.render())).toMatch(/format/i);
 ui.field('lvFibLevelFormat').props.onChange({target:{value:'percent'}});submit(ui.form());expect(ui.record().props!.lvFibLevelFormat).toBe('percent');expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});

it('does not submit during IME composition and rejects a changed source before the native edit',()=>{
 const ui=fixture();ui.field('lvFibLevelFormat').props.onChange({target:{value:'percent'}});submit(ui.form(),true);expect(ui.update).not.toHaveBeenCalled();
 const source=ui.source;ui.props.chart.getSourceContext=()=>({...source,inputIdentity:{}});submit(ui.form());
 expect(ui.update).not.toHaveBeenCalled();expect(words(ui.render())).toContain('source');expect(ui.field('lvFibLevelFormat').props.value).toBe('percent');
});

it('an old select callback cannot overwrite a new owner draft',()=>{
 const ui=fixture(),old=ui.field('lvFibLevelFormat').props.onChange;ui.props.ownerToken={};ui.field('lvFibLevelFormat').props.onChange({target:{value:'percent'}});
 old({target:{value:'coefficient'}});expect(ui.field('lvFibLevelFormat').props.value).toBe('percent');submit(ui.form());expect(ui.record().props!.lvFibLevelFormat).toBe('percent');
});

it('explains an unsupported format while retaining unrelated line-width editing',()=>{
 const ui=fixture('future-format',true);expect(ui.field('lvFibLevelFormat')).toBeNull();expect(words(ui.render())).toMatch(/format.*retained|retained.*format/i);
 ui.field('style.lineWidth').props.onChange({target:{value:'3'}});submit(ui.form());
 expect(ui.record().style.lineWidth).toBe(3);expect(ui.record().props!.lvFibLevelFormat).toBe('future-format');
});
