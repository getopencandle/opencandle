/** Original pure Seasonality contracts. Source descriptions are labels, never history ownership or permission. */
export const SEASONALITY_LIMITS=Object.freeze({bars:100000,operations:20000000,numericSlots:2000000,exclusionCharacters:200});
export interface SeasonalitySettings {
 startYear:number;endYear:number;excludedMonths:string;includeDevelopingInSummaries:boolean;
 meanRow:boolean;deviationRow:boolean;positiveFrequencyRow:boolean;projectionGeometry:boolean;externalNumericSlots:number;
}
export type SeasonalityCoverage='complete'|'sparse'|'unknown';
export interface SeasonalityMonth {
 month:string;openingTime:number;nextOpeningTime:number;labelOpeningTime:number;nextLabelOpeningTime:number;firstTime:number|null;close:number|null;availableAt:number|null;
 completion:'closed'|'developing'|'unavailable';coverage:SeasonalityCoverage;expectedSessions:number|null;observedSessions:number;
}
export interface SeasonalitySample {time:number;month:string}
export interface SeasonalityStatistics {count:number;mean:number|null;deviation:number|null;positiveFrequency:number|null;sparseCount:number;unknownCoverageCount:number;developingCount:number}
export interface SeasonalityProjection {
 month:string;openingTime:number;baseline:number|null;price:number|null;statistics:Readonly<SeasonalityStatistics>;
 state:'ready'|'excluded'|'no-history'|'missing-baseline';
 geometry:Readonly<{left:number;right:number;baseline:number;price:number}>|null;
}
export interface SeasonalityCell {
 month:string;state:'closed'|'developing'|'excluded'|'unavailable'|'absent'|'future';value:number|null;
 coverage:SeasonalityCoverage;expectedSessions:number|null;observedSessions:number;reason:string|null;
}
export interface SeasonalityYear {year:number;cells:readonly Readonly<SeasonalityCell>[]}
export interface SeasonalityUsage {operations:number;numericSlots:number;tableCells:number;scalarSlots:number;nativeReadoutSlots:number;geometrySlots:number;compilerSlots:number;calendarCacheSlots:number}
export interface SeasonalityScene {
 policy:'lv-consecutive-closes-population-v1';sourceKeyDescription:string;asOf:number;
 exclusions:readonly string[];years:readonly Readonly<SeasonalityYear>[];summaries:readonly Readonly<SeasonalityStatistics>[];
 projections:readonly Readonly<SeasonalityProjection>[];
 series:readonly (readonly (number|null)[])[];
}
export type SeasonalityResult={status:'ready';scene:Readonly<SeasonalityScene>;usage:Readonly<SeasonalityUsage>}|{status:'unavailable';scene:null;diagnostic:string;usage:Readonly<SeasonalityUsage>|null};
export class SeasonalityUnavailable extends Error {}
export function seasonalityOwn(value:unknown,key:string):unknown{
 if(!value||typeof value!=='object')throw new SeasonalityUnavailable('Seasonality requires plain supplied data.');
 const field=Object.getOwnPropertyDescriptor(value,key);
 if(!field?.enumerable||!Object.hasOwn(field,'value'))throw new SeasonalityUnavailable('Seasonality requires own data fields without accessors.');
 return field.value;
}
export function seasonalityRecord(value:unknown,keys:readonly string[]):void{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new SeasonalityUnavailable('Seasonality requires plain records.');
 const actual=Reflect.ownKeys(value);if(actual.length!==keys.length||actual.some(key=>typeof key!=='string'||!keys.includes(key)))throw new SeasonalityUnavailable('Seasonality record fields are invalid.');
 for(const key of keys)seasonalityOwn(value,key);
}
export function seasonalityArrayLength(value:unknown):number{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>SEASONALITY_LIMITS.bars)throw new SeasonalityUnavailable('Seasonality requires at most 100000 supplied observations.');return value.length;
}
export function seasonalityArray(value:unknown):asserts value is readonly unknown[]{
 const length=seasonalityArrayLength(value);if(Reflect.ownKeys(value as object).length!==length+1)throw new SeasonalityUnavailable('Seasonality requires dense supplied observations without extra array fields.');
}
export function seasonalityMonthIndex(value:unknown):number{
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<1)throw new SeasonalityUnavailable('Seasonality months must use YYYY-MM with years 0001 through 9999.');
 return Number(value.slice(0,4))*12+Number(value.slice(5))-1;
}
export function seasonalityMonthKey(index:number):string{return String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');}
/** LV grammar: commas and whitespace delimit whole tokens; duplicates collapse. Invalid drafts fail atomically. */
export function parseSeasonalityExclusions(value:unknown):readonly string[]{
 if(typeof value!=='string'||value.length>SEASONALITY_LIMITS.exclusionCharacters)throw new SeasonalityUnavailable('Seasonality exclusions require at most 200 characters.');
 const items=value.trim()?value.trim().split(/[\s,]+/):[];for(const item of items)seasonalityMonthIndex(item);
 return Object.freeze([...new Set(items)].sort());
}
export function validateSeasonalitySettings(settings:SeasonalitySettings):void{
 seasonalityRecord(settings,['startYear','endYear','excludedMonths','includeDevelopingInSummaries','meanRow','deviationRow','positiveFrequencyRow','projectionGeometry','externalNumericSlots']);
 if(!Number.isSafeInteger(settings.startYear)||!Number.isSafeInteger(settings.endYear)||settings.startYear<1||settings.endYear>9999||settings.startYear>settings.endYear||!Number.isSafeInteger(settings.externalNumericSlots)||settings.externalNumericSlots<0)throw new SeasonalityUnavailable('Choose a valid Seasonality year range and existing batch reservation.');
 for(const key of ['includeDevelopingInSummaries','meanRow','deviationRow','positiveFrequencyRow','projectionGeometry'] as const)if(typeof settings[key]!=='boolean')throw new SeasonalityUnavailable('Seasonality choices must be explicit booleans.');
 parseSeasonalityExclusions(settings.excludedMonths);
}
export interface SeasonalityReservation {chartBars:number;monthFrames:number;sourceRows:number;calendarDays:number;settings:SeasonalitySettings;compiler:boolean}
/** Includes future native readout/geometry/table materialization, not just the four pure arrays. No ceiling overrides. */
export function reserveSeasonality(input:SeasonalityReservation):Readonly<SeasonalityUsage>{
 seasonalityRecord(input,['chartBars','monthFrames','sourceRows','calendarDays','settings','compiler']);
 if(typeof input.compiler!=='boolean')throw new SeasonalityUnavailable('Seasonality compiler mode must be an explicit boolean.');
 validateSeasonalitySettings(input.settings);for(const count of [input.chartBars,input.monthFrames,input.sourceRows])if(!Number.isSafeInteger(count)||count<0||count>SEASONALITY_LIMITS.bars)throw new SeasonalityUnavailable('Seasonality supplied history exceeds the existing bar limit.');
 if(!Number.isSafeInteger(input.calendarDays)||input.calendarDays<0)throw new SeasonalityUnavailable('Seasonality calendar work is invalid.');
 const settings=input.settings,summaryRows=Number(settings.meanRow)+Number(settings.deviationRow)+Number(settings.positiveFrequencyRow),tableCells=(settings.endYear-settings.startYear+2+summaryRows)*13;
 const scalarSlots=input.chartBars*4,nativeReadoutSlots=input.chartBars*8,geometrySlots=settings.projectionGeometry?input.monthFrames*16:0,compilerSlots=input.compiler?input.sourceRows*2:0;
 // Existing NY offsetAt retains at most 50001 numeric hour/offset pairs. Charge every compiler conservatively,
 // including UTC, before any calendar/Intl work; carry this retained shared storage into the model call.
 const calendarCacheSlots=input.compiler?100002:0;
 // Fixed 252 numbers: 24 seven-number accumulators and 12 seven-number latest summaries. 512 also covers small containers.
 // Per month 48 covers the model's 42-43 numeric/reference slots or the compiler's separate 29-slot peak.
 const numericSlots=settings.externalNumericSlots+scalarSlots+nativeReadoutSlots+geometrySlots+compilerSlots+calendarCacheSlots+input.monthFrames*48+tableCells*4+Math.max(input.chartBars,input.sourceRows,input.monthFrames)+512;
 const operations=input.chartBars*32+(input.compiler?input.sourceRows*128:0)+input.monthFrames*(160+8*Math.ceil(Math.log2(input.monthFrames+1)))+tableCells*12+input.calendarDays*24+128;
 if(!Number.isSafeInteger(numericSlots)||numericSlots>SEASONALITY_LIMITS.numericSlots||!Number.isSafeInteger(operations)||operations>SEASONALITY_LIMITS.operations)throw new SeasonalityUnavailable('Seasonality exceeds the existing calculation budget. Reduce history or the year range.');
 return Object.freeze({operations,numericSlots,tableCells,scalarSlots,nativeReadoutSlots,geometrySlots,compilerSlots,calendarCacheSlots});
}
