// SYNTHETIC derived-chart lens for owner tests. The renderer feed sits on the harness bars
// 1000/1120/1240 s (synthetic step 120) while the source events are 400/460/520 s (cadence 60), so a renderer anchor
// and its stored source-time anchor always differ and an unmapped comparison can never pass by accident.
import type {SerializedDrawing} from '@luxalgo/vela';
import type {DerivedAxis} from '../../src/chart/derived/derived-axis';
import {createDerivedDrawingLens,type DerivedDrawingLens} from '../../src/chart/derived/derived-drawings';

export const NATIVE_SECONDS=[1000,1120,1240],SOURCE_SECONDS=[400,460,520];
export function syntheticDerivedLens():DerivedDrawingLens{
 const axis={bars:[],projectionFrom:NATIVE_SECONDS.length,feed:NATIVE_SECONDS.map(time=>({time,open:1,high:1,low:1,close:1,volume:1})),sourceTimes:[...SOURCE_SECONDS],syntheticStep:120} as unknown as DerivedAxis;
 const lens=createDerivedDrawingLens();lens.fed(axis,true,SOURCE_SECONDS.map(time=>({time})),60);
 if(!lens.derived()||lens.refused())throw Error('SYNTHETIC derived lens refused');
 return lens;
}
/** A fixture row authored on the renderer axis, re-expressed in source time as the store and canonical document hold it. */
export function sourceRow(lens:DerivedDrawingLens,row:SerializedDrawing):SerializedDrawing{
 const mapped=lens.toSourceRow(row);if(JSON.stringify(mapped.anchors)===JSON.stringify(row.anchors))throw Error('SYNTHETIC lens left anchors unmapped');
 return structuredClone(mapped);
}
