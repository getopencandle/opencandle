import type {SeasonalityMonth,SeasonalitySettings} from '../../src/domain/indicators-ext/seasonality-types';
import type {SeasonalityInput} from '../../src/domain/indicators-ext/seasonality';
/** All prices and labels are SYNTHETIC; endpoint fixtures are independent of the calendar compiler. */
export const stamp=(value:string)=>Date.parse(value+'T00:00:00Z')/1000;
export const settings=():SeasonalitySettings=>({startYear:2021,endYear:2023,excludedMonths:'',includeDevelopingInSummaries:true,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true,externalNumericSlots:0});
export function month(key:string,close:number|null,completion:SeasonalityMonth['completion']='closed'):SeasonalityMonth{
 const [year,number]=key.split('-').map(Number),next=new Date(0);next.setUTCFullYear(year,number,1);next.setUTCHours(0,0,0,0);const openingTime=stamp(key+'-01'),nextOpeningTime=next.getTime()/1000;
 return{month:key,openingTime,nextOpeningTime,labelOpeningTime:openingTime,nextLabelOpeningTime:nextOpeningTime,firstTime:openingTime,close,availableAt:completion==='unavailable'?null:completion==='closed'?nextOpeningTime:openingTime+14*86400,completion,coverage:'complete',expectedSessions:1,observedSessions:close===null?0:1};
}
export function januaryFixture():SeasonalityInput{return{
 sourceKeyDescription:'SYNTHETIC monthly endpoints, USD, raw, UTC continuous. Description only.',settings:settings(),asOf:stamp('2023-01-20'),asOfMonth:'2023-01',
 months:[month('2020-12',100),month('2021-01',110),month('2021-02',99),month('2021-12',100),month('2022-01',120),month('2022-02',120),month('2022-12',200),month('2023-01',260,'developing')],
 samples:[{time:stamp('2022-01-01'),month:'2022-01'},{time:stamp('2023-01-01'),month:'2023-01'},{time:stamp('2023-01-19'),month:'2023-01'}],
};}
