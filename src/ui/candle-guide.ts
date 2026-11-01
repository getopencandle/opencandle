// Links to the candlestick guide on the project website (https://getopencandle.com/candles/). The guide has one
// section per candlestick pattern, anchored by the slug of the pattern's display name. Chart patterns are not in it.
import {CANDLE_PATTERN_INDICATORS} from '../domain/indicators-ext/patterns-catalog';

/** Anchor of a pattern's section: the display name lower-cased, runs of other characters collapsed to "-", trimmed of "-". */
export const candleGuideSlug=(name:string):string=>String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

/** Candlestick pattern ids (not the "All candlestick patterns" entry) and their guide anchors, in catalog order. */
export const CANDLE_GUIDE_SLUGS:Readonly<Record<string,string>>=Object.freeze(Object.fromEntries(
 CANDLE_PATTERN_INDICATORS.filter(row=>row.pattern==='candlestick'&&(row.id as string)!=='cdlall').map(row=>[row.id as string,candleGuideSlug(row.name)])));

/** The guide anchor for a pattern id, or null for anything that is not one candlestick pattern. */
export const candleGuideSlugFor=(id:string):string|null=>typeof id==='string'&&Object.hasOwn(CANDLE_GUIDE_SLUGS,id)?CANDLE_GUIDE_SLUGS[id]:null;

/** Opens the guide (at a section when a slug is given) through the desktop bridge; absent outside the desktop main window. */
export function openCandleGuide(slug?:string):void{
 const bridge=typeof window==='undefined'?undefined:window.lv;
 if(typeof bridge?.openCandleGuide!=='function')return;
 void bridge.openCandleGuide(slug?{fragment:slug}:{}).catch(()=>{/* nothing opens; the link still names the page */});
}
