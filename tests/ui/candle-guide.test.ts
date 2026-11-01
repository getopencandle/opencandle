import {expect,it} from 'vitest';
import {CANDLE_GUIDE_SLUGS,candleGuideSlug,candleGuideSlugFor} from '../../src/ui/candle-guide';
import {CANDLE_PATTERN_INDICATORS,CHART_PATTERN_INDICATORS} from '../../src/domain/indicators-ext/patterns-catalog';

it('slugs a display name: lower case, other characters collapsed to a hyphen, trimmed',()=>{
 expect(candleGuideSlug('Bullish engulfing')).toBe('bullish-engulfing');
 expect(candleGuideSlug('Engulfing (bullish)')).toBe('engulfing-bullish');
 expect(candleGuideSlug('Tri-Star (bearish)')).toBe('tri-star-bearish');
 expect(candleGuideSlug('  --Doji  star!! ')).toBe('doji-star');
});
it('gives every candlestick pattern, and no chart pattern or the All entry, a unique anchor valid for the link channel',()=>{
 const ids=CANDLE_PATTERN_INDICATORS.map(row=>row.id as string).filter(id=>id!=='cdlall');
 expect(Object.keys(CANDLE_GUIDE_SLUGS)).toEqual(ids);
 const slugs=Object.values(CANDLE_GUIDE_SLUGS);
 expect(new Set(slugs).size).toBe(slugs.length);
 for(const slug of slugs)expect(slug).toMatch(/^[a-z0-9-]{1,64}$/);
 expect(candleGuideSlugFor('cdlengulfingbull')).toBe('engulfing-bullish');
 for(const id of ['cdlall','chpall',...CHART_PATTERN_INDICATORS.map(row=>row.id as string),'rsi','','toString'])expect(candleGuideSlugFor(id)).toBeNull();
});
