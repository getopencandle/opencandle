// WSX shortcut dispatch. One pure classifier returns exactly one workspace command, or none, for a keystroke.
// Exactly one dispatcher handles a keystroke: when the classifier returns a command, the App listener calls
// preventDefault and stopImmediatePropagation and no other handler acts. Alt + I/P/L/R (price scale) and
// Ctrl + Alt + Q (reset time scale) are classified here too, so they work wherever focus is outside text and dialogs; the
// price scale port's own listener skips an event this one already took (defaultPrevented). Shift+C stays unbound (no cached fact says what it does); PAPERX adds Shift+B
// and Shift+S through root, in the shift branch below.

import {priceScaleHotkey,type PriceScaleHotkeyAction} from '../chart/price-scale-menu';

export interface WorkspaceKeyEvent {key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;isComposing?:boolean;repeat?:boolean;code?:string}
/** What the keystroke landed on. `chartFocus` is true for the chart and for the page body (no control focused). */
export interface FocusContext {
 editable:boolean;composing:boolean;dialogOpen:boolean;menuOpen:boolean;dropdownOpen:boolean;
 chartFocus:boolean;loaded:boolean;placementActive:boolean;toolArmed:boolean;selectedDrawings:number;hasSelection:boolean;
}
export type WorkspaceCommand=
 |{command:'none'}
 |{command:'save'}|{command:'undo'}|{command:'redo'}|{command:'open-layouts'}
 |{command:'interval-entry';initial:string}
 |{command:'fullscreen'}|{command:'indicators'}
 |{command:'cancel-placement'}|{command:'return-to-cursor'}|{command:'clear-selection'}
 |{command:'delete-drawing'}
 |{command:'paper-preset';side:'buy'|'sell'}
 // Alt+G Go to date, Alt+W add the chart symbol to the watchlist; gap 5: Space / Shift+Space step the watchlist.
 |{command:'go-to-date'}|{command:'add-to-watchlist'}|{command:'next-symbol'}|{command:'previous-symbol'}
 // Alt+I/P/L/R run the price scale action wherever focus is; Ctrl+Alt+Q resets the time scale.
 |{command:'price-scale';action:PriceScaleHotkeyAction}|{command:'reset-time-scale'}
 // Ctrl+/ opens the Keyboard shortcuts reference (our own key; it was unbound).
 |{command:'shortcuts'}
 // Ctrl+K opens Quick search (symbol search keeps typing on the chart).
 // Alt+S copies the chart image and Ctrl+Alt+S saves it. OpenCandle never uploads a snapshot,
 // so both stay on this computer. The chords are our own choice.
 |{command:'quick-search'}|{command:'snapshot';mode:'copy'|'save'}
 // Ctrl+Up / Ctrl+Down zoom and Ctrl+Left / Ctrl+Right scroll further ("Zoom in", "Zoom out",
 // "Move further left/right"). The step sizes are the navigation buttons'.
 |{command:'navigate';action:KeyNavigation}
 // Alt+D opens the Data window and Shift+T the trading panel ("Open data window", "Open/close
 // Order Panel"); App runs the same registry command its menu and Quick search run.
 |{command:'app-command';id:KeyAppCommand}
 // Alt+Shift+Left first bar, Alt+Shift+E session switch (ETH/RTH), Shift+D DOM toggle, Shift+Alt+B / Shift+Alt+S
 // limit buy / sell at the pointer price (paper trading; one-click places it, otherwise the ticket opens at that price).
 |{command:'extra-key';action:ExtraKeyAction};
export type ExtraKeyAction='first-bar'|'switch-session'|'toggle-dom'|'limit-buy-at-cursor'|'limit-sell-at-cursor';
export type KeyNavigation='zoom-in'|'zoom-out'|'scroll-left'|'scroll-right';
export type KeyAppCommand='data-window'|'paper-trading';
/** The zoom factor and pan fraction of one navigation key press: the chart navigation buttons' steps (ChartNavigationButtons). */
export const KEY_ZOOM_FACTOR=1.25,KEY_PAN_FRACTION=0.1;
/** Runs a navigation key on the active chart; false when there is no chart or it refused. */
export function runKeyNavigation(target:{zoom(factor:number):void;pan(fraction:number):void}|null|undefined,action:KeyNavigation):boolean{
 if(!target)return false;
 try{if(action==='zoom-in')target.zoom(KEY_ZOOM_FACTOR);else if(action==='zoom-out')target.zoom(1/KEY_ZOOM_FACTOR);else target.pan(action==='scroll-left'?-KEY_PAN_FRACTION:KEY_PAN_FRACTION);return true;}catch{return false;}
}
const ARROW_NAVIGATION:Record<string,KeyNavigation>={ArrowUp:'zoom-in',ArrowDown:'zoom-out',ArrowLeft:'scroll-left',ArrowRight:'scroll-right'};
const NONE:WorkspaceCommand={command:'none'};
const plain=(event:WorkspaceKeyEvent)=>!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey;

export function classifyWorkspaceKey(event:WorkspaceKeyEvent,ctx:FocusContext):WorkspaceCommand{
 // Text input, IME, dialog, menu and dropdown focus keep every key for themselves (FOCUS_DISPATCH).
 if(ctx.editable||ctx.composing||event.isComposing||ctx.dialogOpen||ctx.menuOpen||ctx.dropdownOpen)return NONE;
 const key=typeof event.key==='string'?event.key:'';
 const primary=event.ctrlKey||event.metaKey;
 // Today's rules, unchanged: Ctrl/Cmd+S, Ctrl/Cmd+Z (Shift redoes), Ctrl/Cmd+Y, and the dot for the layout library.
 if(primary&&event.altKey&&!event.shiftKey&&!event.repeat&&(event.code==='KeyQ'||key.toLowerCase()==='q'))return ctx.loaded?{command:'reset-time-scale'}:NONE;
 if(primary&&event.altKey&&!event.shiftKey&&!event.repeat&&(event.code==='KeyS'||key.toLowerCase()==='s'))return ctx.loaded?{command:'snapshot',mode:'save'}:NONE;
 if(primary&&!event.altKey&&!event.shiftKey&&!event.repeat&&key.toLowerCase()==='k')return ctx.loaded?{command:'quick-search'}:NONE;
 // Ctrl+Shift+S copies the chart image ("Copy chart image"); it used to save the layout as Ctrl+S does.
 if(primary&&event.shiftKey&&!event.altKey&&key.toLowerCase()==='s')return ctx.loaded&&!event.repeat?{command:'snapshot',mode:'copy'}:NONE;
 if(primary&&key.toLowerCase()==='s')return{command:'save'};
 if(primary&&key.toLowerCase()==='z')return{command:event.shiftKey?'redo':'undo'};
 if(primary&&key.toLowerCase()==='y')return{command:'redo'};
 if(key==='.'&&!event.ctrlKey&&!event.metaKey&&!event.altKey)return{command:'open-layouts'};
 // Held arrows repeat (one continuous zoom or scroll), so repeat is allowed. Chart focus only: lists and buttons keep their arrows.
 if(primary&&!event.altKey&&!event.shiftKey&&ARROW_NAVIGATION[key])return ctx.chartFocus&&ctx.loaded?{command:'navigate',action:ARROW_NAVIGATION[key]!}:NONE;
 if(event.altKey&&!primary&&!event.shiftKey&&!event.repeat){const letter=key.toLowerCase();if(letter==='d')return ctx.loaded?{command:'app-command',id:'data-window'}:NONE;if(letter==='g')return ctx.loaded?{command:'go-to-date'}:NONE;if(letter==='w')return ctx.loaded?{command:'add-to-watchlist'}:NONE;if(letter==='s')return ctx.loaded?{command:'snapshot',mode:'copy'}:NONE;const action=priceScaleHotkey(event);if(action)return ctx.loaded?{command:'price-scale',action}:NONE;}
 if(primary&&!event.altKey&&!event.shiftKey&&key==='/')return{command:'shortcuts'};
 // Alt+Shift chords. Letters match by code too, so a layout that changes the character still hits the chord.
 if(event.altKey&&event.shiftKey&&!primary&&!event.repeat){
  const letter=key.toLowerCase(),code=event.code;
  if(key==='ArrowLeft')return ctx.chartFocus&&ctx.loaded?{command:'extra-key',action:'first-bar'}:NONE;
  if(letter==='e'||code==='KeyE')return ctx.loaded?{command:'extra-key',action:'switch-session'}:NONE;
  if(letter==='b'||code==='KeyB')return ctx.loaded?{command:'extra-key',action:'limit-buy-at-cursor'}:NONE;
  if(letter==='s'||code==='KeyS')return ctx.loaded?{command:'extra-key',action:'limit-sell-at-cursor'}:NONE;
  return NONE;
 }
 if(event.altKey||primary)return NONE;
 if(event.repeat)return NONE;
 // Space steps the watchlist only from the chart (or the page body), so a focused button keeps its own Space.
 if(key===' ')return ctx.chartFocus&&ctx.loaded?{command:event.shiftKey?'previous-symbol':'next-symbol'}:NONE;
 // Shift presets: Shift+F, Shift+B and Shift+S (the App decides place, ticket or hint).
 // Shift+B/S no longer need chart focus. The shortcut rules (Shift+B/S are kept separate from
 // editor, input and IME focus) protect only text, editor and IME focus, which returned NONE above with
 // dialogs, menus and dropdowns.
 if(event.shiftKey){const k=key.toLowerCase();if(k==='f')return{command:'fullscreen'};if(k==='t')return ctx.loaded?{command:'app-command',id:'paper-trading'}:NONE;if(k==='d')return ctx.loaded?{command:'extra-key',action:'toggle-dom'}:NONE;if(k==='b'||k==='s')return{command:'paper-preset',side:k==='b'?'buy':'sell'};return NONE;}
 if(!plain(event))return NONE;
 if(key==='/')return ctx.loaded?{command:'indicators'}:NONE;
 // Interval typing: a digit opens the entry prefilled with it, a comma opens it empty (symbolEntryFromKey still returns null for both).
 // This capture-phase route takes "0" too, so the renderer's own "0" (reset the
 // view, vela KeyboardController) never runs; Alt+R resets the chart view.
 if(/^[0-9]$/.test(key)||key===',')return ctx.loaded?{command:'interval-entry',initial:key===','?'':key}:NONE;
 if(key==='Escape'){
  // Menus, dropdowns and dialogs close one level through their own handlers (returned none above). With chart focus
  // and nothing open: a placement in progress cancels, else an armed tool returns to the last cursor, else the selection clears.
  if(!ctx.chartFocus)return NONE;
  if(ctx.placementActive)return{command:'cancel-placement'};
  if(ctx.toolArmed)return{command:'return-to-cursor'};
  if(ctx.hasSelection||ctx.selectedDrawings>0)return{command:'clear-selection'};
  return NONE;
 }
 if((key==='Delete'||key==='Backspace')&&ctx.chartFocus&&ctx.selectedDrawings>0)return{command:'delete-drawing'};
 return NONE;
}

export interface KeyChain {
 /** True when the held-key gate consumed the keystroke. */
 heldGate:(event:WorkspaceKeyEvent)=>boolean;
 /** A replay shortcut name, or null. */
 replayKey:(event:WorkspaceKeyEvent)=>string|null;
 /** symbolEntryFromKey's result; `blocked` is the caller's own guard. */
 symbolEntry:(event:WorkspaceKeyEvent,blocked:boolean)=>{initialQuery:string;origin:'typed'|'shortcut'}|null;
}
export interface KeyDispatch {handler:'held'|'blocked'|'replay'|'symbol'|'workspace'|'none';command?:WorkspaceCommand['command'];initial?:string;symbol?:{initialQuery:string;origin:'typed'|'shortcut'};replay?:string}
/** The listener order, extracted so it can be tested: held-key gate, the editable/IME/dialog/menu return, replayShortcut,
 * symbolEntryFromKey, then classifyWorkspaceKey. Exactly one handler is named. */
export function dispatchWorkspaceKey(event:WorkspaceKeyEvent,ctx:FocusContext,chain:KeyChain):KeyDispatch{
 if(chain.heldGate(event))return{handler:'held'};
 if(ctx.editable||ctx.composing||event.isComposing||ctx.dialogOpen||ctx.menuOpen||ctx.dropdownOpen)return{handler:'blocked'};
 const replay=chain.replayKey(event);if(replay)return{handler:'replay',replay};
 const symbol=chain.symbolEntry(event,!ctx.loaded);if(symbol)return{handler:'symbol',symbol};
 const result=classifyWorkspaceKey(event,ctx);
 if(result.command==='none')return{handler:'none'};
 return{handler:'workspace',command:result.command,...(result.command==='interval-entry'?{initial:result.initial}:{})};
}

/** What the App must read at the moment of the keystroke. The capture listener is subscribed with a short
 * dependency list, so selection and armed-tool state come through a getter backed by a ref that is updated on every render,
 * never through values captured when the listener was subscribed. */
export interface LiveKeyState {loaded:boolean;selectedDrawing:string|null;activeTool:string|null;placementActive:boolean}
export interface KeyTarget {closest?:(selector:string)=>unknown}
export interface KeyDom {querySelector:(selector:string)=>unknown}
export function focusContextFor(event:{target:KeyTarget|null;isComposing?:boolean},read:()=>LiveKeyState,dom:KeyDom,dialogOpenState:boolean):FocusContext{
 const state=read(),target=event.target;
 const bodyLike=!target||(target as {tagName?:string}).tagName==='BODY';
 return{
  editable:!!target?.closest?.('input,textarea,select,[contenteditable="true"]'),
  composing:!!event.isComposing,
  dialogOpen:dialogOpenState||!!dom.querySelector('[role=dialog],[role=alertdialog]'),
  menuOpen:!!target?.closest?.('[role=menu]'),
  dropdownOpen:!!dom.querySelector('[aria-haspopup=menu][aria-expanded=true]'),
  chartFocus:bodyLike||!!target?.closest?.('.chart-workspace'),
  loaded:state.loaded,placementActive:state.placementActive,toolArmed:state.activeTool!==null,
  selectedDrawings:state.selectedDrawing?1:0,hasSelection:state.selectedDrawing!==null,
 };
}
export interface WorkspaceKeyHandlers {
 save():void;undo():void;redo():void;openLayouts():void;intervalEntry(initial:string):void;fullscreen():void;indicators():void;
 goToDate?():void;addToWatchlist?():void;nextSymbol?():void;previousSymbol?():void;
 priceScale?(action:PriceScaleHotkeyAction):void;resetTimeScale?():void;shortcuts?():void;
 extraKey?(action:ExtraKeyAction):void;quickSearch?():void;snapshot?(mode:'copy'|'save'):void;navigate?(action:KeyNavigation):void;appCommand?(id:KeyAppCommand):void;
 /** Today's Escape behaviour: leave the armed tool. */
 disarmTool():void;clearSelection():void;
}
export type WorkspaceKeyEventLike=WorkspaceKeyEvent&{preventDefault():void;stopImmediatePropagation():void};
/** Runs the command the classifier chose. 'native' means the key is deliberately left to the chart (Delete and Backspace on a
 * selection: vela deletes the whole selection as one undo step), so nothing is prevented or stopped. 'none' lets the
 * caller continue with the Alt chords. Escape that the classifier did not take still disarms, as before. */
export function handleWorkspaceKey(event:WorkspaceKeyEventLike,ctx:FocusContext,h:WorkspaceKeyHandlers):'handled'|'native'|'none'{
 const routed=classifyWorkspaceKey(event,ctx);
 switch(routed.command){
  case 'save':event.preventDefault();h.save();return 'handled';
  case 'undo':event.preventDefault();event.stopImmediatePropagation();h.undo();return 'handled';
  case 'redo':event.preventDefault();event.stopImmediatePropagation();h.redo();return 'handled';
  case 'open-layouts':event.preventDefault();h.openLayouts();return 'handled';
  case 'interval-entry':event.preventDefault();event.stopImmediatePropagation();h.intervalEntry(routed.initial);return 'handled';
  case 'fullscreen':event.preventDefault();h.fullscreen();return 'handled';
  case 'indicators':event.preventDefault();h.indicators();return 'handled';
  case 'cancel-placement':case 'return-to-cursor':h.disarmTool();return 'handled';
  case 'clear-selection':h.clearSelection();return 'handled';
  case 'delete-drawing':return 'native';
  case 'paper-preset':return 'none'; // the App listener runs the paper shortcut itself (classifyPaperShortcut)
  case 'go-to-date':case 'add-to-watchlist':case 'next-symbol':case 'previous-symbol':{const run=routed.command==='go-to-date'?h.goToDate:routed.command==='add-to-watchlist'?h.addToWatchlist:routed.command==='next-symbol'?h.nextSymbol:h.previousSymbol;if(!run)return 'none';event.preventDefault();event.stopImmediatePropagation();run.call(h);return 'handled';}
  case 'price-scale':{if(!h.priceScale)return 'none';event.preventDefault();event.stopImmediatePropagation();h.priceScale(routed.action);return 'handled';}
  case 'shortcuts':{if(!h.shortcuts)return 'none';event.preventDefault();event.stopImmediatePropagation();h.shortcuts();return 'handled';}
  case 'quick-search':{if(!h.quickSearch)return 'none';event.preventDefault();event.stopImmediatePropagation();h.quickSearch();return 'handled';}
  case 'snapshot':{if(!h.snapshot)return 'none';event.preventDefault();event.stopImmediatePropagation();h.snapshot(routed.mode);return 'handled';}
  case 'navigate':{if(!h.navigate)return 'none';event.preventDefault();event.stopImmediatePropagation();h.navigate(routed.action);return 'handled';}
  case 'app-command':{if(!h.appCommand)return 'none';event.preventDefault();event.stopImmediatePropagation();h.appCommand(routed.id);return 'handled';}
  case 'extra-key':{if(!h.extraKey)return 'none';event.preventDefault();event.stopImmediatePropagation();h.extraKey(routed.action);return 'handled';}
  case 'reset-time-scale':{if(!h.resetTimeScale)return 'none';event.preventDefault();event.stopImmediatePropagation();h.resetTimeScale();return 'handled';}
  case 'none':if(event.key==='Escape'){h.disarmTool();return 'handled';}return 'none';
 }
}

/** The script editor's own chords. Ctrl/Cmd+S saves the script (not the layout), Ctrl/Cmd+Enter
 * runs it, Ctrl/Cmd+Shift+P opens its command palette and Alt+Z toggles word wrap, whenever the keystroke lands inside the editor
 * panel (the CodeMirror text, its toolbar buttons such as Compile, its console) or lands on the page body while the editor panel was
 * the last thing clicked or focused (a button that lost focus hands the key to the body). The panel host carries
 * `data-lv-script-keys`; it adds `data-lv-script-keys-active` while it owns the keyboard. The App capture listener leaves such a key
 * alone and the panel runs it. */
export type ScriptEditorChord='save'|'run'|'palette'|'wrap';
export const SCRIPT_EDITOR_KEY_HOST='[data-lv-script-keys]';
export const SCRIPT_EDITOR_KEY_ACTIVE='[data-lv-script-keys][data-lv-script-keys-active]';
export function scriptEditorChord(event:WorkspaceKeyEvent):ScriptEditorChord|null{
 if(event.isComposing||typeof event.key!=='string')return null;
 const primary=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
 if(primary&&event.shiftKey&&!event.altKey&&key==='p')return 'palette';
 if(primary&&!event.shiftKey&&!event.altKey&&key==='s')return 'save';
 if(primary&&!event.altKey&&event.key==='Enter')return 'run';
 if(event.altKey&&!primary&&!event.shiftKey&&key==='z')return 'wrap';
 return null;
}
export function scriptEditorOwnsKey(event:WorkspaceKeyEvent,target:KeyTarget|null|undefined,dom:KeyDom|null|undefined):ScriptEditorChord|null{
 const chord=scriptEditorChord(event);if(!chord)return null;
 try{
  if(target?.closest?.(SCRIPT_EDITOR_KEY_HOST))return chord;
  const bodyLike=!target||(target as {tagName?:string}).tagName==='BODY'||(target as {tagName?:string}).tagName==='HTML';
  return bodyLike&&!!dom?.querySelector(SCRIPT_EDITOR_KEY_ACTIVE)?chord:null;
 }catch{return null;}
}
