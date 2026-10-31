/** The pip size of a forex pair, the market convention: 0.01 when the
 * quote currency is JPY, else 0.0001. Any other asset class has no pip, so the statistic is unavailable (null). The quote
 * currency is the last three letters of the symbol without its exchange prefix or separators (FX:EURUSD, EUR/USD, USDJPY). */
export function forexPipSize(basis:{symbol:string;assetClass:string}|null|undefined):number|null{
 if(!basis||basis.assetClass!=='forex')return null;
 const letters=String(basis.symbol).split(':').pop()!.toUpperCase().replace(/[^A-Z]/g,'');
 if(letters.length!==6)return null;
 return letters.slice(3)==='JPY'?0.01:0.0001;
}
