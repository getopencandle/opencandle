import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {IndicatorTemplatesMenu} from '../../src/ui/IndicatorTemplatesMenu';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {saveIndicatorTemplate,createIndicatorTemplates,templateSource} from '../../src/ui/indicator-templates';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// The real App component function is rendered through an explicit
// React scheduling harness (same technique as claude-app-integration.test.ts), a template is applied through the
// dialog's previewApply -> apply path, and the history Undo is then dispatched through the chart host's
// onDrawingHistory. Observed: the execution identity (ScriptLibraryPanel key), the identity handed to the grid
// transaction owner, and the committed source. Not a DOM, canvas, native-window or packaged-executable test. SYNTHETIC.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}
 };
});
function find(node:any,test:(node:any)=>boolean):any{
 if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}
 else if(node?.props){if(test(node))return node;return find(node.props.children,test);}
 return null;
}
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

async function setup(){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const node=(type:any)=>find(render(),row=>row.type===type);
 const click=(name:string)=>find(render(),row=>row.type==='button'&&(row.props['aria-label']===name||content(row)===name)).props.onClick();
 const status=()=>content(find(render(),row=>row.type==='output'&&row.props.role==='status'));
 return{render,node,click,status,grid:()=>node(WorkspaceChartHost).props};
}

/** A coordinator that behaves like the real owner for this path: it runs commitModel exactly once and records what it was given. */
function fakeOwner(applied:any[]){
 return{inventory:()=>({panes:[{paneId:'price',replaceable:false,owners:[]}],occupiedIds:[]}),apply:async(request:any)=>{applied.push(request);if(!request.assertCurrent())throw new Error('stale');request.commitModel(()=>{});return{committed:true,errors:[],publicationErrors:[]};}} as any;
}
function fakeChart(ui:Awaited<ReturnType<typeof setup>>,undo:()=>void){
 const dataWindow=()=>{const props=ui.grid(),dataset=props.datasets.find((row:any)=>row.provenance.datasetId===props.activeDatasetId),bars=props.activeBars,source=sourceContextForDataset(dataset,bars);
  return{pending:false,source,series:{count:bars.length,firstTime:bars[0]?.time??null,lastTime:bars.at(-1)?.time??null,style:'candles'},displayed:{bar:null,index:bars.length-1}};};
 return{indicators:{list:()=>[],serialize:()=>[],subscribe:vi.fn(()=>()=>{})},saveDrawings:()=>({version:1,drawings:[]}),getDataWindow:dataWindow,drawings:{getTool:()=>null,getMode:()=>null,undo},
  onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{}} as any;
}

function template(ui:Awaited<ReturnType<typeof setup>>,sourceSymbol:string|null){
 const props=ui.grid(),target=sourceSymbol?props.datasets.find((row:any)=>row.instrument.symbol===sourceSymbol):null;
 const library=saveIndicatorTemplate(createIndicatorTemplates(),'R4R policy',{indicators:[],scripts:[],rememberSymbol:!!target,rememberInterval:false,source:target?templateSource(target):null},()=>'r4r-template-id');
 return library.records[0]!;
}
async function open(){
 const ui=await setup(),applied:any[]=[],undone:any[]=[];
 ui.grid().onTransactionReady(fakeOwner(applied));
 ui.grid().onReady(fakeChart(ui,()=>{undone.push(ui.status());ui.grid().onDrawingHistory('undo',ui.grid().state);}));
 hooks.effects=[];ui.render();ui.click('Indicator templates');
 // R17: the toolbar button opens the templates dropdown; Manage templates opens the dialog.
 ui.node(IndicatorTemplatesMenu).props.onManage();
 const dialog=()=>ui.node(IndicatorTemplatesDialog).props;
 const epoch=()=>String(ui.node(ScriptLibraryPanel).key),identity=()=>String(ui.node(ScriptLibraryPanel).props.identity);
 return{ui,applied,undone,dialog,epoch,identity};
}

describe('R4R-3 template replay policy through the rendered App',()=>{
 it('a same-source template keeps the source and replay prefix and still mints a fresh execution identity',async()=>{
  const {ui,applied,dialog,epoch}=await open(),before=epoch(),sourceBefore=ui.grid().activeDatasetId;
  const preview=await dialog().previewApply(template(ui,null));
  expect(preview.lines.join(' ')).toContain('Keep the current source and replay prefix.');
  await preview.apply();
  expect(applied).toHaveLength(1);
  expect(applied[0].nextExecutionIdentity).toBe(applied[0].activeExecutionIdentity);
  expect(ui.grid().activeDatasetId).toBe(sourceBefore);
  expect(epoch()).not.toBe(before);
  expect(ui.status()).toContain('Template applied.');
 });
 it('a source-changing template switches the source, drops the replay identity and mints a fresh execution identity',async()=>{
  const {ui,applied,dialog,epoch}=await open(),before=epoch(),sourceBefore=ui.grid().activeDatasetId;
  const other=ui.grid().datasets.find((row:any)=>row.provenance.datasetId!==sourceBefore&&row.resolution===ui.grid().datasets.find((d:any)=>d.provenance.datasetId===sourceBefore).resolution);
  expect(other).toBeTruthy();
  const preview=await dialog().previewApply(template(ui,other.instrument.symbol));
  expect(preview.lines.join(' ')).toContain('Switch to '+other.instrument.symbol);
  await preview.apply();
  expect(applied[0].nextExecutionIdentity).toBe('ordinary');
  expect(ui.grid().activeDatasetId).toBe(other.provenance.datasetId);
  expect(epoch()).not.toBe(before);
 });
 // A symbol change is navigation, not an undo step. Applying this template
 // replaces the chart's studies (an edit) and recalls a symbol (navigation): Undo restores the studies through the coordinator
 // and leaves the chart on the recalled source and its identity. (Before: Undo also switched back to the previous source.)
 it('Undo after applying a symbol-recalling template undoes the study edit and keeps the recalled source (a symbol change is not an undo step)',async()=>{
  const {ui,applied,undone,dialog,identity}=await open(),sourceBefore=ui.grid().activeDatasetId,identityBefore=identity();
  const other=ui.grid().datasets.find((row:any)=>row.provenance.datasetId!==sourceBefore);
  const preview=await dialog().previewApply(template(ui,other.instrument.symbol));await preview.apply();
  const afterApply=identity();expect(ui.grid().activeDatasetId).toBe(other.provenance.datasetId);
  ui.click('Undo');for(let i=0;i<10;i++)await Promise.resolve();
  expect(undone).toHaveLength(1);
  expect(ui.grid().activeDatasetId).toBe(other.provenance.datasetId);
  expect(applied).toHaveLength(2);expect(applied[1].nextState).not.toBe(applied[0].nextState);
  expect(ui.status()).not.toMatch(/Change undone/);
  expect(afterApply).not.toBe(identityBefore);
  expect(identity()).toBe(afterApply);
 });
 it('Undo after a same-source template keeps the identity string but bumps the executionEpoch, without remounting the panel',async()=>{
  const {ui,dialog,identity,epoch}=await open(),panel=()=>ui.node(ScriptLibraryPanel).props;
  const preview=await dialog().previewApply(template(ui,null));await preview.apply();
  const keyAfterApply=epoch(),identityAfterApply=identity(),epochAfterApply=panel().executionEpoch;
  ui.click('Undo');for(let i=0;i<10;i++)await Promise.resolve();
  expect(ui.status()).not.toMatch(/Change undone/);
  expect(epoch()).toBe(keyAfterApply);                 // no remount: unsaved drafts survive
  expect(panel().executionEpoch).not.toBe(epochAfterApply); // an in-flight Run now fails its post-await guard
  expect(identity()).toBe(identityAfterApply);         // the identity string alone could not tell (the reviewer's gap)
 });
});
