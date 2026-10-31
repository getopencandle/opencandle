/** Exact data equality after the caller's bounded plain-data validation.
 * Transport omission rules are not canonical editing authority. */
export function sameDrawingData(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const left=Object.keys(a),right=Object.keys(b);
 return left.length===right.length&&left.every(key=>Object.hasOwn(b,key)&&sameDrawingData((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
