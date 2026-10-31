import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings} from '../../src/domain/screener-state';
import {fixtureDataset} from '../../src/domain/fixtures';
import {addWatchList,createWatchBook,type WatchBook} from '../../src/watchlists/model';
import {watchFlagOf,watchListMembers} from '../../src/watchlists/membership';

// Actual component callbacks with controlled hooks, following the existing
// screener-watchlist-actions harness. No DOM, native window or paint is tested.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,cleanups:new Set<()=>void>()}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return{...actual,
  useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
  useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
  useMemo:(fn:()=>any)=>fn(),
  useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.length!==old.deps.length||deps.some((value,index)=>!Object.is(value,old.deps[index]))){if(old?.cleanup){hooks.cleanups.delete(old.cleanup);old.cleanup();}const cleanup=fn();hooks.cells[i]={deps,cleanup};if(typeof cleanup==='function')hooks.cleanups.add(cleanup as ()=>void);}}
 };
});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function unmount(){const cleanups=[...hooks.cleanups];hooks.cleanups.clear();for(const cleanup of cleanups)cleanup();}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.cleanups.clear();});
afterEach(()=>{unmount();vi.restoreAllMocks();});
function setup(){
 const props:ScreenerDialogProps={datasets:[fixtureDataset('AAA',2)],settings:createScreenerSettings(),watchBook:addWatchList(createWatchBook([]),'review','Review list'),onClose:vi.fn(),onSelect:vi.fn(),onChange:vi.fn(()=>true),onWatchBook:vi.fn((next:WatchBook,expected:WatchBook)=>{if(props.watchBook!==expected)return false;props.watchBook=next;return true;})};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const button=(name:string)=>{const node=find(render(),row=>row.type==='button'&&(row.props['aria-label']===name||text(row)===name));if(!node)throw Error('Missing screener button: '+name);return node.props;};
 const select=()=>{const row=find(render(),node=>node.type==='tr'&&node.key==='SYNTHETIC:AAA');if(!row)throw Error('Missing synthetic result');row.props.onClick({ctrlKey:false,metaKey:false,shiftKey:false,target:null});};
 const panel=()=>find(render(),node=>node.type==='section'&&node.props.role==='dialog');
 const close=()=>render().props.onClose();
 const status=()=>text(find(render(),node=>node.type==='output'));
 const alert=()=>text(find(render(),node=>node.props.role==='alert'));
 const openAdd=()=>{select();button('Add selected to watchlist').onClick();return button('Add selected to Review list').onClick as ()=>void;};
 return{props,render,button,select,panel,close,status,alert,openAdd};
}
const expectedMember={exchange:'SYNTHETIC',symbol:'AAA',datasetId:'lv-synthetic-v1:AAA',dailyDatasetId:null,synthetic:true};

describe('screener action panel ownership',()=>{
 it('Close retires retained Add and opener callbacks before any new publication or component write',()=>{
  const ui=setup(),apply=ui.openAdd(),opener=ui.button('Add selected to watchlist').onClick,book=ui.props.watchBook;
  ui.close();const writes=hooks.writes;apply();opener();apply();
  expect(ui.props.onClose).toHaveBeenCalledOnce();expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.props.watchBook).toBe(book);expect(hooks.writes).toBe(writes);
 });
 it('unmount retires retained Flag callbacks without relying on the App host guard',()=>{
  const ui=setup();ui.select();ui.button('Flag selected').onClick();const apply=ui.button('Flag Red').onClick,book=ui.props.watchBook;
  unmount();const writes=hooks.writes;apply();
  expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.props.watchBook).toBe(book);expect(watchFlagOf(book!,{exchange:'SYNTHETIC',symbol:'AAA'})).toBeNull();expect(hooks.writes).toBe(writes);
 });
 it('an old Add callback cannot clear a newer Flag panel, and the current Flag action still works',()=>{
  const ui=setup(),old=ui.openAdd();ui.button('Flag selected').onClick();const replacement=ui.panel();
  expect(replacement.props['aria-label']).toBe('Flag selected results');const before=ui.alert();old();
  expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.panel().props['aria-label']).toBe('Flag selected results');expect(ui.alert()).toBe(before);
  ui.button('Flag Red').onClick();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(watchFlagOf(ui.props.watchBook!,{exchange:'SYNTHETIC',symbol:'AAA'})).toBe('red');expect(ui.panel()).toBeNull();
 });
 it('Cancel and a new Add panel give distinct ownership even with the same selected result and target list',()=>{
  const ui=setup(),old=ui.openAdd();ui.button('Cancel').onClick();ui.button('Add selected to watchlist').onClick();const current=ui.button('Add selected to Review list').onClick;
  old();expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.panel().props['aria-label']).toBe('Add selected results to a watchlist');
  current();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(watchListMembers(ui.props.watchBook!,'review')).toEqual([expectedMember]);expect(ui.status()).toContain('Added 1 source to "Review list"');
 });
 it('an accepted host callback may open a new panel without the old action clearing it or overwriting its book',()=>{
  const ui=setup(),old=ui.openAdd();
  vi.mocked(ui.props.onWatchBook!).mockImplementationOnce((next,expected)=>{expect(ui.props.watchBook).toBe(expected);ui.props.watchBook=next;ui.button('Flag selected').onClick();return true;});
  old();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(watchListMembers(ui.props.watchBook!,'review')).toEqual([expectedMember]);expect(ui.panel().props['aria-label']).toBe('Flag selected results');expect(ui.status()).not.toContain('Added 1 source');
  old();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();ui.button('Flag Red').onClick();expect(ui.props.onWatchBook).toHaveBeenCalledTimes(2);expect(watchFlagOf(ui.props.watchBook!,{exchange:'SYNTHETIC',symbol:'AAA'})).toBe('red');
 });
 it('a rejected host callback that replaces the panel cannot publish an old error into that replacement',()=>{
  const ui=setup(),old=ui.openAdd(),book=ui.props.watchBook;
  vi.mocked(ui.props.onWatchBook!).mockImplementationOnce(()=>{ui.button('Flag selected').onClick();return false;});
  old();expect(ui.props.watchBook).toBe(book);expect(ui.panel().props['aria-label']).toBe('Flag selected results');expect(ui.alert()).toBe('');
  ui.button('Flag Red').onClick();expect(ui.props.onWatchBook).toHaveBeenCalledTimes(2);expect(watchFlagOf(ui.props.watchBook!,{exchange:'SYNTHETIC',symbol:'AAA'})).toBe('red');
 });
 it.each(['close','unmount'] as const)('host failure after %s does not write retired component state',retirement=>{
  const ui=setup(),apply=ui.openAdd();let writesAtRetirement=-1;
  vi.mocked(ui.props.onWatchBook!).mockImplementationOnce(()=>{if(retirement==='close')ui.close();else unmount();writesAtRetirement=hooks.writes;throw Error('Retired host rejection');});
  apply();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(hooks.writes).toBe(writesAtRetirement);apply();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(hooks.writes).toBe(writesAtRetirement);
 });
 it('current host rejection preserves the live panel and permits a valid retry',()=>{
  const ui=setup(),apply=ui.openAdd(),book=ui.props.watchBook;vi.mocked(ui.props.onWatchBook!).mockReturnValueOnce(false);
  apply();expect(ui.props.watchBook).toBe(book);expect(ui.panel().props['aria-label']).toBe('Add selected results to a watchlist');expect(ui.alert()).toContain('rejected. Nothing was changed.');
  ui.button('Add selected to Review list').onClick();expect(ui.props.onWatchBook).toHaveBeenCalledTimes(2);expect(watchListMembers(ui.props.watchBook!,'review')).toEqual([expectedMember]);expect(ui.panel()).toBeNull();
 });
});
