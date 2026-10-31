import {expect,it} from 'vitest';
import {NativeRenderer,seriesInScale,seriesShownOn,type LineLikeSeries} from '@luxalgo/vela';
import {calculateIndicator,type IndicatorResult} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {defaultPlotStyle,renderIndicatorSeries} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {indicatorColorOpacity} from '../../src/chart/indicator-opacity';
const bars=[1,2,3,4,5].map((close,index)=>({time:1700000000+index*60,open:close,high:close,low:close,close,volume:10}));
const settings=(kind:IndicatorInstanceSettings['kind']):IndicatorInstanceSettings=>({id:'instance-one',kind,inputs:{...indicatorDefaults[kind],length:2},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
it('multiplies original alpha across every accepted color family without mutating canonical color',()=>{
 expect(indicatorColorOpacity('#f008',50)).toBe('rgba(255,0,0,0.26666666666666666)');
 expect(indicatorColorOpacity('#10203080',50)).toBe('rgba(16,32,48,0.25098039215686274)');
 expect(indicatorColorOpacity('rgba(100%, 0%, 0%, 50%)',50)).toBe('rgba(255,0,0,0.25)');
 expect(indicatorColorOpacity('hsla(120, 100%, 25%, .5)',50)).toBe('rgba(0,127.5,0,0.25)');
 expect(indicatorColorOpacity('hsl(-240 100% 50% / 50%)',50)).toBe('rgba(0,255,0,0.25)');
 expect(indicatorColorOpacity('green',50)).toBe('rgba(0,128,0,0.5)');expect(indicatorColorOpacity('transparent',50)).toBe('rgba(0,0,0,0)');
 expect(indicatorColorOpacity('rgba(1,2,3,.4)',100)).toBe('rgba(1,2,3,.4)');expect(indicatorColorOpacity('blue',0)).toBe('rgba(0,0,255,0)');
 expect(()=>indicatorColorOpacity('rgba(,)',50)).toThrow();expect(()=>indicatorColorOpacity('red',NaN)).toThrow();
 expect(indicatorColorOpacity('rgba(1,2,3,0.0000000001)',50)).toBe('rgba(1,2,3,0.00000000005)');
 expect(()=>indicatorColorOpacity('rgba(1,2,3,0.0000000001)',Number.MIN_VALUE)).toThrow(/too small/);
 expect(()=>indicatorColorOpacity('rgba(1,2,3,0.'+'0'.repeat(180)+'1)',0.0000000001)).toThrow(/portable color limit/);
});
it('fill-only guide bands own two transparent autoscale anchors excluded from every readout surface',()=>{
 const saved=settings('rsi');saved.plots.rsi={...defaultPlotStyle('rsi','rsi',0),visible:false,priceScale:false};for(const guide of Object.values(saved.presentation!.guides))guide!.visible=false;
 const result=calculateIndicator('rsi',bars,saved.inputs),before=structuredClone(result),rendered=renderIndicatorPresentation(saved,result,bars),anchors=rendered.output.series!.slice(1) as LineLikeSeries[];
 expect(rendered.output.priceLines).toEqual([]);expect(rendered.output.fills).toHaveLength(1);expect(anchors).toHaveLength(2);
 expect(anchors.map(row=>row.points.map(point=>point.value))).toEqual([Array(5).fill(30),Array(5).fill(70)]);
 for(const anchor of anchors){expect(seriesInScale(anchor)).toBe(true);expect(anchor.style?.color).toBe('rgba(0,0,0,0)');for(const surface of ['legend','dataWindow','priceScale'] as const)expect(seriesShownOn(anchor,surface)).toBe(false);}
 expect(result).toEqual(before);expect(result.series.map(plot=>plot.id)).toEqual(['rsi']);
 const other=renderIndicatorPresentation({...saved,id:'instance-two'},result,bars);expect(new Set([...rendered.output.series!,...other.output.series!].map(row=>row.id)).size).toBe(6);
});
it('real two-boundary fills preserve warmup gaps, hidden strokes and reversed/equal boundaries',()=>{
 const saved=settings('bb');saved.offset=2;saved.plots.upper={...defaultPlotStyle('bb','upper',1),visible:false,priceScale:false};saved.plots.lower={...defaultPlotStyle('bb','lower',2),visible:false,priceScale:false};
 const result:IndicatorResult={id:'bb',series:[{id:'basis',label:'Basis',values:[null,1,2,3,4]},{id:'upper',label:'Upper',values:[null,4,3,3,2]},{id:'lower',label:'Lower',values:[null,2,3,4,5]}],diagnostics:[],policies:[]};
 const out=renderIndicatorPresentation(saved,result,bars).output,anchors=out.series!.slice(3) as LineLikeSeries[];
 expect(anchors.map(row=>row.points.map(point=>point.value))).toEqual([[null,null,...result.series[2].values],[null,null,...result.series[1].values]]);expect(out.fills![0].fromSeriesId).toBe(anchors[0].id);expect(out.fills![0].toSeriesId).toBe(anchors[1].id);
 expect(anchors[0].points.map(point=>point.time)).toEqual([...bars.slice(0,2).map(bar=>bar.time*1000),...bars.map(bar=>(bar.time+120)*1000)]);
});
it('palette sign, rising, equality and gaps use literal raw values; opacity also multiplies palette alpha',()=>{
 const saved=settings('macd');delete saved.inputs.length;saved.plots.histogram={...defaultPlotStyle('macd','histogram',2),opacity:50};saved.presentation!.histogramPalette={nonnegativeRising:'rgba(1,2,3,.5)',nonnegativeFalling:'#010203',negativeRising:'#040506',negativeFalling:'#070809'};
 const values=[null,-2,-1,-1,0,2,null,1];const source=[...bars,...bars.slice(0,3)].map((bar,index)=>({...bar,time:bars[0].time+index*60}));
 const result:IndicatorResult={id:'macd',series:[{id:'histogram',label:'Histogram',values}],diagnostics:[],policies:[]};
 expect((renderIndicatorPresentation(saved,result,source).output.series![0] as LineLikeSeries).points.map(point=>point.color??null)).toEqual([null,'rgba(7,8,9,0.5)','rgba(4,5,6,0.5)','rgba(7,8,9,0.5)','rgba(1,2,3,0.25)','rgba(1,2,3,0.25)',null,'rgba(1,2,3,0.5)']);
});
it('tracking uses the exact endpoint independently from display offset and does not carry forward a null',()=>{
 const saved=settings('sma');saved.offset=100;saved.plots.sma={...defaultPlotStyle('sma','sma',0),trackPrice:true};const result=calculateIndicator('sma',bars,saved.inputs);
 const out=renderIndicatorPresentation(saved,result,bars);expect(out.output.priceLines).toMatchObject([{price:4.5,title:'SMA: latest supplied value'}]);expect(out.policies.join(' ')).toContain('separately owned OpenCandle indicator display helper');
 result.series[0].values[4]=null;expect(renderIndicatorPresentation(saved,result,bars).output.priceLines).toEqual([]);
 saved.visible=false;expect(renderIndicatorPresentation(saved,result,bars).output).toEqual({series:[],fills:[],priceLines:[]});
});
it('missing boundaries remain explicitly unavailable and conditional plots keep stable native IDs',()=>{
 const saved=settings('sma'),base=calculateIndicator('sma',bars,saved.inputs),one=renderIndicatorSeries(saved.id,'sma',base,bars,{},0);
 expect(renderIndicatorPresentation(saved,base,bars).diagnostics).toEqual([]);
 saved.inputs.smoothingType='SMA+BB';saved.inputs.smoothingLength=2;
 // The same base-only result is incomplete only after the band-producing mode is enabled.
 expect(renderIndicatorPresentation(saved,base,bars).diagnostics[0]).toContain('required boundaries');
 const expanded=calculateIndicator('sma',bars,saved.inputs),two=renderIndicatorSeries(saved.id,'sma',expanded,bars,{},0);
 expect(two[0].id).toBe(one[0].id);const reversed={...expanded,series:[...expanded.series].reverse()},three=renderIndicatorSeries(saved.id,'sma',reversed,bars,{},0);expect(new Map(three.map(row=>[row.title,row.id]))).toEqual(new Map(two.map(row=>[row.title,row.id])));
});
it('actual pinned native autoscale includes fill-only anchors and isolates independent scales',()=>{
 const renderer=new NativeRenderer(),native=renderer as any;native.coords={barCount:5,visibleLogicalRange:()=>({from:0,to:4})};native.bars=bars.map(bar=>({...bar,time:bar.time*1000}));native.chrome={prepare:()=>{},paneDrawingsRange:()=>null};native.animator={active:false};native.scene.ensurePane('price','price',0,3);native.scene.ensurePane('study','study',1,1);
 const saved=settings('rsi');saved.plots.rsi={...defaultPlotStyle('rsi','rsi',0),visible:false,priceScale:false};Object.values(saved.presentation!.guides).forEach(guide=>{guide!.visible=false;});
 const output=renderIndicatorPresentation(saved,calculateIndicator('rsi',bars,saved.inputs),bars).output;
 native.scene.indicators.set('native-one',{id:'native-one',paneId:'study',overlay:false,ownScale:true,series:output.series,priceLines:output.priceLines,fills:output.fills,lines:[],boxes:[],labels:[],polylines:[]});native.computeScales();
 const owned=native.scene.indicatorScales.get('native-one').scaleTarget;expect(owned.min).toBeLessThanOrEqual(30);expect(owned.max).toBeGreaterThanOrEqual(70);expect(native.scene.panes.get('study').scaleTarget).toEqual({min:0,max:1});
 native.scene.indicators.get('native-one').ownScale=false;native.computeScales();expect(native.scene.panes.get('study').scaleTarget.min).toBeLessThanOrEqual(30);expect(native.scene.panes.get('study').scaleTarget.max).toBeGreaterThanOrEqual(70);
 const readout=native.dataWindowGroups(4,native.scene.panes.get('price'));expect(readout).toHaveLength(1);expect(readout[0].rows.map((row:any)=>row.label)).toEqual(['RSI']);
 saved.presentation!.fills.band!.visible=false;Object.values(saved.presentation!.guides).forEach(guide=>{guide!.visible=true;});let next=renderIndicatorPresentation(saved,calculateIndicator('rsi',bars,saved.inputs),bars).output;Object.assign(native.scene.indicators.get('native-one'),next);native.computeScales();expect(native.scene.panes.get('study').scaleTarget.max).toBeGreaterThanOrEqual(70);
 Object.values(saved.presentation!.guides).forEach(guide=>{guide!.visible=false;});next=renderIndicatorPresentation(saved,calculateIndicator('rsi',bars,saved.inputs),bars).output;Object.assign(native.scene.indicators.get('native-one'),next);native.computeScales();expect(native.scene.panes.get('study').scaleTarget).toEqual({min:0,max:1});
});
it('actual pinned Canvas painter shifts numerical and fill x-indices, preserving sparse gaps',()=>{
 const renderer=new NativeRenderer(),native=renderer as any;native.backendMode='canvas2d';native.makeDataCanvas=()=>({getContext:()=>({})});native.createGeometryBackend();
 const saved=settings('bb');saved.offset=2;
 const result:IndicatorResult={id:'bb',series:[{id:'basis',label:'Basis',values:[1,2,null,4,5]},{id:'upper',label:'Upper',values:[3,4,null,6,7]},{id:'lower',label:'Lower',values:[-1,0,null,2,3]}],diagnostics:[],policies:[]};
 const rendered=renderIndicatorPresentation(saved,result,bars),model={series:rendered.output.series};const pane={scale:{min:-2,max:9},bounds:{top:0,height:100}};
 const coordinates={logicalToX:(index:number)=>index*10,priceToY:(value:number)=>100-value};let starts:number[]=[],fills=0;
 const context={lineWidth:0,lineJoin:'',strokeStyle:'',fillStyle:'',setLineDash(){},beginPath(){},moveTo(x:number){starts.push(x);},lineTo(){},stroke(){},closePath(){},fill(){fills++;}};
 native.backend.drawPolyline(context,rendered.output.series![0],pane,coordinates,0,4,false);expect(starts).toEqual([20]);
 starts=[];native.backend.drawFill(context,model,rendered.output.fills![0],pane,coordinates,0,4);expect(starts).toEqual([20]);expect(fills).toBe(1);
 saved.offset=-2;const negative=renderIndicatorPresentation(saved,result,bars);expect((negative.output.series![0] as LineLikeSeries).points.map(point=>point.value)).toEqual([null,4,5]);starts=[];native.backend.drawPolyline(context,negative.output.series![0],pane,coordinates,0,4,false);expect(starts).toEqual([10]);
 expect(rendered.diagnostics.join(' ')).toContain('past the last loaded bar');// Positive offsets now draw past the last barexpect(result.series[0].values).toEqual([1,2,null,4,5]);
});
