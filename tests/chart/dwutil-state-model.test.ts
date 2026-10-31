import {describe,expect,it} from 'vitest';
import {defaultDrawingUtility,freshDrawingUtility,lockMenu,hideMenu,syncMenu,lockTooltip,hideTooltip,syncTooltip,LOCK_ARROW_TOOLTIP,HIDE_ARROW_TOOLTIP,SYNC_ARROW_TOOLTIP,REMOVE_ARROW_TOOLTIP,REMOVE_BUTTON_TITLE,HIDE_HINT,lockActive,hideActive,toggleLock,toggleHide,selectLockMode,selectHideMode,toggleSync,selectSyncMode,toggleRemoveLocked,removeMenu,validateDrawingUtility,migrateDrawingUtility,currentSyncStamp,stampNewRow} from '../../src/chart/drawing-utility-state';

describe(' state: defaults and menus',()=>{
 it('defaults: lock all, hide drawings, layout, remove-locked off, syncOn only for fresh workspaces (Q5)',()=>{
  expect(defaultDrawingUtility()).toEqual({schemaVersion:1,lockMode:'all',drawingsLocked:false,indicatorsLocked:false,hideMode:'drawings',drawingsHidden:false,indicatorsHidden:false,syncMode:'layout',syncOn:false,removeLocked:false});
  expect(freshDrawingUtility().syncOn).toBe(true);expect(freshDrawingUtility().syncMode).toBe('layout');
 });
 it('menu rows, order and labels equal the cited facts',()=>{
  expect(lockMenu(defaultDrawingUtility()).map(r=>r.label)).toEqual(['Lock drawings','Lock indicators','Lock all']);
  expect(hideMenu(defaultDrawingUtility()).map(r=>r.label)).toEqual(['Hide drawings','Hide indicators','Hide positions and orders','Hide all']);/* Positions and orders row */
  expect(syncMenu(freshDrawingUtility()).map(r=>r.label)).toEqual(['New drawings sync in layout','New drawings sync globally']);
  expect([LOCK_ARROW_TOOLTIP,HIDE_ARROW_TOOLTIP,SYNC_ARROW_TOOLTIP,REMOVE_ARROW_TOOLTIP,REMOVE_BUTTON_TITLE,HIDE_HINT]).toEqual(['Lock options','Hide options','Sync drawings options','Remove options','Remove objects','Ctrl + Alt + H']);
 });
 it('every lock and hide tooltip in every mode and state',()=>{
  const u=defaultDrawingUtility();
  expect(lockTooltip({...u,lockMode:'drawings'})).toBe('Lock drawings');expect(lockTooltip({...u,lockMode:'drawings',drawingsLocked:true})).toBe('Unlock drawings');
  expect(lockTooltip({...u,lockMode:'indicators'})).toBe('Lock indicators');expect(lockTooltip({...u,lockMode:'indicators',indicatorsLocked:true})).toBe('Unlock indicators');
  expect(lockTooltip(u)).toBe('Lock drawings and indicators');expect(lockTooltip({...u,drawingsLocked:true,indicatorsLocked:true})).toBe('Unlock drawings and indicators');
  expect(lockTooltip({...u,drawingsLocked:true})).toBe('Lock drawings and indicators');
  expect(hideTooltip(u)).toBe('Hide all drawings');expect(hideTooltip({...u,drawingsHidden:true})).toBe('Show all drawings');
  expect(hideTooltip({...u,hideMode:'indicators'})).toBe('Hide all indicators');expect(hideTooltip({...u,hideMode:'indicators',indicatorsHidden:true})).toBe('Show all indicators');
  expect(hideTooltip({...u,hideMode:'all'})).toBe('Hide all drawings and indicators');expect(hideTooltip({...u,hideMode:'all',drawingsHidden:true,indicatorsHidden:true})).toBe('Show all drawings and indicators');
 });
 it('sync tooltips exact, main button toggles off and the remembered mode',()=>{
  const on=freshDrawingUtility();
  expect(syncTooltip(on)).toBe('New drawings are replicated to all charts in the layout and shown when the same ticker is selected');
  expect(syncTooltip({...on,syncMode:'global'})).toBe('New drawings are replicated to all charts in all layouts and shown when the same ticker is selected');
  const off=toggleSync({...on,syncMode:'global'});expect(off.syncOn).toBe(false);expect(off.syncMode).toBe('global');expect(syncTooltip(off)).toBe('New drawings will not be synced');
  expect(toggleSync(off)).toEqual({...on,syncMode:'global'});
  expect(selectSyncMode(off,'layout')).toEqual({...off,syncOn:true,syncMode:'layout'});
  expect(syncMenu(on).map(r=>r.checked)).toEqual([true,false]);expect(syncMenu(off).map(r=>r.checked)).toEqual([false,false]);
 });
 it('a mode is active when every family it names is on; main button turns them on or all off',()=>{
  const u=defaultDrawingUtility();
  expect(lockActive(u)).toBe(false);const on=toggleLock(u);expect(on).toMatchObject({drawingsLocked:true,indicatorsLocked:true});expect(lockActive(on)).toBe(true);
  expect(lockActive({...u,drawingsLocked:true})).toBe(false);expect(toggleLock(on)).toEqual(u);
  const half=toggleLock({...u,drawingsLocked:true});expect(half).toMatchObject({drawingsLocked:true,indicatorsLocked:true});
  expect(selectLockMode(u,'indicators')).toMatchObject({lockMode:'indicators',indicatorsLocked:true,drawingsLocked:false});
  expect(selectHideMode(u,'all')).toMatchObject({hideMode:'all',drawingsHidden:true,indicatorsHidden:true});
  expect(hideActive(toggleHide(u))).toBe(true);expect(toggleHide(toggleHide(u))).toEqual(u);
  expect(toggleRemoveLocked(u).removeLocked).toBe(true);
 });
 it('toggles are pure (no history record is produced, input untouched)',()=>{const u=Object.freeze(defaultDrawingUtility());expect(()=>{toggleLock(u);toggleHide(u);toggleSync(u);}).not.toThrow();expect(u.drawingsLocked).toBe(false);});
});
describe(' state: remove menu counts (DD-10)',()=>{
 it('singular and plural',()=>{
  const m=removeMenu({drawings:1,indicators:1,removeLocked:false});
  expect(m.map(r=>r.label)).toEqual(['Remove 1 drawing','Remove 1 indicator','Remove 1 drawing & 1 indicator','','Always remove locked drawings']);
  expect(removeMenu({drawings:2,indicators:3,removeLocked:true}).map(r=>r.label)).toEqual(['Remove 2 drawings','Remove 3 indicators','Remove 2 drawings & 3 indicators','','Always remove locked drawings']);
  expect(removeMenu({drawings:2,indicators:3,removeLocked:true})[4].checked).toBe(true);
 });
 it('fallback labels and disabled at zero',()=>{
  const m=removeMenu({drawings:0,indicators:0,removeLocked:false});
  expect(m.slice(0,3).map(r=>r.label)).toEqual(['Remove drawings','Remove indicators','Remove drawings and indicators']);expect(m.slice(0,3).every(r=>r.disabled===true)).toBe(true);
  const one=removeMenu({drawings:0,indicators:2,removeLocked:false});expect(one[0].disabled).toBe(true);expect(one[1].disabled).toBe(false);expect(one[2].disabled).toBe(false);expect(one[2].label).toBe('Remove drawings and indicators');
  expect(m[3].kind).toBe('separator');expect(m[4].kind).toBe('switch');expect(m.map(r=>r.id)).toEqual(['remove-drawing-tools','remove-studies','remove-all','separator','remove-locked']);
 });
});
describe(' state: validation and migration',()=>{
 it('validateDrawingUtility is exact',()=>{
  const ok=freshDrawingUtility();expect(validateDrawingUtility(ok)).toEqual(ok);
  expect(()=>validateDrawingUtility({...ok,extra:1})).toThrow();expect(()=>validateDrawingUtility({...ok,syncOn:'yes'})).toThrow();
  expect(()=>validateDrawingUtility({...ok,lockMode:'none'})).toThrow();expect(()=>validateDrawingUtility({...ok,schemaVersion:2})).toThrow();
  const {removeLocked:_r,...partial}=ok;expect(()=>validateDrawingUtility(partial)).toThrow();expect(()=>validateDrawingUtility(null)).toThrow();expect(()=>validateDrawingUtility([])).toThrow();
 });
 it('migration: absent block takes defaults with syncOn from the legacy flag; present block validated, never defaulted',()=>{
  expect(migrateDrawingUtility(undefined,false)).toEqual({value:defaultDrawingUtility(),migrated:true});
  expect(migrateDrawingUtility(undefined,true)).toEqual({value:{...defaultDrawingUtility(),syncOn:true},migrated:true});
  const ok={...freshDrawingUtility(),syncOn:false};expect(migrateDrawingUtility(ok,true)).toEqual({value:ok,migrated:false});
  expect(()=>migrateDrawingUtility({...ok,bad:1},false)).toThrow();expect(()=>migrateDrawingUtility(null,false)).toThrow();
 });
 it('new rows take the current toolbar stamp (DD-25)',()=>{
  expect(currentSyncStamp(freshDrawingUtility())).toBe('layout');expect(currentSyncStamp({...freshDrawingUtility(),syncMode:'global'})).toBe('global');expect(currentSyncStamp(defaultDrawingUtility())).toBeUndefined();
  expect(stampNewRow({id:'a',lvSyncScope:'global'},freshDrawingUtility())).toEqual({id:'a',lvSyncScope:'layout'});
  expect(stampNewRow({id:'a',lvSyncScope:'global'},defaultDrawingUtility())).toEqual({id:'a'});
 });
});
