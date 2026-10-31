import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {ChartTypeMenu} from '../../src/ui/ChartTypeMenu';
import {StorageDialog} from '../../src/ui/StorageDialog';
import {WorkspaceRestoreDialog} from '../../src/ui/WorkspaceRestoreDialog';
import {WorkspaceChartHost as MultiChartGrid} from '../../src/ui/WorkspaceChartHost';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {scriptExecutionIdentity} from '../../src/ui/script-input';
import {StrategyDialog} from '../../src/ui/StrategyDialog';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {NotesDialog} from '../../src/ui/NotesDialog';
import {ScreenerDialog} from '../../src/ui/ScreenerDialog';
import {WatchlistAdvancedDialog} from '../../src/ui/WatchlistAdvancedDialog';
import {advancedSourceKey} from '../../src/watchlists/advanced';
import {DateNavigationDialog} from '../../src/ui/DateNavigationDialog';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
// The Paper trading button opens only the bottom Trading panel; the floating dialog is reached from the panel (Open floating).
const openPaperDialog=(ui:{button:(label:string)=>any;render:()=>any})=>{ui.button('Paper trading').props.onClick();find(ui.render(),(node:any)=>node.type===PaperTradingDock).props.onOpenTicket(null);};
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {FloatingPanel} from '../../src/ui/FloatingPanel';
import {FundamentalsDialog} from '../../src/ui/FundamentalsDialog';
import {NewsDialog} from '../../src/ui/NewsDialog';
import {CalendarDialog} from '../../src/ui/CalendarDialog';
import {HeatmapDialog} from '../../src/ui/HeatmapDialog';
import {ImportDialog} from '../../src/ui/ImportDialog';
import {addWatchNote} from '../../src/watchlists/notes';
import {restoreWatchBook} from '../../src/watchlists/model';
import {ChartBottomToolbar} from '../../src/ui/bottom-toolbar';
// Actual App closures, controlled React hooks. No DOM, native file dialog or restart claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
/** RPST start-selection flow: click Replay, then click the chart tree over bar `index` (the hovered bar comes from a stub chart data window; the stub chart is then released). */
function startReplay(ui:any,index=100){find(ui.render(),(node:any)=>node.type==='button'&&text(node).endsWith(' Replay')).props.onClick();const grid=ui.grid().props??ui.grid(),bars=grid.activeBars,data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId);
 grid.onReady({drawings:{getMode:()=>null,getTool:()=>null},getStyle:()=>grid.state.cells[grid.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,bars),getDataWindow:()=>({standard:{hovered:true,bar:bars[Math.min(index,bars.length-1)]}})});
 find(ui.render(),(node:any)=>node.props?.className==='chart-workspace').props.onClickCapture({target:{closest:(selector:string)=>selector==='[data-chart-tree]'?{}:null},preventDefault(){},stopPropagation(){}});(ui.grid().props??ui.grid()).onReady(null);}
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
const saved=(data:any,revision=7)=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-14T14:00:00Z',data,storage:{directory:'Synthetic recovery profile',backend:'json-atomic'}}});
const good=()=>prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:321}),alerts:[]});
function setup(response:Promise<any>){const bridge={loadWorkspace:vi.fn(()=>response),saveWorkspace:vi.fn(async(input:any)=>({ok:true,value:{revision:input.expectedRevision+1,savedAt:'2026-10-14T14:00:01Z'}})),resetWorkspace:vi.fn(async(revision:number)=>({ok:true,value:{revision:revision+1,savedAt:'2026-10-14T14:00:01Z'}})),exportWorkspace:vi.fn(async(_:any)=>({ok:true,value:{}})),executeScript:vi.fn()};vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];const unmount=boot() as ()=>void;const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};const openStorage=()=>{button('Local storage').props.onClick();return find(render(),node=>node.type===StorageDialog).props;};const restore=()=>{openStorage().onRestore();return find(render(),node=>node.type===WorkspaceRestoreDialog).props;};return{bridge,render,button,openStorage,restore,grid:()=>find(render(),node=>node.type===MultiChartGrid),unmount};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());
it('layout selector requests wait for native staging before recording model/history and preserve accepted IDs on Undo/Redo',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const opening=ui.grid().props,next=resizeMultiChartState(opening.state,'two-columns'),ready=deferred();let staged:any;
 const host={cancel:vi.fn(),transition:vi.fn(async(request:any)=>{staged=request;await ready.promise;expect(request.assertCurrent()).toBe(true);let marked=false;request.commitModel(request.next.state,()=>{marked=true;});expect(marked).toBe(true);return{committed:true,cancelled:false,errors:[]};})};
 opening.onHostReady(host);const pending=ui.grid().props.onRequestResize(opening.state,next);expect(host.transition).toHaveBeenCalledOnce();expect(ui.grid().props.state).toBe(opening.state);expect(staged.expected.activeBars).toBe(opening.activeBars);expect(staged.next.activeBars).toBe(opening.activeBars);
 expect(await ui.grid().props.onRequestResize(opening.state,next)).toBe(false);expect(ui.grid().props.onChange({...opening.state,presetId:'single'})).toBe(false);
 ready.resolve(null);expect(await pending).toBe(true);expect(ui.grid().props.state.layout.cells.map((row:any)=>row.id)).toEqual(next.layout.cells.map(row=>row.id));
 ui.grid().props.onTransactionReady({apply:vi.fn()});ui.button('Undo').props.onClick();await flush();expect(ui.grid().props.state.layout.cells).toEqual(opening.state.layout.cells);
 ui.button('Redo').props.onClick();await flush();expect(ui.grid().props.state.layout.cells.map((row:any)=>row.id)).toEqual(next.layout.cells.map(row=>row.id));expect(host.transition).toHaveBeenCalledTimes(3);
});
it('failed layout staging leaves the model and history unchanged and allows a fresh request',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const opening=ui.grid().props,next=resizeMultiChartState(opening.state,'two-rows'),host={cancel:vi.fn(),transition:vi.fn(async()=>({committed:false,cancelled:false,errors:['Synthetic new study placement failed']}))};
 opening.onHostReady(host);expect(await ui.grid().props.onRequestResize(opening.state,next)).toBe(false);expect(ui.grid().props.state).toBe(opening.state);expect(text(ui.render())).toContain('Synthetic new study placement failed');ui.button('Undo').props.onClick();await flush();expect(host.transition).toHaveBeenCalledOnce();
 expect(await ui.grid().props.onRequestResize(opening.state,next)).toBe(false);expect(host.transition).toHaveBeenCalledTimes(2);
});
it('a retained layout request cannot commit after its exact native host is replaced',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const opening=ui.grid().props,next=resizeMultiChartState(opening.state,'two-columns'),finish=deferred();let staged:any;
 const host={cancel:vi.fn(),transition:vi.fn(async(request:any)=>{staged=request;await finish.promise;return{committed:false,cancelled:true,errors:['Synthetic replaced host']};})};
 opening.onHostReady(host);const pending=ui.grid().props.onRequestResize(opening.state,next);ui.grid().props.onHostReady({cancel:vi.fn(),transition:vi.fn()});expect(staged.assertCurrent()).toBe(false);expect(()=>staged.commitModel(next,vi.fn())).toThrow('changed');finish.resolve(null);expect(await pending).toBe(false);expect(ui.grid().props.state).toBe(opening.state);
});
it('changing layout geometry with the same cell identities does not replace the native tree',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const initial=ui.grid().props;expect(initial.onChange(resizeMultiChartState(initial.state,'two-columns'))).toBe(true);const opening=ui.grid().props,next=resizeMultiChartState(opening.state,'two-rows'),host={cancel:vi.fn(),transition:vi.fn()};opening.onHostReady(host);
 expect(await ui.grid().props.onRequestResize(opening.state,next)).toBe(true);expect(ui.grid().props.state.presetId).toBe('two-rows');expect(host.transition).not.toHaveBeenCalled();expect(await ui.grid().props.onRequestResize(opening.state,next)).toBe(false);
});
it('a postaccept layout publication diagnostic keeps the accepted layout rather than rolling its model back',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const opening=ui.grid().props,next=resizeMultiChartState(opening.state,'two-columns'),host={cancel:vi.fn(),transition:vi.fn(async(request:any)=>{request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:['Synthetic final paint failed']};})};opening.onHostReady(host);
 expect(await ui.grid().props.onRequestResize(opening.state,next)).toBe(true);expect(ui.grid().props.state.layout.cells).toEqual(next.layout.cells);expect(text(ui.render())).toContain('accepted layout needs recovery');
});
it.each([
 ['Fundamentals',FundamentalsDialog,'onChange','documents'],
 ['News and filings',NewsDialog,'onChange','state'],
 ['News and filings',NewsDialog,'onFilingsChange','filings'],
 ['Calendar',CalendarDialog,'onChange','state'],
 ['Heatmap',HeatmapDialog,'onChange','state'],
 ['Stock screener',ScreenerDialog,'onChange','settings'],
] as const)('closed %s cannot publish retained analysis data through %s',async(name,component,callback,field)=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();ui.button(name).props.onClick();const panel=find(ui.render(),node=>node.type===component).props;
 panel.onClose();expect(()=>panel[callback](panel[field])).toThrow('closed');
});
it('closed import and analysis chart-opening callbacks cannot change the accepted source',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const original=ui.grid().props.state,spy=ui.grid().props.datasets.find((data:any)=>data.instrument.symbol==='SPY');
 ui.button('Import data').props.onClick();const imported=find(ui.render(),node=>node.type===ImportDialog).props;imported.onClose();expect(()=>imported.onImport(spy)).toThrow('closed');
 for(const [name,component] of [['Heatmap',HeatmapDialog],['Stock screener',ScreenerDialog]] as const){ui.button(name).props.onClick();const panel=find(ui.render(),node=>node.type===component).props;panel.onClose();expect(panel.onSelect(spy)).toMatchObject({ok:false});}
 ui.button('Calendar').props.onClick();const calendar=find(ui.render(),node=>node.type===CalendarDialog).props;calendar.onClose();expect(()=>calendar.onSelectSymbol(spy.instrument.id,'SPY')).toThrow('closed');expect(ui.grid().props.state).toBe(original);
});
it('actual App watchlist source handlers save and restore separate GME/SPY drawing documents',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const opening=ui.grid().props,id=opening.state.layout.activeCellId,line={id:'gme-line',type:'trendline',paneId:'price',anchors:[{time:opening.activeBars[0].time,price:12.005},{time:opening.activeBars[1].time,price:24.75}],style:{lineColor:'#123456'},locked:true,visible:false},seed=structuredClone(opening.state);seed.cells[id].drawings={version:1,drawings:[line]};expect(opening.onChange(seed)).toBe(true);
 let watch=find(ui.render(),node=>node.type===WatchlistPanel).props;watch.onOpen(watch.datasets.find((data:any)=>data.instrument.symbol==='SPY'));let current=ui.grid().props;expect(current.state.cells[id].drawings.drawings).toEqual([]);expect(current.state.cells[id].drawingScopes.inactive).toHaveLength(1);
 const spy=structuredClone(current.state),spyLine={...line,id:'spy-line',anchors:[{time:current.activeBars[0].time,price:100},{time:current.activeBars[1].time,price:110}]};spy.cells[id].drawings={version:1,drawings:[spyLine]};expect(current.onChange(spy)).toBe(true);
 watch=find(ui.render(),node=>node.type===WatchlistPanel).props;watch.onOpen(watch.datasets.find((data:any)=>data.instrument.symbol==='GME'));current=ui.grid().props;expect(current.state.cells[id].drawings.drawings).toEqual([line]);expect(current.state.cells[id].drawingScopes.inactive[0].document.drawings).toEqual([spyLine]);
 const invalid=structuredClone(current.state);invalid.cells[id].drawingScopes.activeBasis.symbol='SPY';expect(current.onChange(invalid)).toBe(false);expect(ui.grid().props.state).toBe(current.state);expect(text(ui.render())).toContain('does not match');
});
function contextTarget(ui:ReturnType<typeof setup>){
 const first=ui.grid().props,data=first.datasets.find((row:any)=>row.provenance.datasetId===first.activeDatasetId),controller={goToDate:vi.fn(()=>({ok:true,withinHistory:true})),getStyle:()=>first.state.cells[first.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,first.activeBars)};
 first.onReady(controller);const grid=ui.grid().props,snapshot={token:{},treeOwner:{},cellId:grid.state.layout.activeCellId,controller,instrument:{...data.instrument},input:{bars:grid.activeBars,source:sourceContextForDataset(data,grid.activeBars),style:grid.state.cells[grid.state.layout.activeCellId].style},executionIdentity:grid.activeExecutionIdentity,entity:{kind:'chart'},client:null,local:null,point:{price:21,logical:1,barIndex:1,barTime:grid.activeBars[1].time,unit:'price',pane:{kind:'price'}}};
 let live=true;const release=vi.fn(()=>{live=false;}),lease={snapshot,isCurrent:()=>live,isOwnerCurrent:()=>live,release};return{grid,data,snapshot,controller,lease};
}
it('actual App creates an exact virtual-price request without submitting or changing paper funds',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui);target.snapshot.point.price=99.5;
 await expect(target.grid.contextActions['paper-ticket'](target.snapshot,target.lease)).resolves.toEqual({ok:true});
 const panel=find(ui.render(),node=>node.type===PaperPanel).props,request=panel.contextRequest;
 // R17: the clicked level is shown and seeded at the instrument display precision (tickSize 0.01, so '99.50'),
 // as the reference app labels it. The virtual ticket stays exact: price is still exactly 99.5 and the seeded text parses back to it.
 expect(request).toMatchObject({action:'paper-ticket',price:99.5,priceText:'99.50',chartId:target.snapshot.cellId,executionIdentity:'ordinary',paperOwner:{id:panel.account.id,mode:'paper',runId:panel.account.runId}});expect(Number(request.priceText)).toBe(request.price);
 expect(panel.account.orders).toEqual([]);expect(()=>panel.assertContextCurrent(request,'seed')).not.toThrow();expect(()=>panel.assertContextCurrent({...request})).toThrow();
 const account=panel.account;panel.onContextComplete(request,'cancelled');expect(find(ui.render(),node=>node.type===PaperPanel)).toBeNull();expect(target.lease.release).toHaveBeenCalledOnce();
 const closedText=text(ui.render());expect(panel.onAccountChange(createPaperAccount({initialBalance:77}),account)).toBe(false);expect(text(ui.render())).toBe(closedText);openPaperDialog(ui);expect(find(ui.render(),node=>node.type===PaperPanel).props.account).toBe(account);
});
it('context price seed checks original geometry while later use keeps the captured absolute level',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui);let geometryCurrent=true;target.lease.isCurrent=()=>geometryCurrent;
 await target.grid.contextActions['price-alert'](target.snapshot,target.lease);const panel=find(ui.render(),node=>node.type===WorkspaceAlerts).props;
 expect(panel.open).toBe(true);expect(panel.contextRequest.price).toBe(21);geometryCurrent=false;
 expect(()=>panel.assertContextCurrent(panel.contextRequest,'seed')).toThrow('geometry');expect(()=>panel.assertContextCurrent(panel.contextRequest,'use')).not.toThrow();
 ui.grid().props.onReady({});expect(()=>panel.assertContextCurrent(panel.contextRequest,'use')).toThrow('The chart changed');
});
it('old contextual completion cannot close a newer request and background alert publication remains independent',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const first=contextTarget(ui);await first.grid.contextActions['price-alert'](first.snapshot,first.lease);
 const old=find(ui.render(),node=>node.type===WorkspaceAlerts).props;old.onContextComplete(old.contextRequest,'cancelled');
 const next=contextTarget(ui);await next.grid.contextActions['price-alert'](next.snapshot,next.lease);const current=find(ui.render(),node=>node.type===WorkspaceAlerts).props;
 old.onContextComplete(old.contextRequest,'saved');expect(find(ui.render(),node=>node.type===WorkspaceAlerts).props.open).toBe(true);expect(next.lease.release).not.toHaveBeenCalled();
 expect(()=>old.assertContextCurrent(old.contextRequest)).toThrow('closed');current.onContextComplete(current.contextRequest,'cancelled');
 expect(current.onAlertsChange([],current.alerts)).toBe(true);expect(next.lease.release).toHaveBeenCalledOnce();
});
it('an ineligible indicator-coordinate point cannot open a generic paper or alert dialog',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui);target.snapshot.point.unit='indicator';
 await expect(target.grid.contextActions['paper-ticket'](target.snapshot,target.lease)).resolves.toMatchObject({ok:false});
 expect(find(ui.render(),node=>node.type===PaperPanel)).toBeNull();expect(find(ui.render(),node=>node.type===WorkspaceAlerts).props.open).toBe(false);expect(target.lease.release).toHaveBeenCalledOnce();
});
it('ordinary paper callbacks cannot mutate an account after their modal closes',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();openPaperDialog(ui);const panel=find(ui.render(),node=>node.type===PaperPanel).props;
 find(ui.render(),node=>node.type===FloatingPanel&&node.props.title==='Paper trading').props.onClose();const closedText=text(ui.render());expect(panel.onAccountChange(createPaperAccount({initialBalance:77}),panel.account)).toBe(false);expect(text(ui.render())).toBe(closedText);openPaperDialog(ui);expect(find(ui.render(),node=>node.type===PaperPanel).props.account).toBe(panel.account);
});
it('actual App chart-menu note targets the captured symbol and releases its capability',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui),before=ui.grid().props.state;
 await expect(target.grid.contextActions.note(target.snapshot,target.lease)).resolves.toEqual({ok:true});expect(find(ui.render(),node=>node.type===NotesDialog).props.initialMarket).toEqual({exchange:target.data.instrument.exchange,symbol:'GME',synthetic:true});expect(ui.grid().props.state).toBe(before);expect(target.lease.release).toHaveBeenCalledOnce();
});
it('actual App menu dialog survives dismissal but rejects retained actions after close',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui);await expect(target.grid.contextActions.date(target.snapshot,target.lease)).resolves.toEqual({ok:true});
 const dialog=find(ui.render(),node=>node.type===DateNavigationDialog).props;expect(dialog.time).toBe(target.snapshot.point.barTime);expect(target.lease.release).not.toHaveBeenCalled();dialog.onGo(100);expect(target.controller.goToDate).toHaveBeenCalledExactlyOnceWith(100);dialog.onClose();expect(target.lease.release).toHaveBeenCalledOnce();
 expect(()=>dialog.onGo(200)).toThrow('closed');expect(target.controller.goToDate).toHaveBeenCalledOnce();
});
it('ordinary toolbar dialog callbacks cannot apply to or close a later menu dialog',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui);find(ui.render(),node=>node.type===ChartBottomToolbar).props.onGoTo();const ordinary=find(ui.render(),node=>node.type===DateNavigationDialog).props;ordinary.onClose();
 await expect(ui.grid().props.contextActions.date(target.snapshot,target.lease)).resolves.toEqual({ok:true});const contextual=find(ui.render(),node=>node.type===DateNavigationDialog).props;
 ordinary.onClose();expect(find(ui.render(),node=>node.type===DateNavigationDialog)).not.toBeNull();expect(()=>ordinary.onGo(300)).toThrow('closed');expect(target.controller.goToDate).not.toHaveBeenCalled();contextual.onGo(400);expect(target.controller.goToDate).toHaveBeenCalledExactlyOnceWith(400);
});
it('actual App menu export uses only the captured replay prefix and never the future source tail',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();startReplay(ui);const target=contextTarget(ui),exportData=vi.fn(async(_request:unknown)=>({ok:true,value:{}}));(ui.bridge as any).exportData=exportData;
 expect(target.snapshot.input.bars.length).toBeLessThan(target.data.bars.length);await expect(target.grid.contextActions['source-csv'](target.snapshot,target.lease)).resolves.toMatchObject({ok:true});
 const request=exportData.mock.calls[0][0] as any,lines=request.text.trim().split('\n');expect(lines).toHaveLength(target.snapshot.input.bars.length+1);expect(request.suggestedName).toBe('GME-SYNTHETIC-bars.csv');expect(request.text).not.toContain(new Date(target.data.bars.at(-1).time*1000).toISOString());expect(target.lease.release).toHaveBeenCalledOnce();
});
it('actual App rejects a chart-menu target after its active source array or controller changes',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui);ui.grid().props.onReady({});await expect(target.grid.contextActions.date(target.snapshot,target.lease)).resolves.toMatchObject({ok:false});expect(find(ui.render(),node=>node.type===DateNavigationDialog)).toBeNull();expect(target.lease.release).toHaveBeenCalledOnce();
});
it('a completed native export does not overwrite status after its chart owner retires',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const target=contextTarget(ui),pending=deferred();(ui.bridge as any).exportData=vi.fn(()=>pending.promise);
 const work=target.grid.contextActions['source-csv'](target.snapshot,target.lease);ui.grid().props.onReady({});pending.resolve({ok:true,value:{}});
 await expect(work).resolves.toEqual({ok:true});expect(text(ui.render())).not.toContain('Selected chart source bars exported locally');expect(target.lease.release).toHaveBeenCalledOnce();
});
it('actual App Advanced View saves its exact opening state and rejects retired or replaced publication',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const watch=()=>find(ui.render(),node=>node.type===WatchlistPanel).props;
 expect(watch().onAdvanced()).toBe(true);const view=find(ui.render(),node=>node.type===WatchlistAdvancedDialog).props;
 expect(view.list.id).toBe(watch().book.activeId);expect(view.datasets).toBe(ui.grid().props.datasets);
 const next={...view.state,settings:{...view.state.settings,group:'exchange',summary:'median'}};
 expect(view.onChange(next,view.state)).toBe(true);expect(()=>view.onChange(next,view.state)).toThrow('changed');view.onClose();
 expect(watch().onAdvanced()).toBe(true);const reopened=find(ui.render(),node=>node.type===WatchlistAdvancedDialog).props;expect(reopened.state.settings).toMatchObject({group:'exchange',summary:'median'});
 reopened.onClose();expect(()=>reopened.onChange(reopened.state,reopened.state)).toThrow('closed');expect(find(ui.render(),node=>node.type===WatchlistAdvancedDialog)).toBeNull();
});
it('actual Advanced View opens only its exact supplied source and rejects a substituted source object',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();find(ui.render(),node=>node.type===WatchlistPanel).props.onAdvanced();const view=find(ui.render(),node=>node.type===WatchlistAdvancedDialog).props,before=ui.grid().props.state,spy=view.datasets.find((row:any)=>row.instrument.symbol==='SPY');
 expect(view.onOpenDataset(spy,'obsolete key')).toMatchObject({ok:false});expect(ui.grid().props.state).toBe(before);
 const substitute={...spy};expect(view.onOpenDataset(substitute,advancedSourceKey(substitute))).toMatchObject({ok:false});expect(ui.grid().props.state).toBe(before);
 expect(view.onOpenDataset(spy,advancedSourceKey(spy))).toEqual({ok:true});expect(ui.grid().props.state.layout.cells.find((row:any)=>row.id===ui.grid().props.state.layout.activeCellId).symbol).toBe('SPY');view.onClose();
 expect(view.onOpenDataset(spy,advancedSourceKey(spy))).toMatchObject({ok:false});
});
it('actual Advanced View note routing retires the old dialog without closing the new notes editor',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const before=ui.grid().props.state;find(ui.render(),node=>node.type===WatchlistPanel).props.onAdvanced();const view=find(ui.render(),node=>node.type===WatchlistAdvancedDialog).props,market={exchange:'SYNTHETIC',symbol:'SPY',synthetic:true};
 view.onOpenNotes(market);view.onClose();expect(find(ui.render(),node=>node.type===NotesDialog).props.initialMarket).toEqual(market);expect(ui.grid().props.state).toBe(before);expect(()=>view.onChange(view.state,view.state)).toThrow('closed');
});
it('actual App opens the exact watchlist note market without changing charts and rejects a stale note publication',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const before=ui.grid().props.state,watch=find(ui.render(),node=>node.type===WatchlistPanel).props,market={exchange:'NYSE',symbol:'SPY',synthetic:false};
 expect(watch.onNotes(market,undefined,true)).toBe(true);const notes=find(ui.render(),node=>node.type===NotesDialog).props;expect(notes.initialMarket).toEqual(market);expect(notes.startNew).toBe(true);expect(ui.grid().props.state).toEqual(before);
 const next=restoreWatchBook({...notes.book,notes:addWatchNote(notes.book.notes??[],'app-note',market,'Literal local test note',100)});expect(notes.onChange(next,notes.book)).toBe(true);expect(find(ui.render(),node=>node.type===NotesDialog).props.book.notes[0].text).toBe('Literal local test note');expect(()=>notes.onChange(next,notes.book)).toThrow(/changed/);expect(ui.grid().props.state).toEqual(before);
});
it('actual Alt+N dispatch protects editor, IME, modifiers and dialogs and uses the current chart source',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();let modal=false;vi.stubGlobal('document',{querySelector:()=>modal?{}:null});ui.render();const cleanups=hooks.effects.splice(0).map(effect=>effect());
 try{const listener=(window.addEventListener as any).mock.calls.filter((row:any[])=>row[0]==='keydown').at(-1)[1],event={key:'n',altKey:true,ctrlKey:false,metaKey:false,shiftKey:false,isComposing:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};
  for(const extra of [{isComposing:true},{ctrlKey:true},{shiftKey:true},{metaKey:true},{target:{closest:()=>({})}}])listener({...event,...extra});modal=true;listener(event);expect(find(ui.render(),node=>node.type===NotesDialog)).toBeNull();modal=false;
  const watch=find(ui.render(),node=>node.type===WatchlistPanel).props,spy=watch.datasets.find((row:any)=>row.instrument.symbol==='SPY');watch.onOpen(spy);ui.render();listener(event);
  const note=find(ui.render(),node=>node.type===NotesDialog).props;expect(note.initialMarket).toEqual({exchange:spy.instrument.exchange,symbol:'SPY',synthetic:true});expect(note.startNew).toBe(true);expect(event.preventDefault).toHaveBeenCalledOnce();
 }finally{for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();}
});
it('actual screener note callback opens its supplied market without a chart-source switch',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();ui.button('Stock screener').props.onClick();const screen=find(ui.render(),node=>node.type===ScreenerDialog).props,market={exchange:'LOCAL',symbol:'TEST',synthetic:false},before=ui.grid().props.activeDatasetId;
 expect(screen.onNotes(market)).toBe(true);expect(find(ui.render(),node=>node.type===NotesDialog).props.initialMarket).toEqual(market);expect(ui.grid().props.activeDatasetId).toBe(before);
});
it('blocks reset, export and restore while the original storage revision is unknown',async()=>{const pending=deferred(),ui=setup(pending.promise),storage=ui.openStorage();await expect(storage.onReset()).rejects.toThrow(/loading/i);expect(await storage.onExport()).toMatch(/loading/i);expect(()=>ui.restore().onPreview(JSON.stringify({schemaVersion:1,data:good()}))).toThrow(/loading/i);expect(ui.bridge.resetWorkspace).not.toHaveBeenCalled();expect(ui.bridge.exportWorkspace).not.toHaveBeenCalled();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(ui.grid()).toBeNull();pending.resolve(saved(null));await flush();expect(ui.grid()).not.toBeNull();});
it('retains domain-invalid saved bytes for exact export and restores with their known revision',async()=>{const broken={...good(),version:999},ui=setup(Promise.resolve(saved(broken,7)));await flush();expect(ui.grid()).toBeNull();expect(text(ui.render())).toContain('needs recovery');await ui.openStorage().onExport();expect(ui.bridge.exportWorkspace).toHaveBeenCalledWith({schemaVersion:1,data:broken});const preview=ui.restore().onPreview(JSON.stringify({schemaVersion:1,data:good()}));expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();await preview.apply();expect(ui.bridge.saveWorkspace.mock.calls[0][0].expectedRevision).toBe(7);expect(ui.grid()).not.toBeNull();expect(ui.bridge.executeScript).not.toHaveBeenCalled();});
it('unreadable storage only permits Retry and cannot reset at a guessed revision',async()=>{const ui=setup(Promise.resolve({ok:false,error:{code:'STORAGE_INVALID',message:'Synthetic damaged envelope'}}));await flush();expect(ui.grid()).toBeNull();const storage=ui.openStorage();await expect(storage.onReset()).rejects.toThrow(/unavailable|unreadable/i);expect(await storage.onExport()).toMatch(/unavailable|unreadable/i);expect(ui.bridge.resetWorkspace).not.toHaveBeenCalled();expect(ui.bridge.exportWorkspace).not.toHaveBeenCalled();ui.bridge.loadWorkspace.mockResolvedValueOnce(saved(null,11));ui.button('Retry loading').props.onClick();await flush();expect(ui.grid()).not.toBeNull();});
it('failed recovery replacement preserves the retained export and permits explicit retry',async()=>{const broken={...good(),alerts:[{invalid:true}]},ui=setup(Promise.resolve(saved(broken,9)));await flush();const preview=ui.restore().onPreview(JSON.stringify({schemaVersion:1,data:good()}));ui.bridge.saveWorkspace.mockResolvedValueOnce({ok:false,error:{code:'REVISION_CONFLICT',message:'Synthetic conflict'}} as any);await expect(preview.apply()).rejects.toThrow('conflict');expect(ui.grid()).toBeNull();await ui.openStorage().onExport();expect(ui.bridge.exportWorkspace.mock.calls.at(-1)![0].data).toBe(broken);await preview.apply();expect(ui.grid()).not.toBeNull();});
it('Retry loading retires an older recovery preview even if the saved revision is unchanged',async()=>{const broken={...good(),version:999},ui=setup(Promise.resolve(saved(broken,7)));await flush();const preview=ui.restore().onPreview(JSON.stringify({schemaVersion:1,data:good()})),next=deferred();ui.bridge.loadWorkspace.mockReturnValueOnce(next.promise);ui.button('Retry loading').props.onClick();expect(()=>preview.assertCurrent()).toThrow(/changed|retired/i);next.resolve(saved(broken,7));await flush();expect(()=>preview.assertCurrent()).toThrow(/changed|retired/i);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();});
it('retired startup results and errors cannot publish after component unmount',async()=>{const pending=deferred(),ui=setup(pending.promise);ui.unmount();pending.resolve(saved(good(),7));await flush();expect(ui.grid()).toBeNull();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();});
it('retired recovery Retry callbacks cannot replace a newer accepted workspace',async()=>{const ui=setup(Promise.resolve(saved({...good(),version:999},7)));await flush();const oldRetry=ui.openStorage().onRetry;ui.bridge.loadWorkspace.mockResolvedValueOnce(saved(good(),8));await oldRetry();await flush();expect(ui.grid()).not.toBeNull();expect(ui.bridge.loadWorkspace).toHaveBeenCalledTimes(2);await oldRetry();await flush();expect(ui.bridge.loadWorkspace).toHaveBeenCalledTimes(2);expect(ui.grid()).not.toBeNull();expect(text(ui.render())).toContain('no longer current');});
function frameEdit(ui:ReturnType<typeof setup>){const grid=ui.grid().props,id=grid.state.layout.activeCellId,data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId),source=sourceContextForDataset(data,grid.activeBars),opening={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null},next=structuredClone(grid.state);next.cells[id].frame=structuredClone(opening);next.cells[id].frame.panes[0].manualRange={min:11,max:25};next.cells[id].chartOptions.auto=false;return{grid,id,opening,next,baseline:{kind:'native-frame',expectedGrid:grid.state,frames:{[id]:opening},viewports:{[id]:{from:100,to:200}},inputs:{[id]:{source,bars:grid.activeBars,style:'candles',executionIdentity:grid.activeExecutionIdentity}}}};}
it('actual App frame publication records the observed opening frame for Undo and the accepted range for Redo',async()=>{const ui=setup(Promise.resolve(saved(null)));await flush();const edit=frameEdit(ui),requests:any[]=[],coordinator={inventory:vi.fn(),apply:vi.fn(async(request:any)=>{requests.push(request);expect(request.assertCurrent()).toBe(true);request.commitModel(()=>{});return{publicationErrors:[]};})};edit.grid.onTransactionReady(coordinator);expect(edit.grid.onChange(edit.next,undefined,edit.baseline)).toBe(true);expect(ui.grid().props.state.cells[edit.id].frame.panes[0].manualRange).toEqual({min:11,max:25});ui.button('Undo').props.onClick();await flush();expect(requests).toHaveLength(1);expect(requests[0].nextState.cells[edit.id].frame.panes[0].manualRange).toBeNull();expect(ui.grid().props.state.cells[edit.id].frame.panes[0].manualRange).toBeNull();ui.button('Redo').props.onClick();await flush();expect(requests).toHaveLength(2);expect(ui.grid().props.state.cells[edit.id].frame.panes[0].manualRange).toEqual({min:11,max:25});});
it('rejected frame metadata leaves actual App model and Undo history untouched',async()=>{const ui=setup(Promise.resolve(saved(null)));await flush();const edit=frameEdit(ui),apply=vi.fn();edit.grid.onTransactionReady({inventory:vi.fn(),apply});edit.baseline.inputs[edit.id].bars=edit.grid.activeBars.slice();expect(edit.grid.onChange(edit.next,undefined,edit.baseline)).toBe(false);expect(ui.grid().props.state).toBe(edit.grid.state);ui.button('Undo').props.onClick();await flush();expect(apply).not.toHaveBeenCalled();});
function structuralEdit(ui:ReturnType<typeof setup>){
 const before=ui.grid().props,next=resizeMultiChartState(before.state,'two-columns'),added=next.layout.cells[1],spy=before.datasets.find((row:any)=>row.instrument.symbol==='SPY');
 const opening=before.datasets.find((row:any)=>row.provenance.datasetId===next.cells[added.id].datasetId);added.symbol='SPY';added.interval=spy.resolution;next.cells[added.id]=transitionDrawingScope({...next.cells[added.id],datasetId:spy.provenance.datasetId},opening,spy);
 next.cells[added.id].scriptBindings=[{id:'synthetic-restored-script',documentId:'d',version:1,name:'Synthetic saved script',source:'({onBar(){}})',pane:'new',visible:true,plots:{}}];
 next.layout.activeCellId=added.id;next.layout.maximizedCellId=added.id;expect(before.onChange(next)).toBe(true);
 const apply=vi.fn(),grid=ui.grid().props;grid.onTransactionReady({inventory:vi.fn(),apply});return{grid,added,apply};
}
it('actual App routes changed-cell Undo and Redo through staging and preserves focus, exact source and scripts',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const edit=structuralEdit(ui),requests:any[]=[];
 edit.grid.onHostReady({transition:vi.fn(async(request:any)=>{requests.push(request);expect(request.assertCurrent()).toBe(true);request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:[]};}),cancel:vi.fn()});
 ui.button('Undo').props.onClick();await flush();expect(requests).toHaveLength(1);expect(edit.apply).not.toHaveBeenCalled();expect(ui.grid().props.state.layout.cells).toHaveLength(1);expect(requests[0].expected.activeDatasetId).toBe(edit.grid.activeDatasetId);expect(requests[0].next.state.layout.cells[0].symbol).toBe('GME');
 ui.button('Redo').props.onClick();await flush();expect(requests).toHaveLength(2);const restored=ui.grid().props.state;expect(restored.layout.cells).toHaveLength(2);expect(restored.layout.activeCellId).toBe(edit.added.id);expect(restored.layout.maximizedCellId).toBe(edit.added.id);expect(restored.cells[edit.added.id].scriptBindings[0].id).toBe('synthetic-restored-script');expect(ui.grid().props.activeDatasetId).toBe(edit.grid.activeDatasetId);
});
it('a rejected structural staging result leaves the actual App history available for a deliberate retry',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const edit=structuralEdit(ui),transition=vi.fn(async(_request:any)=>({committed:false,cancelled:false,errors:['Synthetic native stage rejection']}));edit.grid.onHostReady({transition,cancel:vi.fn()});
 ui.button('Undo').props.onClick();await flush();expect(ui.grid().props.state).toBe(edit.grid.state);expect(text(ui.render())).toContain('Synthetic native stage rejection');
 transition.mockImplementation(async request=>{request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:[]};});ui.button('Undo').props.onClick();await flush();expect(transition).toHaveBeenCalledTimes(2);expect(ui.grid().props.state.layout.cells).toHaveLength(1);
});
it('a pending structural Undo rejects repeated invocation and postcommit errors do not duplicate history',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const edit=structuralEdit(ui),pending=deferred(),transition=vi.fn(async(request:any)=>{await pending.promise;request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:['Synthetic retired-tree cleanup failure']};});edit.grid.onHostReady({transition,cancel:vi.fn()});
 ui.button('Undo').props.onClick();ui.button('Undo').props.onClick();expect(transition).toHaveBeenCalledOnce();pending.resolve(null);await flush();expect(ui.grid().props.state.layout.cells).toHaveLength(1);expect(text(ui.render())).toContain('cleanup failure');ui.button('Undo').props.onClick();await flush();expect(transition).toHaveBeenCalledOnce();
});
for(const symbol of ['GME','SPY'])it('focus pins exact '+symbol+' input and retires replay before a same-event native gesture',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const initial=ui.grid().props,multi=resizeMultiChartState(initial.state,'two-columns'),target=multi.layout.cells[1],targetData=initial.datasets.find((row:any)=>row.instrument.symbol===symbol);
 const openingDataset=initial.datasets.find((row:any)=>row.provenance.datasetId===multi.cells[target.id].datasetId);target.symbol=symbol;target.interval=targetData.resolution;multi.cells[target.id]=transitionDrawingScope({...multi.cells[target.id],datasetId:targetData.provenance.datasetId},openingDataset,targetData);expect(initial.onChange(multi)).toBe(true);
 startReplay(ui);const before=ui.grid().props;
 expect(before.activeExecutionIdentity).not.toBe('ordinary');expect(before.activeBars.length).toBeLessThan(500);
 const focused={...before.state,layout:{...before.state.layout,activeCellId:target.id}},data=before.datasets.find((row:any)=>row.instrument.symbol===symbol);
 expect(before.onChange(focused)).toBe(true);
 // No React render between focus acceptance and the native gesture publication.
 const source=sourceContextForDataset(data,data.bars),opening={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};
 const next=structuredClone(focused);next.cells[target.id].frame=structuredClone(opening);next.cells[target.id].frame.panes[0].manualRange={min:10,max:30};next.cells[target.id].chartOptions.auto=false;
 const baseline={kind:'native-frame',expectedGrid:focused,frames:{[target.id]:opening},viewports:{[target.id]:{from:100,to:200}},inputs:{[target.id]:{source,bars:data.bars,style:'candles',executionIdentity:'ordinary'}}};
 expect(before.onChange(next,undefined,baseline)).toBe(true);const accepted=ui.grid().props;
 expect(accepted.activeExecutionIdentity).toBe('ordinary');expect(accepted.activeBars).toBe(data.bars);expect(accepted.datasets).toBe(before.datasets);expect(accepted.state.cells[target.id].frame.panes[0].manualRange).toEqual({min:10,max:30});
});
it('chart-type navigation discloses resetting a saved manual frame',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const edit=frameEdit(ui);expect(edit.grid.onChange(edit.next,undefined,edit.baseline)).toBe(true);
 find(ui.render(),node=>node.type===ChartTypeMenu).props.onSelect('line');
 expect(ui.grid().props.state.cells[edit.id].frame).toBeUndefined();expect(ui.grid().props.state.cells[edit.id].chartOptions.auto).toBe(true);expect(text(ui.render())).toContain('The price scale went back to auto because the chart changed.');
});
it('actual automatic and editor result paths label data provenance and never export script source as metadata',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const before=ui.grid().props,next=structuredClone(before.state),id=next.layout.activeCellId,code='({onBar(ctx){/* synthetic private strategy body */}})',binding={id:'report-strategy',documentId:'report-document',version:1,name:'Synthetic strategy',source:code,pane:'price',visible:true,plots:{}};
 next.cells[id].scriptBindings=[binding];expect(before.onChange(next)).toBe(true);const grid=ui.grid().props,data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId),source=sourceContextForDataset(data,grid.activeBars),result={plots:[],orders:[],alerts:[],diagnostics:[],provenance:{kind:'synthetic',label:'Synthetic independent result'}},value={bindingId:binding.id,result,bars:grid.activeBars.map((bar:any)=>({...bar})),barIds:grid.activeBars.map((_:any,index:number)=>'synthetic:'+index),sourceCode:code,identity:scriptExecutionIdentity(source,'candles','ordinary'),fixture:true};
 grid.onScriptResult(value,id);ui.button('Strategy tester').props.onClick();const automatic=find(ui.render(),node=>node.type===StrategyDialog).props.execution;
 for(const field of ['providerName','providerId','datasetId','coverage'])expect(automatic.source).toContain(data.provenance[field]);expect(automatic.source).toContain('GME');expect(automatic.source).not.toContain(code);expect(automatic.currency).toBe(data.instrument.currency);expect(automatic.timezone).toBe(next.cells[id].chartOptions.timezone);expect(automatic.identity).not.toBe(data.provenance.datasetId);expect(automatic.standardBars).toBe(grid.activeBars);
 const editor=find(ui.render(),node=>node.type===ScriptLibraryPanel).props;editor.onResult(result,editor.bars,value.barIds,code,binding.id);const manual=find(ui.render(),node=>node.type===StrategyDialog).props.execution;
 expect(manual.source).toBe(automatic.source);expect(manual.identity).not.toBe(automatic.identity);expect(manual.currency).toBe(automatic.currency);
 grid.onScriptResult({...value,sourceCode:code+'// retired'},id);expect(find(ui.render(),node=>node.type===StrategyDialog).props.execution).toBe(manual);
 grid.onScriptResult({...value,identity:'old replay'},id);expect(find(ui.render(),node=>node.type===StrategyDialog).props.execution).toBe(manual);
});
it('actual App report owner retires immediately on Close or accepted property replacement',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();ui.button('Strategy tester').props.onClick();const first=find(ui.render(),node=>node.type===StrategyDialog).props;expect(()=>first.assertOwner()).not.toThrow();first.onClose();expect(()=>first.assertOwner()).toThrow('closed or replaced');expect(()=>first.onChange({...first.config,slippageTicks:2})).toThrow('closed or replaced');
 ui.button('Strategy tester').props.onClick();const next=find(ui.render(),node=>node.type===StrategyDialog).props;expect(()=>next.assertOwner()).not.toThrow();expect(next.onChange({...next.config,slippageTicks:2})).toBe(true);expect(()=>next.assertOwner()).toThrow('properties changed');expect(()=>next.onChange({...next.config,slippageTicks:3})).toThrow('properties changed');
});
it('actual merged Settings Ok publishes the scale change through the frame-safe lease, preserves the opening manual range for Undo and rejects stale Ok',async()=>{
 const ui=setup(Promise.resolve(saved(null)));await flush();const edit=frameEdit(ui);expect(edit.grid.onChange(edit.next,undefined,edit.baseline)).toBe(true);
 const grid=ui.grid().props,data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId),leaseFrames:{closing?:any;opening?:any}={},chart:any={getStyle:()=> 'candles',sourceContext:()=>sourceContextForDataset(data,grid.activeBars),getChartOptions:()=>structuredClone(ui.grid().props.state.cells[edit.id].chartOptions),prepareConfigurationEdit:async(request:any)=>({result:{chartOptions:request.options,config:{},book:{},appearance:null,frame:leaseFrames.closing,openingFrame:leaseFrames.opening},isCurrent:()=>true,commit(){},seal(){},rollback:async()=>{}}),drawings:{undo(){const current=ui.grid().props;current.onDrawingHistory('undo',current.state);}}};
 grid.onReady(chart);ui.render();hooks.effects=[];{const live=ui.grid().props,snapshot={token:{},treeOwner:{},cellId:live.state.layout.activeCellId,controller:chart,instrument:{...data.instrument},input:{bars:live.activeBars,source:sourceContextForDataset(data,live.activeBars),style:'candles'},executionIdentity:live.activeExecutionIdentity,entity:{kind:'price-axis',pane:{kind:'price'},columnOwner:null,unit:'price'},client:null,local:null,point:{price:21,logical:1,barIndex:1,barTime:live.activeBars[1].time,unit:'price',pane:{kind:'price'}}};await expect(live.contextActions.theme(snapshot,{snapshot,isCurrent:()=>true,isOwnerCurrent:()=>true,release:vi.fn()})).resolves.toMatchObject({ok:true});}
 ui.render();const cleanups=hooks.effects.splice(0).map(effect=>effect());await flush();
 try{
  const dialog=find(ui.render(),node=>node.type===ChartSettingsDialog).props;expect(dialog.initialTab).toBe('scales');expect(dialog.scaleMode).toEqual({scale:grid.state.cells[edit.id].chartOptions.scale,invert:grid.state.cells[edit.id].chartOptions.invert,auto:grid.state.cells[edit.id].chartOptions.auto});
  const opening=structuredClone(grid.state.cells[edit.id].frame),closing=structuredClone(opening);closing.panes[0].invert=true;leaseFrames.closing=closing;leaseFrames.opening=opening;
  const options={...dialog.scaleMode,invert:true},commit={themeId:dialog.themeId,appearance:structuredClone(dialog.appearance),chartOptions:options,changed:['chartOptions']};
  expect(await dialog.onApply(dialog.themeId,dialog.appearance,commit)).toBe(true);
  expect(ui.grid().props.state.cells[edit.id].frame.panes[0]).toMatchObject({invert:true,manualRange:{min:11,max:25}});
  await expect(Promise.resolve().then(()=>dialog.onApply(dialog.themeId,dialog.appearance,commit))).rejects.toThrow();
  const requests:any[]=[];ui.grid().props.onTransactionReady({inventory:vi.fn(),apply:vi.fn(async(request:any)=>{requests.push(request);request.commitModel(()=>{});return{publicationErrors:[]};})});
  find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Undo').props.onClick();await flush();
  expect(requests).toHaveLength(1);expect(requests[0].nextState.cells[edit.id].frame.panes[0]).toMatchObject({invert:false,manualRange:{min:11,max:25}});
 }finally{cleanups.forEach(cleanup=>{if(typeof cleanup==='function')cleanup();});}
});
