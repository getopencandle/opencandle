// Drawing price text (OpenCandle 0.8.1). Prices written on drawings (Fibonacci level labels, the trend-based extension, the
// date and price range) follow the instrument's tick size instead of a fixed 2 decimals, so EURUSD levels read 1.08235 and not
// 1.08. The tick comes from the chart contexts the adapter registers (lv-types/position-tool.ts chartTickSizeFor). With no tick
// known (tests, a chart whose instrument has no metadata yet) the decimals follow the price's magnitude: 5 significant digits,
// at least 2 and at most 8 decimals (4512.25, 1.0824, 0.012345).
import {chartTickSizeFor,tickDecimals,validTick} from '../lv-types/position-tool';

export const DRAWING_PRICE_MAX_DECIMALS=8;
/** Decimals for a price with no known tick: 5 significant digits, clamped to 2..8. */
export function magnitudeDecimals(price:number):number{
 const abs=Math.abs(price);
 if(!Number.isFinite(abs)||abs===0)return 2;
 return Math.max(2,Math.min(DRAWING_PRICE_MAX_DECIMALS,4-Math.floor(Math.log10(abs))));
}
/** Decimals for a price on `model`'s chart, or for `tick` when given. */
export function drawingPriceDecimals(model?:object,price?:number,tick?:number):number{
 const known=validTick(tick)?tick:chartTickSizeFor(model);
 if(validTick(known))return Math.min(DRAWING_PRICE_MAX_DECIMALS,tickDecimals(known));
 return magnitudeDecimals(price??0);
}
/** A price as a drawing writes it. */
export function formatDrawingPrice(price:number,model?:object,tick?:number):string{
 if(!Number.isFinite(price))return '';
 return price.toFixed(drawingPriceDecimals(model,price,tick));
}
/** A signed price change (+0.00120 / -1.25), as the measure tools write it. */
export function formatSignedDrawingPrice(delta:number,model?:object,reference?:number,tick?:number):string{
 if(!Number.isFinite(delta))return '';
 const text=delta.toFixed(drawingPriceDecimals(model,reference??delta,tick));
 return (delta>=0?'+':'')+text;
}
