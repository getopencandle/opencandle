import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {advancePaperClock,createPaperAccount,processPaperQuote,type PaperAccount} from '../../src/domain/paper';
import {createBookAccount,serializePaperState} from '../../src/domain/paper-book';
// App wiring, H2, H4 and H5. Actual App closures under controlled React hooks and an in-memory
// SYNTHETIC bridge (same harness as live-freeze-switch-app); not DOM dispatch or executable UI evidence. Virtual money only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),// Unlike the live-freeze harness, effect cleanups run before the effect re-runs (a debounce timer is cleared), as in React.
 useEffect:(fn:()=>unknown,deps?:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!deps||deps.some((v,i)=>!Object.is(v,old.deps?.[i]))){const cell:{deps?:any[];cleanup?:unknown}={deps};hooks.cells[index]=cell;hooks.effects.push(()=>{if(old&&typeof old.cleanup==='function'){const prior=old.cleanup;old.cleanup=undefined;prior();}cell.cleanup=fn();return cell.cleanup;});}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

async function setup(extra:Record<string,unknown>={}){
 let revision=4;
 const paper=createPaperAccount({initialBalance:500});
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper,alerts:[],...extra});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic autosave profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn(()=>vi.fn())};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const coordinator={suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()}))};
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const dock=()=>{const found=find(render(),node=>node.type===PaperTradingDock);if(!found)throw Error('Missing paper dock');return found.props;};
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();
 return{bridge,render,grid,effects,dock};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('H2: the order ticket gets the account clock when it is ahead of the chart bar time',async()=>{
 const ui=await setup();const account:PaperAccount=ui.dock().account,ahead=Math.max(account.clock,ui.dock().now)+3600;
 const moved=advancePaperClock(account,ahead);expect(moved.ok).toBe(true);
 expect(ui.dock().onAccountChange(moved.account,account)).toBe(true);ui.effects();
 ui.dock().onOpenTicket(null);ui.render();
 const panel=find(ui.render(),node=>node.type===PaperPanel);expect(panel,'ticket open').not.toBeNull();
 expect(panel.props.now,'same time base as the dock').toBe(ahead);
});

it('H4: a real workspace change is saved within about 5 s while live prices tick every second',async()=>{
 const ui=await setup();
 const next=structuredClone(ui.grid().state);next.cells[next.layout.activeCellId].appearance.background='#2468ac';expect(ui.grid().onChange(next)).toBe(true);ui.effects();
 for(let i=0;i<6&&!ui.bridge.saveWorkspace.mock.calls.length;i++){
  await vi.advanceTimersByTimeAsync(1000);await flush();
  // One live price update for the charted instrument: a quote-only account change, as the bar feed makes each second.
  const account:PaperAccount=ui.dock().account,id=Object.keys(account.quotes)[0],quote=account.quotes[id];expect(quote).toBeTruthy();
  const price=Math.round((quote.bid+0.05)*100)/100,result=processPaperQuote(account,{...quote,bid:price,ask:Math.round((price+0.02)*100)/100,sequence:quote.sequence+1},account.clock);
  expect(result.ok).toBe(true);ui.dock().onAccountChange(result.account,account);ui.effects();
 }
 expect(ui.bridge.saveWorkspace,'autosave not starved by live ticks').toHaveBeenCalled();
 expect(JSON.stringify(ui.bridge.saveWorkspace.mock.calls[0][0].data)).toContain('#2468ac');
});

it('H4: price-only ticks with no workspace change do not write every few seconds',async()=>{
 const ui=await setup();
 // Let the post-load save settle (the load itself marks the account once), then only price ticks follow.
 await vi.advanceTimersByTimeAsync(1300);await flush();ui.effects();ui.bridge.saveWorkspace.mockClear();
 for(let i=0;i<8;i++){
  await vi.advanceTimersByTimeAsync(1000);await flush();
  const account:PaperAccount=ui.dock().account,id=Object.keys(account.quotes)[0],quote=account.quotes[id];
  const result=processPaperQuote(account,{...quote,bid:quote.bid+0.01,ask:quote.ask+0.01,sequence:quote.sequence+1},account.clock);
  ui.dock().onAccountChange(result.account,account);ui.effects();
 }
 await vi.advanceTimersByTimeAsync(2000);await flush();
 expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});

const bookFixture=()=>{const paper=createPaperAccount({initialBalance:500});const created=createBookAccount({paper,book:null},{name:'Second synthetic account'},0,()=>'paper-synthetic-2');if(!created.ok)throw Error(created.message);return serializePaperState(created.state);};

it('H5: prepareWorkspaceData returns the saved account book beside the active account',()=>{
 const state=bookFixture(),data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:state.paper,paperBook:state.paperBook,alerts:[]} as never);
 const prepared=prepareWorkspaceData(data);
 expect(prepared.paperBook?.inactive.map(row=>row.id)).toEqual(['paper-synthetic-2']);
 expect((prepared.workspace as Record<string,unknown>).paperBook,'not also kept as a stray workspace key').toBeUndefined();
});

it('H5: extra accounts survive a restart and the next save keeps them',async()=>{
 const state=bookFixture(),ui=await setup({paper:state.paper,paperBook:state.paperBook});
 ui.dock().onOpenTicket(null);ui.render();
 const panel=find(ui.render(),node=>node.type===PaperPanel);
 expect(panel.props.paperManager.book?.inactive.map((row:PaperAccount)=>row.id)).toEqual(['paper-synthetic-2']);
 const next=structuredClone(ui.grid().state);next.cells[next.layout.activeCellId].appearance.background='#2468ad';ui.grid().onChange(next);ui.effects();
 await vi.advanceTimersByTimeAsync(1300);await flush();
 const saved=ui.bridge.saveWorkspace.mock.calls.at(-1)![0].data;
 expect(saved.paperBook.inactive.map((row:PaperAccount)=>row.id)).toEqual(['paper-synthetic-2']);
});

it('H1: the App feeds paper fills through the interval-independent source (1m Alpaca series on coarse charts)',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).toMatch(/paperFineFeedSymbol\(dataset,!!replay\)/);
 expect(app).toMatch(/\.open\(paperFineSymbol,PAPER_FINE_RESOLUTION\)/);
 expect(app).toMatch(/paperFeedInput\(\{dataset,bars,replay:!!replay,fine:paperFine,forming:paperFeedForming\.current\}\)/);
});

it('the bottom panel gets the account manager and the action quote, and its account changes go through the App authority',async()=>{
 const ui=await setup();const props=ui.dock();
 expect(props.manager,'manager outside replay').toBeTruthy();expect('quote' in props).toBe(true);
 const state={paper:props.account,book:props.manager.book},created=createBookAccount(state,{name:'Synthetic swing',initialBalance:2500},props.account.clock,()=>'paper-r26-swing');
 expect(created.ok).toBe(true);if(!created.ok)return;
 expect(props.manager.onStateChange(created.state,state)).toBe(true);ui.effects();
 const after=ui.dock();expect(after.manager.book?.inactive.map((row:PaperAccount)=>row.name)).toEqual(['Synthetic swing']);expect(after.account.id).toBe(props.account.id);
});
