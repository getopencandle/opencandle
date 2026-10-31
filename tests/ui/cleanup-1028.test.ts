import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {ChartTypeMenu} from '../../src/ui/ChartTypeMenu';
import {restoreChartTypeFavorites,toggleChartTypeFavorite,readLegacyChartTypeFavorites,CHART_TYPE_FAVORITES_KEY} from '../../src/ui/chart-type-favorites';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {SHARED_WORKSPACE_KEYS,sharedWorkspaceChanges,sharedWorkspaceOf} from '../../src/ui/window-mode';
// Chart type favorites move into the workspace beside the interval favorites. Model + static markup only.
const types=[{value:'candles',label:'Candles'},{value:'line',label:'Line'},{value:'renko',label:'Renko'}];
const nodeRequire=createRequire(import.meta.url);
describe('workspace chart type favorites',()=>{
 it('restores only a strict list and toggles newest last',()=>{
  expect(restoreChartTypeFavorites(['renko','line'])).toEqual(['renko','line']);
  for(const bad of [['line','line'],[3],[''],['Line'],'line',null,Array.from({length:33},(_,i)=>'t'+i)])expect(()=>restoreChartTypeFavorites(bad)).toThrow();
  expect(toggleChartTypeFavorite(['line'],'renko')).toEqual(['line','renko']);expect(toggleChartTypeFavorite(['line','renko'],'line')).toEqual(['renko']);
 });
 it('is optional and additive in the saved workspace, and travels with layout window saves',()=>{
  const base=JSON.parse(JSON.stringify(createInitialWorkspace()));
  expect(Object.hasOwn(restoreWorkspace(base,createInitialWorkspace()),'chartTypeFavorites')).toBe(false);
  expect(restoreWorkspace({...base,chartTypeFavorites:['renko']},createInitialWorkspace()).chartTypeFavorites).toEqual(['renko']);
  expect(()=>restoreWorkspace({...base,chartTypeFavorites:['renko','renko']},createInitialWorkspace())).toThrow();
  expect(SHARED_WORKSPACE_KEYS).toContain('chartTypeFavorites');expect([...nodeRequire('../../electron/windows.cjs').SHARED_WORKSPACE_KEYS]).toEqual([...SHARED_WORKSPACE_KEYS]);
  expect(sharedWorkspaceChanges(sharedWorkspaceOf(base),{...base,chartTypeFavorites:['line']})).toEqual({chartTypeFavorites:['line']});
 });
 it('the menu shows the workspace list; the legacy key is read only while the workspace has none',()=>{
  const store=new Map([[CHART_TYPE_FAVORITES_KEY,'["renko"]']]);expect(readLegacyChartTypeFavorites({getItem:key=>store.get(key)??null})).toEqual(['renko']);
  const saved=renderToStaticMarkup(React.createElement(ChartTypeMenu,{value:'line',types,onSelect:()=>{},favorites:['candles'],onFavoritesChange:()=>{}}));
  expect(saved.match(/lv-chart-type-favorite"[^>]*aria-label="([^"]+)"/g)?.length).toBe(1);expect(saved).toContain('aria-label="Candles"');
  const g=globalThis as {localStorage?:unknown},had=Object.hasOwn(g,'localStorage'),previous=g.localStorage;
  g.localStorage={getItem:(key:string)=>store.get(key)??null};
  try{
   const legacy=renderToStaticMarkup(React.createElement(ChartTypeMenu,{value:'line',types,onSelect:()=>{},onFavoritesChange:()=>{}}));expect(legacy).toContain('aria-label="Renko"');
   const migrated=renderToStaticMarkup(React.createElement(ChartTypeMenu,{value:'line',types,onSelect:()=>{},favorites:[],onFavoritesChange:()=>{}}));expect(migrated).not.toContain('lv-chart-type-favorite');
  }finally{if(had)g.localStorage=previous;else delete g.localStorage;}
 });
});
