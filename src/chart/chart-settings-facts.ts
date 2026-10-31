// Chart Settings dialog structure: tabs, groups, controls, labels, control types,
// option lists and observed defaults. Every entry carries a factId.
// The code and every LV description string are OpenCandle's own.

export type ReferenceTabId='symbol'|'legend'|'scales'|'canvas'|'trading'|'alerts'|'events';
/** OpenCandle adds two tabs to the seven recorded ones: General (app preferences) and Data sources (live feeds, market data key and saved-work controls). */
export type ChartSettingsTabId=ReferenceTabId|'general'|'datasources';

/** Tabs in reference order (tab.symbol .. tab.events). `id` is the observed DOM id. */
export const CHART_SETTINGS_TABS:readonly {id:ReferenceTabId;label:string;factId:string}[]=Object.freeze([
 {id:'symbol',label:'Symbol',factId:'tab.symbol'},
 {id:'legend',label:'Status line',factId:'tab.legend'},
 {id:'scales',label:'Scales and lines',factId:'tab.scales'},
 {id:'canvas',label:'Canvas',factId:'tab.canvas'},
 {id:'trading',label:'Trading',factId:'tab.trading'},
 {id:'alerts',label:'Alerts',factId:'tab.alerts'},
 {id:'events',label:'Events',factId:'tab.events'},
]);
/** LV-only tabs, after the recorded ones (not part of the reference facts). */
export const LV_TABS:readonly {id:'general'|'datasources';label:string}[]=Object.freeze([{id:'general',label:'General'},{id:'datasources',label:'Data sources'}]);
/** Every tab in rail order. */
export const CHART_SETTINGS_TAB_IDS:readonly ChartSettingsTabId[]=Object.freeze([...CHART_SETTINGS_TABS.map(tab=>tab.id),...LV_TABS.map(tab=>tab.id)]);
export const ALL_TABS:readonly {id:ChartSettingsTabId;label:string;factId?:string}[]=Object.freeze([...CHART_SETTINGS_TABS,...LV_TABS]);
/** Dialog height for the LV tab (the Alerts height until measured). */
export const LV_TAB_HEIGHTS:Readonly<Record<'general'|'datasources',number>>=Object.freeze({general:463,datasources:463});
export function isChartSettingsTab(value:unknown):value is ChartSettingsTabId{return typeof value==='string'&&(CHART_SETTINGS_TAB_IDS as readonly string[]).includes(value);}

/** dialog.shell geometry and footer (footer.template, footer.cancel, footer.ok). Heights were measured at a
 * 1920x1080 viewport; the dialog is clamped to the viewport minus 20px above and below and the content scrolls. */
export const CHART_SETTINGS_DIALOG=Object.freeze({
 factId:'dialog.shell',
 title:'Settings',
 /** Shown heading and accessible name; the reference label above stays the fact. */
 heading:'Chart settings',
 width:750,
 viewportMargin:20,
 heightBySelectedTab:Object.freeze({symbol:613,legend:839,scales:1040,canvas:959,trading:1040,alerts:463,events:533} as Record<ReferenceTabId,number>),
 closeLabel:'Close menu',
 closeSize:34,
 tabWidth:206,
 tabHeight:40,
 firstTabTop:76,
 footer:Object.freeze({template:'Template',cancel:'Cancel',ok:'OK'}), // LV writes "OK" (the reference reads "Ok").
 /** footer.template options, in order. */
 templateActions:Object.freeze({applyDefaults:'Apply defaults',saveAs:'Save as…'}),
 firstOpenTab:'symbol' as ChartSettingsTabId,
});
/** Measured height of a tab's dialog (the LV tab uses its own value). */
export function settingsTabHeight(tab:ChartSettingsTabId):number{return tab==='datasources'||tab==='general'?LV_TAB_HEIGHTS[tab]:CHART_SETTINGS_DIALOG.heightBySelectedTab[tab];}

export type ChartSettingsControlType=
 'checkbox'|'checkbox+color+color'|'select'|'checkbox+select'|'checkbox+opacity-slider'|'checkbox+number'|
 'multi-check-menu'|'multi-check-menu+color'|'multi-check-menu+color+thickness'|'multi-check-menu+color+color'|'multi-check-menu+color+color+color'|
 'select+color'|'checkbox+color'|'color+thickness'|'color+select'|'color'|'number'|'checkbox+slider'|'checkbox+checkbox';

export interface ChartSettingsOption {value:string;label:string}
export interface ChartSettingsGroupFact {kind:'group';factId:string;tab:ChartSettingsTabId;order:number;label:string}
export interface ChartSettingsControlFact {
 kind:'control';
 /** The entry's fact id. */
 factId:string;
 /** An LV row with no observed reference fact (kept out of the observed-facts comparison). */
 lvDefined?:boolean;
 tab:ChartSettingsTabId;
 group:string;
 order:number;
 /** Row label as observed. The unlabelled melody dropdown has an empty label. */
 label:string;
 type:ChartSettingsControlType;
 options?:readonly ChartSettingsOption[];
 /** Items of a multi-check menu, in order. */
 items?:readonly ChartSettingsOption[];
 /** Second-line select under a multi-check row (scales.symbolLabelsLines). */
 sub?:{label:string;options:readonly ChartSettingsOption[]};
 /** Nested checkbox label (events.earnings). */
 nested?:string;
 /** Number of color swatches in the row. */
 swatches?:number;
 /** Thickness picker present (color+thickness rows). */
 thickness?:boolean;
 /** Unit shown after a number field. */
 unitSuffix?:string;
 min?:number;max?:number;
 /** Child row (observed indentation). */
 indent?:boolean;
 /** A help (?) link was observed; OpenCandle shows its own help text instead of a link. */
 help?:boolean;
}
export type ChartSettingsEntryFact=ChartSettingsGroupFact|ChartSettingsControlFact;

const opt=(value:string,label:string):ChartSettingsOption=>({value,label});
const visibility=Object.freeze([opt('mouseover','Visible on mouse over'),opt('always','Always visible'),opt('never','Always invisible')]);

/** symbol.candleSymbolMinTick: Default, Integer, 1-15 decimals, then 1/2 .. 1/320. */
export const PRECISION_OPTIONS:readonly ChartSettingsOption[]=Object.freeze([
 opt('default','Default'),opt('integer','Integer'),
 ...Array.from({length:15},(_,index)=>opt(String(index+1),index===0?'1 decimal':`${index+1} decimals`)),
 ...['2','4','8','16','32','64','128','320'].map(denominator=>opt('1/'+denominator,'1/'+denominator)),
]);

/** symbol.candleSymbolTimezone: "UTC", "Exchange", then 97 "(UTC±h) City" entries sorted by offset. The
 * offset prefix is computed for the current date (the observed labels show the offsets of 2026-10-16).
 * The IANA zone for each city is OpenCandle's mapping; city names and order are facts. */
export const TIMEZONE_CITIES:readonly {city:string;zone:string}[]=Object.freeze([
 ['Honolulu','Pacific/Honolulu'],['Anchorage','America/Anchorage'],['Juneau','America/Juneau'],['Los Angeles','America/Los_Angeles'],['Phoenix','America/Phoenix'],['Vancouver','America/Vancouver'],
 ['Denver','America/Denver'],['Mexico City','America/Mexico_City'],['San Salvador','America/El_Salvador'],['Bogota','America/Bogota'],['Chicago','America/Chicago'],['Lima','America/Lima'],
 ['Caracas','America/Caracas'],['New York','America/New_York'],['Toronto','America/Toronto'],['Buenos Aires','America/Argentina/Buenos_Aires'],['Halifax','America/Halifax'],['Santiago','America/Santiago'],
 ['Sao Paulo','America/Sao_Paulo'],['Azores','Atlantic/Azores'],['Reykjavik','Atlantic/Reykjavik'],['Casablanca','Africa/Casablanca'],['Dublin','Europe/Dublin'],['Lagos','Africa/Lagos'],
 ['Lisbon','Europe/Lisbon'],['London','Europe/London'],['Tunis','Africa/Tunis'],['Amsterdam','Europe/Amsterdam'],['Belgrade','Europe/Belgrade'],['Berlin','Europe/Berlin'],
 ['Bratislava','Europe/Bratislava'],['Brussels','Europe/Brussels'],['Budapest','Europe/Budapest'],['Copenhagen','Europe/Copenhagen'],['Johannesburg','Africa/Johannesburg'],['Ljubljana','Europe/Ljubljana'],
 ['Luxembourg','Europe/Luxembourg'],['Madrid','Europe/Madrid'],['Malta','Europe/Malta'],['Oslo','Europe/Oslo'],['Paris','Europe/Paris'],['Prague','Europe/Prague'],
 ['Rome','Europe/Rome'],['Stockholm','Europe/Stockholm'],['Vienna','Europe/Vienna'],['Warsaw','Europe/Warsaw'],['Zagreb','Europe/Zagreb'],['Zurich','Europe/Zurich'],
 ['Athens','Europe/Athens'],['Bahrain','Asia/Bahrain'],['Bucharest','Europe/Bucharest'],['Cairo','Africa/Cairo'],['Helsinki','Europe/Helsinki'],['Istanbul','Europe/Istanbul'],
 ['Jerusalem','Asia/Jerusalem'],['Kuwait','Asia/Kuwait'],['Moscow','Europe/Moscow'],['Nairobi','Africa/Nairobi'],['Nicosia','Asia/Nicosia'],['Qatar','Asia/Qatar'],
 ['Riga','Europe/Riga'],['Riyadh','Asia/Riyadh'],['Sofia','Europe/Sofia'],['Tallinn','Europe/Tallinn'],['Vilnius','Europe/Vilnius'],['Tehran','Asia/Tehran'],
 ['Dubai','Asia/Dubai'],['Muscat','Asia/Muscat'],['Kabul','Asia/Kabul'],['Ashgabat','Asia/Ashgabat'],['Astana','Asia/Almaty'],['Karachi','Asia/Karachi'],
 ['Colombo','Asia/Colombo'],['Kolkata','Asia/Kolkata'],['Kathmandu','Asia/Kathmandu'],['Dhaka','Asia/Dhaka'],['Yangon','Asia/Yangon'],['Bangkok','Asia/Bangkok'],
 ['Ho Chi Minh','Asia/Ho_Chi_Minh'],['Jakarta','Asia/Jakarta'],['Chongqing','Asia/Chongqing'],['Hong Kong','Asia/Hong_Kong'],['Kuala Lumpur','Asia/Kuala_Lumpur'],['Manila','Asia/Manila'],
 ['Perth','Australia/Perth'],['Shanghai','Asia/Shanghai'],['Singapore','Asia/Singapore'],['Taipei','Asia/Taipei'],['Seoul','Asia/Seoul'],['Tokyo','Asia/Tokyo'],
 ['Brisbane','Australia/Brisbane'],['Adelaide','Australia/Adelaide'],['Sydney','Australia/Sydney'],['Norfolk Island','Pacific/Norfolk'],['New Zealand','Pacific/Auckland'],['Tokelau','Pacific/Fakaofo'],
 ['Chatham Islands','Pacific/Chatham'],
].map(([city,zone])=>Object.freeze({city,zone})));
export const TIMEZONE_EXCHANGE='exchange';

/** UTC offset of an IANA zone at `at`, in minutes east of UTC; null when the zone is unknown to this runtime. */
const zoneFormatters=new Map<string,Intl.DateTimeFormat|null>();
function zoneFormatter(zone:string):Intl.DateTimeFormat|null{
 if(!zoneFormatters.has(zone)){let format:Intl.DateTimeFormat|null=null;try{format=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{format=null;}zoneFormatters.set(zone,format);}
 return zoneFormatters.get(zone)??null;
}
export function zoneOffsetMinutes(zone:string,at:Date):number|null{
 try{
  const format=zoneFormatter(zone);if(!format)return null;
  const parts=format.formatToParts(at);
  const read=(type:string)=>Number(parts.find(part=>part.type===type)?.value);
  const local=Date.UTC(read('year'),read('month')-1,read('day'),read('hour'),read('minute'),read('second'));
  const minutes=Math.round((local-Math.floor(at.getTime()/1000)*1000)/60000);
  return Number.isFinite(minutes)?minutes:null;
 }catch{return null;}
}
/** "(UTC-7)", "(UTC)", "(UTC+5:30)" for an offset in minutes. */
export function utcOffsetLabel(minutes:number):string{
 if(minutes===0)return '(UTC)';
 const sign=minutes<0?'-':'+',absolute=Math.abs(minutes),hours=Math.floor(absolute/60),rest=absolute%60;
 return `(UTC${sign}${hours}${rest?':'+String(rest).padStart(2,'0'):''})`;
}
/** Timezone options for `at`: UTC, Exchange, then the cities sorted by their offset on that date (stable on
 * the reference order for equal offsets). Zones this runtime cannot resolve are left out. */
// Cached per half hour of UTC, not per hour: some listed zones change offset on a half hour of UTC
// (Australia/Adelaide at 16:30 UTC).
let optionCache:{hour:number;options:ChartSettingsOption[]}|null=null;
export function timezoneOptions(at:Date=new Date()):ChartSettingsOption[]{
 const hour=Math.floor(at.getTime()/1800000);if(optionCache?.hour===hour)return optionCache.options.map(option=>({...option}));
 const rows=TIMEZONE_CITIES.map((row,index)=>({row,index,offset:zoneOffsetMinutes(row.zone,at)})).filter((row):row is {row:typeof row.row;index:number;offset:number}=>row.offset!==null);
 rows.sort((left,right)=>left.offset-right.offset||left.index-right.index);
 const options=[opt('UTC','UTC'),opt(TIMEZONE_EXCHANGE,'Exchange'),...rows.map(({row,offset})=>opt(row.zone,`${utcOffsetLabel(offset)} ${row.city}`))];
 optionCache={hour,options};return options.map(option=>({...option}));
}

/** scales.dateFormat: 19 formats, labels are the sample date 29 Sep 1997. The weekday prefix ("Mon ") is shown
 * while "Day of week on labels" is on. Two formats render identically on the sample date (5 and 6); LV keeps
 * both as separate entries with ordinal ids. */
export const DATE_FORMAT_OPTIONS:readonly ChartSettingsOption[]=Object.freeze([
 "Q3 '97","Q3 1997","29 Sep '97","Sep '97","Sep 29, 1997","Sep 29, 1997","Sep 1997","Sep 29","29 Sep","1997-09-29","97-09-29","97/09/29","1997/09/29","29-09-1997","29-09-97","29/09/97","29/09/1997","09/29/97","09/29/1997",
].map((label,index)=>opt('format-'+(index+1),label)));
export const DATE_FORMAT_WEEKDAY_PREFIX='Mon ';

/** canvas.scalesText font sizes. */
export const SCALE_FONT_SIZES:readonly number[]=Object.freeze([8,10,11,12,14,16,18,20,22,24,28,32,40]);

const group=(tab:ChartSettingsTabId,factId:string,order:number,label:string):ChartSettingsGroupFact=>({kind:'group',factId,tab,order,label});
const control=(tab:ChartSettingsTabId,groupId:string,factId:string,order:number,label:string,type:ChartSettingsControlType,extra:Partial<ChartSettingsControlFact>={}):ChartSettingsControlFact=>({kind:'control',factId,tab,group:groupId,order,label,type,...extra});

const SYMBOL_GROUP='symbol.group.generalSymbolStylesGroup',DATA_GROUP='symbol.group.dataModififcationGroup';
const LEGEND_SERIES='legend.group.seriesLegendVisibilityGroup',LEGEND_STUDIES='legend.group.studiesLegendVisibilityGroup';
const SCALES_PRICE='scales.group.scalesPriceScaleGroup',SCALES_LABELS='scales.group.scalesLabelsLineGroup',SCALES_TIME='scales.group.scalesTimeScaleGroup';
const CANVAS_BASIC='canvas.group.chartBasicStylesAppearanceGroup',CANVAS_SCALES='canvas.group.scalesAppearanceGroup',CANVAS_BUTTONS='canvas.group.buttonsAppearanceGroup',CANVAS_MARGINS='canvas.group.marginsAppearanceGroup';
const TRADING_GENERAL='trading.group.generalVisibilityGroup',TRADING_APPEARANCE='trading.group.appearanceVisibilityGroup';
const ALERTS_LINES='alerts.group.alertsLinesGroup',ALERTS_NOTIFY='alerts.group.alertsNotificationGroup';
const EVENTS_GROUP='events.group.eventsGroup';
const plDisplay=Object.freeze([opt('money','Money'),opt('ticks','Ticks'),opt('percent','%')]);

/** Candle rows of the Symbol tab (observed for the default Candles chart type). */
export const SYMBOL_CANDLE_FACTS:readonly ChartSettingsEntryFact[]=Object.freeze([
 group('symbol',SYMBOL_GROUP,1,'Candles'),
 control('symbol',SYMBOL_GROUP,'symbol.mainSeriesSymbolCandleStyleBarColorsOnPrevClose',2,'Color bars based on previous close','checkbox'),
 control('symbol',SYMBOL_GROUP,'symbol.mainSeriesSymbolcandleCandlesColor',3,'Body','checkbox+color+color',{swatches:2}),
 control('symbol',SYMBOL_GROUP,'symbol.mainSeriesSymbolcandleBordersColor',4,'Borders','checkbox+color+color',{swatches:2}),
 control('symbol',SYMBOL_GROUP,'symbol.mainSeriesSymbolcandleWickColors',5,'Wick','checkbox+color+color',{swatches:2}),
]);
/** Data modification rows of the Symbol tab (shown for every chart type). */
export const SYMBOL_DATA_FACTS:readonly ChartSettingsEntryFact[]=Object.freeze([
 group('symbol',DATA_GROUP,6,'Data modification'),
 control('symbol',DATA_GROUP,'symbol.candleSymbolDividendsAdjustment',7,'Adjust data for dividends','checkbox',{help:true}),
 control('symbol',DATA_GROUP,'symbol.candleSymbolMinTick',8,'Precision','select',{options:PRECISION_OPTIONS}),
 control('symbol',DATA_GROUP,'symbol.candleSymbolTimezone',9,'Timezone','select'),
]);
export const SYMBOL_DATA_GROUP_ID=DATA_GROUP;
export const SYMBOL_STYLE_GROUP_ID=SYMBOL_GROUP;

/** Every other tab, in reference order. */
export const TAB_FACTS:Readonly<Record<Exclude<ReferenceTabId,'symbol'>,readonly ChartSettingsEntryFact[]>>=Object.freeze({
 legend:Object.freeze([
  group('legend',LEGEND_SERIES,1,'Instrument'),
  control('legend',LEGEND_SERIES,'legend.showLogo',2,'Logo','checkbox'),
  control('legend',LEGEND_SERIES,'legend.symbolTextSource',3,'Title','checkbox+select',{options:[opt('name','Name'),opt('symbol','Symbol'),opt('symbolAndName','Symbol and name')]}),
  control('legend',LEGEND_SERIES,'legend.ohlcTitle',4,'Chart values','checkbox'),
  control('legend',LEGEND_SERIES,'legend.barChange',5,'Bar change values','checkbox'),
  control('legend',LEGEND_SERIES,'legend.barVolume',6,'Volume','checkbox'),
  control('legend',LEGEND_SERIES,'legend.lastDayChange',7,'Last day change values','checkbox'),
  control('legend',LEGEND_SERIES,'legend.tradingSellBuyPanel',8,'Buy/sell buttons','checkbox'),
  group('legend',LEGEND_STUDIES,9,'Indicators'),
  control('legend',LEGEND_STUDIES,'legend.studyTitles',10,'Titles','checkbox'),
  control('legend',LEGEND_STUDIES,'legend.studyArguments',11,'Inputs','checkbox',{indent:true}),
  control('legend',LEGEND_STUDIES,'legend.studyValues',12,'Values','checkbox'),
  control('legend',LEGEND_STUDIES,'legend.legendBgTransparency',13,'Background','checkbox+opacity-slider',{min:0,max:100}),
 ]),
 scales:Object.freeze([
  group('scales',SCALES_PRICE,1,'Price Scale'),
  control('scales',SCALES_PRICE,'scales.scalesCurrencyUnit',2,'Currency and Unit','select',{options:visibility}),
  control('scales',SCALES_PRICE,'scales.autoLogButtonsVisibility',3,'Scale modes (A and L)','select',{options:visibility}),
  control('scales',SCALES_PRICE,'scales.lockScale',4,'Lock price to bar ratio','checkbox+number'),
  control('scales',SCALES_PRICE,'scales.scalesPlacement',5,'Scales placement','select',{options:[opt('left','Stack on the left'),opt('right','Stack on the right'),opt('auto','Auto')]}),
  group('scales',SCALES_LABELS,6,'Price labels & lines'),
  control('scales',SCALES_LABELS,'scales.noOverlappingLabels',7,'No overlapping labels','checkbox'),
  control('scales',SCALES_LABELS,'scales.addPlusButton',8,'Plus button','checkbox',{help:true}),
  control('scales',SCALES_LABELS,'scales.countdown',9,'Countdown to bar close','checkbox'),
  control('scales',SCALES_LABELS,'scales.symbolLabelsLines',10,'Symbol','multi-check-menu+color+thickness',{items:[opt('name','Name'),opt('value','Value'),opt('line','Line')],thickness:true,swatches:0,sub:{label:'',options:[opt('pricePercent','Price and percentage value'),opt('scale','Value according to scale')]}}),
  control('scales',SCALES_LABELS,'scales.indicatorsLabelsLines',11,'Indicators and financials','multi-check-menu',{items:[opt('name','Name'),opt('value','Value')]}),
  control('scales',SCALES_LABELS,'scales.prePostLabelsLines',12,'Pre/post/night market','multi-check-menu+color+color+color',{items:[opt('value','Value'),opt('line','Line')],swatches:3}),
  control('scales',SCALES_LABELS,'scales.highLowLabelsLines',13,'High and low','multi-check-menu+color+thickness',{items:[opt('value','Value'),opt('line','Line')],thickness:true,swatches:0}),
  control('scales',SCALES_LABELS,'scales.bidAskLabelsLines',14,'Bid and ask','multi-check-menu+color+color',{items:[opt('value','Value'),opt('line','Line')],swatches:2}),
  group('scales',SCALES_TIME,15,'Time Scale'),
  control('scales',SCALES_TIME,'scales.showWeekdayOnTimeScaleLabels',16,'Day of week on labels','checkbox'),
  control('scales',SCALES_TIME,'scales.dateFormat',17,'Date format','select',{options:DATE_FORMAT_OPTIONS}),
  control('scales',SCALES_TIME,'scales.timeHoursFormat',18,'Time hours format','select',{options:[opt('24','24-hours'),opt('12','12-hours')]}),
  control('scales',SCALES_TIME,'scales.saveLeftChartEdge',19,'Save chart left edge position when changing interval','checkbox'),
 ]),
 canvas:Object.freeze([
  group('canvas',CANVAS_BASIC,1,'Chart basic styles'),
  control('canvas',CANVAS_BASIC,'canvas.chartBackground',2,'Background','select+color',{options:[opt('solid','Solid'),opt('gradient','Gradient')],swatches:1}),
  control('canvas',CANVAS_BASIC,'canvas.vertGridLines',3,'Vertical grid lines','checkbox+color',{swatches:1}),
  control('canvas',CANVAS_BASIC,'canvas.horzGridLines',4,'Horizontal grid lines','checkbox+color',{swatches:1}),
  control('canvas',CANVAS_BASIC,'canvas.crossHair',5,'Crosshair','color+thickness',{swatches:1,thickness:true}),
  control('canvas',CANVAS_BASIC,'canvas.watermark',6,'Watermark','multi-check-menu+color',{items:[opt('ticker','Ticker'),opt('interval','Interval'),opt('description','Description'),opt('replay','Replay mode')],swatches:1}),
  group('canvas',CANVAS_SCALES,7,'Scales'),
  control('canvas',CANVAS_SCALES,'canvas.scalesText',8,'Text','color+select',{swatches:1,options:SCALE_FONT_SIZES.map(size=>opt(String(size),String(size)))}),
  control('canvas',CANVAS_SCALES,'canvas.scalesLine',9,'Lines','color',{swatches:1}),
  group('canvas',CANVAS_BUTTONS,10,'Buttons'),
  control('canvas',CANVAS_BUTTONS,'canvas.navButtons',11,'Navigation','select',{options:visibility}),
  control('canvas',CANVAS_BUTTONS,'canvas.paneButtons',12,'Pane','select',{options:visibility}),
  group('canvas',CANVAS_MARGINS,13,'Margins'),
  control('canvas',CANVAS_MARGINS,'canvas.paneTopMargin',14,'Top','number',{unitSuffix:'%'}),
  control('canvas',CANVAS_MARGINS,'canvas.paneBottomMargin',15,'Bottom','number',{unitSuffix:'%'}),
  control('canvas',CANVAS_MARGINS,'canvas.paneRightMargin',16,'Right','number',{unitSuffix:'bars'}),
 ]),
 trading:Object.freeze([
  group('trading',TRADING_GENERAL,1,'general'),
  control('trading',TRADING_GENERAL,'trading.tradingSellBuyPanel',2,'Buy/sell buttons','checkbox'),
  control('trading',TRADING_GENERAL,'trading.tradingConfirmEnabled',3,'One-click trading','checkbox',{help:true}),
  control('trading',TRADING_GENERAL,'trading.tradingSoundVolume',4,'Execution sound','checkbox+slider',{min:0,max:1}),
  control('trading',TRADING_GENERAL,'trading.tradingSoundMelody',5,'','select',{indent:true,options:[opt('Alarm Clock','Alarm Clock')]}),
  control('trading',TRADING_GENERAL,'trading.tradingNotifications',6,'Show only rejection notifications','checkbox'),
  group('trading',TRADING_APPEARANCE,7,'appearance'),
  control('trading',TRADING_APPEARANCE,'trading.tradingPositionsAndOrders',8,'Positions and orders','checkbox'),
  control('trading',TRADING_APPEARANCE,'trading.reverseButton',9,'Reverse position button','checkbox',{indent:true}),
  control('trading',TRADING_APPEARANCE,'trading.marketProjectOrderVisibility',10,'Project order for market orders','checkbox'),
  control('trading',TRADING_APPEARANCE,'trading.positionAndBracketsPL',11,'Profit and loss value','checkbox',{help:true}),
  control('trading',TRADING_APPEARANCE,'trading.positionPL',12,'Positions','checkbox+select',{indent:true,options:plDisplay}),
  control('trading',TRADING_APPEARANCE,'trading.bracketsPLDisplay',13,'Brackets','checkbox+select',{indent:true,options:plDisplay}),
  control('trading',TRADING_APPEARANCE,'trading.tradingExecutions',14,'Execution marks','checkbox'),
  control('trading',TRADING_APPEARANCE,'trading.tradingExecutionsLables',15,'Execution labels','checkbox',{indent:true}),
  control('trading',TRADING_APPEARANCE,'trading.extendLeftTradingLine',16,'Extended price lines across the entire chart width','checkbox'),
  control('trading',TRADING_APPEARANCE,'trading.positionAlign',17,'Order and position alignment','select',{options:[opt('left','Left'),opt('center','Center'),opt('right','Right')]}),
  control('trading',TRADING_APPEARANCE,'trading.visibilityOnScreenshotTitle',18,'Orders, executions, and positions in chart snapshots','checkbox'),
 ]),
 alerts:Object.freeze([
  group('alerts',ALERTS_LINES,1,'Chart line visibility'),
  control('alerts',ALERTS_LINES,'alerts.colorAlertsLine',2,'Alert lines','checkbox+color',{swatches:1}),
  control('alerts',ALERTS_LINES,'alerts.showActiveOnly',3,'Only active alerts','checkbox'),
  group('alerts',ALERTS_NOTIFY,4,'Notifications'),
  control('alerts',ALERTS_NOTIFY,'alerts.alertVolume',5,'Alert volume','checkbox+slider',{min:0,max:1}),
  control('alerts',ALERTS_NOTIFY,'alerts.hideToasts',6,'Automatically hide toasts','checkbox',{help:true}),
 ]),
 events:Object.freeze([
  group('events',EVENTS_GROUP,1,'Events'),
  control('events',EVENTS_GROUP,'events.ideasFilter',2,'Ideas','checkbox+select',{help:true,options:[opt('all','All ideas')]}),
  control('events',EVENTS_GROUP,'events.symbolDividends',3,'Dividends','checkbox',{indent:true}),
  control('events',EVENTS_GROUP,'events.symbolSplits',4,'Splits','checkbox',{indent:true}),
  control('events',EVENTS_GROUP,'events.earnings',5,'Earnings','checkbox+checkbox',{indent:true,nested:'Earnings breaks'}),
  // Row and order (5.5, after Earnings).
  control('events',EVENTS_GROUP,'events.economicEvents',5.5,'Economic events','checkbox+checkbox',{nested:'Future events only',lvDefined:true}),
  control('events',EVENTS_GROUP,'events.lastNews',6,'Latest news','checkbox'),
  control('events',EVENTS_GROUP,'events.notificationAboutNews',7,'News notification','checkbox'),
 ]),
});

/** Every control fact the dialog implements (candle Symbol rows included). */
export function allControlFacts():ChartSettingsControlFact[]{
 return[...SYMBOL_CANDLE_FACTS,...SYMBOL_DATA_FACTS,...Object.values(TAB_FACTS).flat()].filter((row):row is ChartSettingsControlFact=>row.kind==='control');
}
export function controlFact(factId:string):ChartSettingsControlFact{
 const row=allControlFacts().find(entry=>entry.factId===factId);if(!row)throw Error('Unknown chart settings control: '+factId);return row;
}
/** Multi-check button text: checked item labels joined with ", " (later items in lower case), or "Hidden"
 * when nothing is checked (scales.symbolLabelsLines "Value, line", scales.highLowLabelsLines "Hidden",
 * canvas.watermark "Replay mode"). */
export function multiCheckSummary(items:readonly ChartSettingsOption[],checked:Readonly<Record<string,boolean>>):string{
 const labels=items.filter(item=>checked[item.value]).map((item,index)=>index===0?item.label:item.label.toLowerCase());
 return labels.length?labels.join(', '):'Hidden';
}
