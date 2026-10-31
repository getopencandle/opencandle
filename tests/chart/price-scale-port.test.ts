import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {describe,expect,it,vi} from 'vitest';
import {event,priceScaleHarness} from './price-scale-harness';
import {installPriceScalePort,priceScaleFacade} from '../../src/chart/price-scale-port';
import {derivedPaperRefusal} from '../../src/domain/symbol-math-live';

// Port behavior on the package's real NativeRenderer/RendererControl (pinned Vela 0.8.4):
// every scale change below runs Vela's own applyFeature/setPane* code. Host, document and
// window are controlled stand-ins; no DOM mount, canvas paint, focus or GUI claim.
const scene=(h:ReturnType<typeof priceScaleHarness>)=>h.renderer.scene;
const near=(window:{min:number;max:number},min:number,max:number)=>{expect(window.min).toBeCloseTo(min,9);expect(window.max).toBeCloseTo(max,9);};

describe('SCALE.PORT modes through the real renderer',()=>{
 it('WS.SCALE.LOGARITHMIC/PERCENT/INDEXED/REGULAR are radio-exclusive on the price pane',()=>{
  const h=priceScaleHarness(),s=scene(h);
  expect(h.port.state()).toEqual({paneId:'price',kind:'price',mode:'regular',auto:true,invert:false});
  expect(h.port.execute('logarithmic')).toEqual({ok:true});expect([s.scaleMode,s.logScale]).toEqual(['price',true]);expect(h.port.state().mode).toBe('logarithmic');
  expect(h.port.execute('percent')).toEqual({ok:true});expect([s.scaleMode,s.logScale]).toEqual(['percent',false]);
  expect(h.port.execute('indexed')).toEqual({ok:true});expect([s.scaleMode,s.logScale]).toEqual(['indexed',false]);
  expect(h.port.execute('indexed')).toEqual({ok:true});expect([s.scaleMode,s.logScale]).toEqual(['price',false]);
  h.port.execute('logarithmic');expect(h.port.execute('regular')).toEqual({ok:true});expect([s.scaleMode,s.logScale]).toEqual(['price',false]);
  expect(h.features.get('scaleMode')).toBe('price');
 });
 it('WS.SCALE.INVERT flips the scene flag and back',()=>{
  const h=priceScaleHarness();h.port.execute('invert');expect(scene(h).invertScale).toBe(true);expect(h.port.state().invert).toBe(true);h.port.execute('invert');expect(scene(h).invertScale).toBe(false);
 });
 it('WS.SCALE.AUTO off freezes the exact current window; on drops it (renderer autoScale reads the same)',()=>{
  const h=priceScaleHarness();h.port.execute('auto');expect(h.pane().manualScale).toEqual({min:100,max:150});expect(h.features.get('autoScale')).toBe(false);expect(h.port.state().auto).toBe(false);
  h.port.execute('auto');expect(h.pane().manualScale).toBeNull();expect(h.features.get('autoScale')).toBe(true);
 });
 it('WS.SCALE.LOGARITHMIC keeps a frozen window and tags it log (Vela setPaneLog)',()=>{
  const h=priceScaleHarness();h.port.execute('auto');h.port.execute('logarithmic');expect(h.pane().manualScale).toMatchObject({min:100,max:150,log:true});h.port.execute('logarithmic');expect(h.pane().manualScale.log).toBe(false);
 });
 it('WS.SCALE.RESET_PRICE_SCALE restores auto for the target pane only',()=>{
  const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:400,scale:{min:10,max:20}},{id:'p1',kind:'study',top:403,height:197,scale:{min:0,max:100}}]});
  h.port.execute('auto',{paneId:'price'});h.port.execute('auto',{paneId:'p1'});expect(h.port.menuEntries('price')[0]).toMatchObject({id:'reset',label:'Reset price scale',shortcut:'Alt + R'});
  expect(h.port.execute('reset',{paneId:'p1'})).toEqual({ok:true});expect(h.pane('p1').manualScale).toBeNull();expect(h.pane().manualScale).toEqual({min:10,max:20});
 });
 it('study panes keep their own mode, log and invert (price pane untouched)',()=>{
  const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:400,scale:{min:10,max:20}},{id:'p1',kind:'study',top:403,height:197,scale:{min:1,max:100}}]});
  h.port.execute('logarithmic',{paneId:'p1'});h.port.execute('invert',{paneId:'p1'});
  expect(h.port.state('p1')).toEqual({paneId:'p1',kind:'study',mode:'logarithmic',auto:true,invert:true});expect(h.port.state('price')).toMatchObject({mode:'regular',invert:false});
  expect(h.port.menuEntries('p1').some(row=>row.kind==='item'&&row.id==='lockRatio')).toBe(false);
  expect(h.port.execute('lockRatio',{paneId:'p1'}).ok).toBe(false);
 });
 it('refuses while the chart is updating and for a pane that no longer exists, without changing state',()=>{
  let reason:string|null='The chart is updating. Try again in a moment.';const h=priceScaleHarness({availability:()=>reason});
  expect(h.port.execute('logarithmic')).toEqual({ok:false,message:reason});expect(scene(h).logScale).toBe(false);reason=null;
  expect(h.port.execute('invert',{paneId:'gone'}).ok).toBe(false);expect(scene(h).invertScale).toBe(false);
 });
 it('notifies subscribers once per effective change and stops after unsubscribe',()=>{
  const h=priceScaleHarness(),seen=vi.fn(),off=h.port.subscribe(seen);h.port.execute('percent');expect(seen).toHaveBeenCalledTimes(1);h.viewportChanged();expect(seen).toHaveBeenCalledTimes(1);off();h.port.execute('percent');expect(seen).toHaveBeenCalledTimes(1);
 });
});

describe('SCALE.PORT keyboard, toolbar and saved-workspace binding',()=>{
 const keydown=(code:string,extra:Record<string,unknown>={})=>event({code,key:code.slice(3).toLowerCase(),altKey:true,ctrlKey:false,metaKey:false,shiftKey:false,repeat:false,target:{closest:()=>null},...extra});
 it('WS.SCALE hotkeys refuse without a gesture host so an unsaved scale can never diverge from the workspace',()=>{
  const h=priceScaleHarness(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});try{
   const e=h.doc.dispatch('keydown',keydown('KeyL'));expect(e.defaultPrevented).toBe(true);expect(scene(h).logScale).toBe(false);expect(warn.mock.calls[0][0]).toMatch(/not connected/);
   expect(h.port.execute('percent',{origin:'toolbar'}).ok).toBe(false);expect(scene(h).scaleMode).toBe('price');
  }finally{warn.mockRestore();}
 });
 it('Alt+L / Alt+P / Alt+I / Alt+R run inside one bound gesture each (begin before change, finish after)',()=>{
  const h=priceScaleHarness(),trace:string[]=[];
  h.port.bindHost({gesture:{begin(){trace.push('begin:'+scene(h).logScale);return true;},finish(){trace.push('finish:'+scene(h).logScale);}}});
  h.doc.dispatch('keydown',keydown('KeyL'));expect(trace).toEqual(['begin:false','finish:true']);
  h.doc.dispatch('keydown',keydown('KeyP'));expect([scene(h).scaleMode,scene(h).logScale]).toEqual(['percent',false]);
  h.doc.dispatch('keydown',keydown('KeyI'));expect(scene(h).invertScale).toBe(true);
  h.port.execute('auto');h.doc.dispatch('keydown',keydown('KeyR'));expect(h.pane().manualScale).toBeNull();
  expect(trace.length).toBe(10);
 });
 it('hotkeys ignore editable targets, composition, repeats, extra modifiers and an unfocused chart',()=>{
  const h=priceScaleHarness();h.port.bindHost({gesture:{begin:()=>true,finish(){}}});
  h.doc.dispatch('keydown',keydown('KeyL',{target:{closest:()=>({tag:'input'})}}));
  h.doc.dispatch('keydown',keydown('KeyL',{isComposing:true}));
  h.doc.dispatch('keydown',keydown('KeyL',{repeat:true}));
  h.doc.dispatch('keydown',keydown('KeyL',{ctrlKey:true}));
  h.doc.dispatch('keydown',keydown('KeyL',{shiftKey:true}));
  h.doc.activeElement=h.doc.body;h.doc.dispatch('keydown',keydown('KeyL'));
  expect(scene(h).logScale).toBe(false);
  h.doc.activeElement=h.panel;h.doc.dispatch('keydown',keydown('KeyL'));expect(scene(h).logScale).toBe(true);
 });
 it('a refused gesture begin changes nothing; one host at a time; release unbinds',()=>{
  const h=priceScaleHarness(),release=h.port.bindHost({gesture:{begin:()=>false,finish:vi.fn()}});
  expect(h.port.execute('logarithmic',{origin:'keyboard'}).ok).toBe(false);expect(scene(h).logScale).toBe(false);
  expect(()=>h.port.bindHost({})).toThrow(/already bound/);release();expect(()=>h.port.bindHost({})).not.toThrow();
 });
 it('bottom toolbar buttons follow the main scale in reference order with reference tooltips',()=>{
  const h=priceScaleHarness();h.port.bindHost({gesture:{begin:()=>true,finish(){}}});
  expect(h.port.toolbar().map(row=>[row.text,row.tooltip,row.dataName,row.pressed])).toEqual([['%','Toggle Percentage','percentage',false],['log','Toggle Log Scale','logarithm',false],['auto','Toggle Auto Scale','auto',true]]);
  h.port.execute('logarithmic',{origin:'toolbar'});h.port.execute('auto',{origin:'toolbar'});
  expect(h.port.toolbar().map(row=>row.pressed)).toEqual([false,true,false]);
 });
});

describe('SCALE.PORT price-to-bar lock (OpenCandle definition, see evidence)',()=>{
 it('WS.SCALE.PRICE_TO_BAR_RATIO_LOCK freezes the window, disables modes and auto, and keeps the ratio across zoom',()=>{
  const h=priceScaleHarness(),commits:any[]=[];h.port.bindHost({gesture:{begin:()=>true,finish(){}},commitSettings:value=>{commits.push(value);return true;}});
  expect(h.port.ratio()).toBeCloseTo(0.6,12); // 50 / 500 * 6
  expect(h.port.execute('lockRatio')).toEqual({ok:true});expect(commits.at(-1).lockRatio).toBe(true);expect(commits.at(-1).ratio).toBeCloseTo(0.6,12);expect(h.pane().manualScale).toEqual({min:100,max:150});
  const menu=h.port.menuEntries();expect(menu.find((row:any)=>row.id==='lockRatio')).toMatchObject({checked:true,hint:'0.6000'});
  for(const id of ['auto','regular','percent','indexed','logarithmic'])expect((menu.find((row:any)=>row.id===id) as any).disabled,id).toBeTruthy();
  expect(h.port.execute('logarithmic',{origin:'toolbar'}).ok).toBe(false);expect(scene(h).logScale).toBe(false);
  h.renderer.coords.viewport.barSpacing=12;h.viewportChanged();near(h.pane().manualScale,112.5,137.5);
  h.renderer.coords.viewport.barSpacing=3;h.viewportChanged();near(h.pane().manualScale,75,175);
  expect(h.port.execute('lockRatio')).toEqual({ok:true});expect(commits.at(-1)).toMatchObject({lockRatio:false,ratio:null});
  h.renderer.coords.viewport.barSpacing=6;h.viewportChanged();near(h.pane().manualScale,75,175);
 });
 it('FX-F1: a lock or reset-while-locked hands its document to the gesture flush; folded means no second publication',()=>{
  const h=priceScaleHarness(),commits:any[]=[],flushes:any[]=[];let fold=true;
  h.port.bindHost({gesture:{begin:()=>true,finish:vi.fn(),flush:(settings?:any)=>{flushes.push(settings);return fold;}},commitSettings:value=>{commits.push(value);return true;}});
  expect(h.port.execute('lockRatio',{origin:'toolbar'})).toEqual({ok:true});expect(flushes.at(-1)).toMatchObject({lockRatio:true});expect(commits).toEqual([]);
  expect(h.port.execute('reset',{origin:'keyboard'})).toEqual({ok:true});expect(flushes.at(-1)).toMatchObject({lockRatio:false,ratio:null});expect(commits).toEqual([]);expect(h.pane().manualScale).toBeNull();
  // A flush that saved no frame change (nothing to fold) leaves the document to the port: still exactly one publication.
  fold=false;expect(h.port.execute('lockRatio',{origin:'toolbar'})).toEqual({ok:true});expect(commits).toHaveLength(1);expect(commits[0]).toMatchObject({lockRatio:true});
  // The flushed copy is detached from the port's live document.
  flushes.at(-1).lockRatio=false;expect(h.port.settings().lockRatio).toBe(true);
 });
 it('a rejected settings commit leaves the lock off',()=>{
  const h=priceScaleHarness();h.port.bindHost({commitSettings:()=>false});expect(h.port.execute('lockRatio').ok).toBe(false);expect(h.port.settings().lockRatio).toBe(false);
 });
 it('restored settings re-apply the lock and the last price label flag',()=>{
  const h=priceScaleHarness(),value={...h.port.settings(),lockRatio:true,ratio:0.3,labels:{...h.port.settings().labels,symbolLast:false}};
  h.port.applySettings(value);expect(h.features.get('priceLabel')).toBe(false);near(h.pane().manualScale,112.5,137.5);
  expect(()=>h.port.applySettings({...value,ratio:null})).toThrow();
 });
});

describe('SCALE.PORT labels and lines',()=>{
 it('Symbol last price label toggles the renderer label and is saved through the settings binding',()=>{
  const h=priceScaleHarness(),saved:any[]=[];h.port.bindHost({commitSettings:value=>{saved.push(value);return true;}});
  expect(h.port.execute('labels.symbolLast')).toEqual({ok:true});expect(h.features.get('priceLabel')).toBe(false);expect(saved.at(-1).labels.symbolLast).toBe(false);
  h.port.execute('labels.symbolLast');expect(h.features.get('priceLabel')).toBe(true);
 });
 it('price line, countdown and high/low lines read and write the chart appearance (single source of truth)',()=>{
  const h=priceScaleHarness({appearance:{'mainSeriesProperties.showPriceLine':true,'mainSeriesProperties.showCountdown':false,'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible':false}});
  expect(h.port.settings().lines.priceLine).toBe(true);expect(h.port.settings().labels.countdown).toBe(false);
  expect(h.port.execute('lines.priceLine').ok).toBe(false); // no appearance binding: disabled entry
  const patches:any[]=[];h.port.bindHost({commitAppearance:patch=>{patches.push(patch);return true;}});
  h.port.execute('lines.priceLine');h.port.execute('labels.countdown');h.port.execute('lines.highLowLines');
  expect(patches).toEqual([{'mainSeriesProperties.showPriceLine':false},{'mainSeriesProperties.showCountdown':true},{'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible':true}]);
 });
 it('unsupported entries refuse with their reason and change nothing',()=>{
  const h=priceScaleHarness(),before=JSON.stringify(h.port.settings());
  for(const id of ['moveLeft','more'] as const){const result=h.port.execute(id);expect(result.ok,id).toBe(false);expect(result.message,id).toBeTruthy();}
  expect(JSON.stringify(h.port.settings())).toBe(before);
 });
 it('lane A: scale-only, label, line and plus toggles are live settings document changes',()=>{
  const h=priceScaleHarness(),commits:any[]=[];h.port.bindHost({commitSettings:value=>{commits.push(value);return true;}});
  const paths:Record<string,(s:any)=>boolean>={scaleSeriesOnly:s=>s.scaleSeriesOnly,'labels.symbolName':s=>s.labels.symbolName,'labels.prevClose':s=>s.labels.prevClose,'labels.highLow':s=>s.labels.highLow,'labels.indName':s=>s.labels.indName,'labels.indValue':s=>s.labels.indValue,'labels.noOverlap':s=>s.labels.noOverlap,'lines.prevCloseLine':s=>s.lines.prevCloseLine,plusButton:s=>s.plusButton};
  for(const [id,read] of Object.entries(paths)){const before=read(h.port.settings()),result=h.port.execute(id as any);expect(result,id).toEqual({ok:true});expect(read(h.port.settings()),id).toBe(!before);expect(read(commits.at(-1)),id).toBe(!before);}
  expect(commits).toHaveLength(9);
 });
});

describe('SCALE.PORT axis A/L buttons and disposal',()=>{
 it('axis A/L buttons route through the port (radio log) and carry the reference aria labels',()=>{
  const renderer:any={};const buttons:any={deps:{onToggleAuto:vi.fn(),onToggleLog:vi.fn()},autoBtn:{label:'Auto',getAttribute(){return this.label;},setAttribute(_n:string,v:string){this.label=v;}},logBtn:{label:'Logarithmic scale',getAttribute(){return this.label;},setAttribute(_n:string,v:string){this.label=v;}}};
  const h=priceScaleHarness();h.port.dispose();h.renderer.axisScaleButtons=buttons;void renderer;
  const port=installPriceScalePort({renderer:h.renderer,features:h.features as any,onViewportChanged:()=>()=>{},container:h.container});
  expect(buttons.autoBtn.label).toBe('Toggle auto scale');expect(buttons.logBtn.label).toBe('Toggle log scale');
  port.execute('percent');buttons.deps.onToggleLog('price');expect([h.renderer.scene.scaleMode,h.renderer.scene.logScale]).toEqual(['price',true]);
  buttons.deps.onToggleAuto('price');expect(h.pane().manualScale).not.toBeNull();
  port.dispose();expect(buttons.autoBtn.label).toBe('Auto');expect(buttons.logBtn.label).toBe('Logarithmic scale');buttons.deps.onToggleLog('price');expect(h.renderer.scene.logScale).toBe(true);
 });
 it('dispose removes every listener, closes the menu, disposes the mount and refuses later actions',()=>{
  const h=priceScaleHarness();h.port.openMenu('price',{x:900,y:100});expect(h.port.isMenuOpen()).toBe(true);
  h.port.dispose();expect(h.port.isMenuOpen()).toBe(false);expect(h.mount.dispose).toHaveBeenCalledTimes(1);
  expect([h.container.count('contextmenu'),h.container.count('pointerup'),h.container.count('dblclick'),h.doc.count('keydown'),h.doc.count('pointerdown'),h.win.count('blur'),h.viewportListeners()]).toEqual([0,0,0,0,0,0,0]);
  expect(h.port.execute('invert')).toEqual({ok:false,message:'This chart is closed.'});
 });
 it('the controller facade reports unavailable before install instead of throwing from execute',()=>{
  const facade=priceScaleFacade(()=>null);expect(facade.execute('invert')).toEqual({ok:false,message:'The price scale is unavailable for this chart.'});expect(()=>facade.state()).toThrow(/unavailable/);expect(facade.isMenuOpen()).toBe(false);expect('dispose' in facade).toBe(false);
 });
});

describe('SCALE.ADAPTER actual install block',()=>{
 it('the adapter installs the port on the renderer with its availability reasons and disposes it with the chart unsubscribes',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n'),start=source.indexOf('  let priceScalePort:PriceScalePort|null=null;'),end=source.indexOf('\n  disposeChart=()=>{',start);
  if(start<0||end<0)throw Error('Review current adapter price scale install boundary.');
  const h=priceScaleHarness();h.port.dispose();
  let installed:any=null;const install=(options:any)=>{installed=options;return installPriceScalePort({...options,mount:()=>h.mount});};
  const chart={renderer:h.features,on:(name:string,listener:()=>void)=>{expect(name).toBe('viewport:changed');expect(typeof listener).toBe('function');return()=>{};}};
  const run=new Function('return '+stripTypeScriptTypes(`(function(injected){const {installPriceScalePort,rendererHolder,chart,container,marketQueue,state,unsubscribes,derivedPaperRefusal}=injected;let disposed=false,analysisUnavailable='',analysisPending=0,lastAppearance={'mainSeriesProperties.showPriceLine':true},axisLabelPort=null,indicatorDisplay=null,diagnostics=[];const currentSource={},currentBars=[{time:1700000000,close:101.5}],knownTypes=new Set(['hline']),added=injected.added,sourceTickSize=()=>0.05,sourceAxisBasis=()=>({symbol:'SYN'}),assertDuplicateMutable=()=>{},gateIndicatorLabels=options=>options,indicatorDisplayOptionsFromAppearance=()=>({labelsVisible:true,valuesVisible:true});chart.drawings={add:(type,init)=>{added.push([type,init]);return{id:'h1'};}};const set=(next)=>{disposed=next.disposed??disposed;analysisUnavailable=next.unavailable??analysisUnavailable;analysisPending=next.pending??analysisPending;};${source.slice(start,end)}\nreturn{port:priceScalePort,set,labelPort:()=>axisLabelPort};})`,{mode:'strip'}))();
  const unsubscribes:Array<()=>void>=[];let pending=false;
  const added:unknown[]=[];
  // The install block reads the derived-chart paper refusal (null for a plain dataset).
  const result=run({installPriceScalePort:install,rendererHolder:{current:h.renderer},chart,container:h.container,marketQueue:{isPending:()=>pending},unsubscribes,added,derivedPaperRefusal});
  // The instrument tick, symbol, last price and the horizontal line route reach the port; the painter reads the same port.
  expect(installed.tickSize()).toBe(0.05);expect(installed.instrument()).toEqual({symbol:'SYN',last:101.5,paperRefusal:null});expect(result.labelPort()).toBe(result.port);
  expect(installed.drawHorizontalLine(101.25)).toEqual({ok:true});expect(added).toEqual([['hline',{paneId:'price',anchors:[{time:1700000000000,price:101.25}]}]]);
  expect(installed.renderer).toBe(h.renderer);expect(installed.features).toBe(h.features);expect(installed.container).toBe(h.container);expect(installed.appearance()).toEqual({'mainSeriesProperties.showPriceLine':true});
  expect(installed.availability()).toBeNull();pending=true;expect(installed.availability()).toBe('The chart is updating. Try again in a moment.');pending=false;
  result.set({unavailable:'SYNTHETIC unavailable'});expect(installed.availability()).toBe('SYNTHETIC unavailable');result.set({disposed:true});expect(installed.availability()).toBe('This chart is closed.');
  expect(unsubscribes).toHaveLength(1);expect(h.container.count('contextmenu')).toBe(1);unsubscribes[0]();expect(h.container.count('contextmenu')).toBe(0);expect(result.labelPort()).toBeNull();
 });
});
