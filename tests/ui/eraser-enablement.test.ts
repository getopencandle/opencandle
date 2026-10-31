import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {drawingCatalog} from '../../src/chart/drawing-port';

// ERASER.ENABLEMENT: actual App closures (changeDrawingMode, disarmTool, the keyboard
// Escape handler, the renderer mode subscription) feeding the actual DrawingToolbar,
// rendered from the exact props App passes it. React scheduling is a controlled hook
// model: the App and the toolbar each keep their own hook store, as two mounted
// components would. The chart controller is SYNTHETIC; its setDrawingMode stands in
// for the adapter arming route, whose guards are executed in
// tests/ui/eraser-enablement-linked.test.ts and tests/chart/drawing-erase-adapter.test.ts.
// This is not a DOM, canvas, native-window, accessibility or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 // Setters bind the store that created them, so a toolbar click never writes App state.
 const memo=(fn:()=>any,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))cells[index]={deps,value:fn()};return cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},
  useRef:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){cells[index]=deps;hooks.effects.push(fn);}}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node))for(const child of node)findAll(child,test,out);
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
function keyEvent(key:string){return{key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};}
const ERASER='DW.CURSOR.ERASER',CROSS='DW.CURSOR.CROSS';
let toolbarStore:{cells:any[];effects:Array<()=>unknown>};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];toolbarStore={cells:[],effects:[]};});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

/** SYNTHETIC controller: the mode changes only when setDrawingMode returns, as in the adapter. */
function nativeChart(){
 let tool:string|null=null,mode:'measure'|'eraser'|null=null,refusal:string|null=null,exitFailure:string|null=null;
 const toolListeners=new Set<(value:string|null)=>void>(),modeListeners=new Set<(value:any)=>void>();
 const controller={
  drawingCatalog:()=>drawingCatalog(),
  // The renderer facade: setTool here, unlike controller.setTool, does not focus the chart.
  drawings:{getTool:()=>tool,getMode:()=>mode,setTool:vi.fn((value:string|null)=>{tool=value;for(const fn of [...toolListeners])fn(value);})},
  setTool:vi.fn((value:string|null)=>{tool=value;for(const fn of [...toolListeners])fn(value);}),
  setDrawingMode:vi.fn((value:'measure'|'eraser'|null)=>{if(value==='eraser'&&refusal)throw Error(refusal);if(value===null&&exitFailure)throw Error(exitFailure);mode=value;for(const fn of [...modeListeners])fn(value);}),
  onToolChanged:(fn:(value:string|null)=>void)=>{toolListeners.add(fn);return()=>toolListeners.delete(fn);},
  onDrawingModeChanged:(fn:(value:any)=>void)=>{modeListeners.add(fn);return()=>modeListeners.delete(fn);},
  indicators:{list:()=>[],subscribe:vi.fn(()=>()=>{})}
 };
 return{controller,refuse:(message:string|null)=>{refusal=message;},failExit:(message:string|null)=>{exitFailure=message;},mode:()=>mode,tool:()=>tool,modeCalls:()=>controller.setDrawingMode.mock.calls.map(args=>args[0])};
}
async function setup(){
 const listeners=new Map<string,Function>();
 vi.stubGlobal('window',{addEventListener:vi.fn((name:string,fn:Function)=>listeners.set(name,fn)),removeEventListener:vi.fn((name:string,fn:Function)=>{if(listeners.get(name)===fn)listeners.delete(name);})});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const appProps=()=>find(render(),row=>row.type===DrawingToolbar).props;
 /** Renders the actual toolbar from the given (default: current) App props in its own hook store. */
 const toolbar=(props=appProps())=>{
  const appCells=hooks.cells,appEffects=hooks.effects,appCursor=hooks.cursor;
  hooks.cells=toolbarStore.cells;hooks.effects=toolbarStore.effects;hooks.cursor=0;
  try{return DrawingToolbar(props);}finally{hooks.cells=appCells;hooks.effects=appEffects;hooks.cursor=appCursor;}
 };
 const button=(label:string)=>find(toolbar(),node=>node.type==='button'&&node.props['aria-label']===label);
 const item=(id:string)=>find(toolbar(),node=>node.props['data-requirement']===id);
 /** Opens a group flyout by label prefix, so catalog copy changes (e.g. Trend line tools/Trend tools) do not matter here. */
 const open=(label:string)=>{const rows=findAll(toolbar(),node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Open '+label));expect(rows).toHaveLength(1);rows[0].props.onClick();};
 /** The flyout radio state is the toolbar's exact eraser indication; the menu is closed again afterwards. */
 const eraserChecked=()=>{open('Cursors');const checked=item(ERASER).props['aria-checked'];open('Cursors');expect(find(toolbar(),node=>node.props.role==='menu')).toBeNull();return checked;};
 /** The Cursors group main button (the flyout arrow has no title). */
 const cursorsMain=()=>{const rows=findAll(toolbar(),node=>node.type==='button'&&String(node.props.title??'').startsWith('Cursors:'));expect(rows).toHaveLength(1);return rows[0];};
 const status=()=>content(find(render(),row=>row.type==='output'&&row.props.role==='status'));
 const runEffect=(marker:string)=>{const index=hooks.effects.findIndex(fn=>String(fn).includes(marker));if(index<0)throw Error('Missing scheduled App effect: '+marker);return hooks.effects.splice(index,1)[0]();};
 const ready=(chart:ReturnType<typeof nativeChart>)=>{find(render(),row=>row.type===WorkspaceChartHost).props.onReady(chart.controller);hooks.effects=[];render();runEffect('onToolChanged');};
 return{render,appProps,toolbar,button,item,open,eraserChecked,cursorsMain,status,runEffect,ready,listeners};
}

describe('ERASER.ENABLEMENT App toolbar wiring (handler and model coverage only)',()=>{
 it('App connects measure and eraser renderer modes through its real mode handler',async()=>{
  const ui=await setup(),props=ui.appProps();
  expect(props.enabledModes).toEqual(['measure','eraser']);expect(typeof props.onMode).toBe('function');expect(typeof props.onCursor).toBe('function');
 });
 it('every drawing control, including Cursors > Eraser, is disabled while no chart is ready, and the mode handler is inert',async()=>{
  const ui=await setup(),props=ui.appProps();expect(props.chart).toBeNull();
  const buttons=findAll(ui.toolbar(),node=>node.type==='button');
  expect(buttons.length).toBeGreaterThan(3);expect(buttons.filter(node=>node.props.disabled!==true).map(node=>node.props['aria-label'])).toEqual([]);
  expect(ui.button('Open Cursors').props.disabled).toBe(true);
  const before=ui.status();expect(()=>props.onMode('eraser')).not.toThrow();expect(ui.status()).toBe(before);expect(ui.appProps().activeMode).toBeNull();
 });
 it('Cursors > Eraser is available once a chart is ready and arms eraser mode through changeDrawingMode',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.open('Cursors');const eraser=ui.item(ERASER);
  expect(eraser.props['aria-disabled']).toBeUndefined();expect(eraser.props.title).toMatch(/Esc or (Cursor|Cross) ends erasing/);expect(content(eraser)).not.toContain('Unavailable');
  eraser.props.onClick();
  expect(chart.modeCalls()).toEqual(['eraser']);expect(chart.mode()).toBe('eraser');expect(ui.appProps().activeMode).toBe('eraser');
  expect(find(ui.toolbar(),node=>node.props.role==='menu')).toBeNull();
  const main=ui.button('Eraser');expect(main.props.title).toBe('Cursors: Eraser');expect(main.props['aria-pressed']).toBe(true);
  ui.open('Cursors');expect(ui.item(ERASER).props['aria-checked']).toBe(true);expect(ui.item(CROSS).props['aria-checked']).toBe(false);
  ui.item(ERASER).props.onClick();expect(chart.modeCalls()).toEqual(['eraser']);
 });
 it('Cursor disarms eraser through the real disarm path, from the flyout and from the pressed main button',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.open('Cursors');ui.item(ERASER).props.onClick();expect(chart.mode()).toBe('eraser');
  ui.open('Cursors');ui.item(CROSS).props.onClick();
  expect(chart.mode()).toBeNull();expect(chart.modeCalls()).toEqual(['eraser',null,null]);expect(chart.controller.setTool).toHaveBeenLastCalledWith(null);expect(ui.appProps().activeMode).toBeNull();
  expect(ui.button('Eraser')).toBeNull();
  ui.open('Cursors');ui.item(ERASER).props.onClick();expect(chart.mode()).toBe('eraser');
  ui.button('Eraser').props.onClick();
  expect(chart.mode()).toBeNull();expect(ui.appProps().activeMode).toBeNull();expect(ui.appProps().activeTool).toBeNull();
 });
 it('Escape exits eraser mode and clears the tool through the App keyboard handler',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);ui.runEffect('addEventListener');const keydown=ui.listeners.get('keydown')!;
  ui.open('Cursors');ui.item(ERASER).props.onClick();expect(ui.appProps().activeMode).toBe('eraser');
  keydown(keyEvent('Escape'));
  expect(chart.mode()).toBeNull();expect(chart.controller.drawings.getTool()).toBeNull();expect(chart.modeCalls().at(-1)).toBeNull();expect(ui.appProps().activeMode).toBeNull();
  expect(ui.eraserChecked()).toBe(false);expect(ui.button('Eraser')).toBeNull();expect(ui.cursorsMain().props.title).toBe('Cursors: Cross');
 });
 it('choosing a drawing tool or Measure while erasing leaves eraser mode first',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.open('Cursors');ui.item(ERASER).props.onClick();ui.open('Trend');ui.item('DW.TREND.RAY').props.onClick();
  expect(chart.modeCalls()).toEqual(['eraser',null]);expect(chart.controller.setTool).toHaveBeenLastCalledWith('ray');expect(ui.appProps().activeMode).toBeNull();expect(ui.appProps().activeTool).toBe('ray');
  ui.open('Cursors');ui.item(ERASER).props.onClick();ui.button('Measure').props.onClick();
  expect(chart.modeCalls().slice(-2)).toEqual(['eraser','measure']);expect(ui.appProps().activeMode).toBe('measure');
 });
 it.each([
  // the linked refusal row flipped to the atomic route; a linked layout now refuses only an unavailable synchronized chart.
  ['an unavailable synchronized chart','A chart with synchronized drawings is unavailable. Reopen it, then try again. Nothing was changed.'],
  ['a busy chart','Eraser is unavailable while the chart is busy or unavailable.']
 ])('an arming refusal for %s is reported in the status bar and leaves the toolbar on Cursor',async(_label,message)=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);chart.refuse(message);
  ui.open('Cursors');expect(()=>ui.item(ERASER).props.onClick()).not.toThrow();
  expect(chart.modeCalls()).toEqual(['eraser']);expect(chart.mode()).toBeNull();expect(ui.status()).toContain(message);expect(ui.appProps().activeMode).toBeNull();
  expect(ui.eraserChecked()).toBe(false);expect(ui.button('Eraser')).toBeNull();
  chart.refuse(null);ui.open('Cursors');ui.item(ERASER).props.onClick();expect(chart.mode()).toBe('eraser');
 });
 it('a retired toolbar handler cannot arm or disarm the replacement chart',async()=>{
  const ui=await setup(),first=nativeChart();ui.ready(first);const stale=ui.appProps();
  const second=nativeChart();ui.ready(second);
  stale.onMode('eraser');stale.onCursor();
  expect(first.modeCalls()).toEqual([]);expect(second.modeCalls()).toEqual([]);expect(second.mode()).toBeNull();
  const current=ui.appProps();expect(current.chart).toBe(second.controller);current.onMode('eraser');expect(second.mode()).toBe('eraser');expect(first.mode()).toBeNull();
 });
 it('a renderer leaving eraser mode on its own clears the pressed Eraser state',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.open('Cursors');ui.item(ERASER).props.onClick();expect(ui.button('Eraser').props['aria-pressed']).toBe(true);expect(ui.eraserChecked()).toBe(true);
  chart.controller.setDrawingMode(null);
  expect(ui.appProps().activeMode).toBeNull();expect(ui.eraserChecked()).toBe(false);expect(ui.button('Eraser')).toBeNull();
 });
});

// ERASER.ENABLEMENT.CURSORS_STATE: the Cursors group main button reflects the ACTUAL
// state. Whenever eraser mode ends (or is refused) it is neither pressed nor named
// Eraser; it falls back to the last real cursor choice (Cross is the only available
// cursor leaf, and also the default), and the flyout still re-selects Eraser.
type ExitPath='escape'|'cursor main button'|'cursor flyout'|'refusal'|'renderer exit'|'chart replacement';
async function exitEraser(path:ExitPath){
 const ui=await setup();let chart=nativeChart();ui.ready(chart);ui.runEffect('addEventListener');const keydown=ui.listeners.get('keydown')!;
 const choose=()=>{ui.open('Cursors');ui.item(ERASER).props.onClick();};
 if(path==='refusal'){chart.refuse('Eraser is unavailable while the chart is busy or unavailable.');choose();chart.refuse(null);}
 else{
  choose();expect(chart.mode()).toBe('eraser');const main=ui.cursorsMain();expect(main.props['aria-label']).toBe('Eraser');expect(main.props['aria-pressed']).toBe(true);
  if(path==='escape')keydown(keyEvent('Escape'));
  else if(path==='cursor main button')main.props.onClick();
  else if(path==='cursor flyout'){ui.open('Cursors');ui.item(CROSS).props.onClick();}
  else if(path==='renderer exit')chart.controller.setDrawingMode(null);
  else{chart=nativeChart();ui.ready(chart);}
 }
 return{ui,chart,choose};
}
function expectCursorState(ui:Awaited<ReturnType<typeof setup>>,chart:ReturnType<typeof nativeChart>){
 expect(chart.mode()).toBeNull();expect(ui.appProps().activeMode).toBeNull();
 const main=ui.cursorsMain();
 expect(main.props['aria-label']).toBe('Cursor');expect(main.props.title).toBe('Cursors: Cross');expect(main.props['aria-pressed']).toBe(true);expect(main.props.className).toBe('active');
 expect(ui.button('Eraser')).toBeNull();expect(ui.eraserChecked()).toBe(false);
}
describe('ERASER.ENABLEMENT.CURSORS_STATE Cursors button reflects the actual mode',()=>{
 it.each(['escape','cursor main button','cursor flyout','refusal','renderer exit','chart replacement'] as const)('after %s the Cursors button is the pressed Cursor, not Eraser, and Eraser re-selects',async path=>{
  const {ui,chart,choose}=await exitEraser(path);
  expectCursorState(ui,chart);
  choose();expect(chart.mode()).toBe('eraser');const main=ui.cursorsMain();
  expect(main.props['aria-label']).toBe('Eraser');expect(main.props.title).toBe('Cursors: Eraser');expect(main.props['aria-pressed']).toBe(true);expect(ui.eraserChecked()).toBe(true);
 });
 it('repeated Eraser sessions always return the button to Cursor, and pressing Cursor there stays in cursor state',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);ui.runEffect('addEventListener');const keydown=ui.listeners.get('keydown')!;
  for(let round=0;round<3;round++){
   ui.open('Cursors');ui.item(ERASER).props.onClick();expect(chart.mode()).toBe('eraser');expect(ui.cursorsMain().props['aria-label']).toBe('Eraser');
   if(round===1)keydown(keyEvent('Escape'));else ui.cursorsMain().props.onClick();
   expectCursorState(ui,chart);
  }
  ui.cursorsMain().props.onClick();expectCursorState(ui,chart);expect(chart.modeCalls().filter(mode=>mode==='eraser')).toHaveLength(3);
 });
 it('a tool armed after erasing leaves the Cursors button unpressed and named Cursor',async()=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);
  ui.open('Cursors');ui.item(ERASER).props.onClick();ui.open('Trend');ui.item('DW.TREND.RAY').props.onClick();
  const main=ui.cursorsMain();expect(main.props['aria-label']).toBe('Cursor');expect(main.props['aria-pressed']).toBe(false);expect(ui.button('Eraser')).toBeNull();
 });
 it('an active eraser the toolbar cannot name never presents the Cursor button as pressed',async()=>{
  const ui=await setup(),props:any={chart:{drawingCatalog:()=>drawingCatalog(),drawings:{getTool:()=>null,getMode:()=>'eraser'}},activeTool:null,activeMode:null,onSelect:vi.fn(),onCursor:vi.fn(),onMode:vi.fn(),enabledModes:['measure'],onOpenAll:vi.fn()};
  const main=findAll(ui.toolbar(props),node=>node.type==='button'&&String(node.props.title??'').startsWith('Cursors:'))[0];
  expect(main.props['aria-label']).toBe('Cursor');expect(main.props['aria-pressed']).toBe(false);
  main.props.onClick();expect(props.onMode).toHaveBeenCalledExactlyOnceWith(null);expect(props.onCursor).toHaveBeenCalledOnce();
 });
});

// ERASER.ENABLEMENT.ACTIVE_CHART: at most one chart is ever armed. The toolbar, Escape and
// Cursor reach only the active chart, so a chart that stops being active leaves its renderer
// mode and drawing tool first. Escape from a listener installed for a replaced chart reaches
// no chart. (Real adapter and Grid host coverage: tests/ui/eraser-enablement-grid.test.ts.)
describe('ERASER.ENABLEMENT.ACTIVE_CHART App active-chart changes and the Escape guard',()=>{
 it('a disarm failure on the previous chart is reported and focus still moves',async()=>{
  const ui=await setup(),a=nativeChart();ui.ready(a);ui.open('Cursors');ui.item(ERASER).props.onClick();a.failExit('SYNTHETIC renderer exit failure.');
  const b=nativeChart();ui.ready(b);
  expect(a.modeCalls()).toEqual(['eraser',null]);expect(ui.status()).toContain('SYNTHETIC renderer exit failure.');
  expect(ui.appProps().chart).toBe(b.controller);expect(ui.appProps().activeMode).toBeNull();expect(b.modeCalls()).toEqual([]);
 });
 it('an unarmed previous chart receives no calls when focus moves',async()=>{
  const ui=await setup(),a=nativeChart();ui.ready(a);const b=nativeChart();ui.ready(b);
  expect(a.controller.setDrawingMode).not.toHaveBeenCalled();expect(a.controller.setTool).not.toHaveBeenCalled();expect(a.controller.drawings.setTool).not.toHaveBeenCalled();expect(b.modeCalls()).toEqual([]);
 });
 it('a drawing tool on the previous chart is released through the renderer facade, not the focusing setTool',async()=>{
  const ui=await setup(),a=nativeChart();ui.ready(a);ui.open('Trend');ui.item('DW.TREND.RAY').props.onClick();expect(a.tool()).toBe('ray');
  const armCalls=a.controller.setTool.mock.calls.length,b=nativeChart();ui.ready(b);
  expect(a.tool()).toBeNull();expect(a.controller.drawings.setTool).toHaveBeenCalledExactlyOnceWith(null);expect(a.controller.setTool.mock.calls.length).toBe(armCalls);
  expect(a.controller.setDrawingMode).not.toHaveBeenCalled();expect(ui.appProps().activeTool).toBeNull();
 });
 it('the active chart unmounting leaves eraser mode before App forgets it',async()=>{
  const ui=await setup(),a=nativeChart();ui.ready(a);ui.open('Cursors');ui.item(ERASER).props.onClick();
  find(ui.render(),row=>row.type===WorkspaceChartHost).props.onReady(null);
  expect(a.mode()).toBeNull();expect(a.modeCalls()).toEqual(['eraser',null]);expect(ui.appProps().chart).toBeNull();expect(ui.appProps().activeMode).toBeNull();
 });
 it('Escape from a keyboard listener installed for a replaced chart reaches neither chart',async()=>{
  const ui=await setup(),a=nativeChart();ui.ready(a);ui.runEffect('addEventListener');const stale=ui.listeners.get('keydown')!;
  const b=nativeChart();ui.ready(b);
  stale(keyEvent('Escape'));
  expect(a.controller.setDrawingMode).not.toHaveBeenCalled();expect(a.controller.setTool).not.toHaveBeenCalled();
  expect(b.controller.setDrawingMode).not.toHaveBeenCalled();expect(b.controller.setTool).not.toHaveBeenCalled();
  ui.render();ui.runEffect('addEventListener');ui.open('Cursors');ui.item(ERASER).props.onClick();ui.listeners.get('keydown')!(keyEvent('Escape'));
  expect(b.mode()).toBeNull();expect(b.modeCalls()).toEqual(['eraser',null]);expect(a.controller.setDrawingMode).not.toHaveBeenCalled();
 });
});

// Review finding THIN_TOOLBAR_ORACLES: state matrix through App. Each state is entered
// through the toolbar, its Cursors/Trend/Measure indication is checked, then every exit
// path must leave the chart and the toolbar in cursor state.
type MatrixState='cursor'|'tool'|'measure'|'eraser';
type MatrixExit='escape'|'cursor main button'|'cursor flyout'|'renderer exit'|'active-chart change';
const MATRIX_STATES:MatrixState[]=['cursor','tool','measure','eraser'],MATRIX_EXITS:MatrixExit[]=['escape','cursor main button','cursor flyout','renderer exit','active-chart change'];
function expectToolbarState(ui:Awaited<ReturnType<typeof setup>>,chart:ReturnType<typeof nativeChart>,state:MatrixState){
 expect(chart.mode()).toBe(state==='measure'||state==='eraser'?state:null);expect(chart.tool()).toBe(state==='tool'?'ray':null);
 expect(ui.appProps().activeMode).toBe(chart.mode());expect(ui.appProps().activeTool).toBe(chart.tool());
 const main=ui.cursorsMain();
 expect(main.props['aria-label']).toBe(state==='eraser'?'Eraser':'Cursor');expect(main.props.title).toBe(state==='eraser'?'Cursors: Eraser':'Cursors: Cross');
 expect(main.props['aria-pressed']).toBe(state==='cursor'||state==='eraser');
 const trend=findAll(ui.toolbar(),node=>node.type==='button'&&String(node.props.title??'').startsWith('Trend'));expect(trend).toHaveLength(1);expect(trend[0].props['aria-pressed']).toBe(state==='tool');
 expect(ui.button('Measure').props['aria-pressed']).toBe(state==='measure');expect(ui.eraserChecked()).toBe(state==='eraser');
}
describe('ERASER.ENABLEMENT.STATE_MATRIX toolbar indication through App (state x exit path)',()=>{
 it.each(MATRIX_STATES.flatMap(state=>MATRIX_EXITS.map(exit=>[state,exit] as const)))('%s, then %s, returns to cursor state',async(state,exit)=>{
  const ui=await setup(),chart=nativeChart();ui.ready(chart);ui.runEffect('addEventListener');const keydown=ui.listeners.get('keydown')!;
  if(state==='tool'){ui.open('Trend');ui.item('DW.TREND.RAY').props.onClick();}
  else if(state==='measure')ui.button('Measure').props.onClick();
  else if(state==='eraser'){ui.open('Cursors');ui.item(ERASER).props.onClick();}
  expectToolbarState(ui,chart,state);
  if(exit==='escape')keydown(keyEvent('Escape'));
  else if(exit==='cursor main button')ui.cursorsMain().props.onClick();
  else if(exit==='cursor flyout'){ui.open('Cursors');ui.item(CROSS).props.onClick();}
  else if(exit==='renderer exit'){if(state==='tool')chart.controller.setTool(null);else if(state!=='cursor')chart.controller.setDrawingMode(null);}
  else{const other=nativeChart();ui.ready(other);expectToolbarState(ui,other,'cursor');expect(other.modeCalls()).toEqual([]);ui.ready(chart);}
  expectToolbarState(ui,chart,'cursor');
 });
});
