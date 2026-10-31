// LV toolbar icon set: 28x28 design box, 1px stroke, content inside roughly 3..25 on both axes.
// Original OpenCandle drawings made from plain-language metaphors (see registry.ts); no third-party
// path data. Horizontal/vertical strokes sit on half-pixel coordinates so they render crisp at 100%.
import React from 'react';
import {lvIcon} from './LvIcon';
import {ANCHOR_GAP as G,ANCHOR_R,arcArrow,arrowHead,chain,regularPolygon,segment,starPolygon,type Point} from './geometry';

const BOX={width:28,height:28};
/** Hollow anchor ring, the shared marker for drawing-tool control points. */
const A=({at}:{at:Point})=><circle cx={at[0]} cy={at[1]} r={ANCHOR_R}/>;
/** Solid detail (eyes, dots): the only place fill is allowed; counted as a solid part. */
const Dot=({at,r}:{at:Point;r:number})=><circle cx={at[0]} cy={at[1]} r={r} fill="currentColor" stroke="none"/>;
const icon=(name:string,body:React.ReactNode)=>lvIcon(name,BOX,body);

// ---- Left toolbar: cursors -------------------------------------------------------------
export const CursorCrossIcon=icon('cursor-cross',<path d="M14.5 4V12M14.5 17V25M4 14.5H12M17 14.5H25"/>);
export const CursorDotIcon=icon('cursor-dot',<Dot at={[14.5,14.5]} r={2.5}/>);
export const CursorArrowIcon=icon('cursor-arrow',<path d="M9.5 5.5V21.5L13.5 17.5L16.5 23.5L18.5 22.5L15.5 16.5H20.5Z"/>);
export const CursorDemonstrationIcon=icon('cursor-demonstration',<><Dot at={[14.5,14.5]} r={2}/><circle cx={14.5} cy={14.5} r={5}/><circle cx={14.5} cy={14.5} r={9} strokeDasharray="2 2"/></>);
export const EraserIcon=icon('eraser',<path d="M6.5 17.5L15.5 8.5L21.5 14.5L12.5 23.5ZM10 14L16 20M12.5 23.5H23.5"/>);

// ---- Left toolbar: lines and channels ---------------------------------------------------
const trendA:Point=[6.5,21.5],trendB:Point=[21.5,6.5];
export const TrendLineIcon=icon('trend-line',<><path d={segment(trendA,trendB,G,G)}/><A at={trendA}/><A at={trendB}/></>);
export const RayIcon=icon('ray',<><path d={segment(trendA,[25.5,2.5],G,0)}/><A at={trendA}/></>);
const extA:Point=[9.5,18.5],extB:Point=[18.5,9.5];
export const ExtendedLineIcon=icon('extended-line',<><path d={segment([3,25],extA,0,G)+segment(extA,extB,G,G)+segment(extB,[25,3],G,0)}/><A at={extA}/><A at={extB}/></>);
const infoA:Point=[5.5,18.5],infoB:Point=[16.5,7.5];
export const InfoLineIcon=icon('info-line',<><path d={segment(infoA,infoB,G,G)}/><A at={infoA}/><A at={infoB}/><rect x={14.5} y={15.5} width={10} height={8} rx={1}/><path d="M16.5 18.5H22.5M16.5 20.5H20.5"/></>);
const angleA:Point=[6.5,20.5],angleB:Point=[21.5,8.5];
export const TrendAngleIcon=icon('trend-angle',<><path d={segment(angleA,angleB,G,G)}/><A at={angleA}/><A at={angleB}/><path d="M8.5 20.5H24.5M13.5 20.5A7 7 0 0 0 11.97 16.13"/></>);
export const HorizontalLineIcon=icon('horizontal-line',<><path d="M3 14.5H12.5M16.5 14.5H25"/><A at={[14.5,14.5]}/></>);
export const HorizontalRayIcon=icon('horizontal-ray',<><path d="M8.5 14.5H25"/><A at={[6.5,14.5]}/></>);
export const VerticalLineIcon=icon('vertical-line',<><path d="M14.5 3V12.5M14.5 16.5V25"/><A at={[14.5,14.5]}/></>);
export const CrossLineIcon=icon('cross-line',<><path d="M3 14.5H12.5M16.5 14.5H25M14.5 3V12.5M14.5 16.5V25"/><A at={[14.5,14.5]}/></>);
const chanA:Point=[6.5,12.5],chanB:Point=[21.5,5.5];
export const ParallelChannelIcon=icon('parallel-channel',<><path d={segment(chanA,chanB,G,G)+'M5 23.2L23 14.8'}/><A at={chanA}/><A at={chanB}/></>);
const regA:Point=[6.5,18.5],regB:Point=[21.5,11.5];
export const RegressionTrendIcon=icon('regression-trend',<><path d={segment(regA,regB,G,G)}/><A at={regA}/><A at={regB}/><path d="M4 14.17L24 4.83M4 25.17L24 15.83" strokeDasharray="2 2"/></>);
const forkA:Point=[4.5,20.5],forkB:Point=[13.5,8.5],forkC:Point=[17.5,20.5];
export const PitchforkIcon=icon('pitchfork',<><path d={segment(forkA,[25,9.32],G,0)+segment(forkB,forkC,G,G)+segment(forkB,[25,2.23],G,0)+segment(forkC,[25,16.41],G,0)}/><A at={forkA}/><A at={forkB}/><A at={forkC}/></>);

// ---- Left toolbar: Fibonacci, Gann, patterns -------------------------------------------
export const FibRetracementIcon=icon('fib-retracement',<><path d="M3 6.5H21.5M3 11.5H25M3 16.5H25M6.5 21.5H25"/><A at={[23.5,6.5]}/><A at={[4.5,21.5]}/></>);
export const GannBoxIcon=icon('gann-box',<><rect x={4.5} y={4.5} width={19} height={19}/><path d="M10.5 4.5V23.5M17.5 4.5V23.5M4.5 10.5H23.5M4.5 17.5H23.5M4.5 23.5L23.5 4.5"/></>);
const fanO:Point=[5.5,22.5];
export const GannFanIcon=icon('gann-fan',<><path d={([[24.5,3.5],[24.5,10.5],[24.5,16.5],[17.5,3.5],[11.5,3.5]] as Point[]).map(end=>segment(fanO,end,G,0)).join('')}/><A at={fanO}/></>);
const xabcd:Point[]=[[4.5,7.5],[9.5,20.5],[14.5,11.5],[19.5,20.5],[23.5,7.5]];
export const XabcdPatternIcon=icon('xabcd-pattern',<><path d={chain(xabcd,xabcd.map(()=>true))}/>{xabcd.map(point=><A key={point.join()} at={point}/>)}</>);
export const HeadShouldersIcon=icon('head-shoulders',<><path d="M3.5 21.5L7.5 13.5L10.5 17.5L14.5 5.5L18.5 17.5L21.5 13.5L25 21.5"/><path d="M7 17.5H22" strokeDasharray="2 2"/></>);
const wave:Point[]=[[4.5,22.5],[9.5,13.5],[12.5,18.5],[18.5,6.5],[21.5,11.5],[23.5,5.5]];
export const ElliottImpulseIcon=icon('elliott-impulse',<><path d={chain(wave,wave.map(()=>true))}/>{wave.map(point=><A key={point.join()} at={point}/>)}</>);

// ---- Left toolbar: forecasting and measurement -----------------------------------------
const rails=<><path d="M7.5 6.5H24M7.5 22.5H24"/><A at={[5.5,6.5]}/><A at={[5.5,22.5]}/><rect x={10.5} y={10.5} width={10} height={8}/></>;
export const LongPositionIcon=icon('long-position',<>{rails}<path d="M13 16L15.5 13.5L18 16"/></>);
export const ShortPositionIcon=icon('short-position',<>{rails}<path d="M13 13L15.5 15.5L18 13"/></>);
export const PriceRangeIcon=icon('price-range',<path d="M6 5.5H23M6 23.5H23M14.5 7.5V21.5M11.5 10.5L14.5 7.5L17.5 10.5M11.5 18.5L14.5 21.5L17.5 18.5"/>);
export const DateRangeIcon=icon('date-range',<path d="M5.5 6V23M23.5 6V23M7.5 14.5H21.5M10.5 11.5L7.5 14.5L10.5 17.5M18.5 11.5L21.5 14.5L18.5 17.5"/>);
export const PriceDateRangeIcon=icon('price-date-range',<><rect x={4.5} y={4.5} width={19} height={19} strokeDasharray="2 2"/><path d="M8 14.5H21M10.5 12L8 14.5L10.5 17M18.5 12L21 14.5L18.5 17M14.5 8V21M12 10.5L14.5 8L17 10.5M12 18.5L14.5 21L17 18.5"/></>);
export const MeasureIcon=icon('measure',<path d="M3.5 19.5L19.5 3.5L24.5 8.5L8.5 24.5ZM6.5 16.5L8 18M9.5 13.5L12 16M12.5 10.5L14 12M15.5 7.5L18 10"/>);

// ---- Left toolbar: shapes, brushes, annotation -----------------------------------------
export const BrushIcon=icon('brush',<path d="M4 24.5C4.5 21 6.5 18.5 8.5 18.5C10 18.5 11 19.5 11 21C11 23 8.5 24.5 4 24.5ZM10.5 18C13.5 12.5 18 16 20 11C21 8.5 22.5 5.5 24.5 4"/>);
export const HighlighterIcon=icon('highlighter',<path d="M9.5 16.5L19.5 6.5L22.5 9.5L12.5 19.5ZM9.5 16.5L7.5 21.5L12.5 19.5M3.5 24.5H24.5"/>);
const rectA:Point=[5.5,7.5],rectC:Point=[22.5,20.5];
export const RectangleIcon=icon('rectangle',<><path d="M7.5 7.5H22.5V18.5M5.5 9.5V20.5H20.5"/><A at={rectA}/><A at={rectC}/></>);
export const EllipseIcon=icon('ellipse',<><ellipse cx={14} cy={14} rx={8.5} ry={5.5}/><A at={[4.5,7.5]}/><A at={[23.5,20.5]}/></>);
const circleC:Point=[14.5,14.5];
export const CircleIcon=icon('circle',<><circle cx={14.5} cy={14.5} r={8.5}/><path d={segment(circleC,[20.51,8.49],G,0)}/><A at={circleC}/></>);
const tri:Point[]=[[4.5,22.5],[14.5,5.5],[23.5,20.5]];
export const TriangleIcon=icon('triangle',<><path d={chain(tri,tri.map(()=>true),true)}/>{tri.map(point=><A key={point.join()} at={point}/>)}</>);
const pathPoints:Point[]=[[4.5,21.5],[10.5,12.5],[16.5,17.5]],pathEnd:Point=[24,7.5];
export const PathIcon=icon('path',<><path d={chain(pathPoints,[true,true,true])+segment(pathPoints[2]!,pathEnd,G,0)+arrowHead(pathEnd,pathPoints[2]!,3.5,35)}/>{pathPoints.map(point=><A key={point.join()} at={point}/>)}</>);
export const ArrowMarkUpIcon=icon('arrow-mark-up',<path d="M14.5 4.5L22.5 13.5H17.5V23.5H11.5V13.5H6.5Z"/>);
export const ArrowMarkDownIcon=icon('arrow-mark-down',<path d="M14.5 23.5L22.5 14.5H17.5V4.5H11.5V14.5H6.5Z"/>);
export const TextIcon=icon('text',<path d="M7.5 6.5H21.5M14.5 7V22.5"/>);
export const NoteIcon=icon('note',<path d="M5.5 5.5H22.5V16.5L16.5 22.5H5.5ZM16.5 22.5V16.5H22.5M9 10.5H19M9 14.5H15"/>);
export const CalloutIcon=icon('callout',<path d="M4.5 6.5H23.5V18.5H12.5L7.5 23V18.5H4.5ZM8.5 10.5H19.5M8.5 14.5H15.5"/>);
export const PriceLabelIcon=icon('price-label',<path d="M4.5 9.5H18.5L23.5 14.5L18.5 19.5H4.5ZM8 14.5H15"/>);
export const FlagIcon=icon('flag',<path d="M7.5 4V24.5M7.5 5.5H21.5L18 10L21.5 14.5H7.5"/>);
export const IconSmileyIcon=icon('icon-smiley',<><circle cx={14.5} cy={14.5} r={9.5}/><Dot at={[11.5,12]} r={1.25}/><Dot at={[17.5,12]} r={1.25}/><path d="M10.5 17A4.5 4.5 0 0 0 18.5 17"/></>);

// ---- Left toolbar: utilities -----------------------------------------------------------
export const ZoomInIcon=icon('zoom-in',<><circle cx={12.5} cy={12.5} r={7.5}/><path d="M12.5 9V16M9 12.5H16M18.2 18.2L23.5 23.5"/></>);
export const ZoomOutIcon=icon('zoom-out',<><circle cx={12.5} cy={12.5} r={7.5}/><path d="M9 12.5H16M18.2 18.2L23.5 23.5"/></>);
export const MagnetIcon=icon('magnet',<path d="M8.5 22.5V13A5.5 5.5 0 0 1 19.5 13V22.5H16.5V13A2.5 2.5 0 0 0 11.5 13V22.5ZM8.5 19.5H11.5M16.5 19.5H19.5"/>);
export const KeepDrawingIcon=icon('keep-drawing',<><path d="M17.5 4.5L21.5 8.5L10.5 19.5L6.5 15.5ZM6.5 15.5L4.5 21.5L10.5 19.5M15.5 6.5L19.5 10.5"/><rect x={17.5} y={19.5} width={7} height={5}/><path d="M19.5 19.5V17.5A1.5 1.5 0 0 1 22.5 17.5V19.5"/></>);
const lockBody=<><rect x={8.5} y={13.5} width={12} height={9} rx={1}/><path d="M14.5 16.5V19.5"/></>;
export const LockOpenIcon=icon('lock-drawings',<>{lockBody}<path d="M11.5 13.5V9.5A3 3 0 0 1 17.5 9.5V10.5"/></>);
export const LockClosedIcon=icon('lock-drawings-locked',<>{lockBody}<path d="M11.5 13.5V9.5A3 3 0 0 1 17.5 9.5V13.5"/></>);
export const HideDrawingsIcon=icon('hide-drawings',<><path d="M3.5 12.5C7 7 18 7 21.5 12.5C18 18 7 18 3.5 12.5Z"/><circle cx={12.5} cy={12.5} r={2.5}/><path d="M17.5 24.5V22.5L22.5 17.5L24.5 19.5L19.5 24.5Z"/></>);
export const EyeIcon=icon('eye',<><path d="M4 14.5C8.5 8.5 20.5 8.5 25 14.5C20.5 20.5 8.5 20.5 4 14.5Z"/><circle cx={14.5} cy={14.5} r={3}/></>);
export const RemoveObjectsIcon=icon('remove-objects',<path d="M5.5 8.5H22.5M11.5 8.5V5.5H16.5V8.5M7.5 8.5L9 23.5H19L20.5 8.5M12.5 12V20M15.5 12V20"/>);
export const SyncDrawingsIcon=icon('sync-drawings',<path d={arcArrow(14,14,8,200,320)+arcArrow(14,14,8,20,140)}/>);
export const FavoritesIcon=icon('favorites',<polygon points={starPolygon(14.5,14.5,9.5,4)}/>);
export const ObjectTreeIcon=icon('object-tree',<path d="M14.5 5L23.5 9.5L14.5 14L5.5 9.5ZM5.5 14L14.5 18.5L23.5 14M5.5 18.5L14.5 23L23.5 18.5"/>);
export const AllDrawingToolsIcon=icon('all-drawing-tools',<>{[6.5,12.5,18.5].flatMap(y=>[6.5,12.5,18.5].map(x=><rect key={x+'-'+y} x={x} y={y} width={3} height={3}/>))}</>);

// ---- Header ----------------------------------------------------------------------------
export const MenuIcon=icon('menu',<path d="M5 8.5H23M5 14.5H23M5 20.5H23"/>);
export const SearchIcon=icon('search',<><circle cx={12.5} cy={12.5} r={7}/><path d="M17.9 17.9L23.5 23.5"/></>);
export const QuickSearchIcon=icon('quick-search',<><circle cx={12} cy={15} r={6}/><path d="M16.6 19.6L22 25M21.5 3.5V9.5M18.5 6.5H24.5"/></>);
export const CompareIcon=icon('compare',<><circle cx={14.5} cy={14.5} r={9.5}/><path d="M14.5 10V19M10 14.5H19"/></>);
export const ChartCandlesIcon=icon('chart-candles',<><rect x={8.5} y={9.5} width={4} height={10}/><rect x={15.5} y={12.5} width={4} height={6}/><path d="M10.5 5V9.5M10.5 19.5V24M17.5 9V12.5M17.5 18.5V21"/></>);
export const ChartBarsIcon=icon('chart-bars',<path d="M9.5 6V22M6 9.5H9.5M9.5 18.5H13M18.5 9V23M15 19.5H18.5M18.5 12.5H22"/>);
export const ChartLineIcon=icon('chart-line',<path d="M4 20.5L10 13.5L15 17.5L24 7.5"/>);
export const ChartAreaIcon=icon('chart-area',<path d="M4 20.5L10 13.5L15 17.5L24 7.5V23.5H4Z"/>);
export const IndicatorsIcon=icon('indicators',<path d="M6.5 24V19M11.5 24V16.5M16.5 24V18M21.5 24V15M4 14L9.5 9L14.5 11.5L23.5 4.5"/>);
// The templates icon is a stack of two study sheets (the old two by two squares read as a layout grid).
export const IndicatorTemplatesIcon=icon('indicator-templates',<><path d="M9.5 4.5H22.5V19.5"/><rect x={5.5} y={8.5} width={13} height={15} rx={1.5}/><path d="M8.5 19L11 15.5L13.5 17.5L16 13"/></>);
export const AlertIcon=icon('alert',<><circle cx={13.5} cy={15.5} r={7.5}/><path d="M13.5 11.5V15.5H16.5M5 10A4 4 0 0 1 9 6M8.2 20.8L6.5 22.5M18.8 20.8L20.5 22.5M22.5 3.5V9.5M19.5 6.5H25.5"/></>);
export const ReplayIcon=icon('replay',<path d="M6.5 8V21M15 8L9.5 14.5L15 21M22 8L16.5 14.5L22 21"/>);
export const UndoIcon=icon('undo',<path d="M9 9.5H17A5.5 5.5 0 0 1 17 20.5H10M12 6.5L9 9.5L12 12.5"/>);
export const RedoIcon=icon('redo',<path d="M19 9.5H11A5.5 5.5 0 0 0 11 20.5H18M16 6.5L19 9.5L16 12.5"/>);
// A window split into four panes, so Layout setup reads as the chart grid control.
export const LayoutSetupIcon=icon('layout-setup',<><rect x={3.5} y={4.5} width={21} height={19} rx={2}/><path d="M14 4.5V23.5M3.5 14H24.5"/></>);
export const SettingsIcon=icon('settings',<><polygon points={regularPolygon(14.5,14.5,9.5,6)}/><circle cx={14.5} cy={14.5} r={3.5}/></>);
export const FullscreenIcon=icon('fullscreen',<path d="M4.5 10V4.5H10M18 4.5H23.5V10M23.5 18V23.5H18M10 23.5H4.5V18"/>);
export const SnapshotIcon=icon('snapshot',<><rect x={4.5} y={8.5} width={19} height={14} rx={2}/><path d="M10 8.5L11.5 5.5H16.5L18 8.5"/><circle cx={14} cy={15.5} r={4}/></>);

// ---- Bottom toolbar, widget header, menus ----------------------------------------------
export const GoToDateIcon=icon('go-to-date',<><rect x={4.5} y={6.5} width={15} height={15} rx={1.5}/><path d="M4.5 10.5H19.5M8.5 4.5V8M15.5 4.5V8M14 18.5H24.5M21.5 15.5L24.5 18.5L21.5 21.5"/></>);
export const AddSymbolIcon=icon('add-symbol',<path d="M14.5 7V22M7 14.5H22"/>);
export const AdvancedViewIcon=icon('advanced-view',<><rect x={4.5} y={5.5} width={19} height={17} rx={1}/><path d="M4.5 10.5H23.5M4.5 16.5H23.5M11.5 5.5V22.5"/></>);
export const MoreHorizontalIcon=icon('more-horizontal',<><Dot at={[8,14.5]} r={1.5}/><Dot at={[14,14.5]} r={1.5}/><Dot at={[20,14.5]} r={1.5}/></>);
export const DataWindowIcon=icon('data-window',<><rect x={4.5} y={5.5} width={19} height={17} rx={1}/><path d="M8 10.5H16M8 14.5H20M8 18.5H14"/></>);
export const ImportIcon=icon('import',<path d="M4.5 17V22.5H23.5V17M14.5 4V17M10 12.5L14.5 17L19 12.5"/>);
export const ExportIcon=icon('export',<path d="M4.5 17V22.5H23.5V17M14.5 17V4.5M10 9L14.5 4.5L19 9"/>);
export const StorageIcon=icon('storage',<><ellipse cx={14} cy={7.5} rx={8.5} ry={3}/><path d="M5.5 7.5V20.5M22.5 7.5V20.5M5.5 20.5A8.5 3 0 0 0 22.5 20.5M5.5 14A8.5 3 0 0 0 22.5 14"/></>);
export const InfoIcon=icon('info',<><circle cx={14.5} cy={14.5} r={9.5}/><path d="M14.5 12.5V20"/><Dot at={[14.5,9]} r={1.25}/></>);
export const TypeSettingsIcon=icon('type-settings',<><path d="M5 8.5H11M15 8.5H23M5 14.5H16M20 14.5H23M5 20.5H8M12 20.5H23"/><circle cx={13} cy={8.5} r={2}/><circle cx={18} cy={14.5} r={2}/><circle cx={10} cy={20.5} r={2}/></>);
