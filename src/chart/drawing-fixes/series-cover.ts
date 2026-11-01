// Harmonic patterns above the price series (OpenCandle 0.8.2). A new drawing normally starts just under the price series
// (vela startZ), so the candles read on top of it. The harmonic patterns (XABCD, Cypher, ABCD, Three drives) are read by
// their legs and the ratio labels on the dashed lines between the compared points, which candles would bury; like the Fib
// retracement and the Bars pattern they declare coversSeries and start above the series stack. Their fills stay translucent.
// Only NEW drawings change; a saved drawing keeps its stored order (Bring to front still moves it).
import {getDrawingType,registerDrawingType,type DrawingTypeMeta} from '@luxalgo/vela';
import {lvKey} from '../lv-drawing-pin';

export const SERIES_COVER_PATTERN_TYPES:readonly string[]=Object.freeze(['xabcd','cypher','abcd','lvthreedrives']);
/** Re-registers each registered pattern type with coversSeries on; returns the type ids it changed. */
export function applySeriesCoverPatterns():string[]{
 const changed:string[]=[];
 for(const type of SERIES_COVER_PATTERN_TYPES){
  const meta=getDrawingType(lvKey(type));if(!meta||meta.coversSeries)continue;
  registerDrawingType(Object.freeze({...meta,coversSeries:true}) as DrawingTypeMeta);
  changed.push(type);
 }
 return changed;
}
