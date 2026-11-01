/** Explicit exemptions of the timing guardrails (tests/reference/timing-guardrails.test.ts checks each against the code). */
/** Kinds whose value at a bar may depend on later bars (viewport kinds are disclosed by their `viewport` flag), with the reason the code documents and the delay (bars) after
 *  which a value is final; null = the latest swing/fit can move without bound (true repainting). */
export const REPAINT_EXEMPT:Record<string,{delay:number|null;reason:RegExp;why:string}>={
 ichimoku:{delay:25,reason:/lagging span .* unavailable until later closes/i,why:'Lagging span = close plotted 25 bars back.'},
 zigzag:{delay:null,reason:/may change on later bars/i,why:'The last leg runs to the current extreme.'},
 fractals:{delay:2,reason:/confirmed only after Periods later bars/i,why:'A fractal is placed on its own bar after 2 later bars.'},
 pivotshl:{delay:10,reason:/confirmed only after Right later bars/i,why:'A pivot is placed on its own bar after Right (10) later bars.'},
 lrc:{delay:null,reason:/refitted on each new bar/i,why:'Only the latest Count bars carry the refitted channel.'},
 autofib:{delay:null,reason:/move when a new leg completes/i,why:'Levels follow the latest completed zig zag leg.'},
 autofibext:{delay:null,reason:/Repaints/i,why:'Pivots move when a new leg completes.'},
 autopitchfork:{delay:null,reason:/Repaints/i,why:'Pivots move when a new leg completes.'},
 aavp:{delay:null,reason:/levels move with the anchor/i,why:'One profile from the latest anchor through the last bar.'},
 autofibvp:{delay:null,reason:/levels move with the anchor/i,why:'One profile from the latest auto fib swing start through the last bar.'},
 vrvp:{delay:null,reason:/^$/,why:'Visible-range kind (viewport): values describe the bars on screen.'},
 svphd:{delay:null,reason:/^$/,why:'Visible-range kind (viewport): values describe the bars on screen.'},
 visibleavg:{delay:null,reason:/^$/,why:'Visible-range kind (viewport): mean of the bars on screen.'},
};
/** Kinds that cannot be calculated from bars alone in a headless test (they refuse with a diagnostic by design). */
export const HEADLESS_UNAVAILABLE:Record<string,string>={
 seasonality:'Requires the chart-owned original candle source service (refuses bare bars by design).',
 tradingsessions:'Intraday-only clock windows with observed boxes; covered on the intraday series in session-guardrails.',
};
/** Intraday-only kinds: on a daily chart they refuse with a notice by design, so guardrail 2a runs them on the intraday series only. */
export const INTRADAY_ONLY:Record<string,string>={
 sessionvwap:'One VWAP per Tokyo, London and New York session; daily bars have no sessions.',
 orb:'The opening range is the first minutes of the session; daily bars have no opening minutes.',
};
/** Kinds that revise values only on intraday charts (several chart bars per period), with the documented reason. */
export const INTRADAY_EXEMPT:Record<string,{reason:RegExp;why:string}>={
};
