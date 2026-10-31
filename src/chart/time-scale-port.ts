// Time scale port: routes right-clicks on the time axis to the time scale menu, the same way the price
// scale port routes the price axis (price-scale-port.ts). The menu view, placement, focus and keyboard rules are the price
// scale menu's own (price-scale-menu-view.tsx). The port changes nothing itself: every row runs a host action, so the
// workspace history, saving and the chart settings document stay with their owner (root binds the host).
import {mountScaleMenu,placePriceScaleMenu,submenuKey,type PriceScaleMenuMount,type PriceScaleMenuViewProps} from './price-scale-menu-view';
import {timeScaleCommand,timeScaleMenuEntries,type TimeScaleActionId,type TimeScaleMenuContext,type TimeScaleMenuEntry,type TimeScaleMenuItem,type TimeScaleMenuSettings,type TimeScaleSubmenu,type TimeScaleSubmenuId} from './time-scale-menu';

export interface TimeScaleResult {ok:boolean;message?:string}
type HostOutcome=boolean|TimeScaleResult|void;
/** Bound by the workspace that owns this chart. Each action returns false or {ok:false} to refuse (the menu stays open with the message). */
export interface TimeScaleHost {
 /** Current values; called whenever the menu renders. */
 read():{timezone:string|null;exchangeTimezone:string|null;settings:TimeScaleMenuSettings|null};
 /** Reset time scale (the same action as Ctrl + Alt + Q). */
 resetTimeScale?():HostOutcome;
 /** Saves the chart timezone (an IANA zone; Exchange is already resolved). */
 setTimezone?(zone:string):HostOutcome;
 /** Saves time scale settings in the chart settings document. */
 setSettings?(patch:Partial<TimeScaleMenuSettings>):HostOutcome;
}
export interface TimeScalePort {
 /** True when a client point is on the time axis strip (below the plot, left of the price scale; the corner is not). */
 axisAt(clientX:number,clientY:number):boolean;
 menuEntries():TimeScaleMenuEntry[];
 execute(id:TimeScaleActionId):TimeScaleResult;
 openMenu(client:{x:number;y:number}):void;
 closeMenu(restoreFocus?:boolean):void;
 isMenuOpen():boolean;
 bindHost(host:TimeScaleHost):()=>void;
 dispose():void;
}
interface EventTargetLike {addEventListener(type:string,listener:(event:any)=>void,options?:boolean|AddEventListenerOptions):void;removeEventListener(type:string,listener:(event:any)=>void,options?:boolean|EventListenerOptions):void}
export interface TimeScalePortOptions {
 renderer:object;
 container:HTMLElement;
 /** Reason the chart cannot change now (closed, unavailable or updating), or null. */
 availability?:()=>string|null;
 mount?:(host:HTMLElement)=>PriceScaleMenuMount<TimeScaleActionId,TimeScaleSubmenuId>;
 /** Date for timezone offsets (tests). */
 now?:()=>Date;
}
const own=(value:unknown,key:string):any=>{if(!value||typeof value!=='object')throw Error('Time scale renderer member is unavailable: '+key);const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Time scale renderer member must be data: '+key);return field.value;};
const outcome=(value:HostOutcome,refused:string):TimeScaleResult=>value===false?{ok:false,message:refused}:value&&typeof value==='object'?{ok:value.ok===true,...(value.message?{message:value.message}:{})}:{ok:true};
type Row=TimeScaleMenuItem|TimeScaleSubmenu;
const entryKey=(row:Row)=>row.kind==='submenu'?submenuKey(row.id):row.id;
/** Enabled rows of one menu level, in order (the price scale menu's focusableEntries rule). */
const focusableEntries=(rows:readonly (TimeScaleMenuEntry|TimeScaleSubmenu['items'][number])[]):Row[]=>rows.filter((row):row is Row=>row.kind!=='separator'&&!row.disabled);

export function installTimeScalePort(options:TimeScalePortOptions):TimeScalePort{
 const renderer=options.renderer as Record<string,unknown>,container=options.container;
 const doc=container.ownerDocument as Document|undefined,win=doc?.defaultView??undefined;
 let host:TimeScaleHost|null=null,disposed=false,mount:PriceScaleMenuMount<TimeScaleActionId,TimeScaleSubmenuId>|null=null;
 let menu:{client:{x:number;y:number};submenu:TimeScaleSubmenuId|null;focusKey:string|null;status:string;returnFocus:Element|null}|null=null;

 const context=():TimeScaleMenuContext=>{
  let values:ReturnType<TimeScaleHost['read']>={timezone:null,exchangeTimezone:null,settings:null};
  if(host)try{values=host.read();}catch{/* An unreadable host shows every row as not connected. */}
  return{timezone:values.timezone,exchangeTimezone:values.exchangeTimezone,settings:values.settings,at:options.now?.(),host:{reset:typeof host?.resetTimeScale==='function',timezone:typeof host?.setTimezone==='function',settings:typeof host?.setSettings==='function'}};
 };
 const menuEntries=()=>timeScaleMenuEntries(context());

 function execute(id:TimeScaleActionId):TimeScaleResult{
  try{
   if(disposed)return{ok:false,message:'This chart is closed.'};
   const reason=options.availability?.();if(reason)return{ok:false,message:reason};
   const command=timeScaleCommand(id,context()),bound=host!;
   if(command.kind==='reset')return outcome(bound.resetTimeScale!(),'The time scale could not be reset.');
   if(command.kind==='timezone')return outcome(bound.setTimezone!(command.zone),'The workspace did not accept this timezone.');
   return outcome(bound.setSettings!(command.patch),'The workspace did not accept this change.');
  }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
 }

 // The time axis strip of the pinned renderer: below the data area (coords.height) and inside the data width (coords.width),
 // in the renderer input element's own coordinates (@luxalgo/vela 0.8.4 regionAt "time").
 function axisAt(clientX:number,clientY:number):boolean{
  try{const input=renderer.input as {el?:Element|null}|null|undefined,element=input?.el;if(!element)return false;const rect=element.getBoundingClientRect(),coords=own(renderer,'coords'),x=clientX-rect.left,y=clientY-rect.top,dataW=Number(coords.width),dataH=Number(coords.height);
   if(!(dataW>0&&dataH>0))return false;
   return x>=0&&x<=dataW&&y>dataH&&y<=rect.height;
  }catch{return false;}
 }

 const levelEntries=():{sub:TimeScaleSubmenu|null;rows:Row[]}=>{
  if(!menu)return{sub:null,rows:[]};const entries=menuEntries(),sub=menu.submenu?entries.find((row):row is TimeScaleSubmenu=>row.kind==='submenu'&&row.id===menu!.submenu)??null:null;
  const inSub=!!sub&&!!menu.focusKey&&sub.items.some(item=>item.kind==='item'&&item.id===menu!.focusKey);
  return inSub?{sub,rows:focusableEntries(sub!.items)}:{sub:null,rows:focusableEntries(entries)};
 };
 function render(){
  if(!menu||disposed)return;
  const entries=menuEntries();
  const viewport={width:win?.innerWidth??1024,height:win?.innerHeight??768},placed=placePriceScaleMenu(menu.client,viewport,entries.length);
  // The time axis sits at the bottom of the chart: a menu that cannot drop below the cursor opens above it, so it never covers the axis labels.
  const pushedUp=placed.top<menu.client.y-1,position=pushedUp?{left:placed.left,top:Math.max(0,menu.client.y-(viewport.height-4-placed.top)-4)}:placed;
  const props:PriceScaleMenuViewProps<TimeScaleActionId,TimeScaleSubmenuId>={entries,kind:'time',left:position.left,top:position.top,client:menu.client,openSubmenu:menu.submenu,focusKey:menu.focusKey,status:menu.status,
   onActivate:(id,from)=>activate(id,from),
   onSubmenu:(id,focusFirst)=>{if(!menu)return;menu.submenu=id;if(id&&focusFirst){const sub=menuEntries().find((row):row is TimeScaleSubmenu=>row.kind==='submenu'&&row.id===id);const first=sub?focusableEntries(sub.items)[0]:undefined;if(first)menu.focusKey=entryKey(first);}render();},
   onFocusKey:key=>{if(!menu||menu.focusKey===key)return;menu.focusKey=key;if(!key.startsWith('submenu:')&&menuEntries().some(row=>row.kind!=='separator'&&entryKey(row as Row)===key))menu.submenu=null;render();},
   onKeyDown:event=>menuKey(event)};
  mount??=(options.mount??(node=>mountScaleMenu<TimeScaleActionId,TimeScaleSubmenuId>(node,'time')))(container);
  mount.render(props);mount.focus(menu.focusKey);
 }
 function activate(id:TimeScaleActionId,_from:'pointer'|'keyboard'){
  if(!menu)return;const result=execute(id);
  if(result.ok){closeMenu(true);return;}
  if(menu){menu.status=result.message??'This time scale action is not available.';render();}
 }
 function menuKey(event:{key:string;preventDefault():void;stopPropagation():void;nativeEvent?:{isComposing?:boolean}}){
  event.stopPropagation();if(!menu||event.nativeEvent?.isComposing)return;
  const {sub,rows}=levelEntries(),keys=rows.map(entryKey),index=menu.focusKey?keys.indexOf(menu.focusKey):-1,focused=index>=0?rows[index]:undefined;
  const move=(next:number)=>{if(!keys.length)return;menu!.focusKey=keys[(next+keys.length)%keys.length];if(!sub&&!menu!.focusKey.startsWith('submenu:'))menu!.submenu=null;render();};
  switch(event.key){
   case 'ArrowDown':event.preventDefault();move(index+1);return;
   case 'ArrowUp':event.preventDefault();move(index<0?keys.length-1:index-1);return;
   case 'Home':event.preventDefault();move(0);return;
   case 'End':event.preventDefault();move(keys.length-1);return;
   case 'ArrowRight':if(focused?.kind==='submenu'){event.preventDefault();openSubmenu(focused.id);}return;
   case 'ArrowLeft':if(sub){event.preventDefault();menu.focusKey=submenuKey(sub.id);menu.submenu=null;render();}return;
   case 'Enter':case ' ':event.preventDefault();if(!focused)return;if(focused.kind==='submenu')openSubmenu(focused.id);else activate(focused.id,'keyboard');return;
   case 'Escape':event.preventDefault();if(sub){menu.focusKey=submenuKey(sub.id);menu.submenu=null;render();}else closeMenu(true);return;
   case 'Tab':event.preventDefault();closeMenu(true);return;
  }
 }
 function openSubmenu(id:TimeScaleSubmenuId){if(!menu)return;const sub=menuEntries().find((row):row is TimeScaleSubmenu=>row.kind==='submenu'&&row.id===id);if(!sub||sub.disabled)return;menu.submenu=id;const first=focusableEntries(sub.items)[0];if(first)menu.focusKey=entryKey(first);render();}
 const outside=(event:Event)=>{if(menu&&!mount?.contains(event.target))closeMenu(false);};
 const dismiss=()=>{if(menu)closeMenu(false);};
 function openMenu(client:{x:number;y:number}){
  if(disposed)return;const reopening=!!menu;
  const first=focusableEntries(menuEntries())[0];
  menu={client:{x:client.x,y:client.y},submenu:null,focusKey:first?entryKey(first):null,status:options.availability?.()??'',returnFocus:reopening?menu!.returnFocus:(doc?.activeElement??null)};
  if(!reopening){doc?.addEventListener('pointerdown',outside,true);win?.addEventListener('blur',dismiss);win?.addEventListener('resize',dismiss);}
  render();
 }
 function closeMenu(restoreFocus=false){
  if(!menu)return;const back=menu.returnFocus;menu=null;
  doc?.removeEventListener('pointerdown',outside,true);win?.removeEventListener('blur',dismiss);win?.removeEventListener('resize',dismiss);
  mount?.render(null);
  // As the price scale menu: a gone opener falls back to the renderer's keyboard target, then the focusable panel.
  if(restoreFocus){const target=back&&(back as Element).isConnected&&back!==doc?.body?back:(container.querySelector?.('canvas[tabindex="0"]')??container.closest?.('[tabindex]'));(target as HTMLElement|null|undefined)?.focus?.({preventScroll:true});}
 }

 // A right-click on the time axis opens this menu; the chart context menu (ChartPanel) skips an event already taken.
 const onContextMenu=(event:MouseEvent)=>{if(event.defaultPrevented||disposed)return;if(!axisAt(event.clientX,event.clientY))return;event.preventDefault();openMenu({x:event.clientX,y:event.clientY});};
 (container as unknown as EventTargetLike).addEventListener('contextmenu',onContextMenu);

 return{
  axisAt,menuEntries,execute,openMenu,closeMenu,isMenuOpen:()=>!!menu,
  bindHost(next){if(disposed)throw Error('This chart is closed.');if(!next||typeof next.read!=='function')throw Error('Time scale host must read its values.');if(host)throw Error('Time scale host is already bound.');host=next;if(menu)render();const bound=next;return()=>{if(host===bound){host=null;if(menu)render();}};},
  dispose(){if(disposed)return;closeMenu(false);disposed=true;host=null;(container as unknown as EventTargetLike).removeEventListener('contextmenu',onContextMenu);mount?.dispose();mount=null;},
 };
}

/** Controller surface (`controller.timeScale`) that stays valid before install and after disposal. */
export type TimeScaleController=Omit<TimeScalePort,'dispose'>;
export function timeScaleFacade(read:()=>TimeScalePort|null):TimeScaleController{
 const port=()=>{const value=read();if(!value)throw Error('The time scale is unavailable for this chart.');return value;};
 return Object.freeze({
  axisAt:(x:number,y:number)=>read()?.axisAt(x,y)??false,
  menuEntries:()=>port().menuEntries(),
  execute:(id:TimeScaleActionId)=>{const value=read();return value?value.execute(id):{ok:false,message:'The time scale is unavailable for this chart.'};},
  openMenu:(client:{x:number;y:number})=>port().openMenu(client),closeMenu:(restoreFocus?:boolean)=>read()?.closeMenu(restoreFocus),isMenuOpen:()=>read()?.isMenuOpen()??false,
  bindHost:(next:TimeScaleHost)=>port().bindHost(next),
 });
}
