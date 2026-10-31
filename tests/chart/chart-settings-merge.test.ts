import {describe,expect,it} from 'vitest';
import {factoryAppearance,factoryPriceScale,visibleTabView,visibleTabs,tabView,LV_ROW_KEYS,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {settingsDefaults} from '../../src/chart/chart-settings';
import {CHART_SETTINGS_TAB_IDS} from '../../src/chart/chart-settings-facts';

const sources=(extra:Partial<ChartSettingsSources>={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true},...extra});
const keys=(tab:Parameters<typeof visibleTabView>[0],s=sources())=>visibleTabView(tab,s).flatMap(group=>group.rows.map(row=>row.key));

describe('merged Settings: where each retired control lives',()=>{
 it('tab mapping: scale rows in Scales and lines, separators in Canvas, chart type rows (with Price source) in Symbol',()=>{
  expect(keys('scales').slice(0,3)).toEqual([LV_ROW_KEYS.scaleType,LV_ROW_KEYS.invert,LV_ROW_KEYS.auto]);
  expect(keys('canvas')).toContain(LV_ROW_KEYS.separators);
  const line=sources({style:'line',typeSettings:settingsDefaults('line')});
  expect(keys('symbol',line)).toContain('type.line.source');
  expect(keys('scales',line).filter(key=>key.endsWith('.source'))).toEqual([]);
 });
 it('shows only tabs that have working rows, then Data sources last',()=>{
  // Executions, Execution labels and the execution sound work now, so Trading has working rows.
  // Alert lines and Only active alerts drive AlertChartLines, so Alerts has working rows too.
  // Dividends and Splits drive ChartEventMarkers, so Events has working rows.
  expect(visibleTabs(sources(),true)).toEqual(['symbol','legend','scales','canvas','trading','alerts','events','datasources']);
  expect(visibleTabs(sources(),false)).not.toContain('datasources');
  expect(visibleTabView('events',sources()).flatMap(group=>group.rows).map(row=>row.key)).toEqual(['events.symbolDividends','events.symbolSplits','events.earnings','events.economicEvents','events.lastNews','events.notificationAboutNews']); // Latest news + News notification live (NewsChartMarkers); Economic events live; Earnings live (calendar markers)
  expect(visibleTabView('trading',sources()).flatMap(group=>group.rows).map(row=>row.key).sort()).toEqual(['trading.bracketsPLDisplay','trading.extendLeftTradingLine','trading.marketProjectOrderVisibility','trading.positionAlign','trading.positionAndBracketsPL','trading.positionPL','trading.reverseButton','trading.tradingConfirmEnabled','trading.tradingExecutions','trading.tradingExecutionsLables','trading.tradingNotifications','trading.tradingPositionsAndOrders','trading.tradingSellBuyPanel','trading.tradingSoundMelody','trading.tradingSoundVolume','trading.visibilityOnScreenshotTitle']);
  expect(CHART_SETTINGS_TAB_IDS.at(-1)).toBe('datasources');
 });
 it('rows that only store a value stay in the data but are not shown',()=>{
  const all=tabView('events',sources()).flatMap(group=>group.rows).filter(row=>!['events.symbolDividends','events.symbolSplits','events.earnings','events.economicEvents','events.lastNews','events.notificationAboutNews'/* Live now */].includes(row.key));expect(all.length).toBeGreaterThan(0);expect(all.every(row=>row.availability.state!=='live')).toBe(true);
  // Every Trading row is live now; the saved-only rows left are Events (earnings and news).
  const trading=tabView('trading',sources()).flatMap(group=>group.rows);expect(trading.every(row=>row.availability.state==='live')).toBe(true);
 });
 it('one timezone control; Exchange is offered only when the exchange zone is known',()=>{
  const zone=(s:ChartSettingsSources)=>visibleTabView('symbol',s).flatMap(g=>g.rows).filter(row=>row.label==='Timezone');
  expect(zone(sources())).toHaveLength(1);expect(zone(sources())[0].options!.some(o=>o.value==='exchange')).toBe(false);
  expect(zone(sources({exchangeTimezone:'America/New_York'}))[0].options!.some(o=>o.value==='exchange')).toBe(true);
  for(const tab of ['legend','scales','canvas'] as const)expect(visibleTabView(tab,sources()).flatMap(g=>g.rows).some(row=>/time ?zone/i.test(row.label))).toBe(false);
 });
});
