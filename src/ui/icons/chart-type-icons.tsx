// LV chart-type icons for the chart type menu: 28x28 design box, 1px stroke, content inside 3..25 (same contract as toolbar-icons).
// Original drawings; candles, bars, line and area reuse the header icons in toolbar-icons.tsx.
import React from 'react';
import {lvIcon} from './LvIcon';

const BOX={width:28,height:28};
const icon=(name:string,body:React.ReactNode)=>lvIcon(name,BOX,body);
const Dot=({x,y}:{x:number;y:number})=><circle cx={x} cy={y} r={1.5} fill="currentColor" stroke="none"/>;

export const ChartHollowCandlesIcon=icon('chart-hollow-candles',<><rect x={6.5} y={9.5} width={5} height={9}/><path d="M9 5V9.5M9 18.5V23"/><rect x={16.5} y={12.5} width={5} height={8} fill="currentColor" stroke="none"/><path d="M19 8V12.5M19 20.5V24"/></>);
export const ChartVolumeCandlesIcon=icon('chart-volume-candles',<><rect x={4.5} y={9.5} width={9} height={8}/><path d="M9 5V9.5M9 17.5V21"/><rect x={17.5} y={12.5} width={4} height={6}/><path d="M19.5 8V12.5M19.5 18.5V22"/></>);
export const ChartHeikinAshiIcon=icon('chart-heikin-ashi',<><rect x={4.5} y={15.5} width={4} height={6}/><path d="M6.5 12V15.5"/><rect x={12} y={11.5} width={4} height={6}/><path d="M14 8V11.5"/><rect x={19.5} y={7.5} width={4} height={6}/><path d="M21.5 4V7.5"/></>);
export const ChartHighLowIcon=icon('chart-high-low',<><rect x={7.5} y={6.5} width={4} height={12}/><rect x={16.5} y={10.5} width={4} height={13}/></>);
export const ChartColumnsIcon=icon('chart-columns',<><rect x={5.5} y={14.5} width={4} height={9}/><rect x={12} y={8.5} width={4} height={15}/><rect x={18.5} y={11.5} width={4} height={12}/></>);
export const ChartLineMarkersIcon=icon('chart-line-markers',<><path d="M4 20.5L10 13.5L15 17.5L24 7.5"/><Dot x={4} y={20.5}/><Dot x={10} y={13.5}/><Dot x={15} y={17.5}/><Dot x={24} y={7.5}/></>);
export const ChartStepLineIcon=icon('chart-step-line',<path d="M4 20.5H9.5V13.5H15V17.5H19.5V8.5H24"/>);
export const ChartHlcAreaIcon=icon('chart-hlc-area',<path d="M4 15.5L10 9.5L15 13.5L24 5.5V12L15 20.5L10 16.5L4 22.5Z"/>);
export const ChartBaselineIcon=icon('chart-baseline',<path d="M4 14.5H24M4 21L10 16L15 18.5L20 10L24 7"/>);
export const ChartTpoIcon=icon('chart-tpo',<path d="M4 6.5H9M4 10.5H15M4 14.5H20M4 18.5H13M4 22.5H8"/>);
export const ChartFootprintIcon=icon('chart-footprint',<><rect x={4.5} y={5.5} width={19} height={17}/><path d="M14 5.5V22.5M4.5 11.5H23.5M4.5 17.5H23.5"/></>);
export const ChartRenkoIcon=icon('chart-renko',<><rect x={4.5} y={17.5} width={6} height={6}/><rect x={11} y={12} width={6} height={6}/><rect x={17.5} y={6.5} width={6} height={6}/></>);
export const ChartLineBreakIcon=icon('chart-line-break',<><rect x={5.5} y={13.5} width={4} height={9}/><rect x={12} y={7.5} width={4} height={15}/><rect x={18.5} y={4.5} width={4} height={9}/></>);
export const ChartKagiIcon=icon('chart-kagi',<path d="M5.5 22.5V12.5H11.5V19.5H17.5V7.5H23.5"/>);
export const ChartRangeIcon=icon('chart-range',<><rect x={4.5} y={15.5} width={4} height={8}/><rect x={11.5} y={10.5} width={4} height={8}/><rect x={18.5} y={5.5} width={4} height={8}/></>);
export const ChartPointFigureIcon=icon('chart-point-figure',<><path d="M5 6L10 11M10 6L5 11M5 13L10 18M10 13L5 18"/><circle cx={15.5} cy={11.5} r={2.5}/><circle cx={15.5} cy={17.5} r={2.5}/><path d="M20 6L25 11M25 6L20 11"/></>);

// ---- Layout menu entries (menu area, same 28x28 box) ------------------------------------------------------------------
export const LayoutSaveIcon=icon('layout-save',<><path d="M6.5 5.5H20.5L23.5 8.5V22.5H6.5Z"/><path d="M10.5 5.5V10.5H18.5V5.5M10.5 22.5V15.5H19.5V22.5"/></>);
export const LayoutCopyIcon=icon('layout-copy',<><rect x={9.5} y={9.5} width={13} height={13}/><path d="M6.5 18.5V5.5H17.5V9.5"/></>);
export const LayoutRenameIcon=icon('layout-rename',<><path d="M16.5 6.5L21.5 11.5L11.5 21.5H6.5V16.5Z"/><path d="M14 9L19 14M6.5 24.5H23.5"/></>);
export const LayoutNewIcon=icon('layout-new',<><rect x={5.5} y={7.5} width={17} height={15}/><path d="M14 11V19M10 15H18"/></>);
export const LayoutOpenIcon=icon('layout-open',<path d="M4.5 21.5V7.5H11.5L13.5 10H22.5V13M4.5 21.5L7.5 13H25.5L22.5 21.5Z"/>);
