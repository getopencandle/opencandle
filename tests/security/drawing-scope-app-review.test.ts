import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {FundamentalsDialog} from '../../src/ui/FundamentalsDialog';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';
import {sourceContextForDataset} from '../../src/chart/source-context';
// Actual App callbacks only; no mounted chart, IPC or desktop evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function label(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(label).join(''):node?.props?label(node.props.children):'';}
/** RPST start-selection flow: click Replay, then click the chart tree over bar `index` (the hovered bar comes from a stub chart data window; the stub chart is then released). */
function startReplay(ui:any,index=100){find(ui.render(),(node:any)=>node.type==='button'&&label(node).endsWith(' Replay')).props.onClick();const grid=ui.grid().props??ui.grid(),bars=grid.activeBars,data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId);
 grid.onReady({drawings:{getMode:()=>null,getTool:()=>null},getStyle:()=>grid.state.cells[grid.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,bars),getDataWindow:()=>({standard:{hovered:true,bar:bars[Math.min(index,bars.length-1)]}})});
 find(ui.render(),(node:any)=>node.props?.className==='chart-workspace').props.onClickCapture({target:{closest:(selector:string)=>selector==='[data-chart-tree]'?{}:null},preventDefault(){},stopPropagation(){}});(ui.grid().props??ui.grid()).onReady(null);}
async function setup(){const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:7,savedAt:'2026-10-14T17:00:00Z',data:null,storage:{directory:'Synthetic drawing review profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(),executeScript:vi.fn()};vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects.shift()!;hooks.effects=[];boot();for(let i=0;i<8;i++)await Promise.resolve();return{bridge,render,grid:()=>find(render(),node=>node.type===WorkspaceChartHost).props,watch:()=>find(render(),node=>node.type===WatchlistPanel).props};}
const document=(id:string)=>({version:1,drawings:[{id,type:'trendline',paneId:'price',anchors:[{time:1704153600,price:100.005},{time:1704240000,price:101.25}],style:{lineColor:'#123456'},visible:true,locked:false}]});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('a retained old-source drawing capture cannot restore GME after accepted SPY navigation',async()=>{
 const ui=await setup(),first=ui.grid(),id=first.state.layout.activeCellId,withGme=structuredClone(first.state);withGme.cells[id].drawings=document('synthetic-gme');expect(first.onChange(withGme)).toBe(true);
 const opening=ui.grid(),oldCapture=opening.onChange,late=structuredClone(opening.state);late.cells[id].drawings=document('synthetic-old-gme-edit');
 const spy=opening.datasets.find((data:any)=>data.instrument.symbol==='SPY'&&data.provenance.fixture&&data.resolution==='1D');ui.watch().onOpen(spy);
 const before=ui.grid(),serialized=JSON.stringify(before.state);expect(before.state.layout.cells.find((row:any)=>row.id===id).symbol).toBe('SPY');expect(before.state.cells[id].drawingScopes.inactive[0].document).toEqual(document('synthetic-gme'));
 expect(oldCapture(late)).toBe(false);expect(JSON.stringify(ui.grid().state)).toBe(serialized);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});

it('an owned same-event focus then frame publication remains valid after the opening owner advances itself',async()=>{
 const ui=await setup(),first=ui.grid(),next=resizeMultiChartState(first.state,'two-columns'),second=next.layout.cells[1],gme=first.datasets.find((data:any)=>data.instrument.symbol==='GME'),spy=first.datasets.find((data:any)=>data.instrument.symbol==='SPY');
 second.symbol='SPY';second.interval=spy.resolution;next.cells[second.id]={...transitionDrawingScope(next.cells[second.id],gme,spy),datasetId:spy.provenance.datasetId};expect(first.onChange(next)).toBe(true);
 const opening=ui.grid(),ownedSpy=opening.datasets.find((data:any)=>data.instrument.symbol==='SPY'&&data.provenance.datasetId===spy.provenance.datasetId),focus={...opening.state,layout:{...opening.state.layout,activeCellId:second.id}};expect(opening.onChange(focus)).toBe(true);
 // No App render occurs between accepted focus and the owned frame gesture.
 const source=sourceContextForDataset(ownedSpy,ownedSpy.bars),frame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};
 const closing=structuredClone(focus);closing.cells[second.id].frame={...frame,panes:[{...frame.panes[0],manualRange:{min:11,max:25}}]};closing.cells[second.id].chartOptions={...closing.cells[second.id].chartOptions,auto:false};
 const baseline={kind:'native-frame',expectedGrid:focus,frames:{[second.id]:frame},viewports:{[second.id]:{from:100,to:200}},inputs:{[second.id]:{source,bars:ownedSpy.bars,style:'candles',executionIdentity:'ordinary'}}};
 expect(opening.onChange(closing,undefined,baseline)).toBe(true);expect(ui.grid().state.cells[second.id].frame.panes[0].manualRange).toEqual({min:11,max:25});
});

it('an analysis dialog callback cannot publish after synchronous Close before child cleanup',async()=>{
 const ui=await setup();find(ui.render(),node=>node.type==='button'&&node.props.children==='Fundamentals').props.onClick();
 const opening=find(ui.render(),node=>node.type===FundamentalsDialog).props;opening.onClose();expect(()=>opening.onChange([])).toThrow(/closed|replaced/);expect(find(ui.render(),node=>node.type===FundamentalsDialog)).toBeNull();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('a second retained analysis publication cannot overwrite its first accepted field replacement before rerender',async()=>{
 const ui=await setup();find(ui.render(),node=>node.type==='button'&&node.props.children==='Fundamentals').props.onClick();
 const opening=find(ui.render(),node=>node.type===FundamentalsDialog).props,first:any[]=[];expect(opening.onChange(first)).toBe(true);expect(()=>opening.onChange([])).toThrow(/data changed|current view/);const current=find(ui.render(),node=>node.type===FundamentalsDialog).props;expect(current.documents).toBe(first);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});

it('shrinking away the active SPY replay stages exact GME full history and Undo restores a fresh paused SPY replay',async()=>{
 const ui=await setup(),first=ui.grid(),next=resizeMultiChartState(first.state,'two-columns'),second=next.layout.cells[1],gme=first.datasets.find((data:any)=>data.instrument.symbol==='GME'),spy=first.datasets.find((data:any)=>data.instrument.symbol==='SPY');second.symbol='SPY';second.interval=spy.resolution;next.cells[second.id]={...transitionDrawingScope(next.cells[second.id],gme,spy),datasetId:spy.provenance.datasetId};next.layout.activeCellId=second.id;expect(first.onChange(next)).toBe(true);
 startReplay(ui);const opening=ui.grid(),requests:any[]=[],host={cancel:vi.fn(),transition:vi.fn(async(request:any)=>{requests.push(request);expect(request.assertCurrent()).toBe(true);request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:[]};})};expect(opening.activeExecutionIdentity).not.toBe('ordinary');expect(opening.activeBars.length).toBeLessThan(spy.bars.length);opening.onHostReady(host);opening.onTransactionReady({inventory:vi.fn(),apply:vi.fn()});
 const shrink=resizeMultiChartState(opening.state,'single');expect(await opening.onRequestResize(opening.state,shrink)).toBe(true);expect(requests).toHaveLength(1);expect(requests[0].expected.activeBars).toBe(opening.activeBars);expect(requests[0].expected.activeExecutionIdentity).toBe(opening.activeExecutionIdentity);expect(requests[0].next.activeExecutionIdentity).toBe('ordinary');expect(requests[0].next.activeDatasetId).toBe(gme.provenance.datasetId);const ownedGme=opening.datasets.find((data:any)=>data.provenance.datasetId===gme.provenance.datasetId);expect(requests[0].next.activeBars).toBe(ownedGme.bars);expect(ui.grid().activeBars).toBe(ownedGme.bars);
 find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Undo').props.onClick();for(let i=0;i<10;i++)await Promise.resolve();expect(requests).toHaveLength(2);expect(requests[1].next.state.layout.activeCellId).toBe(second.id);expect(requests[1].next.activeExecutionIdentity).not.toBe('ordinary');expect(requests[1].next.activeExecutionIdentity).not.toBe(opening.activeExecutionIdentity);expect(requests[1].next.activeBars).toEqual(opening.activeBars);expect(ui.grid().state.layout.cells.map((row:any)=>row.id)).toEqual(opening.state.layout.cells.map((row:any)=>row.id));
});
