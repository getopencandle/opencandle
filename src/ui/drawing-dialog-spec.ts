// Drawing settings dialog layout of the tools with recorded reference facts.
//
// Facts: the recorded drawing dialog fact file (each row names its fact id).
// tests/ui/drawing-dialog-spec.test.ts reads that file and checks every tab list, row title, control type and bound
// property name here against it. This module holds only OpenCandle's own transcription and the mapping from each
// reference property onto the setting path the renderer actually has (`null` = the renderer has no such setting).
//
// A row is drawn only for the settings the renderer can edit. A reference property mapped to `null` is NOT drawn as an
// inert control; it is listed in DIALOG_UNAVAILABLE instead.
//
// OpenCandle drawing types bind themselves to a recorded spec (or add one) from their own per-tool module
// (src/chart/lv-types, `dialog`); see applyDialogContributions below.
import {LV_DRAWING_TOOL_MODULES,type LvDialogContribution} from '../chart/lv-types';
import {LINE_MARKER_TYPES} from '../chart/trendline-markers-painter';

export type DialogTab='Inputs'|'Style'|'Text'|'Coordinates'|'Visibility';
export interface DialogRow{
 readonly factId:string;
 /** Row title exactly as the reference shows it. */
 readonly title:string;
 /** Control type recorded by the fact (line, checkbox, select, group, ...). */
 readonly type:string;
 /** Reference property name -> renderer setting path (editor field path), or null when the renderer has no such setting. */
 readonly lv:Readonly<Record<string,string|null>>;
 /** Child rows of a group row (the Info group holds Stats, Stats position and Always show stats). */
 readonly children?:readonly DialogRow[];
 /** Control titles the reference gives to a property inside this row (default titles of the shared line control, the Levels line row). */
 readonly labels?:Readonly<Record<string,string>>;
 /** Select options (numbers) the reference lists for a numeric property. */
 readonly numericOptions?:readonly number[];
}
export interface DialogToolSpec{
 /** Reference tool id (dialog.<toolId>.tabs). */
 readonly toolId:string;
 /** Renderer drawing types this spec drives. Empty: no renderer type is registered for the tool. */
 readonly types:readonly string[];
 readonly tabs:readonly DialogTab[];
 readonly style:readonly DialogRow[];
 /** Text tab: reference text field -> renderer setting path (null = none). Order is the reference order. */
 readonly text?:Readonly<Record<string,string|null>>;
 readonly textFactId?:string;
 /** Coordinates rows come from the anchors of the drawing; this is the reference row count (null: not row-per-anchor). */
 readonly coordinateRows:number|null;
}

const row=(factId:string,title:string,type:string,lv:Record<string,string|null>,children?:DialogRow[],extra:Pick<DialogRow,'labels'|'numericOptions'>={}):DialogRow=>Object.freeze({factId,title,type,lv:Object.freeze(lv),...children?{children:Object.freeze(children)}:{},...extra});
const STATS='props.lvTrendlineStats.';
// Middle point, price labels, distance and angle live in props.lvTrendlineMarkers, for every line tool of
// LINE_MARKER_TYPES (trendline, ray, extended line, info line, arrow); the shape layer paints them.
const MARKERS='props.lvTrendlineMarkers.';
// Trend line stats option labels, by bound property.
const STATS_LABELS=Object.freeze({showPriceRange:'Price range',showPercentPriceRange:'Percent change',showPipsPriceRange:'Change in pips',showBarsRange:'Bars range',showDateTimeRange:'Date/time range',showDistance:'Distance',showAngle:'Angle'});

function lineToolRows(id:string,markers=false):readonly DialogRow[]{
 return Object.freeze([
  // visual-drawing-dialogs#dialog.common.line defaultTitles: "Extend left line" / "Extend right line".
  row(id+'.style.1','Line','line',{linecolor:'style.lineColor',linewidth:'style.lineWidth',linestyle:'style.lineStyle',extendLeft:'style.extendLeft',leftEnd:'style.arrowLeft',extendRight:'style.extendRight',rightEnd:'style.arrowRight'},undefined,{labels:{extendLeft:'Extend left line',extendRight:'Extend right line'}}),
  row(id+'.style.2','Middle point','checkbox',{showMiddlePoint:markers?MARKERS+'middlePoint':null}),
  row(id+'.style.3','Price labels','checkbox',{showPriceLabels:markers?MARKERS+'priceLabels':null}),
  row(id+'.style.4','Info','group',{},[
   // ShowPipsPriceRange binds props.lvTrendlineMarkers.pips; the value shows for forex symbols (domain/pip-size.ts), n/a otherwise.
  // The item titles are the fact's option list, in bind order.
  row(id+'.style.5','Stats','checklist dropdown',{showPriceRange:STATS+'priceRange',showPercentPriceRange:STATS+'percentChange',showPipsPriceRange:id==='dialog.LineToolTrendLine'?MARKERS+'pips':null,showBarsRange:STATS+'barsRange',showDateTimeRange:STATS+'dateTimeRange',showDistance:markers?MARKERS+'distance':null,showAngle:markers?MARKERS+'angle':null},undefined,{labels:STATS_LABELS}),
   row(id+'.style.6','Stats position','select',{statsPosition:STATS+'position'}),
   row(id+'.style.7','Always show stats','checkbox',{alwaysShowStats:STATS+'alwaysShow'}),
  ]),
 ]);
}
const lineText=Object.freeze({textcolor:'text.color',fontsize:'text.size',bold:'text.bold',italic:'text.italic',text:'text.value',vertLabelsAlign:'text.side',horzLabelsAlign:'text.place'});
const lineSpec=(toolId:string,type:string):DialogToolSpec=>Object.freeze({toolId,types:Object.freeze([type]),tabs:Object.freeze<DialogTab[]>(['Style','Text','Coordinates','Visibility']),style:lineToolRows('dialog.'+toolId,LINE_MARKER_TYPES.includes(type)),text:lineText,textFactId:'dialog.'+toolId+'.text',coordinateRows:2});

const REFERENCE_DIALOG_SPECS:readonly DialogToolSpec[]=Object.freeze([
 lineSpec('LineToolTrendLine','trendline'),
 lineSpec('LineToolRay','ray'),
 lineSpec('LineToolExtended','extendedline'),
 lineSpec('LineToolInfoLine','infoline'),
 lineSpec('LineToolArrow','arrow'),
 Object.freeze({toolId:'LineToolFibRetracement',types:Object.freeze(['fibretracement']),tabs:Object.freeze<DialogTab[]>(['Style','Coordinates','Visibility']),coordinateRows:2,style:Object.freeze([
  row('dialog.LineToolFibRetracement.style.1','Trend line','line',{'trendline.visible':'lvFibTrendLine.enabled','trendline.color':'lvFibTrendLine.color','trendline.linestyle':'lvFibTrendLine.style','trendline.linewidth':'lvFibTrendLine.width'}),
  // The fact names the two extend controls "Extend lines left" / "Extend lines right".
  row('dialog.LineToolFibRetracement.style.2','Levels line','line',{'levelsStyle.linestyle':'style.lineStyle','levelsStyle.linewidth':'style.lineWidth',extendLinesLeft:'style.extendLeft',extendLines:'style.extendRight'},undefined,{labels:{extendLinesLeft:'Extend lines left',extendLines:'Extend lines right'}}),
  row('dialog.LineToolFibRetracement.style.3','Levels list','leveled lines group',{}),
  row('dialog.LineToolFibRetracement.style.4','Use one color','color',{}),
  row('dialog.LineToolFibRetracement.style.5','Background','checkbox + transparency',{fillBackground:'background',transparency:'lvFibBackground.opacity'}),
  row('dialog.LineToolFibRetracement.style.6','Reverse','checkbox',{reverse:'reverse'}),
  row('dialog.LineToolFibRetracement.style.7','Prices','checkbox',{showPrices:'showPrices'}),
  row('dialog.LineToolFibRetracement.style.8','Levels','checkbox + select',{showCoeffs:'showRatios',coeffsAsPercents:'lvFibLevelFormat'}),
  row('dialog.LineToolFibRetracement.style.9','Labels','two selects',{horzLabelsAlign:'labelSide',vertLabelsAlign:null}),
  row('dialog.LineToolFibRetracement.style.10','Text','checkbox + two selects',{showText:'lvFibText.enabled',horzTextAlign:'lvFibText.position',vertTextAlign:null}),
  row('dialog.LineToolFibRetracement.style.11','Font size','select',{labelFontSize:'numbersSize'}),
  row('dialog.LineToolFibRetracement.style.12','Fib levels based on log scale','checkbox (disabled unless the price scale is logarithmic)',{fibLevelsBasedOnLogScale:null}),
 ])}),
 Object.freeze({toolId:'LineToolFibTimeZone',types:Object.freeze(['fibtimezones']),tabs:Object.freeze<DialogTab[]>(['Style','Coordinates','Visibility']),coordinateRows:null,style:Object.freeze([
  row('dialog.LineToolFibTimeZone.style.1','Levels list','leveled lines group',{}),
  row('dialog.LineToolFibTimeZone.style.2','Use one color','color',{}),
  row('dialog.LineToolFibTimeZone.style.3','Background','checkbox + transparency',{fillBackground:null,transparency:null}),
  row('dialog.LineToolFibTimeZone.style.4','Labels','checkbox + two selects',{showLabels:null,horzLabelsAlign:null,vertLabelsAlign:null}),
 ])}),
 Object.freeze({toolId:'LineToolTrendBasedFibTime',types:Object.freeze(['trendfibtime']),tabs:Object.freeze<DialogTab[]>(['Style','Coordinates','Visibility']),coordinateRows:3,style:Object.freeze([
  row('dialog.LineToolTrendBasedFibTime.style.1','Trend line','line',{'trendline.visible':null,'trendline.color':null,'trendline.linestyle':null,'trendline.linewidth':null}),
  row('dialog.LineToolTrendBasedFibTime.style.2','Levels list','leveled lines group',{}),
  row('dialog.LineToolTrendBasedFibTime.style.3','Use one color','color',{}),
  row('dialog.LineToolTrendBasedFibTime.style.4','Background','checkbox + transparency',{fillBackground:null,transparency:null}),
  row('dialog.LineToolTrendBasedFibTime.style.5','Labels','checkbox + two selects',{showCoeffs:null,horzLabelsAlign:null,vertLabelsAlign:null}),
 ])}),
 Object.freeze({toolId:'LineToolRectangle',types:Object.freeze(['box']),tabs:Object.freeze<DialogTab[]>(['Style','Text','Coordinates','Visibility']),coordinateRows:2,textFactId:'dialog.LineToolRectangle.text',
  text:Object.freeze({textColor:'text.color',text:'text.value',bold:'text.bold',italic:'text.italic',fontSize:'text.size',horzLabelsAlign:null,vertLabelsAlign:null}),
  style:Object.freeze([
   // Props.lvBoxExtend (box-extend-data.ts), painted by the DWB3 shape layer. Item titles are the fact's options.
   row('dialog.LineToolRectangle.style.1','Extend','checklist dropdown (placeholder "Don\'t extend")',{extendLeft:'props.lvBoxExtend.left',extendRight:'props.lvBoxExtend.right'},undefined,{labels:{extendLeft:'Extend left',extendRight:'Extend right'}}),
   row('dialog.LineToolRectangle.style.2','Border','line',{color:'style.lineColor',linewidth:'style.lineWidth',linestyle:'style.lineStyle'}),
   row('dialog.LineToolRectangle.style.3','Middle line','line',{'middleLine.showLine':null,'middleLine.lineColor':null,'middleLine.lineWidth':null,'middleLine.lineStyle':null}),
   row('dialog.LineToolRectangle.style.4','Background','checkbox + color (with transparency)',{fillBackground:null,backgroundColor:'style.fillColor',transparency:null}),
  ])}),
 Object.freeze({toolId:'LineToolSignpost',types:Object.freeze(['signpost']),tabs:Object.freeze<DialogTab[]>(['Style','Text','Coordinates','Visibility']),coordinateRows:null,textFactId:'dialog.LineToolSignpost.text',
  text:Object.freeze({text:'text.value',fontSize:'text.size',bold:'text.bold',italic:'text.italic'}),
  style:Object.freeze([row('dialog.LineToolSignpost.style.1','Emoji pin','checkbox + background color + emoji picker',{showImage:null,plateColor:'style.fillColor',emoji:null})])}),
 Object.freeze({toolId:'LineToolBrush',types:Object.freeze(['freehand']),tabs:Object.freeze<DialogTab[]>(['Style','Visibility']),coordinateRows:null,style:Object.freeze([
  row('dialog.LineToolBrush.style.1','Line','line',{linecolor:'style.lineColor',linewidth:'style.lineWidth',leftEnd:null,rightEnd:null}),
  row('dialog.LineToolBrush.style.2','Background','checkbox + color (with transparency)',{fillBackground:null,backgroundColor:'style.fillColor',transparency:null}),
 ])}),
 Object.freeze({toolId:'LineToolHighlighter',types:Object.freeze(['highlighter']),tabs:Object.freeze<DialogTab[]>(['Style','Visibility']),coordinateRows:null,style:Object.freeze([
  row('dialog.LineToolHighlighter.style.1','Line','line (color only)',{linecolor:'style.lineColor'}),
  // static-drawing-defaults#tool.LineToolHighlighter.defaults widthOptionsPx.
  row('dialog.LineToolHighlighter.style.2','Thickness','select',{width:'style.lineWidth'},undefined,{numericOptions:Object.freeze([8,12,20,32,48,64,80,96])}),
 ])}),
 // Text and Anchored text build but HIDE the Coordinates page (only Text and
 // Visibility show). coordinateRows keeps the hidden row count.
 Object.freeze({toolId:'LineToolText',types:Object.freeze(['text']),tabs:Object.freeze<DialogTab[]>(['Text','Visibility']),coordinateRows:1,textFactId:'dialog.LineToolText.text',style:Object.freeze([]),
  text:Object.freeze({color:'text.color',fontsize:'text.size',bold:'text.bold',italic:'text.italic',text:'text.value',fillBackground:null,backgroundColor:null,backgroundTransparency:null,drawBorder:null,borderColor:null,wordWrap:null})}),
 // Reference tools whose dialog is recorded but that have no registered renderer type (catalog rows are unavailable).
 Object.freeze({toolId:'LineToolTextAbsolute',types:Object.freeze([]),tabs:Object.freeze<DialogTab[]>(['Text','Visibility']),coordinateRows:null,textFactId:'dialog.LineToolTextAbsolute.text',style:Object.freeze([]),
  text:Object.freeze({color:null,fontsize:null,bold:null,italic:null,text:null,fillBackground:null,backgroundColor:null,backgroundTransparency:null,drawBorder:null,borderColor:null,wordWrap:null})}),
 // The Image tool has the same rule: no editable coordinates, so the
 // Coordinates page is hidden.
 Object.freeze({toolId:'LineToolImage',types:Object.freeze([]),tabs:Object.freeze<DialogTab[]>(['Style','Visibility']),coordinateRows:null,style:Object.freeze([
  row('dialog.LineToolImage.style.1','Image','image picker',{'absolute user image url':null,transparency:null}),
  row('dialog.LineToolImage.style.2','Transparency','transparency slider',{transparency:null}),
 ])}),
 Object.freeze({toolId:'LineToolBarsPattern',types:Object.freeze([]),tabs:Object.freeze<DialogTab[]>(['Style','Coordinates','Visibility']),coordinateRows:null,style:Object.freeze([
  row('dialog.LineToolBarsPattern.style.1','Color','color',{color:null}),
  row('dialog.LineToolBarsPattern.style.2','Mode','select',{mode:null}),
  row('dialog.LineToolBarsPattern.style.3','Mirrored','checkbox',{mirrored:null}),
  row('dialog.LineToolBarsPattern.style.4','Flipped','checkbox',{flipped:null}),
 ])}),
 // Long and Short position: only the tab names are applied. The control list and its placement are marked unverified in the fact
 // ("exact labels and tab placement unverified"), so no control is named or moved from it.
 Object.freeze({toolId:'LineToolRiskReward',types:Object.freeze(['position']),tabs:Object.freeze<DialogTab[]>(['Inputs','Style','Coordinates','Visibility']),coordinateRows:null,style:Object.freeze([])}),
]);

function remapRows(rows:readonly DialogRow[],paths:Readonly<Record<string,Readonly<Record<string,string|null>>>>,used:Set<string>):readonly DialogRow[]{
 return Object.freeze(rows.map(item=>{
  const patch=paths[item.factId];let next=item;
  if(patch){
   used.add(item.factId);
   for(const property of Object.keys(patch))if(!Object.hasOwn(item.lv,property))throw Error('Dialog binding names a property the reference row does not list: '+item.factId+' '+property);
   next=Object.freeze({...item,lv:Object.freeze({...item.lv,...patch})});
  }
  return item.children?Object.freeze({...next,children:remapRows(item.children,paths,used)}):next;
 }));
}
/** Applies module contributions: a binding appends its types to a recorded spec (optionally with new renderer paths for
 *  properties the rows already list, and a corrected tab list); an addition adds a spec for a tool with none yet.
 *  Row ids, titles and control types never change. Each type is bound once. */
export function applyDialogContributions(specs:readonly DialogToolSpec[],contributions:readonly LvDialogContribution[]):readonly DialogToolSpec[]{
 const out=[...specs];
 for(const contribution of contributions){
  if('spec' in contribution){
   if(out.some(spec=>spec.toolId===contribution.spec.toolId))throw Error('Dialog spec already recorded: '+contribution.spec.toolId);
   out.push(Object.freeze({...contribution.spec}));continue;
  }
  const index=out.findIndex(spec=>spec.toolId===contribution.toolId);
  if(index<0)throw Error('Dialog binding names an unrecorded reference tool: '+contribution.toolId);
  const spec=out[index],used=new Set<string>();
  const style=contribution.paths?remapRows(spec.style,contribution.paths,used):spec.style;
  for(const factId of Object.keys(contribution.paths??{}))if(!used.has(factId))throw Error('Dialog binding names an unknown row: '+factId);
  let text=spec.text;
  if(contribution.text){
   if(!text)throw Error('Dialog binding maps text fields of a spec without a Text tab: '+spec.toolId);
   for(const field of Object.keys(contribution.text))if(!Object.hasOwn(text,field))throw Error('Dialog binding names an unknown text field: '+spec.toolId+' '+field);
   text=Object.freeze({...text,...contribution.text});
  }
  out[index]=Object.freeze({...spec,types:Object.freeze([...spec.types,...contribution.types]),...contribution.tabs?{tabs:Object.freeze([...contribution.tabs])}:{},style,...text?{text}:{}});
 }
 const seen=new Set<string>();
 for(const spec of out)for(const type of spec.types){if(seen.has(type))throw Error('Drawing type bound to two dialog specs: '+type);seen.add(type);}
 return Object.freeze(out);
}
export const DIALOG_SPECS:readonly DialogToolSpec[]=applyDialogContributions(REFERENCE_DIALOG_SPECS,LV_DRAWING_TOOL_MODULES.flatMap(module=>module.dialog??[]));

const byType=new Map<string,DialogToolSpec>();
for(const spec of DIALOG_SPECS)for(const type of spec.types)byType.set(type,spec);
/** The recorded dialog layout of a renderer drawing type, or null when the reference has no recorded dialog for it. */
export function dialogSpecFor(type:string):DialogToolSpec|null{return byType.get(type)??null;}

/** Every reference property with no renderer setting behind it (never drawn as an inert control). */
export interface UnavailableControl{readonly toolId:string;readonly factId:string;readonly title:string;readonly property:string}
function collect(spec:DialogToolSpec,rows:readonly DialogRow[],out:UnavailableControl[]){
 for(const item of rows){
  for(const [property,path] of Object.entries(item.lv))if(path===null)out.push({toolId:spec.toolId,factId:item.factId,title:item.title,property});
  if(item.children)collect(spec,item.children,out);
 }
}
export const DIALOG_UNAVAILABLE:readonly UnavailableControl[]=Object.freeze(DIALOG_SPECS.flatMap(spec=>{
 const out:UnavailableControl[]=[];collect(spec,spec.style,out);
 for(const [property,path] of Object.entries(spec.text??{}))if(path===null)out.push({toolId:spec.toolId,factId:spec.textFactId!,title:'Text',property});
 return out;
}));

/** The
 * text tools with no recorded dialog get the common tab order with a Text tab, so their text settings
 * leave the Style tab. Every other unrecorded tool keeps the generic tabs. */
export const TEXT_TOOL_TYPES:ReadonlySet<string>=new Set(['callout','note','pricenote','comment','pricelabel','flagmark','lvpin','lvtable']);
const TEXT_TOOL_TABS:readonly DialogTab[]=Object.freeze(['Style','Text','Coordinates','Visibility']);
/** Reference order of the Text tab fields (dialog.common.text fieldsInOrder: color, font size, bold, italic, text area), as renderer paths. */
export const COMMON_TEXT_ORDER:readonly string[]=Object.freeze(['text.color','text.size','text.bold','text.italic','text.value']);
/** Reference dialog tab list of a type (Inputs, Style, Text, Coordinates, Visibility subset), the text-tool tabs, or null for an unrecorded tool. */
export function dialogTabsFor(type:string):readonly DialogTab[]|null{return dialogSpecFor(type)?.tabs??(TEXT_TOOL_TYPES.has(type)?TEXT_TOOL_TABS:null);}

/** A row the reference draws as a checklist dropdown (one button that opens a list of switches). */
export function isChecklistRow(row:Pick<DialogRow,'type'>):boolean{return row.type.startsWith('checklist dropdown');}
/** The button text a checklist dropdown shows with nothing checked: the recorded placeholder (Rectangle Extend "Don't extend"), else
 * "None" (the Stats fact records no placeholder). */
export function checklistPlaceholder(row:Pick<DialogRow,'type'>):string{return /placeholder "([^"]+)"/.exec(row.type)?.[1]??'None';}

/** Numeric select options the reference lists for a setting of this type (the Highlighter thickness), or null. */
export function numericOptionsFor(type:string,path:string):readonly number[]|null{
 const found=dialogSpecFor(type)?.style.find(item=>item.numericOptions&&Object.values(item.lv).includes(path));
 return found?.numericOptions??null;
}
