// Shared synthetic fixtures for the lane tests. Everything here is SYNTHETIC test data, never market data.
import {readFileSync} from 'node:fs';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {DRAWING_FIELD_CONSUMER_NAMES,setDrawingFieldConsumer} from '../../src/chart/drawing-port';
/** The consumers are installed by root wiring; these tests exercise the fields, so they switch every consumer on. */
export function enableAllConsumers(on=true){for(const name of DRAWING_FIELD_CONSUMER_NAMES)setDrawingFieldConsumer(name,on);}
export const bars=[0,60,180,240].map(time=>({time:1700000000+time,open:100,high:110,low:90,close:105,volume:10}));
export const T0=bars[0].time*1000,T1=bars[2].time*1000;
export function facts(file:string){return JSON.parse(readFileSync('docs/reference/tv-facts/'+file,'utf8')).facts as Array<{id:string;value:any;options?:any}>;}
export function fact(file:string,id:string){const row=facts(file).find(candidate=>candidate.id===id);if(!row)throw Error('missing fact '+id);return row;}
export const trendline=():SerializedDrawing=>createDrawing('trendline',{id:'dwb3-tl',paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:120}]})!.serialize();
export const fib=():SerializedDrawing=>createDrawing('fibretracement',{id:'dwb3-fib',paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:120}]})!.serialize();
export const channel=():SerializedDrawing=>createDrawing('parallelchannel',{id:'dwb3-ch',paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:120},{time:T0,price:105}]})!.serialize();
// A fresh position now carries the seeded props.lvPositionInputs member; this helper models a record saved before
// that member existed (legacy), which is what the position tests are about.
export const position=(type:'position'|'lvshortposition'='position'):SerializedDrawing=>{const record=createDrawing(type as never,{id:'dwb3-pos-'+type,paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:90},{time:T1,price:120}]})!.serialize();if(record.props)delete (record.props as Record<string,unknown>).lvPositionInputs;return record;};
/** A save/restore round trip through plain JSON, exactly what a workspace file does. */
export const roundTrip=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
