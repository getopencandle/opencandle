// Reference drawRightThere (Alt + H/J/V/C) from any pane. The crosshair event names only the pane kind, so the
// pane under the pointer is read from the renderer scene (crosshair y against pane bounds, same coordinates). A line is
// placed on that pane at the pointer value: a horizontal line on a sub-pane sits on that pane's scale, a vertical line keeps
// the pointer time. Without a readable pane a vertical line still lands on the price pane (its price is irrelevant).
export interface CrosshairPoint {time:number|null;price:number|null;paneKind:'price'|'study'|null}
interface SceneLike {crosshair?:{x:number;y:number}|null;panes?:Map<string,{bounds?:{top:number;height:number}}>}
export type PlacementTarget={ok:true;paneId:string;price:number}|{ok:false;message:string};
export const PLACE_POINTER_MESSAGE='Move the pointer over the chart first.';
export function crosshairPaneId(scene:SceneLike|null|undefined):string|null{
 const y=scene?.crosshair?.y;if(typeof y!=='number'||!Number.isFinite(y)||!(scene?.panes instanceof Map))return null;
 for(const [id,pane] of scene.panes){const bounds=pane?.bounds;if(bounds&&y>=bounds.top&&y<=bounds.top+bounds.height)return id;}
 return null;
}
export function crosshairPlacement(type:'hline'|'hray'|'vline'|'crossline',point:CrosshairPoint|null,scene:SceneLike|null|undefined,fallbackPrice:number|null):PlacementTarget{
 if(!point||point.time===null||!Number.isFinite(point.time)||!point.paneKind)return{ok:false,message:PLACE_POINTER_MESSAGE};
 const price=point.price!==null&&Number.isFinite(point.price)?point.price:null;
 if(point.paneKind==='price')return price===null?{ok:false,message:PLACE_POINTER_MESSAGE}:{ok:true,paneId:'price',price};
 let paneId:string|null=null;try{paneId=crosshairPaneId(scene);}catch{paneId=null;}
 if(paneId&&paneId!=='price'&&price!==null)return{ok:true,paneId,price};
 if(type==='vline'&&fallbackPrice!==null&&Number.isFinite(fallbackPrice))return{ok:true,paneId:'price',price:fallbackPrice};
 return{ok:false,message:PLACE_POINTER_MESSAGE};
}
