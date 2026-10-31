// Chart Settings document: the dialog values that have no other home in the workspace
// (status line, trading, alerts, events, some scale/canvas rows, saved templates).
// Appearance, chart type settings, price scale settings and the chart timezone keep their
// existing stores; see chart-settings-bindings.ts. Defaults are noted per field.
import {DATE_FORMAT_OPTIONS,PRECISION_OPTIONS} from './chart-settings-facts';
import {supportedColor} from './color-validation';

export type ButtonsVisibility='mouseover'|'always'|'never';
export type ProfitLossDisplay='money'|'ticks'|'percent';
export interface ChartSettingsDocument {
 version:1;
 symbol:{
  /** symbol.candleSymbolDividendsAdjustment (false). */
  dividendsAdjustment:boolean;
  /** symbol.candleSymbolMinTick ("Default"). */
  precision:string;
  /** Extended trading hours: 'extended' shows pre/post-market bars and shades them; 'regular' shows only the
   * 09:30-16:00 New York bars of US equity intraday charts. Default 'extended' (the
   * usual factory session is "regular"): LV's live IEX feed carries extended minutes and older saves showed every bar. */
  session:'regular'|'extended';
 };
 statusLine:{
  logo:boolean; // legend.showLogo (true)
  title:{visible:boolean;source:'name'|'symbol'|'symbolAndName'}; // legend.symbolTextSource (checked, "Name")
  chartValues:boolean; // legend.ohlcTitle (true)
  barChange:boolean; // legend.barChange (true)
  volume:boolean; // legend.barVolume (false)
  lastDayChange:boolean; // legend.lastDayChange (false)
  indicatorTitles:boolean; // legend.studyTitles (true)
  indicatorInputs:boolean; // legend.studyArguments (true)
  /** legend.legendBgTransparency (checked, slider at 50%); static-chart-defaults#statusLine.defaults backgroundTransparency 50. */
  background:{visible:boolean;transparency:number};
 };
 scales:{
  currencyAndUnit:ButtonsVisibility; // scales.scalesCurrencyUnit ("Visible on mouse over")
  scaleModesButtons:ButtonsVisibility; // scales.autoLogButtonsVisibility ("Visible on mouse over")
  symbolValueMode:'scale'|'pricePercent'; // scales.symbolLabelsLines sub-select ("Value according to scale")
  prePostColors:[string,string,string]; // scales.prePostLabelsLines (#FB8C00, #2962FF, #8E24AA)
  bidAskColors:[string,string]; // scales.bidAskLabelsLines (#2962FF, #F7525F)
  dayOfWeek:boolean; // scales.showWeekdayOnTimeScaleLabels (true)
  dateFormat:string; // scales.dateFormat ("29 Sep '97", format-3)
  timeHours:'24'|'12'; // scales.timeHoursFormat ("24-hours")
  saveLeftEdge:boolean; // scales.saveLeftChartEdge (false)
 };
 canvas:{
  /** canvas.watermark (Replay mode only, rgba(80,83,94,0.3)); static-chart-defaults#watermark.defaults (dark). */
  watermark:{ticker:boolean;interval:boolean;description:boolean;replay:boolean;color:string};
  navigationButtons:ButtonsVisibility; // canvas.navButtons ("Visible on mouse over")
  paneButtons:ButtonsVisibility; // canvas.paneButtons ("Visible on mouse over")
  rightMarginBars:number; // canvas.paneRightMargin (10 bars)
  /** No recorded reference fact: dashed vertical lines at session breaks of intraday US equity charts. Default off. */
  sessionBreaks:boolean;
 };
 trading:{
  buySellButtons:boolean; // trading.tradingSellBuyPanel = legend.tradingSellBuyPanel (true)
  oneClick:boolean; // trading.tradingConfirmEnabled (false)
  executionSound:{enabled:boolean;volume:number;melody:string}; // trading.tradingSoundVolume (off, 0.5), trading.tradingSoundMelody ("Alarm Clock")
  rejectionOnly:boolean; // trading.tradingNotifications (false)
  positionsAndOrders:boolean; // trading.tradingPositionsAndOrders (true)
  reverseButton:boolean; // trading.reverseButton (true)
  projectMarketOrders:boolean; // trading.marketProjectOrderVisibility (true)
  profitLoss:boolean; // trading.positionAndBracketsPL (true)
  positionPL:{visible:boolean;display:ProfitLossDisplay}; // trading.positionPL (checked, Money)
  bracketsPL:{visible:boolean;display:ProfitLossDisplay}; // trading.bracketsPLDisplay (checked, Money)
  executionMarks:boolean; // trading.tradingExecutions (true)
  executionLabels:boolean; // trading.tradingExecutionsLables (false)
  extendLines:boolean; // trading.extendLeftTradingLine (true)
  alignment:'left'|'center'|'right'; // trading.positionAlign ("Right")
  inSnapshots:boolean; // trading.visibilityOnScreenshotTitle (false)
 };
 alerts:{
  /** alerts.colorAlertsLine (checked). The default swatch color was not observed: null keeps each alert's own line color. */
  lines:{visible:boolean;color:string|null};
  activeOnly:boolean; // alerts.showActiveOnly (true)
  /** Alert label chips, separate from the lines (default true). */
  labelsVisible:boolean;
  volume:{enabled:boolean;level:number}; // alerts.alertVolume (checked, 0.5)
  /** alerts.hideToasts (checked): alert toasts hide themselves after ALERT_POPUP_AUTOHIDE_MS; off keeps them until dismissed. */
  hideToasts:boolean;
  /** One-time migration flag. A document without it was saved while this setting was stored only, with the
   * old LV default `false` that nobody chose; restore treats that value as unset (on). Documents saved since carry `true`, so an
   * explicit choice made after the migration is kept. */
  hideToastsMigrated:boolean;
 };
 events:{
  ideas:{visible:boolean;filter:'all'}; // events.ideasFilter (unchecked, "All ideas"; other options not observed)
  dividends:boolean; // events.symbolDividends (true)
  splits:boolean; // events.symbolSplits (true)
  earnings:{visible:boolean;breaks:boolean}; // events.earnings (checked; nested Earnings breaks unchecked)
  /** events.economicEvents: economic entries of the local calendar documents on the chart; nested Future events only.
   * Defaults (shown, future only): the reference defaults are not observed. */
  economic:{visible:boolean;futureOnly:boolean};
  latestNews:boolean; // events.lastNews (true)
  newsNotification:boolean; // events.notificationAboutNews (false)
 };
 /** Templates saved with Template > Save as… (newest last). */
 templates:ChartSettingsTemplate[];
}
/** A saved template: appearance keys (serialized with the workspace theme field map), the template-scoped
 * document groups and the current style's settings. Trading, alerts and events are not part of a template. */
export interface ChartSettingsTemplate {
 id:string;
 name:string;
 appearance:Record<string,string|number|boolean>;
 statusLine:ChartSettingsDocument['statusLine'];
 scales:ChartSettingsDocument['scales'];
 canvas:ChartSettingsDocument['canvas'];
 symbol:ChartSettingsDocument['symbol'];
 typeSettings:Record<string,Record<string,unknown>>;
}

export const CHART_SETTINGS_TEMPLATE_LIMIT=50;
export const CHART_SETTINGS_TEMPLATE_NAME_MAX=64;

const DEFAULT_DOCUMENT:ChartSettingsDocument={
 version:1,
 symbol:{dividendsAdjustment:false,precision:'default',session:'extended'},
 statusLine:{logo:true,title:{visible:true,source:'name'},chartValues:true,barChange:true,volume:false,lastDayChange:false,indicatorTitles:true,indicatorInputs:true,background:{visible:true,transparency:50}},
 scales:{currencyAndUnit:'mouseover',scaleModesButtons:'mouseover',symbolValueMode:'scale',prePostColors:['#FB8C00','#2962FF','#8E24AA'],bidAskColors:['#2962FF','#F7525F'],dayOfWeek:true,dateFormat:'format-3',timeHours:'24',saveLeftEdge:false},
 canvas:{watermark:{ticker:false,interval:false,description:false,replay:true,color:'rgba(80, 83, 94, 0.3)'},navigationButtons:'mouseover',paneButtons:'mouseover',rightMarginBars:10,sessionBreaks:false},
 trading:{buySellButtons:true,oneClick:false,executionSound:{enabled:false,volume:0.5,melody:'Alarm Clock'},rejectionOnly:false,positionsAndOrders:true,reverseButton:true,projectMarketOrders:true,profitLoss:true,positionPL:{visible:true,display:'money'},bracketsPL:{visible:true,display:'money'},executionMarks:true,executionLabels:false,extendLines:true,alignment:'right',inSnapshots:false},
 alerts:{lines:{visible:true,color:null},activeOnly:true,labelsVisible:true,volume:{enabled:true,level:0.5},hideToasts:true,hideToastsMigrated:true},
 events:{ideas:{visible:false,filter:'all'},dividends:true,splits:true,earnings:{visible:true,breaks:false},economic:{visible:true,futureOnly:true},latestNews:true,newsNotification:false},
 templates:[],
};
export function defaultChartSettingsDocument():ChartSettingsDocument{return structuredClone(DEFAULT_DOCUMENT);}

// Strict restore: absent groups and fields take the factory default; unknown fields and wrong types are refused.
type Shape={[key:string]:Shape|'boolean'|'number'|'string'|'color'|'color?'|readonly string[]|{range:[number,number]}|{integer:[number,number]}|{tuple:'color';length:number}};
const visibility=['mouseover','always','never'] as const;
const pl=['money','ticks','percent'] as const;
const SHAPE:Shape={
 symbol:{dividendsAdjustment:'boolean',precision:PRECISION_OPTIONS.map(row=>row.value),session:['regular','extended']},
 statusLine:{logo:'boolean',title:{visible:'boolean',source:['name','symbol','symbolAndName']},chartValues:'boolean',barChange:'boolean',volume:'boolean',lastDayChange:'boolean',indicatorTitles:'boolean',indicatorInputs:'boolean',background:{visible:'boolean',transparency:{integer:[0,100]}}},
 scales:{currencyAndUnit:visibility,scaleModesButtons:visibility,symbolValueMode:['scale','pricePercent'],prePostColors:{tuple:'color',length:3},bidAskColors:{tuple:'color',length:2},dayOfWeek:'boolean',dateFormat:DATE_FORMAT_OPTIONS.map(row=>row.value),timeHours:['24','12'],saveLeftEdge:'boolean'},
 canvas:{watermark:{ticker:'boolean',interval:'boolean',description:'boolean',replay:'boolean',color:'color'},navigationButtons:visibility,paneButtons:visibility,rightMarginBars:{integer:[0,1000]},sessionBreaks:'boolean'},
 trading:{buySellButtons:'boolean',oneClick:'boolean',executionSound:{enabled:'boolean',volume:{range:[0,1]},melody:['Alarm Clock']},rejectionOnly:'boolean',positionsAndOrders:'boolean',reverseButton:'boolean',projectMarketOrders:'boolean',profitLoss:'boolean',positionPL:{visible:'boolean',display:pl},bracketsPL:{visible:'boolean',display:pl},executionMarks:'boolean',executionLabels:'boolean',extendLines:'boolean',alignment:['left','center','right'],inSnapshots:'boolean'},
 alerts:{lines:{visible:'boolean',color:'color?'},activeOnly:'boolean',labelsVisible:'boolean',volume:{enabled:'boolean',level:{range:[0,1]}},hideToasts:'boolean',hideToastsMigrated:'boolean'},
 events:{ideas:{visible:'boolean',filter:['all']},dividends:'boolean',splits:'boolean',earnings:{visible:'boolean',breaks:'boolean'},economic:{visible:'boolean',futureOnly:'boolean'},latestNews:'boolean',newsNotification:'boolean'},
};
function isPlain(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
function restoreShape(value:unknown,shape:Shape,fallback:any,path:string):any{
 if(value===undefined)return structuredClone(fallback);
 if(!isPlain(value))throw Error(`Chart settings ${path} must be an object.`);
 for(const key of Object.keys(value))if(!Object.hasOwn(shape,key))throw Error(`Chart settings ${path} has an unknown field: ${key}`);
 const out:Record<string,unknown>={};
 for(const [key,rule] of Object.entries(shape)){
  const field=value[key],where=path+'.'+key;
  if(field===undefined){out[key]=structuredClone(fallback[key]);continue;}
  if(rule==='boolean'){if(typeof field!=='boolean')throw Error(`Chart settings ${where} must be true or false.`);out[key]=field;}
  else if(rule==='string'){if(typeof field!=='string')throw Error(`Chart settings ${where} must be text.`);out[key]=field;}
  else if(rule==='number'){if(typeof field!=='number'||!Number.isFinite(field))throw Error(`Chart settings ${where} must be a finite number.`);out[key]=field;}
  else if(rule==='color'||rule==='color?'){if(rule==='color?'&&field===null){out[key]=null;continue;}if(!supportedColor(field))throw Error(`Chart settings ${where} must be a supported color.`);out[key]=field;}
  // A precision this build does not offer (another build's format) reads as Default instead of refusing the document.
  else if(Array.isArray(rule)&&where==='symbol.precision'&&typeof field==='string'&&!rule.includes(field))out[key]='default';
  else if(Array.isArray(rule)){if(typeof field!=='string'||!rule.includes(field))throw Error(`Chart settings ${where} must be one of ${rule.join(', ')}.`);out[key]=field;}
  else if('range' in rule){const [min,max]=rule.range as [number,number];if(typeof field!=='number'||!Number.isFinite(field)||field<min||field>max)throw Error(`Chart settings ${where} must be between ${min} and ${max}.`);out[key]=field;}
  else if('integer' in rule){const [min,max]=rule.integer as [number,number];if(typeof field!=='number'||!Number.isInteger(field)||field<min||field>max)throw Error(`Chart settings ${where} must be a whole number from ${min} to ${max}.`);out[key]=field;}
  else if('tuple' in rule){const length=rule.length as number;if(!Array.isArray(field)||field.length!==length||!field.every(item=>supportedColor(item)))throw Error(`Chart settings ${where} must list ${length} supported colors.`);out[key]=[...field];}
  else out[key]=restoreShape(field,rule as Shape,fallback[key],where);
 }
 return out;
}
function restoreTemplate(value:unknown,index:number):ChartSettingsTemplate{
 const where=`templates[${index}]`;
 if(!isPlain(value))throw Error(`Chart settings ${where} must be an object.`);
 const keys=['id','name','appearance','statusLine','scales','canvas','symbol','typeSettings'];
 for(const key of Object.keys(value))if(!keys.includes(key))throw Error(`Chart settings ${where} has an unknown field: ${key}`);
 if(typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value.id))throw Error(`Chart settings ${where}.id is invalid.`);
 const name=validTemplateName(value.name);
 if(!isPlain(value.appearance))throw Error(`Chart settings ${where}.appearance must be an object.`);
 for(const [key,field] of Object.entries(value.appearance))if(key.length>120||!['string','number','boolean'].includes(typeof field)||typeof field==='number'&&!Number.isFinite(field)||typeof field==='string'&&field.length>200)throw Error(`Chart settings ${where}.appearance.${key} is invalid.`);
 if(!isPlain(value.typeSettings))throw Error(`Chart settings ${where}.typeSettings must be an object.`);
 for(const [style,settings] of Object.entries(value.typeSettings))if(style.length>40||!isPlain(settings))throw Error(`Chart settings ${where}.typeSettings.${style} must be an object.`);
 return{id:value.id,name,appearance:{...value.appearance} as ChartSettingsTemplate['appearance'],
  statusLine:restoreShape(value.statusLine,SHAPE.statusLine as Shape,DEFAULT_DOCUMENT.statusLine,where+'.statusLine'),
  scales:restoreShape(value.scales,SHAPE.scales as Shape,DEFAULT_DOCUMENT.scales,where+'.scales'),
  canvas:restoreShape(value.canvas,SHAPE.canvas as Shape,DEFAULT_DOCUMENT.canvas,where+'.canvas'),
  symbol:restoreShape(value.symbol,SHAPE.symbol as Shape,DEFAULT_DOCUMENT.symbol,where+'.symbol'),
  typeSettings:structuredClone(value.typeSettings) as ChartSettingsTemplate['typeSettings']};
}
/** Restores a saved document. `undefined` (a workspace saved before this document existed) yields the defaults. */
export function restoreChartSettingsDocument(value:unknown):ChartSettingsDocument{
 if(value===undefined)return defaultChartSettingsDocument();
 if(!isPlain(value))throw Error('Chart settings must be an object.');
 for(const key of Object.keys(value))if(!['version',...Object.keys(SHAPE),'templates'].includes(key))throw Error('Chart settings has an unknown field: '+key);
 if(value.version!==undefined&&value.version!==1)throw Error('Chart settings version is not supported.');
 const groups=Object.fromEntries(Object.entries(SHAPE).map(([key,shape])=>[key,restoreShape(value[key],shape as Shape,(DEFAULT_DOCUMENT as any)[key],key)]));
 // A stored alerts.hideToasts from before the migration flag is treated as unset (default on).
 if(!isPlain(value.alerts)||value.alerts.hideToastsMigrated!==true){groups.alerts.hideToasts=true;groups.alerts.hideToastsMigrated=true;}
 const rawTemplates=value.templates===undefined?[]:value.templates;
 if(!Array.isArray(rawTemplates))throw Error('Chart settings templates must be a list.');
 if(rawTemplates.length>CHART_SETTINGS_TEMPLATE_LIMIT)throw Error(`Chart settings keep at most ${CHART_SETTINGS_TEMPLATE_LIMIT} templates.`);
 const templates=rawTemplates.map(restoreTemplate);
 const ids=new Set(templates.map(row=>row.id)),names=new Set(templates.map(row=>row.name.toLowerCase()));
 if(ids.size!==templates.length)throw Error('Chart settings templates must have distinct ids.');
 if(names.size!==templates.length)throw Error('Chart settings templates must have distinct names.');
 return{version:1,...groups,templates} as ChartSettingsDocument;
}
export function validTemplateName(value:unknown):string{
 if(typeof value!=='string')throw Error('Enter a template name.');
 const name=value.trim();
 if(!name)throw Error('Enter a template name.');
 if(name.length>CHART_SETTINGS_TEMPLATE_NAME_MAX)throw Error(`Template names can have at most ${CHART_SETTINGS_TEMPLATE_NAME_MAX} characters.`);
 if(/[\u0000-\u001f\u007f]/.test(name))throw Error('Template names cannot contain control characters.');
 return name;
}
/** Adds or replaces (same name, case-insensitive) a template; returns a new document. */
export function withTemplate(document:ChartSettingsDocument,template:Omit<ChartSettingsTemplate,'id'|'name'>&{name:string},makeId:()=>string):ChartSettingsDocument{
 const name=validTemplateName(template.name),existing=document.templates.find(row=>row.name.toLowerCase()===name.toLowerCase());
 if(!existing&&document.templates.length>=CHART_SETTINGS_TEMPLATE_LIMIT)throw Error(`Chart settings keep at most ${CHART_SETTINGS_TEMPLATE_LIMIT} templates. Remove one first.`);
 const row:ChartSettingsTemplate={...structuredClone(template),id:existing?.id??makeId(),name};
 const templates=existing?document.templates.map(item=>item.id===existing.id?row:item):[...document.templates,row];
 return restoreChartSettingsDocument({...structuredClone(document),templates});
}
export function withoutTemplate(document:ChartSettingsDocument,id:string):ChartSettingsDocument{
 if(!document.templates.some(row=>row.id===id))throw Error('That template no longer exists.');
 return{...structuredClone(document),templates:document.templates.filter(row=>row.id!==id).map(row=>structuredClone(row))};
}
export function sameDocument(left:unknown,right:unknown):boolean{return JSON.stringify(left)===JSON.stringify(right);}
