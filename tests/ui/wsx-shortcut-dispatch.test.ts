import {describe,expect,it} from 'vitest';
import {classifyWorkspaceKey,dispatchWorkspaceKey,type FocusContext,type WorkspaceKeyEvent} from '../../src/ui/shortcut-dispatch';
import {symbolEntryFromKey} from '../../src/ui/symbol-search';
import {replayShortcut} from '../../src/domain/replay-session';
import {parseIntervalEntry,submitIntervalEntry} from '../../src/domain/intervals';
const key=(k:string,extra:Partial<WorkspaceKeyEvent>={}):WorkspaceKeyEvent=>({key:k,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra});
const chart:FocusContext={editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:true,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false};
const none={command:'none'};
const KEYS:[string,WorkspaceKeyEvent][]=[['digit',key('5')],['comma',key(',')],['letter',key('a')],['Shift+F',key('F',{shiftKey:true})],['slash',key('/')],['Ctrl+S',key('s',{ctrlKey:true})],['Ctrl+Z',key('z',{ctrlKey:true})],['Ctrl+Y',key('y',{ctrlKey:true})],['dot',key('.')],['Escape',key('Escape')],['Delete',key('Delete')],['Backspace',key('Backspace')]];
describe('WSX shortcut classifier',()=>{
 it('digits open interval entry prefilled with the digit and comma opens it empty',()=>{
  for(const digit of '0123456789')expect(classifyWorkspaceKey(key(digit),chart)).toEqual({command:'interval-entry',initial:digit});
  expect(classifyWorkspaceKey(key(','),chart)).toEqual({command:'interval-entry',initial:''});
  expect(classifyWorkspaceKey(key('5',{ctrlKey:true}),chart)).toEqual(none);
  expect(classifyWorkspaceKey(key('5',{altKey:true}),chart)).toEqual(none);
  expect(classifyWorkspaceKey(key('5',{repeat:true}),chart)).toEqual(none);
  expect(classifyWorkspaceKey(key('5'),{...chart,loaded:false})).toEqual(none);
 });
 it('symbolEntryFromKey is unchanged: digits, comma and Shift+letter still return null',()=>{
  expect(symbolEntryFromKey(key('1'),false)).toBeNull();expect(symbolEntryFromKey(key(','),false)).toBeNull();expect(symbolEntryFromKey(key('F',{shiftKey:true}),false)).toBeNull();
  expect(symbolEntryFromKey(key('a'),false)).toEqual({initialQuery:'A',origin:'typed'});
 });
 it('Shift+F toggles fullscreen; Shift+C stays unbound; Shift+B and Shift+S route to the paper preset from any non-text focus (PAPERX root diff, r17;)',()=>{
  expect(classifyWorkspaceKey(key('F',{shiftKey:true}),chart)).toEqual({command:'fullscreen'});
  expect(classifyWorkspaceKey(key('f',{shiftKey:true}),chart)).toEqual({command:'fullscreen'});
  expect(classifyWorkspaceKey(key('C',{shiftKey:true}),chart)).toEqual(none);
  expect(classifyWorkspaceKey(key('B',{shiftKey:true}),chart)).toEqual({command:'paper-preset',side:'buy'});
  expect(classifyWorkspaceKey(key('S',{shiftKey:true}),chart)).toEqual({command:'paper-preset',side:'sell'});
  // Chart focus is no longer required; text, IME, dialog, menu and dropdown focus still keep the keys.
  for(const letter of ['B','S'])expect(classifyWorkspaceKey(key(letter,{shiftKey:true}),{...chart,chartFocus:false})).toEqual({command:'paper-preset',side:letter==='B'?'buy':'sell'});
  for(const letter of ['B','S'])for(const blocked of [{editable:true},{composing:true},{dialogOpen:true},{menuOpen:true},{dropdownOpen:true}])expect(classifyWorkspaceKey(key(letter,{shiftKey:true}),{...chart,chartFocus:false,...blocked})).toEqual(none);
  expect(classifyWorkspaceKey(key('F',{shiftKey:true,ctrlKey:true}),chart)).toEqual(none);
  expect(classifyWorkspaceKey(key('F',{shiftKey:true,repeat:true}),chart)).toEqual(none);
 });
 it('slash opens the Indicators dialog only without modifiers',()=>{
  expect(classifyWorkspaceKey(key('/'),chart)).toEqual({command:'indicators'});
  /* Ctrl+/ (unbound before) now opens Keyboard shortcuts, still never Indicators. */expect(classifyWorkspaceKey(key('/',{ctrlKey:true}),chart)).toEqual({command:'shortcuts'});expect(classifyWorkspaceKey(key('?',{shiftKey:true}),chart)).toEqual(none);
 });
 it('keeps today\'s rules for Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z and the layouts dot',()=>{
  expect(classifyWorkspaceKey(key('s',{ctrlKey:true}),chart)).toEqual({command:'save'});expect(classifyWorkspaceKey(key('S',{metaKey:true}),chart)).toEqual({command:'save'});
  expect(classifyWorkspaceKey(key('z',{ctrlKey:true}),chart)).toEqual({command:'undo'});expect(classifyWorkspaceKey(key('Z',{ctrlKey:true,shiftKey:true}),chart)).toEqual({command:'redo'});
  expect(classifyWorkspaceKey(key('y',{ctrlKey:true}),chart)).toEqual({command:'redo'});expect(classifyWorkspaceKey(key('y',{metaKey:true}),chart)).toEqual({command:'redo'});
  expect(classifyWorkspaceKey(key('.'),chart)).toEqual({command:'open-layouts'});expect(classifyWorkspaceKey(key('.',{ctrlKey:true}),chart)).toEqual(none);
 });
 it('Alt + R is the price scale reset (lane D gap 12); Shift+Alt+R and the other Alt chords stay with their own handlers',()=>{
  expect(classifyWorkspaceKey(key('r',{altKey:true}),chart)).toEqual({command:'price-scale',action:'resetChart'});expect(classifyWorkspaceKey(key('R',{altKey:true,shiftKey:true}),chart)).toEqual(none);
  for(const letter of ['a','n','t','f','h','j','v','c'])expect(classifyWorkspaceKey(key(letter,{altKey:true}),chart)).toEqual(none);
 });
 it('every command returns none in an input, textarea, select, contenteditable, IME composition, open dialog, open menu and open dropdown',()=>{
  const blocked:Partial<FocusContext>[]=[{editable:true},{composing:true},{dialogOpen:true},{menuOpen:true},{dropdownOpen:true}];
  const events=[...KEYS.map(([,event])=>event),key('Z',{ctrlKey:true,shiftKey:true})];
  for(const patch of blocked)for(const event of events)expect(classifyWorkspaceKey(event,{...chart,...patch,placementActive:true,toolArmed:true,selectedDrawings:2,hasSelection:true})).toEqual(none);
  const event=key('5');event.isComposing=true;expect(classifyWorkspaceKey(event,chart)).toEqual(none);
 });
 it('Escape peels one level per press: placement, then an armed tool back to the last cursor, then the selection',()=>{
  const full={...chart,placementActive:true,toolArmed:true,selectedDrawings:1,hasSelection:true};
  const press=(ctx:FocusContext)=>classifyWorkspaceKey(key('Escape'),ctx).command;
  expect(press(full)).toBe('cancel-placement');
  expect(press({...full,placementActive:false})).toBe('return-to-cursor');
  expect(press({...full,placementActive:false,toolArmed:false})).toBe('clear-selection');
  expect(press({...full,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false})).toBe('none');
  expect(classifyWorkspaceKey(key('Escape',{shiftKey:true}),full)).toEqual(none);
  expect(classifyWorkspaceKey(key('Escape'),{...full,menuOpen:true})).toEqual(none);
  expect(classifyWorkspaceKey(key('Escape'),{...full,dialogOpen:true})).toEqual(none);
  expect(classifyWorkspaceKey(key('Escape'),{...full,dropdownOpen:true})).toEqual(none);
  expect(classifyWorkspaceKey(key('Escape'),{...full,editable:true})).toEqual(none);
 });
 it('Delete and Backspace remove a drawing selection from chart focus only',()=>{
  const selected={...chart,selectedDrawings:2,hasSelection:true};
  expect(classifyWorkspaceKey(key('Delete'),selected)).toEqual({command:'delete-drawing'});expect(classifyWorkspaceKey(key('Backspace'),selected)).toEqual({command:'delete-drawing'});
  expect(classifyWorkspaceKey(key('Delete'),chart)).toEqual(none);
  expect(classifyWorkspaceKey(key('Delete'),{...selected,chartFocus:false})).toEqual(none);
  expect(classifyWorkspaceKey(key('Delete'),{...selected,editable:true})).toEqual(none);
  expect(classifyWorkspaceKey(key('Delete',{ctrlKey:true}),selected)).toEqual(none);
 });
 it('exactly one command comes back for every key, and unrelated keys give none',()=>{
  for(const [,event] of KEYS)expect(Object.keys(classifyWorkspaceKey(event,{...chart,selectedDrawings:1,hasSelection:true}))).toEqual(expect.arrayContaining(['command']));
  expect(classifyWorkspaceKey(key('a'),chart)).toEqual(none);expect(classifyWorkspaceKey(key('Enter'),chart)).toEqual(none);expect(classifyWorkspaceKey(key('F1'),chart)).toEqual(none);
 });
});
describe('WSX listener order',()=>{
 const deps=(held=false)=>({heldGate:()=>held,replayKey:(event:WorkspaceKeyEvent)=>replayShortcut({key:event.key,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,altKey:event.altKey,metaKey:event.metaKey,isComposing:!!event.isComposing,focus:'chart'},null)!==null?'replay':null,symbolEntry:(event:WorkspaceKeyEvent,blocked:boolean)=>symbolEntryFromKey(event,blocked)});
 it('runs the held-key gate, the editable return, replayShortcut, symbolEntryFromKey and then the classifier, and one handler fires',()=>{
  expect(dispatchWorkspaceKey(key('a'),chart,deps(true)).handler).toBe('held');
  expect(dispatchWorkspaceKey(key('a'),{...chart,editable:true},deps()).handler).toBe('blocked');
  expect(dispatchWorkspaceKey(key('a'),{...chart,dialogOpen:true},deps()).handler).toBe('blocked');
  expect(dispatchWorkspaceKey(key('a'),chart,deps())).toMatchObject({handler:'symbol',symbol:{initialQuery:'A',origin:'typed'}});
  // Ctrl+K reaches the classifier as Quick search (the symbol entry no longer takes it).
  expect(dispatchWorkspaceKey(key('k',{ctrlKey:true}),chart,deps())).toMatchObject({handler:'workspace',command:'quick-search'});
  for(const [name,event,expected] of [['Ctrl+S',key('s',{ctrlKey:true}),'save'],['Ctrl+Z',key('z',{ctrlKey:true}),'undo'],['Ctrl+Y',key('y',{ctrlKey:true}),'redo'],['dot',key('.'),'open-layouts'],['digit',key('5'),'interval-entry'],['Shift+F',key('F',{shiftKey:true}),'fullscreen'],['slash',key('/'),'indicators']] as const){
   const result=dispatchWorkspaceKey(event,chart,deps());expect(result.handler,name).toBe('workspace');expect(result.command,name).toBe(expected);
  }
  expect(dispatchWorkspaceKey(key('r',{altKey:true}),chart,deps())).toMatchObject({handler:'workspace',command:'price-scale'});expect(dispatchWorkspaceKey(key('x',{altKey:true}),chart,deps()).handler).toBe('none');
  expect(dispatchWorkspaceKey(key('F',{shiftKey:true}),{...chart,editable:true},deps()).handler).toBe('blocked');
 });
 it('symbol entry is blocked while the app is not loaded, so the letter falls through to the classifier and gives none',()=>{
  const result=dispatchWorkspaceKey(key('a'),{...chart,loaded:false},deps());expect(result.handler).toBe('none');
 });
 it('Escape and Delete reach the workspace handler with chart focus',()=>{
  expect(dispatchWorkspaceKey(key('Escape'),{...chart,toolArmed:true},deps())).toMatchObject({handler:'workspace',command:'return-to-cursor'});
  expect(dispatchWorkspaceKey(key('Delete'),{...chart,selectedDrawings:1,hasSelection:true},deps())).toMatchObject({handler:'workspace',command:'delete-drawing'});
 });
});
describe('WSX interval entry',()=>{
 it('parses 5 as five minutes, 1D as a day, and returns the parser\'s own message for empty or bad text',()=>{
  expect(parseIntervalEntry('5')).toMatchObject({ok:true,interval:'5m'});
  expect(parseIntervalEntry(' 1D ')).toMatchObject({ok:true,interval:'1D'});
  expect(parseIntervalEntry('2.5h')).toMatchObject({ok:true,interval:'150m'});
  const empty=parseIntervalEntry('');expect(empty).toMatchObject({ok:false});if(!empty.ok)expect(empty.message).toContain('Enter a time interval');
  const bad=parseIntervalEntry('abc');expect(bad).toMatchObject({ok:false});if(!bad.ok)expect(bad.message).toBe('Unknown interval unit. Uppercase M means months; lowercase m means minutes.');
 });
 it('Enter applies exactly once through the supplied Apply handler; a refusal changes nothing and shows the handler\'s message',()=>{
  const calls:string[]=[];
  const ok=submitIntervalEntry('5',interval=>{calls.push(interval);return{ok:true};});
  expect(ok).toEqual({ok:true,interval:'5m',message:null});expect(calls).toEqual(['5m']);
  const live=submitIntervalEntry('3',interval=>{calls.push(interval);return{ok:false,message:'This interval is not available live.'};});
  expect(live).toEqual({ok:false,interval:null,message:'This interval is not available live.'});expect(calls).toEqual(['5m','3m']);
  const invalid=submitIntervalEntry('abc',interval=>{calls.push(interval);return{ok:true};});
  expect(invalid.ok).toBe(false);expect(invalid.interval).toBeNull();expect(calls).toHaveLength(2);
 });
});
// Listener-level tests: the routing the App listener uses, with state read live from a ref-like holder.
import {focusContextFor,handleWorkspaceKey,type LiveKeyState,type WorkspaceKeyHandlers} from '../../src/ui/shortcut-dispatch';
describe('WSX App listener routing',()=>{
 const body={tagName:'BODY',closest:()=>null};
 const dom={querySelector:()=>null};
 function setup(){
  const live:{current:LiveKeyState}={current:{loaded:true,selectedDrawing:null,activeTool:null,placementActive:false}};
  const calls:string[]=[];
  const handlers:WorkspaceKeyHandlers={save:()=>calls.push('save'),undo:()=>calls.push('undo'),redo:()=>calls.push('redo'),openLayouts:()=>calls.push('layouts'),intervalEntry:initial=>calls.push('interval:'+initial),fullscreen:()=>calls.push('fullscreen'),indicators:()=>calls.push('indicators'),disarmTool:()=>calls.push('disarm'),clearSelection:()=>calls.push('clear')};
  const press=(k:string,extra:Partial<WorkspaceKeyEvent>={})=>{
   const log:string[]=[];const event={...key(k,extra),preventDefault:()=>log.push('prevent'),stopImmediatePropagation:()=>log.push('stop')};
   // The listener subscribed once; the context is rebuilt from the live holder at the moment of the key.
   const result=handleWorkspaceKey(event,focusContextFor({target:body,isComposing:false},()=>live.current,dom,false),handlers);
   return{result,log};
  };
  return{live,calls,press};
 }
 it('Delete after the drawing was deselected does nothing; with a selection it is left to the chart (no prevent, no stop, no removal)',()=>{
  const {live,calls,press}=setup();
  live.current={...live.current,selectedDrawing:'d1'};
  expect(press('Delete')).toEqual({result:'native',log:[]});
  live.current={...live.current,selectedDrawing:null};
  expect(press('Delete')).toEqual({result:'none',log:[]});expect(press('Backspace')).toEqual({result:'none',log:[]});
  expect(calls).toEqual([]);
 });
 it('Escape after deselect disarms the armed tool; with a selection and no tool it clears the selection; stale selection never hides the disarm',()=>{
  const {live,calls,press}=setup();
  live.current={...live.current,selectedDrawing:'d1',activeTool:null};
  expect(press('Escape').result).toBe('handled');expect(calls).toEqual(['clear']);
  calls.length=0;live.current={...live.current,selectedDrawing:null,activeTool:'trendline'};
  expect(press('Escape').result).toBe('handled');expect(calls).toEqual(['disarm']);
  calls.length=0;live.current={...live.current,selectedDrawing:null,activeTool:null};
  expect(press('Escape').result).toBe('handled');expect(calls).toEqual(['disarm']);
 });
 it('every other command reaches its handler with the expected prevent and stop calls',()=>{
  const {calls,press}=setup();
  expect(press('s',{ctrlKey:true})).toEqual({result:'handled',log:['prevent']});
  expect(press('z',{ctrlKey:true})).toEqual({result:'handled',log:['prevent','stop']});
  expect(press('y',{ctrlKey:true}).result).toBe('handled');
  expect(press('5')).toEqual({result:'handled',log:['prevent','stop']});
  expect(press('F',{shiftKey:true}).result).toBe('handled');expect(press('/').result).toBe('handled');expect(press('.').result).toBe('handled');
  expect(calls).toEqual(['save','undo','redo','interval:5','fullscreen','indicators','layouts']);
  expect(press('r',{altKey:true})).toEqual({result:'none',log:[]});
 });
 it('focus context reads the target, dialogs, menus and dropdowns at the moment of the key',()=>{
  const input={tagName:'INPUT',closest:(s:string)=>s.includes('input')?{}:null};
  const live=()=>({loaded:true,selectedDrawing:null,activeTool:null,placementActive:false});
  expect(focusContextFor({target:input},live,dom,false)).toMatchObject({editable:true,chartFocus:false});
  expect(focusContextFor({target:body},live,{querySelector:s=>s.includes('role=dialog')?{}:null},false).dialogOpen).toBe(true);
  expect(focusContextFor({target:body},live,dom,true).dialogOpen).toBe(true);
  expect(focusContextFor({target:body},live,{querySelector:s=>s.includes('aria-haspopup')?{}:null},false).dropdownOpen).toBe(true);
  expect(focusContextFor({target:{closest:s=>s==='[role=menu]'?{}:null}},live,dom,false).menuOpen).toBe(true);
  expect(focusContextFor({target:body,isComposing:true},live,dom,false).composing).toBe(true);
 });
});
