import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {applyRange,buildGraphSeries,constrainGraphConfig,createGraphConfig,overlayPoints,restoreGraphConfig,scaleSeries,type GraphConfig,type GraphSeries} from '../../src/fundamentals/graph';
import {restoreFundamentalsPreferences,createFundamentalsPreferences} from '../../src/fundamentals/preferences';
import {syntheticStatementFacts,syntheticSource} from './fixtures/synthetic-statements';
const doc=(id='d1')=>({id,facts:normalizeCompanyFacts(syntheticStatementFacts()),source:syntheticSource});
const cfg=(patch:Partial<GraphConfig>={}):GraphConfig=>({...createGraphConfig(),documentIds:['d1'],...patch});
const series=(points:[string,number][]):GraphSeries=>({key:'k',documentId:'d1',entity:'E',metricId:'revenue',label:'Revenue',unit:'USD',measure:'currency',basis:'FY',points:points.map(([end,value])=>({end,value})),notes:[]});
describe('fundamentals graph model',()=>{
 it('draws statement-table values in ascending period order (annual revenue and net income)',()=>{
  const b=buildGraphSeries([doc()],cfg(),'2024-12-31');
  expect(b.series.map(s=>s.metricId)).toEqual(['revenue','net_income']);
  expect(b.series[0].points).toEqual([{end:'2023-01-31',value:900},{end:'2024-01-31',value:1020}]);
  expect(b.series[1].points).toEqual([{end:'2023-01-31',value:90},{end:'2024-01-31',value:100}]);
  expect(b.series[0].unit).toBe('USD');
 });
 it('honours the filing cutoff (FY2024 filed 2025-03-25 appears only after it)',()=>{
  expect(buildGraphSeries([doc()],cfg({metricIds:['revenue']}),null).series[0].points.at(-1)).toEqual({end:'2025-01-31',value:1200});
 });
 it('derived metrics work: net margin 100/1020 and 90/900',()=>{
  const p=buildGraphSeries([doc()],cfg({metricIds:['net_margin']}),'2024-12-31').series[0].points;
  expect(p[0].value).toBeCloseTo(10,10);expect(p[1].value).toBeCloseTo(100/1020*100,10);
 });
 it('refuses balance-sheet values on a TTM basis with a note, and by-symbol/by-metric limits apply',()=>{
  const s=buildGraphSeries([doc()],cfg({basis:'TTM',metricIds:['total_assets']}),'2024-12-31').series[0];
  expect(s.points).toEqual([]);expect(s.notes[0]).toMatch(/point-in-time/);
  expect(constrainGraphConfig(cfg({view:'symbol',documentIds:['a','b'],metricIds:['revenue','net_income']}))).toMatchObject({documentIds:['a'],metricIds:['revenue','net_income']});
  expect(constrainGraphConfig(cfg({view:'metric',documentIds:['a','b'],metricIds:['revenue','net_income']}))).toMatchObject({documentIds:['a','b'],metricIds:['revenue']});
 });
 it('two documents by metric give one line each, and a removed document is reported',()=>{
  const b=buildGraphSeries([doc('d1'),doc('d2')],cfg({view:'metric',documentIds:['d1','d2','gone'],metricIds:['revenue']}),'2024-12-31');
  expect(b.series.map(s=>s.documentId)).toEqual(['d1','d2']);expect(b.notices[0]).toMatch(/removed/);
 });
 it('scales: percent, indexed and log, with impossible cases dropped and explained',()=>{
  const s=series([['2020-01-01',100],['2021-01-01',150],['2022-01-01',50]]);
  expect(scaleSeries(s,'percent').points.map(p=>p.value)).toEqual([0,50,-50]);
  expect(scaleSeries(s,'indexed').points.map(p=>p.value)).toEqual([100,150,50]);
  const neg=series([['2020-01-01',-100],['2021-01-01',-50],['2022-01-01',10]]);
  const pc=scaleSeries(neg,'percent').points.map(p=>p.value);expect(pc.slice(0,2)).toEqual([0,50]);expect(pc[2]).toBeCloseTo(110,10);
  const i=scaleSeries(neg,'indexed');expect(i.points).toEqual([]);expect(i.notes[0]).toMatch(/negative/);
  const l=scaleSeries(neg,'log');expect(l.points).toEqual([{end:'2022-01-01',value:10}]);expect(l.dropped).toBe(2);expect(l.notes[0]).toMatch(/2 zero or negative/);
  expect(scaleSeries(series([['2020-01-01',0],['2021-01-01',5]]),'percent').notes[0]).toMatch(/zero/);
 });
 it('range keeps the last N calendar years before the latest period end',()=>{
  const s=series([['2014-01-31',1],['2015-01-31',2],['2021-01-31',3],['2022-06-30',4],['2024-01-31',5]]);
  expect(applyRange([s],'3Y')[0].points.map(p=>p.value)).toEqual([4,5]);
  expect(applyRange([s],'10Y')[0].points.map(p=>p.value)).toEqual([2,3,4,5]);
  expect(applyRange([s],'all')[0].points).toHaveLength(5);
 });
 it('price overlay thins long series to the limit and keeps the last close',()=>{
  const bars=Array.from({length:1000},(_,i)=>({date:new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),close:10+i}));
  const o=overlayPoints(bars,'2020-01-01','2030-01-01',100);expect(o.length).toBeLessThanOrEqual(101);expect(o.at(-1)!.close).toBe(1009);
  expect(overlayPoints(bars,'2020-01-10','2020-01-12')).toHaveLength(3);
 });
 it('configuration restores strictly and rides in the fundamentals preferences without breaking old ones',()=>{
  const c=cfg();expect(restoreGraphConfig(JSON.parse(JSON.stringify(c)))).toEqual(c);
  expect(()=>restoreGraphConfig({...c,scale:'wild'})).toThrow();expect(()=>restoreGraphConfig({...c,metricIds:['nope']})).toThrow(/Unknown/);expect(()=>restoreGraphConfig({...c,extra:1})).toThrow();
  const base=createFundamentalsPreferences();
  expect(restoreFundamentalsPreferences(JSON.parse(JSON.stringify(base)))).toEqual(base);
  expect(restoreFundamentalsPreferences(JSON.parse(JSON.stringify({...base,graph:c}))).graph).toEqual(c);
  expect(()=>restoreFundamentalsPreferences({...base,graph:{...c,basis:'X'}})).toThrow();
 });
});
describe('graph chart markup',()=>{
 it('renders one path per series with a legend and the overlay on its own axis, and says so when empty',async()=>{
  const {renderToStaticMarkup}=await import('react-dom/server');const React=await import('react');
  const {GraphChart}=await import('../../src/ui/FundamentalsGraph');
  const palette={bg:'#000',text:'#fff',muted:'#aaa',grid:'#333'};
  const s=scaleSeries(series([['2022-01-31',100],['2023-01-31',150]]),'regular');
  const html=renderToStaticMarkup(React.createElement(GraphChart,{series:[s],scale:'regular',overlay:[{date:'2022-06-01',close:5},{date:'2023-01-01',close:9}],palette,legend:true}));
  expect(html.match(/<path /g)).toHaveLength(2);expect(html).toContain('E Revenue');expect(html).toContain('Close price (own axis)');expect(html).toContain('2022-01');
  expect(renderToStaticMarkup(React.createElement(GraphChart,{series:[],scale:'regular',overlay:null,palette}))).toContain('No values to draw');
 });
});
