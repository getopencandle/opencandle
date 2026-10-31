// The price pane in client pixels for the DOM overlays (alert lines, virtual paper order and position lines). The data area
// starts at the renderer's input element, which sits after any left scale gutter (LV-VELA-SCALE-PLACEMENT-1 left columns and,
// with LV-VELA-SCALE-LEFT-1, the main price scale on the left); `scaleSide` names the side of the main price scale so the
// overlays can anchor their axis tags there.
export interface PricePaneProjection {left:number;top:number;width:number;height:number;scaleSide:'left'|'right';priceToY:(price:number)=>number;yToPrice:(y:number)=>number}
interface ProjectionRenderer {
 scene?:{panes?:Map<string,{bounds:{top:number;height:number};scale:unknown}>};
 coords?:{width:number;priceToY?:(price:number,scale:unknown,bounds:unknown)=>number;yToPrice?:(y:number,scale:unknown,bounds:unknown)=>number};
 input?:{el?:{getBoundingClientRect?:()=>{left:number}}|null}|null;
 lvMainScaleSide?:()=>unknown;
}
export function pricePaneProjectionOf(renderer:ProjectionRenderer|null|undefined,container:{getBoundingClientRect():{left:number;top:number}}):PricePaneProjection|null{
 const pane=renderer?.scene?.panes?.get('price'),coords=renderer?.coords;
 if(!pane||!coords||typeof coords.priceToY!=='function'||typeof coords.yToPrice!=='function')return null;
 const box=container.getBoundingClientRect(),scale=pane.scale,bounds=pane.bounds;
 let left=box.left;try{const rect=renderer?.input?.el?.getBoundingClientRect?.();if(rect&&Number.isFinite(rect.left))left=rect.left;}catch{/* No input element yet: the container edge. */}
 let scaleSide:'left'|'right'='right';try{if(typeof renderer?.lvMainScaleSide==='function'&&renderer.lvMainScaleSide()==='left')scaleSide='left';}catch{/* Renderer without the side API: native right. */}
 return{left,top:box.top+bounds.top,width:Math.max(0,coords.width),height:bounds.height,scaleSide,priceToY:price=>box.top+coords.priceToY!(price,scale,bounds),yToPrice:y=>coords.yToPrice!(y-box.top,scale,bounds)};
}
