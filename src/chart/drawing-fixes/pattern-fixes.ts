// Cypher validity (OpenCandle 0.8.2 drawing fix). The native Cypher marks a pattern valid from three absolute ratios only
// (AB/XA 0.382..0.618, XC/XA 1.272..1.414, CD/XC 0.74..0.83), so a shape whose C falls back below X, or whose points do not
// alternate, can still show the valid mark. The Cypher definition (Darren Oglesbee, as given with Scott Carney's harmonic
// ratios) is directional: X-A is the first leg, B retraces part of it (between X and A), C extends beyond A in the X-A
// direction, and D retraces XC (between X and C). Those direction checks now come first, then the native bands. The ratio
// labels and their per-ratio marks are unchanged.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {fail,type Init,type NativeModel} from '../lv-drawing-pin';
import {FIXED,meta,pinned,probeInit,type Anchor} from './fix-pins';

/** True when the five Cypher points X, A, B, C, D run in the Cypher's directions: B between X and A, C beyond A in the X-A
 *  direction, D between X and C (so the points alternate). False for a flat X-A leg; null while a point is missing. */
export function cypherDirectionOk(anchors:readonly Anchor[]):boolean|null{
 const [x,a,b,c,d]=anchors;if(!x||!a||!b||!c||!d)return null;
 const s=Math.sign(a.price-x.price);if(s===0)return false;
 const above=(p:number,q:number)=>(p-q)*s>0;
 return above(b.price,x.price)&&above(a.price,b.price)&&above(c.price,a.price)&&above(d.price,x.price)&&above(c.price,d.price);
}

interface CypherModel extends NativeModel{valid():boolean|null}
export function defineCypher():DrawingTypeMeta{
 const base=pinned('cypher',['valid','xcOverXa','cdOverXc','ranges','ratioOk']);
 const Base=base.ctor as unknown as new(init:Init)=>CypherModel;
 const at=(prices:number[])=>new Base(probeInit(prices.map((price,i)=>({time:i*10,price}))));
 // Pin: the native check accepts the textbook Cypher and also the wrong-direction shape (C below X instead of beyond A).
 if(at([50,150,100,180,77.82]).valid()!==true||at([100,110,105,87,97.5]).valid()!==true)fail('cypher validity changed');
 class LvCypher extends Base{
  valid(){
   const ok=cypherDirectionOk(this.anchors);
   return ok===null?null:ok&&super.valid()===true;
  }
 }
 Object.defineProperties(LvCypher.prototype,FIXED);
 return meta(base,init=>new LvCypher(init));
}
