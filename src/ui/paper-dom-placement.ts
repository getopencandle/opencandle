/**
 * The saved DOM pane state in the workspace (`paperDomPane`). Optional and additive: absent means
 * closed at the default spot. A malformed value reads as absent (the pane is UI state, so a bad value never fails a restore).
 */
export interface PaperDomPaneSaved {open:boolean;at?:{x:number;y:number}}
const LIMIT=100000;
const coordinate=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=LIMIT;
export function paperDomPaneOf(workspace:{paperDomPane?:unknown}):PaperDomPaneSaved|null{
 const value=workspace.paperDomPane;
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as {open?:unknown;at?:unknown};
 if(typeof row.open!=='boolean')return null;
 const at=row.at as {x?:unknown;y?:unknown}|undefined;
 if(at&&typeof at==='object'&&coordinate(at.x)&&coordinate(at.y))return{open:row.open,at:{x:Math.round(at.x as number),y:Math.round(at.y as number)}};
 return{open:row.open};
}
export function samePaperDomPane(a:PaperDomPaneSaved|null,b:PaperDomPaneSaved|null):boolean{
 if(!a||!b)return a===b;
 return a.open===b.open&&a.at?.x===b.at?.x&&a.at?.y===b.at?.y;
}
