/** Pane tops and heights in CSS px from the chart host's top, in pane order, so App can place each
 * per-pane legend group at its pane's top-left. Read from the renderer scene after layout. */
export interface PaneGeometry{id:string;top:number;height:number;collapsed:boolean}
export function paneGeometryOf(scene:unknown):PaneGeometry[]{
 const ordered=(scene as {orderedPanes?:()=>unknown}|null)?.orderedPanes;if(typeof ordered!=='function')return[];
 const panes=Reflect.apply(ordered,scene,[]);if(!Array.isArray(panes))return[];
 return panes.flatMap(pane=>{const row=pane as {id?:unknown;bounds?:{top?:unknown;height?:unknown};collapsed?:unknown};const top=Number(row.bounds?.top),height=Number(row.bounds?.height);
  return typeof row.id==='string'&&Number.isFinite(top)&&Number.isFinite(height)?[{id:row.id,top,height,collapsed:row.collapsed===true}]:[];});
}
