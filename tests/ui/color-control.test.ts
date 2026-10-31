import {beforeEach,expect,it,vi} from 'vitest';
import {ColorControl} from '../../src/ui/ColorControl';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;hooks.effects.push(effect);}}};});
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const n of tree){const found=find(n,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
const text=(tree:any):string=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):'';
function fixture(value='#12345680',automatic=false){
 const props:any={label:'Line',fieldKey:'style.lineColor',value,automatic,ownerToken:{},onChange:vi.fn((next:string)=>{props.value=next;return true;})};
 const render=()=>{hooks.cursor=0;return ColorControl(props);},control=(label:string)=>find(render(),n=>n.props['aria-label']===label),open=()=>control('Choose Line color').props.onClick();
 return{props,render,control,open};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});
it('opening and closing preserve exact source color without a parent publication',()=>{
 const ui=fixture();ui.open();expect(ui.control('Line color opacity').props.value).toBe(String(128/255*100));ui.control('Close Line color').props.onClick();expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.value).toBe('#12345680');
});
it('custom RGB retains intrinsic alpha and opaque slider edits preserve fractional channels',()=>{
 const ui=fixture();ui.open();ui.control('Line custom RGB').props.onChange({target:{value:'#ff0000'}});expect(ui.props.onChange).toHaveBeenLastCalledWith('rgba(255,0,0,0.5019607843137255)');
 ui.props.value='rgba(1.25,2.5,3.75,0.4)';ui.control('Line color opacity slider').props.onChange({target:{value:'25'}});expect(ui.props.onChange).toHaveBeenLastCalledWith('rgba(1.25,2.5,3.75,0.25)');
});
it('invalid opacity stays local and can be corrected without publishing fabricated zero',()=>{
 const ui=fixture('red');ui.open();ui.control('Line color opacity').props.onChange({target:{value:''}});expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.control('Line color opacity').props.value).toBe('');expect(text(ui.render())).toContain('Enter opacity');
 ui.control('Line color opacity').props.onChange({target:{value:'40'}});expect(ui.props.value).toBe('rgba(255,0,0,0.4)');expect(text(ui.render())).not.toContain('Enter opacity');
});
it('automatic remains empty until explicit palette selection, and returns through its own action',()=>{
 const ui=fixture('',true);ui.open();expect(ui.control('Line custom RGB').props.disabled).toBe(true);expect(ui.props.onChange).not.toHaveBeenCalled();ui.control('Use #3d8edb').props.onClick();expect(ui.props.value).toBe('rgba(61,142,219,1)');
 find(ui.render(),n=>n.type==='button'&&text(n)==='Automatic').props.onClick();expect(ui.props.value).toBe('');
});
it('invalid immediate text remains a rejected draft and a later palette change recovers',()=>{
 const ui=fixture('red');ui.props.onChange.mockReturnValueOnce(false);ui.control('Line').props.onChange({target:{value:'invalid'}});expect(ui.props.value).toBe('red');expect(ui.control('Line').props.value).toBe('invalid');ui.open();expect(text(ui.render())).toContain('replace this value');ui.control('Use #ffffff').props.onClick();expect(ui.props.value).toBe('rgba(255,255,255,1)');
});
it('old owner, field, disabled and callback snapshots cannot publish after replacement',()=>{
 for(const replacement of [{ownerToken:{}},{fieldKey:'text.color'},{disabled:true},{onChange:vi.fn()}]){
  hooks.cells=[];hooks.cursor=0;hooks.effects=[];const ui=fixture();ui.open();const old=ui.control('Use #ffffff').props.onClick,original=ui.props.onChange;Object.assign(ui.props,replacement);ui.render();old();expect(original).not.toHaveBeenCalled();if(replacement.onChange)expect(replacement.onChange).not.toHaveBeenCalled();
 }
});
it('parent retirement during publication cannot write an error into the replacement field',()=>{
 const ui=fixture();ui.open();ui.props.onChange=vi.fn(()=>{ui.props.ownerToken={};ui.render();throw Error('retired callback');});const action=ui.control('Use #ffffff').props.onClick,writes=hooks.writes;action();expect(hooks.writes).toBe(writes);expect(text(ui.render())).not.toContain('retired callback');
});
it('Escape closes only the picker and Enter cannot submit the parent',()=>{
 const ui=fixture();ui.open();const preventDefault=vi.fn(),stopPropagation=vi.fn();ui.render().props.onKeyDown({key:'Enter',nativeEvent:{isComposing:true},preventDefault,stopPropagation});expect(preventDefault).toHaveBeenCalledOnce();expect(stopPropagation).toHaveBeenCalledOnce();expect(ui.control('Line color')).not.toBeNull();
 ui.render().props.onKeyDown({key:'Escape',nativeEvent:{isComposing:false},preventDefault,stopPropagation});expect(ui.control('Line color')).toBeNull();expect(ui.props.onChange).not.toHaveBeenCalled();
});
it('StrictMode effect replay preserves liveness and actual unmount retires retained actions',()=>{
 const ui=fixture();ui.render();const setup=hooks.effects[0],cleanup=setup() as ()=>void;cleanup();const unmount=setup() as ()=>void;ui.open();const old=ui.control('Use #ffffff').props.onClick;unmount();const writes=hooks.writes;old();expect(hooks.writes).toBe(writes);expect(ui.props.onChange).not.toHaveBeenCalled();
});
