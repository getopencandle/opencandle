// SEC public filing values, no prices. Apple Inc. (CIK 320193) diluted EPS and diluted weighted shares around the
// 4-for-1 split effective 2020-08-31, copied from SEC companyfacts (data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json,
// retrieved 2026-11-02; the "frame" field is dropped). Only these periods are kept:
// FY2019 2018-09-30..2019-09-28, Q3 FY2020 2020-03-29..2020-06-27, 9-month YTD 2019-09-29..2020-06-27,
// FY2020 2019-09-29..2020-09-26 and Q4 FY2020 2020-06-28..2020-09-26 (reported directly in the FY2020 10-K).
// Filings: 10-K 0000320193-19-000119 (2019-10-31), 10-Q 0000320193-20-000062 (2020-07-31),
// 10-K 0000320193-20-000096 (2020-10-30), 10-Q 0000320193-21-000065 (2021-07-28), 10-K 0000320193-21-000105 (2021-10-29).
const eps=[
 {start:'2018-09-30',end:'2019-09-28',val:11.89,accn:'0000320193-19-000119',fy:2019,fp:'FY',form:'10-K',filed:'2019-10-31'},
 {start:'2018-09-30',end:'2019-09-28',val:2.97,accn:'0000320193-20-000096',fy:2020,fp:'FY',form:'10-K',filed:'2020-10-30'},
 {start:'2018-09-30',end:'2019-09-28',val:2.97,accn:'0000320193-21-000105',fy:2021,fp:'FY',form:'10-K',filed:'2021-10-29'},
 {start:'2019-09-29',end:'2020-06-27',val:10.16,accn:'0000320193-20-000062',fy:2020,fp:'Q3',form:'10-Q',filed:'2020-07-31'},
 {start:'2019-09-29',end:'2020-06-27',val:2.54,accn:'0000320193-21-000065',fy:2021,fp:'Q3',form:'10-Q',filed:'2021-07-28'},
 {start:'2020-03-29',end:'2020-06-27',val:2.58,accn:'0000320193-20-000062',fy:2020,fp:'Q3',form:'10-Q',filed:'2020-07-31'},
 {start:'2020-03-29',end:'2020-06-27',val:0.65,accn:'0000320193-20-000096',fy:2020,fp:'FY',form:'10-K',filed:'2020-10-30'},
 {start:'2020-03-29',end:'2020-06-27',val:0.65,accn:'0000320193-21-000065',fy:2021,fp:'Q3',form:'10-Q',filed:'2021-07-28'},
 {start:'2019-09-29',end:'2020-09-26',val:3.28,accn:'0000320193-20-000096',fy:2020,fp:'FY',form:'10-K',filed:'2020-10-30'},
 {start:'2019-09-29',end:'2020-09-26',val:3.28,accn:'0000320193-21-000105',fy:2021,fp:'FY',form:'10-K',filed:'2021-10-29'},
 {start:'2020-06-28',end:'2020-09-26',val:0.73,accn:'0000320193-20-000096',fy:2020,fp:'FY',form:'10-K',filed:'2020-10-30'},
];
const dilutedShares=[
 {start:'2018-09-30',end:'2019-09-28',val:4648913000,accn:'0000320193-19-000119',fy:2019,fp:'FY',form:'10-K',filed:'2019-10-31'},
 {start:'2018-09-30',end:'2019-09-28',val:18595651000,accn:'0000320193-20-000096',fy:2020,fp:'FY',form:'10-K',filed:'2020-10-30'},
 {start:'2018-09-30',end:'2019-09-28',val:18595651000,accn:'0000320193-21-000105',fy:2021,fp:'FY',form:'10-K',filed:'2021-10-29'},
 {start:'2019-09-29',end:'2020-06-27',val:4404695000,accn:'0000320193-20-000062',fy:2020,fp:'Q3',form:'10-Q',filed:'2020-07-31'},
 {start:'2019-09-29',end:'2020-06-27',val:17618778000,accn:'0000320193-21-000065',fy:2021,fp:'Q3',form:'10-Q',filed:'2021-07-28'},
 {start:'2020-03-29',end:'2020-06-27',val:4354788000,accn:'0000320193-20-000062',fy:2020,fp:'Q3',form:'10-Q',filed:'2020-07-31'},
 {start:'2020-03-29',end:'2020-06-27',val:17419154000,accn:'0000320193-21-000065',fy:2021,fp:'Q3',form:'10-Q',filed:'2021-07-28'},
 {start:'2019-09-29',end:'2020-09-26',val:17528214000,accn:'0000320193-20-000096',fy:2020,fp:'FY',form:'10-K',filed:'2020-10-30'},
 {start:'2019-09-29',end:'2020-09-26',val:17528214000,accn:'0000320193-21-000105',fy:2021,fp:'FY',form:'10-K',filed:'2021-10-29'},
];
export function aaplSplitFacts(){
 return {cik:320193,entityName:'Apple Inc.',facts:{'us-gaap':{
  EarningsPerShareDiluted:{label:'Earnings Per Share, Diluted',units:{'USD/shares':eps.map(r=>({...r}))}},
  WeightedAverageNumberOfDilutedSharesOutstanding:{label:'Weighted Average Number of Shares Outstanding, Diluted',units:{shares:dilutedShares.map(r=>({...r}))}},
 }}};
}
