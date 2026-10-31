import {expect,it} from 'vitest';
import {SEASONALITY_INPUTS,validateSeasonalityCatalogInputs} from '../../src/domain/indicators-ext/seasonality-catalog';

// Saved requests are separate from actual source/calendar certification. These
// tests grant no history, provider completion, native frame or numerical right.
const defaults=()=>Object.fromEntries(SEASONALITY_INPUTS.map(field=>[field.key,field.defval]));
const validate=(changes:Record<string,unknown>)=>{const settings={...defaults(),...changes};validateSeasonalityCatalogInputs(key=>settings[key]);return settings;};
it('retains requested1900 without inventing source coverage or changing the2015 default',()=>{
 expect(validate({startYear:1900}).startYear).toBe(1900);expect(defaults().startYear).toBe(2015);expect(defaults().endYear).toBe(2028);
});
it('retains ordered requested years after2028 independently of actual compiler support',()=>{
 expect(validate({startYear:2029,endYear:2030})).toMatchObject({startYear:2029,endYear:2030,calendar:'nyse',session:'regular'});
});
it.each([{startYear:2029},{startYear:0},{endYear:10000},{startYear:2015.5},{endYear:NaN}])('refuses structurally invalid year request %j',request=>{
 expect(()=>validate(request)).toThrow('ordered Seasonality year range');
});
it.each([{calendar:'nyse',session:'continuous'},{calendar:'utc-continuous',session:'regular'},{calendar:'unknown',session:'regular'}])('preserves explicit calendar/session validation %j',request=>{
 expect(()=>validate(request)).toThrow('calendar and session');
});
it('preserves exact local completion and exclusion validation while saving an earlier year',()=>{
 expect(()=>validate({startYear:1900,closedThrough:'2024-02-30T00:00:00Z'})).toThrow('invalid');expect(()=>validate({startYear:1900,excludedMonths:'2016-13'})).toThrow();
});
