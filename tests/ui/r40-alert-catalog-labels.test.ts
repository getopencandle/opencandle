import {expect,it} from 'vitest';
import type {ChartController} from '../../src/chart/adapter';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {fixtureDataset} from '../../src/domain/fixtures';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';

// SYNTHETIC catalogue fixtures; ids remain selection keys and never become display suffixes.
const position=(id:string,name?:string)=>({id,type:'position',paneId:'price',anchors:[{time:1704153600000,price:100},{time:1704240000000,price:95},{time:1704240000000,price:110}],props:{riskPercent:1,accountBalance:10000},...(name?{lvName:name}:{})});
const fib=(id:string,name?:string)=>({id,type:'fibretracement',paneId:'price',anchors:[{time:1704153600000,price:10},{time:1704240000000,price:20}],props:{levels:[{ratio:0,color:'#808080',enabled:true},{ratio:1,color:'#808080',enabled:true}],reverse:false},...(name?{lvName:name}:{})});
function capture(drawings:unknown[]=[],indicators:IndicatorInstanceSettings[]=[]){
 const dataset=fixtureDataset('GME',1),bars=dataset.bars,source=sourceContextForDataset(dataset,bars);
 const chart={getSourceContext:()=>source,getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),indicators:{serialize:()=>indicators},saveDrawings:()=>({drawings}),scripts:{}} as unknown as ChartController;
 let id=0;return new TechnicalAlertCatalog(()=>`SYNTHETIC-snapshot-${++id}`).capture(chart,dataset,bars,[]);
}

it('uses the drawing name once, and numbers positions and Fib drawings only when names are duplicated',()=>{
 const rows=capture([position('SYNTHETIC-private-p1','SYNTHETIC trade plan'),position('SYNTHETIC-private-p2','SYNTHETIC trade plan'),fib('SYNTHETIC-private-f1','SYNTHETIC levels')]);
 expect(rows.find(row=>row.id==='position:SYNTHETIC-private-p1')!.label).toBe('SYNTHETIC trade plan 1: Long entry 100, take profit 110, stop loss 95, quantity 20');
 expect(rows.find(row=>row.id==='position:SYNTHETIC-private-p2')!.label).toBe('SYNTHETIC trade plan 2: Long entry 100, take profit 110, stop loss 95, quantity 20');
 expect(rows.find(row=>row.id==='drawing:SYNTHETIC-private-f1')!.label).toBe('SYNTHETIC levels: any level');
 expect(rows.every(row=>!row.label.includes('SYNTHETIC-private-'))).toBe(true);
});

it('uses the same readable duplicate names for unavailable drawing choices',()=>{
 const broken={...position('SYNTHETIC-private-p2'),anchors:[]},rows=capture([position('SYNTHETIC-private-p1'),broken]);
 const disabled=rows.find(row=>row.id==='position:SYNTHETIC-private-p2')!;
 expect(disabled.label).toBe('Long/Short position 2');expect(disabled.source).toBeNull();expect(disabled.disabledReason).toMatch(/Finish placing/);
});

it('distinguishes indicator instances by numbers, including unavailable rows, while keeping their ids as selection keys',()=>{
 const settings=(id:string,length:number):IndicatorInstanceSettings=>({...factoryIndicatorDefault('sma'),id,kind:'sma',inputs:{length,source:'close'}});
 const rows=capture([],[settings('SYNTHETIC-private-first',2),settings('SYNTHETIC-private-second',0)]).filter(row=>row.id.startsWith('indicator:'));
 expect(rows.find(row=>row.id==='indicator:SYNTHETIC-private-first:sma')!.label).toBe('SMA 1');
 expect(rows.find(row=>row.id==='indicator:SYNTHETIC-private-second:sma')!.label).toBe('SMA 2');
 expect(rows.find(row=>row.id==='indicator:SYNTHETIC-private-second:sma')!.disabledReason).toBeTruthy();
 expect(rows.every(row=>!row.label.includes('SYNTHETIC-private-'))).toBe(true);
});

