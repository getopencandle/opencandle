import {describe,expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {keyboardShortcutRows,LISTENER_ONLY_KEYS,RENDERER_KEYS,CONTEXT_DEPENDENT_KEYS} from '../../src/ui/keyboard-shortcuts';
import {classifyWorkspaceKey,type FocusContext} from '../../src/ui/shortcut-dispatch';
import {composeInputFeel,INPUT_FEEL_RUNTIMES} from '../../src/chart/vela-input-feel-transform.mjs';

// The Keyboard shortcuts list names Ctrl+X, F11 and the keys the chart renderer
// handles itself, each checked against the code that handles it. No launch, no key, no network.
const CONTEXT:FocusContext={editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:true,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false};
const rows=keyboardShortcutRows(),keys=(action:string)=>rows.find(row=>row.action===action)?.keys;

describe(' Keyboard shortcuts list',()=>{
 it('lists Cut (Ctrl+X) and the window full screen (F11)',()=>{
  expect(keys('Cut the selected drawing')).toEqual(['Ctrl+X']);
  expect(rows.find(row=>row.action==='Cut the selected drawing')?.group).toBe('Drawings');
  expect(keys('Full screen window')).toEqual(['F11']);expect(rows.find(row=>row.action==='Full screen window')?.group).toBe('General');
  expect(LISTENER_ONLY_KEYS.find(row=>row.keys.includes('F11'))?.file).toBe('electron/main.cjs');
 });
 it('lists the renderer keys, each found in the pinned renderer bundle',()=>{
  // Plain Left/Right scroll one bar; the crosshair step is Alt+Left/Right.
  expect(keys('Scroll the chart by one bar')).toEqual(['Left','Right']);expect(keys('Move the cursor one bar')).toEqual(['Alt+Left','Alt+Right']);expect(keys('Scroll the chart by 10 bars')).toEqual(['Shift+Left','Shift+Right']);
  expect(keys('Scroll to the latest bar')).toEqual(['Alt+Shift+Right']);expect(keys('Zoom in')).toEqual(['Ctrl+Up','+','=']);expect(keys('Zoom out')).toEqual(['Ctrl+Down','-']);
  expect(keys('Go to the first bar')).toEqual(['Alt+Shift+Left','Home']);expect(keys('Go to the last bar')).toEqual(['End']);
  expect(keys('Duplicate the selected drawing')).toEqual(['Ctrl+D']);expect(keys('Measure (hold Shift and press on the chart)')).toEqual(['Shift+click']);
  const dist='node_modules/@luxalgo/vela/dist',bundle=readdirSync(dist).filter(file=>file.endsWith('.js')).map(file=>{const code=readFileSync(path.join(dist,file),'utf8'),name='dist/'+file;return INPUT_FEEL_RUNTIMES.includes(name)?composeInputFeel(code,name):code;}).join('\n');
  for(const row of RENDERER_KEYS)expect(bundle,row.action).toContain(row.source);
 });
 it('the renderer keys are not taken by the App classifier first; the digits are, so the renderer 0 is not listed',()=>{
  const plain={ctrlKey:false,metaKey:false,altKey:false,shiftKey:false};
  for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','+','=','-'])expect(classifyWorkspaceKey({key,...plain},CONTEXT).command,key).toBe('none');
  expect(classifyWorkspaceKey({key:'d',...plain,ctrlKey:true},CONTEXT).command).toBe('none');
  expect(classifyWorkspaceKey({key:'0',...plain},CONTEXT)).toEqual({command:'interval-entry',initial:'0'});
  expect(rows.filter(row=>row.keys.includes('0')||row.keys.includes('0 to 9')).map(row=>row.action)).toEqual(['Change the interval (type it)']);
 });
 it('only the context-dependent keys carry more than one action',()=>{
  const byKey=new Map<string,string[]>();for(const row of rows)for(const k of row.keys)byKey.set(k,[...(byKey.get(k)??[]),row.action]);
  const shared=[...byKey].filter(([,actions])=>actions.length>1).map(([k])=>k).sort();
  expect(shared).toEqual([...CONTEXT_DEPENDENT_KEYS].sort());
  expect(byKey.get('Shift+Right')).toEqual(['Scroll the chart by 10 bars','Forward one step']);
 });
});
