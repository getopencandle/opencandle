import {beforeEach,expect,it,vi} from 'vitest';
import {ColorControl} from '../../src/ui/ColorControl';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,effects:[] as Array<()=>any>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof initial==='function'?initial():initial;return[hooks.cells[n],(value:any)=>{hooks.writes++;hooks.cells[n]=typeof value==='function'?value(hooks.cells[n]):value;}];},useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useEffect:(effect:()=>any)=>{const n=hooks.cursor++;if(!(n in hooks.cells)){hooks.cells[n]=true;hooks.effects.push(effect);}}};});
function find(tree:any,test:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,test);if(found)return found;}}else if(tree?.props){if(test(tree))return tree;return find(tree.props.children,test);}return null;}
function fixture(){
 let allowed=true;const props:any={label:'Independent line',fieldKey:'line.color',value:'#12345680',ownerToken:{},isCurrent:()=>allowed,onChange:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return ColorControl(props);};
 const field=(label:string)=>find(render(),node=>node.props['aria-label']===label);
 const open=()=>{field('Choose Independent line color').props.onClick();return render();};
 return{props,render,field,open,retire:()=>{allowed=false;}};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.effects=[];});

it('retained Close from an earlier popup cannot close its same-field replacement',()=>{
 const ui=fixture();ui.open();const oldClose=ui.field('Close Independent line color').props.onClick;
 oldClose();ui.open();expect(ui.field('Independent line color')).not.toBeNull();const writes=hooks.writes;
 oldClose();expect(ui.field('Independent line color')).not.toBeNull();expect(hooks.writes).toBe(writes);
});

it('the opening session Close still works after an ordinary same-owner value update',()=>{
 const ui=fixture();ui.open();const sessionClose=ui.field('Close Independent line color').props.onClick;
 ui.props.value='#abcdef80';ui.render();expect(ui.field('Independent line color')).not.toBeNull();
 sessionClose();expect(ui.field('Independent line color')).toBeNull();expect(ui.props.onChange).not.toHaveBeenCalled();
});

it('a parent retired before unmount prevents retained picker Close and Escape state writes',()=>{
 const ui=fixture(),tree=ui.open(),close=ui.field('Close Independent line color').props.onClick;ui.retire();const writes=hooks.writes;
 close();tree.props.onKeyDown({key:'Escape',nativeEvent:{isComposing:false},preventDefault(){},stopPropagation(){}});
 expect(hooks.writes).toBe(writes);expect(ui.props.onChange).not.toHaveBeenCalled();
});

it('a disabled render revokes previously enabled picker publication handlers',()=>{
 const ui=fixture();ui.open();const oldRGB=ui.field('Independent line custom RGB').props.onChange;
 ui.props.disabled=true;ui.render();oldRGB({target:{value:'#abcdef'}});
 expect(ui.props.onChange).not.toHaveBeenCalled();
});

it('retained actions never borrow a replacement field owner or callback',()=>{
 const ui=fixture();ui.open();const rgb=ui.field('Independent line custom RGB').props.onChange,close=ui.field('Close Independent line color').props.onClick;
 const replacement=vi.fn();ui.props.ownerToken={};ui.props.fieldKey='other.color';ui.props.onChange=replacement;ui.render();const writes=hooks.writes;
 rgb({target:{value:'#abcdef'}});close();expect(ui.props.onChange).not.toHaveBeenCalled();expect(replacement).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
});

it('effect replay allows the live picker while unmounted callbacks remain silent',()=>{
 const ui=fixture();ui.render();const setup=hooks.effects[0],cleanup=setup();cleanup();setup();ui.open();const rgb=ui.field('Independent line custom RGB').props.onChange;
 rgb({target:{value:'#abcdef'}});expect(ui.props.onChange).toHaveBeenCalledTimes(1);ui.render();const after=setup();after();const writes=hooks.writes;
 ui.field('Choose Independent line color').props.onClick();expect(hooks.writes).toBe(writes);
});

it('a reentrant parent replacement on publication causes no late picker state write',()=>{
 const ui=fixture();ui.open();ui.props.onChange.mockImplementation(()=>{ui.props.ownerToken={};ui.render();return false;});const rgb=ui.field('Independent line custom RGB').props.onChange,writes=hooks.writes;
 rgb({target:{value:'#abcdef'}});expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
});
