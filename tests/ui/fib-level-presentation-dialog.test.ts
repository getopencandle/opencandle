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
function fixture(background?:unknown,text?:unknown,explicit=false){
 const data=fixtureDataset('GME',4),source=sourceContextForDataset(data);
 let record=createDrawing('fibretracement',{id:'SYNTHETIC presentation dialog',paneId:'price',anchors:[{time:data.bars[0].time*1000,price:100},{time:data.bars[2].time*1000,price:200}]})!.serialize();
 delete record.props!.lvFibBackground;delete record.props!.lvFibText;
 if(explicit){record.props!.lvFibBackground=background;record.props!.lvFibText=text;}
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

const bg='lvFibBackground',txt='lvFibText';

it('stages all three controls, keeps dormant text position, then applies and reopens',()=>{
 const ui=fixture();(ui.record().props as Record<string,any>).levels[0].label='SYNTHETIC retained text';
 ui.field(bg+'.opacity').props.onChange({target:{value:'42.5'}});
 ui.field(txt+'.enabled').props.onChange({target:{checked:false}});
 ui.field(txt+'.position').props.onChange({target:{value:'right'}});
 expect(ui.update).not.toHaveBeenCalled();expect(Object.hasOwn((ui.record().props as Record<string,any>),bg)).toBe(false);
 submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);
 expect(ui.update.mock.calls[0][1]).toEqual({[bg+'.opacity']:42.5,[txt+'.enabled']:false,[txt+'.position']:'right'});
 expect((ui.record().props as Record<string,any>)[bg]).toEqual({schemaVersion:1,opacity:42.5});expect((ui.record().props as Record<string,any>)[txt]).toEqual({schemaVersion:1,enabled:false,position:'right'});
 expect((ui.record().props as Record<string,any>).levels[0].label).toBe('SYNTHETIC retained text');
 ui.props.ownerToken={};expect(ui.field(bg+'.opacity').props.value).toBe('42.5');expect(ui.field(txt+'.enabled').props.checked).toBe(false);expect(ui.field(txt+'.position').props.value).toBe('right');
});

it.each(['Cancel','Escape'])('%s discards all presentation changes and retires submission',action=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.field(bg+'.opacity').props.onChange({target:{value:'100'}});ui.field(txt+'.position').props.onChange({target:{value:'left'}});const stale=ui.form();
 if(action==='Cancel')ui.button('Cancel').props.onClick();else find(ui.render(),(node:any)=>node.type===Modal).props.onClose();submit(stale);
 expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toStrictEqual(before);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});

it('Reset restores the opening draft without writing or creating a meaningful change',()=>{
 const ui=fixture({schemaVersion:1,opacity:15},{schemaVersion:1,enabled:false,position:'left'},true);
 ui.field(bg+'.opacity').props.onChange({target:{value:'90'}});ui.field(txt+'.enabled').props.onChange({target:{checked:true}});ui.field(txt+'.position').props.onChange({target:{value:'right'}});const stale=ui.form();
 ui.button('Reset').props.onClick();expect(ui.field(bg+'.opacity').props.value).toBe('15');expect(ui.field(txt+'.position').props.value).toBe('left');expect(ui.field(txt+'.enabled').props.checked).toBe(false);
 submit(stale);expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.props.onChange).not.toHaveBeenCalled();
});

it.each(['','-1','100.1','Infinity'])('rejects invalid opacity draft %j and permits correction',value=>{
 const ui=fixture(),before=structuredClone(ui.record());ui.field(bg+'.opacity').props.onChange({target:{value}});submit(ui.form());
 expect(ui.record()).toStrictEqual(before);expect(ui.props.onClose).not.toHaveBeenCalled();expect(words(ui.render())).toMatch(/opacity|finite|invalid/i);
 ui.field(bg+'.opacity').props.onChange({target:{value:'0'}});submit(ui.form());expect((ui.record().props as Record<string,any>)[bg]).toEqual({schemaVersion:1,opacity:0});expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});

it.each(['left','center','right'])('offers exact LV custom-text position %s without affecting automatic labels',position=>{
 const ui=fixture();const select=ui.field(txt+'.position');expect(select.type).toBe('select');expect(select.props.children.map((option:any)=>option.props.value)).toEqual(['left','center','right']);
 select.props.onChange({target:{value:position}});submit(ui.form());expect((ui.record().props as Record<string,any>).labelSide).toBe('left');expect((ui.record().props as Record<string,any>).showRatios).toBe(true);
 if(position==='center')expect(Object.hasOwn((ui.record().props as Record<string,any>),txt)).toBe(false);else expect((ui.record().props as Record<string,any>)[txt]).toEqual({schemaVersion:1,enabled:true,position});
});

it('unknown background disables only its controls and leaves text editable',()=>{
 const ui=fixture(undefined,{schemaVersion:1,enabled:true,position:'center'},true);
 expect(ui.field(bg+'.opacity')).toBeNull();expect(words(ui.render())).toMatch(/background.*retained/i);
 ui.field(txt+'.enabled').props.onChange({target:{checked:false}});submit(ui.form());expect(Object.hasOwn((ui.record().props as Record<string,any>),bg)).toBe(true);expect((ui.record().props as Record<string,any>)[bg]).toBeUndefined();expect((ui.record().props as Record<string,any>)[txt].enabled).toBe(false);
});

it('unknown custom text disables both text controls while background remains editable',()=>{
 const unknown={schemaVersion:1,enabled:false,position:'future',extra:undefined};const ui=fixture({schemaVersion:1,opacity:6},unknown,true);
 expect(ui.field(txt+'.enabled')).toBeNull();expect(ui.field(txt+'.position')).toBeNull();expect(words(ui.render())).toMatch(/custom-text.*retained/i);
 ui.field(bg+'.opacity').props.onChange({target:{value:'50'}});submit(ui.form());expect((ui.record().props as Record<string,any>)[txt]).toStrictEqual(unknown);expect((ui.record().props as Record<string,any>)[bg].opacity).toBe(50);
});

it('IME submit does not publish a staged presentation setting',()=>{
 const ui=fixture();ui.field(bg+'.opacity').props.onChange({target:{value:'10'}});submit(ui.form(),true);expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect((ui.record().props as Record<string,any>)[bg].opacity).toBe(10);
});
