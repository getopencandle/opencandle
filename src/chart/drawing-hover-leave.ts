// The renderer shows a drawing's handles while the pointer hovers it (userDrawings.hoveredId), and only a pointer move
// over the plot updates that hover. A pointer that left the plot while over a drawing (onto the edit bar, a settings dialog, the
// toolbar, the snapshot button) left the hover set: the handles stayed drawn with nothing selected, and a Download image painted
// them too (one Fib anchor dot after the settings Ok). Leaving the plot now drops the hover. Selection handles are
// untouched: a selected drawing keeps its handles.
interface HoverOwner{clearHover?:()=>void}
interface RendererLike{plot?:unknown;userDrawings?:unknown}
/** Installs the pointerleave reset on the renderer's plot element; returns the uninstall. A renderer without a plot or a hover
 * owner installs nothing. */
export function installDrawingHoverLeave(renderer:unknown):()=>void{
 const plot=(renderer as RendererLike|null)?.plot as {addEventListener?:unknown;removeEventListener?:unknown}|undefined;
 if(!plot||typeof plot.addEventListener!=='function'||typeof plot.removeEventListener!=='function')return()=>{};
 const target=plot as unknown as EventTarget;
 const leave=()=>{try{const owner=(renderer as RendererLike).userDrawings as HoverOwner|undefined;if(typeof owner?.clearHover==='function')owner.clearHover();}catch{/* A retired renderer has no hover to drop. */}};
 target.addEventListener('pointerleave',leave);
 return()=>target.removeEventListener('pointerleave',leave);
}
