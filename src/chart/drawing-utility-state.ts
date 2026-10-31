// Lock, hide, sync and remove state of the left-toolbar utility block. Pure: no host, no history, no storage.
export type LockMode='drawings'|'indicators'|'all';
/** 'positions': the paper positions and orders lines on the chart. */
export type HideMode='drawings'|'indicators'|'positions'|'all';
export type SyncMode='layout'|'global';
export type UtilityFamily='drawings'|'indicators'|'positions';
/** Exact persisted block. Toggling never writes history. positionsHidden is additive
 * and optional: absent means shown, so older workspaces load unchanged. */
export interface DrawingUtility{schemaVersion:1;lockMode:LockMode;drawingsLocked:boolean;indicatorsLocked:boolean;hideMode:HideMode;drawingsHidden:boolean;indicatorsHidden:boolean;positionsHidden?:boolean;syncMode:SyncMode;syncOn:boolean;removeLocked:boolean}
export interface UtilityMenuRow{id:string;label:string;kind:'row'|'separator'|'switch';checked?:boolean;disabled?:boolean}
type Row=Record<string,unknown>;

export const LOCK_ARROW_TOOLTIP='Lock options',HIDE_ARROW_TOOLTIP='Hide options',SYNC_ARROW_TOOLTIP='Sync drawings options',REMOVE_ARROW_TOOLTIP='Remove options',REMOVE_BUTTON_TITLE='Remove objects',HIDE_HINT='Ctrl + Alt + H';
/** Undo label of the combined Remove action (SOT#undoTexts "remove objects"). */
export const REMOVE_HISTORY_LABEL='remove objects';
const KEYS=['schemaVersion','lockMode','drawingsLocked','indicatorsLocked','hideMode','drawingsHidden','indicatorsHidden','syncMode','syncOn','removeLocked'] as const;
const MODES=['drawings','indicators','all'] as const,HIDE_MODES=['drawings','indicators','positions','all'] as const;
/** Hide all also hides positions and orders; Lock all locks drawings and indicators only. */
const familiesOf=(mode:LockMode|HideMode,kind:'Locked'|'Hidden'='Locked'):UtilityFamily[]=>mode==='all'?(kind==='Hidden'?['drawings','indicators','positions']:['drawings','indicators']):[mode];

/** Defaults (SDT#utility.lock defaultLockMode all, hide defaultHideMode drawings, sync mode Layout). syncOn is false here: only a fresh workspace turns it on (Q5, see freshDrawingUtility). */
export const defaultDrawingUtility=():DrawingUtility=>({schemaVersion:1,lockMode:'all',drawingsLocked:false,indicatorsLocked:false,hideMode:'drawings',drawingsHidden:false,indicatorsHidden:false,syncMode:'layout',syncOn:false,removeLocked:false});
/** The workspace factory block: Layout sync on for new workspaces only (root Q5, SDT#utility.sync drawOnAllCharts true). */
export const freshDrawingUtility=():DrawingUtility=>({...defaultDrawingUtility(),syncOn:true});

export function validateDrawingUtility(value:unknown):DrawingUtility{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('Unsupported drawing utility settings.');
 const row=value as Row,own=Object.getOwnPropertyDescriptors(row);
 const optional=Object.hasOwn(row,'positionsHidden')?1:0;
 if(Object.values(own).some(field=>field.get||field.set)||Object.keys(row).length!==KEYS.length+optional||KEYS.some(key=>!Object.hasOwn(row,key)))throw new Error('Unsupported drawing utility settings.');
 if(optional&&typeof row.positionsHidden!=='boolean')throw new Error('Unsupported drawing utility settings.');
 const bool=(key:string)=>{if(typeof row[key]!=='boolean')throw new Error('Unsupported drawing utility settings.');return row[key] as boolean;};
 const mode=(key:string)=>{if(!(key==='hideMode'?HIDE_MODES:MODES).includes(row[key] as never))throw new Error('Unsupported drawing utility settings.');return row[key] as LockMode;};
 if(row.schemaVersion!==1||!['layout','global'].includes(row.syncMode as string))throw new Error('Unsupported drawing utility settings.');
 return{schemaVersion:1,lockMode:mode('lockMode'),drawingsLocked:bool('drawingsLocked'),indicatorsLocked:bool('indicatorsLocked'),hideMode:mode('hideMode'),drawingsHidden:bool('drawingsHidden'),indicatorsHidden:bool('indicatorsHidden'),...(optional?{positionsHidden:row.positionsHidden as boolean}:{}),syncMode:row.syncMode as SyncMode,syncOn:bool('syncOn'),removeLocked:bool('removeLocked')};
}
/** Load-time migration: an absent block takes the defaults with syncOn from the old layout flag; a present block is validated and never defaulted over. */
export function migrateDrawingUtility(input:unknown,legacySyncDrawings:boolean):{value:DrawingUtility;migrated:boolean}{
 if(input===undefined)return{value:{...defaultDrawingUtility(),syncOn:legacySyncDrawings===true},migrated:true};
 return{value:validateDrawingUtility(input),migrated:false};
}

const flag=(u:DrawingUtility,kind:'Locked'|'Hidden',family:UtilityFamily)=>u[(family+kind) as 'drawingsLocked']===true;
const withFamilies=(u:DrawingUtility,kind:'Locked'|'Hidden',mode:LockMode|HideMode,on:boolean):DrawingUtility=>{const next={...u};for(const family of familiesOf(mode,kind))(next as Row)[family+kind]=on;return next;};
/** A mode is active when every family it names is on. */
export const lockActive=(u:DrawingUtility)=>familiesOf(u.lockMode).every(f=>flag(u,'Locked',f));
/** Hide all reads as active once drawings and indicators are hidden (a saved block from before positions existed keeps its state). */
export const hideActive=(u:DrawingUtility)=>familiesOf(u.hideMode).every(f=>flag(u,'Hidden',f));
/** The paper positions and orders lines are hidden. */
export const positionsHidden=(u:DrawingUtility)=>u.positionsHidden===true;
/** Main button: turn the mode's families on, or all of them off when the mode is already active. */
export const toggleLock=(u:DrawingUtility):DrawingUtility=>withFamilies(u,'Locked',u.lockMode,!lockActive(u));
export const toggleHide=(u:DrawingUtility):DrawingUtility=>withFamilies(u,'Hidden',u.hideMode,!hideActive(u));
/** A menu row selects that mode and turns it on. */
export const selectLockMode=(u:DrawingUtility,mode:LockMode):DrawingUtility=>withFamilies({...u,lockMode:mode},'Locked',mode,true);
export const selectHideMode=(u:DrawingUtility,mode:HideMode):DrawingUtility=>withFamilies({...u,hideMode:mode},'Hidden',mode,true);
/** Main sync button toggles between off and the remembered mode; syncMode is kept while syncOn is false. */
export const toggleSync=(u:DrawingUtility):DrawingUtility=>({...u,syncOn:!u.syncOn});
export const selectSyncMode=(u:DrawingUtility,mode:SyncMode):DrawingUtility=>({...u,syncMode:mode,syncOn:true});
export const toggleRemoveLocked=(u:DrawingUtility):DrawingUtility=>({...u,removeLocked:!u.removeLocked});

const LOCK_TIPS:Record<LockMode,[string,string]>={drawings:['Lock drawings','Unlock drawings'],indicators:['Lock indicators','Unlock indicators'],all:['Lock drawings and indicators','Unlock drawings and indicators']};
const HIDE_TIPS:Record<HideMode,[string,string]>={drawings:['Hide all drawings','Show all drawings'],indicators:['Hide all indicators','Show all indicators'],positions:['Hide positions and orders','Show positions and orders'],all:['Hide all drawings and indicators','Show all drawings and indicators']};
export const lockTooltip=(u:DrawingUtility)=>LOCK_TIPS[u.lockMode][lockActive(u)?1:0];
export const hideTooltip=(u:DrawingUtility)=>HIDE_TIPS[u.hideMode][hideActive(u)?1:0];
export const SYNC_TOOLTIPS={layout:'New drawings are replicated to all charts in the layout and shown when the same ticker is selected',global:'New drawings are replicated to all charts in all layouts and shown when the same ticker is selected',off:'New drawings will not be synced'} as const;
export const syncTooltip=(u:DrawingUtility)=>u.syncOn?SYNC_TOOLTIPS[u.syncMode]:SYNC_TOOLTIPS.off;

const MODE_ROWS=(labels:readonly [string,string,string],selected:LockMode,prefix:string):UtilityMenuRow[]=>MODES.map((mode,index)=>({id:prefix+mode,label:labels[index],kind:'row',checked:selected===mode}));
export const lockMenu=(u:DrawingUtility):UtilityMenuRow[]=>MODE_ROWS(['Lock drawings','Lock indicators','Lock all'],u.lockMode,'lock-');
/** Hide positions and orders acts on the paper positions and orders lines (PaperChartLines). */
export const HIDE_MODE_ORDER:readonly HideMode[]=HIDE_MODES;
export const hideMenu=(u:DrawingUtility):UtilityMenuRow[]=>HIDE_MODES.map((mode,index)=>({id:'hide-'+mode,label:['Hide drawings','Hide indicators','Hide positions and orders','Hide all'][index],kind:'row' as const,checked:u.hideMode===mode}));
export const syncMenu=(u:DrawingUtility):UtilityMenuRow[]=>[{id:'sync-layout',label:'New drawings sync in layout',kind:'row',checked:u.syncOn&&u.syncMode==='layout'},{id:'sync-global',label:'New drawings sync globally',kind:'row',checked:u.syncOn&&u.syncMode==='global'}];

/** Remove menu: a zero count uses the fallback label and disables the row; the combined row uses its fallback when either count is zero and is disabled only when both are zero. */
export function removeMenu(counts:{drawings:number;indicators:number;removeLocked:boolean}):UtilityMenuRow[]{
 const {drawings:d,indicators:i}=counts,drawing=(n:number)=>n+(n===1?' drawing':' drawings'),indicator=(n:number)=>n+(n===1?' indicator':' indicators');
 return[
  {id:'remove-drawing-tools',label:d>0?'Remove '+drawing(d):'Remove drawings',kind:'row',disabled:d<=0},
  {id:'remove-studies',label:i>0?'Remove '+indicator(i):'Remove indicators',kind:'row',disabled:i<=0},
  {id:'remove-all',label:d>0&&i>0?'Remove '+drawing(d)+' & '+indicator(i):'Remove drawings and indicators',kind:'row',disabled:d<=0&&i<=0},
  {id:'separator',label:'',kind:'separator'},
  {id:'remove-locked',label:'Always remove locked drawings',kind:'switch',checked:counts.removeLocked}
 ];
}

export type RemoveScope='drawings'|'indicators'|'all';
export interface RemoveInput{rows:readonly Row[];indicatorIds:readonly string[];utility:DrawingUtility;scope:RemoveScope}
export interface RemovePlan{drawingIds:string[];keptLockedIds:string[];indicatorIds:string[];historyLabel:string}
/** The eraser and the remove preference treat every drawing as locked while drawing lock is on. */
export const effectiveDrawingLocked=(row:Row,u:DrawingUtility)=>u.drawingsLocked||row.locked===true;
export const eraserMayRemove=(row:Row,u:DrawingUtility)=>!effectiveDrawingLocked(row,u);
/** No prompt: `rows` are the active cell's active scope document rows only (renderable and retained); the caller passes inactive scope documents nowhere. Group membership is pruned by the manager remove. */
export function planRemove(input:RemoveInput):RemovePlan{
 const {rows,utility,scope}=input,drawings=scope!=='indicators',kept:string[]=[],ids:string[]=[];
 if(drawings)for(const row of rows){const id=String(row.id);if(!utility.removeLocked&&effectiveDrawingLocked(row,utility))kept.push(id);else ids.push(id);}
 return{drawingIds:ids,keptLockedIds:kept,indicatorIds:scope==='drawings'?[]:[...input.indicatorIds],historyLabel:REMOVE_HISTORY_LABEL};
}
/** Live counts for the menu: `{n}` counts only what would be removed. */
export function removeCountsFor(input:Omit<RemoveInput,'scope'>):{drawings:number;indicators:number;removeLocked:boolean}{return{drawings:planRemove({...input,scope:'drawings'}).drawingIds.length,indicators:input.indicatorIds.length,removeLocked:input.utility.removeLocked};}

/** Unhide-unlock (SDD#creation.unhideUnlock): acts on the first draft of each placement, re-arms on create or cancel, clears only the drawing half. */
export interface UnhideUnlockState{armed:boolean}
export const createUnhideUnlock=():UnhideUnlockState=>({armed:true});
/** 'placed': a drawing a placement tool committed. A one-click tool (Horizontal line, Vertical line, ...)
 * commits on its first mouse-down without any draft, so the rule acts here when no draft did, and re-arms either way. */
export function unhideUnlockStep(state:UnhideUnlockState,event:'draft'|'create'|'cancel'|'placed',u:DrawingUtility):{state:UnhideUnlockState;utility:DrawingUtility;changed:boolean}{
 if(event==='placed'){const step=unhideUnlockStep(state,'draft',u);return{...step,state:{armed:true}};}
 if(event!=='draft')return{state:{armed:true},utility:u,changed:false};
 if(!state.armed)return{state,utility:u,changed:false};
 const changed=u.drawingsHidden||u.drawingsLocked;
 return{state:{armed:false},utility:changed?{...u,drawingsHidden:false,drawingsLocked:false}:u,changed};
}

/** A pasted, cloned or new row takes the current toolbar stamp, never the source row's. */
export const currentSyncStamp=(u:DrawingUtility):SyncMode|undefined=>u.syncOn?u.syncMode:undefined;
export function stampNewRow<T extends Row>(row:T,u:DrawingUtility):T{const next={...row} as Row,stamp=currentSyncStamp(u);if(stamp)next.lvSyncScope=stamp;else delete next.lvSyncScope;return next as T;}
/** Legacy rows take 'layout' when the old layout flag was on. Runs once: only while drawingUtility is absent, rows with a scope are kept, input is never mutated. */
export function stampLegacyRows<T extends Row>(rows:readonly T[],legacySyncDrawings:boolean,drawingUtilityPresent:boolean):T[]{
 if(drawingUtilityPresent||!legacySyncDrawings)return rows.slice();
 return rows.map(row=>row.lvSyncScope===undefined?{...row,lvSyncScope:'layout'}:row);
}

/** The workspace-level cross-layout store. Exact shape, at most 128 scope keys and 10000 rows in total. */
export const GLOBAL_DRAWINGS_LIMITS={scopeKeys:128,rows:10000} as const;
export function validateGlobalDrawings(value:unknown):Record<string,Row[]>{
 const bad=()=>new Error('Unsupported global drawings.');
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw bad();
 const keys=Object.keys(value as Row);if(keys.length>GLOBAL_DRAWINGS_LIMITS.scopeKeys)throw new Error('Global drawings exceed the scope limit.');
 const out=Object.create(null) as Record<string,Row[]>;let total=0;
 for(const key of keys){
  if(key==='__proto__'||key.length>4096)throw bad();
  const list=(value as Row)[key];if(!Array.isArray(list))throw bad();
  total+=list.length;if(total>GLOBAL_DRAWINGS_LIMITS.rows)throw new Error('Global drawings exceed the row limit.');
  const ids=new Set<string>();
  out[key]=list.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item)||typeof (item as Row).id!=='string'||!(item as Row).id)throw bad();const id=(item as Row).id as string;if(ids.has(id))throw bad();ids.add(id);return item as Row;});
 }
 return Object.assign({},out);
}
