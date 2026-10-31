import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it} from 'vitest';
import {APP_PREFERENCE_DEFAULTS,APP_PREFERENCE_LABELS,appPreferencesOf,defaultTimezoneChoices,liveOpenTimezone,newChartTimezone,resolveChartTimezone,restoreAppPreferences,validTimezoneChoice} from '../../src/ui/app-preferences';
import {AppPreferencesSection} from '../../src/ui/AppPreferencesSection';
import {FACTORY_TIMEZONE,FACTORY_TIMEZONE_CHOICE,factorySources} from '../../src/chart/chart-settings-bindings';
import {TIMEZONE_EXCHANGE} from '../../src/chart/chart-settings-facts';
import {alpacaInstrument} from '../../src/domain/alpaca-live';
import {coinbaseInstrument} from '../../src/domain/coinbase-live';
import {fixtureInstrument} from '../../src/domain/fixtures';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {buildStartupLiveGrid} from '../../src/ui/startup-open';
import {clearLiveDatasets} from '../../src/ui/live-registry';
import {chartSettingsSources,type ChartSettingsDialogProps} from '../../src/ui/chart-settings-dialog';
import {factoryAppearance,factoryPriceScale} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';

// The app-level Default chart timezone. Factory: Exchange. Pure helpers, workspace
// restore, the grid and startup builders, and the Settings section's static markup. No GUI.
afterEach(()=>clearLiveDatasets());
const GME=alpacaInstrument('GME'),BTC=coinbaseInstrument('BTC-USD');
const prefs=(defaultChartTimezone:string,keepRunningInTray=true)=>({appPreferences:{keepRunningInTray,defaultChartTimezone}});

describe('factory values (LV-DEFINED, overriding the UTC factory fact)',()=>{
 it('the factory choice is Exchange and the tray setting is on; UTC stays the fallback zone',()=>{
  expect(FACTORY_TIMEZONE_CHOICE).toBe(TIMEZONE_EXCHANGE);expect(FACTORY_TIMEZONE).toBe('UTC');
  expect(APP_PREFERENCE_DEFAULTS).toEqual({keepRunningInTray:true,defaultChartTimezone:'exchange'});
  expect(appPreferencesOf({})).toEqual({keepRunningInTray:true,defaultChartTimezone:'exchange'});
 });
 it('a factory workspace carries no appPreferences key, so its saved form is unchanged',()=>{
  const fresh=createInitialWorkspace();expect(Object.hasOwn(fresh,'appPreferences')).toBe(false);
  expect(Object.hasOwn(restoreWorkspace(JSON.parse(JSON.stringify(fresh)),createInitialWorkspace()),'appPreferences')).toBe(false);
  expect(fresh.chartOptions.timezone).toBe('UTC');
 });
});

describe('resolving a choice for a symbol',()=>{
 it('Exchange: US stocks use New York, crypto uses UTC, an unknown symbol or zone uses UTC',()=>{
  expect(resolveChartTimezone('exchange',GME)).toBe('America/New_York');
  expect(resolveChartTimezone('exchange',BTC)).toBe('UTC');
  expect(resolveChartTimezone('exchange',{assetClass:'crypto',timezone:'America/New_York'})).toBe('UTC');
  expect(resolveChartTimezone('exchange',null)).toBe('UTC');
  expect(resolveChartTimezone('exchange',{assetClass:'stock',timezone:'Mars/Olympus_Mons'})).toBe('UTC');
  expect(resolveChartTimezone('exchange',fixtureInstrument('GME'))).toBe('UTC');
 });
 it('a named zone applies to every symbol, crypto included',()=>{
  expect(resolveChartTimezone('America/Denver',GME)).toBe('America/Denver');
  expect(resolveChartTimezone('America/Denver',BTC)).toBe('America/Denver');
  expect(resolveChartTimezone('UTC',GME)).toBe('UTC');
  expect(resolveChartTimezone('Mars/Olympus_Mons',GME)).toBe('UTC');
  expect(newChartTimezone(prefs('Asia/Tokyo'),GME)).toBe('Asia/Tokyo');expect(newChartTimezone({},GME)).toBe('America/New_York');
 });
 it('the choices are the chart timezone list: UTC, Exchange, then cities; a saved choice no longer listed stays selectable',()=>{
  const at=new Date(Date.UTC(2026,9,22,12));const rows=defaultTimezoneChoices('exchange',at);
  expect(rows.slice(0,2)).toEqual([{value:'UTC',label:'UTC'},{value:'exchange',label:'Exchange'}]);
  expect(rows.some(row=>row.value==='America/New_York')).toBe(true);
  expect(defaultTimezoneChoices('Etc/GMT+5',at).at(-1)).toEqual({value:'Etc/GMT+5',label:'Etc/GMT+5'});
  for(const value of ['exchange','UTC','America/Denver','Etc/GMT+5'])expect(validTimezoneChoice(value)).toBe(true);
  for(const value of ['','Exchange','Mars/Olympus_Mons','../x',5,null,'a'.repeat(80)])expect(validTimezoneChoice(value)).toBe(false);
 });
});

describe('saved preferences',()=>{
 it('restore exactly, and a present invalid value fails recovery',()=>{
  expect(restoreAppPreferences({keepRunningInTray:false,defaultChartTimezone:'America/Denver'})).toEqual({keepRunningInTray:false,defaultChartTimezone:'America/Denver'});
  for(const bad of [null,[],{},{keepRunningInTray:true},{keepRunningInTray:'yes',defaultChartTimezone:'exchange'},{keepRunningInTray:true,defaultChartTimezone:'Mars/Base'},{keepRunningInTray:true,defaultChartTimezone:'exchange',extra:1}])expect(()=>restoreAppPreferences(bad)).toThrow();
  const saved={...createInitialWorkspace(),appPreferences:{keepRunningInTray:false,defaultChartTimezone:'America/Denver'}};
  expect(restoreWorkspace(JSON.parse(JSON.stringify(saved)),createInitialWorkspace()).appPreferences).toEqual({keepRunningInTray:false,defaultChartTimezone:'America/Denver'});
  expect(()=>restoreWorkspace({...JSON.parse(JSON.stringify(saved)),appPreferences:{keepRunningInTray:false}},createInitialWorkspace())).toThrow(/application preferences/);
 });
});

describe('new charts follow the default; existing charts keep theirs',()=>{
 it('a chart on the factory UTC zone takes the default when a live feed opens on it; a chosen zone is kept',()=>{
  expect(liveOpenTimezone('UTC',{},GME)).toBe('America/New_York');
  expect(liveOpenTimezone('UTC',{},BTC)).toBeNull();
  expect(liveOpenTimezone('UTC',prefs('America/Denver'),GME)).toBe('America/Denver');
  expect(liveOpenTimezone('UTC',prefs('America/Denver'),BTC)).toBe('America/Denver');
  expect(liveOpenTimezone('UTC',prefs('UTC'),GME)).toBeNull();
  expect(liveOpenTimezone('Asia/Tokyo',{},GME)).toBeNull();expect(liveOpenTimezone('America/Chicago',prefs('America/Denver'),GME)).toBeNull();
 });
 it('charts a layout change adds get the given zone; the charts already there keep their saved zone',()=>{
  const workspace=createInitialWorkspace(),grid=structuredClone(workspace.grid!),first=grid.layout.cells[0].id;
  grid.cells[first]={...grid.cells[first],chartOptions:{...grid.cells[first].chartOptions,timezone:'Asia/Tokyo'}};
  let n=0;const next=resizeMultiChartState(grid,'four',()=>'tz-cell-'+(++n),undefined,undefined,'America/New_York');
  expect(next.layout.cells.map(row=>next.cells[row.id].chartOptions.timezone)).toEqual(['Asia/Tokyo','America/New_York','America/New_York','America/New_York']);
  n=0;const legacy=resizeMultiChartState(grid,'two-columns',()=>'tz-cell-'+(++n));
  expect(legacy.cells[legacy.layout.cells[1].id].chartOptions.timezone).toBe('UTC');
 });
 it('startup charts: each live chart on the factory zone takes the default for its own symbol',()=>{
  const workspace=createInitialWorkspace();let n=0;
  const built=buildStartupLiveGrid(workspace,[{source:'alpaca',symbol:'GME'},{source:'coinbase',symbol:'BTC-USD'},{source:'alpaca',symbol:'SPY'}],'1m',{coinbase:true,alpacaKey:true},()=>'tz-start-'+(++n),(zone,data)=>liveOpenTimezone(zone,{},data.instrument));
  expect(built.grid.layout.cells.map(row=>built.grid.cells[row.id].chartOptions.timezone)).toEqual(['America/New_York','UTC','America/New_York']);
  n=0;const denver=buildStartupLiveGrid(workspace,[{source:'alpaca',symbol:'GME'},{source:'coinbase',symbol:'BTC-USD'}],'1m',{coinbase:true,alpacaKey:true},()=>'tz-start-'+(++n),(zone,data)=>liveOpenTimezone(zone,prefs('America/Denver'),data.instrument));
  expect(denver.grid.layout.cells.map(row=>denver.grid.cells[row.id].chartOptions.timezone)).toEqual(['America/Denver','America/Denver']);
  n=0;const plain=buildStartupLiveGrid(workspace,[{source:'alpaca',symbol:'GME'}],'1m',{coinbase:false,alpacaKey:true},()=>'tz-start-'+(++n));
  expect(plain.grid.cells[plain.grid.layout.cells[0].id].chartOptions.timezone).toBe('UTC');
 });
 it('Settings Reset settings resets the chart timezone to Exchange (the symbol\'s zone), or UTC when that is unknown',()=>{
  const props=(exchangeTimezone:string|null):ChartSettingsDialogProps=>({themeId:'lv-dark',appearance:factoryAppearance(),document:defaultChartSettingsDocument(),priceScale:factoryPriceScale(),ratio:0.5,timezone:'Asia/Tokyo',exchangeTimezone,chartStyle:'candles',onPreview(){},onApply(){},onCancel(){},onTemplatesChange(){},scaleMode:null} as unknown as ChartSettingsDialogProps);
  expect(factorySources(chartSettingsSources(props('America/New_York'))).timezone).toBe('America/New_York');
  expect(factorySources(chartSettingsSources(props(null))).timezone).toBe('UTC');
 });
});

describe('Settings: the Application section',()=>{
 it('shows both settings with the factory values',()=>{
  const html=renderToStaticMarkup(React.createElement(AppPreferencesSection,{preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,onChange:()=>undefined,at:new Date(Date.UTC(2026,9,22,12))}));
  expect(html).toContain('<h3>Application</h3>');expect(html).toContain(APP_PREFERENCE_LABELS.keepRunningInTray);expect(html).toContain('Keep running in the notification area when closed');
  expect(html).toMatch(/<input type="checkbox" checked=""\/> Keep running/);
  expect(html).toContain('Default chart timezone');expect(html).toMatch(/<option value="exchange" selected="">Exchange<\/option>/);
  expect(html).toContain(APP_PREFERENCE_LABELS.keepRunningNote);expect(html).not.toMatch(/—/);
 });
 it('without a notification area the tray row is off and disabled and says closing quits',()=>{
  const html=renderToStaticMarkup(React.createElement(AppPreferencesSection,{preferences:{keepRunningInTray:true,defaultChartTimezone:'America/Denver'},trayAvailable:false,onChange:()=>undefined}));
  expect(html).toMatch(/<input type="checkbox" disabled=""\/> Keep running/);expect(html).toContain(APP_PREFERENCE_LABELS.trayUnavailable);
  expect(html).toMatch(/<option value="America\/Denver" selected="">/);
 });
 it('each change reports the whole preference value at once',()=>{
  const changes:unknown[]=[];const element=AppPreferencesSection({preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,onChange:value=>changes.push(value)}) as any;
  const find=(node:any,test:(node:any)=>boolean):any=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const hit=find(child,test);if(hit)return hit;}return null;}if(test(node))return node;return find(node.props?.children,test);};
  find(element,node=>node.type==='input').props.onChange({target:{checked:false}});
  find(element,node=>node.type==='select').props.onChange({target:{value:'America/Denver'}});
  find(element,node=>node.type==='select').props.onChange({target:{value:'Mars/Base'}});
  expect(changes).toEqual([{keepRunningInTray:false,defaultChartTimezone:'exchange'},{keepRunningInTray:true,defaultChartTimezone:'America/Denver'}]);
 });
});
