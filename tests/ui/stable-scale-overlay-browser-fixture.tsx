import {installTimeScalePort,type TimeScalePort} from '../../src/chart/time-scale-port';
import {mountScaleMenu,type PriceScaleMenuMount,type PriceScaleMenuViewProps} from '../../src/chart/price-scale-menu-view';
import {contextGestureDisposition} from '../../src/chart/context-input-arbitration';
import {isScaleMenuChrome} from '../../src/ui/menu-placement';

// Isolated real React/DOM scale menu and time-port. Controlled settings/renderer
// geometry only: no ChartController/source/input/price/completion permission.
type Fixture={port:TimeScalePort;own:PriceScaleMenuMount<string,string>|null;parent:HTMLDivElement;host:HTMLDivElement;outside:HTMLButtonElement;opener:HTMLButtonElement;pointerBegins:number;wheelBegins:number;wheelBubbles:number;globalScrollCalls:number;actions:number;originalScroll:typeof HTMLElement.prototype.scrollIntoView};
let fixture:Fixture|null=null;
const rootMenu=()=>document.querySelector<HTMLElement>('[data-lv-time-scale-menu],[data-lv-price-scale-menu]');
const box=(node:Element|null)=>{if(!node)return null;const r=node.getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
export function setupStableScaleFixture(){
 if(fixture)throw Error('Previous synthetic scale fixture was not disposed.');
 document.body.replaceChildren();document.body.style.cssText='margin:0;height:2400px;background:white';
 const parent=document.createElement('div'),host=document.createElement('div'),outside=document.createElement('button'),opener=document.createElement('button');
 parent.style.cssText='position:absolute;left:40px;top:100px;width:850px;height:450px;overflow:auto';host.style.cssText='position:relative;height:1600px;width:850px';
 outside.textContent='Synthetic chart input';outside.style.cssText='position:absolute;left:500px;top:500px;width:150px;height:80px';
 opener.textContent='Open synthetic time-scale menu';opener.style.cssText='position:fixed;left:8px;top:8px';host.append(outside);parent.append(host);document.body.append(parent,opener);
 const port=installTimeScalePort({renderer:{input:{el:host},coords:{width:800,height:400}},container:host,now:()=>new Date('2026-10-20T16:00:00Z')});
 const f:Fixture={port,own:null,parent,host,outside,opener,pointerBegins:0,wheelBegins:0,wheelBubbles:0,globalScrollCalls:0,actions:0,originalScroll:HTMLElement.prototype.scrollIntoView};fixture=f;
 HTMLElement.prototype.scrollIntoView=function(...args){f.globalScrollCalls++;return Reflect.apply(f.originalScroll,this,args);};
 port.bindHost({read:()=>({timezone:'UTC',exchangeTimezone:'America/New_York',settings:{dayOfWeek:false,dateFormat:'format-3',timeHours:'24',sessionBreaks:false}}),resetTimeScale:()=>{f.actions++;return true;},setTimezone:()=>{f.actions++;return true;},setSettings:()=>{f.actions++;return true;}});
 // Same production chrome predicate and disposition used BEFORE GridCell's
 // capture. These counters are synthetic routing observations, not native chart
 // gesture/frame publication acceptance or a mocked currentness permission.
 parent.addEventListener('pointerdown',event=>{if(contextGestureDisposition('pointer',isScaleMenuChrome(event.target),event.button)==='begin')f.pointerBegins++;},true);
 parent.addEventListener('wheel',event=>{if(contextGestureDisposition('wheel',isScaleMenuChrome(event.target))==='begin')f.wheelBegins++;},true);
 parent.addEventListener('wheel',()=>{f.wheelBubbles++;});
 opener.addEventListener('click',()=>port.openMenu({x:150,y:640}));parent.scrollTop=100;
 return readStableScaleFixture();
}
export function readStableScaleFixture(){
 const f=fixture;if(!f)throw Error('Synthetic scale fixture is unavailable.');const root=rootMenu(),sub=document.querySelector<HTMLElement>('[role="menu"][aria-label="Timezone"]'),focused=document.activeElement as HTMLElement|null;
 return{root:box(root),rootScroll:root?{top:root.scrollTop,height:root.clientHeight,content:root.scrollHeight}:null,submenu:box(sub),submenuScroll:sub?{top:sub.scrollTop,height:sub.clientHeight,content:sub.scrollHeight}:null,focused:focused?.getAttribute('aria-label')??null,focusedBox:box(focused),parentScroll:{top:f.parent.scrollTop,left:f.parent.scrollLeft},pageScroll:{x:window.scrollX,y:window.scrollY},pointerBegins:f.pointerBegins,wheelBegins:f.wheelBegins,wheelBubbles:f.wheelBubbles,globalScrollCalls:f.globalScrollCalls,actions:f.actions,menuOpen:f.port.isMenuOpen()};
}
export function openLongOwnScaleMenu(){
 const f=fixture;if(!f)throw Error('Synthetic scale fixture is unavailable.');f.port.closeMenu(false);f.own=mountScaleMenu<string,string>(f.host,'price');
 const props:PriceScaleMenuViewProps<string,string>={entries:Array.from({length:50},(_,i)=>({kind:'item',id:'synthetic-'+i,factId:'synthetic.fixed-own-row',label:'Synthetic own row '+i,role:'menuitem'})),client:{x:150,y:640},left:150,top:640,openSubmenu:null,focusKey:null,status:'',onActivate:()=>{},onSubmenu:()=>{},onFocusKey:()=>{},onKeyDown:()=>{}};
 f.own.render(props);return readStableScaleFixture();
}
export function closeStableScaleFixture(){
 const f=fixture;if(!f)return;fixture=null;
 try{f.port.dispose();f.own?.dispose();}finally{HTMLElement.prototype.scrollIntoView=f.originalScroll;f.parent.remove();f.opener.remove();}
}
