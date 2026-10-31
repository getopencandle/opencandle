// Registry of OpenCandle drawing tool modules (contract: ./contract.ts). Order is registration order, catalog
// arming order and the order of appended unapplied-default rows. A new tool adds ONE import line and ONE list entry.
import {defineLvDrawingToolModule,type LvDrawingToolModule} from './contract';
import {LONG_POSITION_MODULE} from './position-tool';
import {SHORT_POSITION_MODULE} from './short-position';
import {DATE_RANGE_MODULE,PRICE_RANGE_MODULE} from './measure-ranges';
import {ELLIOTT_WAVES_MODULE} from './elliott-waves';
import {ANCHORED_VOLUME_PROFILE_MODULE,ANCHORED_VOLUME_PROFILE_UNAPPLIED} from './anchored-volume-profile';
import {BARS_PATTERN_MODULE} from './bars-pattern';
import {DOUBLE_CURVE_MODULE} from './double-curve';
import {EMOJI_STAMP_MODULE} from './emoji-stamp';
import {ANCHORED_TEXT_MODULE} from './anchored-text';
import {IMAGE_MODULE} from './image';
import {FIB_TIME_TREND_LINE_MODULE} from './fib-time-trend-line';
import {ARROW_MARKER_MODULE,CYCLIC_LINES_MODULE,PITCHFAN_MODULE,SECTOR_MODULE,SINE_LINE_MODULE,TIME_CYCLES_MODULE} from './segment-tools';
import {CHART_PATTERNS_MODULE} from './chart-patterns';
import {POSITION_FORECAST_MODULE} from './position-forecast';
import {GHOST_FEED_MODULE} from './ghost-feed';
import {PIN_MODULE,TABLE_MODULE} from './pin-table';
import {GANN_SQUARE_FIXED_MODULE} from './gann-square-fixed';
import {STICKER_MODULE} from './sticker';
import {FIB_CHANNEL_MODULE} from './fib-channel';
import {AXIS_LINES_MODULE} from './axis-lines';

// The anchored volume profile module exports its 10 unapplied rows but does not list
// them on the module; they are attached here until the module carries `unappliedDefaults` itself.
const ANCHORED_VOLUME_PROFILE_REGISTERED=ANCHORED_VOLUME_PROFILE_MODULE.unappliedDefaults?ANCHORED_VOLUME_PROFILE_MODULE:defineLvDrawingToolModule({...ANCHORED_VOLUME_PROFILE_MODULE,unappliedDefaults:ANCHORED_VOLUME_PROFILE_UNAPPLIED});

export const LV_DRAWING_TOOL_MODULES:readonly LvDrawingToolModule[]=Object.freeze([
 // Replaces the native position registration; listed first so Short reads the same pinned native class.
 LONG_POSITION_MODULE,
 SHORT_POSITION_MODULE,
 PRICE_RANGE_MODULE,
 DATE_RANGE_MODULE,
 ELLIOTT_WAVES_MODULE,
 ANCHORED_VOLUME_PROFILE_REGISTERED,
 BARS_PATTERN_MODULE,
 DOUBLE_CURVE_MODULE,
 EMOJI_STAMP_MODULE,
 ANCHORED_TEXT_MODULE,
 IMAGE_MODULE,
 FIB_TIME_TREND_LINE_MODULE,
 ARROW_MARKER_MODULE,
 CHART_PATTERNS_MODULE,
 TIME_CYCLES_MODULE,
 CYCLIC_LINES_MODULE,
 SINE_LINE_MODULE,
 PITCHFAN_MODULE,
 GANN_SQUARE_FIXED_MODULE,
 POSITION_FORECAST_MODULE,
 SECTOR_MODULE,
 GHOST_FEED_MODULE,
 PIN_MODULE,
 TABLE_MODULE,
 STICKER_MODULE,
 // Replaces the native fibchannel registration in place (bands, extension, Levels toggle).
 FIB_CHANNEL_MODULE,
 // Replaces the native hline, vline and crossline registrations in place (line text layout, no cross line text).
 AXIS_LINES_MODULE,
]);

export type {LvCatalogArm,LvDialogBinding,LvDialogAddition,LvDialogContribution,LvDrawingToolModule,LvTypeDefinition} from './contract';
