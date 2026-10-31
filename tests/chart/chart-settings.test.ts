import {it,expect} from 'vitest';
import {chartSettingsSchema,settingsDefaults,validateTypeSettings,validatedSettingsBook,appearanceWithTypeSettings,colorValid} from '../../src/chart/chart-settings';
import {baselineY,barsStrokeWidth,CHART_TYPES} from '../../src/chart/chart-types';
it('thirteen style schemas expose applicable controls and reject generic neighboring fields',()=>{
 for(const [style] of CHART_TYPES.slice(0,13)){const schema=chartSettingsSchema(style),keys=schema.fields.map(field=>field.key);expect(new Set(keys).size).toBe(keys.length);expect(()=>validateTypeSettings(style,settingsDefaults(style))).not.toThrow();}
 /* High-Low previous-close coloring adds 'Color based on previous close' + 'Down color' to High-Low */expect(chartSettingsSchema('highlow').fields.map(field=>field.key)).toEqual(['bodyVisible','color','borderVisible','borderColor','labelsVisible','labelColor','previousClose','downColor']);expect(()=>validateTypeSettings('highlow',{previousClose:true})).not.toThrow();expect(()=>validateTypeSettings('highlow',{baseLevel:50})).toThrow('not supported');expect(()=>chartSettingsSchema('renko')).not.toThrow();expect(()=>chartSettingsSchema('footprint')).not.toThrow();expect(()=>chartSettingsSchema('nosuchtype')).toThrow('no available settings renderer');
 expect(chartSettingsSchema('hlcarea').fields.map(field=>field.key)).toContain('closeWidth');expect(chartSettingsSchema('bars').fields.map(field=>field.key)).toContain('openVisible');
});
it('numeric and color validation rejects adversarial values consistently before any application',()=>{
 for(const value of ['rgb(,)','rgba(1)','rgb(1,2,3,4)','rgb(1,2,,3)','rgba(1,2,3,1.1)','rgb(256,2,3)','rgb(101%,2%,3%)','hsl(180,50,50)','rgba(1,2,3,)','#12','notacolor'])expect(colorValid(value),value).toBe(false);
 for(const value of ['#abc','#abcd','#123456','#12345680','rgba(1,2,3,0.5)','rgb(100%,0%,10%)','rgb(1 2 3 / 50%)','hsl(180,50%,50%)','transparent'])expect(colorValid(value),value).toBe(true);
 expect(()=>validateTypeSettings('line',{width:NaN})).toThrow();expect(()=>validateTypeSettings('line',{opacity:1.1})).toThrow();expect(()=>validateTypeSettings('line',{source:'volume'})).toThrow();expect(()=>validateTypeSettings('baseline',{baseLevel:-1})).toThrow();
});
it('book restoration resets omitted style controls and retains unsupported payload separately from rendering',()=>{
 /* Footprint has a schema now; an unknown style keeps the retained-payload case. */const original={line:{color:'#12345680',future:{opaque:true}},nosuchtype:{future:{bricks:[1,2]}}},result=validatedSettingsBook(original);expect(result.retained).toEqual(original);expect(result.applicable.line.color).toBe('#12345680');expect(result.applicable.line.future).toBeUndefined();expect(result.applicable.nosuchtype).toBeUndefined();expect(result.unavailable).toEqual(['line.future','nosuchtype']);
 expect(validatedSettingsBook({}).applicable.line.color).toBe(settingsDefaults('line').color);expect(original.line.future).toEqual({opaque:true});expect(()=>validatedSettingsBook({line:{width:-1}})).toThrow();
});
it('baseline percentage uses documented bottom0/top100 geometry and candle updates preserve unrelated original settings',()=>{
 expect([0,50,100].map(level=>baselineY(20,200,level))).toEqual([220,120,20]);expect(barsStrokeWidth(true,20)).toBe(1);expect(barsStrokeWidth(false,20)).toBeCloseTo(3.6);
 const original={'paneProperties.background':'#01020380','mainSeriesProperties.candleStyle.upColor':'#123456'};const next=appearanceWithTypeSettings(original,{color:'#abcdef80',previousClose:true});expect(next['paneProperties.background']).toBe('#01020380');expect(next['mainSeriesProperties.candleStyle.upColor']).toBe('#abcdef80');expect(next['mainSeriesProperties.candleStyle.barColorsOnPrevClose']).toBe(true);expect(original['mainSeriesProperties.candleStyle.upColor']).toBe('#123456');
});
