import type {ChartController} from '../chart/adapter';
import {scriptPriceScaleControlsAvailable} from '../chart/script-presentation-proof';

/** A supported chart can expose an option; this never claims that any value or glyph is ready. */
export function scriptPriceScaleControlsForSettings(chart:Pick<ChartController,'scripts'>|null,assertOwner:()=>void):boolean{
 try{assertOwner();if(!chart)return false;const available=scriptPriceScaleControlsAvailable(chart.scripts);assertOwner();return available;}catch{return false;}
}
