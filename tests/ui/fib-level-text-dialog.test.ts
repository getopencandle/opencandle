import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
// Controlled component handlers, not executable, DOM or native clipboard proof.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};});
const words=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(words).join(''):node?.props?words(node.props.children):'';
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function fixture(old='old'){
 const data=fixtureDataset('GME',4),source=sourceContextForDataset(data);let record=createDrawing('fibretracement',{id:'SYNTHETIC label dialog',paneId:'price',anchors:[{time:data.bars[0].time*1000,price:100},{time:data.bars[2].time*1000,price:200}]})!.serialize();(record.props!.levels as any[])[0].label=old;
 const update=vi.fn((_id:string,patch:any,coords:any,offset:any)=>{const next=patchDrawingEdit(record,data.bars,patch,coords,offset),changed=next!==record;record=next;return{accepted:true,changed};});
 const props:any={chart:{getDrawingEditor:()=>({...drawingEditor(record,data.bars),recordFingerprint:JSON.stringify(record)}),getSourceBars:()=>data.bars,getSourceContext:()=>source,updateDrawingEdit:update},id:record.id,ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);},field=()=>find(render(),node=>node.props['data-property']==='levels.0.label'),button=(name:string)=>find(render(),node=>node.type==='button'&&words(node)===name),submit=()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{}});
 button('Levels').props.onClick();return{props,render,field,button,submit,update,record:()=>record};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
it('shows the whole invalid draft and refuses before mutation, then accepts correction',()=>{
 const f=fixture(),long='x'.repeat(51);expect(f.field().props.maxLength).toBeUndefined();f.field().props.onChange({target:{value:long}});expect(f.field().props.value).toBe(long);expect(words(f.render())).toMatch(/50/);f.submit();expect(f.update).not.toHaveBeenCalled();expect(f.props.onClose).not.toHaveBeenCalled();
 f.field().props.onChange({target:{value:'x'.repeat(50)}});f.submit();expect((f.record().props!.levels as any[])[0].label).toBe('x'.repeat(50));expect(f.props.onClose).toHaveBeenCalledTimes(1);
});
it.each(['a\nb','x'.repeat(51)])('refuses pasted %j before native text-input sanitation and retains prior draft',paste=>{
 const f=fixture(),preventDefault=vi.fn();f.field().props.onPaste({preventDefault,clipboardData:{getData:()=>paste},currentTarget:{selectionStart:0,selectionEnd:3}});expect(preventDefault).toHaveBeenCalledTimes(1);expect(f.field().props.value).toBe('old');expect(words(f.render())).toMatch(/one line|50/);expect(f.update).not.toHaveBeenCalled();
});
it('valid paste builds the full selected replacement and stages exactly once',()=>{
 const f=fixture('prefix suffix'),preventDefault=vi.fn();f.field().props.onPaste({preventDefault,clipboardData:{getData:()=>'-'},currentTarget:{selectionStart:6,selectionEnd:7}});expect(preventDefault).toHaveBeenCalledTimes(1);expect(f.field().props.value).toBe('prefix-suffix');f.submit();expect((f.record().props!.levels as any[])[0].label).toBe('prefix-suffix');
});
it('legacy out-of-policy label is disclosed, retained, and does not block unrelated Apply',()=>{
 const old='x'.repeat(51),f=fixture(old);expect(f.field().props.value).toBe(old);expect(words(f.render())).toMatch(/preserved/i);f.button('Style').props.onClick();find(f.render(),node=>node.props['data-property']==='style.lineWidth').props.onChange({target:{value:'4'}});f.submit();expect(f.update).toHaveBeenCalledTimes(1);expect((f.record().props!.levels as any[])[0].label).toBe(old);
});
it.each(['Reset','Cancel'])('%s discards an invalid draft and retires old paste callbacks',action=>{
 const f=fixture();f.field().props.onChange({target:{value:'x'.repeat(51)}});const oldPaste=f.field().props.onPaste;f.button(action).props.onClick();const clipboard=vi.fn(()=> 'changed');oldPaste({preventDefault:vi.fn(),clipboardData:{getData:clipboard},currentTarget:{selectionStart:0,selectionEnd:3}});expect(clipboard).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();if(action==='Reset'){expect(f.field().props.value).toBe('old');f.submit();expect(f.props.onChange).not.toHaveBeenCalled();}
});
it('clipboard callback retirement cannot stage in a replacement session',()=>{
 const f=fixture(),paste=f.field().props.onPaste;paste({preventDefault(){},clipboardData:{getData(){f.props.ownerToken={};f.render();return'new';}},currentTarget:{selectionStart:0,selectionEnd:3}});f.button('Levels').props.onClick();expect(f.field().props.value).toBe('old');expect(f.update).not.toHaveBeenCalled();
});
