import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {calculateIndicator} from '../../src/domain/indicators';
import {tradingSessionShapes} from '../../src/chart/trading-sessions-presentation';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {indicatorDefaults,defaultIndicatorPresentation,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {inputs,bars,stamp} from '../fixtures/r42-trading-sessions';
import {commandCanvas} from './chart-paint-harness';
const context={resolution:'1m',exchangeZone:'UTC',style:'candles',tickSize:1};
const result=()=>calculateIndicator('tradingsessions',bars,{...indicatorDefaults.tradingsessions,...inputs},context);
const row=():IndicatorInstanceSettings=>({id:'SYNTHETIC-private-instance',kind:'tradingsessions',inputs:{...indicatorDefaults.tradingsessions,...inputs},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('tradingsessions')});
for(const inverted of [false,true])it(`actual native projection and painter place session text below the box on ${inverted?'inverted':'ordinary'} price scale`,()=>{
 const records=result().sessions!,display={showNames:true,showOpenClose:true,showRange:true,showAverage:true,visible:()=>true,labelInverted:inverted};
 const output=tradingSessionShapes(records,display,role=>'SYNTHETIC-'+role),native=new NativeRenderer() as any,pane=native.scene.ensurePane('price','price',0,3);
 pane.bounds={top:0,height:300};pane.scale={min:0,max:30,log:false};native.scene.invertScale=inverted;native.stampScaleInvert();
 const y=(price:number)=>native.coords.priceToY(price,pane.scale,pane.bounds),draw=native.indicatorSlices.drawScene,recording=commandCanvas();
 draw.setDeps({timeToLogical:(time:number)=>(time-stamp('2024-06-03T13:00:00Z')*1000)/60000,barAt:()=>null,theme:{fontFamily:'sans-serif',textColor:'#ffffff'}});
 draw.setSet({...output,polylines:[],linefills:[]});draw.render(recording.ctx,400,300,(logical:number)=>20+logical*100,y);
 const bottom=Math.max(y(output.boxes[0].bottom),y(output.boxes[0].top)),texts=recording.commands.filter(command=>command.op==='fillText');
 expect(texts.map(command=>command.values[0])).toEqual(['SYNTHETIC afternoon','6 ticks','Average 12']);expect(texts.every(command=>(command.values[2] as number)>bottom)).toBe(true);expect(draw.labelTipRegions()[0].top).toBeGreaterThan(bottom);
 expect(output.labels[0].y).toBe(inverted?15:9);expect(output.boxes[0]).toMatchObject({top:15,bottom:9});expect(output.lines.map(line=>[line.y1,line.y2])).toEqual([[10,10],[14,14],[12,12]]);
});
it('an explicitly unknown production pane withholds labels while preserving observed boxes guides and numerical values',()=>{
 const settings=row(),calculated=result(),before=JSON.stringify(calculated),ordinary=renderIndicatorPresentation(settings,calculated,bars,{...context,paneInverted:false}),unknown=renderIndicatorPresentation(settings,calculated,bars,{...context,paneInverted:null});
 expect(unknown.output.labels).toEqual([]);expect(unknown.output.boxes).toEqual(ordinary.output.boxes);expect(unknown.output.lines).toEqual(ordinary.output.lines);expect(unknown.diagnostics.join(' ')).toContain('until its chart pane is ready');expect(JSON.stringify(calculated)).toBe(before);
});
it('pane orientation is a primitive owned renderer fact and never changes causal scalar results or readable text',()=>{
 const settings=row(),calculated=result(),before=JSON.stringify(calculated),a=renderIndicatorPresentation(settings,calculated,bars,{...context,paneInverted:false}),b=renderIndicatorPresentation(settings,calculated,bars,{...context,paneInverted:true});
 expect(b.output.labels![0].text).toBe(a.output.labels![0].text);expect(b.output.labels![0].text).not.toContain(settings.id);expect(b.output.boxes).toEqual(a.output.boxes);expect(b.output.lines).toEqual(a.output.lines);expect(JSON.stringify(calculated)).toBe(before);
 let reads=0;const bad={...context};Object.defineProperty(bad,'paneInverted',{enumerable:true,get(){reads++;return true;}});expect(()=>renderIndicatorPresentation(settings,calculated,bars,bad)).toThrow();expect(reads).toBe(0);
 expect(()=>renderIndicatorPresentation(settings,calculated,bars,{...context,paneInverted:'true'} as any)).toThrow();
});
