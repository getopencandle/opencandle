import {afterEach,describe,expect,it,vi} from 'vitest';
import {watchTypeToAddKey,watchTypeToAddSeed} from '../../src/ui/symbol-search';
import {scriptEditorChord,scriptEditorOwnsKey} from '../../src/ui/shortcut-dispatch';
import {clearScriptRuntimeError,resetScriptRuntimeErrors,scriptRuntimeError,scriptRuntimeErrorText,setScriptRuntimeError,subscribeScriptRuntimeErrors} from '../../src/ui/script-runtime-errors';

// Pure helpers only; no real data.
const key=(value:string,extra:Record<string,unknown>={})=>({key:value,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra});
/** A target whose closest() answers for the selectors in `inside` (any selector list containing one of them matches). */
const target=(inside:string[],tagName='TR')=>({tagName,closest:(selector:string)=>inside.some(part=>selector.split(',').map(s=>s.trim()).includes(part))?{}:null});

describe('watchlist type-to-add route', ()=>{
 it('takes letters and digits, shifted or not, and refuses modifiers and other keys', ()=>{
  expect(watchTypeToAddKey(key('a'))).toBe('A');
  expect(watchTypeToAddKey(key('A',{shiftKey:true}))).toBe('A');
  expect(watchTypeToAddKey(key('7'))).toBe('7');
  for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true}])expect(watchTypeToAddKey(key('a',extra))).toBeNull();
  for(const value of [' ','.','Enter','ArrowDown','Escape','/'])expect(watchTypeToAddKey(key(value))).toBeNull();
 });
 it('only inside the marked watchlist host, never on its buttons, fields, dialogs or menus', ()=>{
  expect(watchTypeToAddSeed(key('m'),target(['[data-lv-type-to-add]']))).toBe('M');
  expect(watchTypeToAddSeed(key('m'),target([]))).toBeNull();
  expect(watchTypeToAddSeed(key('m'),null)).toBeNull();
  for(const inner of ['button','input','[role=dialog]','[role=menu]'])expect(watchTypeToAddSeed(key('m'),target(['[data-lv-type-to-add]',inner]))).toBeNull();
  expect(watchTypeToAddSeed(key('m'),{closest:()=>{throw new Error('detached');}})).toBeNull();
 });
});

describe('script editor chords', ()=>{
 it('classifies Ctrl+S, Ctrl+Enter, Ctrl+Shift+P and Alt+Z only', ()=>{
  expect(scriptEditorChord(key('s',{ctrlKey:true}))).toBe('save');
  expect(scriptEditorChord(key('S',{metaKey:true}))).toBe('save');
  expect(scriptEditorChord(key('Enter',{ctrlKey:true}))).toBe('run');
  expect(scriptEditorChord(key('P',{ctrlKey:true,shiftKey:true}))).toBe('palette');
  expect(scriptEditorChord(key('z',{altKey:true}))).toBe('wrap');
  // Ctrl+Shift+S stays the chart image copy; Ctrl+Alt+S the image save; Ctrl+Z the chart undo.
  for(const event of [key('s',{ctrlKey:true,shiftKey:true}),key('s',{ctrlKey:true,altKey:true}),key('z',{ctrlKey:true}),key('s'),key('s',{ctrlKey:true,isComposing:true})])expect(scriptEditorChord(event)).toBeNull();
 });
 it('owns the chord inside the editor panel, on the body while the panel is active, and nowhere else', ()=>{
  const save=key('s',{ctrlKey:true}),idle={querySelector:()=>null},active={querySelector:(selector:string)=>selector.includes('data-lv-script-keys-active')?{}:null};
  // After clicking Compile the key lands on that button inside the panel.
  expect(scriptEditorOwnsKey(save,target(['[data-lv-script-keys]'],'BUTTON'),idle)).toBe('save');
  // A button that lost focus hands the key to the body; the panel was the last thing clicked.
  expect(scriptEditorOwnsKey(save,({tagName:'BODY',closest:()=>null} as never),active)).toBe('save');
  expect(scriptEditorOwnsKey(save,null,active)).toBe('save');
  // The chart or the body after clicking elsewhere: the layout save keeps Ctrl+S.
  expect(scriptEditorOwnsKey(save,({tagName:'BODY',closest:()=>null} as never),idle)).toBeNull();
  expect(scriptEditorOwnsKey(save,target(['.chart-workspace'],'CANVAS'),active)).toBeNull();
  expect(scriptEditorOwnsKey(key('a'),target(['[data-lv-script-keys]']),idle)).toBeNull();
 });
});

describe('script run-time error store', ()=>{
 afterEach(()=>resetScriptRuntimeErrors());
 it('drops the worker code prefix and keeps plain text', ()=>{
  expect(scriptRuntimeErrorText(new Error('SCRIPT_FAILED: Invalid SMA parameters.'))).toBe('Invalid SMA parameters.');
  expect(scriptRuntimeErrorText('boom\u0007 here')).toBe('boom here');
  expect(scriptRuntimeErrorText(new Error(''))).toBe('The script failed while running.');
 });
 it('records, notifies and clears per binding', ()=>{
  const listener=vi.fn(),off=subscribeScriptRuntimeErrors(listener);
  setScriptRuntimeError('b1','Invalid SMA parameters.');setScriptRuntimeError('b1','Invalid SMA parameters.');
  expect(listener).toHaveBeenCalledTimes(1);expect(scriptRuntimeError('b1')).toBe('Invalid SMA parameters.');expect(scriptRuntimeError('b2')).toBeNull();
  clearScriptRuntimeError('b1');clearScriptRuntimeError('b1');
  expect(listener).toHaveBeenCalledTimes(2);expect(scriptRuntimeError('b1')).toBeNull();off();
 });
});
