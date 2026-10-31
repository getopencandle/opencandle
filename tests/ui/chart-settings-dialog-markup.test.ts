// Static markup of the Settings dialog through react-dom/server (no DOM events, no GUI).
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ChartSettingsDialog,chartSettingsSources,type ChartSettingsDialogProps} from '../../src/ui/chart-settings-dialog';
import {factoryAppearance,factoryPriceScale,visibleTabView,visibleTabs} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';
import {type ChartSettingsTabId} from '../../src/chart/chart-settings-facts';
import {settingsDefaults} from '../../src/chart/chart-settings';

function props(tab:ChartSettingsTabId,extra:Partial<ChartSettingsDialogProps>={}):ChartSettingsDialogProps{
 return{themeId:'lv-dark',appearance:factoryAppearance(),onPreview(){},onApply(){},onCancel(){},document:defaultChartSettingsDocument(),priceScale:factoryPriceScale(),ratio:0.7892032,timezone:'UTC',exchangeTimezone:null,chartStyle:'candles',initialTab:tab,tabMemory:createMemoryTabMemory(),onTemplatesChange(){},scaleMode:{scale:'linear',invert:false,auto:true},dataSources:React.createElement('p',null,'Synthetic data sources body'),...extra};
}
function markup(tab:ChartSettingsTabId,extra:Partial<ChartSettingsDialogProps>={}){return renderToStaticMarkup(React.createElement(ChartSettingsDialog,props(tab,extra)));}
const order=(html:string,needles:string[])=>{const positions=needles.map(needle=>html.indexOf(needle));expect(positions.every(position=>position>=0),needles.filter((_,i)=>positions[i]<0).join(', ')).toBe(true);expect([...positions].sort((a,b)=>a-b)).toEqual(positions);};
// Approved design: one fixed 600px dialog; the body scrolls, so the height never depends on the tab.
const FIXED_HEIGHT='height:min(600px, calc(100vh - 40px))';

describe('Settings dialog markup (static, not interface evidence)',()=>{
 it('dialog shell: title, close label, 750px width, Symbol height, vertical tablist with only the tabs that have working rows, footer Template / Cancel / Ok',()=>{
  const html=markup('symbol');
  expect(html).toContain('role="dialog"');expect(html).toContain('data-dialog-name="Chart settings"');expect(html).toContain('>Chart settings</h2>');expect(html).toContain('aria-label="Close menu"');
  expect(html).toContain('width:750px');expect(html).toContain('height:min(600px, calc(100vh - 40px))');
  expect(html).toContain('role="tablist" aria-orientation="vertical"');
  // Alerts has working rows (Alert lines, Only active alerts).
  // Events has working rows (Dividends, Splits).
  order(html,['symbol','legend','scales','canvas','trading','alerts','events','datasources'].map(id=>`id="lv-cset-tab-${id}"`));
  expect(html).toContain('id="lv-cset-tab-symbol" aria-selected="true"');
  order(html,['data-name="theme-select"','>Template<','name="cancel"','>Cancel<','name="submit"','>OK<']);
 });
 it.each(['symbol','legend','scales','canvas'])('%s tab renders every working row in order with its label',tab=>{
  const id=tab as ChartSettingsTabId,html=markup(id),source=chartSettingsSources(props(id)),rows=visibleTabView(id,source).flatMap(group=>group.rows);
  expect(rows.length).toBeGreaterThan(0);
  order(html,rows.map(row=>`data-lv-row="${row.key}"`));
  for(const row of rows)if(row.label)expect(html,row.key).toContain('>'+row.label.replace(/&/g,'&amp;')+'<');
  expect(html).toContain(FIXED_HEIGHT);
 });
 it('dialog height is the same fixed value on every tab',()=>{
  const heights=(['symbol','legend','scales','canvas','trading','alerts','events','datasources'] as ChartSettingsTabId[]).map(tab=>/height:min\([^)]*\)[^;"]*\)/.exec(markup(tab))?.[0]);
  expect(new Set(heights).size).toBe(1);expect(heights[0]).toBe(FIXED_HEIGHT);
 });
 it('rows that only save a value are not rendered, and no dot note or reason text remains',()=>{
  const scales=markup('scales');
  // Plus button and No overlapping labels are live; they are rendered now.
  // Pre/post/night market is live (label and line paint the extended-hours price).
  // made Bid and ask live (labels and lines paint the live best bid and ask), so it is rendered now.
  // made Scales placement live (Stack on the left or right moves the scales), so the saved-only rows left are
  // on the Events tab (earnings and news).
  expect(scales).toContain('>Scales placement<');
  // made Latest news and News notification live (NewsChartMarkers), so they are rendered now.
  const eventsTab=markup('events');for(const shown of ['Latest news','News notification'])expect(eventsTab,shown).toContain('>'+shown+'<');
  expect(scales).toContain('>Bid and ask<');
  expect(scales).toContain('>Pre/post/night market<');
  // Adjust data for dividends is live (Alpaca feeds reload adjusted), so it is shown.
  const symbol=markup('symbol');expect(symbol).toContain('>Adjust data for dividends<');
  expect(scales).toContain('>Plus button<');expect(scales).toContain('>No overlapping labels<');expect(symbol).toContain('>Precision<');
  for(const html of [scales,symbol,markup('canvas')]){expect(html).not.toContain('data-lv-binding="stored"');expect(html).not.toContain('Rows marked with a dot');expect(html).not.toContain('lv-cset-why');}
  expect(markup('symbol',{initialTab:'events'})).toContain('id="lv-cset-tab-events" aria-selected="true"');
  const events=markup('events');expect(events).toContain('>Dividends<');expect(events).toContain('>Splits<');expect(events).toContain('>Earnings<'); // Earnings live
 });
 it('a multi-check row leaves out its saved-only item (none left: Symbol > Name and High and low > Value are live since lane A r17)',()=>{
  const source=chartSettingsSources(props('scales')),rows=visibleTabView('scales',source).flatMap(group=>group.rows);
  expect(rows.find(row=>row.key==='scales.symbolLabelsLines')!.items!.map(item=>item.value)).toEqual(['name','value','line']);
  expect(rows.find(row=>row.key==='scales.highLowLabelsLines')!.items!.map(item=>item.value)).toEqual(['value','line']);
  expect(rows.find(row=>row.key==='scales.timeHoursFormat')!.options!.map(option=>option.value)).toEqual(['24','12']);
 });
 it('defaults are visible in the rendered controls (multi-check summaries, select text, ratio, units)',()=>{
  const scales=markup('scales');
  for(const text of ['Value, line','Hidden','Mon 29 Sep &#x27;97','24-hours','Visible on mouse over','value="0.7892032"','Value according to scale','Regular'])expect(scales,text).toContain(text);
  const canvas=markup('canvas');for(const text of ['>Solid<','>12<','value="10"','value="8"','>%<','1px'])expect(canvas,text).toContain(text);
  expect(markup('symbol')).toContain('>UTC<');
 });
 it('the moved chart-options and theme rows sit in Scales and lines / Canvas',()=>{
  const scales=markup('scales');order(scales,['data-lv-row="lv.scales.scaleType"','data-lv-row="lv.scales.invert"','data-lv-row="lv.scales.auto"','data-lv-row="scales.scalesCurrencyUnit"']);
  expect(scales).toContain('Scale type');expect(scales).toContain('Invert scale');expect(scales).toContain('Auto scale');
  expect(scales).toContain('Symbol color');expect(scales).toContain('High and low color');
  const canvas=markup('canvas');order(canvas,['data-lv-row="canvas.crossHair"','data-lv-row="lv.canvas.paneSeparators"','data-lv-row="canvas.scalesText"']);expect(canvas).toContain('Pane separators color');
  expect(markup('scales',{scaleMode:null})).not.toContain('Scale type');
 });
 it('the single timezone control is Symbol > Timezone, with Exchange offered only when the exchange zone is known',()=>{
  const unknown=chartSettingsSources(props('symbol')),row=(s:typeof unknown)=>visibleTabView('symbol',s).flatMap(group=>group.rows).filter(item=>item.label==='Timezone');
  expect(row(unknown)).toHaveLength(1);expect(row(unknown)[0].options!.map(option=>option.value)).not.toContain('exchange');
  const known=chartSettingsSources(props('symbol',{exchangeTimezone:'America/New_York'}));expect(row(known)[0].options!.map(option=>option.value)).toContain('exchange');
  for(const tab of ['symbol','legend','scales','canvas'] as const){const labels=visibleTabView(tab,known).flatMap(group=>group.rows).filter(item=>/time ?zone/i.test(item.label));expect(labels.length,tab).toBe(tab==='symbol'?1:0);}
 });
 it('Data sources shows the host body outside the settings rows',()=>{
  const html=markup('datasources');expect(html).toContain('Synthetic data sources body');expect(html).toContain('id="lv-cset-tab-datasources" aria-selected="true"');expect(html).toContain(FIXED_HEIGHT);
  expect(markup('symbol',{dataSources:undefined})).not.toContain('lv-cset-tab-datasources');
  expect(visibleTabs(chartSettingsSources(props('symbol')),true).at(-1)).toBe('datasources');
 });
 it('PREFS-MOVE: the General tab shows the host body, sits before Data sources, and is absent without a body',()=>{
  const withGeneral={general:React.createElement('p',null,'Synthetic general body')};
  const html=markup('general',withGeneral);expect(html).toContain('Synthetic general body');expect(html).not.toContain('Synthetic data sources body');expect(html).toContain('id="lv-cset-tab-general" aria-selected="true"');expect(html).toContain('>General<');
  order(markup('symbol',withGeneral),['events','general','datasources'].map(id=>`id="lv-cset-tab-${id}"`));
  expect(markup('symbol')).not.toContain('lv-cset-tab-general');
  expect(visibleTabs(chartSettingsSources(props('symbol')),true,true).slice(-2)).toEqual(['general','datasources']);
  expect(markup('datasources',withGeneral)).not.toContain('Keep running');
 });
 it('without a saved document the document-backed rows disappear instead of showing disabled rows',()=>{
  const unbound=markup('legend',{document:undefined});expect(unbound).not.toContain('>Logo<');expect(unbound).not.toContain('>Title<');expect(unbound).not.toContain('data-lv-binding="unavailable"');
 });
 it('Symbol tab follows the chart type',()=>{
  const line=markup('symbol',{chartStyle:'line',typeSettings:settingsDefaults('line')});expect(line).toContain('>Line</h3>');expect(line).toContain('Gradient start color');expect(line).toContain('Data modification');expect(line).not.toContain('>Candles</h3>');
  // Volume footprint has its own rows now; a style id without a schema still says so.
  expect(markup('symbol',{chartStyle:'footprint',typeSettings:settingsDefaults('footprint')})).toContain('Imbalance (%)');
  const renko=markup('symbol',{chartStyle:'nosuchtype'});expect(renko).toContain('This chart type has no style options.');
 });
});
