import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {defaultPriceScaleSettings} from '../../src/chart/price-scale-state';
import {SCALE_FONT_SIZES} from '../../src/chart/chart-settings-facts';
import {lvDarkTheme} from '../../src/ui/themes';

// Actual App closures with controlled React scheduling (same harness as the other App tests): the Chart Settings
// mount in the themes slot and its single Ok transaction. Plus workspace persistence of the new fields.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},
  useLayoutEffect:()=>{}
 };
});
function find(node:any,test:(node:any)=>boolean):any{
 if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}
 else if(node?.props){if(test(node))return node;return find(node.props.children,test);}
 return null;
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const node=(type:any)=>find(render(),row=>row.type===type);
 const open=()=>{find(render(),row=>row.type==='button'&&row.props['aria-label']==='Chart settings').props.onClick();return node(ChartSettingsDialog)?.props;};
 const cell=()=>{const state=node(WorkspaceChartHost).props.state;return state.cells[state.layout.activeCellId];};
 return{render,node,open,cell,status:()=>find(render(),row=>row.type==='output'&&row.props.role==='status')};
}
const commitOf=(props:any,extra:Record<string,unknown>)=>({themeId:props.themeId,appearance:structuredClone(props.appearance),changed:[],...extra});

describe('Settings dialog slot',()=>{
 it('mounts with the workspace document, time zone and template saving',async()=>{
  const ui=await setup(),props=ui.open();
  expect(props.document).toEqual(defaultChartSettingsDocument());expect(props.themeId).toBe('lv-medium-dark');/* Palette: new profiles start on LV Medium Dark */expect(props.timezone).toBe('UTC');
  expect(typeof props.onApply).toBe('function');expect(typeof props.onTemplatesChange).toBe('function');
 });
 it('Ok writes appearance, document, time zone and price scale in one commit and closes',async()=>{
  const ui=await setup(),props=ui.open(),before=ui.cell();
  const document={...defaultChartSettingsDocument()};const appearance={...props.appearance,fontSize:40};
  // A lock-on row is not part of the single commit (it runs as the chart's own scale action first, see INT-A-F1 below).
  const priceScale={...defaultPriceScaleSettings(),labels:{...defaultPriceScaleSettings().labels,symbolLast:false}};
  const accepted=props.onApply(props.themeId,appearance,commitOf(props,{appearance,document,timezone:'America/New_York',priceScale,changed:['appearance','document','timezone','priceScale']}));
  expect(accepted).toBe(true);expect(ui.node(ChartSettingsDialog)).toBeNull();
  const after=ui.cell();
  expect(after.appearance.fontSize).toBe(40);expect(after.chartOptions.timezone).toBe('America/New_York');expect(after.priceScale).toEqual(priceScale);
  expect(after).not.toBe(before);expect(ui.open().document).toEqual(document);
 });
 it('a refused part refuses the whole Ok: nothing is written and the dialog stays open',async()=>{
  const ui=await setup(),props=ui.open(),before=ui.cell();
  const appearance={...props.appearance,fontSize:16};
  const bad=props.onApply(props.themeId,appearance,commitOf(props,{appearance,timezone:'America/New_York',priceScale:{mode:'nonsense'},changed:['appearance','timezone','priceScale']}));
  expect(bad).toBe(false);expect(ui.node(ChartSettingsDialog)).toBeTruthy();expect(ui.cell()).toBe(before);
  const document={...defaultChartSettingsDocument(),unexpected:true};
  expect(props.onApply(props.themeId,appearance,commitOf(props,{appearance,document,changed:['appearance','document']}))).toBe(false);expect(ui.cell()).toBe(before);
  // Chart type and scale type changes take the frame-safe path (a chart lease), never a plain commit: with no chart to lease, the whole Ok is refused.
  const typed=props.onApply(props.themeId,appearance,commitOf(props,{appearance,typeSettings:{style:'line',settings:{}},changed:['appearance','typeSettings']}));
  expect(typed).toBeInstanceOf(Promise);await expect(typed).rejects.toThrow(/chart changed/i);expect(ui.cell()).toBe(before);
  const scaled=props.onApply(props.themeId,appearance,commitOf(props,{appearance,chartOptions:{scale:'logarithmic',invert:false,auto:true},changed:['appearance','chartOptions']}));
  expect(scaled).toBeInstanceOf(Promise);await expect(scaled).rejects.toThrow(/chart changed/i);expect(ui.cell()).toBe(before);expect(ui.node(ChartSettingsDialog)).toBeTruthy();
 });
 it('mounts with the scale rows connected only when the chart is open and the Data sources body supplied',async()=>{
  const ui=await setup(),props=ui.open();expect(props.scaleMode).toBeNull();expect(props.dataSources).toBeTruthy();expect(props.dataSources.props.storage.onRestore).toBeTypeOf('function');
 });
});

// INT-A-F1 ( "Lock price to bar ratio" on Ok must not write a manual lock
// window behind the saved auto flag and frame. The lock-on row runs first as the chart's own price-scale action (frame
// gesture: frame, auto=false and the lock saved together; see tests/ui/price-scale-lock-frame.test.ts for that path on
// the actual grid), then the rest of the Ok is one commit built on the workspace those writes produced.
describe('Chart Settings Ok with Lock price to bar ratio (INT-A-F1)',()=>{
 function lockingChart(ui:Awaited<ReturnType<typeof setup>>,outcome:{ok:boolean;message?:string}={ok:true}){
  let settings=defaultPriceScaleSettings();const calls:Array<{command:string;options:unknown;cellBefore:any}>=[];
  const host=()=>ui.node(WorkspaceChartHost).props;
  const chart:any={drawings:{getMode:()=>null,getTool:()=>null,setTool:()=>{}},setDrawingMode:()=>{},
   priceScale:{settings:()=>structuredClone(settings),ratio:()=>settings.lockRatio?settings.ratio:0.25,
    execute:(command:string,options:unknown)=>{calls.push({command,options,cellBefore:ui.cell()});if(!outcome.ok)return outcome;
     // SYNTHETIC grid writes of the bound gesture host: the frame publication (auto off), then the lock document.
     settings={...settings,lockRatio:true,ratio:0.3};const state=host().state,id=state.layout.activeCellId,cell=state.cells[id];
     const framed={...state,cells:{...state.cells,[id]:{...cell,chartOptions:{...cell.chartOptions,auto:false}}}};expect(host().onChange(framed)).toBe(true);
     const latest=ui.node(WorkspaceChartHost).props.state;expect(host().onChange({...latest,cells:{...latest.cells,[id]:{...latest.cells[id],priceScale:structuredClone(settings)}}})).toBe(true);
     return{ok:true};}}};
  host().onReady(chart);
  return{chart,calls,settings:()=>settings};
 }
 it('runs the lock as the chart scale action before the one Ok commit; the commit keeps the saved auto flag and uses the locked ratio',async()=>{
  const ui=await setup(),lock=lockingChart(ui),props=ui.open(),appearance={...props.appearance,fontSize:16};
  const priceScale={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.25,labels:{...defaultPriceScaleSettings().labels,symbolLast:false}};
  expect(props.onApply(props.themeId,appearance,commitOf(props,{appearance,timezone:'America/New_York',priceScale,changed:['appearance','timezone','priceScale']}))).toBe(true);
  expect(lock.calls.map(row=>[row.command,row.options])).toEqual([['lockRatio',{origin:'toolbar'}]]);
  expect(lock.calls[0].cellBefore.chartOptions.timezone).toBe('UTC');// the lock ran before the Ok commit
  const after=ui.cell();expect(after.chartOptions.auto).toBe(false);expect(after.chartOptions.timezone).toBe('America/New_York');expect(after.appearance.fontSize).toBe(16);
  expect(after.priceScale).toEqual({...priceScale,ratio:0.3});expect(ui.node(ChartSettingsDialog)).toBeNull();
 });
 it('an already locked chart keeps a ratio edit inside the one commit without a second lock action',async()=>{
  const ui=await setup(),lock=lockingChart(ui);lock.chart.priceScale.execute('lockRatio',{origin:'toolbar'});lock.calls.length=0;
  const props=ui.open(),priceScale={...lock.settings(),ratio:0.5};
  expect(props.onApply(props.themeId,props.appearance,commitOf(props,{priceScale,changed:['priceScale']}))).toBe(true);
  expect(lock.calls).toEqual([]);expect(ui.cell().priceScale).toEqual(priceScale);expect(ui.cell().chartOptions.auto).toBe(false);
 });
 it('a refused lock action, or no chart to lock, refuses the whole Ok: nothing is written and the dialog stays open',async()=>{
  const ui=await setup(),props=ui.open(),before=ui.cell(),appearance={...props.appearance,fontSize:16};
  const priceScale={...defaultPriceScaleSettings(),lockRatio:true,ratio:2};
  expect(props.onApply(props.themeId,appearance,commitOf(props,{appearance,priceScale,changed:['appearance','priceScale']}))).toBe(false);
  expect(ui.cell()).toBe(before);expect(ui.node(ChartSettingsDialog)).toBeTruthy();expect(String(ui.status()?.props.children.props.children)).toMatch(/ratio can be locked only while the chart is open/i);
  const refused=lockingChart(ui,{ok:false,message:'This chart cannot save a scale change right now. Try again when it finishes updating.'}),again=ui.open();
  expect(again.onApply(again.themeId,appearance,commitOf(again,{appearance,priceScale,changed:['appearance','priceScale']}))).toBe(false);
  expect(refused.calls).toHaveLength(1);expect(ui.cell()).toBe(before);expect(ui.node(ChartSettingsDialog)).toBeTruthy();expect(String(ui.status()?.props.children.props.children)).toMatch(/cannot save a scale change/);
 });
});

describe('Chart Settings persistence',()=>{
 it('a saved scale text size of 40 survives startup recovery; unlisted sizes above 32 do not',()=>{
  expect(SCALE_FONT_SIZES).toContain(40);
  const defaults=createInitialWorkspace(),saved=JSON.parse(JSON.stringify({...defaults,appearance:{...defaults.appearance,fontSize:40}}));
  const id=saved.grid.layout.activeCellId;saved.grid.cells[id].appearance.fontSize=40;
  const restored=restoreWorkspace(saved,createInitialWorkspace());
  expect(restored.appearance.fontSize).toBe(40);expect((restored.grid as any).cells[id].appearance.fontSize).toBe(40);
  for(const size of [6,13,32])expect(restoreWorkspace(JSON.parse(JSON.stringify({...defaults,appearance:{...defaults.appearance,fontSize:size}})),createInitialWorkspace()).appearance.fontSize).toBe(size);
  for(const size of [33,36,41,5])expect(()=>restoreWorkspace(JSON.parse(JSON.stringify({...defaults,appearance:{...defaults.appearance,fontSize:size}})),createInitialWorkspace())).toThrow(/Unsupported appearance/);
 });
 it('restores the chartSettings document, defaults it for older saves and rejects unknown fields',()=>{
  const defaults=createInitialWorkspace();expect(defaults.chartSettings).toEqual(defaultChartSettingsDocument());
  const older=JSON.parse(JSON.stringify(defaults));delete older.chartSettings;
  expect(restoreWorkspace(older,createInitialWorkspace()).chartSettings).toEqual(defaultChartSettingsDocument());
  const kept=JSON.parse(JSON.stringify(defaults));expect(restoreWorkspace(kept,createInitialWorkspace()).chartSettings).toEqual(defaults.chartSettings);
  const bad=JSON.parse(JSON.stringify(defaults));bad.chartSettings.unexpected=true;expect(()=>restoreWorkspace(bad,createInitialWorkspace())).toThrow(/unknown field/);
  expect(lvDarkTheme.appearance.gradientStart).toBe('#1F1F1F');
 });
});
