// Chart settings rows of the WS.SCALE / WS.LABEL / WS.TIME / WS.CANVAS / WS.ALERTS ledger rows are shown, live,
// write the saved settings, and survive a document round trip. Alert labels gains its LV dialog row. Synthetic data only.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {factoryAppearance,factoryPriceScale,findRow,LV_ROW_KEYS,visibleTabView,writeRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument,restoreChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {alertLineRows} from '../../src/chart/alert-lines-data';
import {createLocalAlert,type AlertDefinition,type LocalAlert} from '../../src/domain/alerts';
import {ChartSettingsDialog,type ChartSettingsDialogProps} from '../../src/ui/chart-settings-dialog';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';

const sources=(extra:Partial<ChartSettingsSources>={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true},...extra});
const keys=(tab:Parameters<typeof visibleTabView>[0],s=sources())=>visibleTabView(tab,s).flatMap(group=>group.rows.map(row=>row.key));
const alert=(id:string):LocalAlert=>createLocalAlert({id,instrumentId:'SYNTHETIC:GME',sourceId:'close',name:'Alert '+id,message:'m',condition:{kind:'crossing',value:101.5},frequency:'every-time',createdAt:1,expiresAt:null,mode:'ordinary',runId:'ordinary'} as AlertDefinition);
const roundTrip=(s:ChartSettingsSources)=>restoreChartSettingsDocument(JSON.parse(JSON.stringify(s.document)));

describe('CHARTSET-1027 Alert labels row (WS.ALERTS.ALERT_LABELS)',()=>{
 it('shows Alert labels under Alert lines, checked by default',()=>{
  const lines=visibleTabView('alerts',sources())[0];
  expect(lines.rows.map(row=>row.key).slice(0,2)).toEqual(['alerts.colorAlertsLine',LV_ROW_KEYS.alertLabels]);
  const row=findRow('alerts',sources(),LV_ROW_KEYS.alertLabels)!;
  expect([row.label,row.type,row.value.checked,row.availability.state]).toEqual(['Alert labels','checkbox',true,'live']);
 });
 it('off writes alerts.labelsVisible, survives a save and reload, and hides the label chip of every alert line',()=>{
  const next=writeRow(sources(),LV_ROW_KEYS.alertLabels,{checked:false});
  expect(next.document.alerts.labelsVisible).toBe(false);
  expect(roundTrip(next).alerts.labelsVisible).toBe(false);
  const rows=(labelsVisible:boolean)=>alertLineRows({alerts:[alert('a')],cell:{instrumentId:'SYNTHETIC:GME'},settings:{lines:next.document.alerts.lines,activeOnly:true,labelsVisible},format:value=>value.toFixed(2)});
  expect(rows(next.document.alerts.labelsVisible).map(row=>row.labelVisible)).toEqual([false]);
  expect(rows(true).map(row=>row.labelVisible)).toEqual([true]);
 });
 it('is hidden without a connected settings document, and refuses writes there',()=>{
  expect(keys('alerts',sources({documentConnected:false}))).not.toContain(LV_ROW_KEYS.alertLabels);
  expect(()=>writeRow(sources({documentConnected:false}),LV_ROW_KEYS.alertLabels,{checked:false})).toThrow();
 });
 it('renders in the Alerts tab of the dialog',()=>{
  const props:ChartSettingsDialogProps={themeId:'lv-medium-dark',appearance:factoryAppearance(),onPreview:()=>{},onApply:()=>true,onCancel:()=>{},document:defaultChartSettingsDocument(),initialTab:'alerts',tabMemory:createMemoryTabMemory(),priceScale:factoryPriceScale(),ratio:0.5,scaleMode:{scale:'linear',invert:false,auto:true}};
  const html=renderToStaticMarkup(React.createElement(ChartSettingsDialog,props));
  expect(html).toContain('Alert labels');
  expect(html.indexOf('Alert lines')).toBeLessThan(html.indexOf('Alert labels'));
  expect(html.indexOf('Alert labels')).toBeLessThan(html.indexOf('Only active alerts'));
 });
});

describe('CHARTSET-1027 ledger rows are live dialog rows that persist',()=>{
 // [ledger row, tab, row key, new value, read back from the written sources]
 const cases:[string,Parameters<typeof visibleTabView>[0],string,Record<string,unknown>,(s:ChartSettingsSources)=>unknown,unknown][]=[
  ['WS.SCALE.LEFT_SCALE / RIGHT_SCALE','scales','scales.scalesPlacement',{selected:'left'},s=>[s.priceScale?.placement,s.priceScale?.mainSide],['left','left']],
  ['WS.SCALE.UNIT_VISIBILITY','scales','scales.scalesCurrencyUnit',{selected:'always'},s=>s.document.scales.currencyAndUnit,'always'],
  ['WS.SCALE.SCALE_TEXT_SIZE','canvas','canvas.scalesText',{selected:'16'},s=>s.appearance.fontSize,16],
  ['WS.LABEL.OVERLAP_LABELS','scales','scales.noOverlappingLabels',{checked:false},s=>s.priceScale?.labels.noOverlap,false],
  ['WS.LABEL.HIGH_LOW','scales','scales.highLowLabelsLines',{items:{value:true,line:true}},s=>[s.priceScale?.labels.highLow,s.appearance.highLowVisible],[true,true]],
  ['WS.LABEL.BID_ASK','scales','scales.bidAskLabelsLines',{items:{value:true,line:true}},s=>[s.priceScale?.labels.bidAsk,s.priceScale?.lines.bidAskLines],[true,true]],
  ['WS.TIME.WEEKDAYS','scales','scales.showWeekdayOnTimeScaleLabels',{checked:false},s=>s.document.scales.dayOfWeek,false],
  ['WS.TIME.HOURS_FORMAT','scales','scales.timeHoursFormat',{selected:'12'},s=>s.document.scales.timeHours,'12'],
  ['WS.CANVAS.NAVIGATION_BUTTONS','canvas','canvas.navButtons',{selected:'never'},s=>s.document.canvas.navigationButtons,'never'],
  ['WS.CANVAS.RIGHT_MARGIN','canvas','canvas.paneRightMargin',{number:25},s=>s.document.canvas.rightMarginBars,25],
  ['WS.CANVAS.WATERMARK_COLOR','canvas','canvas.watermark',{colors:['rgba(10, 20, 30, 0.4)']},s=>s.document.canvas.watermark.color.replace(/\s/g,''),'rgba(10,20,30,0.4)'],
  ['WS.TRADING.OpenCandle.EXTENDED_PRICE_LINES','trading','trading.extendLeftTradingLine',{checked:false},s=>s.document.trading.extendLines,false],
 ];
 for(const [ledger,tab,key,patch,read,expected] of cases)it(ledger+' ('+key+')',()=>{
  expect(keys(tab)).toContain(key);
  const row=findRow(tab,sources(),key)!;
  const next=writeRow(sources(),key,{...structuredClone(row.value),...patch,...(patch.items?{items:{...row.value.items,...patch.items as Record<string,boolean>}}:{})});
  expect(read(next)).toEqual(expected);
  if(next.document!==sources().document)expect(roundTrip(next)).toEqual(next.document);
 });
 it('WS.TIME.DATE_FORMAT: every option writes and round-trips',()=>{
  const row=findRow('scales',sources(),'scales.dateFormat')!;
  expect(row.options!.length).toBeGreaterThan(1);
  for(const option of row.options!){const next=writeRow(sources(),'scales.dateFormat',{selected:option.value});expect(roundTrip(next).scales.dateFormat).toBe(option.value);}
 });
});
