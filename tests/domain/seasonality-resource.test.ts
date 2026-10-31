import {expect,it} from 'vitest';
import {reserveSeasonality,SEASONALITY_LIMITS} from '../../src/domain/indicators-ext/seasonality-types';
import {calculateSeasonality} from '../../src/domain/indicators-ext/seasonality';
import {settings,januaryFixture} from '../fixtures/seasonality-pure';

it('four100k scalar arrays and eight native readout slots per row fit existing limits with a bounded full table',()=>{
 const usage=reserveSeasonality({chartBars:100000,monthFrames:10,sourceRows:0,calendarDays:0,settings:settings(),compiler:false});
 expect(SEASONALITY_LIMITS).toMatchObject({bars:100000,numericSlots:2000000,operations:20000000});
 expect(usage).toEqual({scalarSlots:400000,nativeReadoutSlots:800000,geometrySlots:160,compilerSlots:0,calendarCacheSlots:0,tableCells:91,numericSlots:1301516,operations:3203140});
});
it('full requested years, optional summary rows, compiler storage and geometry are reserved before allocation',()=>{
 const config=settings(),base=reserveSeasonality({chartBars:12,monthFrames:12,sourceRows:12,calendarDays:372,settings:config,compiler:true});expect(base.compilerSlots).toBe(24);expect(base.calendarCacheSlots).toBe(100002);expect(base.geometrySlots).toBe(192);expect(base.tableCells).toBe(91);
 config.meanRow=false;config.deviationRow=false;config.positiveFrequencyRow=false;config.projectionGeometry=false;const reduced=reserveSeasonality({chartBars:12,monthFrames:12,sourceRows:12,calendarDays:372,settings:config,compiler:true});expect(reduced.tableCells).toBe(52);expect(base.numericSlots-reduced.numericSlots).toBe(348);
});
it('budget or bar refusal is atomic before accessing any supplied monthly row',()=>{
 const input=januaryFixture();input.settings.externalNumericSlots=2000000;let reads=0;const months:typeof input.months=[];Object.defineProperty(months,'0',{enumerable:true,get(){reads++;throw Error('No row access before reservation');}});input.months=months;
 expect(calculateSeasonality(input)).toMatchObject({status:'unavailable',scene:null,usage:null});expect(reads).toBe(0);
 expect(()=>reserveSeasonality({chartBars:100001,monthFrames:0,sourceRows:0,calendarDays:0,settings:settings(),compiler:false})).toThrow(/bar limit/);
});
it('operation and memory ceilings are immutable and no configured truncation or raised limit is accepted',()=>{
 const huge=settings();huge.startYear=1;huge.endYear=9999;expect(()=>reserveSeasonality({chartBars:100000,monthFrames:100000,sourceRows:100000,calendarDays:3100000,settings:huge,compiler:true})).toThrow(/budget/);
 const incomplete={...settings()} as any;delete incomplete.includeDevelopingInSummaries;expect(()=>reserveSeasonality({chartBars:0,monthFrames:0,sourceRows:0,calendarDays:0,settings:incomplete,compiler:false})).toThrow(/fields/);
});
it('resource envelope accessors are refused before any getter or calculation reads',()=>{
 for(const key of ['chartBars','monthFrames','sourceRows','calendarDays','settings','compiler'] as const){const input={chartBars:1,monthFrames:1,sourceRows:1,calendarDays:31,settings:settings(),compiler:false},value=input[key];let reads=0,refused=false;
  Object.defineProperty(input,key,{enumerable:true,get(){reads++;return value;}});try{reserveSeasonality(input);}catch{refused=true;}
  expect({key,refused,reads}).toEqual({key,refused:true,reads:0});
 }
});
it('compiler mode is an explicit primitive boolean rather than a coerced truthy envelope field',()=>{
 for(const compiler of [undefined,null,0,1,'false','true',{}])expect(()=>reserveSeasonality({chartBars:0,monthFrames:0,sourceRows:0,calendarDays:0,settings:settings(),compiler} as any)).toThrow(/explicit boolean/);
});
it('fixed storage and the complete table remain reserved for empty history near the existing2M batch ceiling',()=>{
 const input={chartBars:0,monthFrames:0,sourceRows:0,calendarDays:0,settings:settings(),compiler:false},usage=reserveSeasonality(input);let refused=false;
 try{reserveSeasonality({...input,settings:{...settings(),externalNumericSlots:1999400}});}catch{refused=true;}
 // Independent minimum:24*7 accumulator numbers +12*7 summary numbers +91 declared cells*4 =616.
 expect({completeFixedAndTable:usage.numericSlots>=616,nearCeilingRefused:refused}).toEqual({completeFixedAndTable:true,nearCeilingRefused:true});
});
