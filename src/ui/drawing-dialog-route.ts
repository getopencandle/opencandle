// The tab a drawing settings dialog opens on.
// A click on the hide button of a row that is hidden on the current interval
// opens the settings dialog on its Visibility tab. The drawing context menu entry "Visibility on intervals…" opens the same tab.
// The request is keyed by the dialog authority object App mints for each opened dialog, so it applies to exactly that opening and
// never leaks into a later one (no new App hook or state is needed).
export type DrawingDialogEntryTab='Visibility';
const requests=new WeakMap<object,DrawingDialogEntryTab>();
export function routeDrawingDialogTab(authority:object,tab:DrawingDialogEntryTab):void{requests.set(authority,tab);}
export function drawingDialogEntryTab(authority:object):DrawingDialogEntryTab|undefined{return requests.get(authority);}
