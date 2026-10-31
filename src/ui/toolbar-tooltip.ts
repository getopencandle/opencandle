// Styled LV tooltips for the top toolbar and the drawing toolbar,
// in place of the slow native title: a short delay on the first hover, then instant while the pointer moves along the
// toolbar, and the hotkey as a separate hint. The title attribute stays the source of the text; it is parked in
// data-lv-tip only while a tooltip owns the button, so the OS tooltip never doubles it. Menus keep their own titles.
// Delays and placement are our own choice. Original LV source.
import './toolbar-tooltip.css';

export const TOOLTIP_DELAY_MS=500,TOOLTIP_WARM_MS=400;
export const TOOLTIP_SCOPES='.topbar,.drawing-toolbar,[data-lv-tooltip-scope]';
/** Hotkeys of top toolbar buttons whose titles do not carry one (top-toolbar-model.ts facts: Indicators "/", Fullscreen "Shift + F"). */
export const TOOLBAR_HOTKEYS:Readonly<Record<string,string>>={Indicators:'/',Fullscreen:'Shift + F','Chart intervals':','};
const spaced=(keys:string)=>keys.split(/\s*\+\s*/).filter(Boolean).join(' + ');
/** The tooltip text and hotkey of a control: a trailing "(keys)" in the title, else aria-keyshortcuts, else the toolbar map. */
export function tooltipParts(title:string,keyshortcuts:string|null,label:string|null):{text:string;hotkey:string|null}{
 const trimmed=title.trim(),match=/^(.*\S)\s*\(([^()]+)\)$/.exec(trimmed);
 if(match&&/(^|[\s+])(Ctrl|Alt|Shift|Cmd)\b|^.$/.test(match[2].trim()))return{text:match[1],hotkey:spaced(match[2].trim())};
 const first=keyshortcuts?.trim().split(/\s+/)[0];
 if(first)return{text:trimmed,hotkey:spaced(first)};
 const mapped=(label&&TOOLBAR_HOTKEYS[label])??TOOLBAR_HOTKEYS[trimmed]??null;
 return{text:trimmed,hotkey:mapped};
}
type Placement='below'|'right';
/** Below the button for the top toolbar, to the right for the vertical drawing toolbar; flipped or clamped to stay on screen. */
export function tooltipPosition(anchor:{left:number;top:number;right:number;bottom:number;width:number;height:number},tip:{width:number;height:number},viewport:{width:number;height:number},placement:Placement):{left:number;top:number}{
 const gap=6,clamp=(value:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,value));
 if(placement==='right'){
  const right=anchor.right+gap,left=right+tip.width<=viewport.width-4?right:anchor.left-gap-tip.width;
  return{left:Math.round(clamp(left,4,viewport.width-tip.width-4)),top:Math.round(clamp(anchor.top+(anchor.height-tip.height)/2,4,viewport.height-tip.height-4))};
 }
 const below=anchor.bottom+gap,top=below+tip.height<=viewport.height-4?below:anchor.top-gap-tip.height;
 return{left:Math.round(clamp(anchor.left+(anchor.width-tip.width)/2,4,viewport.width-tip.width-4)),top:Math.round(clamp(top,4,viewport.height-tip.height-4))};
}
const installs=new WeakMap<Document,{count:number;release:()=>void}>();
export function installToolbarTooltips(doc:Document|undefined=typeof document==='undefined'?undefined:document):()=>void{
 if(!doc)return()=>{};
 const known=installs.get(doc);
 if(known){known.count++;let done=false;return()=>{if(done)return;done=true;if(--known.count===0){known.release();installs.delete(doc);}};}
 const win=doc.defaultView;
 let owner:HTMLElement|null=null,timer:ReturnType<typeof setTimeout>|null=null,tip:HTMLDivElement|null=null,lastHidden=0;
 const park=(node:HTMLElement)=>{const title=node.getAttribute('title');if(title){node.setAttribute('data-lv-tip',title);node.removeAttribute('title');}};
 const unpark=(node:HTMLElement)=>{const saved=node.getAttribute('data-lv-tip');node.removeAttribute('data-lv-tip');if(saved!==null&&!node.hasAttribute('title'))node.setAttribute('title',saved);};
 const show=()=>{
  timer=null;const node=owner;if(!node||!node.isConnected)return;
  const {text,hotkey}=tooltipParts(node.getAttribute('data-lv-tip')??'',node.getAttribute('aria-keyshortcuts'),node.getAttribute('aria-label'));if(!text)return;
  tip??=doc.createElement('div');tip.className='lv-tooltip';tip.setAttribute('role','tooltip');tip.replaceChildren();
  const label=doc.createElement('span');label.textContent=text;tip.append(label);
  if(hotkey){const keys=doc.createElement('kbd');keys.className='lv-tooltip-keys';keys.textContent=hotkey;tip.append(keys);}
  tip.style.left='0px';tip.style.top='0px';tip.style.visibility='hidden';if(!tip.isConnected)doc.body.append(tip);
  const box=node.getBoundingClientRect(),size=tip.getBoundingClientRect(),placement:Placement=node.closest('.drawing-toolbar')?'right':'below';
  const at=tooltipPosition(box,size,{width:win?.innerWidth??1e4,height:win?.innerHeight??1e4},placement);
  tip.style.left=at.left+'px';tip.style.top=at.top+'px';tip.style.visibility='visible';
 };
 const hide=()=>{if(timer!==null){clearTimeout(timer);timer=null;}if(tip?.isConnected){tip.remove();lastHidden=Date.now();}if(owner){unpark(owner);owner=null;}};
 const targetOf=(event:Event):HTMLElement|null=>{
  const node=event.target as Element|null;if(!node||typeof (node as Element).closest!=='function')return null;
  if(node.closest('[role=menu],[role=listbox],[role=dialog],[aria-modal="true"]'))return null;
  const control=node.closest<HTMLElement>('button,[role=button],a[href]');if(!control||!control.closest(TOOLTIP_SCOPES))return null;
  return control.hasAttribute('title')||control.hasAttribute('data-lv-tip')?control:null;
 };
 const over=(event:Event)=>{
  const control=targetOf(event);if(control===owner)return;
  const warm=!!tip?.isConnected||Date.now()-lastHidden<TOOLTIP_WARM_MS;hide();if(!control)return;
  owner=control;park(control);
  if(warm)show();else timer=setTimeout(show,TOOLTIP_DELAY_MS);
 };
 const out=(event:Event)=>{if(!owner)return;const next=(event as MouseEvent).relatedTarget as Node|null;if(next&&owner.contains(next))return;hide();};
 // A press or key ends the tooltip but keeps the title parked until the pointer leaves, so the OS tooltip does not appear instead.
 const press=()=>{if(timer!==null){clearTimeout(timer);timer=null;}if(tip?.isConnected)tip.remove();lastHidden=0;};
 doc.addEventListener('pointerover',over,true);doc.addEventListener('pointerout',out,true);doc.addEventListener('pointerdown',press,true);doc.addEventListener('keydown',press,true);doc.addEventListener('wheel',press,{capture:true,passive:true});win?.addEventListener('blur',press);
 const release=()=>{hide();tip=null;doc.removeEventListener('pointerover',over,true);doc.removeEventListener('pointerout',out,true);doc.removeEventListener('pointerdown',press,true);doc.removeEventListener('keydown',press,true);doc.removeEventListener('wheel',press,{capture:true} as EventListenerOptions);win?.removeEventListener('blur',press);};
 const entry={count:1,release};installs.set(doc,entry);
 let done=false;return()=>{if(done)return;done=true;if(--entry.count===0){entry.release();installs.delete(doc);}};
}
