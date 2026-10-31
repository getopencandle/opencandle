import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {DrawingTools} from '../../src/ui/DrawingTools';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {buildDrawingToolGroups,toolLabel} from '../../src/ui/drawing-toolbar-model';

// integration: the actual App keyboard handler routes Alt+H/J/V/C to the active chart's
// placeAtCrosshair, and the actual App passes the workspace favorites state to both the left
// toolbar and the All drawing tools dialog. The chart controller is SYNTHETIC (placeAtCrosshair
// is a mock; its real guards are covered in tests/chart/place-at-crosshair.test.ts). React
// scheduling is a controlled hook model: App, toolbar and dialog each keep their own hook store.
// This is not a DOM, canvas, native-window, accessibility or packaged executable test.
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
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
function keyEvent(key:string,extra:Record<string,unknown>={}){return{key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),...extra};}
const PLACED=[['h','hline'],['j','hray'],['v','vline'],['c','crossline']] as const;
let toolbarStore:{cells:any[];effects:Array<()=>unknown>},dialogStore:{cells:any[];effects:Array<()=>unknown>};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];toolbarStore={cells:[],effects:[]};dialogStore={cells:[],effects:[]};});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

/** SYNTHETIC controller: placeAtCrosshair is a mock that the test scripts per case. */
function nativeChart(){
 let tool:string|null=null;
 const placeAtCrosshair=vi.fn((_type:string):{ok:true;id:string}|{ok:false;message:string}=>({ok:true,id:'placed-1'}));
 const controller={
  drawingCatalog:()=>drawingCatalog(),
  drawings:{getTool:()=>tool,getMode:()=>null},
  setTool:vi.fn((value:string|null)=>{tool=value;}),
  setDrawingMode:vi.fn(),placeAtCrosshair,
  onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},
  indicators:{list:()=>[],subscribe:vi.fn(()=>()=>{})},
  drawingUtility:{apply:vi.fn(),onChangeFromChart:()=>()=>{},canZoomOut:()=>false,observeZoomContext:vi.fn()}
 };
 return{controller,placeAtCrosshair};
}
async function setup(){
 const listeners=new Map<string,Function>();
 vi.stubGlobal('window',{addEventListener:vi.fn((name:string,fn:Function)=>listeners.set(name,fn)),removeEventListener:vi.fn((name:string,fn:Function)=>{if(listeners.get(name)===fn)listeners.delete(name);})});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const ready=(chart:ReturnType<typeof nativeChart>)=>{find(render(),row=>row.type===WorkspaceChartHost).props.onReady(chart.controller);render();};
 /** Latest keyboard listener: runs any freshly scheduled keyboard effect so the handler matches the current render. */
 const keydown=()=>{render();let index=hooks.effects.findIndex(fn=>String(fn).includes('addEventListener'));while(index>=0){hooks.effects.splice(index,1)[0]!();index=hooks.effects.findIndex(fn=>String(fn).includes('addEventListener'));}const handler=listeners.get('keydown');if(!handler)throw Error('Missing keyboard listener');return handler;};
 const status=()=>content(find(render(),row=>row.type==='output'&&row.props.role==='status'));
 const toolbarProps=()=>find(render(),row=>row.type===DrawingToolbar).props;
 /** Renders a component from one hook store while App's store is parked, as two mounted components would. */
 const inStore=<T,>(store:{cells:any[];effects:Array<()=>unknown>},run:()=>T):T=>{const appCells=hooks.cells,appEffects=hooks.effects,appCursor=hooks.cursor;hooks.cells=store.cells;hooks.effects=store.effects;hooks.cursor=0;try{return run();}finally{hooks.cells=appCells;hooks.effects=appEffects;hooks.cursor=appCursor;}};
 const toolbar=()=>{const props=toolbarProps();return inStore(toolbarStore,()=>DrawingToolbar(props));};
 const dialogNode=()=>find(render(),row=>row.type===DrawingTools);
 const dialog=()=>{const props=dialogNode().props;return inStore(dialogStore,()=>DrawingTools(props));};
 const stripLabels=()=>findAll(find(toolbar(),node=>node.props.role==='toolbar'),node=>node.type==='button').map(node=>node.props['aria-label']);
 return{render,ready,keydown,status,toolbarProps,toolbar,dialogNode,dialog,stripLabels,listeners};
}

describe('Alt+H, Alt+J, Alt+V and Alt+C place a line at the crosshair through the actual App keyboard handler',()=>{
 it.each(PLACED)('Alt+%s calls placeAtCrosshair(%s) on the active chart and prevents the default action',async(key,type)=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  const event=keyEvent(key,{altKey:true});ui.keydown()(event);
  expect(chart.placeAtCrosshair).toHaveBeenCalledExactlyOnceWith(type);expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(chart.controller.setTool).not.toHaveBeenCalled();expect(ui.status()).not.toContain('Move the pointer');
 });
 it('upper-case key values (Caps Lock) place the same tools',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);const handler=ui.keydown();
  for(const [key] of PLACED)handler(keyEvent(key.toUpperCase(),{altKey:true}));
  expect(chart.placeAtCrosshair.mock.calls.map(args=>args[0])).toEqual(PLACED.map(row=>row[1]));
 });
 it('the existing bindings are untouched: Alt+T, Alt+F and Alt+Shift+R still arm and none of them places',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);const handler=ui.keydown();
  for(const [key,extra] of [['t',{altKey:true}],['f',{altKey:true}],['R',{altKey:true,shiftKey:true}]] as const)handler(keyEvent(key,extra));
  expect(chart.controller.setTool.mock.calls.map(args=>args[0])).toEqual(['trendline','fibretracement','box']);expect(chart.placeAtCrosshair).not.toHaveBeenCalled();
 });
 it('modified or unrelated keys neither place nor arm: Alt+Shift+H, Ctrl+Alt+H, Meta+Alt+H and Alt+Shift+J/V/C',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);const handler=ui.keydown(),events=[
   keyEvent('H',{altKey:true,shiftKey:true}),keyEvent('h',{altKey:true,ctrlKey:true}),keyEvent('h',{altKey:true,metaKey:true}),
   keyEvent('J',{altKey:true,shiftKey:true}),keyEvent('V',{altKey:true,shiftKey:true}),keyEvent('C',{altKey:true,shiftKey:true})];
  for(const event of events)handler(event);
  expect(chart.placeAtCrosshair).not.toHaveBeenCalled();expect(chart.controller.setTool).not.toHaveBeenCalled();
  // Ctrl+Alt+H and Meta+Alt+H are now the hide-drawings toggle (consumed), never a line placement.
  const hideEvents=events.filter(row=>row.altKey&&row.key==='h'&&(row.ctrlKey||row.metaKey));
  expect(hideEvents).toHaveLength(2);
  for(const event of events.filter(row=>!hideEvents.includes(row)))expect(event.preventDefault).not.toHaveBeenCalled();
  // The exemption is not a blind hole: each of the two events is consumed AND flips the hide-all-drawings state the App pushes to the chart.
  for(const event of hideEvents){expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();}
  const runEffects=()=>{ui.render();const pending=hooks.effects.splice(0);for(const fn of pending)if(String(fn).includes('drawingUtility?.apply'))fn();};runEffects();
  const lastHidden=()=>{const calls=chart.controller.drawingUtility.apply.mock.calls;return (calls[calls.length-1][0] as {drawingsHidden?:boolean}).drawingsHidden===true;};
  expect(lastHidden()).toBe(false); // two toggles in one render settle back to shown
  handler(keyEvent('h',{altKey:true,ctrlKey:true}));runEffects();expect(lastHidden()).toBe(true);
  handler(keyEvent('h',{altKey:true,metaKey:true}));runEffects();expect(lastHidden()).toBe(false);
  handler(keyEvent('h',{ctrlKey:true}));expect(chart.placeAtCrosshair).not.toHaveBeenCalled();
 });
 it('is ignored while typing in an input, textarea, select or contenteditable',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);const handler=ui.keydown();
  const typing=keyEvent('h',{altKey:true,target:{closest:(selector:string)=>/input,textarea/.test(selector)?{}:null}});handler(typing);
  expect(typing.preventDefault).not.toHaveBeenCalled();expect(chart.placeAtCrosshair).not.toHaveBeenCalled();
  const selectors:string[]=[];handler(keyEvent('j',{altKey:true,target:{closest:(selector:string)=>{selectors.push(selector);return{};}}}));
  expect(selectors[0]).toContain('input');expect(selectors[0]).toContain('textarea');expect(selectors[0]).toContain('contenteditable');expect(chart.placeAtCrosshair).not.toHaveBeenCalled();
  handler(keyEvent('h',{altKey:true}));expect(chart.placeAtCrosshair).toHaveBeenCalledExactlyOnceWith('hline');
 });
 it('is ignored while an App dialog is open and while a modal dialog element is in the document',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.toolbarProps().onOpenAll();expect(ui.dialogNode()).toBeTruthy();
  const open=keyEvent('v',{altKey:true});ui.keydown()(open);expect(open.preventDefault).not.toHaveBeenCalled();expect(chart.placeAtCrosshair).not.toHaveBeenCalled();
  ui.dialogNode().props.onClose();expect(ui.dialogNode()).toBeNull();
  const closed=keyEvent('v',{altKey:true});ui.keydown()(closed);expect(chart.placeAtCrosshair).toHaveBeenCalledExactlyOnceWith('vline');
  (document.querySelector as any).mockImplementation((selector:string)=>selector.includes('role=dialog')?{}:null);
  const modal=keyEvent('c',{altKey:true});ui.keydown()(modal);expect(modal.preventDefault).not.toHaveBeenCalled();expect(chart.placeAtCrosshair).toHaveBeenCalledTimes(1);
 });
 it('with no ready chart the hotkey is inert and reports nothing',async()=>{
  const ui=await setup(),handler=ui.keydown(),before=ui.status();
  for(const [key] of PLACED)expect(()=>handler(keyEvent(key,{altKey:true}))).not.toThrow();
  expect(ui.status()).toBe(before);
  const chart=nativeChart();ui.ready(chart);find(ui.render(),row=>row.type===WorkspaceChartHost).props.onReady(null);ui.render();
  expect(()=>ui.keydown()(keyEvent('h',{altKey:true}))).not.toThrow();expect(chart.placeAtCrosshair).not.toHaveBeenCalled();
 });
 it('a refusal from placeAtCrosshair is shown as the status message and does not throw',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);const handler=ui.keydown();
  chart.placeAtCrosshair.mockReturnValueOnce({ok:false,message:'Move the pointer over the price chart first.'});
  expect(()=>handler(keyEvent('h',{altKey:true}))).not.toThrow();expect(ui.status()).toContain('Move the pointer over the price chart first.');
  chart.placeAtCrosshair.mockImplementationOnce(()=>{throw Error('Drawing placement is unavailable while the chart is busy.');});
  expect(()=>handler(keyEvent('j',{altKey:true}))).not.toThrow();expect(ui.status()).toContain('Drawing placement is unavailable while the chart is busy.');
  expect(chart.placeAtCrosshair.mock.calls.map(args=>args[0])).toEqual(['hline','hray']);
 });
 it('only the active chart receives the call after the active chart changes',async()=>{
  const ui=await setup(),first=nativeChart(),second=nativeChart();ui.ready(first);ui.ready(second);
  ui.keydown()(keyEvent('c',{altKey:true}));
  expect(second.placeAtCrosshair).toHaveBeenCalledExactlyOnceWith('crossline');expect(first.placeAtCrosshair).not.toHaveBeenCalled();
 });
});

describe('the All drawing tools dialog shares the toolbar favorites state',()=>{
 const TYPE='hline';
 const label=()=>toolLabel(buildDrawingToolGroups(drawingCatalog()),TYPE)!;
 it('passes the same favorites list and change handler the toolbar receives',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.toolbarProps().onOpenAll();
  const dialog=ui.dialogNode().props,bar=ui.toolbarProps();
  expect(dialog.favorites).toBe(bar.favorites);expect(typeof dialog.onFavoritesChange).toBe('function');expect(dialog.onFavoritesChange).toBe(bar.onFavoritesChange);
 });
 it('starring a tool in the dialog adds it to the toolbar favorites strip, and starring again removes it',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  expect(label()).toBeTruthy();expect(ui.stripLabels()).toEqual([]);
  ui.toolbarProps().onOpenAll();
  const star=()=>find(ui.dialog(),node=>node.type==='button'&&node.props['aria-label']==='Favorite: '+label());
  expect(star().props['aria-pressed']).toBe(false);
  star().props.onClick();
  expect(ui.toolbarProps().favorites).toEqual([TYPE]);expect(ui.stripLabels()).toEqual(['Favorite tool: '+label()]);
  expect(ui.dialogNode().props.favorites).toEqual([TYPE]);expect(star().props['aria-pressed']).toBe(true);expect(star().props.title).toBe('Remove from favorites');
  star().props.onClick();
  expect(ui.toolbarProps().favorites).toEqual([]);expect(ui.stripLabels()).toEqual([]);expect(star().props['aria-pressed']).toBe(false);
 });
 it('a favorite starred in the dialog survives closing it, and the dialog does not arm a tool by starring',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.toolbarProps().onOpenAll();find(ui.dialog(),node=>node.type==='button'&&node.props['aria-label']==='Favorite: '+label()).props.onClick();
  expect(ui.dialogNode()).toBeTruthy();expect(chart.controller.setTool).not.toHaveBeenCalled();
  ui.dialogNode().props.onClose();expect(ui.dialogNode()).toBeNull();expect(ui.stripLabels()).toEqual(['Favorite tool: '+label()]);
 });
});

describe('the Stay in drawing mode toggle',()=>{
 it('Stay in drawing mode toggle exposes aria-pressed',async()=>{
  // The toggle button in App's drawing toolbar reports its pressed state and is a plain button.
  const ui=await setup(),chart=nativeChart();
  // SYNTHETIC physical drawing-preference port (the native magnet/stay settings).
  let physical={magnet:'off' as const,stay:false};
  Object.assign(chart.controller,{drawingPreferences:{get:()=>physical,apply:(value:typeof physical)=>{physical=value;},subscribe:()=>()=>{}}});
  ui.ready(chart);
  const stay=()=>find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Stay in drawing mode');
  expect(stay()).toBeTruthy();
  expect(stay().props.type).toBe('button');expect(stay().props['aria-pressed']).toBe(false);
  stay().props.onClick();
  expect(stay().props['aria-pressed']).toBe(true);expect(stay().props.className).toBe('active');
  stay().props.onClick();
  expect(stay().props['aria-pressed']).toBe(false);
 });
});
