import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {createIndicatorTemplates,saveIndicatorTemplate,type IndicatorTemplateContent} from '../../src/ui/indicator-templates';

// Execute actual component handlers with deterministic hooks. This is neither a
// React DOM mount nor native/executable GUI evidence; effects/focus are excluded.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return {...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return [hooks.cells[index],(next:any)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>void|(()=>void))=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;const cleanup=effect();if(cleanup)hooks.cleanups.push(cleanup);}}};
});
const content:IndicatorTemplateContent={indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
function childrenText(value:any):string{return typeof value==='string'||typeof value==='number'?String(value):Array.isArray(value)?value.map(childrenText).join(''):value?.props?childrenText(value.props.children):'';}
function find(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>{
 let found:ReactElement<any>|undefined;const walk=(node:any):void=>{if(found)return;if(Array.isArray(node)){node.forEach(walk);return;}if(!node?.props)return;if(match(node)){found=node;return;}walk(node.props.children);};walk(tree);if(!found)throw new Error('Synthetic handler target not found.');return found;
}
function setup(native:Record<string,any>={}){
 vi.stubGlobal('window',{lv:native});
 const props={library:saveIndicatorTemplate(createIndicatorTemplates(),'Existing',content,()=> 'existing'),onLibraryChange:vi.fn(),capture:()=>({content,assertCurrent:vi.fn()}),previewApply:vi.fn(),onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return IndicatorTemplatesDialog(props);};
 const button=(text:string)=>find(render(),node=>node.type==='button'&&childrenText(node.props.children)===text);
 const click=(text:string)=>button(text).props.onClick();
 const jsonInput=()=>find(render(),node=>node.type==='textarea');
 const enterTransfer=()=>click('Import / export');
 const status=()=>childrenText(find(render(),node=>node.props.role==='status').props.children);
 return {props,render,click,button,jsonInput,enterTransfer,status};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

it('native chooser cancellation retains pasted JSON and never changes the library',async()=>{
 const pending=deferred<any>(),native={importData:vi.fn(()=>pending.promise)},ui=setup(native);ui.enterTransfer();ui.jsonInput().props.onChange({target:{value:'original pasted draft'}});ui.click('Choose template JSON');
 expect(native.importData).toHaveBeenCalledWith({kind:'indicator-templates'});pending.resolve({ok:false,error:{code:'CANCELLED',message:'Import cancelled.'}});await flush();
 expect(ui.jsonInput().props.value).toBe('original pasted draft');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();expect(ui.status()).toContain('Import cancelled.');
});

it('a newer chooser read supersedes an older native file read, including its loading cleanup',async()=>{
 const first=deferred<any>(),second=deferred<any>(),native={importData:vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)},ui=setup(native);ui.enterTransfer();
 const incoming=saveIndicatorTemplate(createIndicatorTemplates(),'Incoming',content,()=> 'incoming');ui.jsonInput().props.onChange({target:{value:JSON.stringify(incoming)}});ui.click('Choose template JSON');
 ui.click('Choose template JSON');first.resolve({ok:true,value:{text:'stale native text'}});await flush();
 expect(ui.jsonInput().props.value).toBe(JSON.stringify(incoming));expect(ui.status()).toContain('Reading template');expect(ui.button('Choose template JSON').props.disabled).toBe(true);
 second.resolve({ok:false,error:{code:'CANCELLED',message:'New chooser cancelled.'}});await flush();expect(ui.jsonInput().props.value).toBe(JSON.stringify(incoming));expect(ui.props.onLibraryChange).not.toHaveBeenCalled();
});

it('an older chart application in preparation is dropped by a later deletion (DRAW-EDIT-FIX: edits apply at once)',async()=>{
 const pending=deferred<any>(),ui=setup(),apply=vi.fn();ui.props.previewApply.mockReturnValue(pending.promise);ui.click('Existing · 0 indicators · 0 scripts');ui.click('Apply');
 ui.click('Delete');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();ui.click('Delete template');expect(ui.props.onLibraryChange).toHaveBeenCalledOnce();
 pending.resolve({lines:['OLD preview'],apply});await flush();expect(apply).not.toHaveBeenCalled();expect(ui.status()).toContain('Template deleted.');
});

it('close and unmount ignore late native completions',async()=>{
 const closePending=deferred<any>(),ui=setup({importData:()=>closePending.promise});ui.enterTransfer();ui.jsonInput().props.onChange({target:{value:'keep'}});ui.click('Choose template JSON');ui.click('Close');
 closePending.resolve({ok:true,value:{text:'late close data'}});await flush();expect(ui.props.onClose).toHaveBeenCalledOnce();expect(ui.jsonInput().props.value).toBe('keep');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();
 const unmountPending=deferred<any>();vi.stubGlobal('window',{lv:{importData:()=>unmountPending.promise}});ui.click('Choose template JSON');hooks.cleanups.forEach(cleanup=>cleanup());const before=hooks.cells.filter(cell=>typeof cell!=='object').slice();
 unmountPending.resolve({ok:true,value:{text:'late unmount data'}});await flush();expect(hooks.cells.filter(cell=>typeof cell!=='object')).toEqual(before);
});

it('an older export status cannot overwrite a newer user draft status',async()=>{
 const pending=deferred<any>(),native={exportData:vi.fn((_input:{text:string;suggestedName:string;format:'json'})=>pending.promise)},ui=setup(native);ui.enterTransfer();ui.click('Export all templates');const sent=native.exportData.mock.calls[0][0];expect(sent.format).toBe('json');expect(JSON.parse(sent.text)).toEqual(ui.props.library);
 ui.jsonInput().props.onChange({target:{value:'new draft'}});pending.resolve({ok:true,value:{fileName:'templates.json',bytes:1}});await flush();expect(ui.jsonInput().props.value).toBe('new draft');expect(ui.status()).not.toContain('exported');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();
});

it('a pending chart commit blocks close and repeated confirmation until its actual promise settles',async()=>{
 const prepare=deferred<any>(),commit=deferred<void>(),apply=vi.fn(()=>commit.promise),ui=setup();ui.props.previewApply.mockReturnValue(prepare.promise);ui.click('Existing · 0 indicators · 0 scripts');ui.click('Apply');
 prepare.resolve({lines:['Original synthetic commit preview'],apply});await flush();ui.click('Close');ui.click('Apply');
 expect(apply).toHaveBeenCalledOnce();expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.status()).toContain('The chart is busy');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();
 commit.resolve();await flush();expect(ui.status()).toContain('Template applied.');ui.click('Close');expect(ui.props.onClose).toHaveBeenCalledOnce();
});
it('committed chart publication errors stay visible and Apply ran once',async()=>{
 const prepare=deferred<any>(),commit=deferred<{publicationErrors:string[]}>(),apply=vi.fn(()=>commit.promise),ui=setup();ui.props.previewApply.mockReturnValue(prepare.promise);ui.click('Existing · 0 indicators · 0 scripts');ui.click('Apply');prepare.resolve({lines:['Synthetic commit preview'],apply});await flush();
 commit.resolve({publicationErrors:['Synthetic second chart publication failure']});await flush();expect(ui.status()).toContain('was applied');expect(ui.status()).toContain('could not finish updating');expect(ui.status()).toContain('Synthetic second chart publication failure');expect(ui.status()).toContain('Reload');expect(ui.props.onLibraryChange).not.toHaveBeenCalled();expect(apply).toHaveBeenCalledOnce();
});
