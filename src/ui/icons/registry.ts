// Typed registry of the LV icon set, for the toolbar, rail and bottom bar.
//
// Accessible-name convention:
// - Icons are decorative by default (aria-hidden="true", focusable="false"). The hosting control carries
//   the accessible name with aria-label (and title for the tooltip).
// - `label` is the canonical accessible name for a control that shows the icon. When a control already
//   ships with a stable accessible name (tests and executable flows find it by name), that existing name
//   wins and must not change because an icon was added; `label` documents the default for new controls.
// - Pass `title` to an icon only when it stands alone and conveys meaning; it then renders role="img",
//   aria-label and an SVG <title>.
// - Icon ids are lower-case kebab-case and never appear in visible text or accessible names.
import type {LvIconArea,LvIconComponent} from './LvIcon';
import * as T from './toolbar-icons';
import * as D from './drawing-tool-icons';
import * as R from './rail-icons';
import * as S from './small-icons';
import * as C from './chart-type-icons';

export interface LvIconEntry{
 readonly id:string;
 readonly Icon:LvIconComponent;
 readonly area:LvIconArea;
 /** Default accessible name for a control showing this icon (sentence case, LV wording). */
 readonly label:string;
 /** What the drawing shows, in LV's own words. */
 readonly metaphor:string;
 /** Elements that are filled (fill="currentColor" stroke="none"); every other element is stroke-only. */
 readonly solidParts:number;
}

const entry=<I extends string>(id:I,Icon:LvIconComponent,area:LvIconArea,label:string,metaphor:string,solidParts=0):LvIconEntry&{readonly id:I}=>Object.freeze({id,Icon,area,label,metaphor,solidParts});

const ENTRIES=[
 // Left toolbar: cursors
 entry('cursor-cross',T.CursorCrossIcon,'left-toolbar','Cursor','thin plus whose arms stop short of the centre'),
 entry('cursor-dot',T.CursorDotIcon,'left-toolbar','Dot','single small solid dot',1),
 entry('cursor-arrow',T.CursorArrowIcon,'left-toolbar','Arrow','outline mouse pointer'),
 entry('cursor-demonstration',T.CursorDemonstrationIcon,'left-toolbar','Demonstration','solid dot inside a ring and a dashed outer ring',1),
 entry('eraser',T.EraserIcon,'left-toolbar','Eraser','tilted eraser block over a base line'),
 // Left toolbar: lines and channels
 entry('trend-line',T.TrendLineIcon,'left-toolbar','Trend line','rising diagonal with a hollow anchor at each end'),
 entry('ray',T.RayIcon,'left-toolbar','Ray','diagonal from one anchor running off the top-right edge'),
 entry('extended-line',T.ExtendedLineIcon,'left-toolbar','Extended line','corner-to-corner diagonal through two anchors'),
 entry('info-line',T.InfoLineIcon,'left-toolbar','Info line','anchored diagonal beside a small text box'),
 entry('trend-angle',T.TrendAngleIcon,'left-toolbar','Trend angle','anchored diagonal over a base line with an angle arc'),
 entry('horizontal-line',T.HorizontalLineIcon,'left-toolbar','Horizontal line','full-width line with one anchor in the middle'),
 entry('horizontal-ray',T.HorizontalRayIcon,'left-toolbar','Horizontal ray','line running right from a left anchor'),
 entry('vertical-line',T.VerticalLineIcon,'left-toolbar','Vertical line','full-height line with one anchor in the middle'),
 entry('cross-line',T.CrossLineIcon,'left-toolbar','Cross line','horizontal and vertical lines crossing at an anchor'),
 entry('parallel-channel',T.ParallelChannelIcon,'left-toolbar','Parallel channel','two parallel diagonals, anchors on the upper one'),
 entry('regression-trend',T.RegressionTrendIcon,'left-toolbar','Regression trend','anchored centre line between two dashed parallels'),
 entry('pitchfork',T.PitchforkIcon,'left-toolbar','Pitchfork','handle line to the middle of a crossbar with three parallel tines'),
 // Left toolbar: Fibonacci, Gann, patterns
 entry('fib-retracement',T.FibRetracementIcon,'left-toolbar','Fibonacci retracement','four evenly stacked horizontal lines, anchors at lower-left and upper-right ends'),
 entry('gann-box',T.GannBoxIcon,'left-toolbar','Gann box','square split into a grid with one diagonal'),
 entry('gann-fan',T.GannFanIcon,'left-toolbar','Gann fan','rays fanning out from a lower-left anchor'),
 entry('xabcd-pattern',T.XabcdPatternIcon,'left-toolbar','XABCD pattern','four-segment zigzag joining five anchors in a W'),
 entry('head-shoulders',T.HeadShouldersIcon,'left-toolbar','Head and shoulders','three peaks, the middle tallest, over a dashed neckline'),
 entry('elliott-impulse',T.ElliottImpulseIcon,'left-toolbar','Elliott impulse wave','five-leg rising zigzag through six anchors'),
 // Left toolbar: forecasting and measurement
 entry('long-position',T.LongPositionIcon,'left-toolbar','Long position','two anchored rails around a box with an up chevron'),
 entry('short-position',T.ShortPositionIcon,'left-toolbar','Short position','two anchored rails around a box with a down chevron'),
 entry('price-range',T.PriceRangeIcon,'left-toolbar','Price range','vertical double arrow between two horizontal rails'),
 entry('date-range',T.DateRangeIcon,'left-toolbar','Date range','horizontal double arrow between two vertical rails'),
 entry('price-date-range',T.PriceDateRangeIcon,'left-toolbar','Date and price range','crossed double arrows inside a dashed box'),
 entry('measure',T.MeasureIcon,'left-toolbar','Measure','diagonal ruler with tick marks along one edge'),
 // Left toolbar: shapes, brushes, annotation
 entry('brush',T.BrushIcon,'left-toolbar','Brush','brush tip at lower-left trailing a curved stroke'),
 entry('highlighter',T.HighlighterIcon,'left-toolbar','Highlighter','chisel marker above a highlight line'),
 entry('arrow',D.ArrowIcon,'left-toolbar','Arrow','anchored diagonal ending in an open corner arrowhead'),
 entry('arrow-marker',D.ArrowMarkerIcon,'left-toolbar','Arrow marker','broad block arrow outline pointing up-right'),
 entry('rectangle',T.RectangleIcon,'left-toolbar','Rectangle','outline rectangle with anchors on two opposite corners'),
 entry('ellipse',T.EllipseIcon,'left-toolbar','Ellipse','outline ellipse with anchors at opposite bounding corners'),
 entry('circle',T.CircleIcon,'left-toolbar','Circle','circle with a centre anchor and a radius line'),
 entry('triangle',T.TriangleIcon,'left-toolbar','Triangle','triangle outline through three anchors'),
 entry('path',T.PathIcon,'left-toolbar','Path','anchored polyline ending in an arrowhead'),
 entry('arrow-mark-up',T.ArrowMarkUpIcon,'left-toolbar','Arrow mark up','block arrow outline pointing up'),
 entry('arrow-mark-down',T.ArrowMarkDownIcon,'left-toolbar','Arrow mark down','block arrow outline pointing down'),
 entry('text',T.TextIcon,'left-toolbar','Text','plain capital T'),
 entry('note',T.NoteIcon,'left-toolbar','Note','sheet with a folded corner and two text lines'),
 entry('callout',T.CalloutIcon,'left-toolbar','Callout','speech bubble with two text lines'),
 entry('price-label',T.PriceLabelIcon,'left-toolbar','Price label','tag pointing right with a value line'),
 entry('flag',T.FlagIcon,'left-toolbar','Flag mark','pole with a notched flag'),
 entry('icon-smiley',T.IconSmileyIcon,'left-toolbar','Icon','smiling face in a circle',2),
 // Left toolbar: remaining flyout tools (one per drawing tool)
 entry('cursor-magic',D.CursorMagicIcon,'left-toolbar','Magic','wand with three small sparkles'),
 entry('flat-top-bottom',D.FlatTopBottomIcon,'left-toolbar','Flat top/bottom','anchored sloped line under a flat anchored top line'),
 entry('disjoint-channel',D.DisjointChannelIcon,'left-toolbar','Disjoint channel','two anchored lines sloping apart'),
 entry('schiff-pitchfork',D.SchiffPitchforkIcon,'left-toolbar','Schiff pitchfork','pitchfork with level tines and a dashed shifted handle start'),
 entry('modified-schiff-pitchfork',D.ModifiedSchiffPitchforkIcon,'left-toolbar','Modified Schiff pitchfork','pitchfork whose handle starts after a short dashed sideways shift'),
 entry('inside-pitchfork',D.InsidePitchforkIcon,'left-toolbar','Inside pitchfork','pitchfork with two inner tines close to the handle line'),
 entry('trend-based-fib-extension',D.TrendBasedFibExtensionIcon,'left-toolbar','Trend-based fib extension','dashed three-anchor zigzag beside four levels'),
 entry('fib-channel',D.FibChannelIcon,'left-toolbar','Fib channel','four parallel diagonals, anchors on the lowest'),
 entry('fib-time-zone',D.FibTimeZoneIcon,'left-toolbar','Fib time zone','vertical lines with growing gaps'),
 entry('fib-speed-resistance-fan',D.FibSpeedResistanceFanIcon,'left-toolbar','Fib speed resistance fan','rays from a corner anchor inside a dashed box'),
 entry('trend-based-fib-time',D.TrendBasedFibTimeIcon,'left-toolbar','Trend-based fib time','dashed three-anchor zigzag beside three vertical lines'),
 entry('fib-circles',D.FibCirclesIcon,'left-toolbar','Fib circles','three circles around a centre anchor'),
 entry('fib-spiral',D.FibSpiralIcon,'left-toolbar','Fib spiral','spiral of growing half circles'),
 entry('fib-speed-resistance-arcs',D.FibSpeedResistanceArcsIcon,'left-toolbar','Fib speed resistance arcs','three half arcs over a base anchor with a guide line'),
 entry('fib-wedge',D.FibWedgeIcon,'left-toolbar','Fib wedge','two anchored rays from an apex with three arcs between them'),
 entry('pitchfan',D.PitchfanIcon,'left-toolbar','Pitchfan','three rays from one anchor through a crossbar'),
 entry('gann-square',D.GannSquareIcon,'left-toolbar','Gann square','square with both diagonals and a corner arc'),
 entry('gann-square-fixed',D.GannSquareFixedIcon,'left-toolbar','Gann square fixed','square with both diagonals and a centre cross'),
 entry('cypher-pattern',D.CypherPatternIcon,'left-toolbar','Cypher pattern','five anchors joined in a rising then falling zigzag'),
 entry('abcd-pattern',D.AbcdPatternIcon,'left-toolbar','ABCD pattern','four-anchor zigzag with two dashed cross links'),
 entry('triangle-pattern',D.TrianglePatternIcon,'left-toolbar','Triangle pattern','zigzag narrowing between two dashed boundary lines'),
 entry('three-drives-pattern',D.ThreeDrivesPatternIcon,'left-toolbar','Three drives pattern','rising zigzag with anchors on three peaks'),
 entry('elliott-correction',D.ElliottCorrectionIcon,'left-toolbar','Elliott correction wave','falling three-leg zigzag through four anchors'),
 entry('elliott-triangle',D.ElliottTriangleIcon,'left-toolbar','Elliott triangle wave','narrowing five-leg zigzag with anchored ends'),
 entry('elliott-double-combo',D.ElliottDoubleComboIcon,'left-toolbar','Elliott double combo wave','rising three-leg zigzag through four anchors'),
 entry('elliott-triple-combo',D.ElliottTripleComboIcon,'left-toolbar','Elliott triple combo wave','sideways five-leg zigzag with anchored ends'),
 entry('cyclic-lines',D.CyclicLinesIcon,'left-toolbar','Cyclic lines','evenly spaced vertical lines, the first two anchored'),
 entry('time-cycles',D.TimeCyclesIcon,'left-toolbar','Time cycles','three equal arches on a base line'),
 entry('sine-line',D.SineLineIcon,'left-toolbar','Sine line','smooth wave crossing a middle line'),
 entry('position-forecast',D.PositionForecastIcon,'left-toolbar','Position forecast','anchored line with dashed time and price legs'),
 entry('bars-pattern',D.BarsPatternIcon,'left-toolbar','Bars pattern','three small bars inside a dashed box'),
 entry('ghost-feed',D.GhostFeedIcon,'left-toolbar','Ghost feed','two solid candles followed by two dotted candles'),
 entry('sector',D.SectorIcon,'left-toolbar','Sector','pie slice with anchors at its apex and arc ends'),
 entry('anchored-vwap',D.AnchoredVwapIcon,'left-toolbar','Anchored VWAP','smooth rising curve starting at an anchor'),
 entry('fixed-range-volume-profile',D.FixedRangeVolumeProfileIcon,'left-toolbar','Fixed range volume profile','horizontal histogram between two range edges'),
 entry('anchored-volume-profile',D.AnchoredVolumeProfileIcon,'left-toolbar','Anchored volume profile','horizontal histogram on a line rising from an anchor'),
 entry('rotated-rectangle',D.RotatedRectangleIcon,'left-toolbar','Rotated rectangle','tilted rectangle with two anchored corners'),
 entry('polyline',D.PolylineIcon,'left-toolbar','Polyline','open three-segment line through four anchors'),
 entry('arc',D.ArcIcon,'left-toolbar','Arc','shallow arc between two anchors'),
 entry('curve',D.CurveIcon,'left-toolbar','Curve','single bend between two anchors'),
 entry('double-curve',D.DoubleCurveIcon,'left-toolbar','Double curve','S-shaped curve between two anchors'),
 entry('anchored-text',D.AnchoredTextIcon,'left-toolbar','Anchored text','capital T standing on an anchor'),
 entry('price-note',D.PriceNoteIcon,'left-toolbar','Price note','anchor with a leader line to a small text box'),
 entry('pin',D.PinIcon,'left-toolbar','Pin','map pin with a round hole'),
 entry('table',D.TableIcon,'left-toolbar','Table','three by three table grid'),
 entry('comment',D.CommentIcon,'left-toolbar','Comment','rounded speech bubble without text'),
 entry('signpost',D.SignpostIcon,'left-toolbar','Signpost','post with a pointed board on a small base'),
 entry('image',D.ImageIcon,'left-toolbar','Image','picture frame with hills and a sun'),
 entry('post',D.PostIcon,'left-toolbar','Post','card with an avatar circle and text lines'),
 entry('idea',D.IdeaIcon,'left-toolbar','Idea','light bulb with a two-line base'),
 entry('sticker',D.StickerIcon,'left-toolbar','Stickers','rounded square with a curled corner'),
 entry('icon-star',D.IconStarIcon,'left-toolbar','Icon','small star inside a rounded square'),
 // Left toolbar: utilities
 entry('zoom-in',T.ZoomInIcon,'left-toolbar','Zoom in','magnifier with a plus inside'),
 entry('zoom-out',T.ZoomOutIcon,'left-toolbar','Zoom out','magnifier with a minus inside'),
 entry('magnet',T.MagnetIcon,'left-toolbar','Magnet','horseshoe magnet, open end down, with pole bars'),
 entry('keep-drawing',T.KeepDrawingIcon,'left-toolbar','Stay in drawing mode','diagonal pencil with a small padlock at lower-right'),
 entry('lock-drawings',T.LockOpenIcon,'left-toolbar','Lock all drawings','open padlock with the shackle lifted on one side'),
 entry('lock-drawings-locked',T.LockClosedIcon,'left-toolbar','Unlock all drawings','closed padlock'),
 entry('hide-drawings',T.HideDrawingsIcon,'left-toolbar','Hide all drawings','eye outline with a small pencil badge'),
 entry('eye',T.EyeIcon,'left-toolbar','Show all drawings','eye outline with a round pupil'),
 entry('remove-objects',T.RemoveObjectsIcon,'left-toolbar','Remove objects','trash can: lid with handle over a tapered body'),
 entry('sync-drawings',T.SyncDrawingsIcon,'left-toolbar','Sync drawings','two curved arrows chasing each other in a circle'),
 entry('favorites',T.FavoritesIcon,'left-toolbar','Favorite drawing tools','five-point star outline'),
 entry('object-tree',T.ObjectTreeIcon,'left-toolbar','Object tree','three stacked rhombus layers'),
 entry('all-drawing-tools',T.AllDrawingToolsIcon,'left-toolbar','All drawing tools','three by three grid of small squares'),
 // Header
 entry('menu',T.MenuIcon,'header','Main menu','three horizontal lines'),
 entry('search',T.SearchIcon,'header','Search symbols','magnifier'),
 entry('quick-search',T.QuickSearchIcon,'header','Quick search','magnifier with a small spark'),
 entry('compare',T.CompareIcon,'header','Compare','plus inside a circle'),
 entry('chart-candles',T.ChartCandlesIcon,'header','Chart type','tall and short candlestick side by side'),
 entry('chart-bars',T.ChartBarsIcon,'header','Bars','two bars with open and close ticks'),
 entry('chart-line',T.ChartLineIcon,'header','Line','rising polyline'),
 entry('chart-area',T.ChartAreaIcon,'header','Area','rising polyline closed down to a base line'),
 entry('type-settings',T.TypeSettingsIcon,'header','Type settings','three sliders with round knobs'),
 entry('indicators',T.IndicatorsIcon,'header','Indicators','line chart rising over four bars'),
 entry('indicator-templates',T.IndicatorTemplatesIcon,'header','Indicator templates','two stacked sheets with a small line chart'),
 entry('alert',T.AlertIcon,'header','Create alert','alarm clock with a small plus at upper right'),
 entry('replay',T.ReplayIcon,'header','Replay','bar with two left chevrons'),
 entry('undo',T.UndoIcon,'header','Undo','arrow curving back to the left'),
 entry('redo',T.RedoIcon,'header','Redo','arrow curving forward to the right'),
 entry('layout-setup',T.LayoutSetupIcon,'header','Layout setup','window split into four panes'),
 entry('settings',T.SettingsIcon,'header','Chart settings','hexagon around a small circle'),
 entry('fullscreen',T.FullscreenIcon,'header','Fullscreen','four corner brackets'),
 entry('snapshot',T.SnapshotIcon,'header','Take a snapshot','camera body with a round lens'),
 // Chart type menu rows and layout menu rows
 entry('chart-hollow-candles',C.ChartHollowCandlesIcon,'header','Hollow candles','one outlined and one solid candle',1),
 entry('chart-volume-candles',C.ChartVolumeCandlesIcon,'header','Volume candles','candles whose widths follow volume'),
 entry('chart-heikin-ashi',C.ChartHeikinAshiIcon,'header','Heikin Ashi','three smoothed candles stepping upward'),
 entry('chart-high-low',C.ChartHighLowIcon,'header','High-low','two floating columns'),
 entry('chart-columns',C.ChartColumnsIcon,'header','Columns','three columns rising from a base'),
 entry('chart-line-markers',C.ChartLineMarkersIcon,'header','Line with markers','rising polyline with a dot at each point',4),
 entry('chart-step-line',C.ChartStepLineIcon,'header','Step line','rising line made of horizontal and vertical steps'),
 entry('chart-hlc-area',C.ChartHlcAreaIcon,'header','HLC area','band between two rising lines'),
 entry('chart-baseline',C.ChartBaselineIcon,'header','Baseline','horizontal level crossed by a rising line'),
 entry('chart-tpo',C.ChartTpoIcon,'header','Time price opportunity','stacked horizontal profile bars'),
 entry('chart-footprint',C.ChartFootprintIcon,'header','Volume footprint','grid of cells'),
 entry('chart-renko',C.ChartRenkoIcon,'header','Renko','three square bricks stepping upward'),
 entry('chart-line-break',C.ChartLineBreakIcon,'header','Line break','three floating blocks of different height'),
 entry('chart-kagi',C.ChartKagiIcon,'header','Kagi','vertical and horizontal steps'),
 entry('chart-range',C.ChartRangeIcon,'header','Range','three equal-height bars stepping upward'),
 entry('chart-point-figure',C.ChartPointFigureIcon,'header','Point and figure','crosses and circles in columns'),
 entry('layout-save',C.LayoutSaveIcon,'menu','Save layout','floppy disk'),
 entry('layout-copy',C.LayoutCopyIcon,'menu','Make a copy','two overlapping sheets'),
 entry('layout-rename',C.LayoutRenameIcon,'menu','Rename layout','pencil over a line'),
 entry('layout-new',C.LayoutNewIcon,'menu','Create new layout','window with a plus sign'),
 entry('layout-open',C.LayoutOpenIcon,'menu','Open layout','open folder'),
 // Bottom toolbar, widget header, menu icon slots
 entry('go-to-date',T.GoToDateIcon,'bottom-toolbar','Go to date','calendar page with an arrow pointing right'),
 entry('data-window',T.DataWindowIcon,'bottom-toolbar','Data window','panel with three value rows'),
 entry('add-symbol',T.AddSymbolIcon,'widget','Add symbol','plus sign'),
 entry('advanced-view',T.AdvancedViewIcon,'widget','Advanced view','table outline with a header row and a column'),
 entry('more-horizontal',T.MoreHorizontalIcon,'widget','More','three solid dots in a row',3),
 entry('import',T.ImportIcon,'menu','Import data','arrow down into a tray'),
 entry('export',T.ExportIcon,'menu','Export workspace','arrow up out of a tray'),
 entry('storage',T.StorageIcon,'menu','Local storage','database cylinder'),
 entry('info',T.InfoIcon,'menu','About OpenCandle','letter i in a circle',1),
 // Right rail (44x44)
 entry('rail-watchlist',R.RailWatchlistIcon,'rail','Watchlist','sheet with list lines and a bookmark notch'),
 entry('rail-alerts',R.RailAlertsIcon,'rail','Alerts','alarm clock'),
 entry('rail-object-tree',R.RailObjectTreeIcon,'rail','Object tree and data window','three stacked rhombus layers'),
 entry('rail-data-window',R.RailDataWindowIcon,'rail','Data window','panel with a header bar and two columns of values'),
 entry('rail-screener',R.RailScreenerIcon,'rail','Stock screener','concentric circles with crosshair ticks'),
 entry('rail-script-editor',R.RailScriptEditorIcon,'rail','Script editor','angle brackets around a slash'),
 entry('rail-calendar',R.RailCalendarIcon,'rail','Calendar','calendar page with two rings and a grid'),
 entry('rail-notifications',R.RailNotificationsIcon,'rail','Notifications','bell with a clapper'),
 entry('rail-news',R.RailNewsIcon,'rail','News and filings','three arcs spreading from a corner dot',1),
 entry('rail-help',R.RailHelpIcon,'rail','Help','question mark in a circle',1),
 entry('rail-fundamentals',R.RailFundamentalsIcon,'rail','Fundamentals','pie chart with one wedge'),
 entry('rail-heatmap',R.RailHeatmapIcon,'rail','Heatmap','four tiles of different sizes'),
 entry('rail-markets',R.RailMarketsIcon,'rail','Markets','three bars beside an up arrow and a down arrow'),
 entry('rail-portfolio',R.RailPortfolioIcon,'rail','Portfolio','briefcase holding a small pie'),
 entry('rail-strategy',R.RailStrategyIcon,'rail','Strategy tester','axes with a rising line ending in an arrow'),
 entry('rail-paper-trading',R.RailPaperTradingIcon,'rail','Paper trading','briefcase'),
 // Small icons
 entry('chevron-down',S.ChevronDownIcon,'small','Open menu','downward chevron'),
 entry('chevron-flyout',S.ChevronFlyoutIcon,'small','Open tool group','right-pointing chevron'),
 entry('data-type',S.DataTypeIcon,'small','Change data type','two thin candlesticks'),
] as const;

export type LvIconId=(typeof ENTRIES)[number]['id'];

/** id -> entry. Frozen; iterate with Object.values or LV_ICON_IDS. */
export const LV_ICONS:Readonly<Record<LvIconId,LvIconEntry>>=Object.freeze(Object.fromEntries(ENTRIES.map(row=>[row.id,row])) as Record<LvIconId,LvIconEntry>);
export const LV_ICON_IDS:readonly LvIconId[]=Object.freeze(ENTRIES.map(row=>row.id as LvIconId));
export function lvIconById(id:LvIconId):LvIconComponent{return LV_ICONS[id].Icon;}

/** Main-button icon for each drawing group id in drawing-toolbar-model (plus the reference Icons group). */
export const DRAWING_GROUP_ICON:Readonly<Record<string,LvIconId>>=Object.freeze({
 cursors:'cursor-cross',trend:'trend-line',fib:'fib-retracement',patterns:'xabcd-pattern',forecast:'long-position',shapes:'brush',annotation:'text',icons:'icon-smiley',
});

/** Icon for a renderer drawing type (drawing-toolbar-model tool targets). Unlisted types use their group icon. */
export const DRAWING_TOOL_ICON:Readonly<Record<string,LvIconId>>=Object.freeze({
 trendline:'trend-line',ray:'ray',infoline:'info-line',extendedline:'extended-line',trendangle:'trend-angle',hline:'horizontal-line',hray:'horizontal-ray',vline:'vertical-line',crossline:'cross-line',
 parallelchannel:'parallel-channel',regressionchannel:'regression-trend',pitchfork:'pitchfork',fibretracement:'fib-retracement',gannbox:'gann-box',gannfan:'gann-fan',
 xabcd:'xabcd-pattern',headshoulders:'head-shoulders',elliottimpulse:'elliott-impulse',position:'long-position',datepricerange:'price-date-range',
 box:'rectangle',ellipse:'ellipse',circle:'circle',triangle:'triangle',path:'path',freehand:'brush',highlighter:'highlighter',arrow:'arrow',arrowmarkup:'arrow-mark-up',arrowmarkdown:'arrow-mark-down',
 text:'text',note:'note',callout:'callout',pricelabel:'price-label',signpost:'signpost',iconstamp:'icon-star',flagmark:'flag',
 flattopbottom:'flat-top-bottom',disjointchannel:'disjoint-channel',insidepitchfork:'inside-pitchfork',schiffpitchfork:'schiff-pitchfork',modifiedschiffpitchfork:'modified-schiff-pitchfork',
 fibextensiontrend:'trend-based-fib-extension',fibchannel:'fib-channel',fibtimezones:'fib-time-zone',fibspeedfan:'fib-speed-resistance-fan',trendfibtime:'trend-based-fib-time',fibcircles:'fib-circles',fibspiral:'fib-spiral',fibarcs:'fib-speed-resistance-arcs',fibwedge:'fib-wedge',gannsquare:'gann-square',
 cypher:'cypher-pattern',abcd:'abcd-pattern',elliottcorrection:'elliott-correction',anchoredvwap:'anchored-vwap',fixedrangevp:'fixed-range-volume-profile',
 rotatedrect:'rotated-rectangle',polyline:'polyline',arc:'arc',curve:'curve',pricenote:'price-note',comment:'comment',
});

/** Icon for every drawing tool, keyed by its catalog tool id.
 * The performance cursor has no icon of its own and uses cursor-magic. */
export const DRAWING_REFERENCE_TOOL_ICON:Readonly<Record<string,LvIconId>>=Object.freeze({
 cursor:'cursor-cross',dot:'cursor-dot',arrow:'cursor-arrow',demonstration:'cursor-demonstration',performance:'cursor-magic',eraser:'eraser',LineToolTrendLine:'trend-line',LineToolRay:'ray',
 LineToolInfoLine:'info-line',LineToolExtended:'extended-line',LineToolTrendAngle:'trend-angle',LineToolHorzLine:'horizontal-line',LineToolHorzRay:'horizontal-ray',LineToolVertLine:'vertical-line',
 LineToolCrossLine:'cross-line',LineToolParallelChannel:'parallel-channel',LineToolRegressionTrend:'regression-trend',LineToolFlatBottom:'flat-top-bottom',LineToolDisjointAngle:'disjoint-channel',
 LineToolPitchfork:'pitchfork',LineToolSchiffPitchfork2:'schiff-pitchfork',LineToolSchiffPitchfork:'modified-schiff-pitchfork',LineToolInsidePitchfork:'inside-pitchfork',
 LineToolFibRetracement:'fib-retracement',LineToolTrendBasedFibExtension:'trend-based-fib-extension',LineToolFibChannel:'fib-channel',LineToolFibTimeZone:'fib-time-zone',
 LineToolFibSpeedResistanceFan:'fib-speed-resistance-fan',LineToolTrendBasedFibTime:'trend-based-fib-time',LineToolFibCircles:'fib-circles',LineToolFibSpiral:'fib-spiral',
 LineToolFibSpeedResistanceArcs:'fib-speed-resistance-arcs',LineToolFibWedge:'fib-wedge',LineToolPitchfan:'pitchfan',LineToolGannSquare:'gann-box',LineToolGannFixed:'gann-square-fixed',
 LineToolGannComplex:'gann-square',LineToolGannFan:'gann-fan',LineTool5PointsPattern:'xabcd-pattern',LineToolCypherPattern:'cypher-pattern',LineToolHeadAndShoulders:'head-shoulders',
 LineToolABCD:'abcd-pattern',LineToolTrianglePattern:'triangle-pattern',LineToolThreeDrivers:'three-drives-pattern',LineToolElliottImpulse:'elliott-impulse',
 LineToolElliottCorrection:'elliott-correction',LineToolElliottTriangle:'elliott-triangle',LineToolElliottDoubleCombo:'elliott-double-combo',LineToolElliottTripleCombo:'elliott-triple-combo',
 LineToolCircleLines:'cyclic-lines',LineToolTimeCycles:'time-cycles',LineToolSineLine:'sine-line',LineToolRiskRewardLong:'long-position',LineToolRiskRewardShort:'short-position',
 LineToolPrediction:'position-forecast',LineToolBarsPattern:'bars-pattern',LineToolGhostFeed:'ghost-feed',LineToolProjection:'sector',LineToolAnchoredVWAP:'anchored-vwap',
 LineToolFixedRangeVolumeProfile:'fixed-range-volume-profile',LineToolAnchoredVolumeProfile:'anchored-volume-profile',LineToolPriceRange:'price-range',LineToolDateRange:'date-range',
 LineToolDateAndPriceRange:'price-date-range',LineToolBrush:'brush',LineToolHighlighter:'highlighter',LineToolArrowMarker:'arrow-marker',LineToolArrow:'arrow',LineToolArrowMarkUp:'arrow-mark-up',
 LineToolArrowMarkDown:'arrow-mark-down',LineToolRectangle:'rectangle',LineToolRotatedRectangle:'rotated-rectangle',LineToolPath:'path',LineToolCircle:'circle',LineToolEllipse:'ellipse',
 LineToolPolyline:'polyline',LineToolTriangle:'triangle',LineToolArc:'arc',LineToolBezierQuadro:'curve',LineToolBezierCubic:'double-curve',LineToolText:'text',LineToolTextAbsolute:'anchored-text',
 LineToolTextNote:'note',LineToolPriceNote:'price-note',LineToolNote:'pin',LineToolTable:'table',LineToolCallout:'callout',LineToolComment:'comment',LineToolPriceLabel:'price-label',
 LineToolSignpost:'signpost',LineToolFlagMark:'flag',LineToolImage:'image',LineToolTweet:'post',LineToolIdea:'idea',LineToolEmoji:'icon-smiley',LineToolSticker:'sticker',LineToolIcon:'icon-star',
});

/** Icon for the cursor-group leaves and the drawing modes. */
export const DRAWING_MODE_ICON:Readonly<Record<string,LvIconId>>=Object.freeze({cursor:'cursor-cross',dot:'cursor-dot',arrow:'cursor-arrow',demonstration:'cursor-demonstration',eraser:'eraser',measure:'measure'});
