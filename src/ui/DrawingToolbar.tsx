import React,{useEffect,useRef,useState} from 'react';
import {buildDrawingToolGroups,leafShortcut,savedFavoriteList,removeFavorite,favoriteLabel,favoriteGlyphs,groupDefaultLeaf,groupOfTool,installOutsideDismiss,leafIsActive,leafState,mainButtonName,MEASURE_LEAF,nextFocusIndex,REFERENCE_DRAWING_GROUPS,normalizeFavorites,toggleFavorite,toolLabel,type DrawingCatalogRow,type DrawingMode,type DrawingToolGroup,type DrawingToolLeaf} from './drawing-toolbar-model';
import {LV_ICONS,type LvIconId} from './icons';
import type {CursorKind} from '../chart/cursor-kind';
/** Cursor kinds a host gets by default: Demonstration waits on owner question Q2. */
const DEFAULT_CURSOR_KINDS:readonly CursorKind[]=['cross','dot','arrow','demonstration','magic'];
import {EmojiPicker} from './EmojiPicker';
import {StickerPicker} from './StickerPicker';
import './drawing-toolbar.css';
/** First registered LV icon among `ids` (decorative: the hosting control carries the name), else the text fallback. */
const drawingIcon=(ids:readonly (string|undefined)[],fallback:React.ReactNode=null):React.ReactNode=>{for(const id of ids)if(id&&Object.hasOwn(LV_ICONS,id)){const Icon=LV_ICONS[id as LvIconId].Icon;return <Icon/>;}return fallback;};
/** Left toolbar drawing groups with flyouts. Contract for the host:
 * onSelect(type) is an ARM request and must be idempotent (never toggle); onCursor() disarms;
 * onMode drives renderer measure/eraser, limited to enabledModes; favorites persist only when the host supplies
 * favorites + onFavoritesChange. When chart.drawings is present its getTool()/getMode() are the truth for
 * indication and for skipping a redundant arm; without it every tool choice emits onSelect, so a stale host
 * activeTool can never swallow a re-arm. */
export interface DrawingToolbarProps{
 chart:{drawingCatalog():readonly DrawingCatalogRow[];drawings?:{getTool():string|null;getMode?():DrawingMode|null}}|null;
 activeTool:string|null;activeMode?:DrawingMode|null;
 onSelect:(type:string)=>void;onCursor:()=>void;onMode?:(mode:DrawingMode|null)=>void;enabledModes?:readonly DrawingMode[];onOpenAll:()=>void;
 /** Cursor kinds: the chosen kind, the choose callback, and the kinds the host has connected. Without onCursorKind those rows stay unavailable. */
 activeCursor?:CursorKind;onCursorKind?:(kind:CursorKind)=>void;enabledCursorKinds?:readonly CursorKind[];
 favorites?:readonly string[];onFavoritesChange?:(next:string[])=>void;
}
/** No-chart fallback: the reference groups minus the leaves this build cannot run, matching buildDrawingToolGroups. */
function availableReferenceGroups():DrawingToolGroup[]{
 return REFERENCE_DRAWING_GROUPS.map(group=>({...group,sections:group.sections.map(row=>({...row,leaves:row.leaves.filter(leaf=>leaf.target.kind!=='unavailable')})).filter(row=>row.leaves.length)})).filter(group=>group.sections.length);
}
type Notice={label:string;reason:string;alternative?:string};
type FavoriteBinding={node:HTMLButtonElement};
type FavoriteControl={binding:FavoriteBinding;registration:object};
export function DrawingToolbar({chart,activeTool:hostTool,activeMode:hostMode=null,onSelect,onCursor,onMode,enabledModes,onOpenAll,favorites,onFavoritesChange,activeCursor='cross',onCursorKind,enabledCursorKinds}:DrawingToolbarProps){
 const cache=useRef<{chart:DrawingToolbarProps['chart'];groups:DrawingToolGroup[]}|null>(null);
 if(cache.current?.chart!==chart)cache.current={chart,groups:chart?buildDrawingToolGroups(chart.drawingCatalog()):availableReferenceGroups()};
 const groups=cache.current.groups,context={modes:onMode?enabledModes??true:false,cursorKinds:onCursorKind?enabledCursorKinds??DEFAULT_CURSOR_KINDS:[]},disabled=!chart;
 const truthTool=chart?.drawings?chart.drawings.getTool():undefined,truthMode=chart?.drawings?.getMode?chart.drawings.getMode():undefined;
 const activeTool=truthTool!==undefined?truthTool:hostTool,activeMode=truthMode!==undefined?truthMode:hostMode;
 const [openGroup,setOpenGroup]=useState<string|null>(null),[focus,setFocus]=useState(-1),[lastUsed,setLastUsed]=useState<Record<string,string>>({}),[notice,setNotice]=useState<Notice|null>(null),[anchor,setAnchor]=useState<{left:number;top:number}|null>(null),[onStar,setOnStar]=useState(false),[iconTab,setIconTab]=useState<'emojis'|'stickers'>('emojis');
 const root=useRef<HTMLDivElement|null>(null),arrows=useRef<Record<string,HTMLButtonElement|null>>({}),items=useRef<Array<HTMLButtonElement|null>>([]),stars=useRef<Array<HTMLButtonElement|null>>([]);
 const favoriteControls=useRef(new Map<string,FavoriteControl>()),favoriteBindings=useRef(new Map<string,FavoriteBinding>()),favoriteOpening=useRef<{group:string;token:object}|null>(null);
 const favoriteAuthority=useRef({chart,favorites,onFavoritesChange,onSelect,onCursor,onMode,hostTool,hostMode,mounted:true});
 const prior=favoriteAuthority.current;
 if(prior.chart!==chart||prior.favorites!==favorites||prior.onFavoritesChange!==onFavoritesChange||prior.onSelect!==onSelect||prior.onCursor!==onCursor||prior.onMode!==onMode||prior.hostTool!==hostTool||prior.hostMode!==hostMode)favoriteAuthority.current={chart,favorites,onFavoritesChange,onSelect,onCursor,onMode,hostTool,hostMode,mounted:prior.mounted};
 const favoriteOwner=favoriteAuthority.current,opening=favoriteOpening.current;
 const favoriteTypes=onFavoritesChange?normalizeFavorites(groups,favorites??[]):[];
 // Every retained saved favorite, including inert ones whose tool is not available in this build.
 const savedFavorites=onFavoritesChange?savedFavoriteList(groups,favorites??[]):[];
 const reset=()=>{favoriteOpening.current=null;setOpenGroup(null);setFocus(-1);setOnStar(false);setNotice(null);};
 const close=(returnFocus=false)=>{const group=openGroup;reset();if(returnFocus&&group)arrows.current[group]?.focus?.();};
 useEffect(()=>openGroup?installOutsideDismiss(document,root.current,reset):undefined,[openGroup]);
 useEffect(()=>{if(openGroup&&focus>=0)(onStar?stars.current[focus]:items.current[focus])?.focus?.();},[openGroup,focus,onStar]);
 useEffect(()=>{favoriteAuthority.current.mounted=true;return()=>{favoriteAuthority.current.mounted=false;};},[]);
 const favoriteControl=(key:string,position?:number)=>{const registration={};let captured:FavoriteBinding|null=null;return{
  binding:()=>captured,
  ref:(node:HTMLButtonElement|null)=>{
   if(node){let binding=favoriteBindings.current.get(key);if(!binding||binding.node!==node){binding={node};favoriteBindings.current.set(key,binding);}captured??=binding;favoriteControls.current.set(key,{binding,registration});if(position!==undefined)stars.current[position]=node;}
   else if(favoriteControls.current.get(key)?.registration===registration){favoriteControls.current.delete(key);if(position!==undefined)stars.current[position]=null;}
  }
 };};
 const favoriteCurrent=(key:string,node:HTMLButtonElement,binding:FavoriteBinding|null)=>!!binding&&binding.node===node&&favoriteBindings.current.get(key)===binding&&favoriteAuthority.current===favoriteOwner&&favoriteOwner.mounted&&!!chart&&favoriteControls.current.get(key)?.binding===binding&&node.isConnected&&!!root.current?.contains(node)&&node.offsetParent!==null&&!node.closest('[hidden],[aria-hidden="true"],[inert]');
 const favoriteEvent=(event:React.MouseEvent<HTMLButtonElement>)=>!event.defaultPrevented&&!(event.nativeEvent as MouseEvent & {isComposing?:boolean})?.isComposing&&(event.target===event.currentTarget||(event.target as Element|null)?.closest?.('button')===event.currentTarget);
 const toggleSavedFavorite=(type:string,binding:FavoriteBinding|null,event:React.MouseEvent<HTMLButtonElement>)=>{
  if(!favoriteEvent(event)||!opening||favoriteOpening.current!==opening||opening.group!==openGroup||!favoriteCurrent('star:'+type,event.currentTarget,binding)||!onFavoritesChange)return;
  onFavoritesChange(toggleFavorite(groups,savedFavorites,type));
 };
 /** Strip removal (context menu, Delete or Backspace): works for available and inert saved favorites. */
 const removeSavedFavorite=(type:string,binding:FavoriteBinding|null,event:React.MouseEvent<HTMLButtonElement>|React.KeyboardEvent<HTMLButtonElement>)=>{
  if(event.defaultPrevented||(event.nativeEvent as Event & {isComposing?:boolean})?.isComposing||event.target!==event.currentTarget)return;
  event.preventDefault();
  if(!favoriteCurrent('strip:'+type,event.currentTarget,binding)||!savedFavorites.includes(type)||!onFavoritesChange)return;
  onFavoritesChange(removeFavorite(groups,savedFavorites,type));
 };
 const useFavorite=(type:string,binding:FavoriteBinding|null,event:React.MouseEvent<HTMLButtonElement>)=>{
  const current=()=>favoriteCurrent('strip:'+type,event.currentTarget,binding)&&favoriteTypes.includes(type);
  if(!favoriteEvent(event)||!current())return;
  const tool=chart?.drawings?chart.drawings.getTool():hostTool;if(!current())return;
  const mode=chart?.drawings?.getMode?chart.drawings.getMode():hostMode;if(!current())return;
  if(tool===type&&!mode){onCursor();return;}
  if(mode){onMode?.(null);if(!current())return;}onSelect(type);
 };
 const arm=(leaf:DrawingToolLeaf,group:DrawingToolGroup|null,leafCount=0):boolean=>{
  const state=leafState(leaf,context);
  if(state.state==='unavailable'){setNotice({label:leaf.label,reason:state.reason,alternative:state.alternative});if(state.alternative){setOnStar(false);setFocus(leafCount);}return false;}
  const target=leaf.target;
  // Renderer modes (Eraser) are transient: never remember one as the group's main action,
  // so when the mode ends for any reason the button returns to the last real choice.
  if(group&&target.kind!=='mode')setLastUsed(previous=>previous[group.id]===leaf.id?previous:{...previous,[group.id]:leaf.id});
  if(target.kind==='cursor'){if(activeMode)onMode?.(null);onCursorKind?.(target.cursor??'cross');onCursor();}
  else if(target.kind==='mode'){if(activeMode!==target.mode)onMode!(target.mode);}
  else if(target.kind==='tool'&&!(truthTool!==undefined&&truthTool===target.type&&!activeMode)){if(activeMode)onMode?.(null);onSelect(target.type);}
  return true;
 };
 const choose=(leaf:DrawingToolLeaf,group:DrawingToolGroup,leafCount:number)=>{if(arm(leaf,group,leafCount))close(false);};
 const chooseAlternative=(type:string)=>{const group=groups.find(row=>row.id===groupOfTool(groups,type))??null,leaf=group?.sections.flatMap(row=>row.leaves).find(row=>row.target.kind==='tool'&&row.target.type===type);if(leaf&&arm(leaf,group))close(false);};
 const toggleGroup=(group:DrawingToolGroup)=>{if(openGroup===group.id){close(false);return;}const leaves=group.sections.flatMap(row=>row.leaves),active=leaves.findIndex(leaf=>leafIsActive(leaf,activeTool,activeMode)&&leaf.target.kind!=='cursor');const rect=arrows.current[group.id]?.getBoundingClientRect?.();favoriteOpening.current={group:group.id,token:{}};setAnchor(rect?{left:Math.round(rect.right+4),top:Math.round(rect.top)}:null);setNotice(null);setOnStar(false);setOpenGroup(group.id);setFocus(active>=0?active:0);};
 const pressGroup=(group:DrawingToolGroup,leaf:DrawingToolLeaf|null)=>{
  if(openGroup)reset();
  if(!leaf)return;
  const groupActive=leaf.target.kind==='tool'?activeTool===leaf.target.type&&!activeMode:leaf.target.kind==='mode'&&activeMode===leaf.target.mode;
  if(groupActive){if(activeMode)onMode?.(null);onCursor();return;}
  arm(leaf,group);
 };
 const menuKey=(event:React.KeyboardEvent,leaves:readonly DrawingToolLeaf[],count:number)=>{
  if(event.nativeEvent?.isComposing)return;
  if(event.key==='ArrowRight'){event.preventDefault();const leaf=leaves[focus];if(leaf&&!onStar&&onFavoritesChange&&leaf.target.kind==='tool'&&leafState(leaf,context).state==='available')setOnStar(true);return;}
  if(event.key==='ArrowLeft'&&onStar){event.preventDefault();event.stopPropagation();setOnStar(false);return;}
  if(event.key==='Escape'||event.key==='ArrowLeft'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close(false);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();setOnStar(false);setFocus(nextFocusIndex(count,focus,event.key));}
 };
 const arrowKey=(event:React.KeyboardEvent,group:DrawingToolGroup)=>{if((event.key==='ArrowRight'||event.key==='ArrowDown')&&openGroup!==group.id){event.preventDefault();toggleGroup(group);}else if(event.key==='Escape'&&openGroup===group.id){event.preventDefault();event.stopPropagation();close(true);}};
 const cursorActive=!activeTool&&!activeMode;items.current=[];stars.current=[];
 const glyphs=favoriteGlyphs(savedFavorites.map(type=>favoriteLabel(groups,type)));
 return <div className="lv-drawing-groups" ref={root}>
  {groups.map(group=>{
   const open=openGroup===group.id,leaves=group.sections.flatMap(row=>row.leaves);
   // External choices (the full picker or a shortcut) do not update this toolbar's lastUsed.
   // Resolve one leaf for both the label and click: an available active leaf toggles off;
   // otherwise the remembered/default leaf arms. External choices do not replace that memory.
   const leaf=leaves.find(row=>row.target.kind!=='cursor'&&leafIsActive(row,activeTool,activeMode)&&leafState(row,context).state==='available')??groupDefaultLeaf(group,lastUsed[group.id],context);
   // Cursors is pressed only when the leaf it names is the actual state (cursor, or an active Eraser).
   const active=group.id==='cursors'?(leaf?leafIsActive(leaf,activeTool,activeMode,activeCursor):cursorActive):leaves.some(row=>row.target.kind!=='cursor'&&leafIsActive(row,activeTool,activeMode));
   const alternativeIndex=leaves.length,count=leaves.length+(open&&notice?.alternative?1:0);let index=0;
   return <div className="lv-drawing-group" key={group.id}>
    <button type="button" className={active?'active':''} aria-pressed={active} disabled={disabled||(!leaf&&!group.opensFlyout)} title={group.buttonTitle??group.label+(leaf?': '+leaf.label:'')} aria-keyshortcuts={leaf&&!group.buttonTitle?leafShortcut(leaf)?.replace(/ \+ /g,'+')??undefined:undefined} aria-label={group.buttonTitle??(leaf?mainButtonName(leaf):group.label)} {...group.opensFlyout?{'aria-haspopup':'menu' as const,'aria-expanded':open}:{}} onClick={()=>group.opensFlyout?toggleGroup(group):pressGroup(group,leaf)}>{drawingIcon([leaf?.iconId,group.iconId],group.glyph)}</button>
    <button type="button" className="lv-drawing-arrow" ref={node=>{arrows.current[group.id]=node;}} disabled={disabled} aria-label={'Open '+group.label} aria-haspopup="menu" aria-expanded={open} onClick={()=>toggleGroup(group)} onKeyDown={event=>arrowKey(event,group)}>›</button>
    {open&&<div className="lv-drawing-flyout" role="menu" style={anchor?{left:anchor.left,top:anchor.top,maxHeight:`calc(100vh - ${anchor.top+8}px)`}:undefined} aria-label={group.label} onKeyDown={event=>menuKey(event,leaves,count)}>
     <strong className="lv-drawing-flyout-title" aria-hidden="true">{group.label}</strong>
     {/* Emojis and Stickers tabs (static-drawing-toolbar#group.linetool-group-font-icons: tabs Emojis / Stickers / Icons,
       * defaultTab emojis). The Icons tab is the Icons row below. A tab shows only while its tool is available. */}
     {group.id==='icons'&&(()=>{const find=(id:string)=>{const row=leaves.find(item=>item.id===id);return row&&leafState(row,context).state==='available'?row:undefined;},emoji=find('DW.ANNOTATION.EMOJI'),sticker=find('DW.ANNOTATION.STICKERS'),tab=iconTab==='stickers'&&sticker||!emoji?'stickers':'emojis';
      return <>{emoji&&sticker&&<div className="lv-icon-tabs" role="tablist" aria-label="Icon kinds">{(['emojis','stickers'] as const).map(name=><button type="button" role="tab" key={name} aria-selected={tab===name} onClick={()=>setIconTab(name)}>{name==='emojis'?'Emojis':'Stickers'}</button>)}</div>}
       {tab==='emojis'&&emoji&&<EmojiPicker onPick={()=>choose(emoji,group,alternativeIndex)}/>}{tab==='stickers'&&sticker&&<StickerPicker onPick={()=>choose(sticker,group,alternativeIndex)}/>}</>;})()}
     {group.sections.map(section=><div role="group" aria-label={section.label||undefined} key={section.id}>{group.sections.length>1&&<span className="lv-drawing-section" aria-hidden="true">{section.label}</span>}
      {section.leaves.map(row=>{const position=index++,state=leafState(row,context),checked=leafIsActive(row,activeTool,activeMode,activeCursor),type=row.target.kind==='tool'?row.target.type:null,favorite=!!type&&favoriteTypes.includes(type),star=type?favoriteControl('star:'+type,position):null,shortcut=leafShortcut(row);
       return <div className={'lv-drawing-item'+(state.state==='unavailable'?' unavailable':'')} role="none" key={row.id}>
        <button type="button" role="menuitemradio" aria-checked={checked} aria-disabled={state.state==='unavailable'||undefined} tabIndex={focus===position&&!onStar?0:-1} ref={node=>{items.current[position]=node;}} data-requirement={row.id} aria-keyshortcuts={shortcut?shortcut.replace(/ \+ /g,'+'):undefined} title={state.state==='unavailable'?state.reason:row.note} onFocus={()=>{setFocus(position);setOnStar(false);}} onClick={()=>choose(row,group,alternativeIndex)}><i className="lv-drawing-item-icon" aria-hidden="true">{drawingIcon([row.iconId])}</i><span>{row.label}</span>{shortcut&&<span className="lv-drawing-hotkey" aria-hidden="true">{shortcut}</span>}{state.state==='unavailable'&&<small>Unavailable</small>}</button>
        {onFavoritesChange&&type&&state.state==='available'&&<button type="button" role="menuitemcheckbox" className="lv-drawing-star" tabIndex={focus===position&&onStar?0:-1} ref={star!.ref} aria-checked={favorite} aria-label={'Favorite: '+row.label} title={(favorite?'Remove from':'Add to')+' favorites (Right arrow from the tool)'} onFocus={()=>{setFocus(position);setOnStar(true);}} onClick={event=>toggleSavedFavorite(type,star!.binding(),event)}>{favorite?'★':'☆'}</button>}
       </div>;})}
     </div>)}
     {notice&&<div className="lv-drawing-notice" role="none"><div role="status">{notice.label} is unavailable. {notice.reason}</div>{notice.alternative&&<button type="button" role="menuitem" tabIndex={focus===alternativeIndex?0:-1} ref={node=>{items.current[alternativeIndex]=node;}} onFocus={()=>{setFocus(alternativeIndex);setOnStar(false);}} onClick={()=>chooseAlternative(notice.alternative!)}>Use {toolLabel(groups,notice.alternative)??notice.alternative}</button>}</div>}
    </div>}
   </div>;
  })}
  {onMode&&leafState(MEASURE_LEAF,context).state==='available'&&<button type="button" className={activeMode==='measure'?'active':''} aria-pressed={activeMode==='measure'} disabled={disabled} title={MEASURE_LEAF.label+' ('+MEASURE_LEAF.hint+')'} aria-label={MEASURE_LEAF.label} onClick={()=>onMode(activeMode==='measure'?null:'measure')}>⇲</button>}
  <button type="button" aria-label="All drawing tools" title="All drawing tools" onClick={onOpenAll} disabled={disabled}>⋯</button>
  {savedFavorites.length>0&&<div className="lv-drawing-favorites" role="toolbar" aria-label="Favorite drawing tools" aria-orientation="vertical">{savedFavorites.map((type,position)=>{const label=favoriteLabel(groups,type),usable=favoriteTypes.includes(type),active=usable&&activeTool===type&&!activeMode,control=favoriteControl('strip:'+type);return <button type="button" key={type} className={(active?'active':'')+(usable?'':' unavailable')} aria-pressed={active} aria-disabled={usable?undefined:true} title={usable?label:label+' is not available in this build. Right-click or press Delete to remove this favorite.'} aria-label={'Favorite tool: '+label} disabled={disabled} ref={control.ref} onClick={event=>{if(usable)useFavorite(type,control.binding(),event);}} onContextMenu={event=>removeSavedFavorite(type,control.binding(),event)} onKeyDown={event=>{if(event.key==='Delete'||event.key==='Backspace')removeSavedFavorite(type,control.binding(),event);}}>{glyphs[position]}</button>;})}</div>}
 </div>;
}
