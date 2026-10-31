/** Viewport-safe placement for the Object tree context menu, its submenus and the toolbar menus. Pure geometry in viewport (client) pixels. */
export interface MenuSize {width:number;height:number}
export interface MenuViewport {width:number;height:number}
export interface MenuRect {left:number;top:number;right:number;bottom:number}
export interface MenuPlacement {left:number;top:number}
/** Gap kept between a menu and the window edge. */
export const OBJECT_TREE_MENU_MARGIN=4;
/** The submenu's top sits one menu padding (6 px) above its parent item, as in the static stylesheet. */
export const OBJECT_TREE_SUBMENU_OFFSET_Y=-6;
/** Keeps [start, start+size] inside [margin, limit-margin]; a menu larger than the window pins to the leading margin. */
function clamp(start:number,size:number,limit:number,margin:number){return Math.max(margin,Math.min(start,limit-margin-Math.max(0,size)));}
/** Opens at `forward` when the menu fits before the far edge; otherwise at `backward` when that fits; otherwise clamps. */
function axis(forward:number,backward:number,size:number,limit:number,margin:number){
 if(forward+size<=limit-margin)return forward;
 if(backward>=margin)return backward;
 return clamp(forward,size,limit,margin);
}
/** Context menu at the pointer: right of and below the point, flipped to the left of / above the point when that side lacks room, otherwise clamped inside the window. */
export function placeObjectTreeMenu(point:{x:number;y:number},size:MenuSize,viewport:MenuViewport,margin=OBJECT_TREE_MENU_MARGIN):MenuPlacement{
 return {left:clamp(axis(point.x,point.x-size.width,size.width,viewport.width,margin),size.width,viewport.width,margin),top:clamp(axis(point.y,point.y-size.height,size.height,viewport.height,margin),size.height,viewport.height,margin)};
}
/** Submenu beside its parent item: to the right of the parent menu, flipped to its left side when the right lacks room (the side with more room wins when neither fits), top-aligned with the item and shifted up to stay inside the window. */
export function placeObjectTreeSubmenu(item:MenuRect,size:MenuSize,viewport:MenuViewport,margin=OBJECT_TREE_MENU_MARGIN):MenuPlacement&{side:'right'|'left'}{
 const right=viewport.width-margin-item.right,left=item.left-margin,side=size.width<=right||size.width>left&&right>=left?'right':'left';
 return {side,left:clamp(side==='right'?item.right:item.left-size.width,size.width,viewport.width,margin),top:clamp(item.top+OBJECT_TREE_SUBMENU_OFFSET_Y,size.height,viewport.height,margin)};
}
/** Toolbar dropdown under its button: left-aligned with the button, right-aligned when that overflows, above the button when below lacks room, then clamped. */
export function placeObjectTreeDropdown(button:MenuRect,size:MenuSize,viewport:MenuViewport,margin=OBJECT_TREE_MENU_MARGIN):MenuPlacement{
 return {left:clamp(axis(button.left,button.right-size.width,size.width,viewport.width,margin),size.width,viewport.width,margin),top:clamp(axis(button.bottom,button.top-size.height,size.height,viewport.height,margin),size.height,viewport.height,margin)};
}
