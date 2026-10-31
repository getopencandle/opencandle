import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {switchRequest} from '../../src/ui/symbol-search';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {chooseIntervalSource} from '../../src/domain/intervals';
// LIVE-FREEZE hazards 1 and 2. (1) While the routine background autosave held the
// storage lock, App `commit` refused a symbol or interval switch with only a status message, so the Symbol box and the
// interval menu looked dead. A switch requested during the write is now queued and applied once the write ends.
// (2) `activeCell` (MultiChartGrid onReady/active effects, e.g. a live re-ready) overwrote typed Symbol text before Enter.
// Typed text now survives those updates until it is committed (Enter) or cancelled (Escape). Actual App closures under
// controlled React hooks and an in-memory SYNTHETIC bridge; not DOM dispatch or executable UI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};

async function setup(coordinator:any={suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()}))}){
 let revision=4;
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic autosave profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn(()=>vi.fn())};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 /** Runs the effects React would run after the latest commit (those whose dependencies changed). */
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 // The header symbol is a button now: "type" remembers the symbol, "enter" picks it in the Symbol search like a user would.
 let typed='';
 const symbolBox=()=>{const found=find(render(),node=>node.type===HeaderSymbolButton);if(!found)throw Error('Missing header symbol button');return{props:{value:found.props.symbol}};};
 const type=(value:string)=>{typed=value;};
 const enter=()=>{find(render(),node=>node.type===HeaderSymbolButton).props.onOpen('','toolbar');const dialog=find(render(),node=>node.type===SymbolSearchDialog).props;const row=dialog.candidates.find((item:any)=>item.symbol===typed.toUpperCase()&&item.synthetic);if(!row)throw Error('No candidate '+typed);dialog.onSelect(switchRequest(row,'entry'));render();};
 const activeRow=()=>{const state=grid().state;return state.layout.cells.find((row:any)=>row.id===state.layout.activeCellId);};
 // Settle the first post-load autosave so the next save is the routine one under test.
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 /** Starts the routine background autosave and leaves its write in flight. */
 const startBackgroundSave=async()=>{const pending=deferred();bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
  const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background='#13579b';expect(grid().onChange(next)).toBe(true);effects();
  await vi.advanceTimersByTimeAsync(1300);await flush();expect(bridge.saveWorkspace).toHaveBeenCalledOnce();
  return async()=>{pending.resolve({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:02Z'}});await flush();effects();};};
 const status=()=>text(find(render(),node=>node.type==='footer'&&node.props.className==='statusbar'));
 return{bridge,render,grid,effects,symbolBox,type,enter,activeRow,startBackgroundSave,status};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const QUEUED='once the background save finishes';

it('LIVE-FREEZE 1: a Symbol entered during the background autosave is queued, not refused, and applied when the write ends',async()=>{
 const ui=await setup();expect(ui.activeRow().symbol).toBe('GME');
 const finishSave=await ui.startBackgroundSave();
 ui.type('aapl');ui.enter();
 expect(ui.status(),'queued, not refused, while the save writes').toContain(QUEUED);
 expect(ui.activeRow().symbol,'not applied mid-write').toBe('GME');
 expect(ui.symbolBox().props.value,'the header keeps the chart symbol while queued').toBe('GME');
 await finishSave();
 expect(ui.activeRow().symbol).toBe('AAPL');expect(ui.symbolBox().props.value).toBe('AAPL');
 expect(ui.status()).not.toContain(QUEUED);
});

it('LIVE-FREEZE 1: only the latest switch queued during one write is applied',async()=>{
 const ui=await setup(),finishSave=await ui.startBackgroundSave();
 ui.type('SPY');ui.enter();ui.type('MSFT');ui.enter();
 await finishSave();expect(ui.activeRow().symbol).toBe('MSFT');
});

it('LIVE-FREEZE 1: an interval chosen from the interval menu during the background autosave is applied when the write ends',async()=>{
 const ui=await setup();
 vi.stubGlobal('document',{getElementById:()=>null,querySelector:()=>null,activeElement:null,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const before=ui.activeRow().interval,finishSave=await ui.startBackgroundSave();
 find(ui.render(),node=>node.type==='button'&&node.props.id==='lv-interval-badge').props.onClick();
 const menu=find(ui.render(),node=>node.type===IntervalMenu).props;
 const target=before==='1W'?'1M':'1W',request={instrumentId:menu.current.instrument.id,target,policy:menu.state.policy};let result=chooseIntervalSource(menu.datasets,request);
 if(!result.ok&&'candidates' in result&&result.candidates?.[0])result=chooseIntervalSource(menu.datasets,{...request,sourceKey:result.candidates[0].key});
 expect(result.ok,'SYNTHETIC fixture: a local aggregation exists').toBe(true);if(!result.ok)return;
 expect(menu.onApply(result.dataset,menu.state,result),'accepted (queued), not refused').not.toBe(false);
 expect(ui.status()).toContain(QUEUED);expect(ui.activeRow().interval).toBe(before);
 await finishSave();
 expect(ui.activeRow().interval).toBe(target);
});

it('LIVE-FREEZE 2: the header symbol follows the chart through a re-ready / active-cell update',async()=>{
 const ui=await setup();
 const state=ui.grid().state,id=state.layout.activeCellId;
 ui.grid().onActiveCell(id,state.cells[id]);ui.render();// a live re-ready of the active chart
 expect(ui.symbolBox().props.value).toBe('GME');
 ui.type('NVDA');ui.enter();await flush();ui.effects();
 expect(ui.activeRow().symbol).toBe('NVDA');expect(ui.symbolBox().props.value).toBe('NVDA');
 ui.grid().onActiveCell(id,ui.grid().state.cells[id]);expect(ui.symbolBox().props.value).toBe('NVDA');
});
