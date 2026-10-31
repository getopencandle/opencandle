// Factory defaults of NEW drawings on the pinned native drawing classes.
//
// tests/chart/drawing-factory-defaults.test.ts compares each applied value with its fact. This module holds only OpenCandle's own transcription and code.
//
// Scope rules:
//  * A default is applied only where the renderer has a property that can carry it. Everything else is listed in
//    FACTORY_DEFAULTS_UNAPPLIED with the reason; nothing is stored in an inert setting.
//  * A fact marked unverified in the fact file (confidence "inferred", pairing "inferred", "not decodable", meaning or
//    units "not verified") is not applied, it is listed.
//  * Only a drawing created fresh is seeded. A retained record carries its `type` and is never touched; a carried placement draft
//    keeps every style/text/props value it holds (a carried text only gains keys it lacks), so saved drawings and workspaces never change.
//  * Registration fails closed. When the installed renderer no longer matches the pinned shape, the type keeps its native
//    defaults and the status says why (the same rule as lv-drawing-types.ts).
import {Drawing,getDrawingType,registerDrawingType,type DrawingText,type DrawingTypeMeta,type SerializedDrawing} from '@luxalgo/vela';
import {TV_BLUE} from './drawing-default-constants';
// Per-tool modules (src/chart/lv-types) contribute unapplied rows; their factory defaults are installed by lv-drawing-types.ts
// after their types are registered (installFactoryDefaults below).
import {LV_DRAWING_TOOL_MODULES} from './lv-types';
export {TV_BLUE,FONT_PX_TO_NAMED,LINE_STYLE_NAMES,HORZ_LABEL_PLACE,VERT_LABEL_SIDE} from './drawing-default-constants';

type Init=Partial<SerializedDrawing>&{paneId:string};
type Style=Record<string,string|number|boolean>;
type TextSeed=Partial<Omit<DrawingText,'value'>>;

/** One factory-default definition: native types below, OpenCandle types in their own module (src/chart/lv-types). */
export interface FactoryDefaultDefinition{
 readonly type:string;
 /** Reference tool id (static-drawing-defaults tool.<id>.defaults). */
 readonly toolId:string;
 readonly factId:string;
 /** Merged over the native default style: this is what createDrawing(type) and a reset start from. */
 readonly style:Readonly<Style>;
 /** Seeded only into a fresh drawing that carries no text of its own. */
 readonly text?:Readonly<TextSeed>;
 /** Shape probe of the sample model; a mismatch leaves the type untouched. */
 readonly probe?:(sample:Drawing)=>string|undefined;
 /** Typed seed of a fresh drawing that carries no props of its own. */
 readonly seed?:(model:Drawing)=>void;
}

const LINE_TEXT:Readonly<TextSeed>=Object.freeze({color:TV_BLUE,size:'normal',bold:false,italic:false,place:'middle',side:'above',hAlign:'center',vAlign:'bottom'});
const LINE_STYLE_BASE=Object.freeze({lineColor:TV_BLUE,lineWidth:2,lineStyle:'solid'});

type Definition=FactoryDefaultDefinition;
const define=(rows:Definition[]):readonly Definition[]=>Object.freeze(rows);
const DEFINITIONS=define([
 // Line tools: linecolor/textcolor blue, linewidth 2, solid, no end styles, text 14 px, not bold, not italic, labels centered above the line.
 // Trendline text is NOT seeded: the reviewed native Reset capability treats a fresh Trendline as having no text object (Reset removes it), so a
 // seeded object would change what Reset keeps. Its facts that need no object already hold: size normal (14 px), not bold, not italic, label
 // place middle, side above are the editor's absent-value reading. The fact text color #2962FF is listed in FACTORY_DEFAULTS_UNAPPLIED.
 {type:'trendline',toolId:'LineToolTrendLine',factId:'tool.LineToolTrendLine.defaults',style:LINE_STYLE_BASE},
 {type:'ray',toolId:'LineToolRay',factId:'tool.LineToolRay.defaults',style:LINE_STYLE_BASE,text:LINE_TEXT},
 {type:'extendedline',toolId:'LineToolExtended',factId:'tool.LineToolExtended.defaults',style:LINE_STYLE_BASE,text:LINE_TEXT},
 {type:'infoline',toolId:'LineToolInfoLine',factId:'tool.LineToolInfoLine.defaults',style:LINE_STYLE_BASE,text:LINE_TEXT},
 // Arrow: rightEnd 1 (arrow). Its label is placed by the renderer at the first point, so only the shared text styling applies.
 {type:'arrow',toolId:'LineToolArrow',factId:'tool.LineToolArrow.defaults',style:{...LINE_STYLE_BASE,arrowRight:true},text:{color:TV_BLUE,size:'normal',bold:false,italic:false,hAlign:'center',vAlign:'bottom'}},
 // Rectangle: border and text color purple, fill purple at alpha 0.2, linewidth 2, solid, text 14 px centered in the box.
 {type:'box',toolId:'LineToolRectangle',factId:'tool.LineToolRectangle.defaults',style:{lineColor:'#9c27b0',lineWidth:2,lineStyle:'solid',fillColor:'rgba(156,39,176,0.2)'},text:{color:'#9c27b0',size:'normal',bold:false,italic:false,hAlign:'center',vAlign:'center'}},
 // Signpost (older cached build): plateColor blue, text 12 px, not bold, not italic.
 {type:'signpost',toolId:'LineToolSignpost',factId:'tool.LineToolSignpost.defaults',style:{fillColor:TV_BLUE},text:{size:'small',bold:false,italic:false}},
 // Brush: linecolor sky blue, linewidth 2, no fill (fillBackground false), no end styles.
 {type:'freehand',toolId:'LineToolBrush',factId:'tool.LineToolBrush.defaults',style:{lineColor:'#00bcd4',lineWidth:2,lineStyle:'solid'}},
 // Highlighter: red at alpha 0.2, width 20.
 {type:'highlighter',toolId:'LineToolHighlighter',factId:'tool.LineToolHighlighter.defaults',style:{lineColor:'rgba(242,54,69,0.2)',lineWidth:20,lineStyle:'solid'}},
 // Text: 14 px, not bold, not italic. No seeded color. The fact blue was hard to read on dark candles; a fresh
 // Text takes the theme's readable ink when it is placed (the renderer fills an absent color from the chart background: white on a
 // dark theme, black on a light one) and an absent color paints in the theme text color. Listed in FACTORY_DEFAULTS_UNAPPLIED.
 {type:'text',toolId:'LineToolText',factId:'tool.LineToolText.defaults',style:{},text:{size:'normal',bold:false,italic:false}},
 // XABCD pattern (decoded from an older V8 code cache): linewidth 2 is the only value decoded without inference.
 {type:'xabcd',toolId:'LineTool5PointsPattern',factId:'tool.LineTool5PointsPattern.defaults',style:{lineWidth:2}},
 // Long position: its definition (account size 1000, risk 25 percent, line width 1 and the input defaults) lives in
 // src/chart/lv-types/position-tool.ts, which replaces the native registration in place; Short takes the same values there as a copy.
 // Trend-based fib time: its definition (levels, level line style and the trend line) lives in src/chart/lv-types/fib-time-trend-line.ts,
 // which replaces the native registration in place; it is installed after that registration (or on the native type when it fails closed).
]);

/** Reference properties that are NOT applied, with the reason. `renderer`: the pinned renderer has no property that could carry it.
 *  `unverified`: the fact file marks the value inferred or not decodable. `intrinsic`: the renderer type always behaves this way. */
export interface UnappliedDefault{readonly toolId:string;readonly factId:string;readonly property:string;readonly value:unknown;readonly reason:'renderer'|'unverified'|'intrinsic'|'no-type'|'lv-defined';readonly note:string}
const u=(toolId:string,factId:string,property:string,value:unknown,reason:UnappliedDefault['reason'],note:string):UnappliedDefault=>Object.freeze({toolId,factId,property,value,reason,note});
const LINE_ABSENT='The renderer line tools have no middle-point, price-label, price-range or distance statistic setting.';
// Trendline statistics take the reference Left/Center/Right/Auto positions with default Right (trendline-stats-data.ts
// TRENDLINE_STATS_DEFAULTS), so its statsPosition is applied; the other line tools have no statistics.
const lineTool=(toolId:string,factId:string,extra:UnappliedDefault[]=[])=>[
 u(toolId,factId,'showMiddlePoint',false,'renderer',LINE_ABSENT),
 u(toolId,factId,'showPriceLabels',false,'renderer',LINE_ABSENT),
 ...(toolId==='LineToolTrendLine'?[]:[u(toolId,factId,'statsPosition',2,'renderer','Only Trendline has a statistics setting in the renderer layer.')]),
 u(toolId,factId,'showPipsPriceRange',false,'renderer','No change-in-pips, distance or angle statistic exists in the renderer.'),
 u(toolId,factId,'showDistance',false,'renderer','No change-in-pips, distance or angle statistic exists in the renderer.'),
 u(toolId,factId,'showAngle',false,'renderer','No change-in-pips, distance or angle statistic exists in the renderer.'),
 ...extra,
];
const NATIVE_UNAPPLIED:readonly UnappliedDefault[]=Object.freeze([
 ...lineTool('LineToolTrendLine','tool.LineToolTrendLine.defaults',[
  u('LineToolTrendLine','tool.LineToolTrendLine.defaults','textcolor','#2962FF','renderer','Not seeded: the reviewed native Reset capability treats a fresh Trendline as having no text object. The dialog and renderer read an absent text as size normal (14 px), not bold, not italic, label middle/above, which equal the other text facts.'),
 ]),
 ...lineTool('LineToolRay','tool.LineToolRay.defaults',[u('LineToolRay','tool.LineToolRay.defaults','extendRight',true,'intrinsic','The renderer Ray always extends to the right; no setting is stored.')]),
 ...lineTool('LineToolExtended','tool.LineToolExtended.defaults',[u('LineToolExtended','tool.LineToolExtended.defaults','extendLeft',true,'intrinsic','The renderer Extended line always extends in both directions; no setting is stored.'),u('LineToolExtended','tool.LineToolExtended.defaults','extendRight',true,'intrinsic','The renderer Extended line always extends in both directions; no setting is stored.')]),
 ...lineTool('LineToolInfoLine','tool.LineToolInfoLine.defaults',[
  u('LineToolInfoLine','tool.LineToolInfoLine.defaults','alwaysShowStats',true,'renderer','Only Trendline has a statistics setting in the renderer layer.'),
  u('LineToolInfoLine','tool.LineToolInfoLine.defaults','showPriceRange',true,'renderer','Only Trendline has a statistics setting in the renderer layer.'),
  u('LineToolInfoLine','tool.LineToolInfoLine.defaults','showPercentPriceRange',true,'renderer','Only Trendline has a statistics setting in the renderer layer.'),
  u('LineToolInfoLine','tool.LineToolInfoLine.defaults','showBarsRange',true,'renderer','Only Trendline has a statistics setting in the renderer layer.'),
  u('LineToolInfoLine','tool.LineToolInfoLine.defaults','showDateTimeRange',true,'renderer','Only Trendline has a statistics setting in the renderer layer.'),
 ]),
 ...lineTool('LineToolArrow','tool.LineToolArrow.defaults'),
 u('LineToolArrow','tool.LineToolArrow.defaults','horzLabelsAlign/vertLabelsAlign','center/bottom','renderer','The renderer places an Arrow label at its first point and has no alignment setting for it.'),
 u('LineToolFibRetracement','tool.LineToolFibRetracement.defaults','fibLevelsBasedOnLogScale',false,'renderer','The renderer has no log-scale level mode.'),
 u('LineToolFibRetracement','tool.LineToolFibRetracement.defaults','vertLabelsAlign/vertTextAlign','middle/middle','renderer','Fib label and text vertical alignment have no renderer setting.'),
 u('LineToolFibRetracement','tool.LineToolFibRetracement.defaults','labelFontSize',12,'intrinsic','The renderer default number size "small" is 12 px already; arbitrary sizes (8, 10, 11, 16, 20, 22) are not representable.'),
 // trendline {visible:true,linewidth:2,linestyle:2,color:'#808080'} is applied as props.lvFibTimeTrendLine (src/chart/lv-types/fib-time-trend-line.ts).
 u('LineToolTrendBasedFibTime','tool.LineToolTrendBasedFibTime.defaults','fillBackground/transparency',[true,80],'renderer','No background fill or label alignment member exists for this tool.'),
 u('LineToolTrendBasedFibTime','tool.LineToolTrendBasedFibTime.defaults','horzLabelsAlign/vertLabelsAlign','right/bottom','renderer','No background fill or label alignment member exists for this tool.'),
 u('LineToolFibTimeZone','tool.LineToolFibTimeZone.defaults','all','partial decode','unverified','Fact is partial: level coefficients and colors, label alignment and color pairing are not decodable; the renderer tool also has no fill or label toggle.'),
 u('LineToolRectangle','tool.LineToolRectangle.defaults','transparency',50,'renderer','No separate fill transparency member; the fill alpha comes from the background color alpha 0.2.'),
 u('LineToolRectangle','tool.LineToolRectangle.defaults','extendLeft/extendRight',[false,false],'renderer','The renderer rectangle has no extend setting.'),
 u('LineToolRectangle','tool.LineToolRectangle.defaults','middleLine',{showLine:false,lineWidth:1,lineStyle:2},'renderer','The renderer rectangle has no middle line.'),
 u('LineToolSignpost','tool.LineToolSignpost.defaults','showImage/emoji/plate geometry',[false,'U+1F642'],'renderer','The renderer signpost is a text plate on a pole; it has no emoji pin or circle plate.'),
 u('LineToolBrush','tool.LineToolBrush.defaults','smooth',5,'renderer','The renderer brush has no smoothing setting.'),
 u('LineToolBrush','tool.LineToolBrush.defaults','transparency/backgroundColor',[80,'#00bcd4 alpha 0.2'],'renderer','Fill is off by default; the renderer stores one fill color with its alpha, not a separate pre-seeded background color.'),
 u('LineToolHighlighter','tool.LineToolHighlighter.defaults','smooth',5,'renderer','The renderer highlighter has no smoothing setting.'),
 u('LineToolHighlighter','tool.LineToolHighlighter.defaults','transparency',80,'intrinsic','Carried by the color alpha 0.2 (transparency 80).'),
 u('LineToolText','tool.LineToolText.defaults','color','#2962FF','lv-defined','FIX-RI6A: not seeded. A fresh Text takes the theme readable ink at placement (white on dark, black on light), so it reads on both themes.'),
 u('LineToolText','tool.LineToolText.defaults','fillBackground/backgroundColor/backgroundTransparency',[false,'#2962FF alpha 0.25',70],'renderer','The renderer Text has no background.'),
 u('LineToolText','tool.LineToolText.defaults','drawBorder/borderColor',[false,'#707070'],'renderer','The renderer Text has no border.'),
 u('LineToolText','tool.LineToolText.defaults','wordWrap/wordWrapWidth',[false,200],'renderer','The renderer Text has no word wrap.'),
 u('LineToolTextAbsolute','tool.LineToolTextAbsolute.defaults','all','see fact','no-type','No screen-anchored Text type is registered (catalog row unavailable).'),
 u('LineToolImage','tool.LineToolImage.defaults','all','see fact','no-type','No Image type is registered (catalog row unavailable).'),
 u('LineToolBarsPattern','tool.LineToolBarsPattern.defaults','all','see fact','no-type','No Bars pattern type is registered (catalog row unavailable).'),
 u('LineTool5PointsPattern','tool.LineTool5PointsPattern.defaults','fillBackground/transparency/colors',[true,85,'pairing not decodable'],'unverified','The fact states the color pairing is not decodable, so no color or fill is applied.'),
 u('LineTool5PointsPattern','tool.LineTool5PointsPattern.defaults','fontsize/bold',[12,false],'unverified','Both keys are marked inferred (V8 built-in string slot) in the fact.'),
 u('LineToolRiskRewardLong','tool.LineToolRiskRewardLong.defaults','leverage',10000,'unverified','Decoded constant; meaning and units are not verified. It is stored and shown as an OpenCandle-defined input and changes no number.'),
 u('LineToolRiskRewardLong','tool.LineToolRiskRewardLong.defaults','colors',{linecolor:'#808080',textcolor:'#ffffff',stopBackground:'#F23645 alpha 0.2',profitBackground:'#089981 alpha 0.2'},'unverified','The fact states the color pairing is inferred from declaration order, so the renderer line and zone colors remain. The plates paint white text on the zone colors while the drawing has no text color (OpenCandle-defined).'),
 u('LineToolRiskRewardLong','tool.LineToolRiskRewardLong.defaults','fontsize',12,'unverified','Marked inferred in the fact. The plates paint 12 px (size small) while the drawing has no text size, as an OpenCandle-defined choice; riskDisplayMode percentage is applied as an OpenCandle-defined input default.'),
 u('LineToolRiskRewardLong','tool.LineToolRiskRewardLong.defaults','infoBlocks/qtyPrecision',['see fact','computed'],'unverified','The info block set is painted as recorded and is not a setting; qtyPrecision is computed in the fact and not decodable, so Qty precision starts at 2 (OpenCandle-defined). Price labels (on) and Always show stats (off) are applied.'),
 // LineToolRiskRewardShort: contributed by src/chart/lv-types/short-position.ts.
]);
/** Native rows (minus the `no-type` rows a registered module retires), then each module's rows in module order. */
export const FACTORY_DEFAULTS_UNAPPLIED:readonly UnappliedDefault[]=Object.freeze([
 ...NATIVE_UNAPPLIED.filter(row=>!LV_DRAWING_TOOL_MODULES.some(module=>module.retiresUnapplied?.some(retired=>retired.toolId===row.toolId&&retired.reason===row.reason))),
 ...LV_DRAWING_TOOL_MODULES.flatMap(module=>module.unappliedDefaults??[]).map(row=>Object.freeze({...row})),
]);

/** True for a drawing built from a retained record (it carries its type); false for a fresh drawing or a placement draft. */
export const isRetainedRecord=(init:Partial<SerializedDrawing>)=>(init as {type?:unknown}).type!==undefined;

function seedText(model:Drawing,init:Init,seed:Readonly<TextSeed>|undefined){
 if(!seed)return;
 if(init.text===undefined){
  const base=model.text??{value:'',size:'normal' as const,hAlign:'left' as const,vAlign:'top' as const};
  model.text={...base,...seed,value:base.value};return;
 }
 // A carried text (a placement draft re-created while the second anchor moves, or a programmatic add) keeps every key it has;
 // only the keys it lacks come from the seed.
 const carried=model.text;
 if(carried)model.text={...seed,...carried,value:carried.value};
}

const MARK=Symbol.for('larryvision.drawing-factory-defaults');
const applied=new Set<string>();
export interface FactoryDefaultsStatus{readonly type:string;readonly toolId:string;readonly state:'applied'|'unavailable';readonly reason?:string}
const statuses:FactoryDefaultsStatus[]=[];

function install(definition:Definition,into:FactoryDefaultsStatus[]=statuses){
 const result=(state:FactoryDefaultsStatus['state'],reason?:string)=>into.push(Object.freeze({type:definition.type,toolId:definition.toolId,state,...reason?{reason}:{}}));
 try{
  const base=getDrawingType(definition.type);
  if(!base||base.type!==definition.type)return result('unavailable','native type is not registered');
  if(Object.hasOwn(base,MARK)){applied.add(definition.type);return result('applied');}
  const descriptor=Object.getOwnPropertyDescriptor(base,'create');
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')return result('unavailable','native factory is not a data function');
  const create=descriptor.value as DrawingTypeMeta['create'];
  const sample=create({id:'lv-factory-defaults-probe',paneId:'price',createdAt:0});
  if(!(sample instanceof Drawing)||sample.type!==definition.type)return result('unavailable','native factory returned an unexpected model');
  const problem=definition.probe?.(sample);
  if(problem)return result('unavailable',problem);
  const meta={...base,defaultStyle:{...base.defaultStyle,...definition.style},create:(init:Init)=>{const model=create(init);if(!isRetainedRecord(init)){seedText(model,init,definition.text);if(definition.seed&&init.props===undefined)definition.seed(model);}return model;},[MARK]:true};
  registerDrawingType(Object.freeze(meta) as DrawingTypeMeta);
  applied.add(definition.type);result('applied');
 }catch(error){result('unavailable','unexpected registration failure: '+String(error));}
}
for(const definition of DEFINITIONS)install(definition);
/** LV defaults for the Horizontal line and Horizontal ray: a solid, thin line; the native color stays. They are kept apart
 * from the fact-backed definitions and statuses above. Their price label on the scale is drawn by axis-labels.ts.
 * The Horizontal line and Cross line rows use the factory width 2 px, solid
 * (hline text 12 px Middle / Center is seeded by src/chart/lv-types/axis-lines.ts). Horizontal ray keeps
 * its earlier row. New drawings only: a saved record keeps its stored style. */
export interface ParityDefaultDefinition{readonly type:string;readonly toolId:string;readonly source:string;readonly style:Readonly<Style>}
const PARITY_DEFINITIONS:readonly ParityDefaultDefinition[]=Object.freeze([
 Object.freeze({type:'hline',toolId:'LineToolHorzLine',source:'parity:observed-2px-solid',style:Object.freeze({lineStyle:'solid',lineWidth:2})}),
 Object.freeze({type:'hray',toolId:'LineToolHorzRay',source:'parity:observed-1px-solid',style:Object.freeze({lineStyle:'solid',lineWidth:1})}),
 Object.freeze({type:'crossline',toolId:'LineToolCrossLine',source:'parity:observed-2px-solid',style:Object.freeze({lineStyle:'solid',lineWidth:2})}),
]);
const parityStatuses:FactoryDefaultsStatus[]=[];
for(const row of PARITY_DEFINITIONS)install({type:row.type,toolId:row.toolId,factId:row.source,style:row.style},parityStatuses);
export function parityDefaultDefinitions():readonly ParityDefaultDefinition[]{return PARITY_DEFINITIONS;}
export function parityDefaultsStatus():readonly FactoryDefaultsStatus[]{return Object.freeze([...parityStatuses]);}
const moduleDefinitions:Definition[]=[];
/** Installs one OpenCandle type's definition (called by lv-drawing-types.ts after the type is registered; same rules as the native rows). */
export function installFactoryDefaults(definition:FactoryDefaultDefinition):void{moduleDefinitions.push(definition);install(definition);}

/** Registration outcome per type, for diagnostics and tests. */
export function factoryDefaultsStatus():readonly FactoryDefaultsStatus[]{return Object.freeze([...statuses]);}
/** The applied definitions (type, reference tool, fact id, style and text seeds) for tests and evidence. */
export function factoryDefaultDefinitions(){return [...DEFINITIONS,...moduleDefinitions].map(({type,toolId,factId,style,text})=>Object.freeze({type,toolId,factId,style,text}));}
