import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {BottomPanel} from '../../src/ui/BottomPanel';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {IndicatorTemplatesMenu} from '../../src/ui/IndicatorTemplatesMenu';
import {LayoutLibraryDialog} from '../../src/ui/LayoutLibraryDialog';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {WorkspaceRestoreDialog} from '../../src/ui/WorkspaceRestoreDialog';
import {selectedScript,type ScriptLibrary} from '../../src/ui/script-library';
import {saveIndicatorTemplate,createIndicatorTemplates} from '../../src/ui/indicator-templates';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {patchWorkspace,projectGrid} from '../../src/ui/workspace-grid';
import {prepareLayoutSave,duplicateSavedLayout} from '../../src/ui/layout-library';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {aggregateInterval} from '../../src/domain/intervals';
import {fixtureDataset} from '../../src/domain/fixtures';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';

// Every route that remounts the script editor (App's key={scriptEpoch}) keeps a draft typed inside the
// editor's 250 ms save window, in the document it was typed into, and never writes it into a replaced workspace.
// The real App function and the real ScriptLibraryPanel are rendered through two controlled hook scopes: App's effects are
// queued (as in the other App harnesses), the panel's effects run after its host ref is attached, and a key change unmounts
// the panel (its effect cleanups run) before the new instance renders. CodeMirror is a double that hands back the editor's
// update listener. Fake timers drive the save window. No DOM, paint or packaged GUI proof. SYNTHETIC text and data only.
const hooks=vi.hoisted(()=>({scope:'app' as 'app'|'panel',cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,panel:{cells:[] as any[],cursor:0,pending:[] as Array<()=>void>}}));
const views=vi.hoisted(()=>({listeners:[] as ((update:any)=>void)[],docs:[] as string[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const store=()=>hooks.scope==='panel'?hooks.panel:hooks;
 const changed=(deps:any[]|undefined,old:any[]|undefined)=>!old||!deps||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]));
 const memo=(fn:()=>any,deps:any[])=>{const s=store(),index=s.cursor++,old=s.cells[index];if(!old||changed(deps,old.deps))s.cells[index]={deps,value:fn()};return s.cells[index].value;};
 const effect=(fn:()=>unknown,deps:any[])=>{const s=store(),index=s.cursor++,old=s.cells[index];
  if(hooks.scope==='panel'){if(!old||changed(deps,old.deps)){const cell={effect:true,deps,cleanup:old?.cleanup as (()=>void)|undefined};s.cells[index]=cell;hooks.panel.pending.push(()=>{const previous=cell.cleanup;cell.cleanup=undefined;previous?.();const next=fn();cell.cleanup=typeof next==='function'?next as ()=>void:undefined;});}return;}
  if(!old||changed(deps,old)){s.cells[index]=deps;hooks.effects.push(fn);}};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const s=store(),cells=s.cells,index=s.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},
  useRef:(initial:any)=>{const s=store(),index=s.cursor++;if(!(index in s.cells))s.cells[index]={current:initial};return s.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:effect,useLayoutEffect:effect};
});
vi.mock('codemirror',async()=>{const actual=await vi.importActual<any>('codemirror');
 class FakeView{static updateListener={of:(fn:(update:any)=>void)=>{views.listeners.push(fn);return [];}};static theme=()=>[];static lineWrapping=[];
  text:string;state:any;scrollDOM={scrollTop:0};dom={querySelector:()=>null};
  constructor(config:{doc:string}){this.text=config.doc;views.docs.push(config.doc);const self=this;this.state={get doc(){return{toString:()=>self.text,length:self.text.length};},selection:{main:{anchor:0,head:0}}};}
  dispatch(){}destroy(){}focus(){}}
 return {...actual,EditorView:FakeView};});

function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
let panelKey:string|null=null;
function unmountPanel(){for(const cell of hooks.panel.cells)if(cell?.effect&&typeof cell.cleanup==='function')cell.cleanup();hooks.panel={cells:[],cursor:0,pending:[]};}
beforeEach(()=>{hooks.scope='app';hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.panel={cells:[],cursor:0,pending:[]};panelKey=null;views.listeners=[];views.docs=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{unmountPanel();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

/** Boots the real App. `data` is the saved workspace (null: no saved file); without a bridge it is the browser preview. */
async function boot(bridge:any|null){
 vi.stubGlobal('window',bridge?{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()}:{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.scope='app';hooks.cursor=0;return App();};
 render();const start=hooks.effects[0];hooks.effects=[];start();await settle();
 const node=(type:any)=>find(render(),row=>row.type===type);
 const button=(name:string)=>find(render(),row=>row.type==='button'&&(row.props['aria-label']===name||text(row)===name));
 const library=():ScriptLibrary=>node(ScriptLibraryPanel).props.library;
 const grid=()=>node(WorkspaceChartHost).props;
 /** Renders the real editor with App's current element; a changed key unmounts the old instance first. */
 const panel=()=>{const element=node(ScriptLibraryPanel),key=String(element.key);if(panelKey!==null&&panelKey!==key)unmountPanel();panelKey=key;hooks.scope='panel';hooks.panel.cursor=0;let tree:any;try{tree=ScriptLibraryPanel(element.props);}finally{hooks.scope='app';}
  const host=find(tree,row=>row.type==='div'&&row.props.ref&&typeof row.props.ref==='object'&&'current' in row.props.ref);if(host&&!host.props.ref.current)host.props.ref.current={};
  const pending=hooks.panel.pending;hooks.panel.pending=[];for(const run of pending)run();return{tree,key};};
 const openEditor=()=>{node(BottomPanel).props.onChange({open:true,tab:'script',height:320});const shown=panel();if(!views.listeners.length)throw new Error('Synthetic editor view was not built.');return shown;};
 const type=(value:string)=>views.listeners.at(-1)!({docChanged:true,state:{doc:{toString:()=>value}}});
 return{render,node,button,library,grid,panel,openEditor,type,status:()=>text(find(render(),row=>row.type==='output'&&row.props.role==='status'))};
}
type Ui=Awaited<ReturnType<typeof boot>>;
function fakeChart(ui:Ui){
 const dataWindow=()=>{const props=ui.grid(),dataset=props.datasets.find((row:any)=>row.provenance.datasetId===props.activeDatasetId),bars=props.activeBars,source=sourceContextForDataset(dataset,bars);
  return{pending:false,source,series:{count:bars.length,firstTime:bars[0]?.time??null,lastTime:bars.at(-1)?.time??null,style:'candles'},displayed:{bar:null,index:bars.length-1}};};
 return{indicators:{list:()=>[],serialize:()=>[],subscribe:vi.fn(()=>()=>{})},scripts:{list:()=>[],subscribe:()=>()=>{}},saveDrawings:()=>({version:1,drawings:[]}),getDataWindow:dataWindow,drawings:{getTool:()=>null,getMode:()=>null,undo:()=>{}},
  onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{}} as any;
}
const fakeOwner=(applied:any[])=>({inventory:()=>({panes:[{paneId:'price',replaceable:false,owners:[]}],occupiedIds:[]}),apply:async(request:any)=>{applied.push(request);if(!request.assertCurrent())throw new Error('stale');request.commitModel(()=>{});return{committed:true,errors:[],publicationErrors:[]};}}) as any;

describe(' script draft across an editor remount',()=>{
 it('opening a script from the indicator dialog keeps the draft in the document it was typed into',async()=>{
  const ui=await boot(null);ui.grid().onReady(fakeChart(ui));hooks.effects=[];ui.render();
  const first=ui.library().activeId,firstSource=selectedScript(ui.library()).source;
  let shown=ui.openEditor();
  // A second document, made with the editor's own New strategy button, becomes the active one.
  find(shown.tree,row=>row.type==='button'&&text(row)==='New strategy').props.onClick();shown=ui.panel();
  const strategy=ui.library().activeId,draft='({onBar(ctx){/* synthetic draft, open script route */}})';expect(strategy).not.toBe(first);
  ui.type(draft);vi.advanceTimersByTime(100);
  ui.button('Indicators').props.onClick();ui.node(IndicatorDialog).props.onOpenScript(first);
  const after=ui.panel();expect(after.key).not.toBe(shown.key);vi.advanceTimersByTime(1000);
  const library=ui.library();
  expect(library.activeId).toBe(first);
  expect(library.documents.find(row=>row.id===strategy)!.source).toBe(draft);
  expect(selectedScript(library).source).toBe(firstSource);
  expect(views.docs.at(-1)).toBe(firstSource);
 });

 it('applying a template (fresh execution identity) keeps the draft in the active document',async()=>{
  const ui=await boot(null),applied:any[]=[];ui.grid().onTransactionReady(fakeOwner(applied));ui.grid().onReady(fakeChart(ui));hooks.effects=[];ui.render();
  const before=ui.openEditor(),id=ui.library().activeId,draft='({onBar(ctx){/* synthetic draft, template route */}})';
  ui.type(draft);vi.advanceTimersByTime(100);
  ui.button('Indicator templates').props.onClick();ui.node(IndicatorTemplatesMenu).props.onManage();
  const record=saveIndicatorTemplate(createIndicatorTemplates(),'R37 synthetic',{indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=>'r37-template-id').records[0]!;
  const preview=await ui.node(IndicatorTemplatesDialog).props.previewApply(record);await preview.apply();
  expect(applied).toHaveLength(1);expect(ui.status()).toContain('Template applied.');
  const after=ui.panel();expect(after.key).not.toBe(before.key);vi.advanceTimersByTime(1000);
  expect(ui.library().activeId).toBe(id);expect(selectedScript(ui.library()).source).toBe(draft);
  expect(views.docs.at(-1)).toBe(draft);
 });

 it('a layout switch keeps the draft in the workspace-wide script library',async()=>{
  let state=createInitialWorkspace(),sequence=0;state.layoutLibrary=prepareLayoutSave(state.layoutLibrary!,state.grid!,100);state.layoutLibrary.autosave=false;
  const dailySpy=patchWorkspace(state,{symbol:'SPY',sourceId:null}),spy=selectWorkspaceInterval(dailySpy,aggregateInterval(fixtureDataset('SPY',500),'1W',state.intervals.policy).dataset,state.intervals);state={...projectGrid(state,state.grid!),imports:spy.imports};
  const duplicate=duplicateSavedLayout(state.layoutLibrary!,state.grid!,spy.grid!,'SPY synthetic study',100,()=>'saved-'+(++sequence));state.layoutLibrary=duplicate.library;
  const data=prepareWorkspaceJSON({...state,paper:createPaperAccount({initialBalance:12345}),alerts:[]});let revision=2;
  const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-23T12:00:00Z',data,storage:{directory:'Synthetic test profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async()=>({ok:true,value:{revision:++revision,savedAt:'2026-10-23T12:00:00Z'}})),importData:vi.fn(),exportData:vi.fn()};
  const ui=await boot(bridge);
  ui.grid().onTransactionReady({suspend:()=>({isCurrent:()=>true,resume:vi.fn()})});
  const transition=vi.fn(async(request:any)=>{expect(request.assertCurrent()).toBe(true);request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:[] as string[]};});ui.grid().onHostReady({transition,cancel:vi.fn()});
  const before=ui.openEditor(),id=ui.library().activeId,draft='({onBar(ctx){/* synthetic draft, layout route */}})';
  ui.type(draft);vi.advanceTimersByTime(100);
  ui.button('Open layouts').props.onClick();await ui.node(LayoutLibraryDialog).props.onAction({kind:'open',id:duplicate.entry.id});
  expect(transition).toHaveBeenCalledOnce();expect(ui.grid().state.layout.id).toBe(duplicate.entry.id);
  const after=ui.panel();expect(after.key).not.toBe(before.key);vi.advanceTimersByTime(1000);
  expect(ui.library().activeId).toBe(id);expect(selectedScript(ui.library()).source).toBe(draft);
  ui.openEditor();expect(views.docs.at(-1)).toBe(draft);
 });

 async function replacementUi(){
  let revision=2;
  const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:null,data:null,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async()=>({ok:true,value:{revision:++revision,savedAt:'2026-10-23T12:00:00.000Z'}})),resetWorkspace:vi.fn(async()=>({ok:true,value:{revision:++revision}})),executeScript:vi.fn(),importData:vi.fn(),exportWorkspace:vi.fn()};
  const ui=await boot(bridge);return{ui,bridge,storage:()=>ui.node(ChartSettingsDialog).props.dataSources.props.storage};
 }
 const exportText=()=>JSON.stringify({schemaVersion:1,data:prepareWorkspaceJSON({...patchWorkspace(createInitialWorkspace(),{symbol:'SPY',sourceId:null}),paper:createPaperAccount({initialBalance:54321}),alerts:[]})});

 it('restoring a workspace keeps the draft in the old workspace and never writes it into the replacement',async()=>{
  const {ui,bridge,storage}=await replacementUi(),before=ui.openEditor(),id=ui.library().activeId,original=selectedScript(ui.library()).source;
  const draft='({onBar(ctx){/* synthetic draft, restore route */}})',late='({onBar(ctx){/* synthetic keystroke during review */}})';
  ui.type(draft);vi.advanceTimersByTime(100);
  // Opening the review (Data sources settings) saves the draft into the workspace that is still current.
  ui.button('Local storage').props.onClick();
  expect(selectedScript(ui.library()).source).toBe(draft);
  storage().onRestore();ui.type(late);vi.advanceTimersByTime(100);
  const review=ui.node(WorkspaceRestoreDialog).props.onPreview(exportText());await review.apply();
  expect(bridge.saveWorkspace).toHaveBeenCalledOnce();
  const replaced=ui.library();
  // The replacement holds a document with the same id (Option B's hazard), and the factory source.
  expect(replaced.activeId).toBe(id);expect(selectedScript(replaced).source).toBe(original);
  // The old editor's timer fires before React remounts it: nothing reaches the replacement.
  vi.advanceTimersByTime(1000);
  expect(selectedScript(ui.library()).source).toBe(original);expect(ui.library()).toBe(replaced);
  const after=ui.panel();expect(after.key).not.toBe(before.key);vi.advanceTimersByTime(1000);
  expect(selectedScript(ui.library()).source).toBe(original);
 });

 it('resetting the workspace keeps the draft in the old workspace and never writes it into the fresh one',async()=>{
  const {ui,bridge,storage}=await replacementUi(),before=ui.openEditor(),original=selectedScript(ui.library()).source;
  const draft='({onBar(ctx){/* synthetic draft, reset route */}})',late='({onBar(ctx){/* synthetic keystroke before reset */}})';
  ui.type(draft);vi.advanceTimersByTime(100);
  ui.button('Local storage').props.onClick();
  expect(selectedScript(ui.library()).source).toBe(draft);
  ui.type(late);vi.advanceTimersByTime(100);
  await storage().onReset();
  expect(bridge.resetWorkspace).toHaveBeenCalledOnce();
  const fresh=ui.library();expect(selectedScript(fresh).source).toBe(original);
  vi.advanceTimersByTime(1000);
  expect(ui.library()).toBe(fresh);
  const after=ui.panel();expect(after.key).not.toBe(before.key);vi.advanceTimersByTime(1000);
  expect(selectedScript(ui.library()).source).toBe(original);
 });
});
