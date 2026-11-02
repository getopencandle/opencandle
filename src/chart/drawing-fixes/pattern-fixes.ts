// Cypher validity (OpenCandle 0.8.2 drawing fix). The native Cypher marks a pattern valid from three absolute ratios only
// (AB/XA 0.382..0.618, XC/XA 1.272..1.414, CD/XC 0.74..0.83), so a shape whose C falls back below X, or whose points do not
// alternate, can still show the valid mark. The Cypher definition (Darren Oglesbee, as given with Scott Carney's harmonic
// ratios) is directional: X-A is the first leg, B retraces part of it (between X and A), C extends beyond A in the X-A
// direction, and D retraces XC (between X and C). Those direction checks now come first, then the native bands. The ratio
// labels keep their band marks, and a leg that runs the wrong way also turns its own pill red (lvCypherDirections, read by the
// patched Vela painter), so the three pills never read green beside a failed badge.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {fail,type Init,type NativeModel} from '../lv-drawing-pin';
import {FIXED,meta,pinned,probeInit,type Anchor} from './fix-pins';

/** Which Cypher legs run the Cypher's way, for the ratio pills: ab is B between X and A, xc is C beyond A in the X-A direction,
 *  cd is D between X and C (so the points alternate). Each is null while a point it needs is missing, and all three are false for
 *  a flat X-A leg. The validity badge (cypherDirectionOk) is exactly the three together, so the pills and the badge always agree. */
export interface CypherLegDirections{ab:boolean|null;xc:boolean|null;cd:boolean|null}
export function cypherLegDirections(anchors:readonly Anchor[]):CypherLegDirections{
 const [x,a,b,c,d]=anchors;if(!x||!a)return{ab:null,xc:null,cd:null};
 const s=Math.sign(a.price-x.price);if(s===0)return{ab:false,xc:false,cd:false};
 const above=(p:number,q:number)=>(p-q)*s>0;
 return{
  ab:b?above(b.price,x.price)&&above(a.price,b.price):null,
  xc:c?above(c.price,a.price):null,
  cd:c&&d?above(d.price,x.price)&&above(c.price,d.price):null,
 };
}
/** True when the five Cypher points X, A, B, C, D run in the Cypher's directions: B between X and A, C beyond A in the X-A
 *  direction, D between X and C (so the points alternate). False for a flat X-A leg; null while a point is missing. */
export function cypherDirectionOk(anchors:readonly Anchor[]):boolean|null{
 const [x,a,b,c,d]=anchors;if(!x||!a||!b||!c||!d)return null;
 const legs=cypherLegDirections(anchors);
 return legs.ab===true&&legs.xc===true&&legs.cd===true;
}

interface CypherModel extends NativeModel{valid():boolean|null}
export function defineCypher():DrawingTypeMeta{
 const base=pinned('cypher',['valid','xcOverXa','cdOverXc','ranges','ratioOk']);
 const Base=base.ctor as unknown as new(init:Init)=>CypherModel;
 const at=(prices:number[])=>new Base(probeInit(prices.map((price,i)=>({time:i*10,price}))));
 // Pin: the native check accepts the textbook Cypher and also the wrong-direction shape (C below X instead of beyond A).
 if(at([50,150,100,180,77.82]).valid()!==true||at([100,110,105,87,97.5]).valid()!==true)fail('cypher validity changed');
 class LvCypher extends Base{
  /** Read by the patched Vela painter (LV-VELA-DRAWING-FIXES-1) to colour the AB/XA, XC/XA and CD/XC pills red for a wrong-way leg. */
  lvCypherDirections(){return cypherLegDirections(this.anchors);}
  valid(){
   const ok=cypherDirectionOk(this.anchors);
   return ok===null?null:ok&&super.valid()===true;
  }
 }
 Object.defineProperties(LvCypher.prototype,FIXED);
 return meta(base,init=>new LvCypher(init));
}

// Three drives reading (OpenCandle 0.8.2). Scott Carney (Harmonic Trading, Vol. 1) and Thomas Bulkowski (Encyclopedia of Chart
// Patterns) describe three equal-looking drives separated by two corrections. The points are the start, drive 1, correction A,
// drive 2, correction B and drive 3. Valid when correction A and correction B each retrace 0.618 to 0.786 of the drive before them,
// drive 2 and drive 3 each extend the correction before them by 1.272 to 1.618, and the six points alternate up and down.
// The symmetry note is an OpenCandle tolerance: the two drive extensions are within 0.1 of each other.
export const THREE_DRIVES_CORRECTION={min:0.618,max:0.786} as const;
export const THREE_DRIVES_EXTENSION={min:1.272,max:1.618} as const;
export const THREE_DRIVES_SYMMETRY_TOLERANCE=0.1;
export const THREE_DRIVES_SYMMETRY_NOTE='Symmetric drives';
export interface ThreeDrivesReading{valid:boolean|null;symmetric:boolean|null}
// A hair of slack so a textbook 0.618 or 1.272 typed to the cent does not fail on float noise. One band check for the badge and the pills.
const within=(value:number,band:{min:number;max:number})=>value>=band.min-1e-9&&value<=band.max+1e-9;
/** Whether the leg ratio shown at vertex i (2 to 5: correction A, drive 2, correction B, drive 3) is in its band and the legs placed
 *  so far alternate. null until point i is placed. The pills use this, and threeDrivesReading is exactly these four together. */
export function threeDrivesPillOk(anchors:readonly Anchor[],i:number):boolean|null{
 if(i<2||i>5||anchors.length<=i||anchors.slice(0,i+1).some(point=>!point))return null;
 const leg=Array.from({length:i},(_,k)=>anchors[k+1].price-anchors[k].price);
 if(leg.some(value=>Math.abs(value)<1e-9)||!leg.every((value,k)=>k===0||value*leg[k-1]<0))return false;
 return within(Math.abs(leg[i-1])/Math.abs(leg[i-2]),i%2===0?THREE_DRIVES_CORRECTION:THREE_DRIVES_EXTENSION);
}
/** Reads six anchors (start, drive 1, A, drive 2, B, drive 3). Both fields are null until all six points are placed. */
export function threeDrivesReading(anchors:readonly Anchor[]):ThreeDrivesReading{
 if(anchors.length<6||anchors.slice(0,6).some(point=>!point))return{valid:null,symmetric:null};
 const leg=[1,2,3,4,5].map(i=>anchors[i].price-anchors[i-1].price);
 if(leg.some(value=>Math.abs(value)<1e-9))return{valid:false,symmetric:null};
 const ratio=(i:number)=>Math.abs(leg[i])/Math.abs(leg[i-1]);
 const valid=[2,3,4,5].every(i=>threeDrivesPillOk(anchors,i)===true);
 return{valid,symmetric:Math.abs(ratio(4)-ratio(2))<=THREE_DRIVES_SYMMETRY_TOLERANCE+1e-9};
}
