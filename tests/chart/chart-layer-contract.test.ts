import {it,expect} from 'vitest';
import {rendererLayers,chartType,type RendererLayerArgs} from '@luxalgo/vela';
import {registerTemporalChartTypes} from '../../src/chart/chart-types';
import {settingsDefaults} from '../../src/chart/chart-settings';
// Canvas command oracle only: no screenshot, browser interaction or pixel comparison.
function render(style:string,patch:Record<string,unknown>={},bars=[{time:1000,open:10,high:12,low:8,close:11,volume:1}]){
 registerTemporalChartTypes();const calls:any[]=[];const ctx:Record<string,any>={clearRect:()=>{},save:()=>{},restore:()=>{},scale:()=>{},beginPath:()=>{},rect:()=>{},clip:()=>{},setLineDash:()=>{},moveTo:(x:number,y:number)=>calls.push(['move',x,y]),lineTo:(x:number,y:number)=>calls.push(['line',x,y]),stroke:()=>calls.push(['stroke']),fillRect:(...args:number[])=>calls.push(['fill',...args,ctx.fillStyle,ctx.globalAlpha]),strokeRect:()=>calls.push(['outline',ctx.strokeStyle]),fillText:()=>{},fill:()=>{},closePath:()=>{},arc:()=>{},createLinearGradient:()=>({addColorStop:()=>{}})};
 const canvas={width:200,height:200,dataset:{},getContext:()=>ctx} as unknown as HTMLCanvasElement,layer=rendererLayers().find(row=>row.id===style)!.create();layer.mount(canvas);
 layer.render({priceStyle:style,bars,settings:{...settingsDefaults(style),...patch},bounds:{top:0,height:100},scale:{min:1,max:20,log:false},coords:{dpr:1,width:150,visibleLogicalRange:()=>({from:0,to:bars.length-1}),bodySpacing:()=>20,pxPerBar:()=>20,logicalToX:(index:number)=>50+index*20,priceToY:(price:number)=>100-price},theme:{fontFamily:'sans-serif'}} as unknown as RendererLayerArgs);return{calls,ctx:ctx as any};
}
it('bars render the literal OHLC stem/open/close paths and HLC option omits only opening tick',()=>{
 expect(render('bars').calls).toEqual([['move',50,88],['line',50,92],['move',43,90],['line',50,90],['move',50,89],['line',57,89],['stroke']]);
 expect(render('bars',{openVisible:false}).calls).toEqual([['move',50,88],['line',50,92],['move',50,89],['line',57,89],['stroke']]);expect(chartType('bars')?.basePainting).toBe('none');
});
it('highlow uses a single body color for rising and falling bars',()=>{
 // High-low has its own border color (style.hiloStyle borderColor); this check sets it to the body color.
 const result=render('highlow',{color:'#123456',borderColor:'#123456'},[{time:1,open:10,high:12,low:8,close:11,volume:1},{time:2,open:11,high:12,low:8,close:9,volume:1}]);expect(result.calls.filter(row=>row[0]==='fill').map(row=>row[5])).toEqual(['#123456','#123456']);expect(result.calls.filter(row=>row[0]==='outline')).toEqual([['outline','#123456'],['outline','#123456']]);
});
it('columns use selected price for height, raw OHLC previous-close direction and separate width/opacity controls',()=>{
 const result=render('columns',{source:'open',color:'#abcdef',downColor:'#fedcba',upWidthPercent:50,downWidthPercent:25,upOpacity:0.8,downOpacity:0.4},[{time:1,open:10,high:12,low:8,close:11,volume:1},{time:2,open:20,high:21,low:8,close:9,volume:1}]);
 expect(result.calls).toEqual([['fill',45,90,10,10,'#abcdef',0.8],['fill',67.5,80,5,20,'#fedcba',0.4]]);
});
