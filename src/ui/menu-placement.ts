// One placement rule for every popup menu that opens at a point or beside an anchor (chart context menu and
// its Trade submenu, price and time scale menus, legend More menus). A menu stays fully on screen: it opens
// below and to the right of the click; with no room below it flips up (its bottom at the click), with no room on the right it
// flips left; when neither side fits it is clamped to the viewport, and a menu taller than the viewport scrolls.
// The margin is our own choice.
export const MENU_VIEWPORT_MARGIN_PX=4;
export interface MenuOrigin {
 /** Where the menu's top-left corner goes when it fits (the click point, or the anchor's bottom-left / top-right). */
 x:number;y:number;
 /** Where the menu's right edge goes when it flips left (default x: a click point). */
 flipRight?:number;
 /** Where the menu's bottom edge goes when it flips up (default y: a click point). */
 flipBottom?:number;
}
export interface MenuPlacement {left:number;top:number;/** The scroll fallback: the menu never grows past the viewport. */maxHeight:number}
const finite=(value:number,fallback:number)=>Number.isFinite(value)?value:fallback;
function axis(start:number,flipEnd:number,size:number,extent:number,margin:number):number{
 if(start+size<=extent-margin)return start;
 if(flipEnd-size>=margin&&flipEnd<=extent-margin)return flipEnd-size;
 return Math.max(margin,Math.min(start,extent-margin-size));
}
/** The on-screen position of a menu of natural `size` opened at `origin` in a `viewport`. */
export function placeMenu(origin:MenuOrigin,size:{width:number;height:number},viewport:{width:number;height:number},margin=MENU_VIEWPORT_MARGIN_PX):MenuPlacement{
 const vw=Math.max(0,finite(viewport.width,0)),vh=Math.max(0,finite(viewport.height,0)),maxHeight=Math.max(0,vh-2*margin);
 const width=Math.max(0,finite(size.width,0)),height=Math.min(Math.max(0,finite(size.height,0)),maxHeight);
 const x=finite(origin.x,vw/2),y=finite(origin.y,vh/2);
 return{left:axis(x,finite(origin.flipRight??x,x),width,vw,margin),top:axis(y,finite(origin.flipBottom??y,y),height,vh,margin),maxHeight};
}
type MeasuredMenu=Pick<HTMLElement,'style'|'offsetWidth'|'offsetHeight'|'clientHeight'|'scrollHeight'>&{ownerDocument?:Document|null;getBoundingClientRect?:()=>{left:number;top:number;right:number;bottom:number;width:number;height:number}};
/** The menu's natural size: its full content height (scrollHeight plus borders), not the height a max-height cut it to. */
export function naturalMenuSize(node:MeasuredMenu):{width:number;height:number}{
 const borders=Math.max(0,(node.offsetHeight||0)-(node.clientHeight||0));
 return{width:node.offsetWidth||0,height:Math.max(node.offsetHeight||0,(node.scrollHeight||0)+borders)};
}
function viewportOf(node:MeasuredMenu):{width:number;height:number}|null{
 const view=node.ownerDocument?.defaultView??(typeof window!=='undefined'?window:null);
 return view&&view.innerWidth>0&&view.innerHeight>0?{width:view.innerWidth,height:view.innerHeight}:null;
}
/** Places a position:fixed menu element at `origin` (viewport coordinates), with the scroll fallback. Returns the placement,
 * or null when nothing could be measured (the element keeps the style it was rendered with). */
export function fitFixedMenu(node:MeasuredMenu|null,origin:MenuOrigin,options?:{ownFlow?:boolean}):MenuPlacement|null{
 if(!node)return null;const viewport=viewportOf(node);if(!viewport)return null;
 clearScrollFallback(node);
 // Scale roots opt in: absolute submenu overflow is not their own row height.
 const size=options?.ownFlow?{width:node.offsetWidth||0,height:node.offsetHeight||0}:naturalMenuSize(node),placed=placeMenu(origin,size,viewport);
 node.style.left=placed.left+'px';node.style.top=placed.top+'px';scrollFallback(node,size.height,placed.maxHeight);
 // A transformed or contained ancestor makes fixed coordinates relative to it: correct by the measured offset.
 const box=typeof node.getBoundingClientRect==='function'?node.getBoundingClientRect!():null;
 if(box&&Number.isFinite(box.left)&&Number.isFinite(box.top)&&(box.width>0||box.height>0)){const dx=box.left-placed.left,dy=box.top-placed.top;if(dx)node.style.left=(placed.left-dx)+'px';if(dy)node.style.top=(placed.top-dy)+'px';}
 return placed;
}
/** Only a menu taller than the viewport is cut to it and scrolls: a scrolling box would clip CSS-positioned submenus. */
function scrollFallback(node:MeasuredMenu,height:number,maxHeight:number){if(height>maxHeight){node.style.maxHeight=maxHeight+'px';node.style.overflowY='auto';node.style.setProperty?.('--lv-menu-fit-scroll','1');}}
/** Undoes an earlier scroll fallback of ours (never a max-height the element was rendered with). */
function clearScrollFallback(node:MeasuredMenu){if(node.style.getPropertyValue?.('--lv-menu-fit-scroll')==='1'){node.style.maxHeight='';node.style.overflowY='';node.style.removeProperty('--lv-menu-fit-scroll');}}

/** UI chrome only: this classifies input routing, never source/native readiness. */
export function isScaleMenuChrome(target:EventTarget|null):boolean {
 return !!(target as Element|null)?.closest?.('[data-lv-price-scale-menu],[data-lv-time-scale-menu]');
}

type AnchoredMenu=MeasuredMenu&Pick<HTMLElement,'getBoundingClientRect'>&{parentElement?:{getBoundingClientRect():{top:number;left:number;right:number;bottom:number}}|null};
/** For a menu laid out by CSS beside its anchor (absolute top:100% under a row, or left:100% beside a submenu row): moves it
 * by margins so it stays on screen, flipping up above the anchor (or left of it) first, as for fitFixedMenu. */
export function fitAnchoredMenu(node:AnchoredMenu|null,side:'below'|'right'='below'):MenuPlacement|null{
 if(!node||typeof node.getBoundingClientRect!=='function')return null;const viewport=viewportOf(node);if(!viewport)return null;
 node.style.marginTop='';node.style.marginLeft='';clearScrollFallback(node);
 const rect=node.getBoundingClientRect(),anchor=node.parentElement?.getBoundingClientRect?.()??rect,size=naturalMenuSize(node);
 const origin:MenuOrigin=side==='below'
  ?{x:rect.left,y:rect.top,flipRight:Math.max(anchor.right,rect.left),flipBottom:Math.min(rect.top,anchor.top)}
  :{x:rect.left,y:rect.top,flipRight:Math.min(rect.left,anchor.left),flipBottom:anchor.bottom};
 const placed=placeMenu(origin,size,viewport);
 if(placed.top!==rect.top)node.style.marginTop=(placed.top-rect.top)+'px';
 if(placed.left!==rect.left)node.style.marginLeft=(placed.left-rect.left)+'px';
 scrollFallback(node,size.height,placed.maxHeight);
 return placed;
}
