import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DrawingManagerDialog} from '../../src/ui/DrawingManagerDialog';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {BarsPatternResolutionChip} from '../../src/ui/BarsPatternSource';
import {DrawingEditBar} from '../../src/ui/drawing-edit-bar';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createDrawingPreferencesPort} from '../../src/chart/drawing-preferences-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {objectTreeHarness} from './object-tree-panel-harness';

// (fail-first): edits made while the routine background autosave holds the chart (App.tsx persistLayoutCandidate
// > owner.suspend -> adapter.ts suspendTree) that left out: a native drag or inline text edit (published into
// the hold and dropped at its release(publish=false): the chart shows it, the workspace never records it), Ctrl+X (neither
// held nor routed: nothing happened), the Drawing manager dialog (a render during the write made it terminal: "Drawing
// manager chart input changed. Close and reopen this manager."), the Bars pattern interval chip (refused: "unavailable while
// the chart is busy"), drawing favorites (refused silently) and the magnet and Stay in drawing mode toggles (refused: "A chart
// transaction is finishing").
// Actual App closures (autosave timer, storage mutation, held-input queue, history, save path) and the real
// DrawingManagerDialog handlers, over the actual drawing-manager port and native Vela drawing controller
// (object-tree-panel-harness.ts). The chart hold is modeled on the adapter: owner checks and busy routes throw while held; a
// publication made while held is held back through the ACTUAL held-drawing publication policy
// (src/chart/held-drawing-publication.ts, wired as adapter.ts wires it: tests/chart/r36-held-drawing-adapter.test.ts runs the
// adapter lines). The grid's capture of a chart publication commits the chart's saved drawings through the host onChange, and
// its forwarding of the chart's held-change notice goes to the host onHeldDrawingChange (MultiChartGrid GridCell).
// SYNTHETIC values only; no DOM, focus engine, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},useLayoutEffect:()=>{}};
});
// The policy module is new in . On the base it is absent: the chart model then drops a held publication at the
// release exactly as the adapter did (its only behaviour before), so the checks below fail by assertion.
const heldModule:Record<string,any>=await import('../../src/chart/held-drawing-publication').catch(()=>({}));
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node)){for(const child of node)findAll(child,test,out);}else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
const find=(node:any,test:(node:any)=>boolean):any=>findAll(node,test)[0]??null;
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
const WAIT='The workspace is saving. The drawing change applies when the save finishes.';
const REFUSALS=['chart input changed','unavailable while the chart is busy','A chart transaction is finishing','The chart is busy'];
let disposers:Array<()=>void>=[];
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});});
afterEach(()=>{for(const dispose of disposers.splice(0))dispose();vi.useRealTimers();vi.unstubAllGlobals();});
const press=(key:string,mods:{ctrlKey?:boolean}={})=>({key,ctrlKey:!!mods.ctrlKey,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{tagName:'BODY',closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),stopPropagation:vi.fn()});

async function setup(){
 const h=await objectTreeHarness({drawings:['line-a','line-b','line-c']});disposers.push(h.dispose);
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 // The chart hold (see the header).
 const hold={on:false,dirty:false},subscribers=new Set<()=>void>();
 const publish=()=>{for(const callback of [...subscribers])callback();};
 const policy=typeof heldModule.createHeldDrawingPublication==='function'?heldModule.createHeldDrawingPublication({publish,live:()=>true,report:(error:unknown)=>{throw error;}}):null;
 const publishChart=()=>{if(hold.on){hold.dirty=true;policy?.held();return;}policy?.published();publish();};
 h.chart.onDrawingsChanged(publishChart);
 const ownerCheck=()=>{if(hold.on)throw Error('Drawing manager chart input changed. Close and reopen this manager.');};
 const busy=(what:string)=>{if(hold.on)throw Error(what+' is unavailable while the chart is busy or unavailable.');};
 // The canonical document, as the adapter keeps it: native geometry and text (reconcileNativeDrawings) plus manager metadata.
 const saveDrawings=()=>{const doc=structuredClone(h.doc()) as any,live=new Map(h.nativeRows().map(row=>[row.id,row]));doc.drawings=doc.drawings.filter((row:any)=>live.has(row.id)).map((row:any)=>({...row,anchors:structuredClone((live.get(row.id) as any).anchors),text:structuredClone((live.get(row.id) as any).text)}));return doc;};
 const physical={magnet:'off' as 'off'|'weak'|'strong',stay:false};
 const preferences=createDrawingPreferencesPort({read:()=>({...physical}),setMagnet:(mode:'off'|'weak'|'strong')=>{busy('Drawing preferences');physical.magnet=mode;},setStay:(on:boolean)=>{busy('Drawing preferences');physical.stay=on;},onSnap:()=>()=>{},onStay:()=>()=>{}} as any);
 const clipboard:{rows:any[]}={rows:[]},selection:{ids:string[]}={ids:[]};
 const chart:any={...h.chart,
  captureDrawingManagerOwner:()=>{ownerCheck();return ownerCheck;},
  onDrawingsChanged:(callback:()=>void)=>{subscribers.add(callback);return()=>{subscribers.delete(callback);};},
  setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},isInputOwned:()=>true,isInputCurrent:()=>true,
  saveDrawings,getSourceBars:()=>bars,getSourceContext:()=>source,previewDrawingEdit:vi.fn(),clearDrawingPreview:vi.fn(),
  getDrawingEditor:(id:string)=>{const record=h.nativeRows().find(row=>row.id===id);if(!record)throw Error('Selected drawing no longer exists');return{type:record.type,values:{},recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution};},
  drawingPreferences:preferences,
  drawingUtility:{
   // The adapter's cut is a router command (assertMutable): refused while held.
   cutSelection:vi.fn(()=>{busy('Drawing Cut');const list=[...selection.ids];if(!list.length)return 0;clipboard.rows=h.nativeRows().filter(row=>list.includes(row.id));h.manager.remove(list);return list.length;}),
   copySelection:vi.fn(),paste:vi.fn(),canZoomOut:()=>false,apply:()=>{},onChangeFromChart:()=>()=>{},observeZoomContext:()=>{},zoomOut:()=>{},zoomCommit:()=>{},
  },
  onHeldDrawingChange:policy?(callback:()=>void)=>policy.subscribe(callback):undefined,
  publishHeldDrawings:policy?()=>policy.flush():undefined,
 };
 const coordinator={suspend:vi.fn((_expected:unknown,_options?:unknown)=>{hold.on=true;const lease=policy?.hold();return{isCurrent:()=>true,resume:()=>{const dirty=hold.dirty;hold.on=false;hold.dirty=false;lease?.release(dirty);}};})};
 let revision=4;const initial=createInitialWorkspace();
 const data=prepareWorkspaceJSON({...initial,paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-23T00:00:00Z',data,storage:{directory:'Synthetic R36 profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-23T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null),addEventListener:vi.fn(),removeEventListener:vi.fn(),activeElement:null});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 grid().onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 // The grid: its capture of a chart drawing publication (captureCell), and GridCell's forwarding of the held-change notice.
 const published:boolean[]=[];
 subscribers.add(()=>{const state=structuredClone(grid().state);state.cells[state.layout.activeCellId].drawings=chart.saveDrawings();published.push(grid().onChange(state));});
 chart.onHeldDrawingChange?.(()=>{grid().onHeldDrawingChange?.(chart);});
 grid().onReady(chart);effects();
 publishChart();published.splice(0);
 const shown=()=>text(render());
 const savedDrawings=()=>grid().state.cells[grid().state.layout.activeCellId].drawings;
 const settle=async()=>{effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();};
 await settle();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 /** Starts the routine autosave and holds its write open; the returned function ends the write. */
 const startSave=async()=>{
  const pending=deferred();bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
  const state=structuredClone(grid().state);state.cells[state.layout.activeCellId].appearance.background='#13579b';expect(grid().onChange(state)).toBe(true);
  effects();await vi.advanceTimersByTimeAsync(1300);await flush();
  expect(bridge.saveWorkspace,'the routine autosave is writing').toHaveBeenCalledOnce();expect(hold.on,'the chart is held for the write').toBe(true);
  return async()=>{pending.resolve({ok:true,value:{revision:revision+=1,savedAt:'2026-10-23T00:00:02Z'}});await flush();effects();expect(hold.on).toBe(false);};
 };
 const listener=(type:string)=>win.addEventListener.mock.calls.filter((call:any[])=>call[0]===type).at(-1)?.[1] as ((event:any)=>void);
 const select=(ids:string[])=>{selection.ids=[...ids];h.facade.select(ids);effects();};
 /** The last workspace file written: what a relaunch loads. */
 const lastWritten=()=>{const call=bridge.saveWorkspace.mock.calls.at(-1)?.[0];return call?JSON.stringify(call):'';};
 /** App's workspace history (createWorkspaceHistory, held in one of App's refs). */
 const history=()=>{const cell=hooks.cells.find(value=>value?.current&&typeof value.current.peekUndo==='function'&&typeof value.current.status==='function');if(!cell)throw Error('Missing workspace history');return cell.current as {status:()=>{undo:number;redo:number};peekUndo:()=>{workspace:unknown}|undefined};};
 return{history,h,chart,hold,bridge,coordinator,render,grid,effects,shown,savedDrawings,settle,startSave,published,listener,select,lastWritten,publishChart,physical};
}
type Ui=Awaited<ReturnType<typeof setup>>;
const native=(ui:Ui,id:string)=>ui.h.nativeRows().find(row=>row.id===id) as any;
const savedRow=(ui:Ui,id:string)=>((ui.savedDrawings() as any).drawings as any[]).find(row=>row.id===id);
const noRefusal=(ui:Ui)=>{const shown=ui.shown();for(const refusal of REFUSALS)expect(shown,'no refusal is shown').not.toContain(refusal);};
/** A native gesture on the chart: vela changes the drawing itself and emits drawing:edited (adapter updateDocument). */
const nativeEdit=(ui:Ui,id:string,patch:Record<string,unknown>)=>{ui.h.facade.update(id,patch as any);ui.publishChart();};
const movedAnchors=(ui:Ui,id:string)=>{const anchors=structuredClone(native(ui,id).anchors);anchors[1]={...anchors[1],price:anchors[1].price+25};return anchors;};
const undoKey=(ui:Ui)=>ui.listener('keydown')(press('z',{ctrlKey:true}));

it('drag of an anchor during the background autosave: published after the write as one undo step, written by the next autosave',async()=>{
 const ui=await setup(),anchors=movedAnchors(ui,'line-a'),before=structuredClone(savedRow(ui,'line-a').anchors);
 const finish=await ui.startSave(),stepsBefore=ui.history().status().undo;
 nativeEdit(ui,'line-a',{anchors});
 expect(native(ui,'line-a').anchors[1].price,'the chart shows the drag at once').toBe(anchors[1].price);
 expect(ui.published,'nothing is published inside the write').toEqual([]);
 expect(ui.shown()).toContain(WAIT);
 await finish();
 expect(ui.published,'one publication when the write ends: one workspace step').toEqual([true]);
 expect(savedRow(ui,'line-a').anchors[1].price,'the workspace records the drag').toBe(anchors[1].price);
 expect(ui.shown()).not.toContain(WAIT);noRefusal(ui);
 // Save and relaunch: the next autosave writes the moved anchor.
 await ui.settle();expect(ui.lastWritten()).toContain(String(anchors[1].price));
 // It is its own undo step: the workspace history gained exactly one entry, and that entry is the state before the drag.
 expect(ui.history().status().undo,'one undo step for the drag').toBe(stepsBefore+1);
 const entry=ui.history().peekUndo()!.workspace as any;
 expect(entry.grid.cells[entry.grid.layout.activeCellId].drawings.drawings.find((row:any)=>row.id==='line-a').anchors[1].price,'Undo restores the anchor as it was').toBe(before[1].price);
});

it('inline text edit and a body drag on two drawings during the write: one publication carries both, nothing is lost',async()=>{
 const ui=await setup(),anchors=movedAnchors(ui,'line-b');
 const finish=await ui.startSave();
 nativeEdit(ui,'line-c',{text:{...(native(ui,'line-c').text??{}),value:'Breakout'}});
 nativeEdit(ui,'line-b',{anchors});
 await finish();
 expect(ui.published,'one queued publication per chart').toEqual([true]);
 expect(savedRow(ui,'line-c').text.value).toBe('Breakout');expect(savedRow(ui,'line-b').anchors[1].price).toBe(anchors[1].price);
 await ui.settle();expect(ui.lastWritten()).toContain('Breakout');
});

it('a drag during the write, then an ordinary edit after it: no duplicate step, the saved state matches the chart',async()=>{
 const ui=await setup(),anchors=movedAnchors(ui,'line-a');
 const finish=await ui.startSave();
 nativeEdit(ui,'line-a',{anchors});
 await finish();
 ui.h.manager.set(['line-b'],{locked:true});
 expect(ui.published,'the queued publication and the later lock, nothing else').toEqual([true,true]);
 expect(savedRow(ui,'line-a').anchors[1].price).toBe(anchors[1].price);expect(savedRow(ui,'line-b').locked).toBe(true);
});

it('Ctrl+X during the write: the selection is cut when the write ends and the cut is saved',async()=>{
 const ui=await setup();ui.select(['line-c']);
 const finish=await ui.startSave();
 const key=press('x',{ctrlKey:true});ui.listener('keydown')(key);
 expect(key.preventDefault,'the held key is taken').toHaveBeenCalled();
 expect(native(ui,'line-c'),'nothing is cut inside the write').toBeTruthy();
 await finish();
 expect(ui.chart.drawingUtility.cutSelection).toHaveBeenCalledTimes(1);
 expect(native(ui,'line-c')).toBeUndefined();expect(savedRow(ui,'line-c')).toBeUndefined();noRefusal(ui);
});

it('Drawing manager open during the write: it stays usable, and Lock waits for the write, then applies and is saved',async()=>{
 const ui=await setup();
 const tree=()=>{let widget=find(ui.render(),node=>node.props?.objectTree);if(!widget){find(ui.render(),node=>node.type==='button'&&(text(node)==='Object tree and data window'||node.props['aria-label']==='Object tree and data window')).props.onClick();widget=find(ui.render(),node=>node.props?.objectTree);}return widget.props.objectTree;};
 tree().onManageDrawings();ui.effects();
 const props=()=>{const found=find(ui.render(),node=>node.type===DrawingManagerDialog);if(!found)throw Error('Missing Drawing manager');return found.props;};
 const dialog=()=>{hooks.cursor=400000;return DrawingManagerDialog(props());};
 const button=(name:string)=>{const found=find(dialog(),node=>node.type==='button'&&text(node)===name);if(!found)throw Error('Missing button '+name);return found;};
 const box=findAll(dialog(),node=>node.type==='label').find(label=>text(label).includes('line-a'));
 ui.effects();find(box,node=>node.type==='input').props.onChange();
 expect(text(dialog())).toContain('1 selected');
 const finish=await ui.startSave();
 const during=dialog();
 expect(text(during),'the manager is not made terminal by a render during the write').not.toContain('chart input changed');
 expect(text(during),'its rows stay listed').toContain('line-a');
 button('Lock').props.onClick();
 expect(native(ui,'line-a').locked,'nothing is applied inside the write').not.toBe(true);
 expect(text(dialog())).not.toContain('chart input changed');
 await finish();
 expect(native(ui,'line-a').locked,text(dialog())+' | '+ui.shown().slice(0,400)).toBe(true);expect(savedRow(ui,'line-a').locked).toBe(true);
 expect(text(dialog())).not.toContain('chart input changed');noRefusal(ui);
});

it('drawing favorites during the write: the change waits for the write, then is applied and saved',async()=>{
 const ui=await setup();
 const toolbar=()=>find(ui.render(),node=>node.type===DrawingToolbar).props;
 expect(toolbar().favorites).toEqual([]);
 const finish=await ui.startSave();
 toolbar().onFavoritesChange(['trendline']);
 expect(toolbar().favorites,'nothing is applied inside the write').toEqual([]);
 await finish();
 expect(toolbar().favorites).toEqual(['trendline']);
 await ui.settle();expect(ui.lastWritten()).toContain('"drawingFavorites":["trendline"]');
});

it('Stay in drawing mode and magnet during the write: both wait for the write, then apply in order and are saved',async()=>{
 const ui=await setup();
 const stay=()=>find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Stay in drawing mode');
 const magnet=()=>find(ui.render(),node=>node.props?.onToggle&&node.props?.preferences);
 expect(stay().props['aria-pressed']).toBe(false);
 const finish=await ui.startSave();
 stay().props.onClick();magnet().props.onSelect('strong');
 expect(ui.physical,'nothing is applied inside the write').toEqual({magnet:'off',stay:false});
 noRefusal(ui);
 await finish();
 expect(ui.physical).toEqual({magnet:'strong',stay:true});
 expect(stay().props['aria-pressed']).toBe(true);noRefusal(ui);
 await ui.settle();expect(ui.lastWritten()).toContain('"stay":true');expect(ui.lastWritten()).toContain('"magnet":"strong"');
});

it('Bars pattern interval chip: App hands it the held-input queue (a choice made during the write waits and runs after it)',async()=>{
 const ui=await setup();ui.select(['line-a']);
 // The chip is the selected-drawing toolbar's extra control (App passes it as DrawingEditBar's extra prop).
 const chip=()=>{const bar=find(ui.render(),node=>node.type===DrawingEditBar);const extra=bar?.props.extra;return extra?.type===BarsPatternResolutionChip?extra:find(extra,(node:any)=>node.type===BarsPatternResolutionChip);};
 expect(chip(),'the chip is mounted for the selected drawing').toBeTruthy();
 const finish=await ui.startSave();
 const run=vi.fn();
 expect(typeof chip().props.deferEdit,'App passes the queue to the chip').toBe('function');
 expect(chip().props.deferEdit(run,'line-a'),'queued during the write').toBe(true);
 expect(run).not.toHaveBeenCalled();
 await finish();
 expect(run).toHaveBeenCalledTimes(1);
 expect(chip().props.deferEdit(run,'line-a'),'after the write the chip applies at once').toBe(false);
});
