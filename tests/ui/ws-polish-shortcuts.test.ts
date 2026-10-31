// Shift+B and Shift+S no longer need chart focus. The shortcut rules (Shift+B/S are kept
// separate from editor, input and IME focus, so focus and IME dispatch prevents accidental trading) protect text,
// editor and IME focus only, so the keys work from any focus that is not a text field, IME composition, dialog or open menu.
// Pure classifiers; not interface evidence.
import {describe,expect,it} from 'vitest';
import {classifyWorkspaceKey,dispatchWorkspaceKey,type FocusContext,type WorkspaceKeyEvent} from '../../src/ui/shortcut-dispatch';
import {classifyPaperShortcut,type PaperShortcutContext,type PaperShortcutEvent} from '../../src/ui/paper-shortcuts';

const key=(k:string,extra:Partial<WorkspaceKeyEvent>={}):WorkspaceKeyEvent=>({key:k,ctrlKey:false,metaKey:false,altKey:false,shiftKey:true,...extra});
const elsewhere:FocusContext={editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:false,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false};
const none={command:'none'};
const paperKey=(overrides:Partial<PaperShortcutEvent>={}):PaperShortcutEvent=>({key:'B',shiftKey:true,ctrlKey:false,altKey:false,metaKey:false,...overrides});
const away:PaperShortcutContext={chartFocused:false,dialogOpen:false,menuOpen:false,presetSelected:true,oneClick:true};
const target=(tagName:string,extra:Record<string,unknown>={})=>({tagName,isContentEditable:false,getAttribute:()=>null,...extra});

describe('Shift+B / Shift+S without chart focus (PARITY-GAPS-1022 part 3)',()=>{
 it('the workspace classifier routes Shift+B and Shift+S from a focus outside the chart',()=>{
  expect(classifyWorkspaceKey(key('B'),elsewhere)).toEqual({command:'paper-preset',side:'buy'});
  expect(classifyWorkspaceKey(key('s'),elsewhere)).toEqual({command:'paper-preset',side:'sell'});
  expect(classifyWorkspaceKey(key('B'),{...elsewhere,chartFocus:true})).toEqual({command:'paper-preset',side:'buy'});
 });
 it('text, IME, dialog, menu and dropdown focus still keep the keys',()=>{
  for(const ctx of [{...elsewhere,editable:true},{...elsewhere,composing:true},{...elsewhere,dialogOpen:true},{...elsewhere,menuOpen:true},{...elsewhere,dropdownOpen:true}])
   for(const letter of ['B','S'])expect(classifyWorkspaceKey(key(letter),ctx)).toEqual(none);
  expect(classifyWorkspaceKey(key('B',{isComposing:true}),elsewhere)).toEqual(none);
  expect(classifyWorkspaceKey(key('B',{repeat:true}),elsewhere)).toEqual(none);
  for(const mod of [{ctrlKey:true},{metaKey:true}])expect(classifyWorkspaceKey(key('B',mod),elsewhere)).toEqual(none);
  // Shift+Alt+B is bound to limit buy at the pointer (its own command, never the Shift+B paper preset).
  expect(classifyWorkspaceKey(key('B',{altKey:true}),elsewhere)).toEqual({command:'extra-key',action:'limit-buy-at-cursor'});
 });
 it('the dispatcher names the workspace handler for an off-chart Shift+B',()=>{
  const chain={heldGate:()=>false,replayKey:()=>null,symbolEntry:()=>null};
  expect(dispatchWorkspaceKey(key('B'),elsewhere,chain)).toEqual({handler:'workspace',command:'paper-preset'});
  expect(dispatchWorkspaceKey(key('B'),{...elsewhere,editable:true},chain).handler).toBe('blocked');
 });
 it('the paper classifier trades (or opens the ticket, or hints) without chart focus',()=>{
  expect(classifyPaperShortcut(paperKey(),away)).toEqual({kind:'place',side:'buy'});
  expect(classifyPaperShortcut(paperKey({key:'S'}),{...away,oneClick:false})).toEqual({kind:'open-ticket',side:'sell'});
  expect(classifyPaperShortcut(paperKey(),{...away,presetSelected:false}).kind).toBe('status');
  expect(classifyPaperShortcut(paperKey({target:target('BUTTON')}),away)).toEqual({kind:'place',side:'buy'});
 });
 it('the paper classifier still ignores text fields, IME, dialogs and open menus off the chart',()=>{
  for(const element of [target('INPUT'),target('TEXTAREA'),target('SELECT'),target('DIV',{isContentEditable:true}),target('DIV',{getAttribute:(name:string)=>name==='role'?'textbox':null})])
   expect(classifyPaperShortcut(paperKey({target:element}),away)).toEqual({kind:'ignore'});
  expect(classifyPaperShortcut(paperKey({isComposing:true}),away)).toEqual({kind:'ignore'});
  expect(classifyPaperShortcut(paperKey(),{...away,dialogOpen:true})).toEqual({kind:'ignore'});
  expect(classifyPaperShortcut(paperKey(),{...away,menuOpen:true})).toEqual({kind:'ignore'});
 });
});
