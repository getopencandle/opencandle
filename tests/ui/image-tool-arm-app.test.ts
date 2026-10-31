import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {LV_IMAGE} from '../../src/chart/lv-types/image';

// Picking the Image tool opens one file chooser and first disarms any armed
// placement tool, so a cancelled chooser leaves Cursor. Actual App closures under a controlled hook model with a SYNTHETIC
// chart controller; not a DOM, native chooser or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))cells[index]={deps,value:fn()};return cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},
  useRef:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){cells[index]=deps;hooks.effects.push(fn);}},
  useLayoutEffect:()=>{}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node))for(const child of node)findAll(child,test,out);
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function nativeChart(){
 let tool:string|null=null;
 const controller={drawingCatalog:()=>drawingCatalog(),drawings:{getTool:()=>tool,getMode:()=>null},setTool:vi.fn((value:string|null)=>{tool=value;}),setDrawingMode:vi.fn(),
  onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},indicators:{list:()=>[],subscribe:vi.fn(()=>()=>{})},
  drawingUtility:{apply:vi.fn(),onChangeFromChart:()=>()=>{},canZoomOut:()=>false,observeZoomContext:vi.fn()}};
 return{controller,tool:()=>tool};
}
async function setup(){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const chart=nativeChart();find(render(),row=>row.type===WorkspaceChartHost).props.onReady(chart.controller);render();
 const input=()=>find(render(),row=>row.type==='input'&&row.props.type==='file'&&row.props['aria-label']==='Choose an image');
 const toolbar=()=>find(render(),row=>row.type===DrawingToolbar).props;
 const click=vi.fn(),listeners=new Map<string,()=>void>(),node={click,addEventListener:vi.fn((name:string,fn:()=>void)=>listeners.set(name,fn)),removeEventListener:vi.fn()};
 input().props.ref(node);render();expect(input().props.ref).toBe(input().props.ref);// a stable ref: attached once, not on every render
 return{render,chart,input,toolbar,click,cancel:()=>listeners.get('cancel')?.()};
}
it('picking Image disarms an armed tool first and opens one chooser',async()=>{
 const ui=await setup();
 ui.toolbar().onSelect('trendline');ui.render();expect(ui.chart.tool()).toBe('trendline');
 ui.toolbar().onSelect(LV_IMAGE);
 expect(ui.click).toHaveBeenCalledOnce();expect(ui.chart.tool()).toBeNull();expect(ui.toolbar().activeTool).toBeNull();
});
it('a cancelled chooser leaves Cursor armed',async()=>{
 const ui=await setup();
 ui.toolbar().onSelect(LV_IMAGE);ui.chart.controller.setTool('trendline');ui.render();
 ui.cancel();
 expect(ui.chart.tool()).toBeNull();expect(ui.toolbar().activeTool).toBeNull();
});
