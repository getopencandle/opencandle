import type {AppearanceSettings} from './appearance';
import type {IndicatorDisplayOptions} from './indicator-display';

export const INDICATOR_DISPLAY_APPEARANCE_KEYS={labelsVisible:'lv.indicatorLabelsVisible',valuesVisible:'lv.indicatorValuesVisible'} as const;
/** Optional LV fields preserve all legacy source-theme objects. Missing means visible. */
export function indicatorDisplayOptionsFromAppearance(settings:AppearanceSettings):IndicatorDisplayOptions{
 const result:IndicatorDisplayOptions={labelsVisible:true,valuesVisible:true};
 for(const key of ['labelsVisible','valuesVisible'] as const){const field=INDICATOR_DISPLAY_APPEARANCE_KEYS[key];if(Object.hasOwn(settings,field)){if(typeof settings[field]!=='boolean')throw Error('Indicator display options require boolean values.');result[key]=settings[field];}}
 return result;
}
