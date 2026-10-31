import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistAdvancedDialog,type WatchlistAdvancedDialogProps} from '../../src/ui/WatchlistAdvancedDialog';
import {createWatchAdvancedState} from '../../src/watchlists/advanced';
import {createWatchBook} from '../../src/watchlists/model';
import {fixtureDataset} from '../../src/domain/fixtures';
// Real component handlers under controlled hooks; no DOM, native file chooser or chart GUI proof.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>({...await vi.importActual<any>('react'),
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:any)=>fn(),
 useEffect:(effect:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const cleanup=effect();if(cleanup)hooks.cleanups.push(cleanup);}}
}));
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(done=>{resolve=done;});return{promise,resolve};};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const envelope=JSON.stringify({schemaVersion:1,observations:[],associations:[],fx:[{id:'synthetic-fx',revision:1,currency:'EUR',rate:1.2,valuationDate:'2026-10-14',asOf:1791936000,availableAt:1791936000,source:'Synthetic reviewer fixture',fixture:true}]});
function setup(){const source=fixtureDataset('GME',20),props:WatchlistAdvancedDialogProps={list:createWatchBook(['GME']).lists[0],datasets:[source],calendarDocuments:[],newsDocuments:[],state:createWatchAdvancedState(),now:2000000000,onChange:vi.fn(()=>true),onOpenDataset:vi.fn(()=>({ok:true})),onOpenNotes:vi.fn(),onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return WatchlistAdvancedDialog(props);},button=(label:string)=>{const node=find(render(),node=>node.type==='button'&&text(node)===label);if(!node)throw Error('Missing advanced review '+label);return node.props.onClick;};
 const change=(label:string,value:string)=>find(render(),node=>node.props['aria-label']===label).props.onChange({target:{value}});
 return{props,source,render,button,change,value:(label:string)=>find(render(),node=>node.props['aria-label']===label).props.value};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.cleanups=[];vi.stubGlobal('window',{lv:{importData:vi.fn(),exportData:vi.fn()}});});afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

it('Discard preview revokes its retained replacement action without saving imported data',()=>{
 const ui=setup();ui.change('Advanced import text',envelope);ui.button('Preview analysis import')();const replace=ui.button('Replace draft with preview');ui.button('Discard preview')();replace();ui.button('Apply')();
 expect(vi.mocked(ui.props.onChange).mock.calls[0][0].data.fx).toEqual([]);
});
it('closed dialog handlers cannot start native requests or write retired preview/settings state',async()=>{
 const ui=setup();ui.change('Advanced import text',envelope);ui.button('Preview analysis import')();const replace=ui.button('Replace draft with preview'),parse=ui.button('Preview analysis import'),choose=ui.button('Choose analysis JSON'),exportFile=ui.button('Export analysis JSON');
 const search=find(ui.render(),node=>node.props['aria-label']==='Advanced search').props.onChange;ui.button('Cancel')();const writes=hooks.writes;
 replace();parse();choose();exportFile();search({target:{value:'Late edit'}});await flush();
 expect(window.lv.importData).not.toHaveBeenCalled();expect(window.lv.exportData).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);expect(ui.props.onClose).toHaveBeenCalledOnce();
});
it('reentrant close during rejected Apply causes no error state write to the retired owner',()=>{
 const ui=setup(),close=ui.button('Cancel');let writes=0;vi.mocked(ui.props.onChange).mockImplementationOnce(()=>{close();writes=hooks.writes;return false;});ui.button('Apply')();
 expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.onClose).toHaveBeenCalledOnce();expect(hooks.writes).toBe(writes);
});
it('retained chooser click cannot acquire two simultaneous native dialogs before a render',async()=>{
 const pending=deferred();vi.mocked(window.lv.importData).mockReturnValue(pending.promise);const ui=setup(),choose=ui.button('Choose analysis JSON');choose();choose();expect(window.lv.importData).toHaveBeenCalledOnce();
 pending.resolve({ok:false,error:{code:'CANCELLED',message:'Synthetic cancellation'}});await flush();expect(ui.props.onChange).not.toHaveBeenCalled();
});
it('native import cancellation preserves typed text and draft without accepted publication',async()=>{
 const pending=deferred();vi.mocked(window.lv.importData).mockReturnValue(pending.promise);const ui=setup();ui.change('Advanced import text',envelope);ui.change('Advanced search','GME');ui.button('Choose analysis JSON')();
 pending.resolve({ok:false,error:{code:'CANCELLED',message:'Synthetic cancellation'}});await flush();expect(ui.value('Advanced import text')).toBe(envelope);expect(ui.value('Advanced search')).toBe('GME');expect(ui.props.onChange).not.toHaveBeenCalled();expect(text(ui.render())).toContain('Import cancelled');
});
it('draft edits invalidate pending chart completion and exports without late close or status writes',async()=>{
 const opening=deferred(),exporting=deferred(),ui=setup();vi.mocked(ui.props.onOpenDataset).mockReturnValue(opening.promise);ui.button('Open GME')();ui.change('Advanced search','GME');const writes=hooks.writes;opening.resolve({ok:true});await flush();expect(ui.props.onClose).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
 vi.mocked(window.lv.exportData).mockReturnValue(exporting.promise);ui.button('Export analysis JSON')();ui.change('Advanced search','Edited');const after=hooks.writes;exporting.resolve({ok:true,value:{fileName:'SYNTHETIC-analysis.json',bytes:1}});await flush();expect(hooks.writes).toBe(after);expect(text(ui.render())).not.toContain('Analysis envelope exported locally');
});
it('final effect cleanup ignores late native completion and permits no saved publication',async()=>{
 const pending=deferred();vi.mocked(window.lv.importData).mockReturnValue(pending.promise);const ui=setup();ui.button('Choose analysis JSON')();hooks.cleanups.forEach(cleanup=>cleanup());const writes=hooks.writes;
 pending.resolve({ok:true,value:{text:envelope,fileName:'SYNTHETIC-analysis.json',bytes:envelope.length}});await flush();expect(hooks.writes).toBe(writes);expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.onClose).not.toHaveBeenCalled();
});
