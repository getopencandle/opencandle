// Long/Short position drawing types. The native "position" tool and the OpenCandle Short position tool
// ("lvshortposition", src/chart/lv-drawing-types.ts) share the same model: anchors entry/stop/target and the
// same props, so every consumer (position alerts, alert follow, coordinate editing) treats them alike.
// Dependency-free on purpose: domain modules import it without loading the chart renderer.
export const NATIVE_POSITION_TYPE='position';
export const LV_SHORT_POSITION_TYPE='lvshortposition';
export const POSITION_DRAWING_TYPES:readonly string[]=Object.freeze([NATIVE_POSITION_TYPE,LV_SHORT_POSITION_TYPE]);
export function isPositionDrawing(type:unknown):boolean{return type===NATIVE_POSITION_TYPE||type===LV_SHORT_POSITION_TYPE;}
