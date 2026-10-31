import {expect,it} from 'vitest';
import {backtestStrategy,type StrategySignal} from '../../src/domain/strategy';
import {buildStrategyReport,buildStrategyReportAsync,type StrategyReportInput} from '../../src/domain/strategy-report';
import {strategyReportCsv,strategyReportJson} from '../../src/domain/strategy-report-export';
import type {Bar} from '../../src/domain/types';
// Root-owned literal accounting and route expectations. Expected values are
// hand-calculated, not generated with the report implementation.
const context={executionId:'independent-synthetic-run',sourceLabel:'Synthetic report oracle',currency:null,timezone:'UTC'};
const flat=(values:number[]):Bar[]=>values.map((price,index)=>({time:1000+index,open:price,high:price,low:price,close:price,volume:1}));
function input(bars:Bar[],signals:StrategySignal[],config:Parameters<typeof backtestStrategy>[0]['config']={}):StrategyReportInput{
 const barIds=bars.map((_,index)=>'synthetic:'+index),result=backtestStrategy({bars,signals,config:{initialCapital:1000,...config},barIds});expect(result.ok,result.diagnostics.join()).toBe(true);return{result,bars,barIds,context};
}
function oracle(){return input(flat([5,10,13,20,22,5,5.5,8,9]),(['buy','sell','sell','buy','buy','sell','buy'] as const).map((action,index)=>({barIndex:index,orders:[{id:'synthetic-order:'+index,action,quantity:[2,2,3,3,4,4,2][index]}]})),{commission:{kind:'fixed',value:1}});}
it('reconciles closed, open, per-side and benchmark values against literal cash arithmetic',()=>{
 const report=buildStrategyReport(oracle()),all=report.metrics.all;
 expect(report.trades.map(row=>row.netProfit)).toEqual([4,-8,0]);expect(report.trades.map(row=>row.commission)).toEqual([2,2,2]);
 for(const [key,value] of Object.entries({closedNet:-4,grossProfit:4,grossLoss:8,profitFactor:.5,winners:1,losers:1,evenTrades:1,commission:7,openGross:2,openFees:1,openNet:1,totalProfit:-3,finalEquity:997,buyHoldPnl:-100,buyHoldPercent:-10,outperformance:96}))expect(all[key],key).toMatchObject({value,status:'available'});
 expect(all.averagePnl.value).toBeCloseTo(-4/3,9);expect(all.profitablePercent.value).toBeCloseTo(100/3,9);
 expect(report.metrics.long.closedNet.value).toBe(4);expect(report.metrics.short.closedNet.value).toBe(-8);expect(report.metrics.long.commission.value).toBe(5);expect(report.metrics.short.commission.value).toBe(2);
 expect(report.benchmark.entryMark).toBe(10);expect(report.benchmark.start?.barId).toBe('synthetic:1');expect(report.equity[0].buyHoldEquity).toBeNull();expect(report.equity.at(-1)?.buyHoldEquity).toBe(900);expect(report.context.currency).toBeNull();
});
it('clips long and short excursions at the next opening exit before later bar extremes',()=>{
 const bars:Bar[]=[{time:1,open:10,high:10,low:10,close:10,volume:1},{time:2,open:10,high:12,low:8,close:11,volume:1},{time:3,open:13,high:100,low:1,close:50,volume:1}];
 for(const [opening,closing,favorable,adverse] of [['buy','sell',6,4],['sell','buy',4,6]] as const){const report=buildStrategyReport(input(bars,[{barIndex:0,orders:[{action:opening,quantity:2}]},{barIndex:1,orders:[{action:closing,quantity:2}]}]));expect(report.trades[0].favorable.value).toBe(favorable);expect(report.trades[0].adverse.value).toBe(adverse);expect(report.trades[0].exit.routePosition).toBe(0);}
});
it('uses the prior closing peak denominator and exact ordered bar identity',()=>{
 const bars=flat([10,10,20,9,15]);bars[3].time=bars[2].time;
 const report=buildStrategyReport(input(bars,[{barIndex:0,orders:[{action:'buy',quantity:10}]}]));
 expect(report.equity.map(row=>row.equity)).toEqual([1000,1000,1100,990,1050]);expect(report.drawdown).toEqual({amount:110,percent:10,peakBarId:'synthetic:2',troughBarId:'synthetic:3',peakEquity:1100});expect(report.metrics.all.maxDrawdownPercent.value).toBe(10);// The reference intrabar formula uses prior realized equity (1000) plus the open lot's adverse move,
 // 10 units * (10 - 9) = 10. It stays distinct from the 110 close-to-close peak-to-trough statistic.
 expect(report.metrics.all.maxIntrabarDrawdown).toMatchObject({value:10,status:'available'});
});
it('uses explicit standard execution prices for Heikin-Ashi and does not relabel chart prices as standard',()=>{
 const standard=flat([5,10,13]),bars=flat([6,11,12]),barIds=['a','b','c'],result=backtestStrategy({bars,standardBars:standard,barIds,signals:[{barIndex:0,orders:[{action:'buy',quantity:2}]},{barIndex:1,orders:[{action:'sell',quantity:2}]}],config:{initialCapital:1000,fillBasis:'standard-ohlc',chartType:'heikin-ashi'}});
 const report=buildStrategyReport({result,bars,standardBars:standard,barIds,context});expect(report.trades[0].entryPrice).toBe(10);expect(report.trades[0].exitPrice).toBe(13);expect(report.metrics.all.closedNet.value).toBe(6);expect(report.benchmark.entryMark).toBe(10);expect(report.benchmark.lastMark).toBe(13);
 expect(()=>buildStrategyReport({result,bars,barIds,context})).toThrow(/Standard bars/);
});
it('preserves no-trade zeros and explicit undefined or unavailable values without invented ratios',()=>{
 const report=buildStrategyReport(input(flat([10,11]),[])),all=report.metrics.all;
 expect(all.closedNet.value).toBe(0);expect(all.openNet.value).toBe(0);expect(all.closedTrades.value).toBe(0);expect(all.finalEquity.value).toBe(1000);expect(all.profitFactor).toMatchObject({value:null,status:'undefined'});expect(all.buyHoldPnl).toMatchObject({value:null,status:'unavailable'});expect(all.marginCalls).toMatchObject({value:0,status:'available'});expect(all.marginEfficiency).toMatchObject({value:null,status:'unavailable'});
});
it('rejects a longer future array before reading its tail and stops cancelled or over-budget work',async()=>{
 const accepted=input(flat([10,11,12]),[{barIndex:0,orders:[{action:'buy',quantity:1}]}]);let reads=0;const longer=[...accepted.bars];Object.defineProperty(longer,'3',{enumerable:true,get(){reads++;throw Error('Future bar read');}});
 expect(()=>buildStrategyReport({...accepted,bars:longer,barIds:['0','1','2','3']})).toThrow(/same completed input prefix/);expect(reads).toBe(0);expect(()=>buildStrategyReport({...accepted,maxWork:1})).toThrow(/work limit/);
 const abort=new AbortController();abort.abort();await expect(buildStrategyReportAsync({...accepted,signal:abort.signal})).rejects.toThrow(/cancelled/);
});
it('cannot change an accepted report configuration by mutating the caller during cooperative calculation',async()=>{
 const source=oracle(),pending=buildStrategyReportAsync(source);source.result.config.slippageTicks=99;source.result.config.commission.value=99;
 const report=await pending;expect(report.config.slippageTicks).toBe(0);expect(report.config.commission.value).toBe(1);expect(report.metrics.all.commission.value).toBe(7);
});
function csvRows(text:string):string[][]{const rows:string[][]=[];let row:string[]=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===','){row.push(field);field='';}else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(field);rows.push(row);row=[];field='';i++;}else field+=c;}expect(quoted).toBe(false);expect(row).toEqual([]);expect(field).toBe('');return rows;}
it('exports all canonical trade columns, explicit open rows and safe spreadsheet text without script contents',()=>{
 const source=oracle();source.context={...context,sourceLabel:' \t=HYPERLINK("https://example.invalid", "label")\nSynthetic only'};const report=buildStrategyReport(source),rows=csvRows(strategyReportCsv(report,'trades')),[header,...trades]=rows,column=(row:string[],key:string)=>row[header.indexOf(key)];
 expect(trades).toHaveLength(4);for(const row of trades){expect(row).toHaveLength(header.length);expect(column(row,'source_label')).toBe("'"+source.context.sourceLabel);expect(column(row,'explicit_currency')).toBe('');}
 expect(trades.map(row=>column(row,'state'))).toEqual(['closed','closed','closed','open']);expect(trades.map(row=>Number(column(row,'net_pnl')))).toEqual([4,-8,0,1]);expect(column(trades[3],'trade_number')).toBe('');expect(column(trades[3],'exit_bar_id')).toBe('');
 const short=csvRows(strategyReportCsv(report,'trades','short'));expect(short).toHaveLength(2);expect(short[1][short[0].indexOf('record_id')]).toBe('trade:2');
 const json=JSON.parse(strategyReportJson(report));expect(json.metrics.all.closedNet.value).toBe(-4);expect(json.context.currency).toBeNull();expect(json.trades).toHaveLength(3);expect(json.openLots).toHaveLength(1);expect(json).not.toHaveProperty('source');
});
it('refuses forged or failed report exports and exposes unknown metrics with their status in CSV',()=>{
 const source=oracle(),report=buildStrategyReport(source);expect(()=>strategyReportJson({...report})).toThrow(/Only a completed report/);expect(()=>strategyReportCsv(report,'xls' as any)).toThrow(/Unsupported report export/);expect(()=>buildStrategyReport({...source,result:{...source.result,ok:false}})).toThrow(/failed|budget-stopped/);
 const [header,...rows]=csvRows(strategyReportCsv(report,'metrics')),unknown=rows.find(row=>row[header.indexOf('metric_key')]==='marginEfficiency')!;expect(unknown[header.indexOf('all_value')]).toBe('');expect(unknown[header.indexOf('all_status')]).toBe('unavailable');expect(unknown[header.indexOf('all_reason')].length).toBeGreaterThan(0);
 // Sharpe is now calculated, but one calendar month of returns leaves it explicitly undefined, never zero.
 const sharpe=rows.find(row=>row[header.indexOf('metric_key')]==='sharpe')!;expect(sharpe[header.indexOf('all_value')]).toBe('');expect(sharpe[header.indexOf('all_status')]).toBe('undefined');expect(sharpe[header.indexOf('all_reason')]).toBe('At least two monthly returns are required.');
});
it('enforces the UTF-8 export ceiling before returning a partial CSV',()=>{
 const source=input(flat([10]),[{barIndex:0,orders:Array.from({length:8000},(_,i)=>({id:'synthetic-working:'+i,action:'buy' as const,quantity:1}))}]);source.context={...context,sourceLabel:'界'.repeat(1500)};const report=buildStrategyReport(source);expect(report.orders).toHaveLength(8000);expect(()=>strategyReportCsv(report,'orders')).toThrow(/20 MiB UTF-8/);
});
