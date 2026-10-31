import '@luxalgo/vela';

/** LV build-composition API. Direct Node SDK imports remain the base COMPAT-11.
 * This geometry configuration grants no source/readout/CSV/alert permission. */
declare module '@luxalgo/vela' {
 interface NativeRenderer {
  lvCaptureTimeFrame(confirmedCount:number,tailTimeMs:number):object;
  /** At most373 time/positive-logical-offset anchors; no observations. */
  lvSetFutureTimeSegments(frame:object,times:Float64Array,offsets:Float64Array):Readonly<{
   qualifiedThrough:number;
   isCurrent():boolean;
   isDetached():boolean;
   dispose():void;
  }>;
  lvSetFutureTimeSpine(frame:object,labels:Float64Array):Readonly<{
   qualifiedThrough:number;
   isCurrent():boolean;
   isDetached():boolean;
   dispose():void;
  }>;
 }
}
