import {beforeEach,expect,it,vi} from 'vitest';
import {LayoutLibraryDialog} from '../../src/ui/LayoutLibraryDialog';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {duplicateSavedLayout,renameSavedLayout} from '../../src/ui/layout-library';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.writes++;hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function fixture(){const state=createInitialWorkspace();let index=0;const duplicate=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Target',100,()=> 'dialog-'+(++index));duplicate.library.autosave=false;const action=vi.fn(async()=>{}),close=vi.fn(),token={};const props={library:duplicate.library,grid:state.grid!,ownerToken:token,onAction:action,onClose:close};const render=()=>{hooks.cursor=0;return LayoutLibraryDialog(props);};const button=(name:string)=>find(render(),node=>node.type==='button'&&(node.props['aria-label']===name||text(node)===name));return{props,render,button,action,close};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});
it('cancels dirty-switch authority synchronously before retained Discard can open',async()=>{
 const ui=fixture();ui.button('Open Target').props.onClick();const discarded=ui.button('Discard and open').props.onClick;ui.button('Cancel').props.onClick();discarded();await Promise.resolve();expect(ui.action).not.toHaveBeenCalled();
});
it('cancels inactive deletion authority before a retained Delete handler publishes',async()=>{
 const ui=fixture();ui.button('Delete Target').props.onClick();const remove=ui.button('Delete layout').props.onClick;ui.button('Cancel').props.onClick();remove();await Promise.resolve();expect(ui.action).not.toHaveBeenCalled();
});
it('rejects a retained naming submit after synchronous draft change before rerender',async()=>{
 const ui=fixture();ui.button('Rename layout').props.onClick();const opening=ui.render(),submit=find(opening,node=>node.type==='form').props.onSubmit,input=find(opening,node=>node.type==='input'&&node.props.maxLength===200);
 input.props.onChange({target:{value:'A newer name'}});submit({preventDefault(){},nativeEvent:{}});await Promise.resolve();expect(ui.action).not.toHaveBeenCalled();
});
it('retires commands on close without waiting for effect cleanup and closes only once',async()=>{
 const ui=fixture(),opening=ui.render(),save=find(opening,node=>node.type==='button'&&text(node)==='Save layout').props.onClick,close=opening.props.onClose;
 close();close();save();await Promise.resolve();expect(ui.close).toHaveBeenCalledOnce();expect(ui.action).not.toHaveBeenCalled();
});
it('ignores a replaced-owner async result rather than writing into the newer dialog',async()=>{
 const ui=fixture();let reject!:(error:Error)=>void;ui.props.onAction=vi.fn(()=>new Promise<void>((_,fail)=>{reject=fail;}));ui.button('Save layout').props.onClick();ui.props.ownerToken={};ui.render();const writes=hooks.writes;reject(Error('Old receipt'));for(let index=0;index<4;index++)await Promise.resolve();expect(hooks.writes).toBe(writes);
});
it('retires the old naming form when its accepted rename publishes a replacement workspace owner',async()=>{
 const ui=fixture();ui.props.onAction=vi.fn(async()=>{const accepted=renameSavedLayout(ui.props.library,ui.props.grid,ui.props.library.activeId,'Accepted name');ui.props.library=accepted.library;ui.props.grid=accepted.grid;ui.props.ownerToken={};ui.render();});
 ui.button('Rename layout').props.onClick();const submit=find(ui.render(),node=>node.type==='form').props.onSubmit;submit({preventDefault(){},nativeEvent:{}});for(let index=0;index<4;index++)await Promise.resolve();
 expect(find(ui.render(),node=>node.type==='form')).toBeNull();expect(ui.props.library.entries[0].name).toBe('Accepted name');
});
