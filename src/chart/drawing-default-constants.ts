// Shared constants of the drawing factory defaults (re-exported by drawing-factory-defaults.ts). Kept in a module
// without imports so per-tool modules (src/chart/lv-types/*.ts) can use them without an import cycle through
// drawing-factory-defaults.ts, which itself reads the per-tool module list.
import type {DrawingText} from '@luxalgo/vela';

/** The default line and text color of the line tools and Text. */
export const TV_BLUE='#2962FF';
/** Reference font sizes (px) onto the renderer's named text sizes (tiny 10, small 12, normal 14, large 18, huge 28). */
export const FONT_PX_TO_NAMED:Readonly<Record<number,DrawingText['size']>>=Object.freeze({10:'tiny',12:'small',14:'normal',18:'large',28:'huge'});
/** Reference line style enum (common.enum.lineStyle) onto the renderer's names; sparseDotted (4) has no renderer style. */
export const LINE_STYLE_NAMES:Readonly<Record<number,'solid'|'dotted'|'dashed'>>=Object.freeze({0:'solid',1:'dotted',2:'dashed'});
/** Reference label alignment onto a line label's place (along the line) and side (above or below it). The reference stores the
 *  vertical value inverted: stored "bottom" is shown as "Top" and sits above the line (visual-drawing-dialogs#dialog.common.verticalLabelQuirk). */
export const HORZ_LABEL_PLACE:Readonly<Record<string,'start'|'middle'|'end'>>=Object.freeze({left:'start',center:'middle',right:'end'});
export const VERT_LABEL_SIDE:Readonly<Record<string,'above'|'below'>>=Object.freeze({bottom:'above',top:'below'});
