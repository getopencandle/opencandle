// Left drawing toolbar catalog: groups, sections, rows, labels and hotkeys in toolbar order.
// Facts (group/section/row order, labels, hotkeys, which rows exist) come from
// the recorded drawing toolbar fact file; tests/ui/drawing-tool-catalog.test.ts checks
// this file against it. Code, wording of notes/reasons, glyphs and icons are OpenCandle's own.
// A row arms a tool only when the renderer registers an equivalent type; every other row carries an
// explicit unavailable reason instead of a substitute.
// OpenCandle drawing types arm their (otherwise unavailable) rows from their own per-tool module
// (src/chart/lv-types, `catalog`); this file keeps only the reference facts of those rows.
// Registers the OpenCandle types (side effect) before any row can arm one.
import '../chart/lv-drawing-types';
import {LV_DRAWING_TOOL_MODULES,type LvCatalogArm} from '../chart/lv-types';
import type {CursorKind} from '../chart/cursor-kind';

export type DrawingMode='measure'|'eraser';
export type DrawingToolTarget=
 |{kind:'cursor';cursor?:CursorKind}
 |{kind:'tool';type:string}
 |{kind:'mode';mode:DrawingMode}
 |{kind:'unavailable';reason:string;alternative?:string};
/** Reference shortcut for a row. `action` is the reference behavior (arm the tool, or place it right
 * at the pointer); `bound` says whether this build's keyboard handler performs it today. Only bound
 * shortcuts are advertised in tooltips. */
export interface DrawingHotkey{readonly keys:string;readonly action:'setTool'|'drawRightThere';readonly bound:boolean}
export interface DrawingToolLeaf{
 id:string;label:string;target:DrawingToolTarget;note?:string;aliases?:readonly string[];
 /** Reference tool id (static-drawing-toolbar.json value.toolId); absent for LV-only rows. */
 tvToolId?:string;
 /** LV icon registry id (src/ui/icons); the toolbar falls back to a glyph when the id is not registered yet. */
 iconId?:string;
 hotkey?:DrawingHotkey;
 /** LV wording of a modifier hint, present only when the renderer performs that behavior. */
 hint?:string;
}
export interface DrawingToolSection{id:string;label:string;leaves:readonly DrawingToolLeaf[]}
export interface DrawingToolGroup{id:string;label:string;glyph:string;sections:readonly DrawingToolSection[];iconId?:string;dataName?:string;
 /** The main button opens the flyout instead of arming (reference openDropdownByClick, e.g. Icons). */
 opensFlyout?:boolean;
 /** Main button name and tooltip when it differs from the armed tool (reference buttonTitle). */
 buttonTitle?:string}

const NO_RENDERER='This drawing tool is not available yet.';
const NEEDS_OBSERVATION='It is planned but not available yet.';
const NEEDS_RENDERER='This drawing tool is not available yet.';
const HOSTED='This tool needs an online publishing service, which is not available in OpenCandle.';
const SHIFT_45='Hold Shift while drawing to snap to 45 degree steps.';

type Extra=Partial<Omit<DrawingToolLeaf,'id'|'label'|'target'|'tvToolId'>>;
const withNote=(leaf:DrawingToolLeaf):DrawingToolLeaf=>{
 const parts=[leaf.note,leaf.hotkey?.bound?'Shortcut: '+leaf.hotkey.keys+'.':undefined,leaf.hint].filter((part):part is string=>!!part);
 return Object.freeze(parts.length?{...leaf,note:parts.join(' ')}:leaf);
};
const tool=(id:string,tvToolId:string,label:string,type:string,iconId:string,extra:Extra={}):DrawingToolLeaf=>withNote({id,label,tvToolId,iconId,target:{kind:'tool',type},...extra});
const missing=(id:string,tvToolId:string,label:string,iconId:string,reason=NO_RENDERER,alternative?:string,extra:Extra={}):DrawingToolLeaf=>withNote({id,label,tvToolId,iconId,target:{kind:'unavailable',reason,...alternative?{alternative}:{}},...extra});
const section=(id:string,label:string,leaves:DrawingToolLeaf[]):DrawingToolSection=>Object.freeze({id,label,leaves:Object.freeze(leaves)});
const group=(value:DrawingToolGroup):DrawingToolGroup=>Object.freeze({...value,sections:Object.freeze([...value.sections])});
const key=(keys:string,action:DrawingHotkey['action'],bound:boolean):DrawingHotkey=>Object.freeze({keys,action,bound});

/** Reference taxonomy in reference order. Row ids are the DW.* requirement records; LV.ROW.* marks a
 * reference row that has no requirement record yet. Section label '' is an untitled section (the
 * Cursors flyout separates Eraser with an untitled divider). The Magic cursor row is
 * an LV Magic cursor (magnetic crosshair, src/chart/magic-cursor.ts). */
const REFERENCE_CATALOG:readonly DrawingToolGroup[]=Object.freeze([
 group({id:'cursors',label:'Cursors',glyph:'⌖',iconId:'cursor-cross',dataName:'linetool-group-cursors',sections:[
  section('DW.CURSOR','',[
   withNote({id:'DW.CURSOR.CROSS',label:'Cross',tvToolId:'cursor',iconId:'cursor-cross',target:{kind:'cursor'},note:'Default chart cursor; leaves drawing mode.',aliases:['cursor','crosshair']}),
   withNote({id:'DW.CURSOR.DOT',label:'Dot',tvToolId:'dot',iconId:'cursor-dot',target:{kind:'cursor',cursor:'dot'},note:'Small dot cursor on the chart.'}),
   withNote({id:'DW.CURSOR.ARROW_CURSOR',label:'Arrow',tvToolId:'arrow',iconId:'cursor-arrow',target:{kind:'cursor',cursor:'arrow'},note:'Pointer arrow; the crosshair lines are hidden for a mouse.'}),
   // Static-drawing-defaults#creation.hint.demonstration (the Alt hint); the trail is src/chart/demonstration-trail.ts.
   withNote({id:'DW.CURSOR.DEMONSTRATION',label:'Demonstration',tvToolId:'demonstration',iconId:'cursor-demonstration',target:{kind:'cursor',cursor:'demonstration'},note:'Pointer arrow for presenting; the temporary drawing fades out.',hint:'Hold Alt for temporary drawing.'}),
   withNote({id:'DW.CURSOR.MAGIC',label:'Magic',tvToolId:'performance',iconId:'cursor-magic',target:{kind:'cursor',cursor:'magic'},note:'Cross cursor whose crosshair snaps to the nearest open, high, low or close of the bar under it.',aliases:['magnet cursor','magic cursor']}),
  ]),
  section('LV.SECTION.CURSOR_ERASER','',[
   withNote({id:'DW.CURSOR.ERASER',label:'Eraser',tvToolId:'eraser',iconId:'eraser',target:{kind:'mode',mode:'eraser'},note:'Click drawings to remove them; Esc or Cross ends erasing.'}),
  ]),
 ]}),
 group({id:'trend',label:'Trend tools',glyph:'╱',iconId:'trend-line',dataName:'linetool-group-trend-line',sections:[
  section('DW.TREND','Lines',[
   tool('DW.TREND.TRENDLINE','LineToolTrendLine','Trendline','trendline','trend-line',{aliases:['trend line','alt+t'],hotkey:key('Alt + T','setTool',true),hint:SHIFT_45}),
   tool('DW.TREND.RAY','LineToolRay','Ray','ray','ray',{hint:SHIFT_45}),
   tool('DW.TREND.INFO_LINE','LineToolInfoLine','Info line','infoline','info-line',{hint:SHIFT_45}),
   tool('DW.TREND.EXTENDED_LINE','LineToolExtended','Extended line','extendedline','extended-line',{hint:SHIFT_45}),
   tool('DW.TREND.TREND_ANGLE','LineToolTrendAngle','Trend angle','trendangle','trend-angle',{hint:SHIFT_45}),
   tool('DW.TREND.HORIZONTAL_LINE','LineToolHorzLine','Horizontal line','hline','horizontal-line',{hotkey:key('Alt + H','drawRightThere',true)}),
   tool('DW.TREND.HORIZONTAL_RAY','LineToolHorzRay','Horizontal ray','hray','horizontal-ray',{hotkey:key('Alt + J','drawRightThere',true)}),
   tool('DW.TREND.VERTICAL_LINE','LineToolVertLine','Vertical line','vline','vertical-line',{hotkey:key('Alt + V','drawRightThere',true)}),
   tool('DW.TREND.CROSSLINE','LineToolCrossLine','Crossline','crossline','cross-line',{aliases:['cross line'],hotkey:key('Alt + C','drawRightThere',true)}),
  ]),
  section('DW.CHANNEL','Channels',[
   tool('DW.CHANNEL.PARALLEL_CHANNEL','LineToolParallelChannel','Parallel channel','parallelchannel','parallel-channel'),
   tool('DW.CHANNEL.REGRESSION_TREND','LineToolRegressionTrend','Regression trend','regressionchannel','regression-trend',{aliases:['linear regression'],note:'Channel computed from the loaded bars.'}),
   tool('DW.CHANNEL.FLAT_TOP_BOTTOM','LineToolFlatBottom','Flat top/bottom','flattopbottom','flat-top-bottom'),
   tool('DW.CHANNEL.DISJOINT_CHANNEL','LineToolDisjointAngle','Disjoint channel','disjointchannel','disjoint-channel'),
  ]),
  section('DW.PITCHFORK','Pitchforks',[
   tool('DW.PITCHFORK.PITCHFORK','LineToolPitchfork','Pitchfork','pitchfork','pitchfork',{aliases:['classic pitchfork','andrews']}),
   tool('DW.PITCHFORK.SCHIFF_PITCHFORK','LineToolSchiffPitchfork2','Schiff pitchfork','schiffpitchfork','schiff-pitchfork'),
   tool('DW.PITCHFORK.MODIFIED_SCHIFF_PITCHFORK','LineToolSchiffPitchfork','Modified Schiff pitchfork','modifiedschiffpitchfork','modified-schiff-pitchfork'),
   tool('DW.PITCHFORK.INSIDE_PITCHFORK','LineToolInsidePitchfork','Inside pitchfork','insidepitchfork','inside-pitchfork'),
  ]),
 ]}),
 group({id:'fib',label:'Gann and Fibonacci tools',glyph:'≋',iconId:'fib-retracement',dataName:'linetool-group-gann-and-fibonacci',sections:[
  section('DW.FIB','Fibonacci',[
   tool('DW.FIB.FIBONACCI_RETRACEMENT','LineToolFibRetracement','Fib retracement','fibretracement','fib-retracement',{aliases:['fibonacci retracement'],hotkey:key('Alt + F','setTool',true)}),
   tool('DW.FIB.TREND_BASED_FIB_EXTENSION','LineToolTrendBasedFibExtension','Trend-based fib extension','fibextensiontrend','trend-based-fib-extension'),
   tool('DW.FIB.FIB_CHANNEL','LineToolFibChannel','Fib channel','fibchannel','fib-channel'),
   tool('DW.FIB.FIB_TIME_ZONE','LineToolFibTimeZone','Fib time zone','fibtimezones','fib-time-zone'),
   tool('DW.FIB.FIB_SPEED_RESISTANCE_FAN','LineToolFibSpeedResistanceFan','Fib speed resistance fan','fibspeedfan','fib-speed-resistance-fan'),
   tool('DW.FIB.TREND_BASED_FIB_TIME','LineToolTrendBasedFibTime','Trend-based fib time','trendfibtime','trend-based-fib-time'),
   tool('DW.FIB.FIB_CIRCLES','LineToolFibCircles','Fib circles','fibcircles','fib-circles'),
   tool('DW.FIB.FIB_SPIRAL','LineToolFibSpiral','Fib spiral','fibspiral','fib-spiral'),
   tool('DW.FIB.FIB_SPEED_RESISTANCE_ARCS','LineToolFibSpeedResistanceArcs','Fib speed resistance arcs','fibarcs','fib-speed-resistance-arcs'),
   tool('DW.FIB.FIB_WEDGE','LineToolFibWedge','Fib wedge','fibwedge','fib-wedge'),
   missing('DW.FIB.PITCHFAN','LineToolPitchfan','Pitchfan','pitchfan','The renderer has no pitchfan (its Fib fan is a different two-point tool). '+NEEDS_OBSERVATION),
  ]),
  section('DW.GANN','Gann',[
   tool('DW.GANN.GANN_BOX','LineToolGannSquare','Gann box','gannbox','gann-box'),
   missing('DW.GANN.GANN_SQUARE_FIXED','LineToolGannFixed','Gann square fixed','gann-square-fixed','The renderer has no fixed-ratio Gann square. '+NEEDS_OBSERVATION,'gannsquare'),
   tool('DW.GANN.GANN_SQUARE','LineToolGannComplex','Gann square','gannsquare','gann-square'),
   tool('DW.GANN.GANN_FAN','LineToolGannFan','Gann fan','gannfan','gann-fan'),
  ]),
 ]}),
 group({id:'patterns',label:'Patterns',glyph:'⋀',iconId:'xabcd-pattern',dataName:'linetool-group-patterns',sections:[
  section('DW.PATTERN','Chart patterns',[
   tool('DW.PATTERN.XABCD_PATTERN','LineTool5PointsPattern','XABCD pattern','xabcd','xabcd-pattern',{aliases:['harmonic']}),
   tool('DW.PATTERN.CYPHER_PATTERN','LineToolCypherPattern','Cypher pattern','cypher','cypher-pattern'),
   tool('DW.PATTERN.HEAD_AND_SHOULDERS_PATTERN','LineToolHeadAndShoulders','Head and shoulders','headshoulders','head-shoulders'),
   tool('DW.PATTERN.ABCD_PATTERN','LineToolABCD','ABCD pattern','abcd','abcd-pattern'),
   missing('DW.PATTERN.TRIANGLE_PATTERN','LineToolTrianglePattern','Triangle pattern','triangle-pattern','The renderer Triangle is a geometric shape, not this pattern. '+NEEDS_OBSERVATION),
   missing('DW.PATTERN.THREE_DRIVES_PATTERN','LineToolThreeDrivers','Three drives pattern','three-drives-pattern',NEEDS_OBSERVATION),
  ]),
  section('DW.ELLIOTT','Elliott waves',[
   tool('DW.ELLIOTT.ELLIOTT_IMPULSE_WAVE','LineToolElliottImpulse','Elliott impulse wave (1·2·3·4·5)','elliottimpulse','elliott-impulse',{aliases:['1-2-3-4-5']}),
   tool('DW.ELLIOTT.ELLIOTT_CORRECTION_WAVE','LineToolElliottCorrection','Elliott correction wave (A·B·C)','elliottcorrection','elliott-correction',{aliases:['a-b-c']}),
   missing('DW.ELLIOTT.ELLIOTT_TRIANGLE_WAVE','LineToolElliottTriangle','Elliott triangle wave (A·B·C·D·E)','elliott-triangle',NEEDS_OBSERVATION),
   missing('DW.ELLIOTT.ELLIOTT_DOUBLE_COMBO_WAVE','LineToolElliottDoubleCombo','Elliott double combo wave (W·X·Y)','elliott-double-combo',NEEDS_OBSERVATION),
   missing('DW.ELLIOTT.ELLIOTT_TRIPLE_COMBO_WAVE','LineToolElliottTripleCombo','Elliott triple combo wave (W·X·Y·X·Z)','elliott-triple-combo',NEEDS_OBSERVATION),
  ]),
  section('DW.CYCLE','Cycles',[
   missing('DW.CYCLE.CYCLIC_LINES','LineToolCircleLines','Cyclic lines','cyclic-lines',NEEDS_OBSERVATION),
   missing('DW.CYCLE.TIME_CYCLES','LineToolTimeCycles','Time cycles','time-cycles',NEEDS_OBSERVATION),
   missing('DW.CYCLE.SINE_LINE','LineToolSineLine','Sine line','sine-line',NEEDS_OBSERVATION),
  ]),
 ]}),
 group({id:'forecast',label:'Forecasting and measurement tools',glyph:'⚑',iconId:'long-position',dataName:'linetool-group-prediction-and-measurement',sections:[
  section('DW.FORECAST','Forecasting',[
   tool('DW.FORECAST.LONG_POSITION','LineToolRiskRewardLong','Long position','position','long-position',{note:'Click the entry, then the target. A click at the entry places a default long box; a target below the entry makes it short.'}),
   missing('DW.FORECAST.SHORT_POSITION','LineToolRiskRewardShort','Short position','short-position'),
   missing('DW.FORECAST.POSITION_FORECAST','LineToolPrediction','Position forecast','position-forecast',NEEDS_OBSERVATION),
   missing('DW.FORECAST.BARS_PATTERN','LineToolBarsPattern','Bars pattern','bars-pattern',NEEDS_RENDERER),
   missing('DW.FORECAST.GHOST_FEED','LineToolGhostFeed','Ghost feed','ghost-feed',NEEDS_RENDERER),
   missing('DW.FORECAST.SECTOR','LineToolProjection','Sector','sector',NEEDS_OBSERVATION),
  ]),
  section('DW.VOLUME','Volume-based',[
   tool('DW.VOLUME.ANCHORED_VWAP','LineToolAnchoredVWAP','Anchored VWAP','anchoredvwap','anchored-vwap'),
   tool('DW.VOLUME.FIXED_RANGE_VOLUME_PROFILE','LineToolFixedRangeVolumeProfile','Fixed range volume profile','fixedrangevp','fixed-range-volume-profile'),
   missing('DW.VOLUME.ANCHORED_VOLUME_PROFILE','LineToolAnchoredVolumeProfile','Anchored volume profile','anchored-volume-profile',NEEDS_OBSERVATION,'fixedrangevp'),
  ]),
  section('DW.MEASURE','Measurers',[
   missing('DW.MEASURE.PRICE_RANGE','LineToolPriceRange','Price range','price-range'),
   missing('DW.MEASURE.DATE_RANGE','LineToolDateRange','Date range','date-range'),
   tool('DW.MEASURE.DATE_AND_PRICE_RANGE','LineToolDateAndPriceRange','Date and price range','datepricerange','price-date-range'),
  ]),
 ]}),
 group({id:'shapes',label:'Geometric shapes',glyph:'□',iconId:'brush',dataName:'linetool-group-geometric-shapes',sections:[
  section('LV.SECTION.BRUSHES','Brushes',[
   tool('DW.SHAPE.BRUSH','LineToolBrush','Brush','freehand','brush',{note:'Stays armed after each stroke until Esc or Cross.'}),
   tool('DW.SHAPE.HIGHLIGHTER','LineToolHighlighter','Highlighter','highlighter','highlighter',{note:'Stays armed after each stroke until Esc or Cross.'}),
  ]),
  section('LV.SECTION.ARROWS','Arrows',[
   missing('DW.SHAPE.ARROW_MARKER','LineToolArrowMarker','Arrow marker','arrow-marker','The renderer has no arrow marker shape. '+NEEDS_OBSERVATION,'arrow'),
   tool('DW.SHAPE.ARROW','LineToolArrow','Arrow','arrow','arrow',{hint:SHIFT_45}),
   tool('DW.SHAPE.ARROW_UP','LineToolArrowMarkUp','Arrow mark up','arrowmarkup','arrow-mark-up'),
   tool('DW.SHAPE.ARROW_DOWN','LineToolArrowMarkDown','Arrow mark down','arrowmarkdown','arrow-mark-down'),
  ]),
  section('DW.SHAPE','Shapes',[
   tool('DW.SHAPE.RECTANGLE','LineToolRectangle','Rectangle','box','rectangle',{hotkey:key('Alt + Shift + R','setTool',true)}),
   tool('DW.SHAPE.ROTATED_RECTANGLE','LineToolRotatedRectangle','Rotated rectangle','rotatedrect','rotated-rectangle'),
   tool('DW.SHAPE.PATH','LineToolPath','Path','path','path'),
   tool('DW.SHAPE.CIRCLE','LineToolCircle','Circle','circle','circle'),
   tool('DW.SHAPE.ELLIPSE','LineToolEllipse','Ellipse','ellipse','ellipse'),
   tool('DW.SHAPE.POLYLINE','LineToolPolyline','Polyline','polyline','polyline'),
   tool('DW.SHAPE.TRIANGLE','LineToolTriangle','Triangle','triangle','triangle'),
   tool('DW.SHAPE.ARC','LineToolArc','Arc','arc','arc'),
   tool('DW.SHAPE.CURVE','LineToolBezierQuadro','Curve','curve','curve'),
   missing('DW.SHAPE.DOUBLE_CURVE','LineToolBezierCubic','Double curve','double-curve','The renderer has no double curve. '+NEEDS_OBSERVATION,'curve'),
  ]),
 ]}),
 group({id:'annotation',label:'Annotation tools',glyph:'T',iconId:'text',dataName:'linetool-group-annotation',sections:[
  section('DW.ANNOTATION','Text and notes',[
   tool('DW.ANNOTATION.TEXT','LineToolText','Text','text','text'),
   missing('DW.ANNOTATION.ANCHORED_TEXT','LineToolTextAbsolute','Anchored text','anchored-text','Renderer text is anchored to time and price, not to the screen. '+NEEDS_RENDERER,'text'),
   tool('DW.ANNOTATION.NOTE','LineToolTextNote','Note','note','note'),
   tool('DW.ANNOTATION.PRICE_NOTE','LineToolPriceNote','Price note','pricenote','price-note'),
   missing('DW.ANNOTATION.PIN','LineToolNote','Pin','pin',NEEDS_RENDERER),
   missing('DW.ANNOTATION.TABLE','LineToolTable','Table','table',NEEDS_RENDERER),
   tool('DW.ANNOTATION.CALLOUT','LineToolCallout','Callout','callout','callout'),
   tool('DW.ANNOTATION.COMMENT','LineToolComment','Comment','comment','comment'),
   tool('DW.ANNOTATION.PRICE_LABEL','LineToolPriceLabel','Price label','pricelabel','price-label'),
   tool('DW.ANNOTATION.SIGNPOST','LineToolSignpost','Signpost','signpost','signpost'),
   tool('LV.ROW.FLAG_MARK','LineToolFlagMark','Flag mark','flagmark','flag'),
  ]),
  section('LV.SECTION.CONTENT','Content',[
   missing('DW.ANNOTATION.IMAGE','LineToolImage','Image','image','Local image placement needs new chart renderer and storage support that is not built yet.'),
   missing('LV.ROW.POST','LineToolTweet','Post','post',HOSTED),
   missing('LV.ROW.IDEA','LineToolIdea','Idea','idea',HOSTED),
  ]),
 ]}),
 group({id:'icons',label:'Icons',glyph:'☺',iconId:'icon-smiley',dataName:'linetool-group-font-icons',opensFlyout:true,buttonTitle:'Icon',sections:[
  section('LV.SECTION.ICON_TABS','',[
   missing('DW.ANNOTATION.EMOJI','LineToolEmoji','Emojis','icon-smiley','The emoji picker is not built yet.','iconstamp'),
   missing('DW.ANNOTATION.STICKERS','LineToolSticker','Stickers','sticker','Needs original OpenCandle sticker art and renderer image support.'),
   tool('DW.ANNOTATION.ICONS','LineToolIcon','Icons','iconstamp','icon-star',{note:'Places an icon stamp; choose the symbol in its settings.'}),
  ]),
 ]}),
]);

/** Arms each module row (src/chart/lv-types `catalog`). A module may arm only an unavailable reference row, each row once;
 *  the row keeps its reference id, label, tool id and icon, plus any aliases, hotkey or hint the reference row carries. */
export function armCatalog(groups:readonly DrawingToolGroup[],arms:readonly LvCatalogArm[]):readonly DrawingToolGroup[]{
 const byRow=new Map<string,LvCatalogArm>();
 for(const arm of arms){if(byRow.has(arm.rowId))throw Error('Drawing catalog row armed twice: '+arm.rowId);byRow.set(arm.rowId,arm);}
 const used=new Set<string>();
 const armed=groups.map(value=>group({...value,sections:value.sections.map(part=>section(part.id,part.label,part.leaves.map(leaf=>{
  const arm=byRow.get(leaf.id);if(!arm)return leaf;
  if(leaf.target.kind!=='unavailable'||!leaf.tvToolId||!leaf.iconId)throw Error('Drawing catalog module may arm only an unavailable reference row: '+leaf.id);
  used.add(leaf.id);
  const extra:Extra={};
  const aliases=arm.aliases??leaf.aliases,hotkey=arm.hotkey??leaf.hotkey,hint=arm.hint??leaf.hint;
  if(aliases)extra.aliases=aliases;if(hotkey)extra.hotkey=hotkey;if(hint)extra.hint=hint;
  return tool(leaf.id,leaf.tvToolId,leaf.label,arm.type,leaf.iconId,arm.note===undefined?extra:{note:arm.note,...extra});
 })))}));
 for(const id of byRow.keys())if(!used.has(id))throw Error('Drawing catalog module arms an unknown row: '+id);
 return Object.freeze(armed);
}
export const DRAWING_TOOL_CATALOG:readonly DrawingToolGroup[]=armCatalog(REFERENCE_CATALOG,LV_DRAWING_TOOL_MODULES.flatMap(module=>module.catalog??[]));

/** LV icon id of the first catalog row that arms a renderer type (object tree rows for types the icon registry does not list, e.g. OpenCandle types). */
const TYPE_ICON:ReadonlyMap<string,string>=new Map(DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(part=>part.leaves.flatMap(leaf=>leaf.target.kind==='tool'&&leaf.iconId?[[leaf.target.type,leaf.iconId] as const]:[]))).reverse());
export const drawingTypeIconId=(type:string):string|undefined=>TYPE_ICON.get(type);