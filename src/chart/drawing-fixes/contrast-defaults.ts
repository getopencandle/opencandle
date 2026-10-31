// Default drawing colour contrast (OpenCandle 0.8.1). The renderer's default drawing colour is a pale cyan (#38c0fd) that
// reads on a dark chart but nearly vanishes on a light one (Elliott waves, pitchforks, patterns, shapes). After every drawing
// type is registered, a type whose default line or fill colour is that cyan gets the OpenCandle drawing blue (#2962FF, the
// colour the line tools already default to) with the same alpha, which keeps a contrast of at least 3:1 on both the light and
// the dark chart backgrounds. Only defaults of NEW drawings change; saved drawings keep their stored colours.
import {drawingTypes,registerDrawingType,type DrawingTypeMeta} from '@luxalgo/vela';
import {TV_BLUE} from '../drawing-default-constants';

export const PALE_DEFAULT_COLOR='#38c0fd';
const KEEP=new Set(['fibretracement']);
/** `color` with the pale default replaced by the drawing blue, keeping an appended alpha (#38c0fd26 -> #2962FF26). */
export function contrastColor(color:unknown):unknown{
 if(typeof color!=='string'||!color.toLowerCase().startsWith(PALE_DEFAULT_COLOR))return color;
 const alpha=color.slice(PALE_DEFAULT_COLOR.length);
 return /^[0-9a-f]{0,2}$/i.test(alpha)?TV_BLUE+alpha:color;
}
/** Re-registers every type whose default style uses the pale colour; returns the type ids it changed. */
export function applyContrastDefaults():string[]{
 const changed:string[]=[];
 for(const meta of drawingTypes()){
  // Fib retracement keeps its registration identity (fib-level-format-native.ts asserts it) and paints with per-level colours.
  if(KEEP.has(String(meta.type)))continue;
  const style=meta.defaultStyle as unknown as Record<string,unknown>|undefined;if(!style)continue;
  // Fills are written in lower case, as the composed fills (the channel background) are.
  const fill=contrastColor(style.fillColor),next={...style,lineColor:contrastColor(style.lineColor),...('fillColor' in style?{fillColor:fill!==style.fillColor&&typeof fill==='string'?fill.toLowerCase():fill}:{})};
  if(next.lineColor===style.lineColor&&next.fillColor===style.fillColor)continue;
  registerDrawingType(Object.freeze({...meta,defaultStyle:next}) as DrawingTypeMeta);
  changed.push(String(meta.type));
 }
 return changed;
}
