/** The watchlist Logo column. OpenCandle ships no company logos, so the column draws an
 * LV monogram badge: up to two initials of the ticker on a color picked from the LV palette by a stable hash of the market key.
 * Initials rule, hash (FNV-1a 32-bit) and the dark ink on every palette color. */
/** The LV palette (same values as LV_INDICATOR_PALETTE in src/chart/indicator-settings.ts; copied so the watchlist does not load
 * the indicator catalog). A test pins the two lists equal. */
export const MONOGRAM_PALETTE:readonly string[]=Object.freeze(['#4fc3d9','#f5b14c','#b48cf2','#f07a7a','#7fd17a','#6e9cf2','#e88ad8','#d9cf6a','#4fbfa3','#c9a27e']);
/** Dark ink: every LV palette color is a light mid tone, so one dark ink stays readable on all of them. */
export const MONOGRAM_INK='#131722';
export interface MonogramBadge {initials:string;background:string;color:string;label:string}

function fnv1a(text:string):number{let hash=0x811c9dc5;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}return hash>>>0;}

/** Initials: the ticker without its exchange prefix; the first letter or digit, plus the first one after a separator
 * (BRK.B -> BB, EUR/USD -> EU), else the second character (GME -> GM). Empty or symbol-only tickers give "?". */
export function monogramInitials(symbol:string):string{
 const bare=String(symbol??'').split(':').pop()!.toUpperCase();
 const parts=bare.split(/[^A-Z0-9]+/).filter(Boolean);
 if(!parts.length)return '?';
 if(parts.length>1)return parts[0][0]+parts[1][0];
 return parts[0].slice(0,2);
}
/** Stable badge for a market key (exchange:symbol): the same key always gets the same color. */
export function monogramBadge(symbol:string,key=symbol):MonogramBadge{
 const background=MONOGRAM_PALETTE[fnv1a(String(key??'').toUpperCase())%MONOGRAM_PALETTE.length];
 return {initials:monogramInitials(symbol),background,color:MONOGRAM_INK,label:`${String(symbol??'').split(':').pop()} monogram`};
}
