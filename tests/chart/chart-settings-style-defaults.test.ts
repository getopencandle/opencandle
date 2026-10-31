// Symbol-tab style defaults and the line gradient pair: renderer command oracle and saved-book migration.
import {expect,it} from 'vitest';
import {rendererLayers,type RendererLayerArgs} from '@luxalgo/vela';
import {registerTemporalChartTypes} from '../../src/chart/chart-types';
import {settingsDefaults,validatedSettingsBook,validateTypeSettings,chartSettingsSchema} from '../../src/chart/chart-settings';
import {latestPricePresentation} from '../../src/chart/appearance-price';
import {LV_STYLE_FIELDS,STYLE_FACT_DEFAULTS} from '../../src/chart/chart-settings-style-defaults';

function gradientStops(style:string,patch:Record<string,unknown>={}){
 registerTemporalChartTypes();const stops:[number,string][]=[];
 const ctx:Record<string,any>={clearRect(){},save(){},restore(){},scale(){},beginPath(){},rect(){},clip(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},strokeRect(){},fillText(){},fill(){},closePath(){},arc(){},createLinearGradient:()=>({addColorStop:(at:number,color:string)=>stops.push([at,color])})};
 const canvas={width:200,height:200,dataset:{},getContext:()=>ctx} as unknown as HTMLCanvasElement,layer=rendererLayers().find(row=>row.id===style)!.create();layer.mount(canvas);
 const bars=[{time:1000,open:10,high:12,low:8,close:11,volume:1},{time:2000,open:11,high:13,low:9,close:12,volume:1}];
 layer.render({priceStyle:style,bars,settings:{...settingsDefaults(style),...patch},bounds:{top:0,height:100},scale:{min:1,max:20,log:false},coords:{dpr:1,width:150,visibleLogicalRange:()=>({from:0,to:1}),bodySpacing:()=>20,pxPerBar:()=>20,logicalToX:(index:number)=>50+index*20,priceToY:(price:number)=>100-price},theme:{fontFamily:'sans-serif'}} as unknown as RendererLayerArgs);
 return stops;
}
it('line types draw the gradient pair by default; area keeps its line color',()=>{
 for(const style of ['line','linemarkers','step'])expect(gradientStops(style),style).toEqual([[0,'#D500F9'],[1,'#00BCE5']]);
 expect(gradientStops('line',{colorType:'solid'})).toEqual([]);
 expect(gradientStops('area',{gradient:true,gradientColor:'#000000'}).slice(0,2)).toEqual([[0,'#2962FF'],[1,'#000000']]);
});
it('saved line books from before the gradient pair keep their look: an enabled gradient starts at the saved line color',()=>{
 // The former Gradient line boolean migrates to the color mode (true -> gradient, false -> solid) and is not reported unavailable.
 const book=validatedSettingsBook({line:{gradient:true,color:'#123456',gradientColor:'#abcdef'},step:{color:'#111111'},linemarkers:{gradient:false}});
 expect(book.applicable.line).toMatchObject({colorType:'gradient',gradientStartColor:'#123456',gradientColor:'#abcdef'});expect(book.applicable.line).not.toHaveProperty('gradient');
 expect(book.applicable.step).toMatchObject({color:'#111111',colorType:'gradient',gradientStartColor:'#D500F9'});
 expect(book.applicable.linemarkers.colorType).toBe('solid');expect(book.unavailable).toEqual([]);
 expect(book.retained).toEqual({line:{gradient:true,color:'#123456',gradientColor:'#abcdef'},step:{color:'#111111'},linemarkers:{gradient:false}});
 expect(()=>validateTypeSettings('line',{gradientStartColor:'notacolor'})).toThrow();
});
it('every schema default comes from the fact table or the declared OpenCandle field list',()=>{
 for(const style of Object.keys(STYLE_FACT_DEFAULTS).filter(style=>!['candles','heikinashi'].includes(style))){
  const defaults=settingsDefaults(style),facts=STYLE_FACT_DEFAULTS[style];
  for(const field of chartSettingsSchema(style).fields){
   const source=Object.hasOwn(facts,field.key)?'fact':Object.hasOwn(LV_STYLE_FIELDS,field.key)?'lv':'base';
   expect(source==='base'?['gradient','gradientColor'].includes(field.key)&&style==='area':true,`${style}.${field.key} has no declared source`).toBe(true);
   if(source==='fact')expect(defaults[field.key],`${style}.${field.key}`).toBe(facts[field.key]);
  }
 }
});
it('latest price color falls back to the style facts when a style has no saved settings',()=>{
 const scene={priceStyle:'bars',bars:[{open:10,high:12,low:9,close:9},{open:10,high:12,low:9,close:11}],style:{chartTypes:{}}};
 const coords={priceToY:(value:number)=>100-value},pane={bounds:{top:0,height:100},scale:{}};
 expect(latestPricePresentation(scene,coords,{upColor:'#000',downColor:'#111'},pane)).toEqual({value:11,color:'#089981'});
 expect(latestPricePresentation({...scene,priceStyle:'line'},coords,{},pane)).toEqual({value:11,color:'#2962FF'});
});
