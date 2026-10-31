// Chart settings rows that already drive the chart are shown; the watermark, Trading P&L and alignment rows
// are connected; chart type inputs follow their style facts and show unused inputs disabled. Synthetic data only.
import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {factoryAppearance,factoryPriceScale,findRow,typeRowHidden,typeRowUnused,visibleTabView,visibleTabs,writeRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {chartSettingsSchema,settingsDefaults} from '../../src/chart/chart-settings';
import {watermarkView,WATERMARK_LINE_METRICS} from '../../src/chart/chart-watermark';
import {ChartWatermark} from '../../src/ui/ChartWatermark';
import {ChartSettingsDialog,type ChartSettingsDialogProps} from '../../src/ui/chart-settings-dialog';
import {createMemoryTabMemory} from '../../src/chart/chart-settings-session';
import {createPaperAccount,submitPaperOrder,type PaperAccount} from '../../src/domain/paper';
import {feedPaperBars} from '../../src/domain/paper-bar-feed';
import type {Instrument} from '../../src/domain/types';
import {PaperChartLines,paperChartLines,paperLabelAlignment,paperLineProfitText,type PaperLineProfitSettings} from '../../src/ui/PaperChartLines';

const sources=(extra:Partial<ChartSettingsSources>={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true},...extra});
const keys=(tab:Parameters<typeof visibleTabView>[0],s=sources())=>visibleTabView(tab,s).flatMap(group=>group.rows.map(row=>row.key));
const typed=(style:string,patch:Record<string,unknown>={})=>sources({style,typeSettings:{...settingsDefaults(style),...patch}});
const row=(s:ChartSettingsSources,key:string)=>{const found=findRow('symbol',s,key);if(!found)throw Error('no row '+key);return found;};

describe(' Chart settings rows that already work are shown',()=>{
 it('Alerts tab: Alert lines and Only active alerts (alertLineRows reads both); Events stays hidden (no event data)',()=>{
  // Events shows Dividends and Splits (ChartEventMarkers); earnings have no source and stay stored.
  expect(visibleTabs(sources(),true)).toEqual(['symbol','legend','scales','canvas','trading','alerts','events','datasources']);
  // decision: Automatically hide toasts is live (the alert popup host follows it), so it is shown too.
  // Alert volume is live (alert-sound.ts follows it), so it is shown too.
  // The LV Alert labels row (lv.alerts.labels) sits under Alert lines.
  expect(keys('alerts')).toEqual(['alerts.colorAlertsLine','lv.alerts.labels','alerts.showActiveOnly','alerts.alertVolume','alerts.hideToasts']);
  // Earnings is live (CalendarChartMarkers marks calendar earnings).
  expect(keys('events')).toEqual(['events.symbolDividends','events.symbolSplits','events.earnings','events.economicEvents','events.lastNews','events.notificationAboutNews']); // The news rows were made live (NewsChartMarkers)
 });
 it('Symbol: Adjust data for dividends (Alpaca feeds reload by it); Canvas: Watermark and Right margin',()=>{
  expect(keys('symbol')).toContain('symbol.candleSymbolDividendsAdjustment');
  expect(keys('canvas')).toEqual(expect.arrayContaining(['canvas.watermark','canvas.paneRightMargin']));
  const next=writeRow(sources(),'canvas.paneRightMargin',{number:25});expect(next.document.canvas.rightMarginBars).toBe(25);
 });
 it('Trading: Buy/sell buttons, Positions and orders, Profit and loss value with Positions and Brackets, alignment',()=>{
  expect(keys('trading')).toEqual(['trading.tradingSellBuyPanel','trading.tradingConfirmEnabled','trading.tradingSoundVolume','trading.tradingSoundMelody','trading.tradingNotifications','trading.tradingPositionsAndOrders','trading.reverseButton','trading.marketProjectOrderVisibility','trading.positionAndBracketsPL','trading.positionPL','trading.bracketsPLDisplay','trading.tradingExecutions','trading.tradingExecutionsLables','trading.extendLeftTradingLine','trading.positionAlign','trading.visibilityOnScreenshotTitle']);// Extended price lines are live (PaperChartLines extendLines)
  const off=writeRow(sources(),'trading.positionAndBracketsPL',{checked:false});
  const child=visibleTabView('trading',off).flatMap(group=>group.rows).find(item=>item.key==='trading.positionPL')!;
  expect(child.disabledParts).toEqual(['check','select']);
 });
 // The Price and percentage value select is read now (the change row under the last price chip), so it is enabled.
 it('Symbol labels: the Price and percentage value select is live, so it is enabled',()=>{
  const symbol=visibleTabView('scales',sources()).flatMap(group=>group.rows).find(item=>item.key==='scales.symbolLabelsLines')!;
  expect(symbol.disabledParts).not.toContain('sub');
 });
});

describe(' watermark',()=>{
 const subject={symbol:'SYNTH',interval:'1D',description:'Synthetic Corp',replay:false};
 it('default (Replay mode only) shows nothing outside replay and the ticker and interval line in replay',()=>{
  const settings=defaultChartSettingsDocument().canvas.watermark;
  expect(watermarkView(settings,subject)).toBeNull();
  expect(watermarkView(settings,{...subject,replay:true})).toEqual({color:'rgba(80, 83, 94, 0.3)',lines:[{id:'line0',text:'SYNTH, 1D',fontSize:80,lineHeight:80}]});
 });
 it('Ticker, Interval and Description lines use the fact font metrics; markup is inert',()=>{
  const settings={ticker:true,interval:false,description:true,replay:false,color:'#123456'};
  expect(watermarkView(settings,subject)!.lines).toEqual([{id:'line0',text:'SYNTH',...WATERMARK_LINE_METRICS.line0},{id:'line1',text:'Synthetic Corp',fontSize:36,lineHeight:44}]);
  const html=renderToStaticMarkup(React.createElement(ChartWatermark,{settings,subject}));
  expect(html).toContain('aria-hidden="true"');expect(html).toContain('pointer-events:none');expect(html).toContain('color:#123456');expect(html).toContain('>Synthetic Corp<');
  expect(renderToStaticMarkup(React.createElement(ChartWatermark,{settings:{...settings,ticker:false,description:false},subject}))).toBe('');
 });
 it('every grid cell draws it, with replay taken from the cell execution identity or the all-charts replay frames',()=>{
  const grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
  expect(grid).toContain('<ChartWatermark settings={(chartSettings??defaultChartSettingsDocument()).canvas.watermark}');
  expect(grid).toContain("replayActive={selected&&(props.activeExecutionIdentity??'ordinary')!=='ordinary'||!!props.replayCellBars?.[row.id]}");
 });
});

describe(' chart type inputs',()=>{
 // the reference app shows only the chosen method's input, so the others are hidden, not disabled.
 it('Renko, Kagi and P&F: Box size method ATR (fact default) shows only ATR length; Traditional and Percentage show only their own input',()=>{
  for(const [style,fixed,method] of [['renko','boxSize','boxMethod'],['kagi','reversalAmount','reversalMethod'],['pointfigure','boxSize','boxMethod']] as const){
   const atr=typed(style);expect(row(atr,`type.${style}.atrLength`).disabledParts,style).toEqual([]);
   expect(findRow('symbol',atr,`type.${style}.${fixed}`),style).toBeNull();expect(findRow('symbol',atr,`type.${style}.percentage`),style).toBeNull();
   const traditional=typed(style,{[method]:'Traditional'});expect(row(traditional,`type.${style}.${fixed}`).disabledParts).toEqual([]);expect(findRow('symbol',traditional,`type.${style}.atrLength`)).toBeNull();expect(findRow('symbol',traditional,`type.${style}.percentage`)).toBeNull();
   const percentage=typed(style,{[method]:'Percentage'});expect(row(percentage,`type.${style}.percentage`).disabledParts).toEqual([]);expect(findRow('symbol',percentage,`type.${style}.atrLength`)).toBeNull();expect(findRow('symbol',percentage,`type.${style}.${fixed}`)).toBeNull();
   expect(row(atr,`type.${style}.${method}`)).toMatchObject({label:'Box size method',options:[{value:'ATR',label:'ATR'},{value:'Traditional',label:'Traditional'},{value:'Percentage',label:'Percentage (last traded price)'}]});
  }
  // Kagi in ATR mode has no Reversal amount (reference); hidden values are kept.
  expect(typeRowHidden('kagi','reversalAmount',{reversalMethod:'ATR'})).toBe(true);expect(typed('kagi').typeSettings!.reversalAmount).toBe(1);
  expect(row(typed('pointfigure'),'type.pointfigure.reversalAmount').disabledParts).toEqual([]);
  expect(typeRowUnused('renko','wickUpColor',{wicks:false})).toBe(true);expect(typeRowUnused('renko','wickUpColor',{wicks:true})).toBe(false);
 });
 it('fact defaults: Renko box 3 ATR 14 wicks, Kagi reversal 1, P&F box 1 reversal 3, Line break 3 lines, Range 100 (100R)',()=>{
  expect(settingsDefaults('renko')).toMatchObject({boxMethod:'ATR',boxSize:3,atrLength:14,percentage:1,wicks:true,source:'close'});
  expect(settingsDefaults('kagi')).toMatchObject({reversalMethod:'ATR',reversalAmount:1,atrLength:14,percentage:1});
  expect(settingsDefaults('pointfigure')).toMatchObject({boxMethod:'ATR',boxSize:1,reversalAmount:3,atrLength:14});
  expect(settingsDefaults('linebreak')).toMatchObject({lines:3});expect(settingsDefaults('range')).toMatchObject({range:100,phantomBars:false});// 100R, the interval the reference app sets on switching to Range.
 });
 // the reference app Range candles have body, border and wick colors with no toggles and no Thin bars; each mode hides the other's rows.
 it('Range: bars show Thin bars and the up and down colors, candles show the candle colors only (no Borders or Wicks toggles)',()=>{
  const bars=typed('range');expect(findRow('symbol',bars,'type.range.candlesUpColor')).toBeNull();expect(row(bars,'type.range.thinBars').disabledParts).toEqual([]);
  const candles=typed('range',{rangeStyle:'candles'});expect(findRow('symbol',candles,'type.range.thinBars')).toBeNull();expect(findRow('symbol',candles,'type.range.color')).toBeNull();expect(row(candles,'type.range.candlesUpColor').disabledParts).toEqual([]);expect(row(candles,'type.range.candlesWickUpColor').disabledParts).toEqual([]);
  expect(chartSettingsSchema('range').fields.map(field=>field.key)).not.toContain('bordersVisible');expect(chartSettingsSchema('range').fields.map(field=>field.key)).not.toContain('wicksVisible');
 });
 it('High-low offers Body, Borders and label color (style.hiloStyle); Baseline offers the base level line color #8C8C8C (style.baselineStyle)',()=>{
  // re-pin: the LV previous-close coloring rows (previousClose off, downColor #F23645) follow the hiloStyle rows; the fact rows and values are unchanged.
  expect(chartSettingsSchema('highlow').fields.map(field=>field.key)).toEqual(['bodyVisible','color','borderVisible','borderColor','labelsVisible','labelColor','previousClose','downColor']);
  expect(settingsDefaults('highlow')).toEqual({bodyVisible:true,color:'#2962FF',borderVisible:true,borderColor:'#2962FF',labelsVisible:true,labelColor:'#2962FF',previousClose:false,downColor:'#F23645'});
  expect(settingsDefaults('baseline').baselineColor).toBe('#8C8C8C');
  expect(row(typed('highlow',{borderVisible:false}),'type.highlow.borderColor').disabledParts).toContain('colors');
 });
 it('the dialog shows only the chosen box size input',()=>{
  const props:ChartSettingsDialogProps={themeId:'lv-dark',appearance:factoryAppearance(),onPreview(){},onApply(){},onCancel(){},document:defaultChartSettingsDocument(),priceScale:factoryPriceScale(),ratio:0.5,timezone:'UTC',exchangeTimezone:null,chartStyle:'renko',typeSettings:settingsDefaults('renko'),initialTab:'symbol',tabMemory:createMemoryTabMemory()};
  const html=renderToStaticMarkup(React.createElement(ChartSettingsDialog,props));
  expect(html).not.toMatch(/aria-label="Box size"/);expect(html).toMatch(/aria-label="ATR length"/);expect(html).not.toMatch(/aria-label="ATR length"[^>]*disabled=""/);
 });
});

describe(' Trading P&L and alignment on the virtual lines',()=>{
 const instrument:Instrument={id:'SYNTHETIC:R26',symbol:'R26',name:'Synthetic R26',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'};
 const bar=(time:number,close:number)=>({time,open:close,high:close,low:close,close,volume:1});
 const feed=(account:PaperAccount,...bars:ReturnType<typeof bar>[])=>feedPaperBars(account,{bars,instrument,provenance:{fixture:false,session:'regular'},live:false}).account;
 const bracketed=()=>{const placed=submitPaperOrder(feed(createPaperAccount(),bar(60,100)),{instrument,quantity:2,side:'buy',type:'market',exits:{schemaVersion:1,mode:'single',levels:[{quantity:2,takeProfit:110,stopLoss:95}]}} as never,60);expect(placed.ok).toBe(true);return feed(placed.account,bar(60,100),bar(120,100));};
 const settings=(display:'money'|'ticks'|'percent',extra:Partial<PaperLineProfitSettings>={}):PaperLineProfitSettings=>({visible:true,position:{visible:true,display},brackets:{visible:true,display},...extra});
 it('formats Money, Ticks and % in the position direction',()=>{
  expect(paperLineProfitText(2,100,110,0.01,'money')).toBe('P&L +20.00');expect(paperLineProfitText(-2,100,110,0.01,'money')).toBe('P&L -20.00');
  expect(paperLineProfitText(2,100,95,0.01,'ticks')).toBe('P&L -500 ticks');expect(paperLineProfitText(2,100,100.01,0.01,'ticks')).toBe('P&L +1 tick');
  expect(paperLineProfitText(-3,50,49,0.01,'percent')).toBe('P&L +2.00%');expect(paperLineProfitText(2,100,null,0.01,'money')).toBe('P&L unavailable');
 });
 it('brackets carry their projected P&L; the toggles hide it; no settings keeps the old labels',()=>{
  const account=bracketed(),labels=(options?:PaperLineProfitSettings)=>paperChartLines(account,instrument,{profitLoss:options}).map(line=>line.label);
  expect(labels(settings('money'))).toEqual(expect.arrayContaining(['Take profit 2 at 110.00, P&L +20.00','Stop loss 2 at 95.00, P&L -10.00']));
  expect(labels(settings('percent'))).toEqual(expect.arrayContaining(['Take profit 2 at 110.00, P&L +10.00%']));
  expect(labels({...settings('money'),visible:false}).every(label=>!label.includes('P&L'))).toBe(true);
  expect(labels(settings('money',{brackets:{visible:false,display:'money'}})).filter(label=>label.includes('P&L'))).toHaveLength(1);
  expect(labels()).toEqual(expect.arrayContaining(['Take profit 2 at 110.00','Stop loss 2 at 95.00']));
 });
 it('alignment places the labels left, center or right; App passes the Trading settings',()=>{
  expect(paperLabelAlignment('right')).toBeUndefined();expect(paperLabelAlignment('left')).toEqual({left:64,right:'auto'});expect(paperLabelAlignment('center')).toMatchObject({left:'50%'});
  const projection={left:0,top:0,width:600,height:300,priceToY:(price:number)=>(120-price)*10,yToPrice:(y:number)=>120-y/10};
  const html=renderToStaticMarkup(React.createElement(PaperChartLines,{account:bracketed(),instrument,visible:true,projection:()=>projection,onModifyOrder:()=>true,onCancelOrder:()=>{},onClosePosition:()=>{},alignment:'left'}));
  expect(html).toContain('class="chip" style="left:64px;right:auto"');
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('profitLoss={{visible:shownSettings.trading.profitLoss,position:shownSettings.trading.positionPL,brackets:shownSettings.trading.bracketsPL}} alignment={shownSettings.trading.alignment}');/* App passes the live-previewed settings (shownSettings; the saved ones unless Chart settings is open) */
 });
});
