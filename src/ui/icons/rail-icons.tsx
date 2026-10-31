// LV right-rail icon set: 44x44 design box, glyph about 20-24px centred, same 1px stroke as the
// toolbar set. Original OpenCandle drawings made from plain-language metaphors (see registry.ts).
import React from 'react';
import {lvIcon} from './LvIcon';

const BOX={width:44,height:44};
const icon=(name:string,body:React.ReactNode)=>lvIcon(name,BOX,body);

export const RailWatchlistIcon=icon('rail-watchlist',<path d="M13.5 10.5H30.5V33.5H13.5ZM24.5 10.5V16.5L26.5 15L28.5 16.5V10.5M17 19.5H27M17 23.5H27M17 27.5H23"/>);
export const RailAlertsIcon=icon('rail-alerts',<><circle cx={22} cy={23.5} r={9}/><path d="M22 18.5V23.5H26M11.5 15A4.5 4.5 0 0 1 16 10.5M28 10.5A4.5 4.5 0 0 1 32.5 15M15.6 29.9L13.5 32.5M28.4 29.9L30.5 32.5"/></>);
export const RailObjectTreeIcon=icon('rail-object-tree',<path d="M22 11L32 16L22 21L12 16ZM12 21L22 26L32 21M12 26L22 31L32 26"/>);
export const RailScreenerIcon=icon('rail-screener',<><circle cx={22.5} cy={22.5} r={10}/><circle cx={22.5} cy={22.5} r={5}/><path d="M22.5 9V14.5M22.5 30.5V36M9 22.5H14.5M30.5 22.5H36"/></>);
export const RailScriptEditorIcon=icon('rail-script-editor',<path d="M17 15L11 22L17 29M27 15L33 22L27 29M24.5 12.5L19.5 31.5"/>);
export const RailCalendarIcon=icon('rail-calendar',<><rect x={11.5} y={13.5} width={21} height={19} rx={2}/><path d="M11.5 18.5H32.5M16.5 11V15.5M27.5 11V15.5M18.5 18.5V32.5M25.5 18.5V32.5M11.5 25.5H32.5"/></>);
export const RailNotificationsIcon=icon('rail-notifications',<path d="M15.5 21V27L13 29.5H31L28.5 27V21A6.5 6.5 0 0 0 15.5 21ZM22 12V14.5M19.5 31.5A2.5 2.5 0 0 0 24.5 31.5"/>);
export const RailNewsIcon=icon('rail-news',<><circle cx={13.5} cy={30.5} r={2} fill="currentColor" stroke="none"/><path d="M13.5 23.5A7 7 0 0 1 20.5 30.5M13.5 18.5A12 12 0 0 1 25.5 30.5M13.5 13.5A17 17 0 0 1 30.5 30.5"/></>);
export const RailHelpIcon=icon('rail-help',<><circle cx={22} cy={22} r={10}/><path d="M18.5 19A3.5 3.5 0 1 1 23.75 22.03Q22 23 22 25V25.5"/><circle cx={22} cy={28.5} r={1.25} fill="currentColor" stroke="none"/></>);
export const RailFundamentalsIcon=icon('rail-fundamentals',<><circle cx={22} cy={22} r={10}/><path d="M22 12V22L30.66 27"/></>);
export const RailHeatmapIcon=icon('rail-heatmap',<><rect x={11.5} y={11.5} width={12} height={12}/><rect x={25.5} y={11.5} width={7} height={12}/><rect x={11.5} y={25.5} width={7} height={7}/><rect x={20.5} y={25.5} width={12} height={7}/></>);
export const RailMarketsIcon=icon('rail-markets',<path d="M12.5 31V24M17.5 31V19M22.5 31V22M10.5 33.5H25M27.5 21.5V12.5M25.5 14.5L27.5 12.5L29.5 14.5M32.5 23V32M30.5 30L32.5 32L34.5 30"/>);
export const RailPortfolioIcon=icon('rail-portfolio',<><rect x={11.5} y={16.5} width={21} height={15} rx={2}/><path d="M18.5 16.5V13.5H25.5V16.5"/><circle cx={22} cy={24} r={4}/><path d="M22 24V20M22 24L25.5 26"/></>);
export const RailStrategyIcon=icon('rail-strategy',<path d="M11.5 11V32.5H33M15 28L20 21.5L24 25L31.5 15.5M27.5 15.5H31.5V19.5"/>);
export const RailPaperTradingIcon=icon('rail-paper-trading',<><rect x={11.5} y={16.5} width={21} height={15} rx={2}/><path d="M18.5 16.5V13.5H25.5V16.5M11.5 22.5H32.5"/></>);
export const RailDataWindowIcon=icon('rail-data-window',<><rect x={11.5} y={12.5} width={21} height={19} rx={2}/><path d="M11.5 17.5H32.5M15 22.5H22M25 22.5H29M15 26.5H20M25 26.5H29"/></>);
