// Icons of the floating Bar Replay control bar. Original OpenCandle drawings on the shared LV icon contract
// (28x28 design box, 1px stroke, currentColor; see icons/LvIcon.tsx). No third-party path data. Decorative: the hosting
// button carries the accessible name and the tooltip.
import React from 'react';
import {lvIcon} from './icons/LvIcon';

const BOX={width:28,height:28};
const icon=(name:string,body:React.ReactNode)=>lvIcon(name,BOX,body);

/** Vertical cut line with a small marker: choose the bar where the replay starts. */
export const ReplaySelectBarIcon=icon('replay-select-bar',<path d="M14.5 4V7M14.5 10V13M14.5 16V19M14.5 22V25M9.5 11.5L14.5 14.5L9.5 17.5M19.5 11.5L14.5 14.5L19.5 17.5"/>);
/** Stop bar on the left and a left-pointing triangle: one step back. */
export const ReplayStepBackIcon=icon('replay-step-back',<path d="M8.5 8V21M20.5 8.5L11.5 14.5L20.5 20.5Z"/>);
/** Right-pointing triangle: play. */
export const ReplayPlayIcon=icon('replay-play',<path d="M10.5 7.5L21.5 14.5L10.5 21.5Z"/>);
/** Two upright bars: pause. */
export const ReplayPauseIcon=icon('replay-pause',<path d="M10.5 8V21M17.5 8V21"/>);
/** Right-pointing triangle and a stop bar: one step forward. */
export const ReplayForwardIcon=icon('replay-forward',<path d="M8.5 8.5L17.5 14.5L8.5 20.5ZM20.5 8V21"/>);
/** Two chevrons running into a bar: jump to the current data. */
export const ReplayRealtimeIcon=icon('replay-realtime',<path d="M6.5 8.5L12.5 14.5L6.5 20.5M13.5 8.5L19.5 14.5L13.5 20.5M22.5 8V21"/>);
/** Diagonal cross: close the replay bar. */
export const ReplayCloseIcon=icon('replay-close',<path d="M8.5 8.5L20.5 20.5M20.5 8.5L8.5 20.5"/>);
/** Small open chevron pointing down: opens a menu. */
export const ReplayMenuIcon=icon('replay-menu',<path d="M10.5 12.5L14.5 16.5L18.5 12.5"/>);
