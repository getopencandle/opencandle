import {expect,it} from 'vitest';
import {paintSnapshotWatermark,paintSnapshotAlerts,paintChartSnapshotScene,type AlertSnapshotScene} from '../../src/chart/snapshot-painter';
import type {ChartExportFrame} from '../../src/chart/image-export';
function recorder(){const calls:{op:string;args:any[];color:string;alpha:number;font:string}[]=[],ctx:any={fillStyle:'',globalAlpha:1,font:'',measureText:(text:string)=>({width:text.length*6})};for(const op of ['save','restore','beginPath','rect','clip','moveTo','lineTo','stroke','setLineDash','fillRect','fillText','scale','arc','fill'])ctx[op]=(...args:any[])=>calls.push({op,args,color:ctx.fillStyle,alpha:ctx.globalAlpha,font:ctx.font});return{ctx:ctx as CanvasRenderingContext2D,calls};}
const frame:ChartExportFrame={scale:2,viewport:{left:100,top:200,width:400,height:200},plot:{left:0,top:0,width:360,height:180},priceToY:price=>100-price,timeToX:time=>time};
const row=(id:string,price:number)=>({alertId:id,name:'SYNTHETIC',slot:'level' as const,price,color:'#123456',dashed:false,triggered:false,label:price+' SYNTHETIC'});
const alerts=(rows:AlertSnapshotScene['rows']):AlertSnapshotScene=>({rows,color:'#f0a030',tickSize:0.01,scaleSide:'right',obstacles:[],tags:new Map()});
it('watermark reproduces responsive line sizing and centered measured line heights at 2x',()=>{
 const {ctx,calls}=recorder();expect(paintSnapshotWatermark(ctx,{color:'rgba(1,2,3,.3)',lines:[{id:'line0',text:'GME, 1D',fontSize:80,lineHeight:80},{id:'line1',text:'Synthetic company',fontSize:36,lineHeight:44}]},'sans-serif',frame)).toBe(2);
 const text=calls.filter(c=>c.op==='fillText');expect(text.map(c=>c.args[1])).toEqual([400,400]);expect(text[0].font).toBe('160px sans-serif');expect(text[0].args[2]).toBe(156);expect(text[1].args[2]).toBe(280);expect(paintSnapshotWatermark(ctx,null,'sans-serif',frame)).toBe(0);
});
it('crowded alert chips avoid paper obstacles without moving their price lines or price-axis tags',()=>{
 const {ctx,calls}=recorder(),scene=alerts([row('a',50),row('b',49),row('outside',500)]);scene.obstacles=[{left:0,top:40,right:120,bottom:60}];scene.tags=new Map([['a:level',{y:50,center:70,hidden:false}],['b:level',{y:51,center:90,hidden:true}]]);
 expect(paintSnapshotAlerts(ctx,scene,frame)).toBe(2);const labels=calls.filter(c=>c.op==='fillText');expect(labels.map(c=>c.args[0])).toEqual(['50 SYNTHETIC','50.00','49 SYNTHETIC']);const chips=calls.filter(c=>c.op==='fillRect'&&c.alpha===.85).map(c=>c.args);expect(chips).toHaveLength(2);expect(Math.abs(chips[0][1]-chips[1][1])).toBeGreaterThanOrEqual(32);expect(labels.find(c=>c.args[0]==='50.00')!.args[2]).toBe(140);expect(chips.every(c=>c[0]>=240||c[1]+c[3]<=80||c[1]>=120)).toBe(true);expect(calls.filter(c=>c.op==='lineTo').map(c=>c.args[1])).toContain(100);
});
it('real client legend and event badge geometry is translated once and event badges stay clipped to the price pane',()=>{
 const {ctx,calls}=recorder();paintChartSnapshotScene(ctx,{watermark:null,watermarkFont:'sans-serif',alerts:alerts([]),legend:{texts:[{text:'SYNTHETIC study 10',left:120,top:220,width:100,height:16,font:'13px sans-serif',color:'#abcdef',opacity:1}],boxes:[],badges:[]},events:{texts:[],boxes:[],badges:[{left:140,top:350,size:16,letter:'D',color:'#00ff00'}]}},frame);
 expect(calls.find(c=>c.op==='fillText'&&c.args[0]==='SYNTHETIC study 10')!.args).toEqual(['SYNTHETIC study 10',20,28]);expect(calls.find(c=>c.op==='arc')!.args.slice(0,3)).toEqual([96,316,15]);expect(calls.some(c=>c.op==='rect'&&JSON.stringify(c.args)==='[0,0,720,360]')).toBe(true);
});
it('the snapshot title is drawn top-left of the price pane in the caption font, clipped, and skipped when absent',()=>{
 const {ctx,calls}=recorder(),text='GME · 1D · SYNTHETIC  O10.00 H12.00 L9.00 C11.00  +1.00 (+10.00%)';
 paintChartSnapshotScene(ctx,{watermark:null,watermarkFont:'sans-serif',alerts:alerts([]),title:{text}},frame);
 const drawn=calls.filter(c=>c.op==='fillText');expect(drawn).toHaveLength(1);expect(drawn[0].args).toEqual([text,16,28]);expect(drawn[0].font).toBe('24px sans-serif');
 expect(calls.some(c=>c.op==='rect'&&JSON.stringify(c.args)==='[0,0,720,360]')).toBe(true);
 const none=recorder();paintChartSnapshotScene(none.ctx,{watermark:null,watermarkFont:'sans-serif',alerts:alerts([])},frame);expect(none.calls.filter(c=>c.op==='fillText')).toHaveLength(0);
});
