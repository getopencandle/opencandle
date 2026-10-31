/** Drawing edits made while the routine background autosave writes.
 * The save holds the chart for its write. During the hold the chart refused an Object tree edit, a settings dialog Apply,
 * Clone, Copy and Paste ("Drawing manager chart input changed", "Drawing editing is unavailable while the chart is busy"),
 * and kept a drawing-manager edit (toolbar, chart menu, Delete key) unpublished, so the workspace never saved it. App now
 * queues these edits behind the write in the held-input queue (held-key-gate.ts `defer`), in press order with the held
 * keys, and applies each one when the write ends as its own undo step. Before it runs, each edit re-checks the chart it
 * was made on and that the drawings and groups it names still exist; when one is gone it says so plainly. */
export const DRAWING_EDIT_WRITE_WAIT='The workspace is saving. The drawing change applies when the save finishes.';
export const DRAWING_EDIT_STALE='The chart changed while the workspace was saving, so the drawing change made during the save was not applied.';
export const DRAWING_SETTINGS_CLOSED='The drawing settings closed while the workspace was saving, so their changes were not applied.';
/** The same queue also holds the drawing favorites, magnet and Stay in drawing mode toggles, the Bars pattern
 * interval chip, the Drawing manager's own actions and Ctrl+X, and one publication per chart for a native gesture (a drag or
 * inline text edit) made during the write (src/chart/held-drawing-publication.ts). */
export const DRAWING_FAVORITES_STALE='The drawing favorites changed while the workspace was saving, so that favorite change was not applied.';
export const DRAWING_MANAGER_EDIT_WAIT='The workspace is saving. This change applies when the save finishes.';
export const DRAWING_MANAGER_CLOSED='The Drawing manager closed while the workspace was saving, so its change was not applied.';
export interface DrawingEditTargets {drawings?:readonly string[];groups?:readonly string[]}
interface ManagerView {list():readonly Record<string,unknown>[];state():{groups:readonly {id:string}[]}}
/** The plain refusal for an edit whose drawings or groups were removed during the save, or null when all still exist. */
export function missingDrawingTargets(manager:ManagerView,targets:DrawingEditTargets):string|null{
 const drawings=[...new Set(targets.drawings??[])],groups=[...new Set(targets.groups??[])];
 if(!drawings.length&&!groups.length)return null;
 const live=new Set(drawings.length?manager.list().map(row=>String(row.id)):[]),liveGroups=new Set(groups.length?manager.state().groups.map(row=>row.id):[]);
 const lost=drawings.filter(id=>!live.has(id)).length,lostGroups=groups.filter(id=>!liveGroups.has(id)).length;
 if(lostGroups)return(groups.length===1?'The group you changed':lostGroups+' of the groups you changed')+' during the save no longer '+(groups.length===1?'exists':'exist')+', so that change was not applied.';
 if(lost)return(drawings.length===1?'The drawing you changed':lost===drawings.length?'The drawings you changed':lost+' of the '+drawings.length+' drawings you changed')+' during the save no longer '+(drawings.length===1?'exists':'exist')+', so that change was not applied.';
 return null;
}
