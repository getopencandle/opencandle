// LV drawing-tool icons for the flyout leaves (one per drawing tool).
// 28x28 design box, 1px stroke, hollow anchor rings at control points. Original OpenCandle drawings
// made from plain-language metaphors (see registry.ts); no third-party path data.
import React from 'react';
import {lvIcon} from './LvIcon';
import {ANCHOR_GAP as G,ANCHOR_R,arc,blockArrow,chain,rotate,segment,starPolygon,type Point} from './geometry';

const BOX={width:28,height:28};
const A=({at}:{at:Point})=><circle cx={at[0]} cy={at[1]} r={ANCHOR_R}/>;
const icon=(name:string,body:React.ReactNode)=>lvIcon(name,BOX,body);
const anchors=(points:readonly Point[])=>points.map(point=><A key={point.join()} at={point}/>);
/** Zigzag through `points`; `flags` marks which points carry an anchor ring. */
const zigzag=(points:readonly Point[],flags:readonly boolean[]=points.map(()=>true))=><><path d={chain(points,flags)}/>{anchors(points.filter((_,index)=>flags[index]))}</>;
const dash={strokeDasharray:'2 2'} as const;

// ---- Cursors (hidden reference tool) ---------------------------------------------------
export const CursorMagicIcon=icon('cursor-magic',<path d="M5 23L17 11M15.5 9.5L18.5 12.5M20.5 4V8M18.5 6H22.5M23.5 11V14M22 12.5H25M13.5 4.5V7.5M12 6H15"/>);

// ---- Trend tools: channels and pitchforks ----------------------------------------------
const flatA:Point=[5.5,21.5],flatB:Point=[21.5,13.5],flatC:Point=[21.5,6.5];
export const FlatTopBottomIcon=icon('flat-top-bottom',<><path d={segment(flatA,flatB,G,G)+'M3 6.5H19.5'}/>{anchors([flatA,flatB,flatC])}</>);
const disA:Point=[5.5,10.5],disB:Point=[22.5,4.5],disC:Point=[5.5,17.5];
export const DisjointChannelIcon=icon('disjoint-channel',<><path d={segment(disA,disB,G,G)+segment(disC,[22.5,23.5],G,0)}/>{anchors([disA,disB,disC])}</>);
const pfA:Point=[4.5,20.5],pfB:Point=[13.5,8.5],pfC:Point=[17.5,20.5];
const forkFrame=segment(pfB,pfC,G,G);
export const SchiffPitchforkIcon=icon('schiff-pitchfork',<><path d={forkFrame+'M9 14.5H25'+segment(pfB,[25,8.5],G,0)+segment(pfC,[25,20.5],G,0)}/><path d={segment(pfA,[9,14.5],G,0)} {...dash}/>{anchors([pfA,pfB,pfC])}</>);
export const ModifiedSchiffPitchforkIcon=icon('modified-schiff-pitchfork',<><path d={forkFrame+'M9 20.5L25 5.73'+segment(pfB,[17.5,4.81],G,0)+segment(pfC,[25,13.58],G,0)}/><path d="M6.5 20.5H9" {...dash}/>{anchors([pfA,pfB,pfC])}</>);
export const InsidePitchforkIcon=icon('inside-pitchfork',<><path d={forkFrame+segment(pfA,[25,9.32],G,0)+'M14.5 11.5L25 5.77M16.5 17.5L25 12.86'}/>{anchors([pfA,pfB,pfC])}</>);

// ---- Fibonacci and Gann ----------------------------------------------------------------
const extPts:Point[]=[[4.5,21.5],[9.5,9.5],[13.5,17.5]];
export const TrendBasedFibExtensionIcon=icon('trend-based-fib-extension',<><path d={chain(extPts,[true,true,true])} {...dash}/>{anchors(extPts)}<path d="M17 6.5H25M17 11.5H25M17 16.5H25M17 21.5H25"/></>);
const fcA:Point=[5.5,22.5],fcB:Point=[21.5,16.5];
export const FibChannelIcon=icon('fib-channel',<><path d={segment(fcA,fcB,G,G)+'M4 18.56L24 11.06M4 14.06L24 6.56M4 9.56L24 2.06'}/>{anchors([fcA,fcB])}</>);
export const FibTimeZoneIcon=icon('fib-time-zone',<path d="M4.5 5V24M6.5 5V24M9.5 5V24M13.5 5V24M20.5 5V24"/>);
const sfO:Point=[5.5,22.5];
export const FibSpeedResistanceFanIcon=icon('fib-speed-resistance-fan',<><path d={([[23.5,4.5],[23.5,10.5],[23.5,16.5],[11.5,4.5],[17.5,4.5]] as Point[]).map(end=>segment(sfO,end,G,0)).join('')}/><path d="M5.5 4.5H23.5V22.5" {...dash}/><A at={sfO}/></>);
const tftPts:Point[]=[[4.5,20.5],[8.5,8.5],[12.5,16.5]];
export const TrendBasedFibTimeIcon=icon('trend-based-fib-time',<><path d={chain(tftPts,[true,true,true])} {...dash}/>{anchors(tftPts)}<path d="M15.5 4V24M18.5 4V24M23.5 4V24"/></>);
export const FibCirclesIcon=icon('fib-circles',<><circle cx={14.5} cy={14.5} r={4.5}/><circle cx={14.5} cy={14.5} r={7}/><circle cx={14.5} cy={14.5} r={9.5}/><A at={[14.5,14.5]}/></>);
/** Semicircle spiral: alternating centres 1.5px apart, radius growing 1.5px per half turn. */
const spiral=[1.5,3,4.5,6,7.5,9].map((r,index)=>{const cx=index%2?13:14.5;return index%2?`A${r} ${r} 0 0 1 ${cx-r} 14.5`:`A${r} ${r} 0 0 1 ${cx+r} 14.5`;}).join('');
export const FibSpiralIcon=icon('fib-spiral',<path d={'M13 14.5'+spiral}/>);
const faC:Point=[14.5,22.5],faU:Point=[21.5,6.5];
export const FibSpeedResistanceArcsIcon=icon('fib-speed-resistance-arcs',<><path d={[4.5,7.5,10.5].map(r=>`M${14.5-r} 22.5A${r} ${r} 0 0 1 ${14.5+r} 22.5`).join('')}/><path d={segment(faC,faU,G,G)}/>{anchors([faC,faU])}</>);
const fwA:Point=[5.5,20.5],fwB:Point=[21.5,6.5],fwD:Point=[23.5,20.5],fwAngle=Math.atan2(fwB[1]-fwA[1],fwB[0]-fwA[0])*180/Math.PI;
export const FibWedgeIcon=icon('fib-wedge',<><path d={segment(fwA,fwB,G,G)+segment(fwA,fwD,G,G)+[7,11,15].map(r=>arc(fwA[0],fwA[1],r,0,fwAngle)).join('')}/>{anchors([fwA,fwB,fwD])}</>);
const pnA:Point=[4.5,21.5],pnB:Point=[16.5,6.5],pnC:Point=[22.5,16.5];
export const PitchfanIcon=icon('pitchfan',<><path d={segment(pnA,pnB,G,G)+segment(pnA,pnC,G,G)+segment(pnA,[25,7.83],G,0)+segment(pnB,pnC,G,G)}/>{anchors([pnA,pnB,pnC])}</>);
export const GannSquareIcon=icon('gann-square',<><rect x={4.5} y={4.5} width={19} height={19}/><path d={'M4.5 23.5L23.5 4.5M4.5 4.5L23.5 23.5'+arc(4.5,23.5,9.5,-90,0)}/></>);
export const GannSquareFixedIcon=icon('gann-square-fixed',<><rect x={4.5} y={4.5} width={20} height={20}/><path d="M4.5 24.5L24.5 4.5M4.5 4.5L24.5 24.5M14.5 4.5V24.5M4.5 14.5H24.5"/></>);

// ---- Patterns, Elliott waves and cycles ------------------------------------------------
export const CypherPatternIcon=icon('cypher-pattern',zigzag([[4.5,20.5],[9.5,9.5],[13.5,15.5],[18.5,5.5],[23.5,18.5]]));
const abcd:Point[]=[[5.5,6.5],[11.5,20.5],[16.5,11.5],[22.5,22.5]];
export const AbcdPatternIcon=icon('abcd-pattern',<>{zigzag(abcd)}<path d={segment(abcd[0]!,abcd[2]!,G,G)+segment(abcd[1]!,abcd[3]!,G,G)} {...dash}/></>);
export const TrianglePatternIcon=icon('triangle-pattern',<><path d="M4.5 5.5L9.5 21.5L14.5 9.5L18.5 18.5L23.5 13.5"/><path d="M4 5.3L24 13.3M4 23.33L24 16.67" {...dash}/></>);
export const ThreeDrivesPatternIcon=icon('three-drives-pattern',zigzag([[4.5,23.5],[8.5,15.5],[11.5,19.5],[15.5,10.5],[18.5,14.5],[23.5,4.5]],[false,true,false,true,false,true]));
export const ElliottCorrectionIcon=icon('elliott-correction',zigzag([[4.5,6.5],[10.5,17.5],[15.5,11.5],[23.5,22.5]]));
export const ElliottTriangleIcon=icon('elliott-triangle',zigzag([[4.5,5.5],[8.5,22.5],[12.5,8.5],[16.5,19.5],[20.5,11.5],[23.5,16.5]],[true,false,false,false,false,true]));
export const ElliottDoubleComboIcon=icon('elliott-double-combo',zigzag([[4.5,22.5],[10.5,9.5],[15.5,16.5],[23.5,6.5]]));
export const ElliottTripleComboIcon=icon('elliott-triple-combo',zigzag([[4.5,18.5],[8.5,8.5],[12.5,15.5],[16.5,6.5],[20.5,14.5],[23.5,5.5]],[true,false,false,false,false,true]));
export const CyclicLinesIcon=icon('cyclic-lines',<><path d="M4.5 4V12.5M4.5 16.5V24M9.5 4V12.5M9.5 16.5V24M14.5 4V24M19.5 4V24M24.5 4V24"/>{anchors([[4.5,14.5],[9.5,14.5]])}</>);
export const TimeCyclesIcon=icon('time-cycles',<path d="M3 20.5H25M4 20.5A3.5 8 0 0 1 11 20.5A3.5 8 0 0 1 18 20.5A3.5 8 0 0 1 25 20.5"/>);
export const SineLineIcon=icon('sine-line',<path d="M3 14.5Q6.5 4.5 10 14.5T17 14.5T24 14.5"/>);

// ---- Forecasting and volume-based ------------------------------------------------------
const pfcA:Point=[5.5,20.5],pfcB:Point=[20.5,7.5];
export const PositionForecastIcon=icon('position-forecast',<><path d={segment(pfcA,pfcB,G,G)}/><path d="M7.5 20.5H20.5V9.5" {...dash}/>{anchors([pfcA,pfcB])}</>);
export const BarsPatternIcon=icon('bars-pattern',<><rect x={3.5} y={5.5} width={21} height={17} {...dash}/><path d="M8.5 9V19M6.5 11.5H8.5M8.5 16.5H10.5M14.5 8V17M12.5 10.5H14.5M14.5 14.5H16.5M20.5 11V20M18.5 13.5H20.5M20.5 17.5H22.5"/></>);
export const GhostFeedIcon=icon('ghost-feed',<><rect x={4.5} y={11.5} width={2} height={7}/><rect x={9.5} y={8.5} width={2} height={7}/><path d="M5.5 8.5V11.5M5.5 18.5V21M10.5 6V8.5M10.5 15.5V18"/><rect x={15.5} y={10.5} width={2} height={6} strokeDasharray="1 1"/><rect x={20.5} y={6.5} width={2} height={6} strokeDasharray="1 1"/><path d="M16.5 8V10.5M16.5 16.5V19M21.5 4V6.5M21.5 12.5V15" strokeDasharray="1 1"/></>);
const secA:Point=[5.5,22.5],secR=17,secTrim=G/secR*180/Math.PI,secB:Point=[5.5+secR*Math.cos(-Math.PI/4),22.5+secR*Math.sin(-Math.PI/4)],secC:Point=[22.5,22.5];
export const SectorIcon=icon('sector',<><path d={segment(secA,secB,G,G)+segment(secA,secC,G,G)+arc(secA[0],secA[1],secR,-45+secTrim,-secTrim)}/>{anchors([secA,[Math.round(secB[0]*100)/100,Math.round(secB[1]*100)/100],secC])}</>);
export const AnchoredVwapIcon=icon('anchored-vwap',<><path d="M7.5 20.5C11 15 15 17 24 8"/><A at={[5.5,21.5]}/></>);
export const FixedRangeVolumeProfileIcon=icon('fixed-range-volume-profile',<path d="M4.5 4V24M23.5 4V24M4.5 7.5H11M4.5 10.5H16M4.5 13.5H20M4.5 16.5H14M4.5 19.5H9"/>);
export const AnchoredVolumeProfileIcon=icon('anchored-volume-profile',<><path d="M5.5 20.5V4M5.5 7.5H12M5.5 10.5H17M5.5 13.5H21M5.5 16.5H14"/><A at={[5.5,22.5]}/></>);

// ---- Geometric shapes ------------------------------------------------------------------
const arrowA:Point=[6.5,21.5];
export const ArrowIcon=icon('arrow',<><path d={segment(arrowA,[21,7],G,0)+'M14 7H21V14'}/><A at={arrowA}/></>);
export const ArrowMarkerIcon=icon('arrow-marker',<polygon points={blockArrow([4,24],-45,23,9,2,6)}/>);
const rotCorners=rotate([[5.5,9.5],[23.5,9.5],[23.5,19.5],[5.5,19.5]],[14.5,14.5],-30);
export const RotatedRectangleIcon=icon('rotated-rectangle',<><path d={chain(rotCorners,[true,true,false,false],true)}/>{anchors(rotCorners.slice(0,2))}</>);
export const PolylineIcon=icon('polyline',zigzag([[4.5,19.5],[10.5,8.5],[17.5,18.5],[23.5,9.5]]));
const arcCy=20.5+Math.sqrt(81-72.25);
export const ArcIcon=icon('arc',<><path d={arc(14,Math.round(arcCy*100)/100,9,211.92,328.08)}/>{anchors([[5.5,20.5],[22.5,20.5]])}</>);
export const CurveIcon=icon('curve',<><path d="M5.78 19.52Q8 4 20.83 12.4"/>{anchors([[5.5,21.5],[22.5,13.5]])}</>);
export const DoubleCurveIcon=icon('double-curve',<><path d="M6.22 19.63C13 2 15 26 21.78 8.37"/>{anchors([[5.5,21.5],[22.5,6.5]])}</>);

// ---- Annotation: text, notes and content -----------------------------------------------
export const AnchoredTextIcon=icon('anchored-text',<><path d="M7.5 5.5H21.5M14.5 6V18.5"/><A at={[14.5,21.5]}/></>);
const pnoteA:Point=[5.5,21.5];
export const PriceNoteIcon=icon('price-note',<><path d={segment(pnoteA,[12.5,14.5],G,0)+'M15 10.5H22'}/><rect x={12.5} y={5.5} width={12} height={9} rx={1}/><A at={pnoteA}/></>);
export const PinIcon=icon('pin',<><path d="M14.5 24C10 17 8 14.5 8 11A6.5 6.5 0 0 1 21 11C21 14.5 19 17 14.5 24Z"/><circle cx={14.5} cy={11} r={2.5}/></>);
export const TableIcon=icon('table',<><rect x={4.5} y={6.5} width={20} height={15}/><path d="M4.5 11.5H24.5M4.5 16.5H24.5M11.5 6.5V21.5M17.5 6.5V21.5"/></>);
export const CommentIcon=icon('comment',<path d="M7.5 6.5H21.5A3 3 0 0 1 24.5 9.5V15.5A3 3 0 0 1 21.5 18.5H11.5L7.5 22.5V18.5A3 3 0 0 1 4.5 15.5V9.5A3 3 0 0 1 7.5 6.5Z"/>);
export const SignpostIcon=icon('signpost',<path d="M10.5 4V24.5M10.5 6.5H20.5L23.5 9.5L20.5 12.5H10.5M7 24.5H14"/>);
export const ImageIcon=icon('image',<><rect x={4.5} y={6.5} width={19} height={15} rx={1}/><path d="M4.5 19L10.5 13L15 17.5L18 14.5L23.5 20"/><circle cx={17.5} cy={10.5} r={1.5}/></>);
export const PostIcon=icon('post',<><rect x={4.5} y={5.5} width={19} height={17} rx={2}/><circle cx={9.5} cy={10.5} r={2}/><path d="M14 9.5H20.5M8 15.5H20.5M8 18.5H17"/></>);
export const IdeaIcon=icon('idea',<path d="M11.5 18.5C11.5 16 8.5 14.5 8.5 11A6 6 0 0 1 20.5 11C20.5 14.5 17.5 16 17.5 18.5ZM11.5 20.5H17.5M12.5 22.5H16.5"/>);

// ---- Icons group tabs ------------------------------------------------------------------
export const StickerIcon=icon('sticker',<path d="M9.5 5.5H19.5A4 4 0 0 1 23.5 9.5V15.5L15.5 23.5H9.5A4 4 0 0 1 5.5 19.5V9.5A4 4 0 0 1 9.5 5.5ZM23.5 15.5H19.5A4 4 0 0 0 15.5 19.5V23.5"/>);
export const IconStarIcon=icon('icon-star',<><rect x={4.5} y={4.5} width={19} height={19} rx={4}/><polygon points={starPolygon(14,14.5,6.5,2.7)}/></>);
