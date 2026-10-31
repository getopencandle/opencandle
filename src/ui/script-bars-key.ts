import type {Bar} from '../domain/types';
/**
 * An equality key for a script binding's input bars without JSON.stringify of every bar on every update (about
 * 50-100 ms per update across cells at 5,000 bars). Two calls get the same key exactly when JSON.stringify(bars) is the
 * same text, which is what script-binding-runtime compared before:
 * - Plain rows whose own keys are exactly time, open, high, low, close, volume (in that order) with number values are
 *   compared by value as JSON writes them (a non-finite number is null, -0 is 0) against a few recently seen inputs; equal
 *   content gets the same interned token. Nothing is cached by array identity, so an edit in place is still seen.
 * - Any other shape keeps the JSON text itself.
 * A token evicted from the recent set and seen again gets a new token: at worst one extra rerun, never a missed change.
 */
const KEYS=['time','open','high','low','close','volume'] as const,FIELDS=KEYS.length,RECENT=12;
interface Interned {token:string;count:number;values:Float64Array}
const recent:Interned[]=[];let next=0;
function snapshot(bars:readonly Bar[]):Float64Array|null{
 const count=bars.length,values=new Float64Array(count*FIELDS);
 for(let index=0;index<count;index++){
  const row=bars[index] as unknown as Record<string,unknown>;if(!row||typeof row!=='object'||Array.isArray(row)||Object.getPrototypeOf(row)!==Object.prototype)return null;
  const keys=Object.keys(row);if(keys.length!==FIELDS)return null;
  for(let field=0;field<FIELDS;field++){if(keys[field]!==KEYS[field])return null;const value=row[KEYS[field]];if(typeof value!=='number')return null;values[index*FIELDS+field]=Number.isFinite(value)?value+0:NaN;}
 }
 return values;
}
function same(a:Float64Array,b:Float64Array):boolean{
 if(a.length!==b.length)return false;
 for(let index=a.length-1;index>=0;index--){const x=a[index],y=b[index];if(x!==y&&!(x!==x&&y!==y))return false;}
 return true;
}
/** Same result as JSON.stringify(bars) for equality purposes (see above); a short token for plain bar rows. */
export function scriptBarsKey(bars:readonly Bar[]):string{
 if(!Array.isArray(bars))return 'j'+JSON.stringify(bars);
 const values=snapshot(bars);if(!values)return 'j'+JSON.stringify(bars);
 for(let index=0;index<recent.length;index++){const entry=recent[index];if(entry.count===bars.length&&same(entry.values,values)){if(index)recent.unshift(...recent.splice(index,1));return entry.token;}}
 const token='b'+(next++)+':'+bars.length;recent.unshift({token,count:bars.length,values});if(recent.length>RECENT)recent.length=RECENT;return token;
}
