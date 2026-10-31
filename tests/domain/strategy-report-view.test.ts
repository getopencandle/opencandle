import {expect,it} from 'vitest';
import {buildStrategyReport} from '../../src/domain/strategy-report';
import {queryReportTrades,reportPlotIndices} from '../../src/domain/strategy-report-view';
import {reportArithmeticFixture} from './strategy-report-fixtures';
function report(){const fixture=reportArithmeticFixture();return buildStrategyReport({bars:fixture.bars,barIds:fixture.barIds,result:fixture.result,context:{executionId:'view-literals',sourceLabel:'Synthetic arithmetic',currency:null,timezone:'UTC'}});}
it('filters and sorts real allocations without renumbering or changing canonical identity',()=>{
 const value=report(),options={side:'all' as const,query:'',sort:'netProfit' as const,descending:false,page:0};
 expect(queryReportTrades(value,options).rows.map(row=>row.number)).toEqual([2,3,1]);
 expect(queryReportTrades(value,{...options,descending:true}).rows.map(row=>row.number)).toEqual([1,3,2]);
 expect(queryReportTrades(value,{...options,side:'short'}).rows.map(row=>row.id)).toEqual(['trade:2']);
 expect(queryReportTrades(value,{...options,query:'CLOSE-A'}).rows.map(row=>row.number)).toEqual([1]);
 expect(queryReportTrades(value,{...options,query:'missing'})).toMatchObject({count:0,pages:1,page:0,rows:[]});
 expect(queryReportTrades(value,{...options,page:999}).page).toBe(0);
 expect(value.trades.map(row=>row.number)).toEqual([1,2,3]);
});
it('keeps tied column sorting chronological in both directions and rejects invalid table controls',()=>{
 const value=report(),options={side:'all' as const,query:'',sort:'commission' as const,descending:false,page:0};
 expect(queryReportTrades(value,options).rows.map(row=>row.number)).toEqual([1,2,3]);
 expect(queryReportTrades(value,{...options,descending:true}).rows.map(row=>row.number)).toEqual([1,2,3]);
 expect(()=>queryReportTrades(value,{...options,page:-1})).toThrow(/controls/);
 expect(()=>queryReportTrades(value,{...options,query:'x'.repeat(201)})).toThrow(/controls/);
});
it('preserves original chronological endpoints and bucket extrema under the display cap',()=>{
 const values=Array.from({length:200000},(_,index)=>index===12345?-1000:index===177777?1000:0),indices=reportPlotIndices(values,1000);
 expect(indices.length).toBeLessThanOrEqual(1000);expect(indices[0]).toBe(0);expect(indices.at(-1)).toBe(199999);
 expect(indices).toContain(12345);expect(indices).toContain(177777);expect(new Set(indices).size).toBe(indices.length);
 expect(indices.every((index,i)=>i===0||index>indices[i-1])).toBe(true);
 expect(reportPlotIndices([1,null,2])).toEqual([0,1,2]);
 expect(()=>reportPlotIndices(values,2001)).toThrow(/bound/);
});
