// LV small icons: dropdown chevron (16x8 box, 8x4 glyph), flyout chevron (10x16 box, 4x7 glyph)
// and the symbol-pill data-type glyph (18x18). Same 1px stroke contract as the other sets.
import React from 'react';
import {lvIcon} from './LvIcon';

export const ChevronDownIcon=lvIcon('chevron-down',{width:16,height:8},<path d="M4 2L8 6L12 2"/>);
export const ChevronFlyoutIcon=lvIcon('chevron-flyout',{width:10,height:16},<path d="M3.5 4.5L7 8L3.5 11.5"/>);
export const DataTypeIcon=lvIcon('data-type',{width:18,height:18},<><rect x={4.5} y={6.5} width={2} height={6}/><rect x={10.5} y={4.5} width={2} height={8}/><path d="M5.5 3V6.5M5.5 12.5V15M11.5 2V4.5M11.5 12.5V16"/></>);
