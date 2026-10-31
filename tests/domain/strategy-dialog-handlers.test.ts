import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StrategyDialog,type StrategyDialogProps,type StrategyExecution} from '../../src/ui/StrategyDialog';
import {DEFAULT_STRATEGY_CONFIG,type StrategyConfig} from '../../src/domain/strategy';
import {ReportLoopbackPort} from './strategy-report-test-port';
// Actual component handlers and cooperative model work with controlled hooks.
// This does not exercise DOM, native dialogs, focus or packaged mouse input.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const same=(a:any[]|undefined,b:any[]|undefined)=>Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));
 return {...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(next:any)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:(factory:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;},
  useEffect:(effect:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps)){const cell={deps,cleanup:old?.cleanup};hooks.cells[index]=cell;hooks.effects.push(()=>{cell.cleanup?.();cell.cleanup=effect();});}},
 };
});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function execution(id='synthetic-handler-run'):StrategyExecution{
 const bars=[100,100,120].map((close,index)=>({time:1000+index*60,open:close,high:close,low:close,close,volume:1})),barIds=bars.map((_,index)=>id+':'+index);
 return {bars,barIds,identity:id,source:'Explicit synthetic provider; no real security prices',currency:null,timezone:'UTC',chartType:'standard',result:{plots:[],alerts:[],state:null,diagnostics:[],elapsedMs:0,provisional:false,provenance:{kind:'synthetic',label:'Synthetic handler test'},orders:[{sequence:1,side:'buy',quantity:1,event:{id:barIds[0],revision:1,time:bars[0].time},virtual:true},{sequence:2,side:'sell',quantity:1,event:{id:barIds[1],revision:1,time:bars[1].time},virtual:true}]}};
}
function setup(){
 const change=vi.fn((_config:StrategyConfig)=>true),close=vi.fn(),props:StrategyDialogProps={execution:execution(),config:{...DEFAULT_STRATEGY_CONFIG,commission:{kind:'fixed',value:0},initialCapital:1000},onChange:change,onClose:close};
 const render=()=>{hooks.cursor=0;return StrategyDialog(props);};
 const flush=()=>{const effects=hooks.effects.splice(0);for(const effect of effects)effect();};
 const button=(label:string)=>{const value=find(render(),node=>node.type==='button'&&text(node)===label);if(!value)throw Error('Missing button '+label);return value;};
 const click=(label:string)=>button(label).props.onClick();
 const ready=async()=>{render();flush();for(let i=0;i<80;i++){await new Promise(resolve=>setTimeout(resolve,5));const tree=render();flush();if(!find(tree,node=>node.type==='button'&&text(node)==='Export metrics CSV')?.props.disabled)return;}throw Error('Report did not become ready');};
 return {props,change,close,render,flush,button,click,ready,message:()=>text(find(render(),node=>node.type==='output'&&node.props.role==='alert')),status:()=>text(find(render(),node=>node.type==='output'&&node.props.role==='status'))};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('window',{lv:{exportData:vi.fn()}});vi.stubGlobal('Worker',ReportLoopbackPort);});
afterEach(()=>{for(const cell of hooks.cells)if(cell&&typeof cell==='object'&&typeof cell.cleanup==='function')cell.cleanup();vi.unstubAllGlobals();});
it('retains a rejected settings draft and deep reset never changes the accepted commission',()=>{
 const ui=setup();ui.click('Properties');ui.change.mockReturnValue(false);
 const input=find(ui.render(),node=>node.type==='label'&&text(node).startsWith('Virtual commission value')).props.children[1];input.props.onChange({target:{value:'3'}});
 ui.click('Apply properties');expect(ui.change).toHaveBeenCalledOnce();expect(ui.message()).toMatch(/rejected/);expect(ui.props.config.commission.value).toBe(0);
 expect(find(ui.render(),node=>node.type==='label'&&text(node).startsWith('Virtual commission value')).props.children[1].props.value).toBe(3);
 ui.click('Reset properties');expect(ui.props.config.commission.value).toBe(0);ui.click('Cancel edits');expect(ui.change).toHaveBeenCalledOnce();
});
it('rejects a settings handler after its accepted configuration or exact execution changes',()=>{
 const ui=setup();ui.click('Properties');const apply=ui.button('Apply properties').props.onClick;
 // A retired closure has no authority to write even an error into a newer
 // execution/configuration. Its financial publication assertions are unchanged.
 ui.props.config={...ui.props.config,initialCapital:2000};ui.render();apply();expect(ui.change).not.toHaveBeenCalled();expect(ui.message()).toBe('');
 ui.click('Properties');const next=ui.button('Apply properties').props.onClick;ui.props.execution=execution('new-run');ui.render();next();expect(ui.change).not.toHaveBeenCalled();expect(ui.message()).toBe('');
});
it('exports all trade columns and coalesces repeated clicks before a React render',async()=>{
 const ui=setup();await ui.ready();ui.click('Trades');ui.render();ui.flush();await new Promise(resolve=>setTimeout(resolve,20));ui.click('Columns');
 const checkbox=find(ui.render(),node=>node.type==='label'&&text(node)==='Allocated fees').props.children[0];expect(checkbox.props.checked).toBe(false);
 let resolve!:(value:any)=>void;const exporter=vi.fn((_input:unknown)=>new Promise<any>(done=>{resolve=done;}));window.lv.exportData=exporter;
 const click=ui.button('Export trades CSV').props.onClick;click();click();await vi.waitFor(()=>expect(exporter).toHaveBeenCalledOnce());
 const payload=exporter.mock.calls[0][0] as any;expect(payload.text).toContain('allocated_fees');expect(payload.text).toContain('Explicit synthetic provider');expect(payload.format).toBe('csv');
 resolve({ok:false,error:{code:'CANCELLED',message:'cancelled'}});await new Promise(done=>setTimeout(done,0));expect(ui.status()).toBe('Export cancelled.');expect(ui.message()).toBe('');
});
it('does not publish an old native export success after the execution changes or closes',async()=>{
 const ui=setup();await ui.ready();let resolve!:(value:any)=>void;window.lv.exportData=vi.fn(()=>new Promise<any>(done=>{resolve=done;}));
 ui.click('Export report JSON');await vi.waitFor(()=>expect(window.lv.exportData).toHaveBeenCalledOnce());ui.props.execution=execution('changed-execution');ui.render();resolve({ok:true,value:{fileName:'old.json',bytes:1}});await new Promise(done=>setTimeout(done,0));expect(ui.status()).not.toContain('Saved');
 ui.flush();await ui.ready();ui.click('Export report JSON');await vi.waitFor(()=>expect(window.lv.exportData).toHaveBeenCalledTimes(2));ui.click('Close');resolve({ok:true,value:{fileName:'closed.json',bytes:1}});await new Promise(done=>setTimeout(done,0));expect(ui.close).toHaveBeenCalledOnce();expect(ui.status()).not.toContain('Saved');
});
it('closing while report work is pending prevents that work from publishing a completed report',async()=>{
 const ui=setup();ui.render();ui.flush();ui.click('Close');await new Promise(resolve=>setTimeout(resolve,40));
 expect(ui.close).toHaveBeenCalledOnce();expect(ui.button('Export metrics CSV').props.disabled).toBe(true);
});
it('validates Properties without touching history and rejects a retained Apply after a newer draft edit',()=>{
 const ui=setup();let reads=0;Object.defineProperty(ui.props.execution!.bars[0],'close',{enumerable:true,get(){reads++;throw Error('History was read by Properties');}});
 ui.click('Properties');const oldApply=ui.button('Apply properties').props.onClick;
 const input=find(ui.render(),node=>node.type==='label'&&text(node).startsWith('Virtual commission value')).props.children[1];input.props.onChange({target:{value:'2'}});ui.render();oldApply();expect(ui.change).not.toHaveBeenCalled();expect(ui.message()).toMatch(/changed/);
 ui.click('Apply properties');expect(ui.change).toHaveBeenCalledOnce();expect(ui.change.mock.calls[0][0].commission.value).toBe(2);expect(reads).toBe(0);
});
it('pins Cancel edits to its draft and does not cancel a newly reopened Properties draft',()=>{
 const ui=setup();ui.click('Properties');const cancelled=ui.button('Cancel edits').props.onClick;cancelled();ui.click('Properties');
 find(ui.render(),node=>node.type==='label'&&text(node).startsWith('Virtual commission value')).props.children[1].props.onChange({target:{value:'4'}});ui.render();cancelled();
 expect(ui.button('Apply properties')).toBeTruthy();expect(find(ui.render(),node=>node.type==='label'&&text(node).startsWith('Virtual commission value')).props.children[1].props.value).toBe(4);
});
it('accepts a config once even though its publication intentionally retires the opening parent owner',()=>{
 const ui=setup();let owned=true;ui.props.assertOwner=()=>{if(!owned)throw Error('Old config retired');};
 ui.change.mockImplementation(()=>{owned=false;return true;});ui.click('Properties');const apply=ui.button('Apply properties').props.onClick;apply();
 expect(ui.change).toHaveBeenCalledOnce();expect(ui.status()).toBe('Strategy properties applied.');expect(ui.message()).toBe('');apply();expect(ui.change).toHaveBeenCalledOnce();
});
it('retains rejection and ignores post-publication state writes when the parent closes reentrantly',()=>{
 const ui=setup();ui.click('Properties');const apply=ui.button('Apply properties').props.onClick;const close=ui.button('Close').props.onClick;
 ui.change.mockImplementation(()=>{close();return false;});apply();expect(ui.close).toHaveBeenCalledOnce();expect(ui.status()).not.toContain('applied');expect(ui.message()).toBe('');
 const previous=ui.change.mock.calls.length;apply();expect(ui.change).toHaveBeenCalledTimes(previous);
});
