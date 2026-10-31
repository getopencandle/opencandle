import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {classifyWorkspaceKey,handleWorkspaceKey,type FocusContext,type WorkspaceKeyEvent} from '../../src/ui/shortcut-dispatch';
import {keyboardShortcutRows} from '../../src/ui/keyboard-shortcuts';
import {isBodyFocus} from '../../src/ui/MultiChartGrid';

// Alt+Shift+Left, Alt+Shift+E, Shift+Alt+B / S, Shift+D, and Tab from the page body.
const CTX:FocusContext={editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:true,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false};
const key=(value:string,mods:Partial<WorkspaceKeyEvent>={}):WorkspaceKeyEvent=>({key:value,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...mods});
const BLOCKED:Partial<FocusContext>[]=[{editable:true},{composing:true},{dialogOpen:true},{menuOpen:true},{dropdownOpen:true}];
const AS={altKey:true,shiftKey:true};
const CASES:[WorkspaceKeyEvent,string][]=[
 [key('ArrowLeft',AS),'first-bar'],[key('E',{...AS,code:'KeyE'}),'switch-session'],[key('B',{...AS,code:'KeyB'}),'limit-buy-at-cursor'],[key('S',{...AS,code:'KeyS'}),'limit-sell-at-cursor'],[key('D',{shiftKey:true}),'toggle-dom'],
];
describe('KEYS2-1028 classifier',()=>{
 it('maps each chord to its action',()=>{for(const [event,action] of CASES)expect(classifyWorkspaceKey(event,CTX),action).toEqual({command:'extra-key',action});});
 it('never fires while typing, in dialogs, menus or dropdowns',()=>{for(const blocked of BLOCKED)for(const [event] of CASES)expect(classifyWorkspaceKey(event,{...CTX,...blocked}).command).toBe('none');});
 it('needs a loaded chart, and first bar needs chart focus; held keys do not repeat',()=>{
  for(const [event] of CASES)expect(classifyWorkspaceKey(event,{...CTX,loaded:false}).command).toBe('none');
  expect(classifyWorkspaceKey(CASES[0][0],{...CTX,chartFocus:false}).command).toBe('none');
  for(const [event] of CASES)expect(classifyWorkspaceKey({...event,repeat:true},CTX).command).toBe('none');
 });
 it('does not take neighbouring chords (Alt+Shift+Right, Alt+Shift+R, Ctrl+Alt+Shift+B, Alt+B, Shift+B)',()=>{
  expect(classifyWorkspaceKey(key('ArrowRight',AS),CTX).command).toBe('none');
  expect(classifyWorkspaceKey(key('R',AS),CTX).command).toBe('none');
  expect(classifyWorkspaceKey(key('B',{...AS,ctrlKey:true}),CTX).command).toBe('none');
  expect(classifyWorkspaceKey(key('b',{altKey:true}),CTX).command).toBe('none');
  expect(classifyWorkspaceKey(key('B',{shiftKey:true}),CTX)).toEqual({command:'paper-preset',side:'buy'});
 });
 it('handleWorkspaceKey hands the action to the handler and takes the keystroke',()=>{
  const extraKey=vi.fn(),event={...CASES[2][0],preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};
  expect(handleWorkspaceKey(event,CTX,{save(){},undo(){},redo(){},openLayouts(){},intervalEntry(){},fullscreen(){},indicators(){},disarmTool(){},clearSelection(){},extraKey})).toBe('handled');
  expect(extraKey).toHaveBeenCalledWith('limit-buy-at-cursor');expect(event.preventDefault).toHaveBeenCalled();
 });
});
describe('KEYS2-1028 shortcuts dialog and sources',()=>{
 const rows=keyboardShortcutRows(),find=(action:string)=>rows.find(row=>row.action===action);
 it('lists each chord that works',()=>{
  expect(find('Go to the first bar')?.keys).toEqual(['Alt+Shift+Left','Home']);
  expect(find('Switch extended and regular trading hours')?.keys).toEqual(['Alt+Shift+E']);
  expect(find('Open or close the DOM')?.keys).toEqual(['Shift+D']);
  expect(find('Limit buy at the pointer price')?.keys).toEqual(['Alt+Shift+B']);
  expect(find('Limit sell at the pointer price')?.keys).toEqual(['Alt+Shift+S']);
  expect(find('Open the watchlist chooser')?.keys).toEqual(['Shift+W']);
 });
 it('skipped chords stay out of the list',()=>{const all=rows.flatMap(row=>row.keys);for(const skipped of ['Alt+Z','Ctrl+Alt+W'])expect(all).not.toContain(skipped);});
 it('the App and chart panel carry the handlers the chords need',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8'),panel=readFileSync('src/ui/ChartPanel.tsx','utf8');
  expect(app).toContain("routed.command==='extra-key'");expect(app).toContain("new CustomEvent('lv:cursor-order'");expect(panel).toContain("'lv:cursor-order'");
 });
});
describe('KEYS2-1028 Tab from the page body',()=>{
 it('counts only an unfocused page as body focus',()=>{
  const doc={body:{},documentElement:{}};
  expect(isBodyFocus(null,doc as never)).toBe(true);expect(isBodyFocus(doc.body as never,doc as never)).toBe(true);expect(isBodyFocus(doc.documentElement as never,doc as never)).toBe(true);
  expect(isBodyFocus({} as never,doc as never)).toBe(false);
 });
 it('the grid listens on the window and yields to dialogs, menus and handled keys',()=>{
  const grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
  expect(grid).toContain("window.addEventListener('keydown',run)");expect(grid).toContain('event.defaultPrevented||!isChartCycleKey(event)');expect(grid).toContain("[role=dialog],[role=alertdialog],[aria-modal=\"true\"]");
 });
});
