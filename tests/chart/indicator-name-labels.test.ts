import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {factoryAppearance,factoryPriceScale,findRow,writeRow,CHART_SETTINGS_REASONS,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {defaultPriceScaleSettings} from '../../src/chart/price-scale-state';

// "Indicators and financials name labels"
// property scalesProperties.showStudyPlotLabels, default false). SYNTHETIC bars only.
const names=(commands:any[])=>commands.filter(row=>row.op==='fillText'&&row.values.length===3).map(row=>row.values[0]);

it('Settings > Scales and lines > Indicators and financials: Name is a live item that saves labels.indName (fact default off)',()=>{
 const sources={appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:'America/New_York'} as ChartSettingsSources;
 expect(defaultPriceScaleSettings().labels.indName).toBe(false);
 const row=findRow('scales',sources,'scales.indicatorsLabelsLines')!;
 expect(row.itemAvailability?.name).toEqual({state:'live'});expect(row.value.items).toEqual({name:false,value:true});
 const next=writeRow(sources,'scales.indicatorsLabelsLines',{items:{name:true,value:true}});
 expect(next.priceScale!.labels.indName).toBe(true);expect(next.priceScale!.labels.indValue).toBe(true);
 expect((CHART_SETTINGS_REASONS as Record<string,string|undefined>).indicatorName).toBeUndefined();
});

it('actual pinned chrome draws the plot name beside its value label only while name labels are on',async()=>{
 const t=await indicatorDisplayHarness();try{
  t.port.add('sma',{length:1});
  expect(t.paint().map(row=>row.values[0])).toEqual(['20.00']);expect(names(t.recording.commands)).toEqual([]);
  t.display.setNameLabels(true);const values=t.paint(),drawn=t.recording.commands.filter(row=>row.op==='fillText'&&row.values.length===3);
  expect(values.map(row=>row.values[0])).toEqual(['20.00']);expect(drawn).toHaveLength(1);
  const name=String(drawn[0].values[0]);expect(name.length).toBeGreaterThan(0);expect(name).toMatch(/SMA|MA/);
  expect(drawn[0].values[2]).toBe(values[0].values[2]); // same slot center as the value tag
  expect(drawn[0].values[1]).toBeLessThan(t.coords.width); // inside the plot, left of the price axis
  expect(t.display.diagnostics()).toEqual([]);
  // Value labels off, names on: the name still shows (the reference keeps the two switches independent).
  t.display.setOptions({labelsVisible:false,valuesVisible:true});expect(t.paint()).toEqual([]);expect(names(t.recording.commands)).toEqual([name]);
  t.display.setNameLabels(false);t.paint();expect(names(t.recording.commands)).toEqual([]);
  t.display.setOptions({labelsVisible:true,valuesVisible:true});t.display.setNameLabels(true);t.native.scene.showAxisLabels=false;t.paint();expect(names(t.recording.commands)).toEqual([]);
 }finally{t.dispose();}
});

it('setNameLabels validates its argument, repaints once per change and is retired with the controller',async()=>{
 const t=await indicatorDisplayHarness();try{
  const before=t.repaint.requests;t.display.setNameLabels(true);expect(t.repaint.requests).toBe(before+1);t.display.setNameLabels(true);expect(t.repaint.requests).toBe(before+1);
  expect(()=>t.display.setNameLabels('yes' as any)).toThrow(/boolean/);
  t.repaint.failures=1;expect(()=>t.display.setNameLabels(false)).toThrow('literal repaint failure');t.port.add('sma',{length:1});t.paint();expect(names(t.recording.commands)).toHaveLength(1); // the failed change is rolled back
 }finally{t.dispose();}
});

it('the adapter forwards the menu setting to the display at install and on every change',()=>{
 const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf('   // "Indicators and financials name labels"'),end=source.indexOf('   unsubscribes.push(()=>{axisLabelPort=null;',start);
 if(start<0||end<0)throw Error('Review the adapter name-label boundary.');
 const listeners:Array<()=>void>=[];let settings={labels:{indValue:true,indName:false}};
 const ownedPriceScale={settings:()=>settings,subscribe:(fn:()=>void)=>{listeners.push(fn);return()=>{};}},indicatorDisplay={setNameLabels:vi.fn()},diagnostics:any[]=[];
 const run=new Function('return '+stripTypeScriptTypes('(function(injected){const {ownedPriceScale,indicatorDisplay,diagnostics}=injected;'+source.slice(start,end)+'})',{mode:'strip'}))();
 run({ownedPriceScale,indicatorDisplay,diagnostics});
 expect(indicatorDisplay.setNameLabels.mock.calls).toEqual([[false]]);
 settings={labels:{indValue:true,indName:true}};for(const fn of listeners)fn();expect(indicatorDisplay.setNameLabels.mock.calls).toEqual([[false],[true]]);
 for(const fn of listeners)fn();expect(indicatorDisplay.setNameLabels).toHaveBeenCalledTimes(2);
 indicatorDisplay.setNameLabels.mockImplementation(()=>{throw Error('SYNTHETIC display failure');});settings={labels:{indValue:true,indName:false}};for(const fn of listeners)fn();
 expect(diagnostics).toEqual([expect.objectContaining({code:'INDICATOR_DISPLAY_UNAVAILABLE',feature:'indicator name labels'})]);
});
