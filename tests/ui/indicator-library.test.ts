import {it,expect} from 'vitest';
import {createIndicatorLibrary,factoryIndicatorDefault,saveIndicatorDefault,clearIndicatorDefault,instanceDefaults,toggleIndicatorFavorite,restoreIndicatorLibrary,indicatorEditFingerprint} from '../../src/ui/indicator-library';
it('favorite changes persist independently of settings and reject duplicate/unknown entries',()=>{
 const original=createIndicatorLibrary(),starred=toggleIndicatorFavorite(original,'rsi');expect(original.favorites).toEqual([]);expect(restoreIndicatorLibrary(JSON.parse(JSON.stringify(starred))).favorites).toEqual(['rsi']);expect(toggleIndicatorFavorite(starred,'rsi')).toEqual(original);
 expect(()=>restoreIndicatorLibrary({...starred,favorites:['rsi','rsi']})).toThrow();expect(()=>restoreIndicatorLibrary({...starred,favorites:['invented']})).toThrow();
});
it('saved defaults create independent values, cannot copy ownership, and factory reset affects only that kind',()=>{
 const original=createIndicatorLibrary(),draft=factoryIndicatorDefault('sma');draft.inputs.length=42;draft.plots.sma.color='#112233';
 const saved=saveIndicatorDefault(original,'sma',draft),first=instanceDefaults(saved,'sma'),second=instanceDefaults(saved,'sma');first.inputs.length=5;first.plots.sma.color='#ffffff';
 expect(second.inputs.length).toBe(42);expect(second.plots.sma.color).toBe('#112233');expect(original.defaults).toEqual({});expect(factoryIndicatorDefault('sma').inputs.length).toBe(9);
 for(const extra of [{id:'other'},{paneId:'shared'},{sourceId:'private'},{kind:'ema'}])expect(()=>saveIndicatorDefault(saved,'sma',{...draft,...extra})).toThrow(/ownership/);
 expect(clearIndicatorDefault(saved,'sma').defaults).toEqual({});expect(saved.defaults.sma?.inputs.length).toBe(42);
});
it('instance edit fingerprint catches native edits and renderer replacement without recalculation noise',()=>{
 const row={id:'one',kind:'sma' as const,...factoryIndicatorDefault('sma'),paneId:'price',rendererId:'native-one',informationBars:10};
 expect(indicatorEditFingerprint({...row,informationBars:20} as typeof row)).toBe(indicatorEditFingerprint(row));
 expect(indicatorEditFingerprint({...row,rendererId:'native-two'})).not.toBe(indicatorEditFingerprint(row));expect(indicatorEditFingerprint({...row,inputs:{...row.inputs,length:21}})).not.toBe(indicatorEditFingerprint(row));
});
