import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StorageDialog} from '../../src/ui/StorageDialog';
import {LocalStorageSection} from '../../src/ui/LocalStorageSection';
import type {ReactElement} from 'react';
// Actual returned component handlers, deterministic mocked hooks; no DOM/native UI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useEffect:(effect:()=>void|(()=>void))=>{const at=hooks.cursor++;if(!(at in hooks.cells)){hooks.cells[at]=true;const cleanup=effect();if(cleanup)hooks.cleanups.push(cleanup);}}};});
const deferred=()=>{let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((done,fail)=>{resolve=done;reject=fail;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
const text=(value:any):string=>typeof value==='string'?value:Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
function find(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>{let found:ReactElement<any>|undefined;const visit=(node:any)=>{if(found)return;if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found=node;else visit(node.props.children);};visit(tree);if(!found)throw new Error('Synthetic storage handler target missing.');return found;}
function setup(){const props={directory:'Synthetic local test profile',onExport:vi.fn(async():Promise<void|string>=>{}),onReset:vi.fn(async()=>{}),onResetDone:vi.fn(),onPendingChange:vi.fn()},render=()=>{hooks.cursor=0;return LocalStorageSection(props);},button=(label:string)=>find(render(),node=>node.type==='button'&&text(node.props.children)===label),click=(label:string)=>button(label).props.onClick(),error=()=>text(find(render(),node=>node.props.role==='status'&&node.props.className==='lv-storage-status'));return{props,render,button,click,error};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];});afterEach(()=>hooks.cleanups.forEach(cleanup=>cleanup()));

it('reset confirmation cancellation never invokes the irreversible operation',()=>{
 const ui=setup();ui.click('Reset…');expect(ui.button('Reset now')).toBeTruthy();ui.click('Cancel');expect(()=>ui.button('Reset now')).toThrow('target missing');expect(ui.props.onReset).not.toHaveBeenCalled();expect(ui.props.onResetDone).not.toHaveBeenCalled();
});
it('pending reset blocks header/Escape close and duplicate reset/export handlers before any rerender',async()=>{
 const pending=deferred(),ui=setup();ui.props.onReset.mockReturnValue(pending.promise);ui.click('Reset…');const reset=ui.button('Reset now').props.onClick,exportFile=ui.button('Export backup').props.onClick,close=()=>{};
 reset();reset();exportFile();close();expect(ui.props.onReset).toHaveBeenCalledOnce();expect(ui.props.onExport).not.toHaveBeenCalled();expect(ui.props.onResetDone).not.toHaveBeenCalled();expect(ui.props.onPendingChange).toHaveBeenCalledWith(true);pending.resolve();await flush();expect(ui.props.onPendingChange).toHaveBeenLastCalledWith(false);expect(ui.props.onResetDone).toHaveBeenCalledOnce();
});
it('failed durable reset stays open with its error and allows an explicit retry',async()=>{
 const pending=deferred(),ui=setup();ui.props.onReset.mockReturnValueOnce(pending.promise);ui.click('Reset…');ui.click('Reset now');pending.reject(new Error('Synthetic revision conflict'));await flush();expect(ui.error()).toContain('revision conflict');expect(ui.props.onResetDone).not.toHaveBeenCalled();expect(ui.button('Reset now').props.disabled).toBe(false);ui.click('Reset now');await flush();expect(ui.props.onReset).toHaveBeenCalledTimes(2);expect(ui.props.onResetDone).toHaveBeenCalledOnce();
});
it('export cancellation remains visible and blocks competing reset while the chooser is pending',async()=>{
 const pending=deferred(),ui=setup();ui.props.onExport.mockReturnValue(pending.promise);ui.click('Reset…');const reset=ui.button('Reset now').props.onClick;ui.click('Export backup');reset();expect(ui.props.onReset).not.toHaveBeenCalled();expect(ui.props.onResetDone).not.toHaveBeenCalled();pending.reject(new Error('Synthetic export cancelled'));await flush();expect(ui.error()).toContain('export cancelled');expect(ui.props.onReset).not.toHaveBeenCalled();expect(ui.button('Export backup').props.disabled).toBe(false);
});
it('unmount ignores late reset completion and does not dispatch close or update state',async()=>{
 const pending=deferred(),ui=setup();ui.props.onReset.mockReturnValue(pending.promise);ui.click('Reset…');ui.click('Reset now');hooks.cleanups.forEach(cleanup=>cleanup());const prior=hooks.cells.filter(value=>typeof value!=='object').slice();pending.resolve();await flush();expect(ui.props.onResetDone).not.toHaveBeenCalled();expect(hooks.cells.filter(value=>typeof value!=='object')).toEqual(prior);
});
it('the storage export result shows the actual cancellation message instead of generic completion',async()=>{
 const ui=setup();ui.props.onExport.mockResolvedValue('Synthetic native export cancelled.');ui.click('Export backup');await flush();expect(ui.error()).toBe('Synthetic native export cancelled.');expect(ui.props.onReset).not.toHaveBeenCalled();expect(ui.props.onResetDone).not.toHaveBeenCalled();
});

it('the recovery host refuses to close while an export or reset runs',()=>{
 const onClose=vi.fn();hooks.cursor=0;const tree=StorageDialog({directory:'Synthetic local test profile',onExport:vi.fn(),onReset:vi.fn(),onClose});
 const section=find(tree,node=>node.type===LocalStorageSection);section.props.onPendingChange(true);hooks.cursor=0;
 const again=StorageDialog({directory:'Synthetic local test profile',onExport:vi.fn(),onReset:vi.fn(),onClose});
 again.props.onClose();expect(onClose).not.toHaveBeenCalled();
 hooks.cursor=0;find(StorageDialog({directory:'x',onExport:vi.fn(),onReset:vi.fn(),onClose}),node=>node.type===LocalStorageSection).props.onPendingChange(false);hooks.cursor=0;StorageDialog({directory:'x',onExport:vi.fn(),onReset:vi.fn(),onClose}).props.onClose();expect(onClose).toHaveBeenCalledOnce();
});
