import type {CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseSeasonalityExclusions} from './seasonality-types';
export const SEASONALITY_IDS=['seasonality'] as const;
export type SeasonalityId=typeof SEASONALITY_IDS[number];
export const SEASONALITY_PLOTS=Object.freeze(['expectedPrice','historicalMean','historicalDeviation','sampleCount'] as const);
export const SEASONALITY_INPUTS:readonly CatalogInput[]=Object.freeze([
 {key:'startYear',title:'Starting year',type:'int',defval:2015,min:1,max:9999},
 {key:'endYear',title:'Last table year (OpenCandle)',type:'int',defval:2028,min:1,max:9999},
 {key:'excludedMonths',title:'Ignored months',type:'string',defval:''},
 {key:'calendar',title:'Declared local source calendar',type:'string',defval:'nyse',options:['nyse','utc-continuous']},
 {key:'session',title:'Declared local source session',type:'string',defval:'regular',options:['regular','extended','continuous']},
 {key:'dateLabels',title:'Declared daily/monthly date labels',type:'string',defval:'utc-date',options:['utc-date','calendar-midnight']},
 {key:'closedThrough',title:'Local observations closed through (UTC)',type:'string',defval:''},
 {key:'includeDevelopingInSummaries',title:'Include developing month in current summaries (OpenCandle)',type:'bool',defval:false},
 {key:'positiveColor',title:'Positive color',type:'string',defval:'#26a69a'},
 {key:'negativeColor',title:'Negative color',type:'string',defval:'#ef5350'},
 {key:'intensityCutoff',title:'Color intensity cutoff (%)',type:'float',defval:10,min:0.000001,max:100000},
 {key:'tablePosition',title:'Table position',type:'string',defval:'Center',options:['Left','Center','Right']},
 {key:'tableWidth',title:'Table width (%)',type:'float',defval:100,min:0,max:100},
 {key:'tableHeight',title:'Table height (%)',type:'float',defval:95,min:0,max:100},
 {key:'meanRow',title:'Show averages',type:'bool',defval:true},
 {key:'deviationRow',title:'Show standard deviation',type:'bool',defval:true},
 {key:'positiveFrequencyRow',title:'Show percent positive',type:'bool',defval:true},
 {key:'projectionGeometry',title:'Show monthly projection boxes',type:'bool',defval:true},
]);
/** Exact UTC input, no Date.parse coercion or implicit local time. Empty is an honest unconfigured local declaration. */
export function seasonalityCompletionCutoff(value:unknown,required=true):number|null{
 if(value===''){if(required)throw Error('Declare when the local daily/monthly observations are closed, for example 2024-12-31T23:59:59Z. This is a local declaration, not provider finality.');return null;}
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value))throw Error('Use an exact UTC completion time YYYY-MM-DDTHH:mm:ssZ.');
 const time=Date.parse(value);if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,19)+'Z'!==value)throw Error('The local completion time is invalid.');return time/1000;
}
export function validateSeasonalityCatalogInputs(value:(key:string)=>unknown):void{
 const start=value('startYear'),end=value('endYear');if(typeof start!=='number'||typeof end!=='number'||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end>9999||start>end)throw Error('Choose an ordered Seasonality year range from 1 through 9999.');
 parseSeasonalityExclusions(value('excludedMonths'));
 const calendar=value('calendar'),session=value('session');if(!['nyse','utc-continuous'].includes(calendar as string)||calendar==='nyse'&&session!=='regular'&&session!=='extended'||calendar==='utc-continuous'&&session!=='continuous')throw Error('The declared calendar and session must agree.');
 if(!['utc-date','calendar-midnight'].includes(value('dateLabels') as string))throw Error('Choose an explicit source date-label convention.');
 for(const key of ['positiveColor','negativeColor'])if(typeof value(key)!=='string'||(value(key) as string).length>200)throw Error('Seasonality colors must be bounded strings.');
 seasonalityCompletionCutoff(value('closedThrough'),false);
}
export const SEASONALITY_DEFINITIONS:readonly CatalogDefinition[]=Object.freeze([{
 id:'seasonality',name:'Seasonality',acronym:'Seasonality',overlay:false,seasonality:true,inputs:SEASONALITY_INPUTS,
 plots:SEASONALITY_PLOTS.map((id,index)=>({id,label:['Expected price for current month','Historical average for current month (%)','Historical standard deviation for current month (%)','Months used in current average'][index],color:'#41b6c4',width:1})),
 provenance:[{url:'public-indicator-definition:seasonality',facts:'Separate-pane monthly heatmap, monthly price projection boxes, four inspection values, exclusions, summary toggles, centered table, width100/height95 and fit-content zero dimensions.'}],
 unknownDefaults:['Starting/ending year, local calendar/date-label/completion declarations, colors, cutoff10, summary/box toggles, font/rounding and developing-summary exclusion are OpenCandle choices; exact reference defaults and pixels are unverified.'],
 policies:['OpenCandle consecutive month closes, population deviation, zero included but not positive; latest table is separate from frozen month-opening projections.','Uses privately owned local daily/monthly documents with declared calendar/completion, or daily history requested from the selected live source. Live history starts in 2015 and NYSE calendar calculations end in 2028; requested years outside coverage remain saved and unavailable. Provider daily prices follow the provider session policy. No provider completeness, listing-date or point-in-time archive claim.','A first supplied month without its preceding close remains unavailable. Unsupported source mappings and insufficient history are explained, never replaced by zero or another provider. Chart-only; alerts cannot reproduce its private source context.'],
 calculate(){throw Error('Seasonality requires the chart-owned original candle source service. Bare bars and public metadata do not grant it.');},warmup:()=>1,work:count=>count*32,
}]);
