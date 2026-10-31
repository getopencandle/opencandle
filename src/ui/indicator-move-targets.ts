// The "Move to" submenu for one indicator, shared by the Object tree row menu and the
// legend More menu. Pure model over the renderer's pane list (chart.panes.list(), top to bottom); no mutation here.
// - "New pane above" / "New pane below": the Object tree Move to menu and
//   the legend More menu (Move to submenu), in that order.
// - "Existing pane above" / "Existing pane below":. The wording, the order (after the
//   new-pane entries) and the neighbour rule (the pane directly above or below, merged into its stack) are OpenCandle's own.
export type IndicatorNewPaneMove='above'|'below';
export type IndicatorExistingPaneMove='existing-above'|'existing-below';
export type IndicatorMoveWhere=IndicatorNewPaneMove|IndicatorExistingPaneMove;
export interface IndicatorMoveChoice {id:IndicatorMoveWhere;label:string;disabled?:string}
export const NEW_PANE_MOVES:readonly {id:IndicatorNewPaneMove;label:string}[]=Object.freeze([{id:'above',label:'New pane above'},{id:'below',label:'New pane below'}]);
/** See the file header. */
export const EXISTING_PANE_MOVES:readonly {id:IndicatorExistingPaneMove;label:string}[]=Object.freeze([{id:'existing-above',label:'Existing pane above'},{id:'existing-below',label:'Existing pane below'}]);
export const isExistingPaneMove=(where:string):where is IndicatorExistingPaneMove=>where==='existing-above'||where==='existing-below';

interface PaneRow {id:string;kind?:string;indicators:readonly {id:string}[]}
export interface IndicatorMoveHost {chart?:{panes:{list():readonly unknown[]}}|null}
export interface IndicatorMoveInstance {rendererId:string;paneId:string|null}
const REASON={
 gone:'This indicator pane is unavailable.',
 above:'There is no pane above this one.',
 below:'There is no pane below this one.',
 foreign:'That pane holds only scripts or comparisons. OpenCandle cannot move an indicator into it yet.',
} as const;

function readPanes(host:IndicatorMoveHost):PaneRow[]|null{
 try{const list=host.chart?.panes.list();return Array.isArray(list)?list as PaneRow[]:null;}catch{return null;}
}
const isPrice=(pane:PaneRow)=>pane.kind==='price'||(pane.kind===undefined&&pane.id==='price');
/** The indicator port target for the neighbour pane, or the reason it cannot be used. */
function resolve(panes:readonly PaneRow[],rendererId:string,instances:readonly IndicatorMoveInstance[],where:IndicatorExistingPaneMove):{target:'price'|{pane:string}}|{reason:string}{
 const index=panes.findIndex(pane=>pane.indicators.some(native=>native.id===rendererId));if(index<0)return{reason:REASON.gone};
 const neighbour=panes[where==='existing-above'?index-1:index+1];if(!neighbour)return{reason:where==='existing-above'?REASON.above:REASON.below};
 if(isPrice(neighbour))return{target:'price'};
 // The port addresses panes by their logical (saved) id; a pane that holds no LV built-in has none we could name.
 const member=instances.find(row=>row.paneId!==null&&row.paneId!=='price'&&neighbour.indicators.some(native=>native.id===row.rendererId));
 return member?{target:{pane:member.paneId as string}}:{reason:REASON.foreign};
}

/** Submenu rows in order. Existing-pane rows appear only when the chart reports two or more panes; each one that cannot
 * run carries its reason (shown as the item tooltip), never a silent no-op. */
export function indicatorMoveChoices(host:IndicatorMoveHost,rendererId:string,instances:readonly IndicatorMoveInstance[]):IndicatorMoveChoice[]{
 const out:IndicatorMoveChoice[]=NEW_PANE_MOVES.map(row=>({...row}));
 const panes=readPanes(host);if(!panes||panes.length<2)return out;
 for(const row of EXISTING_PANE_MOVES){const result=resolve(panes,rendererId,instances,row.id);out.push('reason' in result?{...row,disabled:result.reason}:{...row});}
 return out;
}
/** The indicator port move target for an existing-pane choice. Throws the same reason the menu shows. */
export function existingPaneTarget(host:IndicatorMoveHost,rendererId:string,instances:readonly IndicatorMoveInstance[],where:IndicatorExistingPaneMove):'price'|{pane:string}{
 const panes=readPanes(host);if(!panes)throw Error(REASON.gone);
 const result=resolve(panes,rendererId,instances,where);if('reason' in result)throw Error(result.reason);
 return result.target;
}
