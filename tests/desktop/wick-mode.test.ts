import {describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const nodeRequire=createRequire(import.meta.url);
// Electron/wick.cjs with controlled Electron objects (windows, screen, Menu and timers mocked). No process,
// window or screen is used.
const wick=nodeRequire('../../electron/wick.cjs');

const THEME={'--lv-bg-raised':'#1f1f1f','--lv-text-primary':'rgb(219, 219, 219)','--lv-positive-text':'rgba(34,171,148,.9)'};
const snapshot=(active='a')=>({tabs:[{id:'a',symbol:'GME',name:'Main',active:active==='a',price:'23.82',change:'-0.75%',tone:'down'},{id:'b',symbol:'SPY',name:'Index',active:active==='b'}],theme:THEME});

describe('Wick mode inputs',()=>{
 it('the Settings rows are exactly two booleans',()=>{
  expect(wick.wickPreferenceInput({alwaysOnTop:false,collapseOnBlur:true})).toEqual({alwaysOnTop:false,collapseOnBlur:true});
  for(const bad of [null,undefined,[],{},{alwaysOnTop:true},{alwaysOnTop:'yes',collapseOnBlur:false},{alwaysOnTop:true,collapseOnBlur:false,extra:1}])expect(()=>wick.wickPreferenceInput(bad)).toThrow();
 });
 it('a tab request is exactly {id} with a layout identifier',()=>{
  expect(wick.wickTabInput({id:'layout-1'})).toEqual({id:'layout-1'});
  for(const bad of [{},{id:''},{id:'a b'},{id:'x'.repeat(201)},{id:1},{id:'a',more:1},'a'])expect(()=>wick.wickTabInput(bad)).toThrow();
 });
 it('the tab strip snapshot is plain short text, one active tab, only the fixed theme tokens and colour values',()=>{
  expect(wick.wickSnapshotInput(snapshot())).toEqual(snapshot());
  const bad=[
   {tabs:[],theme:{}},{tabs:snapshot().tabs},{...snapshot(),extra:1},
   {tabs:[{...snapshot().tabs[0],active:false},snapshot().tabs[1]],theme:{}},
   {tabs:[snapshot().tabs[0],{...snapshot().tabs[1],active:true}],theme:{}},
   {tabs:[snapshot().tabs[0],{...snapshot().tabs[1],id:'a'}],theme:{}},
   {tabs:[{...snapshot().tabs[0],name:'line\nbreak'}],theme:{}},
   {tabs:[{...snapshot().tabs[0],tone:'sideways'}],theme:{}},
   {tabs:[{...snapshot().tabs[0],url:'https://x'}],theme:{}},
   {tabs:[snapshot().tabs[0]],theme:{'--lv-bg-raised':'url(https://x)'}},
   {tabs:[snapshot().tabs[0]],theme:{'--other':'#fff'}},
   {tabs:[snapshot().tabs[0]],theme:{'--lv-bg-raised':'red; background:url(x)'}},
   {tabs:Array.from({length:51},(_,i)=>({id:'t'+i,symbol:'',name:'n',active:i===0})),theme:{}},
  ];
  for(const value of bad)expect(()=>wick.wickSnapshotInput(value),JSON.stringify(value).slice(0,80)).toThrow();
 });
});

describe('Wick mode saved state',()=>{
 it('defaults: on top, no collapse on leaving; anything unreadable gives them',()=>{
  expect(wick.WICK_DEFAULTS).toEqual({alwaysOnTop:true,collapseOnBlur:false});
  for(const text of [null,'','{',JSON.stringify({schemaVersion:2}),'x'.repeat(20000)])expect(wick.parseWickState(text)).toEqual({alwaysOnTop:true,collapseOnBlur:false,places:{}});
 });
 it('round-trips, keeping only valid places per display',()=>{
  const state={alwaysOnTop:false,collapseOnBlur:true,places:{'2779098405':{dx:10,dy:20,width:600},'bad key!':{dx:0,dy:0,width:400},'7':{dx:0,dy:0,width:20}}};
  expect(wick.parseWickState(wick.serializeWickState(state))).toEqual({alwaysOnTop:false,collapseOnBlur:true,places:{'2779098405':{dx:10,dy:20,width:600}}});
 });
});

describe('Wick mode strip placement',()=>{
 const area={x:0,y:0,width:1920,height:1040},right={x:1920,y:0,width:2560,height:1400};
 it('the default place is the top right corner of the work area, one tab row high',()=>{
  expect(wick.defaultStripBounds(area)).toEqual({x:1920-560-16,y:16,width:560,height:34});
 });
 it('clamps fully on screen: width within limits and the work area, every edge inside',()=>{
  expect(wick.clampStrip({x:-500,y:-50,width:600},area)).toEqual({x:0,y:0,width:600,height:34});
  expect(wick.clampStrip({x:1800,y:2000,width:600},area)).toEqual({x:1320,y:1006,width:600,height:34});
  expect(wick.clampStrip({x:10,y:10,width:40},area).width).toBe(wick.MIN_STRIP_WIDTH);
  expect(wick.clampStrip({x:10,y:10,width:9000},{x:0,y:0,width:1280,height:720})).toEqual({x:0,y:10,width:1280,height:34});
  expect(wick.clampStrip({x:0,y:0,width:400},null)).toBeNull();
 });
 it('remembers its place per display, relative to the work area, and comes back clamped after a scale change',()=>{
  const display={id:42,workArea:right};
  const saved=wick.placeOf({x:2000,y:100,width:700,height:34},display);
  expect(saved).toEqual({key:'42',place:{dx:80,dy:100,width:700}});
  expect(wick.stripBoundsFor({[saved.key]:saved.place},display)).toEqual({x:2000,y:100,width:700,height:34});
  // 150% scale: the same monitor reports a smaller work area in DIPs.
  expect(wick.stripBoundsFor({[saved.key]:saved.place},{id:42,workArea:{x:1920,y:0,width:640,height:400}})).toEqual({x:1920,y:100,width:640,height:34});
  expect(wick.stripBoundsFor({[saved.key]:saved.place},{id:7,workArea:area}),'another display: its own default').toEqual(wick.defaultStripBounds(area));
 });
 it('the full window comes back where it was only when that place is still on a display',()=>{
  expect(wick.onScreen({x:100,y:100,width:1200,height:800},[area])).toBe(true);
  expect(wick.onScreen({x:3000,y:100,width:1200,height:800},[area]),'monitor unplugged').toBe(false);
  expect(wick.onScreen({x:3000,y:100,width:1200,height:800},[area,right])).toBe(true);
 });
});

describe('Wick mode collapse on leaving',()=>{
 const ok={enabled:true,active:false,now:10000,loadedAt:1000,restoredAt:null,quitting:false,main:{visible:true,minimized:false,fullScreen:false,enabled:true,focused:false},focusedOther:false};
 it('collapses only when every guard passes',()=>{
  expect(wick.mayCollapse(ok)).toBe(true);
  const cases:Array<[string,object]>=[['option off',{enabled:false}],['already on',{active:true}],['quitting',{quitting:true}],['another OpenCandle window has the focus',{focusedOther:true}],
   ['before the page loaded',{loadedAt:null}],['during startup',{loadedAt:9000}],['just restored',{restoredAt:9500}],
   ['hidden (tray)',{main:{...ok.main,visible:false}}],['minimized',{main:{...ok.main,minimized:true}}],['full screen',{main:{...ok.main,fullScreen:true}}],
   ['a native dialog disables the window',{main:{...ok.main,enabled:false}}],['focus came back',{main:{...ok.main,focused:true}}],['no window',{main:null}]];
  for(const [name,change] of cases)expect(wick.mayCollapse({...ok,...change}),name).toBe(false);
  expect(wick.mayCollapse({...ok,restoredAt:8000}),'cooldown over').toBe(true);
 });
 it('waits 400 ms, restarts on a second blur, and drops on focus; the end of the wait decides again',()=>{
  vi.useFakeTimers();
  try{
   let allow=true;const collapse=vi.fn(),phases:string[]=[];
   const d=wick.createBlurDebounce({check:(phase:string)=>{phases.push(phase);return allow;},collapse});
   expect(d.blur()).toBe(true);vi.advanceTimersByTime(399);expect(collapse).not.toHaveBeenCalled();
   d.blur();vi.advanceTimersByTime(399);expect(collapse).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(collapse).toHaveBeenCalledOnce();
   d.blur();d.focus();vi.advanceTimersByTime(1000);expect(collapse).toHaveBeenCalledOnce();expect(d.pending()).toBe(false);
   d.blur();allow=false;vi.advanceTimersByTime(400);expect(collapse).toHaveBeenCalledOnce();
   expect(d.blur()).toBe(false);expect(d.pending()).toBe(false);
   expect(phases.slice(0,3)).toEqual(['blur','blur','fire']);
  }finally{vi.useRealTimers();}
 });
});

// ---- the controller with mock windows ----
class MockContents extends EventEmitter{mainFrame={url:'lv://app/index.html?window=wick'};send=vi.fn();isDestroyed=()=>false;}
class MockWindow extends EventEmitter{
 webContents=new MockContents();destroyed=false;visible=false;minimized=false;maximized=false;full=false;enabled=true;focused=false;onTop:boolean|null=null;skip:boolean|null=null;
 bounds={x:100,y:80,width:1440,height:960};
 constructor(public options:any={}){super();if(options.x!==undefined)this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};}
 isDestroyed=()=>this.destroyed;isVisible=()=>this.visible;isMinimized=()=>this.minimized;isMaximized=()=>this.maximized;isFullScreen=()=>this.full;isEnabled=()=>this.enabled;isFocused=()=>this.focused;
 getBounds=()=>({...this.bounds});getNormalBounds=()=>({...this.bounds});setBounds=vi.fn((b:any)=>{this.bounds={...this.bounds,...b};});
 show=vi.fn(()=>{this.visible=true;this.emit('show');});showInactive=vi.fn(()=>{this.visible=true;});hide=vi.fn(()=>{this.visible=false;});blur=vi.fn(()=>{this.focused=false;});focus=vi.fn(()=>{this.focused=true;});
 restore=vi.fn(()=>{this.minimized=false;});maximize=vi.fn(()=>{this.maximized=true;});center=vi.fn();
 setFullScreen=vi.fn((on:boolean)=>{this.full=on;if(!on)this.emit('leave-full-screen');});
 setAlwaysOnTop=vi.fn((on:boolean)=>{this.onTop=on;});setSkipTaskbar=vi.fn((on:boolean)=>{this.skip=on;});
 hooks=new Map<number,()=>void>();hookWindowMessage=(m:number,f:()=>void)=>{this.hooks.set(m,f);};loadURL=vi.fn(async()=>{});close=vi.fn();destroy=vi.fn(()=>{this.destroyed=true;});
}
function controller(options:{collapseOnBlur?:boolean;state?:string|null}={}){
 const main=new MockWindow();main.visible=true;main.focused=true;
 const created:MockWindow[]=[],files=new Map<string,string>();
 if(options.state)files.set('state',options.state);
 const displays=[{id:1,workArea:{x:0,y:0,width:1920,height:1040}},{id:2,workArea:{x:1920,y:0,width:2560,height:1400}}];
 const screen=Object.assign(new EventEmitter(),{getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],getDisplayMatching:(b:any)=>displays.find(d=>b.x>=d.workArea.x&&b.x<d.workArea.x+d.workArea.width)??displays[0]});
 const menus:any[]=[];const Menu={buildFromTemplate:(template:any[])=>{const menu={template,popup:vi.fn()};menus.push(menu);return menu;}};
 let clock=100000,focused:any=main;const quit=vi.fn();
 const mode=wick.createWickMode({getMain:()=>main,createWindow:(o:any)=>{const w=new MockWindow(o);created.push(w);return w;},screen,Menu,
  store:{read:async()=>files.get('state')??null,write:async(text:string)=>{files.set('state',text);}},loadedAt:()=>1000,isQuitting:()=>false,quit,focusedWindow:()=>focused,now:()=>clock});
 const strip=()=>created[0];
 return{mode,main,created,strip,files,menus,screen,quit,displays,setFocused:(w:any)=>{focused=w;},tick:(ms:number)=>{clock+=ms;}};
}

describe('Wick mode controller',()=>{
 it('enter: shows the hardened strip without the focus, on top, at the default place, then hides (never closes) the main window',async()=>{
  const c=controller();await c.mode.load();
  expect(c.mode.enter()).toEqual({active:true});
  const s=c.strip();expect(c.created).toHaveLength(1);
  expect(s.options).toMatchObject({frame:false,resizable:true,maximizable:false,minimizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,show:false,minHeight:34,maxHeight:34});
  expect(s.show).toHaveBeenCalledOnce();expect(s.showInactive).not.toHaveBeenCalled();expect(s.focus).toHaveBeenCalled();expect(c.main.blur).toHaveBeenCalled();
  expect(s.bounds).toEqual({x:1920-560-16,y:16,width:560,height:34});expect(s.onTop).toBe(true);
  expect(c.main.hide).toHaveBeenCalledOnce();expect(c.main.close).not.toHaveBeenCalled();expect(c.main.destroyed).toBe(false);
  await Promise.resolve();expect(s.loadURL).toHaveBeenCalledWith('lv://app/index.html?window=wick');
  expect(c.main.webContents.send).toHaveBeenLastCalledWith('lv:wick:state',{active:true,alwaysOnTop:true,collapseOnBlur:false});
  expect(c.mode.enter()).toEqual({active:true});expect(c.created).toHaveLength(1);
 });
 it('exit: hides the strip and brings the full window back at its exact bounds, or its maximized state, focused',async()=>{
  const c=controller();await c.mode.load();
  c.main.bounds={x:300,y:200,width:1200,height:800};c.mode.enter();c.main.bounds={x:0,y:0,width:1000,height:700};
  expect(c.mode.exit()).toEqual({active:false});
  expect(c.strip().hide).toHaveBeenCalledOnce();expect(c.main.show).toHaveBeenCalledOnce();expect(c.main.focus).toHaveBeenCalled();
  expect(c.main.bounds).toEqual({x:300,y:200,width:1200,height:800});
  c.main.maximized=true;c.mode.enter();c.main.maximized=false;c.mode.exit();expect(c.main.maximize).toHaveBeenCalledOnce();
  // The saved place is gone (monitor unplugged): the window is centered instead of opening off screen.
  c.main.maximized=false;c.main.bounds={x:9000,y:200,width:1200,height:800};c.mode.enter();c.mode.exit();expect(c.main.center).toHaveBeenCalledOnce();
 });
 it('explicit entry focuses the strip; the automatic collapse never takes the focus',async()=>{
  vi.useFakeTimers();
  try{
   const c=controller();await c.mode.load();c.mode.enter();
   expect(c.strip().show).toHaveBeenCalledOnce();expect(c.strip().focus).toHaveBeenCalled();expect(c.main.hide).toHaveBeenCalledOnce();
   c.mode.exit();c.strip().show.mockClear();c.strip().focus.mockClear();c.tick(2000);
   c.mode.enter({focus:false});
   expect(c.strip().showInactive).toHaveBeenCalledOnce();expect(c.strip().show).not.toHaveBeenCalled();expect(c.strip().focus).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('a right-click on the draggable part opens the menu once, from either report',async()=>{
  vi.useFakeTimers();
  try{
   const c=controller();await c.mode.load();c.mode.enter();const s=c.strip();
   s.hooks.get(0x00A5)!();const event={preventDefault:vi.fn()};s.emit('system-context-menu',event);vi.advanceTimersByTime(5);
   expect(c.menus).toHaveLength(1);c.tick(400);s.hooks.get(0x00A5)!();vi.advanceTimersByTime(5);expect(c.menus).toHaveLength(2);
  }finally{vi.useRealTimers();}
 });
 it('from full screen it leaves full screen first and goes back into it on return',async()=>{
  vi.useFakeTimers();
  try{
   const c=controller();await c.mode.load();c.main.full=true;
   c.mode.enter();expect(c.main.setFullScreen).toHaveBeenCalledWith(false);expect(c.main.hide).not.toHaveBeenCalled();
   vi.advanceTimersByTime(60);expect(c.main.hide).toHaveBeenCalledOnce();expect(c.strip().show).toHaveBeenCalledOnce();
   vi.advanceTimersByTime(2000);expect(c.main.hide).toHaveBeenCalledOnce();
   c.mode.exit();expect(c.main.setFullScreen).toHaveBeenLastCalledWith(true);
  }finally{vi.useRealTimers();}
 });
 it('remembers the strip place per display and reuses it next time',async()=>{
  vi.useFakeTimers();
  try{
   const c=controller();await c.mode.load();c.mode.enter();const s=c.strip();
   s.bounds={x:2100,y:300,width:800,height:34};s.emit('moved');vi.advanceTimersByTime(400);
   expect(JSON.parse(c.files.get('state')!).places).toEqual({'2':{dx:180,dy:300,width:800}});
   c.mode.exit();c.main.bounds={x:2000,y:100,width:1440,height:960};c.mode.enter();
   expect(s.bounds).toEqual({x:2100,y:300,width:800,height:34});
   // A display change moves the strip back fully on screen.
   s.bounds={x:4400,y:300,width:800,height:34};c.screen.emit('display-metrics-changed');vi.advanceTimersByTime(60);
   expect(s.bounds).toEqual({x:1920+2560-800,y:300,width:800,height:34});
  }finally{vi.useRealTimers();}
 });
 it('collapses 400 ms after the app is left, only when the option is on and nothing guards it',async()=>{
  vi.useFakeTimers();
  try{
   const c=controller();await c.mode.load();
   const leave=()=>{c.main.focused=false;c.setFocused(null);return c.mode.mainBlur();};
   expect(leave(),'option off').toBe(false);
   c.mode.configure({alwaysOnTop:true,collapseOnBlur:true});
   expect(leave()).toBe(true);vi.advanceTimersByTime(399);expect(c.created).toHaveLength(0);vi.advanceTimersByTime(1);
   expect(c.mode.isActive()).toBe(true);expect(c.main.hide).toHaveBeenCalledOnce();
   c.mode.exit();c.tick(2000);
   // The focus comes back within the wait (a quick switch): nothing happens.
   leave();vi.advanceTimersByTime(200);c.main.focused=true;c.mode.mainFocus();vi.advanceTimersByTime(400);expect(c.mode.isActive()).toBe(false);
   // A native dialog disables the window; another OpenCandle window took the focus; minimized; hidden to the tray.
   c.main.enabled=false;expect(leave()).toBe(false);c.main.enabled=true;
   leave();c.setFocused(new MockWindow());vi.advanceTimersByTime(400);expect(c.mode.isActive()).toBe(false);
   c.main.minimized=true;expect(leave()).toBe(false);c.main.minimized=false;
   leave();c.main.visible=false;vi.advanceTimersByTime(400);expect(c.mode.isActive()).toBe(false);c.main.visible=true;
   // Turning the option off drops a pending collapse.
   leave();c.mode.configure({alwaysOnTop:true,collapseOnBlur:false});vi.advanceTimersByTime(400);expect(c.mode.isActive()).toBe(false);
  }finally{vi.useRealTimers();}
 });
 it('does not collapse right after the full window came back',async()=>{
  vi.useFakeTimers();
  try{
   const c=controller();await c.mode.load();c.mode.configure({alwaysOnTop:true,collapseOnBlur:true});
   c.mode.enter();c.mode.exit();c.main.focused=false;c.setFocused(null);
   expect(c.mode.mainBlur()).toBe(false);c.tick(1000);expect(c.mode.mainBlur()).toBe(true);
  }finally{vi.useRealTimers();}
 });
 it('the strip menu: Open OpenCandle, Always on top, Exit Wick mode, Quit; the toggle saves, applies and tells the main window',async()=>{
  const c=controller();await c.mode.load();c.mode.enter();const s=c.strip();
  expect(c.mode.menu()).toEqual({shown:true});
  const template=c.menus[0].template;expect(template.map((row:any)=>row.type==='separator'?'-':row.label)).toEqual(['Open OpenCandle','Always on top','-','Exit Wick mode','Quit']);
  expect(template[1]).toMatchObject({type:'checkbox',checked:true});expect(c.menus[0].popup).toHaveBeenCalledWith({window:s});
  template[1].click();expect(s.onTop).toBe(false);expect(s.skip,'off top it gets a taskbar button').toBe(false);
  expect(c.main.webContents.send).toHaveBeenLastCalledWith('lv:wick:state',{active:true,alwaysOnTop:false,collapseOnBlur:false});
  await Promise.resolve();expect(JSON.parse(c.files.get('state')!).alwaysOnTop).toBe(false);
  template[4].click();expect(c.quit).toHaveBeenCalledOnce();
  template[3].click();expect(c.mode.isActive()).toBe(false);
  // A right-click on the draggable part opens the same menu instead of the system menu.
  c.mode.enter();const event={preventDefault:vi.fn()};s.emit('system-context-menu',event);expect(event.preventDefault).toHaveBeenCalled();expect(c.menus).toHaveLength(2);
 });
 it('Esc in the strip, a strip close (Alt+F4) and the tray or a second start showing the window all end Wick mode',async()=>{
  const c=controller();await c.mode.load();c.mode.enter();const s=c.strip();
  const esc={preventDefault:vi.fn()};s.webContents.emit('before-input-event',esc,{type:'keyDown',key:'Escape'});
  expect(esc.preventDefault).toHaveBeenCalled();expect(c.mode.isActive()).toBe(false);
  c.mode.enter();const close={preventDefault:vi.fn()};s.emit('close',close);expect(close.preventDefault).toHaveBeenCalled();expect(c.mode.isActive()).toBe(false);
  c.mode.enter();const shows=c.main.show.mock.calls.length;c.mode.mainShown();expect(c.mode.isActive()).toBe(false);expect(c.main.show.mock.calls.length,'not shown twice').toBe(shows);
  expect(s.hide).toHaveBeenCalledTimes(3);
 });
 it('forwards the tab strip to the strip page once it is ready; a tab click switches tabs, the active tab opens the full window',async()=>{
  const c=controller();await c.mode.load();
  expect(()=>c.mode.publish({tabs:[]})).toThrow();
  c.mode.publish(snapshot());c.mode.enter();const s=c.strip();
  expect(s.webContents.send).not.toHaveBeenCalled();
  expect(c.mode.ready()).toEqual(snapshot());
  c.mode.publish(snapshot('b'));expect(s.webContents.send).toHaveBeenLastCalledWith('lv:wick:snapshot',snapshot('b'));
  expect(c.mode.selectTab({id:'a'})).toEqual({restored:false});expect(c.main.webContents.send).toHaveBeenLastCalledWith('lv:wick:tab-request',{id:'a'});
  expect(()=>c.mode.selectTab({id:'zzz'})).toThrow(/not open/);
  expect(c.mode.selectTab({id:'b'})).toEqual({restored:true});expect(c.mode.isActive()).toBe(false);
 });
 it('trusts only the strip window main frame on the app origin, for its four channels',async()=>{
  const c=controller();await c.mode.load();
  expect(c.mode.trustedStrip({sender:{},senderFrame:{}},'lv:wick:ready'),'no strip yet').toBe(false);
  c.mode.enter();const s=c.strip(),own={sender:s.webContents,senderFrame:s.webContents.mainFrame};
  for(const channel of wick.STRIP_CHANNELS)expect(c.mode.trustedStrip(own,channel)).toBe(true);
  expect(wick.STRIP_CHANNELS).toEqual(['lv:wick:ready','lv:wick:restore','lv:wick:select-tab','lv:wick:menu']);
  for(const channel of ['lv:workspace:load','lv:workspace:save','lv:wick:enter','lv:wick:publish','lv:alpaca:subscribe','lv:app:quit'])expect(c.mode.trustedStrip(own,channel),channel).toBe(false);
  expect(c.mode.trustedStrip({sender:c.main.webContents,senderFrame:c.main.webContents.mainFrame},'lv:wick:ready'),'main window').toBe(false);
  expect(c.mode.trustedStrip({sender:s.webContents,senderFrame:{url:'lv://app/index.html'}},'lv:wick:ready'),'a sub frame').toBe(false);
  s.webContents.mainFrame.url='https://example.com/';expect(c.mode.trustedStrip(own,'lv:wick:ready'),'another origin').toBe(false);
 });
 it('loads the saved choices; the main window close destroys the strip so the app can quit',async()=>{
  const c=controller({state:JSON.stringify({schemaVersion:1,alwaysOnTop:false,collapseOnBlur:true,places:{}})});await c.mode.load();
  expect(c.mode.state()).toEqual({active:false,alwaysOnTop:false,collapseOnBlur:true});
  c.mode.enter();expect(c.strip().options).toMatchObject({alwaysOnTop:false,skipTaskbar:false});
  c.mode.destroy();expect(c.strip().destroy).toHaveBeenCalledOnce();expect(c.mode.isActive()).toBe(false);
  expect(c.mode.enter()).toEqual({active:false});
 });
});
