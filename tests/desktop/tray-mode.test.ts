import {describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Electron/tray.cjs with every Electron API mocked. No tray icon, window or notification is created.
const tray=require('../../electron/tray.cjs');

function harness(options:{state?:string|null;trayThrows?:boolean;balloon?:boolean;notificationSupported?:boolean;iconEmpty?:boolean}={}){
 const written:string[]=[],trays:any[]=[],menus:any[]=[],notifications:any[]=[],representations:any[]=[];
 const app={quit:vi.fn()};
 class Tray extends EventEmitter{
  image:unknown;tooltip='';menu:any=null;destroyed=false;
  setToolTip=vi.fn((text:string)=>{this.tooltip=text;});setContextMenu=vi.fn((menu:any)=>{this.menu=menu;});destroy=vi.fn(()=>{this.destroyed=true;});
  displayBalloon?:any;
  constructor(image:unknown){super();if(options.trayThrows)throw Error('Synthetic tray failure');this.image=image;if(options.balloon!==false)this.displayBalloon=vi.fn();trays.push(this);}
 }
 const Menu={buildFromTemplate:vi.fn((template:any[])=>{const menu={template};menus.push(menu);return menu;})};
 const source={isEmpty:()=>!!options.iconEmpty,resize:vi.fn(({width}:{width:number})=>({toPNG:()=>Buffer.from('png-'+width)}))};
 const nativeImage={createFromPath:vi.fn(()=>source),createEmpty:vi.fn(()=>({addRepresentation:(row:any)=>representations.push(row)}))};
 class Notification{static isSupported(){return options.notificationSupported!==false;}constructor(public options:any){notifications.push(this);}show=vi.fn();}
 const window={hidden:false,minimized:false,destroyed:false,hide:vi.fn(function(this:any){window.hidden=true;}),show:vi.fn(()=>{window.hidden=false;}),focus:vi.fn(),restore:vi.fn(()=>{window.minimized=false;}),isMinimized:()=>window.minimized,isDestroyed:()=>window.destroyed};
 const store={read:vi.fn(async()=>options.state===undefined?null:options.state),write:vi.fn(async(text:string)=>{written.push(text);})};
 const mode=tray.createTrayMode({app,Tray,Menu,nativeImage,Notification,iconPath:'C:\\Synthetic\\electron\\assets\\opencandle-256.png',getWindow:()=>window,store});
 const close=(quitting=false)=>{const event={prevented:false,preventDefault:vi.fn(()=>{event.prevented=true;})};return{handled:mode.interceptClose(event,quitting),event};};
 const item=(label:string)=>menus.at(-1)!.template.find((row:any)=>row.label===label);
 return{mode,app,window,trays,menus,notifications,representations,store,written,close,item,nativeImage,source};
}

describe('tray input and saved state',()=>{
 it('accepts exactly {keepRunning:boolean}',()=>{
  expect(tray.trayPreferenceInput({keepRunning:false})).toEqual({keepRunning:false});
  for(const bad of [undefined,null,[],{},{keepRunning:'yes'},{keepRunning:true,extra:1},Object.create({keepRunning:true}),{keep:true}])expect(()=>tray.trayPreferenceInput(bad)).toThrow();
  try{tray.trayPreferenceInput({keepRunning:1});}catch(error:any){expect(error.code).toBe('INVALID_ARGUMENT');}
 });
 it('reads the saved state and falls back to the factory state (keep running on, notice not shown) on anything else',()=>{
  expect(tray.parseTrayState('{"schemaVersion":1,"keepRunning":false,"noticeShown":true}')).toEqual({keepRunning:false,noticeShown:true});
  for(const bad of [null,'','not json','[]','{"schemaVersion":2,"keepRunning":false}','x'.repeat(2000)])expect(tray.parseTrayState(bad)).toEqual({keepRunning:true,noticeShown:false});
  expect(tray.parseTrayState('{"schemaVersion":1,"keepRunning":"no","noticeShown":"yes"}')).toEqual({keepRunning:true,noticeShown:false});
  expect(JSON.parse(tray.serializeTrayState({keepRunning:true,noticeShown:true}))).toEqual({schemaVersion:1,keepRunning:true,noticeShown:true});
 });
 it('makes the tray icon from the app icon at the 100, 125, 150 and 200 percent notification-area sizes',()=>{
  const h=harness();const image=tray.trayIconImage(h.nativeImage,'C:\\Synthetic\\logo.png');
  expect(image).toBeTruthy();expect(h.nativeImage.createFromPath).toHaveBeenCalledWith('C:\\Synthetic\\logo.png');
  expect(h.representations.map(row=>[row.scaleFactor,row.width,row.height,row.buffer.toString()])).toEqual([[1,16,16,'png-16'],[1.25,20,20,'png-20'],[1.5,24,24,'png-24'],[2,32,32,'png-32']]);
  expect(h.source.resize).toHaveBeenCalledWith({width:16,height:16,quality:'best'});
  const empty=harness({iconEmpty:true});expect(tray.trayIconImage(empty.nativeImage,'x')).toBe(empty.source);expect(empty.representations).toEqual([]);
 });
 it('REBRAND-A: uses the pre-drawn file for each size and resizes the app icon only for a size whose file does not load',()=>{
  const representations:any[]=[];
  const files:Record<string,any>={'/synthetic/t16.png':{isEmpty:()=>false,toPNG:()=>Buffer.from('file-16')},'/synthetic/t20.png':{isEmpty:()=>false,toPNG:()=>Buffer.from('file-20')},'/synthetic/t24.png':{isEmpty:()=>true,toPNG:()=>Buffer.from('never')},'/synthetic/t32.png':{isEmpty:()=>false,toPNG:()=>Buffer.from('file-32')}};
  const app={isEmpty:()=>false,resize:vi.fn(({width}:{width:number})=>({toPNG:()=>Buffer.from('resized-'+width)}))};
  const nativeImage={createFromPath:vi.fn((file:string)=>files[file]??app),createEmpty:()=>({addRepresentation:(row:any)=>representations.push(row)})};
  tray.trayIconImage(nativeImage,'/synthetic/app.png',{16:'/synthetic/t16.png',20:'/synthetic/t20.png',24:'/synthetic/t24.png',32:'/synthetic/t32.png'});
  expect(representations.map(row=>[row.scaleFactor,row.width,row.buffer.toString()])).toEqual([[1,16,'file-16'],[1.25,20,'file-20'],[1.5,24,'resized-24'],[2,32,'file-32']]);
  expect(app.resize).toHaveBeenCalledOnce();
  // All four files present: the app icon is never even loaded.
  representations.length=0;files['/synthetic/t24.png'].isEmpty=()=>false;nativeImage.createFromPath.mockClear();
  tray.trayIconImage(nativeImage,'/synthetic/app.png',{16:'/synthetic/t16.png',20:'/synthetic/t20.png',24:'/synthetic/t24.png',32:'/synthetic/t32.png'});
  expect(nativeImage.createFromPath).not.toHaveBeenCalledWith('/synthetic/app.png');expect(representations).toHaveLength(4);
 });
 it('REBRAND-A: the committed tray files exist at their exact pixel sizes',()=>{
  const {readFileSync}=require('node:fs');
  for(const size of [16,20,24,32]){const png=readFileSync('electron/assets/opencandle-tray-'+size+'.png');expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);}
 });
});

describe('closing to the notification area',()=>{
 it('a close outside a quit hides the window (not destroyed), creates the tray icon with Open and Quit, and shows the one-time notice',async()=>{
  const h=harness();await h.mode.load();
  const {handled,event}=h.close();
  expect(handled).toBe(true);expect(event.preventDefault).toHaveBeenCalledOnce();expect(h.window.hide).toHaveBeenCalledOnce();expect(h.window.destroyed).toBe(false);
  expect(h.trays).toHaveLength(1);expect(h.trays[0].tooltip).toBe('OpenCandle');
  expect(h.menus[0].template.map((row:any)=>row.type??row.label)).toEqual(['Open OpenCandle','separator','Quit OpenCandle']);
  expect(h.trays[0].displayBalloon).toHaveBeenCalledWith({title:'OpenCandle',content:'OpenCandle is still running in the notification area so alerts keep working. Right-click the tray icon to quit.',iconType:'info'});
  expect(h.mode.noticeShown()).toBe(true);await Promise.resolve();expect(JSON.parse(h.written.at(-1)!)).toMatchObject({noticeShown:true,keepRunning:true});
 });
 it('the notice is shown once: a second close and a later launch with the saved state stay quiet',async()=>{
  const h=harness();await h.mode.load();h.close();h.window.show();h.close();
  expect(h.trays).toHaveLength(1);expect(h.trays[0].displayBalloon).toHaveBeenCalledOnce();
  const later=harness({state:h.written.at(-1)!});await later.mode.load();later.close();
  expect(later.trays[0].displayBalloon).not.toHaveBeenCalled();expect(later.notifications).toHaveLength(0);
 });
 it('without a balloon the notice is a silent desktop notification, and nothing when the OS has none',async()=>{
  const h=harness({balloon:false});await h.mode.load();h.close();
  expect(h.notifications.map(row=>row.options)).toEqual([{title:'OpenCandle',body:tray.TRAY_NOTICE.body,silent:true}]);expect(h.notifications[0].show).toHaveBeenCalledOnce();
  const off=harness({balloon:false,notificationSupported:false});await off.mode.load();expect(off.close().handled).toBe(true);expect(off.notifications).toHaveLength(0);
 });
 it('double-click and Open OpenCandle show and focus the window; a minimized window is restored',async()=>{
  const h=harness();await h.mode.load();h.close();
  h.trays[0].emit('double-click');expect(h.window.show).toHaveBeenCalledTimes(1);expect(h.window.focus).toHaveBeenCalledTimes(1);
  h.close();h.window.minimized=true;h.item('Open OpenCandle').click();expect(h.window.restore).toHaveBeenCalledOnce();expect(h.window.show).toHaveBeenCalledTimes(2);
  h.window.destroyed=true;expect(h.mode.showWindow()).toBe(false);
 });
 it('Quit OpenCandle quits the app (the full quit path, not a hide)',async()=>{
  const h=harness();await h.mode.load();h.close();h.item('Quit OpenCandle').click();expect(h.app.quit).toHaveBeenCalledOnce();
 });
 it('does not intercept a close during a quit, with the setting off, or after the tray was destroyed',async()=>{
  const h=harness();await h.mode.load();
  expect(h.close(true).handled).toBe(false);expect(h.window.hide).not.toHaveBeenCalled();
  expect(h.mode.setKeepRunning({keepRunning:false})).toEqual({keepRunning:false});
  const off=h.close();expect(off.handled).toBe(false);expect(off.event.preventDefault).not.toHaveBeenCalled();expect(h.trays).toHaveLength(0);
  await Promise.resolve();expect(JSON.parse(h.written.at(-1)!)).toMatchObject({keepRunning:false});
  h.mode.setKeepRunning({keepRunning:true});expect(h.close().handled).toBe(true);
  h.mode.destroy();expect(h.trays[0].destroy).toHaveBeenCalledOnce();expect(h.close().handled).toBe(false);
 });
 it('a saved "off" is honoured from the first close of a launch',async()=>{
  const h=harness({state:'{"schemaVersion":1,"keepRunning":false,"noticeShown":false}'});await h.mode.load();expect(h.mode.keepRunning()).toBe(false);expect(h.close().handled).toBe(false);
 });
 it('a tray that cannot be created leaves the close alone, so the window is never hidden with no way back',async()=>{
  const h=harness({trayThrows:true});await h.mode.load();const {handled,event}=h.close();
  expect(handled).toBe(false);expect(event.preventDefault).not.toHaveBeenCalled();expect(h.window.hide).not.toHaveBeenCalled();
 });
 it('rejects an invalid setting without changing state, and store failures never block closing',async()=>{
  const h=harness();h.store.read.mockRejectedValueOnce(Error('Synthetic read failure'));await h.mode.load();
  expect(()=>h.mode.setKeepRunning({keepRunning:'off'})).toThrow();expect(h.mode.keepRunning()).toBe(true);
  h.store.write.mockRejectedValue(Error('Synthetic write failure'));expect(h.close().handled).toBe(true);
 });
});
