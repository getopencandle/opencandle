import {expect,it} from 'vitest';
import {indicatorDisplayOptionsFromAppearance} from '../../src/chart/indicator-display-options';
import {serializeAppearance,themePresets} from '../../src/ui/themes';

it('all seven source themes preserve exactly 33 fields and use optional visible LV defaults',()=>{
 for(const preset of themePresets){const source=serializeAppearance(preset.appearance);expect(Object.keys(source)).toHaveLength(33);expect(indicatorDisplayOptionsFromAppearance(source)).toEqual({labelsVisible:true,valuesVisible:true});expect(Object.hasOwn(preset.appearance,'indicatorLabelsVisible')).toBe(false);}
});
it('the two explicit global flags serialize independently and retain false across JSON',()=>{
 for(const labels of [true,false])for(const values of [true,false]){const appearance={...themePresets[0].appearance,indicatorLabelsVisible:labels,indicatorValuesVisible:values};expect(indicatorDisplayOptionsFromAppearance(serializeAppearance(JSON.parse(JSON.stringify(appearance))))).toEqual({labelsVisible:labels,valuesVisible:values});}
});
it('invalid explicit global values cannot silently become true or false',()=>{
 for(const value of ['false',0,undefined,null]){expect(()=>indicatorDisplayOptionsFromAppearance({'lv.indicatorLabelsVisible':value} as any)).toThrow('boolean');expect(()=>serializeAppearance({...themePresets[0].appearance,indicatorValuesVisible:value} as any)).toThrow('option');}
});
