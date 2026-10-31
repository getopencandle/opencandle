// Visual gallery: which example symbol and interval each indicator is shown on. Default is GME 1D (daily, has volume).
// Session and intraday tools need intraday bars; crypto 24h volume needs a 24h market.
export const DEFAULT_SETUP=Object.freeze({symbol:'GME',interval:'1D'});
const INTRADAY=Object.freeze({symbol:'SPY',interval:'5m'});
export const INDICATOR_SETUPS={
 vwap:INTRADAY,svp:INTRADAY,svphd:INTRADAY,rvat:INTRADAY,twap:INTRADAY,rbintrapivots:INTRADAY,tradingsessions:{symbol:'BTC',interval:'15m'},
 vol24h:{symbol:'BTC',interval:'1h'},mtfcandles:{symbol:'SPY',interval:'1h'},adr:{symbol:'SPY',interval:'1h'},
 volumedelta:INTRADAY,cvd:INTRADAY,
};
export const setupFor=id=>INDICATOR_SETUPS[id]??DEFAULT_SETUP;
/** A few items rendered again on a light chart background, to catch colours that vanish on white. */
export const THEME_SAMPLE_INDICATORS=['rsi','macd','bb','ichimoku','volume','vrvp','cdlall'];
export const THEME_SAMPLE_DRAWINGS=['fibretracement','pitchfork','xabcd','position','text','elliottimpulse'];
