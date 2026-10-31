import {it,expect} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {indicatorDefaults,defaultIndicatorPresentation,validateIndicatorInputs,assertIndicatorBatchBudget,indicatorEstimatedSlots,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {inputs,bars,stamp} from '../fixtures/r42-trading-sessions';
import {NativeRenderer} from '@luxalgo/vela';
import {commandCanvas} from './chart-paint-harness';
const settings=():IndicatorInstanceSettings=>({id:'internal-instance-only',kind:'tradingsessions',inputs:{...indicatorDefaults.tradingsessions,...inputs},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('tradingsessions')});
const context={resolution:'1m',exchangeZone:'UTC',style:'candles',tickSize:1};
const prepare=(row=settings())=>{const result=calculateIndicator(row.kind,bars,row.inputs,context);return{result,...renderIndicatorPresentation(row,result,bars,context)};};
it('registers an explicit chart-only catalog study with unresolved reference defaults',()=>{
 const definition=catalogDefinition('tradingsessions')!;expect(definition.name).toBe('Trading sessions');expect(definition.tradingSessions).toBe(true);expect(definition.unknownDefaults?.join(' ')).toContain('unresolved');
 for(const index of [1,2,3]){expect(indicatorDefaults.tradingsessions[`session${index}Enabled`]).toBe(false);expect(indicatorDefaults.tradingsessions[`session${index}Start`]).toBe('');}
});
it('emits an actual observed box, dashed open/close and dotted average with readable statistics',()=>{
 const prepared=prepare(),{output}=prepared;expect(prepared.result.diagnostics).toEqual([]);expect(prepared.diagnostics).toEqual([]);
 expect(output.boxes).toHaveLength(1);expect(output.boxes![0]).toMatchObject({left:stamp('2024-06-03T13:00:00Z')*1000,right:stamp('2024-06-03T13:02:00Z')*1000,top:15,bottom:9,xloc:'bar_time'});
 expect(output.lines!.map(line=>[line.y1,line.y2,line.style])).toEqual([[10,10,'dashed'],[14,14,'dashed'],[12,12,'dotted']]);
 expect(output.labels![0].text).toBe('SYNTHETIC afternoon\n6 ticks\nAverage 12');expect(output.labels![0].style).toBe('label_up');expect(output.labels![0].y).toBe(9);
 expect(output.labels![0].text).not.toMatch(/internal-instance-only|tradingsessions|session1|lv-decoration/);expect(output.series!.every(series=>series.visible===false&&series.display?.pane===false&&series.display?.priceScale===false)).toBe(true);
});
it('individual display toggles remove only their corresponding guides and labels',()=>{
 const row=settings();row.inputs={...row.inputs,showNames:false,showRange:false,showAverage:false,showOpenClose:false};const prepared=prepare(row);
 expect(prepared.output.boxes).toHaveLength(1);expect(prepared.output.lines).toEqual([]);expect(prepared.output.labels).toEqual([]);expect(prepared.result.series[0].values).toEqual([null,10,12,null]);
});
it('per-window plot visibility and whole-instance visibility hide all native decorations',()=>{
 const row=settings();row.plots.session1={...defaultPlotStyle('tradingsessions','session1',0),visible:false};expect(prepare(row).output.boxes).toEqual([]);
 row.visible=false;expect(prepare(row).output).toEqual({series:[],fills:[],priceLines:[]});
});
it('refuses decoration offsets and own timeframes with an explicit explanation',()=>{
 const row=settings();row.offset=1;const offset=prepare(row);expect(offset.output.boxes).toBeUndefined();expect(offset.diagnostics.join(' ')).toContain('Chart timeframe and an offset of 0');
 row.offset=0;row.presentation!.timeframe={schemaVersion:1,interval:'5m',waitForClose:true};const own=prepare(row);expect(own.output.boxes).toBeUndefined();expect(own.diagnostics.join(' ')).toContain('Chart timeframe and an offset of 0');
});
it('does not guess the exchange zone and validates enabled configuration before accepting it',()=>{
 const row=settings();row.inputs.session1Zone='';const result=calculateIndicator(row.kind,bars,row.inputs,{resolution:'1m',style:'candles'});expect(result.series).toEqual([]);expect(result.diagnostics.join(' ')).toContain('exchange time zone');
 expect(()=>validateIndicatorInputs('tradingsessions',{...row.inputs,session1Start:''})).toThrow('HH:mm');expect(()=>validateIndicatorInputs('tradingsessions',{...row.inputs,session1Color:'url(SYNTHETIC)'})).toThrow('hexadecimal color');
});
it('accounts for worst-case retained statistics and actual native coordinates without raising budgets',()=>{
 const one=settings().inputs,three={...one,session2Enabled:true,session2Start:'09:00',session2End:'10:00',session3Enabled:true,session3Start:'09:00',session3End:'10:00'};
 expect(indicatorEstimatedSlots('tradingsessions',100,one,undefined,'calculation')).toBe(1600);expect(indicatorEstimatedSlots('tradingsessions',100,one)).toBe(4500);
 expect(()=>assertIndicatorBatchBudget([{kind:'tradingsessions',inputs:three}],100000)).toThrow('local limits');expect(assertIndicatorBatchBudget([{kind:'tradingsessions',inputs:three}],5000).numericSlots).toBe(585000);
});
it('presentation leaves frozen observed geometry and causal numerical results unchanged',()=>{
 const row=settings(),result=calculateIndicator(row.kind,bars,row.inputs,context),before=JSON.stringify(result);renderIndicatorPresentation(row,result,bars,context);expect(JSON.stringify(result)).toBe(before);
});
it('actual installed Vela painter places every session text line below the ordinary-axis projected box low',()=>{
 const native=(new NativeRenderer() as any).indicatorSlices.drawScene,recording=commandCanvas(),{output}=prepare();
 const priceToY=(price:number)=>250-price*10;
 native.setDeps({timeToLogical:(time:number)=>(time-stamp('2024-06-03T13:00:00Z')*1000)/60000,barAt:()=>null,theme:{fontFamily:'sans-serif',textColor:'#ffffff'}});
 native.setSet({boxes:output.boxes,lines:output.lines,labels:output.labels,polylines:[],linefills:[]});
 native.render(recording.ctx,400,300,(logical:number)=>20+logical*100,priceToY);
 const text=recording.commands.filter(command=>command.op==='fillText');expect(text.map(command=>command.values[0])).toEqual(['SYNTHETIC afternoon','6 ticks','Average 12']);
 const low=priceToY(output.boxes![0].bottom);expect(text.every(command=>(command.values[2] as number)>low)).toBe(true);
 expect(native.labelTipRegions()[0].top).toBeGreaterThan(low);
 expect(recording.commands.find(command=>command.op==='fillRect')?.values).toEqual([20,priceToY(15),200,priceToY(9)-priceToY(15)]);
 expect(output.lines!.map(line=>[line.y1,line.y2])).toEqual([[10,10],[14,14],[12,12]]);
});
